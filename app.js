(function () {
  'use strict';
  const E = window.HealthEngine, TP = window.HealthTips, W = window.HealthWalk, PL = window.HealthPlans, WT = window.HealthWatch, F = window.HealthFit, CM = window.HealthCommunity;
  const KEY = 'dinchariya.v1'; // storage key kept from the first version so saved notes survive the rename
  // ---- languages: English, Hindi (Devanagari), Hinglish (Roman). The screen translator lives in i18n.js ----
  const I18N = window.HealthI18n;
  I18N.load(window.HealthStrings || []); I18N.load(E.foodRows());
  I18N.attach(document);
  // Hindi and Hinglish are still being finished. Keep this false until tests/browser-i18n.js reports no missing translations:
  // while it is false the app is English only, the language pickers are hidden and no saved language is applied.
  const LANGUAGES_ENABLED = false;
  if (LANGUAGES_ENABLED) { try { I18N.setLang(localStorage.getItem('dinchariya.lang')); } catch (e) { /* private mode: stay in English */ } }
  const T = (s) => I18N.tr(s), LANG = () => I18N.lang, LOC = () => (I18N.lang === 'hi' ? 'hi-IN' : 'en-IN');
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const GLASS_ML = 250;
  const COLORS = { kcal: '#f2b84b', prot: '#ff8f7a', water: '#4cc9f0', steps: '#2fd46b' };

  let lastUpdated = new Date();
  let map = null, line = null, startM = null, endM = null, tracking = null;
  let chatOpen = false, live = false, view = 'home', metric = 'steps', tipCat = 'all', tipsOpen = false;
  let st = load();

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)) || {}; return { profile: s.profile || null, entries: s.entries || [], chat: s.chat || [], plan: s.plan || null, redeemed: s.redeemed || [], ai: s.ai || null, friends: s.friends || [], groups: s.groups || [], challenge: s.challenge || null, challengeLog: s.challengeLog || [] }; }
    catch (e) { return blank(); }
  }
  function blank() { return { profile: null, entries: [], chat: [], plan: null, redeemed: [], ai: null, friends: [], groups: [], challenge: null, challengeLog: [] }; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  const dayKeyOffset = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return E.dayKey(d); };
  const todayKey = () => E.dayKey(new Date());
  const entriesOn = (k) => st.entries.filter((e) => E.dayKey(e.ts) === k);
  const sumOn = (k) => E.summarize(entriesOn(k));
  const newId = () => Date.now() + '' + Math.random().toString(16).slice(2, 6);
  const fmt = (n) => Number(n).toLocaleString(LOC());
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
    if (v === 'chat') { closeDrawer(true); openChat(); return; }
    closeChat(true);
    view = v;
    $$('.view').forEach((el) => { el.hidden = el.dataset.view !== v; });
    $$('#tabbar button').forEach((b) => { b.classList.toggle('on', b.dataset.go === v); b.setAttribute('aria-current', b.dataset.go === v ? 'page' : 'false'); });
    closeDrawer(true);
    if (v === 'me') { fillProfileForm(); fillEmergency(); }
    render();
    const target = scrollId && document.getElementById(scrollId);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo(0, 0);
  }
  function openChat() {
    chatOpen = true; $('#chatpanel').hidden = false; $('#chat-fab').hidden = true; $('#chat-fab').setAttribute('aria-expanded', 'true');
    updateChatMeta();
    renderChat(); setTimeout(() => $('#q').focus({ preventScroll: true }), 50);
  }
  function closeChat(silent) {
    if (!chatOpen) return;
    chatOpen = false; $('#chatpanel').hidden = true; $('#chat-fab').hidden = !st.profile; $('#chat-fab').setAttribute('aria-expanded', 'false');
    if (!silent) $('#chat-fab').focus();
  }
  function openDrawer() { $('#drawer').classList.add('open'); $('#drawer').inert = false; $('#scrim').hidden = false; $('#menu-btn').setAttribute('aria-expanded', 'true'); $('#menu-btn').setAttribute('aria-label', 'Close menu'); const f = $('#drawer button[data-go]'); if (f) f.focus(); }
  function closeDrawer(silent) {
    const d = $('#drawer'); if (!d.classList.contains('open')) return;
    d.classList.remove('open'); d.inert = true; $('#scrim').hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); $('#menu-btn').setAttribute('aria-label', 'Open menu');
    if (!silent) $('#menu-btn').focus();
  }
  let toastT;
  function toast(msg, ms) {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), ms || 1800);
  }

  // ---------------- rendering ----------------
  function ring(pct, color, icon) {
    const r = 30, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
    return `<div class="ringwrap"><svg viewBox="0 0 72 72" class="ring" aria-hidden="true"><circle cx="36" cy="36" r="${r}" class="rb"/><circle cx="36" cy="36" r="${r}" class="rf" style="stroke:${color};stroke-dasharray:${(c * p).toFixed(1)} ${c.toFixed(1)}"/></svg><span class="ico" aria-hidden="true">${icon}</span></div>`;
  }
  function tile(el, color, icon, pct, label, value, sub) {
    el.innerHTML = ring(pct, color, icon) + '<div class="rtx"><span class="rl"></span><span class="rv"></span><span class="rs"></span></div>';
    el.querySelector('.rl').textContent = label; el.querySelector('.rv').textContent = value; el.querySelector('.rs').textContent = sub;
    el.setAttribute('aria-label', `${T(label)}: ${T(String(value))}, ${T(sub)}`);
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
    for (let i = 6; i >= 0; i--) { const dt = new Date(); dt.setDate(dt.getDate() - i); days.push({ label: dt.toLocaleDateString(LOC(), { weekday: 'short' }).slice(0, 3), v: d.get(sumOn(E.dayKey(dt))), today: i === 0 }); }
    return { d, days };
  }

  function renderHome(g, sum) {
    const now = new Date();
    const hello = $('#hello'), nm0 = st.profile && st.profile.name; hello.textContent = ''; hello.append('Hello' + (nm0 ? ',' : ''));
    if (nm0) { hello.append(' '); const sp = document.createElement('span'); sp.setAttribute('translate', 'no'); sp.textContent = nm0; hello.append(sp); } // a name is never translated
    $('#date').textContent = now.toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long' });
    $('#updated').textContent = 'Updated ' + lastUpdated.toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
    const n = E.nudge(now, sum, g, history());
    const nd = $('#nudge'); nd.textContent = n[LANG()]; nd.classList.toggle('warn', n.kind === 'walk-skipped');
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
    chart.setAttribute('aria-label', T(`${d.label} for the last 7 days`) + ': ' + days.map((x) => `${x.today ? T('today') : x.label} ${x.v}`).join(', '));
    $$('#metricchips button').forEach((b) => b.classList.toggle('on', b.dataset.m === metric));

    renderRewardTile();
    renderSnapshot();
    renderCommunityTile();
    const tip = TP.pickDaily(todayKey(), sum, g)[0];
    $('#teaser').innerHTML = '<span class="kick">Today\'s health digest</span><b></b><span></span>';
    $('#teaser').querySelector('b').textContent = tip.title;
    const body = T(tip.body), tb = $('#teaser span:last-child'); tb.setAttribute('translate', 'no'); // translate the whole tip first, then shorten it
    tb.textContent = body.length > 110 ? body.slice(0, 108).replace(/\s+\S*$/, '') + '… ' + T('Read more') : body;
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
      if (e.quick === 'workout') { const a = F.ACTIVITIES.find((x) => x.id === e.activity); bits.push(`🏋 ${a ? a.label : 'Workout'} ${e.activeMin} min · ~${e.burn || 0} kcal`); }
      if (e.quick === 'sleep') bits.push(`😴 ${e.sleepH} h sleep`);
      if (e.quick === 'weight') bits.push(`⚖ ${e.kg} kg`);
      if (e.hr) bits.push(`♥ avg ${e.hr.avg} · max ${e.hr.max}`);
      if (e.safety && e.safety.level !== 'none') bits.push('⚠ tell your doctor');
      d.innerHTML = '<div class="t"></div><div class="b"></div>';
      d.querySelector('.t').textContent = new Date(e.ts).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
      d.querySelector('.b').textContent = bits.join(' · ') || e.text;
      const del = document.createElement('button'); del.textContent = '🗑'; del.setAttribute('aria-label', 'Remove this note');
      del.onclick = () => { if (confirm(T('Remove this note?'))) { st.entries = st.entries.filter((x) => x.id !== e.id); save(); render(); } };
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
    $('#tips-date').textContent = new Date().toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' · 3 tips for today';
    const t = $('#tips-today'); t.innerHTML = ''; TP.pickDaily(todayKey(), sum, g).forEach((x) => t.appendChild(tipCard(x)));
    const e = $('#tips-earlier'); e.innerHTML = '';
    for (let i = 1; i <= 3; i++) { const k = dayKeyOffset(-i), x = TP.pickDaily(k, null, g)[0]; const lab = document.createElement('div'); lab.className = 'why'; lab.textContent = new Date(k.replace(/-/g, '/')).toLocaleDateString(LOC(), { weekday: 'long', day: 'numeric', month: 'short' }); e.appendChild(lab); e.appendChild(tipCard(x, true)); }
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
      if (ref) add(`<p class="muted">Calorie reference for your age, size and activity: about ${fmt(ref)} kcal a day to stay at your weight (estimate).</p>`);
      add('<p class="why">How this is worked out: a general range per kg of body weight for your age and activity, multiplied by your weight. It is a general guide, not a prescription. Ask your doctor or dietitian, especially if you have kidney, liver or other conditions.</p>');
    } else if (p.status === 'limited') {
      add('<p>You told me your doctor has limited your protein, so I will not show a target. Please follow your doctor\'s advice. I will still keep a rough count of what you eat so you can share it with them.</p>');
    } else {
      add('<p>Add your age and weight above and I will work out a daily protein range.</p><p class="muted">In general, adults need about 0.8–1.0 g of protein per kg of body weight a day, and many older adults do better with 1.0–1.2 g per kg. If you have kidney disease, follow your doctor.</p>');
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
    if (typing) { const d = document.createElement('div'); d.className = 'msg bot typing'; d.textContent = T('Thinking…'); box.appendChild(d); }
    box.scrollTop = box.scrollHeight;
    $('#askchips').hidden = st.chat.length > 0;
  }

  function render(typing) {
    const has = !!st.profile;
    $('#onboard').hidden = has; $('#main').hidden = !has; $('#appbar').hidden = !has; $('#tabbar').hidden = !has;
    $('#chat-fab').hidden = !has || chatOpen; if (!has && chatOpen) closeChat(true);
    if (!has) return;
    const g = goals(), sum = sumOn(todayKey());
    const dn = $('#d-name'); dn.textContent = st.profile.name || 'Menu'; dn.setAttribute('translate', st.profile.name ? 'no' : 'yes'); $('#d-sub').textContent = live ? 'Live AI' : 'Demo mode';
    $('#mode').textContent = live ? 'Live AI' : 'Demo mode (works offline)';
    if (view === 'home') renderHome(g, sum);
    if (view === 'track') renderTrack(g, sum);
    if (view === 'tips') renderTips(g, sum);
    if (view === 'me') renderMe(g, sum);
    if (view === 'track') renderBody();
    if (view === 'walk') { renderWalk(); renderHr(); }
    if (view === 'me') renderEmergency();
    if (view === 'community') renderCommunity();
    checkChallenge();
    if (view === 'rewards') renderRewards();
    if (view === 'plans') renderPlans();
    renderPro(); updateChatMeta();
    if (chatOpen) renderChat(typing);
  }

  // ---------------- logging by text / voice / photo ----------------
  function showReply(r) {
    const el = $('#reply'); el.hidden = false; el.textContent = r.reply;
    el.className = 'reply' + (r.safety && r.safety.level === 'red' ? ' red' : r.safety && r.safety.level === 'amber' ? ' amber' : '');
  }
  async function analyze(text, image) {
    const now = new Date(), local = E.analyze(text, { lang: LANG(), now });
    if (local.safety.level === 'red') return { ...local, source: 'safety' }; // never waits for the network
    if (live) {
      try {
        const sum = sumOn(todayKey());
        const r = await fetch('api/coach', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(16000),
          body: JSON.stringify({ text, image, lang: LANG(), now: now.toISOString(), context: { water: sum.water, walkMin: sum.walkMin } }) });
        if (r.ok) return await r.json();
      } catch (e) { /* offline: fall back to the local parser */ }
    }
    if (image && !text) return { ...local, reply: T('Photo reading needs the live AI. Please type what was on the plate.') };
    return local;
  }
  function pushEntry(o) { st.entries.push({ id: newId(), ts: Date.now(), text: '', meals: [], water: 0, walkMin: 0, steps: 0, walkSkipped: false, safety: { level: 'none', reasons: [] }, ...o }); save(); }

  async function submit(text, image) {
    text = (text || '').trim();
    if (!text && !image) return;
    const btn = $('#send'); btn.disabled = true;
    const rep = $('#reply'); rep.hidden = false; rep.className = 'reply'; rep.textContent = T('One moment…');
    const r = await analyze(text, image);
    btn.disabled = false;
    const empty = !r.meals.length && !r.water && !r.walkMin && !r.steps && !r.walkSkipped && !r.bp && r.sugar == null && r.safety.level === 'none';
    if (!empty) withRewardCheck(() => pushEntry({ text: r.safety.level === 'red' ? '' : text, meals: r.meals, water: r.water, walkMin: r.walkMin, steps: r.steps || 0, stepsEst: !!r.stepsEst, walkSkipped: r.walkSkipped, bp: r.bp, sugar: r.sugar, safety: r.safety }));
    const after = sumOn(todayKey());
    if (!empty && r.safety.level !== 'red' && r.meals.some((m) => !m.skipped) && after.kcalHi) r.reply += ' ' + T(`Today so far: about ${fmt(after.kcalLo)}–${fmt(after.kcalHi)} kcal` + (after.protHi ? ` and ${after.protLo}–${after.protHi} g protein.` : '.'));
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
    toast(`Added ${fmt(n)} steps`);
    withRewardCheck(() => pushEntry({ quick: 'steps', steps: n, walkMin: Math.round(n / E.STEPS_PER_MIN) })); // celebration toast replaces the plain one
    $('#steps-in').value = ''; render();
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
    const ctx = { lang: LANG(), summary: { water: sum.water, walkMin: sum.walkMin, steps: sum.steps, km: sum.km, kcalLo: sum.kcalLo, kcalHi: sum.kcalHi, protLo: sum.protLo, protHi: sum.protHi, meals: sum.meals.map((m) => m.name) },
      goals: { water: g.water, walk: g.walk, steps: g.steps, km: g.km, kcal: g.kcal, protein: g.protein }, history: history().map((x) => ({ date: x.date, walkMin: x.walkMin })) };
    const prior = st.chat.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    let r = E.answerQuery(q, ctx);
    // Free plan: limited AI questions per day. Safety answers (red flags, symptoms, medicine) are NEVER limited or counted.
    const exempt = r.safety.level !== 'none' || r.topic === 'medicine';
    if (!isPrem() && !exempt) {
      if (aiUsed() >= PL.FREE.aiPerDay) {
        st.chat.push({ role: 'user', content: q }, { role: 'assistant', content: T(`You have used today's ${PL.FREE.aiPerDay} free questions. They reset tomorrow, or Premium gives unlimited questions. Emergency and safety help is always free.`), level: 'amber' });
        st.chat = st.chat.slice(-30); save(); btn.disabled = false; renderChat(); updateChatMeta(); return;
      }
      st.ai = { day: todayKey(), n: aiUsed() + 1 }; save();
    }
    st.chat.push({ role: 'user', content: q }); renderChat(true);
    if (r.safety.level !== 'red' && r.topic !== 'medicine' && live) { // red flags and medicine never wait for the network
      try {
        const x = await fetch('api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ question: q, context: ctx, history: prior, lang: LANG() }) });
        if (x.ok) r = await x.json();
      } catch (e) { /* offline: keep the local answer */ }
    }
    st.chat.push({ role: 'assistant', content: r.answer, level: r.safety && r.safety.level });
    st.chat = st.chat.slice(-30); save();
    btn.disabled = false; renderChat(); updateChatMeta();
  }

  // ---------------- sample data ----------------
  function sampleWeek() {
    st.entries = st.entries.filter((e) => e.sample !== true);
    const walks = [100, 96, 118, 5, 0, 12], stepsArr = [10800, 10200, 12400, 500, 0, 1200], waters = [5, 6, 4, 3, 2, 3]; // first three days reach 10,000 steps, so the reward streak is visible
    const mk = (name, qty, unit, kl, kh, pl, ph, slot) => ({ name, qty, unit, kcalLo: kl * qty, kcalHi: kh * qty, protLo: pl * qty, protHi: ph * qty, slot });
    walks.forEach((w, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(9, 0, 0, 0);
      const meals = [mk('roti', 2, 'pc', 70, 100, 2.5, 3.5, 'lunch'), mk('dal', 1, 'katori', 100, 150, 6, 9, 'lunch'), mk('sabzi', 1, 'katori', 80, 150, 1.5, 3, 'lunch')];
      if (i % 2 === 0) meals.push(mk('idli', 3, 'pc', 40, 60, 1.5, 2.5, 'breakfast'));
      if (i % 3 !== 1) meals.push(mk('curd', 1, 'katori', 60, 100, 3, 5, 'dinner'), mk('khichdi', 1, 'katori', 150, 220, 5, 8, 'dinner'));
      st.entries.push({ id: 's' + i, ts: d.getTime(), sample: true, text: 'sample', meals, water: waters[i], walkMin: w, steps: stepsArr[i], walkSkipped: w === 0, safety: { level: 'none', reasons: [] } });
    });
    const sleeps = [7.2, 6.5, 7.8, 6.8, 5.9, 7.1], kgs = [71.0, 70.9, 70.8, 70.6, 70.6, 70.4];
    walks.forEach((w, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(7, 30, 0, 0);
      st.entries.push({ id: 'ss' + i, ts: d.getTime(), sample: true, text: 'sample', quick: 'sleep', sleepH: sleeps[i], meals: [], water: 0, walkMin: 0, steps: 0, safety: { level: 'none', reasons: [] } });
      st.entries.push({ id: 'sw' + i, ts: d.getTime() + 60000, sample: true, text: 'sample', quick: 'weight', kg: kgs[i], meals: [], water: 0, walkMin: 0, steps: 0, safety: { level: 'none', reasons: [] } });
      if (i % 2 === 1) st.entries.push({ id: 'sk' + i, ts: d.getTime() + 120000, sample: true, text: 'sample', quick: 'workout', activity: 'yoga', activeMin: 30, burn: 88, meals: [], water: 0, walkMin: 0, steps: 0, safety: { level: 'none', reasons: [] } });
    });
    save(); render(); toast('Sample week loaded');
  }


  // ---------------- plans, entitlements ----------------
  const isPrem = () => PL.isPremium(st.plan);
  const aiUsed = () => (st.ai && st.ai.day === todayKey() ? st.ai.n : 0);
  function updateChatMeta() {
    const left = Math.max(0, PL.FREE.aiPerDay - aiUsed());
    const t = $('#cp-sub'); if (!t) return;
    t.textContent = (live ? 'Live AI' : 'Demo mode') + (isPrem() ? ' · Premium' : ` · ${left}/${PL.FREE.aiPerDay} free today`);
    $('#chat-upsell').hidden = isPrem() || left > 0;
  }
  function renderPro() {
    const pro = isPrem(); $('#pro-chip').hidden = !pro;
    const t = $('#d-plan-tag'); t.textContent = pro ? 'Premium' : 'Free'; t.classList.toggle('pro', pro);
  }
  const money = (n) => '₹' + Number(n).toLocaleString(LOC());
  const dateStr = (ts) => new Date(ts).toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: 'numeric' });
  function renderPlans() {
    const box = $('#plan-status'), pro = isPrem();
    box.className = 'card status' + (pro ? ' prem' : '');
    const days = pro ? Math.ceil((st.plan.endsTs - Date.now()) / 86400000) : 0;
    box.innerHTML = '<b></b><span></span>';
    box.querySelector('b').textContent = pro ? '⭐ Premium is on' : 'You are on the Free plan';
    box.querySelector('span').textContent = pro ? `Until ${dateStr(st.plan.endsTs)} (${days} day${days === 1 ? '' : 's'} left) · ${st.plan.source === 'reward' ? 'earned with your steps' : 'demo plan, nothing was charged'}` : 'Everything important is free. Premium adds unlimited AI questions and your full walk history.';
    const best = PL.bestValueId(), wrap = $('#plan-cards'); wrap.innerHTML = '';
    // The Free plan is a real, visible plan: always available, never expires, no card needed
    const f = document.createElement('article'); f.className = 'plan free' + (pro ? '' : ' current');
    f.innerHTML = (pro ? '' : '<span class="pbadge">Your plan</span>') + '<h3>Free</h3><div class="price">₹0</div><div class="per">Free forever · no card needed</div><ul></ul><button type="button" id="plan-cancel"></button>';
    ['Food, calories, protein, water and steps tracking', 'Daily health digest and 10,000-step rewards', 'AI assistant: 5 questions a day', 'Your latest 3 saved walks on the map', 'All safety and emergency messages'].forEach((t) => { const li = document.createElement('li'); li.textContent = t; f.querySelector('ul').appendChild(li); });
    const fb = f.querySelector('button'); fb.textContent = pro ? 'Switch to Free' : '✓ This is your plan'; fb.disabled = !pro; fb.className = pro ? 'big' : 'big ghost';
    fb.onclick = () => { if (confirm(T('Switch back to the Free plan? Any remaining Premium days on this phone will be removed.'))) { st.plan = null; save(); render(); toast('Back on the Free plan'); } };
    wrap.appendChild(f);
    PL.PLANS.forEach((p) => {
      const a = document.createElement('article'); a.className = 'plan' + (p.id === best ? ' best' : '');
      a.innerHTML = (p.id === best ? '<span class="pbadge">Lowest per month</span>' : '') + '<h3></h3><div class="price"></div><div class="per"></div><button class="primary big" type="button"></button>';
      a.querySelector('h3').textContent = p.name;
      a.querySelector('.price').textContent = money(p.price);
      a.querySelector('.per').textContent = `${money(PL.perMonth(p))} per month · ${p.months === 1 ? 'billed every month' : `${p.months} months paid at once`}`;
      const b = a.querySelector('button'); b.textContent = pro ? 'Add this plan (demo)' : 'Start Premium (demo)';
      b.onclick = () => {
        if (!confirm(T(`Demo only: no payment is taken. Switch on Premium (${p.name}, ${money(p.price)}) on this phone?`))) return;
        st.plan = PL.activate(st.plan, p.id); save(); toast('Premium is on (demo)'); render();
      };
      wrap.appendChild(a);
    });
  }

  // ---------------- rewards ----------------
  function stepsByDay() { const m = {}; st.entries.forEach((e) => { if (e.steps) { const k = E.dayKey(e.ts); m[k] = (m[k] || 0) + e.steps; } }); return m; }
  const rewards = () => PL.rewardSummary(stepsByDay(), todayKey(), st.redeemed);
  function withRewardCheck(fn) {
    const before = rewards().earned; fn(); const after = rewards().earned;
    if (after > before) toast(`🎉 10,000 steps reached! +${after - before} points`, 4000);
  }
  function renderRewardTile() {
    const r = rewards(), el = $('#rewardcard');
    el.innerHTML = '<b></b><div class="bar"><i></i></div><span></span>';
    el.querySelector('b').textContent = '🏆 10,000-step reward';
    el.querySelector('i').style.width = Math.min(100, (r.todaySteps / PL.REWARD.target) * 100) + '%';
    el.querySelector('span').textContent = (r.todayDone ? `Done! +${PL.REWARD.points} points earned today.` : `${fmt(r.toGo)} steps to go for +${PL.REWARD.points} points.`) + ` You have ${fmt(Math.max(0, r.balance))} points.`;
  }
  function renderRewards() {
    const r = rewards(), bal = Math.max(0, r.balance);
    $('#rw-steps').textContent = `${fmt(r.todaySteps)} / ${fmt(PL.REWARD.target)}`;
    $('#rw-sub').textContent = r.todayDone ? 'steps today · reward earned! 🎉' : `steps today · ${fmt(r.toGo)} to go`;
    $('#rw-bar').style.width = Math.min(100, (r.todaySteps / PL.REWARD.target) * 100) + '%';
    $('#rw-bal').textContent = fmt(bal); $('#rw-streak').textContent = r.streak;
    const nb = r.nextBonus; $('#rw-next').textContent = nb ? `Keep going: ${nb - r.streak} more day${nb - r.streak === 1 ? '' : 's'} at 10,000 steps for a +${PL.REWARD.streakBonus[nb]} bonus (${nb}-day streak).` : 'You have reached every streak bonus. Great work!';
    const ul = $('#rw-badges'); ul.innerHTML = '';
    const ico = { first: '👟', s3: '🔥', s7: '🏅', d30: '🏆' };
    r.badges.forEach((b) => { const li = document.createElement('li'); li.className = b.got ? 'got' : ''; li.innerHTML = '<span></span><div></div>'; li.firstChild.textContent = ico[b.id]; li.lastChild.textContent = b.label + (b.got ? '' : ' (locked)'); ul.appendChild(li); });
    const rd = $('#rw-redeem'); rd.innerHTML = '';
    PL.REDEEM.forEach((o) => {
      const d = document.createElement('div'); d.className = 'redeem'; d.innerHTML = '<div><b></b><small></small></div><button type="button"></button>';
      d.querySelector('b').textContent = o.label; d.querySelector('small').textContent = `${o.cost} points`;
      const b = d.querySelector('button'); b.textContent = 'Redeem'; b.disabled = bal < o.cost;
      b.onclick = () => { if (!confirm(T(`Spend ${o.cost} points on ${o.label}?`))) return; st.redeemed.push({ ts: Date.now(), cost: o.cost, label: o.label, days: o.days }); st.plan = PL.extendDays(st.plan, o.days); save(); $('#rw-msg').textContent = `Done: ${o.label} added. Premium now runs until ${dateStr(st.plan.endsTs)}.`; render(); };
      rd.appendChild(d);
    });
    if (!$('#rw-msg').textContent) $('#rw-msg').textContent = 'Points can only be spent on in-app Premium days. Nothing here has cash value.';
  }

  // ---------------- walk map ----------------
  function ensureMap() {
    const el = $('#map');
    if (map) return true;
    if (!window.L) { el.classList.add('nomap'); el.textContent = 'The map could not load. Your route and distance are still recorded.'; return false; }
    map = L.map(el, { zoomControl: true }).setView([20.5937, 78.9629], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
    line = L.polyline([], { color: '#2fd46b', weight: 6, opacity: 0.95 }).addTo(map);
    return true;
  }
  function drawRoute(pts, fit) {
    if (!ensureMap()) return;
    const ll = pts.map((p) => [p.lat, p.lng]); line.setLatLngs(ll);
    if (startM) { map.removeLayer(startM); startM = null; } if (endM) { map.removeLayer(endM); endM = null; }
    if (ll.length) {
      startM = L.circleMarker(ll[0], { radius: 7, color: '#fff', weight: 2, fillColor: '#4cc9f0', fillOpacity: 1 }).addTo(map);
      endM = L.circleMarker(ll[ll.length - 1], { radius: 9, color: '#fff', weight: 3, fillColor: '#2fd46b', fillOpacity: 1 }).addTo(map);
    }
    if (fit && ll.length > 1) map.fitBounds(W.bounds(pts), { padding: [28, 28], maxZoom: 18 }); else if (ll.length) map.panTo(ll[ll.length - 1]);
  }
  function setReadout(km, sec, steps) { $('#m-km').textContent = km.toFixed(2); $('#m-time').textContent = W.fmtDuration(sec); $('#m-steps').textContent = fmt(steps); }
  function updateLive() {
    const t = tracking; if (!t) return;
    const pts = t.points, first = pts[0], last = pts[pts.length - 1];
    const start = t.source === 'demo' && first ? first.ts : t.startTs, end = t.source === 'demo' && last ? last.ts : Date.now();
    const s = W.stats(pts, start, end, E.STEP_KM); setReadout(s.km, (end - start) / 1000, s.steps);
  }
  function onFix(p) {
    const t = tracking; if (!t) return;
    const r = W.accept(t.points[t.points.length - 1], p);
    if (!r.ok) { if (r.reason === 'accuracy') $('#walk-msg').textContent = 'Waiting for a stronger GPS signal…'; return; }
    t.points.push(p);
    if (t.points.length === 1 && map) map.setView([p.lat, p.lng], 17);
    $('#walk-msg').textContent = ''; drawRoute(t.points, false); updateLive();
  }
  function walkUI(on) { $('#walk-start').hidden = on; $('#walk-stop').hidden = !on; $('#walk-demo').disabled = on; }
  function startTracking(source) {
    if (tracking) return;
    ensureMap(); if (map) map.invalidateSize();
    if (source === 'gps' && !navigator.geolocation) { $('#walk-msg').textContent = 'This browser cannot share your location. Try the demo walk instead.'; return; }
    tracking = { hrIdx: hr.samples.length, points: [], startTs: Date.now(), source, timer: null, watch: null, demo: null, wake: null };
    drawRoute([], false); setReadout(0, 0, 0); walkUI(true); $('#walk-msg').textContent = source === 'gps' ? 'Looking for your location…' : 'Demo walk: a made-up route is being drawn.';
    tracking.timer = setInterval(updateLive, 1000);
    if (source === 'gps') {
      tracking.watch = navigator.geolocation.watchPosition((pos) => onFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, ts: pos.timestamp || Date.now() }), (err) => {
        const m = { 1: 'Location is switched off for this site. Allow it in your browser settings, or try the demo walk.', 2: 'I cannot find your location. Try going outside.', 3: 'Finding your location is taking long. Try again outside.' };
        $('#walk-msg').textContent = m[err.code] || 'Location error.'; if (err.code === 1) stopTracking(true);
      }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((w) => { if (tracking) tracking.wake = w; else w.release(); }).catch(() => {}); } catch (e) {}
    } else {
      const pts = W.demoRoute(null, 120); let i = 0;
      tracking.demo = setInterval(() => { if (i >= pts.length) { stopTracking(false); return; } onFix({ ...pts[i++] }); }, 35);
    }
  }
  function stopTracking(discard) {
    const t = tracking; if (!t) return;
    clearInterval(t.timer); clearInterval(t.demo); if (t.watch != null) navigator.geolocation.clearWatch(t.watch); try { if (t.wake) t.wake.release(); } catch (e) {}
    tracking = null; walkUI(false);
    const pts = t.points;
    if (discard === true && !pts.length) return;
    const first = pts[0], last = pts[pts.length - 1];
    const start = t.source === 'demo' && first ? first.ts : t.startTs, end = t.source === 'demo' && last ? last.ts : Date.now();
    const s = W.stats(pts, start, end, E.STEP_KM);
    if (W.lengthM(pts) < 30) { $('#walk-msg').textContent = 'That walk was very short (under 30 m), so I did not save it.'; return; }
    const route = W.downsample(pts, 150).map((p) => ({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) }));
    const hs = WT.summarize(hr.samples.slice(t.hrIdx || 0), WT.maxHr(st.profile && st.profile.age));
    withRewardCheck(() => pushEntry({ quick: 'gps', demo: t.source === 'demo', route, km: s.km, steps: s.steps, walkMin: Math.max(1, Math.round(s.minutes)), hr: hs && hs.n >= 5 ? { avg: hs.avg, max: hs.max, min: hs.min, n: hs.n } : undefined }));
    drawRoute(pts, true); setReadout(s.km, (end - start) / 1000, s.steps);
    $('#walk-msg').textContent = `Saved: ${s.km.toFixed(2)} km, ${Math.max(1, Math.round(s.minutes))} min, about ${fmt(s.steps)} steps.` + (t.source === 'demo' ? ' (Demo walk: made-up steps were added.)' : '');
    render();
  }
  function showWalk(e) {
    ensureMap(); if (map) map.invalidateSize(); drawRoute(e.route, true);
    setReadout(e.km || 0, (e.walkMin || 0) * 60, e.steps || 0);
    $('#walk-msg').textContent = `Showing your walk from ${new Date(e.ts).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`;
    $('#mapcard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderWalk() {
    $('#map-note').textContent = 'Map pictures need internet. Without it, your route is still drawn on a plain background.';
    if (ensureMap()) setTimeout(() => map.invalidateSize(), 50);
    const all = st.entries.filter((e) => e.route && e.route.length).sort((a, b) => b.ts - a.ts);
    const shown = isPrem() ? all : all.slice(0, PL.FREE.walkHistory), hidden = all.length - shown.length;
    const ul = $('#walklist'); ul.innerHTML = ''; $('#walk-empty').hidden = all.length > 0;
    shown.forEach((e) => {
      const li = document.createElement('li'), d = document.createElement('div');
      d.innerHTML = '<div class="t"></div><div class="b"></div>';
      d.querySelector('.t').textContent = new Date(e.ts).toLocaleString(LOC(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      d.querySelector('.b').textContent = `${(e.km || 0).toFixed(2)} km · ${e.walkMin} min · ${fmt(e.steps)} steps${e.hr ? ` · ♥ avg ${e.hr.avg}` : ''}${e.demo ? ' · demo' : ''}`;
      const box = document.createElement('div'); box.className = 'rowbtns';
      const m = document.createElement('button'); m.type = 'button'; m.textContent = '🗺'; m.setAttribute('aria-label', 'Show this walk on the map'); m.onclick = () => showWalk(e);
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '🗑'; x.setAttribute('aria-label', 'Delete this walk');
      x.onclick = () => { if (confirm(T('Delete this walk and its route?'))) { st.entries = st.entries.filter((y) => y.id !== e.id); save(); render(); } };
      box.append(m, x); li.append(d, box); ul.appendChild(li);
    });
    const lock = $('#walk-lock'); lock.hidden = hidden <= 0; lock.textContent = `🔒 ${hidden} older walk${hidden === 1 ? ' is' : 's are'} on Premium. See plans`;
  }

  // ---------------- wiring ----------------
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-go]');
    if (b) { ev.preventDefault(); go(b.dataset.go, b.dataset.scroll); }
  });
  $('#menu-btn').onclick = () => ($('#drawer').classList.contains('open') ? closeDrawer() : openDrawer());
  $('#menu-close').onclick = () => closeDrawer();
  $('#scrim').onclick = () => closeDrawer();
  $('#chat-fab').onclick = openChat;
  window.addEventListener('scroll', () => $('#chat-fab').classList.toggle('compact', window.scrollY > 60), { passive: true }); // label hides while scrolling so the button covers less text
  $('#chat-close').onclick = () => closeChat();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('#drawer').classList.contains('open')) closeDrawer(); else closeChat(); } });

  $('#start').onclick = () => { st.profile = { name: $('#name').value.trim() }; save(); go('home'); if (pendingFriend || pendingErr) go('community'); };
  $('#send').onclick = () => submit($('#say').value);
  $('#say').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit($('#say').value); });

  ['2 roti, dal, sabzi', 'one glass of water', '20 minute walk', 'did not walk today'].forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c;
    b.onclick = () => { const s = $('#say'); s.value = (s.value ? s.value + ', ' : '') + b.textContent; s.focus(); }; $('#chips').appendChild(b);
  });
  [['+1,000 steps', 1000], ['+2,000 steps', 2000], ['+1 km', Math.round(1 / E.STEP_KM)]].forEach(([label, n]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => addSteps(n); $('#stepchips').appendChild(b);
  });
  ['How am I doing today?', 'How much protein do I need?', 'How far did I walk?', 'What should I eat tonight?', 'Should I stop my tablet?'].forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.onclick = () => sendChat(b.textContent); $('#askchips').appendChild(b);
  });
  [['steps', 'Steps'], ['water', 'Water'], ['kcal', 'Calories'], ['prot', 'Protein']].forEach(([k, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.m = k; b.textContent = label; b.onclick = () => { metric = k; render(); }; $('#metricchips').appendChild(b);
  });

  $('#walk-start').onclick = () => startTracking('gps');
  $('#walk-stop').onclick = () => stopTracking(false);
  $('#walk-demo').onclick = () => startTracking('demo');
  document.addEventListener('visibilitychange', () => { if (!document.hidden && tracking && tracking.source === 'gps') $('#walk-msg').textContent = 'Tracking can pause when the screen is off, so the distance may be a little short.'; });
  $('#q-water').onclick = () => addWater(1);
  $('#q-steps').onclick = () => addSteps(1000);
  $('#q-log').onclick = () => { go('track', 'logcard'); setTimeout(() => $('#say').focus({ preventScroll: true }), 350); };
  $('#q-ask').onclick = openChat;
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
    const r = new SR(); r.lang = I18N.lang === 'hi' ? 'hi-IN' : 'en-IN'; r.interimResults = false;
    $('#mic').textContent = '…'; $('#reply').hidden = false; $('#reply').className = 'reply'; $('#reply').textContent = T('Listening…');
    r.onresult = (ev) => { $('#say').value = (($('#say').value ? $('#say').value + ' ' : '') + ev.results[0][0].transcript).trim(); };
    r.onend = () => { $('#mic').textContent = '🎤'; $('#reply').hidden = true; };
    r.onerror = () => { $('#mic').textContent = '🎤'; };
    r.start();
  };
  $('#photo').onclick = () => {
    if (!live) { const el = $('#reply'); el.hidden = false; el.className = 'reply amber'; el.textContent = T('Photo reading needs the live AI. Please type what was on the plate.'); }
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

  const share = () => { const txt = E.familySummary(st.profile.name, sumOn(todayKey()), goals(), LANG()); closeDrawer(true); window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener'); };
  const reset = () => { closeDrawer(true); closeChat(true); if (confirm(T('Erase everything on this phone? This also removes saved walk routes, points and any Premium on this phone.'))) { localStorage.removeItem(KEY); st = blank(); view = 'home'; $('#reply').hidden = true; render(); window.scrollTo(0, 0); } };
  const sample = () => { closeDrawer(true); sampleWeek(); };
  $('#share').onclick = share; $('#d-share').onclick = share;
  $('#reset').onclick = reset; $('#d-reset').onclick = reset;
  $('#sample').onclick = sample; $('#d-sample').onclick = sample;


  // ================= body: workouts, sleep, weight =================
  const weekKeys = () => Array.from({ length: 7 }, (_, i) => dayKeyOffset(-i));
  const activeMinOn = (k) => entriesOn(k).reduce((a, e) => a + (e.walkMin || 0) + (e.activeMin || 0), 0);
  const weekActive = () => weekKeys().reduce((a, k) => a + activeMinOn(k), 0);
  function latestWeight() {
    const w = st.entries.filter((e) => e.quick === 'weight' && F.validKg(e.kg)).sort((a, b) => b.ts - a.ts)[0];
    return w ? w.kg : (st.profile && F.validKg(st.profile.weightKg) ? st.profile.weightKg : null);
  }
  function sleepLogs() { // oldest -> newest, one value per day (0 = not logged)
    return weekKeys().slice().reverse().map((k) => { const e = entriesOn(k).filter((x) => x.quick === 'sleep').pop(); return { k, h: e ? e.sleepH : 0 }; });
  }
  function renderSnapshot() {
    const wa = weekActive(), sl = F.avg(sleepLogs().filter((x) => x.h > 0).map((x) => x.h)), wt = latestWeight();
    $('#sn-active').textContent = fmt(wa); $('#sn-sleep').textContent = sl == null ? '-' : sl.toFixed(1); $('#sn-weight').textContent = wt == null ? '-' : wt;
    $('#sn-bar').style.width = Math.min(100, (wa / F.WEEKLY_ACTIVE_GOAL) * 100) + '%';
    $('#sn-note').textContent = wa >= F.WEEKLY_ACTIVE_GOAL ? 'You have reached the weekly 150-minute activity target. Well done!' : `${F.WEEKLY_ACTIVE_GOAL - wa} more active minutes to reach the weekly 150-minute target (a WHO suggestion for adults). Walking minutes are estimated from your steps.`;
  }
  function renderBody() {
    const wa = weekActive();
    $('#wk-week').textContent = `${fmt(wa)}/${F.WEEKLY_ACTIVE_GOAL}`;
    $('#b-active').style.width = Math.min(100, (wa / F.WEEKLY_ACTIVE_GOAL) * 100) + '%';
    $('#wk-note').textContent = wa >= F.WEEKLY_ACTIVE_GOAL ? 'Weekly target reached. Keep it comfortable.' : `${F.WEEKLY_ACTIVE_GOAL - wa} min to the weekly 150-minute target. Walks, yoga and gardening all count.`;
    // sleep chart
    const logs = sleepLogs(), box = $('#sleep-chart'), AREA = 80; box.innerHTML = '';
    logs.forEach((x, i) => {
      const col = document.createElement('div'); col.className = 'col' + (i === logs.length - 1 ? ' today' : '');
      col.innerHTML = '<div class="val"></div><div class="barv sleep"></div><div class="day"></div>';
      col.querySelector('.val').textContent = x.h ? x.h : '';
      col.querySelector('.barv').style.height = x.h ? Math.max(3, (x.h / 10) * AREA) + 'px' : '3px';
      col.querySelector('.day').textContent = i === logs.length - 1 ? 'Today' : new Date(x.k.replace(/-/g, '/')).toLocaleDateString(LOC(), { weekday: 'short' }).slice(0, 3);
      box.appendChild(col);
    });
    const sl = F.avg(logs.filter((x) => x.h > 0).map((x) => x.h)); $('#sl-avg').textContent = sl == null ? '-' : sl.toFixed(1);
    // weight chart: one point per day (last reading of the day), newest 30
    const byDay = {}; st.entries.filter((e) => e.quick === 'weight' && F.validKg(e.kg)).sort((a, b) => a.ts - b.ts).forEach((e) => { byDay[E.dayKey(e.ts)] = e; });
    const pts = Object.values(byDay).slice(-30), ws = F.weightStats(pts.map((p) => ({ ts: p.ts, kg: p.kg })));
    $('#wt-now').textContent = ws ? ws.latest : (latestWeight() || '-');
    $('#wt-sub').textContent = ws && ws.count > 1 ? `kg · ${ws.change > 0 ? '+' : ''}${ws.change.toFixed(1)} since ${new Date(pts[0].ts).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' })}` : 'kg';
    const wc = $('#wt-chart');
    if (pts.length < 2) wc.innerHTML = '<div class="empty">Save your weight on two or more days to see the trend.</div>';
    else {
      const W0 = 300, H0 = 110, pad = 14, t0 = pts[0].ts, t1 = pts[pts.length - 1].ts, ks = pts.map((p) => p.kg), lo = Math.min(...ks) - 0.5, hi = Math.max(...ks) + 0.5;
      const X = (t) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W0 - 2 * pad), Y = (k) => H0 - pad - ((k - lo) / Math.max(0.1, hi - lo)) * (H0 - 2 * pad);
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)} ${Y(p.kg).toFixed(1)}`).join(' ');
      const dots = pts.map((p) => `<circle cx="${X(p.ts).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="3.5" fill="#2fd46b"/>`).join('');
      wc.innerHTML = `<svg viewBox="0 0 ${W0} ${H0}" aria-hidden="true"><path d="${path}" fill="none" stroke="#2fd46b" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}<text x="${pad}" y="12" fill="#a3bbab" font-size="11">${hi.toFixed(1)}</text><text x="${pad}" y="${H0 - 2}" fill="#a3bbab" font-size="11">${lo.toFixed(1)}</text></svg>`;
    }
    $('#wt-chart').setAttribute('aria-label', pts.length ? 'Weight over time: ' + pts.map((p) => p.kg + ' kg').join(', ') : 'Weight over time');
  }
  function addWorkout() {
    const m = +$('#wk-min').value, a = F.ACTIVITIES.find((x) => x.id === $('#wk-act').value), msg = $('#wk-msg');
    if (!a || !F.validMinutes(m)) { msg.textContent = 'Please enter whole minutes between 1 and 300.'; return; }
    const kg = latestWeight(), burn = F.burnKcal(a.met, m, kg);
    pushEntry({ quick: 'workout', activity: a.id, activeMin: m, burn });
    $('#wk-min').value = ''; msg.textContent = `Added ${a.label}, ${m} min: about ${burn} kcal burned (rough estimate).` + (F.validKg(kg) ? '' : ' Assuming 65 kg: add your weight for a better figure.');
    toast('Workout added'); render();
  }
  function addSleep() {
    const h = F.sleepHours($('#sl-bed').value, $('#sl-wake').value), msg = $('#sl-msg');
    if (h == null) { msg.textContent = 'Please check the times: sleep should be between 1 and 16 hours.'; return; }
    st.entries = st.entries.filter((e) => !(e.quick === 'sleep' && E.dayKey(e.ts) === todayKey())); // one night per day: replace
    pushEntry({ quick: 'sleep', sleepH: h, bed: $('#sl-bed').value, wake: $('#sl-wake').value });
    msg.textContent = `Logged ${h} hours of sleep.`; toast('Sleep logged'); render();
  }
  function addWeight() {
    const kg = Math.round(+$('#wt-in').value * 10) / 10, msg = $('#wt-msg');
    if (!F.validKg(kg)) { msg.textContent = 'Please enter a weight between 30 and 250 kg.'; return; }
    pushEntry({ quick: 'weight', kg });
    if (st.profile) st.profile.weightKg = kg; // protein and calorie estimates follow your latest weight
    save(); $('#wt-in').value = ''; msg.textContent = `Saved ${kg} kg. Your protein and calorie estimates now use this weight.`; toast('Weight saved'); render();
  }

  // ================= watch & heart rate (standard Bluetooth Heart Rate profile) =================
  let hr = { dev: null, char: null, samples: [], last: null, demo: null, name: '', retries: 0, adviceZ: -1 };
  const ZCOLORS = ['#a3bbab', '#2b5a40', '#2fd46b', '#f2b84b', '#ff9b4a', '#ff5a5a'];
  function onBpm(p) {
    if (!p || !p.valid) return;
    if (p.contact === false) { $('#hr-msg').textContent = 'The sensor is not touching your skin. Fasten the watch or strap snugly.'; return; }
    hr.last = { bpm: p.bpm, t: Date.now() }; hr.samples.push({ t: Date.now(), bpm: p.bpm }); if (hr.samples.length > 7200) hr.samples.splice(0, hr.samples.length - 7200);
    if (view === 'walk') renderHr();
  }
  function renderHr() {
    const connected = !!(hr.dev && hr.dev.gatt && hr.dev.gatt.connected) || !!hr.demo, fresh = hr.last && Date.now() - hr.last.t < 10000;
    const max = WT.maxHr(st.profile && st.profile.age), z = fresh ? WT.zoneOf(hr.last.bpm, max) : null;
    $('#hr-bpm').textContent = fresh ? hr.last.bpm : '--';
    $('#hr-bpm').style.color = z ? ZCOLORS[z.z] : '';
    $('#hr-zone').textContent = !connected ? 'Not connected' : z ? `${z.label} zone · ${z.pct}% of max` : 'Waiting for a reading…';
    $('#hr-dev').textContent = connected ? (hr.name || 'Connected') : ''; $('#hr-dev').setAttribute('translate', hr.demo ? 'yes' : 'no');
    $$('#zonebar i').forEach((i) => i.classList.toggle('on', !!z && +i.dataset.z === z.z));
    const adv = z ? WT.advice(z) : null, a = $('#hr-advice');
    a.hidden = !adv; if (adv) { a.textContent = adv; a.classList.toggle('stop', z.z >= 5); }
    $('#hr-connect').hidden = connected; $('#hr-disconnect').hidden = !connected; $('#hr-demo').disabled = connected;
    const hasAge = st.profile && st.profile.age;
    $('#hr-compat').textContent = (navigator.bluetooth ? 'Works with chest straps and watches that share a standard Bluetooth heart rate (for example a watch\'s "broadcast heart rate" mode). Apple Watch and Fitbit do not share heart rate with websites. ' : 'This browser cannot connect to Bluetooth devices. Try Chrome on an Android phone. You can still try the demo. ') + `Zones use an estimated maximum of ${max} bpm${hasAge ? '' : ' (add your age in Me for a closer estimate)'}. Not medical advice.`;
    $('#hr-connect').disabled = !navigator.bluetooth;
  }
  async function attachHr(dev) {
    const server = await dev.gatt.connect(), svc = await server.getPrimaryService('heart_rate'), ch = await svc.getCharacteristic('heart_rate_measurement');
    await ch.startNotifications(); hr.char = ch; hr.retries = 0;
    ch.addEventListener('characteristicvaluechanged', (ev) => onBpm(WT.parseHeartRate(ev.target.value)));
    $('#hr-msg').textContent = 'Connected. Heart rate appears in a few seconds.'; renderHr();
  }
  async function connectWatch() {
    if (!navigator.bluetooth) { $('#hr-msg').textContent = 'This browser cannot connect to Bluetooth devices.'; return; }
    $('#hr-msg').textContent = 'Choose your watch or strap from the list…';
    try {
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      hr.dev = dev; hr.name = dev.name || 'Heart rate device';
      dev.addEventListener('gattserverdisconnected', onHrDrop);
      await attachHr(dev);
    } catch (e) {
      hr.dev = null;
      $('#hr-msg').textContent = e && e.name === 'NotFoundError' ? 'No device was chosen. Turn on your watch\'s heart-rate sharing and try again.'
        : e && e.name === 'SecurityError' ? 'Bluetooth needs a secure (https) page and your permission.' : 'Could not connect. Make sure the device is on, close to your phone, and sharing heart rate.';
      renderHr();
    }
  }
  async function onHrDrop() {
    if (!hr.dev) return;
    if (hr.retries < 2) { hr.retries++; $('#hr-msg').textContent = 'Connection lost. Trying again…'; await new Promise((r) => setTimeout(r, 2000)); try { await attachHr(hr.dev); return; } catch (e) { /* fall through */ } }
    $('#hr-msg').textContent = 'The device disconnected.'; hr.dev = null; renderHr();
  }
  function disconnectHr() {
    if (hr.demo) { clearInterval(hr.demo); hr.demo = null; }
    const d = hr.dev; hr.dev = null; hr.last = null; try { if (d && d.gatt && d.gatt.connected) d.gatt.disconnect(); } catch (e) {}
    $('#hr-msg').textContent = 'Disconnected.'; renderHr();
  }
  function demoHr() {
    if (hr.demo) return; let t = 0; hr.name = 'Demo (made-up numbers)'; $('#hr-msg').textContent = 'Demo heart rate: made-up numbers for a gentle walk.';
    hr.demo = setInterval(() => { t++; onBpm({ bpm: WT.demoBpm(t), valid: true, contact: true }); if (view !== 'walk') renderHr(); }, 1000); onBpm({ bpm: WT.demoBpm(0), valid: true, contact: true }); renderHr();
  }

  // ================= emergency contact =================
  function fillEmergency() { const e = (st.profile && st.profile.emergency) || {}; $('#em-name').value = e.name || ''; $('#em-phone').value = e.phone || ''; $('#em-msg').textContent = ''; }
  function renderEmergency() {
    const e = st.profile && st.profile.emergency, a = $('#em-call');
    if (e && F.isPhone(e.phone)) { a.hidden = false; a.href = F.telHref(e.phone); a.textContent = `Call ${e.name || 'my contact'}`; } else { a.hidden = true; a.removeAttribute('href'); }
  }
  function saveEmergency() {
    const name = $('#em-name').value.trim().slice(0, 30), phone = $('#em-phone').value.trim(), msg = $('#em-msg');
    if (!name && !phone) { delete st.profile.emergency; save(); renderEmergency(); msg.textContent = 'Contact removed.'; return; }
    if (!F.isPhone(phone)) { msg.textContent = 'Please enter a valid phone number, for example +91 98765 43210.'; return; }
    st.profile.emergency = { name, phone }; save(); renderEmergency(); msg.textContent = 'Saved.'; toast('Emergency contact saved');
  }

  // ================= backup, restore, CSV =================
  function download(name, mime, text) {
    const url = URL.createObjectURL(new Blob([text], { type: mime })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function backupDownload() {
    const payload = { app: 'my-fitness-buddy', version: 1, exportedTs: Date.now(), data: { profile: st.profile, entries: st.entries, chat: st.chat, plan: st.plan, redeemed: st.redeemed, ai: st.ai, friends: st.friends, groups: st.groups, challenge: st.challenge, challengeLog: st.challengeLog } };
    download(`my-fitness-buddy-backup-${todayKey()}.json`, 'application/json', JSON.stringify(payload));
    $('#bk-msg').textContent = 'Backup downloaded. Keep the file private.';
  }
  function csvDownload() {
    const days = {}; st.entries.forEach((e) => { const k = E.dayKey(e.ts); (days[k] = days[k] || []).push(e); });
    const rows = Object.keys(days).sort().map((k) => {
      const s = E.summarize(days[k]), w = days[k].filter((e) => e.quick === 'weight').pop(), sl = days[k].filter((e) => e.quick === 'sleep').pop();
      return { date: k, steps: s.steps, km: s.km, water_glasses: s.water, kcal_low: s.kcalLo, kcal_high: s.kcalHi, protein_low_g: s.protLo, protein_high_g: s.protHi, active_min: days[k].reduce((a, e) => a + (e.walkMin || 0) + (e.activeMin || 0), 0), sleep_h: sl ? sl.sleepH : '', weight_kg: w ? w.kg : '' };
    });
    if (!rows.length) { $('#bk-msg').textContent = 'Nothing to export yet.'; return; }
    download(`my-fitness-buddy-summary-${todayKey()}.csv`, 'text/csv', F.toCSV(rows));
    $('#bk-msg').textContent = 'Summary downloaded. Calories and protein are rough ranges (low and high).';
  }
  function backupRestore(file) {
    const msg = $('#bk-msg');
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { msg.textContent = 'That file is too big to be a backup (over 8 MB).'; return; }
    const rd = new FileReader();
    rd.onerror = () => { msg.textContent = 'That file could not be read.'; };
    rd.onload = () => {
      const r = F.sanitizeBackup(String(rd.result), PL.PLANS.map((p) => p.id), CM.CHALLENGES.map((c) => c.id));
      if (!r.ok) { msg.textContent = r.error; return; }
      if (!confirm(T(`Replace everything on this phone with this backup (${r.state.entries.length} notes)? This cannot be undone.`))) { msg.textContent = 'Restore cancelled. Nothing was changed.'; return; }
      st = r.state; save(); render(); fillProfileForm(); fillEmergency();
      msg.textContent = `Restored ${r.state.entries.length} notes.` + (r.dropped ? ` ${r.dropped} unreadable notes were skipped.` : ''); toast('Backup restored');
    };
    rd.readAsText(file);
  }

  // ---- wiring for the new features ----
  F.ACTIVITIES.forEach((a) => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.label; $('#wk-act').appendChild(o); });
  [15, 30, 45, 60].forEach((n) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n + ' min'; b.onclick = () => { $('#wk-min').value = n; }; $('#wk-chips').appendChild(b); });
  $('#wk-add').onclick = addWorkout; $('#sl-add').onclick = addSleep; $('#wt-add').onclick = addWeight;
  $('#wt-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') addWeight(); });
  $('#hr-connect').onclick = connectWatch; $('#hr-disconnect').onclick = disconnectHr; $('#hr-demo').onclick = demoHr;
  $('#em-save').onclick = saveEmergency;
  $('#bk-download').onclick = backupDownload; $('#bk-csv').onclick = csvDownload;
  $('#bk-restore').onclick = () => $('#bk-file').click();
  $('#bk-file').onchange = (ev) => { backupRestore(ev.target.files[0]); ev.target.value = ''; };
  setInterval(() => { if (view === 'walk') renderHr(); }, 5000); // greys out the number if readings stop


  // ================= community (no server, no strangers) =================
  let pendingFriend = null, pendingErr = '';
  const days7 = () => weekKeys().map((k) => sumOn(k).steps);
  function myWeek() { const d = days7(); return { week: Math.min(280000, d.reduce((a, b) => a + b, 0)), best: Math.min(40000, Math.max(0, ...d)), streak: Math.min(400, rewards().streak) }; }
  function boardRows() {
    const me = myWeek(), rows = [{ id: 'me', name: (st.profile && st.profile.name) || 'You', week: me.week, best: me.best, streak: me.streak, ts: Date.now(), you: true }];
    st.friends.forEach((f) => rows.push({ ...f }));
    return CM.rank(rows);
  }
  function myLink() { return location.href.split('#')[0] + '#buddy=' + CM.encodeShare({ name: (st.profile && st.profile.name) || 'Friend', ...myWeek(), ts: Date.now() }); }
  function openWhatsApp(text) { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener'); }
  function shareWeek() {
    const w = myWeek();
    if (!confirm(T(`This shares only your first name, your steps this week (${fmt(w.week)}), your best day (${fmt(w.best)}) and your streak (${w.streak}). No health readings, no location. Continue?`))) return;
    const url = myLink(), text = `Join my walking board on My Fitness Buddy! I did ${fmt(w.week)} steps this week. Open this link to add me:`;
    if (navigator.share) navigator.share({ title: 'My Fitness Buddy', text, url }).catch(() => {}); else openWhatsApp(text + ' ' + url);
    $('#cm-msg').textContent = 'Shared. Ask your friends to share theirs back.';
  }
  async function copyLink() {
    const url = myLink(), msg = $('#cm-msg');
    try { await navigator.clipboard.writeText(url); msg.textContent = 'Link copied. Paste it in a message to a friend.'; toast('Link copied'); }
    catch (e) { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); msg.textContent = 'Link copied.'; } catch (e2) { msg.textContent = 'Could not copy automatically. Long-press to copy: ' + url; } t.remove(); }
  }
  function takeIncoming() {
    const m = /^#buddy=([A-Za-z0-9_-]*)$/.exec(location.hash || '');
    if (!m) return false;
    const r = CM.decodeShare(m[1]);
    window.history.replaceState(null, '', location.pathname + location.search); // (window.history: this file has its own history() helper) never leave the data in the address bar
    if (r.ok) { pendingFriend = r.friend; pendingErr = ''; } else { pendingFriend = null; pendingErr = r.error; }
    return true;
  }
  function addPendingFriend() {
    const f = pendingFriend; if (!f) return;
    const i = st.friends.findIndex((x) => x.name.toLowerCase() === f.name.toLowerCase() && !x.sample);
    if (i >= 0) st.friends[i] = { ...st.friends[i], ...f };
    else if (st.friends.length >= CM.LIMITS.friendsMax) { $('#cm-msg').textContent = 'Your board is full (30 friends). Remove someone first.'; return; }
    else st.friends.push({ id: newId(), ...f });
    pendingFriend = null; save(); toast(`${f.name} added`); render();
  }

  // challenges are judged only from your own data
  const dayStats = (k) => { const s = sumOn(k); return { steps: s.steps, water: s.water, active: activeMinOn(k) }; };
  const chalDef = (id) => CM.CHALLENGES.find((c) => c.id === id);
  function checkChallenge() {
    if (!st.challenge) return;
    const d = chalDef(st.challenge.id); if (!d) { st.challenge = null; save(); return; }
    const p = CM.challengeProgress(d, st.challenge.startKey, todayKey(), dayStats);
    if (p.complete) { st.challengeLog.push({ id: d.id, doneKey: todayKey() }); st.challengeLog = st.challengeLog.slice(-50); st.challenge = null; save(); toast(`🎉 Challenge complete: ${d.label}`, 4500); }
  }
  function startChallenge(id) { st.challenge = { id, startKey: todayKey() }; save(); toast('Challenge started. Good luck!'); render(); }

  function renderCommunityTile() {
    const el = $('#communitycard'), rows = boardRows(), me = rows.find((r) => r.you), d = st.challenge && chalDef(st.challenge.id);
    el.innerHTML = '<b></b><span></span>'; el.querySelector('b').textContent = '👥 Community';
    el.querySelector('span').textContent = st.friends.length ? `You are #${me.rank} of ${rows.length} on your friends board this week.` : d ? `Challenge on: ${d.label}.` : 'Invite a friend or start a 7-day challenge.';
  }
  function groupInvite(g) { return `You are invited: ${g.name} (${g.kind}). ${g.when ? 'When: ' + g.when + '. ' : ''}${g.where ? 'Where: ' + g.where + '. ' : ''}Shared from My Fitness Buddy. This is not medical advice: go at your own comfortable pace.`; }

  function renderCommunity() {
    // pending friend (from a link)
    const pc = $('#pendingcard');
    if (pendingFriend) {
      pc.hidden = false; const f = pendingFriend;
      $('#pc-title').textContent = `${f.name} shared their week with you`;
      $('#pc-text').textContent = `${fmt(f.week)} steps this week · best day ${fmt(f.best)} · ${f.streak}-day streak (shared ${CM.timeAgo(f.ts)}).`;
    } else if (pendingErr) { pc.hidden = false; $('#pc-title').textContent = 'That link could not be used'; $('#pc-text').textContent = pendingErr; $('#pc-add').hidden = true; }
    else pc.hidden = true;
    if (pendingFriend) $('#pc-add').hidden = false;

    // board
    const rows = boardRows(), ol = $('#board'); ol.innerHTML = '';
    $('#board-empty').hidden = st.friends.length > 0;
    if (st.friends.length) rows.forEach((r) => {
      const li = document.createElement('li'); if (r.you) li.className = 'you';
      li.innerHTML = '<div class="rk"></div><div class="nm"><span class="n"></span><span class="sub"></span></div><div class="wk"></div><div class="acts"></div>';
      li.querySelector('.rk').textContent = r.rank;
      const nm = li.querySelector('.n'); nm.textContent = ''; const who = document.createElement('span'); who.setAttribute('translate', 'no'); who.textContent = r.name; nm.append(who); if (r.you) nm.append(' (you)');
      if (r.sample) { const t = document.createElement('span'); t.className = 'stag'; t.textContent = 'sample'; nm.after(t); }
      li.querySelector('.sub').textContent = r.you ? `best day ${fmt(r.best)} · ${r.streak}-day streak` : `best day ${fmt(r.best)} · ${r.streak}-day streak · shared ${CM.timeAgo(r.ts)}`;
      li.querySelector('.wk').textContent = fmt(r.week);
      if (!r.you) {
        const a = li.querySelector('.acts');
        const cheer = document.createElement('button'); cheer.type = 'button'; cheer.textContent = '👏 Cheer'; cheer.setAttribute('aria-label', 'Cheer ' + r.name);
        cheer.onclick = () => openWhatsApp(`Well done, ${r.name}! ${fmt(r.week)} steps this week is great. 👏 (My Fitness Buddy)`);
        const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '✕ Remove'; rm.setAttribute('aria-label', 'Remove ' + r.name);
        rm.onclick = () => { if (confirm(T(`Remove ${r.name} from your board?`))) { st.friends = st.friends.filter((x) => x.id !== r.id); save(); render(); } };
        a.append(cheer, rm);
      }
      ol.appendChild(li);
    });

    // challenges
    const act = $('#ch-active'); act.innerHTML = '';
    if (st.challenge) {
      const d = chalDef(st.challenge.id), p = CM.challengeProgress(d, st.challenge.startKey, todayKey(), dayStats);
      const box = document.createElement('div'); box.className = 'chal on'; box.innerHTML = '<b></b><div class="dots"></div><div class="bar"><i></i></div><span class="why"></span><div class="row"><button type="button" class="ghost">Invite a friend</button><button type="button" class="ghost">Stop</button></div>';
      box.querySelector('b').textContent = d.label; box.querySelector('i').style.width = Math.round(p.pct * 100) + '%';
      const dots = box.querySelector('.dots'); for (let i = 0; i < d.window; i++) { const x = document.createElement('i'); if (i < p.perDay.length) x.className = p.perDay[i] ? 'hit' : (i === p.perDay.length - 1 ? '' : 'miss'); dots.appendChild(x); }
      box.querySelector('.why').textContent = p.expired ? 'This one can no longer be completed. You can start it again from today.' : d.mode === 'days' ? `${p.hits} of ${d.need} days done · ${p.daysLeft} days left after today` : `${fmt(p.progress)} of ${fmt(d.need)} minutes · ${p.daysLeft} days left after today`;
      const [inv, stop] = box.querySelectorAll('button');
      inv.onclick = () => openWhatsApp(`Let's do this together: ${d.label}. Starting today! (My Fitness Buddy)`);
      stop.textContent = p.expired ? 'Clear' : 'Stop'; stop.onclick = () => { st.challenge = null; save(); render(); };
      act.appendChild(box);
    }
    const list = $('#ch-list'); list.innerHTML = '';
    if (!st.challenge) CM.CHALLENGES.forEach((d) => {
      const row = document.createElement('div'); row.className = 'redeem'; row.innerHTML = '<div><b></b><small>Starts today. Judged from your own steps, water and active minutes.</small></div><button type="button">Start</button>';
      row.querySelector('b').textContent = d.label; row.querySelector('button').onclick = () => startChallenge(d.id); list.appendChild(row);
    });
    const log = $('#ch-log'); log.innerHTML = '';
    st.challengeLog.slice().reverse().slice(0, 5).forEach((c) => { const d = chalDef(c.id); if (!d) return; const li = document.createElement('li'); li.innerHTML = '<div><div class="t"></div><div class="b"></div></div>'; li.querySelector('.t').textContent = 'Completed ' + c.doneKey; li.querySelector('.b').textContent = '🏅 ' + d.label; log.appendChild(li); });

    // groups
    const gl = $('#grouplist'); gl.innerHTML = ''; $('#g-empty').hidden = st.groups.length > 0;
    st.groups.forEach((g) => {
      const li = document.createElement('li'), d = document.createElement('div'); d.innerHTML = '<div class="t"></div><div class="b"></div>';
      d.querySelector('.t').textContent = g.kind + (g.sample ? ' · sample' : '');
      d.querySelector('.b').textContent = [g.name, g.when, g.where].filter(Boolean).join(' · '); if (!g.sample) d.querySelector('.b').setAttribute('translate', 'no');
      const box = document.createElement('div'); box.className = 'rowbtns';
      const sh = document.createElement('button'); sh.type = 'button'; sh.textContent = '📤'; sh.setAttribute('aria-label', 'Send an invite for ' + g.name); sh.onclick = () => openWhatsApp(groupInvite(g));
      const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '🗑'; rm.setAttribute('aria-label', 'Delete ' + g.name);
      rm.onclick = () => { if (confirm(T(`Delete the group "${g.name}"?`))) { st.groups = st.groups.filter((x) => x.id !== g.id); save(); render(); } };
      box.append(sh, rm); li.append(d, box); gl.appendChild(li);
    });
    const hasSample = st.friends.some((f) => f.sample) || st.groups.some((g) => g.sample);
    $('#cm-sample').textContent = hasSample ? 'Remove the sample community' : 'Load sample community (made-up)';
  }
  function addGroup() {
    const msg = $('#g-msg'), name = CM.cleanName($('#g-name').value).slice(0, 40);
    if (!name) { msg.textContent = 'Please give your group a name.'; return; }
    if (st.groups.length >= CM.LIMITS.groupsMax) { msg.textContent = 'You have 20 groups already. Delete one first.'; return; }
    const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
    st.groups.push({ id: newId(), name, kind: $('#g-kind').value, when: clean($('#g-when').value, 40), where: clean($('#g-where').value, 60), sample: false });
    ['#g-name', '#g-when', '#g-where'].forEach((x) => { $(x).value = ''; }); msg.textContent = `Added "${name}". Tap 📤 to send an invite.`; save(); render();
  }
  function toggleSampleCommunity() {
    if (st.friends.some((f) => f.sample) || st.groups.some((g) => g.sample)) { st.friends = st.friends.filter((f) => !f.sample); st.groups = st.groups.filter((g) => !g.sample); save(); render(); toast('Sample community removed'); return; }
    const now = Date.now(), D = 86400000;
    [['Asha', 61200, 12400, 5, 0], ['Ravi', 48700, 10100, 3, 1], ['Meena', 35100, 8200, 0, 2], ['Prakash', 22400, 6100, 0, 4]].forEach(([n, w, b, s, ago], i) => st.friends.push({ id: 'sf' + i, name: n, week: w, best: b, streak: s, ts: now - ago * D, sample: true }));
    st.groups.push({ id: 'sg1', name: 'Morning walk group', kind: 'Walking', when: 'Mon-Sat, 6:30 am', where: 'Neighbourhood park (made-up)', sample: true }, { id: 'sg2', name: 'Chair yoga', kind: 'Yoga', when: 'Wed and Sat, 5 pm', where: 'Community hall (made-up)', sample: true });
    save(); render(); toast('Sample community loaded');
  }
  CM.GROUP_KINDS.forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = k; $('#g-kind').appendChild(o); });
  $('#cm-share').onclick = shareWeek; $('#cm-copy').onclick = copyLink; $('#cm-sample').onclick = toggleSampleCommunity; $('#g-add').onclick = addGroup;
  $('#pc-add').onclick = addPendingFriend; $('#pc-no').onclick = () => { pendingFriend = null; pendingErr = ''; render(); };
  window.addEventListener('hashchange', () => { if (takeIncoming() && st.profile) go('community'); });

  // ---------------- refresh ----------------
  // Re-reads the clock, re-checks whether live AI is reachable, and redraws every screen.
  // It never reloads the page, so a walk in progress and your notes are not disturbed.
  let refreshing = false;
  async function refresh(manual) {
    if (refreshing) return; refreshing = true;
    const btn = $('#refresh-btn'); btn.classList.add('spin');
    let online = true;
    try {
      const r = await fetch('api/coach', { cache: 'no-store', signal: AbortSignal.timeout(6000) });
      live = r.ok ? !!(await r.json()).live : false;
    } catch (e) { online = false; /* offline: keep what we knew */ }
    lastUpdated = new Date(); render();
    await new Promise((res) => setTimeout(res, manual ? 500 : 0)); // let the spinner be seen
    btn.classList.remove('spin'); refreshing = false;
    if (manual) toast(online ? 'Updated just now' : 'Updated (you seem to be offline)');
  }
  $('#refresh-btn').onclick = () => refresh(true);
  $('#d-refresh').onclick = () => { closeDrawer(true); refresh(true); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastUpdated.getTime() > 5 * 60 * 1000) refresh(false); }); // back after a while: catch up quietly

  // ---------------- language switch ----------------
  function markLang() { $$('.langbtn').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === I18N.lang ? 'true' : 'false')); }
  function setLanguage(l) {
    if (!I18N.IDS.includes(l) || l === I18N.lang) return;
    I18N.setLang(l); try { localStorage.setItem('dinchariya.lang', l); } catch (e) {}
    I18N.apply(); markLang(); render(); toast(T('Language changed'));
  }
  $$('.langbtn').forEach((b) => { b.onclick = () => setLanguage(b.dataset.lang); });

  // ---------------- boot ----------------
  fetch('api/coach').then((r) => (r.ok ? r.json() : { live: false })).then((j) => { live = !!j.live; render(); }).catch(() => render());
  takeIncoming();
  go('home');
  markLang();
  if (LANGUAGES_ENABLED) I18N.start();
  else { // English only for now: hide every language picker
    $$('.langpick').forEach((el) => { el.hidden = true; });
    $$('.langrow').forEach((el) => { const box = el.classList.contains('big') ? el.closest('section.card') : el.closest('li'); (box || el).hidden = true; });
  }
  if (st.profile && (pendingFriend || pendingErr)) go('community');
  setInterval(() => st.profile && render(), 5 * 60 * 1000); // keeps nudges and the date fresh
})();
