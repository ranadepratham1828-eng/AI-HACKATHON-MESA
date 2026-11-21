// Lists the Gemini models your key can use for text generation.
// Run: npm run models
import { config } from '../src/config.js';

const { apiKey, baseUrl } = config.ai.gemini;
if (!apiKey) {
  console.error('No GEMINI_API_KEY in backend/.env. Get one at https://aistudio.google.com/apikey');
  process.exit(1);
}

const res = await fetch(`${baseUrl}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
const data = await res.json();
if (!res.ok) {
  console.error('Gemini said:', data?.error?.message || res.status);
  process.exit(1);
}
const usable = (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'));
console.log('Models your key can use (put one in GEMINI_MODEL):\n');
for (const m of usable) console.log(`  ${m.name.replace('models/', '').padEnd(40)} ${m.displayName || ''}`);
