// Study planner. Turns exam dates, subjects, confidence and free time into a
// day-by-day plan. Pure, deterministic maths (no AI), built on four study
// techniques with strong evidence (see content/study.json "techniques"):
//   - spaced revision: each chapter comes back 1, 3, 7 and 14 days after it's learned
//   - recall first: revision starts with the book closed
//   - timed papers in the last 14 days before each paper
//   - mixed subjects: back-to-back sessions switch subject
import { content } from '../content.js';

const DAY = 86400000;
export const BLOCK = 45; // minutes in one study session
const REVIEW_GAPS = [1, 3, 7, 14, 21];
const FINAL_DAYS = 14;
const MAX_DAYS = 200;
const BLOCKS_PER_CHAPTER = 2;

export const toDate = (s) => new Date(`${s}T00:00:00Z`);
export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
/** Today's date in India (YYYY-MM-DD). */
export const todayIST = (now = new Date()) => new Date(now.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
const isWeekend = (s) => [0, 6].includes(toDate(s).getUTCDay());
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const presetById = (id) => content.study.exams.find((e) => e.id === id);
const sourceById = (id) => content.study.sources.find((s) => s.id === id);
const clampNum = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
export const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(toDate(v).getTime());

/** Validate what the app sends. Unknown fields are dropped. */
export function cleanStudyInput(body = {}) {
  const str = (v, n = 80) => String(v ?? '').trim().slice(0, n);
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\n,]/)).map((x) => str(x, 80)).filter(Boolean);
  const exams = (Array.isArray(body.exams) ? body.exams : []).slice(0, 12).map((e) => {
    const preset = presetById(e?.presetId);
    if (preset) return { presetId: preset.id };
    const name = str(e?.name);
    if (!name || !isDate(e?.date)) return null;
    return { name, date: String(e.date), subjects: list(e.subjects).slice(0, 10) };
  }).filter(Boolean);
  const subjects = (Array.isArray(body.subjects) ? body.subjects : []).slice(0, 12).map((s) => {
    const name = str(s?.name, 60);
    if (!name) return null;
    return {
      name,
      confidence: clampNum(s.confidence, 1, 5, 3),
      topics: [...new Set(list(s.topics).map((t) => t.slice(0, 80)))].slice(0, 40),
      revisionOnly: Boolean(s.revisionOnly),
    };
  }).filter(Boolean);
  const slots = content.study.slots.map((x) => x.id);
  return {
    exams,
    subjects,
    weekdayHours: clampNum(body.weekdayHours, 0, 8, 2),
    weekendHours: clampNum(body.weekendHours, 0, 10, 4),
    slot: slots.includes(body.slot) ? body.slot : 'evening',
    sources: (Array.isArray(body.sources) ? body.sources : []).filter((id) => sourceById(id)).slice(0, 20),
    sourcesOther: str(body.sourcesOther, 120),
    activities: (Array.isArray(body.activities) ? body.activities : []).slice(0, 8)
      .map((a) => ({ name: str(a?.name, 60), hours: clampNum(a?.hours, 0, 20, 2) })).filter((a) => a.name),
  };
}

/** Exams with their dates resolved: presets from content, plus the student's own. */
export const shiftYears = (s, n) => (n ? `${Number(s.slice(0, 4)) + n}${s.slice(4)}` : s);
/** Years until a student in `cls` sits an exam meant for `classes` (e.g. Class 10 → UCEED in 2 years). */
export const yearsUntil = (preset, cls) => (preset.kind === 'entrance' && cls && Number(cls) < 12 && !preset.classes.includes(String(cls)) ? 12 - Number(cls) : 0);

