import { config } from './config.js';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { aiStatus } from './ai/provider.js';

const app = createApp(createStore(config.dataFile));
const MAX_TRIES = 10;

// If the port is taken by another app (e.g. something else on your laptop),
// try the next one instead of failing, and print the exact address to open.
function start(port, triesLeft) {
  const server = app.listen(port);
  server.once('listening', () => {
    const ai = aiStatus();
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  ==============================================');
    console.log(`   Disha is running.  Open:  ${url}`);
    console.log('  ==============================================');
    if (port !== config.port) console.log(`  (Port ${config.port} was busy with another app, so Disha moved to ${port}.)`);
    console.log(ai.configured
      ? `  AI: ${ai.provider} (${ai.model})`
      : '  AI: not configured, using scripted demo answers. Add GEMINI_API_KEY to backend/.env to turn it on.');
    console.log('');
  });
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      start(port + 1, triesLeft - 1);
    } else {
      console.error(`Could not start Disha: ${err.message}`);
      console.error('Set a different PORT in backend/.env and try again.');
      process.exit(1);
    }
  });
}

start(config.port, MAX_TRIES);
