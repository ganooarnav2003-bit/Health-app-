// node tests/run-walk-plans.js  -> GPS route maths, plans/entitlements, 10,000-step rewards
const W = require('../walk.js'), P = require('../plans.js'), E = require('../engine.js');
let pass = 0, total = 0;
const ok = (name, c) => { total++; pass += !!c; console.log(`${c ? 'pass' : 'FAIL'} | ${name}`); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- GPS ----
const A = { lat: 15.5, lng: 73.8, ts: 0, acc: 5 };
const B = { lat: 15.5 + 0.001, lng: 73.8, ts: 60000, acc: 5 }; // ~111 m north
ok('haversine: 0.001 deg latitude is about 111 m', near(W.haversine(A, B), 111.2, 1));
ok('rejects poor accuracy (>50 m)', !W.accept(A, { ...B, acc: 120 }).ok && W.accept(A, { ...B, acc: 120 }).reason === 'accuracy');
ok('rejects GPS jitter (<4 m move)', W.accept(A, { lat: 15.50001, lng: 73.8, ts: 5000, acc: 5 }).reason === 'still');
ok('rejects teleport jumps (>4 m/s)', W.accept(A, { lat: 15.51, lng: 73.8, ts: 10000, acc: 5 }).reason === 'jump');
ok('accepts a normal walking step (111 m in 60 s)', W.accept(A, B).ok);
ok('accepts the first fix and rejects garbage', W.accept(null, A).ok && !W.accept(A, { lat: NaN, lng: 1 }).ok && !W.accept(A, { lat: 95, lng: 1, ts: 1 }).ok);
const demo = W.demoRoute(null, 120), st = W.stats(demo, demo[0].ts, demo[119].ts, E.STEP_KM);
ok('demo route is a plausible 0.9-1.8 km walk', st.km > 0.9 && st.km < 1.8);
ok('steps follow distance (km / 0.0007, within the 0.01 km rounding)', near(st.steps, st.km / E.STEP_KM, 8));
ok('every demo point passes the same filter a real walk would', demo.every((p, i) => i === 0 || W.accept(demo[i - 1], p).ok));
const ds = W.downsample(demo, 30);
ok('downsample keeps 30 points incl. first and last', ds.length === 30 && ds[0] === demo[0] && ds[29] === demo[119]);
ok('bounds wraps the route', (() => { const b = W.bounds(demo); return b[0][0] <= demo[0].lat && b[1][0] >= demo[30].lat; })());
ok('duration formatting', W.fmtDuration(65) === '1:05' && W.fmtDuration(3725) === '1:02:05');

// ---- plans ----
ok('plan prices exactly as specified: 599 / 1,299 / 7,999', P.PLANS.map((p) => p.price).join() === '599,1299,7999' && P.PLANS.map((p) => p.months).join() === '1,6,12');
ok('per-month: 599, 217, 667', P.PLANS.map(P.perMonth).join() === '599,217,667');
ok('best value is computed from prices (6 months with these numbers)', P.bestValueId() === 'half');
ok('price check flags yearly costing more per month than monthly AND 6-month', P.priceWarnings().length === 2);
const now = Date.UTC(2026, 10, 1);
ok('no plan => not premium', !P.isPremium(null, now) && !P.isPremium({ endsTs: now - 1 }, now));
const m = P.activate(null, 'monthly', now);
ok('monthly runs one calendar month', P.isPremium(m, now + 1000) && new Date(m.endsTs).getUTCMonth() === 11 && !P.isPremium(m, m.endsTs + 1));
const y = P.activate(null, 'yearly', now);
ok('yearly runs 12 months', new Date(y.endsTs).getUTCFullYear() === 2027 && new Date(y.endsTs).getUTCMonth() === 10);
const ext = P.activate(m, 'half', now + 86400000);
ok('buying while Premium extends from the end date (no days lost)', ext.endsTs === P.addMonths(m.endsTs, 6));
const rd = P.extendDays(null, 3, now);
ok('reward days extend Premium by exactly 3 days', rd.endsTs - now === 3 * 86400000 && rd.source === 'reward');

// ---- rewards ----
const day = (n) => { const d = new Date(Date.UTC(2026, 10, n)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
let r = P.rewardSummary({ [day(5)]: 9999 }, day(5), []);
ok('9,999 steps earns nothing; 1 step to go... (1 step left)', r.earned === 0 && r.toGo === 1 && !r.todayDone);
r = P.rewardSummary({ [day(5)]: 10000 }, day(5), []);
ok('exactly 10,000 steps earns 100 points and the first badge', r.earned === 100 && r.todayDone && r.badges[0].got);
r = P.rewardSummary({ [day(1)]: 10500, [day(2)]: 12000, [day(3)]: 10000 }, day(3), []);
ok('3 days in a row = 3x100 + 50 streak bonus = 350', r.earned === 350 && r.streak === 3 && r.badges[1].got);
r = P.rewardSummary({ [day(1)]: 10500, [day(2)]: 4000, [day(3)]: 10000 }, day(3), []);
ok('a missed day breaks the streak (no bonus)', r.earned === 200 && r.streak === 1 && r.best === 1);
const week = {}; for (let i = 1; i <= 7; i++) week[day(i)] = 10000;
r = P.rewardSummary(week, day(7), []);
ok('7-day run = 700 + 50 (day 3) + 150 (day 7) = 900', r.earned === 900 && r.badges[2].got && r.nextBonus === 30);
r = P.rewardSummary({ [day(1)]: 10000, [day(2)]: 10000 }, day(3), []);
ok('streak survives until the day ends (today not done yet)', r.streak === 2);
r = P.rewardSummary({ [day(1)]: 10000, [day(2)]: 10000, [day(3)]: 10000 }, day(5), []);
ok('...but not after a whole missed day', r.streak === 0 && r.best === 3);
r = P.rewardSummary(week, day(7), [{ cost: 300 }]);
ok('redeeming 300 points leaves 600', r.balance === 600 && r.spent === 300);
r = P.rewardSummary({ [day(1)]: 999999 }, day(1), []);
ok('daily steps are capped at 40,000 for rewards', r.todaySteps === 40000 && r.earned === 100);
ok('free tier limits are modest and emergency help is not among them', P.FREE.aiPerDay === 5 && P.FREE.walkHistory === 3 && !('safety' in P.FREE));
console.log(`\n${pass}/${total} passed`);
if (pass !== total) process.exit(1);
