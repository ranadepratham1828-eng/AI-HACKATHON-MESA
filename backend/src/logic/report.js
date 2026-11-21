// Career Report, Parent Alignment Report and recommendations.
// Numbers come from scoring.js (explainable); the AI only writes the words.
import { content } from '../content.js';
import { askWithFallback, str, strList } from '../ai/ask.js';
import { reportPrompt, parentReportPrompt, SUPPORTED_LANGS } from '../ai/prompts.js';
import {
  revealedTraits, statedVsRevealed, careerFits, streamFit, reportSignature,
} from './scoring.js';

const traitInfo = Object.fromEntries(content.traits.map((t) => [t.id, t]));

/** Everything the report needs that doesn't use AI. */
export function computeResults(student) {
  const fingerprint = revealedTraits(student, content);
  const svr = statedVsRevealed(student.profile?.stated, fingerprint);
  const fits = careerFits(student, content);
  const stream = streamFit(student, content, fingerprint, fits);
  const doneMissions = content.missions.filter((m) => student.missions?.[m.id]?.status === 'done');
  const topTraits = Object.entries(fingerprint)
    .filter(([, v]) => v != null)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  return {
    fingerprint,
    stated: student.profile?.stated || {},
    statedVsRevealed: svr,
    fits,
    topMatch: fits[0] || null,
    topTraits,
    stream,
    missionsDone: doneMissions.length,
    gamesPlayed: Object.keys(student.games?.scores || {}).length,
    signature: reportSignature(student),
  };
}

