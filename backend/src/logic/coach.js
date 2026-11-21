// Dishaa Coach: a chat that works out the student's goal, then builds a
// personalised career plan. Facts (colleges, fees, scholarships, exams) come
// only from our content files; the AI writes the conversation and the plan text.
import { content } from '../content.js';
import { generate, aiEnabled } from '../ai/provider.js';
import { computeResults } from './report.js';
import { matchScholarships } from './scholarships.js';

const VOICE = `You are Dishaa Coach, a warm, practical career counsellor for Indian students in Class 9-12 and their families.
Use simple English a 15-year-old understands. Be honest and encouraging. Never say a student can't do something.
Never invent numbers (fees, cutoffs, ranks, salaries, scholarship amounts, dates). Use only the facts given below; if something isn't given, say they should check the official website.`;

const careerById = (id) => content.careers.find((c) => c.id === id);
const labelOf = (id) => content.assessment.abilities.find((a) => a.id === id)?.label || id;
const BUDGET = Object.fromEntries(content.questionnaire.collegeBudgets.map((b) => [b.id, b.label]));
const RELOCATE = Object.fromEntries(content.questionnaire.relocate.map((r) => [r.id, r.label]));

function profileFacts(student, results) {
  const p = student.profile || {};
  const marks = Object.entries(p.marks || {}).map(([k, v]) => `${k.replace('class', 'Class ')}: ${v}%`).join(', ');
  return [
    `Student: ${p.name || 'Student'}, Class ${p.cls || '10'}, ${p.board || 'board not given'}, ${p.city || 'city not given'}.`,
    `Current subjects: ${(p.subjects || []).join(', ') || 'not given'}. Enjoys: ${(p.likes || []).join(', ') || 'not given'}.`,
    `Interests: ${(p.interests || []).map((i) => content.interests.find((x) => x.id === i)?.label || i).join(', ') || 'not given'}. Dream job: ${p.dream || 'not given'}.`,
    `Marks: ${marks || 'not given'}.`,
    `College budget: ${BUDGET[p.budget] || 'not given'}. Open to an education loan: ${p.openToLoan ? 'yes' : 'not said'}. Will study: ${RELOCATE[p.relocate] || 'not said'}.`,
    `Family hopes for: ${p.parentExpect || 'not given'}${p.parentReason ? ` (because ${p.parentReason})` : ''}.`,
    `Disha Quest abilities (0-100): ${results.quest.abilities.filter((a) => a.score != null).map((a) => `${a.label} ${a.score}`).join(', ')}.`,
    `Strengths: ${results.quest.strengths.map(labelOf).join(', ')}. Growth areas: ${results.quest.growth.map(labelOf).join(', ') || 'none'}.`,
    `Top career matches: ${results.careers.map((c) => `${c.name} (${c.fit}%)`).join(', ')}.`,
  ].join('\n');
}

function findCareerIn(text) {
  const t = String(text || '').toLowerCase();
  return content.careers.find((c) => t.includes(c.name.toLowerCase()) || t.includes(c.id.replace(/-/g, ' '))) || null;
}

export function coachState(student) {
  student.coach ||= { messages: [], goal: null, readyForPlan: false };
  if (!student.coach.messages.length) {
    const r = computeResults(student);
    const name = student.profile?.name || 'there';
    const tops = r.careers.slice(0, 3).map((c) => c.name);
    student.coach.messages.push({
      role: 'assistant',
      content: r.quest.answered
        ? `Hi ${name}! I'm your Dishaa Coach. I've looked at your Disha Quest results: your strongest areas are ${r.quest.strengths.map((id) => labelOf(id).toLowerCase()).join(', ')}. Your top career matches are ${tops.join(', ')}. Which of these feels closest to what you want, or is there another goal on your mind?`
        : `Hi ${name}! I'm your Dishaa Coach. Play Disha Quest first so I can see your strengths, then we'll find your goal together.`,
      at: new Date().toISOString(),
    });
  }
  return student.coach;
}

function scriptedReply(student, coach, message) {
  const userTurns = coach.messages.filter((m) => m.role === 'user').length;
  const found = findCareerIn(message);
  if (found) coach.goal = found.id;
  const goal = coach.goal ? careerById(coach.goal) : null;
  if (!goal) {
    return { reply: `That's helpful. To build a good plan I need one goal to aim for. Which career should we plan for? You can pick one of your matches or name any career, like ${content.careers.slice(0, 3).map((c) => c.name).join(', ')}.`, readyForPlan: false };
  }
  if (userTurns <= 2 && !coach.askedWhy) {
    coach.askedWhy = true;
    return { reply: `${goal.name} is a great choice. ${goal.summary} What matters most to you in your future job: earning well, helping people, being creative, or stability? And is there anything worrying you about this path?`, readyForPlan: false };
  }
  return { reply: `Thanks, I have what I need. I can now build your ${goal.name} plan: the stream and subjects, entrance exams, colleges that fit your budget, scholarships you may qualify for, and what to do in the next 30 days. Tap "Build my career plan" when you're ready.`, readyForPlan: true };
}

