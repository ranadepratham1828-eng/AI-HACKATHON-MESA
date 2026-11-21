import 'dotenv/config';

const env = process.env;

function pickProvider() {
  const explicit = (env.AI_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'none') return 'none';
  if (explicit === 'gemini') return env.GEMINI_API_KEY ? 'gemini' : 'none';
  if (explicit === 'openai-compatible') return env.OPENAI_COMPAT_API_KEY ? 'openai-compatible' : 'none';
  if (env.GEMINI_API_KEY) return 'gemini';
  if (env.OPENAI_COMPAT_API_KEY) return 'openai-compatible';
  return 'none';
}

export const config = {
  port: Number(env.PORT) || 4747,
  corsOrigin: env.CORS_ORIGIN || '*',
  dataFile: env.DATA_FILE || 'data/db.json',
  ai: {
    provider: pickProvider(),
    timeoutMs: (Number(env.AI_TIMEOUT_SECONDS) || 45) * 1000,
    gemini: {
      apiKey: env.GEMINI_API_KEY || '',
      model: env.GEMINI_MODEL || 'gemini-flash-latest',
      fallbackModel: env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    },
    openaiCompat: {
      apiKey: env.OPENAI_COMPAT_API_KEY || '',
      baseUrl: (env.OPENAI_COMPAT_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
      model: env.OPENAI_COMPAT_MODEL || '',
    },
  },
};
