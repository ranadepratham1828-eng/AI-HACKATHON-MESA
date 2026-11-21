// Shared Vercel setup, used by both entry points:
//  - backend/api/index.js  (Vercel Root Directory = backend)
//  - api/index.js          (Vercel Root Directory = repo root)
import { createApp } from './app.js';
import { createStore, redisFromEnv } from './store.js';

const redis = redisFromEnv();
if (!redis) {
  console.warn('[disha] No Redis configured: data lives in /tmp and resets when Vercel restarts the function. Connect Upstash Redis in Vercel → Storage.');
}

// Without Redis, /tmp is the only writable folder on Vercel.
export default createApp(createStore(redis ? null : '/tmp/disha-db.json', { redis }));
