// Tiny JSON-file store. Good enough for a demo; swap for a real database later.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const familyCode = () => Array.from(randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

export function createStore(file) {
  let db = {};
  if (file && existsSync(file)) {
    try { db = JSON.parse(readFileSync(file, 'utf8')); } catch { console.warn(`[store] could not read ${file}, starting empty`); }
  }
  db.students ||= {};
  db.users ||= {};
  db.sessions ||= {};

  let pending = null;
  function persist() {
    if (!file) return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(db, null, 2));
      renameSync(tmp, file);
    }, 50);
  }

  return {
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
