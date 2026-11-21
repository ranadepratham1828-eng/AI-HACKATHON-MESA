import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content, gameById } from '../src/content.js';
import {
  scoreGame, missionEngagement, fitScore, revealedTraits, statedVsRevealed, careerFits, streamFit, missionPicks,
} from '../src/logic/scoring.js';
import { ananyaData } from '../src/demo.js';
import { scriptedQuality } from '../src/logic/missions.js';
import { parseJSON } from '../src/ai/provider.js';

test('mcq games: right, slow, wrong', () => {
  const g = gameById('number-series');
  assert.equal(scoreGame(g, { answer: 1, ms: 5000 }), 1);
  assert.equal(scoreGame(g, { answer: 1, ms: 60000 }), 0.85);
  assert.equal(scoreGame(g, { answer: 0, ms: 5000 }), 0);
  assert.equal(scoreGame(g, null), null);
});

test('uses game counts unique ideas up to the target', () => {
  const g = gameById('bottle-uses');
  assert.equal(scoreGame(g, { answer: 'pot\nPot\nlamp\n\n' }), 0.25);
  assert.equal(scoreGame(g, { answer: Array.from({ length: 12 }, (_, i) => `idea ${i}`).join('\n') }), 1);
});

test('engagement rewards behaviour, not just answers', () => {
  const engaged = { status: 'done', enjoy: 5, quality: 3, bonusTaken: true, questions: [1, 2, 3], timeMs: 5 * 60000 };
  const rushed = { status: 'done', enjoy: 2, quality: 3, bonusTaken: false, questions: [], timeMs: 60000 };
  assert.ok(missionEngagement(engaged) > missionEngagement(rushed));
  assert.equal(missionEngagement({ status: 'in_progress' }), null);
  assert.equal(fitScore(0), 35);
  assert.equal(fitScore(1), 97);
});

test('Ananya demo missions (career simulations, kept for later)', () => {
  const ananya = ananyaData('finished');
  const fits = careerFits(ananya, content);
  assert.equal(fits[0].career, 'UX Designer');
  const fp = revealedTraits(ananya, content);
  for (const v of Object.values(fp)) if (v != null) assert.ok(v >= 1 && v <= 5);
  const svr = statedVsRevealed({ Numbers: 1 }, fp);
  assert.equal(svr.biggestSurprise.trait, 'Numbers');
  const stream = streamFit(ananya, content, fp, fits);
  assert.equal(stream.scores.length, 3);
  assert.ok(stream.note.includes('Any stream'));
});

test('untested traits stay null instead of guessing', () => {
  const fp = revealedTraits({ missions: {}, games: { scores: {} } }, content);
  assert.ok(Object.values(fp).every((v) => v === null));
});

test('mission picks follow the questionnaire', () => {
  const builder = { profile: { stated: { Building: 5, Creativity: 4, People: 1, Numbers: 2, Investigating: 2, Nature: 2 }, likes: ['Art'] }, missions: {} };
  assert.equal(missionPicks(builder, content)[0].missionId, 'architect');
  const numbers = { profile: { stated: { Numbers: 5, Investigating: 5, People: 1, Creativity: 1, Building: 1, Nature: 1 } }, missions: {} };
  assert.equal(missionPicks(numbers, content)[0].missionId, 'forensic-accountant');
});

test('scripted quality spots the forensic fraud', () => {
  const m = content.missions.find((x) => x.id === 'forensic-accountant');
  assert.ok(scriptedQuality(m, 'INV-2231 was paid twice to Ganesh Traders') >= 4);
  assert.ok(scriptedQuality(m, 'The rent looks too high to me honestly') <= 2);
});

test('parseJSON handles fences and extra text', () => {
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJSON('Sure! {"a":2} hope that helps'), { a: 2 });
  assert.throws(() => parseJSON('no json here'));
});
