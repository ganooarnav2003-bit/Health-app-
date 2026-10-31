// Browser test (needs Playwright and a static server on port 8765):
//   python3 -m http.server 8765 &   then   node tests/browser-i18n.js hi      (or hg, or en)
// Drives the app through every screen in one language and lists every piece of text that had NO translation.
const { chromium } = require('playwright');
const lang = process.argv[2] || 'hi';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'], geolocation: { latitude: 15.4989, longitude: 73.8278, accuracy: 10 }, acceptDownloads: true });
  await ctx.addInitScript((lang) => {
    try { localStorage.setItem('dinchariya.lang', lang); } catch (e) {}
    // turn on miss-tracking the moment the translator is created
    let inst; Object.defineProperty(window, 'HealthI18n', { configurable: true, get() { return inst; }, set(v) { inst = v; v.track(true); } });
    window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; };
    const mk = (bpm) => new DataView(new Uint8Array([0, bpm]).buffer);
    const ch = { startNotifications: async () => ch, addEventListener: (t, fn) => { if (t === 'characteristicvaluechanged') window.__hrFn = fn; } };
    const svc = { getCharacteristic: async () => ch }, server = { getPrimaryService: async () => svc };
    const gatt = { connected: false, connect: async () => { gatt.connected = true; return server; }, disconnect() { gatt.connected = false; } };
    const dev = { name: 'Mock Strap', gatt, addEventListener: () => {} };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice: async () => dev } });
    window.__hr = (bpm) => window.__hrFn({ target: { value: mk(bpm) } });
  }, lang);
  const p = await ctx.newPage(); const dialogs = [], errs = [];
  p.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load resource|openstreetmap|404/.test(m.text())) errs.push(m.text()); });
  const W = (ms) => p.waitForTimeout(ms), click = async (s) => { try { await p.click(s, { timeout: 4000 }); } catch (e) { errs.push('could not click ' + s); } };
  const tab = async (v) => { await click(`#tabbar [data-go=${v}]`); await W(250); };
  const drawer = async (sel) => { await click('#menu-btn'); await W(300); await click(sel); await W(300); };
  const say = async (t) => { await p.fill('#say', t); await click('#send'); await W(350); };
  const ask = async (q) => { await p.fill('#q', q); await p.press('#q', 'Enter'); await W(250); };

  await p.goto('http://localhost:8765/'); await W(500);
  // ---- welcome ----
  await p.fill('#name', 'Sunita'); await click('#start'); await W(400);
  // ---- Home ----
  await p.evaluate(() => window.scrollTo(0, 0));
  for (const m of ['water', 'kcal', 'prot']) { await click(`#metricchips [data-m=${m}]`); await W(100); }
  await click('#q-water'); await click('#q-steps'); await click('#refresh-btn'); await W(900);
  // ---- Track: logging ----
  await tab('track');
  await say('2 roti, dal, sabzi, 1 cup chai, 3 glasses of water, 20 minute walk');
  await say('thali khayi lunch me'); await say('ate a whole pizza and 3 samosas'); await say('I had lunch at the club'); await say('did not walk today'); await say('BP 165/100'); await say('sugar 54'); await say('chest pain and breathless'); await say('knee pain'); await say('hello');
  await say('आज दो रोटी और दाल खाई'); await say('aaj 2 roti aur dal khayi');
  await click('#photo'); await W(150); await click('#chips button:nth-child(1)');
  await p.fill('#kgoal', '99'); await click('#kgoal-set'); await p.fill('#kgoal', '1500'); await click('#kgoal-set');
  await click('#w-plus'); await click('#w-bottle'); await click('#w-minus');
  await p.fill('#steps-in', '99999'); await click('#steps-add'); await p.fill('#steps-in', '3500'); await click('#steps-add'); await click('#stepchips button:nth-child(3)');
  await p.fill('#wk-min', '0'); await click('#wk-add'); await p.selectOption('#wk-act', 'yoga'); await p.fill('#wk-min', '30'); await click('#wk-add');
  await p.fill('#wt-in', '20'); await click('#wt-add'); await p.fill('#wt-in', '70'); await click('#wt-add');
  await p.fill('#sl-bed', '07:00'); await p.fill('#sl-wake', '07:00'); await click('#sl-add'); await p.fill('#sl-bed', '22:30'); await p.fill('#sl-wake', '06:30'); await click('#sl-add');
  await click('#log li:first-child button'); await W(150); // delete note (confirm dialog)
  // ---- Me ----
  await tab('me');
  await click('#pf-save'); await p.fill('#pf-age', '5'); await click('#pf-save'); await p.fill('#pf-age', '68'); await p.fill('#pf-weight', '999'); await click('#pf-save'); await p.fill('#pf-weight', '70'); await p.fill('#pf-height', '10'); await click('#pf-save');
  await p.fill('#pf-height', '170'); await p.selectOption('#pf-sex', 'male'); await p.selectOption('#pf-activity', 'light'); await click('#pf-save'); await W(200);
  await p.check('#pf-plimit'); await click('#pf-save'); await W(150); await p.uncheck('#pf-plimit'); await click('#pf-save');
  await p.fill('#em-name', 'Ravi'); await p.fill('#em-phone', 'abc'); await click('#em-save'); await p.fill('#em-phone', '+91 98765 43210'); await click('#em-save');
  await click('#bk-csv'); await W(200); await click('#bk-download'); await W(200);
  await p.setInputFiles('#bk-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') }); await W(300);
  await p.setInputFiles('#bk-file', { name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') }); await W(300);
  // ---- sample week + Rewards ----
  await drawer('#d-sample'); await W(300);
  await drawer('#drawer [data-go=rewards]'); await W(250);
  await click('#rw-redeem .redeem:nth-child(1) button'); await W(300);
  // ---- Plans ----
  await drawer('#drawer [data-go=plans]'); await W(250);
  await click('#plan-cards .plan:not(.free):nth-of-type(2) button'); await W(300); await click('#plan-cancel'); await W(300);
  // ---- Walk ----
  await tab('walk'); await W(300);
  await click('#hr-connect'); await W(400); for (const v of [72, 110, 135, 158]) { await p.evaluate((x) => window.__hr(x), v); await W(80); } await click('#hr-disconnect'); await click('#hr-demo'); await W(1300); await click('#hr-disconnect');
  await click('#walk-demo'); await W(5200); await click('#walklist li:first-child button[aria-label]'); await W(200);
  // ---- Digest ----
  await tab('tips'); for (const n of [2, 3, 4, 5, 6, 7, 8]) { await click(`#tipcats button:nth-child(${n})`); await W(60); } await click('#tipcats button:nth-child(1)'); await click('#tips-all button.full'); await W(200);
  // ---- Community ----
  await drawer('#drawer [data-go=community]'); await W(250);
  await click('#cm-sample'); await W(200); await click('#cm-share'); await click('#cm-copy'); await W(300);
  for (let i = 1; i <= 4; i++) { await click('#ch-list .redeem:nth-child(1) button'); await click('#ch-active .row button:nth-of-type(2)'); await W(60); }
  await click('#ch-list .redeem:nth-child(3) button'); await W(200); await click('#ch-active .row button:nth-of-type(1)');
  await p.fill('#g-name', ''); await click('#g-add'); await p.fill('#g-name', 'Park walkers'); await p.fill('#g-when', 'Mon 6am'); await click('#g-add'); await W(150);
  await click('#grouplist li:last-child button[aria-label^=Send]'); await click('#board li:nth-child(1) .acts button:nth-child(1)'); await click('#board li:nth-child(1) .acts button:nth-child(2)'); await W(150);
  const tok = Buffer.from(JSON.stringify({ v: 1, n: 'Asha', w: 50000, b: 12000, s: 3, t: Date.now() })).toString('base64url');
  await p.evaluate((t) => { location.hash = '#buddy=' + t; }, tok); await W(400); await click('#pc-add'); await W(200);
  await p.evaluate(() => { location.hash = '#buddy=' + btoa('junk').replace(/=/g, ''); }); await W(400); await click('#pc-no'); await W(100);
  // ---- Chat ----
  await click('#chat-fab'); await W(250);
  for (let i = 1; i <= 5; i++) { await click(`#askchips button:nth-child(${i})`); await W(120); }
  await ask('What is the capital of France?'); await ask('How can I sleep better?'); await ask('Do I have diabetes?'); await ask('How many calories have I had today?'); await ask('How should I walk?'); await ask('chest pain'); await ask('what can you do'); await W(200);
  for (let i = 0; i < 3; i++) await ask('How much water should I drink?');
  await click('#chat-clear'); await click('#chat-close'); await W(200);
  // ---- drawer actions ----
  await drawer('#d-share'); await W(200);
  await click('#menu-btn'); await click('#d-reset'); await W(300);
  // ---- report ----
  const misses = await p.evaluate(() => HealthI18n.misses());
  const left = await p.evaluate(() => { // visible text nodes still containing English words (excluding user text and units)
    const out = new Set(); const tw = document.createTreeWalker(document.body, 4);
    for (let n; (n = tw.nextNode());) { const el = n.parentElement; if (!el || el.closest('script,style,[translate=no],.leaflet-container')) continue; const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t && el.offsetParent !== null && /[A-Za-z]{3,}/.test(t)) out.add(t); }
    return [...out];
  });
  console.log(`LANG=${lang}`); console.log(`MISSES (${misses.length}):`); misses.forEach((m) => console.log('  - ' + m));
  console.log(`DIALOGS (${dialogs.length}):`); [...new Set(dialogs)].forEach((m) => console.log('  - ' + m));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
})();
