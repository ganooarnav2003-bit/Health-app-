(function () {
  'use strict';
  const E = window.HealthEngine;
  const KEY = 'dinchariya.v1';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const TXT = {
    en: { onb_h: 'Your day, in your own words.', p1h: 'Just speak', p1: 'Speak or type. No forms.', p2h: 'Gentle reminders', p2: 'One small nudge at the right time.', p3h: 'Safe by design', p3: 'Never diagnoses. Urgent signs point to 112.', onb_lead: 'Tell me about your day, the way you would tell family. I will keep the notes.', onb_name: 'Your name (optional)', onb_start: 'Start', onb_priv: 'Your notes stay on this phone. Nothing to sign up for.',
      water: 'Water', walk: 'Walk', food: 'Food', rough: 'rough estimate', say: 'What did you eat, drink or do today? Just say it.', send: 'Log it', today: "Today's notes", empty: 'Nothing yet.',
      share: 'Share today with family (WhatsApp)', sample: 'Load sample week (made-up)', reset: 'Erase all my notes', water_note: 'If your doctor has limited your fluids, follow the doctor, not this goal.',
      hello: (n) => 'Hello' + (n ? ', ' + n : ''), ph: 'e.g. 2 roti, dal, 1 glass water, 15 min walk', thinking: 'One moment…', noPhoto: 'Photo reading needs the live AI. Please type or say what was on the plate.',
      glass: 'glasses', min: 'min', walkWhy: (g, base) => g < base ? `goal made smaller to match your week` : `goal grows slowly with you`, delConfirm: 'Remove this note?', resetConfirm: 'Erase everything on this phone?',
      live: 'Live AI', demo: 'Demo mode (works offline)', mic: 'Listening…', chips: ['2 roti, dal, sabzi', 'one glass water', '20 minute walk', 'did not walk today'] },
  };

  let live = false;
  let st = load();
  const t = (k) => TXT[lang()][k];

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { profile: null, entries: [] }; } catch (e) { return { profile: null, entries: [] }; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  const lang = () => 'en';
  const todayKey = () => E.dayKey(new Date());
  const entriesOn = (k) => st.entries.filter((e) => E.dayKey(e.ts) === k);

  function history() {
    const out = [];
    for (let i = 3; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = E.dayKey(d);
      const any = entriesOn(k);
      out.push({ date: k, walkMin: E.summarize(any).walkMin, logged: any.length > 0 });
    }
    // Days before the first-ever entry are not "missed walks": ignore them.
    const first = st.entries.length ? E.dayKey(Math.min.apply(null, st.entries.map((e) => e.ts))) : null;
    return out.filter((h) => first && h.date >= first);
  }
  function goals() {
    const h = history();
    return { water: E.DEFAULT_GOALS.water, walkBase: E.DEFAULT_GOALS.walkBase, walk: E.adaptiveWalkGoal(h, E.DEFAULT_GOALS.walkBase), hasHistory: h.length > 0 };
  }

  function applyText() {
    document.documentElement.lang = 'en';
    $$('[data-t]').forEach((el) => { const v = t(el.dataset.t); if (typeof v === 'string') el.textContent = v; });
    $('#say').placeholder = t('ph');
    
    $('#chips').innerHTML = '';
    t('chips').forEach((c) => { const b = document.createElement('button'); b.textContent = c; b.type = 'button'; b.onclick = () => { const s = $('#say'); s.value = (s.value ? s.value + ', ' : '') + c; s.focus(); }; $('#chips').appendChild(b); });
  }

  function render() {
    const has = !!st.profile;
    $('#onboard').hidden = has; $('#main').hidden = !has;
    applyText();
    if (!has) return;
    const now = new Date(), g = goals(), sum = E.summarize(entriesOn(todayKey()));
    $('#hello').textContent = t('hello')(st.profile.name);
    $('#date').textContent = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#t-water').textContent = `${sum.water}/${g.water}`;
    $('#t-walk').textContent = `${sum.walkMin}/${g.walk} ${t('min')}`;
    $('#b-water').style.width = Math.min(100, (sum.water / g.water) * 100) + '%';
    $('#b-walk').style.width = Math.min(100, (sum.walkMin / g.walk) * 100) + '%';
    $('#walk-why').textContent = g.hasHistory ? t('walkWhy')(g.walk, g.walkBase) : '';
    $('#t-food').textContent = sum.kcalHi ? `${sum.kcalLo}-${sum.kcalHi}` : '-';
    const n = E.nudge(now, sum, g, history());
    const nd = $('#nudge'); nd.textContent = n[lang()]; nd.classList.toggle('warn', n.kind === 'walk-skipped');
    // log
    const ul = $('#log'); ul.innerHTML = '';
    const todays = entriesOn(todayKey()).slice().reverse();
    $('#empty').hidden = todays.length > 0;
    todays.forEach((e) => {
      const li = document.createElement('li');
      const d = document.createElement('div');
      const bits = [];
      (e.meals || []).forEach((m) => bits.push(m.skipped ? `✗ ${m.name}` : `${m.qty !== 1 ? m.qty + ' ' : ''}${m.name} (${m.kcalLo}-${m.kcalHi})`));
      if (e.water) bits.push(`💧 ${e.water}`);
      if (e.walkMin) bits.push(`🚶 ${e.walkMin} ${t('min')}`);
      if (e.walkSkipped) bits.push('🚶 ✗');
      if (e.bp) bits.push(`BP ${e.bp.s}/${e.bp.d}`);
      if (e.sugar != null) bits.push(`sugar ${e.sugar}`);
      if (e.safety && e.safety.level !== 'none') bits.push('⚠ ' + 'tell your doctor');
      d.innerHTML = '<div class="t"></div><div class="b"></div>';
      d.querySelector('.t').textContent = new Date(e.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      d.querySelector('.b').textContent = bits.join(' · ') || e.text;
      const del = document.createElement('button'); del.textContent = '🗑'; del.setAttribute('aria-label', 'Remove');
      del.onclick = () => { if (confirm(t('delConfirm'))) { st.entries = st.entries.filter((x) => x.id !== e.id); save(); render(); } };
      li.append(d, del); ul.appendChild(li);
    });
    $('#mode').textContent = live ? t('live') : t('demo');
  }

  function showReply(r) {
    const el = $('#reply'); el.hidden = false; el.textContent = r.reply;
    el.className = 'reply' + (r.safety && r.safety.level === 'red' ? ' red' : r.safety && r.safety.level === 'amber' ? ' amber' : '');
  }

  async function analyze(text, image) {
    const now = new Date();
    const local = E.analyze(text, { lang: lang(), now });
    // Red flags are decided locally, instantly, and never wait for a network call.
    if (local.safety.level === 'red') return { ...local, source: 'safety' };
    if (live) {
      try {
        const sum = E.summarize(entriesOn(todayKey()));
        const r = await fetch('api/coach', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(16000),
          body: JSON.stringify({ text, image, lang: lang(), now: now.toISOString(), context: { water: sum.water, walkMin: sum.walkMin } }) });
        if (r.ok) return await r.json();
      } catch (e) { /* poor connectivity: fall through to demo engine */ }
    }
    if (image && !text) return { ...local, reply: t('noPhoto') };
    return local;
  }

  async function submit(text, image) {
    text = (text || '').trim();
    if (!text && !image) return;
    const btn = $('#send'); btn.disabled = true;
    const rep = $('#reply'); rep.hidden = false; rep.className = 'reply'; rep.textContent = t('thinking');
    const r = await analyze(text, image);
    btn.disabled = false;
    const empty = !r.meals.length && !r.water && !r.walkMin && !r.walkSkipped && !r.bp && r.sugar == null && r.safety.level === 'none';
    if (!empty) {
      st.entries.push({ id: Date.now() + '' + Math.random().toString(16).slice(2, 6), ts: Date.now(), text: r.safety.level === 'red' ? '' : text,
        meals: r.meals, water: r.water, walkMin: r.walkMin, walkSkipped: r.walkSkipped, bp: r.bp, sugar: r.sugar, safety: r.safety });
      save();
    }
    showReply(r); $('#say').value = ''; render();
  }

  // ---- events ----
  $('#start').onclick = () => { st.profile = { name: $('#name').value.trim(), lang: 'en' }; save(); render(); $('#say').focus(); };
  $('#send').onclick = () => submit($('#say').value);
  $('#say').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit($('#say').value); });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) $('#mic').hidden = true;
  else $('#mic').onclick = () => {
    const r = new SR(); r.lang = 'en-IN'; r.interimResults = false;
    $('#mic').textContent = '…'; $('#reply').hidden = false; $('#reply').className = 'reply'; $('#reply').textContent = t('mic');
    r.onresult = (ev) => { $('#say').value = (($('#say').value ? $('#say').value + ' ' : '') + ev.results[0][0].transcript).trim(); };
    r.onend = () => { $('#mic').textContent = '🎤'; $('#reply').hidden = true; };
    r.onerror = () => { $('#mic').textContent = '🎤'; };
    r.start();
  };

  $('#photo').onclick = () => { if (!live) { const el = $('#reply'); el.hidden = false; el.className = 'reply amber'; el.textContent = t('noPhoto'); } else $('#file').click(); };
  $('#file').onchange = (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => { // downscale so uploads are small on weak connections
      const s = Math.min(1, 800 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      submit($('#say').value, c.toDataURL('image/jpeg', 0.7).split(',')[1]);
    };
    img.src = URL.createObjectURL(f); ev.target.value = '';
  };

  $('#share').onclick = () => {
    const txt = E.familySummary(st.profile.name, E.summarize(entriesOn(todayKey())), goals(), lang());
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  };
  $('#reset').onclick = () => { if (confirm(t('resetConfirm'))) { localStorage.removeItem(KEY); st = { profile: null, entries: [] }; $('#reply').hidden = true; render(); } };

  // Made-up sample week so reviewers can see the adaptive goal without waiting days.
  $('#sample').onclick = () => {
    const walks = [5, 0, 12]; // last 3 days: small, none, a bit more
    st.entries = st.entries.filter((e) => e.sample !== true);
    walks.forEach((w, i) => {
      const d = new Date(); d.setDate(d.getDate() - (3 - i)); d.setHours(9, 0, 0, 0);
      st.entries.push({ id: 's' + i, ts: d.getTime(), sample: true, text: 'sample', meals: [{ name: 'roti', qty: 2, unit: 'pc', kcalLo: 140, kcalHi: 200, slot: 'lunch' }], water: 3, walkMin: w, walkSkipped: w === 0, safety: { level: 'none', reasons: [] } });
    });
    save(); render();
  };

  // ---- boot ----
  fetch('api/coach').then((r) => (r.ok ? r.json() : { live: false })).then((j) => { live = !!j.live; render(); }).catch(() => render());
  render();
  setInterval(() => st.profile && render(), 5 * 60 * 1000); // keeps the nudge fresh as the day moves
})();
