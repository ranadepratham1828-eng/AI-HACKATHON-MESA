// Dishaa web app: plain JavaScript, no build step. Talks to the backend at /api.
// The product is professional; only Dishaa Quest (the game) is pixel art.
import { star, trophy, gridSprite, gem } from '/sprites.js';

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
  game: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
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
  Object.assign(S, { token: null, user: null, student: null, quest: null, q: null, career: null, requested: new Set(), studyCache: null, sp: null, studyDay: null });
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
  const rn = route().name;
  const entering = rn !== S.lastRoute;
  if (entering) { S.menuOpen = false; S.userMenu = false; if (rn === 'calendar' && S.cal) S.cal.cache = {}; }
  if (entering) { window.scrollTo(0, 0); if (rn === 'study') { S.studyCache = null; S.spEditing = false; S.sp = null; } S.lastRoute = rn; }
  renderTopbar();
  const app = $('#app');
  if (route().name === 'admin') {
    app.innerHTML = '<p class="loading">Loading…</p>';
    const html = await adminView();
    if (id === renderId) { app.innerHTML = html; bindLogin(); }
    return;
  }
  if (!S.user) { app.innerHTML = loginView(); bindLogin(); window.scrollTo(0, 0); return; }
  if (S.user.mustChangePassword && !S.user.demo) { app.innerHTML = passwordView(); bindLogin(); return; }
  const { name, arg } = route();
  const views = {
    student: { home: homeView, about: aboutView, quest: questView, report: reportView, coach: coachView, plan: planView, study: studyView, calendar: calendarView, mentors: mentorsView },
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
  if (entering) { window.scrollTo(0, 0); app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter'); clearTimeout(S.enterTimer); S.enterTimer = setTimeout(() => app.classList.remove('enter'), 1400); }
  bindInputs();
}

const MENU_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>';
const CHEV_L = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"></path></svg>';
const CHEV_R = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>';
const CLOSE_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';

function renderTopbar() {
  const r = route().name;
  const links = !S.user ? [] : {
    student: [['home', 'Overview'], ['about', 'About you'], ['quest', 'Assessment'], ['report', 'Report'], ['coach', 'Coach'], ['plan', 'Career plan'], ['study', 'Study planner'], ['calendar', 'Calendar'], ['mentors', 'Mentors']],
    parent: [['parent', "My child's report"]],
    school: [['school', 'Class dashboard']],
  }[S.user.role] || [];
  const link = ([h, l]) => `<a href="#${h}" class="${r === h ? 'on' : ''}" ${r === h ? 'aria-current="page"' : ''}>${l}${h === 'mentors' ? '<span class="soon-dot" title="Coming soon"></span>' : ''}</a>`;
  const ai = S.health?.ai;
  const status = ai ? `<span class="ai-dot" style="--ai:${ai.configured ? 'var(--aqua)' : 'var(--gold)'}">${ai.configured ? 'AI connected' : 'Demo text (AI off)'}</span>` : '';
  const who = S.user ? `${esc(S.user.name)}` : '';
  const sub = S.user ? ({ student: `Student${S.student?.profile?.cls ? ` · Class ${esc(S.student.profile.cls)}` : ''}`, parent: 'Parent', school: 'School counsellor' }[S.user.role] || '') : '';
  $('#topbar').innerHTML = `<div class="topbar-in">
    ${S.user && links.length ? `<button class="icon-btn menu-btn" data-act="menu" aria-label="Open menu" aria-expanded="${S.menuOpen ? 'true' : 'false'}">${MENU_ICON}</button>` : ''}
    <a class="brand" href="/">${COMPASS()}<span>dishaa</span></a>
    <nav class="nav" aria-label="Main">${links.map(link).join('')}</nav>
    ${S.user ? `<div class="user">
      <button class="avatar-btn" data-act="user-menu" aria-haspopup="menu" aria-expanded="${S.userMenu ? 'true' : 'false'}" aria-label="Account menu for ${who}">${esc(initials(S.user.name.replace(/\(.*?\)/g, '')))}${S.user.demo ? '<i class="demo-pip" title="Demo account"></i>' : ''}</button>
      ${S.userMenu ? `<div class="user-menu" role="menu">
        <div class="um-head"><b>${who}</b><span>${sub}</span>${S.user.demo ? '<span class="tag gold" style="justify-self:start;margin-top:6px">Demo account</span>' : ''}</div>
        ${status ? `<div class="um-row">${status}</div>` : ''}
        <button class="um-item" role="menuitem" data-act="logout">Log out</button>
      </div>` : ''}
    </div>` : ''}
  </div>
  ${S.user && links.length ? `<div class="drawer-scrim ${S.menuOpen ? 'open' : ''}" data-act="menu-close"></div>
  <aside class="drawer ${S.menuOpen ? 'open' : ''}" aria-label="Menu" ${S.menuOpen ? '' : 'inert'}>
    <div class="drawer-head"><a class="brand" href="/">${COMPASS()}<span>dishaa</span></a><button class="icon-btn" data-act="menu-close" aria-label="Close menu">${CLOSE_ICON}</button></div>
    <nav class="drawer-nav" aria-label="Main">${links.map(link).join('')}</nav>
    <div class="drawer-foot"><div class="um-head"><b>${who}</b><span>${sub}</span></div>${status}<button class="btn outline small" data-act="logout">Log out</button></div>
  </aside>` : ''}`;
  document.body.classList.toggle('drawer-open', Boolean(S.menuOpen));
}

/* ================= Login (no public sign-up: accounts are emailed) ================= */
function loginView() {
  return `<section class="auth">
    <div class="auth-brand">
      <div class="stack">
        <p class="eyebrow">Career guidance for Class 9 to 12</p>
        <h1>Choose a career based on what you can <em>actually do.</em></h1>
        <p class="lead">Dishaa measures a student's abilities and interests, matches them to careers in India, and builds a plan with colleges and scholarships.</p>
      </div>
      <ul class="points">
        <li><span>Assessment</span><p class="small">27 questions across 9 abilities, plus a short interest check. About 15 minutes.</p></li>
        <li><span>Career matches</span><p class="small">36 careers with the stream, degrees, entrance exams, salaries, and pros and cons for each.</p></li>
        <li><span>Coach and plan</span><p class="small">An AI coach helps settle on a goal, then builds a plan with colleges within budget.</p></li>
        <li><span>Families</span><p class="small">A parent view in English, ಕನ್ನಡ and हिन्दी, and a dashboard for school counsellors.</p></li>
      </ul>
    </div>
    <div class="auth-form">
      <div class="stack-sm"><h2>Log in</h2><p class="muted small">Use the email and password we sent you when your school or family subscribed.</p></div>
      ${S.authError ? `<p class="error">${esc(S.authError)}</p>` : ''}
      <form id="login-form" class="stack">
        <label>Email<input id="login-email" name="email" type="email" autocomplete="email" required></label>
        <label>Password<input id="login-password" name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn block" type="submit">Log in</button>
      </form>
      <details class="small muted"><summary>Forgot your password or didn't get an email?</summary>
        <p style="margin-top:8px">Ask your school counsellor, or <a href="/#contact">contact the Dishaa team</a> and we'll send you a new one.</p></details>
      <div class="or">Or explore a demo</div>
      <div class="demo-grid">
        <button class="btn gold" data-act="demo" data-as="student">New student</button>
        <button class="btn outline" data-act="demo" data-as="student-finished">Finished report</button>
        <button class="btn outline" data-act="demo" data-as="parent">Parent view</button>
        <button class="btn outline" data-act="demo" data-as="school">Counsellor view</button>
      </div>
      <p class="small muted">Not a customer yet? <a href="/#contact">Request access for your school or family</a>.</p>
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
  $('#pw-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('next') !== f.get('confirm')) { S.authError = "The new passwords don't match"; render(); return; }
    try {
      const out = await api('/auth/password', { body: { current: f.get('current'), next: f.get('next') } });
      S.user = out.user;
      S.authError = '';
      toast('Password saved');
      go('');
    } catch (err) { S.authError = err.message; render(); }
  });
  $('#admin-key-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    ADMIN.key = new FormData(e.target).get('key');
    try { sessionStorage.setItem('dishaa-admin', ADMIN.key); } catch { /* private mode */ }
    render();
  });
  $('#admin-create')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const spec = Object.fromEntries(new FormData(e.target));
    spec.sendEmail = Boolean(spec.sendEmail);
    await adminCreate([spec], spec.sendEmail);
  });
  $('#admin-bulk')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const role = f.get('role');
    const rows = String(f.get('rows') || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(',').map((x) => x.trim()));
    const specs = rows.map(([name, email, third, fourth]) => role === 'student' ? { role, name, email, cls: third || '10', classId: fourth || '10B' }
      : role === 'parent' ? { role, name, email, childEmail: third } : { role, name, email, classId: third || '10B', school: fourth });
    await adminCreate(specs, Boolean(f.get('sendEmail')));
  });
}

/* ================= First login: choose a password ================= */
function passwordView() {
  return `<section class="card stack" style="max-width:520px;margin:24px auto">
    <div class="stack-sm"><p class="eyebrow">Welcome, ${esc(S.user.name)}</p><h2>Choose your own password</h2>
      <p class="muted small">You logged in with a temporary password. Set a new one to continue.</p></div>
    ${S.authError ? `<p class="error">${esc(S.authError)}</p>` : ''}
    <form id="pw-form" class="stack">
      <label>Temporary password<input name="current" type="password" autocomplete="current-password" required></label>
      <label>New password<input name="next" type="password" minlength="8" autocomplete="new-password" required placeholder="At least 8 characters"></label>
      <label>Repeat new password<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="btn block" type="submit">Save password</button>
    </form>
  </section>`;
}

/* ================= Admin (Dishaa team): create accounts, see enquiries ================= */
const ADMIN = { key: (() => { try { return sessionStorage.getItem('dishaa-admin') || ''; } catch { return ''; } })(), tab: 'create', results: null };
async function adminApi(path, body, method) {
  const res = await fetch(`/api${path}`, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN.key }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { ADMIN.key = ''; try { sessionStorage.removeItem('dishaa-admin'); } catch { /* */ } }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
async function adminCreate(accounts, sendEmail) {
  try {
    ADMIN.results = (await adminApi('/admin/accounts', { accounts, sendEmail })).results;
    toast(`${ADMIN.results.filter((r) => r.status === 'created').length} account(s) created`);
  } catch (err) { toast(err.message); }
  render();
}
async function adminView() {
  if (!ADMIN.key) {
    return `<section class="card stack" style="max-width:480px;margin:24px auto"><p class="eyebrow">Dishaa team</p><h2>Admin</h2>
      <p class="muted small">Enter the admin key set on the server (ADMIN_KEY).</p>
      <form id="admin-key-form" class="stack"><label>Admin key<input name="key" type="password" required></label><button class="btn" type="submit">Continue</button></form></section>`;
  }
  let status;
  try { status = await adminApi('/admin/status'); } catch (err) {
    return `<div class="card stack" style="max-width:520px;margin:24px auto"><h2>Admin unavailable</h2><p class="muted">${esc(err.message)}</p><div><button class="btn" data-act="admin-logout">Try another key</button></div></div>`;
  }
  const tab = ADMIN.tab;
  let body = '';
  if (tab === 'create') {
    const results = ADMIN.results ? `<div class="card stack"><h3>Results</h3><div class="table-scroll"><table><thead><tr><th>Email</th><th>Status</th><th>Login details</th></tr></thead><tbody>
      ${ADMIN.results.map((r) => `<tr><td>${esc(r.email)}</td><td><span class="tag ${r.status === 'created' ? 'green' : r.status === 'exists' ? 'grey' : 'red'}">${esc(r.status)}</span> <span class="small muted">${esc(r.error || '')}</span></td>
        <td class="small">${r.status !== 'created' ? '' : r.emailed ? 'Emailed ✓' : `Not emailed (${esc(r.emailError || '')}). Share: <b style="font-family:monospace">${esc(r.password)}</b>`}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    body = `<div class="grid-2">
      <form id="admin-create" class="card stack"><h3>Create one account</h3>
        <label>Role<select name="role"><option value="student">Student</option><option value="parent">Parent</option><option value="school">School counsellor</option></select></label>
        <label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label>
        <div class="grid-2" style="gap:10px"><label>Class (students)<select name="cls"><option>9</option><option selected>10</option><option>11</option><option>12</option></select></label>
          <label>Class group<input name="classId" value="10B"></label></div>
        <label>Child's student email (parents)<input name="childEmail" type="email"></label>
        <label class="check"><input type="checkbox" name="sendEmail" checked> <span>Email the login details</span></label>
        <button class="btn" type="submit">Create account</button></form>
      <form id="admin-bulk" class="card stack"><h3>Add a whole class</h3>
        <label>Role<select name="role"><option value="student">Students</option><option value="parent">Parents</option><option value="school">Counsellors</option></select></label>
        <label>One per line<textarea name="rows" style="min-height:180px;font-family:monospace;font-size:13px" placeholder="Students:   name, email, class, class group&#10;Parents:    name, email, child's email&#10;Counsellors: name, email, class group, school"></textarea></label>
        <label class="check"><input type="checkbox" name="sendEmail" checked> <span>Email everyone their login details</span></label>
        <button class="btn" type="submit">Create accounts</button></form>
    </div>${results}`;
  } else if (tab === 'accounts') {
    const { users } = await adminApi('/admin/accounts');
    body = `<div class="card stack"><h3>${users.length} accounts</h3><div class="table-scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}${u.mustChangePassword ? ' <span class="tag gold">temp password</span>' : ''}</td><td class="small">${u.lastLoginAt ? esc(new Date(u.lastLoginAt).toLocaleString('en-IN')) : 'Never'}</td>
        <td><button class="btn outline small" data-act="admin-reset" data-id="${u.id}">Reset password</button></td></tr>`).join('')}</tbody></table></div></div>`;
  } else {
    const { leads } = await adminApi('/admin/leads');
    body = `<div class="card stack"><h3>${leads.length} enquiries from the website</h3><div class="table-scroll"><table><thead><tr><th>When</th><th>Name</th><th>Contact</th><th>Type</th><th>Organisation</th><th>Students</th><th>Message</th></tr></thead><tbody>
      ${leads.map((l) => `<tr><td class="small">${esc(new Date(l.createdAt).toLocaleDateString('en-IN'))}</td><td>${esc(l.name)}</td><td class="small">${esc(l.email)}<br>${esc(l.phone)}</td><td>${esc(l.role)}</td><td class="small">${esc(l.organisation)}${l.city ? `, ${esc(l.city)}` : ''}</td><td>${esc(l.students)}</td><td class="small">${esc(l.message)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  return `<div class="stack-lg"><section class="spread"><div class="stack-sm"><p class="eyebrow">Dishaa team</p><h1>Admin</h1>
      <p class="small muted">Email: ${status.email.configured ? `on (from ${esc(status.email.from)})` : 'not set up: passwords are shown here instead'} · AI: ${status.ai.configured ? 'on' : 'off'} · Storage: ${esc(status.storage)}</p></div>
      <button class="btn outline small" data-act="admin-logout">Lock admin</button></section>
    <div class="tabs" style="max-width:520px">${[['create', 'Create accounts'], ['accounts', 'Accounts'], ['leads', 'Enquiries']].map(([v, l]) => `<button class="${tab === v ? 'on' : ''}" data-act="admin-tab" data-tab="${v}">${l}</button>`).join('')}</div>
    ${body}</div>`;
}

/* ================= Student: overview ================= */
function homeView() {
  const st = S.student;
  const p = st.progress;
  const next = !p.questionnaireDone ? 'about' : !p.questDone ? 'quest' : 'report';
  const steps = [
    ['about', 1, 'About you', 'Your class, subjects, marks, interests and budget.', p.questionnaireDone, p.questionnaireDone ? 'Completed' : 'About 3 minutes', p.questionnaireDone ? 100 : 0],
    ['quest', 2, 'Aptitude assessment', '27 questions across 9 abilities, about 15 minutes.', p.questDone, p.questDone ? 'Completed' : p.questAnswered ? `${p.questAnswered} of ${p.questTotal} questions done` : 'About 15 minutes', pct(p.questAnswered, p.questTotal)],
    ['report', 3, 'Careers and your plan', 'Your strengths, career matches, a chat with your coach and a full career plan.', Boolean(st.plan), st.plan ? 'Plan ready' : p.reportReady ? 'Report ready' : 'Unlocks after the assessment', st.plan ? 100 : p.reportReady ? 60 : 0],
    ['study', 4, 'Study planner', 'A day-by-day plan to your exams, plus activities that build your profile.', Boolean(st.study), st.study ? 'Plan ready' : 'About 5 minutes to set up', st.study ? 100 : 0],
  ];
  const cta = next === 'about' ? 'Tell us about you' : next === 'quest' ? (p.questAnswered ? 'Continue the assessment' : 'Start the assessment') : 'View my report';
  return `<div class="stack-lg">
    <section class="spread">
      <div class="stack-sm"><p class="eyebrow">Class ${esc(st.profile.cls || '10')}${st.profile.city ? ` · ${esc(st.profile.city)}` : ''}</p><h1>Hi ${esc(st.profile.name || 'there')}, let's find your direction.</h1>
        <p class="lead">Four steps. Your plan gets better with each one.</p></div>
      <button class="btn gold" data-go="${next}">${cta}</button>
    </section>
    <section class="steps steps-4">${steps.map(([h, n, t, sub, done, state, w]) => `
      <a class="card step ${done ? 'done' : ''} ${h === next ? 'current' : ''} ${h === 'report' && !p.reportReady ? 'locked' : ''}" href="#${h}">
        <span class="n">${done ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>' : `0${n}`}</span><h3>${t}</h3><p class="muted small">${sub}</p>
        <span class="small ${done ? '' : 'muted'}" style="${done ? 'color:var(--green)' : ''}">${state}</span>
        <div class="progress"><i style="width:${w}%"></i></div>
      </a>`).join('')}</section>
    <section class="card soft spread">
      <div class="stack-sm"><h3>Invite your parents</h3><p class="muted small">Share this family code. Your parent signs up with it to see your report.</p></div>
      <div class="row"><span class="code">${esc(st.familyCode)}</span><button class="btn outline small" data-act="copy" data-text="${esc(st.familyCode)}">Copy</button></div>
    </section>
    ${soonTeaser()}
  </div>`;
}

/* ================= Dishaa Quest (pixel game) ================= */
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
    <p class="game-note">This isn't a pass-or-fail test. Answer honestly and at your own pace: Dishaa uses accuracy and response time to understand your strengths.</p></div>`;
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
const ABOUT_STEPS = ['School and marks', 'Interests', 'Careers on your mind', 'What you enjoy doing', 'How you see yourself', 'Family, budget and scholarships'];
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
        considering: [...(p.considering || [])], consideringOther: p.consideringOther || '', notSure: Boolean(p.notSure), priorities: [...(p.priorities || [])], riasec: { ...(p.riasec || {}) },
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
  const select = (key, label, options, { optional = false } = {}) => `<label><span>${label}${optional ? ' <span class="muted small">(optional)</span>' : ''}</span><select id="q-${key}" data-q="${key}">
    <option value="">${optional ? 'Prefer not to say' : 'Choose…'}</option>${options.map((o) => { const v = typeof o === 'string' ? o : o.id; const l = typeof o === 'string' ? o : o.label; return `<option value="${esc(v)}" ${d[key] === v ? 'selected' : ''}>${esc(l === 'prefer-not' ? 'Prefer not to say' : l)}</option>`; }).join('')}</select></label>`;
  const marksFields = (MARK_KEYS[d.cls] || MARK_KEYS[10]).map((k) => {
    const n = k.replace('class', '');
    const current = String(n) === String(d.cls);
    return `<label><span>Class ${n} ${current ? '<span class="muted small">(expected or latest)</span>' : ''}</span><input id="q-mark-${k}" type="number" min="0" max="100" step="0.1" inputmode="decimal" data-mark="${k}" value="${esc(d.marks[k] ?? '')}" placeholder="%"></label>`;
  }).join('');

  const steps = [
    () => `<div class="stack">
      <div class="grid-2" style="gap:14px">
        <label>Class<select id="q-cls" data-q="cls" data-rerender="1">${qc.classes.map((c) => `<option ${c === d.cls ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        ${select('board', 'Board', qc.boards)}
        <label><span>School name <span class="muted small">(optional)</span></span><input id="q-schoolName" data-q="schoolName" value="${esc(d.schoolName)}"></label>
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
    () => `<div class="stack">
      <p class="muted">Are there careers you're already thinking about? Pick any, or choose "Not sure yet" and we'll recommend from your results.</p>
      <div><button type="button" class="chip ${d.notSure ? 'on' : ''}" data-act="not-sure">Not sure yet</button></div>
      ${d.notSure ? '' : S.content.careerCategories.map((cat) => `<div class="stack-sm"><h4>${esc(cat)}</h4><div class="chips">${S.content.careers.filter((c) => c.category === cat).map((c) => `<button type="button" class="chip ${d.considering.includes(c.id) ? 'on' : ''}" data-act="pick" data-list="considering" data-v="${c.id}">${esc(c.name)}</button>`).join('')}</div></div>`).join('')}
      ${d.notSure ? '' : `<label><span>Another career in mind? <span class="muted small">(optional)</span></span><input id="q-consideringOther" data-q="consideringOther" value="${esc(d.consideringOther)}" placeholder="e.g. Pilot, Chef, Sports physio"></label>`}
      <div class="stack-sm"><h4>What matters most to you in a career? <span class="muted small">(pick up to 2)</span></h4>
        <div class="chips">${S.content.priorities.map((pr) => `<button type="button" class="chip ${d.priorities.includes(pr.id) ? 'on' : ''}" data-act="priority" data-v="${pr.id}">${esc(pr.label)}</button>`).join('')}</div></div>
    </div>`,
    () => `<div class="stack"><p class="muted">How much would you enjoy each activity? Go with your first feeling. This is a short version of the Holland (RIASEC) interest check used by career counsellors worldwide.</p>
      ${qc.riasec.items.map((it) => `<div class="spread" style="padding:9px 0;border-bottom:1px solid var(--line)"><span style="flex:1;min-width:220px">${esc(it.text)}</span>
        <div class="scale" role="group" aria-label="${esc(it.text)}">${qc.riasec.scale.map((o) => `<button type="button" style="width:auto;padding:0 12px" class="${d.riasec[it.id] === o.v ? 'on' : ''}" data-act="riasec" data-item="${it.id}" data-v="${o.v}">${esc(o.label)}</button>`).join('')}</div></div>`).join('')}
      <p class="small muted">${Object.keys(d.riasec).length} of ${qc.riasec.items.length} answered</p></div>`,
    () => `<div class="stack"><p class="muted">Rate yourself honestly. Your report compares this with what the assessment measures.</p>
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
      ${step < ABOUT_STEPS.length - 1 ? '<button class="btn" data-act="q-next">Continue</button>' : `<button class="btn" data-act="q-save">${S.student.progress.questDone ? 'Save and see my report' : 'Save and start the assessment'}</button>`}</div>
  </section>`;
}

/* ================= Student: report ================= */
function abilityRows(abilities, { evidence = false } = {}) {
  const color = (b) => (b === 'Strong' ? 'var(--aqua)' : b === 'Solid' ? '#9DEFDF' : 'var(--marigold)');
  return abilities.map((a) => `<div class="stack-sm">
    <div class="ability"><span><b style="font-weight:600">${esc(a.label)}</b></span>
      <div class="bar"><i style="width:${a.score ?? 0}%;--c:${color(a.band)}"></i></div>
      <span class="num" style="font-weight:600">${a.score ?? '—'}</span>
      <span class="band">${a.band ? `<span class="tag ${a.band === 'Strong' ? 'green' : a.band === 'Solid' ? 'grey' : 'gold'}">${a.band}</span>` : ''}</span></div>
    ${evidence && a.evidence ? `<p class="small muted">${esc(a.evidence)}</p>` : ''}</div>`).join('');
}

async function reportView() {
  if (!S.student.progress.questAnswered) {
    return `<div class="card stack" style="max-width:680px;margin:0 auto"><p class="eyebrow">Your report</p><h2>Complete the aptitude assessment to unlock your report</h2>
      <p class="muted">It takes about 15 minutes. Your report shows your strengths, areas to grow and the careers that fit you.</p><div><button class="btn" data-go="quest">Start the assessment</button></div></div>`;
  }
  const r = await api(`/students/${S.student.id}/report`);
  const n = r.narrative;
  const careers = r.careers;
  const sel = r.allCareers.find((c) => c.id === S.career) || careers[0];
  const cc = sel.missionId ? await api(`/campus-connect?missionId=${encodeURIComponent(sel.missionId)}`) : { profiles: [] };
  const surprise = r.statedVsMeasured.biggestSurprise;
  const byId = Object.fromEntries(r.quest.abilities.map((a) => [a.id, a]));

  return `<div class="stack-lg">
    ${!r.quest.complete ? `<div class="card gold spread"><p><b>Your report is partial.</b> You've done ${r.quest.answered} of ${r.quest.total} questions.</p><button class="btn small" data-go="quest">Finish the assessment</button></div>` : ''}
    ${!r.questionnaireDone ? `<div class="card soft spread"><p>Add your subjects and interests to get sharper career matches.</p><button class="btn small" data-go="about">Tell us about you</button></div>` : ''}

    <section class="card navy stack">
      <p class="eyebrow">Dishaa report · ${esc(S.student.profile.name)} · Class ${esc(S.student.profile.cls || '10')}</p>
      <h1 style="max-width:30ch">${esc(n.headline)}</h1>
      <div class="row small"><span class="muted">${r.quest.stats.accuracy}% accuracy · about ${r.quest.stats.avgSeconds}s per question · ${r.quest.answered} questions answered</span>
        <span class="tag ${r.narrativeSource === 'ai' ? 'gold' : 'grey'}">${r.narrativeSource === 'ai' ? 'Written by AI from your results' : 'Standard summary'}</span></div>
    </section>

    <section class="grid-2">
      <div class="card stack"><div class="stack-sm"><p class="eyebrow">Ability profile</p><h2>What the assessment measured</h2></div>${abilityRows(r.quest.abilities)}
        <p class="small muted">Scores are out of 100, from accuracy and speed across the questions for each ability.</p></div>
      <div class="stack">
        <div class="card stack"><p class="eyebrow">Your top strengths</p>
          ${n.strengths.map((s) => `<div class="stack-sm"><h3>${esc(s.name)}</h3><p class="small">${esc(s.evidence)}</p>${s.whyItMatters ? `<p class="small muted">${esc(s.whyItMatters)}</p>` : ''}</div>`).join('<div class="divider"></div>')}</div>
        ${n.growth?.length ? `<div class="card gold stack"><p class="eyebrow" style="color:var(--gold-ink)">Areas to grow</p>
          ${n.growth.map((g) => `<div class="stack-sm"><h4>${esc(g.name)}</h4><p class="small">${esc(g.tip)}</p></div>`).join('')}</div>` : ''}
      </div>
    </section>

    ${r.questionnaireDone ? `<section class="card stack"><div class="stack-sm"><p class="eyebrow">How you see yourself vs. what you showed</p><h2>${surprise ? `Your ${esc(surprise.label.toLowerCase())} is ${surprise.gap > 0 ? 'stronger' : 'not as strong'} than you think` : 'Your self-image matches your results'}</h2>
      ${n.surprise ? `<p class="muted">${esc(n.surprise)}</p>` : ''}</div>
      <div class="stack-sm">${r.statedVsMeasured.rows.filter((x) => x.measured != null).map((x) => `<div class="svm-row"><span class="small">${esc(x.label)}</span>
        <div class="svm-track">${x.stated != null ? `<span class="dot said" style="left:${((x.stated - 1) / 4) * 100}%" title="You said ${x.stated}"></span>` : ''}<span class="dot did" style="left:${((x.measured - 1) / 4) * 100}%" title="Measured ${x.measured}"></span></div>
        <span class="small num ${x.gap > 0 ? '' : 'muted'}">${x.gap == null ? '' : `${x.gap > 0 ? '+' : ''}${x.gap}`}</span></div>`).join('')}</div>
      <div class="legend"><span><i style="background:#C3CAE0"></i>You said</span><span><i style="background:var(--purple-600)"></i>The assessment measured</span></div></section>` : ''}

    <section class="stack" id="careers">
      <div class="spread"><div class="stack-sm"><p class="eyebrow">Career matches</p><h2>Careers that fit you</h2></div>
        ${r.stream.suggestion ? `<span class="tag purple">Suggested stream: ${esc(r.stream.suggestion)}</span>` : ''}</div>
      <div class="grid-3">${careers.map((c, i) => `<button class="career ${c.id === sel.id ? 'on' : ''}" data-act="career" data-id="${c.id}">
        <div class="spread"><span class="row" style="gap:6px">${c.considering ? '<span class="tag purple">You picked this</span>' : `<span class="tag ${i === 0 ? 'gold' : 'grey'}">#${r.allCareers.findIndex((x) => x.id === c.id) + 1} match</span>`}<span class="tag grey">${esc(c.category)}</span></span><span class="fit num">${c.fit}%</span></div>
        <h3>${esc(c.name)}</h3><p class="small muted">${esc(c.summary)}</p><p class="small">${esc(c.why)}</p>
        <p class="small"><b>Early salary:</b> ${esc(c.salary)}</p><p class="small muted">Job demand in India: ${esc(c.demand)}</p></button>`).join('')}</div>
      <details class="card tight"><summary style="cursor:pointer;font-weight:600">Explore all ${r.allCareers.length} careers</summary>
        <div class="stack" style="margin-top:12px">${S.content.careerCategories.map((cat) => `<div class="stack-sm"><h4>${esc(cat)}</h4><div class="chips">${r.allCareers.filter((c) => c.category === cat).map((c) => `<button class="chip ${c.id === sel.id ? 'on' : ''}" data-act="career" data-id="${c.id}">${esc(c.name)} · ${c.fit}%</button>`).join('')}</div></div>`).join('')}</div></details>
    </section>

    <section class="card stack" id="path">
      <div class="spread"><div class="stack-sm"><p class="eyebrow">Career path · ${esc(sel.category)}</p><h2>How to become a ${esc(sel.name)}</h2></div><span class="fit num">${sel.fit}% fit</span></div>
      <div class="pc">
        <div class="pro"><p class="eyebrow">Pros</p><ul>${sel.pros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="con"><p class="eyebrow">Cons</p><ul>${sel.cons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      </div>
      <p class="small"><b>Typical early salary in India:</b> ${esc(sel.salary)} ${sel.salarySource ? (sel.salarySource.startsWith('http') ? `· <a href="${esc(sel.salarySource)}" target="_blank" rel="noopener">source</a>` : `· ${esc(sel.salarySource)}`) : ''} <span class="muted">· Job demand: ${esc(sel.demand)}</span></p>
      ${pathView(sel)}
    </section>

    ${sel.colleges.length ? `<section class="stack" id="colleges"><div class="stack-sm"><p class="eyebrow">Colleges</p><h2>Where to study</h2></div>
      <div class="grid-3">${sel.colleges.map(collegeCard).join('')}</div></section>` : ''}

    ${cc.profiles.length ? `<section class="stack" id="campus"><div class="stack-sm"><div class="row"><p class="eyebrow">Campus Connect</p><span class="tag soon">Coming soon</span></div><h2>Talk to a student from these colleges</h2>
      <p class="muted">Hear what it's really like: classes, culture, placements and hostel life.</p></div>
      <div class="grid-3">${cc.profiles.map(personCard).join('')}</div>
      <p class="small muted">A preview with sample profiles. We're onboarding alumni and current students now; chats open after our pilot with 5 schools in Bengaluru.</p></section>` : ''}

    <section class="card navy spread">
      <div class="stack-sm" style="max-width:640px"><p class="eyebrow">Dishaa Coach</p><h2>${r.hasPlan ? 'Your career plan is ready' : 'Not sure which career to aim for?'}</h2>
        <p class="muted">Chat with your AI coach to settle on a goal. It then builds your full plan: stream, exams, colleges within your budget, scholarships and what to do next.</p></div>
      <div class="row">${r.hasPlan ? '<button class="btn gold" data-go="plan">View my plan</button><button class="btn outline" data-go="coach">Talk to coach</button>' : '<button class="btn gold" data-go="coach">Talk to my coach</button>'}</div>
    </section>

    ${studyReportCard(r.study)}
    ${soonTeaser()}

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
    <span class="tag grey" style="justify-self:start">Sample profile · chats coming soon</span>
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
    return `<div class="card stack" style="max-width:680px;margin:0 auto"><h2>Complete the aptitude assessment first</h2><p class="muted">Your coach uses your results to guide you.</p><div><button class="btn" data-go="quest">Start the assessment</button></div></div>`;
  }
  coachCache = await api(`/students/${S.student.id}/coach`);
  return coachHTML();
}

// Chat text: escape, then show "+ pro" and "− con" lines with coloured markers.
const chatText = (t) => esc(t).split('\n').map((l) => (/^\+ /.test(l) ? `<span class="pc-line pro"><i>+</i>${l.slice(2)}</span>` : /^[−-] /.test(l) ? `<span class="pc-line con"><i>−</i>${l.slice(2)}</span>` : l)).join('\n');

function coachHTML(typing = false) {
  const c = coachCache;
  const userTurns = c.messages.filter((m) => m.role === 'user').length;
  const goalName = S.content.careers?.find?.((x) => x.id === c.goal)?.name;
  const opts = c.options || [];
  return `<div class="coach-layout">
    <section class="card coach">
      <div class="coach-head">${COMPASS()}<div><h3>Dishaa Coach</h3><p class="small muted">Your AI career counsellor · takes it one step at a time</p></div></div>
      <div class="msgs" id="msgs">${c.messages.map((m) => `<div class="msg ${m.role}">${m.role === 'assistant' ? chatText(m.content) : esc(m.content)}</div>`).join('')}${typing ? '<div class="msg assistant typing"><span></span><span></span><span></span></div>' : ''}</div>
      ${c.suggestions?.length && !typing ? `<div class="quick">${c.suggestions.map((t) => `<button class="chip" data-act="coach-suggest" data-text="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
      <form id="coach-form" class="coach-input"><input id="coach-msg" autocomplete="off" placeholder="Ask anything, or tell me what you enjoy…" ${typing ? 'disabled' : ''}><button class="btn" type="submit" ${typing ? 'disabled' : ''}>Send</button></form>
    </section>
    <aside class="stack">
      ${opts.length ? `<div class="card stack weigh"><div class="stack-sm"><p class="eyebrow">Weighing your options</p><p class="small muted">Pros and cons for you, from your scores, interests and priorities. Updates as you chat.</p></div>
        ${opts.map((o) => `<div class="opt ${o.id === c.goal ? 'goal' : ''}">
          <div class="spread"><b>${esc(o.name)}</b>${o.fit != null ? `<span class="tag ${o.fit >= 85 ? 'green' : 'grey'}">${o.fit}% fit</span>` : ''}</div>
          <ul class="pcl">${o.forYou.map((x) => `<li class="pro">${esc(x)}</li>`).join('')}${o.watchOut.map((x) => `<li class="con">${esc(x)}</li>`).join('')}</ul>
          <p class="small muted">${esc(o.route)}</p>
          ${o.id === c.goal ? '<span class="tag gold" style="justify-self:start">Your goal</span>' : `<div class="row" style="gap:6px"><button class="btn outline small" data-act="coach-suggest" data-text="${esc(`Tell me more about ${o.name}`)}">Ask about it</button><button class="btn ghost small" data-act="coach-suggest" data-text="${esc(`Plan for ${o.name}`)}">Plan for this</button></div>`}
        </div>`).join('')}
        ${opts.length >= 2 ? `<button class="btn outline small" data-act="coach-suggest" data-text="${esc(`Compare ${opts[0].name} and ${opts[1].name}`)}">Compare the top two</button>` : ''}
      </div>` : ''}
      ${memoryCard(c.memory)}
      <div class="card stack-sm"><p class="eyebrow">Your goal</p><h3>${esc(goalName || (c.goal ? c.goal : 'Still exploring'))}</h3>
        <p class="small muted">${c.readyForPlan ? 'When you feel sure, build your plan. You can rebuild it any time.' : "Take your time. Say \"plan for\" a career when you're sure."}</p>
        <button class="btn ${c.readyForPlan ? 'gold' : 'outline'}" data-act="build-plan" ${userTurns ? '' : 'disabled'}>${c.hasPlan ? 'Rebuild my plan' : 'Build my career plan'}</button>
        ${c.hasPlan ? '<button class="btn ghost" data-go="plan">View my plan</button>' : ''}</div>
    </aside>
  </div>`;
}

// What the coach remembers about this student. Only they see it, and they can delete any of it.
function memoryCard(mem) {
  if (!mem) return '';
  const items = [...(mem.style ? [{ id: 'style', label: mem.kinds.style, text: mem.style.text }] : []), ...mem.notes.slice().reverse()];
  return `<details class="card stack-sm mem" ${S.memOpen ? 'open' : ''}>
    <summary data-act="mem-toggle"><span class="stack-sm" style="gap:2px"><span class="eyebrow">What your coach remembers</span><span class="small muted">${items.length ? `${items.length} note${items.length === 1 ? '' : 's'} from your chats` : 'Nothing yet'}</span></span><span class="mem-chev" aria-hidden="true">${CHEV_R}</span></summary>
    <p class="small muted">Your coach keeps short notes from your chats, like what you enjoy, what worries you and how you like to talk, so its advice fits you. Only you can see these.</p>
    ${items.length ? `<ul class="mem-list">${items.map((n) => `<li><span class="stack-sm" style="gap:1px"><span class="mem-kind">${esc(n.label)}</span><span class="small">${esc(n.text)}</span></span><button class="mem-x" data-act="mem-forget" data-id="${esc(n.id)}" aria-label="Forget this">${CLOSE_ICON}</button></li>`).join('')}</ul>
      ${S.memConfirm ? `<div class="row"><button class="btn small" data-act="mem-clear">Yes, forget everything</button><button class="btn ghost small" data-act="mem-cancel">Cancel</button></div>` : '<div><button class="btn ghost small" data-act="mem-ask-clear">Forget everything</button></div>'}`
      : '<p class="small">As you chat, your coach will note things like your interests, worries and family situation here.</p>'}
  </details>`;
}
const redrawCoach = () => { $('#app').innerHTML = coachHTML(); bindInputs(); scrollMsgs(); };

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
      <p class="muted">Chat with Dishaa Coach to pick a goal, then build your plan.</p><div><button class="btn" data-go="coach">Talk to my coach</button></div></div>`;
  }
  const tierTag = { dream: 'gold', target: 'purple', safe: 'green' };
  return `<div class="stack-lg">
    <section class="card navy stack">
      <p class="eyebrow">Career plan · ${esc(S.student.profile.name)}</p>
      <h1>Goal: ${esc(plan.goal.name)}</h1>
      <p class="lead">${esc(plan.summary)}</p>
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
      <div class="card gold stack-sm"><p class="eyebrow" style="color:var(--gold-ink)">Budget and funding</p><p>${esc(plan.budgetAdvice)}</p></div>
      <div class="card stack"><h3>Your next 30 days</h3>${plan.next30Days.map((x, i) => `<label class="check"><input type="checkbox" id="p30-${i}"> <span>${esc(x)}</span></label>`).join('')}</div>
    </section>

    ${plan.scholarships?.length ? `<section class="stack"><h2>Scholarships to apply for</h2><div class="grid-3">${plan.scholarships.map(scholarshipCard).join('')}</div></section>` : ''}

    <section class="card soft spread"><div class="stack-sm"><h3>Backup options</h3><p class="small muted">Careers that also fit you well.</p>
      <div class="chips">${plan.backups.map((b) => `<button class="chip" data-act="build-plan" data-goal="${b.id}">${esc(b.name)} · ${b.fit}%</button>`).join('')}</div></div>
      <div class="row"><button class="btn outline" data-go="coach">Talk to coach</button><button class="btn" data-act="build-plan">Rebuild plan</button></div></section>
  </div>`;
}

/* ================= Student: study planner ================= */
const KIND = {
  learn: ['New chapter', 'gold'], revise: ['Revision', 'green'], test: ['Timed paper', 'purple'],
  recall: ['Light recall', 'green'], practice: ['Practice', 'grey'],
};
const SUBJECT_COLORS = ['#FFB627', '#3EE6C5', '#0A0F24', '#8EA8FF', '#F59ECF', '#0B6E5E', '#C3CAE0', '#8C5A00'];
const fmtDay = (s, opts = { day: 'numeric', month: 'short' }) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', opts);
const setPath = (obj, path, v) => { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach((k) => { o = o[k]; }); o[ks[ks.length - 1]] = v; };

function studyDraft() {
  const p = S.student.profile || {};
  const c = S.content.study;
  const cls = String(p.cls || '10');
  const existing = S.studyCache?.exists ? S.studyCache.input : null;
  if (existing) {
    return {
      exams: existing.exams.filter((e) => e.presetId),
      custom: existing.exams.filter((e) => !e.presetId).map((e) => ({ name: e.name, date: e.date, subjects: (e.subjects || []).join(', ') })),
      subjects: existing.subjects.map((s) => ({ name: s.name, confidence: s.confidence, topics: s.topics.join('\n') })),
      weekdayHours: existing.weekdayHours, weekendHours: existing.weekendHours, slot: existing.slot,
      sources: [...existing.sources], sourcesOther: existing.sourcesOther || '',
      activities: existing.activities.map((a) => ({ ...a })),
    };
  }
  const stated = p.stated || {};
  const conf = (name) => ({ Maths: stated.numerical, English: stated.verbal, Science: stated.logical, Physics: stated.logical, Chemistry: stated.logical, Biology: stated.memory }[name] || 3);
  const skip = ['Art', 'Music', 'Physical Education'];
  const board = c.exams.find((e) => e.kind === 'board' && e.classes.includes(cls) && (!p.board || e.board === p.board));
  const goal = goalCareer();
  const goalExams = goal ? c.exams.filter((e) => e.kind === 'entrance' && (e.matches || []).some((m) => goal.exams.join(' ').includes(m))) : [];
  return {
    exams: [...(board ? [{ presetId: board.id }] : []), ...goalExams.slice(0, 2).map((e) => ({ presetId: e.id }))],
    custom: [],
    subjects: (p.subjects || ['Maths', 'Science', 'English']).filter((s) => !skip.includes(s)).map((name) => ({
      name, confidence: conf(name), topics: (c.syllabus[cls]?.[name] || []).join('\n'),
    })),
    weekdayHours: 2, weekendHours: 4, slot: 'evening',
    sources: ['ncert'], sourcesOther: '',
    activities: [],
  };
}

// Entrance exams are shown for the year this student sits them (Class 10 now → UCEED 2029).
function projectExam(e, cls) {
  const yrs = e.kind === 'entrance' && Number(cls) < 12 && !e.classes.includes(String(cls)) ? 12 - Number(cls) : 0;
  if (!yrs) return e;
  const sh = (s) => `${Number(s.slice(0, 4)) + yrs}${s.slice(4)}`;
  return { ...e, name: e.name.replace(/20\d\d/, String(Number(e.start.slice(0, 4)) + yrs)), start: sh(e.start), end: sh(e.end), estimated: true };
}

function studyView() {
  const html = () => (!S.studyCache.exists || S.spEditing ? studySetupHTML() : studyPlanHTML(S.studyCache));
  if (S.studyCache) return html();
  return api(`/students/${S.student.id}/study`).then((d) => { S.studyCache = d; return html(); });
}

function studySetupHTML() {
  S.sp ||= studyDraft();
  const d = S.sp;
  const c = S.content.study;
  const cls = String(S.student.profile?.cls || '10');
  const presets = c.exams.filter((e) => e.kind !== 'board' || e.classes.includes(cls)).map((e) => projectExam(e, cls));
  const hours = (list, v) => list.map((h) => `<option value="${h}" ${Number(v) === h ? 'selected' : ''}>${h === 0 ? 'None' : `${h} hour${h === 1 ? '' : 's'}`}</option>`).join('');
  return `<div class="stack-lg" style="max-width:880px;margin:0 auto">
    <section class="stack-sm"><p class="eyebrow">Study planner</p><h1>Plan your study around your exams</h1>
      <p class="lead">Add your exams, subjects and free time. Dishaa builds a day-by-day plan with spaced revision and timed papers, and suggests activities that build your profile.</p></section>

    <section class="card stack"><div class="stack-sm"><h3>Your exams</h3><p class="small muted">Dates as reported in November 2026. Always confirm on the official website.</p></div>
      ${presets.length ? `<div class="stack-sm">${presets.map((e) => `<label class="check"><input type="checkbox" data-act="sp-exam" data-id="${e.id}" ${d.exams.some((x) => x.presetId === e.id) ? 'checked' : ''}>
        <span>${esc(e.name)} <span class="small muted">· ${fmtDay(e.start)}${e.end !== e.start ? ` to ${fmtDay(e.end)}` : ''}</span> ${e.estimated ? '<span class="tag gold">Expected date</span>' : ''}</span></label>`).join('')}</div>`
        : '<p class="small muted">No board or entrance exams are listed for your class yet. Add your school exams below.</p>'}
      <div class="stack-sm"><h4>School exams and tests</h4>
        ${d.custom.map((x, i) => `<div class="sp-row">
          <input id="sp-cname-${i}" data-sp="custom.${i}.name" value="${esc(x.name)}" placeholder="e.g. Pre-board exams" aria-label="Exam name">
          <input id="sp-cdate-${i}" type="date" data-sp="custom.${i}.date" value="${esc(x.date)}" aria-label="Date">
          <input id="sp-csub-${i}" data-sp="custom.${i}.subjects" value="${esc(x.subjects)}" placeholder="Subjects, separated by commas" aria-label="Subjects">
          <button class="btn outline small" data-act="sp-del" data-list="custom" data-i="${i}">Remove</button></div>`).join('')}
        <div><button class="btn outline small" data-act="sp-add" data-list="custom">Add an exam</button></div></div>
    </section>

    <section class="card stack"><div class="stack-sm"><h3>Your subjects</h3>
      <p class="small muted">Rate how confident you feel, and keep only the chapters you still need to study. Chapters you remove still get regular revision.</p></div>
      <div class="sp-subjects">${d.subjects.map((s, i) => `<div class="sp-subject">
        <div class="spread"><b style="font-weight:500">${esc(s.name)}</b>
          <div class="row" style="gap:10px"><span class="small muted">Confidence</span>
            <div class="scale" role="group" aria-label="${esc(s.name)} confidence">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${Number(s.confidence) === n ? 'on' : ''}" data-act="sp-conf" data-i="${i}" data-n="${n}" aria-label="${n} of 5">${n}</button>`).join('')}</div>
            <button class="btn ghost small" data-act="sp-del" data-list="subjects" data-i="${i}">Remove</button></div></div>
        <details><summary class="small">Chapters still to study (${s.topics.split('\n').filter((t) => t.trim()).length})</summary>
          <textarea id="sp-topics-${i}" data-sp="subjects.${i}.topics" rows="7" placeholder="One chapter per line. Leave empty if you only need to revise.">${esc(s.topics)}</textarea></details>
      </div>`).join('')}</div>
      <div class="row"><input id="sp-newsub" placeholder="Add a subject, e.g. Hindi" style="max-width:280px" aria-label="New subject"><button class="btn outline small" data-act="sp-add-subject">Add subject</button></div>
    </section>

    <section class="card stack"><h3>Your time</h3>
      <div class="grid-3" style="gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))">
        <label>Study time on school days<select id="sp-wd" data-sp="weekdayHours">${hours([0.5, 1, 1.5, 2, 2.5, 3, 4, 5], d.weekdayHours)}</select></label>
        <label>Study time on weekends<select id="sp-we" data-sp="weekendHours">${hours([0, 1, 2, 3, 4, 5, 6, 8], d.weekendHours)}</select></label>
        <label>When you usually study<select id="sp-slot" data-sp="slot">${c.slots.map((x) => `<option value="${x.id}" ${d.slot === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      </div>
      <p class="small muted">Sessions are 45 minutes with a short break in between.</p>
    </section>

    <section class="card stack"><div class="stack-sm"><h3>What you study from</h3><p class="small muted">Pick everything you use. The plan points each session to the right source.</p></div>
      <div class="chips">${c.sources.map((x) => `<button type="button" class="chip ${d.sources.includes(x.id) ? 'on' : ''}" data-act="sp-source" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>
      <label><span>Anything else <span class="muted small">(optional)</span></span><input id="sp-other" data-sp="sourcesOther" value="${esc(d.sourcesOther)}" placeholder="e.g. a coaching app, a tutor"></label>
    </section>

    <section class="card stack"><div class="stack-sm"><h3>Activities you do now</h3><p class="small muted">Sports, music, clubs or classes. They stay in your week, and we suggest when to cut back before exams.</p></div>
      ${d.activities.map((a, i) => `<div class="sp-row sp-row-2">
        <input id="sp-aname-${i}" data-sp="activities.${i}.name" value="${esc(a.name)}" placeholder="e.g. Football" aria-label="Activity">
        <label class="row" style="gap:8px;font-weight:400"><input id="sp-ahours-${i}" type="number" min="0" max="20" step="0.5" data-sp="activities.${i}.hours" value="${esc(a.hours)}" style="width:90px" aria-label="Hours a week"> hours a week</label>
        <button class="btn outline small" data-act="sp-del" data-list="activities" data-i="${i}">Remove</button></div>`).join('')}
      <div><button class="btn outline small" data-act="sp-add" data-list="activities">Add an activity</button></div>
    </section>

    <div class="spread"><span class="small muted">You can change any of this later.</span>
      <div class="row">${S.studyCache?.exists ? '<button class="btn outline" data-act="sp-cancel">Cancel</button>' : ''}<button class="btn gold" data-act="sp-build">Build my study plan</button></div></div>
  </div>`;
}

function sessionRow(s, done, { canTick = true } = {}) {
  const [label, tag] = KIND[s.kind] || [s.kind, 'grey'];
  return `<label class="sess ${done ? 'done' : ''}">
    <input type="checkbox" data-act="sp-done" data-id="${esc(s.id)}" ${done ? 'checked' : ''} ${canTick ? '' : 'disabled'} aria-label="Mark done">
    <span class="stack-sm" style="gap:3px"><span class="row" style="gap:8px"><span class="tag ${tag}">${label}</span><span class="small muted num">${s.minutes} min</span></span>
      <span class="sess-title">${esc(s.title)}</span><span class="small muted">${esc(s.detail)}</span></span></label>`;
}

function studyPlanHTML(p) {
  const today = p.today;
  const next = p.examDays.find((x) => x.daysLeft >= 0);
  const sel = S.studyDay || today;
  const daySessions = (d) => p.sessions.filter((s) => s.date === d);
  const examOn = (d) => p.examDays.filter((x) => x.date === d);
  const days = Array.from({ length: 14 }, (_, i) => { const dt = new Date(`${today}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() + i); return dt.toISOString().slice(0, 10); });
  const colors = Object.fromEntries(p.subjects.map((s, i) => [s.name, SUBJECT_COLORS[i % SUBJECT_COLORS.length]]));
  const hoursWeek = Math.round((p.input.weekdayHours * 5 + p.input.weekendHours * 2) * 10) / 10;
  const chaptersLeft = p.subjects.reduce((a, s) => a + (s.toLearnCount || 0), 0);
  const pr = p.progress;
  const acts = p.activities;
  const pauseText = acts.pauses.length ? acts.pauses.map((x) => `${fmtDay(x.from)} to ${fmtDay(x.to)} (${esc(x.exam)})`).join('; ') : '';
  const used = p.input.sources.map((id) => S.content.study.sources.find((x) => x.id === id)).filter(Boolean);
  const missing = S.content.study.sources.filter((x) => x.official && !p.input.sources.includes(x.id));
  const maxWeek = Math.max(1, ...p.weeks.map((w) => w.minutes));
  const selSessions = daySessions(sel);

  return `<div class="stack-lg">
    <section class="card navy stack">
      <div class="spread" style="align-items:flex-start"><div class="stack-sm"><p class="eyebrow">Study plan · ${esc(S.student.profile.name)}</p>
        <h1>${next ? `${next.daysLeft === 0 ? 'Today' : `${next.daysLeft} day${next.daysLeft === 1 ? '' : 's'} to`} ${esc(next.title)}` : 'Your study plan'}</h1>
        <p class="lead">${hoursWeek} hours a week, ${p.totals.sessions} sessions until ${fmtDay(p.end, { day: 'numeric', month: 'long', year: 'numeric' })}. ${next?.estimated ? 'The exam date is expected, not confirmed.' : ''}</p></div>
        <div class="row"><button class="btn gold" data-go="calendar">Open calendar</button><button class="btn outline" data-act="sp-edit">Edit plan</button></div></div>
    </section>

    <section class="grid-4">
      <div class="card stat"><span class="muted small">This week</span><b class="num">${pr.week.done}<span class="stat-of"> / ${pr.week.planned}</span></b><span class="small muted">sessions done</span></div>
      <div class="card stat"><span class="muted small">So far</span><b class="num">${pr.percent == null ? '—' : `${pr.percent}%`}</b><span class="small muted">${pr.done} of ${pr.planned} past sessions</span></div>
      <div class="card stat"><span class="muted small">Streak</span><b class="num">${pr.streak}</b><span class="small muted">day${pr.streak === 1 ? '' : 's'} in a row</span></div>
      <div class="card stat"><span class="muted small">Chapters to learn</span><b class="num">${chaptersLeft}</b><span class="small muted">across ${p.subjects.length} subjects</span></div>
    </section>

    ${p.warnings.length ? `<section class="card gold stack-sm"><p class="eyebrow" style="color:var(--gold-ink)">Check your plan</p>${p.warnings.map((w) => `<p class="small">${esc(w)}</p>`).join('')}</section>` : ''}

    <section class="grid-2">
      <div class="card stack"><div class="spread"><h3>Today</h3><span class="small muted">${fmtDay(today, { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
        ${examOn(today).map((x) => `<p class="exam-flag">Exam today: ${esc(x.title)}</p>`).join('')}
        ${daySessions(today).length ? `<div class="sess-list">${daySessions(today).map((s) => sessionRow(s, p.done[s.id])).join('')}</div>` : '<p class="muted small">Nothing planned today. Rest well.</p>'}</div>
      <div class="card stack"><h3>Exam countdown</h3>
        <div class="countdown">${p.examDays.filter((x) => x.daysLeft >= 0).slice(0, 10).map((x) => `<div class="cd-row ${x.far ? 'far' : ''}"><span class="cd-days num">${x.daysLeft}<small>days</small></span>
          <span class="stack-sm" style="gap:1px"><span>${esc(x.title)}</span><span class="small muted">${fmtDay(x.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${x.estimated ? ' · expected date' : ''}</span></span>
          <span class="tag ${x.kind === 'entrance' ? 'gold' : x.kind === 'board' ? 'green' : 'grey'}">${x.kind === 'entrance' ? 'Entrance' : x.kind === 'board' ? 'Board' : 'School'}</span></div>`).join('') || '<p class="small muted">No upcoming exams. Add your boards or entrance exams in Edit plan.</p>'}</div>
        ${p.subjects.some((s) => s.dateGuessed) ? `<p class="small muted">${p.subjects.filter((s) => s.dateGuessed).map((s) => esc(s.name)).join(', ')}: paper date not listed yet, so the plan uses the first day of the exams.</p>` : ''}
        ${p.exams.filter((e) => e.source).map((e) => `<p class="small muted">${esc(e.name)}: ${esc(e.note || '')} <a href="${esc(e.source)}" target="_blank" rel="noopener">Official site</a></p>`).join('')}
      </div>
    </section>

    <section class="card stack"><div class="spread"><h3>Next two weeks</h3><div class="legend">${Object.entries(KIND).map(([k, [l]]) => `<span><i class="k-${k}"></i>${l}</span>`).join('')}</div></div>
      <div class="days">${days.map((d) => { const ss = daySessions(d); const ex = examOn(d); return `<button class="day ${d === sel ? 'on' : ''} ${d === today ? 'today' : ''}" data-act="sp-day" data-d="${d}">
        <span class="day-w">${fmtDay(d, { weekday: 'short' })}</span><span class="day-n num">${fmtDay(d, { day: 'numeric' })}</span>
        <span class="day-dots">${ss.map((s) => `<i class="k-${s.kind} ${p.done[s.id] ? 'is-done' : ''}"></i>`).join('')}</span>${ex.length ? '<span class="day-exam">Exam</span>' : ''}</button>`; }).join('')}</div>
      ${sel === today ? '<p class="small muted">Pick a day to see its sessions. Today\'s are listed above.</p>' : `<div class="stack-sm"><h4>${fmtDay(sel, { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
        ${examOn(sel).map((x) => `<p class="exam-flag">Exam: ${esc(x.title)}</p>`).join('')}
        ${selSessions.length ? `<div class="sess-list">${selSessions.map((s) => sessionRow(s, p.done[s.id], { canTick: s.date <= today })).join('')}</div>` : '<p class="small muted">Nothing planned.</p>'}</div>`}
    </section>

    <section class="card stack"><div class="stack-sm"><h3>Week by week</h3><p class="small muted">Hours planned each week, by subject.</p></div>
      <div class="legend">${p.subjects.map((s) => `<span><i style="background:${colors[s.name]}"></i>${esc(s.name)}</span>`).join('')}</div>
      <div class="table-scroll"><table class="weeks"><thead><tr><th>Week</th><th>Focus</th><th style="width:40%">Hours</th><th>Exams</th></tr></thead><tbody>
        ${p.weeks.map((w) => `<tr class="${w.start <= today && today <= w.end ? 'live' : ''}"><td class="small num" style="white-space:nowrap">${fmtDay(w.start)} – ${fmtDay(w.end)}</td><td class="small">${esc(w.phase)}</td>
          <td><div class="row" style="gap:10px;flex-wrap:nowrap"><div class="stackbar" style="width:${Math.round((w.minutes / maxWeek) * 100)}%">${Object.entries(w.bySubject).map(([sub, m]) => `<i style="flex:${m};background:${colors[sub] || 'var(--faint)'}" title="${esc(sub)}: ${Math.round(m / 6) / 10} h"></i>`).join('')}</div><span class="small num muted">${Math.round(w.minutes / 6) / 10}</span></div></td>
          <td class="small">${w.exams.map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div>
    </section>

    <section class="stack"><div class="stack-sm"><p class="eyebrow">Beyond the classroom</p><h2>Activities that build your profile</h2>
      <p class="muted">${acts.careerName ? `Picked for your goal, ${esc(acts.careerName)}, and your interests.` : 'Picked from your interests.'} ${pauseText ? `Cut back during exam season: ${pauseText}.` : ''}</p></div>
      <div class="grid-2 two">${acts.recommended.map((a) => `<div class="card tight stack-sm"><div class="spread"><h4>${esc(a.name)}</h4><span class="tag grey">${esc(a.type)}</span></div>
        ${a.fitsCareer ? `<span class="tag purple" style="justify-self:start">Builds toward ${esc(a.fitsCareer)}</span>` : ''}
        <p class="small">${esc(a.why)}</p><p class="small muted">${esc(a.when)}${a.hoursPerWeek ? ` About ${a.hoursPerWeek} hour${a.hoursPerWeek === 1 ? '' : 's'} a week.` : ''}</p>
        ${a.url ? `<a class="small" href="${esc(a.url)}" target="_blank" rel="noopener">Official site</a>` : ''}</div>`).join('')}</div>
      ${acts.yours.length ? `<div class="card tight stack-sm"><h4>Your activities</h4>${acts.yours.map((a) => `<div class="spread small"><span>${esc(a.name)}</span><span class="muted num">${a.hours} h a week</span></div>`).join('')}
        <p class="small muted">Keep them going. Shorter sessions in exam season help you rest, so don't drop exercise entirely.</p></div>` : ''}
    </section>

    <section class="grid-2">
      <div class="card stack"><h3>Your study sources</h3>
        ${used.length ? `<ul class="clean small">${used.map((x) => `<li><b style="font-weight:500">${esc(x.name)}</b>: ${esc(x.for)}</li>`).join('')}${p.input.sourcesOther ? `<li>${esc(p.input.sourcesOther)}</li>` : ''}</ul>` : '<p class="small muted">None added.</p>'}
        ${missing.length ? `<div class="stack-sm"><h4>Free official sources to add</h4>${missing.map((x) => `<p class="small"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a> · ${esc(x.for)}</p>`).join('')}</div>` : ''}</div>
      <div class="card stack"><div class="spread"><h3>From your study coach</h3><span class="tag ${p.note?.source === 'ai' ? 'gold' : 'grey'}">${p.note?.source === 'ai' ? 'Written by AI' : 'Standard tips'}</span></div>
        ${p.note?.headline ? `<p>${esc(p.note.headline)}</p>` : ''}
        <ul class="clean small">${(p.note?.tips || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </section>

    <section class="card soft stack"><div class="stack-sm"><p class="eyebrow">The research behind this plan</p><h3>Why it's built this way</h3></div>
      <div class="grid-2">${S.content.study.techniques.map((t) => `<div class="stack-sm"><h4>${esc(t.name)}</h4><p class="small">${esc(t.how)}</p><p class="small muted">${esc(t.evidence)} <a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.cite)}</a></p></div>`).join('')}</div>
    </section>
  </div>`;
}

function studyReportCard(st, { parent = false } = {}) {
  if (!st) {
    return parent ? '' : `<section class="card soft spread"><div class="stack-sm" style="max-width:640px"><h3>Plan your study around your exams</h3>
      <p class="small muted">Add your exam dates, subjects and free time. Dishaa builds a day-by-day plan with revision, timed papers and activities that build your profile.</p></div>
      <button class="btn" data-go="study">Build my study plan</button></section>`;
  }
  const n = st.nextExam;
  return `<section class="card stack"><div class="spread"><div class="stack-sm"><p class="eyebrow">Study plan</p>
      <h2>${n ? `${n.daysLeft} day${n.daysLeft === 1 ? '' : 's'} to ${esc(n.title)}` : 'Study plan'}</h2></div>
      ${parent ? '' : '<button class="btn outline" data-go="study">Open study planner</button>'}</div>
    <div class="grid-3">
      <div class="stat"><span class="muted small">This week</span><b class="num">${st.week.done}<span class="stat-of"> / ${st.week.planned}</span></b><span class="small muted">sessions done</span></div>
      <div class="stat"><span class="muted small">Planned study</span><b class="num">${st.hoursPerWeek}</b><span class="small muted">hours a week</span></div>
      <div class="stat"><span class="muted small">Streak</span><b class="num">${st.streak}</b><span class="small muted">day${st.streak === 1 ? '' : 's'} in a row</span></div>
    </div>
    ${st.entrance?.length ? `<div class="row" style="gap:8px">${st.entrance.map((x) => `<span class="tag gold">${esc(x.title)}: ${x.daysLeft} days${x.estimated ? ' (expected)' : ''}</span>`).join('')}</div>` : ''}
    ${st.activities?.length ? `<p class="small"><span class="muted">Suggested activities:</span> ${st.activities.map(esc).join(' · ')}</p>` : ''}
  </section>`;
}

/* ================= Student: calendar ================= */
const todayLocal = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const dAdd = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (s) => (new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
const monthFirst = (s, shift = 0) => { const [y, m] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + shift, 1)).toISOString().slice(0, 10); };
const CAL_KIND = { learn: 'New', revise: 'Revise', test: 'Timed paper', recall: 'Recall', practice: 'Practice' };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function calRange(c) {
  if (c.view === 'week') { const from = dAdd(c.cursor, -dow(c.cursor)); return [from, dAdd(from, 6)]; }
  const first = monthFirst(c.cursor); const last = dAdd(monthFirst(c.cursor, 1), -1);
  return [dAdd(first, -dow(first)), dAdd(last, 6 - dow(last))];
}
const calKey = (c) => calRange(c).join('_');
const calShift = (c, n) => (c.view === 'week' ? dAdd(c.cursor, 7 * n) : monthFirst(c.cursor, n));
function calFetch(c) {
  const [from, to] = calRange(c);
  return api(`/students/${S.student.id}/study/calendar?from=${from}&to=${to}`).then((d) => { S.cal.cache[calKey(c)] = d; S.cal.done = d.done; return d; });
}
function calPrefetch() {
  for (const n of [-1, 1]) {
    const c = { ...S.cal, cursor: calShift(S.cal, n) }; const k = calKey(c);
    if (!S.cal.cache[k]) { S.cal.cache[k] = 'loading'; calFetch(c).catch(() => { delete S.cal.cache[k]; }); }
  }
}

function calendarView() {
  S.cal ||= { view: 'month', cursor: todayLocal(), sel: todayLocal(), cache: {}, done: {} };
  const d = S.cal.cache[calKey(S.cal)];
  if (d && typeof d === 'object') { setTimeout(calPrefetch, 50); return calHTML(d); }
  return calFetch(S.cal).then((data) => { setTimeout(calPrefetch, 50); return calHTML(data); });
}

function calHTML(d) {
  if (!d.exists) {
    return `<section class="card navy stack" style="max-width:820px;margin:0 auto"><p class="eyebrow">Calendar</p><h1>Your calendar fills in from your study plan</h1>
      <p class="lead">Add your exams, subjects and free time in the study planner. Every session, revision and exam then shows up here, day by day.</p>
      <div><button class="btn gold" data-go="study">Build my study plan</button></div></section>`;
  }
  const c = S.cal; const today = d.today; const done = S.cal.done || d.done || {};
  const [from, to] = calRange(c);
  const days = []; for (let x = from; x <= to; x = dAdd(x, 1)) days.push(x);
  const byDay = {}; d.sessions.forEach((s) => { (byDay[s.date] ||= []).push(s); });
  const examsOn = (x) => d.examDays.filter((e) => e.date === x);
  const examLabel = (e) => (e.subject ? `${e.subject} exam` : e.title.replace(/ begin$/, ' begin'));
  const month = new Date(`${monthFirst(c.cursor)}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtD = (x, o) => new Date(`${x}T00:00:00Z`).toLocaleDateString('en-IN', { ...o, timeZone: 'UTC' });
  const title = c.view === 'month' ? month : `${fmtD(from, { day: 'numeric', month: 'short' })} – ${fmtD(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const curMonth = monthFirst(c.cursor).slice(0, 7);
  const evName = (s) => `${esc(s.subject || 'Study')} · ${CAL_KIND[s.kind] || s.kind}`;

  const monthGrid = `<div class="cal-grid" role="grid" aria-label="${esc(month)}">
    ${DOW.map((w) => `<div class="cal-dow" role="columnheader">${w}</div>`).join('')}
    ${days.map((x) => { const ss = byDay[x] || []; const ex = examsOn(x); return `<button class="cal-day ${x.slice(0, 7) !== curMonth ? 'out' : ''} ${x === today ? 'today' : ''} ${x === c.sel ? 'sel' : ''} ${x < today ? 'past' : ''}" data-act="cal-sel" data-d="${x}" aria-label="${fmtD(x, { weekday: 'long', day: 'numeric', month: 'long' })}: ${ss.length} sessions${ex.length ? ', exam' : ''}">
      <span class="cal-n">${Number(x.slice(8))}</span>
      ${ex.map((e) => `<span class="cal-exam">${esc(examLabel(e))}</span>`).join('')}
      ${ss.slice(0, ex.length ? 2 : 3).map((s) => `<span class="ev k-${s.kind} ${done[s.id] ? 'is-done' : ''}" title="${evName(s)}">${esc(s.subject || 'Study')}</span>`).join('')}
      ${ss.length > (ex.length ? 2 : 3) ? `<span class="ev-more">+${ss.length - (ex.length ? 2 : 3)} more</span>` : ''}
    </button>`; }).join('')}
  </div>`;

  const weekGrid = `<div class="cal-week-wrap"><div class="cal-week">
    ${days.map((x) => { const ss = byDay[x] || []; return `<div class="wk-col ${x === today ? 'today' : ''} ${x === c.sel ? 'sel' : ''}">
      <button class="wk-head" data-act="cal-sel" data-d="${x}"><span>${DOW[dow(x)]}</span><b>${Number(x.slice(8))}</b></button>
      ${examsOn(x).map((e) => `<div class="cal-exam">${esc(examLabel(e))}</div>`).join('')}
      ${ss.map((s) => `<button class="wk-ev k-${s.kind} ${done[s.id] ? 'is-done' : ''}" data-act="cal-sel" data-d="${x}" style="min-height:${Math.round(s.minutes * 1.25)}px"><span class="wk-t">${s.start}</span><b>${esc(s.subject || 'Study')}</b><span>${CAL_KIND[s.kind] || ''}</span></button>`).join('')}
      ${!ss.length && !examsOn(x).length ? '<p class="wk-free">Free</p>' : ''}
    </div>`; }).join('')}
  </div></div>`;

  const sel = c.sel; const selSs = byDay[sel] || [];
  const agenda = `<div class="card stack cal-agenda">
    <div class="stack-sm"><p class="eyebrow">${sel === today ? 'Today' : sel < today ? 'Past day' : 'Coming up'}</p><h3>${fmtD(sel, { weekday: 'long', day: 'numeric', month: 'long' })}</h3></div>
    ${examsOn(sel).map((e) => `<p class="exam-flag">Exam: ${esc(e.title)}${e.estimated ? ' (expected date)' : ''}</p>`).join('')}
    ${selSs.length ? `<div class="agenda">${selSs.map((s) => `<label class="ag-row ${done[s.id] ? 'done' : ''}">
        <span class="ag-time num">${s.start}<small>${s.minutes} min</small></span>
        <span class="ag-dot k-${s.kind}"></span>
        <span class="stack-sm" style="gap:2px"><span class="ag-title">${esc(s.title)}</span><span class="small muted">${esc(s.detail)}</span></span>
        <input type="checkbox" data-act="cal-done" data-id="${esc(s.id)}" ${done[s.id] ? 'checked' : ''} ${s.date > today ? 'disabled' : ''} aria-label="Mark done">
      </label>`).join('')}</div>` : `<p class="muted small">${sel < d.start || sel > d.end ? 'Outside your study plan.' : 'Nothing planned. Enjoy the break.'}</p>`}
  </div>`;

  const upcoming = d.examDays.filter((e) => e.daysLeft >= 0 && !/ ends$/.test(e.title)).slice(0, 5);
  return `<div class="stack-lg">
    <section class="cal-top">
      <div class="stack-sm"><p class="eyebrow">Calendar · ${esc(d.slot)}</p><h1>${esc(title)}</h1></div>
      <div class="cal-ctrl">
        <div class="tabs seg" role="tablist">${['month', 'week'].map((v) => `<button role="tab" aria-selected="${c.view === v}" class="${c.view === v ? 'on' : ''}" data-act="cal-view" data-v="${v}">${v === 'month' ? 'Month' : 'Week'}</button>`).join('')}</div>
        <div class="row" style="gap:6px"><button class="icon-btn light" data-act="cal-nav" data-n="-1" aria-label="Previous">${CHEV_L}</button><button class="btn outline small" data-act="cal-today">Today</button><button class="icon-btn light" data-act="cal-nav" data-n="1" aria-label="Next">${CHEV_R}</button></div>
      </div>
    </section>
    <section class="cal-layout">
      <div class="card cal-main">${c.view === 'month' ? monthGrid : weekGrid}
        <div class="legend" style="margin-top:14px">${Object.entries(CAL_KIND).map(([k, l]) => `<span><i class="k-${k}"></i>${l === 'New' ? 'New chapter' : l}</span>`).join('')}<span><i style="background:var(--marigold)"></i>Exam</span></div></div>
      <aside class="stack">
        ${agenda}
        <div class="card stack"><h3>Exam countdown</h3>
          <div class="countdown">${upcoming.map((e) => `<div class="cd-row ${e.far ? 'far' : ''}"><span class="cd-days num">${e.daysLeft}<small>days</small></span><span class="stack-sm" style="gap:1px"><span>${esc(e.title)}</span><span class="small muted">${fmtD(e.date, { day: 'numeric', month: 'short', year: 'numeric' })}${e.estimated ? ' · expected' : ''}</span></span><span></span></div>`).join('') || '<p class="small muted">No upcoming exams.</p>'}</div></div>
        <div class="card soft stack-sm"><h4>Prefer your phone's calendar?</h4><p class="small muted">Add the next 60 days to Google Calendar, Apple Calendar or Outlook.</p><div><button class="btn ghost" data-act="sp-ics">Sync to my phone calendar</button></div></div>
      </aside>
    </section>
  </div>`;
}

/* ================= Coming soon: alumni, mentors, counsellors, prep materials ================= */
const COMPASS = (cls = '') => `<svg class="${cls}" viewBox="0 0 30 30" width="28" height="28" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"></circle><g class="needle"><polygon points="15,15 22,7 17,17" fill="#FFB627"></polygon><polygon points="15,15 8,23 13,13" fill="currentColor"></polygon></g></svg>`;
const SOON_NOTE = "We're onboarding alumni, mentors and career counsellors now, and our prep materials are in preparation. These open after our pilot with 5 schools in Bengaluru.";
const SOON_ICONS = {
  alumni: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5Z"></path><path d="M6 12v5c3 2 9 2 12 0v-5"></path></svg>',
  mentors: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
  counsellors: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  materials: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"></path><path d="M8 7h8M8 11h6"></path></svg>',
};

function goalCareer() {
  const st = S.student || {};
  const id = st.plan?.goal?.id || st.coach?.goal || (st.profile?.considering || [])[0];
  return S.content.careers.find((c) => c.id === id) || null;
}

function soonBanner() {
  return `<div class="soon-banner"><span class="tag soon">Coming soon</span><p class="small" style="color:var(--marigold-ink)">${SOON_NOTE}</p></div>`;
}

function soonTeaser() {
  return `<section class="card stack"><div class="spread"><div class="stack-sm"><p class="eyebrow">Coming soon</p><h3>Mentors, alumni, counsellors and prep materials</h3></div>
    <button class="btn outline small" data-go="mentors">See what's coming</button></div>
    <p class="small muted">${SOON_NOTE}</p></section>`;
}

async function mentorsView() {
  const c = goalCareer();
  const colleges = c?.missionId ? (await api(`/colleges?missionId=${encodeURIComponent(c.missionId)}`)).colleges : [];
  const on = new Set(S.student.waitlist || []);
  const path = c ? esc(c.name) : 'your chosen career';
  const exams = c?.exams || [];
  const official = S.content.study.sources.filter((x) => x.official);
  const card = (key, title, body, status, preview) => `<article class="card soon-card">
    <div class="spread"><span class="ico">${SOON_ICONS[key]}</span><span class="tag soon">Coming soon</span></div>
    <h3>${title}</h3><p class="small muted">${body}</p>${preview || ''}
    <span class="status">${status}</span>
    <div><button class="btn ${on.has(key) ? 'outline' : 'gold'} small" data-act="waitlist" data-feature="${key}" ${on.has(key) ? 'disabled' : ''}>${on.has(key) ? "You're on the list" : 'Notify me when it opens'}</button></div>
  </article>`;
  return `<div class="stack-lg">
    <section class="card navy stack"><p class="eyebrow">Your people and prep · ${c ? `for ${path}` : 'for your path'}</p>
      <h1>Learn from people who've walked your path</h1>
      <p class="lead">Talk to alumni and mentors ${c ? `on the ${path} path` : 'in your chosen career'}, get a second opinion from a career counsellor, and prepare with material made for your exact route.</p></section>
    ${soonBanner()}
    <section class="soon-grid">
      ${card('alumni', 'Alumni and college students', `Students and recent graduates of the colleges you're considering, on classes, hostels, fees and placements as they really are.`, 'Onboarding alumni',
        colleges.length ? `<p class="small"><span class="muted">For you, from colleges like:</span> ${colleges.slice(0, 3).map((x) => esc(x.name)).join(' · ')}</p>` : '')}
      ${card('mentors', 'Mentors working in your career', `Professionals ${c ? `on the ${path} path` : 'in your chosen career'} who'll tell you what a normal day looks like, what they wish they'd known at your age, and how they got there.`, 'Onboarding mentors')}
      ${card('counsellors', 'Career counsellors', 'Verified counsellors for a 15-minute second opinion, with your Dishaa report already shared so you skip the basics.', 'Onboarding counsellors')}
      ${card('materials', `Prep materials for ${path}`, 'Material for your exact route: syllabus guides, practice sets and portfolio or interview prep, matched to your study plan.', 'Materials in preparation',
        exams.length ? `<p class="small"><span class="muted">Planned for:</span> ${exams.map(esc).join(' · ')}</p>` : '')}
    </section>
    <section class="card soft stack"><div class="stack-sm"><p class="eyebrow">Available today</p><h3>Free official sources you can use now</h3></div>
      <div class="grid-2">${official.map((x) => `<p class="small"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a><br><span class="muted">${esc(x.for)}</span></p>`).join('')}</div>
      <div><button class="btn outline small" data-go="study">Open my study planner</button></div></section>
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
    <section class="card navy stack"><p class="lead" style="max-width:none">${esc(pr.summary)}</p>
      <span class="small muted">${pr.source === 'ai' ? 'Written by AI from your child\'s results' : 'Standard summary'}</span></section>
    <section class="grid-2">
      <div class="card stack"><p class="eyebrow">Ability profile</p>${abilityRows(report.quest.abilities)}</div>
      <div class="stack">
        <div class="card stack-sm"><p class="eyebrow">Your hope</p><h3>${esc(pr.parentExpect || 'Not shared yet')}</h3>${pr.parentReason ? `<p class="small muted">"${esc(pr.parentReason)}"</p>` : ''}</div>
        <div class="card stack-sm"><p class="eyebrow" style="color:var(--green)">Where it matches</p><p>${esc(pr.match)}</p></div>
        <div class="card stack-sm"><p class="eyebrow" style="color:var(--gold-ink)">Where it differs</p><p>${esc(pr.differ)}</p></div>
        <div class="card stack-sm"><p class="eyebrow">Top career matches</p>${pr.topCareers.map((c) => `<div class="spread"><span>${esc(c.name)}</span><b class="num">${c.fit}%</b></div>`).join('')}</div>
      </div>
    </section>
    ${studyReportCard(report.study, { parent: true })}
    <section class="card stack"><div class="row"><p class="eyebrow">For families</p><span class="tag soon">Coming soon</span></div><h3>Mentors, alumni and career counsellors</h3>
      <p class="small muted">${SOON_NOTE}</p></section>
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
      <div class="card stat"><span class="muted small">Completed the assessment</span><b class="num">${d.completion.percent}%</b><span class="small muted">${d.completion.done} of ${d.totalStudents}</span></div>
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
  $$('[data-sp]').forEach((el) => {
    const set = () => { if (S.sp) setPath(S.sp, el.dataset.sp, el.value); };
    el.addEventListener('input', set);
    el.addEventListener('change', set);
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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || (!S.menuOpen && !S.userMenu)) return;
  S.menuOpen = false; S.userMenu = false; renderTopbar();
});

document.addEventListener('click', async (e) => {
  if (S.menuOpen && e.target.closest('.drawer-nav a')) { S.menuOpen = false; setTimeout(renderTopbar, 0); }
  const goEl = e.target.closest('[data-go]');
  if (goEl) { e.preventDefault(); go(goEl.dataset.go); return; }
  if (S.userMenu && !e.target.closest('.user')) { S.userMenu = false; renderTopbar(); }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  try {
    switch (act) {
      case 'reload': render(); break;
      case 'menu': S.menuOpen = true; S.userMenu = false; renderTopbar(); $('.drawer .icon-btn')?.focus(); break;
      case 'menu-close': S.menuOpen = false; renderTopbar(); $('.menu-btn')?.focus(); break;
      case 'user-menu': S.userMenu = !S.userMenu; renderTopbar(); break;
      case 'logout': signOut(); break;
      case 'admin-tab': ADMIN.tab = el.dataset.tab; render(); break;
      case 'admin-logout': ADMIN.key = ''; try { sessionStorage.removeItem('dishaa-admin'); } catch { /* */ } render(); break;
      case 'admin-reset': {
        const out = await adminApi(`/admin/accounts/${el.dataset.id}/reset`, {});
        toast(out.emailed ? `New password emailed to ${out.email}` : `New password for ${out.email}: ${out.password}`);
        break;
      }
      case 'demo': {
        el.disabled = true;
        signIn(await api('/auth/demo', { body: { as: el.dataset.as } }));
        await refreshMe();
        S.quest = null; S.q = null; S.career = null; S.studyCache = null; S.sp = null; S.studyDay = null;
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
      case 'riasec': S.q.data.riasec[el.dataset.item] = Number(el.dataset.v); render(); break;
      case 'not-sure': S.q.data.notSure = !S.q.data.notSure; if (S.q.data.notSure) S.q.data.considering = []; render(); break;
      case 'priority': {
        const pr = S.q.data.priorities; const v = el.dataset.v;
        S.q.data.priorities = pr.includes(v) ? pr.filter((x) => x !== v) : [...pr, v].slice(-2);
        render();
        break;
      }
      case 'q-back': S.q.step = Math.max(0, S.q.step - 1); render(); break;
      case 'q-next':
        if (S.q.step === 0 && !S.q.data.subjects.length) { toast('Pick the subjects you study now.'); break; }
        if (S.q.step === 1 && !S.q.data.interests.length) { toast('Pick at least one interest.'); break; }
        if (S.q.step === 3 && Object.keys(S.q.data.riasec).length < 9) { toast('Answer at least half of the activities.'); break; }
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

      // Study planner
      case 'sp-exam': {
        const ex = S.sp.exams;
        S.sp.exams = ex.some((x) => x.presetId === el.dataset.id) ? ex.filter((x) => x.presetId !== el.dataset.id) : [...ex, { presetId: el.dataset.id }];
        render();
        break;
      }
      case 'sp-add': S.sp[el.dataset.list].push(el.dataset.list === 'custom' ? { name: '', date: '', subjects: '' } : { name: '', hours: 2 }); render(); break;
      case 'sp-del': S.sp[el.dataset.list].splice(Number(el.dataset.i), 1); render(); break;
      case 'sp-conf': S.sp.subjects[Number(el.dataset.i)].confidence = Number(el.dataset.n); render(); break;
      case 'sp-add-subject': {
        const name = $('#sp-newsub')?.value.trim();
        if (!name) { toast('Type a subject name first.'); break; }
        if (S.sp.subjects.some((x) => x.name.toLowerCase() === name.toLowerCase())) { toast(`${name} is already in your list.`); break; }
        const cls = String(S.student.profile?.cls || '10');
        S.sp.subjects.push({ name, confidence: 3, topics: (S.content.study.syllabus[cls]?.[name] || []).join('\n') });
        render();
        break;
      }
      case 'sp-source': {
        const v = el.dataset.id;
        S.sp.sources = S.sp.sources.includes(v) ? S.sp.sources.filter((x) => x !== v) : [...S.sp.sources, v];
        render();
        break;
      }
      case 'sp-edit': S.spEditing = true; S.sp = null; render(); window.scrollTo(0, 0); break;
      case 'sp-cancel': S.spEditing = false; S.sp = null; render(); window.scrollTo(0, 0); break;
      case 'sp-build': {
        const d = S.sp;
        if (!d.subjects.length) { toast('Add at least one subject.'); break; }
        const custom = d.custom.filter((x) => x.name.trim() || x.date);
        if (custom.some((x) => !x.name.trim() || !x.date)) { toast('Give each school exam a name and a date.'); break; }
        el.disabled = true;
        el.textContent = 'Building your plan…';
        try {
          S.studyCache = await api(`/students/${S.student.id}/study`, { body: {
            exams: [...d.exams, ...custom.map((x) => ({ name: x.name, date: x.date, subjects: x.subjects }))],
            subjects: d.subjects.map((x) => ({ name: x.name, confidence: x.confidence, topics: x.topics })),
            weekdayHours: Number(d.weekdayHours), weekendHours: Number(d.weekendHours), slot: d.slot,
            sources: d.sources, sourcesOther: d.sourcesOther,
            activities: d.activities.filter((a) => a.name.trim()).map((a) => ({ name: a.name, hours: Number(a.hours) || 0 })),
          } });
          S.student.study = true; S.sp = null; S.spEditing = false; S.studyDay = null;
          render();
          window.scrollTo(0, 0);
          toast('Your study plan is ready');
        } catch (err) { toast(err.message); el.disabled = false; el.textContent = 'Build my study plan'; }
        break;
      }
      case 'sp-day': S.studyDay = el.dataset.d; render(); break;
      case 'cal-view': S.cal.view = el.dataset.v; render(); break;
      case 'cal-nav': {
        S.cal.cursor = calShift(S.cal, Number(el.dataset.n));
        const [f, t] = calRange(S.cal); const tday = todayLocal();
        S.cal.sel = tday >= f && tday <= t && (S.cal.view === 'week' || tday.slice(0, 7) === S.cal.cursor.slice(0, 7)) ? tday : S.cal.view === 'week' ? f : S.cal.cursor;
        render();
        break;
      }
      case 'cal-today': S.cal.cursor = todayLocal(); S.cal.sel = todayLocal(); render(); break;
      case 'cal-sel': S.cal.sel = el.dataset.d; render(); break;
      case 'cal-done': {
        const out = await api(`/students/${S.student.id}/study/done`, { body: { id: el.dataset.id, done: el.checked } });
        S.cal.done = out.done;
        if (S.studyCache) { S.studyCache.done = out.done; S.studyCache.progress = out.progress; }
        render();
        break;
      }
      case 'mem-toggle': e.preventDefault(); S.memOpen = !S.memOpen; redrawCoach(); break;
      case 'mem-forget': coachCache.memory = await api(`/students/${S.student.id}/memory/${encodeURIComponent(el.dataset.id)}`, { method: 'DELETE' }); toast('Forgotten'); redrawCoach(); break;
      case 'mem-ask-clear': S.memConfirm = true; redrawCoach(); break;
      case 'mem-cancel': S.memConfirm = false; redrawCoach(); break;
      case 'mem-clear': coachCache.memory = await api(`/students/${S.student.id}/memory`, { method: 'DELETE' }); S.memConfirm = false; toast('Your coach has forgotten everything'); redrawCoach(); break;
      case 'waitlist': {
        const out = await api(`/students/${S.student.id}/waitlist`, { body: { feature: el.dataset.feature } });
        S.student.waitlist = out.waitlist;
        toast("You're on the list. We'll let you know when it opens.");
        render();
        break;
      }
      case 'sp-done': {
        const sid = el.dataset.id;
        const done = el.checked;
        const out = await api(`/students/${S.student.id}/study/done`, { body: { id: sid, done } });
        S.studyCache.done = out.done;
        S.studyCache.progress = out.progress;
        render();
        break;
      }
      case 'sp-ics': {
        const res = await fetch(`/api/students/${S.student.id}/study/calendar.ics`, { headers: { Authorization: `Bearer ${S.token}` } });
        if (!res.ok) throw new Error("The calendar file couldn't be created. Please try again.");
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url; a.download = 'dishaa-study-plan.ics';
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        toast('Calendar file downloaded. Open it to add your plan to Google Calendar or your phone.');
        break;
      }
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
    // /demo: log straight into the shared demo account
    if (location.pathname.replace(/\/$/, '') === '/demo') {
      signIn(await api('/auth/demo-login', { method: 'POST' }));
      history.replaceState(null, '', '/product#report');
    }
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
