// Offline "demo" engine: keyword parsing + weighted scoring against a small knowledge base.
// Used when no Gemini key is configured, and as a safety net for red-flag symptoms.
import { SYMPTOMS, CONDITIONS, URGENCY, urgencyByRank } from './data.js';

const byId = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s]));
export const symptomLabel = (id) => byId[id]?.label ?? id;

const NEGATION = /\b(no|not|without|never|don'?t have|denies|zero)\s+(\w+\s+)?$/;

export function parseText(text = '') {
  const t = text.toLowerCase();
  if (!t.trim()) return [];
  return SYMPTOMS.filter((s) =>
    s.aliases.some((alias) => {
      let from = 0;
      let idx;
      while ((idx = t.indexOf(alias, from)) !== -1) {
        if (!NEGATION.test(t.slice(Math.max(0, idx - 18), idx))) return true;
        from = idx + alias.length;
      }
      return false;
    })
  ).map((s) => s.id);
}

export const symptomsFrom = (input) => [...new Set([...(input.symptoms || []), ...parseText(input.text)])];

const rankOf = (u) => URGENCY[u]?.rank ?? 0;
export const maxUrgency = (a, b) => (rankOf(a) >= rankOf(b) ? a : b);

// The least urgent level we will ever show given the raw input, regardless of which engine answered.
export function urgencyFloor(input) {
  let rank = 0;
  for (const id of symptomsFrom(input)) {
    const red = byId[id]?.red;
    if (red) rank = Math.max(rank, rankOf(red));
  }
  const sev = Number(input.severity) || 0;
  if (sev >= 9) rank = Math.max(rank, 2);
  else if (sev >= 7) rank = Math.max(rank, 1);
  if (input.duration === 'month') rank = Math.max(rank, 1);
  const age = Number(input.age);
  const risk = (input.conditions || []).some((c) => c !== 'Allergies');
  if ((age && (age < 5 || age >= 65)) || risk) rank = Math.max(rank, 1);
  return urgencyByRank[rank];
}

const uniq = (arr) => [...new Set(arr)];

export function localAnalyze(input) {
  const syms = symptomsFrom(input);
  const set = new Set(syms);
  const floor = urgencyFloor(input);

  const scored = CONDITIONS.map((c) => {
    if (c.requires && !c.requires.some((r) => set.has(r))) return null;
    const matched = Object.keys(c.weights).filter((k) => set.has(k));
    if (!matched.length) return null;
    const total = Object.values(c.weights).reduce((a, b) => a + b, 0);
    const hit = matched.reduce((a, k) => a + c.weights[k], 0);
    const confidence = Math.min(1, 0.55 + 0.15 * syms.length);
    let score = (0.65 * (hit / total) + 0.35 * (matched.length / syms.length)) * confidence;
    // A condition whose defining symptom is absent is a much weaker match.
    const primary = Object.keys(c.weights).reduce((a, b) => (c.weights[b] > c.weights[a] ? b : a));
    if (!set.has(primary)) score *= 0.6;
    if (c.urgency === 'emergency') score += 0.25;
    return { c, matched, score };
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const top = scored
    .map((s) => ({ ...s, likelihood: Math.round(Math.min(92, Math.max(8, s.score * 95))) }))
    .filter((s) => s.likelihood >= 15)
    .slice(0, 4);

  if (!top.length) {
    return {
      summary: syms.length
        ? 'Your symptoms did not clearly match a known pattern in the built-in engine.'
        : "We couldn't recognize specific symptoms from your description. Try adding more detail or picking symptoms from the list.",
      urgency: floor,
      conditions: [],
      treatments: [],
      selfCare: ['Rest, stay hydrated and monitor how you feel'],
      seeDoctor: ['Symptoms persist, worsen, or you are worried – speak to a healthcare professional'],
      redFlags: [],
    };
  }

  let urgency = floor;
  for (const t of top.slice(0, 3)) if (t.likelihood >= 35) urgency = maxUrgency(urgency, t.c.urgency);

  const lead = top.slice(0, 2).map((t) => t.c);
  const summary =
    `Based on ${syms.length} reported symptom${syms.length === 1 ? '' : 's'} (${syms.map(symptomLabel).join(', ')}), ` +
    `the closest pattern is ${top[0].c.name.toLowerCase()}. ` +
    (rankOf(floor) > 0 && rankOf(floor) >= rankOf(urgency) ? 'Your age, health history or symptom severity raises the recommended level of care.' : '');

  return {
    summary: summary.trim(),
    urgency,
    conditions: top.map((t) => ({
      name: t.c.name,
      likelihood: t.likelihood,
      description: t.c.desc,
      why: `Matches: ${t.matched.map(symptomLabel).join(', ')}`,
    })),
    treatments: uniq(lead.flatMap((c) => c.treatments)).slice(0, 5),
    selfCare: uniq(lead.flatMap((c) => c.selfCare)).slice(0, 5),
    seeDoctor: uniq([...lead.flatMap((c) => c.seeDoctor), 'Symptoms worsen or you feel something is seriously wrong']).slice(0, 5),
    redFlags: syms.filter((id) => byId[id]?.red).map(symptomLabel),
  };
}

export function demoChat(question, rec) {
  const q = question.toLowerCase();
  const top = rec.result.conditions[0]?.name;
  if (/\b(medicine|medication|drug|tablet|pill|take|dose|dosage)\b/.test(q))
    return 'Over-the-counter options such as paracetamol (acetaminophen) or ibuprofen are commonly used for pain and fever, but always follow the label, check for allergies or interactions, and ask a pharmacist or doctor if you are pregnant, have kidney, liver or stomach problems, or take other medicines.';
  if (/\b(how long|when will|recover|better)\b/.test(q))
    return `Most mild illnesses such as ${top ? top.toLowerCase() : 'viral infections'} improve within a few days to two weeks. If you are not clearly improving after 3–5 days, or you get worse at any point, see a doctor.`;
  if (/\b(eat|food|diet|drink)\b/.test(q))
    return 'Stay well hydrated with water, oral rehydration drinks or clear broths. Choose light, easy-to-digest foods, and avoid alcohol and very sugary or fatty meals until you feel better.';
  if (/\b(work|school|exercise|gym|travel)\b/.test(q))
    return 'If you have a fever, vomiting or are very unwell, rest at home and avoid contact with others. Return to normal activity gradually once you are fever-free and feeling better.';
  if (/\b(doctor|hospital|emergency|serious|worried|dangerous)\b/.test(q))
    return 'Seek urgent care for trouble breathing, chest pain, confusion, severe or sudden pain, a stiff neck with fever, signs of dehydration, or if you simply feel something is seriously wrong. Trust your instincts – it is always okay to get checked.';
  return "I can only share general guidance for that. For advice specific to you, please speak with a doctor or pharmacist, especially if your symptoms are getting worse.";
}
