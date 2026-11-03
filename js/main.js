import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { html, Icon, store } from './ui.js';
import { Home, Wizard, Results, History, Settings } from './views.js';
import { localAnalyze, urgencyFloor, maxUrgency } from './engine.js';
import { geminiAnalyze, DEFAULT_MODEL } from './gemini.js';

const BLANK = { age: '', sex: '', conditions: [], symptoms: [], text: '', duration: 'days', severity: 4, notes: '' };

function App() {
  const [view, setView] = useState('home'); // home | check | result | history
  const [settings, setSettings] = useState(() => store.get('aicura.settings', { apiKey: '', model: DEFAULT_MODEL, demo: false }));
  const [history, setHistory] = useState(() => store.get('aicura.history', []));
  const [profile, setProfile] = useState(() => store.get('aicura.profile', {}));
  const [current, setCurrent] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const live = !!settings.apiKey && !settings.demo;
  const mode = { gemini: live, model: settings.model || DEFAULT_MODEL };

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  const go = (v) => {
    setNotice('');
    setView(v);
  };

  async function analyze(input) {
    setBusy(true);
    setNotice('');
    store.set('aicura.profile', { age: input.age, sex: input.sex, conditions: input.conditions });
    setProfile({ age: input.age, sex: input.sex, conditions: input.conditions });

    let result;
    let source = 'demo';
    let note = '';
    if (live) {
      try {
        result = await geminiAnalyze(settings, input);
        // Never let the model under-triage obvious red flags.
        result.urgency = maxUrgency(result.urgency, urgencyFloor(input));
        source = 'gemini';
      } catch (e) {
        note = `Gemini couldn't be reached (${e.message}). Showing results from the built-in demo engine instead.`;
      }
    }
    if (!result) result = localAnalyze(input);

    const rec = { id: Date.now(), date: new Date().toISOString(), input, result, source };
    const next = [rec, ...history].slice(0, 30);
    setHistory(next);
    store.set('aicura.history', next);
    setCurrent(rec);
    setNotice(note);
    setBusy(false);
    setView('result');
  }

  function saveSettings(s) {
    setSettings(s);
    store.set('aicura.settings', s);
    setShowSettings(false);
  }

  function removeItem(id) {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    store.set('aicura.history', next);
  }

  function clearAll() {
    if (!confirm('Delete all saved checks from this device?')) return;
    setHistory([]);
    store.set('aicura.history', []);
  }

  function newCheck() {
    setFormKey((k) => k + 1);
    go('check');
  }

  const tabs = [
    ['home', 'Home', 'home'],
    ['check', 'Check', 'stethoscope'],
    ['history', 'History', 'history'],
  ];
  const active = view === 'result' ? 'check' : view;

  return html`<div className="app">
    <header className="topbar">
      <div className="topbar-in">
        <button className="brand" onClick=${() => go('home')} aria-label="AICura home">
          <span className="logo"><${Icon} name="logo" size=${20} /></span><span>AICura</span>
        </button>
        <nav className="nav">
          ${tabs.map(([id, label, icon]) => html`<button key=${id} className=${active === id ? 'on' : ''} onClick=${() => (id === 'check' ? newCheck() : go(id))}>${label}</button>`)}
        </nav>
        <button className=${'icon-btn gear ' + (live ? 'live' : '')} onClick=${() => setShowSettings(true)} aria-label="Settings" title="Settings"><${Icon} name="settings" size=${19} /></button>
      </div>
    </header>

    <main className="main">
      ${view === 'home' && html`<${Home} mode=${mode} historyCount=${history.length} onStart=${newCheck} onHistory=${() => go('history')} />`}
      ${view === 'check' && html`<${Wizard} key=${formKey} busy=${busy} onSubmit=${analyze} initial=${{ ...BLANK, ...profile }} />`}
      ${view === 'result' && current && html`<${Results} rec=${current} notice=${notice} settings=${settings} onNew=${newCheck} />`}
      ${view === 'history' && html`<${History} items=${history} onStart=${newCheck} onDelete=${removeItem} onClear=${clearAll}
        onOpen=${(rec) => { setCurrent(rec); setNotice(''); setView('result'); }} />`}
    </main>

    <nav className="tabbar">
      ${tabs.map(([id, label, icon]) => html`<button key=${id} className=${active === id ? 'on' : ''} onClick=${() => (id === 'check' ? newCheck() : go(id))}>
        <${Icon} name=${icon} size=${22} /><span>${label}</span>
      </button>`)}
    </nav>

    ${showSettings && html`<${Settings} settings=${settings} onSave=${saveSettings} onClose=${() => setShowSettings(false)} />`}
  </div>`;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
