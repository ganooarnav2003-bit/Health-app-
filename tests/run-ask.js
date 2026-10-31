// node tests/run-ask.js   -> demo answerer + a mocked run of the live agent's tool loop (no key needed)
const E = require('../engine.js');
const ctx = { summary: { water: 2, walkMin: 10, steps: 1000, km: 0.7, kcalLo: 240, kcalHi: 350, meals: ['roti', 'dal'] }, goals: { water: 6, walk: 15, steps: 1500, km: 1.05 }, history: [{ date: '2026-10-29', walkMin: 5 }] };
const cases = [
  ['How am I doing today?', (r) => /water 2 of 6/.test(r.answer) && /10 of 15/.test(r.answer)],
  ['How far did I walk today?', (r) => r.topic === 'distance' && /1000 steps/.test(r.answer) && /0\.7 km/.test(r.answer)],
  ['how much water should I drink', (r) => /6-8 glasses/.test(r.answer) && /doctor/.test(r.answer)],
  ['should I stop my tablet?', (r) => r.topic === 'medicine' && /cannot advise on medicines/.test(r.answer)],
  ['I have chest pain, what should I eat', (r) => r.safety.level === 'red' && /112/.test(r.answer)],
  ['do I have diabetes?', (r) => r.topic === 'condition' && /cannot advise/.test(r.answer)],
  ['what is the capital of France', (r) => r.topic === 'other' && /doctor/.test(r.answer)],
  ['my knee pain hurts when I walk, how long should I walk', (r) => r.safety.level === 'amber' && /tell your doctor/.test(r.answer)],
];
let pass = 0;
for (const [q, ok] of cases) { const r = E.answerQuery(q, ctx); const p = ok(r); pass += p; console.log(`${p ? 'pass' : 'FAIL'} | ${q} -> ${r.answer.slice(0, 90)}`); }

// Mock the Anthropic API: tool_use turn, then final text. Checks tool results come from the client snapshot,
// and that a diagnosis-style answer is replaced by the safe fallback.
(async () => {
  process.env.ANTHROPIC_API_KEY = 'test';
  const handler = require('../api/ask.js');
  const run = async (finalText, q) => {
    let call = 0, toolResult = null;
    global.fetch = async (_u, o) => {
      const b = JSON.parse(o.body); call++;
      if (call === 1) return { ok: true, json: async () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'get_today_log', input: {} }] }) };
      toolResult = b.messages[b.messages.length - 1].content[0].content;
      return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: finalText }] }) };
    };
    let out; await handler({ method: 'POST', body: { question: q, context: ctx } }, { setHeader() {}, status() { return this; }, json(o) { out = o; }, end() {} });
    return { out, toolResult };
  };
  let t = await run('You have walked 10 minutes and had 2 glasses of water.', 'how is my day');
  const ok1 = t.out.source === 'ai' && /"water_glasses":2/.test(t.toolResult); pass += ok1; console.log(`${ok1 ? 'pass' : 'FAIL'} | agent loop reads snapshot via tool, returns AI answer`);
  t = await run('You probably have diabetes. Take 500 mg metformin.', 'how is my day');
  const ok2 = t.out.source === 'demo' && t.out.guardrailHit && !/metformin/.test(t.out.answer); pass += ok2; console.log(`${ok2 ? 'pass' : 'FAIL'} | guardrail replaces diagnosis/dose wording`);
  t = await run('x', 'should I take paracetamol');
  const ok3 = t.out.source === 'safety'; pass += ok3; console.log(`${ok3 ? 'pass' : 'FAIL'} | medicine question never reaches the model`);
  console.log(`\n${pass}/${cases.length + 3} passed`);
})();
