/*
 * Daily Health Digest: a CURATED library of general wellness tips (not live news, not medical advice).
 * Each day shows 3 tips: one contextual (what the person is behind on today) plus rotating ones,
 * chosen deterministically from the date so everybody sees a stable "today's digest".
 * Figures quoted come from widely published guidance (WHO activity / salt / sugar guidance,
 * PROT-AGE-style protein suggestions for older adults). Nothing here diagnoses or prescribes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HealthTips = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CATS = { water: 'Hydration', walk: 'Movement', food: 'Eating well', protein: 'Protein', sleep: 'Sleep', mind: 'Mind & social', safety: 'Stay safe' };

  const TIPS = [
    // hydration
    { id: 'w1', cat: 'water', title: 'Keep a glass where you sit', body: 'Thirst fades with age, so you may not feel it. A glass within reach makes sipping automatic.' },
    { id: 'w2', cat: 'water', title: 'Sip through the day', body: 'A glass with each meal and one between meals spreads water through the day better than drinking a lot at once.' },
    { id: 'w3', cat: 'water', title: 'Check the colour', body: 'Pale-yellow urine usually means you are drinking enough. Dark yellow is a hint to have a glass.' },
    { id: 'w4', cat: 'water', title: 'Hot days need more', body: 'Heat and fever raise how much you need. If your doctor has limited your fluids, follow your doctor instead of this goal.' },
    // movement
    { id: 'm1', cat: 'walk', src: 'WHO', title: 'About 20 minutes a day adds up', body: 'WHO advises at least 150 minutes of moderate activity a week for adults, including people over 65. That is roughly 20 to 25 minutes a day.' },
    { id: 'm2', cat: 'walk', title: 'Short walks count', body: 'Three 10-minute walks are as useful as one 30-minute walk. Start with what feels easy and build slowly.' },
    { id: 'm3', cat: 'walk', title: 'Walk after dinner', body: 'A gentle 10-minute stroll after a meal is an easy habit to keep, and many people sleep better for it.' },
    { id: 'm4', cat: 'walk', title: 'Mind your footing', body: 'Wear comfortable shoes with a good grip, and avoid wet or uneven ground. A fall costs more than a missed walk.' },
    { id: 'm5', cat: 'walk', title: 'Practise your balance', body: 'Standing on one leg for 10 seconds while holding a sturdy counter, a few times a day, helps balance. Only try it if you feel steady.' },
    { id: 'm6', cat: 'walk', title: 'Know when to stop', body: 'If a walk brings chest pain, dizziness or breathlessness, stop, sit down and tell your doctor.' },
    // eating
    { id: 'f1', cat: 'food', title: 'Build a balanced plate', body: 'Half vegetables, a quarter dal or other protein, a quarter roti or rice is an easy picture to remember.' },
    { id: 'f2', cat: 'food', src: 'WHO', title: 'Go easy on salt', body: 'WHO suggests under 5 g of salt a day, about one teaspoon. Taste before you add more, and remember pickles and papad count.' },
    { id: 'f3', cat: 'food', src: 'WHO', title: 'Keep sweets occasional', body: 'WHO suggests free sugars stay below 10% of daily energy. Sweets and sugary drinks are best as an occasional treat.' },
    { id: 'f4', cat: 'food', title: 'Fruit for snack time', body: 'A fruit or a handful of nuts between meals keeps you full longer than biscuits.' },
    { id: 'f5', cat: 'food', title: 'Steam, bake or pressure-cook', body: 'Choosing these over deep-frying more often cuts calories without changing the taste of home food much.' },
    { id: 'f6', cat: 'food', title: 'Eat slowly', body: 'Eating slowly helps you notice when you are full, and makes meals more enjoyable.' },
    { id: 'f7', cat: 'food', title: 'Read the label', body: '"Sugar-free" does not always mean "calorie-free". Check the label for fat and total energy too.' },
    // protein
    { id: 'p1', cat: 'protein', src: 'PROT-AGE', title: 'Older adults often need more protein', body: 'To keep muscle strong, many experts suggest around 1.0 to 1.2 g of protein per kg of body weight a day after 65, unless your doctor advises otherwise.' },
    { id: 'p2', cat: 'protein', title: 'Spread protein across meals', body: 'Some protein at breakfast, lunch and dinner works better for muscle than all of it at dinner.' },
    { id: 'p3', cat: 'protein', title: 'Vegetarian protein sources', body: 'Dal, chana, rajma, curd, paneer, soya chunks, sprouts and nuts all help. Pairing dal with roti or rice gives a fuller mix.' },
    { id: 'p4', cat: 'protein', title: 'Easy protein hits', body: 'An egg, a katori of dal or a glass of milk each give roughly 6 to 8 g of protein.' },
    { id: 'p5', cat: 'protein', title: 'Kidney or doctor limits', body: 'If you have kidney disease or were told to limit protein, follow your doctor and ignore any protein range in this app.' },
    // sleep
    { id: 's1', cat: 'sleep', title: 'Keep a steady sleep routine', body: 'Going to bed and waking at similar times, even on weekends, helps sleep quality.' },
    { id: 's2', cat: 'sleep', title: 'Morning light', body: 'A few minutes of daylight and a short walk in the morning help your body clock.' },
    { id: 's3', cat: 'sleep', title: 'Lighter evenings', body: 'An early, lighter dinner and less tea or coffee late in the day often help people who sleep lightly.' },
    // mind
    { id: 'n1', cat: 'mind', title: 'A phone call is health care', body: 'Regular contact with friends and family supports wellbeing. Call someone today.' },
    { id: 'n2', cat: 'mind', title: 'Five quiet minutes', body: 'Slow breathing or sitting quietly for five minutes helps many people feel calmer.' },
    // safety
    { id: 'x1', cat: 'safety', title: 'Know the emergency signs', body: 'Chest pain or pressure, trouble breathing, a drooping face, sudden weakness on one side or severe bleeding: call 112 straight away.' },
    { id: 'x2', cat: 'safety', title: 'Keep your list ready', body: 'Keep a list of your medicines and your doctor\'s number where family can find it.' },
    { id: 'x3', cat: 'safety', title: 'Log readings for your doctor', body: 'Note your BP and sugar readings in this app and show them at your next visit. Check as often as your doctor advises.' },
    { id: 'x4', cat: 'safety', title: 'Regular check-ups', body: 'Eye, hearing and blood tests are worth keeping up. Ask your doctor how often is right for you.' },
  ];

  const dayNumber = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };

  // sum: summarize() output; goals: { water, steps, protein:{status,lo,hi} }
  function pickDaily(key, sum, goals) {
    const n = dayNumber(key), picked = [], used = new Set();
    const add = (t, why) => { if (t && !used.has(t.id)) { used.add(t.id); picked.push({ ...t, why: why || null }); } };
    const ofCat = (c) => TIPS.filter((t) => t.cat === c);
    const rot = (list, off) => list[(n + off) % list.length];
    if (sum) {
      const mid = (sum.protLo + sum.protHi) / 2;
      const needs = [];
      if (sum.water < Math.max(2, goals.water * 0.5)) needs.push(['water', 'Because your water is low today']);
      if (goals.steps && sum.steps < goals.steps * 0.5) needs.push(['walk', 'Because your steps are low today']);
      if (goals.protein && goals.protein.status === 'ok' && sum.meals && sum.meals.length && mid < goals.protein.lo * 0.5) needs.push(['protein', 'Because protein looks low today']);
      if (needs.length) { const [c, why] = needs[n % needs.length]; add(rot(ofCat(c), 0), why); }
    }
    const cats = Object.keys(CATS);
    for (let i = 0; picked.length < 3 && i < 40; i++) add(rot(ofCat(cats[(n + i) % cats.length]), i + Math.floor(n / cats.length)));
    return picked.slice(0, 3);
  }

  return { TIPS, CATS, pickDaily, dayNumber };
});
