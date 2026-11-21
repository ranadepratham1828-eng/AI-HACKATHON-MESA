// Pure scoring functions: games, mission engagement, Interest Fingerprint,
// Stated vs Revealed, career fit and stream fit. No AI here, so results are
// explainable and the same every time.

const GAME_WEIGHT = 1.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

/** Score one game answer from 0 to 1 (null if not played). */
export function scoreGame(game, result) {
  if (!result) return null;
  if (game.type === 'uses') {
    const ideas = String(result.answer ?? '')
      .split('\n')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return round2(Math.min(new Set(ideas).size / (game.target || 8), 1));
  }
  if (Number(result.answer) !== game.answer) return 0;
  return result.ms != null && Number(result.ms) > (game.fastMs || 20000) ? 0.85 : 1;
}

/**
 * How engaged the student was in a finished mission, 0 to 1.
 * Behaviour counts as much as answer quality: enjoyment, quality, taking the
 * optional bonus, asking curious questions and choosing to spend time.
 */
export function missionEngagement(m) {
  if (!m || m.status !== 'done') return null;
  const enjoy = clamp(Number(m.enjoy) || 3, 1, 5) / 5;
  const quality = clamp(Number(m.quality) || 3, 1, 5) / 5;
  const bonus = m.bonusTaken ? 1 : 0;
  const curious = Math.min(m.questions?.length || 0, 3) / 3;
  const time = Math.min((Number(m.timeMs) || 0) / (4 * 60 * 1000), 1);
  return round2(0.3 * enjoy + 0.3 * quality + 0.15 * bonus + 0.1 * curious + 0.15 * time);
}

/** Fit score shown to students, 35 to 97 (never 0 or 100: it's a signal, not a verdict). */
export const fitScore = (engagement) => Math.round(35 + 62 * engagement);

/** Interest Fingerprint: each trait from 1 to 5, or null if nothing has tested it yet. */
export function revealedTraits(student, content) {
  const acc = Object.fromEntries(content.traits.map((t) => [t.id, { sum: 0, w: 0 }]));
  for (const mission of content.missions) {
    const e = missionEngagement(student.missions?.[mission.id]);
    if (e == null) continue;
    for (const [trait, w] of Object.entries(mission.weights)) {
      acc[trait].sum += w * e;
      acc[trait].w += w;
    }
  }
  for (const game of content.games) {
    const v = student.games?.scores?.[game.id];
    if (v == null) continue;
    acc[game.trait].sum += GAME_WEIGHT * v;
    acc[game.trait].w += GAME_WEIGHT;
  }
  return Object.fromEntries(
    Object.entries(acc).map(([t, { sum, w }]) => [t, w ? round1(1 + (4 * sum) / w) : null]),
  );
}

/** Compare what the student said in the questionnaire with what they showed. */
export function statedVsRevealed(stated = {}, revealed = {}) {
  const rows = Object.keys(revealed).map((trait) => {
    const s = stated[trait] ?? null;
    const r = revealed[trait];
    return { trait, stated: s, revealed: r, gap: s != null && r != null ? round1(r - s) : null };
  });
  const surprises = rows
    .filter((r) => r.gap != null && Math.abs(r.gap) >= 1)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return { rows, biggestSurprise: surprises[0] || null };
}

