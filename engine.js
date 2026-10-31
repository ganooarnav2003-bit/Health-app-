/*
 * Dinchariya engine: shared by the browser (demo mode) and the serverless
 * function (safety layer + output validation for live AI).
 *
 * Everything health-critical here is plain deterministic code, NOT an LLM:
 *   - assessSafety(): red-flag / medication detection
 *   - guardrail():    blocks diagnosis / prescription wording in AI replies
 * The AI may only ESCALATE safety, never downgrade it.
 *
 * All nutrition numbers are rough RANGES for typical home portions. They are
 * not medical or dietetic advice.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HealthEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- vocabulary ----------
  const NUM = {
    ek: 1, एक: 1, one: 1, do: 2, दो: 2, two: 2, teen: 3, तीन: 3, three: 3,
    char: 4, chaar: 4, चार: 4, four: 4, paanch: 5, panch: 5, पांच: 5, पाँच: 5, five: 5,
    chhe: 6, chhah: 6, छह: 6, six: 6, aadha: 0.5, adha: 0.5, aadhi: 0.5, आधा: 0.5, आधी: 0.5, half: 0.5,
    dedh: 1.5, डेढ़: 1.5, dhai: 2.5, ढाई: 2.5,
  };
  const UNIT = new Set(['katori', 'कटोरी', 'bowl', 'plate', 'plt', 'piece', 'pieces', 'pc', 'pcs', 'cup', 'cups', 'glass', 'glasses', 'gilas', 'plate', 'प्लेट', 'कप']);

  // name, aliases, unit label, kcal per unit [lo, hi] (typical home portion; approximate)
  const FOODS = [
    { name: 'roti', al: ['roti', 'rotis', 'chapati', 'chapatti', 'phulka', 'रोटी', 'चपाती', 'फुल्का'], unit: 'pc', kcal: [70, 100] },
    { name: 'paratha', al: ['paratha', 'parantha', 'parathe', 'पराठा', 'पराठे'], unit: 'pc', kcal: [150, 250] },
    { name: 'naan', al: ['naan', 'nan', 'नान'], unit: 'pc', kcal: [220, 300] },
    { name: 'rice', al: ['rice', 'chawal', 'chaawal', 'bhaat', 'चावल', 'भात'], unit: 'katori', kcal: [130, 200] },
    { name: 'dal', al: ['dal', 'daal', 'dhal', 'दाल'], unit: 'katori', kcal: [100, 150] },
    { name: 'sabzi', al: ['sabzi', 'sabji', 'sabji', 'subzi', 'vegetable', 'veg', 'सब्जी', 'सब्ज़ी'], unit: 'katori', kcal: [80, 150] },
    { name: 'khichdi', al: ['khichdi', 'khichri', 'खिचड़ी'], unit: 'katori', kcal: [150, 220] },
    { name: 'idli', al: ['idli', 'idlis', 'idly', 'इडली', 'इडली'], unit: 'pc', kcal: [40, 60] },
    { name: 'dosa', al: ['dosa', 'dosas', 'dosai', 'डोसा'], unit: 'pc', kcal: [120, 200] },
    { name: 'sambar', al: ['sambar', 'sambhar', 'सांभर'], unit: 'katori', kcal: [80, 120] },
    { name: 'poha', al: ['poha', 'पोहा'], unit: 'plate', kcal: [250, 350] },
    { name: 'upma', al: ['upma', 'उपमा'], unit: 'plate', kcal: [200, 300] },
    { name: 'curd', al: ['curd', 'dahi', 'yogurt', 'दही'], unit: 'katori', kcal: [60, 100] },
    { name: 'paneer dish', al: ['paneer', 'पनीर'], unit: 'katori', kcal: [200, 300] },
    { name: 'egg', al: ['egg', 'eggs', 'anda', 'ande', 'अंडा', 'अंडे'], unit: 'pc', kcal: [70, 90] },
    { name: 'chicken curry', al: ['chicken', 'murgh'], unit: 'katori', kcal: [200, 300] },
    { name: 'fruit', al: ['fruit', 'fruits', 'apple', 'seb', 'kela', 'banana', 'papita', 'papaya', 'santra', 'orange', 'फल', 'सेब', 'केला'], unit: 'pc', kcal: [60, 100] },
    { name: 'chai', al: ['chai', 'tea', 'चाय'], unit: 'cup', kcal: [40, 100], drink: true },
    { name: 'biscuit', al: ['biscuit', 'biscuits', 'biskut', 'बिस्कुट'], unit: 'pc', kcal: [30, 50] },
    { name: 'samosa', al: ['samosa', 'samosas', 'समोसा', 'समोसे'], unit: 'pc', kcal: [250, 300] },
    { name: 'mithai', al: ['mithai', 'sweet', 'sweets', 'laddu', 'ladoo', 'jalebi', 'gulab', 'मिठाई', 'लड्डू'], unit: 'pc', kcal: [150, 250] },
    // A whole thali is too varied to guess: counted but flagged low-confidence.
    { name: 'thali', al: ['thali', 'थाली'], unit: 'plate', kcal: [600, 900], lowConf: true },
  ];
  const FOOD_BY_ALIAS = {};
  FOODS.forEach((f) => f.al.forEach((a) => (FOOD_BY_ALIAS[a] = f)));

  const WATER_WORDS = new Set(['paani', 'pani', 'water', 'jal', 'पानी']);
  const GLASS_WORDS = new Set(['glass', 'glasses', 'gilas', 'glas', 'गिलास']);
  const WALK_RE = /(walk|walked|walking|tehal|tahel|tahal|taihal|chala|chali|chale|ghoom|वॉक|टहल|चला|चली)/;
  const NEG = new Set(['nahi', 'nahin', 'nhi', 'nai', 'not', 'no', "didn't", 'didnt', 'skip', 'skipped', 'नहीं', 'नही']);
  const MEAL_ACTION = /(khay|khaa|kha |kha$|ate|eaten|had|piya|pi |liya|खाय|खाई|खाया|पिया|ली)/;

  const T = (s) =>
    s.toLowerCase().split(/[^\p{L}\p{N}\p{M}'\/.]+/u).map((x) => x.replace(/^\.+|\.+$/g, '')).filter(Boolean);

  // ---------- safety ----------
  const RED = [
    ['chest', /(chest|seena|seene|chhati|chati|सीने|छाती)[^.,;]{0,22}(pain|dard|tightness|jakad|heavy|bhaari|bhari|dabav|दर्द|जकड़न|दबाव)|(pain|dard|दर्द)[^.,;]{0,18}(chest|seene|chhati|सीने|छाती)/g],
    ['breath', /(saans|sans|सांस|साँस)[^.,;]{0,22}(phool|phul|takleef|dikkat|ruk|nahi aa|नहीं आ|तकलीफ|फूल)|breathless|short of breath|difficulty breathing|trouble breathing|can'?t breathe|cannot breathe/g],
    ['faint', /(behosh|बेहोश|faint|fainted|passed out|blackout|black out|unconscious|andhera chha|अंधेरा छा)/g],
    ['heart', /(dil|heart|दिल)[^.,;]{0,15}(ghabra|ghabar|dhadak|palpit|घबरा|धड़क)|(pasina|पसीना|sweating)[^.,;]{0,25}(ghabra|ghabrahat|ghabar|chest|seene)|(ghabra|ghabrahat)[^.,;]{0,25}(pasina|पसीना|sweat)/g],
    ['stroke', /(ek taraf|one side|aadha chehra)[^.,;]{0,25}(kamzor|weak|sunn|numb|tedha)|face[^.,;]{0,12}(droop|tedha)|(bol|zubaan|zuban)[^.,;]{0,18}(nahi|atak|lad)|slurred/g],
    ['bleeding', /(khoon|blood)[^.,;]{0,18}(bahut|heavy|nahi ruk|won'?t stop|ulti|vomit)|(ulti|vomit)[^.,;]{0,12}(khoon|blood)/g],
    ['mental', /(jeene ka mann nahi|marna chah|suicide|khud ko khatam|end my life|want to die|jeena nahi)/g],
  ];
  const AMBER = [
    ['dizzy', /(chakkar|chakar|dizz|चक्कर)/g],
    ['pain', /(dard|pain|ache|दर्द)/g],
    ['swelling', /(sujan|swelling|swollen|सूजन)/g],
    ['fever', /(bukhar|bukhaar|fever|बुखार)/g],
    ['gi', /(ulti|vomit|loose motion|dast|दस्त|उल्टी)/g],
    ['palpitation', /(ghabra|ghabrahat|घबरा)/g],
  ];
  const MED_OBJ = /(dawai|dawa|dava|tablet|goli|insulin|medicine|medication|dose|दवाई|दवा|गोली)/;
  const MED_ACT = /(band|chhod|chod|stop|skip|double|zyada|jyada|kam kar|badal|change|nahi leni|mat lo|mat le|बंद|छोड़|ज्यादा|ज़्यादा)/;

  function negated(text, idx, len) {
    const after = text.slice(idx + len, idx + len + 20);
    const before = text.slice(Math.max(0, idx - 10), idx);
    return /^\s*(hai\s+)?(nahi|nahin|nhi|no|not|नहीं|नही)\b/.test(after) || /\b(no|not|without|koi)\s*$/.test(before);
  }

  function readings(text) {
    const out = { bp: null, sugar: null };
    const bp = text.match(/(?:\bbp\b|blood pressure|बीपी)?\D{0,12}\b(\d{2,3})\s*[\/\\]\s*(\d{2,3})\b/);
    if (bp) {
      const s = +bp[1], d = +bp[2];
      if (s >= 70 && s <= 260 && d >= 40 && d <= 160 && s > d) out.bp = { s, d };
    }
    const su = text.match(/(?:sugar|shugar|glucose|शुगर)\D{0,14}(\d{2,3})\b/);
    if (su) {
      const v = +su[1];
      if (v >= 20 && v <= 600) out.sugar = v;
    }
    return out;
  }

  function assessSafety(raw) {
    const text = String(raw || '').toLowerCase();
    const reasons = [];
    let level = 'none';
    let kind = null;
    const bump = (lv, k) => {
      if (lv === 'red' || (lv === 'amber' && level === 'none')) { level = lv; kind = kind && level !== 'red' ? kind : k; }
      if (lv === 'red') kind = k;
    };
    RED.forEach(([k, re]) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (!negated(text, m.index, m[0].length)) { reasons.push(k); bump('red', k); break; }
      }
    });
    const r = readings(text);
    if (r.bp) {
      if (r.bp.s >= 180 || r.bp.d >= 120 || r.bp.s < 80) { reasons.push('bp-extreme'); bump('red', 'reading'); }
      else if (r.bp.s >= 160 || r.bp.d >= 100) { reasons.push('bp-high'); bump('amber', 'reading'); }
    }
    if (r.sugar != null) {
      if (r.sugar <= 70 || r.sugar >= 300) { reasons.push('sugar-extreme'); bump('red', 'reading'); }
      else if (r.sugar >= 250) { reasons.push('sugar-high'); bump('amber', 'reading'); }
    }
    if (level !== 'red') {
      AMBER.forEach(([k, re]) => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          if (!negated(text, m.index, m[0].length)) { reasons.push(k); bump('amber', k); break; }
        }
      });
    }
    if (MED_OBJ.test(text) && MED_ACT.test(text)) { reasons.push('medication'); if (level === 'none') { level = 'amber'; kind = 'med'; } else if (level === 'amber') kind = 'med'; }
    return { level, kind, reasons: [...new Set(reasons)], readings: r };
  }

  const SAFETY_TEXT = {
    red: {
      en: 'This sounds serious. Please call 112 (or 108 for an ambulance) or get someone to take you to a doctor now. Do not wait for the app.',
      hi: 'Yeh serious ho sakta hai. Abhi 112 (ya ambulance ke liye 108) par call karein ya kisi ko saath lekar doctor ke paas jayein. App ka intezaar na karein.',
    },
    mental: {
      en: 'I am sorry you feel this way. Please talk to someone now: Tele-MANAS 14416 (free, 24x7), or a family member. If you are in danger, call 112.',
      hi: 'Mujhe afsos hai ki aap aisa mehsoos kar rahe hain. Abhi kisi se baat karein: Tele-MANAS 14416 (free, 24x7) ya ghar ke kisi vyakti se. Khatre mein hon to 112 par call karein.',
    },
    amber: {
      en: 'Noted. Please tell your doctor about this today. This app cannot tell what it means.',
      hi: 'Note kar liya. Kripya aaj apne doctor ko bataiye. Yeh app iska matlab nahi bata sakta.',
    },
    med: {
      en: 'I cannot advise on medicines. Please ask your doctor before changing or skipping anything.',
      hi: 'Main dawai ke baare mein salah nahi de sakta. Kuch bhi badalne ya chhodne se pehle apne doctor se poochhein.',
    },
  };
  function safetyMessage(s, lang) {
    if (!s || s.level === 'none') return null;
    const l = lang === 'hi' ? 'hi' : 'en';
    if (s.reasons.includes('mental')) return SAFETY_TEXT.mental[l];
    if (s.level === 'red') return SAFETY_TEXT.red[l];
    if (s.kind === 'med') return SAFETY_TEXT.med[l];
    return SAFETY_TEXT.amber[l];
  }

  // Block diagnosis / prescription wording from any AI-written reply.
  const BANNED = /(\bdiagnos|you (have|are suffering|probably have|might have)|aapko .{0,25}(bimari|rog|diabetes|hai)\b|\btake \d|\b\d+\s?mg\b|stop taking|increase (your )?dose|\bprescri|dose badha|dawai band kar|dawai le lo|you should take)/i;
  function guardrail(reply) {
    if (!reply || BANNED.test(reply)) return null;
    let r = String(reply).trim();
    if (r.length > 280) {
      const parts = r.match(/[^.!?।]+[.!?।]?/g) || [r];
      r = parts.slice(0, 2).join('').trim();
    }
    return r.slice(0, 280);
  }

  // ---------- parsing ----------
  function numBefore(tokens, i, maxBack) {
    for (let k = 1; k <= maxBack && i - k >= 0; k++) {
      const t = tokens[i - k];
      if (/^\d+(\.\d+)?$/.test(t)) return +t;
      if (NUM[t] != null) return NUM[t];
      if (!UNIT.has(t) && t !== 'ki' && t !== 'ke' && t !== 'ka') return null;
    }
    return null;
  }

  function slotFor(clause, hour) {
    if (/(nashta|nashte|breakfast|subah|सुबह|नाश्ता)/.test(clause)) return 'breakfast';
    if (/(lunch|dopahar|दोपहर)/.test(clause)) return 'lunch';
    if (/(dinner|raat|रात)/.test(clause)) return 'dinner';
    if (/(snack|shaam|evening|शाम)/.test(clause)) return 'snack';
    if (hour < 11) return 'breakfast';
    if (hour < 16) return 'lunch';
    if (hour < 19) return 'snack';
    return 'dinner';
  }

  function parse(raw, hour) {
    const text = String(raw || '');
    const clauses = text.toLowerCase().split(/[,.;\n]|\baur\b|\band\b|\bphir\b|\bthen\b|और/);
    const out = { meals: [], water: 0, walkMin: 0, steps: 0, walkSkipped: false, unknown: [] };
    let slot = null;
    clauses.forEach((c) => {
      const tokens = T(c);
      if (!tokens.length) return;
      const hasNeg = tokens.some((t) => NEG.has(t));
      slot = /(nashta|nashte|breakfast|lunch|dopahar|dinner|raat|snack|shaam|evening|subah|सुबह|नाश्ता|दोपहर|रात|शाम)/.test(c) ? slotFor(c, hour) : slot;
      tokens.forEach((t, i) => {
        // foods
        const f = FOOD_BY_ALIAS[t];
        if (f) {
          const n = numBefore(tokens, i, 3);
          const meal = {
            name: f.name, qty: n == null ? 1 : n, unit: f.unit, assumed: n == null,
            kcalLo: Math.round((n == null ? 1 : n) * f.kcal[0]), kcalHi: Math.round((n == null ? 1 : n) * f.kcal[1]),
            slot: slotFor(c, hour) || slot, skipped: hasNeg, lowConf: !!f.lowConf,
          };
          if (hasNeg) { meal.kcalLo = 0; meal.kcalHi = 0; }
          out.meals.push(meal);
        }
        // water: "<n> glass (paani)" or "<n> bottle/litre"
        if (GLASS_WORDS.has(t) || t === 'bottle' || t === 'litre' || t === 'liter' || t === 'ltr' || t === 'लीटर' || t === 'बोतल') {
          const n = numBefore(tokens, i, 1);
          const waterish = tokens.some((x) => WATER_WORDS.has(x)) || t !== 'glass' && t !== 'glasses' && t !== 'gilas' && t !== 'glas' && t !== 'गिलास';
          const hasDrinkWord = tokens.some((x) => WATER_WORDS.has(x)) || /(piya|pi liya|drank|drink|पिया)/.test(c);
          if ((waterish || hasDrinkWord) && !hasNeg) {
            const per = /bottle|बोतल/.test(t) ? 3 : /lit|ltr|लीटर/.test(t) ? 4 : 1;
            out.water += (n == null ? 1 : n) * per;
          }
        }
      });
      // water without a unit: "paani piya" -> 1 glass assumed
      if (!tokens.some((t) => GLASS_WORDS.has(t) || ['bottle', 'litre', 'liter', 'ltr', 'लीटर', 'बोतल'].includes(t)) &&
          tokens.some((t) => WATER_WORDS.has(t)) && /(piya|pi liya|drank|drink|पिया|had)/.test(c) && !hasNeg) {
        out.water += 1;
      }
      // walking
      if (WALK_RE.test(c)) {
        if (hasNeg) out.walkSkipped = true;
        else {
          let mins = 0;
          const m = c.match(/(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|मिनट)/);
          const h = c.match(/(\d+(?:\.\d+)?|aadha|adha|आधा|half|dedh|डेढ़)\s*(ghanta|ghante|ghanta|hour|hours|hr|घंटा|घंटे)/);
          if (m) mins = +m[1];
          else if (h) mins = (NUM[h[1]] != null ? NUM[h[1]] : +h[1]) * 60;
          const st = c.match(/(\d{3,6})\s*(steps?|kadam|क़दम|कदम)/);
          if (st) out.steps += +st[1];
          out.walkMin += mins;
          if (!mins && !st) out.walkMin += 0;
        }
      } else {
        const st = c.match(/(\d{3,6})\s*(steps?|kadam|कदम)/);
        if (st) out.steps += +st[1];
      }
    });
    if (out.steps && !out.walkMin) out.walkMin = Math.round(out.steps / 100); // ~100 steps/min
    out.meals = out.meals.filter((m, i, a) => !(m.name === 'chai' && a.findIndex((x) => x.name === 'chai' && x.slot === m.slot) !== i));
    return out;
  }

  // ---------- day summary, goals, nudges ----------
  const DEFAULT_GOALS = { water: 6, walkBase: 20 };

  function dayKey(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  function summarize(entries) {
    const s = { water: 0, walkMin: 0, walkSkipped: false, kcalLo: 0, kcalHi: 0, meals: [], slots: new Set(), flags: [], bp: null, sugar: null, entries: entries.length };
    entries.forEach((e) => {
      s.water += e.water || 0;
      s.walkMin += e.walkMin || 0;
      if (e.walkSkipped) s.walkSkipped = true;
      (e.meals || []).forEach((m) => {
        if (m.skipped) return;
        s.kcalLo += m.kcalLo; s.kcalHi += m.kcalHi; s.meals.push(m); if (m.slot) s.slots.add(m.slot);
      });
      if (e.safety && e.safety.level !== 'none') s.flags.push(e.safety);
      if (e.bp) s.bp = e.bp;
      if (e.sugar != null) s.sugar = e.sugar;
    });
    return s;
  }

  // Walking goal follows what the person actually does: start small, grow slowly.
  // Uses the last 3 days before today (missing days count as 0).
  function adaptiveWalkGoal(history, base) {
    const b = base || DEFAULT_GOALS.walkBase;
    if (!history || !history.length) return Math.min(b, 15);
    const last = history.slice(-3);
    const avg = last.reduce((a, x) => a + (x.walkMin || 0), 0) / last.length;
    const goal = Math.round((avg * 1.2 + 5) / 5) * 5;
    return Math.max(10, Math.min(30, goal));
  }

  const NUDGE = {
    breakfast: { en: 'Good morning. Tell me what you had for breakfast: just say it, any language.', hi: 'Suprabhat. Nashte mein kya liya? Bas bol dijiye, kisi bhi bhasha mein.' },
    water: (n, g) => ({ en: `Only ${n} glass of water so far. One glass now?`, hi: `Abhi tak sirf ${n} glass paani. Ek glass abhi?` }),
    walk: (g, shrunk) => ({
      en: `Walk is still pending. ${g} minutes is enough today${shrunk ? ' (I made it smaller to match your week)' : ''}.`,
      hi: `Aaj ki walk baaki hai. Aaj sirf ${g} minute kaafi hai${shrunk ? ' (aapke hafte ke hisaab se chhota rakha hai)' : ''}.`,
    }),
    walkSkippedToday: { en: 'No problem about the walk today. Tomorrow we keep it short and easy.', hi: 'Aaj walk nahi hui, koi baat nahi. Kal chhoti si rakhenge.' },
    dinner: { en: 'Shall we log dinner? A light dinner helps you sleep well.', hi: 'Raat ka khana log karein? Halka khana neend ke liye accha rehta hai.' },
    good: { en: 'You are on track today. Nothing needed right now.', hi: 'Aaj sab theek chal raha hai. Abhi kuch karne ki zaroorat nahi.' },
  };

  function nudge(now, sum, goals, history) {
    const h = now.getHours();
    const wg = goals.walk;
    if (sum.entries === 0 && h >= 6 && h < 12) return { kind: 'breakfast', ...NUDGE.breakfast };
    const expected = Math.floor((goals.water * Math.max(0, h - 7)) / 12);
    if (h >= 10 && sum.water < Math.max(1, expected - 1)) return { kind: 'water', ...NUDGE.water(sum.water) };
    if (h >= 16 && sum.walkSkipped) return { kind: 'walk-skipped', ...NUDGE.walkSkippedToday };
    if (h >= 16 && sum.walkMin < wg) {
      const shrunk = wg < (goals.walkBase || 20);
      return { kind: 'walk', ...NUDGE.walk(wg - sum.walkMin > 0 ? wg : wg, shrunk) };
    }
    if (h >= 19 && !sum.slots.has('dinner')) return { kind: 'dinner', ...NUDGE.dinner };
    return { kind: 'good', ...NUDGE.good };
  }

  // ---------- reply composition (demo mode) ----------
  const L = {
    logged: { en: 'Logged', hi: 'Likh liya' },
    water: { en: 'water', hi: 'paani' },
    glass: { en: 'glass', hi: 'glass' },
    walk: { en: 'walk', hi: 'walk' },
    min: { en: 'min', hi: 'min' },
    nothing: { en: 'I could not find anything to log. Try: "2 roti, dal, 1 glass water".', hi: 'Kuch log karne layak nahi mila. Aise bataiye: "2 roti, dal, 1 glass paani".' },
    ask: {
      en: 'Is this right? Tap the bin to remove anything wrong.',
      hi: 'Kya yeh sahi hai? Galat ho to bin dabakar hata dijiye.',
    },
    thali: { en: 'A thali varies a lot. What was on it? e.g. "2 roti, dal, sabzi, rice".', hi: 'Thali mein bahut kuch ho sakta hai. Kya-kya tha? jaise "2 roti, dal, sabzi, chawal".' },
    assumed: { en: 'I assumed 1 portion where you did not say a number.', hi: 'Jahan aapne number nahi bataya wahan 1 maana hai.' },
  };

  function fmtMeal(m, lang) {
    if (m.skipped) return (lang === 'hi' ? 'nahi khaya: ' : 'skipped: ') + m.name;
    const q = m.qty === 1 ? '' : m.qty + ' ';
    return q + m.name;
  }

  function analyze(text, ctx) {
    ctx = ctx || {};
    const lang = ctx.lang === 'hi' ? 'hi' : 'en';
    const now = ctx.now ? new Date(ctx.now) : new Date();
    const p = parse(text, now.getHours());
    const safety = assessSafety(text);
    const res = {
      source: 'demo',
      meals: p.meals, water: Math.min(p.water, 20), walkMin: Math.min(Math.round(p.walkMin), 300), steps: p.steps, walkSkipped: p.walkSkipped,
      bp: safety.readings.bp, sugar: safety.readings.sugar,
      safety: { level: safety.level, kind: safety.kind, reasons: safety.reasons },
      clarify: null, reply: '',
    };
    const eaten = p.meals.filter((m) => !m.skipped);
    if (p.meals.some((m) => m.lowConf)) res.clarify = L.thali[lang];

    const parts = [];
    const sm = safetyMessage(res.safety, lang);
    const logged = [];
    if (eaten.length) {
      const lo = eaten.reduce((a, m) => a + m.kcalLo, 0), hi = eaten.reduce((a, m) => a + m.kcalHi, 0);
      logged.push(eaten.map((m) => fmtMeal(m, lang)).join(', ') + ` (~${lo}-${hi} kcal)`);
    }
    if (p.water) logged.push(`${p.water} ${L.glass[lang]} ${L.water[lang]}`);
    if (p.walkMin) logged.push(`${L.walk[lang]} ${Math.round(p.walkMin)} ${L.min[lang]}`);
    if (res.bp) logged.push(`BP ${res.bp.s}/${res.bp.d}`);
    if (res.sugar != null) logged.push(`sugar ${res.sugar}`);
    if (logged.length) parts.push(`${L.logged[lang]}: ${logged.join('; ')}.`);
    else if (!sm && !p.walkSkipped && !p.meals.length) parts.push(L.nothing[lang]);
    if (p.walkSkipped) parts.push(NUDGE.walkSkippedToday[lang]);
    if (res.clarify) parts.push(res.clarify);
    else if (eaten.some((m) => m.assumed)) parts.push(L.assumed[lang]);
    if (sm) parts.push(sm);
    res.reply = parts.join(' ');
    return res;
  }

  // Validate / clamp a model-produced object into the same shape as analyze().
  // The deterministic safety result always wins; the model may only escalate.
  function fromAI(obj, text, ctx) {
    const lang = ctx && ctx.lang === 'hi' ? 'hi' : 'en';
    const det = assessSafety(text);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : 0));
    const now = ctx && ctx.now ? new Date(ctx.now) : new Date();
    const meals = (Array.isArray(obj.meals) ? obj.meals : []).slice(0, 12).map((m) => {
      const lo = clamp(m.kcal_lo, 0, 2500), hi = Math.max(lo, clamp(m.kcal_hi, 0, 2500));
      return {
        name: String(m.name || 'food').slice(0, 40), qty: clamp(m.qty || 1, 0, 20), unit: String(m.unit || '').slice(0, 12),
        kcalLo: Math.round(lo), kcalHi: Math.round(hi), slot: ['breakfast', 'lunch', 'snack', 'dinner'].includes(m.slot) ? m.slot : slotFor('', now.getHours()),
        skipped: !!m.skipped, assumed: !!m.assumed, lowConf: m.confidence === 'low',
      };
    });
    let level = det.level, kind = det.kind;
    const reasons = det.reasons.slice();
    if (obj.urgent === true && level !== 'red') { level = 'red'; kind = 'ai'; reasons.push('ai-urgent'); }
    else if (Array.isArray(obj.symptoms) && obj.symptoms.length && level === 'none') { level = 'amber'; kind = 'ai'; reasons.push('ai-symptom'); }
    const safety = { level, kind, reasons };
    const sm = safetyMessage(safety, lang);
    let reply = guardrail(obj.reply);
    let guardrailHit = false;
    if (reply == null) { guardrailHit = true; reply = ''; }
    if (sm) reply = (level === 'red' ? sm : (reply + ' ' + sm).trim());
    const clarify = typeof obj.clarify === 'string' && obj.clarify ? obj.clarify.slice(0, 160) : null;
    if (clarify && !reply.includes(clarify) && level !== 'red') reply = (reply + ' ' + clarify).trim();
    const out = {
      source: 'ai', meals, water: clamp(obj.water_glasses, 0, 20), walkMin: Math.round(clamp(obj.walk_min, 0, 300)), steps: Math.round(clamp(obj.steps, 0, 40000)),
      walkSkipped: !!obj.walk_skipped,
      bp: det.readings.bp, sugar: det.readings.sugar, safety, clarify, reply, guardrailHit,
    };
    if (guardrailHit && !sm) {
      const fallback = analyze(text, ctx);
      out.reply = fallback.reply;
    }
    return out;
  }

  function familySummary(name, sum, goals, lang) {
    const n = name || (lang === 'hi' ? 'Aaj' : 'Today');
    const kcal = sum.kcalHi ? `${sum.kcalLo}-${sum.kcalHi} kcal (rough)` : '-';
    const flag = sum.flags.length ? (lang === 'hi' ? '\nDhyaan: kuch symptoms note kiye gaye, doctor ko batana hai.' : '\nNote: symptoms were logged, please check with the doctor.') : '';
    if (lang === 'hi') return `${n} ka din:\nPaani: ${sum.water}/${goals.water} glass\nWalk: ${sum.walkMin}/${goals.walk} min\nKhana: ${sum.meals.length} items, ${kcal}${flag}\n(Dinchariya app - medical salah nahi)`;
    return `${n}'s day:\nWater: ${sum.water}/${goals.water} glasses\nWalk: ${sum.walkMin}/${goals.walk} min\nFood: ${sum.meals.length} items, ${kcal}${flag}\n(Dinchariya app - not medical advice)`;
  }

  return { parse, analyze, assessSafety, safetyMessage, guardrail, fromAI, summarize, adaptiveWalkGoal, nudge, familySummary, dayKey, DEFAULT_GOALS, FOODS };
});
