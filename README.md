# AICura – Virtual Health Assistant

A symptom checker that gives a **preliminary** view of possible conditions, an urgency level, basic treatment and self-care suggestions, and follow-up Q&A. iOS-inspired monochrome interface, mobile-first, light and dark themes.

> ⚠️ AICura is an informational prototype. It does not diagnose and is not a substitute for professional medical advice. In an emergency call your local emergency number.

## Features

- 3-step guided intake (about you → symptoms → duration & severity)
- Free-text, voice dictation (where supported) and tap-to-select symptoms, with negation handling ("no cough")
- Results: urgency banner, ranked possible conditions with likelihood, treatment options, self-care, "see a doctor if…"
- Red-flag safety net: chest pain, breathing trouble, stroke signs, etc. always escalate urgency – even if the model under-triages
- Follow-up chat about your results
- Saved history (stored locally in the browser)
- **Gemini integration** (bring your own key) with an automatic **offline demo engine** fallback, so everything works out of the box
- Responsive: desktop top-nav, mobile bottom tab bar

## Run locally

No build step or Node required – it's static files (React 18 via ES modules + [htm](https://github.com/developit/htm)).

```bash
python3 -m http.server 5173
# open http://localhost:5173
```

## Deploy to Vercel

Import the repo in Vercel and deploy with the defaults (Framework: **Other**, no build command, no output directory). `vercel.json` is included.

## Enabling Gemini

Open **Settings** (slider icon, top right) and paste a key from [Google AI Studio](https://aistudio.google.com/apikey). The key is stored only in your browser's `localStorage` and sent directly to Google's API. Without a key (or with "Basic mode" on), the built-in rule-based engine in `js/engine.js` is used.

> For a production deployment, proxy Gemini calls through a small serverless function so the key never reaches the browser.

## Structure

```
index.html        entry + import map
styles.css        design tokens, components, responsive rules
js/main.js        app shell, routing, state, persistence
js/views.js       Home, Wizard, Results, Chat, History, Settings
js/engine.js      offline symptom parsing + scoring + safety floor
js/gemini.js      Gemini REST client + response normalisation
js/data.js        symptom vocabulary + condition knowledge base
```

## Tech

React 18 · Gemini API · vanilla CSS. (The original concept also uses spaCy, LangChain, FastAPI and Uvicorn on the backend – this prototype is frontend-only.)
