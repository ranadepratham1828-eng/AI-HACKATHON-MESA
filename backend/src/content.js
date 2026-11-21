// Loads the editable content files in /content once at startup.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');
const read = (name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'));

const { missions } = read('missions.json');
const { games } = read('games.json');
const { traits, newCareersByTrait } = read('traits.json');
const { pathways } = read('pathways.json');
const questionnaire = read('questionnaire.json');
const { colleges } = read('colleges.json');
const { profiles: campusProfiles } = read('campus-connect.json');

export const content = { missions, games, traits, newCareersByTrait, pathways, questionnaire, colleges, campusProfiles };

export const TRAIT_IDS = traits.map((t) => t.id);
export const missionById = (id) => missions.find((m) => m.id === id);
export const gameById = (id) => games.find((g) => g.id === id);

/** Mission data safe to send to the app (no answers, rubric or scripted replies). */
export function publicMission(m) {
  const { rubric, fallback, qualityKeywords, correctKeywords, weights, ...rest } = m;
  return { ...rest, traits: Object.keys(weights) };
}

/** Game data safe to send to the app (no correct answer). */
export function publicGame(g) {
  const { answer, explanation, fastMs, ...rest } = g;
  return rest;
}
