/*
 * Plans, entitlements and step rewards. Pure functions (no DOM) so they can be tested in Node.
 * ALL money amounts are in Indian rupees and live in PLANS below: change them in one place.
 * There is NO real payment here: activating a plan is a local demo. Health-safety features
 * (red-flag messages, medicine refusals, emergency numbers) are never limited by any plan.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HealthPlans = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PLANS = [
    { id: 'monthly', name: 'Monthly', months: 1, price: 599 },
    { id: 'half', name: '6 months', months: 6, price: 1299 },
    { id: 'yearly', name: 'Yearly', months: 12, price: 7999 },
  ];
  const FREE = { aiPerDay: 5, walkHistory: 3 };
  const REWARD = { target: 10000, points: 100, streakBonus: { 3: 50, 7: 150, 30: 500 }, maxStepsPerDay: 40000 };
  const REDEEM = [
    { id: 'p3', label: '3 days of Premium', cost: 300, days: 3 },
    { id: 'p7', label: '7 days of Premium', cost: 600, days: 7 },
  ];
  const DAY = 86400000;

  const perMonth = (p) => Math.round(p.price / p.months);
  const bestValueId = () => PLANS.reduce((a, b) => (perMonth(b) < perMonth(a) ? b : a)).id; // computed, never hard-coded
  // Returns human-readable warnings if the price ladder looks wrong (a longer plan costing MORE per month).
  function priceWarnings() {
    const w = [];
    const sorted = PLANS.slice().sort((a, b) => a.months - b.months);
    for (let i = 1; i < sorted.length; i++) for (let j = 0; j < i; j++) {
      if (perMonth(sorted[i]) > perMonth(sorted[j])) w.push(`${sorted[i].name} (Rs ${perMonth(sorted[i])}/month) costs more per month than ${sorted[j].name} (Rs ${perMonth(sorted[j])}/month)`);
    }
    return w;
  }

  function addMonths(ts, m) { const d = new Date(ts); d.setMonth(d.getMonth() + m); return d.getTime(); }
  const isPremium = (plan, now) => !!(plan && plan.endsTs > (now == null ? Date.now() : now));
  function activate(plan, planId, now) {
    now = now == null ? Date.now() : now;
    const p = PLANS.find((x) => x.id === planId); if (!p) return plan || null;
    const from = isPremium(plan, now) ? plan.endsTs : now; // buying while Premium extends, never wastes days
    return { planId, startedTs: plan && isPremium(plan, now) ? plan.startedTs : now, endsTs: addMonths(from, p.months), source: 'demo' };
  }
  function extendDays(plan, days, now) {
    now = now == null ? Date.now() : now;
    const from = isPremium(plan, now) ? plan.endsTs : now;
    return { planId: (plan && plan.planId) || 'reward', startedTs: plan && isPremium(plan, now) ? plan.startedTs : now, endsTs: from + days * DAY, source: (plan && isPremium(plan, now) && plan.source) || 'reward' };
  }

  const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / DAY); };

  // stepsByDay: { 'YYYY-MM-DD': steps }. redeemed: [{cost}]. Points are DERIVED from step history, so they can't drift.
  function rewardSummary(stepsByDay, todayKey, redeemed) {
    const days = Object.keys(stepsByDay).filter((k) => Math.min(stepsByDay[k], REWARD.maxStepsPerDay) >= REWARD.target).sort();
    let earned = 0, run = 0, best = 0, prev = null;
    days.forEach((k) => {
      run = prev != null && dayNum(k) - prev === 1 ? run + 1 : 1; prev = dayNum(k);
      earned += REWARD.points + (REWARD.streakBonus[run] || 0);
      best = Math.max(best, run);
    });
    // current streak counts back from today, or from yesterday if today is not done yet
    const set = new Set(days); let cur = 0, n = dayNum(todayKey) - (set.has(todayKey) ? 0 : 1);
    const keyOf = (num) => { const d = new Date(num * DAY); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
    while (set.has(keyOf(n))) { cur++; n--; }
    const spent = (redeemed || []).reduce((s, r) => s + (r.cost || 0), 0);
    const todaySteps = Math.min(stepsByDay[todayKey] || 0, REWARD.maxStepsPerDay);
    const nextBonus = [3, 7, 30].find((x) => x > cur) || null;
    const badges = [
      { id: 'first', label: 'First 10,000', got: days.length >= 1 },
      { id: 's3', label: '3-day streak', got: best >= 3 },
      { id: 's7', label: '7-day streak', got: best >= 7 },
      { id: 'd30', label: '30 days at 10,000', got: days.length >= 30 },
    ];
    return { earned, spent, balance: earned - spent, days10k: days.length, streak: cur, best, todaySteps, todayDone: todaySteps >= REWARD.target, toGo: Math.max(0, REWARD.target - todaySteps), nextBonus, badges };
  }

  return { PLANS, FREE, REWARD, REDEEM, perMonth, bestValueId, priceWarnings, addMonths, isPremium, activate, extendDays, rewardSummary };
});
