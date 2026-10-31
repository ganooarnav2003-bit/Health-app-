// node tests/run-i18n-ui.js -> every string in index.html (and every dictionary row) is translated, correctly formed
const fs = require('fs'), path = require('path');
const I = require('../i18n.js');
const dir = path.join(__dirname, '..', 'lang');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const rows = files.flatMap((f) => require(path.join(dir, f)).map((r) => ({ r, f })));
I.load(rows.map((x) => x.r));
let pass = 0, total = 0; const ok = (n, c, detail) => { total++; pass += !!c; console.log(`${c ? 'pass' : 'FAIL'} | ${n}${!c && detail ? '\n        ' + detail : ''}`); };
const DEV = /[ऀ-ॿ]/, norm = I.norm;
const hasWord = (s) => /[A-Za-z]{2,}/.test(s);

ok(`dictionary files loaded: ${files.join(', ')} (${rows.length} rows)`, rows.length > 200);
// ---- shape of every row ----
const bad = [];
rows.forEach(({ r, f }) => {
  const [en, hi, hg] = r, where = `${f}: "${en.slice(0, 50)}"`;
  if (typeof en !== 'string' || typeof hi !== 'string' || typeof hg !== 'string' || !hi.trim() || !hg.trim()) bad.push(where + ' (empty or not a string)');
  const need = (en.match(/\{\}/g) || []).length;
  [['hi', hi], ['hg', hg]].forEach(([l, t]) => {
    const used = [...(t || '').matchAll(/\{(\d+)\}/g)].map((m) => +m[1]);
    if (need && (new Set(used).size !== need || Math.max(...used, 0) !== need || Math.min(...used, 99) !== 1)) bad.push(`${where} [${l}] placeholders: English has ${need}, translation uses ${used.join(',') || 'none'}`);
    if (!need && used.length) bad.push(`${where} [${l}] has {n} but English has no {}`);
    if (/<[a-z\/][^>]*>/i.test(t || '')) bad.push(`${where} [${l}] contains HTML`);
  });
  // Hindi must be written in Devanagari (the brand name and "AI" may stay Latin); Hinglish must be Latin only
  if (hasWord(en) && !DEV.test(hi) && !/^(My Fitness Buddy|AI)$/.test(en)) bad.push(`${where} [hi] has no Devanagari: "${hi.slice(0, 40)}"`);
  if (DEV.test(hg)) bad.push(`${where} [hg] contains Devanagari: "${hg.slice(0, 40)}"`);
});
ok('every row: both translations present, placeholders match English, no HTML, Hindi in Devanagari, Hinglish in Roman letters', bad.length === 0, bad.slice(0, 12).join('\n        '));
// ---- duplicates must agree ----
const seen = new Map(), dup = [];
rows.forEach(({ r, f }) => { const k = norm(r[0]); if (seen.has(k)) { const p = seen.get(k); if (p[1] !== r[1] || p[2] !== r[2]) dup.push(`"${k.slice(0, 40)}" differs between files`); } else seen.set(k, r); });
ok('the same English text never has two different translations', dup.length === 0, dup.join('\n        '));

// ---- every string in index.html ----
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), body = html.slice(html.indexOf('<body>'));
const keys = new Set();
body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<!--[\s\S]*?-->/g, '').split(/<[^>]+>/).forEach((t) => { const k = t.replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); if (k && /[A-Za-z]/.test(k)) keys.add(k); });
for (const m of body.matchAll(/\b(placeholder|aria-label|title|alt)="([^"]+)"/g)) keys.add(m[2].replace(/&amp;/g, '&'));
// text inside translate="no" elements is deliberately never translated
const noTr = []; for (const m of body.matchAll(/<([a-z0-9]+)[^>]*\btranslate="no"[^>]*>([\s\S]*?)<\/\1>/g)) noTr.push(m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
const head = html.slice(0, html.indexOf('<body>')); const titleKey = /<title>([^<]+)<\/title>/.exec(head)[1], descKey = /name="description" content="([^"]+)"/.exec(head)[1];
keys.add(titleKey); keys.add(descKey);
const missing = [...keys].filter((k) => !noTr.includes(k) && !(I.has(k, 'hi') && I.has(k, 'hg')));
ok(`all ${keys.size} strings in index.html have Hindi and Hinglish (${noTr.length} marked translate="no")`, missing.length === 0, missing.map((k) => '- ' + k.slice(0, 90)).join('\n        '));
console.log(`\n${pass}/${total} passed`); if (pass !== total) process.exit(1);
