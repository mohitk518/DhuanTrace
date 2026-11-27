// Gemini resilience: a busy model gets one quick retry, then the next model; the whole call has a deadline
process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_MODEL = 'model-a'; process.env.GEMINI_DEADLINE_MS = '4000';
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
let script = [], calls = [];
global.fetch = async (url, opts) => {
  calls.push(String(url).match(/models\/([^:]+)/)[1]);
  const step = script.shift() || 'ok';
  if (step === 'hang') return new Promise((_, rej) => opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))));
  if (step === 503) return { ok: false, status: 503, json: async () => ({ error: { message: 'This model is currently experiencing high demand.' } }) };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answer: 'ok', follow_ups: [] }) }] } }] }) };
};
const keepAlive = setInterval(() => {}, 1000); // AbortSignal.timeout timers do not keep Node running on their own
(async () => {
  const g = require('../lib/gemini');
  const facts = { city: 'Indore', city_hi: 'इंदौर', aqi_now: 120 };

  script = [503, 'ok']; calls = [];
  const a = await g.askCopilot(facts, 'q', 'en');
  assert(a.answer === 'ok' && calls.join() === 'model-a,model-a', 'a busy model is retried once and then answers');

  script = [503, 503, 'ok']; calls = [];
  await g.askCopilot(facts, 'q', 'en');
  assert(calls.length === 3 && calls[2] !== 'model-a', `still busy → the next model is tried (${calls.join(', ')})`);

  script = ['hang', 'hang', 'hang', 'hang', 'hang', 'hang']; calls = [];
  const t0 = Date.now(); let err;
  try { await g.askCopilot(facts, 'q', 'en'); } catch (e) { err = e; }
  const secs = (Date.now() - t0) / 1000;
  assert(err && secs < 5.5, `a hanging Gemini gives up within the deadline (${secs.toFixed(1)} s)`);
  assert(g.geminiReason(err).en === 'Gemini is busy right now' && g.geminiReason(new Error('GEMINI_API_KEY is not set')).en === 'Gemini is not connected', 'the page is told why: busy versus not connected');
  const t = g.templateAnswer({ ...facts, top_district: null }, 'en', g.geminiReason(err));
  assert(/Gemini is busy right now, so this is a summary/.test(t) && /^AQI in Indore is 120/.test(t), 'fallback summary says Gemini is busy, not "not connected"');
})().finally(() => clearInterval(keepAlive));
