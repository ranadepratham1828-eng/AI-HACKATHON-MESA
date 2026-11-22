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

const uniq = (xs) => [...new Set(xs.filter(Boolean))];
const interestLabel = (id) => (content.interests.find((x) => x.id === id)?.label || id).toLowerCase();

// Words a student might type, mapped to our interest ids (stems, so "creating" and "designing" count).
const INTEREST_WORDS = [
  ['design', /\b(creat\w*|design\w*|art\b|arts\b|artist\w*|draw\w*|paint\w*|sketch\w*|fashion|aesthetic\w*)/i],
  ['tech', /\b(tech\w*|cod(e|ing)|program\w*|comput\w*|software|apps?\b|gam(e|es|ing)\b|ai\b|robot\w*|data)/i],
  ['health', /\b(health\w*|medic\w*|doctor\w*|hospital\w*|patient\w*|nurs\w*|biolog\w*|body|fitness)/i],
  ['nature', /\b(nature|environment\w*|animal\w*|plants?\b|outdoor\w*|climate|forest\w*|wildlife|earth|ocean\w*)/i],
  ['helping', /\b(help(ing)? (people|others)|people|teach\w*|car(e|ing) for|counsel\w*|social work|kids|children|volunteer\w*)/i],
  ['business', /\b(business\w*|money|financ\w*|market\w*|sell\w*|startup\w*|entrepreneur\w*|commerce)/i],
  ['science', /\b(scien\w*|research\w*|lab\b|experiment\w*|physics|chemistry|space)/i],
  ['building', /\b(build\w*|engineer\w*|machin\w*|construct\w*|mechanic\w*)/i],
  ['puzzles', /\b(puzzl\w*|logic\w*|maths?\b|mathematics|numbers?|problem.solv\w*)/i],
  ['writing', /\b(writ\w*|stor(y|ies)|journal\w*|media|reading|speak\w*)/i],
  ['law', /\b(law\b|laws\b|legal|justice|rights|argu\w*|debat\w*|government|politic\w*)/i],
];
const interestsIn = (text) => INTEREST_WORDS.filter(([, re]) => re.test(text)).map(([id]) => id);
const findCareersIn = (text) => {
  const t = String(text || '').toLowerCase();
  return content.careers.filter((c) => t.includes(c.name.toLowerCase()) || t.includes(c.id.replace(/-/g, ' ')) || t.includes(c.name.toLowerCase().replace(/ \(.*\)/, '')));
};

const PRIORITY_TEXT = {
  earning: ['pay', 'Pays well, and earning well matters to you', 'Lower early pay than you said you want'],
  security: ['stability', 'A stable job market, which you value', 'Less job security than you said you want'],
  balance: ['workLife', 'Good work-life balance, which you value', 'Long or irregular hours, and you value balance'],
  respect: ['prestige', 'Well respected, which matters to you', 'Less social prestige than you might want'],
};

/** Pros and cons of one career for THIS student: their measured abilities, interests, priorities, subjects and family. */
export function personalCase(student, results, careerId) {
  const c = careerById(careerId);
  if (!c) return null;
  const m = results.allCareers.find((x) => x.id === c.id);
  const p = student.profile || {};
  const score = Object.fromEntries(results.quest.abilities.map((a) => [a.id, a.score]));
  const weighted = Object.entries(c.abilities).sort((a, b) => b[1] - a[1]);
  const forYou = [];
  const watchOut = [];
  const strong = weighted.filter(([id]) => score[id] != null && score[id] >= 70).slice(0, 2).map(([id]) => `${labelOf(id).toLowerCase()} (${score[id]}/100)`);
  if (strong.length) forYou.push(`Uses your ${strong.join(' and ')}`);
  const weak = weighted.find(([id, w]) => w >= 2 && score[id] != null && score[id] < 60);
  if (weak) watchOut.push(`Leans on ${labelOf(weak[0]).toLowerCase()}, where you scored ${score[weak[0]]}/100 (very learnable with practice)`);
  const shared = c.interests.filter((i) => (p.interests || []).includes(i));
  if (shared.length) forYou.push(shared.length === 1 ? `Matches your interest in ${interestLabel(shared[0])}` : `Matches your interests: ${shared.map(interestLabel).join(', ')}`);
  for (const pr of p.priorities || []) {
    const t = PRIORITY_TEXT[pr];
    if (t) { const v = c[t[0]] ?? 3; if (v >= 4) forYou.push(t[1]); else if (v <= 2) watchOut.push(t[2]); }
    if (pr === 'helping' && String(c.riasec).includes('S')) forYou.push('Helping people is at the heart of the work, which you care about');
  }
  const subj = (p.subjects || []).join(' ');
  if (Number(p.cls) >= 11) {
    if (/PCB|Biology/.test(c.stream) && !/Biology/.test(subj)) watchOut.push("Usually needs Biology in Class 11-12, which isn't in your subjects");
    else if (/PCM|Maths/.test(c.stream) && !/Maths/.test(subj)) watchOut.push("Usually needs Maths in Class 11-12, which isn't in your subjects");
  }
  if (p.parentExpect && c.name.toLowerCase().includes(p.parentExpect.toLowerCase())) forYou.push('It is also what your family hopes for');
  if (forYou.length < 3 && c.pros[0]) forYou.push(c.pros[0]);
  if (c.cons[0]) watchOut.push(c.cons[0]);
  return {
    id: c.id, name: c.name, fit: m?.fit ?? null, considering: Boolean(m?.considering),
    forYou: uniq(forYou).slice(0, 3), watchOut: uniq(watchOut).slice(0, 3),
    route: `${c.stream} → ${c.degrees[0]}`, salary: c.salary, exams: c.exams,
  };
}

