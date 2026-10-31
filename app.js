(function () {
  'use strict';
  const E = window.HealthEngine;
  const KEY = 'dinchariya.v1';
  const $ = (s) => document.querySelector(s);

  let live = false;
  let st = load();

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)) || {}; return { profile: s.profile || null, entries: s.entries || [], chat: s.chat || [] }; }
    catch (e) { return { profile: null, entries: [], chat: [] }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  const todayKey = () => E.dayKey(new Date());
  const entriesOn = (k) => st.entries.filter((e) => E.dayKey(e.ts) === k);
  const newId = () => Date.now() + '' + Math.random().toString(16).slice(2, 6);
  const GLASS_ML = 250;

  function history() {
    const out = [];
    for (let i = 3; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = E.dayKey(d), any = entriesOn(k);
      out.push({ date: k, walkMin: E.summarize(any).walkMin });
    }
    // Days before the first-ever entry are not "missed walks".
    const first = st.entries.length ? E.dayKey(Math.min.apply(null, st.entries.map((e) => e.ts))) : null;
    return out.filter((h) => first && h.date >= first);
  }
  function goals() {
    const h = history(), walk = E.adaptiveWalkGoal(h, E.DEFAULT_GOALS.walkBase), steps = walk * E.STEPS_PER_MIN;
    return { kcal: (st.profile && st.profile.kcalGoal) || E.DEFAULT_GOALS.kcal, kcalCustom: !!(st.profile && st.profile.kcalGoal), water: E.DEFAULT_GOALS.water, walkBase: E.DEFAULT_GOALS.walkBase, walk, steps, km: E.kmFromSteps(steps), hasHistory: h.length > 0 };
  }
  const fmt = (n) => Number(n).toLocaleString('en-IN');

  // ---------------- render ----------------
  function render() {
    const has = !!st.profile;
    $('#onboard').hidden = has; $('#main').hidden = !has;
    if (!has) return;
    const now = new Date(), g = goals(), sum = E.summarize(entriesOn(todayKey()));
    $('#hello').textContent = 'Hello' + (st.profile.name ? ', ' + st.profile.name : '');
    $('#date').textContent = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

    // calories
    const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snacks', dinner: 'Dinner' };
    $('#k-val').textContent = sum.kcalHi ? `${fmt(sum.kcalLo)}–${fmt(sum.kcalHi)}` : '0';
    const mid = (sum.kcalLo + sum.kcalHi) / 2;
    $('#b-kcal').style.width = Math.min(100, (mid / g.kcal) * 100) + '%';
    $('#b-kcal').parentElement.classList.toggle('over', mid > g.kcal * 1.1);
    $('#k-empty').hidden = sum.meals.length > 0;
    $('#k-ref').textContent = (g.kcalCustom ? `Your target: ${fmt(g.kcal)} kcal a day.` : `Reference: about ${fmt(g.kcal)} kcal a day is a common figure for older adults. Ask your doctor or dietitian for yours.`) +
      (mid > g.kcal * 1.1 ? ' You are above it today; a lighter, earlier dinner is an easy way to balance.' : '');
    const ks = $('#k-slots'); ks.innerHTML = '';
    E.SLOTS.forEach((sl) => {
      const b = sum.bySlot[sl]; if (!b.items.length) return;
      const wrap = document.createElement('div'); wrap.className = 'slot';
      const head = document.createElement('div'); head.className = 'slothead';
      head.innerHTML = '<b></b><span></span>'; head.firstChild.textContent = SLOT_LABEL[sl]; head.lastChild.textContent = `${fmt(b.lo)}–${fmt(b.hi)} kcal`;
      const ul = document.createElement('ul'); ul.className = 'items';
      b.items.forEach((m) => {
        const li = document.createElement('li');
        const n = document.createElement('span'); n.className = 'n'; n.textContent = `${m.qty !== 1 ? m.qty + ' × ' : ''}${m.name}${m.assumed ? ' (1 assumed)' : ''}`;
        const c = document.createElement('span'); c.className = 'c'; c.textContent = `${m.kcalLo}–${m.kcalHi}`;
        const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove ' + m.name);
        x.onclick = () => removeMeal(m.entryId, m.idx);
        li.append(n, c, x); ul.appendChild(li);
      });
      wrap.append(head, ul); ks.appendChild(wrap);
    });

    // water
    $('#w-val').textContent = `${sum.water} / ${g.water}`;
    $('#w-sub').textContent = `glasses · ${(sum.water * GLASS_ML / 1000).toFixed(2).replace(/\.?0+$/, '')} L`;
    $('#b-water').style.width = Math.min(100, (sum.water / g.water) * 100) + '%';
    const gl = $('#glasses'); gl.innerHTML = '';
    for (let i = 0; i < Math.max(g.water, sum.water); i++) { const s = document.createElement('span'); s.textContent = '💧'; if (i < sum.water) s.className = 'on'; gl.appendChild(s); }
    $('#w-minus').disabled = sum.water <= 0;

    // walking
    $('#s-steps').textContent = fmt(sum.steps);
    $('#s-km').textContent = sum.km.toFixed(2);
    $('#s-min').textContent = sum.walkMin;
    $('#b-steps').style.width = Math.min(100, (sum.steps / g.steps) * 100) + '%';
    $('#walk-why').textContent = `Today's goal: ${fmt(g.steps)} steps (${g.km} km, ${g.walk} min)` + (g.hasHistory ? (g.walk < g.walkBase ? ', made smaller to match your week.' : ', it grows slowly with you.') : '.');

    const n = E.nudge(now, sum, g, history());
    const nd = $('#nudge'); nd.textContent = n.en; nd.classList.toggle('warn', n.kind === 'walk-skipped');

    $('#foodline').textContent = sum.kcalHi ? `Food so far: roughly ${sum.kcalLo}-${sum.kcalHi} kcal (rough estimate).` : '';
    const ul = $('#log'); ul.innerHTML = '';
    const todays = entriesOn(todayKey()).slice().reverse();
    $('#empty').hidden = todays.length > 0;
    todays.forEach((e) => {
      const li = document.createElement('li'), d = document.createElement('div'), bits = [];
      (e.meals || []).forEach((m) => bits.push(m.skipped ? `✗ ${m.name}` : `${m.qty !== 1 ? m.qty + ' ' : ''}${m.name} (${m.kcalLo}-${m.kcalHi})`));
      if (e.water) bits.push(`💧 ${e.water > 0 ? '+' : '−'}${Math.abs(e.water)}`);
      if (e.steps) bits.push(`🚶 ${fmt(e.steps)} steps, ${E.kmFromSteps(e.steps)} km${e.stepsEst ? ' (est.)' : ''}`);
      else if (e.walkMin) bits.push(`🚶 ${e.walkMin} min`);
      if (e.walkSkipped) bits.push('🚶 ✗');
      if (e.bp) bits.push(`BP ${e.bp.s}/${e.bp.d}`);
      if (e.sugar != null) bits.push(`sugar ${e.sugar}`);
      if (e.safety && e.safety.level !== 'none') bits.push('⚠ tell your doctor');
      d.innerHTML = '<div class="t"></div><div class="b"></div>';
      d.querySelector('.t').textContent = new Date(e.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      d.querySelector('.b').textContent = bits.join(' · ') || e.text;
      const del = document.createElement('button'); del.textContent = '🗑'; del.setAttribute('aria-label', 'Remove this note');
      del.onclick = () => { if (confirm('Remove this note?')) { st.entries = st.entries.filter((x) => x.id !== e.id); save(); render(); } };
      li.append(d, del); ul.appendChild(li);
    });
    $('#mode').textContent = live ? 'Live AI' : 'Demo mode (works offline)';
    renderChat();
  }

  function renderChat(typing) {
    const box = $('#chatlog'); box.innerHTML = '';
    st.chat.forEach((m) => {
      const d = document.createElement('div');
      d.className = 'msg ' + (m.role === 'user' ? 'user' : 'bot') + (m.level === 'red' ? ' red' : m.level === 'amber' ? ' amber' : '');
      d.textContent = m.content; box.appendChild(d);
    });
    if (typing) { const d = document.createElement('div'); d.className = 'msg bot typing'; d.textContent = 'Thinking…'; box.appendChild(d); }
    box.scrollTop = box.scrollHeight;
    $('#askchips').hidden = st.chat.length > 0;
  }

  // ---------------- logging by text / voice / photo ----------------
  function showReply(r) {
    const el = $('#reply'); el.hidden = false; el.textContent = r.reply;
    el.className = 'reply' + (r.safety && r.safety.level === 'red' ? ' red' : r.safety && r.safety.level === 'amber' ? ' amber' : '');
  }

  async function analyze(text, image) {
    const now = new Date(), local = E.analyze(text, { lang: 'en', now });
    if (local.safety.level === 'red') return { ...local, source: 'safety' }; // never waits for the network
    if (live) {
      try {
        const sum = E.summarize(entriesOn(todayKey()));
        const r = await fetch('api/coach', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(16000),
          body: JSON.stringify({ text, image, lang: 'en', now: now.toISOString(), context: { water: sum.water, walkMin: sum.walkMin } }) });
        if (r.ok) return await r.json();
      } catch (e) { /* offline: fall back to the local parser */ }
    }
    if (image && !text) return { ...local, reply: 'Photo reading needs the live AI. Please type what was on the plate.' };
    return local;
  }

  function pushEntry(o) { st.entries.push({ id: newId(), ts: Date.now(), text: '', meals: [], water: 0, walkMin: 0, steps: 0, walkSkipped: false, safety: { level: 'none', reasons: [] }, ...o }); save(); }

  async function submit(text, image) {
    text = (text || '').trim();
    if (!text && !image) return;
    const btn = $('#send'); btn.disabled = true;
    const rep = $('#reply'); rep.hidden = false; rep.className = 'reply'; rep.textContent = 'One moment…';
    const r = await analyze(text, image);
    btn.disabled = false;
    const empty = !r.meals.length && !r.water && !r.walkMin && !r.steps && !r.walkSkipped && !r.bp && r.sugar == null && r.safety.level === 'none';
    if (!empty) pushEntry({ text: r.safety.level === 'red' ? '' : text, meals: r.meals, water: r.water, walkMin: r.walkMin, steps: r.steps || 0, stepsEst: !!r.stepsEst, walkSkipped: r.walkSkipped, bp: r.bp, sugar: r.sugar, safety: r.safety });
    const after = E.summarize(entriesOn(todayKey()));
    if (!empty && r.safety.level !== 'red' && r.meals.some((m) => !m.skipped) && after.kcalHi) r.reply += ` Today so far: about ${fmt(after.kcalLo)}–${fmt(after.kcalHi)} kcal.`;
    showReply(r); $('#say').value = ''; render();
  }

  // ---------------- calories ----------------
  function removeMeal(entryId, idx) {
    const e = st.entries.find((x) => x.id === entryId); if (!e) return;
    e.meals.splice(idx, 1);
    const empty = !e.meals.length && !e.water && !e.walkMin && !e.steps && !e.walkSkipped && !e.bp && e.sugar == null && (!e.safety || e.safety.level === 'none');
    if (empty) st.entries = st.entries.filter((x) => x !== e);
    save(); render();
  }
  function setKcalGoal() {
    const v = $('#kgoal').value.trim();
    if (!v) { delete st.profile.kcalGoal; }
    else { const n = Math.round(+v); if (!(n >= 800 && n <= 4000)) { $('#k-ref').textContent = 'Please enter a number between 800 and 4,000, or leave it blank for the reference figure.'; return; } st.profile.kcalGoal = n; }
    $('#kgoal').value = ''; save(); render();
  }

  // ---------------- water + steps trackers ----------------
  function addWater(n) { pushEntry({ quick: 'water', water: n }); render(); }
  function removeWater() {
    if (E.summarize(entriesOn(todayKey())).water <= 0) return;
    const mine = entriesOn(todayKey()).filter((e) => e.quick === 'water' && e.water > 0);
    if (mine.length) {
      const last = mine[mine.length - 1];
      if (last.water > 1) last.water -= 1; else st.entries = st.entries.filter((e) => e.id !== last.id); // remove exactly one glass
      save(); render();
    }
    else { pushEntry({ quick: 'water', water: -1 }); render(); }
  }
  function addSteps(n) {
    n = Math.round(+n);
    if (!(n >= 1 && n <= 40000)) { const r = $('#walk-why'); r.textContent = 'Please enter steps between 1 and 40,000.'; return; }
    pushEntry({ quick: 'steps', steps: n, walkMin: Math.round(n / E.STEPS_PER_MIN) });
    $('#steps-in').value = ''; render();
  }

  // ---------------- chat assistant ----------------
  async function sendChat(q) {
    q = (q || '').trim(); if (!q) return;
    const btn = $('#ask'); btn.disabled = true;
    const sum = E.summarize(entriesOn(todayKey())), g = goals();
    const ctx = { summary: { water: sum.water, walkMin: sum.walkMin, steps: sum.steps, km: sum.km, kcalLo: sum.kcalLo, kcalHi: sum.kcalHi, meals: sum.meals.map((m) => m.name) },
      goals: { water: g.water, walk: g.walk, steps: g.steps, km: g.km, kcal: g.kcal }, history: history().map((x) => ({ date: x.date, walkMin: x.walkMin })) };
    const prior = st.chat.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    st.chat.push({ role: 'user', content: q }); renderChat(true);
    let r = E.answerQuery(q, ctx);
    if (r.safety.level !== 'red' && r.topic !== 'medicine' && live) { // red flags and medicine never wait for the network
      try {
        const x = await fetch('api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ question: q, context: ctx, history: prior }) });
        if (x.ok) r = await x.json();
      } catch (e) { /* offline: keep the local answer */ }
    }
    st.chat.push({ role: 'assistant', content: r.answer, level: r.safety && r.safety.level });
    st.chat = st.chat.slice(-30); save();
    btn.disabled = false; renderChat();
  }

  // ---------------- wiring ----------------
  $('#start').onclick = () => { st.profile = { name: $('#name').value.trim() }; save(); render(); $('#say').focus(); };
  $('#send').onclick = () => submit($('#say').value);
  $('#say').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit($('#say').value); });

  ['2 roti, dal, sabzi', 'one glass of water', '20 minute walk', 'did not walk today'].forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c;
    b.onclick = () => { const s = $('#say'); s.value = (s.value ? s.value + ', ' : '') + c; s.focus(); }; $('#chips').appendChild(b);
  });
  [['+1,000 steps', 1000], ['+2,000 steps', 2000], ['+1 km', Math.round(1 / E.STEP_KM)]].forEach(([label, n]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => addSteps(n); $('#stepchips').appendChild(b);
  });
  ['How am I doing today?', 'How far did I walk?', 'How much water should I drink?', 'What should I eat tonight?', 'Should I stop my tablet?'].forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.onclick = () => sendChat(c); $('#askchips').appendChild(b);
  });

  $('#kgoal-set').onclick = setKcalGoal;
  $('#kgoal').addEventListener('keydown', (e) => { if (e.key === 'Enter') setKcalGoal(); });
  $('#w-plus').onclick = () => addWater(1);
  $('#w-bottle').onclick = () => addWater(3);
  $('#w-minus').onclick = removeWater;
  $('#steps-add').onclick = () => addSteps($('#steps-in').value);
  $('#steps-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSteps($('#steps-in').value); });
  $('#chatform').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q').value; $('#q').value = ''; sendChat(q); });
  $('#chat-clear').onclick = () => { st.chat = []; save(); renderChat(); };

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) $('#mic').hidden = true;
  else $('#mic').onclick = () => {
    const r = new SR(); r.lang = 'en-IN'; r.interimResults = false;
    $('#mic').textContent = '…'; $('#reply').hidden = false; $('#reply').className = 'reply'; $('#reply').textContent = 'Listening…';
    r.onresult = (ev) => { $('#say').value = (($('#say').value ? $('#say').value + ' ' : '') + ev.results[0][0].transcript).trim(); };
    r.onend = () => { $('#mic').textContent = '🎤'; $('#reply').hidden = true; };
    r.onerror = () => { $('#mic').textContent = '🎤'; };
    r.start();
  };

  $('#photo').onclick = () => {
    if (!live) { const el = $('#reply'); el.hidden = false; el.className = 'reply amber'; el.textContent = 'Photo reading needs the live AI. Please type what was on the plate.'; }
    else $('#file').click();
  };
  $('#file').onchange = (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => { // downscale so uploads stay small on weak connections
      const s = Math.min(1, 800 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      submit($('#say').value, c.toDataURL('image/jpeg', 0.7).split(',')[1]);
    };
    img.src = URL.createObjectURL(f); ev.target.value = '';
  };

  $('#share').onclick = () => {
    const txt = E.familySummary(st.profile.name, E.summarize(entriesOn(todayKey())), goals(), 'en');
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  };
  $('#reset').onclick = () => { if (confirm('Erase everything on this phone?')) { localStorage.removeItem(KEY); st = { profile: null, entries: [], chat: [] }; $('#reply').hidden = true; render(); } };

  // Made-up sample days so reviewers can see the adaptive goal without waiting.
  $('#sample').onclick = () => {
    st.entries = st.entries.filter((e) => e.sample !== true);
    [5, 0, 12].forEach((w, i) => {
      const d = new Date(); d.setDate(d.getDate() - (3 - i)); d.setHours(9, 0, 0, 0);
      st.entries.push({ id: 's' + i, ts: d.getTime(), sample: true, text: 'sample', meals: [{ name: 'roti', qty: 2, unit: 'pc', kcalLo: 140, kcalHi: 200, slot: 'lunch' }], water: 3, walkMin: w, steps: w * E.STEPS_PER_MIN, walkSkipped: w === 0, safety: { level: 'none', reasons: [] } });
    });
    save(); render();
  };

  // ---------------- boot ----------------
  fetch('api/coach').then((r) => (r.ok ? r.json() : { live: false })).then((j) => { live = !!j.live; render(); }).catch(() => render());
  render();
  setInterval(() => st.profile && render(), 5 * 60 * 1000); // keeps the nudge fresh
})();
