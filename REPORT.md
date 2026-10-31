# My Fitness Buddy: report (MAI-594 individual project)

> **Status of this draft.** Q3, Q4 and the build parts of Q5 are written from the actual code and test runs. **Q1, Q2 (evidence), and the Q5 user test need real people and real reviews; they are marked `TODO` and must be completed by the student, not invented.** Word count must stay within 2,500 (excluding tables).

## Q1. Why do health apps fail? (8)
**Method (do this, then fill in):**
- [ ] Read >= 30 one/two-star reviews across 2-3 apps (suggest: HealthifyMe, Fitbit/Google Fit, Practo or an Indian diabetes app). Paste a tally table: reason -> count -> 2 quotes.
- [ ] Interview >= 3 people who tried a health app and quit. Ask: *when did you stop, what was the last time you opened it, what did logging feel like?* Notes table: person (initials, age), app, why stopped.
- [ ] >= 2 published sources (e.g. studies on mHealth app attrition / dropout; industry retention data).

| Rank | Reason | Evidence (reviews / interviews / sources) | Tests class guess |
|---|---|---|---|
| 1 | TODO | TODO | H1-H4 |
| 2 | TODO | TODO | |
| 3 | TODO | TODO | |

*Hypothesis to test, not a finding:* the effort of logging (typing foods, searching databases) is the cause of drop-off for non-technical users, and Indian home food is poorly covered by Western food databases (D11). If your research disagrees, change the design below.

## Q2. Who is the customer? (8)
**Provisional choice (confirm or change after Q1):** *Sunita, 63, retired schoolteacher in Pune.* Lives with her husband; her son works abroad and worries. Her doctor said "walk daily, drink more water, watch the sugar." She eats home-cooked food, thinks and speaks in Marathi/Hindi/English mixed, sends WhatsApp voice notes, and finds typing in app search boxes slow. She tried a calorie app: it asked for exact grams, did not know her dishes, and she stopped within two weeks.

**Considered and rejected (edit with your reasons):**
1. *College student, 19*: limited ability to pay, huge competition, switches apps constantly (class notes), and data entry is not a problem for them.
2. *Working professional, 30, wants weight loss*: crowded market; the AI advantage over existing apps is small; motivation, not tooling, is the gap.
3. *Family caregiver of a parent*: real need, but two users, consent and access issues. Handled lightly via a share-to-WhatsApp summary instead.

**Link to Q1:** `TODO: one paragraph tying this choice to your top-3 reasons.` Concerns that disappear with one customer: D03 (age), D02 (too dense), D04-D05/D10 (no wearables, no accounts, no backend DB).

## Q3. What does AI do that ordinary software could not? (10)
**AI replaces the logging form.** The user says the day in her own words (Hinglish, Devanagari from voice dictation, or a photo of the plate); AI extracts meals, portions as ranges, water, walking, BP/sugar readings and symptoms, and asks at most one clarifying question when unsure.

| The AI decides | The AI does on its own | The AI must never |
|---|---|---|
| What was eaten and a rough portion range; whether it is too uncertain and a question is needed (`confidence: low`) | Structures messy input into the log; picks today's walking goal from the last 3 days; chooses which single nudge to show and when (breakfast / water / walk / dinner); shortens its reply to <= 2 sentences | Diagnose; name a disease; comment on medicines or doses; tell the user a symptom is "fine"; give a precise calorie number as if exact; delay an emergency message |

**How "never" is enforced in code, not just in a prompt** (`engine.js`):
1. `assessSafety()` is plain regex/number logic, English + Hinglish + Devanagari. Red flags (chest pain, breathlessness, fainting, stroke signs, heart-attack-like symptoms, self-harm, BP >= 180/120, sugar <= 70 or >= 300) are decided **locally before any network call**; the server also short-circuits so the model is never consulted.
2. The model may only **escalate** safety (`urgent`, `symptoms`), never downgrade the deterministic result.
3. `guardrail()` rejects any AI reply containing diagnosis/prescription phrasing or mg doses and falls back to the template reply.
4. Medication questions get a fixed "ask your doctor" answer.
5. If the API fails (D08) the same app runs in demo mode on the local parser.