const caseText = (k) => `${k.name}${k.fit != null ? ` (${k.fit}% fit)` : ''}\n${k.forYou.map((x) => `+ ${x}`).join('\n')}\n${k.watchOut.map((x) => `− ${x}`).join('\n')}`;

function shortlistOf(student, results) {
  const coach = student.coach;
  if (!coach.shortlist?.length) coach.shortlist = uniq([...(student.profile?.considering || []), ...results.careers.map((c) => c.id)]).slice(0, 3);
  return coach.shortlist;
}

/** The careers being weighed in the chat, with this student's pros and cons. */
export function coachOptions(student) {
  const results = computeResults(student);
  coachState(student);
  return shortlistOf(student, results).map((id) => personalCase(student, results, id)).filter(Boolean);
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
        ? `Hi ${name}! I'm your Dishaa Coach. There's no rush here: let's look at your options properly before you choose. Your assessment shows you're strongest at ${r.quest.strengths.slice(0, 2).map((id) => labelOf(id).toLowerCase()).join(' and ')}, and careers like ${tops.join(', ')} fit you well. I've put what each would mean for you on the right. To start: what kind of work do you enjoy, or what are you curious about?`
        : `Hi ${name}! I'm your Dishaa Coach. Complete the aptitude assessment first so I can see your strengths, then we'll explore your options together.`,
      at: new Date().toISOString(),
    });
  }
  return student.coach;
}

