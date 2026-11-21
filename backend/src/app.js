// Disha API. See docs/API.md for every endpoint with examples.
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { content, missionById, gameById, publicMission, publicGame } from './content.js';
import { aiStatus } from './ai/provider.js';
import { scoreGame, missionPicks } from './logic/scoring.js';
import { missionFeedback, twistReaction, curiosityAnswer } from './logic/missions.js';
import { careerReport, parentReport, recommendations, campusConnect } from './logic/report.js';
import { classDashboard } from './logic/school.js';
import { ananyaData } from './demo.js';
import { hashPassword, checkPassword, publicUser, canSeeStudent, canEditStudent, bearerToken } from './auth.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const FRONTEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const text = (v, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v, max = 20) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, max) : []);

function cleanProfile(body = {}, existing = {}) {
  const out = { ...existing };
  if ('name' in body) out.name = text(body.name, 60);
  if ('cls' in body) out.cls = ['9', '10', '11', '12'].includes(String(body.cls)) ? String(body.cls) : '10';
  if ('city' in body) out.city = text(body.city, 60);
  if ('likes' in body) out.likes = list(body.likes);
  if ('dislikes' in body) out.dislikes = list(body.dislikes);
  if ('hobbies' in body) out.hobbies = text(body.hobbies, 300);
  if ('goal' in body) out.goal = text(body.goal, 120);
  if ('dream' in body) out.dream = text(body.dream, 300);
  if ('parentExpect' in body) out.parentExpect = text(body.parentExpect, 60);
  if ('parentReason' in body) out.parentReason = text(body.parentReason, 300);
  if ('budget' in body) out.budget = ['tight', 'medium', 'flexible'].includes(body.budget) ? body.budget : 'medium';
  if ('stated' in body && body.stated && typeof body.stated === 'object') {
    out.stated = Object.fromEntries(
      content.traits.map((t) => [t.id, Math.max(1, Math.min(5, Math.round(Number(body.stated[t.id]) || 3)))]),
    );
  }
  return out;
}

/** Accepts {mimeType, data} or a data: URL string. Returns {mimeType, data} or null. */
function cleanImage(image) {
  if (!image) return null;
  let mimeType;
  let data;
  if (typeof image === 'string') {
    const m = image.match(/^data:([\w/+.-]+);base64,(.+)$/s);
    if (!m) throw new HttpError(400, 'image must be a base64 data URL or {mimeType, data}');
    [, mimeType, data] = m;
  } else {
    ({ mimeType, data } = image);
  }
  if (!IMAGE_TYPES.includes(mimeType)) throw new HttpError(400, `image type must be one of ${IMAGE_TYPES.join(', ')}`);
  if (typeof data !== 'string' || !data) throw new HttpError(400, 'image data is empty');
  if ((data.length * 3) / 4 > MAX_IMAGE_BYTES) throw new HttpError(413, 'image is larger than 8 MB; resize it before uploading');
  return { mimeType, data };
}

/** Student as sent to the app: no internal cache, plus a progress summary. */
function view(student) {
  const { cache, ...rest } = student;
  const missionsDone = Object.values(student.missions || {}).filter((m) => m.status === 'done').length;
  return {
    ...rest,
    progress: {
      questionnaireDone: Boolean(student.profile?.stated),
      gamesPlayed: Object.keys(student.games?.scores || {}).length,
      gamesTotal: content.games.length,
      missionsDone,
      missionsTotal: content.missions.length,
      reportReady: missionsDone > 0,
    },
  };
}

