// Counsellor Dashboard and "Needs a Conversation" list for one class.
// The class is filled with sample students (clearly marked) plus real Disha users in that class.
import { content } from '../content.js';
import { computeResults } from './report.js';

const SAMPLE_NAMES = [
  'Aarav', 'Diya', 'Ishaan', 'Kavya', 'Rohan', 'Saanvi', 'Arjun', 'Meghana', 'Kiran', 'Nikhil',
  'Pooja', 'Rahul', 'Sneha', 'Tanvi', 'Varun', 'Zoya', 'Harsh', 'Lakshmi', 'Manoj', 'Nisha',
  'Pranav', 'Riya', 'Shreya', 'Tejas', 'Uday', 'Yash', 'Fatima', 'Joseph', 'Divya',
];
const PARENT_HOPES = ['Doctor', 'Engineer', 'CA', 'Doctor', 'Engineer', null, null, 'IAS officer'];

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleStudents() {
  const rand = mulberry32(2026);
  const traits = content.traits.map((t) => t.id);
  const careers = content.missions.map((m) => m.career);
  return SAMPLE_NAMES.map((name, i) => {
    const explored = Math.floor(rand() * 6);
    const topTrait = explored ? traits[Math.floor(rand() * traits.length)] : null;
    const parentExpect = PARENT_HOPES[Math.floor(rand() * PARENT_HOPES.length)];
    const avgEnjoyment = explored ? Math.round((1.5 + rand() * 3.5) * 10) / 10 : null;
    const topCareer = explored ? careers[Math.floor(rand() * careers.length)] : null;
    return {
      id: `sample-${i + 1}`,
      name,
      sample: true,
      careersExplored: explored,
      topTrait,
      topCareer,
      parentExpect,
      avgEnjoyment,
      parentMismatch: Boolean(parentExpect && topCareer && rand() < 0.45),
    };
  });
}

function realStudentRow(student) {
  const c = computeResults(student);
  const enjoy = c.fits.map((f) => f.behaviour.enjoyment).filter(Boolean);
  const topCareer = c.topMatch?.career || null;
  const expect = student.profile?.parentExpect || null;
  return {
    id: student.id,
    name: student.profile?.name || 'New student',
    sample: false,
    careersExplored: c.missionsDone,
    topTrait: c.topTraits[0] || null,
    topCareer,
    parentExpect: expect,
    avgEnjoyment: enjoy.length ? Math.round((enjoy.reduce((a, b) => a + b, 0) / enjoy.length) * 10) / 10 : null,
    parentMismatch: Boolean(expect && topCareer && !topCareer.toLowerCase().includes(expect.toLowerCase())),
  };
}

function reasonsFor(s) {
  const reasons = [];
  if (s.careersExplored === 0) reasons.push("Hasn't tried any career yet");
  if (s.parentMismatch) reasons.push(`Big gap: parents expect ${s.parentExpect}, student leans ${s.topCareer}`);
  if (s.avgEnjoyment != null && s.avgEnjoyment < 2.5) reasons.push('Low enjoyment in every mission: may be disengaged');
  if (s.careersExplored > 0 && s.careersExplored < 3) reasons.push('Undecided: explored fewer than 3 careers');
  return reasons;
}

export function classDashboard(classId, realStudents) {
  const rows = [...realStudents.map(realStudentRow), ...sampleStudents()];
  const total = rows.length;
  const ready = rows.filter((s) => s.careersExplored >= 3).length;

  const heatmap = content.traits.map((t) => ({
    trait: t.id,
    students: rows.filter((s) => s.topTrait === t.id).length,
  })).sort((a, b) => b.students - a.students);

  const needsConversation = rows
    .map((s) => ({ ...s, reasons: reasonsFor(s) }))
    .filter((s) => s.reasons.length)
    .map((s) => ({
      ...s,
      priority: (s.parentMismatch ? 3 : 0) + (s.careersExplored === 0 ? 2 : 0) + (s.avgEnjoyment != null && s.avgEnjoyment < 2.5 ? 2 : 0) + (s.reasons.length > 1 ? 1 : 0),
    }))
    .sort((a, b) => b.priority - a.priority || Number(a.sample) - Number(b.sample));

  const mismatch = needsConversation.filter((s) => s.parentMismatch);
  const notStarted = rows.filter((s) => s.careersExplored === 0);
  const topInterest = heatmap[0];

  return {
    classId,
    className: `Class ${classId.replace(/(\d+)(\w)/, '$1-$2')}`,
    totalStudents: total,
    sampleStudents: rows.filter((s) => s.sample).length,
    readiness: { exploredAtLeast3: ready, percent: Math.round((ready / total) * 100) },
    interestHeatmap: heatmap,
    needsConversation,
    weeklyActions: [
      mismatch.length && `Call the parents of ${mismatch.slice(0, 3).map((s) => s.name).join(', ')}${mismatch.length > 3 ? ` and ${mismatch.length - 3} more` : ''}: their expectations differ from what the student showed.`,
      notStarted.length && `Nudge ${notStarted.length} students who haven't tried a mission yet; set a 20-minute slot in class.`,
      topInterest?.students && `Run a group session on ${topInterest.trait.toLowerCase()}-based careers for the ${topInterest.students} students who lean that way.`,
    ].filter(Boolean),
    students: rows,
  };
}
