// Disha web app: plain JavaScript, no build step. Talks to the backend at /api.
import { avatar, arrowLogo, chest, star, trophy } from './sprites.js';

/* ============ Helpers ============ */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const pct = (v, max) => Math.max(0, Math.min(100, Math.round((v / max) * 100)));

const S = {
  token: store.get('disha-token'),
  user: null,
  student: null,
  content: null,
  health: null,
  authTab: 'login',
  signupRole: 'student',
  authError: '',
  q: null,
  g: null,
  m: {},
  reportCareer: null,
  parentLang: 'en',
  requested: new Set(),
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

async function api(path, { method, body, quiet } = {}) {
  const res = await fetch(`/api${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && S.token && !quiet) {
    signOut(false);
    throw new Error('Your session ended. Please log in again.');
  }
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
  return data;
}

async function refreshMe() {
  const me = await api('/auth/me');
  S.user = me.user;
  S.student = me.student;
}

function signIn({ token, user }) {
  S.token = token;
  S.user = user;
  store.set('disha-token', token);
}

function signOut(callApi = true) {
  if (callApi && S.token) api('/auth/logout', { method: 'POST', quiet: true }).catch(() => {});
  S.token = null; S.user = null; S.student = null; S.q = null; S.g = null; S.m = {}; S.requested = new Set();
  store.set('disha-token', null);
  location.hash = '';
  render();
}

/* ============ Routing ============ */
const route = () => {
  const [name = '', arg = ''] = location.hash.slice(1).split('/');
  return { name, arg: decodeURIComponent(arg) };
};
const go = (hash) => {
  if (location.hash.replace(/^#/, '') === hash) render();
  else location.hash = hash;
};
window.addEventListener('hashchange', render);

let renderId = 0;
async function render() {
  const id = ++renderId;
  renderTopbar();
  const app = $('#app');
  if (!S.user) { app.innerHTML = loginView(); afterLogin(); window.scrollTo(0, 0); return; }

  const { name, arg } = route();
  const views = {
    student: { home: homeView, questionnaire: questionnaireView, games: gamesView, missions: missionsView, mission: missionView, report: reportView },
    parent: { parent: parentView },
    school: { school: schoolView },
  }[S.user.role] || {};
  const fallback = { student: 'home', parent: 'parent', school: 'school' }[S.user.role];
  const view = views[name] || views[fallback];

  const result = view(arg);
  if (result instanceof Promise) {
    app.innerHTML = `<p class="loading">${esc(loadingText(name))}</p>`;
    try {
      const html = await result;
      if (id !== renderId) return;
      app.innerHTML = html;
    } catch (err) {
      if (id !== renderId) return;
      app.innerHTML = `<div class="box pink stack"><h2>That didn't load</h2><p>${esc(err.message)}</p><p><button class="btn small" data-act="reload">Try again</button></p></div>`;
    }
  } else {
    app.innerHTML = result;
  }
  bindInputs();
}
const loadingText = (name) => ({ report: 'Building your report', parent: "Preparing your child's report", school: 'Loading your class', missions: 'Loading missions' }[name] || 'Loading');

function renderTopbar() {
  const r = route().name;
  const links = !S.user ? [] : {
    student: [['home', 'Home'], ['questionnaire', 'Questionnaire'], ['games', 'Games'], ['missions', 'Missions'], ['report', 'Report']],
    parent: [['parent', 'My child']],
    school: [['school', 'Class dashboard']],
  }[S.user.role] || [];
  const ai = S.health?.ai;
  $('#topbar').innerHTML = `<div class="topbar-in">
    <a class="logo" href="#">${arrowLogo(3)}<span>DISHA</span></a>
    <nav class="nav" aria-label="Main">${links.map(([h, l]) => `<a href="#${h}" class="${r === h || (r === 'mission' && h === 'missions') ? 'on' : ''}">${l}</a>`).join('')}</nav>
    ${ai ? `<span class="ai-pill ${ai.configured ? 'on' : 'off'}" title="${ai.configured ? esc(ai.model || '') : 'Add a Gemini key in backend/.env'}">${ai.configured ? 'AI ON' : 'DEMO AI'}</span>` : ''}
    ${S.user ? `<span class="small muted">${esc(S.user.name)}</span><button class="btn ghost small" data-act="logout">Log out</button>` : ''}
  </div>`;
}

/* ============ Login ============ */
function loginView() {
  const tab = S.authTab;
  const role = S.signupRole;
  const seniors = ['ux-designer', 'forensic-accountant', 'urban-planner', 'architect'];
  return `<section class="hero">
    <div class="stack-lg">
      <div class="stack">
        ${arrowLogo(8)}
        <p class="eyebrow">MESA AI Hackathon · Education &amp; Careers</p>
        <h1 class="title-pixel">TRY A CAREER<br>BEFORE YOU<br>CHOOSE IT.</h1>
        <p class="muted" style="max-width:52ch">Disha lets Class 10 and 12 students play real career missions with an AI senior, then shows what they're good at based on what they <b>did</b>, not what they <b>said</b>.</p>
      </div>
      <div class="row">${seniors.map((k) => `<div class="box tight" style="padding:8px">${avatar(k, 5)}</div>`).join('')}</div>
      <p class="small muted">Meet your seniors: a UX designer, a forensic accountant, an urban planner and an architect.</p>
    </div>

    <div class="box yellow stack">
      <div class="tabs" role="tablist">
        <button role="tab" class="${tab === 'login' ? 'on' : ''}" data-act="tab" data-tab="login">Log in</button>
        <button role="tab" class="${tab === 'signup' ? 'on' : ''}" data-act="tab" data-tab="signup">Sign up</button>
      </div>
      ${tab === 'login' ? `
        <form id="login-form" class="stack">
          <label>Email<input id="login-email" name="email" type="email" autocomplete="email" required></label>
          <label>Password<input id="login-password" name="password" type="password" autocomplete="current-password" required></label>
          <button class="btn block" type="submit">Log in ▶</button>
        </form>` : `
        <form id="signup-form" class="stack">
          <div class="stack-sm"><span style="font:400 20px var(--f-pixel)">I am a…</span>
            <div class="chips">${[['student', 'Student'], ['parent', 'Parent'], ['school', 'School counsellor']].map(([v, l]) => `<button type="button" class="chip ${role === v ? 'on' : ''}" data-act="role" data-role="${v}">${l}</button>`).join('')}</div>
          </div>
          <label>Name<input id="su-name" name="name" required maxlength="60" autocomplete="name"></label>
          <label>Email<input id="su-email" name="email" type="email" required autocomplete="email"></label>
          <label>Password (6+ characters)<input id="su-password" name="password" type="password" minlength="6" required autocomplete="new-password"></label>
          ${role === 'student' ? `<label>Class<select id="su-cls" name="cls">${['9', '10', '11', '12'].map((c) => `<option ${c === '10' ? 'selected' : ''}>${c}</option>`).join('')}</select></label>` : ''}
          ${role === 'parent' ? `<label>Your child's family code<input id="su-code" name="familyCode" required placeholder="e.g. K7M2QX" style="text-transform:uppercase"></label><p class="small muted">Your child sees this code on their Disha home screen.</p>` : ''}
          ${role === 'school' ? `<label>Class you counsel<input id="su-class" name="classId" value="10B" required></label>` : ''}
          <button class="btn block" type="submit">Create account ▶</button>
        </form>`}
      ${S.authError ? `<p class="small" style="color:var(--pink)">${esc(S.authError)}</p>` : ''}
      <div class="stack-sm">
        <p class="eyebrow">Quick demo</p>
        <div class="demo-list">
          <button class="btn green" data-act="demo" data-as="student">▶ Play live as Ananya (Class 10)</button>
          <button class="btn cyan" data-act="demo" data-as="student-finished">★ Ananya's finished report</button>
          <button class="btn ghost" data-act="demo" data-as="parent">Parent view (Ananya's mother)</button>
          <button class="btn ghost" data-act="demo" data-as="school">School counsellor dashboard</button>
        </div>
      </div>
    </div>
  </section>`;
}

