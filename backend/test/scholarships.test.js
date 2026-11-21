import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchScholarships } from '../src/logic/scholarships.js';

test('scholarships filter by income, gender, category and marks', () => {
  const ids = (p, careers = []) => matchScholarships({ profile: p }, careers).map((s) => `${s.id}:${s.status}`);
  const rich = ids({ familyIncome: 'over-8l', gender: 'male', category: 'General', marks: { class12: 95 } }, ['software-engineer']);
  assert.ok(!rich.some((x) => x.startsWith('hdfc')), 'income too high for HDFC ECSS');
  assert.ok(!rich.some((x) => x.startsWith('aicte-pragati')), 'Pragati is for girls');
  const girl = ids({ familyIncome: '4.5-8l', gender: 'female', category: 'General', marks: { class12: 90 } }, ['software-engineer']);
  assert.ok(girl.includes('aicte-pragati:likely'));
  const unknown = ids({}, ['architect']);
  assert.ok(unknown.includes('hdfc-parivartan-ecss:check'), 'missing info gives "check", not a rejection');
  assert.ok(!unknown.some((x) => x.startsWith('inspire-she')), 'INSPIRE needs a science course');
});
