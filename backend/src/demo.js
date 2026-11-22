// Demo student "Ananya" from the pitch. Two stages:
//  - "questionnaire": profile filled in, ready to play live in front of judges
//  - "finished": games and all 3 missions done, so every screen has data instantly
import { content, gameById } from './content.js';
import { scoreGame } from './logic/scoring.js';
import { buildStudyPlan, cleanStudyInput, recommendActivities, todayIST, addDays } from './logic/study.js';
import { scriptedStudyNote } from './logic/studyNote.js';

export const ANANYA_PROFILE = {
  name: 'Ananya',
  cls: '10',
  city: 'Bengaluru',
  likes: ['Biology', 'Art', 'English'],
  dislikes: ['Accountancy', 'Maths'],
  hobbies: 'Sketching, helping my grandmother use her phone',
  goal: 'Choose my stream after Class 10',
  parentExpect: 'Doctor',
  parentReason: "It's a safe and respected career",
  budget: '1-3l',
  board: 'CBSE',
  schoolName: 'Demo Public School',
  subjects: ['Maths', 'Science', 'Social Science', 'English', 'Kannada', 'Art'],
  marks: { class9: 86, class10: 88 },
  familyIncome: '4.5-8l',
  gender: 'female',
  category: 'prefer-not',
  relocate: 'state',
  openToLoan: true,
  dream: 'Something creative where I help people',
  interests: ['design', 'helping', 'health', 'writing'],
  considering: ['ux-designer', 'psychologist', 'doctor'],
  priorities: ['passion', 'helping'],
  riasec: { r1: 0, r2: 1, r3: 1, i1: 1, i2: 1, i3: 2, a1: 2, a2: 2, a3: 1, s1: 2, s2: 2, s3: 2, e1: 1, e2: 0, e3: 1, c1: 0, c2: 1, c3: 1 },
  stated: { logical: 3, numerical: 1, verbal: 4, spatial: 3, mechanical: 2, memory: 4, critical: 2, creative: 4, social: 4 },
};

// Ananya's Dishaa Quest answers: strong creative, people and spatial; numbers better than she thinks.
const QUEST_ANSWERS = {
  l1: { answer: 1, ms: 21000 }, l2: { answer: 1, ms: 34000 }, l3: { answer: 3, ms: 38000 },
  n1: { answer: 1, ms: 15000 }, n2: { answer: 0, ms: 26000 }, n3: { answer: 2, ms: 41000 },
  v1: { answer: 1, ms: 9000 }, v2: { answer: 3, ms: 7000 }, v3: { answer: 1, ms: 24000 },
  s1: { answer: 1, ms: 14000 }, s2: { answer: 2, ms: 19000 }, s3: { answer: 0, ms: 52000 },
  m1: { answer: [[0, 1], [1, 3], [2, 0], [3, 4], [4, 2]], ms: 9000 },
  m2: { answer: [[0, 0], [0, 4], [1, 2], [2, 1], [3, 3], [4, 4], [4, 1]], ms: 14000 },
  c1: { answer: 1, ms: 27000 }, c2: { answer: 1, ms: 12000 }, c3: { answer: 0, ms: 36000 },
  k1: { answer: 'plant pot\npencil stand\nbird feeder\npiggy bank\nlamp shade\nwatering can\nrolling pin\nsandbox scoop', ms: 45000 },
  p1: { answer: 2, ms: 11000 }, p2: { answer: 1, ms: 8000 },
  l4: { answer: 1, ms: 26000 }, n4: { answer: 1, ms: 31000 }, v4: { answer: 1, ms: 8000 }, c4: { answer: 1, ms: 22000 },
  g1: { answer: 1, ms: 24000 }, g2: { answer: 0, ms: 33000 }, g3: { answer: 2, ms: 19000 },
};

const min = (m) => m * 60 * 1000;

