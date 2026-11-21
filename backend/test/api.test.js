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

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
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

test('full student journey: questionnaire, games, mission with photo, report, parent, school', async () => {
  const created = await call('POST', '/students', {
    name: 'Test', cls: '10', likes: ['Art'], dislikes: ['Maths'], parentExpect: 'Doctor',
    stated: { People: 3, Numbers: 1, Creativity: 4, Building: 2, Investigating: 2, Nature: 3 },
  });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const picks = await call('GET', `/students/${id}/mission-picks`);
  assert.equal(picks.body.picks.length, 4);

  const games = await call('POST', `/students/${id}/games`, { results: { 'number-series': { answer: 1, ms: 8000 }, 'bottle-uses': { answer: 'pot\nlamp\nfeeder' } } });
  assert.equal(games.body.feedback.length, 2);
  assert.equal(games.body.feedback[0].correct, true);

  await call('POST', `/students/${id}/missions/ux-designer/start`);
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const sub = await call('POST', `/students/${id}/missions/ux-designer/submit`, {
    answer: 'Put Send Money on the home screen, make the text big, and add Kannada.',
    image: `data:image/png;base64,${tinyPng}`,
  });
  assert.equal(sub.status, 200);
  assert.equal(sub.body.feedback.source, 'scripted');
  assert.ok(sub.body.feedback.twist);
  assert.ok(sub.body.feedback.imageComment);

  const tw = await call('POST', `/students/${id}/missions/ux-designer/twist`, { reply: 'Keep the big button' });
  assert.ok(tw.body.reaction.reaction);
  await call('POST', `/students/${id}/missions/ux-designer/bonus`, { answer: 'Your money is safe.' });
  const ask = await call('POST', `/students/${id}/missions/ux-designer/ask`, { question: 'Do I need coding?' });
  assert.equal(ask.body.questions.length, 1);
  const fin = await call('POST', `/students/${id}/missions/ux-designer/finish`, { enjoy: 5, timeMs: 300000 });
  assert.equal(fin.body.progress.missionsDone, 1);

  const report = await call('GET', `/students/${id}/report`);
  assert.equal(report.body.topMatch.career, 'UX Designer');
  assert.equal(report.body.narrative.strengths.length > 0, true);

  const rec = await call('GET', `/students/${id}/recommendations`);
  assert.equal(rec.body.careerPaths[0].colleges.length > 0, true);
  assert.ok(rec.body.careerPaths[0].pathway.afterDegree);

  const parent = await call('GET', `/students/${id}/parent-report?lang=kn`);
  assert.equal(parent.body.requestedLanguage, 'kn');
  assert.equal(parent.body.language, 'en', 'scripted fallback is English and must say so');

  const cc = await call('GET', '/campus-connect?missionId=ux-designer');
  assert.ok(cc.body.profiles.length >= 3);
  const reqd = await call('POST', '/campus-connect/requests', { studentId: id, profileId: cc.body.profiles[0].id, message: 'Hi!' });
  assert.equal(reqd.status, 201);

  const school = await call('GET', '/schools/classes/10B/dashboard');
  assert.equal(school.body.totalStudents, 30);
  assert.ok(school.body.needsConversation.some((s) => s.id === id), 'real student with a parent mismatch is flagged');
});

test('demo Ananya and input errors', async () => {
  const a = await call('POST', '/demo/ananya');
  assert.equal(a.body.progress.missionsDone, 3);
  const r = await call('GET', `/students/${a.body.id}/report`);
  assert.equal(r.body.statedVsRevealed.biggestSurprise.trait, 'Numbers');

  assert.equal((await call('GET', '/students/nope')).status, 404);
  assert.equal((await call('POST', `/students/${a.body.id}/missions/ux-designer/submit`, { answer: 'hi' })).status, 400);
  assert.equal((await call('POST', `/students/${a.body.id}/missions/ux-designer/submit`, { answer: 'a long enough answer', image: 'data:text/plain;base64,aGk=' })).status, 400);
});