/** Career fit for each finished mission, best first, with the behaviour behind it. */
export function careerFits(student, content) {
  return content.missions
    .map((mission) => {
      const m = student.missions?.[mission.id];
      const e = missionEngagement(m);
      if (e == null) return null;
      return {
        missionId: mission.id,
        career: mission.career,
        engagement: e,
        fit: fitScore(e),
        behaviour: {
          timeMinutes: round1((Number(m.timeMs) || 0) / 60000),
          bonusTaken: Boolean(m.bonusTaken),
          questionsAsked: m.questions?.length || 0,
          enjoyment: Number(m.enjoy) || null,
          answerQuality: Number(m.quality) || null,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.fit - a.fit);
}

const STREAMS = {
  Science: {
    traits: { Numbers: 1, Investigating: 1.5, Building: 1.5, Nature: 1 },
    subjects: ['Maths', 'Science', 'Physics', 'Chemistry', 'Biology', 'Computer Science'],
  },
  Commerce: {
    traits: { Numbers: 2, People: 1, Investigating: 1 },
    subjects: ['Accountancy', 'Economics', 'Business Studies', 'Maths'],
  },
  Arts: {
    traits: { Creativity: 1.5, People: 1.5, Nature: 0.5, Investigating: 0.5 },
    subjects: ['History', 'Geography', 'Political Science', 'Psychology', 'Sociology', 'English', 'Hindi', 'Kannada', 'Art', 'Music'],
  },
};

/**
 * Stream Decision Helper: how well Science, Commerce and Arts fit, 0 to 100.
 * Uses revealed traits (stated ones where nothing was tested), liked and
 * disliked subjects, and the streams that lead to the top career.
 */
export function streamFit(student, content, revealed, fits) {
  const stated = student.profile?.stated || {};
  const likes = new Set(student.profile?.likes || []);
  const dislikes = new Set(student.profile?.dislikes || []);
  const top = fits[0] ? content.pathways[fits[0].missionId] : null;

  const scores = Object.entries(STREAMS).map(([stream, def]) => {
    let traitSum = 0;
    let traitW = 0;
    for (const [t, w] of Object.entries(def.traits)) {
      const v = revealed[t] ?? stated[t] ?? 3;
      traitSum += w * (v / 5);
      traitW += w;
    }
    const liked = def.subjects.filter((s) => likes.has(s)).length;
    const disliked = def.subjects.filter((s) => dislikes.has(s)).length;
    const subjectScore = clamp(0.5 + 0.25 * liked - 0.25 * disliked, 0, 1);
    const pathwayBonus = top?.streams?.includes(stream) ? 1 : 0;
    const score = 0.6 * (traitSum / traitW) + 0.25 * subjectScore + 0.15 * pathwayBonus;
    return { stream, fit: Math.round(score * 100) };
  }).sort((a, b) => b.fit - a.fit);

  return {
    scores,
    recommended: scores[0].stream,
    topCareer: fits[0]?.career || null,
    note: top?.streamNote || 'Try at least 3 missions for a stronger stream suggestion.',
  };
}

const SUBJECT_TRAITS = {
  Maths: ['Numbers', 'Investigating'], Physics: ['Building', 'Investigating'], Chemistry: ['Investigating'],
  Biology: ['Nature', 'Investigating'], Science: ['Investigating', 'Nature'], 'Computer Science': ['Building', 'Numbers'],
  Accountancy: ['Numbers'], Economics: ['Numbers', 'People'], 'Business Studies': ['People', 'Numbers'],
  History: ['Investigating', 'People'], Geography: ['Nature', 'Building'], 'Political Science': ['People'],
  Psychology: ['People'], Sociology: ['People'], English: ['People', 'Creativity'], Hindi: ['People'],
  Kannada: ['People'], Art: ['Creativity'], Music: ['Creativity'], Sports: ['People', 'Building'],
};

/**
 * Mission picks from the questionnaire: rank missions by the student's stated
 * traits and liked subjects. Always returns every mission, best first.
 */
export function missionPicks(student, content) {
  const stated = student.profile?.stated || {};
  const boost = {};
  for (const s of student.profile?.likes || []) for (const t of SUBJECT_TRAITS[s] || []) boost[t] = (boost[t] || 0) + 1;
  return content.missions
    .map((m) => {
      let sum = 0;
      let w = 0;
      for (const [t, wt] of Object.entries(m.weights)) {
        sum += wt * ((stated[t] ?? 3) + Math.min(boost[t] || 0, 2) * 0.5);
        w += wt;
      }
      const top = Object.entries(m.weights).sort((a, b) => b[1] - a[1])[0][0];
      const done = student.missions?.[m.id]?.status === 'done';
      return { missionId: m.id, career: m.career, match: round1(sum / w), reason: `Matches what you said about ${top.toLowerCase()}`, done };
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || b.match - a.match);
}

/** A short fingerprint of everything that changes the report, used to cache AI text. */
export function reportSignature(student) {
  const missions = Object.entries(student.missions || {})
    .filter(([, m]) => m.status === 'done')
    .map(([id, m]) => `${id}:${m.enjoy}:${m.quality}:${m.bonusTaken ? 1 : 0}:${m.questions?.length || 0}`)
    .sort()
    .join('|');
  const games = Object.entries(student.games?.scores || {}).map(([k, v]) => `${k}:${v}`).sort().join('|');
  return `${missions}#${games}#${JSON.stringify(student.profile?.stated || {})}#${student.profile?.parentExpect || ''}`;
}
