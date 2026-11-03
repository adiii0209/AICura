import React, { useState, useMemo, useRef, useEffect } from 'react';
import { html, Icon, fmtDate } from './ui.js';
import { SYMPTOMS, COMMON_SYMPTOM_IDS, HEALTH_CONDITIONS, URGENCY } from './data.js';
import { parseText, symptomLabel, demoChat } from './engine.js';
import { geminiChat, DEFAULT_MODEL } from './gemini.js';

export function Disclaimer() {
  return html`<div className="disclaimer">
    <${Icon} name="shield" size=${16} />
    <span><b>Not medical advice.</b> AICura gives preliminary, informational guidance only and cannot diagnose. In an emergency call your local emergency number.</span>
  </div>`;
}

/* ───────────────────────── Home ───────────────────────── */
export function Home({ onStart, onHistory, mode, historyCount }) {
  const steps = [
    ['user', 'Tell us about you', 'Age, sex and any existing conditions help tailor the guidance.'],
    ['stethoscope', 'Describe symptoms', 'Type in your own words, speak, or tap common symptoms.'],
    ['sparkles', 'Get guidance', 'See likely causes, urgency level, care tips and when to see a doctor.'],
  ];
  return html`<div className="stack-lg fade-in">
    <section className="hero">
      <span className="pill"><${Icon} name="sparkles" size=${14} /> AI-powered early symptom insight</span>
      <h1>Understand your symptoms,<br /><span className="grad">before they worry you.</span></h1>
      <p className="lead">AICura analyzes how you feel and offers a preliminary view of possible causes, how urgent it may be, and what you can do next.</p>
      <div className="row wrap center-m">
        <button className="btn primary lg" onClick=${onStart}>Start symptom check <${Icon} name="arrowRight" size=${18} /></button>
        ${historyCount > 0 && html`<button className="btn ghost lg" onClick=${onHistory}>View history (${historyCount})</button>`}
      </div>
      <div className=${'mode ' + (mode.gemini ? 'on' : '')}>
        <span className="dot"></span>${mode.gemini ? `Gemini connected · ${mode.model}` : 'Demo mode · built-in engine (add a Gemini key in Settings for full AI)'}
      </div>
    </section>

    <section className="grid3">
      ${steps.map(
        ([icon, title, text], i) => html`<div className="card feature" key=${title}>
          <div className="icon-badge"><${Icon} name=${icon} size=${20} /></div>
          <div className="step-n">0${i + 1}</div>
          <h3>${title}</h3>
          <p className="muted">${text}</p>
        </div>`
      )}
    </section>

    <section className="card emergency-card">
      <div className="icon-badge red"><${Icon} name="phone" size=${20} /></div>
      <div>
        <h3>Having an emergency?</h3>
        <p className="muted">Chest pain, trouble breathing, sudden weakness or numbness, confusion, or severe bleeding need immediate care. Call <b>112 / 911 / 999</b> – don't wait for an online tool.</p>
      </div>
    </section>
    <${Disclaimer} />
  </div>`;
}

/* ───────────────────────── Wizard ───────────────────────── */
const DURATIONS = [
  ['today', 'Less than a day'],
  ['days', '1–3 days'],
  ['week', '4–7 days'],
  ['weeks', '1–4 weeks'],
  ['month', 'Over a month'],
];
const sevText = (n) => (n <= 3 ? 'Mild' : n <= 6 ? 'Moderate' : n <= 8 ? 'Severe' : 'Very severe');

