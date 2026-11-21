// Accounts, sessions and who can see which student.
// Roles: student (owns one student record), parent (linked by family code), school (one class).
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

export function checkPassword(password, user) {
  if (!user?.salt || !user?.hash) return false;
  const hash = scryptSync(password, user.salt, 32);
  const stored = Buffer.from(user.hash, 'hex');
  return stored.length === hash.length && timingSafeEqual(stored, hash);
}

/** User as sent to the app: never the password hash. */
export function publicUser(user) {
  if (!user) return null;
  const { hash, salt, ...rest } = user;
  return rest;
}

export function canSeeStudent(user, student) {
  if (!user || !student) return false;
  if (user.role === 'student') return user.studentId === student.id;
  if (user.role === 'parent') return user.linkedStudentId === student.id;
  if (user.role === 'school') return user.classId === student.classId;
  return false;
}

/** Only the student themself can play missions, answer the questionnaire, etc. */
export function canEditStudent(user, student) {
  return user?.role === 'student' && user.studentId === student?.id;
}

export function bearerToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
