// Dishaa API. See docs/API.md for every endpoint with examples.
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { content, missionById, gameById, publicMission, publicGame, publicAssessment, assessmentItemById } from './content.js';
import { aiStatus } from './ai/provider.js';
import { scoreGame, missionPicks } from './logic/scoring.js';
import { missionFeedback, twistReaction, curiosityAnswer } from './logic/missions.js';
import { careerReport, parentReport, campusConnect, computeResults } from './logic/report.js';
import { cleanStudyInput, buildStudyPlan, weeksOf, progressOf, recommendActivities, studySummary, toICS, todayIST, addDays, daysBetween, isDate, withTimes } from './logic/study.js';
import { studyNote } from './logic/studyNote.js';
import { scoreAssessment } from './logic/assessment.js';
import { matchScholarships } from './logic/scholarships.js';
import { coachState, coachReply, buildPlan, coachSuggestions } from './logic/coach.js';
import { classDashboard } from './logic/school.js';
import { ananyaData } from './demo.js';
import { hashPassword, checkPassword, publicUser, canSeeStudent, canEditStudent, bearerToken } from './auth.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sendEmail, loginEmail, emailStatus } from './email.js';

const FRONTEND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
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
  const pick = (key, allowed) => { if (key in body) out[key] = allowed.includes(body[key]) ? body[key] : null; };
  const qn = content.questionnaire;
  pick('budget', qn.collegeBudgets.map((b) => b.id));
  pick('familyIncome', qn.incomeBands.map((b) => b.id));
  pick('category', qn.categories);
  pick('gender', qn.genders.map((g) => g.id));
  pick('relocate', qn.relocate.map((r) => r.id));
  pick('board', qn.boards);
  if ('schoolName' in body) out.schoolName = text(body.schoolName, 120);
  if ('subjects' in body) out.subjects = list(body.subjects);
  if ('openToLoan' in body) out.openToLoan = Boolean(body.openToLoan);
  if ('marks' in body && body.marks && typeof body.marks === 'object') {
    out.marks = {};
    for (const k of ['class9', 'class10', 'class11', 'class12']) {
      const v = Number(body.marks[k]);
      if (body.marks[k] !== '' && body.marks[k] != null && Number.isFinite(v) && v >= 0 && v <= 100) out.marks[k] = Math.round(v * 10) / 10;
    }
  }
  if ('considering' in body) {
    const valid = new Set(content.careers.map((c) => c.id));
    out.considering = list(body.considering, 10).filter((id) => valid.has(id));
  }
  if ('consideringOther' in body) out.consideringOther = text(body.consideringOther, 120);
  if ('notSure' in body) out.notSure = Boolean(body.notSure);
  if ('priorities' in body) {
    const valid = new Set(content.priorities.map((p) => p.id));
    out.priorities = list(body.priorities, 3).filter((id) => valid.has(id));
  }
  if ('riasec' in body && body.riasec && typeof body.riasec === 'object') {
    out.riasec = {};
    for (const it of content.questionnaire.riasec.items) {
      const v = Number(body.riasec[it.id]);
      if ([0, 1, 2].includes(v)) out.riasec[it.id] = v;
    }
  }
  if ('interests' in body) {
    const valid = new Set(content.interests.map((i) => i.id));
    out.interests = list(body.interests).filter((i) => valid.has(i));
  }
  if ('stated' in body && body.stated && typeof body.stated === 'object') {
    out.stated = Object.fromEntries(
      content.assessment.abilities.map((a) => [a.id, Math.max(1, Math.min(5, Math.round(Number(body.stated[a.id]) || 3)))]),
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
      questAnswered: Object.keys(student.assessment?.answers || {}).length,
      questTotal: content.assessmentItems.length,
      questDone: Boolean(student.assessment?.completedAt),
      questionnaireDone: Boolean(student.profile?.interests?.length && student.profile?.subjects?.length),
      reportReady: Boolean(student.assessment?.completedAt),
      missionsDone,
      missionsTotal: content.missions.length,
    },
  };
}

