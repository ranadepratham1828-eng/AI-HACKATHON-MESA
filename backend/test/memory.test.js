// Student memory: rule-based notes, safety filters, and the student's control over them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.AI_PROVIDER = 'none';
const { updateMemory, memoryPublic, memoryForPrompt, applyMemoryOps, forgetNote, clearMemory } = await import('../src/logic/memory.js');

test('rules pick up worries, family and writing style', async () => {
  const st = { coach: { messages: [] } };
  await updateMemory(st, 'my parents want me to do engineering but i hate physics tbh');
  await updateMemory(st, "im scared design wont pay enough");
  const m = memoryPublic(st);
  assert.ok(m.notes.some((n) => n.kind === 'family'));
  assert.ok(m.notes.some((n) => n.kind === 'concern'));
  assert.match(m.style.text, /lowercase|shorthand/);
  assert.match(memoryForPrompt(st), /WHAT YOU REMEMBER/);
});

test('no duplicates, no contact details, capped size', () => {
  const st = {};
  applyMemoryOps(st, { add: [{ kind: 'interest', text: 'Loves sketching' }, { kind: 'interest', text: 'loves sketching!' }, { kind: 'other', text: 'Phone 9876543210' }] }, 'ai');
  assert.equal(memoryPublic(st).notes.length, 1);
  for (let i = 0; i < 60; i++) applyMemoryOps(st, { add: [{ kind: 'other', text: `Note number ${i} about something different ${'x'.repeat(i % 5)}` }] }, 'ai');
  assert.ok(memoryPublic(st).notes.length <= 40);
});

test('the student can forget a note or everything', () => {
  const st = {};
  applyMemoryOps(st, { add: [{ kind: 'concern', text: 'Worried about fees' }, { kind: 'value', text: 'Wants to help people' }], style: 'Writes formally' }, 'ai');
  const id = memoryPublic(st).notes[0].id;
  forgetNote(st, id);
  assert.equal(memoryPublic(st).notes.length, 1);
  forgetNote(st, 'style');
  assert.equal(memoryPublic(st).style, null);
  clearMemory(st);
  assert.equal(memoryPublic(st).notes.length, 0);
  assert.equal(memoryForPrompt(st), '');
});
