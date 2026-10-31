# Dinchariya: a daily health check-in you can just talk to

**Live app:** `TODO: paste your deployed link here` (Vercel = live AI + demo fallback; GitHub Pages = demo mode only)

Say your day in plain English ("2 roti, dal, ek glass paani, 15 min walk"). The AI turns it into a log, adapts your walking goal to what you actually do, and nudges you at the right time. No forms, no sign-up, nothing to install.

> Not medical advice. Made-up data only. The app never diagnoses or prescribes and sends red-flag symptoms to 112.

## How it is built
| File | Role |
|---|---|
| `index.html`, `style.css`, `app.js` | Mobile-first UI (large type, voice input, photo input) |
| `engine.js` | Shared logic: Hinglish/Devanagari parser (demo mode), **deterministic safety layer**, AI-output validation, adaptive goal, nudges |
| `api/ask.js` | Question-answering agent: Claude with 3 tools that read a snapshot of the user's day; red flags and medicine questions never reach the model |
| `api/coach.js` | Vercel function calling the Claude API. Key is read from env, never stored in the repo |
| `tests/` | 19 realistic inputs; `node tests/run-ask.js` tests the question agent; `node tests/run-tests.js` (demo) or `--url <live>/api/coach` (live AI) |
| `REPORT.md` | Answers to Q1-Q5 |

## Run locally
```bash
python3 -m http.server 8000      # demo mode at http://localhost:8000
node tests/run-tests.js          # test table
```

## Deploy (live AI)
1. Import the repo into Vercel. 2. Set `ANTHROPIC_API_KEY` in Project Settings (set a low spend limit in the Anthropic console). Optional: `CLAUDE_MODEL`. 3. Open the link; the footer shows "Live AI". Without a key it shows "Demo mode" and still works.

## Credits
No third-party code or assets. Fonts are system fonts. Food kcal ranges are rough, typical home-portion estimates written for this project.
