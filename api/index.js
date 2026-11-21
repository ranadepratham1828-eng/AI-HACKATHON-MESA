// Vercel entry point: runs the Disha Express API as one serverless function.
// vercel.json rewrites every /api/* request here; the web app is served from /frontend.
import { createApp } from '../backend/src/app.js';
import { createStore, redisFromEnv } from '../backend/src/store.js';

const redis = redisFromEnv();
if (!redis) {
  console.warn('[disha] No Redis configured: data lives in /tmp and resets when Vercel restarts the function. Connect Upstash Redis in Vercel → Storage.');
}

// Without Redis, /tmp is the only writable folder on Vercel.
const store = createStore(redis ? null : '/tmp/disha-db.json', { redis });

export default createApp(store);
