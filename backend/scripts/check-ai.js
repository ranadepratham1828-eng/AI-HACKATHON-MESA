// Sends one tiny request to the configured AI to prove the key works.
// Run: npm run check-ai
import { generate, aiStatus } from '../src/ai/provider.js';

const status = aiStatus();
console.log('AI settings:', status);
if (!status.configured) {
  console.log('\nNo AI configured. The app will use scripted demo answers.');
  process.exit(0);
}
try {
  const out = await generate({ prompt: 'Reply with only JSON: {"ok": true, "hello": "a one-line greeting for an Indian Class 10 student"}' });
  console.log('\nAI works:', out);
} catch (err) {
  console.error('\nAI call failed:', err.message);
  if (err.status === 429) console.error('You hit the free-tier rate limit. Wait a minute, or set GEMINI_FALLBACK_MODEL to a Flash-Lite model.');
  if (err.status === 404) console.error('That model name is not available. Run `npm run models` and copy a name into GEMINI_MODEL.');
  if (err.status === 400 || err.status === 403) console.error('Check that GEMINI_API_KEY is correct and the Gemini API is enabled for it.');
  process.exit(1);
}
