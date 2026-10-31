// node tests/run-community.js -> friend links (hostile input), ranking, challenges, backup of community data
const C = require('../community.js'), F = require('../fit.js'), P = require('../plans.js');
let pass = 0, total = 0;
const ok = (n, c) => { total++; pass += !!c; console.log(`${c ? 'pass' : 'FAIL'} | ${n}`); };
const NOW = Date.UTC(2026, 10, 3, 12);
const tok = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

// ---- friend links ----
const t = C.encodeShare({ name: 'Ravi', week: 52300, best: 11200, streak: 3, ts: NOW });
ok('link token is URL-safe (no + / = characters) and short', /^[A-Za-z0-9_-]+$/.test(t) && t.length < 200);
let r = C.decodeShare(t, NOW);
ok('round trip keeps name, week, best, streak, time', r.ok && r.friend.name === 'Ravi' && r.friend.week === 52300 && r.friend.best === 11200 && r.friend.streak === 3 && r.friend.ts === NOW);
ok('link contains ONLY those five things (nothing else leaks)', Object.keys(JSON.parse(Buffer.from(t, 'base64url').toString())).sort().join() === 'b,n,s,t,v,w');
ok('names with accents or Hindi letters survive', C.decodeShare(C.encodeShare({ name: 'Zoë Ṣ', week: 1, best: 1, streak: 0, ts: NOW }), NOW).friend.name === 'Zoë Ṣ');
ok('control characters become spaces and < > are removed from names', C.decodeShare(C.encodeShare({ name: '<img src=x>\n\tAnu', week: 1, best: 1, streak: 0, ts: NOW }), NOW).friend.name === 'img src=x Anu');
ok('cutting a long name never leaves trailing spaces', C.decodeShare(C.encodeShare({ name: 'Abcdefghij Klmnopqrs Tuv', week: 1, best: 1, streak: 0, ts: NOW }), NOW).friend.name === 'Abcdefghij Klmnopqrs');
ok('long names are cut to 20 characters', C.decodeShare(C.encodeShare({ name: 'x'.repeat(100), week: 1, best: 1, streak: 0, ts: NOW }), NOW).friend.name.length === 20);
const bad = [
  ['empty / not a string', ''], ['spaces and symbols', 'abc def!<script>'], ['not base64 JSON', 'aGVsbG8'], ['huge token', 'A'.repeat(601)],
  ['wrong version', tok({ v: 2, n: 'A', w: 1, b: 1, s: 0, t: NOW })], ['negative steps', tok({ v: 1, n: 'A', w: -5, b: 0, s: 0, t: NOW })],
  ['absurd steps (1e9)', tok({ v: 1, n: 'A', w: 1e9, b: 1, s: 0, t: NOW })], ['best day bigger than the week', tok({ v: 1, n: 'A', w: 100, b: 5000, s: 0, t: NOW })],
  ['text instead of numbers', tok({ v: 1, n: 'A', w: 'lots', b: 1, s: 0, t: NOW })], ['missing name', tok({ v: 1, w: 1, b: 1, s: 0, t: NOW })],
  ['time far in the future', tok({ v: 1, n: 'A', w: 1, b: 1, s: 0, t: NOW + 400 * 86400000 })], ['an array', tok([1, 2, 3])], ['null', tok(null)],
];
bad.forEach(([n, x]) => ok('rejected: ' + n, !C.decodeShare(x, NOW).ok));
ok('invalid UTF-8 inside the link is rejected', !C.decodeShare(Buffer.from([0xff, 0xfe, 0xfd]).toString('base64url'), NOW).ok);
const pol = C.decodeShare(Buffer.from('{"v":1,"n":"A","w":1,"b":1,"s":0,"t":' + NOW + ',"__proto__":{"polluted":1},"constructor":{"prototype":{"x":1}}}').toString('base64url'), NOW);
ok('__proto__ / constructor keys in a link do not pollute anything', pol.ok && ({}).polluted === undefined && ({}).x === undefined && pol.friend.polluted === undefined);

// ---- ranking ----
const rk = C.rank([{ name: 'A', week: 100 }, { name: 'B', week: 300 }, { name: 'Me', week: 300, you: true }, { name: 'C', week: 50 }]);
ok('ranking: highest first, ties share a rank, you listed first among equals', rk.map((x) => x.name).join() === 'Me,B,A,C' && rk.map((x) => x.rank).join() === '1,1,3,4');
ok('time-ago wording', C.timeAgo(NOW, NOW) === 'today' && C.timeAgo(NOW - 86400000, NOW) === 'yesterday' && C.timeAgo(NOW - 3 * 86400000, NOW) === '3 days ago' && C.timeAgo(NOW - 90 * 86400000, NOW) === 'over a month ago');

