// Vercel serverless function. The API key lives ONLY in the host's env settings.
//   ANTHROPIC_API_KEY (required for live AI)   CLAUDE_MODEL (optional, default below)
// GET  -> { live: boolean }                      (client uses this to pick demo vs live mode)
// POST -> analysis object, same shape as HealthEngine.analyze()
const E = require('../engine.js');

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';

const SYSTEM = `You are the logging assistant inside "Dinchariya", a daily health-habit app for Indian adults aged 60+ who speak English, Hindi or Hinglish.
Your job: turn what the person says (or a photo of their plate) into a structured log, and write ONE short, warm reply.

HARD RULES (never break):
- Never diagnose, never name a disease the person might have, never recommend or comment on medicines/doses/insulin, never say a symptom is "nothing" or "fine".
- If the person mentions any symptom or pain, put a short label in "symptoms". If it could be an emergency (chest pain/pressure, trouble breathing, fainting, one-sided weakness, slurred speech, severe bleeding, thoughts of self-harm, very low/high sugar) set "urgent": true.
- Food amounts are rough ranges for typical Indian home portions. If you are unsure what a dish is or its portion, set confidence "low" and ask ONE short clarifying question in "clarify" instead of guessing. Regional dishes are easy to misjudge: say so honestly.
- Reply: max 2 short sentences, in the same language/script style the person used (Hinglish in Roman letters if they wrote Hinglish). No lists, no lectures, no emoji.
- Output ONLY a JSON object, nothing else.

JSON schema:
{"meals":[{"name":str,"qty":number,"unit":str,"kcal_lo":number,"kcal_hi":number,"slot":"breakfast|lunch|snack|dinner","confidence":"high|medium|low","skipped":bool,"assumed":bool}],
 "water_glasses":number,"walk_min":number,"steps":number,"distance_km":number,"walk_skipped":bool,
 "symptoms":[str],"urgent":bool,"clarify":str|null,"reply":str}`;

function pickJSON(s) {
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('no json');
  return JSON.parse(s.slice(a, b + 1));
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === 'GET') return res.status(200).json({ live: !!key });
  if (req.method !== 'POST') return res.status(405).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const text = String(body.text || '').slice(0, 1200);
  const lang = body.lang === 'hi' ? 'hi' : 'en';
  const ctx = { lang, now: body.now };
  const image = typeof body.image === 'string' && body.image.length < 2_500_000 ? body.image : null;

  // 1. Deterministic safety FIRST. A red flag never waits for, or depends on, the model.
  const safety = E.assessSafety(text);
  if (safety.level === 'red') {
    const base = E.analyze(text, ctx);
    return res.status(200).json({ ...base, source: 'safety' });
  }
  if (!key) return res.status(503).json({ error: 'live AI not configured' });
  if (!text && !image) return res.status(400).json({ error: 'empty' });

  try {
    const content = [];
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.replace(/^data:image\/\w+;base64,/, '') } });
    const c = body.context || {};
    content.push({ type: 'text', text: `Time now: ${String(body.now || new Date().toISOString()).slice(0, 25)}\nToday so far: water ${+c.water || 0} glasses, walk ${+c.walkMin || 0} min.\nPerson says: ${text || '(photo only: identify the food)'}` });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const data = await r.json();
    const out = E.fromAI(pickJSON((data.content || []).map((b) => b.text || '').join('')), text, ctx);
    return res.status(200).json(out);
  } catch (err) {
    // Client falls back to demo mode on any failure (poor connectivity, quota, bad output).
    return res.status(502).json({ error: 'ai_unavailable' });
  }
};