function afterLogin() {
  $('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      signIn(await api('/auth/login', { body: { email: f.get('email'), password: f.get('password') } }));
      S.authError = '';
      await refreshMe();
      go('');
    } catch (err) { S.authError = err.message; render(); }
  });
  $('#signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    body.role = S.signupRole;
    try {
      signIn(await api('/auth/signup', { body }));
      S.authError = '';
      await refreshMe();
      go(S.user.role === 'student' ? 'questionnaire' : '');
    } catch (err) { S.authError = err.message; render(); }
  });
}

/* ============ Student: home ============ */
function homeView() {
  const st = S.student;
  const p = st.progress;
  const xp = Math.round(((p.questionnaireDone ? 1 : 0) + p.gamesPlayed / p.gamesTotal + p.missionsDone / p.missionsTotal + (p.reportReady ? 1 : 0)) / 4 * 100);
  const next = !p.questionnaireDone ? 'questionnaire' : p.gamesPlayed < p.gamesTotal ? 'games' : p.missionsDone < 1 ? 'missions' : 'report';
  const quests = [
    ['questionnaire', '1', 'Questionnaire', 'Tell us about you', p.questionnaireDone ? 'DONE' : '2 MIN', p.questionnaireDone ? 100 : 0],
    ['games', '2', 'Games', 'Five quick puzzles', `${p.gamesPlayed}/${p.gamesTotal}`, pct(p.gamesPlayed, p.gamesTotal)],
    ['missions', '3', 'Missions', 'Try real careers', `${p.missionsDone}/${p.missionsTotal}`, pct(p.missionsDone, p.missionsTotal)],
    ['report', '4', 'Report', 'Your real strengths', p.reportReady ? 'READY' : 'LOCKED', p.reportReady ? 100 : 0],
  ];
  return `<div class="stack-lg">
    <section class="box stack">
      <div class="spread">
        <div class="row">${avatar('student', 6, 'You')}<div class="stack-sm"><p class="eyebrow">Player 1 · Class ${esc(st.profile.cls || '10')}</p><h1>Hi ${esc(st.profile.name || 'there')}!</h1><p class="muted">Try careers like a game. Your actions show what you're really good at.</p></div></div>
        <button class="btn" data-go="${next}">Continue ▶</button>
      </div>
      <div class="stack-sm"><div class="spread small"><span class="eyebrow">Journey XP</span><span class="num">${xp}%</span></div><div class="xpbar"><i style="width:${xp}%"></i></div></div>
    </section>
    <section class="hud">${quests.map(([h, n, t, sub, state, w]) => `
      <a class="box quest" href="#${h}" style="text-decoration:none;color:inherit">
        <span class="eyebrow">Quest ${n}</span><h3>${t}</h3><p class="small muted">${sub}</p>
        <span class="state ${w === 100 ? 'tag green' : 'tag yellow'}">${state}</span>
        <div class="bar"><i style="width:${w}%;--c:var(--green)"></i></div>
      </a>`).join('')}
    </section>
    <section class="box alt spread">
      <div class="stack-sm"><h3>Bring your parents in</h3><p class="small muted">Share this family code. Your parent signs up with it to see your report.</p></div>
      <div class="row"><span class="title-pixel" style="font-size:20px">${esc(st.familyCode)}</span><button class="btn small ghost" data-act="copy" data-text="${esc(st.familyCode)}">Copy</button></div>
    </section>
  </div>`;
}

/* ============ Student: questionnaire ============ */
const Q_STEPS = ['About you', 'Subjects', 'Goals', 'Family', 'About me'];

