// Study planner maths: deterministic, no AI.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AI_PROVIDER = 'none';
const { buildStudyPlan, cleanStudyInput, progressOf, weeksOf, toICS, addDays, daysBetween } = await import('../src/logic/study.js');

const input = (extra = {}) => ({
  ...cleanStudyInput({
    exams: [{ presetId: 'cbse-10-2027' }, { name: 'Pre-boards', date: '2027-01-06', subjects: ['Maths', 'Science'] }],
    subjects: [
      { name: 'Maths', confidence: 1, topics: ['Circles', 'Statistics', 'Probability'] },
      { name: 'Science', confidence: 5, topics: ['Electricity'] },
      { name: 'English', confidence: 4, topics: [] },
    ],
    weekdayHours: 2, weekendHours: 4, sources: ['ncert', 'not-a-source'],
    ...extra,
  }),
  startDate: '2026-11-23',
});

test('input is cleaned: unknown sources dropped, bad exams dropped', () => {
  const i = cleanStudyInput({ exams: [{ name: 'No date' }, { presetId: 'nope' }], subjects: [{ name: '' }, { name: 'Maths', confidence: 9 }], sources: ['ncert', 'x'] });
  assert.equal(i.exams.length, 0);
  assert.deepEqual(i.subjects.map((s) => [s.name, s.confidence]), [['Maths', 5]]);
  assert.deepEqual(i.sources, ['ncert']);
});

test('plan is deterministic and respects daily study time', () => {
  const a = buildStudyPlan(input(), { cls: '10' });
  const b = buildStudyPlan(input(), { cls: '10' });
  assert.deepEqual(a.sessions, b.sessions);
  const monday = a.sessions.filter((s) => s.date === '2026-11-23');
  assert.ok(monday.reduce((m, s) => m + s.minutes, 0) <= 120);
  assert.equal(a.end, '2027-03-09'); // last day of the board exams
});

test('every chapter is learned, then revised 1 and 3 days later', () => {
  const p = buildStudyPlan(input(), { cls: '10' });
  for (const t of ['Circles', 'Statistics', 'Probability', 'Electricity']) {
    const learnDays = p.sessions.filter((s) => s.kind === 'learn' && s.title.includes(t)).map((s) => s.date);
    assert.equal(learnDays.length, 2, `${t} is studied in two parts`);
    const done = learnDays[1];
    const revisions = p.sessions.filter((s) => s.kind === 'revise' && s.title.includes(t)).map((s) => daysBetween(done, s.date));
    assert.ok(revisions.includes(1), `${t} revised the next day`);
    assert.ok(revisions.some((d) => d >= 3), `${t} revised again later`);
  }
});

test('weakest subject gets more time, and papers come before each exam', () => {
  const p = buildStudyPlan(input(), { cls: '10' });
  const mins = (name) => p.sessions.filter((s) => s.subject === name).reduce((m, s) => m + s.minutes, 0);
  assert.ok(mins('Maths') > mins('English'));
  const mathsTests = p.sessions.filter((s) => s.subject === 'Maths' && s.kind === 'test').map((s) => s.date);
  assert.ok(mathsTests.some((d) => d > '2027-01-06' && d < '2027-02-17'), 'timed Maths paper before the board paper');
  assert.ok(mathsTests.some((d) => d < '2027-01-06'), 'and before the pre-boards');
  const dayBefore = p.sessions.filter((s) => s.date === '2027-02-16' && s.subject === 'Maths');
  assert.deepEqual(dayBefore.map((s) => s.kind), ['recall']);
  assert.ok(p.examDays.some((x) => x.date === '2027-02-17' && x.subject === 'Maths'));
  assert.ok(!p.examDays.some((x) => x.subject === 'Hindi'), "papers the student doesn't take are left out");
});

test('progress, weeks and calendar export', () => {
  const p = buildStudyPlan(input(), { cls: '10' });
  const first = p.sessions.filter((s) => s.date === '2026-11-23');
  const done = Object.fromEntries(first.map((s) => [s.id, true]));
  const pr = progressOf(p, done, addDays('2026-11-23', 1));
  assert.equal(pr.done, first.length);
  assert.equal(pr.streak, 1);
  assert.ok(weeksOf(p).length >= 15);
  const ics = toICS(p, p.input, { today: '2026-11-23', days: 7 });
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270217/);
  assert.match(ics, /DTSTART:20261123T183000/);
});

test('entrance exams are projected to the year a younger student sits them', async () => {
  const { resolveExams } = await import('../src/logic/study.js');
  const [e] = resolveExams({ exams: [{ presetId: 'uceed-2027' }] }, '10');
  assert.equal(e.name, 'UCEED 2029');
  assert.equal(e.date, '2029-01-17');
  assert.equal(e.estimated, true);
  const [same] = resolveExams({ exams: [{ presetId: 'uceed-2027' }] }, '12');
  assert.equal(same.date, '2027-01-17');
  const p = buildStudyPlan({ ...input(), exams: [...input().exams, { presetId: 'uceed-2027' }] }, { cls: '10' });
  assert.equal(p.end, '2027-03-09', 'a far exam only gets a countdown');
  assert.ok(p.examDays.some((x) => x.title === 'UCEED 2029' && x.far));
});
