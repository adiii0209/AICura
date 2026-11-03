// Thin client for the Gemini REST API (called straight from the browser with the user's own key).
import { symptomLabel, symptomsFrom } from './engine.js';

export const DEFAULT_MODEL = 'gemini-2.5-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM = `You are AICura, a careful virtual health assistant that gives PRELIMINARY, informational triage.
You never claim a definitive diagnosis. Be calm, plain-spoken and concise. Prefer cautious urgency when in doubt.
Treatment suggestions must be general (over-the-counter options, home care) and never include prescription doses.
Flag emergencies (chest pain, trouble breathing, stroke signs, severe bleeding, confusion, stiff neck with fever, suicidal thoughts) clearly.`;

const SCHEMA = `Respond with ONLY valid JSON in exactly this shape:
{
  "summary": "2-3 sentence plain-language overview",
  "urgency": "self-care" | "soon" | "urgent" | "emergency",
  "conditions": [ { "name": "string", "likelihood": 0-100, "description": "1 sentence", "why": "which of the user's symptoms support this" } ],
  "treatments": ["general over-the-counter / treatment options"],
  "selfCare": ["home-care tips"],
  "seeDoctor": ["specific situations that should prompt a doctor visit"],
  "redFlags": ["any warning signs present in the input, else empty"]
}
Give 2-4 conditions ordered by likelihood and 3-5 items for each list.`;

const DURATIONS = { today: 'less than a day', days: '1-3 days', week: '4-7 days', weeks: '1-4 weeks', month: 'more than a month' };

function describe(input) {
  const syms = symptomsFrom(input).map(symptomLabel);
  return [
    `Age: ${input.age}`,
    `Sex: ${input.sex}`,
    `Existing conditions: ${input.conditions?.length ? input.conditions.join(', ') : 'none reported'}`,
    `Selected symptoms: ${syms.length ? syms.join(', ') : 'none selected'}`,
    `In their own words: ${input.text?.trim() || 'n/a'}`,
    `Duration: ${DURATIONS[input.duration] || input.duration}`,
    `Severity (1-10): ${input.severity}`,
    `Additional notes: ${input.notes?.trim() || 'n/a'}`,
  ].join('\n');
}

async function call({ apiKey, model }, body) {
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model || DEFAULT_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Empty response from model');
  return text;
}

const list = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

function normalize(raw) {
  const urgency = ['self-care', 'soon', 'urgent', 'emergency'].includes(raw.urgency) ? raw.urgency : 'soon';
  return {
    summary: String(raw.summary || ''),
    urgency,
    conditions: (Array.isArray(raw.conditions) ? raw.conditions : []).slice(0, 5).map((c) => ({
      name: String(c.name || 'Unknown'),
      likelihood: Math.max(1, Math.min(99, Math.round(Number(c.likelihood) || 0))),
      description: String(c.description || ''),
      why: String(c.why || ''),
    })),
    treatments: list(raw.treatments),
    selfCare: list(raw.selfCare),
    seeDoctor: list(raw.seeDoctor),
    redFlags: list(raw.redFlags),
  };
}

export async function geminiAnalyze(settings, input) {
  const text = await call(settings, {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: `Patient intake:\n${describe(input)}\n\n${SCHEMA}` }] }],
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
  });
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return normalize(JSON.parse(json));
}

export async function geminiChat(settings, rec, history, question) {
  const context = `Earlier assessment for this user:\n${describe(rec.input)}\n\nAssessment JSON:\n${JSON.stringify(rec.result)}`;
  return call(settings, {
    systemInstruction: {
      parts: [{ text: `${SYSTEM}\nAnswer the user's follow-up question in under 120 words, in plain text (no markdown headings). End with a brief reminder to see a professional only when relevant.\n\n${context}` }],
    },
    contents: [...history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })), { role: 'user', parts: [{ text: question }] }],
    generationConfig: { temperature: 0.5 },
  });
}
