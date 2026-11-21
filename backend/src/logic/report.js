// Student report, parent report, colleges and Campus Connect.
// Numbers come from assessment.js (explainable); the AI only writes the words.
import { content } from '../content.js';
import { askWithFallback, str, strList } from '../ai/ask.js';
import { reportPrompt, parentReportPrompt, SUPPORTED_LANGS } from '../ai/prompts.js';
import { scoreAssessment, statedVsMeasured, matchCareers, streamHint } from './assessment.js';

/** Colleges for a career simulation, with Campus Connect counts. */
export function collegesFor(missionId) {
  if (!missionId) return [];
  return content.colleges
    .filter((c) => c.careers.includes(missionId))
    .map((c) => ({
      ...c,
      verified: c.sourceType === 'official' && Boolean(c.source && c.lastChecked),
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

/** Everything the report needs that doesn't use AI. */
export function computeResults(student) {
  const quest = scoreAssessment(student, content);
  const careers = matchCareers(student, content, quest.abilities).map((c) => ({
    ...c,
    pathway: c.missionId ? content.pathways[c.missionId] || null : null,
    colleges: collegesFor(c.missionId),
  }));
  const top = careers.slice(0, 5);
  const signature = JSON.stringify([student.assessment?.answers || {}, student.profile?.interests, student.profile?.stated, student.profile?.parentExpect]);
  return {
    quest,
    statedVsMeasured: statedVsMeasured(student.profile?.stated, quest.abilities),
    careers: top,
    stream: streamHint(top.slice(0, 3)),
    questionnaireDone: Boolean(student.profile?.interests?.length || student.profile?.stated),
    signature,
  };
}

const labelOf = (id) => content.assessment.abilities.find((a) => a.id === id)?.label || id;

/** Report text without AI, built from the student's own results. */
export function scriptedNarrative(student, c) {
  const byId = Object.fromEntries(c.quest.abilities.map((a) => [a.id, a]));
  const name = student.profile?.name || 'You';
  const top = c.careers[0];
  return {
    headline: c.quest.strengths.length
      ? `${name}'s strongest areas are ${c.quest.strengths.slice(0, 2).map((id) => labelOf(id).toLowerCase()).join(' and ')}${top ? `, a great fit for careers like ${top.name}` : ''}.`
      : 'Finish Disha Quest to see your strengths.',
    strengths: c.quest.strengths.map((id) => ({
      name: byId[id].label,
      evidence: byId[id].evidence || '',
      whyItMatters: `${byId[id].description}.`,
    })),
    growth: c.quest.growth.map((id) => ({ name: byId[id].label, tip: byId[id].growthTip })),
    surprise: c.statedVsMeasured.biggestSurprise
      ? `You rated your ${c.statedVsMeasured.biggestSurprise.label.toLowerCase()} ${c.statedVsMeasured.biggestSurprise.stated}/5, but the game measured ${c.statedVsMeasured.biggestSurprise.measured}/5.`
      : '',
    next7Days: [
      top ? `Read about a day in the life of a ${top.name}, and note what excites you` : 'Talk to someone whose job you find interesting',
      c.quest.growth[0] ? byId[c.quest.growth[0]].growthTip : 'Pick one puzzle a day to keep your mind sharp',
      'Share this report with your parents and discuss your top 3 careers',
    ],
  };
}

export async function careerReport(student) {
  const c = computeResults(student);
  if (!c.quest.answered) return { ...c, narrative: scriptedNarrative(student, c), narrativeSource: 'scripted' };

  const cached = student.cache?.report;
  if (cached && cached.signature === c.signature) return { ...c, narrative: cached.narrative, narrativeSource: cached.source };

  const result = await askWithFallback({
    label: 'report',
    prompt: reportPrompt({ student, computed: c }),
    validate: (o) => {
      const headline = str(o?.headline);
      const strengths = Array.isArray(o?.strengths)
        ? o.strengths.map((s) => ({ name: str(s?.name, 60), evidence: str(s?.evidence), whyItMatters: str(s?.whyItMatters) })).filter((s) => s.name && s.evidence).slice(0, 3)
        : [];
      const growth = Array.isArray(o?.growth)
        ? o.growth.map((g) => ({ name: str(g?.name, 60), tip: str(g?.tip) })).filter((g) => g.name && g.tip).slice(0, 2)
        : [];
      const next7Days = strList(o?.next7Days, 3);
      if (!headline || strengths.length < 2 || !next7Days.length) return null;
      return { headline, strengths, growth, surprise: str(o.surprise) || '', next7Days };
    },
    fallback: () => scriptedNarrative(student, c),
  });
  const { source, aiError, ...narrative } = result;
  const cacheEntry = source === 'ai' ? { signature: c.signature, narrative, source } : undefined;
  return { ...c, narrative, narrativeSource: source, cacheEntry };
}

export function scriptedParentReport(student, c) {
  const name = student.profile?.name || 'Your child';
  const strengths = c.quest.strengths.map((id) => labelOf(id).toLowerCase());
  const expect = student.profile?.parentExpect;
  const careerNames = c.careers.map((x) => x.name);
  const expectMatch = expect && careerNames.find((n) => n.toLowerCase().includes(expect.toLowerCase()));
  return {
    summary: c.quest.answered
      ? `${name} completed Disha Quest, a 10-minute aptitude game. ${name}'s strongest areas are ${strengths.join(', ')}. The best-matching careers are ${careerNames.slice(0, 3).join(', ')}.`
      : `${name} hasn't played Disha Quest yet.`,
    match: expectMatch
      ? `${expect} appears in ${name}'s top career matches, which supports your hope.`
      : `${name}'s ${strengths[0] || 'strengths'} are valuable in many careers, including the one you hope for.`,
    differ: expect && !expectMatch
      ? `${expect} isn't in ${name}'s top matches right now; careers like ${careerNames[0] || 'others'} fit their results more closely. It's worth exploring together.`
      : `${name}'s results and your expectations point in a similar direction.`,
    starters: [
      'Which part of the game did you enjoy most, and why?',
      'Which of your top careers surprised you?',
      'What would a perfect day at work look like for you?',
    ],
  };
}

export async function parentReport(student, lang = 'en') {
  const language = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
  const report = await careerReport(student);
  const sig = `${report.signature}#${language}`;
  const base = {
    childName: student.profile?.name || '',
    parentExpect: student.profile?.parentExpect || '',
    parentReason: student.profile?.parentReason || '',
    strengths: report.quest.strengths.map(labelOf),
    topCareers: report.careers.slice(0, 3).map((x) => ({ name: x.name, fit: x.fit })),
    language,
    requestedLanguage: language,
  };
  const cached = student.cache?.parent?.[language];
  if (cached && cached.signature === sig) {
    return { ...base, ...cached.text, language: cached.language || language, source: cached.source, reportCacheEntry: report.cacheEntry };
  }
  if (!report.quest.answered) return { ...base, ...scriptedParentReport(student, report), source: 'scripted' };

  const result = await askWithFallback({
    label: `parent:${language}`,
    prompt: parentReportPrompt({ student, computed: report, lang: language }),
    validate: (o) => {
      const summary = str(o?.summary, 800);
      const match = str(o?.match);
      const differ = str(o?.differ);
      const starters = strList(o?.starters, 3);
      return summary && match && differ && starters.length ? { summary, match, differ, starters } : null;
    },
    fallback: () => scriptedParentReport(student, report),
  });
  const { source, aiError, ...text } = result;
  const translated = source === 'ai' || language === 'en';
  return {
    ...base,
    ...text,
    language: translated ? language : 'en',
    source,
    cacheEntry: source === 'ai' ? { signature: sig, text, source, language } : undefined,
    reportCacheEntry: report.cacheEntry,
  };
}
