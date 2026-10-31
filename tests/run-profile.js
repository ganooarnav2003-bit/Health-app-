// node tests/run-profile.js   -> protein/calorie maths, tips library sanity
const E = require('../engine.js'), T = require('../tips.js');
let pass = 0, total = 0;
const ok = (name, c) => { total++; pass += !!c; console.log(`${c ? 'pass' : 'FAIL'} | ${name}`); };

const a = E.proteinTarget({ age: 68, weightKg: 70, activity: 'light' });
ok('65+, 70 kg, light: 1.0-1.3 g/kg => 70-91 g', a.status === 'ok' && a.lo === 70 && a.hi === 91);
const b = E.proteinTarget({ age: 40, weightKg: 70, activity: 'low' });
ok('under 65, 70 kg, low: 0.8-1.0 g/kg => 56-70 g', b.lo === 56 && b.hi === 70);
ok('doctor-limited protein => no number', E.proteinTarget({ proteinLimit: true, age: 70, weightKg: 60 }).status === 'limited');
ok('missing data => need-data', E.proteinTarget({ age: 70 }).status === 'need-data' && E.proteinTarget({ age: 70, weightKg: 12 }).status === 'need-data');
ok('calorie reference (man, 68, 70 kg, 170 cm, low) = 1700', E.kcalReference({ age: 68, sex: 'male', weightKg: 70, heightCm: 170, activity: 'low' }) === 1700);
ok('calorie reference rejects nonsense input', E.kcalReference({ age: 68, weightKg: 70, heightCm: 20 }) === null);
const r = E.analyze('2 roti, dal and a katori curd', { lang: 'en' });
ok('protein from food: 2 roti + dal + curd = 14-21 g', Math.abs(r.meals.reduce((s, m) => s + m.protLo, 0) - 14) < 0.6 && Math.abs(r.meals.reduce((s, m) => s + m.protHi, 0) - 21) < 0.6);

const BAD = /(diagnos|cure|prescri|\bmg\b|guarantee|miracle)/i;
ok('every tip has category, title, body <= 230 chars', T.TIPS.every((t) => T.CATS[t.cat] && t.title && t.body && t.body.length <= 230));
ok('tip ids are unique', new Set(T.TIPS.map((t) => t.id)).size === T.TIPS.length);
ok('no diagnosis / cure / dose wording in tips', T.TIPS.every((t) => !BAD.test(t.title + ' ' + t.body)));
const d1 = T.pickDaily('2026-11-01', null, { water: 6 }), d1b = T.pickDaily('2026-11-01', null, { water: 6 }), d2 = T.pickDaily('2026-11-02', null, { water: 6 });
ok('daily pick is 3 unique tips and is stable for a date', d1.length === 3 && new Set(d1.map((t) => t.id)).size === 3 && JSON.stringify(d1) === JSON.stringify(d1b));
ok('a different day gives a different digest', JSON.stringify(d1.map((t) => t.id)) !== JSON.stringify(d2.map((t) => t.id)));
const low = T.pickDaily('2026-11-03', { water: 0, steps: 5000, protLo: 0, protHi: 0, meals: [] }, { water: 6, steps: 6000 });
ok('low water today => hydration tip comes first, with a reason', low[0].cat === 'water' && /water is low/.test(low[0].why));
const lowP = T.pickDaily('2026-11-03', { water: 6, steps: 6000, protLo: 5, protHi: 8, meals: [{}] }, { water: 6, steps: 6000, protein: { status: 'ok', lo: 70, hi: 91 } });
ok('low protein => protein tip first', lowP[0].cat === 'protein');
console.log(`\n${pass}/${total} passed`);
