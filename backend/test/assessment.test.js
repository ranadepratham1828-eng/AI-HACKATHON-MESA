import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content, assessmentItemById, publicAssessment } from '../src/content.js';
import { scoreItem, scoreAssessment, statedVsMeasured, matchCareers, streamHint } from '../src/logic/assessment.js';
import { ananyaData } from '../src/demo.js';
import { computeResults, scriptedNarrative } from '../src/logic/report.js';

test('every quest item has a valid answer key', () => {
  for (const it of content.assessmentItems) {
    if (it.type === 'mcq') assert.ok(it.answer >= 0 && it.answer < it.options.length, it.id);
    if (it.type === 'rotate') assert.ok(it.answer >= 0 && it.answer < it.optionGrids.length, it.id);
    if (it.type === 'memory') assert.ok(it.cells.every(([r, c]) => r < it.size && c < it.size), it.id);
  }
  const pub = JSON.stringify(publicAssessment());
  assert.ok(!pub.includes('"answer"'), 'answers must not be sent to the app');
  assert.ok(!pub.includes('explanation'), 'explanations must not be sent to the app');
});

test('item scoring: mcq, rotate, memory, uses', () => {
  assert.equal(scoreItem(assessmentItemById('l1'), { answer: 1, ms: 5000 }), 1);
  assert.equal(scoreItem(assessmentItemById('l1'), { answer: 1, ms: 99000 }), 0.85);
  assert.equal(scoreItem(assessmentItemById('l1'), { answer: 0, ms: 5000 }), 0);
  assert.equal(scoreItem(assessmentItemById('s1'), { answer: 1 }), 1);
  const m1 = assessmentItemById('m1');
  assert.equal(scoreItem(m1, { answer: m1.cells }), 1);
  assert.equal(scoreItem(m1, { answer: [...m1.cells.slice(0, 4), [4, 4]] }), 0.6, '4 hits, 1 wrong out of 5');
  assert.equal(scoreItem(m1, { answer: [] }), 0);
  assert.equal(scoreItem(assessmentItemById('k1'), { answer: 'a\nb\nb\nc\nd' }), 0.5);
});

test('Ananya: strengths, surprise and careers make sense', () => {
  const ananya = ananyaData('finished');
  const q = scoreAssessment(ananya, content);
  assert.equal(q.complete, true);
  assert.ok(q.abilities.every((a) => a.score >= 0 && a.score <= 100));
  assert.ok(q.strengths.includes('verbal') && q.strengths.includes('social'));
  const svm = statedVsMeasured(ananya.profile.stated, q.abilities);
  assert.equal(svm.biggestSurprise.ability, 'numerical', 'she rated numbers 1/5 but did well');
  const careers = matchCareers(ananya, content, q.abilities);
  assert.equal(careers.length, content.careers.length);
  assert.ok(careers.slice(0, 5).some((c) => ['Psychologist', 'UX Designer', 'Teacher', 'Journalist', 'Doctor'].includes(c.name)));
  assert.ok(careers.every((c, i) => i === 0 || careers[i - 1].fit >= c.fit), 'sorted by fit');
  const hint = streamHint(careers.slice(0, 3));
  assert.ok(hint.suggestion);
  const n = scriptedNarrative(ananya, computeResults(ananya));
  assert.equal(n.strengths.length, 3);
  assert.ok(n.strengths.every((s) => s.evidence));
});

test('partial quest: only answered abilities get scores', () => {
  const q = scoreAssessment({ assessment: { answers: { l1: { answer: 1, ms: 1000 } } } }, content);
  assert.equal(q.complete, false);
  assert.equal(q.abilities.find((a) => a.id === 'logical').score, 100);
  assert.equal(q.abilities.find((a) => a.id === 'numerical').score, null);
});
