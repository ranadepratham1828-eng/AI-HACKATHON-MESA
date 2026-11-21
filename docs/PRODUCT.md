# Disha: product summary

**One line:** Disha lets Class 10 and Class 12 students try real careers through short missions, shows what they're genuinely good at based on what they *did* (not what they *said*), and connects them to real people who've walked that path.

## Users
- **Students, Class 10:** choosing Science, Commerce or Arts.
- **Students, Class 12:** choosing a degree, entrance exams and a college.
- **Parents:** see their child's real strengths next to their own expectations, in their language.
- **Schools and counsellors:** see the whole class and who needs help first.

## The flow
1. **Questionnaire:** subjects liked and disliked, goals, dream, family expectation, budget, and a 1-5 self-rating on 6 traits (the "stated" baseline).
2. **Games:** 5 quick puzzles, one per trait (numbers, logic, spatial, people, creativity).
3. **Missions:** about 10 minutes each, with an AI "senior" from the job. Missions are suggested from the questionnaire. Careers: UX Designer, Forensic Accountant, Urban Planner, Architect.
4. **Real-world step:** an offline task (sketch, hand calculation, photo of a road, measuring your room), uploaded as a photo; the AI comments on the actual work.
5. **Twist, Bonus Challenge, Curiosity Box:** the senior changes the situation, an optional extra task, and "ask me anything". Behaviour here feeds the scores.
6. **Interest Fingerprint and report:** 6-trait radar from behaviour, Stated vs Revealed, career fits, 3 strengths with evidence, 3 new careers, next 7 days.
7. **Career path:** Class 10 stream and subjects, Class 12 degrees, entrance exams and timelines, colleges (fees, cutoffs, rankings from verified sources), first jobs and growth.
8. **Campus Connect:** talk to current students or alumni of that exact course and college.
9. **Counsellor Marketplace:** book verified human counsellors via partner platforms (e.g. Topmate); commission per call.
10. **Parent view:** expectation vs strengths, conversation starters in English, Kannada or Hindi.
11. **School dashboard:** interest heatmap, readiness, "needs a conversation" list, weekly actions.

## Live demo (4 screens)
1. Questionnaire  2. One mission with a photo upload  3. Report with career path and colleges  4. "Talk to a student from this college" cards.
Everything else is shown as designed screens in the deck.

## Money
Schools (per student per year, plus dashboard) · Parents (premium reports, deeper missions) · Commission on counsellor and Campus Connect calls · Colleges pay to reach well-fitting students, opt-in only, never by selling data.

## Behaviour signals behind the scores
Time spent, bonus taken, number of curious questions, enjoyment (1-5), answer quality (1-5, from the AI). See `backend/src/logic/scoring.js`.

Full feature list with P0/P1/P2 priorities: the "Disha Priority Feature List" doc.