function firstSentence(text, max = 110) {
  const s = String(text || '').trim().split(/(?<=[.!?])\s/)[0] || '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Report text without AI: built from the student's own answers and the content files. */
export function scriptedNarrative(student, computed) {
  const done = content.missions.filter((m) => student.missions?.[m.id]?.status === 'done');
  const strengths = computed.topTraits.map((trait) => {
    const best = [...done].sort((a, b) => (b.weights[trait] || 0) - (a.weights[trait] || 0))[0];
    const quote = best ? firstSentence(student.missions[best.id].answer) : '';
    return {
      name: traitInfo[trait].strengthName,
      evidence: best && quote ? `In the ${best.career} mission you wrote: "${quote}"` : `Your games showed strong ${trait.toLowerCase()} skills.`,
      whyItMatters: `${traitInfo[trait].description} is a core skill in many careers.`,
    };
  });
  const tried = new Set(done.map((m) => m.career));
  const newCareers = computed.topTraits
    .flatMap((t) => content.newCareersByTrait[t] || [])
    .filter((c) => !tried.has(c.name))
    .slice(0, 3);
  const top = computed.topMatch ? content.pathways[computed.topMatch.missionId] : null;
  const s = computed.statedVsRevealed.biggestSurprise;
  return {
    headline: computed.topMatch
      ? `You came most alive in the ${computed.topMatch.career} mission, and your actions showed real ${computed.topTraits.map((t) => traitInfo[t].strengthName.toLowerCase()).join(', ')}.`
      : 'Play at least one mission to see what your actions reveal.',
    strengths,
    surprise: s
      ? `You rated yourself ${s.stated}/5 for ${s.trait}, but your actions showed ${s.revealed}/5.`
      : '',
    newCareers,
    next7Days: top?.tryThisWeek?.slice(0, 3) || ['Try one more mission on Disha', 'Talk to someone who works in a job you are curious about', 'Write down one thing you enjoyed this week and why'],
  };
}

export async function careerReport(student) {
  const computed = computeResults(student);
  if (!computed.missionsDone) {
    return { ...computed, narrative: scriptedNarrative(student, computed), narrativeSource: 'scripted' };
  }
  const cached = student.cache?.report;
  if (cached && cached.signature === computed.signature) {
    return { ...computed, narrative: cached.narrative, narrativeSource: cached.source };
  }
  const missions = content.missions.filter((m) => student.missions?.[m.id]?.status === 'done');
  const result = await askWithFallback({
    label: 'report',
    prompt: reportPrompt({ student, computed, missions }),
    validate: (o) => {
      const headline = str(o?.headline);
      const strengths = Array.isArray(o?.strengths)
        ? o.strengths.map((s) => ({ name: str(s?.name, 60), evidence: str(s?.evidence), whyItMatters: str(s?.whyItMatters) })).filter((s) => s.name && s.evidence).slice(0, 3)
        : [];
      const newCareers = Array.isArray(o?.newCareers)
        ? o.newCareers.map((c) => ({ name: str(c?.name, 60), why: str(c?.why) })).filter((c) => c.name).slice(0, 3)
        : [];
      const next7Days = strList(o?.next7Days, 3);
      if (!headline || strengths.length < 2 || !newCareers.length || !next7Days.length) return null;
      return { headline, strengths, surprise: str(o.surprise) || '', newCareers, next7Days };
    },
    fallback: () => scriptedNarrative(student, computed),
  });
  const { source, aiError, ...narrative } = result;
  // Only cache AI text, so a scripted fallback is retried next time.
  const cacheEntry = source === 'ai' ? { signature: computed.signature, narrative, source } : undefined;
  return { ...computed, narrative, narrativeSource: source, cacheEntry };
}

export function scriptedParentReport(student, computed) {
  const name = student.profile?.name || 'Your child';
  const top = computed.topMatch?.career;
  const traits = computed.topTraits.map((t) => traitInfo[t].strengthName.toLowerCase());
  const expect = student.profile?.parentExpect;
  return {
    summary: top
      ? `${name} tried ${computed.missionsDone} real career missions on Disha. ${name} was most engaged in the ${top} mission. Their actions showed strong ${traits.join(', ')}.`
      : `${name} hasn't finished a career mission yet.`,
    match: expect
      ? `Your hope for ${name} to become a ${expect} fits their ${traits[0] || 'strengths'}: many strengths carry across careers.`
      : `${name}'s strengths are a good base for many careers.`,
    differ: top && expect && !top.toLowerCase().includes(expect.toLowerCase())
      ? `${name}'s strongest signals pointed towards ${top}, which is different from ${expect}. It's worth exploring together.`
      : `${name}'s results and your expectations point in a similar direction.`,
    starters: [
      `Which mission did you enjoy most, and what made it fun?`,
      `What did the results say that surprised you?`,
      `If you could try one career for a day, which would it be and why?`,
    ],
  };
}

export async function parentReport(student, lang = 'en') {
  const language = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
  const report = await careerReport(student);
  const computed = report;
  const sig = `${computed.signature}#${language}`;
  const cached = student.cache?.parent?.[language];
  const base = {
    childName: student.profile?.name || '',
    parentExpect: student.profile?.parentExpect || '',
    parentReason: student.profile?.parentReason || '',
    topMatch: computed.topMatch,
    topTraits: computed.topTraits,
    fingerprint: computed.fingerprint,
    language,
  };
  if (cached && cached.signature === sig) {
    return { ...base, ...cached.text, language: cached.language || language, requestedLanguage: language, source: cached.source, reportCacheEntry: report.cacheEntry };
  }
  if (!computed.missionsDone) return { ...base, ...scriptedParentReport(student, computed), source: 'scripted' };

  const result = await askWithFallback({
    label: `parent:${language}`,
    prompt: parentReportPrompt({ student, computed, lang: language }),
    validate: (o) => {
      const summary = str(o?.summary, 800);
      const match = str(o?.match);
      const differ = str(o?.differ);
      const starters = strList(o?.starters, 3);
      return summary && match && differ && starters.length ? { summary, match, differ, starters } : null;
    },
    fallback: () => scriptedParentReport(student, computed),
  });
  const { source, aiError, ...text } = result;
  // Scripted text is English only, so say so when another language was asked for.
  const translated = source === 'ai' || language === 'en';
  return {
    ...base,
    ...text,
    language: translated ? language : 'en',
    requestedLanguage: language,
    source,
    cacheEntry: source === 'ai' ? { signature: sig, text, source, language } : undefined,
    reportCacheEntry: report.cacheEntry,
  };
}

/** Colleges for a career, each with Campus Connect count and whether its figures are verified. */
export function collegesFor(missionId) {
  return content.colleges
    .filter((c) => c.careers.includes(missionId))
    .map((c) => ({
      ...c,
      verified: Boolean(c.source && c.lastChecked),
      campusConnectCount: content.campusProfiles.filter((p) => p.collegeId === c.id).length,
    }));
}

/** Campus Connect profiles for a career (or one college), sample profiles marked. */
export function campusConnect({ missionId, collegeId }) {
  const colleges = missionId ? collegesFor(missionId) : content.colleges;
  const ids = new Set(colleges.filter((c) => !collegeId || c.id === collegeId).map((c) => c.id));
  const byId = Object.fromEntries(content.colleges.map((c) => [c.id, c]));
  return content.campusProfiles
    .filter((p) => ids.has(p.collegeId))
    .map((p) => ({ ...p, college: { id: p.collegeId, name: byId[p.collegeId]?.name, city: byId[p.collegeId]?.city } }));
}

/** Career Path Recommendations + India Pathway Cards + Stream Decision Helper. */
export function recommendations(student) {
  const computed = computeResults(student);
  const traitWords = computed.topTraits.map((t) => traitInfo[t].strengthName.toLowerCase());
  const careerPaths = computed.fits.map((f) => {
    const mission = content.missions.find((m) => m.id === f.missionId);
    const matching = computed.topTraits.filter((t) => mission.weights[t]);
    return {
      missionId: f.missionId,
      career: f.career,
      fit: f.fit,
      why: matching.length
        ? `Uses your ${matching.map((t) => traitInfo[t].strengthName.toLowerCase()).join(' and ')}, and you ${f.behaviour.bonusTaken ? 'took the bonus challenge' : 'finished the mission'}${f.behaviour.questionsAsked ? ` and asked ${f.behaviour.questionsAsked} curious question${f.behaviour.questionsAsked > 1 ? 's' : ''}` : ''}.`
        : `You finished this mission with a fit of ${f.fit}.`,
      pathway: content.pathways[f.missionId] || null,
      colleges: collegesFor(f.missionId),
    };
  });
  const cls = Number(student.profile?.cls) || 10;
  return {
    stage: cls >= 11 ? 'class12' : 'class10',
    careerPaths,
    stream: computed.stream,
    strengthsUsed: traitWords,
    note: 'Pathways are drafts for the demo and should be checked by working professionals.',
  };
}
