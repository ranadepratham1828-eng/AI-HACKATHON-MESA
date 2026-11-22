// The words on the study plan: a short note and three tips. The AI writes them
// from the plan's facts; a scripted version is used when the AI isn't available.
import { content } from '../content.js';
import { askWithFallback, str, strList } from '../ai/ask.js';
import { daysBetween, fmt, todayIST } from './study.js';
import { memoryForPrompt } from './memory.js';

function facts(student, plan, today) {
  const next = plan.examDays.find((x) => x.date >= today);
  const weakest = [...plan.subjects].sort((a, b) => a.confidence - b.confidence)[0];
  const sources = plan.input.sources.map((id) => content.study.sources.find((s) => s.id === id)?.name).filter(Boolean);
  return { next, weakest, sources };
}

export function scriptedStudyNote(student, plan, today = todayIST()) {
  const { next, weakest, sources } = facts(student, plan, today);
  const name = student.profile?.name || 'You';
  const missingOfficial = content.study.sources.filter((s) => s.official && s.use === 'test' && !plan.input.sources.includes(s.id))[0];
  return {
    headline: next
      ? `${daysBetween(today, next.date)} days to ${next.title}. ${weakest ? `${weakest.name} gets the most time because you rated it lowest.` : ''}`.trim()
      : `${name}, here is your study plan for the next eight weeks.`,
    tips: [
      'Start each revision session with the book closed. Recalling is harder than rereading, and that is why it works.',
      weakest ? `Do ${weakest.name} early in the session, when your focus is freshest.` : 'Do your hardest subject first in each session.',
      missingOfficial ? `Add ${missingOfficial.name}: they're free, and timed papers are the best preparation for the final weeks.` : `Keep using ${sources[0] || 'the NCERT textbooks'} for new chapters, and mark every question you get wrong.`,
    ],
  };
}

export async function studyNote(student, plan, today = todayIST()) {
  const { next, weakest, sources } = facts(student, plan, today);
  const p = student.profile || {};
  const prompt = `You are Dishaa's study coach for an Indian student in Class ${p.cls || '10'}. Write in simple, warm English a 15-year-old understands. Never invent dates or numbers.
Facts:
- Student: ${p.name || 'Student'}.
- Next exam: ${next ? `${next.title} on ${fmt(next.date)} (${daysBetween(today, next.date)} days away)${next.estimated ? ', date expected, not confirmed' : ''}` : 'none set'}.
- Subjects and confidence (1 low to 5 high): ${plan.subjects.map((s) => `${s.name} ${s.confidence}/5, ${s.toLearnCount} chapters still to learn, first paper ${fmt(s.deadline)}`).join('; ')}.
- Weakest subject: ${weakest?.name || 'none'}.
- Study time: ${plan.input.weekdayHours} hours on school days, ${plan.input.weekendHours} on weekends.
- Study sources they use: ${sources.join(', ') || 'not given'}${plan.input.sourcesOther ? `, ${plan.input.sourcesOther}` : ''}.
- The plan already uses spaced revision (1, 3, 7, 14 days), recall-first revision, timed papers in the last two weeks and mixed subjects each day.
- Warnings: ${plan.warnings.join(' ') || 'none'}.
${memoryForPrompt(student)}
Return JSON: {"headline": "one sentence, max 25 words, naming the next exam and the main focus", "tips": ["three specific tips, each max 25 words, using their subjects and sources"]}`;
  return askWithFallback({
    label: 'study-note',
    prompt,
    timeoutMs: 20000,
    validate: (o) => {
      const headline = str(o?.headline, 220);
      const tips = strList(o?.tips, 3, 220);
      return headline && tips.length >= 2 ? { headline, tips } : null;
    },
    fallback: () => scriptedStudyNote(student, plan, today),
  });
}
