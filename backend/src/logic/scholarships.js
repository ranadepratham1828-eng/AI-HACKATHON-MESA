// Match scholarships to a student's profile. Returns "likely" and "check"
// (missing info) matches; never promises eligibility.
import { content } from '../content.js';

const INCOME_MAX = { 'under-2.5l': 250000, '2.5-4.5l': 450000, '4.5-8l': 800000, 'over-8l': Infinity };
const TECHNICAL = new Set(['software-engineer', 'civil-engineer', 'robotics-engineer', 'data-scientist', 'architect', 'urban-planner']);
const SCIENCE = new Set(['data-scientist', 'environmental-scientist', 'doctor', 'psychologist']);

export function matchScholarships(student, careerIds = []) {
  const p = student.profile || {};
  const income = INCOME_MAX[p.familyIncome];
  const marks12 = Number(p.marks?.class12) || null;
  const latest = Number(p.marks?.class12 || p.marks?.class11 || p.marks?.class10 || p.marks?.class9) || null;
  const courseTypes = new Set([
    ...(careerIds.some((id) => TECHNICAL.has(id)) ? ['technical'] : []),
    ...(careerIds.some((id) => SCIENCE.has(id)) ? ['science'] : []),
  ]);

  return content.scholarships.map((s) => {
    const r = s.rules;
    const unknown = [];
    let fails = false;
    if (r.incomeMaxINR) {
      if (income == null) unknown.push('family income');
      else if (income > r.incomeMaxINR) fails = true;
    }
    if (r.gender) {
      if (!p.gender || p.gender === 'prefer-not') unknown.push('gender');
      else if (p.gender !== r.gender) fails = true;
    }
    if (r.categories) {
      if (!p.category || p.category === 'prefer-not') unknown.push('category');
      else if (!r.categories.includes(p.category)) fails = true;
    }
    if (r.minMarks12) {
      if (marks12 == null) unknown.push('Class 12 marks');
      else if (marks12 < r.minMarks12) fails = true;
    }
    if (r.minMarksLatest) {
      if (latest == null) unknown.push('latest marks');
      else if (latest < r.minMarksLatest) fails = true;
    }
    if (r.courseTypes && !r.courseTypes.some((t) => courseTypes.has(t))) fails = true;
    if (fails) return null;
    const { rules, ...rest } = s;
    return { ...rest, status: unknown.length ? 'check' : 'likely', missing: unknown };
  })
    .filter(Boolean)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'likely' ? -1 : 1));
}