const GREETING = /^(hi+|hey+|hello+|hii+|yo|hola|namaste|good (morning|afternoon|evening)|sup|hlo|helo)[!. ]*$/i;
const UNSURE = /(not sure|unsure|idk|i don'?t know|dont know|no idea|confused|can'?t decide|cant decide|anything)/i;
const YES = /^(y|yes+|yeah|yep|yup|sure|ok|okay|haan|ha|correct|right|sounds good|let'?s go|go ahead|do it)\b/i;
const PLAN_IT = /\b(plan for|build (my|the|a) plan|make (my|the|a) plan|let'?s plan|i('?m| am) (sure|going with|choosing)|i (choose|pick|want to be|wanna be|will go with|'ll go with)|go(ing)? with|lock (it )?in|decided|final answer)\b/i;
const COMPARE = /\b(compare|comparison|vs\.?|versus|difference|better (for me|option)|which (one|is better))\b/i;
const MORE = /\b(other (options|careers|ideas)|something else|more options|show me more|anything else|others)\b/i;
const ORDINALS = { first: 0, '1st': 0, one: 0, second: 1, '2nd': 1, two: 1, third: 2, '3rd': 2, three: 2 };

// Questions the rule-based coach can answer straight from our career data.
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const INTENTS = [
  { id: 'proscons', re: /\b(pros?|cons?|advantages?|disadvantages?|downsides?|good and bad|benefits?|drawbacks?|weigh)\b/i },
  { re: /\b(salary|salaries|pay|paid|earn|earning|income|package|lpa|ctc)\b/i,
    say: (c) => `${c.name}: early salary is ${lc(c.salary)}. Job demand in India: ${c.demand}.` },
  { re: /\b(exams?|entrance|jee|neet|cuet|clat|uceed|nid|nift|nata)\b/i,
    say: (c) => `For ${c.name}, the main entrance ${c.exams.length === 1 ? `exam is ${c.exams[0]}` : `exams are ${c.exams.join(', ')}`}. Your study planner can count down to ${c.exams.length === 1 ? 'it' : 'them'}.` },
  { re: /\b(colleges?|universit(y|ies)|institutes?|iit|nit)\b/i,
    say: (c) => { const cs = c.missionId ? content.colleges.filter((x) => x.careers.includes(c.missionId)).map((x) => x.name).slice(0, 3) : [];
      return cs.length ? `Good colleges for ${c.name} include ${cs.join(', ')}. Your career plan shows fees, cutoffs and which fit your budget.` : `I don't have verified college data for ${c.name} yet. The degrees to look for are ${c.degrees.join('; ')}.`; } },
  { re: /\b(stream|pcm|pcb|after class 10|after 10th)\b/i,
    say: (c) => `For ${c.name}, the usual route after Class 10 is ${c.stream}. Then: ${c.degrees.join('; ')}.` },
  { re: /\b(degree|course|what to study)\b/i,
    say: (c) => `To become a ${c.name}, the usual degrees are ${c.degrees.join('; ')}.` },
  { re: /\b(what (do|does) (they|a|an)|day in the life|what is (a|an)|tell me about|explain)\b/i,
    say: (c) => `${c.name}: ${c.summary} Early salary is ${lc(c.salary)}, and demand in India is ${lc(c.demand)}.` },
];

/** Rule-based coach used when the AI is unavailable. Explores and compares; never rushes a decision. */
function scriptedReply(student, coach, message) {
  const results = computeResults(student);
  const name = student.profile?.name || 'there';
  const msg = String(message || '').replace(/^__repeat__ /, '').trim();
  const repeat = String(message || '').startsWith('__repeat__');
  const lower = msg.toLowerCase();
  const short = shortlistOf(student, results);
  const pc = (id) => personalCase(student, results, id);
  const named = findCareersIn(msg);
  const n = lower.match(/^\s*([1-3])\b/);
  const ordinal = n ? Number(n[1]) - 1 : Object.entries(ORDINALS).find(([w]) => new RegExp(`\\b${w}\\b`).test(lower))?.[1];
  const byOrder = ordinal != null ? careerById(short[ordinal]) : null;
  const subject = named[0] || byOrder || (coach.focus && careerById(coach.focus)) || (coach.goal && careerById(coach.goal)) || careerById(short[0]);
  if (named[0] || byOrder) coach.focus = (named[0] || byOrder).id;

  // 1. Deciding: "plan for X", or "yes" to a career we were weighing
  if (PLAN_IT.test(lower) || (YES.test(lower) && coach.suggested)) {
    const g = named[0] || byOrder || (coach.suggested && careerById(coach.suggested)) || careerById(short[0]);
    if (g) {
      coach.goal = g.id; coach.suggested = null;
      coach.shortlist = uniq([g.id, ...short]).slice(0, 3);
      const k = pc(g.id);
      return { reply: `Good choice to plan for, ${name}. ${g.name} suits you because: ${k.forYou.map(lc).join('; ')}. The things to keep an eye on: ${k.watchOut.map(lc).join('; ')}. Tap "Build my career plan" and I'll lay out the stream, exams, colleges within your budget and scholarships. You can still ask me anything first.`, readyForPlan: true };
    }
  }
  // 1b. "yes" while a career is in focus: confirm what they're agreeing to
  if (YES.test(lower) && !coach.suggested && coach.focus && !coach.readyForPlan) {
    const f = careerById(coach.focus);
    coach.suggested = f.id;
    return { reply: `Sounds like ${f.name} appeals to you. Shall I build your plan for ${f.name}? Say "yes" again, or tell me what's still holding you back and we'll weigh it.`, readyForPlan: false };
  }
  // 2. Comparing careers
  if (COMPARE.test(lower)) {
    coach.suggested = null;
    const pair = uniq([...named.map((c) => c.id), ...short]).slice(0, 2);
    coach.shortlist = uniq([...pair, ...short]).slice(0, 3);
    return { reply: `Let's weigh them side by side, for you specifically:\n\n${pair.map((id) => caseText(pc(id))).join('\n\n')}\n\nWhich of these points matters most to you? That usually tells you more than the fit score.`, readyForPlan: Boolean(coach.readyForPlan) };
  }
  // 3. A question about a career (pros, salary, exams...)
  const intent = INTENTS.find((x) => x.re.test(lower));
  if (intent && subject && !repeat) {
    if (!short.includes(subject.id)) coach.shortlist = uniq([subject.id, ...short]).slice(0, 3);
    coach.suggested = null;
    const body = intent.id === 'proscons' ? `Here's ${subject.name}, weighed for you:\n${caseText(pc(subject.id)).split('\n').slice(1).join('\n')}\n\n` : `${intent.say(subject)} `;
    const next = coach.goal === subject.id && coach.readyForPlan ? 'Anything else you want to know before you build your plan?' : `Want to compare it with ${careerById(short.find((id) => id !== subject.id))?.name || 'another option'}, or ask something else?`;
    return { reply: body + next, readyForPlan: Boolean(coach.readyForPlan) };
  }
  // 4. Naming a career: weigh it against their best alternative, don't lock it in yet
  if (named.length || byOrder) {
    const c = named[0] || byOrder;
    coach.suggested = c.id;
    const alt = uniq([...short, ...results.careers.map((x) => x.id)]).find((id) => id !== c.id);
    coach.shortlist = uniq([c.id, alt, ...short]).slice(0, 3);
    return { reply: `${c.name} is worth a proper look. Here's what it would mean for you:\n${caseText(pc(c.id)).split('\n').slice(1).join('\n')}\n\nFor comparison, ${careerById(alt).name} (${pc(alt).fit}% fit) ${pc(alt).forYou[0] ? lc(pc(alt).forYou[0]) : 'also fits you well'}. What draws you to ${c.name}? When you feel sure, say "plan for ${c.name}".`, readyForPlan: false };
  }
  // 5. Describing interests: find careers that bring them together
  const ints = interestsIn(lower);
  if (ints.length) {
    // Greedy: each pick covers interests the earlier picks didn't, so a mixed answer gets a mixed shortlist.
    const pool = results.allCareers.map((c) => ({ id: c.id, fit: c.fit + (ints.includes(careerById(c.id).interests[0]) ? 25 : 0), ints: careerById(c.id).interests.filter((i) => ints.includes(i)) })).filter((x) => x.ints.length);
    const covered = new Set(); const pick = [];
    while (pick.length < 3 && pool.length) {
      pool.sort((a, b) => (b.ints.filter((i) => !covered.has(i)).length * 30 + b.ints.length * 10 + b.fit) - (a.ints.filter((i) => !covered.has(i)).length * 30 + a.ints.length * 10 + a.fit));
      const best = pool.shift(); pick.push(best.id); best.ints.forEach((i) => covered.add(i));
    }
    if (pick.length) {
      const keepGoal = coach.goal && coach.readyForPlan;
      coach.shortlist = keepGoal ? uniq([coach.goal, ...pick]).slice(0, 3) : pick; coach.suggested = null;
      if (keepGoal) {
        const g = careerById(coach.goal);
        return { reply: `Good to know: ${ints.map(interestLabel).join(', ')}. ${g.name} fits that: ${pc(g.id).forYou.map(lc).join('; ')}. If you'd like to explore alternatives, I'd also look at ${pick.filter((id) => id !== g.id).slice(0, 2).map((id) => careerById(id).name).join(' and ')}. Otherwise, tap "Build my career plan".`, readyForPlan: true };
      }
      return { reply: `I love that mix: ${ints.map(interestLabel).join(', ')}. Here are careers that bring those together, weighed for you:\n\n${pick.map((id, i) => `${i + 1}) ${caseText(pc(id))}`).join('\n\n')}\n\nWhich of these sounds most like you, and what puts you off the others?`, readyForPlan: false };
    }
  }
  // 6. More options
  if (MORE.test(lower)) {
    const fresh = results.allCareers.filter((c) => !short.includes(c.id)).slice(0, 3).map((c) => c.id);
    coach.shortlist = fresh; coach.suggested = null;
    return { reply: `Sure. A few more that fit you well:\n\n${fresh.map((id, i) => `${i + 1}) ${caseText(pc(id))}`).join('\n\n')}\n\nAny of these interesting? You can also tell me what you enjoy and I'll match careers to it.`, readyForPlan: false };
  }
  // 7. Unsure, greeting or anything else: open questions, never the same twice in a row
  const open = UNSURE.test(lower)
    ? [`That's completely normal, ${name}. Most people your age aren't sure yet. Tell me about a time you lost track of time doing something. Was it making things, solving problems, helping someone, or being outdoors?`]
    : GREETING.test(msg)
      ? [`Hi ${name}! Let's explore together. What do you enjoy doing, in school or outside it? Mention as many things as you like.`]
      : [
        `Tell me a bit more: what do you enjoy doing most, in school or outside? For example designing, building things, helping people, nature, numbers or writing. I'll match careers to it.`,
        `Here's how your current options compare:\n\n${short.map((id) => caseText(pc(id))).join('\n\n')}\n\nWhat do you like or dislike about these?`,
        `Another way in: what matters more to you in a job, earning well, helping people, being creative, or stability? That will change which of your options is best.`,
      ];
  coach.nudge = ((coach.nudge ?? -1) + 1) % open.length;
  return { reply: open[coach.nudge], readyForPlan: Boolean(coach.readyForPlan && coach.goal) };
}

