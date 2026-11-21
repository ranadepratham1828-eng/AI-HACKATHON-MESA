// Demo student "Ananya" from the pitch. Two stages:
//  - "questionnaire": profile filled in, ready to play live in front of judges
//  - "finished": games and all 3 missions done, so every screen has data instantly
import { content, gameById } from './content.js';
import { scoreGame } from './logic/scoring.js';

export const ANANYA_PROFILE = {
  name: 'Ananya',
  cls: '10',
  city: 'Bengaluru',
  likes: ['Biology', 'Art'],
  dislikes: ['Accountancy', 'Maths'],
  hobbies: 'Sketching, helping my grandmother use her phone',
  goal: 'Choose my stream after Class 10',
  parentExpect: 'Doctor',
  parentReason: "It's a safe and respected career",
  budget: 'medium',
  stated: { People: 3, Numbers: 1, Creativity: 4, Building: 2, Investigating: 2, Nature: 3 },
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

export function ananyaData(stage = 'finished') {
  const base = { profile: structuredClone(ANANYA_PROFILE), demo: true };
  if (stage === 'questionnaire') return base;
  const data = structuredClone(FINISHED);
  data.games.scores = Object.fromEntries(
    Object.entries(data.games.results).map(([id, r]) => [id, scoreGame(gameById(id), r)]),
  );
  for (const m of Object.values(data.missions)) m.completedAt = new Date().toISOString();
  return { ...base, ...data, step: content.missions.length ? 'report' : 'missions' };
}
