# Disha: context for Claude Code

Disha is our MESA AI Hackathon project (Theme 02: Education & Careers). It helps Class 10 students choose a stream and Class 12 students choose a degree and college by letting them **try careers through missions**, then comparing what they *said* (questionnaire) with what they *did* (behaviour in missions).

Product docs: `docs/PRODUCT.md` (what we're building), `docs/API.md` (backend contract), `docs/DESIGN_BRIEF.md` (UI brief for Claude Design), `docs/AI_SETUP.md` (free AI key).

## Repo layout

```
backend/            Node.js + Express API (no build step)
  content/          Editable JSON: missions, games, pathways, colleges, Campus Connect, questionnaire, traits
  src/app.js        All API routes
  src/ai/           provider.js (Gemini / OpenAI-compatible), prompts.js (every prompt), ask.js (AI + scripted fallback)
  src/logic/        scoring.js (pure maths), missions.js, report.js, school.js
  src/demo.js       "Ananya" demo student
  test/             node:test suites (no AI key needed)
docs/               Product, API, design and AI setup docs
```

## Commands (run inside `backend/`)

- `npm install`, then `cp .env.example .env` and add `GEMINI_API_KEY`
- `npm run dev`: API on http://localhost:8787 with auto-reload
- `npm test`: all tests; must pass before pushing
- `npm run check-ai`: proves the AI key works; `npm run models`: lists usable Gemini models

## Rules for changes

- **Numbers come from `logic/scoring.js`; the AI only writes words.** Keep scores explainable and deterministic.
- **Every AI call needs a scripted fallback** (`askWithFallback`). The demo must work with no key, a bad key or a rate limit. Responses carry `source: "ai" | "scripted"`.
- **Never send answers, rubrics or fallbacks to the app.** Use `publicMission` / `publicGame`.
- **College figures (fees, cutoffs, NIRF rank) only from official sources**, with `source` and `lastChecked` filled. Leave `null` rather than guess.
- **Sample data is labelled** (`sample: true`) and never presented as real people.
- **Tone for students:** an explorer, not a judge. Never say a student can't do something.
- Students are minors: no real personal data in demos, and don't commit `.env` or `backend/data/`.
- Work on your own branch and open a pull request into `main`.
