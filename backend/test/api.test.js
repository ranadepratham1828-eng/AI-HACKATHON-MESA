// End-to-end API test with no AI key: everything must still work on scripted answers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.AI_PROVIDER = 'none';
process.env.ADMIN_KEY = 'test-admin-key';
process.env.DEMO_EMAIL = 'demo@example.com';
process.env.DEMO_PASSWORD = 'demo-pass';
delete process.env.RESEND_API_KEY;
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

// Accounts are created by an admin (paid model); returns a logged-in session.
const ADMIN = { 'x-admin-key': 'test-admin-key' };
const adminCall = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...ADMIN }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};
async function account(spec) {
  const r = await adminCall('POST', '/admin/accounts', { ...spec, sendEmail: false });
  const out = r.body.results[0];
  assert.equal(out.status, 'created', JSON.stringify(out));
  const login = await call('POST', '/auth/login', { email: spec.email, password: out.password });
  assert.equal(login.status, 200);
  return { token: login.body.token, user: login.body.user, password: out.password };
}

test('no public sign-up; admin creates accounts with emailed (or shown) logins', async () => {
  assert.equal((await call('POST', '/auth/signup', { role: 'student', name: 'X', email: 'x@example.com', password: '123456' })).status, 404);
  assert.equal((await call('POST', '/admin/accounts', { role: 'student', name: 'X', email: 'x@example.com' })).status, 401, 'needs the admin key');

  const bulk = await adminCall('POST', '/admin/accounts', { accounts: [
    { role: 'student', name: 'Kiran', email: 'Kiran@Example.com', cls: '12' },
    { role: 'student', name: 'Bad', email: 'nope' },
    { role: 'student', name: 'Dup', email: 'kiran@example.com' },
  ] });
  assert.deepEqual(bulk.body.results.map((r) => r.status), ['created', 'error', 'exists']);
  const kiran = bulk.body.results[0];
  assert.equal(kiran.emailed, false, 'email not configured in tests');
  assert.ok(kiran.password.length >= 10, 'temporary password shown to admin when not emailed');

  assert.equal((await call('POST', '/auth/login', { email: 'kiran@example.com', password: 'wrong!' })).status, 401);
  const login = await call('POST', '/auth/login', { email: 'kiran@example.com', password: kiran.password });
  assert.equal(login.body.user.hash, undefined, 'password hash must not leak');
  assert.equal(login.body.user.mustChangePassword, true);
  const t = login.body.token;
  assert.equal((await call('POST', '/auth/password', { current: 'wrong', next: 'newpassword1' }, t)).status, 400);
  assert.equal((await call('POST', '/auth/password', { current: kiran.password, next: 'short' }, t)).status, 400);
  const changed = await call('POST', '/auth/password', { current: kiran.password, next: 'newpassword1' }, t);
  assert.equal(changed.body.user.mustChangePassword, false);
  const me = await call('GET', '/auth/me', null, (await call('POST', '/auth/login', { email: 'kiran@example.com', password: 'newpassword1' })).body.token);
  assert.equal(me.body.student.profile.cls, '12');

  const other = await account({ role: 'student', name: 'Other', email: 'other@example.com' });
  assert.equal((await call('GET', `/students/${me.body.student.id}`)).status, 401);
  assert.equal((await call('GET', `/students/${me.body.student.id}`, null, other.token)).status, 403);

  const parent = await account({ role: 'parent', name: 'Mom', email: 'mom@example.com', childEmail: 'kiran@example.com' });
  assert.equal((await call('GET', `/students/${me.body.student.id}`, null, parent.token)).status, 200);
  assert.equal((await call('PATCH', `/students/${me.body.student.id}`, { city: 'Pune' }, parent.token)).status, 403, 'parents cannot edit');
  const noChild = await adminCall('POST', '/admin/accounts', { role: 'parent', name: 'D', email: 'd@example.com', familyCode: 'ZZZZZZ', sendEmail: false });
  assert.equal(noChild.body.results[0].status, 'error');

  const reset = await adminCall('POST', `/admin/accounts/${other.user.id}/reset`);
  assert.ok(reset.body.password);
  assert.equal((await call('POST', '/auth/login', { email: 'other@example.com', password: reset.body.password })).status, 200);
  const users = await adminCall('GET', '/admin/accounts');
  assert.ok(users.body.users.some((u) => u.email === 'kiran@example.com' && !u.hash));

  await call('POST', '/auth/logout', null, t);
  assert.equal((await call('GET', '/auth/me', null, t)).status, 401);
});

test('shared demo account: one-click login and email + password', async () => {
  const one = await call('POST', '/auth/demo-login');
  assert.equal(one.status, 200);
  const me = await call('GET', '/auth/me', null, one.body.token);
  assert.equal(me.body.student.progress.questDone, true, 'demo account has a finished assessment');
  const two = await call('POST', '/auth/login', { email: 'Demo@Example.com', password: 'demo-pass' });
  assert.equal(two.status, 200);
  assert.equal(two.body.user.studentId, one.body.user.studentId, 'same account every time');
  assert.equal((await call('POST', '/auth/password', { current: 'demo-pass', next: 'something-new' }, two.body.token)).status, 403, 'demo password stays fixed');
});

