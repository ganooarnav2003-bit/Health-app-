# My Fitness Buddy: a daily health check-in you can just talk to

**Live app:** `TODO: paste your deployed link here` (Vercel = live AI + demo fallback; GitHub Pages = demo mode only)

Say your day in plain English ("2 roti, dal, 1 glass water, 15 min walk"). The AI turns it into a log, adapts your walking goal to what you actually do, and nudges you at the right time. Ask **Buddy Guide**, the AI assistant (the bot button on the left of every screen), about your water, steps, food and protein. No forms, no sign-up, nothing to install. A refresh button (top bar or menu) brings the day, nudges and live-AI status up to date without reloading the page.

> Not medical advice. Made-up data only. The app never diagnoses or prescribes and sends red-flag symptoms to 112.

## How it is built
| File | Role |
|---|---|
| `index.html`, `style.css`, `app.js` | Mobile-first UI (large type, voice input, photo input) |
| `engine.js` | Shared logic: Hinglish/Devanagari parser (demo mode), **deterministic safety layer**, AI-output validation, adaptive goal, nudges |
| `walk.js` | GPS route maths: accuracy/jitter/jump filtering, distance, downsampling, demo route |
| `plans.js` | Plans (Rs 599 / 1,299 / 7,999), free-tier limits, 10,000-step reward points and streaks. **Edit prices here** |
| `vendor/leaflet/` | Leaflet 1.9.4 (BSD-2-Clause), bundled so the map works without a CDN |
| `watch.js` | Bluetooth heart-rate parsing, zones (Tanaka max HR), advice, demo stream |
| `fit.js` | Workouts (MET calories), sleep, weight stats, CSV, and the strict backup-import validator |
| `community.js` | Community without a server: friend-link encode/decode with strict validation, ranking, challenge rules |
| `tips.js` | Curated Daily Health Digest (31 general tips, picked per day and per user's gaps) |
| `api/ask.js` | Question-answering agent: Claude with 3 tools that read a snapshot of the user's day; red flags and medicine questions never reach the model |
| `api/coach.js` | Vercel function calling the Claude API. Key is read from env, never stored in the repo |
| `tests/` | 20 realistic inputs; `node tests/run-ask.js` tests the question agent; `node tests/run-profile.js` tests protein/calorie maths and the tips library; `node tests/run-walk-plans.js` tests GPS maths, plans and rewards; `node tests/run-fit.js` tests heart-rate parsing, workouts, sleep, weight and hostile backup files; `node tests/run-community.js` tests friend links (including hostile ones), ranking and challenges; `node tests/run-tests.js` (demo) or `--url <live>/api/coach` (live AI) |
| `REPORT.md` | Answers to Q1-Q5 |

## Run locally
```bash
python3 -m http.server 8000      # demo mode at http://localhost:8000
node tests/run-tests.js          # test table
```

## Deploy (live AI)
1. Import the repo into Vercel. 2. Set `ANTHROPIC_API_KEY` in Project Settings (set a low spend limit in the Anthropic console). Optional: `CLAUDE_MODEL`. 3. Open the link; the footer shows "Live AI". Without a key it shows "Demo mode" and still works.

## Credits
- Leaflet 1.9.4 (c) Volodymyr Agafonkin, BSD-2-Clause, bundled unmodified in `vendor/leaflet/`.
- Map tiles (when online): (c) OpenStreetMap contributors, https://www.openstreetmap.org/copyright. Light personal use only; for heavy traffic switch to a tile provider with an account.
Fonts are system fonts. Food kcal ranges are rough, typical home-portion estimates written for this project.

## Subscription (demo)
Everyone starts on a permanent **Free plan** (no sign-up, no login, no card). There is no account system on purpose: the course brief asks for no sign-up, and your notes stay on your phone.
The plans screen is a **demo**: nothing is charged. A real launch needs a payment provider (for example Razorpay Checkout plus a webhook to a small backend that records who has paid), and a check of taxes, refund and cancellation rules. Note the current prices make Yearly (Rs 667/month) dearer per month than Monthly (Rs 599) and 6 months (Rs 217): `node tests/run-walk-plans.js` flags this, and the UI badge is computed from the numbers.

## Connecting a watch: what works and what does not
**Works:** any device that shares the standard Bluetooth Low Energy Heart Rate service (chest straps, and watches with a "broadcast heart rate" or "heart rate sensor" mode), in **Chrome or Edge on Android or desktop**, over https. Tap *Connect watch or strap* on the Walk screen; zones and a gentle slow-down message show live, and your walk is saved with its average and maximum heart rate. A *demo heart rate* button shows it without a device.

**Does not work:** iPhone (Safari does not support Web Bluetooth), Firefox, and watches that only talk to their own app and cloud (Apple Watch, Fitbit, Samsung Galaxy Watch). Reaching those needs a native app using Health Connect (Android) or HealthKit (iOS), or each vendor's cloud API with OAuth and a backend. Steps and sleep from those watches can be added by hand.

Heart-rate zones are a general guide, not medical advice. The app never diagnoses.

## Your data
Everything is stored on the phone only. Use *Me > Backup & restore* to download a copy (and to move to a new phone) or export a daily CSV for your doctor. Restoring a backup validates every field and replaces what is on the phone after you confirm.

## Community (no server, no strangers)
There are **no public posts and no stranger accounts**. *Community* has three parts, all stored on the phone:
- **Friends board:** *Share my week* makes a link containing only your first name, steps this week, best day and streak. A friend opens it and chooses to add you. Nothing is stored on a server, so numbers update only when someone shares a new link, and they are not verified. Only add people you know.
- **Challenges:** four short challenges judged from your own steps, water and active minutes.
- **My groups:** keep your own walking group or yoga class and send an invite in one tap.
*Load sample community* shows made-up friends so you can see how it looks. A real, live community (chat, public groups, live leaderboards) would need accounts, a database and moderation, which this prototype deliberately does not have.
