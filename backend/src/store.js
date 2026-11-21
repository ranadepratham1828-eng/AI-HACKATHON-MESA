// Tiny JSON-file store. Good enough for a demo; swap for a real database later.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createStore(file) {
  let db = { students: {} };
  if (file && existsSync(file)) {
    try { db = JSON.parse(readFileSync(file, 'utf8')); } catch { console.warn(`[store] could not read ${file}, starting empty`); }
  }
  db.students ||= {};

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
    createStudent(data) {
      const student = { id: randomUUID(), createdAt: new Date().toISOString(), classId: '10B', games: { results: {}, scores: {} }, missions: {}, cache: {}, ...data };
      db.students[student.id] = student;
      persist();
      return student;
    },
    getStudent(id) {
      return db.students[id] || null;
    },
    saveStudent(student) {
      db.students[student.id] = student;
      persist();
      return student;
    },
    listStudents({ classId } = {}) {
      return Object.values(db.students).filter((s) => !classId || s.classId === classId);
    },
    reset() {
      db = { students: {} };
      persist();
    },
  };
}
