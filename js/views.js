import React, { useState, useMemo, useRef, useEffect } from 'react';
import { html, Icon, fmtDate } from './ui.js';
import { SYMPTOMS, COMMON_SYMPTOM_IDS, HEALTH_CONDITIONS, URGENCY } from './data.js';
import { parseText, symptomLabel, demoChat } from './engine.js';
import { geminiChat, DEFAULT_MODEL } from './gemini.js';

/* ───────────── Building blocks (iOS grouped-list vocabulary) ───────────── */
function Group({ title, footer, children }) {
  return html`<section className="group">
    ${title && html`<h4 className="group-h">${title}</h4>`}
    <div className="list">${children}</div>
    ${footer && html`<p className="group-f">${footer}</p>`}
  </section>`;
}

function Row({ icon, red, title, sub, trail, onClick, chevron, tick, danger }) {
  const Tag = onClick ? 'button' : 'div';
  return html`<${Tag} className=${'row' + (icon ? ' has-ico' : '') + (danger ? ' danger' : '')} onClick=${onClick}>
    ${icon && html`<span className=${'ico' + (red ? ' red' : '')}><${Icon} name=${icon} size=${17} /></span>`}
    <span className="body"><span className="t">${title}</span>${sub && html`<span className="s">${sub}</span>`}</span>
    ${trail != null && html`<span className="trail">${trail}</span>`}
    ${tick && html`<span className="tick"><${Icon} name="check" size=${18} /></span>`}
    ${chevron && html`<span className="chev"><${Icon} name="chevronRight" size=${16} /></span>`}
  </${Tag}>`;
}

export function Meter({ level, small }) {
  const emergency = level === 3;
  return html`<span className=${'meter' + (small ? ' sm' : '') + (emergency ? ' red' : '')} aria-hidden="true">
    ${[0, 1, 2, 3].map((i) => html`<i key=${i} className=${i <= level ? 'on' : ''}></i>`)}
  </span>`;
}

export function Disclaimer() {
  return html`<p className="disclaimer"><b>Not medical advice.</b> AICura gives preliminary, informational guidance and cannot diagnose. In an emergency, call your local emergency number.</p>`;
}

