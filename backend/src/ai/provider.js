// One small adapter over the AI providers Dishaa can use.
// generate() returns parsed JSON (or text) and throws AIError on any failure,
// so callers can fall back to scripted answers and the demo never breaks.

import { config } from '../config.js';

export class AIError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'AIError';
    this.status = status;
    this.code = code;
  }
}

export function aiStatus() {
  const { provider, gemini, openaiCompat } = config.ai;
  if (provider === 'gemini') return { provider, model: gemini.model, fallbackModel: gemini.fallbackModel, configured: true };
  if (provider === 'openai-compatible') {
    return { provider, model: openaiCompat.model, baseUrl: openaiCompat.baseUrl, configured: Boolean(openaiCompat.model) };
  }
  return { provider: 'none', configured: false, note: 'No AI key set: scripted demo answers are used.' };
}

export function aiEnabled() {
  return aiStatus().configured;
}

/**
 * @param {object} opts
 * @param {string} opts.prompt         Full instruction + data.
 * @param {{mimeType:string,data:string}[]} [opts.images]  Base64 images (no data: prefix).
 * @param {boolean} [opts.json=true]   Ask for and parse JSON.
 * @param {number} [opts.temperature=0.7]
 */
export async function generate({ prompt, images = [], json = true, temperature = 0.7, timeoutMs }) {
  if (!aiEnabled()) throw new AIError('AI is not configured', { code: 'not_configured' });
  const text = config.ai.provider === 'gemini'
    ? await geminiGenerate({ prompt, images, json, temperature, timeoutMs })
    : await openaiCompatGenerate({ prompt, images, json, temperature, timeoutMs });
  return json ? parseJSON(text) : text.trim();
}

let primaryDownUntil = 0;

async function geminiGenerate({ prompt, images, json, temperature, timeoutMs }) {
  const { apiKey, model, fallbackModel, baseUrl } = config.ai.gemini;
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }, ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))],
    }],
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };

  let models = [model, fallbackModel].filter((m, i, all) => m && all.indexOf(m) === i);
  // While the main model is overloaded or rate-limited, go straight to the fallback.
  if (models.length > 1 && primaryDownUntil > Date.now()) models = models.slice(1);
  // Share the time budget: the main model gets part of it, so the fallback still has time to answer.
  const budget = timeoutMs || config.ai.timeoutMs;
  const started = Date.now();
  let lastError;
  for (const [i, m] of models.entries()) {
    const left = budget - (Date.now() - started);
    const slice = models.length > 1 && i === 0 ? Math.min(left * 0.45, 15000) : left;
    if (slice < 1500) break;
    try {
      const res = await timedFetch(`${baseUrl}/models/${encodeURIComponent(m)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      }, slice);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new AIError(data?.error?.message || `Gemini error ${res.status}`, { status: res.status, code: data?.error?.status });
      }
      const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text.trim()) throw new AIError('Gemini returned an empty answer', { code: data.candidates?.[0]?.finishReason || 'empty' });
      return text;
    } catch (err) {
      lastError = err;
      // Try the fallback model only for rate limits, missing models or server errors.
      const retryable = err.status === 429 || err.status === 404 || err.status >= 500 || err.code === 'timeout';
      if (retryable && m === model && fallbackModel && fallbackModel !== model) primaryDownUntil = Date.now() + 3 * 60 * 1000;
      if (!retryable) break;
    }
  }
  throw lastError;
}

async function openaiCompatGenerate({ prompt, images, json, temperature, timeoutMs }) {
  const { apiKey, baseUrl, model } = config.ai.openaiCompat;
  const content = images.length
    ? [{ type: 'text', text: prompt }, ...images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }))]
    : prompt;
  const res = await timedFetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature, messages: [{ role: 'user', content }], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  }, timeoutMs);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AIError(data?.error?.message || `AI error ${res.status}`, { status: res.status });
  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new AIError('AI returned an empty answer', { code: 'empty' });
  return text;
}

async function timedFetch(url, options, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || config.ai.timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctl.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new AIError('AI took too long to answer', { code: 'timeout' });
    throw new AIError(`Could not reach the AI: ${err.message}`, { code: 'network' });
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON tolerantly: whole text, a ```json fence, or the first {…} / […] span. */
export function parseJSON(text) {
  const attempts = [text];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) attempts.push(fence[1]);
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start !== -1 && end > start) attempts.push(text.slice(start, end + 1));
  for (const a of attempts) {
    try { return JSON.parse(a); } catch { /* try the next one */ }
  }
  throw new AIError('AI answer was not valid JSON', { code: 'invalid_json' });
}
