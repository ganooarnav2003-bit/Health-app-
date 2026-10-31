/*
 * Heart-rate maths for a Bluetooth watch or chest strap (standard BLE Heart Rate profile, 0x180D).
 * Pure functions, no DOM and no Bluetooth calls, so they can be tested in Node.
 * Zones are a general guide, not medical advice. Nothing here diagnoses anything.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HealthWatch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BPM_MIN = 30, BPM_MAX = 230;

  // Heart Rate Measurement characteristic (0x2A37): flags byte, then 8-bit or 16-bit bpm.
  function parseHeartRate(dv) {
    if (!dv || dv.byteLength < 2) return null;
    const flags = dv.getUint8(0), is16 = (flags & 0x01) === 1;
    if (is16 && dv.byteLength < 3) return null;
    const bpm = is16 ? dv.getUint16(1, true) : dv.getUint8(1);
    const contactBits = (flags >> 1) & 0x03; // 2 = supported but NOT touching skin, 3 = supported and touching
    return { bpm, valid: bpm >= BPM_MIN && bpm <= BPM_MAX, contact: contactBits === 2 ? false : true };
  }

  // Estimated maximum heart rate (Tanaka: 208 - 0.7 x age), which suits older adults better than 220 - age.
  function maxHr(age) { const a = +age; return Math.round(208 - 0.7 * (a >= 18 && a <= 110 ? a : 60)); }

  const ZONES = [
    { z: 0, label: 'Resting', from: 0 },
    { z: 1, label: 'Very light', from: 50 },
    { z: 2, label: 'Light', from: 60 },
    { z: 3, label: 'Moderate', from: 70 },
    { z: 4, label: 'Hard', from: 80 },
    { z: 5, label: 'Maximum', from: 90 },
  ];
  function zoneOf(bpm, max) {
    const pct = (bpm / max) * 100; let z = ZONES[0];
    ZONES.forEach((x) => { if (pct >= x.from) z = x; });
    return { ...z, pct: Math.round(pct) };
  }

  // Gentle, non-diagnostic guidance. Returns null when everything is in the comfortable range.
  function advice(z) {
    if (z.z >= 5) return 'Your heart rate is very high for exercise. Stop and sit down to rest. If you feel unwell, dizzy or have chest pain, call 112.';
    if (z.z === 4) return 'This is hard work. Slow down and breathe easily until you can talk comfortably.';
    return null;
  }

  // samples: [{ t (ms), bpm }]. Ignores impossible readings. Time in each zone is measured between samples (gaps over 10 s are not counted).
  function summarize(samples, max) {
    const good = (samples || []).filter((s) => s && s.bpm >= BPM_MIN && s.bpm <= BPM_MAX);
    if (!good.length) return null;
    let sum = 0, mx = 0, mn = 999; const secs = [0, 0, 0, 0, 0, 0];
    good.forEach((s, i) => {
      sum += s.bpm; mx = Math.max(mx, s.bpm); mn = Math.min(mn, s.bpm);
      if (i > 0) { const dt = (s.t - good[i - 1].t) / 1000; if (dt > 0 && dt <= 10) secs[zoneOf(good[i - 1].bpm, max).z] += dt; }
    });
    return { n: good.length, avg: Math.round(sum / good.length), max: mx, min: mn, secsInZone: secs.map((x) => Math.round(x)) };
  }

  // A made-up, plausible heart-rate stream for a gentle walk so the feature can be shown without a device.
  function demoBpm(tSec) { return Math.round(84 + 18 * (1 - Math.exp(-tSec / 60)) + 5 * Math.sin(tSec / 7) + 2 * Math.sin(tSec * 1.3)); }

  return { BPM_MIN, BPM_MAX, ZONES, parseHeartRate, maxHr, zoneOf, advice, summarize, demoBpm };
});
