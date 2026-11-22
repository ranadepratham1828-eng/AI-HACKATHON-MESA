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
    `Careers the student is already considering: ${(p.considering || []).map((id) => careerById(id)?.name).filter(Boolean).join(', ') || (p.consideringOther ? '' : 'not sure yet')}${p.consideringOther ? ` (also: ${p.consideringOther})` : ''}. What matters most to them: ${(p.priorities || []).map((id) => content.priorities.find((x) => x.id === id)?.label).filter(Boolean).join(', ') || 'not given'}.`,
    `Aptitude assessment scores (0-100): ${results.quest.abilities.filter((a) => a.score != null).map((a) => `${a.label} ${a.score}`).join(', ')}.`,
    `Strengths: ${results.quest.strengths.map(labelOf).join(', ')}. Growth areas: ${results.quest.growth.map(labelOf).join(', ') || 'none'}.`,
    `Top career matches: ${results.careers.map((c) => `${c.name} (${c.fit}%; salary ${c.salary}; pros: ${c.pros.join('; ')}; cons: ${c.cons.join('; ')})`).join(' | ')}.`,
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
        ? `Hi ${name}! I'm your Dishaa Coach. I've looked at your aptitude assessment results: your strongest areas are ${r.quest.strengths.map((id) => labelOf(id).toLowerCase()).join(', ')}. Your top career matches are ${tops.join(', ')}. Which of these feels closest to what you want, or is there another goal on your mind?`
        : `Hi ${name}! I'm your Dishaa Coach. Complete the aptitude assessment first so I can see your strengths, then we'll find your goal together.`,
      at: new Date().toISOString(),
    });
  }
  return student.coach;
}

