// Student memory: what the coach learns about a student from talking to them.
//
// Two layers of context reach every AI prompt:
//   1. What Dishaa measures (assessment, questionnaire, results). Always computed
//      fresh from the student record, never copied in here.
//   2. What the student has told us or shown in conversation: personality, how
//      they write, interests, dislikes, worries, family situation, constraints,
//      decisions and open questions. Stored here as short notes.
//
// Notes are updated after each coach message, by the AI when it's available
// and by simple rules when it isn't. Students are minors, so the student can
// see every note and delete any of them, or everything.
import { generate, aiEnabled } from '../ai/provider.js';

export const KINDS = {
  personality: 'Personality', style: 'How they talk', interest: 'Interests', dislike: 'Not keen on',
  concern: 'Worries', value: 'What matters to them', family: 'Family', constraint: 'Constraints',
  decision: 'Decisions', goal: 'Goals', question: 'Open questions', other: 'Other',
};
const MAX_NOTES = 40;
const id = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Never keep contact details or long numbers about a minor.
const unsafe = (t) => /\b\d{6,}\b|@[a-z0-9-]+\.[a-z]|https?:\/\//i.test(t);

export function memoryState(student) {
  student.memory ||= { notes: [], style: null, updatedAt: null };
  return student.memory;
}

/** What the student sees (and the API returns). */
export function memoryPublic(student) {
  const m = memoryState(student);
  return { notes: m.notes.map(({ id: nid, kind, text, source, at }) => ({ id: nid, kind, label: KINDS[kind] || KINDS.other, text, source, at })), style: m.style, updatedAt: m.updatedAt, kinds: KINDS };
}

/** The block every AI prompt gets. Empty string when there's nothing yet. */
export function memoryForPrompt(student) {
  const m = memoryState(student);
  if (!m.notes.length && !m.style) return '';
  const groups = {};
  m.notes.forEach((n) => { (groups[n.kind] ||= []).push(n.text); });
  const lines = Object.entries(groups).map(([k, texts]) => `- ${KINDS[k] || k}: ${texts.join('; ')}`);
  return `WHAT YOU REMEMBER ABOUT THIS STUDENT FROM EARLIER CONVERSATIONS (use it naturally; don't recite it back)
${m.style ? `- How they write, and how to talk back: ${m.style.text}\n` : ''}${lines.join('\n')}`;
}

function addNote(m, kind, text, source) {
  const t = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 160);
  if (!t || unsafe(t)) return false;
  const k = KINDS[kind] ? kind : 'other';
  const n = norm(t);
  if (m.notes.some((x) => { const xn = norm(x.text); return xn === n || xn.includes(n) || n.includes(xn); })) return false;
  m.notes.push({ id: id(), kind: k, text: t, source, at: new Date().toISOString() });
  return true;
}

/** Apply {add, update, remove, style} changes and keep the file small. */
export function applyMemoryOps(student, ops, source) {
  const m = memoryState(student);
  let changed = 0;
  for (const rid of Array.isArray(ops?.remove) ? ops.remove : []) {
    const before = m.notes.length; m.notes = m.notes.filter((x) => x.id !== rid); changed += before - m.notes.length;
  }
  for (const u of Array.isArray(ops?.update) ? ops.update : []) {
    const n = m.notes.find((x) => x.id === u?.id);
    const t = String(u?.text || '').trim().slice(0, 160);
    if (n && t && !unsafe(t)) { n.text = t; n.at = new Date().toISOString(); n.source = source; changed += 1; }
  }
  for (const a of Array.isArray(ops?.add) ? ops.add.slice(0, 6) : []) if (addNote(m, a?.kind, a?.text, source)) changed += 1;
  if (typeof ops?.style === 'string' && ops.style.trim() && ops.style !== 'null') { m.style = { text: ops.style.trim().slice(0, 240), source }; changed += 1; }
  if (m.notes.length > MAX_NOTES) m.notes = m.notes.slice(-MAX_NOTES); // keep the most recent
  if (changed) m.updatedAt = new Date().toISOString();
  return changed;
}

// ---- Rule-based memory, used when the AI isn't available ----
const SHORTHAND = /\b(u|ur|r|smth|sth|pls|plz|idk|tmrw|tmr|gonna|wanna|lol|ok+|okk+|ya|yaa|bro|tbh|ngl|rn|thx|coz|cuz)\b/i;
const HINGLISH = /\b(hai|kya|nahi|nahin|accha|acha|yaar|bhai|kaise|mujhe|mera|meri|matlab|haan|bas|thoda)\b/i;
const sentences = (t) => String(t).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const clause = (s) => (s.length > 110 ? `${s.slice(0, 107)}…` : s);

