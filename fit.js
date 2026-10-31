/*
 * Workouts, sleep, weight, CSV export and backup validation. Pure functions (no DOM) so they can be tested in Node.
 * Calorie burn is a rough estimate (MET x kg x hours). It is never medical or dietary advice.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HealthFit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ACTIVITIES = [
    { id: 'yoga', label: 'Yoga / stretching', met: 2.5 },
    { id: 'strength', label: 'Chair or strength exercises', met: 3.0 },
    { id: 'garden', label: 'Gardening', met: 3.5 },
    { id: 'walk', label: 'Brisk walk', met: 3.5 },
    { id: 'cycle', label: 'Cycling (easy)', met: 4.0 },
    { id: 'dance', label: 'Dancing', met: 4.5 },
    { id: 'swim', label: 'Swimming (easy)', met: 5.5 },
    { id: 'other', label: 'Other activity', met: 3.0 },
  ];
  const WEEKLY_ACTIVE_GOAL = 150; // minutes; WHO suggests at least 150 min of moderate activity a week for adults
  const DEFAULT_KG = 65;

  const inRange = (v, lo, hi) => Number.isFinite(+v) && +v >= lo && +v <= hi;
  const validMinutes = (m) => inRange(m, 1, 300) && Number.isInteger(+m);
  const validKg = (k) => inRange(k, 30, 250);
  const burnKcal = (met, minutes, kg) => Math.round(met * (validKg(kg) ? +kg : DEFAULT_KG) * (minutes / 60));

  // "22:30" -> minutes since midnight, or null
  const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); if (!m) return null; const h = +m[1], mi = +m[2]; return h < 24 && mi < 60 ? h * 60 + mi : null; };
  // Hours slept between bedtime and wake time, across midnight. null if equal/invalid or outside 1-16 h.
  function sleepHours(bed, wake) {
    const b = hm(bed), w = hm(wake); if (b == null || w == null || b === w) return null;
    let d = w - b; if (d < 0) d += 1440;
    const h = Math.round((d / 60) * 10) / 10;
    return h >= 1 && h <= 16 ? h : null;
  }
  const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);

  // list: [{ ts, kg }] in any order -> { latest, first, change, count }
  function weightStats(list) {
    const l = (list || []).filter((x) => validKg(x.kg)).sort((a, b) => a.ts - b.ts);
    if (!l.length) return null;
    const first = l[0].kg, latest = l[l.length - 1].kg;
    return { latest, first, change: Math.round((latest - first) * 10) / 10, count: l.length };
  }

  // ---- CSV (numbers and dates only, so there is nothing to inject) ----
  function toCSV(rows) {
    const head = ['date', 'steps', 'km', 'water_glasses', 'kcal_low', 'kcal_high', 'protein_low_g', 'protein_high_g', 'active_min', 'sleep_h', 'weight_kg'];
    const num = (v) => (Number.isFinite(+v) && v !== '' && v != null ? String(+v) : '');
    return [head.join(',')].concat(rows.map((r) => [String(r.date).replace(/[^0-9-]/g, ''), ...head.slice(1).map((k) => num(r[k]))].join(','))).join('\n') + '\n';
  }

  // ---- Backup import: treat the file as UNTRUSTED. Build a fresh object from a whitelist; never copy unknown keys. ----
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const nz = (v, lo, hi, d) => (inRange(v, lo, hi) ? +v : d);
  function cleanMeal(m) {
    if (!m || typeof m !== 'object') return null;
    return { name: str(m.name, 40) || 'food', qty: nz(m.qty, 0, 50, 1), unit: str(m.unit, 12), kcalLo: nz(m.kcalLo, 0, 5000, 0), kcalHi: nz(m.kcalHi, 0, 5000, 0), protLo: nz(m.protLo, 0, 300, 0), protHi: nz(m.protHi, 0, 300, 0),
      slot: ['breakfast', 'lunch', 'snack', 'dinner'].includes(m.slot) ? m.slot : 'snack', skipped: !!m.skipped, assumed: !!m.assumed, lowConf: !!m.lowConf };
  }
  function cleanEntry(e) {
    if (!e || typeof e !== 'object' || !inRange(e.ts, 946684800000, 4102444800000)) return null; // years 2000..2100
    const o = { id: str(String(e.id == null ? '' : e.id), 40) || String(e.ts), ts: +e.ts, text: str(e.text, 300), meals: [], water: nz(e.water, -20, 40, 0), walkMin: nz(e.walkMin, 0, 600, 0), steps: nz(e.steps, 0, 100000, 0), walkSkipped: !!e.walkSkipped,
      safety: { level: ['none', 'amber', 'red'].includes(e.safety && e.safety.level) ? e.safety.level : 'none', reasons: [] } };
    if (Array.isArray(e.meals)) o.meals = e.meals.slice(0, 30).map(cleanMeal).filter(Boolean);
    if (e.stepsEst) o.stepsEst = true; if (e.sample) o.sample = true; if (e.demo) o.demo = true;
    if (['water', 'steps', 'gps', 'workout', 'sleep', 'weight'].includes(e.quick)) o.quick = e.quick;
    if (e.bp && inRange(e.bp.s, 60, 280) && inRange(e.bp.d, 30, 180)) o.bp = { s: +e.bp.s, d: +e.bp.d };
    if (inRange(e.sugar, 20, 700)) o.sugar = +e.sugar;
    if (inRange(e.km, 0, 200)) o.km = +e.km;
    if (Array.isArray(e.route)) o.route = e.route.slice(0, 200).filter((p) => p && inRange(p.lat, -90, 90) && inRange(p.lng, -180, 180)).map((p) => ({ lat: +p.lat, lng: +p.lng }));
    if (typeof e.activity === 'string' && ACTIVITIES.some((a) => a.id === e.activity)) o.activity = e.activity;
    if (inRange(e.activeMin, 0, 600)) o.activeMin = +e.activeMin;
    if (inRange(e.burn, 0, 5000)) o.burn = +e.burn;
    if (inRange(e.sleepH, 0, 24)) o.sleepH = +e.sleepH;
    if (validKg(e.kg)) o.kg = +e.kg;
    if (e.hr && inRange(e.hr.avg, 30, 230) && inRange(e.hr.max, 30, 230)) o.hr = { avg: +e.hr.avg, max: +e.hr.max, min: nz(e.hr.min, 30, 230, +e.hr.avg), n: nz(e.hr.n, 0, 100000, 0) };
    return o;
  }
  function cleanProfile(p) {
    if (!p || typeof p !== 'object') return null;
    const o = { name: str(p.name, 30) };
    if (inRange(p.age, 18, 110)) o.age = +p.age;
    if (validKg(p.weightKg)) o.weightKg = +p.weightKg;
    if (inRange(p.heightCm, 100, 230)) o.heightCm = +p.heightCm;
    if (['male', 'female', ''].includes(p.sex)) o.sex = p.sex;
    if (['low', 'light', 'moderate'].includes(p.activity)) o.activity = p.activity;
    o.proteinLimit = !!p.proteinLimit;
    if (inRange(p.kcalGoal, 800, 4000)) o.kcalGoal = Math.round(+p.kcalGoal);
    if (p.emergency && typeof p.emergency === 'object') { const ph = str(p.emergency.phone, 20); if (isPhone(ph)) o.emergency = { name: str(p.emergency.name, 30), phone: ph }; }
    return o;
  }
  const isPhone = (s) => /^\+?[0-9][0-9 ()-]{5,17}$/.test(String(s || '').trim());
  const telHref = (s) => 'tel:' + String(s).replace(/[^0-9+]/g, '');

  const cleanLabel = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n).trim();
  const KINDS = ['Walking', 'Yoga', 'Cycling', 'Laughter club', 'Other'];
  const dateKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);
  function cleanFriend(f) {
    if (!f || typeof f !== 'object') return null;
    const name = cleanLabel(f.name, 20), week = inRange(f.week, 0, 280000) ? Math.round(+f.week) : null, best = inRange(f.best, 0, 40000) ? Math.round(+f.best) : null;
    if (!name || week == null || best == null || best > week || !inRange(f.ts, 946684800000, 4102444800000)) return null;
    return { id: cleanLabel(String(f.id == null ? '' : f.id), 40) || String(f.ts), name, week, best, streak: inRange(f.streak, 0, 400) ? Math.round(+f.streak) : 0, ts: +f.ts, sample: !!f.sample };
  }
  function cleanGroup(g) {
    if (!g || typeof g !== 'object') return null;
    const name = cleanLabel(g.name, 40); if (!name) return null;
    return { id: cleanLabel(String(g.id == null ? '' : g.id), 40) || name, name, kind: KINDS.includes(g.kind) ? g.kind : 'Other', when: cleanLabel(g.when, 40), where: cleanLabel(g.where, 60), sample: !!g.sample };
  }

  // Returns { ok:true, state } or { ok:false, error }. planIds: allowed plan ids. challengeIds: allowed challenge ids.
  function sanitizeBackup(raw, planIds, challengeIds) {
    let obj; try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return { ok: false, error: 'That file is not a valid backup (it could not be read).' }; }
    if (!obj || typeof obj !== 'object' || obj.app !== 'my-fitness-buddy' || obj.version !== 1 || !obj.data || typeof obj.data !== 'object') return { ok: false, error: 'That file is not a My Fitness Buddy backup.' };
    const d = obj.data;
    if (!Array.isArray(d.entries) || d.entries.length > 5000) return { ok: false, error: 'The backup has too many or unreadable notes.' };
    const state = { profile: cleanProfile(d.profile) || { name: '' }, entries: d.entries.map(cleanEntry).filter(Boolean), chat: [], plan: null, redeemed: [], ai: null, friends: [], groups: [], challenge: null, challengeLog: [] };
    if (Array.isArray(d.friends)) state.friends = d.friends.slice(0, 30).map(cleanFriend).filter(Boolean);
    if (Array.isArray(d.groups)) state.groups = d.groups.slice(0, 20).map(cleanGroup).filter(Boolean);
    if (d.challenge && typeof d.challenge === 'object' && (challengeIds || []).includes(d.challenge.id) && dateKey(d.challenge.startKey)) state.challenge = { id: d.challenge.id, startKey: d.challenge.startKey };
    if (Array.isArray(d.challengeLog)) state.challengeLog = d.challengeLog.slice(-50).filter((c) => c && (challengeIds || []).includes(c.id) && dateKey(c.doneKey)).map((c) => ({ id: c.id, doneKey: c.doneKey }));
    if (Array.isArray(d.chat)) state.chat = d.chat.slice(-30).filter((m) => m && (m.role === 'user' || m.role === 'assistant')).map((m) => ({ role: m.role, content: str(m.content, 600), level: ['red', 'amber'].includes(m.level) ? m.level : undefined }));
    if (d.plan && typeof d.plan === 'object' && (planIds || []).concat('reward').includes(d.plan.planId) && inRange(d.plan.startedTs, 0, 4102444800000) && inRange(d.plan.endsTs, 0, 4102444800000)) state.plan = { planId: d.plan.planId, startedTs: +d.plan.startedTs, endsTs: +d.plan.endsTs, source: d.plan.source === 'reward' ? 'reward' : 'demo' };
    if (Array.isArray(d.redeemed)) state.redeemed = d.redeemed.slice(0, 200).filter((r) => r && inRange(r.cost, 0, 100000)).map((r) => ({ ts: nz(r.ts, 0, 4102444800000, 0), cost: +r.cost, label: str(r.label, 40), days: nz(r.days, 0, 400, 0) }));
    if (d.ai && typeof d.ai === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(d.ai.day) && inRange(d.ai.n, 0, 1000)) state.ai = { day: d.ai.day, n: +d.ai.n };
    return { ok: true, state, dropped: d.entries.length - state.entries.length };
  }

  return { ACTIVITIES, WEEKLY_ACTIVE_GOAL, DEFAULT_KG, validMinutes, validKg, burnKcal, sleepHours, avg, weightStats, toCSV, sanitizeBackup, isPhone, telHref };
});
