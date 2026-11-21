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

test('full student journey: quest, questionnaire, report, parent, school', async () => {
  const signup = await call('POST', '/auth/signup', { role: 'student', name: 'Test', email: 'test@example.com', password: 'secret1', cls: '10' });
  const token = signup.body.token;
  const id = signup.body.user.studentId;

  const content = (await call('GET', '/content')).body;
  const items = content.assessment.zones.flatMap((z) => z.items);
  assert.equal(items.length, 20);
  let last;
  for (const it of items) {
    const answer = it.type === 'memory' ? it.cells : it.type === 'uses' ? 'pot\nlamp\nfeeder' : 1;
    last = await call('POST', `/students/${id}/assessment/answers`, { itemId: it.id, answer, ms: 8000 }, token);
    assert.equal(last.status, 200, it.id);
  }
  assert.equal(last.body.complete, true);
  assert.equal(last.body.zone.done, true);
  assert.ok(last.body.zone.stars >= 0 && last.body.zone.stars <= 3);
  assert.equal((await call('POST', `/students/${id}/assessment/answers`, { itemId: 'nope', answer: 1 }, token)).status, 404);

  const q = await call('PATCH', `/students/${id}`, {
    likes: ['Art'], subjects: ['Maths', 'Science'], parentExpect: 'Doctor', interests: ['design', 'tech', 'bogus'],
    marks: { class9: 82, class10: '91.5', class12: 150 }, budget: '1-3l', familyIncome: 'under-2.5l', gender: 'female', board: 'CBSE', relocate: 'state',
    stated: { logical: 3, numerical: 1, verbal: 4, spatial: 3, memory: 4, critical: 2, creative: 4, social: 4 },
  }, token);
  assert.deepEqual(q.body.profile.interests, ['design', 'tech']);
  assert.deepEqual(q.body.profile.marks, { class9: 82, class10: 91.5 }, 'out-of-range marks are dropped');
  assert.equal(q.body.progress.questDone, true);
  assert.equal(q.body.progress.questionnaireDone, true);

  const report = await call('GET', `/students/${id}/report`, null, token);
  assert.equal(report.body.quest.complete, true);
  assert.equal(report.body.careers.length, 5);
  assert.equal(report.body.narrative.strengths.length, 3);
  assert.equal(report.body.narrativeSource, 'scripted');

  assert.ok(report.body.scholarships.some((x) => x.id === 'hdfc-parivartan-ecss'), 'low income + 91.5% matches HDFC ECSS');

  const coach0 = await call('GET', `/students/${id}/coach`, null, token);
  assert.equal(coach0.body.messages[0].role, 'assistant');
  const c1 = await call('POST', `/students/${id}/coach`, { message: 'I think I want to be a UX Designer' }, token);
  assert.equal(c1.body.goal, 'ux-designer');
  const c2 = await call('POST', `/students/${id}/coach`, { message: 'Being creative and helping people matters most' }, token);
  assert.equal(c2.body.readyForPlan, true);
  const plan = await call('POST', `/students/${id}/plan`, {}, token);
  assert.equal(plan.body.goal.name, 'UX Designer');
  assert.ok(plan.body.timeline.length >= 3);
  assert.ok(plan.body.colleges.length > 0);
  assert.equal((await call('GET', `/students/${id}/plan`, null, token)).body.goal.id, 'ux-designer');

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
  assert.ok(dash.body.completion.percent > 0);

  const restart = await call('POST', `/students/${id}/assessment/restart`, null, token);
  assert.equal(restart.body.progress.questAnswered, 0);
});

test('demo accounts', async () => {
  const a = await call('POST', '/auth/demo', { as: 'student-finished' });
  const me = await call('GET', '/auth/me', null, a.body.token);
  assert.equal(me.body.student.progress.missionsDone, 3);
  const r = await call('GET', `/students/${me.body.student.id}/report`, null, a.body.token);
  assert.equal(r.body.statedVsMeasured.biggestSurprise.ability, 'numerical');
  assert.equal(me.body.student.progress.questDone, true);

  const live = await call('POST', '/auth/demo', { as: 'student' });
  const liveMe = await call('GET', '/auth/me', null, live.body.token);
  assert.equal(liveMe.body.student.progress.questAnswered, 0);
  assert.equal(liveMe.body.student.profile.name, 'Ananya');

  const p = await call('POST', '/auth/demo', { as: 'parent' });
  const pm = await call('GET', '/auth/me', null, p.body.token);
  assert.equal(pm.body.student.progress.missionsDone, 3);

  const t = a.body.token;
  assert.equal((await call('POST', `/students/${me.body.student.id}/missions/ux-designer/submit`, { answer: 'hi' }, t)).status, 400);
  assert.equal((await call('POST', `/students/${me.body.student.id}/missions/ux-designer/submit`, { answer: 'a long enough answer', image: 'data:text/plain;base64,aGk=' }, t)).status, 400);
});