// ---- challenges ----
const byId = Object.fromEntries(C.CHALLENGES.map((c) => [c.id, c]));
const days = (arr, start) => { const m = {}; arr.forEach((v, i) => { m[C.keyOf(C.dayNum(start) + i)] = v; }); return (k) => m[k] || {}; };
let p = C.challengeProgress(byId.steps5k, '2026-11-01', '2026-11-07', days(Array(7).fill({ steps: 5000 }), '2026-11-01'));
ok('5,000 steps x 7 days: complete when every day hits (exactly 5,000 counts)', p.complete && p.hits === 7 && p.pct === 1);
p = C.challengeProgress(byId.steps5k, '2026-11-01', '2026-11-07', days([{ steps: 6000 }, { steps: 4999 }, ...Array(5).fill({ steps: 9000 })], '2026-11-01'));
ok('one day at 4,999 steps => not complete (6 of 7), and it is now impossible to finish: marked expired', !p.complete && p.hits === 6 && p.expired);
p = C.challengeProgress(byId.steps5k, '2026-11-01', '2026-11-03', days(Array(3).fill({ steps: 5000 }), '2026-11-01'));
ok('mid-challenge: 3 of 7 done, 4 days left, not expired', !p.complete && p.hits === 3 && p.daysLeft === 4 && !p.expired);
p = C.challengeProgress(byId.steps10k, '2026-11-01', '2026-11-04', days([{ steps: 10500 }, { steps: 200 }, { steps: 10000 }, { steps: 12000 }], '2026-11-01'));
ok('10,000 steps on any 3 days: completes early on day 4 (days need not be in a row)', p.complete && p.hits === 3);
p = C.challengeProgress(byId.active150, '2026-11-01', '2026-11-05', days([{ active: 40 }, { active: 50 }, { active: 30 }, { active: 20 }, { active: 15 }], '2026-11-01'));
ok('150 active minutes: totals across days (155 >= 150), progress capped at 100%', p.complete && p.progress === 150 && p.pct === 1);
p = C.challengeProgress(byId.water6, '2026-11-05', '2026-11-03', () => ({ water: 9 }));
ok('a challenge that starts in the future has made no progress', p.elapsed === 0 && p.hits === 0 && !p.complete);
p = C.challengeProgress(byId.water6, '2026-11-01', '2026-11-30', () => ({}));
ok('long after the window: expired, and days beyond the window are not counted', p.expired && p.elapsed === 7);
ok('every challenge has an id, label, metric and sensible numbers', C.CHALLENGES.every((c) => c.id && c.label && ['steps', 'active', 'water'].includes(c.metric) && c.need > 0 && c.threshold > 0 && c.window >= 3));
ok('date helpers round-trip and reject impossible dates', C.keyOf(C.dayNum('2026-11-03')) === '2026-11-03' && C.validKey('2026-11-03') && !C.validKey('2026-02-31') && !C.validKey('nope'));

// ---- backup keeps (and cleans) community data ----
const ids = C.CHALLENGES.map((c) => c.id), plans = P.PLANS.map((x) => x.id);
const good = { app: 'my-fitness-buddy', version: 1, data: { entries: [], friends: [{ id: 'f1', name: 'Ravi', week: 52300, best: 11200, streak: 3, ts: NOW }, { id: 'f2', name: 'Asha', week: 61200, best: 12400, streak: 5, ts: NOW, sample: true }],
  groups: [{ id: 'g1', name: 'Park walkers', kind: 'Walking', when: 'Mon-Sat 6:30 am', where: 'Society garden' }], challenge: { id: 'steps5k', startKey: '2026-11-01' }, challengeLog: [{ id: 'water6', doneKey: '2026-10-25' }] } };
let b = F.sanitizeBackup(JSON.stringify(good), plans, ids);
ok('genuine community data round-trips through backup', b.ok && b.state.friends.length === 2 && b.state.friends[1].sample === true && b.state.groups[0].kind === 'Walking' && b.state.challenge.id === 'steps5k' && b.state.challengeLog.length === 1);
const evil = { app: 'my-fitness-buddy', version: 1, data: { entries: [], friends: [{ name: '<b>x</b>', week: 5, best: 99, ts: NOW }, { name: 'Ok', week: 1e12, best: 1, ts: NOW }, { name: '', week: 1, best: 1, ts: NOW }, null, 'x', { name: 'Fine', week: 10, best: 5, streak: 9999, ts: NOW, __proto__: { p: 1 } }],
  groups: [{ name: '', kind: 'x' }, { name: 'G'.repeat(200), kind: 'Hacking', where: '<script>alert(1)</script>'.repeat(10) }], challenge: { id: 'free-premium', startKey: '2026-11-01' }, challengeLog: [{ id: 'nope', doneKey: 'x' }] } };
b = F.sanitizeBackup(evil, plans, ids);
ok('hostile friends are dropped (best>week, absurd, nameless, junk) and the rest cleaned', b.ok && b.state.friends.length === 1 && b.state.friends[0].name === 'Fine' && b.state.friends[0].streak === 0);
ok('hostile groups: nameless dropped, long text cut, unknown kind becomes Other, no angle brackets', b.state.groups.length === 1 && b.state.groups[0].name.length === 40 && b.state.groups[0].kind === 'Other' && b.state.groups[0].where.length === 60 && !/[<>]/.test(b.state.groups[0].where));
ok('unknown challenge ids are refused', b.state.challenge === null && b.state.challengeLog.length === 0);
b = F.sanitizeBackup({ app: 'my-fitness-buddy', version: 1, data: { entries: [], friends: new Array(500).fill({ name: 'A', week: 1, best: 1, ts: NOW }) } }, plans, ids);
ok('friend list is capped at 30', b.ok && b.state.friends.length === 30);
console.log(`\n${pass}/${total} passed`); if (pass !== total) process.exit(1);
