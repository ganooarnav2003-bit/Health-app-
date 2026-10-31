/*
 * Community without a server. There are NO public posts and NO strangers.
 *  - Friends board: you choose to share a small snapshot (first name + step totals) as a link; a friend opens it and
 *    chooses to add you. Numbers are not verified, so it is for fun between people who know each other.
 *  - Challenges: judged only from your own on-phone data.
 * A link is untrusted input: everything is length- and range-checked before it is shown, and shown as plain text.
 * Pure functions (no DOM) so they can be tested in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HealthCommunity = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DAY = 86400000, MAX_LINK = 600;
  const LIMITS = { weekMax: 280000, bestMax: 40000, streakMax: 400, nameMax: 20, friendsMax: 30, groupsMax: 20 };
  const GROUP_KINDS = ['Walking', 'Yoga', 'Cycling', 'Laughter club', 'Other'];

  const CHALLENGES = [
    { id: 'steps5k', label: '5,000 steps every day for 7 days', metric: 'steps', threshold: 5000, mode: 'days', need: 7, window: 7, unit: 'days' },
    { id: 'steps10k', label: '10,000 steps on 3 days this week', metric: 'steps', threshold: 10000, mode: 'days', need: 3, window: 7, unit: 'days' },
    { id: 'active150', label: '150 active minutes in 7 days', metric: 'active', threshold: 150, mode: 'total', need: 150, window: 7, unit: 'minutes' },
    { id: 'water6', label: '6 glasses of water on 5 of 7 days', metric: 'water', threshold: 6, mode: 'days', need: 5, window: 7, unit: 'days' },
  ];

  // ---- date helpers (UTC day numbers, so there are no time-zone surprises) ----
  const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / DAY); };
  const keyOf = (n) => { const d = new Date(n * DAY); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
  const validKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && keyOf(dayNum(k)) === k;

  // ---- share link payload ----
  const b64u = (bytes) => { let s = ''; bytes.forEach((c) => (s += String.fromCharCode(c))); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  const cleanName = (n) => String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.nameMax).trim();
  const int = (v, lo, hi) => (Number.isFinite(+v) && +v >= lo && +v <= hi ? Math.round(+v) : null);

  function encodeShare(f) {
    const p = { v: 1, n: cleanName(f.name) || 'Friend', w: int(f.week, 0, LIMITS.weekMax) || 0, b: int(f.best, 0, LIMITS.bestMax) || 0, s: int(f.streak, 0, LIMITS.streakMax) || 0, t: int(f.ts, 946684800000, 4102444800000) || Date.now() };
    return b64u(new TextEncoder().encode(JSON.stringify(p)));
  }
  // Returns { ok:true, friend } or { ok:false, error }.
  function decodeShare(token, now) {
    now = now == null ? Date.now() : now;
    if (typeof token !== 'string' || !token || token.length > MAX_LINK || !/^[A-Za-z0-9_-]+$/.test(token)) return { ok: false, error: 'That link is not a valid friend link.' };
    let p; try { p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unb64u(token))); } catch (e) { return { ok: false, error: 'That link could not be read.' }; }
    if (!p || typeof p !== 'object' || Array.isArray(p) || p.v !== 1) return { ok: false, error: 'That link is from a different version.' };
    const name = cleanName(p.n), week = int(p.w, 0, LIMITS.weekMax), best = int(p.b, 0, LIMITS.bestMax), streak = int(p.s, 0, LIMITS.streakMax), ts = int(p.t, 946684800000, now + DAY);
    if (!name || week == null || best == null || streak == null || ts == null) return { ok: false, error: 'That link has numbers that do not look right.' };
    if (best > week) return { ok: false, error: 'That link has numbers that do not look right.' };
    return { ok: true, friend: { name, week, best, streak, ts } };
  }

  // rows: [{ name, week, you?, ... }] -> sorted, with ties sharing a rank (1,2,2,4)
  function rank(rows) {
    const sorted = rows.slice().sort((a, b) => b.week - a.week || (b.you ? 1 : 0) - (a.you ? 1 : 0));
    let last = null, r = 0;
    return sorted.map((x, i) => { if (x.week !== last) { r = i + 1; last = x.week; } return { ...x, rank: r }; });
  }
  function timeAgo(ts, now) {
    now = now == null ? Date.now() : now; const d = Math.floor((now - ts) / DAY);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d <= 30 ? d + ' days ago' : 'over a month ago';
  }

  // ---- challenges ----
  // getDay(key) -> { steps, active, water } for that day. Window = startKey .. startKey + window - 1.
  function challengeProgress(def, startKey, todayKey, getDay) {
    const s = dayNum(startKey), t = dayNum(todayKey), elapsed = Math.max(0, Math.min(def.window, t - s + 1));
    let hits = 0, total = 0; const perDay = [];
    for (let i = 0; i < elapsed; i++) {
      const v = (getDay(keyOf(s + i)) || {})[def.metric] || 0; total += v;
      const hit = v >= def.threshold; if (hit) hits++; perDay.push(hit);
    }
    const progress = def.mode === 'days' ? hits : Math.min(total, def.need), complete = progress >= def.need;
    // "expired" = it can no longer be completed. Today is still in progress, so an unfinished today is not counted as missed.
    const todayOpen = t >= s && t <= s + def.window - 1 && !perDay[perDay.length - 1];
    const stillPossible = def.mode === 'days' ? hits + (def.window - elapsed) + (todayOpen ? 1 : 0) >= def.need : t <= s + def.window - 1;
    return { elapsed, hits, total, perDay, progress, need: def.need, complete, pct: Math.min(1, progress / def.need), daysLeft: Math.max(0, def.window - elapsed), expired: !complete && (t > s + def.window - 1 || !stillPossible) };
  }

  return { CHALLENGES, LIMITS, GROUP_KINDS, dayNum, keyOf, validKey, cleanName, encodeShare, decodeShare, rank, timeAgo, challengeProgress };
});
