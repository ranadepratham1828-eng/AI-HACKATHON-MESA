// Mission AI features: senior feedback (with photo), twist reaction, Curiosity Box.
import { askWithFallback, str, strList } from '../ai/ask.js';
import { missionFeedbackPrompt, twistReactionPrompt, curiosityPrompt } from '../ai/prompts.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Rough quality score used when the AI is not available. */
export function scriptedQuality(mission, answer) {
  const a = String(answer || '').toLowerCase();
  let q = 2;
  if (a.length >= 120) q += 1;
  if (a.length >= 300) q += 1;
  const hits = (mission.qualityKeywords || []).filter((k) => a.includes(k)).length;
  if (hits >= 2) q += 1;
  if (mission.correctKeywords) {
    q = mission.correctKeywords.some((k) => a.includes(k)) ? Math.max(q, 4) : Math.min(q, 2);
  }
  return clamp(q, 1, 5);
}

export async function missionFeedback({ mission, student, answer, image }) {
  return askWithFallback({
    label: `feedback:${mission.id}`,
    prompt: missionFeedbackPrompt({ mission, student, answer, imageAttached: Boolean(image) }),
    images: image ? [image] : [],
    validate: (o) => {
      const praise = str(o?.praise);
      const proTip = str(o?.proTip);
      const twist = str(o?.twist);
      if (!praise || !proTip || !twist) return null;
      return {
        praise,
        proTip,
        twist,
        imageComment: image ? str(o.imageComment) || '' : '',
        quality: clamp(Math.round(Number(o.quality) || 3), 1, 5),
        skillsSeen: strList(o.skillsSeen, 3, 40),
      };
    },
    fallback: () => ({
      praise: mission.fallback.praise,
      proTip: mission.fallback.proTip,
      twist: mission.fallback.twist,
      imageComment: image ? mission.fallback.imageComment : '',
      quality: scriptedQuality(mission, answer),
      skillsSeen: [],
    }),
  });
}

export async function twistReaction({ mission, twist, reply }) {
  return askWithFallback({
    label: `twist:${mission.id}`,
    prompt: twistReactionPrompt({ mission, twist, reply }),
    validate: (o) => (str(o?.reaction) ? { reaction: str(o.reaction) } : null),
    fallback: () => ({ reaction: mission.fallback.twistReaction }),
  });
}

export async function curiosityAnswer({ mission, question, history }) {
  return askWithFallback({
    label: `ask:${mission.id}`,
    prompt: curiosityPrompt({ mission, question, history }),
    validate: (o) => (str(o?.answer, 900) ? { answer: str(o.answer, 900) } : null),
    fallback: () => ({
      answer: `Great question! ${mission.senior.name} will answer this properly once Dishaa's AI is connected. For now: every ${mission.career.toLowerCase()} I know started by being curious, just like you.`,
    }),
  });
}