/** Quick replies shown under the chat. */
export function coachSuggestions(student) {
  const coach = student.coach || {};
  const results = computeResults(student);
  const short = (coach.shortlist?.length ? coach.shortlist : results.careers.slice(0, 3).map((c) => c.id)).map(careerById).filter(Boolean);
  if (coach.goal && coach.readyForPlan) return [`Pros and cons of ${careerById(coach.goal).name}`, 'Show me other options'];
  const out = [];
  if (short.length >= 2) out.push(`Compare ${short[0].name} and ${short[1].name}`);
  if (short[0]) out.push(`Pros and cons of ${short[0].name}`);
  out.push('Show me other options', "I'm not sure yet");
  if (coach.suggested) out.unshift(`Plan for ${careerById(coach.suggested).name}`);
  return out.slice(0, 4);
}

export async function coachReply(student, message) {
  const coach = coachState(student);
  coach.messages.push({ role: 'user', content: message, at: new Date().toISOString() });
  let out = null;
  let source = 'scripted';
  if (aiEnabled()) {
    const results = computeResults(student);
    const short = shortlistOf(student, results);
    const mentioned = [...findCareersIn(message).map((c) => c.id)];
    const ints = interestsIn(message);
    const byInterest = ints.length ? results.allCareers.filter((c) => careerById(c.id).interests.some((i) => ints.includes(i))).slice(0, 5).map((c) => c.id) : [];
    const candidates = uniq([...mentioned, ...short, ...byInterest, ...(student.profile?.considering || []), ...results.careers.map((c) => c.id)]).slice(0, 12);
    const cases = candidates.map((id) => { const k = personalCase(student, results, id); return `- ${k.name} (${k.fit}% fit; route: ${k.route}; salary: ${k.salary}). For this student: ${k.forYou.join('; ')}. Watch out: ${k.watchOut.join('; ')}.`; }).join('\n');
    const transcript = coach.messages.slice(-16).map((m) => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n');
    const prompt = `${VOICE}

FACTS ABOUT THE STUDENT
${profileFacts(student, results)}

CAREERS TO DRAW ON, WITH PROS AND CONS FOR THIS STUDENT (from their measured abilities, interests, priorities and subjects)
${cases}
Other careers Dishaa knows: ${content.careers.map((c) => c.name).join(', ')}

CONVERSATION SO FAR
${transcript}

HOW TO COACH
- You are a patient counsellor, not a quiz. Do not rush the student to pick a career. Explore first.
- When the student shares interests, reflect them back and suggest 2-3 careers that combine them (prefer careers that blend several of their interests), each with a short personal pros and cons from the facts above.
- When they name a career, weigh it honestly for them (pros AND cons, using their scores, subjects and priorities) and compare it with one alternative.
- Use the student's own data: mention their actual ability scores, subjects or priorities when relevant. Never invent numbers.
- Ask one open question at the end to keep the conversation going.
- Only when the student clearly says they want to plan for one career, set goalCareer to it and readyForPlan to true. Otherwise goalCareer is null and readyForPlan is false.
- Keep it under 160 words. You may use short lines starting with "+" for pros and "−" for cons.

Reply with only JSON:
{"reply": "your next message", "discussing": ["up to 3 career names from the list that you discussed or suggested"], "goalCareer": "career name or null", "readyForPlan": true or false}`;
    try {
      const o = await generate({ prompt, temperature: 0.6, timeoutMs: 22000 });
      if (typeof o?.reply === 'string' && o.reply.trim()) {
        const disc = Array.isArray(o.discussing) ? o.discussing.map((x) => findCareerIn(String(x))).filter(Boolean).map((c) => c.id) : [];
        if (disc.length) coach.shortlist = uniq(disc).slice(0, 3);
        const goal = typeof o.goalCareer === 'string' && o.goalCareer !== 'null' ? findCareerIn(o.goalCareer) : null;
        const ready = Boolean(o.readyForPlan) && Boolean(goal);
        if (ready) { coach.goal = goal.id; coach.shortlist = uniq([goal.id, ...(coach.shortlist || [])]).slice(0, 3); }
        out = { reply: o.reply.trim().slice(0, 1600), readyForPlan: ready || Boolean(coach.readyForPlan && coach.goal) };
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
