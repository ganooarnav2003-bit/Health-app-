/*
 * Walk tracking maths: pure functions (no DOM, no network) so they can be tested in Node.
 * Location never leaves the phone: points are filtered here, then stored locally only.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HealthWalk = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const R = 6371000; // metres
  const LIMITS = { maxAccuracyM: 50, minMoveM: 4, maxSpeedMs: 4 }; // ignore noisy fixes, jitter, and GPS jumps (>14 km/h)
  const rad = (d) => (d * Math.PI) / 180;

  function haversine(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Decide whether to keep a new GPS fix. Returns { ok, reason }.
  function accept(prev, p) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return { ok: false, reason: 'invalid' };
    if (p.acc != null && p.acc > LIMITS.maxAccuracyM) return { ok: false, reason: 'accuracy' };
    if (!prev) return { ok: true };
    const d = haversine(prev, p), dt = Math.max(1, ((p.ts || 0) - (prev.ts || 0)) / 1000);
    if (d < LIMITS.minMoveM) return { ok: false, reason: 'still' };
    if (d / dt > LIMITS.maxSpeedMs) return { ok: false, reason: 'jump' };
    return { ok: true };
  }

  function lengthM(points) { let m = 0; for (let i = 1; i < points.length; i++) m += haversine(points[i - 1], points[i]); return m; }

  // Keep at most `max` points (always the first and last) so stored routes stay small.
  function downsample(points, max) {
    if (points.length <= max) return points.slice();
    const out = [], step = (points.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
    return out;
  }

  function bounds(points) {
    if (!points.length) return null;
    let s = 90, n = -90, w = 180, e = -180;
    points.forEach((p) => { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lng); e = Math.max(e, p.lng); });
    return [[s, w], [n, e]];
  }

  // stepKm: distance of one step in km (the app's shared constant, about 0.0007)
  function stats(points, startTs, endTs, stepKm) {
    const km = lengthM(points) / 1000, minutes = Math.max(0, (endTs - startTs) / 60000);
    return { km: Math.round(km * 100) / 100, minutes: Math.round(minutes * 10) / 10, steps: Math.round(km / stepKm), paceMinPerKm: km > 0.05 ? Math.round((minutes / km) * 10) / 10 : null };
  }

  // A made-up loop (about 1.2 km) so people without GPS, or reviewers at a desk, can see the feature.
  function demoRoute(center, n) {
    n = n || 120;
    const c = center || { lat: 15.4989, lng: 73.8278 }, out = [], t0 = Date.now() - n * 5000;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1)) * 2 * Math.PI;
      out.push({ lat: c.lat + 0.0017 * Math.sin(a), lng: c.lng + 0.0022 * (Math.cos(a) - 1) / 1 + 0.0004 * Math.sin(2 * a), ts: t0 + i * 5000, acc: 8 });
    }
    return out;
  }

  const fmtDuration = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };

  return { LIMITS, haversine, accept, lengthM, downsample, bounds, stats, demoRoute, fmtDuration };
});
