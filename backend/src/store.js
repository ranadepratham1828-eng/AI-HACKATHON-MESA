// Tiny JSON store. Three modes:
//  - local file (npm start on a laptop): data/db.json
//  - Redis over REST (Vercel + Upstash): the whole db is one JSON value, loaded
//    at the start of each request and saved before the response is sent
//  - memory only (tests)
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const familyCode = () => Array.from(randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const REDIS_KEY = 'disha:db:v1';

const normalize = (db) => {
  const d = db && typeof db === 'object' ? db : {};
  d.students ||= {};
  d.users ||= {};
  d.sessions ||= {};
  return d;
};

/** Upstash / Vercel KV REST credentials from the environment, or null. */
export function redisFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redisCommand(redis, command) {
  const res = await fetch(redis.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redis.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis error: ${data.error || res.status}`);
  return data.result;
}

export function createStore(file, { redis = null } = {}) {
  let db = {};
  if (!redis && file && existsSync(file)) {
    try { db = JSON.parse(readFileSync(file, 'utf8')); } catch { console.warn(`[store] could not read ${file}, starting empty`); }
  }
  db = normalize(db);

  let dirty = false;
  let pending = null;
  function persist() {
    dirty = true;
    if (redis || !file) return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.tmp`;
        writeFileSync(tmp, JSON.stringify(db, null, 2));
        renameSync(tmp, file);
      } catch (err) {
        console.warn(`[store] could not save ${file}: ${err.message}`);
      }
    }, 50);
  }

  return {
    mode: redis ? 'redis' : file ? 'file' : 'memory',
    remote: Boolean(redis),

    /** Redis mode: fetch the latest data before handling a request. */
    async load() {
      if (!redis) return;
      const raw = await redisCommand(redis, ['GET', REDIS_KEY]);
      db = normalize(raw ? JSON.parse(raw) : {});
      dirty = false;
    },
    /** Redis mode: save changes before the response goes out. */
    async flush() {
      if (!redis || !dirty) return;
      await redisCommand(redis, ['SET', REDIS_KEY, JSON.stringify(db)]);
      dirty = false;
    },

    // ---- Students ----
    createStudent(data) {
      const student = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        classId: '10B',
        familyCode: familyCode(),
        games: { results: {}, scores: {} },
        missions: {},
        cache: {},
        ...data,
      };
      db.students[student.id] = student;
      persist();
      return student;
    },
    getStudent(id) {
      return db.students[id] || null;
    },
    findStudentByFamilyCode(code) {
      const c = String(code || '').trim().toUpperCase();
      return Object.values(db.students).find((s) => s.familyCode === c) || null;
    },
    latestDemoStudent() {
      return Object.values(db.students)
        .filter((s) => s.demo && Object.values(s.missions || {}).some((m) => m.status === 'done'))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
    },
    saveStudent(student) {
      db.students[student.id] = student;
      persist();
      return student;
    },
    listStudents({ classId } = {}) {
      return Object.values(db.students).filter((s) => !classId || s.classId === classId);
    },

    // ---- Users and sessions ----
    createUser(data) {
      const user = { id: randomUUID(), createdAt: new Date().toISOString(), ...data };
      db.users[user.id] = user;
      persist();
      return user;
    },
    getUser(id) {
      return db.users[id] || null;
    },
    getUserByEmail(email) {
      const e = String(email || '').trim().toLowerCase();
      return Object.values(db.users).find((u) => u.email === e) || null;
    },
    saveUser(user) {
      db.users[user.id] = user;
      persist();
      return user;
    },
    createSession(userId) {
      const token = randomBytes(24).toString('hex');
      db.sessions[token] = { userId, createdAt: new Date().toISOString() };
      persist();
      return token;
    },
    getSessionUser(token) {
      const s = token && db.sessions[token];
      return s ? db.users[s.userId] || null : null;
    },
    deleteSession(token) {
      delete db.sessions[token];
      persist();
    },
  };
}
