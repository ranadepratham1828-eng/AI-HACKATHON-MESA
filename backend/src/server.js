import { config } from './config.js';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { aiStatus } from './ai/provider.js';

const app = createApp(createStore(config.dataFile));

app.listen(config.port, () => {
  const ai = aiStatus();
  console.log(`Disha API running at http://localhost:${config.port}`);
  console.log(ai.configured
    ? `AI: ${ai.provider} (${ai.model})`
    : 'AI: not configured, using scripted demo answers. Add GEMINI_API_KEY to .env to turn it on.');
});