export async function coachReply(student, message) {
  const coach = coachState(student);
  coach.messages.push({ role: 'user', content: message, at: new Date().toISOString() });
  let out = null;
  let source = 'scripted';
  if (aiEnabled()) {
    const results = computeResults(student);
    const transcript = coach.messages.slice(-14).map((m) => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n');
    const prompt = `${VOICE}

FACTS ABOUT THE STUDENT
${profileFacts(student, results)}

CAREERS DISHAA KNOWS (use these names when possible): ${content.careers.map((c) => c.name).join(', ')}

CONVERSATION SO FAR
${transcript}

Your job in this chat: in a few short turns, help the student settle on ONE goal career (from their matches or their own idea) and understand what matters to them (money, impact, creativity, stability, location, family). Ask at most one or two questions per reply. Keep replies under 90 words. When you know their goal and priorities, tell them you can build their career plan.

Reply with only JSON:
{"reply": "your next message to the student",
 "goalCareer": "the career name they've chosen, or null if not decided yet",
 "readyForPlan": true or false}`;
    try {
      const o = await generate({ prompt, temperature: 0.6 });
      if (typeof o?.reply === 'string' && o.reply.trim()) {
        const goal = typeof o.goalCareer === 'string' ? findCareerIn(o.goalCareer) : null;
        if (goal) coach.goal = goal.id;
        else if (typeof o.goalCareer === 'string' && o.goalCareer.trim() && o.goalCareer !== 'null') coach.customGoal = o.goalCareer.trim().slice(0, 60);
        out = { reply: o.reply.trim().slice(0, 1200), readyForPlan: Boolean(o.readyForPlan) && Boolean(coach.goal || coach.customGoal) };
        source = 'ai';
      }
    } catch (err) {
      console.warn(`[ai] coach failed, using scripted reply: ${err.message}`);
    }
  }
  if (!out) out = scriptedReply(student, coach, message);
  coach.readyForPlan = out.readyForPlan;
  coach.messages.push({ role: 'assistant', content: out.reply, source, at: new Date().toISOString() });
  return coach;
}

/** The plan's facts: chosen career, pathway, colleges and scholarships from our data. */
function planFacts(student) {
  const results = computeResults(student);
  const goalId = student.coach?.goal || results.careers[0]?.id;
  const goal = careerById(goalId) || content.careers[0];
  const match = results.careers.find((c) => c.id === goal.id);
  const pathway = goal.missionId ? content.pathways[goal.missionId] : null;
  const colleges = goal.missionId ? content.colleges.filter((c) => c.careers.includes(goal.missionId)) : [];
  // Don't suggest category-based schemes when the student chose not to share their category.
  const scholarships = matchScholarships(student, [goal.id]).filter((s) => !s.missing.includes('category'));
  const backups = results.careers.filter((c) => c.id !== goal.id).slice(0, 3);
  return { results, goal, fit: match?.fit ?? null, pathway, colleges, scholarships, backups };
}

function scriptedPlan(student, f) {
  const cls = Number(student.profile?.cls) || 10;
  const g = f.goal;
  const timeline = [];
  if (cls <= 10) timeline.push({ when: `Class ${cls} (now)`, title: 'Build your base', actions: ['Do well in your board exams', `Choose ${g.stream} for Class 11`, 'Explore the career: talk to someone who works in it'] });
  if (cls <= 11) timeline.push({ when: 'Class 11', title: 'Start preparing', actions: [`Focus on ${(f.pathway?.subjects || ['your core subjects']).join(', ')}`, `Learn about ${g.exams[0]}`, 'Start a small project or portfolio related to the career'] });
  timeline.push({ when: 'Class 12', title: 'Entrance exams', actions: [`Register for ${g.exams.join(', ')} on time`, 'Take mock tests every month', 'Shortlist colleges and keep documents ready'] });
  timeline.push({ when: 'College', title: g.degrees[0], actions: ['Do internships from the second year', 'Build skills and a portfolio', 'Apply for scholarships every year'] });
  timeline.push({ when: 'After college', title: 'First job', actions: f.pathway?.afterDegree?.firstJobs || [`Start as a junior ${g.name.toLowerCase()}`] });
  return {
    summary: `A step-by-step plan to become a ${g.name}, based on your Disha Quest strengths and your answers.`,
    whyThisFits: `${g.summary} It matches your strengths in ${f.results.quest.strengths.map((id) => labelOf(id).toLowerCase()).join(', ')}.`,
    timeline,
    examPrep: g.exams.map((e) => ({ exam: e, when: 'Usually in Class 12; check the official site for dates', how: 'Learn the syllabus, practise past papers and take monthly mock tests' })),
    collegeAdvice: f.colleges.slice(0, 3).map((c, i) => ({ name: c.name, tier: i === 0 ? 'dream' : 'target', why: `${c.course} via ${c.entrance}` })),
    budgetAdvice: 'Compare total course cost with your budget, apply for every scholarship you may qualify for, and consider government colleges, which usually cost less.',
    next30Days: ['Read about a typical day in this career', `Find the official website for ${g.exams[0]} and note the dates`, 'Discuss this plan with your parents this weekend'],
  };
}

export async function buildPlan(student) {
  const f = planFacts(student);
  let narrative = null;
  let source = 'scripted';
  if (aiEnabled()) {
    const collegeFacts = f.colleges.map((c) => `- ${c.name} (${c.city}): ${c.course} via ${c.entrance}; fees ${c.feesNote || 'not known'}; cutoff ${c.cutoff || 'not known'}; NIRF ${c.nirfRank || 'n/a'}`).join('\n');
    const scholarshipFacts = f.scholarships.map((s) => `- ${s.name}: ${s.for}. ${s.amountNote}. ${s.status === 'likely' ? 'Likely eligible' : `Check eligibility (missing: ${s.missing.join(', ')})`}`).join('\n');
    const prompt = `${VOICE}

FACTS ABOUT THE STUDENT
${profileFacts(student, f.results)}

CHOSEN GOAL: ${f.goal.name}${student.coach?.customGoal ? ` (student's words: ${student.coach.customGoal})` : ''}
Career facts: ${f.goal.summary} Stream: ${f.goal.stream}. Degrees: ${f.goal.degrees.join('; ')}. Entrance exams: ${f.goal.exams.join('; ')}.
${f.pathway ? `Exam timeline (as reported, verify officially): ${f.pathway.examTimeline.join('; ')}. First jobs: ${f.pathway.afterDegree.firstJobs.join('; ')}.` : ''}
COLLEGES WE HAVE DATA FOR (only recommend from this list; if empty, recommend types of colleges, not names):
${collegeFacts || '(none)'}
SCHOLARSHIPS THAT MAY FIT (only mention these):
${scholarshipFacts || '(none)'}
CONVERSATION WITH THE STUDENT (their priorities):
${(student.coach?.messages || []).filter((m) => m.role === 'user').map((m) => `- ${m.content}`).join('\n') || '(none)'}

Build a personalised career plan from their current class until their first job. Tailor it to their marks, budget and whether they can relocate.

Reply with only JSON:
{"summary": "2 sentences",
 "whyThisFits": "2 sentences linking their abilities and interests to this career",
 "timeline": [{"when": "e.g. Class 10 (now)", "title": "short", "actions": ["3 concrete actions"]}],
 "examPrep": [{"exam": "name", "when": "when to take it (no exact dates)", "how": "one sentence"}],
 "collegeAdvice": [{"name": "college name from the list", "tier": "dream | target | safe", "why": "one sentence using their marks and budget"}],
 "budgetAdvice": "2-3 sentences using their budget and the scholarships above",
 "next30Days": ["action 1", "action 2", "action 3"]}
Give 4-6 timeline steps.`;
    try {
      const o = await generate({ prompt, temperature: 0.5, timeoutMs: 55000 });
      const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const findCollege = (name) => {
        const n = norm(name);
        return f.colleges.find((c) => norm(c.name) === n || norm(c.name).includes(n) || n.includes(norm(c.name)))
          || f.colleges.find((c) => norm(c.name).split(' ').filter((w) => w.length > 3).some((w) => n.includes(w) && !['institute', 'school', 'college', 'design', 'planning', 'architecture', 'university'].includes(w)));
      };
      if (o?.summary && Array.isArray(o.timeline) && o.timeline.length) {
        narrative = {
          summary: String(o.summary).slice(0, 600),
          whyThisFits: String(o.whyThisFits || '').slice(0, 600),
          timeline: o.timeline.slice(0, 7).map((t) => ({ when: String(t.when || ''), title: String(t.title || ''), actions: (t.actions || []).slice(0, 4).map(String) })),
          examPrep: (o.examPrep || []).slice(0, 4).map((e) => ({ exam: String(e.exam || ''), when: String(e.when || ''), how: String(e.how || '') })),
          collegeAdvice: (o.collegeAdvice || []).map((c) => ({ ...c, match: findCollege(c.name) })).filter((c) => c.match).slice(0, 4).map((c) => ({ name: c.match.name, tier: ['dream', 'target', 'safe'].includes(c.tier) ? c.tier : 'target', why: String(c.why || '') })),
          budgetAdvice: String(o.budgetAdvice || '').slice(0, 800),
          next30Days: (o.next30Days || []).slice(0, 4).map(String),
        };
        if (!narrative.collegeAdvice.length) narrative.collegeAdvice = scriptedPlan(student, f).collegeAdvice;
        source = 'ai';
      }
    } catch (err) {
      console.warn(`[ai] plan failed, using scripted plan: ${err.message}`);
    }
  }
  if (!narrative) narrative = scriptedPlan(student, f);
  return {
    goal: { id: f.goal.id, name: f.goal.name, fit: f.fit, summary: f.goal.summary, stream: f.goal.stream, degrees: f.goal.degrees, exams: f.goal.exams },
    ...narrative,
    pathway: f.pathway,
    colleges: f.colleges,
    scholarships: f.scholarships,
    backups: f.backups.map((b) => ({ id: b.id, name: b.name, fit: b.fit })),
    source,
    createdAt: new Date().toISOString(),
  };
}