export function createApp(store) {
  const app = express();
  app.set('trust proxy', true);
  app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '12mb' }));

  // Hosted on Vercel with Redis: load the latest data first, and save it
  // before any JSON response is sent (serverless functions stop after responding).
  if (store.remote) {
    app.use('/api', async (req, res, next) => {
      try {
        await store.load();
        const send = res.json.bind(res);
        res.json = (body) => {
          store.flush()
            .catch((err) => console.error('[store] save failed:', err.message))
            .finally(() => send(body));
          return res;
        };
        next();
      } catch (err) { next(err); }
    });
  }

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
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'disha', ai: aiStatus(), storage: store.mode }));

  app.get('/api/content', (req, res) => res.json({
    questionnaire: content.questionnaire,
    traits: content.traits,
    assessment: publicAssessment(),
    interests: content.interests,
    careers: content.careers.map(({ id, name, category, exams, missionId }) => ({ id, name, category, exams, missionId: missionId || null })),
    careerCategories: content.careerCategories,
    priorities: content.priorities,
    games: content.games.map(publicGame),
    missions: content.missions.map(publicMission),
    study: { exams: content.study.exams, slots: content.study.slots, syllabus: content.study.syllabus, sources: content.study.sources, techniques: content.study.techniques },
  }));

  // ---- Accounts (P0) ----
  // ---- Paid model: there is no public sign-up. Accounts are created by the
  // Dishaa team (admin key) and login details are emailed to each person. ----
  const ADMIN_KEY = process.env.ADMIN_KEY || '';
  const requireAdmin = (req) => {
    if (!ADMIN_KEY) throw new HttpError(503, 'Admin is not set up yet: add ADMIN_KEY to the server settings');
    const given = Buffer.from(String(req.headers['x-admin-key'] || ''));
    const want = Buffer.from(ADMIN_KEY);
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, 'Wrong admin key');
  };
  const loginUrlFor = (req) => `${(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/product`;
  const PW_CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const tempPassword = () => Array.from(randomBytes(10), (b) => PW_CHARS[b % PW_CHARS.length]).join('');

  async function provision(req, spec) {
    const role = ['student', 'parent', 'school'].includes(spec.role) ? spec.role : null;
    const name = text(spec.name, 60);
    const email = text(spec.email, 120).toLowerCase();
    if (!role) return { email, status: 'error', error: 'Role must be student, parent or school' };
    if (!name) return { email, status: 'error', error: 'Name is required' };
    if (!EMAIL_RE.test(email)) return { email, status: 'error', error: 'Invalid email' };
    if (store.getUserByEmail(email)) return { email, role, name, status: 'exists', error: 'An account with this email already exists' };
    const password = tempPassword();
    const user = { role, name, email, ...hashPassword(password), mustChangePassword: true };
    if (role === 'student') {
      const student = store.createStudent({ profile: cleanProfile({ name, cls: spec.cls || '10', city: spec.city || '' }), classId: (text(spec.classId, 10) || '10B').toUpperCase() });
      user.studentId = student.id;
    } else if (role === 'parent') {
      const childUser = spec.childEmail ? store.getUserByEmail(spec.childEmail) : null;
      const child = childUser?.studentId ? store.getStudent(childUser.studentId) : store.findStudentByFamilyCode(spec.familyCode);
      if (!child) return { email, role, name, status: 'error', error: "Child not found: give the child's student email or family code" };
      user.linkedStudentId = child.id;
    } else {
      user.classId = (text(spec.classId, 10) || '10B').toUpperCase();
      if (spec.school) user.school = text(spec.school, 120);
    }
    const created = store.createUser(user);
    const mail = loginEmail({ name, role, email, password, loginUrl: loginUrlFor(req) });
    const sent = spec.sendEmail === false ? { sent: false, reason: 'Email skipped' } : await sendEmail({ to: email, ...mail });
    return { id: created.id, email, role, name, status: 'created', emailed: sent.sent, emailError: sent.sent ? undefined : sent.reason, password: sent.sent ? undefined : password };
  }

  app.get('/api/admin/status', wrap(async (req, res) => {
    requireAdmin(req);
    res.json({ email: emailStatus(), ai: aiStatus(), storage: store.mode, loginUrl: loginUrlFor(req) });
  }));

  app.post('/api/admin/accounts', wrap(async (req, res) => {
    requireAdmin(req);
    const list = Array.isArray(req.body?.accounts) ? req.body.accounts.slice(0, 500) : [req.body || {}];
    const results = [];
    for (const spec of list) results.push(await provision(req, { ...spec, sendEmail: req.body?.sendEmail !== false && spec.sendEmail !== false }));
    res.status(201).json({ results });
  }));

  app.get('/api/admin/accounts', wrap(async (req, res) => {
    requireAdmin(req);
    res.json({ users: store.listUsers().filter((u) => !u.demo).map(publicUser) });
  }));

  app.post('/api/admin/accounts/:userId/reset', wrap(async (req, res) => {
    requireAdmin(req);
    const user = store.getUser(req.params.userId);
    if (!user) throw new HttpError(404, 'User not found');
    const password = tempPassword();
    Object.assign(user, hashPassword(password), { mustChangePassword: true });
    store.saveUser(user);
    const sent = await sendEmail({ to: user.email, ...loginEmail({ name: user.name, role: user.role, email: user.email, password, loginUrl: loginUrlFor(req), reset: true }) });
    res.json({ email: user.email, emailed: sent.sent, emailError: sent.sent ? undefined : sent.reason, password: sent.sent ? undefined : password });
  }));

  app.get('/api/admin/leads', wrap(async (req, res) => {
    requireAdmin(req);
    res.json({ leads: store.listLeads() });
  }));

  // Landing page "request access" form (public)
  app.post('/api/leads', wrap(async (req, res) => {
    if (req.body?.website) return res.status(201).json({ ok: true }); // honeypot: bots fill hidden fields
    const lead = {
      name: text(req.body?.name, 80),
      email: text(req.body?.email, 120).toLowerCase(),
      phone: text(req.body?.phone, 30),
      role: ['school', 'parent', 'student', 'other'].includes(req.body?.role) ? req.body.role : 'other',
      organisation: text(req.body?.organisation, 120),
      city: text(req.body?.city, 60),
      students: text(String(req.body?.students ?? ''), 20),
      message: text(req.body?.message, 1000),
    };
    if (!lead.name) throw new HttpError(400, 'Please add your name');
    if (!EMAIL_RE.test(lead.email)) throw new HttpError(400, 'Please add a valid email');
    store.addLead(lead);
    if (process.env.LEADS_NOTIFY_EMAIL) {
      sendEmail({ to: process.env.LEADS_NOTIFY_EMAIL, subject: `New Dishaa enquiry: ${lead.name} (${lead.role})`, text: JSON.stringify(lead, null, 2), html: `<pre>${JSON.stringify(lead, null, 2).replace(/</g, '&lt;')}</pre>` }).catch(() => {});
    }
    res.status(201).json({ ok: true });
  }));

  app.post('/api/auth/password', wrap(async (req, res) => {
    const user = requireUser(req);
    if (user.demoAccount) throw new HttpError(403, "The shared demo account's password can't be changed");
    const current = String(req.body?.current || '');
    const next = String(req.body?.next || '');
    if (!checkPassword(current, user)) throw new HttpError(400, 'Your current password is wrong');
    if (next.length < 8) throw new HttpError(400, 'Choose a password with at least 8 characters');
    if (next === current) throw new HttpError(400, 'Choose a new password, different from the temporary one');
    Object.assign(user, hashPassword(next), { mustChangePassword: false });
    store.saveUser(user);
    res.json({ ok: true, user: publicUser(user) });
  }));

  // ---- Shared demo account: /demo logs straight in; also works with email + password ----
  const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'ranadepratham1828@gmail.com').toLowerCase();
  const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '123456';
  // Bump when the demo student's data changes, so the shared account is rebuilt with the new data.
  const DEMO_VERSION = 4;
  function ensureDemoAccount() {
    let user = store.getUserByEmail(DEMO_EMAIL);
    const current = user?.studentId ? store.getStudent(user.studentId) : null;
    if (current && current.demoVersion === DEMO_VERSION) return user;
    const data = ananyaData('finished');
    data.profile.name = 'Ananya (Demo)';
    const student = store.createStudent({ ...data, demoAccount: true, demoVersion: DEMO_VERSION });
    if (user) {
      user.studentId = student.id;
      return store.saveUser(user);
    }
    return store.createUser({ role: 'student', name: 'Ananya (Demo)', email: DEMO_EMAIL, studentId: student.id, demoAccount: true, ...hashPassword(DEMO_PASSWORD) });
  }

  app.post('/api/auth/demo-login', wrap(async (req, res) => {
    const user = ensureDemoAccount();
    user.lastLoginAt = new Date().toISOString();
    store.saveUser(user);
    session(user)(res);
  }));

  app.post('/api/auth/login', wrap(async (req, res) => {
    if (String(req.body?.email || '').trim().toLowerCase() === DEMO_EMAIL) ensureDemoAccount();
    const user = store.getUserByEmail(req.body?.email);
    if (!user || !checkPassword(String(req.body?.password || ''), user)) throw new HttpError(401, 'Email or password is wrong');
    user.lastLoginAt = new Date().toISOString();
    store.saveUser(user);
    session(user)(res);
  }));

  // One-tap demo accounts for the pitch. Each call makes a fresh account.
  app.post('/api/auth/demo', wrap(async (req, res) => {
    const as = String(req.body?.as || 'student');
    const tag = Date.now().toString(36);
    if (as === 'student' || as === 'student-finished') {
      const student = store.createStudent(ananyaData(as === 'student' ? 'new' : 'finished'));
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
    out.scholarships = matchScholarships(s, report.careers.slice(0, 3).map((c) => c.id));
    out.hasPlan = Boolean(s.plan);
    out.study = studySummary(s);
    if (cacheEntry) { s.cache.report = cacheEntry; store.saveStudent(s); }
    res.json(out);
  }));

  // ---- Dishaa Coach: chat to find the goal, then build the career plan (P0) ----
  app.get('/api/students/:id/coach', wrap(async (req, res) => {
    const s = getStudent(req);
    const coach = coachState(s);
    store.saveStudent(s);
    res.json({ messages: coach.messages, goal: coach.goal, readyForPlan: coach.readyForPlan, hasPlan: Boolean(s.plan), suggestions: coachSuggestions(s) });
  }));

  app.post('/api/students/:id/coach', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const message = text(req.body?.message, 1000);
    if (!message) throw new HttpError(400, 'message is required');
    const coach = await coachReply(s, message);
    store.saveStudent(s);
    res.json({ messages: coach.messages, goal: coach.goal, readyForPlan: coach.readyForPlan, hasPlan: Boolean(s.plan), suggestions: coachSuggestions(s) });
  }));

  app.post('/api/students/:id/plan', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    if (!s.assessment?.answers || !Object.keys(s.assessment.answers).length) throw new HttpError(409, 'Complete the aptitude assessment first');
    if (req.body?.goal) {
      const g = content.careers.find((c) => c.id === req.body.goal);
      if (!g) throw new HttpError(400, 'Unknown career');
      coachState(s).goal = g.id;
    }
    s.plan = await buildPlan(s);
    store.saveStudent(s);
    res.json(s.plan);
  }));

  app.get('/api/students/:id/plan', wrap(async (req, res) => {
    const s = getStudent(req);
    if (!s.plan) throw new HttpError(404, 'No career plan yet');
    res.json(s.plan);
  }));

  // ---- Study planner: exams, subjects and free time become a day-by-day plan ----
  const goalCareerId = (s) => s.plan?.goal?.id || s.coach?.goal || computeResults(s).careers[0]?.id || null;
  function studyPayload(s) {
    const today = todayIST();
    const plan = buildStudyPlan(s.study.input, { cls: s.profile?.cls });
    const from = addDays(today, -6);
    const to = addDays(today, 27);
    return {
      exists: true,
      today,
      input: s.study.input,
      createdAt: s.study.createdAt,
      start: plan.start,
      end: plan.end,
      exams: plan.exams.map(({ subjectDates, ...e }) => ({ ...e, daysLeft: daysBetween(today, e.date) })),
      examDays: plan.examDays.map((x) => ({ ...x, daysLeft: daysBetween(today, x.date) })),
      subjects: plan.subjects.map(({ topics, exam, idx, weight, ...x }) => ({
        ...x, exam: exam?.short || null, daysLeft: daysBetween(today, x.deadline),
        minutes: plan.sessions.filter((ss) => ss.subject === x.name).reduce((a, ss) => a + ss.minutes, 0),
      })),
      sessions: plan.sessions.filter((x) => x.date >= from && x.date <= to),
      weeks: weeksOf(plan),
      warnings: plan.warnings,
      progress: progressOf(plan, s.study.done, today),
      done: s.study.done || {},
      activities: recommendActivities({ cls: s.profile?.cls, interests: s.profile?.interests, careerId: goalCareerId(s) }, s.study.input, plan),
      note: s.study.note,
      totals: { sessions: plan.sessions.length, hours: Math.round(plan.sessions.reduce((a, x) => a + x.minutes, 0) / 60) },
    };
  }

  app.get('/api/students/:id/study', wrap(async (req, res) => {
    const s = getStudent(req);
    if (!s.study?.input) { res.json({ exists: false }); return; }
    const out = studyPayload(s);
    const names = out.activities.recommended.map((a) => a.name);
    if (JSON.stringify(names) !== JSON.stringify(s.study.activities)) { s.study.activities = names; store.saveStudent(s); }
    res.json(out);
  }));

  app.post('/api/students/:id/study', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const input = cleanStudyInput(req.body || {});
    if (!input.subjects.length) throw new HttpError(400, 'Add at least one subject');
    if (input.weekdayHours + input.weekendHours === 0) throw new HttpError(400, 'Add some study time on school days or weekends');
    input.startDate = todayIST();
    const plan = buildStudyPlan(input, { cls: s.profile?.cls });
    const { source, aiError, ...note } = await studyNote(s, plan);
    const acts = recommendActivities({ cls: s.profile?.cls, interests: s.profile?.interests, careerId: goalCareerId(s) }, input, plan);
    s.study = { input, done: {}, createdAt: new Date().toISOString(), note: { ...note, source }, activities: acts.recommended.map((a) => a.name) };
    store.saveStudent(s);
    res.json(studyPayload(s));
  }));

  app.post('/api/students/:id/study/done', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    if (!s.study) throw new HttpError(404, 'No study plan yet');
    const id = text(req.body?.id, 40);
    if (!/^\d{4}-\d{2}-\d{2}#\d{1,2}$/.test(id)) throw new HttpError(400, 'Unknown session');
    s.study.done ||= {};
    if (req.body?.done === false) delete s.study.done[id]; else s.study.done[id] = true;
    store.saveStudent(s);
    const plan = buildStudyPlan(s.study.input, { cls: s.profile?.cls });
    res.json({ done: s.study.done, progress: progressOf(plan, s.study.done, todayIST()) });
  }));

  // Calendar tab: sessions (with clock times) and exams for a date range of up to 62 days.
  app.get('/api/students/:id/study/calendar', wrap(async (req, res) => {
    const s = getStudent(req);
    if (!s.study?.input) { res.json({ exists: false }); return; }
    const today = todayIST();
    const from = isDate(req.query.from) ? String(req.query.from) : addDays(today, -7);
    let to = isDate(req.query.to) ? String(req.query.to) : addDays(from, 41);
    if (to < from || daysBetween(from, to) > 62) to = addDays(from, 62);
    const plan = buildStudyPlan(s.study.input, { cls: s.profile?.cls });
    const slot = content.study.slots.find((x) => x.id === s.study.input.slot) || content.study.slots[2];
    res.json({
      exists: true, today, from, to, start: plan.start, end: plan.end, slot: slot.label,
      sessions: withTimes(plan.sessions, s.study.input).filter((x) => x.date >= from && x.date <= to),
      examDays: plan.examDays.map((x) => ({ ...x, daysLeft: daysBetween(today, x.date) })),
      done: s.study.done || {},
      progress: progressOf(plan, s.study.done, today),
    });
  }));

  app.get('/api/students/:id/study/calendar.ics', wrap(async (req, res) => {
    const s = getStudent(req);
    if (!s.study) throw new HttpError(404, 'No study plan yet');
    const plan = buildStudyPlan(s.study.input, { cls: s.profile?.cls });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="dishaa-study-plan.ics"');
    res.send(toICS(plan, s.study.input, { name: s.profile?.name || 'Student' }));
  }));

  // ---- Coming soon (after the Bengaluru pilot): alumni, mentors, counsellors, prep materials.
  // Students can ask to be told when each one opens. ----
  const WAITLIST = ['alumni', 'mentors', 'counsellors', 'materials'];
  app.post('/api/students/:id/waitlist', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const feature = String(req.body?.feature || '');
    if (!WAITLIST.includes(feature)) throw new HttpError(400, `feature must be one of ${WAITLIST.join(', ')}`);
    s.waitlist ||= [];
    if (!s.waitlist.includes(feature)) s.waitlist.push(feature);
    store.saveStudent(s);
    res.json({ waitlist: s.waitlist });
  }));

  // ---- Dishaa Quest: the aptitude game every new student plays first (P0) ----
  app.post('/api/students/:id/assessment/answers', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    const item = assessmentItemById(String(req.body?.itemId || ''));
    if (!item) throw new HttpError(404, 'Question not found');
    let answer = req.body?.answer;
    if (item.type === 'uses') answer = text(String(answer ?? ''), 3000);
    else if (item.type === 'memory') answer = Array.isArray(answer) ? answer.slice(0, 25).map((p) => [Number(p?.[0]), Number(p?.[1])]) : [];
    else answer = Number(answer);
    s.assessment ||= { answers: {} };
    s.assessment.answers[item.id] = { answer, ms: Math.max(0, Math.min(Number(req.body?.ms) || 0, 10 * 60 * 1000)) };
    const quest = scoreAssessment(s, content);
    if (quest.complete && !s.assessment.completedAt) s.assessment.completedAt = new Date().toISOString();
    store.saveStudent(s);
    const zone = quest.zones.find((z) => z.id === item.zoneId);
    res.json({ saved: true, zone, answered: quest.answered, total: quest.total, complete: quest.complete });
  }));

  app.post('/api/students/:id/assessment/restart', wrap(async (req, res) => {
    const s = getStudent(req, { edit: true });
    s.assessment = { answers: {} };
    s.cache = {};
    res.json(view(store.saveStudent(s)));
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

  // ---- The web app (backend/public) is served from the same server ----
  if (existsSync(FRONTEND_DIR)) {
    app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));
    app.get(['/app', '/app/*'], (req, res) => res.redirect(302, '/product'));
    app.get(['/product', '/product/*', '/demo'], (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'product.html')));
    app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
  }
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Something went wrong on the server' : err.message });
  });

  return app;
}
