// End-to-end API test with no AI key: everything must still work on scripted answers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.AI_PROVIDER = 'none';
const { createApp } = await import('../src/app.js');
const { createStore } = await import('../src/store.js');

let server;
let base;
before(async () => {
  server = createApp(createStore(null)).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

const call = async (method, path, body, token) => {
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

test('health and content', async () => {
  const h = await call('GET', '/health');
  assert.equal(h.body.ok, true);
  assert.equal(h.body.ai.configured, false);
  const c = await call('GET', '/content');
  assert.equal(c.body.missions.length, 4);
  assert.equal(c.body.missions[0].rubric, undefined, 'rubric must not leak');
  assert.equal(c.body.games[0].answer, undefined, 'answers must not leak');
});

test('signup, login and access rules', async () => {
  const bad = await call('POST', '/auth/signup', { role: 'student', name: 'X', email: 'nope', password: '123456' });
  assert.equal(bad.status, 400);
  const s = await call('POST', '/auth/signup', { role: 'student', name: 'Kiran', email: 'Kiran@Example.com', password: 'secret1', cls: '12' });
  assert.equal(s.status, 201);
  assert.equal(s.body.user.hash, undefined, 'password hash must not leak');
  assert.equal((await call('POST', '/auth/signup', { role: 'student', name: 'K', email: 'kiran@example.com', password: 'secret1' })).status, 409);
  assert.equal((await call('POST', '/auth/login', { email: 'kiran@example.com', password: 'wrong!' })).status, 401);
  const login = await call('POST', '/auth/login', { email: 'kiran@example.com', password: 'secret1' });
  assert.equal(login.status, 200);
  const me = await call('GET', '/auth/me', null, login.body.token);
  assert.equal(me.body.student.profile.cls, '12');

  const other = await call('POST', '/auth/signup', { role: 'student', name: 'Other', email: 'other@example.com', password: 'secret1' });
  assert.equal((await call('GET', `/students/${me.body.student.id}`)).status, 401);
  assert.equal((await call('GET', `/students/${me.body.student.id}`, null, other.body.token)).status, 403);

  const parent = await call('POST', '/auth/signup', { role: 'parent', name: 'Mom', email: 'mom@example.com', password: 'secret1', familyCode: me.body.student.familyCode.toLowerCase() });
  assert.equal(parent.status, 201);
  assert.equal((await call('GET', `/students/${me.body.student.id}`, null, parent.body.token)).status, 200);
  assert.equal((await call('PATCH', `/students/${me.body.student.id}`, { city: 'Pune' }, parent.body.token)).status, 403, 'parents cannot edit');
  assert.equal((await call('POST', '/auth/signup', { role: 'parent', name: 'D', email: 'd@example.com', password: 'secret1', familyCode: 'ZZZZZZ' })).status, 400);

  await call('POST', '/auth/logout', null, login.body.token);
  assert.equal((await call('GET', '/auth/me', null, login.body.token)).status, 401);
});

test('full student journey: questionnaire, games, mission with photo, report, parent, school', async () => {
  const signup = await call('POST', '/auth/signup', { role: 'student', name: 'Test', email: 'test@example.com', password: 'secret1', cls: '10' });
  const token = signup.body.token;
  const id = signup.body.user.studentId;

  const q = await call('PATCH', `/students/${id}`, {
    likes: ['Art'], dislikes: ['Maths'], parentExpect: 'Doctor',
    stated: { People: 3, Numbers: 1, Creativity: 4, Building: 2, Investigating: 2, Nature: 3 },
  }, token);
  assert.equal(q.body.progress.questionnaireDone, true);

  const picks = await call('GET', `/students/${id}/mission-picks`, null, token);
  assert.equal(picks.body.picks.length, 4);

  const games = await call('POST', `/students/${id}/games`, { results: { 'number-series': { answer: 1, ms: 8000 }, 'bottle-uses': { answer: 'pot\nlamp\nfeeder' } } }, token);
  assert.equal(games.body.feedback.length, 2);
  assert.equal(games.body.feedback[0].correct, true);

  await call('POST', `/students/${id}/missions/ux-designer/start`, null, token);
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const sub = await call('POST', `/students/${id}/missions/ux-designer/submit`, {
    answer: 'Put Send Money on the home screen, make the text big, and add Kannada.',
    image: `data:image/png;base64,${tinyPng}`,
  }, token);
  assert.equal(sub.status, 200);
  assert.equal(sub.body.feedback.source, 'scripted');
  assert.ok(sub.body.feedback.twist);
  assert.ok(sub.body.feedback.imageComment);

  const tw = await call('POST', `/students/${id}/missions/ux-designer/twist`, { reply: 'Keep the big button' }, token);
  assert.ok(tw.body.reaction.reaction);
  await call('POST', `/students/${id}/missions/ux-designer/bonus`, { answer: 'Your money is safe.' }, token);
  const ask = await call('POST', `/students/${id}/missions/ux-designer/ask`, { question: 'Do I need coding?' }, token);
  assert.equal(ask.body.questions.length, 1);
  const fin = await call('POST', `/students/${id}/missions/ux-designer/finish`, { enjoy: 5, timeMs: 300000 }, token);
  assert.equal(fin.body.progress.missionsDone, 1);

  const report = await call('GET', `/students/${id}/report`, null, token);
  assert.equal(report.body.topMatch.career, 'UX Designer');
  assert.ok(report.body.narrative.strengths.length > 0);

  const rec = await call('GET', `/students/${id}/recommendations`, null, token);
  assert.ok(rec.body.careerPaths[0].colleges.length > 0);
  assert.ok(rec.body.careerPaths[0].pathway.afterDegree);

  const parent = await call('GET', `/students/${id}/parent-report?lang=kn`, null, token);
  assert.equal(parent.body.requestedLanguage, 'kn');
  assert.equal(parent.body.language, 'en', 'scripted fallback is English and must say so');

  const cc = await call('GET', '/campus-connect?missionId=ux-designer');
  assert.ok(cc.body.profiles.length >= 3);
  const reqd = await call('POST', '/campus-connect/requests', { profileId: cc.body.profiles[0].id, message: 'Hi!' }, token);
  assert.equal(reqd.status, 201);

  const school = await call('POST', '/auth/demo', { as: 'school' });
  assert.equal((await call('GET', '/schools/classes/10B/dashboard', null, token)).status, 403, 'students cannot see the dashboard');
  const dash = await call('GET', '/schools/classes/10B/dashboard', null, school.body.token);
  assert.ok(dash.body.totalStudents >= 30);
  assert.ok(dash.body.needsConversation.some((s) => s.id === id), 'real student with a parent mismatch is flagged');
});

test('demo accounts', async () => {
  const a = await call('POST', '/auth/demo', { as: 'student-finished' });
  const me = await call('GET', '/auth/me', null, a.body.token);
  assert.equal(me.body.student.progress.missionsDone, 3);
  const r = await call('GET', `/students/${me.body.student.id}/report`, null, a.body.token);
  assert.equal(r.body.statedVsRevealed.biggestSurprise.trait, 'Numbers');

  const live = await call('POST', '/auth/demo', { as: 'student' });
  const liveMe = await call('GET', '/auth/me', null, live.body.token);
  assert.equal(liveMe.body.student.progress.missionsDone, 0);
  assert.equal(liveMe.body.student.profile.name, 'Ananya');

  const p = await call('POST', '/auth/demo', { as: 'parent' });
  const pm = await call('GET', '/auth/me', null, p.body.token);
  assert.equal(pm.body.student.progress.missionsDone, 3);

  const t = a.body.token;
  assert.equal((await call('POST', `/students/${me.body.student.id}/missions/ux-designer/submit`, { answer: 'hi' }, t)).status, 400);
  assert.equal((await call('POST', `/students/${me.body.student.id}/missions/ux-designer/submit`, { answer: 'a long enough answer', image: 'data:text/plain;base64,aGk=' }, t)).status, 400);
});