function questionnaireView() {
  const qc = S.content.questionnaire;
  if (!S.q) {
    const p = S.student.profile || {};
    S.q = {
      step: 0,
      data: {
        name: p.name || '', cls: p.cls || '10', city: p.city || '', likes: [...(p.likes || [])], dislikes: [...(p.dislikes || [])],
        goal: p.goal || qc.goals[0], dream: p.dream || '', hobbies: p.hobbies || '',
        parentExpect: p.parentExpect || '', parentReason: p.parentReason || '', budget: p.budget || 'medium',
        stated: { ...(p.stated || Object.fromEntries(S.content.traits.map((t) => [t.id, 3]))) },
      },
    };
  }
  const { step, data: d } = S.q;
  const field = (id, label, value, extra = '') => `<label>${label}<input id="q-${id}" data-q="${id}" value="${esc(value)}" ${extra}></label>`;
  const area = (id, label, value, ph) => `<label>${label}<textarea id="q-${id}" data-q="${id}" placeholder="${esc(ph)}" style="min-height:80px">${esc(value)}</textarea></label>`;

  const steps = [
    () => `<div class="grid-2">${field('name', 'Your name', d.name, 'maxlength="60"')}
      <label>Class<select id="q-cls" data-q="cls">${qc.classes.map((c) => `<option ${c === d.cls ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      ${field('city', 'City', d.city, 'placeholder="e.g. Bengaluru"')}</div>`,
    () => `<div class="stack"><div class="stack-sm"><h4>Subjects you <span style="color:var(--green)">like</span></h4>
      <div class="chips">${qc.subjects.map((s) => `<button type="button" class="chip ${d.likes.includes(s) ? 'on' : ''}" data-act="subject" data-list="likes" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>
      <div class="stack-sm"><h4>Subjects you <span style="color:var(--pink)">don't like</span></h4>
      <div class="chips">${qc.subjects.map((s) => `<button type="button" class="chip no ${d.dislikes.includes(s) ? 'on' : ''}" data-act="subject" data-list="dislikes" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></div></div>`,
    () => `<div class="stack"><label>Your main goal right now<select id="q-goal" data-q="goal">${qc.goals.map((g) => `<option ${g === d.goal ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      ${area('dream', 'If you could be anything, what would it be?', d.dream, 'Anything goes. Dream big.')}
      ${area('hobbies', 'What do you do for fun?', d.hobbies, 'Sketching, cricket, gaming, cooking…')}</div>`,
    () => `<div class="stack">${field('parentExpect', 'What career does your family expect for you?', d.parentExpect, 'placeholder="e.g. Doctor, Engineer, CA, not sure"')}
      ${area('parentReason', 'Why do they want that?', d.parentReason, "e.g. It's safe and respected")}
      <div class="stack-sm"><h4>Budget for studies</h4>${qc.budgets.map((b) => `<label class="check"><input type="radio" name="budget" data-q="budget" value="${b.id}" ${d.budget === b.id ? 'checked' : ''}> <span>${esc(b.label)}</span></label>`).join('')}</div></div>`,
    () => `<div class="stack"><p class="muted">Rate yourself honestly. Later we'll compare this with what you actually do in the missions.</p>
      ${qc.statedQuestions.map((sq) => `<div class="spread inset"><span>${esc(sq.question)}</span>
        <div class="blocks" role="group" aria-label="${esc(sq.question)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${d.stated[sq.trait] >= n ? 'on' : ''}" data-act="rate" data-trait="${sq.trait}" data-n="${n}" aria-label="${n} of 5">${n}</button>`).join('')}</div></div>`).join('')}
      <p class="small muted">1 = ${esc(qc.scale.minLabel)} · 5 = ${esc(qc.scale.maxLabel)}</p></div>`,
  ];

  return `<section class="box yellow stack" style="max-width:820px;margin:0 auto">
    <div class="spread"><div class="stack-sm"><p class="eyebrow">Quest 1 · Step ${step + 1} of ${Q_STEPS.length}</p><h2>${Q_STEPS[step]}</h2></div>
      <div class="row">${Q_STEPS.map((_, i) => `<span style="width:22px;height:10px;display:inline-block;border:2px solid var(--shadow);background:${i <= step ? 'var(--yellow)' : 'var(--bg-2)'}"></span>`).join('')}</div></div>
    ${steps[step]()}
    <div class="spread">
      <button class="btn ghost" data-act="q-back" ${step === 0 ? 'disabled' : ''}>◀ Back</button>
      ${step < Q_STEPS.length - 1 ? '<button class="btn" data-act="q-next">Next ▶</button>' : '<button class="btn green" data-act="q-save">Save and play the games ▶</button>'}
    </div>
  </section>`;
}

async function saveQuestionnaire() {
  const updated = await api(`/students/${S.student.id}`, { method: 'PATCH', body: S.q.data });
  S.student = updated;
  toast('Saved! +25 XP');
  go('games');
}

/* ============ Student: games ============ */
function gamesView() {
  const games = S.content.games;
  const scores = S.student.games?.scores || {};
  if (!S.g) {
    const idx = games.findIndex((g) => scores[g.id] == null);
    S.g = { idx: idx === -1 ? games.length : idx, phase: 'question', startedAt: Date.now(), fb: null, picked: null };
  }
  const g = S.g;
  if (g.idx >= games.length) {
    return `<section class="box green stack" style="max-width:760px;margin:0 auto">
      <div class="row">${trophy(6)}<div class="stack-sm"><p class="eyebrow">Quest 2 complete</p><h2>All games done!</h2></div></div>
      <div class="stack">${games.map((gm) => `<div class="fit-row"><span>${esc(gm.title)} <span class="small muted">· ${gm.trait}</span></span><div class="bar"><i style="width:${Math.round((scores[gm.id] || 0) * 100)}%;--c:var(--green)"></i></div><span class="num small">${Math.round((scores[gm.id] || 0) * 100)}</span></div>`).join('')}</div>
      <div class="row"><button class="btn" data-go="missions">Start the missions ▶</button><button class="btn ghost small" data-act="games-replay">Play again</button></div>
    </section>`;
  }
  const game = games[g.idx];
  const head = `<div class="spread" style="width:100%;max-width:640px"><span class="eyebrow">Game ${g.idx + 1} of ${games.length}</span><span class="tag cyan">${esc(game.trait)}</span></div>`;

  if (game.type === 'uses') {
    const running = g.phase === 'running';
    const ideas = (g.usesText || '').split('\n').map((s) => s.trim()).filter(Boolean).length;
    return `<section class="box cyan arcade">
      ${head}<h2>${esc(game.title)}</h2><p class="question">${esc(game.question)}</p>
      ${g.phase === 'feedback' ? feedbackPanel(game) : `
        <div class="timer stack-sm"><div class="spread small"><span>Time left</span><span class="num" id="uses-left">${running ? g.left : game.seconds}s</span></div><div class="bar"><i id="uses-bar" style="width:${running ? pct(g.left, game.seconds) : 100}%;--c:var(--yellow)"></i></div></div>
        <textarea id="uses-text" style="max-width:640px" placeholder="One idea per line" ${running ? '' : 'disabled'}>${esc(g.usesText || '')}</textarea>
        <p class="small"><span id="uses-count" class="num">${ideas}</span> ideas</p>
        ${running ? '<button class="btn green" data-act="uses-done">Done ▶</button>' : `<button class="btn" data-act="uses-start">Start the ${game.seconds}s timer ▶</button>`}`}
    </section>`;
  }

  return `<section class="box cyan arcade">
    ${head}<h2>${esc(game.title)}</h2><p class="question">${esc(game.question)}</p>
    <div class="options">${game.options.map((o, i) => {
      let cls = '';
      if (g.phase === 'feedback') {
        if (i === g.fb.correctOption) cls = 'right';
        else if (i === g.picked) cls = 'wrong';
      }
      return `<button class="option ${cls}" data-act="answer" data-i="${i}" ${g.phase === 'feedback' ? 'disabled' : ''}>${String.fromCharCode(65 + i)}. ${esc(o)}</button>`;
    }).join('')}</div>
    ${g.phase === 'feedback' ? feedbackPanel(game) : ''}
  </section>`;
}

function feedbackPanel(game) {
  const fb = S.g.fb;
  const good = fb.correct === true || (fb.correct === null && fb.score >= 0.5);
  return `<div class="inset stack-sm" style="max-width:640px;text-align:left">
    <h3 style="color:${good ? 'var(--green)' : 'var(--yellow)'}">${fb.correct === null ? `Score: ${Math.round(fb.score * 100)}` : good ? 'Correct! +20 XP' : 'Not quite!'}</h3>
    <p>${esc(fb.explanation || '')}</p>
  </div>
  <button class="btn" data-act="game-next">${S.g.idx + 1 < S.content.games.length ? 'Next game ▶' : 'See results ▶'}</button>`;
}

async function submitGame(game, answer) {
  const ms = Date.now() - S.g.startedAt;
  const out = await api(`/students/${S.student.id}/games`, { body: { results: { [game.id]: { answer, ms } } } });
  S.student.games.scores = out.scores;
  S.student.progress.gamesPlayed = Object.keys(out.scores).length;
  S.g.fb = out.feedback[0];
  S.g.phase = 'feedback';
  render();
}

let usesTimer;
function startUses(game) {
  S.g.phase = 'running';
  S.g.left = game.seconds;
  S.g.startedAt = Date.now();
  render();
  clearInterval(usesTimer);
  usesTimer = setInterval(() => {
    if (route().name !== 'games' || S.g?.phase !== 'running') { clearInterval(usesTimer); return; }
    S.g.left = Math.max(0, game.seconds - Math.floor((Date.now() - S.g.startedAt) / 1000));
    const left = $('#uses-left');
    if (left) left.textContent = `${S.g.left}s`;
    const bar = $('#uses-bar');
    if (bar) bar.style.width = `${pct(S.g.left, game.seconds)}%`;
    if (S.g.left <= 0) { clearInterval(usesTimer); submitGame(game, S.g.usesText || '').catch((e) => toast(e.message)); }
  }, 250);
  setTimeout(() => $('#uses-text')?.focus(), 50);
}

/* ============ Student: missions ============ */
async function missionsView() {
  const { picks } = await api(`/students/${S.student.id}/mission-picks`);
  const byId = Object.fromEntries(S.content.missions.map((m) => [m.id, m]));
  const best = picks.find((p) => !p.done);
  return `<div class="stack-lg">
    <div class="stack-sm"><p class="eyebrow">Quest 3 · ${S.student.progress.missionsDone} of ${S.content.missions.length} done</p><h1>Choose a career to try</h1>
      <p class="muted">Each mission is about 10 minutes with a senior from that job. Picked for you from your questionnaire.</p></div>
    <div class="grid-2">${picks.map((p) => {
      const m = byId[p.missionId];
      return `<article class="box ${p.done ? 'green' : p === best ? 'yellow' : ''} stack">
        <div class="senior"><div class="avatar">${avatar(m.id, 6, m.senior.name)}</div>
          <div class="stack-sm"><div class="row">${p === best ? '<span class="tag yellow">BEST MATCH FOR YOU</span>' : ''}${p.done ? '<span class="tag green">DONE ✓</span>' : ''}</div>
            <h3>${esc(m.career)}</h3><p class="small muted">with ${esc(m.senior.name)}, ${esc(m.senior.role)}</p></div></div>
        <p>${esc(m.tagline)}</p>
        <div class="spread"><span class="small muted">${esc(p.reason)} · ~${m.durationMin} min</span>
          <button class="btn ${p.done ? 'ghost' : ''} small" data-go="mission/${m.id}">${p.done ? 'Play again' : 'Start mission ▶'}</button></div>
      </article>`;
    }).join('')}</div>
    ${S.student.progress.missionsDone ? '<div><button class="btn cyan" data-go="report">See my report ★</button></div>' : ''}
  </div>`;
}

/* ============ Student: one mission ============ */
function missionRuntime(id) {
  if (!S.m[id]) {
    const saved = S.student.missions?.[id];
    S.m[id] = {
      answer: saved?.answer || '', image: null, feedback: saved?.feedback || null, twistReply: saved?.twistReply || '',
      reaction: saved?.twistReaction || null, bonusOpen: Boolean(saved?.bonusTaken), bonusAnswer: saved?.bonusAnswer || '',
      bonusSaved: Boolean(saved?.bonusAnswer), questions: [...(saved?.questions || [])], ask: '', enjoy: saved?.enjoy || 0,
      busy: '', openedAt: Date.now(), elapsed: saved?.status === 'done' ? 0 : Number(saved?.timeMs) || 0,
    };
    if (!saved || saved.status === 'done') {
      api(`/students/${S.student.id}/missions/${id}/start`, { method: 'POST' }).catch(() => {});
    }
  }
  return S.m[id];
}

function missionView(id) {
  const m = S.content.missions.find((x) => x.id === id);
  if (!m) return '<div class="box pink"><h2>Mission not found</h2><p><a href="#missions">Back to missions</a></p></div>';
  const r = missionRuntime(id);
  const sn = esc(m.senior.name);
  const mat = m.material;
  const fb = r.feedback;

  const left = `<div class="stack">
    <a href="#missions" class="small">◀ All missions</a>
    <div class="box stack"><div class="senior"><div class="avatar">${avatar(m.id, 7, m.senior.name)}</div>
      <div class="stack-sm" style="flex:1"><p class="eyebrow">${esc(m.career)} mission</p><div class="bubble">${esc(m.senior.intro)}</div></div></div></div>
    <div class="box stack"><h3>${esc(mat.title)}</h3><p>${esc(mat.intro)}</p>
      ${mat.table ? `<div class="table-scroll"><table><thead><tr>${mat.table.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${mat.table.rows.map((row) => `<tr>${row.map((c) => `<td class="num">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      ${mat.bullets?.length ? `<ul class="clean">${mat.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</div>
    <div class="box yellow stack-sm"><p class="eyebrow">Your task</p><p style="font:400 24px/1.2 var(--f-pixel)">${esc(m.task)}</p></div>
  </div>`;

  const right = `<div class="stack">
    <div class="box stack">
      <label>Your answer<textarea id="m-answer" data-m="answer" placeholder="Think like a ${esc(m.career.toLowerCase())}…">${esc(r.answer)}</textarea></label>
      <div class="stack-sm"><p class="eyebrow">Real-world step</p><p>${esc(m.realWorldStep)}</p>
        <label class="photo-drop" for="m-photo">
          ${r.image ? `<img src="${r.image.dataUrl}" alt="Your uploaded work" class="photo-preview">` : `<span style="font:400 22px var(--f-pixel)">📷 Upload a photo of your work</span><span class="small muted">JPG or PNG, taken on your phone is fine</span>`}
        </label>
        <input id="m-photo" type="file" accept="image/*" hidden>
        ${r.image ? '<button class="btn ghost small" data-act="photo-remove">Remove photo</button>' : ''}
      </div>
      ${r.busy === 'submit' ? `<p class="loading">${sn} is reading your work</p>` : `<button class="btn green" data-act="m-submit">${fb ? 'Send again' : `Send to ${sn}`} ▶</button>`}
    </div>

    ${fb ? `<div class="box cyan stack"><div class="senior"><div class="avatar">${avatar(m.id, 5)}</div><div class="stack" style="flex:1">
        <div class="bubble stack-sm">
          <div class="feedback-item"><span class="ico" style="color:#b8860b">★</span><p>${esc(fb.praise)}</p></div>
          ${fb.imageComment ? `<div class="feedback-item"><span class="ico">▣</span><p>${esc(fb.imageComment)}</p></div>` : ''}
          <div class="feedback-item"><span class="ico">+</span><p><b>A pro would:</b> ${esc(fb.proTip)}</p></div>
        </div>
        ${fb.skillsSeen?.length ? `<div class="chips">${fb.skillsSeen.map((s) => `<span class="tag green">${esc(s)}</span>`).join('')}</div>` : ''}
      </div></div>
      <div class="inset stack-sm" style="border-color:var(--pink)"><p class="eyebrow" style="color:var(--pink)">Twist!</p><p>${esc(fb.twist)}</p>
        ${r.reaction ? `<p class="small muted">You: ${esc(r.twistReply)}</p><div class="bubble">${esc(r.reaction.reaction)}</div>` : `
          <textarea id="m-twist" data-m="twistReply" style="min-height:70px" placeholder="What would you do now?">${esc(r.twistReply)}</textarea>
          ${r.busy === 'twist' ? `<p class="loading">${sn} is thinking</p>` : '<button class="btn pink small" data-act="m-twist">Reply ▶</button>'}`}
      </div>
      <p class="small muted">${fb.source === 'ai' ? 'Feedback written by AI' : 'Demo feedback (AI not connected)'}</p>
    </div>` : ''}

    <div class="box stack">
      <div class="chest">${chest(r.bonusOpen, 6)}<div class="stack-sm"><h3>Bonus challenge</h3><p class="small muted">Optional. Nobody forces you.</p></div></div>
      ${r.bonusOpen ? `<p>${esc(m.bonus)}</p><textarea id="m-bonus" data-m="bonusAnswer" style="min-height:80px">${esc(r.bonusAnswer)}</textarea>
        <button class="btn small" data-act="m-bonus">${r.bonusSaved ? 'Update bonus answer' : 'Save bonus answer'}</button>` : '<button class="btn small" data-act="m-bonus-open">Open the chest</button>'}
    </div>

    <div class="box stack">
      <h3>Curious? Ask ${sn} anything</h3>
      ${r.questions.map((q) => `<div class="stack-sm"><p class="small"><b>You:</b> ${esc(q.q)}</p><div class="bubble">${esc(q.a)}</div></div>`).join('')}
      <div class="row"><input id="m-ask" data-m="ask" value="${esc(r.ask)}" placeholder="e.g. What does a normal day look like?" style="flex:1;min-width:200px">
        ${r.busy === 'ask' ? '<span class="loading">Thinking</span>' : '<button class="btn cyan small" data-act="m-ask">Ask</button>'}</div>
    </div>

    ${fb ? `<div class="box green stack">
      <h3>How much did you enjoy this mission?</h3>
      <div class="row">${[1, 2, 3, 4, 5].map((n) => `<button class="btn ghost small" style="padding:6px" data-act="m-enjoy" data-n="${n}" aria-label="${n} of 5">${star(r.enjoy >= n, 4)}</button>`).join('')}</div>
      <button class="btn green" data-act="m-finish" ${r.enjoy ? '' : 'disabled'}>Finish mission ✓</button>
    </div>` : ''}
  </div>`;

  return `<div class="mission-layout">${left}${right}</div>`;
}

async function readPhoto(file) {
  if (!file) return null;
  if (file.size > 20e6) throw new Error('That photo is over 20 MB. Try a smaller one.');
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', 0.85) };
  } catch {
    if (file.size > 7.5e6) throw new Error("Couldn't shrink that photo. Try a JPG or PNG under 7 MB.");
    const dataUrl = await new Promise((ok, fail) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = () => fail(new Error("Couldn't read that file."));
      fr.readAsDataURL(file);
    });
    return { dataUrl };
  }
}

async function missionAction(act, id, el) {
  const r = S.m[id];
  const base = `/students/${S.student.id}/missions/${id}`;
  if (act === 'm-submit') {
    if (r.answer.trim().length < 10) return toast('Write a bit more first (at least a sentence).');
    r.busy = 'submit'; render();
    try {
      const out = await api(`${base}/submit`, { body: { answer: r.answer, image: r.image?.dataUrl } });
      Object.assign(r, { feedback: out.feedback, reaction: null, twistReply: '' });
      toast('+50 XP');
    } finally { r.busy = ''; render(); }
  } else if (act === 'm-twist') {
    if (!r.twistReply.trim()) return toast('Type your reply first.');
    r.busy = 'twist'; render();
    try { r.reaction = (await api(`${base}/twist`, { body: { reply: r.twistReply } })).reaction; toast('+30 XP: you adapted!'); }
    finally { r.busy = ''; render(); }
  } else if (act === 'm-bonus-open') {
    r.bonusOpen = true;
    await api(`${base}/bonus`, { method: 'POST' });
    toast('Bonus unlocked! +20 XP');
    render();
  } else if (act === 'm-bonus') {
    await api(`${base}/bonus`, { body: { answer: r.bonusAnswer } });
    r.bonusSaved = true;
    toast('Bonus saved');
    render();
  } else if (act === 'm-ask') {
    if (!r.ask.trim()) return;
    r.busy = 'ask'; render();
    try {
      const out = await api(`${base}/ask`, { body: { question: r.ask } });
      r.questions = out.questions;
      r.ask = '';
    } finally { r.busy = ''; render(); }
  } else if (act === 'm-enjoy') {
    r.enjoy = Number(el.dataset.n); render();
  } else if (act === 'm-finish') {
    const timeMs = r.elapsed + (Date.now() - r.openedAt);
    await api(`${base}/finish`, { body: { enjoy: r.enjoy, timeMs } });
    delete S.m[id];
    await refreshMe();
    toast('Mission complete! +100 XP');
    go(S.student.progress.missionsDone >= 1 ? 'report' : 'missions');
  }
}

/* ============ Charts ============ */
function radar(stated, did) {
  const traits = S.content.traits.map((t) => t.id);
  const W = 420; const H = 340; const cx = 210; const cy = 172; const R = 112;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / traits.length;
    const r = (R * Math.max(0, v || 0)) / 5;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (vals) => traits.map((t, i) => pt(i, vals[t]).map((n) => n.toFixed(1)).join(',')).join(' ');
  const ring = (k) => traits.map((_, i) => pt(i, k).map((n) => n.toFixed(1)).join(',')).join(' ');
  const labels = traits.map((t, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / traits.length;
    const x = cx + (R + 20) * Math.cos(a);
    const y = cy + (R + 20) * Math.sin(a);
    const anchor = Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle';
    const dy = Math.sin(a) < -0.5 ? -8 : Math.sin(a) > 0.5 ? 14 : 4;
    return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}" fill="var(--ink)" font-size="14">${t}</text>
      <text x="${x.toFixed(1)}" y="${(y + dy + 16).toFixed(1)}" text-anchor="${anchor}" fill="var(--yellow)" font-size="13">${did[t] == null ? 'not tested' : did[t].toFixed(1)}</text>`;
  }).join('');
  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="Interest Fingerprint radar: what you said compared with what you did" shape-rendering="crispEdges">
    ${[1, 2, 3, 4, 5].map((k) => `<polygon points="${ring(k)}" fill="none" stroke="var(--line)" stroke-width="${k === 5 ? 3 : 1.5}"/>`).join('')}
    ${traits.map((_, i) => { const [x, y] = pt(i, 5); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1.5"/>`; }).join('')}
    <polygon points="${poly(stated)}" fill="none" stroke="var(--muted)" stroke-width="3" stroke-dasharray="6 5"/>
    <polygon points="${poly(did)}" fill="var(--yellow)" fill-opacity=".32" stroke="var(--yellow)" stroke-width="4"/>
    ${traits.map((t, i) => { if (did[t] == null) return ''; const [x, y] = pt(i, did[t]); return `<rect x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="10" height="10" fill="var(--yellow)" stroke="var(--shadow)" stroke-width="2"/>`; }).join('')}
    ${labels}
  </svg>`;
}

function fingerprintBlock(report) {
  return `<div class="stack">${radar(report.stated, report.fingerprint)}
    <div class="legend"><span><i style="background:var(--yellow)"></i>What you did</span><span><i style="background:var(--muted)"></i>What you said</span></div></div>`;
}

/* ============ Student: report ============ */
async function reportView() {
  if (!S.student.progress.missionsDone) {
    return `<div class="box yellow stack" style="max-width:640px;margin:0 auto"><h2>Your report unlocks after one mission</h2>
      <p class="muted">Play at least one career mission. The more you play, the stronger your Interest Fingerprint.</p><div><button class="btn" data-go="missions">Go to missions ▶</button></div></div>`;
  }
  const [report, rec] = await Promise.all([api(`/students/${S.student.id}/report`), api(`/students/${S.student.id}/recommendations`)]);
  const n = report.narrative;
  const svr = report.statedVsRevealed;
  const surprise = svr.biggestSurprise;
  const paths = rec.careerPaths;
  const selected = paths.find((p) => p.missionId === S.reportCareer) || paths[0];
  const cc = await api(`/campus-connect?missionId=${encodeURIComponent(selected.missionId)}`);
  const top = report.topMatch;

  return `<div class="stack-lg">
    <section class="box yellow stack">
      <div class="row">${trophy(7)}<div class="stack-sm" style="flex:1;min-width:240px"><p class="eyebrow">Your Disha report · ${report.missionsDone} mission${report.missionsDone > 1 ? 's' : ''} · ${report.gamesPlayed} games</p>
        <h1>${esc(n.headline)}</h1></div></div>
      ${top ? `<div class="row"><span class="tag green">TOP MATCH: ${esc(top.career.toUpperCase())} · ${top.fit}% FIT</span><span class="tag muted">${report.narrativeSource === 'ai' ? 'Written by AI from your answers' : 'Demo text (AI not connected)'}</span></div>` : ''}
    </section>

    <section class="grid-2">
      <div class="box stack"><div class="stack-sm"><p class="eyebrow">Interest Fingerprint</p><h2>Based on what you did</h2></div>${fingerprintBlock(report)}</div>
      <div class="box stack"><div class="stack-sm"><p class="eyebrow">Said vs did</p><h2>What surprised us</h2></div>
        ${surprise ? `<div class="inset" style="border-color:var(--yellow)"><p style="font:400 24px/1.2 var(--f-pixel)">You rated yourself <span style="color:var(--muted)">${surprise.stated}/5</span> for ${esc(surprise.trait)}, but your actions showed <span style="color:var(--yellow)">${surprise.revealed}/5</span>.</p>${n.surprise && report.narrativeSource === 'ai' ? `<p class="small muted" style="margin-top:6px">${esc(n.surprise)}</p>` : ''}</div>` : ''}
        <div class="stack-sm">${svr.rows.map((row) => `<div class="svr-row"><span class="small">${esc(row.trait)}</span>
          <div class="svr-track">${row.stated != null ? `<span class="said" style="left:${((row.stated - 1) / 4) * 100}%" title="Said ${row.stated}"></span>` : ''}${row.revealed != null ? `<span class="did" style="left:${((row.revealed - 1) / 4) * 100}%" title="Did ${row.revealed}"></span>` : ''}</div>
          <span class="small num ${row.gap > 0 ? '' : 'muted'}">${row.gap == null ? '—' : `${row.gap > 0 ? '+' : ''}${row.gap}`}</span></div>`).join('')}</div>
        <div class="legend"><span><i style="background:var(--muted)"></i>Said</span><span><i style="background:var(--yellow)"></i>Did</span></div>
      </div>
    </section>

    <section class="box stack"><div class="stack-sm"><p class="eyebrow">Career matches</p><h2>How each mission went</h2></div>
      ${report.fits.map((f) => `<div class="fit-row"><span>${esc(f.career)}</span><div class="bar"><i style="width:${f.fit}%;--c:${f === report.fits[0] ? 'var(--green)' : 'var(--cyan)'}"></i></div><span class="num">${f.fit}%</span></div>`).join('')}
      <div class="table-scroll"><table><thead><tr><th>Mission</th><th>Time</th><th>Bonus</th><th>Questions</th><th>Enjoyed</th><th>Answer quality</th></tr></thead>
        <tbody>${report.fits.map((f) => `<tr><td>${esc(f.career)}</td><td class="num">${f.behaviour.timeMinutes} min</td><td>${f.behaviour.bonusTaken ? 'Yes' : 'No'}</td><td class="num">${f.behaviour.questionsAsked}</td><td class="num">${f.behaviour.enjoyment ?? '—'}/5</td><td class="num">${f.behaviour.answerQuality ?? '—'}/5</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Fit comes from what you did: enjoyment, answer quality, taking the bonus, curious questions and time spent.</p>
    </section>

    <section class="stack"><h2>Your 3 strengths, proven</h2>
      <div class="grid-3">${n.strengths.map((s) => `<div class="box green stack-sm"><h3>${esc(s.name)}</h3><p class="small">${esc(s.evidence)}</p>${s.whyItMatters ? `<p class="small muted">${esc(s.whyItMatters)}</p>` : ''}</div>`).join('')}</div>
    </section>

    <section class="box cyan stack" id="career-path">
      <div class="spread"><div class="stack-sm"><p class="eyebrow">Career path</p><h2>${esc(selected.career)}: the full route</h2></div>
        <div class="chips">${paths.map((p) => `<button class="chip ${p === selected ? 'on' : ''}" data-act="pick-career" data-id="${p.missionId}">${esc(p.career)} · ${p.fit}%</button>`).join('')}</div></div>
      <p>${esc(selected.why)}</p>
      ${pathSteps(selected, rec)}
    </section>

    <section class="stack" id="colleges">
      <div class="stack-sm"><p class="eyebrow">Colleges for ${esc(selected.career)}</p><h2>Where to study</h2></div>
      <div class="grid-3">${selected.colleges.map((c) => `<div class="box stack-sm">
        <h4>${esc(c.name)}</h4><p class="small muted">${esc(c.city)} · ${esc(c.course)} · via ${esc(c.entrance)}</p>
        <div class="inset small stack-sm">
          <div class="stack-sm"><span class="muted">Fees</span><b>${c.feesNote ? esc(c.feesNote) : c.feesPerYearINR ? `₹${Number(c.feesPerYearINR).toLocaleString('en-IN')} / year` : '—'}</b></div>
          <div class="stack-sm"><span class="muted">Cutoff</span><b>${c.cutoff ? esc(c.cutoff) : '—'}</b></div>
          <div class="stack-sm"><span class="muted">NIRF</span><b>${c.nirfRank ? esc(c.nirfRank) : 'Not in NIRF list'}</b></div>
        </div>
        ${c.verified ? `<span class="tag green">Verified · ${esc(c.lastChecked)}</span>` : c.source ? `<span class="small muted">Unofficial source, checked ${esc(c.lastChecked)}: <a href="${esc(c.source)}" target="_blank" rel="noopener">view</a></span>` : '<span class="tag muted">Figures coming soon</span>'}
        ${c.campusConnectCount ? `<a class="small" href="#" data-act="scroll" data-target="campus">Talk to ${c.campusConnectCount} student${c.campusConnectCount > 1 ? 's' : ''} from here ▶</a>` : ''}
      </div>`).join('')}</div>
    </section>

    <section class="stack" id="campus">
      <div class="stack-sm"><p class="eyebrow">Campus Connect</p><h2>Talk to a student from this college</h2><p class="muted">Hear what it's really like: classes, culture, placements and hostel life.</p></div>
      <div class="grid-3">${cc.profiles.map((p) => personCard(p)).join('')}</div>
      <p class="small muted">Sample profiles for the demo. Real students join with a verified college email.</p>
    </section>

    <section class="grid-2">
      <div class="box stack"><h3>3 careers you may not know</h3>${n.newCareers.map((c) => `<div class="stack-sm"><h4 style="color:var(--yellow)">${esc(c.name)}</h4><p class="small">${esc(c.why)}</p></div>`).join('')}</div>
      <div class="box stack"><h3>Your next 7 days</h3>${n.next7Days.map((x, i) => `<label class="check"><input type="checkbox" id="next-${i}"> <span>${esc(x)}</span></label>`).join('')}</div>
    </section>
  </div>`;
}

function pathSteps(p, rec) {
  const pw = p.pathway;
  if (!pw) return '';
  const stream = rec.stream;
  const step = (title, body, last = false) => `<div class="path-step"><div style="display:grid;justify-items:center"><span class="dot"></span>${last ? '' : '<span class="line" style="height:100%"></span>'}</div><div class="stack-sm"><h4>${title}</h4>${body}</div></div>`;
  return `<div class="path">
    ${step('After Class 10: stream and subjects', `<p>${esc(pw.streamNote)}</p>
      <div class="chips">${pw.streams.map((s) => `<span class="tag green">${esc(s)}</span>`).join('')}${pw.subjects.map((s) => `<span class="tag muted">${esc(s)}</span>`).join('')}</div>
      ${stream ? `<div class="inset stack-sm"><p class="small eyebrow">Stream fit for you</p>${stream.scores.map((s) => `<div class="fit-row"><span class="small">${esc(s.stream)}</span><div class="bar"><i style="width:${s.fit}%;--c:${s.stream === stream.recommended ? 'var(--green)' : 'var(--line)'}"></i></div><span class="small num">${s.fit}</span></div>`).join('')}</div>` : ''}`)}
    ${step('Class 12: degree and entrance exams', `<ul class="clean">${pw.degrees.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      <p class="small"><b>Exams:</b> ${pw.exams.map(esc).join(' · ')}</p>
      ${pw.examTimeline?.length ? `<ul class="clean small muted">${pw.examTimeline.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><p class="small muted">Dates as reported on ${esc(pw.datesCheckedOn || '')}; always confirm on the official exam site.</p>` : ''}`)}
    ${step('College', `<p class="small">${pw.collegeTypes.map(esc).join(' · ')}</p><a class="small" href="#" data-act="scroll" data-target="colleges">See ${p.colleges.length} colleges below ▶</a>`)}
    ${step('After the degree', pw.afterDegree ? `<p class="small"><b>First jobs:</b> ${pw.afterDegree.firstJobs.map(esc).join(' · ')}</p><p class="small"><b>Growth:</b> ${pw.afterDegree.growth.map(esc).join(' · ')}</p>` : '', true)}
  </div>`;
}

function personCard(p) {
  const requested = S.requested.has(p.id);
  return `<article class="box person">
    <div class="row">${avatar(p.type === 'alumnus' ? 'parent' : 'student', 4)}<div class="stack-sm"><h4>${esc(p.name)}</h4>
      <span class="tag ${p.type === 'alumnus' ? 'cyan' : 'green'}">${p.type === 'alumnus' ? 'ALUMNUS' : 'CURRENT STUDENT'}</span></div></div>
    <p class="small muted">${esc(p.course)} · ${esc(p.year)} · ${esc(p.college?.name || '')}</p>
    <p class="small">${esc(p.about)}</p>
    <div class="chips">${p.topics.map((t) => `<span class="tag muted">${esc(t)}</span>`).join('')}</div>
    <div class="spread small"><span>${p.languages.map(esc).join(', ')}</span><b class="num">₹${p.pricePer15MinINR} / 15 min</b></div>
    ${S.user.role === 'school' ? '' : `<button class="btn small ${requested ? 'ghost' : 'green'}" data-act="cc-request" data-id="${p.id}" ${requested ? 'disabled' : ''}>${requested ? 'Request sent ✓' : 'Request a chat'}</button>`}
  </article>`;
}

/* ============ Parent ============ */
async function parentView() {
  const sid = S.student?.id;
  if (!sid) return '<div class="box pink"><h2>No child linked</h2></div>';
  const lang = S.parentLang;
  const [pr, report] = await Promise.all([api(`/students/${sid}/parent-report?lang=${lang}`), api(`/students/${sid}/report`)]);
  const name = esc(pr.childName || 'Your child');
  const share = `${pr.childName || 'My child'}'s Disha report: ${pr.summary}`;
  return `<div class="stack-lg">
    <section class="box yellow stack">
      <div class="spread"><div class="row">${avatar('parent', 6)}<div class="stack-sm"><p class="eyebrow">Parent view</p><h1>${name}'s strengths</h1></div></div>
        <div class="chips">${[['en', 'English'], ['kn', 'ಕನ್ನಡ'], ['hi', 'हिन्दी']].map(([v, l]) => `<button class="chip ${lang === v ? 'on' : ''}" data-act="lang" data-lang="${v}">${l}</button>`).join('')}</div></div>
      ${pr.requestedLanguage && pr.language !== pr.requestedLanguage ? '<p class="small" style="color:var(--orange)">Translation needs the AI to be connected. Showing English for now.</p>' : ''}
      <p style="font-size:17px">${esc(pr.summary)}</p>
    </section>
    <section class="grid-2">
      <div class="box stack"><p class="eyebrow">What ${name} showed</p>${fingerprintBlock(report)}
        ${pr.topMatch ? `<span class="tag green">MOST ENGAGED IN: ${esc(pr.topMatch.career.toUpperCase())}</span>` : ''}</div>
      <div class="stack">
        <div class="box stack-sm"><p class="eyebrow">Your hope</p><h3>${esc(pr.parentExpect || 'Not given')}</h3>${pr.parentReason ? `<p class="small muted">"${esc(pr.parentReason)}"</p>` : ''}</div>
        <div class="box green stack-sm"><p class="eyebrow" style="color:var(--green)">Where it matches</p><p>${esc(pr.match)}</p></div>
        <div class="box pink stack-sm"><p class="eyebrow" style="color:var(--pink)">Where it differs</p><p>${esc(pr.differ)}</p></div>
      </div>
    </section>
    <section class="box cyan stack"><h2>3 ways to start the conversation</h2>
      ${pr.starters.map((s, i) => `<div class="inset row"><span class="title-pixel" style="font-size:16px">${i + 1}</span><p style="flex:1">${esc(s)}</p></div>`).join('')}
      <div class="row"><a class="btn green" href="https://wa.me/?text=${encodeURIComponent(share)}" target="_blank" rel="noopener">Share on WhatsApp</a>
        <span class="small muted">${pr.source === 'ai' ? 'Written by AI' : 'Demo text (AI not connected)'}</span></div>
    </section>
  </div>`;
}

/* ============ School ============ */
async function schoolView() {
  const d = await api(`/schools/classes/${encodeURIComponent(S.user.classId)}/dashboard`);
  const maxHeat = Math.max(1, ...d.interestHeatmap.map((h) => h.students));
  return `<div class="stack-lg">
    <section class="box yellow stack"><div class="row">${avatar('school', 6)}<div class="stack-sm"><p class="eyebrow">Counsellor dashboard</p><h1>${esc(d.className)}</h1>
      <p class="muted">One counsellor, ${d.totalStudents} students: who to talk to first.</p></div></div></section>
    <section class="hud">
      <div class="box stack-sm"><p class="eyebrow">Students</p><p class="title-pixel num">${d.totalStudents}</p><p class="small muted">${d.sampleStudents} are sample students for the demo</p></div>
      <div class="box green stack-sm"><p class="eyebrow">Stream-ready</p><p class="title-pixel num">${d.readiness.percent}%</p><p class="small muted">${d.readiness.exploredAtLeast3} explored 3+ careers</p></div>
      <div class="box pink stack-sm"><p class="eyebrow">Need a conversation</p><p class="title-pixel num">${d.needsConversation.length}</p><p class="small muted">Sorted by urgency below</p></div>
    </section>
    <section class="grid-2">
      <div class="box stack"><h3>Class interest heatmap</h3><p class="small muted">Students whose strongest trait is…</p>
        ${d.interestHeatmap.map((h) => `<div class="fit-row"><span>${esc(h.trait)}</span><div class="bar"><i style="width:${pct(h.students, maxHeat)}%;--c:var(--yellow)"></i></div><span class="num">${h.students}</span></div>`).join('')}</div>
      <div class="box cyan stack"><h3>This week's actions</h3>${d.weeklyActions.map((a, i) => `<label class="check"><input type="checkbox" id="act-${i}"> <span>${esc(a)}</span></label>`).join('')}</div>
    </section>
    <section class="box stack"><h3>Needs a conversation</h3>
      <div class="table-scroll"><table><thead><tr><th>Student</th><th>Why</th><th>Careers tried</th><th>Parents hope</th><th>Leans towards</th></tr></thead>
      <tbody>${d.needsConversation.map((s) => `<tr class="${s.sample ? '' : 'flag'}"><td><b>${esc(s.name)}</b>${s.sample ? '' : ' <span class="tag yellow">LIVE</span>'}</td><td class="small">${s.reasons.map(esc).join('<br>')}</td><td class="num">${s.careersExplored}</td><td>${esc(s.parentExpect || '—')}</td><td>${esc(s.topCareer || '—')}</td></tr>`).join('')}</tbody></table></div>
    </section>
  </div>`;
}

/* ============ Events ============ */
function bindInputs() {
  $$('[data-q]').forEach((el) => el.addEventListener('input', () => { if (S.q) S.q.data[el.dataset.q] = el.value; }));
  $$('[data-q][type=radio]').forEach((el) => el.addEventListener('change', () => { if (S.q && el.checked) S.q.data.budget = el.value; }));
  const { name, arg } = route();
  if (name === 'mission' && S.m[arg]) {
    $$('[data-m]').forEach((el) => el.addEventListener('input', () => { S.m[arg][el.dataset.m] = el.value; }));
    $('#m-ask')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); missionAction('m-ask', arg).catch((err) => toast(err.message)); } });
    $('#m-photo')?.addEventListener('change', async (e) => {
      try {
        S.m[arg].image = await readPhoto(e.target.files[0]);
        render();
      } catch (err) { toast(err.message); }
    });
  }
  const uses = $('#uses-text');
  if (uses) {
    uses.addEventListener('input', () => {
      S.g.usesText = uses.value;
      const c = $('#uses-count');
      if (c) c.textContent = uses.value.split('\n').map((s) => s.trim()).filter(Boolean).length;
    });
  }
}

document.addEventListener('click', async (e) => {
  const goEl = e.target.closest('[data-go]');
  if (goEl) { e.preventDefault(); go(goEl.dataset.go); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const { arg } = route();
  try {
    switch (act) {
      case 'reload': render(); break;
      case 'logout': signOut(); break;
      case 'tab': S.authTab = el.dataset.tab; S.authError = ''; render(); break;
      case 'role': S.signupRole = el.dataset.role; render(); break;
      case 'demo': {
        el.disabled = true;
        signIn(await api('/auth/demo', { body: { as: el.dataset.as } }));
        await refreshMe();
        S.q = null; S.g = null; S.m = {};
        go(el.dataset.as === 'student' ? 'questionnaire' : el.dataset.as === 'student-finished' ? 'report' : '');
        break;
      }
      case 'copy':
        try { await navigator.clipboard.writeText(el.dataset.text); toast('Copied!'); } catch { toast(`Your code: ${el.dataset.text}`); }
        break;
      case 'subject': {
        const { list, s } = el.dataset;
        const other = list === 'likes' ? 'dislikes' : 'likes';
        const d = S.q.data;
        d[list] = d[list].includes(s) ? d[list].filter((x) => x !== s) : [...d[list], s];
        d[other] = d[other].filter((x) => x !== s);
        render();
        break;
      }
      case 'rate': S.q.data.stated[el.dataset.trait] = Number(el.dataset.n); render(); break;
      case 'q-back': S.q.step = Math.max(0, S.q.step - 1); render(); break;
      case 'q-next':
        if (S.q.step === 0 && !S.q.data.name.trim()) { toast('Add your name first.'); break; }
        S.q.step += 1; render(); window.scrollTo(0, 0); break;
      case 'q-save': await saveQuestionnaire(); break;
      case 'answer': {
        if (S.g.phase !== 'question') break;
        S.g.picked = Number(el.dataset.i);
        await submitGame(S.content.games[S.g.idx], S.g.picked);
        break;
      }
      case 'uses-start': startUses(S.content.games[S.g.idx]); break;
      case 'uses-done': clearInterval(usesTimer); await submitGame(S.content.games[S.g.idx], S.g.usesText || ''); break;
      case 'game-next':
        S.g = { idx: S.g.idx + 1, phase: 'question', startedAt: Date.now(), fb: null, picked: null };
        render(); break;
      case 'games-replay':
        S.g = { idx: 0, phase: 'question', startedAt: Date.now(), fb: null, picked: null };
        render(); break;
      case 'photo-remove': S.m[arg].image = null; render(); break;
      case 'pick-career': S.reportCareer = el.dataset.id; await render(); $('#career-path')?.scrollIntoView({ block: 'start' }); break;
      case 'scroll': e.preventDefault(); $(`#${el.dataset.target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'cc-request': {
        await api('/campus-connect/requests', { body: { profileId: el.dataset.id, message: 'Hi! I am exploring this course on Disha.' } });
        S.requested.add(el.dataset.id);
        el.disabled = true; el.textContent = 'Request sent ✓'; el.classList.replace('green', 'ghost');
        toast('Chat request sent (demo profile)');
        break;
      }
      case 'lang': S.parentLang = el.dataset.lang; render(); break;
      default:
        if (act.startsWith('m-')) await missionAction(act, arg, el);
    }
  } catch (err) {
    toast(err.message);
    if (act === 'demo') el.disabled = false;
  }
});

/* ============ Start ============ */
async function boot() {
  $('#app').innerHTML = '<p class="loading">Loading Disha</p>';
  try {
    [S.content, S.health] = await Promise.all([api('/content'), api('/health')]);
    if (S.token) {
      try { await refreshMe(); } catch { S.token = null; store.set('disha-token', null); }
    }
  } catch (err) {
    $('#app').innerHTML = `<div class="box pink stack"><h2>Can't reach the Disha server</h2><p>Start it with <code>npm start</code> inside <code>backend/</code>, then reload.</p><p class="small muted">${esc(err.message)}</p></div>`;
    return;
  }
  render();
}
boot();
