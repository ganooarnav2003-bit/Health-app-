/*
 * Language layer: English, Hindi (Devanagari) and Hinglish (Hindi in Roman letters).
 *
 * How it works. The app is written in English. This layer translates what is ON SCREEN, so the app code stays simple:
 *   - exact entries:     "Water"                           -> "पानी" / "Paani"
 *   - template entries:  "{} steps this week"             -> "इस हफ़्ते {1} कदम" / "Is hafte {1} kadam"
 *     ({} captures numbers or names; {1} {2} put them back, in any order, because Hindi word order differs.
 *      Captured text is itself translated, so "shared {}" works with "today" / "yesterday" / "3 days ago".)
 *   - long strings are split on " · " and on sentence ends, and each piece is translated.
 * Text a person typed (names, notes, chat questions) is marked translate="no" and is never touched.
 * Anything with no translation is recorded in misses(), so tests can prove nothing was forgotten.
 *
 * The translations were written by an AI assistant: have a fluent speaker read them before real use.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HealthI18n = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LANGS = [{ id: 'en', label: 'English' }, { id: 'hi', label: 'हिन्दी' }, { id: 'hg', label: 'Hinglish' }];
  const IDS = LANGS.map((l) => l.id);
  const exact = { hi: new Map(), hg: new Map() }, patterns = { hi: [], hg: [] };
  const missSet = new Set();
  let lang = 'en', tracking = false;

  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // letters that are fine to leave as they are (units, brands, abbreviations)
  const KEEP = new Set(['kcal', 'km', 'kg', 'cm', 'ml', 'min', 'bpm', 'g', 'h', 'L', 'm', 'am', 'pm', 'AM', 'PM', 'PRO', 'WhatsApp', 'WHO', 'BP', 'OpenStreetMap', 'Leaflet', 'JSON', 'CSV', 'json', 'csv', 'Bluetooth', 'GPS', 'AI']);

  // rows: [[en, hi, hg], ...]
  function load(rows) {
    rows.forEach(([en, hi, hg]) => {
      const key = norm(en);
      [['hi', hi], ['hg', hg]].forEach(([l, out]) => {
        if (typeof out !== 'string') return;
        if (key.includes('{}')) {
          const parts = key.split('{}');
          patterns[l].push({ re: new RegExp('^' + parts.map(esc).join('(.+?)') + '$'), out, literal: parts.join('').length, key });
        } else exact[l].set(key, out);
      });
    });
    ['hi', 'hg'].forEach((l) => patterns[l].sort((a, b) => b.literal - a.literal)); // most specific first
  }

  const letters = (s) => s.match(/[A-Za-z]+/g) || [];
  // a word is left as it is if it is a unit/brand, a short ALL-CAPS abbreviation (HR, BP, GPS), or a single letter
  const keepWord = (w) => w.length < 2 || KEEP.has(w) || /^[A-Z]{2,4}$/.test(w);
  const needsTranslation = (s) => letters(s).some((w) => !keepWord(w));

  // rec = record untranslated leaves as misses (false while translating captured names/numbers)
  function trCore(core, L, depth, rec) {
    if (!needsTranslation(core)) return { text: core, ok: true };
    const hit = exact[L].get(core);
    if (hit !== undefined) return { text: hit, ok: true };
    if (depth < 4) for (const p of patterns[L]) {
      const m = p.re.exec(core);
      if (m) {
        const caps = m.slice(1).map((c) => trCore(c, L, depth + 1, false).text); // a captured name that has no entry is fine as it is
        return { text: p.out.replace(/\{(\d+)\}/g, (_, i) => (caps[i - 1] !== undefined ? caps[i - 1] : '')), ok: true };
      }
    }
    if (core.includes(' · ')) { // pieces joined with " · "
      const parts = core.split(' · ').map((x) => trCore(x, L, depth + 1, rec));
      return { text: parts.map((x) => x.text).join(' · '), ok: parts.every((x) => x.ok) };
    }
    const sentences = core.split(/(?<=[.!?])\s+/); // several sentences
    if (sentences.length > 1) {
      const parts = sentences.map((x) => trCore(x, L, depth + 1, rec));
      return { text: parts.map((x) => x.text).join(' '), ok: parts.every((x) => x.ok) };
    }
    const colon = /^([^:]{2,60}): (.+)$/.exec(core); // "Label: value"
    if (colon && depth < 3) {
      const a = trCore(colon[1], L, depth + 1, false), b = trCore(colon[2], L, depth + 1, false);
      if (a.ok && b.ok) return { text: a.text + ': ' + b.text, ok: true };
    }
    // "2 roti": a number in front of something we know ("8 × pizza" is a template instead)
    const lead = /^(\d[\d.,]*)\s+(.+)$/.exec(core);
    if (lead && depth < 4) { const r = trCore(lead[2], L, depth + 1, false); if (r.ok) return { text: lead[1] + ' ' + r.text, ok: true }; }
    // "2 roti, dal, sabzi": a short list where every item is known
    if (core.includes(', ') && depth < 4) {
      const items = core.split(', ');
      if (items.length <= 6 && items.every((x) => x.split(' ').length <= 5)) { const rs = items.map((x) => trCore(x, L, depth + 1, false)); if (rs.every((r) => r.ok)) return { text: rs.map((r) => r.text).join(', '), ok: true }; }
    }
    if (rec && tracking) missSet.add(core);
    return { text: core, ok: false };
  }

  // Translate one string (keeps leading/trailing spaces). L defaults to the current language.
  function tr(s, L) {
    L = L || lang;
    if (L === 'en' || s == null) return s == null ? s : String(s);
    s = String(s);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = norm(m[2]);
    if (!core || !/[A-Za-z]/.test(core)) return s;
    return m[1] + trCore(core, L, 0, true).text + m[3];
  }

  const api = { LANGS, IDS, load, tr, norm, get lang() { return lang; }, setLang(l) { if (IDS.includes(l)) lang = l; return lang; }, track(on) { tracking = !!on; }, misses: () => [...missSet].sort(), clearMisses: () => missSet.clear(),
    stats: () => ({ exact: exact.hi.size, patterns: patterns.hi.length }), has: (en, L) => trCore(norm(en), L, 0, false).ok };

  // ---------------- DOM part (browser only) ----------------
  api.attach = function (doc) {
    const win = doc.defaultView, ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
    const textRecs = new WeakMap(), attrRecs = new WeakMap();
    const skip = (el) => !el || !!(el.closest && el.closest('[translate="no"], script, style, textarea, .leaflet-container'));
    function procText(node) {
      if (!node.isConnected || skip(node.parentElement)) return; // nodes already replaced on the page are ignored
      const v = node.nodeValue; let r = textRecs.get(node);
      if (r && v === r.out) { if (r.lang === lang) return; } else r = { en: v };
      const out = tr(r.en, lang); r.out = out; r.lang = lang; textRecs.set(node, r);
      if (out !== v) node.nodeValue = out;
    }
    function procAttrs(el) {
      if (!el.getAttribute || !el.isConnected || skip(el)) return;
      let rec = attrRecs.get(el); if (!rec) { rec = {}; attrRecs.set(el, rec); }
      ATTRS.forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const v = el.getAttribute(a); let r = rec[a];
        if (r && v === r.out) { if (r.lang === lang) return; } else r = { en: v };
        const out = tr(r.en, lang); r.out = out; r.lang = lang; rec[a] = r;
        if (out !== v) el.setAttribute(a, out);
      });
    }
    function walk(rootEl) {
      if (rootEl.nodeType === 3) { procText(rootEl); return; }
      if (rootEl.nodeType !== 1 || !rootEl.isConnected) return;
      if (skip(rootEl)) return;
      procAttrs(rootEl);
      const tw = doc.createTreeWalker(rootEl, 1 | 4);
      let n; while ((n = tw.nextNode())) { if (n.nodeType === 3) procText(n); else procAttrs(n); }
    }
    const mo = new win.MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') procText(m.target);
        else if (m.type === 'attributes') procAttrs(m.target);
      });
      mo.takeRecords(); // our own edits are not news
    });
    api.apply = function () {
      doc.documentElement.lang = lang === 'hi' ? 'hi' : lang === 'hg' ? 'hi-Latn' : 'en';
      walk(doc.body); mo.takeRecords();
      const t = doc.querySelector('title'); if (t) { if (!t.dataset.en) t.dataset.en = t.textContent; t.textContent = tr(t.dataset.en, lang); }
      const d = doc.querySelector('meta[name=description]'); if (d) { if (!d.dataset.en) d.dataset.en = d.getAttribute('content'); d.setAttribute('content', tr(d.dataset.en, lang)); }
    };
    api.start = function () { mo.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS }); api.apply(); };
    return api;
  };
  return api;
});