export function createApp(store) {
  const app = express();
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '12mb' }));

  // Every request: who is calling? (null when not logged in)
  app.use('/api', (req, res, next) => {
    req.token = bearerToken(req);
    req.user = store.getSessionUser(req.token);
    next();
  });
  const requireUser = (req) => {
    if (!req.user) throw new HttpError(401, 'Please log in');
    return req.user;
  };
  const getStudent = (req, { edit = false } = {}) => {
    const user = requireUser(req);
    const s = store.getStudent(req.params.id);
    if (!s) throw new HttpError(404, 'Student not found');
    if (!canSeeStudent(user, s)) throw new HttpError(403, "You don't have access to this student");
    if (edit && !canEditStudent(user, s)) throw new HttpError(403, 'Only the student can do this');
    return s;
  };
  const session = (user, status = 200) => (res) => res.status(status).json({ token: store.createSession(user.id), user: publicUser(user) });
  const getMission = (req) => {
    const m = missionById(req.params.missionId);
    if (!m) throw new HttpError(404, 'Mission not found');
    return m;
  };
  const missionState = (student, mission) => {
    student.missions[mission.id] ||= { status: 'in_progress', startedAt: new Date().toISOString(), questions: [] };
    return student.missions[mission.id];
  };

  // ---- Basics ----
  app.get('/api/health', (req, res) => res.json({ ok: true, ai: aiStatus() }));

  app.get('/api/content', (req, res) => res.json({
    questionnaire: content.questionnaire,
    traits: content.traits,
    games: content.games.map(publicGame),
    missions: content.missions.map(publicMission),
  }));

  // ---- Accounts (P0) ----
  app.post('/api/auth/signup', wrap(async (req, res) => {
    const role = ['student', 'parent', 'school'].includes(req.body?.role) ? req.body.role : null;
    const name = text(req.body?.name, 60);
    const email = text(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!role) throw new HttpError(400, 'Choose student, parent or school');
    if (!name) throw new HttpError(400, 'Name is required');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email');
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    if (store.getUserByEmail(email)) throw new HttpError(409, 'An account with this email already exists. Log in instead.');

    const user = { role, name, email, ...hashPassword(password) };
    if (role === 'student') {
      const student = store.createStudent({ profile: cleanProfile({ name, cls: req.body?.cls }) });
      user.studentId = student.id;
    } else if (role === 'parent') {
      const child = store.findStudentByFamilyCode(req.body?.familyCode);
      if (!child) throw new HttpError(400, "Family code not found. Ask your child for the code on their Disha home screen.");
      user.linkedStudentId = child.id;
    } else {
      user.classId = (text(req.body?.classId, 10) || '10B').toUpperCase();
    }
    session(store.createUser(user), 201)(res);
  }));

  app.post('/api/auth/login', wrap(async (req, res) => {
    const user = store.getUserByEmail(req.body?.email);
    if (!user || !checkPassword(String(req.body?.password || ''), user)) throw new HttpError(401, 'Email or password is wrong');
    session(user)(res);
  }));

  // One-tap demo accounts for the pitch. Each call makes a fresh account.
  app.post('/api/auth/demo', wrap(async (req, res) => {
    const as = String(req.body?.as || 'student');
    const tag = Date.now().toString(36);
    if (as === 'student' || as === 'student-finished') {
      const student = store.createStudent(ananyaData(as === 'student' ? 'questionnaire' : 'finished'));
      const user = store.createUser({ role: 'student', name: 'Ananya', email: `ananya-${tag}@demo.disha`, studentId: student.id, demo: true });
      return session(user, 201)(res);
    }
    if (as === 'parent') {
      const child = store.latestDemoStudent() || store.createStudent(ananyaData('finished'));
      const user = store.createUser({ role: 'parent', name: "Ananya's mother", email: `parent-${tag}@demo.disha`, linkedStudentId: child.id, demo: true });
      return session(user, 201)(res);
    }
    if (as === 'school') {
      if (!store.latestDemoStudent()) store.createStudent(ananyaData('finished'));
      const user = store.createUser({ role: 'school', name: 'Ms. Rekha (Counsellor)', email: `counsellor-${tag}@demo.disha`, classId: '10B', demo: true });
      return session(user, 201)(res);
    }
    throw new HttpError(400, 'as must be student, student-finished, parent or school');
  }));

  app.get('/api/auth/me', wrap(async (req, res) => {
    const user = requireUser(req);
    const studentId = user.studentId || user.linkedStudentId || null;
    const student = studentId ? store.getStudent(studentId) : null;
    res.json({ user: publicUser(user), student: student ? view(student) : null });
  }));

  app.post('/api/auth/logout', wrap(async (req, res) => {
    if (req.token) store.deleteSession(req.token);
    res.json({ ok: true });
  }));

  // ---- Students and questionnaire (P0) ----
  app.get('/api/students/:id', wrap(async (req, res) => res.json(view(getStudent(req)))));

  app.patch('/api/students/:id', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    s.profile = cleanProfile(req.body, s.profile);
    res.json(view(store.saveStudent(s)));
  }));

  app.get('/api/students/:id/mission-picks', wrap(async (req, res) => {
    res.json({ picks: missionPicks(getStudent(req), content) });
  }));

  // ---- Games (P0) ----
  app.post('/api/students/:id/games', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const results = req.body?.results || {};
    const feedback = [];
    for (const [gameId, r] of Object.entries(results)) {
      const game = gameById(gameId);
      if (!game || !r) continue;
      const result = { answer: game.type === 'uses' ? text(String(r.answer ?? ''), 2000) : Number(r.answer), ms: Number(r.ms) || null };
      s.games.results[gameId] = result;
      s.games.scores[gameId] = scoreGame(game, result);
      feedback.push({
        gameId,
        trait: game.trait,
        score: s.games.scores[gameId],
        correct: game.type === 'mcq' ? result.answer === game.answer : null,
        correctOption: game.type === 'mcq' ? game.answer : null,
        explanation: game.explanation,
      });
    }
    store.saveStudent(s);
    res.json({ feedback, scores: s.games.scores });
  }));

  // ---- Missions (P0) ----
  app.post('/api/students/:id/missions/:missionId/start', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const mission = getMission(req);
    const m = missionState(s, mission);
    if (m.status === 'done') Object.assign(m, { status: 'in_progress', startedAt: new Date().toISOString() });
    store.saveStudent(s);
    res.json({ mission: publicMission(mission), state: m });
  }));

  app.post('/api/students/:id/missions/:missionId/submit', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const mission = getMission(req);
    const answer = text(req.body?.answer);
    if (answer.length < 10) throw new HttpError(400, 'answer is too short');
    const image = cleanImage(req.body?.image);
    const feedback = await missionFeedback({ mission, student: s, answer, image });
    const m = missionState(s, mission);
    Object.assign(m, { answer, hasImage: Boolean(image), feedback, quality: feedback.quality });
    store.saveStudent(s);
    res.json({ feedback, state: m });
  }));

  app.post('/api/students/:id/missions/:missionId/twist', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const mission = getMission(req);
    const m = missionState(s, mission);
    if (!m.feedback?.twist) throw new HttpError(409, 'Submit the mission answer first to get a twist');
    const reply = text(req.body?.reply, 1500);
    if (!reply) throw new HttpError(400, 'reply is required');
    const reaction = await twistReaction({ mission, twist: m.feedback.twist, reply });
    Object.assign(m, { twistReply: reply, twistReaction: reaction });
    store.saveStudent(s);
    res.json({ reaction, state: m });
  }));

  app.post('/api/students/:id/missions/:missionId/bonus', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const mission = getMission(req);
    const m = missionState(s, mission);
    m.bonusTaken = true;
    if (req.body?.answer) m.bonusAnswer = text(req.body.answer, 2000);
    store.saveStudent(s);
    res.json({ bonus: mission.bonus, state: m });
  }));

  app.post('/api/students/:id/missions/:missionId/ask', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const mission = getMission(req);
    const question = text(req.body?.question, 500);
    if (!question) throw new HttpError(400, 'question is required');
    const m = missionState(s, mission);
    const out = await curiosityAnswer({ mission, question, history: m.questions });
    m.questions.push({ q: question, a: out.answer, source: out.source });
    store.saveStudent(s);
    res.json({ answer: out.answer, source: out.source, questions: m.questions });
  }));

  app.post('/api/students/:id/missions/:missionId/finish', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const mission = getMission(req);
    const m = missionState(s, mission);
    if (!m.answer) throw new HttpError(409, 'Submit the mission answer before finishing');
    const enjoy = Math.max(1, Math.min(5, Math.round(Number(req.body?.enjoy) || 3)));
    const elapsed = Date.now() - new Date(m.startedAt).getTime();
    const timeMs = Number(req.body?.timeMs) > 0 ? Number(req.body.timeMs) : elapsed;
    Object.assign(m, { status: 'done', enjoy, timeMs: Math.min(timeMs, 60 * 60 * 1000), completedAt: new Date().toISOString() });
    store.saveStudent(s);
    res.json({ state: m, progress: view(s).progress });
  }));

  // ---- Results (P0) ----
  app.get('/api/students/:id/report', wrap(async (req, res) => {
    const s = getStudent(req);
    const report = await careerReport(s);
    const { cacheEntry, ...out } = report;
    if (cacheEntry) { s.cache.report = cacheEntry; store.saveStudent(s); }
    res.json(out);
  }));

  app.get('/api/students/:id/recommendations', wrap(async (req, res) => {
    res.json(recommendations(getStudent(req)));
  }));

  app.get('/api/students/:id/parent-report', wrap(async (req, res) => {
    const s = getStudent(req);
    const out = await parentReport(s, String(req.query.lang || 'en'));
    const { cacheEntry, reportCacheEntry, ...body } = out;
    if (reportCacheEntry) s.cache.report = reportCacheEntry;
    if (cacheEntry) { s.cache.parent ||= {}; s.cache.parent[body.requestedLanguage || body.language] = cacheEntry; }
    store.saveStudent(s);
    res.json(body);
  }));

  // ---- Colleges and Campus Connect (P0 for the demo) ----
  app.get('/api/colleges', (req, res) => {
    const { missionId } = req.query;
    res.json({ colleges: content.colleges.filter((c) => !missionId || c.careers.includes(missionId)) });
  });

  app.get('/api/campus-connect', (req, res) => {
    res.json({ profiles: campusConnect({ missionId: req.query.missionId, collegeId: req.query.collegeId }) });
  });

  app.post('/api/campus-connect/requests', wrap(async (req, res) => {
    const user = requireUser(req);
    const s = store.getStudent(user.studentId || user.linkedStudentId || '');
    if (!s) throw new HttpError(403, 'Only students and parents can request a chat');
    const profile = content.campusProfiles.find((p) => p.id === req.body?.profileId);
    if (!profile) throw new HttpError(404, 'Profile not found');
    const request = { id: `req-${Date.now()}`, profileId: profile.id, message: text(req.body?.message, 500), status: 'requested', createdAt: new Date().toISOString() };
    s.campusRequests = [...(s.campusRequests || []), request];
    store.saveStudent(s);
    res.status(201).json({ request, note: profile.sample ? 'Demo profile: no real message is sent.' : undefined });
  }));

  // ---- School (P0) ----
  app.get('/api/schools/classes/:classId/dashboard', wrap(async (req, res) => {
    const user = requireUser(req);
    const classId = String(req.params.classId).toUpperCase();
    if (user.role !== 'school' || user.classId !== classId) throw new HttpError(403, 'Only the counsellor for this class can see its dashboard');
    res.json(classDashboard(classId, store.listStudents({ classId })));
  }));

  // ---- Errors ----
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // ---- The web app (frontend/) is served from the same server ----
  if (existsSync(FRONTEND_DIR)) {
    app.use(express.static(FRONTEND_DIR));
    app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
  }
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message });
  });

  return app;
}
