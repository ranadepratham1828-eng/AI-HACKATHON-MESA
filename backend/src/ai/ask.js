// Run an AI call and fall back to a scripted answer on any failure.
// Every result says where it came from: source "ai" or "scripted".
import { generate, aiEnabled } from './provider.js';

export async function askWithFallback({ prompt, images, validate, fallback, label }) {
  if (!aiEnabled()) return { ...fallback(), source: 'scripted' };
  try {
    const out = await generate({ prompt, images });
    const clean = validate(out);
    if (!clean) throw new Error('AI answer was missing fields');
    return { ...clean, source: 'ai' };
  } catch (err) {
    console.warn(`[ai] ${label} failed, using scripted answer: ${err.message}`);
    return { ...fallback(), source: 'scripted', aiError: err.code || 'error' };
  }
}

export const str = (v, max = 600) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
export const strList = (v, n, max = 300) =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : [];