const FINISHED = {
  games: {
    results: {
      'number-series': { answer: 1, ms: 14000 },
      'height-logic': { answer: 1, ms: 18000 },
      'painted-cube': { answer: 0, ms: 52000 },
      'team-conflict': { answer: 2, ms: 9000 },
      'bottle-uses': { answer: 'plant pot\npencil stand\nbird feeder\npiggy bank\nlamp\nwatering can\nrolling pin', ms: 45000 },
    },
  },
  missions: {
    'ux-designer': {
      status: 'done',
      answer: 'First I would put a big Send Money button on the home screen, because Mrs. Rao should not have to search menus. Second, make the text much bigger and dark so she can read it without glasses, and add Kannada. Third, give her 3 minutes for the OTP or let her get it as a voice call. I would also show a clear warning: never share your PIN with anyone, even a neighbour.',
      hasImage: true,
      feedback: {
        praise: "You thought about how Mrs. Rao feels before thinking about buttons: \"she should not have to search menus\" is real user empathy.",
        imageComment: 'Your sketch puts the Send Money button right in the middle with huge labels; I can see you wrote the amount in big digits too.',
        proTip: 'A professional would test this with 3 to 5 real grandparents before building it.',
        twist: "The bank says your design needs 3 extra months, and launch is in 4 weeks. You can keep only ONE change. Which one?",
        quality: 5,
        skillsSeen: ['Empathy', 'Clear communication', 'Safety thinking'],
        source: 'scripted',
      },
      twistReply: 'The big Send Money button on the home screen, because if she cannot find it nothing else matters.',
      twistReaction: { reaction: 'Exactly right: findability first. A pro would also add a quick tutorial video for that one button.', source: 'scripted' },
      bonusTaken: true,
      bonusAnswer: "Your money is safe. The transfer didn't go through, and no money left your account. Please try again in 5 minutes, or call us at the number on your card.",
      questions: [
        { q: 'Do UX designers need to know coding?', a: "Not to start. Many great designers can't code; you need to understand people and sketch ideas. Basic coding helps later when you work with engineers." },
        { q: 'What do you do on a normal day?', a: 'I talk to users, sketch screens, test them, and argue politely with engineers about what to build first!' },
        { q: 'Which college did you go to?', a: 'I did B.Des at a design school. But I work with people who studied psychology, engineering and even commerce.' },
      ],
      enjoy: 5,
      quality: 5,
      timeMs: min(9.5),
    },
    'forensic-accountant': {
      status: 'done',
      answer: 'The fraud is invoice INV-2231 to Ganesh Traders. It was paid twice, on Monday and again on Thursday, for the same 12,400. I would check with Ganesh Traders if they received two payments and who approved the Thursday one.',
      hasImage: false,
      feedback: {
        praise: 'You spotted the same invoice number paid twice and named who approved it as your next check: that is exactly the forensic mindset.',
        imageComment: '',
        proTip: "A professional would match every payment against the supplier's own statement.",
        twist: "The accountant says the second payment was an \"advance\". There's no new invoice. What would you ask for?",
        quality: 4,
        skillsSeen: ['Attention to detail', 'Logical thinking'],
        source: 'scripted',
      },
      twistReply: 'I would ask for a written receipt from Ganesh Traders for the advance.',
      twistReaction: { reaction: 'Good: proof over stories. A pro would also check if advances are normal for this supplier.', source: 'scripted' },
      bonusTaken: false,
      questions: [],
      enjoy: 2,
      quality: 4,
      timeMs: min(4),
    },
    'urban-planner': {
      status: 'done',
      answer: 'Move the bus stop 50 metres back from the corner so it does not block the lane. Paint a zebra crossing with a signal near the school for the morning rush. Move the auto stand away from the turning lane. The auto drivers and vendors might be unhappy, so we can give them a proper space nearby.',
      hasImage: true,
      feedback: {
        praise: 'You thought about the school children and gave unhappy auto drivers a new space: that is designing for everyone.',
        imageComment: 'In your photo you circled the parked bikes blocking the footpath. Good eye.',
        proTip: 'A professional would count traffic at the busiest hour before deciding.',
        twist: 'Shop owners say removing parking will kill their sales. What do you offer them?',
        quality: 3,
        skillsSeen: ['Big-picture thinking', 'Fairness'],
        source: 'scripted',
      },
      twistReply: 'A small paid parking area behind the market and loading time in the afternoon.',
      twistReaction: { reaction: 'A fair compromise. Planners call that stakeholder management.', source: 'scripted' },
      bonusTaken: true,
      bonusAnswer: 'A ramp instead of a step at the crossing, and a longer green light. It also helps old people and parents with prams.',
      questions: [{ q: 'Do planners work with the government?', a: 'Many of us do, in city development authorities, but private firms and NGOs hire planners too.' }],
      enjoy: 4,
      quality: 3,
      timeMs: min(7),
    },
  },
};