test('landing page leads', async () => {
  assert.equal((await call('POST', '/leads', { name: 'Ms Rao', email: 'bad' })).status, 400);
  assert.equal((await call('POST', '/leads', { name: 'Ms Rao', email: 'rao@school.example', role: 'school', organisation: 'Demo School', students: '300' })).status, 201);
  assert.equal((await call('POST', '/leads', { name: 'Bot', email: 'bot@x.example', website: 'spam' })).status, 201, 'honeypot is accepted silently');
  const leads = await adminCall('GET', '/admin/leads');
  assert.equal(leads.body.leads.length, 1);
  assert.equal(leads.body.leads[0].organisation, 'Demo School');
  assert.equal((await call('GET', '/admin/leads')).status, 401);
});

test('full student journey: quest, questionnaire, report, parent, school', async () => {
  const signup = await account({ role: 'student', name: 'Test', email: 'test@example.com', cls: '10' });
  const token = signup.token;
  const id = signup.user.studentId;

  const content = (await call('GET', '/content')).body;
  const items = content.assessment.zones.flatMap((z) => z.items);
  assert.equal(items.length, 27);
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
  assert.ok(report.body.careers.length >= 6);
  assert.equal(report.body.allCareers.length, 36);
  assert.ok(report.body.careers[0].pros.length && report.body.careers[0].cons.length && report.body.careers[0].salary, 'careers carry pros, cons and salary');
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

test('study planner: build, tick a session, report summary, calendar', async () => {
  const demo = await call('POST', '/auth/demo', { as: 'student-finished' });
  const me = await call('GET', '/auth/me', null, demo.body.token);
  const id = me.body.student.id;
  const existing = await call('GET', `/students/${id}/study`, null, demo.body.token);
  assert.equal(existing.body.exists, true, 'demo student has a study plan');
  const bad = await call('POST', `/students/${id}/study`, { subjects: [] }, demo.body.token);
  assert.equal(bad.status, 400);
  const built = await call('POST', `/students/${id}/study`, {
    exams: [{ presetId: 'cbse-10-2027' }], subjects: [{ name: 'Maths', confidence: 2, topics: ['Circles'] }], weekdayHours: 1, weekendHours: 2, sources: ['ncert'],
  }, demo.body.token);
  assert.equal(built.status, 200);
  assert.equal(built.body.note.source, 'scripted');
  assert.ok(built.body.sessions.length > 0);
  assert.ok(built.body.activities.recommended.length > 0);
  const sid = built.body.sessions.find((s) => s.date === built.body.today)?.id || built.body.sessions[0].id;
  const tick = await call('POST', `/students/${id}/study/done`, { id: sid }, demo.body.token);
  assert.equal(tick.body.done[sid], true);
  const report = await call('GET', `/students/${id}/report`, null, demo.body.token);
  assert.ok(report.body.study.hoursPerWeek > 0);
  const res = await fetch(`${base}/students/${id}/study/calendar.ics`, { headers: { Authorization: `Bearer ${demo.body.token}` } });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /BEGIN:VCALENDAR/);
});

test('coach memory: notes appear, and the student can delete them', async () => {
  const demo = await call('POST', '/auth/demo', { as: 'student-finished' });
  const id = (await call('GET', '/auth/me', null, demo.body.token)).body.student.id;
  const c = await call('POST', `/students/${id}/coach`, { message: "i'm worried my parents won't agree with design" }, demo.body.token);
  assert.ok(c.body.memory.notes.length >= 1);
  assert.ok(Array.isArray(c.body.options) && c.body.options.length > 0);
  const del = await call('DELETE', `/students/${id}/memory/${c.body.memory.notes[0].id}`, null, demo.body.token);
  assert.equal(del.body.notes.length, c.body.memory.notes.length - 1);
  const parent = await call('POST', '/auth/demo', { as: 'parent' });
  const denied = await call('GET', `/students/${id}/memory`, null, parent.body.token);
  assert.ok(denied.status === 403 || denied.status === 404, 'parents cannot read the memory');
});

test('parents log in with the family code; wrong codes are refused', async () => {
  const demo = await call('POST', '/auth/demo', { as: 'student-finished' });
  const me = await call('GET', '/auth/me', null, demo.body.token);
  const code = me.body.student.familyCode;
  const bad = await call('POST', '/auth/parent-code', { code: 'ZZZZZ9' });
  assert.equal(bad.status, 401);
  const ok = await call('POST', '/auth/parent-code', { code: code.toLowerCase(), name: 'Meena' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'parent');
  const pme = await call('GET', '/auth/me', null, ok.body.token);
  assert.equal(pme.body.student.id, me.body.student.id);
  const again = await call('POST', '/auth/parent-code', { code });
  assert.equal(again.body.user.id, ok.body.user.id, 'one parent account per student');
  const report = await call('GET', `/students/${me.body.student.id}/parent-report`, null, ok.body.token);
  assert.equal(report.status, 200);
});
