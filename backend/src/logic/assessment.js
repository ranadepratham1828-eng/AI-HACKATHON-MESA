// Dishaa Quest scoring and career matching. Pure functions: no AI, so every
// number on the report can be explained from what the student actually did.

const round1 = (v) => Math.round(v * 10) / 10;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Score one answer from 0 to 1. */
export function scoreItem(item, result) {
  if (!result) return null;
  if (item.type === 'uses') {
    const ideas = String(result.answer ?? '').split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean);
    return Math.round(clamp01(new Set(ideas).size / (item.target || 8)) * 100) / 100;
  }
  if (item.type === 'memory') {
    const target = new Set(item.cells.map(([r, c]) => `${r},${c}`));
    const picked = new Set((Array.isArray(result.answer) ? result.answer : []).map((p) => `${Number(p?.[0])},${Number(p?.[1])}`));
    let hits = 0;
    let wrong = 0;
    for (const p of picked) (target.has(p) ? hits++ : wrong++);
    return Math.round(clamp01((hits - wrong) / target.size) * 100) / 100;
  }
  // mcq and rotate
  if (Number(result.answer) !== item.answer) return 0;
  return result.ms != null && Number(result.ms) > (item.fastMs || 30000) ? 0.85 : 1;
}

const band = (score) => (score >= 75 ? 'Strong' : score >= 50 ? 'Solid' : 'Developing');

/** Plain-English evidence for one ability, from the student's actual answers. */
function evidenceFor(zone, items, answers) {
  const done = items.filter((it) => answers[it.id]);
  if (!done.length) return null;
  const first = done[0];
  if (first.type === 'uses') {
    const n = new Set(String(answers[first.id].answer || '').split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean)).size;
    return `Came up with ${n} different idea${n === 1 ? '' : 's'} in ${first.seconds} seconds in the ${zone.evidenceNoun}`;
  }
  if (first.type === 'memory') {
    const total = done.reduce((a, it) => a + it.cells.length, 0);
    const recalled = done.reduce((a, it) => {
      const target = new Set(it.cells.map(([r, c]) => `${r},${c}`));
      return a + (answers[it.id].answer || []).filter((p) => target.has(`${p[0]},${p[1]}`)).length;
    }, 0);
    return `Recalled ${recalled} of ${total} items in the ${zone.evidenceNoun}`;
  }
  const correct = done.filter((it) => Number(answers[it.id].answer) === it.answer).length;
  const secs = done.map((it) => Number(answers[it.id].ms) || 0).filter(Boolean);
  const avg = secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length / 1000) : null;
  return `Answered ${correct} of ${done.length} ${zone.evidenceNoun} correctly${avg ? `, about ${avg}s each` : ''}`;
}

/** Everything about the student's Dishaa Quest: per-ability scores, zones, stats. */
export function scoreAssessment(student, content) {
  const answers = student.assessment?.answers || {};
  const { abilities: abilityDefs, zones } = content.assessment;

  const zoneResults = zones.map((z) => {
    const scores = z.items.map((it) => scoreItem(it, answers[it.id])).filter((s) => s != null);
    const done = scores.length === z.items.length;
    const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { id: z.id, name: z.name, ability: z.ability, answered: scores.length, total: z.items.length, done, stars: done ? Math.round(mean * 3) : null, mean };
  });

  const abilities = abilityDefs.map((a) => {
    const zs = zoneResults.filter((z) => z.ability === a.id && z.mean != null);
    const score = zs.length ? Math.round((zs.reduce((s, z) => s + z.mean, 0) / zs.length) * 100) : null;
    const zone = zones.find((z) => z.ability === a.id);
    return {
      id: a.id,
      label: a.label,
      short: a.short,
      description: a.description,
      growthTip: a.growthTip,
      score,
      band: score == null ? null : band(score),
      evidence: zone ? evidenceFor(zone, zone.items, answers) : null,
    };
  });

  const items = content.assessmentItems;
  const answered = items.filter((it) => answers[it.id]);
  const timed = answered.filter((it) => it.type === 'mcq' || it.type === 'rotate');
  const totalMs = answered.reduce((s, it) => s + (Number(answers[it.id].ms) || 0), 0);
  const itemScores = answered.map((it) => scoreItem(it, answers[it.id]));

  const scored = abilities.filter((a) => a.score != null);
  const ranked = [...scored].sort((x, y) => y.score - x.score);
  return {
    complete: answered.length === items.length,
    answered: answered.length,
    total: items.length,
    zones: zoneResults.map(({ mean, ...z }) => z),
    abilities,
    strengths: ranked.slice(0, 3).map((a) => a.id),
    growth: ranked.slice(-2).filter((a) => a.score < 70 && !ranked.slice(0, 3).includes(a)).map((a) => a.id),
    stats: {
      accuracy: itemScores.length ? Math.round((itemScores.reduce((a, b) => a + b, 0) / itemScores.length) * 100) : null,
      avgSeconds: timed.length ? Math.round(timed.reduce((s, it) => s + (Number(answers[it.id].ms) || 0), 0) / timed.length / 1000) : null,
      minutes: round1(totalMs / 60000),
    },
  };
}

/** Self-rating (1-5) vs what the game measured (shown on the same 1-5 scale). */
export function statedVsMeasured(stated = {}, abilities = []) {
  const rows = abilities.map((a) => {
    const s = stated[a.id] ?? null;
    const m = a.score == null ? null : round1(1 + (4 * a.score) / 100);
    return { ability: a.id, label: a.label, stated: s, measured: m, gap: s != null && m != null ? round1(m - s) : null };
  });
  const surprises = rows.filter((r) => r.gap != null && Math.abs(r.gap) >= 1).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  return { rows, biggestSurprise: surprises[0] || null };
}

