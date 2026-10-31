(function () {
  'use strict';
  const E = window.HealthEngine, TP = window.HealthTips;
  const KEY = 'dinchariya.v1';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const GLASS_ML = 250;
  const COLORS = { kcal: '#f2b84b', prot: '#ff8f7a', water: '#4cc9f0', steps: '#2fd46b' };

  let live = false, view = 'home', metric = 'steps', tipCat = 'all', tipsOpen = false;
  let st = load();

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)) || {}; return { profile: s.profile || null, entries: s.entries || [], chat: s.chat || [] }; }
    catch (e) { return { profile: null, entries: [], chat: [] }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  const dayKeyOffset = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return E.dayKey(d); };
  const todayKey = () => E.dayKey(new Date());
  const entriesOn = (k) => st.entries.filter((e) => E.dayKey(e.ts) === k);
  const sumOn = (k) => E.summarize(entriesOn(k));
  const newId = () => Date.now() + '' + Math.random().toString(16).slice(2, 6);
  const fmt = (n) => Number(n).toLocaleString('en-IN');
  const short = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n * 10) / 10));
  const mid = (a, b) => (a + b) / 2;

  function history() {
    const out = [];
    for (let i = 3; i >= 1; i--) { const k = dayKeyOffset(-i); out.push({ date: k, walkMin: sumOn(k).walkMin }); }
    const first = st.entries.length ? E.dayKey(Math.min.apply(null, st.entries.map((e) => e.ts))) : null; // days before first use are not "missed"
    return out.filter((h) => first && h.date >= first);
  }
  function goals() {
    const h = history(), walk = E.adaptiveWalkGoal(h, E.DEFAULT_GOALS.walkBase), steps = walk * E.STEPS_PER_MIN, p = st.profile || {};
    const ref = E.kcalReference(p), custom = p.kcalGoal || null;
    return { kcal: custom || ref || E.DEFAULT_GOALS.kcal, kcalSource: custom ? 'custom' : ref ? 'profile' : 'default', water: E.DEFAULT_GOALS.water, walkBase: E.DEFAULT_GOALS.walkBase, walk, steps, km: E.kmFromSteps(steps), hasHistory: h.length > 0, protein: E.proteinTarget(p) };
  }

  // ---------------- navigation ----------------
  function go(v, scrollId) {
    view = v;
    $$('.view').forEach((el) => { el.hidden = el.dataset.view !== v; });
    $$('#tabbar button').forEach((b) => { b.classList.toggle('on', b.dataset.go === v); b.setAttribute('aria-current', b.dataset.go === v ? 'page' : 'false'); });
    closeDrawer(true);
    if (v === 'me') fillProfileForm();
    render();
    const target = scrollId && document.getElementById(scrollId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo(0, 0);
  }
  function openDrawer() { $('#drawer').classList.add('open'); $('#drawer').inert = false; $('#scrim').hidden = false; $('#menu-btn').setAttribute('aria-expanded', 'true'); $('#menu-btn').setAttribute('aria-label', 'Close menu'); const f = $('#drawer button[data-go]'); if (f) f.focus(); }
  function closeDrawer(silent) {
    const d = $('#drawer'); if (!d.classList.contains('open')) return;
    d.classList.remove('open'); d.inert = true; $('#scrim').hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); $('#menu-btn').setAttribute('aria-label', 'Open menu');
    if (!silent) $('#menu-btn').focus();
  }
  let toastT;
  function toast(msg) {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 1800);
  }

  // ---------------- rendering ----------------
  function ring(pct, color, icon) {
    const r = 30, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
    return `<div class="ringwrap"><svg viewBox="0 0 72 72" class="ring" aria-hidden="true"><circle cx="36" cy="36" r="${r}" class="rb"/><circle cx="36" cy="36" r="${r}" class="rf" style="stroke:${color};stroke-dasharray:${(c * p).toFixed(1)} ${c.toFixed(1)}"/></svg><span class="ico" aria-hidden="true">${icon}</span></div>`;
  }
  function tile(el, color, icon, pct, label, value, sub) {
    el.innerHTML = ring(pct, color, icon) + '<div class="rtx"><span class="rl"></span><span class="rv"></span><span class="rs"></span></div>';
    el.querySelector('.rl').textContent = label; el.querySelector('.rv').textContent = value; el.querySelector('.rs').textContent = sub;
    el.setAttribute('aria-label', `${label}: ${value}, ${sub}`);
  }

  function streak() {
    let n = 0, off = entriesOn(todayKey()).length ? 0 : -1;
    while (entriesOn(dayKeyOffset(off)).length) { n++; off--; if (n > 365) break; }
    return n;
  }

  function weekData(g) {
    const defs = {
      steps: { label: 'Steps', get: (s) => s.steps, goal: g.steps, f: short },
      water: { label: 'Water', get: (s) => s.water, goal: g.water, f: short },
      kcal: { label: 'Calories', get: (s) => Math.round(mid(s.kcalLo, s.kcalHi)), goal: g.kcal, f: short },
      prot: { label: 'Protein', get: (s) => Math.round(mid(s.protLo, s.protHi)), goal: g.protein.status === 'ok' ? Math.round(mid(g.protein.lo, g.protein.hi)) : null, f: short },
    };
    const d = defs[metric], days = [];
    for (let i = 6; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); days.push({ label: dt.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3), v: d.get(sumOn(E.dayKey(dt))), today: i === 0 }); }
    return { d, days };
  }

  function renderHome(g, sum) {
    const now = new Date();
    $('#hello').textContent = 'Hello' + (st.profile && st.profile.name ? ', ' + st.profile.name : '');
    $('#date').textContent = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const n = E.nudge(now, sum, g, history());
    const nd = $('#nudge'); nd.textContent = n.en; nd.classList.toggle('warn', n.kind === 'walk-skipped');
    $('#setup').hidden = g.protein.status !== 'need-data';

    const km = mid(sum.kcalLo, sum.kcalHi);
    tile($('#r-kcal'), COLORS.kcal, '🔥', km / g.kcal, 'Calories', sum.kcalHi ? `${fmt(sum.kcalLo)}–${fmt(sum.kcalHi)}` : '0', `of ${fmt(g.kcal)} kcal`);
    const p = g.protein;
    if (p.status === 'ok') tile($('#r-prot'), COLORS.prot, '💪', mid(sum.protLo, sum.protHi) / mid(p.lo, p.hi), 'Protein', sum.protHi ? `${sum.protLo}–${sum.protHi} g` : '0 g', `of ${p.lo}–${p.hi} g`);
    else if (p.status === 'limited') tile($('#r-prot'), COLORS.prot, '💪', 0, 'Protein', sum.protHi ? `${sum.protLo}–${sum.protHi} g` : '0 g', 'follow your doctor');
    else tile($('#r-prot'), COLORS.prot, '💪', 0, 'Protein', sum.protHi ? `${sum.protLo}–${sum.protHi} g` : 'Set up', 'add age & weight');
    tile($('#r-water'), COLORS.water, '💧', sum.water / g.water, 'Water', `${sum.water}/${g.water}`, `glasses · ${(sum.water * GLASS_ML / 1000).toFixed(2).replace(/\.?0+$/, '') || 0} L`);
    tile($('#r-steps'), COLORS.steps, '🚶', sum.steps / g.steps, 'Steps', fmt(sum.steps), `of ${fmt(g.steps)} · ${sum.km.toFixed(1)} km`);

    // weekly chart
    const s = streak(); $('#streak').textContent = s ? `🔥 ${s}-day streak` : 'Log today to start a streak';
    const { d, days } = weekData(g), AREA = 108, top = Math.max(d.goal || 0, ...days.map((x) => x.v), 1);
    const chart = $('#chart'); chart.innerHTML = '';
    days.forEach((x) => {
      const col = document.createElement('div'); col.className = 'col' + (x.today ? ' today' : '');
      col.innerHTML = '<div class="val"></div><div class="barv"></div><div class="day"></div>';
      col.querySelector('.val').textContent = x.v ? d.f(x.v) : '';
      col.querySelector('.barv').style.height = Math.max(3, (x.v / top) * AREA) + 'px';
      col.querySelector('.day').textContent = x.today ? 'Today' : x.label;
      chart.appendChild(col);
    });
    if (d.goal) { const gl = document.createElement('div'); gl.className = 'goal'; gl.style.bottom = (22 + (d.goal / top) * AREA) + 'px'; chart.appendChild(gl); }
    const best = days.reduce((a, b) => (b.v > a.v ? b : a), days[0]);
    $('#chart-note').textContent = (best.v ? `${d.label}, last 7 days. Best day: ${best.today ? 'today' : best.label} (${fmt(best.v)}).` + (metric === 'kcal' || metric === 'prot' ? ' Midpoint of the estimated range.' : '') : `${d.label}: nothing logged in the last 7 days yet.`) + (d.goal ? ` Dashed line = your goal (${fmt(d.goal)}).` : '');
    chart.setAttribute('aria-label', `${d.label} for the last 7 days: ` + days.map((x) => `${x.today ? 'today' : x.label} ${x.v}`).join(', '));
    $$('#metricchips button').forEach((b) => b.classList.toggle('on', b.dataset.m === metric));

    const tip = TP.pickDaily(todayKey(), sum, g)[0];
    $('#teaser').innerHTML = '<span class="kick">Today\'s health digest</span><b></b><span></span>';
    $('#teaser').querySelector('b').textContent = tip.title; $('#teaser span:last-child').textContent = tip.body.length > 110 ? tip.body.slice(0, 108).replace(/\s+\S*$/, '') + '… Read more' : tip.body;
  }

  function renderTrack(g, sum) {
    const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snacks', dinner: 'Dinner' };
    $('#k-val').textContent = sum.kcalHi ? `${fmt(sum.kcalLo)}–${fmt(sum.kcalHi)}` : '0';
    const m = mid(sum.kcalLo, sum.kcalHi);
    $('#b-kcal').style.width = Math.min(100, (m / g.kcal) * 100) + '%';
    $('#b-kcal').parentElement.classList.toggle('over', m > g.kcal * 1.1);
    $('#k-prot').textContent = sum.protHi ? `Protein so far: about ${sum.protLo}–${sum.protHi} g` + (g.protein.status === 'ok' ? ` (daily range ${g.protein.lo}–${g.protein.hi} g)` : '') : '';
    $('#k-empty').hidden = sum.meals.length > 0;
    $('#k-ref').textContent = (g.kcalSource === 'custom' ? `Your target: ${fmt(g.kcal)} kcal a day.`
      : g.kcalSource === 'profile' ? `Estimated from your age, weight and height: about ${fmt(g.kcal)} kcal a day to stay at your weight. Ask your doctor or dietitian for yours.`
      : `Reference: about ${fmt(g.kcal)} kcal a day is a common figure for older adults. Add your details in Me for a closer estimate, and ask your doctor or dietitian for yours.`) +
      (m > g.kcal * 1.1 ? ' You are above it today; a lighter, earlier dinner is an easy way to balance.' : '');
    const ks = $('#k-slots'); ks.innerHTML = '';
    E.SLOTS.forEach((sl) => {
      const b = sum.bySlot[sl]; if (!b.items.length) return;
      const wrap = document.createElement('div'); wrap.className = 'slot';
      const head = document.createElement('div'); head.className = 'slothead';
      head.innerHTML = '<b></b><span></span>'; head.firstChild.textContent = SLOT_LABEL[sl]; head.lastChild.textContent = `${fmt(b.lo)}–${fmt(b.hi)} kcal`;
      const ul = document.createElement('ul'); ul.className = 'items';
      b.items.forEach((it) => {
        const li = document.createElement('li');
        const n = document.createElement('span'); n.className = 'n'; n.textContent = `${it.qty !== 1 ? it.qty + ' × ' : ''}${it.name}${it.assumed ? ' (1 assumed)' : ''}`;
        const c = document.createElement('span'); c.className = 'c'; c.textContent = `${it.kcalLo}–${it.kcalHi} kcal` + (it.protHi ? ` · ${it.protLo}–${it.protHi} g protein` : '');
        const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove ' + it.name);
        x.onclick = () => removeMeal(it.entryId, it.idx);
        li.append(n, c, x); ul.appendChild(li);
      });
      wrap.append(head, ul); ks.appendChild(wrap);
    });

    $('#w-val').textContent = `${sum.water} / ${g.water}`;
    $('#w-sub').textContent = `glasses · ${(sum.water * GLASS_ML / 1000).toFixed(2).replace(/\.?0+$/, '') || 0} L`;
    $('#b-water').style.width = Math.min(100, (sum.water / g.water) * 100) + '%';
    const gl = $('#glasses'); gl.innerHTML = '';
    for (let i = 0; i < Math.max(g.water, sum.water); i++) { const s = document.createElement('span'); s.textContent = '💧'; if (i < sum.water) s.className = 'on'; gl.appendChild(s); }
    $('#w-minus').disabled = sum.water <= 0;

    $('#s-steps').textContent = fmt(sum.steps); $('#s-km').textContent = sum.km.toFixed(2); $('#s-min').textContent = sum.walkMin;
    $('#b-steps').style.width = Math.min(100, (sum.steps / g.steps) * 100) + '%';
    $('#walk-why').textContent = `Today's goal: ${fmt(g.steps)} steps (${g.km} km, ${g.walk} min)` + (g.hasHistory ? (g.walk < g.walkBase ? ', made smaller to match your week.' : ', it grows slowly with you.') : '.');

    const ul = $('#log'); ul.innerHTML = '';
    const todays = entriesOn(todayKey()).slice().reverse();
    $('#empty').hidden = todays.length > 0;
    todays.forEach((e) => {
      const li = document.createElement('li'), d = document.createElement('div'), bits = [];
      (e.meals || []).forEach((mm) => bits.push(mm.skipped ? `✗ ${mm.name}` : `${mm.qty !== 1 ? mm.qty + ' ' : ''}${mm.name}`));
      if (e.water) bits.push(`💧 ${e.water > 0 ? '+' : '−'}${Math.abs(e.water)}`);
      if (e.steps) bits.push(`🚶 ${fmt(e.steps)} steps, ${E.kmFromSteps(e.steps)} km${e.stepsEst ? ' (est.)' : ''}`); else if (e.walkMin) bits.push(`🚶 ${e.walkMin} min`);
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
  }

  function tipCard(t, small) {
    const d = document.createElement('article'); d.className = 'tip' + (small ? ' small' : '');
    if (t.why) { const w = document.createElement('span'); w.className = 'why2'; w.textContent = t.why; d.appendChild(w); }
    const c = document.createElement('span'); c.className = 'chip'; c.textContent = TP.CATS[t.cat]; d.appendChild(c);
    const h = document.createElement('h3'); h.textContent = t.title; d.appendChild(h);
    const p = document.createElement('p'); p.textContent = t.body; d.appendChild(p);
    if (t.src) { const s = document.createElement('span'); s.className = 'src'; s.textContent = 'Based on ' + t.src + ' guidance'; d.appendChild(s); }
    return d;
  }
  function renderTips(g, sum) {
    $('#tips-date').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · 3 tips for today';
    const t = $('#tips-today'); t.innerHTML = ''; TP.pickDaily(todayKey(), sum, g).forEach((x) => t.appendChild(tipCard(x)));
    const e = $('#tips-earlier'); e.innerHTML = '';
    for (let i = 1; i <= 3; i++) { const k = dayKeyOffset(-i), x = TP.pickDaily(k, null, g)[0]; const lab = document.createElement('div'); lab.className = 'why'; lab.textContent = new Date(k.replace(/-/g, '/')).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }); e.appendChild(lab); e.appendChild(tipCard(x, true)); }
    const cats = $('#tipcats'); cats.innerHTML = '';
    [['all', 'All'], ...Object.entries(TP.CATS)].forEach(([k, label]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (k === tipCat) b.className = 'on'; b.onclick = () => { tipCat = k; tipsOpen = false; renderTips(g, sum); }; cats.appendChild(b); });
    const all = $('#tips-all'); all.innerHTML = '';
    const list = TP.TIPS.filter((x) => tipCat === 'all' || x.cat === tipCat), shown = tipsOpen ? list : list.slice(0, 4);
    shown.forEach((x) => all.appendChild(tipCard(x, true)));
    if (list.length > 4) { const m = document.createElement('button'); m.type = 'button'; m.className = 'full'; m.textContent = tipsOpen ? 'Show fewer' : `Show all ${list.length} tips`; m.onclick = () => { tipsOpen = !tipsOpen; renderTips(g, sum); }; all.appendChild(m); }
  }

  function fillProfileForm() {
    const p = st.profile || {};
    $('#pf-name').value = p.name || ''; $('#pf-age').value = p.age || ''; $('#pf-weight').value = p.weightKg || ''; $('#pf-height').value = p.heightCm || '';
    $('#pf-sex').value = p.sex || ''; $('#pf-activity').value = p.activity || 'low'; $('#pf-plimit').checked = !!p.proteinLimit; $('#pf-msg').textContent = '';
  }
  function renderMe(g, sum) {
    const p = g.protein, body = $('#prot-body'); body.innerHTML = '';
    const add = (html) => { const d = document.createElement('div'); d.innerHTML = html; body.appendChild(d); return d; };
    const prof = st.profile || {};
    if (p.status === 'ok') {
      add(`<div class="protbig">${p.lo}–${p.hi} g</div><p class="muted">a day, or about ${p.perMealLo}–${p.perMealHi} g at each of 3 meals</p>`);
      add(`<div class="protrow"><div><span class="v">${sum.protHi ? sum.protLo + '–' + sum.protHi : '0'} g</span><span class="k">so far today (rough)</span></div><div><span class="v">${p.perKgLo}–${p.perKgHi}</span><span class="k">g per kg of body weight</span></div></div>`);
      const ref = E.kcalReference(prof);
      if (ref) add(`<p class="muted">Calorie reference for your age, size and activity: about <b>${fmt(ref)} kcal</b> a day to stay at your weight (estimate).</p>`);
      add('<p class="why">How this is worked out: a general range per kg of body weight for your age and activity, multiplied by your weight. It is a general guide, not a prescription. Ask your doctor or dietitian, especially if you have kidney, liver or other conditions.</p>');
    } else if (p.status === 'limited') {
      add('<p>You told me your doctor has limited your protein, so I will not show a target. Please follow your doctor\'s advice. I will still keep a rough count of what you eat so you can share it with them.</p>');
    } else {
      add('<p>Add your <b>age</b> and <b>weight</b> above and I will work out a daily protein range.</p><p class="muted">In general, adults need about 0.8–1.0 g of protein per kg of body weight a day, and many older adults do better with 1.0–1.2 g per kg. If you have kidney disease, follow your doctor.</p>');
    }
    add('<p class="why">Good sources: dal, chana, rajma, curd, paneer, milk, eggs, fish, chicken, soya chunks, sprouts and nuts.</p>');
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

  function render(typing) {
    const has = !!st.profile;
    $('#onboard').hidden = has; $('#main').hidden = !has; $('#appbar').hidden = !has; $('#tabbar').hidden = !has;
    if (!has) return;
    const g = goals(), sum = sumOn(todayKey());
    $('#d-name').textContent = (st.profile.name || 'Menu'); $('#d-sub').textContent = live ? 'Live AI' : 'Demo mode';
    $('#mode').textContent = live ? 'Live AI' : 'Demo mode (works offline)';
    if (view === 'home') renderHome(g, sum);
    if (view === 'track') renderTrack(g, sum);
    if (view === 'tips') renderTips(g, sum);
    if (view === 'me') renderMe(g, sum);
    if (view === 'chat') renderChat(typing);
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
        const sum = sumOn(todayKey());
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
    const after = sumOn(todayKey());
    if (!empty && r.safety.level !== 'red' && r.meals.some((m) => !m.skipped) && after.kcalHi) r.reply += ` Today so far: about ${fmt(after.kcalLo)}–${fmt(after.kcalHi)} kcal` + (after.protHi ? ` and ${after.protLo}–${after.protHi} g protein.` : '.');
    showReply(r); $('#say').value = ''; render();
  }

  // ---------------- calories, water, steps ----------------
  function removeMeal(entryId, idx) {
    const e = st.entries.find((x) => x.id === entryId); if (!e) return;
    e.meals.splice(idx, 1);
    const empty = !e.meals.length && !e.water && !e.walkMin && !e.steps && !e.walkSkipped && !e.bp && e.sugar == null && (!e.safety || e.safety.level === 'none');
    if (empty) st.entries = st.entries.filter((x) => x !== e);
    save(); render();
  }
  function setKcalGoal() {
    const v = $('#kgoal').value.trim();
    if (!v) delete st.profile.kcalGoal;
    else { const n = Math.round(+v); if (!(n >= 800 && n <= 4000)) { $('#k-ref').textContent = 'Please enter a number between 800 and 4,000, or leave it blank to use the reference figure.'; return; } st.profile.kcalGoal = n; }
    $('#kgoal').value = ''; save(); render();
  }
  function addWater(n) { pushEntry({ quick: 'water', water: n }); toast(n === 1 ? 'Added 1 glass' : `Added ${n} glasses`); render(); }
  function removeWater() {
    if (sumOn(todayKey()).water <= 0) return;
    const mine = entriesOn(todayKey()).filter((e) => e.quick === 'water' && e.water > 0);
    if (mine.length) {
      const last = mine[mine.length - 1];
      if (last.water > 1) last.water -= 1; else st.entries = st.entries.filter((e) => e.id !== last.id); // remove exactly one glass
      save();
    } else pushEntry({ quick: 'water', water: -1 });
    render();
  }
  function addSteps(n, fromHome) {
    n = Math.round(+n);
    if (!(n >= 1 && n <= 40000)) { $('#walk-why').textContent = 'Please enter steps between 1 and 40,000.'; return; }
    pushEntry({ quick: 'steps', steps: n, walkMin: Math.round(n / E.STEPS_PER_MIN) });
    $('#steps-in').value = ''; toast(`Added ${fmt(n)} steps`); render();
  }

  // ---------------- profile ----------------
  function saveProfile() {
    const num = (id) => { const v = $(id).value.trim(); return v === '' ? null : +v; };
    const age = num('#pf-age'), w = num('#pf-weight'), h = num('#pf-height'), msg = $('#pf-msg');
    if (age != null && !(age >= 18 && age <= 110)) { msg.textContent = 'Age should be between 18 and 110.'; return; }
    if (w != null && !(w >= 30 && w <= 200)) { msg.textContent = 'Weight should be between 30 and 200 kg.'; return; }
    if (h != null && !(h >= 100 && h <= 230)) { msg.textContent = 'Height should be between 100 and 230 cm.'; return; }
    Object.assign(st.profile, { name: $('#pf-name').value.trim(), age, weightKg: w, heightCm: h, sex: $('#pf-sex').value, activity: $('#pf-activity').value, proteinLimit: $('#pf-plimit').checked });
    save(); render(); msg.textContent = 'Saved. Your targets are updated.'; toast('Saved');
  }

  // ---------------- chat assistant ----------------
  async function sendChat(q) {
    q = (q || '').trim(); if (!q) return;
    const btn = $('#ask'); btn.disabled = true;
    const sum = sumOn(todayKey()), g = goals();
    const ctx = { summary: { water: sum.water, walkMin: sum.walkMin, steps: sum.steps, km: sum.km, kcalLo: sum.kcalLo, kcalHi: sum.kcalHi, protLo: sum.protLo, protHi: sum.protHi, meals: sum.meals.map((m) => m.name) },
      goals: { water: g.water, walk: g.walk, steps: g.steps, km: g.km, kcal: g.kcal, protein: g.protein }, history: history().map((x) => ({ date: x.date, walkMin: x.walkMin })) };
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

  // ---------------- sample data ----------------
  function sampleWeek() {
    st.entries = st.entries.filter((e) => e.sample !== true);
    const walks = [20, 15, 30, 5, 0, 12], waters = [5, 6, 4, 3, 2, 3];
    const mk = (name, qty, unit, kl, kh, pl, ph, slot) => ({ name, qty, unit, kcalLo: kl * qty, kcalHi: kh * qty, protLo: pl * qty, protHi: ph * qty, slot });
    walks.forEach((w, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(9, 0, 0, 0);
      const meals = [mk('roti', 2, 'pc', 70, 100, 2.5, 3.5, 'lunch'), mk('dal', 1, 'katori', 100, 150, 6, 9, 'lunch'), mk('sabzi', 1, 'katori', 80, 150, 1.5, 3, 'lunch')];
      if (i % 2 === 0) meals.push(mk('idli', 3, 'pc', 40, 60, 1.5, 2.5, 'breakfast'));
      if (i % 3 !== 1) meals.push(mk('curd', 1, 'katori', 60, 100, 3, 5, 'dinner'), mk('khichdi', 1, 'katori', 150, 220, 5, 8, 'dinner'));
      st.entries.push({ id: 's' + i, ts: d.getTime(), sample: true, text: 'sample', meals, water: waters[i], walkMin: w, steps: w * E.STEPS_PER_MIN, walkSkipped: w === 0, safety: { level: 'none', reasons: [] } });
    });
    save(); render(); toast('Sample week loaded');
  }

  // ---------------- wiring ----------------
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-go]');
    if (b) { ev.preventDefault(); go(b.dataset.go, b.dataset.scroll); }
  });
  $('#menu-btn').onclick = () => ($('#drawer').classList.contains('open') ? closeDrawer() : openDrawer());
  $('#menu-close').onclick = () => closeDrawer();
  $('#scrim').onclick = () => closeDrawer();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  $('#start').onclick = () => { st.profile = { name: $('#name').value.trim() }; save(); go('home'); };
  $('#send').onclick = () => submit($('#say').value);
  $('#say').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit($('#say').value); });

  ['2 roti, dal, sabzi', 'one glass of water', '20 minute walk', 'did not walk today'].forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c;
    b.onclick = () => { const s = $('#say'); s.value = (s.value ? s.value + ', ' : '') + c; s.focus(); }; $('#chips').appendChild(b);
  });
  [['+1,000 steps', 1000], ['+2,000 steps', 2000], ['+1 km', Math.round(1 / E.STEP_KM)]].forEach(([label, n]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => addSteps(n); $('#stepchips').appendChild(b);
  });
  ['How am I doing today?', 'How much protein do I need?', 'How far did I walk?', 'What should I eat tonight?', 'Should I stop my tablet?'].forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.onclick = () => sendChat(c); $('#askchips').appendChild(b);
  });
  [['steps', 'Steps'], ['water', 'Water'], ['kcal', 'Calories'], ['prot', 'Protein']].forEach(([k, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.m = k; b.textContent = label; b.onclick = () => { metric = k; render(); }; $('#metricchips').appendChild(b);
  });

  $('#q-water').onclick = () => addWater(1);
  $('#q-steps').onclick = () => addSteps(1000);
  $('#q-log').onclick = () => { go('track', 'logcard'); setTimeout(() => $('#say').focus({ preventScroll: true }), 350); };
  $('#q-ask').onclick = () => { go('chat'); setTimeout(() => $('#q').focus({ preventScroll: true }), 100); };
  $('#kgoal-set').onclick = setKcalGoal;
  $('#kgoal').addEventListener('keydown', (e) => { if (e.key === 'Enter') setKcalGoal(); });
  $('#w-plus').onclick = () => addWater(1);
  $('#w-bottle').onclick = () => addWater(3);
  $('#w-minus').onclick = removeWater;
  $('#steps-add').onclick = () => addSteps($('#steps-in').value);
  $('#steps-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') addSteps($('#steps-in').value); });
  $('#pf-save').onclick = saveProfile;
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

  const share = () => { const txt = E.familySummary(st.profile.name, sumOn(todayKey()), goals(), 'en'); closeDrawer(true); window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener'); };
  const reset = () => { closeDrawer(true); if (confirm('Erase everything on this phone?')) { localStorage.removeItem(KEY); st = { profile: null, entries: [], chat: [] }; view = 'home'; $('#reply').hidden = true; render(); window.scrollTo(0, 0); } };
  const sample = () => { closeDrawer(true); sampleWeek(); };
  $('#share').onclick = share; $('#d-share').onclick = share;
  $('#reset').onclick = reset; $('#d-reset').onclick = reset;
  $('#sample').onclick = sample; $('#d-sample').onclick = sample;

  // ---------------- boot ----------------
  fetch('api/coach').then((r) => (r.ok ? r.json() : { live: false })).then((j) => { live = !!j.live; render(); }).catch(() => render());
  go('home');
  setInterval(() => st.profile && render(), 5 * 60 * 1000); // keeps nudges and the date fresh
})();
