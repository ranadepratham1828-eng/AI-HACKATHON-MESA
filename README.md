# Dishaa

Our project for the **Weekend at Mesa AI Hackathon** (Theme 02: Education & Careers).

Dishaa helps Class 10 and Class 12 students choose their stream, degree and college with confidence. A student tells us about themselves, takes a 15-minute interactive aptitude and interest assessment, and gets their strengths, career matches, a conversation with an AI career coach, and a personalised career plan with colleges and scholarships.

Product summary: [`docs/PRODUCT.md`](docs/PRODUCT.md) · Notes for Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Live site

- **Landing page:** https://dishaa-blue.vercel.app
- **Product (log in):** https://dishaa-blue.vercel.app/product
- **Live demo (logs straight in):** https://dishaa-blue.vercel.app/demo
- **Admin (Dishaa team):** https://dishaa-blue.vercel.app/product#admin

Dishaa is a paid service, so there is no public sign-up. The Dishaa team creates accounts on the admin page (one at a time, or a whole class at once) and each person is emailed their login with a temporary password, which they change on first login. Enquiries from the landing page's "Request a demo" form appear on the admin page too.

On the login page, the demo buttons need no account:

| Button | What it shows |
|---|---|
| Start as a new student | About you → aptitude assessment → report → coach → career plan |
| See a finished report | Ability profile, self-rating vs measured, career matches, colleges, scholarships |
| Parent view | Expectation vs strengths, conversation starters in English / ಕನ್ನಡ / हिन्दी |
| Counsellor dashboard | Class strengths, completion and who needs a conversation first |

## The student journey

1. **About you:** class, board, current subjects, marks (Classes 9-12), interests, dream job, family expectations, college budget, relocation, and optional details for scholarships.
2. **Aptitude assessment (Dishaa Quest):** 27 interactive questions across 9 abilities: logical, numerical, verbal, spatial and mechanical reasoning, memory, critical thinking, creativity and people skills. This is the only part with a pixel-art style.
3. **Report:** ability scores with evidence, strengths and growth areas, self-rating vs measured, top career matches from 36 careers, career path, colleges and scholarships.
4. **Dishaa Coach:** an AI chat that helps the student settle on one goal.
5. **Career plan:** timeline to the first job, exam preparation, colleges (dream / target / safe) within budget and location, scholarships, budget advice and next 30 days.

Without an AI key everything still works on standard text; the top bar shows **Demo mode**. With a key it shows **AI on**.

## Run it locally

You need [Node.js 20+](https://nodejs.org).

```bash
cd backend
npm install
cp .env.example .env      # then paste your Gemini key into .env (optional)
npm start
```

Open the address it prints (normally **http://localhost:4747**). If that port is busy, Dishaa moves to the next free one.

## Hosting on Vercel

Works with Root Directory set to either the repo root or `backend`. Every push to the default branch redeploys.

1. **Settings → Build and Deployment:** Framework Preset = **Other**.
2. **Settings → Environment Variables:** add `GEMINI_API_KEY` and `ADMIN_KEY` (a long secret for the admin page). For emailed logins also add `RESEND_API_KEY`, `EMAIL_FROM` and `APP_URL` (see `backend/.env.example`).
3. **Storage → Create Database → Upstash (Redis), free plan → Connect to project.** Without it, accounts reset when Vercel restarts the server.
4. **Settings → Deployment Protection:** turn off Vercel Authentication if people outside your team see a Vercel login page.
5. **Redeploy**, then check `https://<your-app>.vercel.app/api/health` for `"configured": true` and `"storage": "redis"`.

## Free AI key (Google Gemini)

1. Go to <https://aistudio.google.com/apikey> and create an API key.
2. Put it in `backend/.env` (local) or Vercel's environment variables (hosted) as `GEMINI_API_KEY`.
3. Locally, run `npm run check-ai` to confirm it works.

The free tier has daily limits; if they run out, Dishaa falls back to standard text instead of breaking.

## Data

All content lives in `backend/content/` as editable JSON: assessment questions, careers, colleges (fees, cutoffs, NIRF ranks with sources), scholarships, Campus Connect sample profiles and exam timelines. College and scholarship figures were researched on 21 Nov 2026 from education websites and are marked as unofficial until confirmed on official sites.

## Project layout

```
backend/          Node.js + Express API, content files, tests (npm test)
backend/public/   The web app: plain HTML, CSS and JS, no build step
docs/             Product summary
```

## How we work together

1. **Never push directly to `main`.** Work on your own branch and open a pull request.
2. **Pull or merge `main` often.**
3. **Never commit secrets.** Keys go in `backend/.env` or Vercel's settings.