**Adaptive plan (not a fixed plan):** walking goal = `clamp(round5(avg_last_3_days * 1.2 + 5), 10, 30)` min. A person who walked 5/0/12 min gets 10 min, not an impossible 30. The tile says why. Skipped walk -> no guilt message and no catch-up penalty (F09 done the gentle way).

### Test: 20 realistic inputs, **demo engine** (`node tests/run-tests.js`)
| # | Input | Why this case | Result | Detail |
|---|---|---|---|---|
| 1 | aaj subah 2 roti aur ek katori dal khayi, chai bhi pi | Hinglish meal | pass | |
| 2 | do glass paani piya, 20 minute walk kiya | water + walk | pass | |
| 3 | had poha for breakfast and 1 cup chai | English | pass | |
| 4 | आज दो रोटी और दाल खाई, तीन गिलास पानी पिया | Devanagari | pass | |
| 5 | thali khayi aaj lunch me | unknown contents -> must ask | pass | asks what was on it |
| 6 | BP 165/100 hai aaj | high reading | pass | amber, "tell doctor", no diagnosis |
| 7 | seene mein dard ho raha hai aur saans phool rahi hai | red flag | pass | 112 message |
| 8 | chest pain nahi hai, bas thoda thaka hua hoon | negation | pass | no false alarm |
| 9 | sugar 54 aaya subah | low reading | pass | red |
| 10 | doctor ne jo tablet di hai woh band kar doon kya? | medication | pass | refuses, "ask doctor" |
| 11 | aaj walk nahi gaya, ghutne mein dard tha | skipped walk + pain | pass | |
| 12 | ate a whole pizza and 3 samosas lol | "whole pizza" must not count as one slice | pass | counted as 8 slices (~2,000-2,800 kcal) and asks the user to confirm; **this originally failed** (pizza was missing, then would have been counted as 1 slice) |
| 13 | to roti aur sabzi khayi | voice heard "do" as "to" | **FAIL** | logged 1 roti, not 2 |
| 14 | dil ghabra raha hai aur pasina aa raha hai | heart symptoms, no keyword "chest" | pass | red; **passes only because I added this pattern after thinking of it** |
| 15 | walked 3 km in 40 minutes | distance given, steps derived | pass | ~4,286 steps, 3 km |
| 16 | did 4000 steps today | steps only | pass | 40 min, 2.8 km (derived at 100 steps/min, 0.7 m/step) |
| 17 | had kadhi and 2 pakora with rice | foods outside the dictionary | **FAIL** | kadhi and pakora silently missed; only rice logged |
| 18 | drank 2 glasses of milk | milk must not count as water | pass | |
| 19 | lunch was 2 roti, dal, sabzi and rice | later items must inherit "lunch" | pass | **found by browser testing**: items after "and" were filed under breakfast until fixed |
| 20 | lunch was aloo sabzi and paneer sabzi with 2 roti | 'X sabzi' is one dish | pass | **found by browser testing**: was counted as two dishes |

**What this shows (honest reading).** 18/20 pass on the offline parser. The two failures (13, 17) are the point of the live AI: a dictionary can't know every dish or fix a speech-to-text error from context. Failure 17 is a silent miss, so the UI shows every logged item with a delete button and says "I assumed 1 portion" when it guessed. Case 14 is a warning about keyword safety: it is only as good as my list, which is why the live path also lets the model escalate. **Not yet done:** the same 20 cases against the live AI (`node tests/run-tests.js --url https://YOUR-APP/api/coach`). `TODO: paste that second table and add >= 3 new inputs from your target user.`

