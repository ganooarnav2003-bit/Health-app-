// node tests/run-lang-engine.js -> the engine in English, Hindi (Devanagari) and Hinglish (Roman)
const E = require('../engine.js');
let pass = 0, total = 0; const ok = (n, c, d) => { total++; pass += !!c; console.log(`${c ? 'pass' : 'FAIL'} | ${n}${!c && d ? '\n        ' + d : ''}`); };
const DEV = /[ऀ-ॿ]/, NOW = '2026-11-03T13:00:00';
const isHi = (t) => DEV.test(t), isHg = (t) => !DEV.test(t) && /[A-Za-z]/.test(t);

// ---- replies to logged food: same facts, three languages ----
const en = E.analyze('2 roti, dal, 3 glasses of water, 20 minute walk', { lang: 'en', now: NOW }), hi = E.analyze('2 roti, dal, 3 glasses of water, 20 minute walk', { lang: 'hi', now: NOW }), hg = E.analyze('2 roti, dal, 3 glasses of water, 20 minute walk', { lang: 'hg', now: NOW });
console.log('   en:', en.reply, '\n   hi:', hi.reply, '\n   hg:', hg.reply);
ok('the logged data is identical in every language', JSON.stringify([en.meals.length, en.water, en.walkMin, en.steps]) === JSON.stringify([hi.meals.length, hi.water, hi.walkMin, hi.steps]) && JSON.stringify([en.water, en.walkMin]) === JSON.stringify([hg.water, hg.walkMin]));
ok('Hindi reply is in Devanagari and names the foods in Hindi (रोटी, दाल, पानी, सैर)', isHi(hi.reply) && /रोटी/.test(hi.reply) && /दाल/.test(hi.reply) && /3 गिलास पानी/.test(hi.reply) && /सैर 20 मिनट/.test(hi.reply));
ok('Hinglish reply is Roman letters only (roti, dal, paani, kadam)', isHg(hg.reply) && /Likh liya/.test(hg.reply) && /3 glass paani/.test(hg.reply) && /kadam/.test(hg.reply));
ok('English reply is unchanged ("Logged: 2 roti, dal ...")', /^Logged: 2 roti, dal \(~/.test(en.reply) && /3 glasses of water/.test(en.reply));
ok('the numbers (kcal and protein ranges) are the same in all three', (en.reply.match(/~(\d+)-(\d+) kcal/) || []).slice(1).join() === (hi.reply.match(/~(\d+)-(\d+) kcal/) || []).slice(1).join() && (en.reply.match(/~(\d+)-(\d+) kcal/) || []).slice(1).join() === (hg.reply.match(/~(\d+)-(\d+) kcal/) || []).slice(1).join());
// typing in Hindi / Hinglish / Devanagari works in any app language
const mix = [['आज दो रोटी और दाल खाई, तीन गिलास पानी पिया', 'hi'], ['aaj 2 roti aur dal khayi, teen glass paani piya', 'hg'], ['two roti and dal, three glasses of water', 'en']].map(([t, l]) => E.analyze(t, { lang: l, now: NOW }));
ok('input in Devanagari, Hinglish and English all give roti x2, dal and 3 glasses', mix.every((r) => r.meals.some((m) => m.name === 'roti' && m.qty === 2) && r.meals.some((m) => m.name === 'dal') && r.water === 3));

// ---- clarifying questions and unknown food ----
['hi', 'hg'].forEach((l) => {
  const t = E.analyze('thali khayi aaj lunch me', { lang: l, now: NOW }), p = E.analyze('ate a whole pizza', { lang: l, now: NOW }), u = E.analyze('I had lunch at the club', { lang: l, now: NOW });
  const right = l === 'hi' ? isHi : isHg;
  ok(`[${l}] thali question, whole-pizza check and unknown-food prompt are in the right script`, right(t.clarify) && right(p.clarify) && right(u.clarify) && /8/.test(p.clarify), [t.clarify, p.clarify, u.clarify].join(' | '));
});

// ---- SAFETY: every message, every language, must carry the emergency numbers ----
const red = ['seene mein dard ho raha hai aur saans phool rahi hai', 'chest pain and breathless', 'सीने में दर्द है और साँस फूल रही है'];
['en', 'hi', 'hg'].forEach((l) => red.forEach((t) => {
  const r = E.analyze(t, { lang: l, now: NOW });
  ok(`[${l}] red flag "${t.slice(0, 28)}…" => emergency message with 112 and 108, right script`, r.safety.level === 'red' && /112/.test(r.reply) && /108/.test(r.reply) && (l === 'en' || (l === 'hi' ? isHi(r.reply) : isHg(r.reply))));
}));
['en', 'hi', 'hg'].forEach((l) => {
  const m = E.safetyMessage({ level: 'red', reasons: ['mental'] }, l), md = E.safetyMessage({ level: 'amber', kind: 'med', reasons: [] }, l), am = E.safetyMessage({ level: 'amber', kind: 'pain', reasons: [] }, l);
  ok(`[${l}] self-harm message gives Tele-MANAS 14416 and 112; medicine and doctor messages exist`, /14416/.test(m) && /112/.test(m) && md && am && md !== am);
});
ok('Hindi medicine question is refused (दवाई बंद करूँ?)', E.analyze('क्या मैं अपनी दवाई बंद कर दूँ?', { lang: 'hi', now: NOW }).safety.kind === 'med');
ok('Hindi negation: "सीने में दर्द नहीं है, बस थकान है" is NOT an alarm (level none)', E.analyze('सीने में दर्द नहीं है, बस थकान है', { lang: 'hi', now: NOW }).safety.level === 'none');
ok('...but "सीने में दर्द है" (chest pain) still IS an emergency', E.analyze('सीने में दर्द है', { lang: 'hi', now: NOW }).safety.level === 'red');
ok('Hinglish "chest pain nahi hai" is not an alarm, "seene mein dard hai" is', E.analyze('chest pain nahi hai', { lang: 'hg', now: NOW }).safety.level === 'none' && E.analyze('seene mein dard hai', { lang: 'hg', now: NOW }).safety.level === 'red');
ok('"कोई दर्द नहीं" (no pain at all) and "no chest pain" are not alarms', E.analyze('कोई दर्द नहीं है', { lang: 'hi', now: NOW }).safety.level === 'none' && E.analyze('no chest pain today', { lang: 'en', now: NOW }).safety.level === 'none');
ok('AI replies containing Hindi diagnosis/dose wording are blocked by the guardrail', E.guardrail('आपको डायबिटीज है, दवा बढ़ा दीजिए') === null && E.guardrail('आज आपने अच्छी सैर की') !== null);

// ---- safety probes: wording variants that must (or must not) raise an alarm ----
const PROBES = [['no chest pain', 'none'], ['no chest pain today', 'none'], ['not feeling any pain', 'none'], ['there is no chest pain', 'none'], ['कोई दर्द नहीं है', 'none'], ['pain nahi hai', 'none'], ['chest pain nahi hai, bas thoda thaka hua hoon', 'none'],
  ['not feeling well chest pain', 'red'], ['not feeling well, chest pain', 'red'], ['no appetite and chest pain', 'red'], ['I have chest pain', 'red'], ['सीने में दर्द है', 'red'], ['seene mein dard hai', 'red'],
  ['my knee pain is bad', 'amber'], ['no sleep, knee pain', 'amber'], ['can not breathe properly', 'red'], ['I cannot breathe', 'red'], ['cant breathe', 'red'], ['unable to breathe', 'red'], ['it is hard to breathe', 'red'],
  ['struggling to breathe', 'red'], ['dam ghut raha hai', 'red'], ['दम घुट रहा है', 'red'], ['साँस नहीं आ रही', 'red'], ['saans lene mein takleef', 'red'], ['behosh ho gaya', 'red'], ['बेहोश हो गईं', 'red'], ['fainted this morning', 'red'],
  ['sugar 54', 'red'], ['BP 190/120', 'red'], ['BP 130/85', 'none'], ['I want to die', 'red'], ['jeene ka mann nahi', 'red']];
const probeBad = PROBES.filter(([t, w]) => E.assessSafety(t).level !== w).map(([t, w]) => `"${t}" gave ${E.assessSafety(t).level}, wanted ${w}`);
ok(`${PROBES.length} wording variants raise exactly the right alarm level (English, Hindi, Hinglish)`, probeBad.length === 0, probeBad.join('\n        '));

// ---- nudges ----
const nud = ['breakfast', 'walkSkippedToday', 'protein', 'dinner', 'good'];
const sum0 = E.summarize([]);
const n1 = E.nudge(new Date('2026-11-03T08:00:00'), sum0, { water: 6, walk: 20, walkBase: 20 }, []), n2 = E.nudge(new Date('2026-11-03T12:00:00'), { ...sum0, entries: 1, water: 0 }, { water: 6, walk: 20, walkBase: 20 }, []);
ok('nudges carry all three languages in the right scripts', [n1, n2].every((n) => n.en && isHi(n.hi) && isHg(n.hg)));

// ---- chat: the SAME question in 3 languages lands on the SAME topic and answers in the asked language ----
const ctx = (lang) => ({ lang, summary: { water: 2, walkMin: 10, steps: 1000, km: 0.7, kcalLo: 240, kcalHi: 350, protLo: 14, protHi: 21, meals: ['roti'] }, goals: { water: 6, walk: 15, steps: 1500, km: 1.05, kcal: 1800, protein: E.proteinTarget({ age: 68, weightKg: 70, activity: 'light' }) } });
const Qs = [
  ['today', 'How am I doing today?', 'आज मेरा दिन कैसा रहा?', 'Aaj mera din kaisa raha?'],
  ['protein', 'How much protein do I need?', 'मुझे कितना प्रोटीन चाहिए?', 'Mujhe kitna protein chahiye?'],
  ['distance', 'How far did I walk?', 'मैं कितना चला?', 'Main kitna chala?'],
  ['food', 'What should I eat tonight?', 'आज रात क्या खाना चाहिए?', 'Aaj raat kya khana chahiye?'],
  ['medicine', 'Should I stop my tablet?', 'क्या मैं अपनी गोली बंद कर दूँ?', 'Kya main apni goli band kar doon?'],
  ['water', 'How much water should I drink?', 'मुझे कितना पानी पीना चाहिए?', 'Mujhe kitna paani peena chahiye?'],
  ['sleep', 'How can I sleep better?', 'मैं बेहतर नींद कैसे लूँ?', 'Main behtar neend kaise loon?'],
  ['condition', 'Do I have diabetes?', 'क्या मुझे डायबिटीज़ है?', 'Kya mujhe diabetes hai?'],
  ['calories', 'How many calories have I had today?', 'आज मैंने कितनी कैलोरी खाई?', 'Aaj maine kitni calories khayi?'],
  ['walk', 'How should I walk?', 'मुझे कैसे टहलना चाहिए?', 'Mujhe kaise tehalna chahiye?'],
];
Qs.forEach(([topic, qe, qh, qg]) => {
  const re = E.answerQuery(qe, ctx('en')), rh = E.answerQuery(qh, ctx('hi')), rg = E.answerQuery(qg, ctx('hg'));
  ok(`topic "${topic}": English, Hindi and Hinglish questions all reach it, and each is answered in its own script`, re.topic === topic && rh.topic === topic && rg.topic === topic && isHi(rh.answer) && isHg(rg.answer) && !DEV.test(re.answer), `${re.topic}/${rh.topic}/${rg.topic}`);
});
const hiToday = E.answerQuery('आज मेरा दिन कैसा रहा?', ctx('hi')).answer;
ok('answers use the real numbers (water 2 of 6, 10 of 15 minutes, 1000 steps)', /6 में से 2 गिलास/.test(hiToday) && /15 में से 10 मिनट/.test(hiToday) && /1000 कदम/.test(hiToday));
ok('asking in Hindi while the app is in English still answers in English (the app language decides)', !DEV.test(E.answerQuery('मुझे कितना पानी पीना चाहिए?', ctx('en')).answer));
ok('chest pain asked in Hindi gives the emergency answer', E.answerQuery('मुझे सीने में दर्द है', ctx('hi')).safety.level === 'red' && /112/.test(E.answerQuery('मुझे सीने में दर्द है', ctx('hi')).answer));
['hi', 'hg'].forEach((l) => ok(`[${l}] unknown question gets the "ask your doctor" fallback in the right script`, (l === 'hi' ? isHi : isHg)(E.answerQuery('what is the capital of France', ctx(l)).answer) && E.answerQuery('what is the capital of France', ctx(l)).topic === 'other'));
ok('English answers are untouched by this change (spot check)', /^Today: water 2 of 6 glasses/.test(E.answerQuery('How am I doing today?', ctx('en')).answer));

// ---- family summary ----
const fs = (l) => E.familySummary('Sunita', { ...sum0, water: 3, walkMin: 20, steps: 2000, km: 1.4, kcalLo: 500, kcalHi: 700, protLo: 20, protHi: 28, meals: [1, 2], flags: [] }, { water: 6, walk: 20 }, l);
ok('family summary: 3 languages, right scripts, name kept, safety footer present', /Sunita's day/.test(fs('en')) && isHi(fs('hi')) && /Sunita/.test(fs('hi')) && isHg(fs('hg')) && /Sunita ka din/.test(fs('hg')) && /not medical advice/.test(fs('en')) && /चिकित्सा सलाह नहीं/.test(fs('hi')) && /medical salah nahi/.test(fs('hg')));

// ---- food names table ----
const rows = E.foodRows();
ok('every food the parser knows has a Hindi and a Hinglish name', E.FOODS.every((f) => rows.some((r) => r[0] === f.name && isHi(r[1]) && r[2])), E.FOODS.filter((f) => !rows.some((r) => r[0] === f.name)).map((f) => f.name).join(','));
console.log(`\n${pass}/${total} passed`); if (pass !== total) process.exit(1);
