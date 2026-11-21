# Disha: try a career before you choose it

Our project for the **Weekend at Mesa AI Hackathon** (Theme 02: Education & Careers).

Disha lets Class 10 and Class 12 students **try real careers through short missions** with an AI "senior", then shows what they're genuinely good at based on what they **did**, not what they **said**. It then gives the full path (stream → degree and exams → colleges → first jobs) and connects them with students and alumni from that exact college.

Product summary: [`docs/PRODUCT.md`](docs/PRODUCT.md) · Notes for Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Run the demo (one command)

You need [Node.js 20+](https://nodejs.org).

```bash
cd backend
npm install
cp .env.example .env      # then paste your free Gemini key into .env (optional)
npm start
```

Open **http://localhost:4747**. The backend serves the web app too.

On the login page, the **Quick demo** buttons need no account:

| Button | What it shows |
|---|---|
| ▶ Play live as Ananya | Questionnaire → games → a mission with photo upload → report |
| ★ Ananya's finished report | Interest Fingerprint, Stated vs Revealed, career path, colleges, Campus Connect |
| Parent view | Expectation vs strengths, conversation starters in English / ಕನ್ನಡ / हिन्दी |
| School counsellor dashboard | Class heatmap, readiness, who needs a conversation first |

Without an AI key, everything still works on scripted demo answers (the top bar shows **DEMO AI**). With a key it shows **AI ON**.

## Free AI key (Google Gemini)

1. Go to <https://aistudio.google.com/apikey>, sign in, and click **Create API key**.
2. Paste it into `backend/.env` as `GEMINI_API_KEY=...`
3. Run `npm run check-ai`. If it says the model isn't found, run `npm run models` and copy a name into `GEMINI_MODEL`.

The free tier has low daily limits: test a few times, don't loop. If the limit is hit during the demo, Disha falls back to scripted answers instead of breaking. Free-tier data may be used by Google, so demo with the Ananya profile, not real students.

## What's built (P0)

- **Accounts:** student, parent (linked by family code) and school counsellor logins, plus one-tap demo accounts
- **Questionnaire:** subjects, goals, dream, family expectation, budget, 1-5 self-ratings
- **Games:** 5 quick puzzles, one per trait
- **Missions:** UX Designer, Forensic Accountant, Urban Planner, Architect, picked from the questionnaire, with photo upload, AI senior feedback, twist, bonus chest and Curiosity Box
- **Report:** Interest Fingerprint radar, Stated vs Revealed, career fits from behaviour, 3 proven strengths, new careers, next 7 days
- **Career path:** stream fit, subjects, degrees, entrance exams and timelines, colleges, first jobs and growth
- **Campus Connect:** talk to current students and alumni of that college (sample profiles)
- **Parent view** and **School dashboard**

## Before the demo: add real college data

`backend/content/colleges.json` has fees, cutoffs and NIRF ranks set to `null` on purpose. Fill 2-3 colleges from **official sources** (nirfindia.org, the college website), with the link in `source` and the date in `lastChecked`. The app then shows them as verified.

## Project layout

```
backend/   Node.js + Express API, content files, tests  (npm test)
frontend/  Pixel-art web app: plain HTML, CSS and JS, no build step
docs/      Product summary
```

## How we work together

1. **Never push directly to `main`.** Work on your own branch and open a pull request.
2. **Pull or merge `main` often.**
3. **Never commit secrets.** Keys go in `backend/.env`, which is git-ignored.