/* ───────────── Home ───────────── */
export function Home({ onStart, onHistory, historyCount }) {
  return html`<div className="page fade-in">
    <header className="large">
      <h1>AICura</h1>
      <p className="lead">Check your symptoms and know what to do next.</p>
    </header>

    <div style=${{ marginTop: 24 }}>
      <button className="btn primary block" onClick=${onStart}>Start symptom check</button>
    </div>

    <${Group} title="How it works">
      <${Row} icon="user" title="Tell us about you" sub="Age, sex and any existing conditions." />
      <${Row} icon="stethoscope" title="Describe your symptoms" sub="Type, speak or tap what you're feeling." />
      <${Row} icon="check" title="Get guidance" sub="Likely causes, urgency and what to do next." />
    <//>

    ${historyCount > 0 && html`<${Group} title="Your checks">
      <${Row} icon="history" title="History" trail=${historyCount} chevron onClick=${onHistory} />
    <//>`}

    <${Group}>
      <${Row} icon="phone" red title="In an emergency" sub="Chest pain, trouble breathing, sudden weakness or confusion: call 112 / 911 / 999." />
    <//>
    <${Disclaimer} />
  </div>`;
}

/* ───────────── Wizard ───────────── */
const DURATIONS = [
  ['today', 'Less than a day'],
  ['days', '1–3 days'],
  ['week', '4–7 days'],
  ['weeks', '1–4 weeks'],
  ['month', 'Over a month'],
];
const sevText = (n) => (n <= 3 ? 'Mild' : n <= 6 ? 'Moderate' : n <= 8 ? 'Severe' : 'Very severe');
const STEP_COPY = [
  ['About you', 'This helps tailor the guidance.'],
  ['Symptoms', 'Describe it in your own words, or pick from the list.'],
  ['Details', 'How long, and how bad? This affects urgency.'],
];

export function Wizard({ initial, onSubmit, busy }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState(initial);
  const [listening, setListening] = useState(false);
  const rec = useRef(null);
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const toggle = (k, v) => setD((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));

  const parsed = useMemo(() => parseText(d.text), [d.text]);
  const age = Number(d.age);
  const valid = [age >= 0 && age <= 120 && d.age !== '' && !!d.sex, d.symptoms.length > 0 || parsed.length > 0 || d.text.trim().length > 3, true];

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

  const next = () => (step < 2 ? setStep(step + 1) : onSubmit(d));
  const [title, sub] = STEP_COPY[step];

  return html`<div className="page fade-in">
    <div className="steps">
      <span className="caption">Step ${step + 1} of 3</span>
      <span className="dashes">${[0, 1, 2].map((i) => html`<i key=${i} className=${i <= step ? 'on' : ''}></i>`)}</span>
    </div>
    <header><h1 className="title-2">${title}</h1><p className="lead">${sub}</p></header>

    ${step === 0 && html`<div>
      <${Group}>
        <label className="row field-row"><span className="t">Age</span>
          <input type="number" inputMode="numeric" min="0" max="120" placeholder="Years" value=${d.age} onInput=${(e) => set('age', e.target.value)} />
        </label>
      <//>
      <${Group} title="Sex">
        <div className="pad"><div className="seg">
          ${['Female', 'Male', 'Other'].map((s) => html`<button key=${s} type="button" className=${d.sex === s ? 'on' : ''} onClick=${() => set('sex', s)}>${s}</button>`)}
        </div></div>
      <//>
      <${Group} title="Existing conditions" footer="Optional. Select any that apply.">
        ${HEALTH_CONDITIONS.map((c) => html`<${Row} key=${c} title=${c} tick=${d.conditions.includes(c)} onClick=${() => toggle('conditions', c)} />`)}
      <//>
    </div>`}

    ${step === 1 && html`<div>
      <${Group} title="In your words">
        <div className="textwrap">
          <textarea rows="4" placeholder="e.g. Sore throat and a mild fever since yesterday, feeling very tired…" value=${d.text} onInput=${(e) => set('text', e.target.value)}></textarea>
          ${SR && html`<button type="button" className=${'mic ' + (listening ? 'live' : '')} onClick=${mic} aria-label="Dictate symptoms"><${Icon} name="mic" size=${17} /></button>`}
        </div>
      <//>
      ${parsed.length > 0 && html`<p className="detected">Detected: <b>${parsed.map(symptomLabel).join(', ')}</b></p>`}
      <${Group} title="Common symptoms">
        <div className="pad chips">
          ${COMMON_SYMPTOM_IDS.map((id) => html`<button key=${id} type="button" className=${'chip ' + (d.symptoms.includes(id) ? 'on' : '')} onClick=${() => toggle('symptoms', id)}>${symptomLabel(id)}</button>`)}
        </div>
      <//>
      <${Group}>
        <details className="more">
          <summary><span>More symptoms</span><span className="chev"><${Icon} name="chevron" size=${16} /></span></summary>
          <div className="chips">
            ${SYMPTOMS.filter((s) => !COMMON_SYMPTOM_IDS.includes(s.id)).map((s) => html`<button key=${s.id} type="button" className=${'chip ' + (d.symptoms.includes(s.id) ? 'on' : '') + (s.red ? ' red' : '')} onClick=${() => toggle('symptoms', s.id)}>${s.label}</button>`)}
          </div>
        </details>
      <//>
    </div>`}

    ${step === 2 && html`<div>
      <${Group} title="How long?">
        ${DURATIONS.map(([v, l]) => html`<${Row} key=${v} title=${l} tick=${d.duration === v} onClick=${() => set('duration', v)} />`)}
      <//>
      <${Group} title="Severity">
        <div className="sev">
          <div className="sev-top"><b>${d.severity}<span className="muted" style=${{ fontWeight: 400, fontSize: 15 }}> / 10</span></b><span className="muted">${sevText(Number(d.severity))}</span></div>
          <input type="range" min="1" max="10" value=${d.severity} onInput=${(e) => set('severity', Number(e.target.value))} style=${{ '--p': ((d.severity - 1) / 9) * 100 + '%' }} />
          <div className="scale"><span>Mild</span><span>Unbearable</span></div>
        </div>
      <//>
      <${Group} title="Notes" footer="Optional. Medications, recent travel, triggers, what helps or hurts.">
        <textarea rows="3" placeholder="Add details" value=${d.notes} onInput=${(e) => set('notes', e.target.value)}></textarea>
      <//>
    </div>`}

    <div className="actions">
      ${step > 0 && html`<button className="btn secondary" disabled=${busy} onClick=${() => setStep(step - 1)}>Back</button>`}
      <button className="btn primary" disabled=${!valid[step] || busy} onClick=${next}>
        ${busy ? html`<span className="spin"></span> Analyzing` : step < 2 ? 'Continue' : 'Analyze symptoms'}
      </button>
    </div>
    <${Disclaimer} />
  </div>`;
}

/* ───────────── Results ───────────── */
function Items({ title, items }) {
  if (!items?.length) return null;
  return html`<${Group} title=${title}>${items.map((t, i) => html`<div className="row item" key=${i}>${t}</div>`)}<//>`;
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
      answer = demoChat(question, rec);
    }
    setMsgs((m) => [...m, { role: 'model', text: answer }]);
    setBusy(false);
  }

  const suggestions = ['What can I take for this?', 'How long will it last?', 'What should I eat or drink?'];
  return html`<${Group} title="Ask a follow-up">
    <div className="chat-box">
      ${msgs.length === 0 && html`<div className="chips">${suggestions.map((s) => html`<button key=${s} className="chip" onClick=${() => send(s)}>${s}</button>`)}</div>`}
      ${(msgs.length > 0 || busy) && html`<div className="msgs">
        ${msgs.map((m, i) => html`<div key=${i} className=${'msg ' + m.role}>${m.text}</div>`)}
        ${busy && html`<div className="msg model typing"><span></span><span></span><span></span></div>`}
        <div ref=${end}></div>
      </div>`}
      <form className="composer" onSubmit=${(e) => { e.preventDefault(); send(); }}>
        <input placeholder="Ask about your results" value=${q} onInput=${(e) => setQ(e.target.value)} />
        <button className="send" disabled=${!q.trim() || busy} aria-label="Send"><${Icon} name="arrowUp" size=${17} /></button>
      </form>
    </div>
  <//>`;
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

  return html`<div className="page fade-in">
    <header className="large">
      <h1>Results</h1>
      <p className="lead">${fmtDate(rec.date)}</p>
    </header>

    ${notice && html`<div className="notice"><${Icon} name="info" size=${16} /><span>${notice}</span></div>`}

    <section className=${'urgency' + (r.urgency === 'emergency' ? ' emergency' : '')}>
      <${Meter} level=${u.rank} />
      <div className="u-label">${u.label}</div>
      <p className="u-advice">${u.advice}</p>
    </section>

    ${r.redFlags?.length > 0 && html`<div className="notice red"><${Icon} name="alert" size=${16} /><span><b>Warning signs reported:</b> ${r.redFlags.join(', ')}</span></div>`}

    <${Group} title="Summary">
      <div className="pad">
        <p className="summary">${r.summary}</p>
        <div className="tags">
          <span className="tag">${input.age} · ${input.sex}</span>
          <span className="tag">Severity ${input.severity}/10</span>
          <span className="tag">${(DURATIONS.find((x) => x[0] === input.duration) || [0, input.duration])[1]}</span>
        </div>
      </div>
    <//>

    ${r.conditions.length > 0 && html`<${Group} title="Possible conditions" footer="Likelihoods are rough estimates, not a diagnosis.">
      ${r.conditions.map((c, i) => html`<div className="pad cond" key=${c.name}>
        <div className="cond-top"><b>${c.name}</b><span>${c.likelihood}%</span></div>
        <div className="bar"><i style=${{ width: c.likelihood + '%', animationDelay: i * 70 + 'ms' }}></i></div>
        <p>${c.description}</p>
        ${c.why && html`<p className="why">${c.why}</p>`}
      </div>`)}
    <//>`}

    <${Items} title="Treatment options" items=${r.treatments} />
    <${Items} title="Self-care" items=${r.selfCare} />
    <${Items} title="See a doctor if" items=${r.seeDoctor} />

    <${Chat} rec=${rec} settings=${settings} />

    <div className="actions">
      <button className="btn secondary" onClick=${copy}>${copied ? 'Copied' : 'Copy summary'}</button>
      <button className="btn primary" onClick=${onNew}>New check</button>
    </div>
    <${Disclaimer} />
  </div>`;
}

/* ───────────── History ───────────── */
export function History({ items, onOpen, onDelete, onClear, onStart }) {
  if (!items.length)
    return html`<div className="page fade-in">
      <header className="large"><h1>History</h1></header>
      <div className="empty">
        <div className="big"><${Icon} name="history" size=${44} /></div>
        <h2 className="title-2" style=${{ fontSize: 22 }}>No checks yet</h2>
        <p className="muted">Past checks are saved privately on this device.</p>
        <button className="btn primary" onClick=${onStart}>Start a check</button>
      </div>
    </div>`;
  return html`<div className="page fade-in">
    <header className="large"><h1>History</h1></header>
    <${Group}>
      ${items.map((rec) => {
        const u = URGENCY[rec.result.urgency] || URGENCY.soon;
        const syms = [...new Set([...rec.input.symptoms, ...parseText(rec.input.text)])].map(symptomLabel).slice(0, 4).join(', ');
        return html`<div className="hist" key=${rec.id}>
          <${Row} title=${rec.result.conditions[0]?.name || 'No clear match'} sub=${(syms || 'Free-text description') + ' · ' + fmtDate(rec.date)} trail=${html`<${Meter} level=${u.rank} small />`} onClick=${() => onOpen(rec)} />
          <button className="icon-btn" aria-label="Delete" onClick=${() => onDelete(rec.id)}><${Icon} name="trash" size=${17} /></button>
        </div>`;
      })}
    <//>
    <${Group}><${Row} danger title="Clear history" onClick=${onClear} /><//>
  </div>`;
}

/* ───────────── Settings sheet ───────────── */
export function Settings({ settings, onSave, onClose }) {
  const [s, setS] = useState(settings);
  return html`<div className="overlay" onClick=${onClose}>
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings" onClick=${(e) => e.stopPropagation()}>
      <div className="sheet-bar">
        <button className="l" onClick=${onClose}>Cancel</button>
        <h2>Settings</h2>
        <button className="r" onClick=${() => onSave({ ...s, model: s.model || DEFAULT_MODEL })}>Done</button>
      </div>
      <${Group} title="Detailed analysis" footer=${html`Optional. Connect your own Google API key for more detailed results. It stays on this device. Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.`}>
        <label className="row field-row"><span className="t">API key</span>
          <input type="password" autoComplete="off" placeholder="AIza…" value=${s.apiKey} onInput=${(e) => setS({ ...s, apiKey: e.target.value.trim() })} />
        </label>
        <label className="row field-row"><span className="t">Model</span>
          <input value=${s.model} placeholder=${DEFAULT_MODEL} onInput=${(e) => setS({ ...s, model: e.target.value.trim() })} />
        </label>
      <//>
      <${Group} footer="Turn on to use basic on-device results only.">
        <label className="row"><span className="body"><span className="t">Basic mode</span></span>
          <span className="switch"><input type="checkbox" checked=${s.demo} onChange=${(e) => setS({ ...s, demo: e.target.checked })} /><i></i></span>
        </label>
      <//>
      ${settings.apiKey && html`<${Group}><${Row} danger title="Remove API key" onClick=${() => onSave({ apiKey: '', model: DEFAULT_MODEL, demo: false })} /><//>`}
    </div>
  </div>`;
}