// Ananya's study planner: CBSE Class 10 boards, built 3 days ago with most sessions ticked.
function demoStudy() {
  const today = todayIST();
  const input = cleanStudyInput({
    exams: [{ presetId: 'cbse-10-2027' }, { presetId: 'uceed-2027' }, { presetId: 'cuet-ug-2027' }, { name: 'School pre-board exams', date: addDays(today, 45), subjects: ['Maths', 'Science', 'Social Science', 'English'] }],
    subjects: [
      { name: 'Maths', confidence: 2, topics: ['Circles', 'Areas Related to Circles', 'Surface Areas and Volumes', 'Statistics', 'Probability'] },
      { name: 'Science', confidence: 3, topics: ['Light: Reflection and Refraction', 'The Human Eye and the Colourful World', 'Electricity', 'Magnetic Effects of Electric Current', 'Our Environment'] },
      { name: 'Social Science', confidence: 3, topics: ['Manufacturing Industries', 'Lifelines of National Economy', 'Outcomes of Democracy', 'Globalisation and the Indian Economy'] },
      { name: 'English', confidence: 4, topics: ['Footprints without Feet: remaining stories', 'Writing: letters and analytical paragraphs'] },
      { name: 'Kannada', confidence: 3, topics: ['Remaining lessons'] },
    ],
    weekdayHours: 2, weekendHours: 4, slot: 'evening',
    sources: ['ncert', 'school-notes', 'youtube', 'diksha'],
    activities: [{ name: 'Sketching', hours: 3 }, { name: 'Badminton', hours: 2 }],
  });
  input.startDate = addDays(today, -3);
  const student = { profile: ANANYA_PROFILE };
  const plan = buildStudyPlan(input, { cls: '10' });
  const done = {};
  plan.sessions.filter((x) => x.date < today).forEach((x, i) => { if (i !== 1) done[x.id] = true; });
  const acts = recommendActivities({ cls: '10', interests: ANANYA_PROFILE.interests, careerId: 'psychologist' }, input, plan);
  return { input, done, createdAt: new Date().toISOString(), note: { ...scriptedStudyNote(student, plan, today), source: 'scripted' }, activities: acts.recommended.map((a) => a.name) };
}

export function ananyaData(stage = 'finished') {
  const base = { profile: structuredClone(ANANYA_PROFILE), demo: true };
  if (stage === 'new') {
    // Live demo: only name, class and city; she plays the quest and fills the rest.
    const { name, cls, city } = ANANYA_PROFILE;
    return { profile: { name, cls, city, board: 'CBSE' }, demo: true };
  }
  base.assessment = { answers: structuredClone(QUEST_ANSWERS), completedAt: new Date().toISOString() };
  if (stage === 'questionnaire') return base;
  const data = structuredClone(FINISHED);
  data.games.scores = Object.fromEntries(
    Object.entries(data.games.results).map(([id, r]) => [id, scoreGame(gameById(id), r)]),
  );
  for (const m of Object.values(data.missions)) m.completedAt = new Date().toISOString();
  data.study = demoStudy();
  return { ...base, ...data, step: content.missions.length ? 'report' : 'missions' };
}