export function resolveExams(input, cls) {
  return input.exams.map((e) => {
    const p = e.presetId ? presetById(e.presetId) : null;
    if (p) {
      const yrs = yearsUntil(p, cls);
      const year = Number(p.start.slice(0, 4)) + yrs;
      return {
        id: p.id, name: yrs ? p.name.replace(/20\d\d/, String(year)) : p.name, short: yrs ? `${p.short} ${year}` : p.short,
        kind: p.kind, date: shiftYears(p.start, yrs), end: shiftYears(p.end, yrs), estimated: p.estimated || yrs > 0, projected: yrs > 0,
        subjects: p.kind === 'board' ? [] : p.subjects || [], subjectDates: yrs ? {} : p.subjectDates || {},
        note: yrs ? `Expected in ${MONTHS_LONG[Number(p.start.slice(5, 7)) - 1]} ${year}, when you're in Class 12, based on this year's dates. Confirm closer to the time.` : p.note,
        source: p.source, reportedBy: p.reportedBy, lastChecked: p.lastChecked,
      };
    }
    return { id: `custom-${e.name}-${e.date}`, name: e.name, short: e.name, kind: 'custom', date: e.date, end: e.date, estimated: false, subjects: e.subjects, subjectDates: {} };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** The date of the paper for one subject in one exam, or null if that exam doesn't cover it. */
function paperDate(exam, subject) {
  const dated = Object.entries(exam.subjectDates).find(([name]) => same(name, subject));
  if (dated) return { date: dated[1], guessed: false };
  if (exam.kind === 'board' || exam.subjects.some((x) => same(x, subject))) {
    return { date: exam.date, guessed: exam.kind === 'board' && Object.keys(exam.subjectDates).length > 0 };
  }
  return null;
}

function pickSource(input, use, exam) {
  const chosen = input.sources.map(sourceById).filter(Boolean);
  const byUse = chosen.find((s) => s.use === use);
  if (byUse) return byUse.name;
  if (use === 'test') return exam && exam.kind === 'entrance' && /NTA|JEE|NEET|CUET/i.test(exam.name) ? 'NTA mock tests' : 'CBSE sample papers or previous years\' papers';
  if (use === 'revise') return chosen.find((s) => s.id === 'school-notes')?.name || 'your notes or the NCERT chapter';
  return chosen.find((s) => s.use === 'learn')?.name || 'the NCERT chapter';
}

/**
 * Build the whole plan from `input` (cleaned) starting on input.startDate.
 * Returns every session; callers slice what they need.
 */
export function buildStudyPlan(input, { cls } = {}) {
  const start = input.startDate || todayIST();
  // Exams more than MAX_DAYS away (e.g. UCEED for a Class 10 student) only get a countdown.
  const allExams = resolveExams(input, cls).filter((e) => e.end >= start);
  const exams = allExams.filter((e) => daysBetween(start, e.date) <= MAX_DAYS);
  const farExams = allExams.filter((e) => daysBetween(start, e.date) > MAX_DAYS);
  const lastExam = exams.reduce((m, e) => (e.end > m ? e.end : m), start);
  const end = exams.length ? (daysBetween(start, lastExam) > MAX_DAYS ? addDays(start, MAX_DAYS) : lastExam) : addDays(start, 55);

  // Subjects: deadline = their earliest paper on or after the start date.
  const syllabus = content.study.syllabus[String(cls || '')] || {};
  const subjects = input.subjects.map((s, idx) => {
    const papers = exams.map((e) => ({ exam: e, ...(paperDate(e, s.name) || {}) })).filter((x) => x.date && x.date >= start);
    papers.sort((a, b) => a.date.localeCompare(b.date));
    const first = papers[0] || null;
    const full = Object.entries(syllabus).find(([name]) => same(name, s.name))?.[1] || null;
    const toLearn = s.revisionOnly ? [] : s.topics.length ? s.topics : full ? [] : ['Next chapters'];
    const learned = full ? full.filter((t) => !toLearn.some((x) => same(x, t))) : ['earlier chapters'];
    return {
      idx, name: s.name, confidence: s.confidence, weight: 6 - s.confidence,
      deadline: first ? first.date : end, exam: first?.exam || null, dateGuessed: Boolean(first?.guessed),
      papers: papers.map((p) => ({ date: p.date, exam: p.exam.short || p.exam.name })),
      paperDates: [...new Set(papers.map((p) => p.date))],
      topics: [
        ...learned.map((name, i) => ({ name, learned: true, partsLeft: 0, nextReview: addDays(start, 1 + (i % 10) + (idx % 3)), reviews: 1 })),
        ...toLearn.map((name) => ({ name, learned: false, partsLeft: BLOCKS_PER_CHAPTER, nextReview: null, reviews: 0 })),
      ],
      toLearnCount: toLearn.length,
      learnFinishedOn: null,
    };
  });

  // All exam papers, for the calendar.
  const examDays = [];
  for (const e of exams) {
    const dated = Object.entries(e.subjectDates).filter(([subj, d]) => d >= start && input.subjects.some((x) => same(x.name, subj)));
    if (dated.length) dated.forEach(([subj, d]) => examDays.push({ date: d, title: `${e.short}: ${subj}`, exam: e.name, kind: e.kind, subject: subj, estimated: e.estimated }));
    if (!dated.length || e.kind === 'board') examDays.push({ date: e.date, title: e.kind === 'board' ? `${e.short} begin` : e.short, exam: e.name, kind: e.kind, subject: null, estimated: e.estimated, start: true });
    if (e.end !== e.date && e.kind !== 'board') examDays.push({ date: e.end, title: `${e.short} ends`, exam: e.name, kind: e.kind, subject: null, estimated: e.estimated });
  }
  for (const e of farExams) examDays.push({ date: e.date, title: e.short, exam: e.name, kind: e.kind, subject: null, estimated: e.estimated, far: true });
  examDays.sort((a, b) => a.date.localeCompare(b.date));
  const uniqExamDays = examDays.filter((x, i) => examDays.findIndex((y) => y.date === x.date && y.title === x.title) === i);

  const sessions = [];
  let lastSubject = null;
  let practiceTurn = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const minutes = (isWeekend(d) ? input.weekendHours : input.weekdayHours) * 60;
    let blocks = Math.floor(minutes / BLOCK);
    const papersToday = uniqExamDays.filter((x) => x.date === d);
    if (papersToday.length) blocks = Math.floor(blocks / 2);
    const today = [];
    const add = (s, kind, title, detail, mins = BLOCK) => { today.push({ id: `${d}#${today.length}`, date: d, subject: s?.name || null, kind, title, detail, minutes: mins }); };
    // A subject stays active until its last paper; dl = its next paper after today.
    const dl = (s) => s.paperDates.find((x) => x > d) || (s.paperDates.length ? null : addDays(end, 1));
    const active = subjects.filter((s) => dl(s));

    // 1. Day before a paper: light recall only, for that subject.
    for (const s of active.filter((x) => daysBetween(d, dl(x)) === 1)) {
      if (today.length >= blocks) break;
      add(s, 'recall', `${s.name}: light recall`, 'Go over key formulas, definitions and diagrams from memory. Sleep early.', 30);
    }
    // 2. Timed papers every third day in the final two weeks.
    for (const s of active.filter((x) => { const left = daysBetween(d, dl(x)); return left > 1 && left <= FINAL_DAYS && left % 3 === 0; })) {
      if (today.length + 2 > blocks) break;
      add(s, 'test', `${s.name}: timed paper`, `Full paper under exam timing from ${pickSource(input, 'test', s.exam)}, then mark it with the official scheme.`, BLOCK * 2);
      today.push({ ...today[today.length - 1], id: `${d}#${today.length}`, hidden: true });
    }
    // 3. Revision that's due, grouped by subject (up to 3 chapters per session).
    const due = active.flatMap((s) => s.topics.filter((t) => t.learned && t.nextReview && t.nextReview <= d).map((t) => ({ s, t })))
      .sort((a, b) => (a.t.reviews === 0 ? 0 : 1) - (b.t.reviews === 0 ? 0 : 1) || a.t.nextReview.localeCompare(b.t.nextReview) || b.s.weight - a.s.weight);
    const maxRevise = Math.max(1, Math.ceil(blocks / 2));
    let revised = 0;
    // 3a. Chapters first finished recently: one short recall session across subjects.
    const fresh = due.filter((x) => x.t.reviews === 0).slice(0, 4);
    if (fresh.length && today.length < blocks) {
      fresh.forEach(({ t }) => { t.reviews = 1; t.nextReview = addDays(d, REVIEW_GAPS[1]); });
      add(fresh[0].s, 'revise', `Quick recall: ${fresh.map((x) => `${x.t.name} (${x.s.name})`).join(', ')}`, 'Book closed: write the main ideas and formulas of each chapter from memory, then check what you missed.', 25);
      revised += 1;
    }
    due.splice(0, due.length, ...due.filter((x) => !fresh.includes(x)));
    for (const s of [...new Set(due.map((x) => x.s))]) {
      if (today.length >= blocks || revised >= maxRevise) break;
      if (today.some((x) => x.subject === s.name && x.kind === 'recall')) continue;
      const group = due.filter((x) => x.s === s).slice(0, 3);
      group.forEach(({ t }) => { t.reviews += 1; t.nextReview = addDays(d, REVIEW_GAPS[Math.min(t.reviews, REVIEW_GAPS.length - 1)]); });
      add(s, 'revise', `${s.name}: revise ${group.map((x) => x.t.name).join(', ')}`, `Book closed: write down what you remember, then check with ${pickSource(input, 'revise')} and fix the gaps.`);
      revised += 1;
    }
    // 4. New chapters, weakest and most urgent subject first, switching subject each session.
    while (today.length < blocks) {
      const candidates = active.filter((s) => s.topics.some((t) => !t.learned) && daysBetween(d, dl(s)) > 1)
        .map((s) => {
          const left = s.topics.filter((t) => !t.learned).reduce((a, t) => a + t.partsLeft, 0);
          const days = Math.max(1, daysBetween(d, dl(s)) - FINAL_DAYS);
          return { s, score: s.weight * (left / days) * (s.name === lastSubject ? 0.35 : 1) };
        })
        .sort((a, b) => b.score - a.score);
      if (!candidates.length) break;
      const s = candidates[0].s;
      const t = s.topics.find((x) => !x.learned);
      const part = BLOCKS_PER_CHAPTER - t.partsLeft + 1;
      t.partsLeft -= 1;
      if (t.partsLeft === 0) {
        t.learned = true; t.reviews = 0; t.nextReview = addDays(d, REVIEW_GAPS[0]);
        if (!s.topics.some((x) => !x.learned)) s.learnFinishedOn = d;
      }
      add(s, 'learn', `${s.name}: ${t.name}${BLOCKS_PER_CHAPTER > 1 ? ` (part ${part} of ${BLOCKS_PER_CHAPTER})` : ''}`,
        part === 1 ? `Study it from ${pickSource(input, 'learn')} and make short notes in your own words.` : 'Finish the chapter, then do the exercise questions without looking at the solutions.');
      lastSubject = s.name;
    }
    // 5. Spare time: mixed practice questions, weakest subject first, rotating.
    if (today.length < blocks && active.length) {
      const pool = [...active].sort((a, b) => b.weight - a.weight);
      while (today.length < blocks) {
        const s = pool[practiceTurn % pool.length];
        practiceTurn += 1;
        add(s, 'practice', `${s.name}: practice questions`, `Mixed questions from ${pickSource(input, 'practice')}. Mark the ones you got wrong to revise later.`);
        if (practiceTurn > 50 * pool.length) break;
      }
    }
    // Keep consecutive sessions on different subjects where possible.
    const visible = today.filter((x) => !x.hidden);
    for (let i = 1; i < visible.length; i++) {
      if (visible[i].subject && visible[i].subject === visible[i - 1].subject) {
        const j = visible.findIndex((x, k) => k > i && x.subject !== visible[i].subject && x.kind === visible[i].kind);
        if (j > 0) [visible[i], visible[j]] = [visible[j], visible[i]];
      }
    }
    visible.forEach((x, i) => { x.id = `${d}#${i}`; });
    sessions.push(...visible);
  }

  const warnings = subjects.filter((s) => s.topics.some((t) => !t.learned)).map((s) => {
    const parts = s.topics.filter((t) => !t.learned).reduce((a, t) => a + t.partsLeft, 0);
    return `${s.name}: ${Math.ceil(parts / BLOCKS_PER_CHAPTER)} chapter(s) don't fit before ${fmt(s.deadline)}. Add about ${Math.ceil((parts * BLOCK) / 60 / Math.max(1, daysBetween(start, s.deadline) / 7))} hour(s) a week, or mark chapters you've already finished.`;
  });
  subjects.forEach((s) => {
    const late = s.learnFinishedOn && s.deadline >= s.learnFinishedOn && daysBetween(s.learnFinishedOn, s.deadline) < FINAL_DAYS;
    if (late) warnings.push(`${s.name}: new chapters run until ${fmt(s.learnFinishedOn)}, leaving less than two weeks of revision before ${fmt(s.deadline)}.`);
  });

  return { input, start, end, exams: allExams.map((e) => ({ ...e, far: farExams.includes(e) })), examDays: uniqExamDays, subjects, sessions, warnings };
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmt = (s) => { const d = toDate(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

/** Week-by-week totals for the whole plan. */
export function weeksOf(plan) {
  const weeks = [];
  for (let w = plan.start; w <= plan.end; w = addDays(w, 7)) {
    const wEnd = addDays(w, 6);
    const ss = plan.sessions.filter((s) => s.date >= w && s.date <= wEnd);
    const bySubject = {};
    ss.forEach((s) => { if (s.subject) bySubject[s.subject] = (bySubject[s.subject] || 0) + s.minutes; });
    const kinds = {};
    ss.forEach((s) => { kinds[s.kind] = (kinds[s.kind] || 0) + 1; });
    const exams = plan.examDays.filter((x) => x.date >= w && x.date <= wEnd);
    const phase = exams.length ? 'Exams' : (kinds.test || kinds.recall) ? 'Final revision' : (kinds.learn || 0) >= (kinds.revise || 0) ? 'New chapters and revision' : 'Revision and practice';
    weeks.push({ start: w, end: wEnd, minutes: ss.reduce((a, s) => a + s.minutes, 0), bySubject, kinds, exams: exams.map((x) => x.title), phase });
  }
  return weeks;
}

/** Progress from the student's ticked sessions. */
export function progressOf(plan, done = {}, today = todayIST()) {
  const past = plan.sessions.filter((s) => s.date < today);
  const doneCount = past.filter((s) => done[s.id]).length;
  const wStart = addDays(today, -((toDate(today).getUTCDay() + 6) % 7)); // Monday
  const week = plan.sessions.filter((s) => s.date >= wStart && s.date <= addDays(wStart, 6));
  let streak = 0;
  const startDay = plan.sessions.some((s) => s.date === today && done[s.id]) ? today : addDays(today, -1);
  for (let d = startDay; d >= plan.start; d = addDays(d, -1)) {
    const day = plan.sessions.filter((s) => s.date === d);
    if (!day.length) continue;
    if (day.some((s) => done[s.id])) streak += 1; else break;
  }
  return {
    planned: past.length, done: doneCount, percent: past.length ? Math.round((doneCount / past.length) * 100) : null,
    week: { planned: week.length, done: week.filter((s) => done[s.id]).length, minutes: week.reduce((a, s) => a + s.minutes, 0) },
    streak,
  };
}

/** Activities that build the student's profile for their goal career, paused before big exams. */
export function recommendActivities({ cls, interests = [], careerId }, input, plan) {
  const career = content.careers.find((c) => c.id === careerId);
  const cat = career?.category;
  const mine = (input.activities || []).map((a) => a.name.toLowerCase());
  const scored = content.study.activities
    .filter((a) => !cls || a.classes.includes(String(cls)))
    .filter((a) => !mine.some((m) => a.name.toLowerCase().includes(m) || m.includes(a.name.toLowerCase().split(' ')[0])))
    .map((a, i) => ({ a, i, score: (cat && a.categories.includes(cat) ? (a.categories.length > 4 ? 1 : 3) : 0) + (a.categories[0] === cat ? 1 : 0) + a.interests.filter((x) => interests.includes(x)).length }))
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .slice(0, 4)
    .map(({ a }) => ({ ...a, fitsCareer: cat && a.categories.includes(cat) && a.categories.length <= 4 ? career.name : null }));
  const big = plan.exams.filter((e) => !e.far && (e.kind === 'board' || e.kind === 'entrance'));
  const pauses = big.map((e) => ({ from: addDays(e.date, -FINAL_DAYS), to: e.end, exam: e.short }));
  return { careerName: career?.name || null, recommended: scored, yours: input.activities || [], pauses };
}

/** Facts for the report and parent view. */
export function studySummary(student, today = todayIST()) {
  if (!student.study?.input) return null;
  const plan = buildStudyPlan(student.study.input, { cls: student.profile?.cls });
  const next = plan.examDays.find((x) => x.date >= today);
  const prog = progressOf(plan, student.study.done, today);
  const hoursPerWeek = Math.round(((student.study.input.weekdayHours * 5 + student.study.input.weekendHours * 2)) * 10) / 10;
  return {
    nextExam: next ? { title: next.title, date: next.date, daysLeft: daysBetween(today, next.date), estimated: next.estimated } : null,
    entrance: plan.examDays.filter((x) => x.kind === 'entrance' && x.date >= today && !/ ends$/.test(x.title)).slice(0, 3)
      .map((x) => ({ title: x.title, date: x.date, daysLeft: daysBetween(today, x.date), estimated: x.estimated })),
    hoursPerWeek,
    week: prog.week,
    streak: prog.streak,
    percent: prog.percent,
    todayCount: plan.sessions.filter((s) => s.date === today).length,
    activities: (student.study.activities || []).slice(0, 3),
    headline: student.study.note?.headline || null,
  };
}

/** iCalendar file: exams as all-day events, sessions from today for `days` days. */
export function toICS(plan, input, { today = todayIST(), days = 60, name = 'Student' } = {}) {
  const slot = content.study.slots.find((s) => s.id === input.slot) || content.study.slots[2];
  const [h0, m0] = slot.start.split(':').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dishaa//Study plan//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(`Dishaa study plan · ${name}`)}`];
  for (const e of plan.examDays) {
    const d = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:exam-${d}-${esc(e.title).replace(/\W/g, '')}@dishaa`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`,
      `SUMMARY:${esc(`${e.title}${e.estimated ? ' (expected date)' : ''}`)}`, 'END:VEVENT');
  }
  const until = addDays(today, days);
  for (const d of [...new Set(plan.sessions.filter((s) => s.date >= today && s.date <= until).map((s) => s.date))]) {
    let t = h0 * 60 + m0;
    for (const s of plan.sessions.filter((x) => x.date === d)) {
      const st = `${d.replace(/-/g, '')}T${pad(Math.floor(t / 60) % 24)}${pad(t % 60)}00`;
      const en = t + s.minutes;
      const et = `${d.replace(/-/g, '')}T${pad(Math.floor(en / 60) % 24)}${pad(en % 60)}00`;
      lines.push('BEGIN:VEVENT', `UID:${s.id.replace('#', '-')}@dishaa`, `DTSTAMP:${stamp}`, `DTSTART:${st}`, `DTEND:${et}`, `SUMMARY:${esc(s.title)}`, `DESCRIPTION:${esc(s.detail)}`, 'END:VEVENT');
      t = en + 10;
    }
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Clock times for sessions: each day starts at the student's usual time, 10-minute breaks between sessions. */
export function withTimes(sessions, input) {
  const slot = content.study.slots.find((x) => x.id === input.slot) || content.study.slots[2];
  const [h0, m0] = slot.start.split(':').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (mins) => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  const next = {};
  return sessions.map((x) => {
    const t = next[x.date] ?? h0 * 60 + m0;
    next[x.date] = t + x.minutes + 10;
    return { ...x, start: clock(t), end: clock(t + x.minutes) };
  });
}

