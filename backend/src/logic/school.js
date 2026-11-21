// Counsellor dashboard for one class: Dishaa Quest completion, ability mix,
// and a ranked "needs a conversation" list. Sample students are clearly marked.
import { content } from '../content.js';
import { computeResults } from './report.js';

const SAMPLE_NAMES = [
  'Aarav', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Saanvi', 'Arjun', 'Meghana', 'Kiran', 'Nikhil',
  'Pooja', 'Rahul', 'Sneha', 'Tanvi', 'Varun', 'Zoya', 'Harsh', 'Lakshmi', 'Manoj', 'Nisha',
  'Pranav', 'Riya', 'Shreya', 'Tejas', 'Uday', 'Yash', 'Fatima', 'Joseph', 'Divya',
];
const PARENT_HOPES = ['Doctor', 'Software Engineer', 'Chartered Accountant', 'Doctor', null, null, 'Lawyer'];

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const abilityLabel = Object.fromEntries(content.assessment.abilities.map((a) => [a.id, a.label]));

function sampleStudents() {
  const rand = mulberry32(2026);
  const abilities = content.assessment.abilities.map((a) => a.id);
  const careers = content.careers.map((c) => c.name);
  return SAMPLE_NAMES.map((name, i) => {
    const questDone = rand() > 0.22;
    const topAbility = questDone ? abilities[Math.floor(rand() * abilities.length)] : null;
    const topCareer = questDone ? careers[Math.floor(rand() * careers.length)] : null;
    const parentExpect = PARENT_HOPES[Math.floor(rand() * PARENT_HOPES.length)];
    return {
      id: `sample-${i + 1}`,
      name,
      sample: true,
      questDone,
      accuracy: questDone ? Math.round(35 + rand() * 60) : null,
      topAbility,
      topAbilityLabel: topAbility ? abilityLabel[topAbility] : null,
      topCareer,
      parentExpect,
      parentMismatch: Boolean(parentExpect && topCareer && parentExpect !== topCareer && rand() < 0.6),
      interestsGiven: rand() > 0.25,
    };
  });
}

function realStudentRow(student) {
  const c = computeResults(student);
  const topCareers = c.careers.slice(0, 3).map((x) => x.name);
  const expect = student.profile?.parentExpect || null;
  const topAbility = c.quest.strengths[0] || null;
  return {
    id: student.id,
    name: student.profile?.name || 'New student',
    sample: false,
    questDone: c.quest.complete,
    accuracy: c.quest.answered ? c.quest.stats.accuracy : null,
    topAbility,
    topAbilityLabel: topAbility ? abilityLabel[topAbility] : null,
    topCareer: c.quest.answered ? topCareers[0] : null,
    parentExpect: expect,
    parentMismatch: Boolean(expect && c.quest.answered && !topCareers.some((n) => n.toLowerCase().includes(expect.toLowerCase()))),
    interestsGiven: Boolean(student.profile?.interests?.length),
  };
}

function reasonsFor(s) {
  const reasons = [];
  if (!s.questDone) reasons.push("Hasn't completed the assessment");
  if (s.parentMismatch) reasons.push(`Parents hope for ${s.parentExpect}; results point to ${s.topCareer}`);
  if (s.questDone && s.accuracy != null && s.accuracy < 45) reasons.push('Found the assessment hard overall: check in on study support');
  if (s.questDone && !s.interestsGiven) reasons.push("Hasn't shared interests yet");
  return reasons;
}

export function classDashboard(classId, realStudents) {
  const rows = [...realStudents.map(realStudentRow), ...sampleStudents()];
  const total = rows.length;
  const done = rows.filter((s) => s.questDone).length;

  const abilityMix = content.assessment.abilities.map((a) => ({
    ability: a.id,
    label: a.label,
    students: rows.filter((s) => s.topAbility === a.id).length,
  })).sort((a, b) => b.students - a.students);

  const needsConversation = rows
    .map((s) => ({ ...s, reasons: reasonsFor(s) }))
    .filter((s) => s.reasons.length)
    .map((s) => ({ ...s, priority: (s.parentMismatch ? 3 : 0) + (!s.questDone ? 2 : 0) + (s.accuracy != null && s.accuracy < 45 ? 2 : 0) + (s.reasons.length > 1 ? 1 : 0) }))
    .sort((a, b) => b.priority - a.priority || Number(a.sample) - Number(b.sample));

  const mismatch = needsConversation.filter((s) => s.parentMismatch);
  const notStarted = rows.filter((s) => !s.questDone);
  const top = abilityMix[0];

  return {
    classId,
    className: `Class ${classId.replace(/(\d+)(\w)/, '$1-$2')}`,
    totalStudents: total,
    sampleStudents: rows.filter((s) => s.sample).length,
    completion: { done, percent: Math.round((done / total) * 100) },
    abilityMix,
    needsConversation,
    weeklyActions: [
      mismatch.length && `Meet the parents of ${mismatch.slice(0, 3).map((s) => s.name).join(', ')}${mismatch.length > 3 ? ` and ${mismatch.length - 3} more` : ''}: their hopes differ from the results.`,
      notStarted.length && `Give ${notStarted.length} students a 15-minute slot in class to complete the aptitude assessment.`,
      top?.students && `Run a careers session for the ${top.students} students strongest in ${top.label.toLowerCase()}.`,
    ].filter(Boolean),
    students: rows,
  };
}