## Q4. What will you build and leave out? (10)
| ID | Feature | Decision | Reason |
|---|---|---|---|
| F01 | Food -> calories | **Build now**: typed/spoken food (and photo in live mode) becomes a *range*, a per-meal breakdown and a day total with a running calorie card; every item can be removed with one tap, and a soft reference target (default 1,800 kcal, editable) is shown with a "ask your doctor" note | Photo of a plate is exactly what typing replaces; D06/D11 mean never claim precision |
| F02 | Profile and goals | **Build now** (tiny) | Name + language only; goals are derived from behaviour, no BMI forms. Reference-image goals: **Never** (body-image risk, D09) |
| F03 | Activity tracking | **Build now**: steps, distance (km, estimated from steps) and walking minutes, by tap or voice | Core to the customer's doctor's advice; no wearable needed (D05) |
| F04 | Diet plan | **Later** | Needs dietitian review; a calorie-deficit plan for a 63-year-old is medical territory |
| F05 | Progress tracker | **Build now** (water/walk/food tiles) | Fasting tracker, supplements and reward points: **Never** (selling products to patients is a conflict of interest) |
| F06 | Sleep tracking | **Build now (manual)** | Two time pickers, one tap, 7-night chart; added after I judged that a fitness app without sleep and weight feels unfinished to users who already use other apps |
| F07 | Challenges, motivational videos | **Never** | Licensing (D09), and streak pressure is a known churn/guilt cause |
| F08 | AI health coach chatbot | **Build now, reshaped** | A floating bot button on the left of every screen opens "Buddy Guide", the AI assistant, a short-answer assistant that reads the user's own day; it is not an open chat, never diagnoses, and sends emergencies to 112 |
| F09 | Catch-up planning | **Build now, softened** | Missed walk shrinks tomorrow's goal instead of punishing |
| F10 | Reports | **Build now (minimal)** | One-tap WhatsApp daily summary instead of PDFs |
| F11 | Wearables | **Build now, limited and honest** | Connects to any device that shares the standard Bluetooth heart-rate signal (chest straps, watches with a heart-rate broadcast mode) via Web Bluetooth, Chrome on Android only. Apple Watch, Fitbit and Samsung do not share data with websites, so real support for them needs a native app or their cloud APIs. A demo mode shows the feature without a device (D05 stays true) |
| F12 | Subscription tiers | **Build now as a demo, with no real payments**: a permanent **Free plan (Rs 0, no card)** plus Monthly Rs 599, 6 months Rs 1,299, Yearly Rs 7,999. There is deliberately **no login**: the brief requires no sign-up, and accounts would put health data on a server (D07) | Reverses my earlier "Never". Kept safe by design: logging, rewards, digest and **all safety/emergency messages stay free**; Premium only lifts the free limits (5 AI questions a day, latest 3 saved walks). **Price warning:** as specified, yearly works out dearer per month (Rs 667) than monthly (Rs 599) and the 6-month plan (Rs 217); the app computes its "lowest per month" badge from the numbers instead of claiming yearly is best value. Evidence that would change my mind: if testers see the 5-question limit as unfair, or if Q1 shows price is a top reason for quitting (H2) |
| F13 | Free consultation | **Later** | Needs doctors and liability |
| F14 | Community activities | **Later** | Local partnerships can't be validated by one person |
| F15 | Emergency: hospital | **Build now, minimal** | Red flag shows 112/108; no hospital integration (liability) |
| F16 | Caretaker/nurse | **Never** | Marketplace and liability |
| F17 | Guardian access | **Build now, light** | WhatsApp share, no accounts; consent = she presses the button |
| F18 | Friends groups | **Never** | Competition/rating works against an older user's comfort |
| New | Dashboard (progress rings, 7-day chart, streak) | **Build now** | One glance answers "how am I doing?"; patterned on popular fitness apps, kept to four numbers |
| New | Right-hand menu (hamburger) + bottom tabs | **Build now** | Familiar navigation for people who already use phone apps; big targets |
| New | Personal data -> protein target | **Build now** | Range from age, weight and activity (0.8-1.0 g/kg under 65, 1.0-1.2 g/kg at 65+); hidden if the user says their doctor limited protein |
| New | Daily health digest | **Build now**, as *curated tips*, not news | 31 general tips, 3 a day, reordered by what the user is behind on; I cannot vouch for live news feeds, so I did not fake one |
| New | Voice input | **Build now** | Research hypothesis: typing is the barrier |
| New | Walk map (GPS route, distance, time, steps) | **Build now** | The brief asked for it; GPS fixes are filtered (accuracy, jitter, jumps) and routes are stored only on the phone; a made-up demo walk is provided for desks and reviewers |
| New | Rewards: 10,000 steps a day = 100 points, streak bonuses, badges | **Build now** | Points can only be spent on in-app Premium days (no cash value, no partner discounts, which I cut with F05). 10,000 is shown as a popular target, not a medical one; the adaptive daily goal still follows the person's real week |
| New | Workouts + weekly active minutes | **Build now** | Yoga, gardening, cycling and more with a rough calorie estimate (MET x kg x hours); progress toward the WHO 150 minutes a week. Minutes from steps are estimates |
| New | Weight log with trend | **Build now** | Trend not single readings; no BMI categories and no weight-loss advice; updates protein and calorie estimates |
| New | Emergency contact + one-tap 112 | **Build now** | The cheap, safe version of F15 and F16: a phone link, no hospital integration or liability |
| New | Backup, restore and CSV export | **Build now** | There is no login and no server, so a lost phone would mean lost data. The restore treats the file as untrusted: whitelisted fields, range checks, size limits |
| New | Water tracker (tap +/- glass) | **Build now** | Doctor's advice for the customer; one tap beats typing |
| New | AI assistant chat (multi-turn, tool-using agent) | **Build now** | Answers questions about her own day; refuses medical/medicine questions |
| New | BP / sugar logging with doctor-alerts | **Build now** | Customer's real routine; thresholds are conservative and non-diagnostic |
| New | Medication reminders | **Later** | Safety-critical; must not be built carelessly |

