// Vercel entry point when the project's Root Directory is the repo root.
// vercel.json rewrites every /api/* request here; the web app is served from backend/public.
export { default } from '../backend/src/vercel.js';
