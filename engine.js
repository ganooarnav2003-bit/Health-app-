/*
 * My Fitness Buddy engine: shared by the browser (demo mode) and the serverless
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
    chhe: 6, chhah: 6, छह: 6, six: 6, a: 1, an: 1, aadha: 0.5, adha: 0.5, aadhi: 0.5, आधा: 0.5, आधी: 0.5, half: 0.5,
    dedh: 1.5, डेढ़: 1.5, dhai: 2.5, ढाई: 2.5,
  };
  const UNIT = new Set(['slice', 'slices', 'handful', 'of', 'katori', 'कटोरी', 'bowl', 'plate', 'plt', 'piece', 'pieces', 'pc', 'pcs', 'cup', 'cups', 'glass', 'glasses', 'gilas', 'plate', 'प्लेट', 'कप']);

  // name, aliases, unit label, kcal per unit [lo, hi] (typical home portion; approximate)
  const FOODS = [
    { name: 'roti', al: ['roti', 'rotis', 'chapati', 'chapatti', 'phulka', 'रोटी', 'चपाती', 'फुल्का'], unit: 'pc', kcal: [70, 100] },
    { name: 'paratha', al: ['paratha', 'parantha', 'parathe', 'पराठा', 'पराठे'], unit: 'pc', kcal: [150, 250] },
    { name: 'naan', al: ['naan', 'nan', 'नान'], unit: 'pc', kcal: [220, 300] },
    { name: 'rice', al: ['rice', 'chawal', 'chaawal', 'bhaat', 'चावल', 'भात'], unit: 'katori', kcal: [130, 200] },
    { name: 'dal', al: ['dal', 'daal', 'dhal', 'दाल'], unit: 'katori', kcal: [100, 150] },
    { name: 'sabzi', al: ['sabzi', 'sabji', 'subzi', 'vegetable', 'veg', 'aloo', 'bhindi', 'gobi', 'palak', 'bhaji', 'सब्जी', 'सब्ज़ी'], unit: 'katori', kcal: [80, 150] },
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
    { name: 'pizza', al: ['pizza', 'पिज़्ज़ा'], unit: 'slice', kcal: [250, 350], whole: 8 },
    { name: 'burger', al: ['burger', 'बर्गर'], unit: 'pc', kcal: [300, 500] },
    { name: 'sandwich', al: ['sandwich', 'sandwiches', 'सैंडविच'], unit: 'pc', kcal: [200, 350] },
    { name: 'bread', al: ['bread', 'toast', 'pav', 'पाव', 'ब्रेड'], unit: 'slice', kcal: [70, 130] },
    { name: 'puri', al: ['puri', 'poori', 'पूरी'], unit: 'pc', kcal: [100, 150] },
    { name: 'bhatura', al: ['bhatura', 'bhature', 'भटूरा'], unit: 'pc', kcal: [250, 350] },
    { name: 'chole', al: ['chole', 'chana', 'छोले'], unit: 'katori', kcal: [200, 280] },
    { name: 'rajma', al: ['rajma', 'राजमा'], unit: 'katori', kcal: [180, 250] },
    { name: 'biryani', al: ['biryani', 'biriyani', 'बिरयानी'], unit: 'plate', kcal: [400, 600] },
    { name: 'pulao', al: ['pulao', 'pulav', 'पुलाव'], unit: 'katori', kcal: [180, 250] },
    { name: 'dhokla', al: ['dhokla', 'ढोकला'], unit: 'pc', kcal: [40, 70] },
    { name: 'vada', al: ['vada', 'wada', 'वड़ा'], unit: 'pc', kcal: [130, 200] },
    { name: 'milk', al: ['milk', 'doodh', 'दूध'], unit: 'glass', kcal: [100, 150], drink: true },
    { name: 'lassi', al: ['lassi', 'chaas', 'buttermilk', 'लस्सी', 'छाछ'], unit: 'glass', kcal: [80, 220], drink: true },
    { name: 'juice', al: ['juice', 'जूस'], unit: 'glass', kcal: [100, 140], drink: true },
    { name: 'oats', al: ['oats', 'oatmeal', 'porridge', 'daliya', 'दलिया'], unit: 'bowl', kcal: [150, 250] },
    { name: 'salad', al: ['salad', 'सलाद'], unit: 'bowl', kcal: [30, 80] },
    { name: 'soup', al: ['soup', 'सूप'], unit: 'bowl', kcal: [60, 120] },
    { name: 'nuts', al: ['almonds', 'almond', 'badam', 'nuts', 'walnut', 'walnuts', 'बादाम'], unit: 'handful', kcal: [100, 170] },
    { name: 'kheer', al: ['kheer', 'payasam', 'खीर'], unit: 'katori', kcal: [200, 300] },
    // A whole thali is too varied to guess: counted but flagged low-confidence.
    { name: 'thali', al: ['thali', 'थाली'], unit: 'plate', kcal: [600, 900], lowConf: true },
  ];
  // grams of protein per unit (typical home portion; approximate ranges)
  const PROT = { roti: [2.5, 3.5], paratha: [4, 6], naan: [6, 9], rice: [2.5, 4], dal: [6, 9], sabzi: [1.5, 3], khichdi: [5, 8], idli: [1.5, 2.5], dosa: [2.5, 4], sambar: [3, 5], poha: [3, 5], upma: [4, 6],
    curd: [3, 5], 'paneer dish': [10, 16], egg: [6, 7], 'chicken curry': [18, 26], fruit: [0.5, 1.5], chai: [1, 3], biscuit: [0.3, 0.8], samosa: [4, 6], mithai: [2, 4], thali: [18, 30], pizza: [9, 13],
    burger: [12, 25], sandwich: [6, 12], bread: [2.5, 4], puri: [2, 3], bhatura: [6, 8], chole: [9, 13], rajma: [9, 13], biryani: [12, 22], pulao: [4, 7], dhokla: [1.5, 3], vada: [4, 7], milk: [7, 9],
    lassi: [3, 7], juice: [0.5, 1.5], oats: [5, 9], salad: [1, 3], soup: [2, 5], nuts: [4, 7], kheer: [4, 7] };
  FOODS.forEach((f) => { f.prot = PROT[f.name] || [0, 0]; });
  const FOOD_BY_ALIAS = {};
  FOODS.forEach((f) => f.al.forEach((a) => (FOOD_BY_ALIAS[a] = f)));

  const WATER_WORDS = new Set(['paani', 'pani', 'water', 'jal', 'पानी']);
  const GLASS_WORDS = new Set(['glass', 'glasses', 'gilas', 'glas', 'गिलास']);
  const WALK_RE = /(walk|walked|walking|tehal|tahel|tahal|taihal|chala|chali|chale|ghoom|वॉक|टहल|चला|चली)/;
  const NEG = new Set(['nahi', 'nahin', 'nhi', 'nai', 'not', 'no', "didn't", 'didnt', 'skip', 'skipped', 'नहीं', 'नही']);
  const MEAL_ACTION = /(khay|khaa|kha |kha$|ate|eaten|had|piya|pi |liya|खाय|खाई|खाया|पिया|ली)/;

  const STEP_KM = 0.0007;      // ~0.7 m per step (typical for older adults; approximate)
  const STEPS_PER_MIN = 100;   // easy walking pace
  const kmFromSteps = (n) => Math.round((n || 0) * STEP_KM * 100) / 100;

  const T = (s) =>
    s.toLowerCase().split(/[^\p{L}\p{N}\p{M}'\/.]+/u).map((x) => x.replace(/^\.+|\.+$/g, '')).filter(Boolean);

  // ---------- safety ----------
  const RED = [
    ['chest', /(chest|seena|seene|chhati|chati|सीने|छाती)[^.,;]{0,22}(pain|dard|tightness|jakad|heavy|bhaari|bhari|dabav|दर्द|जकड़न|दबाव)|(pain|dard|दर्द)[^.,;]{0,18}(chest|seene|chhati|सीने|छाती)/g],
    ['breath', /(saans|sans|सांस|साँस)[^.,;]{0,22}(phool|phul|takleef|dikkat|ruk|nahi aa|नहीं आ|तकलीफ|फूल)|breathless|short of breath|difficulty breathing|trouble breathing|can'?t breathe|can ?not breathe|unable to breathe|not able to breathe|hard to breathe|struggling to breathe|gasping|breathing (problem|issue)|dam ghut|दम घुट/g],
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
  const MED_OBJ = /(dawai|dawa|dava|tablet|tablets|goli|insulin|medicine|medicines|medication|dose|pill|pills|capsule|syrup|ointment|supplement|antibiotic|painkiller|paracetamol|crocin|dolo|metformin|aspirin|ibuprofen|statin|amlodipine|telmisartan|दवाई|दवा|गोली)/;
  const MED_ACT = /(band|chhod|chod|stop|skip|double|zyada|jyada|kam kar|badal|change|nahi leni|mat lo|mat le|बंद|छोड़|ज्यादा|ज़्यादा)/;

  // strict: the negation word must sit directly next to the symptom (used for EMERGENCY symptoms, where a miss is worst).
  // wide: up to two words may sit between ("no chest pain", "not feeling any pain"): only used for mild "tell your doctor" notes.
  function negated(text, idx, len, wide) {
    const after = text.slice(idx + len, idx + len + 20);
    const before = text.slice(Math.max(0, idx - 28), idx);
    // (?![\p{L}\p{M}]) instead of \b: \b does not work after Devanagari letters and marks
    if (/^\s*((hai|है)\s+)?(nahi|nahin|nhi|no|not|नहीं|नही)(?![\p{L}\p{M}])/u.test(after)) return true;
    const neg = '(no|not|without|koi|कोई|बिना)';
    return wide ? new RegExp('(?<![\\p{L}\\p{M}])' + neg + '\\s+([\\p{L}\\p{M}\'-]+\\s+){0,2}$', 'u').test(before) : new RegExp('(?<![\\p{L}\\p{M}])' + neg + '\\s*$', 'u').test(before);
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
          if (!negated(text, m.index, m[0].length, true)) { reasons.push(k); bump('amber', k); break; }
        }
      });
    }
    if (MED_OBJ.test(text) && MED_ACT.test(text)) { reasons.push('medication'); if (level === 'none') { level = 'amber'; kind = 'med'; } else if (level === 'amber') kind = 'med'; }
    return { level, kind, reasons: [...new Set(reasons)], readings: r };
  }

  // Languages: 'en' English, 'hi' Hindi (Devanagari), 'hg' Hinglish (Hindi in Roman letters).
  const LG = (l) => (l === 'hi' || l === 'hg' ? l : 'en');
  const SAFETY_TEXT = {
    red: {
      en: 'This sounds serious. Please call 112 (or 108 for an ambulance) or get someone to take you to a doctor now. Do not wait for the app.',
      hi: 'यह गंभीर हो सकता है। कृपया अभी 112 (या एम्बुलेंस के लिए 108) पर कॉल करें, या किसी के साथ तुरंत डॉक्टर के पास जाएँ। ऐप के जवाब का इंतज़ार न करें।',
      hg: 'Yeh serious ho sakta hai. Abhi 112 (ya ambulance ke liye 108) par call karein ya kisi ko saath lekar doctor ke paas jayein. App ka intezaar na karein.',
    },
    mental: {
      en: 'I am sorry you feel this way. Please talk to someone now: Tele-MANAS 14416 (free, 24x7), or a family member. If you are in danger, call 112.',
      hi: 'आप ऐसा महसूस कर रहे हैं, यह जानकर चिंता हुई। कृपया अभी किसी से बात करें: Tele-MANAS 14416 (मुफ़्त, 24x7) या घर के किसी सदस्य से। अगर आप ख़तरे में हैं तो 112 पर कॉल करें।',
      hg: 'Aap aisa mehsoos kar rahe hain, yeh jaankar chinta hui. Kripya abhi kisi se baat karein: Tele-MANAS 14416 (free, 24x7) ya ghar ke kisi sadasya se. Agar aap khatre mein hain to 112 par call karein.',
    },
    amber: {
      en: 'Noted. Please tell your doctor about this today. This app cannot tell what it means.',
      hi: 'नोट कर लिया। कृपया आज ही अपने डॉक्टर को बताइए। यह ऐप इसका मतलब नहीं बता सकता।',
      hg: 'Note kar liya. Kripya aaj hi apne doctor ko bataiye. Yeh app iska matlab nahi bata sakta.',
    },
    med: {
      en: 'I cannot advise on medicines. Please ask your doctor before changing or skipping anything.',
      hi: 'दवाओं के बारे में यहाँ सलाह नहीं दी जाती। कुछ भी बदलने या छोड़ने से पहले कृपया अपने डॉक्टर से पूछें।',
      hg: 'Dawaiyon ke baare mein yahan salah nahi di jaati. Kuch bhi badalne ya chhodne se pehle kripya apne doctor se poochhein.',
    },
  };
  function safetyMessage(s, lang) {
    if (!s || s.level === 'none') return null;
    const l = LG(lang);
    if (s.reasons.includes('mental')) return SAFETY_TEXT.mental[l];
    if (s.level === 'red') return SAFETY_TEXT.red[l];
    if (s.kind === 'med') return SAFETY_TEXT.med[l];
    return SAFETY_TEXT.amber[l];
  }

  // Block diagnosis / prescription wording from any AI-written reply.
  const BANNED = /(\bdiagnos|you (are suffering|probably have|might have|may have|could have|likely have)|you have (a |an )?(diabet|hypertension|high blood|low blood|heart|cancer|infection|thyroid|an?emia|arthritis|disease|disorder|syndrome|condition)|aapko .{0,25}(bimari|rog|diabetes|hai)\b|आपको .{0,25}(बीमारी|रोग|डायबिटीज|मधुमेह)|(दवा|दवाई|गोली) (बंद|बढ़ा|बढ़ाओ|ले लो)|खुराक बढ़ा|\btake \d|\b\d+\s?mg\b|stop taking|increase (your )?dose|\bprescri|dose badha|dawai band kar|dawai le lo|you should take)/i;
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
    const out = { meals: [], water: 0, walkMin: 0, steps: 0, kmSaid: 0, stepsEst: false, walkSkipped: false, unknown: [] };
    let slot = null;
    clauses.forEach((c) => {
      const tokens = T(c);
      if (!tokens.length) return;
      const hasNeg = tokens.some((t) => NEG.has(t));
      slot = /(nashta|nashte|breakfast|lunch|dopahar|dinner|raat|snack|shaam|evening|subah|सुबह|नाश्ता|दोपहर|रात|शाम)/.test(c) ? slotFor(c, hour) : slot;
      tokens.forEach((t, i) => {
        // foods
        const f = FOOD_BY_ALIAS[t];
        // "aloo sabzi", "bhindi sabzi", "paneer sabzi" are one dish, not two
        const pf = i > 0 ? FOOD_BY_ALIAS[tokens[i - 1]] : null;
        if (f && pf && (pf === f || (f.name === 'sabzi' && (pf.name === 'paneer dish' || pf.name === 'chicken curry')))) return;
        if (f) {
          let n = numBefore(tokens, i, 3);
          const prev = tokens[i - 1];
          let wholeAssumed = false;
          if (n == null && f.whole && /^(whole|poora|pura|full|entire)$/.test(prev || '')) { n = f.whole; wholeAssumed = true; }
          const meal = {
            name: f.name, qty: n == null ? 1 : n, unit: f.unit, assumed: n == null,
            kcalLo: Math.round((n == null ? 1 : n) * f.kcal[0]), kcalHi: Math.round((n == null ? 1 : n) * f.kcal[1]),
            slot: slot || slotFor(c, hour), skipped: hasNeg, lowConf: !!f.lowConf || wholeAssumed,
          };
          meal.protLo = Math.round(meal.qty * f.prot[0] * 10) / 10; meal.protHi = Math.round(meal.qty * f.prot[1] * 10) / 10;
          if (hasNeg) { meal.kcalLo = 0; meal.kcalHi = 0; meal.protLo = 0; meal.protHi = 0; }
          out.meals.push(meal);
        }
        // water: "<n> glass (paani)" or "<n> bottle/litre"
        if (GLASS_WORDS.has(t) || t === 'bottle' || t === 'litre' || t === 'liter' || t === 'ltr' || t === 'लीटर' || t === 'बोतल') {
          const n = numBefore(tokens, i, 1);
          const waterish = tokens.some((x) => WATER_WORDS.has(x)) || t !== 'glass' && t !== 'glasses' && t !== 'gilas' && t !== 'glas' && t !== 'गिलास';
          const hasDrinkWord = tokens.some((x) => WATER_WORDS.has(x)) || /(piya|pi liya|drank|drink|पिया)/.test(c);
          const drinkFood = tokens.some((x) => FOOD_BY_ALIAS[x] && FOOD_BY_ALIAS[x].drink);
          if ((waterish || hasDrinkWord) && !hasNeg && !drinkFood) {
            const per = /bottle|बोतल/.test(t) ? 3 : /lit|ltr|लीटर/.test(t) ? 4 : 1;
            out.water += (n == null ? 1 : n) * per;
          }
        }
      });
      // water without a unit: "paani piya" -> 1 glass assumed
      if (!tokens.some((x) => FOOD_BY_ALIAS[x] && FOOD_BY_ALIAS[x].drink) && !tokens.some((t) => GLASS_WORDS.has(t) || ['bottle', 'litre', 'liter', 'ltr', 'लीटर', 'बोतल'].includes(t)) &&
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
          const kmm = c.match(/(\d+(?:\.\d+)?)\s*(km|kms|kilometers?|kilometres?)\b/);
          if (kmm) out.kmSaid += +kmm[1];
          out.walkMin += mins;
          if (!mins && !st) out.walkMin += 0;
        }
      } else {
        const st = c.match(/(\d{3,6})\s*(steps?|kadam|कदम)/);
        if (st) out.steps += +st[1];
      }
    });
    if (out.kmSaid && !out.steps) out.steps = Math.round(out.kmSaid / STEP_KM);
    if (!out.steps && out.walkMin) { out.steps = Math.round(out.walkMin * STEPS_PER_MIN); out.stepsEst = true; }
    if (out.steps && !out.walkMin) out.walkMin = Math.round(out.steps / STEPS_PER_MIN);
    out.meals = out.meals.filter((m, i, a) => !(m.name === 'chai' && a.findIndex((x) => x.name === 'chai' && x.slot === m.slot) !== i));
    return out;
  }

  // ---------- day summary, goals, nudges ----------
  const DEFAULT_GOALS = { water: 6, walkBase: 20, kcal: 1800 }; // kcal: a generic reference only, user can change it
  const SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'];

  function dayKey(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  function summarize(entries) {
    const s = { protLo: 0, protHi: 0, bySlot: { breakfast: { lo: 0, hi: 0, items: [] }, lunch: { lo: 0, hi: 0, items: [] }, snack: { lo: 0, hi: 0, items: [] }, dinner: { lo: 0, hi: 0, items: [] } }, water: 0, walkMin: 0, steps: 0, km: 0, walkSkipped: false, kcalLo: 0, kcalHi: 0, meals: [], slots: new Set(), flags: [], bp: null, sugar: null, entries: entries.length };
    entries.forEach((e) => {
      s.water += e.water || 0;
      s.walkMin += e.walkMin || 0;
      s.steps += e.steps || 0;
      if (e.walkSkipped) s.walkSkipped = true;
      (e.meals || []).forEach((m, idx) => {
        if (m.skipped) return;
        s.kcalLo += m.kcalLo; s.kcalHi += m.kcalHi; s.protLo += m.protLo || 0; s.protHi += m.protHi || 0; s.meals.push(m); if (m.slot) s.slots.add(m.slot);
        const b = s.bySlot[SLOTS.includes(m.slot) ? m.slot : 'snack'];
        b.lo += m.kcalLo; b.hi += m.kcalHi; b.items.push({ ...m, entryId: e.id, idx });
      });
      if (e.safety && e.safety.level !== 'none') s.flags.push(e.safety);
      if (e.bp) s.bp = e.bp;
      if (e.sugar != null) s.sugar = e.sugar;
    });
    s.water = Math.max(0, s.water);
    s.protLo = Math.round(s.protLo); s.protHi = Math.round(s.protHi);
    s.km = kmFromSteps(s.steps);
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

  // ---------- personal data: protein target and calorie reference ----------
  // Protein: 0.8-1.0 g/kg for adults under 65 (general RDA-style range); 1.0-1.2 g/kg for 65+
  // (expert-group suggestion for keeping muscle). More activity nudges the range up. Not a prescription.
  function proteinTarget(p) {
    if (!p) return { status: 'need-data' };
    if (p.proteinLimit) return { status: 'limited' };
    const w = +p.weightKg, age = +p.age;
    if (!(w >= 30 && w <= 200) || !(age >= 18 && age <= 110)) return { status: 'need-data' };
    let lo = age >= 65 ? 1.0 : 0.8, hi = age >= 65 ? 1.2 : 1.0;
    if (p.activity === 'moderate') { lo += 0.1; hi += 0.2; } else if (p.activity === 'light') { hi += 0.1; }
    const r = (x) => Math.round(x);
    return { status: 'ok', lo: r(w * lo), hi: r(w * hi), perKgLo: Math.round(lo * 10) / 10, perKgHi: Math.round(hi * 10) / 10, perMealLo: r((w * lo) / 3), perMealHi: r((w * hi) / 3) };
  }
  // Mifflin-St Jeor x activity factor: a rough maintenance estimate, rounded to 50.
  function kcalReference(p) {
    if (!p) return null;
    const w = +p.weightKg, h = +p.heightCm, age = +p.age;
    if (!(w >= 30 && w <= 200) || !(h >= 100 && h <= 230) || !(age >= 18 && age <= 110)) return null;
    const off = p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78;
    const f = p.activity === 'moderate' ? 1.55 : p.activity === 'light' ? 1.375 : 1.2;
    const k = (10 * w + 6.25 * h - 5 * age + off) * f;
    return Math.max(1200, Math.min(3200, Math.round(k / 50) * 50));
  }

  const NUDGE = {
    breakfast: { en: 'Good morning. Tell me what you had for breakfast: just say it in your own words.', hi: 'सुप्रभात। नाश्ते में क्या लिया? बस अपने शब्दों में बता दीजिए।', hg: 'Suprabhat. Nashte mein kya liya? Bas apne shabdon mein bata dijiye.' },
    water: (n) => ({ en: `Only ${n} glass of water so far. One glass now?`, hi: `अब तक सिर्फ़ ${n} गिलास पानी। अभी एक गिलास?`, hg: `Abhi tak sirf ${n} glass paani. Ek glass abhi?` }),
    walk: (g, shrunk) => ({
      en: `Walk is still pending. ${g} minutes is enough today${shrunk ? ' (I made it smaller to match your week)' : ''}.`,
      hi: `आज की सैर बाकी है। आज सिर्फ़ ${g} मिनट काफ़ी हैं${shrunk ? ' (आपके हफ़्ते के हिसाब से इसे छोटा रखा है)' : ''}।`,
      hg: `Aaj ki walk baaki hai. Aaj sirf ${g} minute kaafi hain${shrunk ? ' (aapke hafte ke hisaab se chhota rakha hai)' : ''}.`,
    }),
    walkSkippedToday: { en: 'No problem about the walk today. Tomorrow we keep it short and easy.', hi: 'आज सैर नहीं हुई, कोई बात नहीं। कल छोटी और आसान रखेंगे।', hg: 'Aaj walk nahi hui, koi baat nahi. Kal chhoti aur aasaan rakhenge.' },
    protein: { en: 'Protein looks low today. A katori of dal, some curd or an egg with dinner helps.', hi: 'आज प्रोटीन कम लग रहा है। रात के खाने में एक कटोरी दाल, थोड़ा दही या एक अंडा मदद करेगा।', hg: 'Aaj protein kam lag raha hai. Raat ke khane mein ek katori dal, thoda dahi ya ek anda madad karega.' },
    dinner: { en: 'Shall we log dinner? A light dinner helps you sleep well.', hi: 'रात का खाना दर्ज करें? हल्का खाना अच्छी नींद में मदद करता है।', hg: 'Raat ka khana likh lein? Halka khana achhi neend mein madad karta hai.' },
    good: { en: 'You are on track today. Nothing needed right now.', hi: 'आज सब ठीक चल रहा है। अभी कुछ करने की ज़रूरत नहीं।', hg: 'Aaj sab theek chal raha hai. Abhi kuch karne ki zaroorat nahi.' },
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
    if (h >= 18 && goals.protein && goals.protein.status === 'ok' && sum.meals.length && (sum.protLo + sum.protHi) / 2 < goals.protein.lo * 0.5) return { kind: 'protein', ...NUDGE.protein };
    if (h >= 19 && !sum.slots.has('dinner')) return { kind: 'dinner', ...NUDGE.dinner };
    return { kind: 'good', ...NUDGE.good };
  }

  // ---------- food names in each language (also exported for the screen translator) ----------
  const FOOD_LABEL = {
    roti: ['रोटी', 'roti'], paratha: ['परांठा', 'paratha'], naan: ['नान', 'naan'], rice: ['चावल', 'chawal'], dal: ['दाल', 'dal'], sabzi: ['सब्ज़ी', 'sabzi'], khichdi: ['खिचड़ी', 'khichdi'],
    idli: ['इडली', 'idli'], dosa: ['डोसा', 'dosa'], sambar: ['सांभर', 'sambar'], poha: ['पोहा', 'poha'], upma: ['उपमा', 'upma'], curd: ['दही', 'dahi'], 'paneer dish': ['पनीर की सब्ज़ी', 'paneer ki sabzi'],
    egg: ['अंडा', 'anda'], 'chicken curry': ['चिकन करी', 'chicken curry'], fruit: ['फल', 'phal'], chai: ['चाय', 'chai'], biscuit: ['बिस्कुट', 'biscuit'], samosa: ['समोसा', 'samosa'], mithai: ['मिठाई', 'mithai'],
    thali: ['थाली', 'thali'], pizza: ['पिज़्ज़ा', 'pizza'], burger: ['बर्गर', 'burger'], sandwich: ['सैंडविच', 'sandwich'], bread: ['ब्रेड', 'bread'], puri: ['पूरी', 'puri'], bhatura: ['भटूरा', 'bhatura'],
    chole: ['छोले', 'chole'], rajma: ['राजमा', 'rajma'], biryani: ['बिरयानी', 'biryani'], pulao: ['पुलाव', 'pulao'], dhokla: ['ढोकला', 'dhokla'], vada: ['वड़ा', 'vada'], milk: ['दूध', 'doodh'], lassi: ['लस्सी', 'lassi'],
    juice: ['जूस', 'juice'], oats: ['ओट्स', 'oats'], salad: ['सलाद', 'salad'], soup: ['सूप', 'soup'], nuts: ['मेवे', 'mewe'], kheer: ['खीर', 'kheer'],
  };
  const foodName = (name, lang) => { const l = LG(lang), f = FOOD_LABEL[String(name).toLowerCase()]; return f && l !== 'en' ? f[l === 'hi' ? 0 : 1] : name; };
  const foodRows = () => Object.keys(FOOD_LABEL).map((k) => [k, FOOD_LABEL[k][0], FOOD_LABEL[k][1]]);
  const UNIT_WORD = { pc: ['piece', 'पीस', 'piece'], katori: ['katori', 'कटोरी', 'katori'], plate: ['plate', 'प्लेट', 'plate'], cup: ['cup', 'कप', 'cup'], slice: ['slice', 'स्लाइस', 'slice'], glass: ['glass', 'गिलास', 'glass'], bowl: ['bowl', 'कटोरा', 'bowl'], handful: ['handful', 'मुट्ठी', 'mutthi'] };

  // ---------- reply composition (demo mode) ----------
  const L = {
    logged: { en: 'Logged', hi: 'दर्ज किया', hg: 'Likh liya' },
    nothing: { en: 'I could not find anything to log. Try: "2 roti, dal, 1 glass water".', hi: 'दर्ज करने लायक कुछ नहीं मिला। ऐसे बताइए: "2 रोटी, दाल, 1 गिलास पानी"।', hg: 'Kuch likhne layak nahi mila. Aise bataiye: "2 roti, dal, 1 glass paani".' },
    thali: { en: 'A thali varies a lot. What was on it? e.g. "2 roti, dal, sabzi, rice".', hi: 'थाली में बहुत कुछ हो सकता है। उसमें क्या-क्या था? जैसे "2 रोटी, दाल, सब्ज़ी, चावल"।', hg: 'Thali mein bahut kuch ho sakta hai. Usmein kya-kya tha? jaise "2 roti, dal, sabzi, chawal".' },
    assumed: { en: 'I assumed 1 portion where you did not say a number.', hi: 'जहाँ आपने संख्या नहीं बताई, वहाँ 1 हिस्सा मान लिया है।', hg: 'Jahan aapne number nahi bataya, wahan 1 hissa maan liya hai.' },
    unknownFood: { en: 'I did not recognise that food. Try simple names such as roti, dal, rice, idli, poha, or a photo with the live AI.', hi: 'यह खाना पहचाना नहीं गया। रोटी, दाल, चावल, इडली, पोहा जैसे सरल नाम आज़माएँ, या लाइव एआई से फ़ोटो भेजें।', hg: 'Yeh khana pehchana nahi gaya. Roti, dal, chawal, idli, poha jaise saral naam try karein, ya live AI se photo bhejein.' },
  };
  const wholeMsg = (name, qty, unit, lang) => {
    const l = LG(lang), n = foodName(name, l), u = (UNIT_WORD[unit] || [unit, unit, unit])[l === 'en' ? 0 : l === 'hi' ? 1 : 2];
    if (l === 'hi') return `मैंने पूरा ${n} गिना है (${qty} ${u})। अगर आपने कम खाया तो बताइए कितना।`;
    if (l === 'hg') return `Maine poora ${n} gina hai (${qty} ${u}). Agar aapne kam khaya to bataiye kitna.`;
    return `I counted a whole ${name} (${qty} ${unit}s). If you ate less, tell me how many.`;
  };

  function fmtMeal(m, lang) {
    const l = LG(lang), nm = foodName(m.name, l);
    if (m.skipped) return (l === 'hi' ? 'नहीं खाया: ' : l === 'hg' ? 'nahi khaya: ' : 'skipped: ') + nm;
    const q = m.qty === 1 ? '' : m.qty + ' ';
    return q + nm;
  }

  function analyze(text, ctx) {
    ctx = ctx || {};
    const lang = LG(ctx.lang);
    const now = ctx.now ? new Date(ctx.now) : new Date();
    const p = parse(text, now.getHours());
    const safety = assessSafety(text);
    const res = {
      source: 'demo',
      meals: p.meals, water: Math.min(p.water, 20), walkMin: Math.min(Math.round(p.walkMin), 300), steps: Math.min(Math.round(p.steps), 40000), km: kmFromSteps(Math.min(p.steps, 40000)), stepsEst: p.stepsEst, walkSkipped: p.walkSkipped,
      bp: safety.readings.bp, sugar: safety.readings.sugar,
      safety: { level: safety.level, kind: safety.kind, reasons: safety.reasons },
      clarify: null, reply: '',
    };
    const eaten = p.meals.filter((m) => !m.skipped);
    const lowM = p.meals.find((m) => m.lowConf);
    if (lowM && lowM.name === 'thali') res.clarify = L.thali[lang];
    else if (lowM) res.clarify = wholeMsg(lowM.name, lowM.qty, lowM.unit, lang);
    else if (!p.meals.length && !p.water && !p.walkMin && !p.steps && !p.walkSkipped && safety.level === 'none' && /(\bate\b|\bhad\b|eaten|khay|खाय|खाई|खाया|खाना|breakfast|lunch|dinner|nashta|नाश्ता)/.test(String(text).toLowerCase())) {
      res.clarify = L.unknownFood[lang];
    }

    const parts = [];
    const sm = safetyMessage(res.safety, lang);
    const logged = [];
    if (eaten.length) {
      const lo = eaten.reduce((a, m) => a + m.kcalLo, 0), hi = eaten.reduce((a, m) => a + m.kcalHi, 0);
      const plo = Math.round(eaten.reduce((a, m) => a + (m.protLo || 0), 0)), phi = Math.round(eaten.reduce((a, m) => a + (m.protHi || 0), 0));
      const protWord = lang === 'hi' ? 'ग्राम प्रोटीन' : 'g protein';
      logged.push(eaten.map((m) => fmtMeal(m, lang)).join(', ') + ` (~${lo}-${hi} kcal` + (phi ? `, ~${plo}-${phi} ${protWord}` : '') + ')');
    }
    if (p.water) logged.push(lang === 'en' ? `${p.water} ${p.water === 1 ? 'glass' : 'glasses'} of water` : lang === 'hi' ? `${p.water} गिलास पानी` : `${p.water} glass paani`);
    if (p.walkMin || p.steps) {
      const w = Math.round(p.walkMin);
      logged.push(lang === 'hi' ? `सैर ${w} मिनट, ${res.steps} कदम, ~${res.km} किमी${p.stepsEst ? ' (अंदाज़न)' : ''}`
        : lang === 'hg' ? `walk ${w} min, ${res.steps} kadam, ~${res.km} km${p.stepsEst ? ' (andaazan)' : ''}`
        : `walk ${w} min, ${res.steps} steps, ~${res.km} km${p.stepsEst ? ' (estimated)' : ''}`);
    }
    if (res.bp) logged.push(`BP ${res.bp.s}/${res.bp.d}`);
    if (res.sugar != null) logged.push(`${lang === 'hi' ? 'शुगर' : 'sugar'} ${res.sugar}`);
    if (logged.length) parts.push(`${L.logged[lang]}: ${logged.join('; ')}${lang === 'hi' ? '।' : '.'}`);
    else if (!sm && !p.walkSkipped && !p.meals.length && !res.clarify) parts.push(L.nothing[lang]);
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
    const lang = LG(ctx && ctx.lang);
    const det = assessSafety(text);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : 0));
    const now = ctx && ctx.now ? new Date(ctx.now) : new Date();
    const meals = (Array.isArray(obj.meals) ? obj.meals : []).slice(0, 12).map((m) => {
      const lo = clamp(m.kcal_lo, 0, 2500), hi = Math.max(lo, clamp(m.kcal_hi, 0, 2500));
      return {
        name: String(m.name || 'food').slice(0, 40), qty: clamp(m.qty || 1, 0, 20), unit: String(m.unit || '').slice(0, 12),
        kcalLo: Math.round(lo), kcalHi: Math.round(hi), slot: ['breakfast', 'lunch', 'snack', 'dinner'].includes(m.slot) ? m.slot : slotFor('', now.getHours()),
        skipped: !!m.skipped, assumed: !!m.assumed, lowConf: m.confidence === 'low',
        protLo: 0, protHi: 0,
      };
    }).map((m, i) => {
      const src = (Array.isArray(obj.meals) ? obj.meals : [])[i] || {};
      if (m.skipped) return m;
      let plo = clamp(src.protein_lo, 0, 200), phi = Math.max(plo, clamp(src.protein_hi, 0, 200));
      if (!phi) { const f = FOODS.find((x) => x.name === m.name.toLowerCase()); if (f) { plo = f.prot[0] * m.qty; phi = f.prot[1] * m.qty; } }
      m.protLo = Math.round(plo * 10) / 10; m.protHi = Math.round(phi * 10) / 10;
      return m;
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
    let steps = Math.round(clamp(obj.steps, 0, 40000));
    const wm = Math.round(clamp(obj.walk_min, 0, 300));
    let stepsEst = false;
    if (!steps && clamp(obj.distance_km, 0, 40) > 0) steps = Math.round(clamp(obj.distance_km, 0, 40) / STEP_KM);
    if (!steps && wm) { steps = wm * STEPS_PER_MIN; stepsEst = true; }
    const out = {
      source: 'ai', meals, water: clamp(obj.water_glasses, 0, 20), walkMin: wm || Math.round(steps / STEPS_PER_MIN), steps, km: kmFromSteps(steps), stepsEst,
      walkSkipped: !!obj.walk_skipped,
      bp: det.readings.bp, sugar: det.readings.sugar, safety, clarify, reply, guardrailHit,
    };
    if (guardrailHit && !sm) {
      const fallback = analyze(text, ctx);
      out.reply = fallback.reply;
    }
    return out;
  }


  // ---------- question answering (demo mode; live mode uses api/ask.js) ----------
  // ctx.lang = 'en' | 'hi' | 'hg'. Questions may be asked in any of the three (Hindi, Hinglish or English keywords).
  // ctx.summary = { water, walkMin, steps, km, kcalLo, kcalHi, protLo, protHi }, ctx.goals = { water, walk, steps, kcal, protein }
  const Q = {
    protein: /protein|प्रोटीन/,
    today: /(how am i|how('s| is) my day|my progress|today.*(summary|so far)|so far today|how much have i|mera din|aaj kaisa|aaj ka din|din kaisa|kaisa raha|aaj ka hisaab|मेरा दिन|आज कैसा|आज का दिन|दिन कैसा|कैसा रहा|आज का हिसाब)/,
    distance: /(how far|\bkm\b|kilomet|distance|\bsteps?\b|step count|kitna chala|kitni door|kitne kadam|\bkadam\b|doori|कितना चला|कितनी दूर|कितने कदम|कदम|दूरी)/,
    water: /(water|hydrat|thirst|how much.*drink|paani|pani|पानी|प्यास)/,
    walk: /(walk|exercise|steps|workout|yoga|sair|tehal|kasrat|vyayam|सैर|टहल|पैदल|कसरत|व्यायाम|योग)/,
    food: /(dinner|tonight|what (should|can) i eat|light meal|snack|raat ko|raat mein|raat ka khana|kya khau|kya khana|क्या खाऊँ|क्या खाऊं|क्या खाना|रात को|रात में|रात के खाने)/,
    condition: /(diabet|sugar level|blood sugar|cholesterol|thyroid|bp |blood pressure|hypertension|sugar|शुगर|बीपी|डायबिटीज|मधुमेह|कोलेस्ट्रॉल|थायराइड|ब्लड प्रेशर|बीमारी|bimari)/,
    calories: /(calorie|kcal|कैलोरी)/,
    caloriesCtx: /(today|so far|have i|did i|eaten|my |i ate|i had|aaj|abhi tak|kitni|आज|अब तक|कितनी|खाया|khaya)/,
    nutrition: /(roti|rice|chawal|carb|calorie|kcal|protein|रोटी|चावल|कैलोरी)/,
    sleep: /(sleep|insomnia|tired|neend|thakan|नींद|थकान|थका)/,
    about: /(who are you|what are you|what can you|how does this work|how do you work|help|tum kaun|aap kaun|kya kar sakte|madad|तुम कौन|आप कौन|क्या कर सकते|मदद)/,
  };
  const pick3 = (lang, en, hi, hg) => (lang === 'hi' ? hi : lang === 'hg' ? hg : en);

  function answerQuery(question, ctx) {
    ctx = ctx || {};
    const lang = LG(ctx.lang), q = String(question || '').toLowerCase();
    const s = ctx.summary || { water: 0, walkMin: 0, steps: 0, km: 0, kcalLo: 0, kcalHi: 0, meals: [] };
    const g = ctx.goals || { water: 6, walk: 20 };
    const safety = assessSafety(q);
    const sm = safetyMessage(safety, lang);
    if (safety.level === 'red') return { source: 'safety', safety, answer: sm, topic: 'safety' };
    const P3 = (en, hi, hg) => pick3(lang, en, hi, hg);
    let topic = 'other', a;
    if (MED_OBJ.test(q)) { topic = 'medicine'; a = SAFETY_TEXT.med[lang]; }
    else if (Q.protein.test(q)) {
      topic = 'protein';
      const pt = g.protein;
      const sofar = s.protHi ? P3(` So far today you have had roughly ${s.protLo}-${s.protHi} g.`, ` आज अब तक आपने लगभग ${s.protLo}-${s.protHi} ग्राम लिया है।`, ` Aaj ab tak aapne lagbhag ${s.protLo}-${s.protHi} g liya hai.`)
        : P3(' Nothing with protein is logged yet today.', ' आज अभी प्रोटीन वाली कोई चीज़ दर्ज नहीं हुई।', ' Aaj abhi protein wali koi cheez darj nahi hui.');
      if (pt && pt.status === 'ok') a = P3(`For your age and weight, a common range is about ${pt.lo}-${pt.hi} g of protein a day (${pt.perKgLo}-${pt.perKgHi} g per kg), spread over your meals.${sofar} Dal, curd, paneer, eggs, milk and sprouts all help.`,
        `आपकी उम्र और वज़न के हिसाब से रोज़ लगभग ${pt.lo}-${pt.hi} ग्राम प्रोटीन आम तौर पर ठीक माना जाता है (${pt.perKgLo}-${pt.perKgHi} ग्राम प्रति किलो), जिसे खानों में बाँट लें।${sofar} दाल, दही, पनीर, अंडे, दूध और अंकुरित अनाज सब मदद करते हैं।`,
        `Aapki umar aur wazan ke hisaab se roz lagbhag ${pt.lo}-${pt.hi} g protein aam taur par theek maana jaata hai (${pt.perKgLo}-${pt.perKgHi} g per kilo), jise khanon mein baant lein.${sofar} Dal, dahi, paneer, ande, doodh aur sprouts sab madad karte hain.`);
      else if (pt && pt.status === 'limited') a = P3('You told me your doctor has limited your protein, so please follow your doctor. I will not suggest a target.', 'आपने बताया है कि डॉक्टर ने आपका प्रोटीन सीमित किया है, इसलिए कृपया डॉक्टर की बात मानें। यहाँ कोई लक्ष्य नहीं बताया जाएगा।', 'Aapne bataya hai ki doctor ne aapka protein seemit kiya hai, isliye kripya doctor ki baat maanein. Yahan koi target nahi bataya jaayega.');
      else a = P3(`Add your age and weight in the Me tab and I will work out a range. In general, adults need about 0.8-1.0 g per kg a day, and many older adults do better with 1.0-1.2 g per kg. If you have kidney disease, follow your doctor.${sofar}`,
        `"मैं" टैब में अपनी उम्र और वज़न डालिए, मात्रा निकालने का काम मेरा। आम तौर पर वयस्कों को रोज़ लगभग 0.8-1.0 ग्राम प्रति किलो चाहिए, और कई बुज़ुर्गों को 1.0-1.2 ग्राम प्रति किलो बेहतर रहता है। किडनी की बीमारी हो तो डॉक्टर की बात मानें।${sofar}`,
        `"Main" tab mein apni umar aur wazan daaliye, matra nikaalne ka kaam mera. Aam taur par vayask logon ko roz lagbhag 0.8-1.0 g per kilo chahiye, aur kai buzurgon ko 1.0-1.2 g per kilo behtar rehta hai. Kidney ki bimari ho to doctor ki baat maanein.${sofar}`);
    } else if (Q.today.test(q)) {
      topic = 'today';
      const food = s.kcalHi ? P3(` Food so far is roughly ${s.kcalLo}-${s.kcalHi} kcal.`, ` अब तक का खाना लगभग ${s.kcalLo}-${s.kcalHi} kcal है।`, ` Ab tak ka khana lagbhag ${s.kcalLo}-${s.kcalHi} kcal hai.`) : P3(' No food logged yet.', ' अभी तक कोई खाना दर्ज नहीं हुआ।', ' Abhi tak koi khana darj nahi hua.');
      a = P3(`Today: water ${s.water} of ${g.water} glasses, walking ${s.walkMin} of ${g.walk} minutes (${s.steps || 0} steps, ${s.km || 0} km).${food}`,
        `आज: पानी ${g.water} में से ${s.water} गिलास, सैर ${g.walk} में से ${s.walkMin} मिनट (${s.steps || 0} कदम, ${s.km || 0} किमी)।${food}`,
        `Aaj: paani ${g.water} mein se ${s.water} glass, walk ${g.walk} mein se ${s.walkMin} minute (${s.steps || 0} kadam, ${s.km || 0} km).${food}`);
    } else if (Q.distance.test(q)) {
      topic = 'distance';
      const goal = g.steps || g.walk * STEPS_PER_MIN;
      a = P3(`You have walked ${s.steps || 0} steps today, about ${s.km || 0} km. Distance is estimated from steps at roughly 0.7 m per step. Your goal today is ${goal} steps.`,
        `आज आप ${s.steps || 0} कदम चले हैं, यानी लगभग ${s.km || 0} किमी। दूरी कदमों से, लगभग 0.7 मीटर प्रति कदम के हिसाब से, आँकी गई है। आज का आपका लक्ष्य ${goal} कदम है।`,
        `Aaj aap ${s.steps || 0} kadam chale hain, yaani lagbhag ${s.km || 0} km. Doori kadmon se, lagbhag 0.7 meter per kadam ke hisaab se, aanki gayi hai. Aaj ka aapka target ${goal} kadam hai.`);
    } else if (Q.water.test(q)) {
      topic = 'water';
      a = P3(`Many adults aim for about ${g.water}-8 glasses a day, more in hot weather. You are at ${s.water} today. If your doctor has limited your fluids, follow your doctor.`,
        `कई वयस्क रोज़ लगभग ${g.water}-8 गिलास पानी का लक्ष्य रखते हैं, गर्मी में ज़्यादा। आज आप ${s.water} गिलास पर हैं। अगर डॉक्टर ने आपके तरल पदार्थ सीमित किए हैं तो डॉक्टर की बात मानें।`,
        `Kai vayask roz lagbhag ${g.water}-8 glass paani ka target rakhte hain, garmi mein zyada. Aaj aap ${s.water} glass par hain. Agar doctor ne aapke liquids seemit kiye hain to doctor ki baat maanein.`);
    } else if (Q.walk.test(q)) {
      topic = 'walk';
      a = P3(`Short, regular walks beat rare long ones. Your goal today is ${g.walk} minutes, set from your last few days. Stop and tell your doctor if a walk causes pain, dizziness or breathlessness.`,
        `छोटी और नियमित सैर, कभी-कभार की लंबी सैर से बेहतर है। आज आपका लक्ष्य ${g.walk} मिनट है, जो आपके पिछले कुछ दिनों से तय हुआ है। अगर सैर में दर्द, चक्कर या साँस फूलने जैसा लगे तो रुकें और डॉक्टर को बताएँ।`,
        `Chhoti aur niyamit walk, kabhi-kabhar ki lambi walk se behtar hai. Aaj aapka target ${g.walk} minute hai, jo aapke pichhle kuch dinon se tay hua hai. Agar walk mein dard, chakkar ya saans phoolne jaisa lage to rukein aur doctor ko bataiye.`);
    } else if (Q.food.test(q)) {
      topic = 'food';
      const sofar = s.kcalHi ? P3(`You have logged roughly ${s.kcalLo}-${s.kcalHi} kcal so far.`, `अब तक आपने लगभग ${s.kcalLo}-${s.kcalHi} kcal दर्ज किया है।`, `Ab tak aapne lagbhag ${s.kcalLo}-${s.kcalHi} kcal darj kiya hai.`) : P3('Nothing is logged yet today.', 'आज अभी कुछ दर्ज नहीं हुआ है।', 'Aaj abhi kuch darj nahi hua hai.');
      a = P3(`A light, early meal usually sits well: dal or curd, one or two roti, and a vegetable. ${sofar} For a plan that fits your health conditions, ask a doctor or dietitian.`,
        `हल्का और जल्दी खाया खाना आम तौर पर ठीक बैठता है: दाल या दही, एक-दो रोटी और एक सब्ज़ी। ${sofar} अपनी सेहत के हिसाब से योजना के लिए डॉक्टर या डाइटीशियन से पूछें।`,
        `Halka aur jaldi khaya khana aam taur par theek baithta hai: dal ya dahi, ek-do roti aur ek sabzi. ${sofar} Apni sehat ke hisaab se plan ke liye doctor ya dietitian se poochhein.`);
    } else if (Q.condition.test(q)) {
      topic = 'condition';
      a = P3('I cannot advise on health conditions or targets. I can keep your readings in the log so you can show them to your doctor.',
        'सेहत की स्थितियों या लक्ष्यों पर यहाँ सलाह नहीं दी जाती। आपकी रीडिंग लॉग में रखी जा सकती हैं ताकि आप डॉक्टर को दिखा सकें।',
        'Sehat ki sthitiyon ya targets par yahan salah nahi di jaati. Aapki readings log mein rakhi ja sakti hain taaki aap doctor ko dikha sakein.');
    } else if (Q.calories.test(q) && Q.caloriesCtx.test(q)) {
      topic = 'calories';
      a = s.kcalHi
        ? P3(`So far today you have had roughly ${s.kcalLo}-${s.kcalHi} kcal. This is a rough range, and a common reference for older adults is around ${g.kcal || 1800} kcal a day. Your doctor or a dietitian can give you a number that fits you.`,
          `आज अब तक आपने लगभग ${s.kcalLo}-${s.kcalHi} kcal लिया है। यह मोटा अंदाज़ा है, और बुज़ुर्गों के लिए आम तौर पर रोज़ लगभग ${g.kcal || 1800} kcal का संदर्भ लिया जाता है। आपके लिए सही संख्या डॉक्टर या डाइटीशियन बता सकते हैं।`,
          `Aaj ab tak aapne lagbhag ${s.kcalLo}-${s.kcalHi} kcal liya hai. Yeh motaa andaza hai, aur buzurgon ke liye aam taur par roz lagbhag ${g.kcal || 1800} kcal ka reference liya jaata hai. Aapke liye sahi number doctor ya dietitian bata sakte hain.`)
        : P3('Nothing is logged yet today, so there are no calories to add up. Tell me what you ate and I will log it.', 'आज अभी कुछ दर्ज नहीं हुआ, इसलिए जोड़ने को कैलोरी नहीं हैं। बताइए आपने क्या खाया, वह दर्ज हो जाएगा।', 'Aaj abhi kuch darj nahi hua, isliye jodne ko calories nahi hain. Bataiye aapne kya khaya, darj ho jaayega.');
    } else if (Q.nutrition.test(q)) {
      topic = 'nutrition';
      a = P3('Calories here are rough ranges for typical home portions, not exact. Pairing roti or rice with dal and vegetables is a common, balanced pattern. For specific targets, ask a doctor or dietitian.',
        'यहाँ कैलोरी घर की आम मात्रा के मोटे अंदाज़े हैं, सटीक नहीं। रोटी या चावल के साथ दाल और सब्ज़ी लेना एक आम, संतुलित तरीका है। किसी ख़ास लक्ष्य के लिए डॉक्टर या डाइटीशियन से पूछें।',
        'Yahan calories ghar ki aam matra ke motaa andaze hain, sateek nahi. Roti ya chawal ke saath dal aur sabzi lena ek aam, santulit tareeka hai. Kisi khaas target ke liye doctor ya dietitian se poochhein.');
    } else if (Q.sleep.test(q)) {
      topic = 'sleep';
      a = P3('You can log your sleep in the Track tab. A regular bedtime and an early, light dinner help many people. If sleep trouble continues, please talk to your doctor.',
        'अपनी नींद आप "दर्ज करें" टैब में लिख सकते हैं। सोने का नियमित समय और जल्दी, हल्का खाना कई लोगों की मदद करता है। नींद की परेशानी बनी रहे तो कृपया डॉक्टर से बात करें।',
        'Apni neend aap "Track" tab mein likh sakte hain. Sone ka niyamit samay aur jaldi, halka khana kai logon ki madad karta hai. Neend ki pareshani bani rahe to kripya doctor se baat karein.');
    } else if (Q.about.test(q)) {
      topic = 'about';
      a = P3('I log what you tell me, adapt your walking goal to your week, and answer simple questions about water, walking, food and your day. I never diagnose or advise on medicines.',
        'यहाँ आप जो बताते हैं वह दर्ज होता है, सैर का लक्ष्य आपके हफ़्ते के हिसाब से बदलता है, और पानी, सैर, खाने और आपके दिन के सरल सवालों के जवाब मिलते हैं। यहाँ कभी बीमारी नहीं बताई जाती और दवाओं पर सलाह नहीं दी जाती।',
        'Yahan aap jo bataate hain woh darj hota hai, walk ka target aapke hafte ke hisaab se badalta hai, aur paani, walk, khane aur aapke din ke saral sawaalon ke jawaab milte hain. Yahan kabhi bimari nahi batayi jaati aur dawaiyon par salah nahi di jaati.');
    } else {
      a = P3('I can help with water, walking, simple food questions and your day so far. For anything else about your health, please ask your doctor.',
        'पानी, सैर, खाने के सरल सवालों और आपके अब तक के दिन में मदद मिल सकती है। सेहत से जुड़ी किसी और बात के लिए कृपया अपने डॉक्टर से पूछें।',
        'Paani, walk, khane ke saral sawaalon aur aapke ab tak ke din mein madad mil sakti hai. Sehat se judi kisi aur baat ke liye kripya apne doctor se poochhein.');
    }
    if (safety.level === 'amber' && topic !== 'medicine') a += ' ' + sm;
    return { source: 'demo', safety, answer: a, topic };
  }

  function familySummary(name, sum, goals, lang) {
    const l = LG(lang), n = name || (l === 'en' ? 'Today' : 'Aaj');
    const kcal = sum.kcalHi ? `${sum.kcalLo}-${sum.kcalHi} kcal (${l === 'hi' ? 'मोटा अंदाज़ा' : l === 'hg' ? 'motaa andaza' : 'rough'})` : '-';
    if (l === 'hi') {
      const flag = sum.flags.length ? '\nध्यान दें: कुछ लक्षण दर्ज हुए हैं, कृपया डॉक्टर को बताएँ।' : '';
      return `${name ? name + ' का दिन' : 'आज का दिन'}:\nपानी: ${sum.water}/${goals.water} गिलास\nसैर: ${sum.walkMin}/${goals.walk} मिनट, ${sum.steps} कदम, ${sum.km} किमी\nखाना: ${sum.meals.length} चीज़ें, ${kcal}${sum.protHi ? `\nप्रोटीन: लगभग ${sum.protLo}-${sum.protHi} ग्राम (मोटा अंदाज़ा)` : ''}${flag}\n(माय फ़िटनेस बडी - चिकित्सा सलाह नहीं)`;
    }
    if (l === 'hg') {
      const flag = sum.flags.length ? '\nDhyaan dein: kuch lakshan darj hue hain, kripya doctor ko bataiye.' : '';
      return `${name ? name + ' ka din' : 'Aaj ka din'}:\nPaani: ${sum.water}/${goals.water} glass\nWalk: ${sum.walkMin}/${goals.walk} min, ${sum.steps} kadam, ${sum.km} km\nKhana: ${sum.meals.length} cheezein, ${kcal}${sum.protHi ? `\nProtein: lagbhag ${sum.protLo}-${sum.protHi} g (motaa andaza)` : ''}${flag}\n(My Fitness Buddy - medical salah nahi)`;
    }
    const flag = sum.flags.length ? '\nNote: symptoms were logged, please check with the doctor.' : '';
    return `${n}'s day:\nWater: ${sum.water}/${goals.water} glasses\nWalk: ${sum.walkMin}/${goals.walk} min, ${sum.steps} steps, ${sum.km} km\nFood: ${sum.meals.length} items, ${kcal}${sum.protHi ? `\nProtein: about ${sum.protLo}-${sum.protHi} g (rough)` : ''}${flag}\n(My Fitness Buddy - not medical advice)`;
  }

  return { LG, foodName, foodRows, proteinTarget, kcalReference, SLOTS, kmFromSteps, STEP_KM, STEPS_PER_MIN, answerQuery, parse, analyze, assessSafety, safetyMessage, guardrail, fromAI, summarize, adaptiveWalkGoal, nudge, familySummary, dayKey, DEFAULT_GOALS, FOODS };
});
