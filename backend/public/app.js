// Dishaa web app: plain JavaScript, no build step. Talks to the backend at /api.
// The product is professional; only Disha Quest (the game) is pixel art.
import { star, trophy, gridSprite, gem } from './sprites.js';

/* ================= Helpers ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const pct = (v, max) => Math.max(0, Math.min(100, Math.round((v / max) * 100)));
const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const ICONS = {
  game: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="4"/><path d="M6 12h4M8 10v4M15 11h.01M18 13h.01"/></svg>',
  compass: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/></svg>',
  people: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
};

const S = {
  token: store.get('disha-token'),
  user: null, student: null, content: null, health: null,
  authTab: 'login', signupRole: 'student', authError: '',
  quest: null, q: null, career: null, parentLang: 'en', requested: new Set(),
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
  if (res.status === 401 && S.token && !quiet) { signOut(false); throw new Error('Your session ended. Please log in again.'); }
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
  return data;
}

async function refreshMe() {
  const me = await api('/auth/me');
  S.user = me.user;
  S.student = me.student;
}
function signIn({ token, user }) { S.token = token; S.user = user; store.set('disha-token', token); }
function signOut(callApi = true) {
  if (callApi && S.token) api('/auth/logout', { method: 'POST', quiet: true }).catch(() => {});
  Object.assign(S, { token: null, user: null, student: null, quest: null, q: null, career: null, requested: new Set() });
  store.set('disha-token', null);
  location.hash = '';
  render();
}

/* ================= Routing ================= */
const route = () => { const [name = '', arg = ''] = location.hash.slice(1).split('/'); return { name, arg: decodeURIComponent(arg) }; };
const go = (hash) => { if (location.hash.replace(/^#/, '') === hash) render(); else location.hash = hash; };
window.addEventListener('hashchange', render);

let renderId = 0;
async function render() {
  const id = ++renderId;
  renderTopbar();
  const app = $('#app');
  if (!S.user) { app.innerHTML = loginView(); bindLogin(); window.scrollTo(0, 0); return; }
  const { name, arg } = route();
  const views = {
    student: { home: homeView, about: aboutView, quest: questView, report: reportView, coach: coachView, plan: planView },
    parent: { parent: parentView },
    school: { school: schoolView },
  }[S.user.role] || {};
  const fallback = { student: 'home', parent: 'parent', school: 'school' }[S.user.role];
  const result = (views[name] || views[fallback])(arg);
  if (result instanceof Promise) {
    app.innerHTML = `<p class="loading">${esc({ report: 'Preparing your report', parent: 'Preparing the report', school: 'Loading your class', coach: 'Opening your coach', plan: 'Loading your plan' }[name] || 'Loading')}…</p>`;
    try {
      const html = await result;
      if (id !== renderId) return;
      app.innerHTML = html;
    } catch (err) {
      if (id !== renderId) return;
      app.innerHTML = `<div class="card stack"><h2>That didn't load</h2><p class="muted">${esc(err.message)}</p><div><button class="btn" data-act="reload">Try again</button></div></div>`;
    }
  } else {
    app.innerHTML = result;
  }
  bindInputs();
}

function renderTopbar() {
  const r = route().name;
  const links = !S.user ? [] : {
    student: [['home', 'Overview'], ['about', 'About you'], ['quest', 'Disha Quest'], ['report', 'Report'], ['coach', 'Coach'], ['plan', 'My plan']],
    parent: [['parent', "My child's report"]],
    school: [['school', 'Class dashboard']],
  }[S.user.role] || [];
  const ai = S.health?.ai;
  $('#topbar').innerHTML = `<div class="topbar-in">
    <a class="brand" href="#"><img src="logo-mark.png" alt="" width="51" height="34"><span>dishaa</span></a>
    <nav class="nav" aria-label="Main">${links.map(([h, l]) => `<a href="#${h}" class="${r === h ? 'on' : ''}">${l}</a>`).join('')}</nav>
    ${S.user ? `<div class="user">
      ${ai ? `<span class="ai-dot" style="--ai:${ai.configured ? '#5ed68f' : '#f2b23a'}" title="${ai.configured ? 'AI connected' : 'AI not connected: demo text'}">${ai.configured ? 'AI on' : 'Demo mode'}</span>` : ''}
      <span>${esc(S.user.name)}</span><button class="btn outline small" data-act="logout">Log out</button></div>` : ''}
  </div>`;
}

/* ================= Login ================= */
function loginView() {
  const tab = S.authTab;
  const role = S.signupRole;
  return `<section class="auth">
    <div class="auth-brand">
      <img class="logo" src="logo-256.jpg" alt="Dishaa logo" width="120" height="120">
      <div class="stack">
        <h1>Find the career that fits <span>who you really are.</span></h1>
        <p class="lead" style="color:#cfc6ea">Dishaa helps Class 10 and 12 students choose their stream, degree and college with confidence, based on what they can actually do, not just marks.</p>
      </div>
      <div class="stack">
        <div class="point"><span class="ico">${ICONS.game}</span><div><h4>A 10-minute aptitude game</h4><p class="small">Eight skills measured through play: logic, numbers, words, shapes, memory, critical thinking, creativity and people skills.</p></div></div>
        <div class="point"><span class="ico">${ICONS.compass}</span><div><h4>Careers matched to your strengths</h4><p class="small">The stream, degrees, entrance exams and colleges for each career, in one place.</p></div></div>
        <div class="point"><span class="ico">${ICONS.people}</span><div><h4>Built for families and schools</h4><p class="small">A parent view in English, ಕನ್ನಡ or हिन्दी, and a dashboard for school counsellors.</p></div></div>
      </div>
    </div>
    <div class="auth-form">
      <div class="stack-sm"><h2>${tab === 'login' ? 'Welcome back' : 'Create your account'}</h2><p class="muted small">${tab === 'login' ? 'Log in to continue your journey.' : 'It takes less than a minute.'}</p></div>
      <div class="tabs" role="tablist">
        <button role="tab" class="${tab === 'login' ? 'on' : ''}" data-act="tab" data-tab="login">Log in</button>
        <button role="tab" class="${tab === 'signup' ? 'on' : ''}" data-act="tab" data-tab="signup">Sign up</button>
      </div>
      ${S.authError ? `<p class="error">${esc(S.authError)}</p>` : ''}
      ${tab === 'login' ? `
        <form id="login-form" class="stack">
          <label>Email<input id="login-email" name="email" type="email" autocomplete="email" required></label>
          <label>Password<input id="login-password" name="password" type="password" autocomplete="current-password" required></label>
          <button class="btn block" type="submit">Log in</button>
        </form>` : `
        <form id="signup-form" class="stack">
          <div class="stack-sm"><span style="font:500 14px var(--f-body);color:var(--ink-2)">I am a</span>
            <div class="chips">${[['student', 'Student'], ['parent', 'Parent'], ['school', 'School counsellor']].map(([v, l]) => `<button type="button" class="chip ${role === v ? 'on' : ''}" data-act="role" data-role="${v}">${l}</button>`).join('')}</div></div>
          <label>Full name<input id="su-name" name="name" required maxlength="60" autocomplete="name"></label>
          ${role === 'student' ? `<div class="grid-2" style="gap:12px">
            <label>Class<select id="su-cls" name="cls">${['9', '10', '11', '12'].map((c) => `<option ${c === '10' ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
            <label>City<input id="su-city" name="city" autocomplete="address-level2" placeholder="e.g. Bengaluru"></label></div>` : ''}
          ${role === 'parent' ? `<label>Your child's family code<input id="su-code" name="familyCode" required placeholder="e.g. K7M2QX" style="text-transform:uppercase"></label><p class="small muted">Your child can find this code on their Dishaa overview page.</p>` : ''}
          ${role === 'school' ? `<label>Class you counsel<input id="su-class" name="classId" value="10B" required></label>` : ''}
          <label>Email<input id="su-email" name="email" type="email" required autocomplete="email"></label>
          <label>Password<input id="su-password" name="password" type="password" minlength="6" required autocomplete="new-password" placeholder="At least 6 characters"></label>
          <button class="btn block" type="submit">Create account</button>
        </form>`}
      <div class="or">or explore a demo</div>
      <div class="demo-grid">
        <button class="btn gold" data-act="demo" data-as="student">Play as a new student</button>
        <button class="btn outline" data-act="demo" data-as="student-finished">See a finished report</button>
        <button class="btn outline" data-act="demo" data-as="parent">Parent view</button>
        <button class="btn outline" data-act="demo" data-as="school">Counsellor dashboard</button>
      </div>
    </div>
  </section>`;
}

function bindLogin() {
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
      if (S.user.role === 'student' && body.city) {
        S.student = await api(`/students/${S.student.id}`, { method: 'PATCH', body: { city: body.city } });
      }
      go(S.user.role === 'student' ? 'about' : '');
    } catch (err) { S.authError = err.message; render(); }
  });
}

/* ================= Student: overview ================= */
function homeView() {
  const st = S.student;
  const p = st.progress;
  const next = !p.questionnaireDone ? 'about' : !p.questDone ? 'quest' : 'report';
  const steps = [
    ['about', 1, 'About you', 'Your class, subjects, marks, interests and budget.', p.questionnaireDone, p.questionnaireDone ? 'Completed' : 'About 3 minutes', p.questionnaireDone ? 100 : 0],
    ['quest', 2, 'Disha Quest', 'A 10-minute game that measures 8 abilities.', p.questDone, p.questDone ? 'Completed' : p.questAnswered ? `${p.questAnswered} of ${p.questTotal} puzzles done` : 'About 10 minutes', pct(p.questAnswered, p.questTotal)],
    ['report', 3, 'Careers and your plan', 'Your strengths, career matches, a chat with your coach and a full career plan.', Boolean(st.plan), st.plan ? 'Plan ready' : p.reportReady ? 'Report ready' : 'Unlocks after the quest', st.plan ? 100 : p.reportReady ? 60 : 0],
  ];
  const cta = next === 'about' ? 'Tell us about you' : next === 'quest' ? (p.questAnswered ? 'Continue Disha Quest' : 'Start Disha Quest') : 'View my report';
  return `<div class="stack-lg">
    <section class="spread">
      <div class="stack-sm"><p class="eyebrow">Class ${esc(st.profile.cls || '10')}${st.profile.city ? ` · ${esc(st.profile.city)}` : ''}</p><h1>Hi ${esc(st.profile.name || 'there')}, let's find your direction.</h1>
        <p class="lead">Three steps. Your plan gets better with each one.</p></div>
      <button class="btn" data-go="${next}">${cta} →</button>
    </section>
    <section class="steps">${steps.map(([h, n, t, sub, done, state, w]) => `
      <a class="card step ${done ? 'done' : ''} ${h === next ? 'current' : ''} ${h === 'report' && !p.reportReady ? 'locked' : ''}" href="#${h}">
        <span class="n">${done ? '✓' : n}</span><h3>${t}</h3><p class="muted small">${sub}</p>
        <div class="spread small"><span class="muted">${state}</span></div>
        <div class="progress"><i style="width:${w}%"></i></div>
      </a>`).join('')}</section>
    <section class="card soft spread">
      <div class="stack-sm"><h3>Invite your parents</h3><p class="muted small">Share this family code. Your parent signs up with it to see your report.</p></div>
      <div class="row"><span class="code">${esc(st.familyCode)}</span><button class="btn outline small" data-act="copy" data-text="${esc(st.familyCode)}">Copy</button></div>
    </section>
  </div>`;
}

/* ================= Disha Quest (pixel game) ================= */
function questState() {
  const zones = S.content.assessment.zones;
  const answers = new Set(Object.keys(S.student.assessment?.answers || {}));
  if (!S.quest) {
    let zi = zones.findIndex((z) => z.items.some((it) => !answers.has(it.id)));
    if (zi === -1) S.quest = { zi: zones.length, ii: 0, phase: 'done', xp: answers.size * 10 };
    else {
      const ii = zones[zi].items.findIndex((it) => !answers.has(it.id));
      S.quest = { zi, ii, phase: ii === 0 ? 'intro' : 'item', xp: answers.size * 10, startedAt: Date.now() };
    }
  }
  return S.quest;
}

function questView() {
  const zones = S.content.assessment.zones;
  const q = questState();
  const answered = S.student.progress.questAnswered;
  const total = S.student.progress.questTotal;
  const hud = `<div class="hud">
    <span class="px-label">${q.phase === 'done' ? 'QUEST COMPLETE' : `ZONE ${Math.min(q.zi + 1, zones.length)}/${zones.length}`}</span>
    <div class="pbar" aria-label="Quest progress"><i style="width:${pct(answered, total)}%"></i></div>
    <span class="xp">★ ${q.xp} XP</span>
  </div>`;
  return `<div class="game-wrap"><div class="game">${hud}${questScreen(q, zones)}</div>
    <p class="game-note">There's no pass or fail. Answer honestly and at your own pace: Dishaa uses accuracy and time to understand your strengths.</p></div>`;
}

function questScreen(q, zones) {
  if (q.phase === 'done') {
    return `<div class="screen">${trophy(9)}<h2 class="px-title">QUEST COMPLETE!</h2>
      <p class="question">You finished all ${zones.length} zones and earned ${q.xp} XP.</p>
      <p class="muted">Your strengths and career matches are ready.</p>
      <div class="row" style="justify-content:center"><button class="gbtn" data-go="report">SEE MY RESULTS ▶</button></div></div>`;
  }
  const zone = zones[q.zi];
  const item = zone.items[q.ii];
  if (q.phase === 'intro') {
    return `<div class="screen"><div class="zone-banner" style="--zc:${zone.color}">
      ${gem(zone.color, 7)}<span class="px-label">ZONE ${q.zi + 1}</span><h2 style="color:${zone.color}">${esc(zone.name)}</h2>
      <p class="question">${esc(zone.intro)}</p><p class="muted">${zone.items.length} challenge${zone.items.length > 1 ? 's' : ''}</p>
      <button class="gbtn" data-act="q-begin">START ▶</button></div></div>`;
  }
  if (q.phase === 'zone-done') {
    const stars = q.zoneStars ?? 0;
    const nextZone = zones[q.zi + 1];
    return `<div class="screen"><div class="zone-banner" style="--zc:${zone.color}">
      <span class="px-label">ZONE CLEARED</span><h2 style="color:${zone.color}">${esc(zone.name)}</h2>
      <div class="stars">${[1, 2, 3].map((n) => star(n <= stars, 6)).join('')}</div>
      <p class="muted">+${stars * 10} bonus XP</p>
      <button class="gbtn" data-act="q-next-zone">${nextZone ? `NEXT: ${esc(nextZone.name.toUpperCase())} ▶` : 'FINISH QUEST ▶'}</button></div></div>`;
  }
  const head = `<p class="px-label" style="color:${zone.color}">${esc(zone.name.toUpperCase())} · ${q.ii + 1}/${zone.items.length}</p>`;
  if (item.type === 'mcq') {
    return `<div class="screen">${head}<p class="question">${esc(item.question)}</p>
      <div class="options">${item.options.map((o, i) => `<button class="opt" data-act="q-answer" data-i="${i}" ${q.busy ? 'disabled' : ''}><b>${String.fromCharCode(65 + i)}</b>${esc(o)}</button>`).join('')}</div></div>`;
  }
  if (item.type === 'rotate') {
    return `<div class="screen">${head}<p class="question">${esc(item.question)}</p>
      <div class="zone-banner" style="max-width:220px;padding:16px"><span class="px-label">THIS SHAPE</span>${gridSprite(item.shape, '#f2b23a', 30, 'Target shape')}</div>
      <div class="shapes">${item.optionGrids.map((g, i) => `<button class="shape-opt" data-act="q-answer" data-i="${i}" aria-label="Option ${String.fromCharCode(65 + i)}" ${q.busy ? 'disabled' : ''}>${gridSprite(g, '#8a5cf0', 26)}<span class="px-label">${String.fromCharCode(65 + i)}</span></button>`).join('')}</div></div>`;
  }
  if (item.type === 'memory') {
    const showing = q.phase === 'mem-show';
    const lit = new Set(item.cells.map(([r, c]) => `${r},${c}`));
    const picked = q.memPicked || new Set();
    const grid = `<div class="mem-grid" style="grid-template-columns:repeat(${item.size}, auto)">${Array.from({ length: item.size * item.size }, (_, k) => {
      const r = Math.floor(k / item.size); const c = k % item.size; const key = `${r},${c}`;
      const cls = showing ? (lit.has(key) ? 'lit' : '') : picked.has(key) ? 'picked' : '';
      return `<button class="mem-cell ${cls}" data-act="q-cell" data-k="${key}" ${showing || q.phase !== 'mem-input' ? 'disabled' : ''} aria-label="Row ${r + 1}, column ${c + 1}"></button>`;
    }).join('')}</div>`;
    if (q.phase === 'item') {
      return `<div class="screen">${head}<p class="question">${esc(item.question)}</p><p class="muted">${item.cells.length} squares will light up for ${item.showMs / 1000} seconds.</p>
        <button class="gbtn" data-act="q-mem-show">I'M READY ▶</button></div>`;
    }
    return `<div class="screen">${head}<p class="question">${showing ? 'Remember these…' : `Tap the ${item.cells.length} squares that lit up`}</p>${grid}
      ${showing ? '<p class="timer" id="mem-timer">…</p>' : `<p class="muted">${picked.size} of ${item.cells.length} selected</p><button class="gbtn green" data-act="q-mem-submit" ${picked.size ? '' : 'disabled'}>LOCK IN ▶</button>`}</div>`;
  }
  if (item.type === 'uses') {
    const running = q.phase === 'uses-run';
    const ideas = (q.usesText || '').split('\n').map((s) => s.trim()).filter(Boolean).length;
    return `<div class="screen">${head}<p class="question">${esc(item.question)}</p>
      <div class="pbar" style="max-width:620px;width:100%"><i id="uses-bar" style="width:${running ? pct(q.left, item.seconds) : 100}%;background:var(--p-gold)"></i></div>
      <p class="timer"><span id="uses-left" class="num">${running ? q.left : item.seconds}</span>s left · <span id="uses-count">${ideas}</span> ideas</p>
      <textarea id="uses-text" placeholder="One idea per line" ${running ? '' : 'disabled'} style="width:100%">${esc(q.usesText || '')}</textarea>
      ${running ? '<button class="gbtn green" data-act="q-uses-done">DONE ▶</button>' : `<button class="gbtn" data-act="q-uses-start">START ${item.seconds}s TIMER ▶</button>`}</div>`;
  }
  return '';
}

async function submitQuest(answer) {
  const q = S.quest;
  const zone = S.content.assessment.zones[q.zi];
  const item = zone.items[q.ii];
  q.busy = true;
  try {
    const out = await api(`/students/${S.student.id}/assessment/answers`, { body: { itemId: item.id, answer, ms: Date.now() - q.startedAt } });
    S.student.assessment ||= { answers: {} };
    S.student.assessment.answers[item.id] = { answer };
    S.student.progress.questAnswered = out.answered;
    S.student.progress.questDone = out.complete;
    S.student.progress.reportReady = out.complete;
    q.xp += 10;
    q.memPicked = null; q.usesText = '';
    if (out.zone?.done) {
      q.zoneStars = out.zone.stars;
      q.xp += out.zone.stars * 10;
      q.phase = 'zone-done';
    } else {
      q.ii += 1;
      q.phase = 'item';
      q.startedAt = Date.now();
    }
  } finally {
    q.busy = false;
    render();
  }
}

let questTimer;
function startMemory() {
  const q = S.quest;
  const item = S.content.assessment.zones[q.zi].items[q.ii];
  q.phase = 'mem-show';
  q.memPicked = new Set();
  render();
  const end = Date.now() + item.showMs;
  clearInterval(questTimer);
  questTimer = setInterval(() => {
    const left = Math.max(0, end - Date.now());
    const t = $('#mem-timer');
    if (t) t.textContent = `${(left / 1000).toFixed(1)}s`;
    if (left <= 0) {
      clearInterval(questTimer);
      if (S.quest?.phase === 'mem-show') { S.quest.phase = 'mem-input'; S.quest.startedAt = Date.now(); render(); }
    }
  }, 100);
}

function startUses() {
  const q = S.quest;
  const item = S.content.assessment.zones[q.zi].items[q.ii];
  q.phase = 'uses-run';
  q.left = item.seconds;
  q.startedAt = Date.now();
  render();
  setTimeout(() => $('#uses-text')?.focus(), 50);
  clearInterval(questTimer);
  questTimer = setInterval(() => {
    if (route().name !== 'quest' || S.quest?.phase !== 'uses-run') { clearInterval(questTimer); return; }
    q.left = Math.max(0, item.seconds - Math.floor((Date.now() - q.startedAt) / 1000));
    const l = $('#uses-left'); if (l) l.textContent = q.left;
    const b = $('#uses-bar'); if (b) b.style.width = `${pct(q.left, item.seconds)}%`;
    if (q.left <= 0) { clearInterval(questTimer); submitQuest(q.usesText || '').catch((e) => toast(e.message)); }
  }, 250);
}

/* ================= Student: about you (questionnaire) ================= */
const ABOUT_STEPS = ['School and marks', 'Interests', 'How you see yourself', 'Family, budget and scholarships'];
const MARK_KEYS = { 9: ['class9'], 10: ['class9', 'class10'], 11: ['class9', 'class10', 'class11'], 12: ['class9', 'class10', 'class11', 'class12'] };

function aboutView() {
  const qc = S.content.questionnaire;
  if (!S.q) {
    const p = S.student.profile || {};
    S.q = {
      step: 0,
      data: {
        cls: p.cls || '10', board: p.board || 'CBSE', schoolName: p.schoolName || '', city: p.city || '',
        subjects: [...(p.subjects || [])], likes: [...(p.likes || [])], interests: [...(p.interests || [])],
        marks: { ...(p.marks || {}) }, dream: p.dream || '', goal: p.goal || qc.goals[0],
        parentExpect: p.parentExpect || '', parentReason: p.parentReason || '',
        budget: p.budget || '', openToLoan: Boolean(p.openToLoan), relocate: p.relocate || '',
        familyIncome: p.familyIncome || '', gender: p.gender || '', category: p.category || '',
        stated: { ...(p.stated || Object.fromEntries(S.content.assessment.abilities.map((a) => [a.id, 3]))) },
      },
    };
  }
  const { step, data: d } = S.q;
  const chipList = (list, items) => items.map((x) => {
    const id = typeof x === 'string' ? x : x.id;
    const label = typeof x === 'string' ? x : x.label;
    return `<button type="button" class="chip ${d[list].includes(id) ? 'on' : ''}" data-act="pick" data-list="${list}" data-v="${esc(id)}">${esc(label)}</button>`;
  }).join('');
  const select = (key, label, options, { optional = false } = {}) => `<label>${label}${optional ? ' <span class="muted small">(optional)</span>' : ''}<select id="q-${key}" data-q="${key}">
    <option value="">${optional ? 'Prefer not to say' : 'Choose…'}</option>${options.map((o) => { const v = typeof o === 'string' ? o : o.id; const l = typeof o === 'string' ? o : o.label; return `<option value="${esc(v)}" ${d[key] === v ? 'selected' : ''}>${esc(l === 'prefer-not' ? 'Prefer not to say' : l)}</option>`; }).join('')}</select></label>`;
  const marksFields = (MARK_KEYS[d.cls] || MARK_KEYS[10]).map((k) => {
    const n = k.replace('class', '');
    const current = String(n) === String(d.cls);
    return `<label>Class ${n} ${current ? '<span class="muted small">(expected or latest)</span>' : ''}<input id="q-mark-${k}" type="number" min="0" max="100" step="0.1" inputmode="decimal" data-mark="${k}" value="${esc(d.marks[k] ?? '')}" placeholder="%"></label>`;
  }).join('');

  const steps = [
    () => `<div class="stack">
      <div class="grid-2" style="gap:14px">
        <label>Class<select id="q-cls" data-q="cls" data-rerender="1">${qc.classes.map((c) => `<option ${c === d.cls ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        ${select('board', 'Board', qc.boards)}
        <label>School name <span class="muted small">(optional)</span><input id="q-schoolName" data-q="schoolName" value="${esc(d.schoolName)}"></label>
        <label>City<input id="q-city" data-q="city" value="${esc(d.city)}" placeholder="e.g. Bengaluru"></label>
      </div>
      <div class="stack-sm"><h4>Subjects you study now</h4><div class="chips">${chipList('subjects', qc.subjects)}</div></div>
      <div class="stack-sm"><h4>Your marks (percentage)</h4><p class="small muted">Used to suggest realistic colleges and scholarships. Leave blank if you don't know.</p>
        <div class="grid-3" style="gap:12px">${marksFields}</div></div>
    </div>`,
    () => `<div class="stack">
      <div class="stack-sm"><h4>Subjects you enjoy most</h4><div class="chips">${chipList('likes', qc.subjects)}</div></div>
      <div class="stack-sm"><h4>What sounds interesting to you?</h4><p class="small muted">Pick as many as you like.</p><div class="chips">${chipList('interests', S.content.interests)}</div></div>
      <label>If you could do any job in the world, what would it be?<textarea id="q-dream" data-q="dream" placeholder="Dream big">${esc(d.dream)}</textarea></label>
      ${select('goal', 'Your main goal right now', qc.goals)}
    </div>`,
    () => `<div class="stack"><p class="muted">Rate yourself honestly. Your report compares this with what the game measures.</p>
      ${qc.statedQuestions.map((sq) => `<div class="spread" style="padding:10px 0;border-bottom:1px solid var(--line)"><span style="flex:1;min-width:220px">${esc(sq.question)}</span>
        <div class="scale" role="group" aria-label="${esc(sq.question)}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${d.stated[sq.ability] === n ? 'on' : ''}" data-act="rate" data-ability="${sq.ability}" data-n="${n}" aria-label="${n} of 5">${n}</button>`).join('')}</div></div>`).join('')}
      <p class="small muted">1 = ${esc(qc.scale.minLabel)} · 5 = ${esc(qc.scale.maxLabel)}</p></div>`,
    () => `<div class="stack">
      <div class="grid-2" style="gap:14px">
        <label>Career your family hopes for<input id="q-parentExpect" data-q="parentExpect" value="${esc(d.parentExpect)}" placeholder="e.g. Doctor, Engineer, not sure"></label>
        <label>Why they hope for it<input id="q-parentReason" data-q="parentReason" value="${esc(d.parentReason)}" placeholder="e.g. It's stable and respected"></label>
      </div>
      <div class="stack-sm"><h4>Budget for college fees (per year)</h4>${qc.collegeBudgets.map((b) => `<label class="check"><input type="radio" name="budget" data-q="budget" value="${b.id}" ${d.budget === b.id ? 'checked' : ''}> <span>${esc(b.label)}</span></label>`).join('')}
        <label class="check"><input type="checkbox" id="q-loan" data-qbool="openToLoan" ${d.openToLoan ? 'checked' : ''}> <span>We're open to an education loan</span></label></div>
      <div class="stack-sm"><h4>Where can you study?</h4>${qc.relocate.map((r) => `<label class="check"><input type="radio" name="relocate" data-q="relocate" value="${r.id}" ${d.relocate === r.id ? 'checked' : ''}> <span>${esc(r.label)}</span></label>`).join('')}</div>
      <div class="card soft stack-sm"><h4>For scholarships</h4><p class="small muted">Optional. Only used to find scholarships you may qualify for, and never shared.</p>
        <div class="grid-3" style="gap:12px">${select('familyIncome', 'Annual family income', qc.incomeBands.filter((b) => b.id !== 'prefer-not'), { optional: true })}
          ${select('gender', 'Gender', qc.genders.filter((g) => g.id !== 'prefer-not'), { optional: true })}
          ${select('category', 'Category', qc.categories.filter((c) => c !== 'prefer-not'), { optional: true })}</div></div>
    </div>`,
  ];
  return `<section class="card stack" style="max-width:860px;margin:0 auto">
    <div class="stack-sm"><p class="eyebrow">About you · step ${step + 1} of ${ABOUT_STEPS.length}</p><h2>${ABOUT_STEPS[step]}</h2>
      <div class="progress"><i style="width:${pct(step + 1, ABOUT_STEPS.length)}%"></i></div></div>
    ${steps[step]()}
    <div class="spread"><button class="btn outline" data-act="q-back" ${step === 0 ? 'disabled' : ''}>Back</button>
      ${step < ABOUT_STEPS.length - 1 ? '<button class="btn" data-act="q-next">Continue</button>' : `<button class="btn" data-act="q-save">${S.student.progress.questDone ? 'Save and see my report' : 'Save and start Disha Quest'}</button>`}</div>
  </section>`;
}

/* ================= Student: report ================= */
function abilityRows(abilities, { evidence = false } = {}) {
  const color = (b) => (b === 'Strong' ? 'var(--purple-600)' : b === 'Solid' ? 'var(--purple-500)' : 'var(--gold-500)');
  return abilities.map((a) => `<div class="stack-sm">
    <div class="ability"><span><b style="font-weight:600">${esc(a.label)}</b></span>
      <div class="bar"><i style="width:${a.score ?? 0}%;--c:${color(a.band)}"></i></div>
      <span class="num" style="font-weight:600">${a.score ?? '—'}</span>
      <span class="band">${a.band ? `<span class="tag ${a.band === 'Strong' ? 'purple' : a.band === 'Solid' ? 'grey' : 'gold'}">${a.band}</span>` : ''}</span></div>
    ${evidence && a.evidence ? `<p class="small muted">${esc(a.evidence)}</p>` : ''}</div>`).join('');
}

async function reportView() {
  if (!S.student.progress.questAnswered) {
    return `<div class="card stack" style="max-width:680px;margin:0 auto"><p class="eyebrow">Your report</p><h2>Play Disha Quest to unlock your report</h2>
      <p class="muted">It takes about 10 minutes. Your report shows your strengths, areas to grow and the careers that fit you.</p><div><button class="btn" data-go="quest">Start Disha Quest →</button></div></div>`;
  }
  const r = await api(`/students/${S.student.id}/report`);
  const n = r.narrative;
  const careers = r.careers;
  const sel = careers.find((c) => c.id === S.career) || careers[0];
  const cc = sel.missionId ? await api(`/campus-connect?missionId=${encodeURIComponent(sel.missionId)}`) : { profiles: [] };
  const surprise = r.statedVsMeasured.biggestSurprise;
  const byId = Object.fromEntries(r.quest.abilities.map((a) => [a.id, a]));

  return `<div class="stack-lg">
    ${!r.quest.complete ? `<div class="card gold spread"><p><b>Your report is partial.</b> You've done ${r.quest.answered} of ${r.quest.total} puzzles.</p><button class="btn small" data-go="quest">Finish Disha Quest</button></div>` : ''}
    ${!r.questionnaireDone ? `<div class="card soft spread"><p>Add your subjects and interests to get sharper career matches.</p><button class="btn small" data-go="about">Tell us about you</button></div>` : ''}

    <section class="card navy stack">
      <p class="eyebrow" style="color:var(--gold-500)">Dishaa report · ${esc(S.student.profile.name)} · Class ${esc(S.student.profile.cls || '10')}</p>
      <h1 style="color:#fff">${esc(n.headline)}</h1>
      <div class="row small"><span class="muted">${r.quest.stats.accuracy}% accuracy · about ${r.quest.stats.avgSeconds}s per puzzle · ${r.quest.answered} puzzles</span>
        <span class="tag ${r.narrativeSource === 'ai' ? 'gold' : 'grey'}">${r.narrativeSource === 'ai' ? 'Written by AI from your results' : 'Standard summary'}</span></div>
    </section>

    <section class="grid-2">
      <div class="card stack"><div class="stack-sm"><p class="eyebrow">Ability profile</p><h2>What the game measured</h2></div>${abilityRows(r.quest.abilities)}
        <p class="small muted">Scores are out of 100, from accuracy and speed across the puzzles in each zone.</p></div>
      <div class="stack">
        <div class="card stack"><p class="eyebrow">Your top strengths</p>
          ${n.strengths.map((s) => `<div class="stack-sm"><h3>${esc(s.name)}</h3><p class="small">${esc(s.evidence)}</p>${s.whyItMatters ? `<p class="small muted">${esc(s.whyItMatters)}</p>` : ''}</div>`).join('<div class="divider"></div>')}</div>
        ${n.growth?.length ? `<div class="card gold stack"><p class="eyebrow" style="color:#8a5a06">Areas to grow</p>
          ${n.growth.map((g) => `<div class="stack-sm"><h4>${esc(g.name)}</h4><p class="small">${esc(g.tip)}</p></div>`).join('')}</div>` : ''}
      </div>
    </section>

    ${r.questionnaireDone ? `<section class="card stack"><div class="stack-sm"><p class="eyebrow">How you see yourself vs. what you showed</p><h2>${surprise ? `Your ${esc(surprise.label.toLowerCase())} is ${surprise.gap > 0 ? 'stronger' : 'not as strong'} than you think` : 'Your self-image matches your results'}</h2>
      ${n.surprise ? `<p class="muted">${esc(n.surprise)}</p>` : ''}</div>
      <div class="stack-sm">${r.statedVsMeasured.rows.filter((x) => x.measured != null).map((x) => `<div class="svm-row"><span class="small">${esc(x.label)}</span>
        <div class="svm-track">${x.stated != null ? `<span class="dot said" style="left:${((x.stated - 1) / 4) * 100}%" title="You said ${x.stated}"></span>` : ''}<span class="dot did" style="left:${((x.measured - 1) / 4) * 100}%" title="Measured ${x.measured}"></span></div>
        <span class="small num ${x.gap > 0 ? '' : 'muted'}">${x.gap == null ? '' : `${x.gap > 0 ? '+' : ''}${x.gap}`}</span></div>`).join('')}</div>
      <div class="legend"><span><i style="background:#b9b3c9"></i>You said</span><span><i style="background:var(--purple-600)"></i>The game measured</span></div></section>` : ''}

    <section class="stack" id="careers">
      <div class="spread"><div class="stack-sm"><p class="eyebrow">Career matches</p><h2>Careers that fit you</h2></div>
        ${r.stream.suggestion ? `<span class="tag purple">Suggested stream: ${esc(r.stream.suggestion)}</span>` : ''}</div>
      <div class="grid-3">${careers.map((c, i) => `<button class="career ${c === sel ? 'on' : ''}" data-act="career" data-id="${c.id}">
        <div class="spread"><span class="tag ${i === 0 ? 'gold' : 'grey'}">#${i + 1} match</span><span class="fit num">${c.fit}%</span></div>
        <h3>${esc(c.name)}</h3><p class="small muted">${esc(c.summary)}</p><p class="small">${esc(c.why)}</p></button>`).join('')}</div>
    </section>

    <section class="card stack" id="path">
      <div class="stack-sm"><p class="eyebrow">Career path</p><h2>How to become a ${esc(sel.name)}</h2></div>
      ${pathView(sel)}
    </section>

    ${sel.colleges.length ? `<section class="stack" id="colleges"><div class="stack-sm"><p class="eyebrow">Colleges</p><h2>Where to study</h2></div>
      <div class="grid-3">${sel.colleges.map(collegeCard).join('')}</div></section>` : ''}

    ${cc.profiles.length ? `<section class="stack" id="campus"><div class="stack-sm"><p class="eyebrow">Campus Connect</p><h2>Talk to a student from these colleges</h2>
      <p class="muted">Hear what it's really like: classes, culture, placements and hostel life.</p></div>
      <div class="grid-3">${cc.profiles.map(personCard).join('')}</div>
      <p class="small muted">Sample profiles for the demo. Real students and alumni join with a verified college email.</p></section>` : ''}

    <section class="card navy spread">
      <div class="stack-sm" style="max-width:640px"><p class="eyebrow" style="color:var(--gold-500)">Dishaa Coach</p><h2 style="color:#fff">${r.hasPlan ? 'Your career plan is ready' : 'Not sure which career to aim for?'}</h2>
        <p class="muted">Chat with your AI coach to settle on a goal. It then builds your full plan: stream, exams, colleges within your budget, scholarships and what to do next.</p></div>
      <div class="row">${r.hasPlan ? '<button class="btn gold" data-go="plan">View my plan →</button><button class="btn outline" data-go="coach" style="background:transparent;color:#fff;border-color:var(--navy-800)">Talk to coach</button>' : '<button class="btn gold" data-go="coach">Talk to my coach →</button>'}</div>
    </section>

    ${r.scholarships?.length ? `<section class="stack"><div class="stack-sm"><p class="eyebrow">Scholarships</p><h2>Scholarships you may qualify for</h2>
      <p class="muted small">Based on your answers. Amounts and rules change every year: always check the official portal.</p></div>
      <div class="grid-3">${r.scholarships.map(scholarshipCard).join('')}</div></section>` : ''}

    <section class="grid-2">
      <div class="card stack"><h3>Your next 7 days</h3>${n.next7Days.map((x, i) => `<label class="check"><input type="checkbox" id="next-${i}"> <span>${esc(x)}</span></label>`).join('')}</div>
      <div class="card soft stack"><p class="eyebrow">Coming soon</p><h3>Try your top careers</h3>
        <p class="small">Career simulations: short missions where you do a real task from the job, with an AI mentor from that field.</p>
        <p class="small muted">Your strongest areas: ${r.quest.strengths.map((id) => esc(byId[id].label)).join(', ')}.</p></div>
    </section>
  </div>`;
}

function pathView(c) {
  const pw = c.pathway;
  const step = (title, body, last = false) => `<div class="path-step"><div class="rail"><span class="dot"></span>${last ? '' : '<span class="line"></span>'}</div><div class="stack-sm"><h4>${title}</h4>${body}</div></div>`;
  return `<div class="path">
    ${step('After Class 10: stream', `<p>${esc(c.stream)}</p>${pw?.subjects ? `<p class="small muted">Helpful subjects: ${pw.subjects.map(esc).join(', ')}</p>` : ''}`)}
    ${step('After Class 12: degree and entrance exams', `<ul class="clean">${c.degrees.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      <p class="small"><b>Entrance exams:</b> ${c.exams.map(esc).join(' · ')}</p>
      ${pw?.examTimeline?.length ? `<ul class="clean small muted">${pw.examTimeline.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><p class="small muted">Dates as reported on ${esc(pw.datesCheckedOn || '')}; confirm on the official exam site.</p>` : ''}`)}
    ${step('After the degree', pw?.afterDegree ? `<p class="small"><b>First jobs:</b> ${pw.afterDegree.firstJobs.map(esc).join(' · ')}</p><p class="small"><b>Growth:</b> ${pw.afterDegree.growth.map(esc).join(' · ')}</p>` : '<p class="small muted">Detailed job paths for this career are coming soon.</p>', true)}
  </div>`;
}

function collegeCard(c) {
  return `<div class="card tight stack-sm">
    <h4>${esc(c.name)}</h4><p class="small muted">${esc(c.city)} · ${esc(c.course)} · ${esc(c.entrance)}</p>
    <dl class="kv"><dt>Fees</dt><dd>${esc(c.feesNote || (c.feesPerYearINR ? `₹${Number(c.feesPerYearINR).toLocaleString('en-IN')} / year` : '—'))}</dd>
      <dt>Cutoff</dt><dd>${esc(c.cutoff || '—')}</dd><dt>NIRF</dt><dd>${esc(c.nirfRank || 'Not ranked')}</dd></dl>
    ${c.verified ? `<span class="tag green">Verified · ${esc(c.lastChecked)}</span>` : c.source ? `<p class="small muted">Unofficial source, checked ${esc(c.lastChecked)} · <a href="${esc(c.source)}" target="_blank" rel="noopener">source</a></p>` : ''}
    ${c.campusConnectCount ? `<a class="small" href="#campus" data-act="scroll" data-target="campus">Talk to a student from here →</a>` : ''}
  </div>`;
}

function personCard(p) {
  const sent = S.requested.has(p.id);
  return `<article class="card tight stack-sm">
    <div class="row"><span class="avatar-i ${p.type === 'alumnus' ? 'gold' : ''}">${esc(initials(p.name))}</span>
      <div class="stack-sm" style="gap:4px"><h4>${esc(p.name)}</h4><span class="tag ${p.type === 'alumnus' ? 'gold' : 'purple'}">${p.type === 'alumnus' ? 'Alumnus' : 'Current student'}</span></div></div>
    <p class="small muted">${esc(p.course)} · ${esc(p.year)} · ${esc(p.college?.name || '')}</p>
    <p class="small">${esc(p.about)}</p>
    <div class="chips">${p.topics.map((t) => `<span class="tag grey">${esc(t)}</span>`).join('')}</div>
    <div class="spread small"><span class="muted">${p.languages.map(esc).join(', ')}</span><b class="num">₹${p.pricePer15MinINR} / 15 min</b></div>
    ${S.user.role === 'school' ? '' : `<button class="btn small ${sent ? 'outline' : ''}" data-act="cc-request" data-id="${p.id}" ${sent ? 'disabled' : ''}>${sent ? 'Request sent ✓' : 'Request a chat'}</button>`}
  </article>`;
}

function scholarshipCard(x) {
  return `<div class="card tight stack-sm">
    <div class="spread"><h4>${esc(x.name)}</h4><span class="tag ${x.status === 'likely' ? 'green' : 'grey'}">${x.status === 'likely' ? 'Likely match' : 'Check eligibility'}</span></div>
    <p class="small muted">${esc(x.provider)}</p><p class="small">${esc(x.for)}</p>
    <p class="small"><b>${esc(x.amountNote)}</b></p><p class="small muted">${esc(x.eligibilityNote)}</p>
    ${x.missing?.length ? `<p class="small muted">Add your ${x.missing.map(esc).join(', ')} in About you to confirm.</p>` : ''}
    <a class="small" href="${esc(x.applyAt)}" target="_blank" rel="noopener">Official portal →</a>
  </div>`;
}

/* ================= Student: Dishaa Coach (chat) ================= */
let coachCache = null;
async function coachView() {
  if (!S.student.progress.questAnswered) {
    return `<div class="card stack" style="max-width:680px;margin:0 auto"><h2>Play Disha Quest first</h2><p class="muted">Your coach uses your results to guide you.</p><div><button class="btn" data-go="quest">Start Disha Quest →</button></div></div>`;
  }
  coachCache = await api(`/students/${S.student.id}/coach`);
  return coachHTML();
}

function coachHTML(typing = false) {
  const c = coachCache;
  const userTurns = c.messages.filter((m) => m.role === 'user').length;
  return `<div class="coach-layout">
    <section class="card coach">
      <div class="coach-head"><img src="logo-mark.png" alt="" width="45" height="30"><div><h3>Dishaa Coach</h3><p class="small muted">Your AI career counsellor</p></div></div>
      <div class="msgs" id="msgs">${c.messages.map((m) => `<div class="msg ${m.role}">${esc(m.content)}</div>`).join('')}${typing ? '<div class="msg assistant typing"><span></span><span></span><span></span></div>' : ''}</div>
      <form id="coach-form" class="coach-input"><input id="coach-msg" autocomplete="off" placeholder="Type your answer…" ${typing ? 'disabled' : ''}><button class="btn" type="submit" ${typing ? 'disabled' : ''}>Send</button></form>
    </section>
    <aside class="stack">
      <div class="card stack-sm"><p class="eyebrow">Your goal</p><h3>${esc(S.content.careers?.find?.((x) => x.id === c.goal)?.name || (c.goal ? c.goal : 'Not decided yet'))}</h3>
        <p class="small muted">${c.readyForPlan ? 'Your coach has what it needs.' : 'Chat for a few turns to settle on a goal.'}</p>
        <button class="btn ${c.readyForPlan ? 'gold' : 'outline'}" data-act="build-plan" ${userTurns ? '' : 'disabled'}>${c.hasPlan ? 'Rebuild my plan' : 'Build my career plan'}</button>
        ${c.hasPlan ? '<button class="btn ghost" data-go="plan">View my plan →</button>' : ''}</div>
      <div class="card soft stack-sm"><p class="eyebrow">Try asking</p>
        ${['Which of my matches suits me best?', 'My parents want me to be a doctor. What should I do?', 'Which stream should I take after Class 10?'].map((t) => `<button class="chip" data-act="coach-suggest" data-text="${esc(t)}" style="text-align:left">${esc(t)}</button>`).join('')}</div>
    </aside>
  </div>`;
}

async function sendCoach(message) {
  if (!message.trim()) return;
  coachCache.messages.push({ role: 'user', content: message });
  $('#app').innerHTML = coachHTML(true);
  scrollMsgs();
  try {
    coachCache = await api(`/students/${S.student.id}/coach`, { body: { message } });
  } catch (err) {
    toast(err.message);
    coachCache.messages.pop();
  }
  $('#app').innerHTML = coachHTML();
  bindInputs();
  scrollMsgs();
  $('#coach-msg')?.focus();
}
const scrollMsgs = () => { const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; };

/* ================= Student: career plan ================= */
async function planView() {
  let plan;
  try { plan = await api(`/students/${S.student.id}/plan`); } catch {
    return `<div class="card stack" style="max-width:680px;margin:0 auto"><p class="eyebrow">My plan</p><h2>You don't have a career plan yet</h2>
      <p class="muted">Chat with Dishaa Coach to pick a goal, then build your plan.</p><div><button class="btn" data-go="coach">Talk to my coach →</button></div></div>`;
  }
  const tierTag = { dream: 'gold', target: 'purple', safe: 'green' };
  return `<div class="stack-lg">
    <section class="card navy stack">
      <p class="eyebrow" style="color:var(--gold-500)">Career plan · ${esc(S.student.profile.name)}</p>
      <h1 style="color:#fff">Goal: ${esc(plan.goal.name)}</h1>
      <p style="color:#e7e1f8">${esc(plan.summary)}</p>
      <div class="row small"><span class="muted">Created ${esc(new Date(plan.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
        <span class="tag ${plan.source === 'ai' ? 'gold' : 'grey'}">${plan.source === 'ai' ? 'Personalised by AI' : 'Standard plan'}</span>
        ${plan.goal.fit != null ? `<span class="tag purple">${plan.goal.fit}% match</span>` : ''}</div>
    </section>

    <section class="grid-2">
      <div class="card stack-sm"><p class="eyebrow">Why this fits you</p><p>${esc(plan.whyThisFits)}</p></div>
      <div class="card stack-sm"><p class="eyebrow">The route</p><dl class="kv"><dt>Stream</dt><dd>${esc(plan.goal.stream)}</dd><dt>Degree</dt><dd>${plan.goal.degrees.map(esc).join('; ')}</dd><dt>Exams</dt><dd>${plan.goal.exams.map(esc).join('; ')}</dd></dl></div>
    </section>

    <section class="card stack"><div class="stack-sm"><p class="eyebrow">Timeline</p><h2>From now to your first job</h2></div>
      <div class="path">${plan.timeline.map((t, i) => `<div class="path-step"><div class="rail"><span class="dot"></span>${i < plan.timeline.length - 1 ? '<span class="line"></span>' : ''}</div>
        <div class="stack-sm"><p class="eyebrow">${esc(t.when)}</p><h4>${esc(t.title)}</h4><ul class="clean small">${t.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div></div>`).join('')}</div>
    </section>

    ${plan.examPrep?.length ? `<section class="stack"><h2>Entrance exam prep</h2><div class="grid-3">${plan.examPrep.map((e) => `<div class="card tight stack-sm"><h4>${esc(e.exam)}</h4><p class="small muted">${esc(e.when)}</p><p class="small">${esc(e.how)}</p></div>`).join('')}</div>
      ${plan.pathway?.examTimeline?.length ? `<p class="small muted">Reported dates: ${plan.pathway.examTimeline.map(esc).join(' · ')}. Confirm on the official exam sites.</p>` : ''}</section>` : ''}

    ${plan.collegeAdvice?.length ? `<section class="stack"><div class="stack-sm"><p class="eyebrow">Colleges for you</p><h2>Where to aim</h2></div>
      <div class="grid-3">${plan.collegeAdvice.map((c) => { const data = plan.colleges.find((x) => x.name === c.name); return `<div class="card tight stack-sm">
        <div class="spread"><h4>${esc(c.name)}</h4><span class="tag ${tierTag[c.tier] || 'grey'}">${esc(c.tier[0].toUpperCase() + c.tier.slice(1))}</span></div>
        <p class="small">${esc(c.why)}</p>
        ${data ? `<dl class="kv"><dt>Fees</dt><dd>${esc(data.feesNote || '—')}</dd><dt>Cutoff</dt><dd>${esc(data.cutoff || '—')}</dd><dt>NIRF</dt><dd>${esc(data.nirfRank || 'Not ranked')}</dd></dl>
          <p class="small muted">Unofficial source, checked ${esc(data.lastChecked)} · <a href="${esc(data.source)}" target="_blank" rel="noopener">source</a></p>` : ''}</div>`; }).join('')}</div></section>` : ''}

    <section class="grid-2">
      <div class="card gold stack-sm"><p class="eyebrow" style="color:#8a5a06">Budget and funding</p><p>${esc(plan.budgetAdvice)}</p></div>
      <div class="card stack"><h3>Your next 30 days</h3>${plan.next30Days.map((x, i) => `<label class="check"><input type="checkbox" id="p30-${i}"> <span>${esc(x)}</span></label>`).join('')}</div>
    </section>

    ${plan.scholarships?.length ? `<section class="stack"><h2>Scholarships to apply for</h2><div class="grid-3">${plan.scholarships.map(scholarshipCard).join('')}</div></section>` : ''}

    <section class="card soft spread"><div class="stack-sm"><h3>Backup options</h3><p class="small muted">Careers that also fit you well.</p>
      <div class="chips">${plan.backups.map((b) => `<button class="chip" data-act="build-plan" data-goal="${b.id}">${esc(b.name)} · ${b.fit}%</button>`).join('')}</div></div>
      <div class="row"><button class="btn outline" data-go="coach">Talk to coach</button><button class="btn" data-act="build-plan">Rebuild plan</button></div></section>
  </div>`;
}

/* ================= Parent ================= */
async function parentView() {
  const sid = S.student?.id;
  if (!sid) return '<div class="card"><h2>No child linked to this account</h2></div>';
  const lang = S.parentLang;
  const [pr, report] = await Promise.all([api(`/students/${sid}/parent-report?lang=${lang}`), api(`/students/${sid}/report`)]);
  const name = esc(pr.childName || 'Your child');
  const share = `${pr.childName || 'My child'}'s Dishaa report: ${pr.summary}`;
  return `<div class="stack-lg">
    <section class="spread"><div class="stack-sm"><p class="eyebrow">Parent view</p><h1>${name}'s strengths and career matches</h1></div>
      <div class="tabs" style="min-width:280px">${[['en', 'English'], ['kn', 'ಕನ್ನಡ'], ['hi', 'हिन्दी']].map(([v, l]) => `<button class="${lang === v ? 'on' : ''}" data-act="lang" data-lang="${v}">${l}</button>`).join('')}</div></section>
    ${pr.requestedLanguage !== pr.language ? '<p class="card gold small">Translation needs the AI to be connected. Showing English for now.</p>' : ''}
    <section class="card navy stack"><p style="font-size:17px;color:#fff">${esc(pr.summary)}</p>
      <span class="small muted">${pr.source === 'ai' ? 'Written by AI from your child\'s results' : 'Standard summary'}</span></section>
    <section class="grid-2">
      <div class="card stack"><p class="eyebrow">Ability profile</p>${abilityRows(report.quest.abilities)}</div>
      <div class="stack">
        <div class="card stack-sm"><p class="eyebrow">Your hope</p><h3>${esc(pr.parentExpect || 'Not shared yet')}</h3>${pr.parentReason ? `<p class="small muted">"${esc(pr.parentReason)}"</p>` : ''}</div>
        <div class="card stack-sm" style="border-left:4px solid var(--green)"><p class="eyebrow" style="color:var(--green)">Where it matches</p><p>${esc(pr.match)}</p></div>
        <div class="card stack-sm" style="border-left:4px solid var(--gold-500)"><p class="eyebrow" style="color:#8a5a06">Where it differs</p><p>${esc(pr.differ)}</p></div>
        <div class="card stack-sm"><p class="eyebrow">Top career matches</p>${pr.topCareers.map((c) => `<div class="spread"><span>${esc(c.name)}</span><b class="num">${c.fit}%</b></div>`).join('')}</div>
      </div>
    </section>
    <section class="card soft stack"><h2>Three ways to start the conversation</h2>
      ${pr.starters.map((s, i) => `<div class="row" style="align-items:flex-start"><span class="avatar-i" style="width:32px;height:32px;font-size:14px">${i + 1}</span><p style="flex:1;padding-top:4px">${esc(s)}</p></div>`).join('')}
      <div><a class="btn" href="https://wa.me/?text=${encodeURIComponent(share)}" target="_blank" rel="noopener">Share on WhatsApp</a></div></section>
  </div>`;
}

/* ================= School ================= */
async function schoolView() {
  const d = await api(`/schools/classes/${encodeURIComponent(S.user.classId)}/dashboard`);
  const max = Math.max(1, ...d.abilityMix.map((a) => a.students));
  return `<div class="stack-lg">
    <section class="stack-sm"><p class="eyebrow">Counsellor dashboard</p><h1>${esc(d.className)}</h1><p class="lead">Who to talk to first, and what your class is strongest at.</p></section>
    <section class="grid-3">
      <div class="card stat"><span class="muted small">Students</span><b class="num">${d.totalStudents}</b><span class="small muted">${d.sampleStudents} sample students for the demo</span></div>
      <div class="card stat"><span class="muted small">Finished Disha Quest</span><b class="num">${d.completion.percent}%</b><span class="small muted">${d.completion.done} of ${d.totalStudents}</span></div>
      <div class="card stat"><span class="muted small">Need a conversation</span><b class="num">${d.needsConversation.length}</b><span class="small muted">Ranked by urgency below</span></div>
    </section>
    <section class="grid-2">
      <div class="card stack"><h3>Class strengths</h3><p class="small muted">Number of students whose strongest ability is…</p>
        ${d.abilityMix.map((a) => `<div class="ability" style="grid-template-columns:minmax(130px,180px) 1fr 36px"><span class="small">${esc(a.label)}</span><div class="bar"><i style="width:${pct(a.students, max)}%"></i></div><span class="num small">${a.students}</span></div>`).join('')}</div>
      <div class="card stack"><h3>This week's actions</h3>${d.weeklyActions.map((a, i) => `<label class="check"><input type="checkbox" id="act-${i}"> <span>${esc(a)}</span></label>`).join('')}</div>
    </section>
    <section class="card stack"><h3>Needs a conversation</h3>
      <div class="table-scroll"><table><thead><tr><th>Student</th><th>Why</th><th>Strongest ability</th><th>Top career</th><th>Parents hope</th></tr></thead>
      <tbody>${d.needsConversation.map((s) => `<tr class="${s.sample ? '' : 'live'}"><td><b>${esc(s.name)}</b>${s.sample ? '' : ' <span class="tag gold">Live</span>'}</td><td class="small">${s.reasons.map(esc).join('<br>')}</td><td class="small">${esc(s.topAbilityLabel || '—')}</td><td class="small">${esc(s.topCareer || '—')}</td><td class="small">${esc(s.parentExpect || '—')}</td></tr>`).join('')}</tbody></table></div>
    </section>
  </div>`;
}

/* ================= Events ================= */
function bindInputs() {
  $$('[data-q]').forEach((el) => {
    el.addEventListener('input', () => { if (S.q) S.q.data[el.dataset.q] = el.value; });
    el.addEventListener('change', () => {
      if (S.q && (el.type !== 'radio' || el.checked)) S.q.data[el.dataset.q] = el.value;
      if (el.dataset.rerender) render();
    });
  });
  $$('[data-mark]').forEach((el) => el.addEventListener('input', () => { if (S.q) S.q.data.marks[el.dataset.mark] = el.value; }));
  $$('[data-qbool]').forEach((el) => el.addEventListener('change', () => { if (S.q) S.q.data[el.dataset.qbool] = el.checked; }));
  $('#coach-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#coach-msg');
    const msg = input.value;
    input.value = '';
    sendCoach(msg);
  });
  if (route().name === 'coach') scrollMsgs();
  const uses = $('#uses-text');
  if (uses) {
    uses.addEventListener('input', () => {
      S.quest.usesText = uses.value;
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
        S.quest = null; S.q = null; S.career = null;
        go(el.dataset.as === 'student' ? 'about' : el.dataset.as === 'student-finished' ? 'report' : '');
        break;
      }
      case 'copy':
        try { await navigator.clipboard.writeText(el.dataset.text); toast('Copied'); } catch { toast(`Your family code: ${el.dataset.text}`); }
        break;

      // Quest
      case 'q-begin': S.quest.phase = 'item'; S.quest.startedAt = Date.now(); render(); break;
      case 'q-answer': if (!S.quest.busy) await submitQuest(Number(el.dataset.i)); break;
      case 'q-mem-show': startMemory(); break;
      case 'q-cell': {
        const picked = S.quest.memPicked;
        const k = el.dataset.k;
        if (picked.has(k)) picked.delete(k); else picked.add(k);
        render();
        break;
      }
      case 'q-mem-submit': await submitQuest([...S.quest.memPicked].map((k) => k.split(',').map(Number))); break;
      case 'q-uses-start': startUses(); break;
      case 'q-uses-done': clearInterval(questTimer); await submitQuest(S.quest.usesText || ''); break;
      case 'q-next-zone': {
        const q = S.quest;
        q.zi += 1; q.ii = 0;
        q.phase = q.zi >= S.content.assessment.zones.length ? 'done' : 'intro';
        if (q.phase === 'done') await refreshMe();
        render();
        window.scrollTo(0, 0);
        break;
      }

      // About you
      case 'pick': {
        const { list, v } = el.dataset;
        const d = S.q.data;
        d[list] = d[list].includes(v) ? d[list].filter((x) => x !== v) : [...d[list], v];
        render();
        break;
      }
      case 'rate': S.q.data.stated[el.dataset.ability] = Number(el.dataset.n); render(); break;
      case 'q-back': S.q.step = Math.max(0, S.q.step - 1); render(); break;
      case 'q-next':
        if (S.q.step === 0 && !S.q.data.subjects.length) { toast('Pick the subjects you study now.'); break; }
        if (S.q.step === 1 && !S.q.data.interests.length) { toast('Pick at least one interest.'); break; }
        S.q.step += 1; render(); window.scrollTo(0, 0); break;
      case 'q-save':
        S.student = await api(`/students/${S.student.id}`, { method: 'PATCH', body: S.q.data });
        S.q = null;
        toast('Saved');
        go(S.student.progress.questDone ? 'report' : 'quest');
        break;
      case 'coach-suggest': await sendCoach(el.dataset.text); break;
      case 'build-plan': {
        el.disabled = true;
        const label = el.textContent;
        el.textContent = 'Building your plan…';
        try {
          await api(`/students/${S.student.id}/plan`, { body: el.dataset.goal ? { goal: el.dataset.goal } : {} });
          S.student.plan = true;
          go('plan');
        } catch (err) { toast(err.message); el.disabled = false; el.textContent = label; }
        break;
      }

      // Report
      case 'career': S.career = el.dataset.id; await render(); $('#path')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'scroll': e.preventDefault(); $(`#${el.dataset.target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'cc-request':
        await api('/campus-connect/requests', { body: { profileId: el.dataset.id, message: 'Hi! I am exploring this course on Dishaa.' } });
        S.requested.add(el.dataset.id);
        el.disabled = true; el.textContent = 'Request sent ✓'; el.classList.add('outline');
        toast('Chat request sent (demo profile)');
        break;
      case 'lang': S.parentLang = el.dataset.lang; render(); break;
      default: break;
    }
  } catch (err) {
    toast(err.message);
    if (act === 'demo') el.disabled = false;
  }
});

/* ================= Start ================= */
async function boot() {
  $('#app').innerHTML = '<p class="loading">Loading…</p>';
  try {
    [S.content, S.health] = await Promise.all([api('/content'), api('/health')]);
    if (S.token) {
      try { await refreshMe(); } catch { S.token = null; store.set('disha-token', null); }
    }
  } catch (err) {
    $('#app').innerHTML = `<div class="card stack"><h2>Can't reach the Dishaa server</h2><p class="muted">Start it with <code>npm start</code> inside <code>backend/</code>, then reload. (${esc(err.message)})</p></div>`;
    return;
  }
  render();
}
boot();