**Core experience.** *First two minutes:* open link -> name (optional) + language -> tap an example chip or speak "2 roti, dal, ek glass paani" -> see it logged with a rough range and one question if unsure. *Normal day:* the card at the top says the one thing worth doing now; she speaks after meals; walking goal follows her real week; one tap shares the day with her son.

Screenshots: `docs/screenshots/` (1-welcome, 2-daily, 3-red-flag, 4-english).

**Three hardest calls.**
1. *Chatbot vs. one input box.* Weighed flexibility against the verbosity risk (H4) and confusion for a 63-year-old. Chose one box + <= 2-sentence replies. **Would change if** testers keep asking follow-up questions the box can't answer.
2. *Safety by code, not by model.* Weighed a smarter model-only approach against its non-determinism. Chose regex-first, model-escalate-only, accepting false alarms and misses on unusual phrasing (case 14 shows the risk). **Would change if** live tests show frequent false alarms that make users ignore the red message.
3. *No accounts, data stays on the phone.* Weighed multi-device sync and family dashboards against the brief's no-sign-up rule and privacy (D07). Chose localStorage + share button. **Would change if** the family-caregiver need turns out to be the stronger customer in Q1.

**Privacy note for location (D07).** Walk routes are the most sensitive data in the app. They are requested only when the user taps Start, are never sent to a server, are stored on the phone only, and are removed by "Erase all my notes". The map picture itself loads from OpenStreetMap, which sees tile requests but not the route.

## Q5. Build it (14)
- **Live link:** `TODO`. Static UI + `api/coach.js`; key only in host env; demo mode when no key/connectivity (D08).
- **Safety/licensing:** made-up data only; "not medical advice" banner always visible; no third-party assets.
- **Screenshots of live AI:** `TODO` (add after deploying with a key).

### User test (must be done with a real person from the target group)
| Item | Notes |
|---|---|
| Who (initials, age, relation to customer) | TODO |
| What they did, in order | TODO |
| What confused them | TODO |
| What I changed | TODO |

*Things worth watching for:* whether she finds the mic, whether she trusts "rough range", whether the red-flag text reads as scary or helpful, whether Devanagari dictation works on her phone.

## Declaration and AI-use disclosure
**AI use:** An AI coding assistant (Claude Code) wrote the first draft of the code, tests and this report skeleton. I `TODO: describe what you read, changed, ran and decided yourself.`

**Student declaration:** `TODO: copy the declaration from the starter template, sign and date.`

## References
`TODO: >= 2 published sources, plus review sources.`
