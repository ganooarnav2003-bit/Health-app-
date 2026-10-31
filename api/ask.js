// Vercel serverless function: a small tool-using agent that answers questions.
// The person's data stays on their phone; the client sends a compact snapshot and
// the "tools" below read from that snapshot. Key is only in env (ANTHROPIC_API_KEY).
const E = require('../engine.js');
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';

const SYSTEM = `You are the question-answering helper inside "Dinchariya", a daily health-habit app for older adults.
Scope: water, walking (steps, distance, minutes), calories logged today (always a rough range, never exact), simple food/portion questions, and the person's own day. Use the tools to read the person's data whenever a question is about THEIR day, goal or progress; never guess their numbers.
HARD RULES: never diagnose or name a disease they might have; never advise on medicines, insulin or doses; never say a symptom is harmless; for medical or condition-specific questions say you cannot advise and suggest their doctor or a dietitian; any emergency sign (chest pain, trouble breathing, fainting, one-sided weakness, severe bleeding) means: call 112 now.
Style: plain English, at most 3 short sentences, no lists, no emoji, no lectures. If you do not know, say so briefly.`;

const TOOLS = [
  { name: 'get_today_log', description: "Today's totals: water glasses, walk minutes, steps, distance in km, rough kcal range, foods eaten.", input_schema: { type: 'object', properties: {} } },
  { name: 'get_goals', description: "Today's water goal (glasses) and walking goal (minutes). The walking goal adapts to recent days.", input_schema: { type: 'object', properties: {} } },
  { name: 'get_recent_days', description: 'Walking minutes for each of the last few days.', input_schema: { type: 'object', properties: {} } },
];

function runTool(name, c) {
  const s = c.summary || {};
  if (name === 'get_today_log') return { water_glasses: +s.water || 0, walk_minutes: +s.walkMin || 0, steps: +s.steps || 0, distance_km: +s.km || 0, kcal_range: [+s.kcalLo || 0, +s.kcalHi || 0], foods: (s.meals || []).slice(0, 15).map(String) };
  if (name === 'get_goals') return { water_glasses: +(c.goals || {}).water || 6, walk_minutes: +(c.goals || {}).walk || 20, steps: +(c.goals || {}).steps || 0, distance_km: +(c.goals || {}).km || 0, kcal_reference: +(c.goals || {}).kcal || 1800 };
  if (name === 'get_recent_days') return (c.history || []).slice(-7).map((h) => ({ date: String(h.date), walk_minutes: +h.walkMin || 0 }));
  return { error: 'unknown tool' };
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const question = String(body.question || '').slice(0, 500);
  const ctx = body.context || {};
  if (!question.trim()) return res.status(400).json({ error: 'empty' });

  const demo = E.answerQuery(question, ctx);
  // Red flags and medicine questions are answered by fixed text; the model is not consulted.
  if (demo.safety.level === 'red' || demo.topic === 'medicine') return res.status(200).json({ ...demo, source: 'safety' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'live AI not configured' });

  try {
    // Multi-turn: keep the last few turns, force strict user/assistant alternation ending in the new question.
    const messages = [];
    for (const m of (Array.isArray(body.history) ? body.history : []).slice(-6)) {
      const role = m && m.role === 'assistant' ? 'assistant' : 'user';
      const content = String((m && m.content) || '').slice(0, 500);
      if (!content) continue;
      const last = messages[messages.length - 1];
      if (!messages.length && role !== 'user') continue;
      if (last && last.role === role) last.content += '\n' + content; else messages.push({ role, content });
    }
    const tail = messages[messages.length - 1];
    if (tail && tail.role === 'user') tail.content += '\n' + question; else messages.push({ role: 'user', content: question });
    let text = '';
    for (let turn = 0; turn < 4; turn++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: 400, system: SYSTEM, tools: TOOLS, messages }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error('upstream ' + r.status);
      const data = await r.json();
      messages.push({ role: 'assistant', content: data.content });
      const uses = (data.content || []).filter((b) => b.type === 'tool_use');
      if (data.stop_reason === 'tool_use' && uses.length) {
        messages.push({ role: 'user', content: uses.map((u) => ({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(runTool(u.name, ctx)) })) });
        continue;
      }
      text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
      break;
    }
    let answer = E.guardrail(text);
    if (!answer) return res.status(200).json({ ...demo, guardrailHit: true }); // diagnosis/dose wording -> safe fallback
    if (demo.safety.level === 'amber') answer += ' ' + E.safetyMessage(demo.safety, 'en');
    return res.status(200).json({ source: 'ai', safety: demo.safety, answer, topic: 'ai' });
  } catch (err) {
    return res.status(502).json({ error: 'ai_unavailable' });
  }
};