export function ruleOps(student, message) {
  const add = [];
  for (const s of sentences(message)) {
    const l = s.toLowerCase();
    if (/(worried|worry|scared|afraid|nervous|anxious|stress|pressure|concern|fear|confus)/.test(l)) add.push({ kind: 'concern', text: `Said: "${clause(s)}"` });
    else if (/\b(parents?|mom|mum|mummy|dad|papa|father|mother|family|relatives?|uncle|aunt|sharma ji)\b/.test(l)) add.push({ kind: 'family', text: `Said about family: "${clause(s)}"` });
    else if (/(hate|don'?t like|do not like|dont like|boring|not interested|can'?t stand|not for me)/.test(l)) add.push({ kind: 'dislike', text: `Said: "${clause(s)}"` });
    else if (/\b(afford|fees|expensive|loan|scholarship|money is tight|budget)\b/.test(l)) add.push({ kind: 'constraint', text: `Said: "${clause(s)}"` });
    else if (/\b(i love|i enjoy|i like|i really like|my favourite|my favorite|fun|passion)\b/.test(l)) add.push({ kind: 'interest', text: `Said: "${clause(s)}"` });
  }
  // How they write, from their recent messages
  const msgs = (student.coach?.messages || []).filter((x) => x.role === 'user').map((x) => x.content).concat(message).slice(-8);
  const all = msgs.join(' ');
  const avg = Math.round(all.length / Math.max(1, msgs.length));
  const traits = [];
  if (avg < 40) traits.push('short messages'); else if (avg > 140) traits.push('long, detailed messages');
  if (msgs.length && msgs.filter((x) => x === x.toLowerCase()).length / msgs.length > 0.6) traits.push('mostly lowercase');
  if (SHORTHAND.test(all)) traits.push('texting shorthand (u, smth, idk)');
  if (HINGLISH.test(all)) traits.push('some Hindi words (Hinglish)');
  const style = traits.length ? `Writes casually: ${traits.join(', ')}. Reply in plain, friendly, short sentences; it's fine to be informal.` : null;
  return { add, style };
}

/** Update the memory from the student's latest message. AI when available, rules otherwise. */
export async function updateMemory(student, message, { timeoutMs = 9000 } = {}) {
  const m = memoryState(student);
  if (aiEnabled()) {
    const recent = (student.coach?.messages || []).slice(-6).map((x) => `${x.role === 'user' ? 'Student' : 'Coach'}: ${x.content}`).join('\n');
    const prompt = `You keep a private memory file about a student for their career coach. Decide what is worth remembering long-term from the student's latest message.
Remember: personality traits, how they communicate, interests, dislikes, worries and concerns, what matters to them, family situation and pressures, constraints (money, location), decisions, goals and open questions.
Rules:
- Only record what the student actually said or clearly showed. No guessing, no praise.
- Don't record test scores or questionnaire answers: the coach already has those.
- No contact details, addresses, phone numbers, or medical details.
- Each note under 20 words, third person, plain ("Worried their parents want engineering").
- Update or remove existing notes that are now wrong or out of date. If nothing new, return empty lists.
- kind is one of: ${Object.keys(KINDS).join(', ')}.

EXISTING NOTES
${m.notes.map((n) => `[${n.id}] (${n.kind}) ${n.text}`).join('\n') || '(none)'}
CURRENT STYLE NOTE: ${m.style?.text || '(none)'}

RECENT CONVERSATION
${recent || '(none)'}

LATEST STUDENT MESSAGE
${message}

Reply with only JSON:
{"add": [{"kind": "...", "text": "..."}], "update": [{"id": "...", "text": "..."}], "remove": ["id"], "style": "one sentence on how they write and how the coach should talk back to them, or null to keep the current one"}`;
    try {
      const ops = await generate({ prompt, temperature: 0.2, timeoutMs });
      return { changed: applyMemoryOps(student, ops, 'ai'), source: 'ai' };
    } catch (err) {
      console.warn(`[ai] memory update failed, using rules: ${err.message}`);
    }
  }
  return { changed: applyMemoryOps(student, ruleOps(student, message), 'rules'), source: 'rules' };
}

export function forgetNote(student, noteId) {
  const m = memoryState(student);
  m.notes = m.notes.filter((x) => x.id !== noteId);
  if (noteId === 'style') m.style = null;
  m.updatedAt = new Date().toISOString();
}

export function clearMemory(student) {
  student.memory = { notes: [], style: null, updatedAt: new Date().toISOString() };
}