const GREETING = /^(hi+|hey+|hello+|hii+|yo|hola|namaste|good (morning|afternoon|evening)|sup|hlo|helo)[!. ]*$/i;
const UNSURE = /(not sure|unsure|idk|i don'?t know|dont know|no idea|confused|help|can'?t decide|cant decide|maybe|anything)/i;
const YES = /^(y|yes|yeah|yep|yup|sure|ok|okay|haan|ha|correct|right|sounds good|let'?s go|go ahead|do it)\b/i;
const ORDINALS = { first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2 };
const PREFS = [
  { key: 'a', words: /\b(a|people|help|helping|talk|teach|care)\b/i, label: 'working with people', interests: ['helping', 'health', 'law'] },
  { key: 'b', words: /\b(b|create|creative|design|art|draw|build|make)\b/i, label: 'creating and designing', interests: ['design', 'building'] },
  { key: 'c', words: /\b(c|number|numbers|logic|money|business|math|maths|data|tech|computer)\b/i, label: 'numbers, logic and technology', interests: ['tech', 'business', 'puzzles'] },
  { key: 'd', words: /\b(d|science|health|nature|environment|research|biology)\b/i, label: 'science, health and nature', interests: ['science', 'health', 'nature'] },
];

// Questions the rule-based coach can answer straight from our career data.
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const INTENTS = [
  { re: /\b(pros?|cons?|advantages?|disadvantages?|downsides?|good and bad|good things|bad things|benefits?|drawbacks?)\b/i,
    say: (c) => `Here's ${c.name} in India, honestly. Pros: ${c.pros.map(lc).join('; ')}. Cons: ${c.cons.map(lc).join('; ')}.` },
  { re: /\b(salary|salaries|pay|paid|earn|earning|income|money|package|lpa|ctc)\b/i,
    say: (c) => `${c.name}: early salary is ${lc(c.salary)}. Job demand in India: ${c.demand}.` },
  { re: /\b(exams?|entrance|jee|neet|cuet|clat|uceed|nid|nift|nata)\b/i,
    say: (c) => `For ${c.name}, the main entrance ${c.exams.length === 1 ? `exam is ${c.exams[0]}` : `exams are ${c.exams.join(', ')}`}. Your study planner can count down to ${c.exams.length === 1 ? 'it' : 'them'}.` },
  { re: /\b(colleges?|universit(y|ies)|institutes?|iit|nit|nid)\b/i,
    say: (c) => { const cs = c.missionId ? content.colleges.filter((x) => x.careers.includes(c.missionId)).map((x) => x.name).slice(0, 3) : [];
      return cs.length ? `Good colleges for ${c.name} include ${cs.join(', ')}. Your career plan shows fees, cutoffs and which fit your budget.` : `I don't have verified college data for ${c.name} yet. The degrees to look for are ${c.degrees.join('; ')}, and your career plan lists the entrance exams.`; } },
  { re: /\b(stream|subjects?|pcm|pcb|commerce|arts|humanities|after class 10|after 10th)\b/i,
    say: (c) => `For ${c.name}, the usual route after Class 10 is ${c.stream}. Then: ${c.degrees.join('; ')}.` },
  { re: /\b(degree|course|study what|what to study)\b/i,
    say: (c) => `To become a ${c.name}, the usual degrees are ${c.degrees.join('; ')}.` },
  { re: /\b(what (do|does) (they|a|an)|day in the life|what is|tell me about|explain)\b/i,
    say: (c) => `${c.name}: ${c.summary} Early salary is ${lc(c.salary)}, and demand in India is ${lc(c.demand)}.` },
];

/** Rule-based coach used when the AI is not connected. Never repeats itself. */
function scriptedReply(student, coach, message) {
  const results = computeResults(student);
  const tops = results.careers.slice(0, 3);
  const name = student.profile?.name || 'there';
  const msg = String(message || '').trim();
  const lower = msg.toLowerCase();
  const list = tops.map((c, i) => `${i + 1}) ${c.name}`).join(', ');

  // A question about a career (pros, salary, exams...): answer it from our data.
  const intent = INTENTS.find((x) => x.re.test(lower));
  if (intent && !msg.startsWith('__repeat__')) {
    const subj = findCareerIn(msg) || (coach.goal && careerById(coach.goal)) || careerById(tops[0]?.id);
    if (subj) {
      const fit = results.allCareers.find((c) => c.id === subj.id)?.fit;
      const next = coach.goal === subj.id
        ? (coach.readyForPlan ? ' Ask me anything else, or tap "Build my career plan".' : ' What matters most to you in a job: earning well, helping people, being creative, or stability?')
        : ` It's a ${fit}% match for you. Want to plan for ${subj.name}? Just say "${subj.name}".`;
      return { reply: intent.say(subj) + next, readyForPlan: Boolean(coach.readyForPlan) };
    }
  }
  const pickFromTops = () => {
    const n = lower.match(/^\s*([1-3])\b/);
    if (n) return tops[Number(n[1]) - 1] || null;
    for (const [w, i] of Object.entries(ORDINALS)) if (new RegExp(`\\b${w}\\b`).test(lower)) return tops[i] || null;
    return null;
  };

  // 1. Confirming a suggestion we made
  if (coach.suggested && YES.test(lower)) { coach.goal = coach.suggested; coach.suggested = null; }
  // 2. A number, an ordinal or a career name
  const picked = pickFromTops() || findCareerIn(msg);
  if (picked) { coach.goal = picked.id; coach.suggested = null; coach.awaitingPref = false; }

  const goal = coach.goal ? careerById(coach.goal) : null;
  if (!goal) {
    if (coach.awaitingPref) {
      const pref = PREFS.find((p) => p.words.test(lower));
      if (pref) {
        coach.awaitingPref = false;
        const suggestion = results.careers.find((c) => careerById(c.id).interests.some((i) => pref.interests.includes(i))) || tops[0];
        coach.suggested = suggestion.id;
        return { reply: `Since you enjoy ${pref.label}, I'd suggest ${suggestion.name} (${suggestion.fit}% match for you). ${careerById(suggestion.id).summary} Shall we plan for ${suggestion.name}? Reply "yes", or pick another: ${list}.`, readyForPlan: false };
      }
      return { reply: 'Just reply with a letter: (a) working with people, (b) creating and designing, (c) numbers, logic and technology, or (d) science, health and nature.', readyForPlan: false };
    }
    if (UNSURE.test(lower)) {
      coach.awaitingPref = true;
      return { reply: `That's completely normal, ${name}. Let's narrow it down. What do you enjoy most: (a) working with people, (b) creating and designing, (c) numbers, logic and technology, or (d) science, health and nature?`, readyForPlan: false };
    }
    if (GREETING.test(msg)) {
      return { reply: `Hi ${name}! Let's find the career to plan for. Your top matches are ${list}. Reply with a number or a career name, or say "not sure" and I'll help you choose.`, readyForPlan: false };
    }
    const options = [
      `I'd love to help with that. First, which career should we plan for? Your top matches are ${list}. Reply with a number, any career name, or "not sure".`,
      `Got it. To build your plan I need one goal. You can reply 1, 2 or 3 for ${list}, or name another career you're curious about.`,
      `Thanks, ${name}. If you're unsure, just say "not sure" and I'll ask you a quick question to help you choose. Otherwise pick one of ${list}.`,
    ];
    coach.nudge = ((coach.nudge ?? -1) + 1) % options.length;
    return { reply: options[coach.nudge], readyForPlan: false };
  }
  if (!coach.askedWhy) {
    coach.askedWhy = true;
    return { reply: `${goal.name} it is! ${goal.summary} One more question: what matters most to you in your future job: earning well, helping people, being creative, or stability? And is anything worrying you about this path?`, readyForPlan: false };
  }
  const ready = [
    `Thanks, I have what I need. I can now build your ${goal.name} plan: the stream and subjects, entrance exams, colleges that fit your budget, scholarships you may qualify for, and what to do in the next 30 days. Tap "Build my career plan" when you're ready.`,
    `You're all set for ${goal.name}. Tap "Build my career plan" on the right, or name a different career if you've changed your mind.`,
    `Whenever you're ready, tap "Build my career plan". If you'd like to compare, just type another career name.`,
  ];
  coach.readyNudge = ((coach.readyNudge ?? -1) + 1) % ready.length;
  return { reply: ready[coach.readyNudge], readyForPlan: true };
}

/** Quick replies shown under the chat. */
export function coachSuggestions(student) {
  const coach = student.coach || {};
  if (coach.goal) return coach.readyForPlan ? [] : ['Earning well', 'Helping people', 'Being creative', 'Stability'];
  if (coach.suggested) return ['Yes', ...computeResults(student).careers.slice(0, 3).map((c) => c.name)];
  if (coach.awaitingPref) return ['(a) People', '(b) Creating and designing', '(c) Numbers and tech', '(d) Science and health'];
  return [...computeResults(student).careers.slice(0, 3).map((c) => c.name), 'Not sure yet'];
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
      const o = await generate({ prompt, temperature: 0.6, timeoutMs: 20000 }); // keep chat snappy; fall back if the AI is slow
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
  const last = [...coach.messages].reverse().find((m) => m.role === 'assistant');
  if (last && last.content === out.reply) out = scriptedReply(student, coach, `__repeat__ ${message}`);
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
  if (student.profile?.relocate === 'abroad') timeline.splice(timeline.length - 1, 0, { when: 'Class 11-12', title: 'Prepare to study abroad', actions: ['Take an English test such as IELTS or TOEFL', 'Check if the SAT is needed for the countries you like', 'Build a portfolio or profile, and research scholarships for international students'] });
  timeline.push({ when: 'College', title: g.degrees[0], actions: ['Do internships from the second year', 'Build skills and a portfolio', 'Apply for scholarships every year'] });
  timeline.push({ when: 'After college', title: 'First job', actions: f.pathway?.afterDegree?.firstJobs || [`Start as a junior ${g.name.toLowerCase()}`] });
  return {
    summary: `A step-by-step plan to become a ${g.name}, based on your aptitude assessment and your answers.`,
    whyThisFits: `${g.summary} It matches your strengths in ${f.results.quest.strengths.map((id) => labelOf(id).toLowerCase()).join(', ')}.`,
    timeline,
    examPrep: g.exams.map((e) => ({ exam: e, when: 'Usually in Class 12; check the official site for dates', how: 'Learn the syllabus, practise past papers and take monthly mock tests' })),
    collegeAdvice: f.colleges.slice(0, 3).map((c, i) => ({ name: c.name, tier: i === 0 ? 'dream' : 'target', why: `${c.course} via ${c.entrance}` })),
    budgetAdvice: student.profile?.relocate === 'abroad'
      ? 'Studying abroad usually costs much more than in India, so compare total costs carefully, look for international scholarships and education loans, and keep strong Indian colleges as options too.'
      : 'Compare total course cost with your budget, apply for every scholarship you may qualify for, and consider government colleges, which usually cost less.',
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
Career facts: ${f.goal.summary} Stream: ${f.goal.stream}. Degrees: ${f.goal.degrees.join('; ')}. Entrance exams: ${f.goal.exams.join('; ')}. Typical early salary in India: ${f.goal.salary}. Pros: ${f.goal.pros.join('; ')}. Cons: ${f.goal.cons.join('; ')}. Job demand: ${f.goal.demand}.
${f.pathway ? `Exam timeline (as reported, verify officially): ${f.pathway.examTimeline.join('; ')}. First jobs: ${f.pathway.afterDegree.firstJobs.join('; ')}.` : ''}
COLLEGES WE HAVE DATA FOR (only recommend from this list; if empty, recommend types of colleges, not names):
${collegeFacts || '(none)'}
SCHOLARSHIPS THAT MAY FIT (only mention these):
${scholarshipFacts || '(none)'}
CONVERSATION WITH THE STUDENT (their priorities):
${(student.coach?.messages || []).filter((m) => m.role === 'user').map((m) => `- ${m.content}`).join('\n') || '(none)'}

Build a personalised career plan from their current class until their first job. Tailor it to their marks, budget and whether they can relocate.${student.profile?.relocate === 'abroad' ? `
The student is open to studying ABROAD as well as in India. Add timeline actions to prepare for that (for example English tests like IELTS or TOEFL, the SAT where relevant, a strong portfolio or profile, and applying in Class 12), mention abroad options and costs honestly in budgetAdvice (abroad is usually far more expensive; scholarships and loans matter), but do NOT name specific foreign universities, fees, ranks or deadlines.` : ''}

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