/** Holland RIASEC scores (0-1 per type) from the interest check, or null if mostly unanswered. */
export function riasecScores(profile, content) {
  const answers = profile?.riasec || {};
  const items = content.questionnaire.riasec?.items || [];
  const answered = items.filter((it) => answers[it.id] != null);
  if (answered.length < items.length / 2) return null;
  const out = {};
  for (const t of ['R', 'I', 'A', 'S', 'E', 'C']) {
    const its = answered.filter((it) => it.type === t);
    out[t] = its.length ? its.reduce((sum, it) => sum + Number(answers[it.id]), 0) / (2 * its.length) : 0.5;
  }
  return out;
}

const PRIORITY_FIELD = { earning: 'pay', security: 'stability', balance: 'workLife', respect: 'prestige' };
const RIASEC_WEIGHTS = [0.5, 0.3, 0.2];

/**
 * Rank every career. Fit (0-100) = 45% measured abilities + 25% RIASEC interest
 * fit + 15% chosen interest areas + 15% the student's priorities. Careers the
 * student is already considering get a +10 boost and are always shown.
 */
export function matchCareers(student, content, abilities) {
  const p = student.profile || {};
  const scoreOf = Object.fromEntries(abilities.map((a) => [a.id, a.score]));
  const chosen = new Set(p.interests || []);
  const considering = new Set(p.considering || []);
  const priorities = (p.priorities || []).filter(Boolean);
  const riasec = riasecScores(p, content);
  const interestLabel = Object.fromEntries(content.interests.map((i) => [i.id, i.label]));
  const abilityLabel = Object.fromEntries(abilities.map((a) => [a.id, a.label.toLowerCase()]));
  const typeLabel = { R: 'hands-on', I: 'investigative', A: 'creative', S: 'helping', E: 'leading', C: 'organised' };

  return content.careers
    .map((c) => {
      let sum = 0;
      let w = 0;
      for (const [id, weight] of Object.entries(c.abilities)) { sum += weight * (scoreOf[id] ?? 50); w += weight; }
      const abilityMatch = Math.round(sum / w);
      const shared = c.interests.filter((i) => chosen.has(i));
      const interestMatch = chosen.size ? Math.round((shared.length / c.interests.length) * 100) : 50;
      const code = String(c.riasec || '').split('');
      const riasecMatch = riasec ? Math.round(100 * code.reduce((acc, t, i) => acc + (RIASEC_WEIGHTS[i] || 0) * (riasec[t] ?? 0.5), 0)) : interestMatch;
      const priorityMatch = priorities.length
        ? Math.round(priorities.reduce((acc, pr) => {
          if (PRIORITY_FIELD[pr]) return acc + ((c[PRIORITY_FIELD[pr]] ?? 3) - 1) / 4 * 100;
          if (pr === 'helping') return acc + (code.includes('S') ? 100 : c.interests.includes('helping') ? 70 : 30);
          return acc + riasecMatch; // passion: follow interests
        }, 0) / priorities.length)
        : 50;
      const isConsidering = considering.has(c.id);
      const raw = 0.45 * abilityMatch + 0.25 * riasecMatch + 0.15 * interestMatch + 0.15 * priorityMatch + (isConsidering ? 10 : 0);
      const fit = Math.max(1, Math.min(99, Math.round(raw)));

      const bestAbilities = Object.entries(c.abilities)
        .filter(([id]) => (scoreOf[id] ?? 0) >= 60)
        .sort((x, y) => y[1] * (scoreOf[y[0]] ?? 0) - x[1] * (scoreOf[x[0]] ?? 0))
        .slice(0, 2)
        .map(([id]) => abilityLabel[id]);
      const topType = riasec ? code.find((t) => riasec[t] >= 0.6) : null;
      const why = [
        bestAbilities.length ? `Uses your ${bestAbilities.join(' and ')}` : 'Builds on skills you can grow',
        topType ? `suits your ${typeLabel[topType]} side` : null,
        shared.length ? `matches your interest in ${shared.map((i) => interestLabel[i].toLowerCase()).join(' and ')}` : null,
      ].filter(Boolean).join(', ');
      return {
        id: c.id, name: c.name, category: c.category, fit, abilityMatch, riasecMatch, interestMatch, priorityMatch, considering: isConsidering,
        why: `${why}.`, summary: c.summary, stream: c.stream, degrees: c.degrees, exams: c.exams, missionId: c.missionId || null,
        riasec: c.riasec, salary: c.salary, salarySource: c.salarySource, demand: c.demand, pros: c.pros, cons: c.cons,
      };
    })
    .sort((x, y) => y.fit - x.fit);
}

/** Which Class 11 stream the top careers point to. */
export function streamHint(topCareers) {
  const counts = {};
  for (const c of topCareers) {
    const s = c.stream;
    const key = /PCB|Biology/.test(s) ? 'Science with Biology'
      : /PCM|Science with Maths/.test(s) ? 'Science with Maths'
        : /^Commerce/.test(s) ? 'Commerce'
          : /^Science/.test(s) ? 'Science' : 'Any stream';
    counts[key] = (counts[key] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { counts: ranked.map(([stream, n]) => ({ stream, careers: n })), suggestion: ranked[0]?.[0] || null, outOf: topCareers.length };
}