export function Wizard({ initial, onSubmit, busy }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState(initial);
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const toggle = (k, v) => setD((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));

  const parsed = useMemo(() => parseText(d.text), [d.text]);
  const picked = [...new Set([...d.symptoms, ...parsed])];
  const age = Number(d.age);
  const valid = [age >= 0 && age <= 120 && d.age !== '' && !!d.sex, picked.length > 0 || d.text.trim().length > 3, true];

  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  function mic() {
    if (!SR) return;
    if (listening) return rec.current?.stop();
    const r = new SR();
    r.lang = navigator.language || 'en-US';
    r.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setD((p) => ({ ...p, text: (p.text ? p.text.trim() + ' ' : '') + t }));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  const titles = ['About you', 'Your symptoms', 'Details'];
  const next = () => (step < 2 ? setStep(step + 1) : onSubmit(d));

  return html`<div className="wizard fade-in">
    <div className="progress" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow=${step + 1}>
      ${titles.map((t, i) => html`<div key=${t} className=${'pstep ' + (i < step ? 'done' : i === step ? 'active' : '')}>
        <span className="pnum">${i < step ? html`<${Icon} name="check" size=${14} />` : i + 1}</span><span className="plabel">${t}</span>
      </div>`)}
    </div>

    <div className="card wiz-card">
      ${step === 0 && html`<div className="stack">
        <div><h2>Let's start with the basics</h2><p className="muted">This helps tailor the guidance. Nothing leaves your device except the analysis request.</p></div>
        <label className="field"><span>Age</span>
          <input type="number" inputMode="numeric" min="0" max="120" placeholder="e.g. 32" value=${d.age} onInput=${(e) => set('age', e.target.value)} />
        </label>
        <div className="field"><span>Sex</span>
          <div className="seg">
            ${['Female', 'Male', 'Other'].map((s) => html`<button key=${s} type="button" className=${d.sex === s ? 'on' : ''} onClick=${() => set('sex', s)}>${s}</button>`)}
          </div>
        </div>
        <div className="field"><span>Existing conditions <i className="muted">(optional)</i></span>
          <div className="chips">
            ${HEALTH_CONDITIONS.map((c) => html`<button key=${c} type="button" className=${'chip ' + (d.conditions.includes(c) ? 'on' : '')} onClick=${() => toggle('conditions', c)}>${c}</button>`)}
          </div>
        </div>
      </div>`}

      ${step === 1 && html`<div className="stack">
        <div><h2>What are you experiencing?</h2><p className="muted">Describe it in your own words and/or tap symptoms below.</p></div>
        <div className="textwrap">
          <textarea rows="4" placeholder="e.g. I've had a sore throat and a mild fever since yesterday, and I feel very tired…" value=${d.text} onInput=${(e) => set('text', e.target.value)}></textarea>
          ${SR && html`<button type="button" className=${'mic ' + (listening ? 'live' : '')} onClick=${mic} aria-label="Dictate symptoms"><${Icon} name="mic" size=${18} /></button>`}
        </div>
        ${parsed.length > 0 && html`<div className="detected"><${Icon} name="sparkles" size=${14} /> Detected: ${parsed.map(symptomLabel).join(', ')}</div>`}
        <div className="field"><span>Common symptoms</span>
          <div className="chips">
            ${COMMON_SYMPTOM_IDS.map((id) => html`<button key=${id} type="button" className=${'chip ' + (d.symptoms.includes(id) ? 'on' : '')} onClick=${() => toggle('symptoms', id)}>${symptomLabel(id)}</button>`)}
          </div>
        </div>
        <details className="more">
          <summary>More symptoms</summary>
          <div className="chips">
            ${SYMPTOMS.filter((s) => !COMMON_SYMPTOM_IDS.includes(s.id)).map((s) => html`<button key=${s.id} type="button" className=${'chip ' + (d.symptoms.includes(s.id) ? 'on' : '') + (s.red ? ' red' : '')} onClick=${() => toggle('symptoms', s.id)}>${s.label}</button>`)}
          </div>
        </details>
      </div>`}

      ${step === 2 && html`<div className="stack">
        <div><h2>A few more details</h2><p className="muted">How long and how bad? This affects how urgent the advice is.</p></div>
        <div className="field"><span>How long have you had these symptoms?</span>
          <div className="chips">
            ${DURATIONS.map(([v, l]) => html`<button key=${v} type="button" className=${'chip ' + (d.duration === v ? 'on' : '')} onClick=${() => set('duration', v)}>${l}</button>`)}
          </div>
        </div>
        <div className="field"><span>Severity <b className="sev">${d.severity}/10 · ${sevText(Number(d.severity))}</b></span>
          <input type="range" min="1" max="10" value=${d.severity} onInput=${(e) => set('severity', Number(e.target.value))} style=${{ '--p': ((d.severity - 1) / 9) * 100 + '%' }} />
          <div className="scale"><span>Mild</span><span>Unbearable</span></div>
        </div>
        <label className="field"><span>Anything else? <i className="muted">(optional)</i></span>
          <textarea rows="3" placeholder="Medications, recent travel, triggers, what makes it better or worse…" value=${d.notes} onInput=${(e) => set('notes', e.target.value)}></textarea>
        </label>
      </div>`}
    </div>

    <div className="wiz-actions">
      <button className="btn ghost" disabled=${step === 0 || busy} onClick=${() => setStep(step - 1)}><${Icon} name="arrowLeft" size=${16} /> Back</button>
      <button className="btn primary" disabled=${!valid[step] || busy} onClick=${next}>
        ${busy ? html`<span className="spin"></span> Analyzing…` : step < 2 ? html`Continue <${Icon} name="arrowRight" size=${16} />` : html`<${Icon} name="sparkles" size=${16} /> Analyze symptoms`}
      </button>
    </div>
    <${Disclaimer} />
  </div>`;
}

/* ───────────────────────── Results ───────────────────────── */
function Section({ icon, title, items, tone }) {
  if (!items?.length) return null;
  return html`<div className=${'card section ' + (tone || '')}>
    <h3><${Icon} name=${icon} size=${18} /> ${title}</h3>
    <ul>${items.map((t, i) => html`<li key=${i}>${t}</li>`)}</ul>
  </div>`;
}

function Chat({ rec, settings }) {
  const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const live = settings.apiKey && !settings.demo;
  useEffect(() => {
    if (msgs.length) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [msgs, busy]);

  async function send(text) {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    const history = msgs;
    setMsgs([...history, { role: 'user', text: question }]);
    setQ('');
    setBusy(true);
    let answer;
    try {
      answer = live ? await geminiChat(settings, rec, history, question) : demoChat(question, rec);
    } catch (e) {
      answer = `Sorry, I couldn't reach Gemini (${e.message}). ` + demoChat(question, rec);
    }
    setMsgs((m) => [...m, { role: 'model', text: answer }]);
    setBusy(false);
  }

  const suggestions = ['What can I take for this?', 'How long will it last?', 'What should I eat or drink?'];
  return html`<div className="card chat">
    <h3><${Icon} name="sparkles" size=${18} /> Ask a follow-up</h3>
    ${msgs.length === 0 && html`<div className="chips">${suggestions.map((s) => html`<button key=${s} className="chip" onClick=${() => send(s)}>${s}</button>`)}</div>`}
    <div className="msgs">
      ${msgs.map((m, i) => html`<div key=${i} className=${'msg ' + m.role}>${m.text}</div>`)}
      ${busy && html`<div className="msg model typing"><span></span><span></span><span></span></div>`}
      <div ref=${end}></div>
    </div>
    <form className="composer" onSubmit=${(e) => { e.preventDefault(); send(); }}>
      <input placeholder="Ask anything about your results…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <button className="btn primary icon" disabled=${!q.trim() || busy} aria-label="Send"><${Icon} name="send" size=${16} /></button>
    </form>
  </div>`;
}

export function Results({ rec, notice, settings, onNew, onBack }) {
  const { result: r, input } = rec;
  const u = URGENCY[r.urgency] || URGENCY.soon;
  const [copied, setCopied] = useState(false);

  function copy() {
    const lines = [
      `AICura summary – ${fmtDate(rec.date)}`,
      `Urgency: ${u.label}`,
      r.summary,
      '',
      ...r.conditions.map((c) => `• ${c.name} (${c.likelihood}%)`),
      '',
      'Preliminary information only – not medical advice.',
    ];
    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return html`<div className="stack-lg fade-in">
    ${onBack && html`<button className="btn ghost sm" onClick=${onBack}><${Icon} name="arrowLeft" size=${16} /> Back</button>`}
    ${notice && html`<div className="notice"><${Icon} name="alert" size=${16} /> ${notice}</div>`}

    <section className=${'urgency ' + u.tone}>
      <div className="u-icon"><${Icon} name=${r.urgency === 'self-care' ? 'leaf' : r.urgency === 'emergency' ? 'phone' : 'alert'} size=${24} /></div>
      <div>
        <div className="u-label">${u.label}</div>
        <p>${u.advice}</p>
      </div>
    </section>

    ${r.redFlags?.length > 0 && html`<div className="notice red"><${Icon} name="alert" size=${16} /> <span><b>Warning signs reported:</b> ${r.redFlags.join(', ')}</span></div>`}

    <section className="card">
      <div className="row between wrap">
        <h2>Assessment</h2>
        <span className=${'src ' + rec.source}>${rec.source === 'gemini' ? 'Gemini AI' : 'Demo engine'}</span>
      </div>
      <p className="summary">${r.summary}</p>
      <div className="tags">
        <span className="tag">${input.age} y · ${input.sex}</span>
        <span className="tag">Severity ${input.severity}/10</span>
        <span className="tag">${(DURATIONS.find((x) => x[0] === input.duration) || [0, input.duration])[1]}</span>
      </div>
    </section>

    ${r.conditions.length > 0 && html`<section className="stack">
      <h2 className="sec-title">Possible conditions</h2>
      <div className="grid2">
        ${r.conditions.map((c, i) => html`<div className="card cond" key=${c.name}>
          <div className="row between">
            <h3>${c.name}</h3><span className="pct">${c.likelihood}%</span>
          </div>
          <div className="bar"><i style=${{ width: c.likelihood + '%', animationDelay: i * 80 + 'ms' }}></i></div>
          <p className="muted">${c.description}</p>
          ${c.why && html`<p className="why">${c.why}</p>`}
        </div>`)}
      </div>
    </section>`}

    <section className="grid3 equal">
      <${Section} icon="pill" title="Treatment options" items=${r.treatments} />
      <${Section} icon="leaf" title="Self-care at home" items=${r.selfCare} />
      <${Section} icon="alert" title="See a doctor if…" items=${r.seeDoctor} tone="warn" />
    </section>

    <${Chat} rec=${rec} settings=${settings} />

    <div className="row wrap">
      <button className="btn primary" onClick=${onNew}><${Icon} name="plus" size=${16} /> New check</button>
      <button className="btn ghost" onClick=${copy}><${Icon} name=${copied ? 'check' : 'copy'} size=${16} /> ${copied ? 'Copied' : 'Copy summary'}</button>
    </div>
    <${Disclaimer} />
  </div>`;
}

/* ───────────────────────── History ───────────────────────── */
export function History({ items, onOpen, onDelete, onClear, onStart }) {
  if (!items.length)
    return html`<div className="empty fade-in">
      <div className="icon-badge lg"><${Icon} name="history" size=${26} /></div>
      <h2>No checks yet</h2>
      <p className="muted">Your past symptom checks are saved privately on this device.</p>
      <button className="btn primary" onClick=${onStart}>Start a check</button>
    </div>`;
  return html`<div className="stack fade-in">
    <div className="row between"><h2>History</h2><button className="btn ghost sm" onClick=${onClear}><${Icon} name="trash" size=${14} /> Clear all</button></div>
    ${items.map((rec) => {
      const u = URGENCY[rec.result.urgency] || URGENCY.soon;
      return html`<div className="card hist" key=${rec.id}>
        <button className="hist-main" onClick=${() => onOpen(rec)}>
          <div className=${'dot-u ' + u.tone}></div>
          <div className="hist-body">
            <b>${rec.result.conditions[0]?.name || 'No clear match'}</b>
            <span className="muted">${[...new Set([...rec.input.symptoms, ...parseText(rec.input.text)])].map(symptomLabel).slice(0, 4).join(', ') || 'Free-text description'}</span>
            <span className="muted small">${fmtDate(rec.date)} · ${u.short}</span>
          </div>
        </button>
        <button className="icon-btn" aria-label="Delete" onClick=${() => onDelete(rec.id)}><${Icon} name="trash" size=${16} /></button>
      </div>`;
    })}
  </div>`;
}

/* ───────────────────────── Settings ───────────────────────── */
export function Settings({ settings, onSave, onClose }) {
  const [s, setS] = useState(settings);
  return html`<div className="overlay" onClick=${onClose}>
    <div className="modal" role="dialog" aria-modal="true" aria-label="Settings" onClick=${(e) => e.stopPropagation()}>
      <div className="row between"><h2>Settings</h2><button className="icon-btn" onClick=${onClose} aria-label="Close"><${Icon} name="x" size=${18} /></button></div>
      <p className="muted">Connect Google Gemini for real AI analysis. Without a key, AICura uses its built-in demo engine.</p>
      <label className="field"><span>Gemini API key</span>
        <input type="password" autoComplete="off" placeholder="AIza…" value=${s.apiKey} onInput=${(e) => setS({ ...s, apiKey: e.target.value.trim() })} />
        <small className="muted">Stored only in this browser (localStorage) and sent directly to Google. Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.</small>
      </label>
      <label className="field"><span>Model</span>
        <input value=${s.model} placeholder=${DEFAULT_MODEL} onInput=${(e) => setS({ ...s, model: e.target.value.trim() })} />
      </label>
      <label className="switch">
        <input type="checkbox" checked=${s.demo} onChange=${(e) => setS({ ...s, demo: e.target.checked })} />
        <span>Force demo mode (ignore API key)</span>
      </label>
      <div className="row end">
        <button className="btn ghost" onClick=${() => onSave({ apiKey: '', model: DEFAULT_MODEL, demo: false })}>Remove key</button>
        <button className="btn primary" onClick=${() => onSave({ ...s, model: s.model || DEFAULT_MODEL })}>Save</button>
      </div>
    </div>
  </div>`;
}
