/**
 * WealthWise admin portal: a separate Worker on its own address (wealthwise-admin.cam-donley.workers.dev)
 * that shares the app's D1 database.
 *
 * - Administrators live in their own table with their own sessions, so an app account can never reach the portal.
 * - Pages are rendered on the server: no build step, no client framework.
 * - "View as user" issues a one-time token that lasts 15 minutes and opens the app read-only.
 * - "Send password reset" is a placeholder for now: it records the request but sends nothing.
 *
 * Deploy: `npm run deploy:admin` (wrangler, admin/wrangler.jsonc), or upload through the Cloudflare API.
 * The first admin is added straight into D1 (see WealthWise-handoff.md); no password is kept in this repo.
 */
import { ADMIN_TABLES, VIEW_MINUTES, hashPassword, randomHex, safeEqual, sha256 } from '../worker/shared';

export interface Env { DB: D1Database; APP_URL: string }

const COOKIE = 'wwa_session';
let APP_ORIGIN = 'https://wealthwise.cam-donley.workers.dev'; // set from env.APP_URL on each request; "View as user" redirects there
const SESSION_HOURS = 12;
type Admin = { id: string; email: string; name: string };

/* ---------- helpers ---------- */
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number | null | undefined) => (n == null ? '–' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n));
const day = (iso: string | number | null | undefined) => (iso == null || iso === '' ? '–' : new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' }));
const when = (iso: string | number | null | undefined) => (iso == null || iso === '' ? '–' : new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Brisbane' }));

function readCookie(req: Request) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m?.[1] ?? null;
}
const cookie = (token: string, maxAge: number) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

function page(html: string, status = 200, headers: Record<string, string> = {}, nonce = '') {
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'x-frame-options': 'DENY',
      'referrer-policy': 'same-origin',
      'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; form-action 'self' ${APP_ORIGIN}; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}; base-uri 'none'; frame-ancestors 'none'`,
      ...headers,
    },
  });
}
const redirect = (to: string, headers: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, 'cache-control': 'no-store', ...headers } });

let schemaReady = false;
async function ensureSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch(ADMIN_TABLES.map((q) => db.prepare(q)));
  await db.prepare('CREATE TABLE IF NOT EXISTS login_failures (email TEXT NOT NULL, at INTEGER NOT NULL)').run();
  schemaReady = true;
}

async function currentAdmin(req: Request, env: Env) {
  const token = readCookie(req);
  if (!token) return null;
  return env.DB.prepare('SELECT a.id, a.email, a.name FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(await sha256(token), Date.now()).first<Admin>();
}
const log = (env: Env, admin: Admin, userId: string | null, action: string, detail = '') =>
  env.DB.prepare('INSERT INTO admin_events (at, admin_id, user_id, action, detail) VALUES (?, ?, ?, ?, ?)').bind(new Date().toISOString(), admin.id, userId, action, detail).run();

/* ---------- layout ---------- */
const LOGO = `<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#cda660"/><path d="M7 21l4.5-9 4.5 7 4.5-11L25 21" fill="none" stroke="#0c1814" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CSS = `
:root{--ground:#e9ede6;--surface:#fbf8f1;--raised:#f3efe5;--line:#ded8c8;--ink:#14211c;--muted:#5c6c64;--brass:#9c722a;--gum:#2f6e58;--sky:#3d6891;--clay:#b24832;--dark:#0c1814}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--ground);color:var(--ink);font:15px/1.5 Figtree,system-ui,sans-serif;font-feature-settings:'tnum' 1,'lnum' 1;-webkit-font-smoothing:antialiased}
h1,h2,h3,.display{font-family:'Bricolage Grotesque',system-ui,sans-serif;letter-spacing:-.015em;margin:0}
a{color:inherit}
.top{background:var(--dark);color:#e7ece3;border-bottom:1px solid #283f37}
.top .in{max-width:1180px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none}.brand b{font-family:'Bricolage Grotesque';font-size:18px}.tag{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#cda660;border:1px solid #cda66066;border-radius:6px;padding:2px 7px}
.top nav{display:flex;gap:4px;margin-left:12px}.top nav a{text-decoration:none;padding:6px 10px;border-radius:8px;color:#92a49a;font-size:14px}.top nav a.on,.top nav a:hover{background:#1a2e28;color:#e7ece3}
.who{margin-left:auto;display:flex;align-items:center;gap:12px;font-size:13px;color:#92a49a}
.who button{background:none;border:1px solid #283f37;color:#e7ece3;border-radius:8px;padding:5px 10px;font:inherit;cursor:pointer}.who button:hover{background:#1a2e28}
main{max-width:1180px;margin:0 auto;padding:32px 24px 64px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 1px 2px #0000000a}
.pad{padding:22px 24px}
.muted{color:var(--muted)}.small{font-size:13px}.tiny{font-size:12px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}
.stat{padding:16px 18px}.stat p{margin:0}.stat .v{font-family:'Bricolage Grotesque';font-size:28px;font-weight:600;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-weight:500;color:var(--muted);font-size:12px;padding:12px 16px;border-bottom:1px solid var(--line)}
td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
tbody tr{cursor:pointer}tbody tr:hover{background:var(--raised)}td a{text-decoration:none;font-weight:600}
.pill{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px}.ok{background:#2f6e581a;color:var(--gum)}.part{background:#9c722a1f;color:var(--brass)}.none{background:#5c6c641a;color:var(--muted)}
.btn{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:9px 14px;font:600 14px Figtree,sans-serif;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--ink);text-decoration:none}
.btn:hover{border-color:var(--brass)}.btn.primary{background:var(--brass);border-color:var(--brass);color:#fff}.btn.primary:hover{filter:brightness(1.05)}.btn[disabled]{opacity:.5;cursor:not-allowed}
.search{width:280px;max-width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);font:inherit}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.grid2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;margin-top:20px;align-items:start}
dl{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 16px;margin:14px 0 0}dt{color:var(--muted);font-size:13px}dd{margin:0;overflow-wrap:anywhere}.show-sm{display:none}
.notice{border-radius:14px;padding:12px 16px;margin-top:16px;font-size:14px}.notice.good{background:#2f6e581a;border:1px solid #2f6e5840}.notice.bad{background:#b248321a;border:1px solid #b2483240}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
ul.list{list-style:none;padding:0;margin:12px 0 0}ul.list li{padding:8px 0;border-top:1px solid var(--line);font-size:14px}ul.list li:first-child{border-top:0}
.back{display:inline-block;margin-bottom:14px;font-size:14px;color:var(--muted);text-decoration:none}.back:hover{color:var(--ink)}
.login{min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--dark)}
.login .panel{width:100%;max-width:400px;padding:28px}.login label{display:block;font-size:13px;font-weight:600;margin:16px 0 6px}
.login input{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:var(--raised);font:inherit}
.login .btn{width:100%;justify-content:center;margin-top:20px}
@media (max-width:800px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.grid2{grid-template-columns:minmax(0,1fr)}.hide-sm{display:none}.show-sm{display:block}dl{grid-template-columns:110px minmax(0,1fr)}.top nav{margin-left:0}main{padding:24px 16px 48px}.pad{padding:18px}}
`;
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600&family=Figtree:wght@400;500;600;700&display=swap">`;

function layout(title: string, admin: Admin, body: string, nonce = '') {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · WealthWise Admin</title>${FONTS}<style>${CSS}</style></head><body>
<header class="top"><div class="in"><a class="brand" href="/">${LOGO}<b>WealthWise</b><span class="tag">Admin</span></a>
<nav><a class="on" href="/">Users</a></nav>
<div class="who"><span>${esc(admin.name)}</span><form method="post" action="/logout"><button>Sign out</button></form></div></div></header>
<main>${body}</main>${nonce ? `<script nonce="${nonce}">${SEARCH_JS}</script>` : ''}</body></html>`;
}
// Filters the users table as you type, and makes each row open that user
const SEARCH_JS = `const q=document.getElementById('q');const rows=[...document.querySelectorAll('tbody tr')];
q&&q.addEventListener('input',()=>{const t=q.value.toLowerCase();rows.forEach(r=>{r.hidden=!r.textContent.toLowerCase().includes(t)})});
rows.forEach(r=>r.addEventListener('click',e=>{if(!e.target.closest('a'))location.href=r.dataset.href}));`;

function loginPage(error = '', email = '') {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · WealthWise Admin</title>${FONTS}<style>${CSS}</style></head><body>
<div class="login"><form class="panel" method="post" action="/login">
<div style="display:flex;align-items:center;gap:10px">${LOGO}<b class="display" style="font-size:18px">WealthWise</b><span class="tag" style="color:var(--brass);border-color:#9c722a55">Admin</span></div>
<h1 style="font-size:26px;margin-top:22px">Sign in</h1><p class="muted small" style="margin:4px 0 0">For WealthWise administrators only.</p>
${error ? `<div class="notice bad">${esc(error)}</div>` : ''}
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required value="${esc(email)}">
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button class="btn primary">Sign in</button></form></div></body></html>`;
}

/* ---------- pages ---------- */
type UserRow = { id: string; email: string; name: string; created_at: string; updated_at: string | null; onboarded: number | null; step: number | null; props: number | null; lastName: string | null; partner: number | null; partnerName: string | null; state: string | null; age: number | null; lastSeen: number | null; hasProfile: number };

async function usersPage(env: Env, admin: Admin) {
  // Summary fields are read straight out of each profile's JSON, so photos and big profiles aren't loaded
  const { results } = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.created_at, p.updated_at, p.user_id IS NOT NULL AS hasProfile,
      json_extract(p.data, '$.onboarded') AS onboarded, json_extract(p.data, '$.onboardingStep') AS step,
      json_array_length(p.data, '$.properties') AS props, json_extract(p.data, '$.household.you.lastName') AS lastName,
      json_extract(p.data, '$.household.hasPartner') AS partner, json_extract(p.data, '$.household.partner.name') AS partnerName,
      json_extract(p.data, '$.household.state') AS state, json_extract(p.data, '$.household.you.age') AS age,
      (SELECT MAX(expires_at) FROM sessions s WHERE s.user_id = u.id) AS lastSeen
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id ORDER BY u.created_at DESC`).all<UserRow>();
  const users = results ?? [];
  const monthAgo = Date.now() - 30 * 864e5;
  const signedIn = (u: UserRow) => (u.lastSeen ? u.lastSeen - 30 * 864e5 : null); // sessions last 30 days, so this is when they last signed in
  const stats = [
    ['Users', users.length],
    ['Joined in the last 30 days', users.filter((u) => Date.parse(u.created_at) > monthAgo).length],
    ['Finished setup', users.filter((u) => u.onboarded).length],
    ['Signed in this week', users.filter((u) => (signedIn(u) ?? 0) > Date.now() - 7 * 864e5).length],
  ];
  const status = (u: UserRow) => (u.onboarded ? '<span class="pill ok">Plan set up</span>' : u.hasProfile ? `<span class="pill part">Setup step ${(u.step ?? 0) + 1}</span>` : '<span class="pill none">Not started</span>');
  const rows = users.map((u) => `<tr data-href="/users/${esc(u.id)}">
    <td><a href="/users/${esc(u.id)}">${esc([u.name, u.lastName].filter(Boolean).join(' '))}</a>${u.partner ? `<div class="tiny muted">with ${esc(u.partnerName || 'partner')}</div>` : ''}<div class="tiny muted show-sm">${esc(u.email)}</div></td>
    <td class="hide-sm">${esc(u.email)}</td>
    <td class="hide-sm">${u.age ?? '–'}${u.state ? ` · ${esc(u.state)}` : ''}</td>
    <td class="hide-sm">${u.props ?? 0}</td>
    <td>${status(u)}</td>
    <td class="hide-sm">${day(u.created_at)}</td>
    <td class="hide-sm">${signedIn(u) ? day(signedIn(u)) : '–'}</td></tr>`).join('');
  const nonce = randomHex(12);
  return page(layout('Users', admin, `
<div class="head"><div><h1 style="font-size:32px">Users</h1><p class="muted" style="margin:4px 0 0">Everyone who has signed up to WealthWise.</p></div>
<input id="q" class="search" type="search" placeholder="Search by name or email" aria-label="Search users"></div>
<div class="stats">${stats.map(([k, v]) => `<div class="panel stat"><p class="small muted">${k}</p><p class="v">${v}</p></div>`).join('')}</div>
<div class="panel" style="overflow-x:auto"><table><thead><tr><th>Name</th><th class="hide-sm">Email</th><th class="hide-sm">Age · state</th><th class="hide-sm">Properties</th><th>Status</th><th class="hide-sm">Joined</th><th class="hide-sm">Last sign-in</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7" class="muted">No one has signed up yet.</td></tr>'}</tbody></table></div>`, nonce), 200, {}, nonce);
}

async function userPage(env: Env, admin: Admin, id: string, notice: string) {
  const u = await env.DB.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').bind(id).first<{ id: string; email: string; name: string; created_at: string }>();
  if (!u) return page(layout('Not found', admin, '<a class="back" href="/">← All users</a><h1>That user wasn’t found</h1>'), 404);
  const prof = await env.DB.prepare('SELECT data, updated_at FROM profiles WHERE user_id = ?').bind(id).first<{ data: string; updated_at: string }>();
  const p = prof ? JSON.parse(prof.data) : null;
  // Devices: sessions still active. Last sign-in: the newest session of any age (sessions last 30 days, so it began 30 days before it expires).
  const s = await env.DB.prepare('SELECT SUM(CASE WHEN expires_at > ? THEN 1 ELSE 0 END) AS n, MAX(expires_at) AS last FROM sessions WHERE user_id = ?').bind(Date.now(), id).first<{ n: number | null; last: number | null }>();
  const { results: events } = await env.DB.prepare('SELECT e.at, e.action, e.detail, a.name FROM admin_events e LEFT JOIN admins a ON a.id = e.admin_id WHERE e.user_id = ? ORDER BY e.at DESC LIMIT 10').bind(id).all<{ at: string; action: string; detail: string; name: string }>();
  const hh = p?.household;
  const full = [u.name, hh?.you?.lastName].filter(Boolean).join(' ');
  const canView = !!p?.onboarded;
  const props: any[] = p?.properties ?? [];
  const value = (pr: any) => { const v = (pr.valuations ?? []).map((x: any) => x.value); return v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : pr.purchasePrice; };
  const notices: Record<string, string> = {
    reset: `Demo only: in the live version, a password reset link would be emailed to ${esc(u.email)}. Nothing was sent and their password hasn’t changed.`,
  };
  const g = p?.goals;
  return page(layout(full, admin, `
<a class="back" href="/">← All users</a>
<div class="head"><div><h1 style="font-size:32px">${esc(full)}</h1><p class="muted" style="margin:4px 0 0">${esc(u.email)}</p></div>
<div class="actions" style="margin:0">
  <form method="post" action="/users/${esc(u.id)}/view" target="_blank" rel="noopener"><button class="btn primary" ${canView ? '' : 'disabled title="They haven’t finished setting up their plan yet"'}>View as user</button></form>
  <form method="post" action="/users/${esc(u.id)}/reset"><button class="btn">Send password reset</button></form>
</div></div>
${notices[notice] ? `<div class="notice good">${notices[notice]}</div>` : ''}
<div class="grid2">
  <section class="panel pad"><h2 style="font-size:20px">Account</h2><dl>
    <dt>Name</dt><dd>${esc(full)}</dd><dt>Email</dt><dd>${esc(u.email)}</dd>
    <dt>Joined</dt><dd>${when(u.created_at)}</dd>
    <dt>Last sign-in</dt><dd>${s?.last ? when(s.last - 30 * 864e5) : '–'}</dd>
    <dt>Signed in on</dt><dd>${s?.n ?? 0} ${s?.n === 1 ? 'device' : 'devices'} now</dd>
    <dt>Plan last saved</dt><dd>${prof ? when(prof.updated_at) : '–'}</dd>
    <dt>Setup</dt><dd>${p?.onboarded ? '<span class="pill ok">Plan set up</span>' : p ? `<span class="pill part">Step ${(p.onboardingStep ?? 0) + 1} of 8</span>` : '<span class="pill none">Not started</span>'}</dd>
    <dt>User ID</dt><dd class="small muted">${esc(u.id)}</dd>
  </dl></section>
  <section class="panel pad"><h2 style="font-size:20px">Household</h2>${hh ? `<dl>
    <dt>Age</dt><dd>${hh.you?.age ?? '–'}</dd><dt>State</dt><dd>${esc(hh.state)}</dd>
    <dt>Partner</dt><dd>${hh.hasPartner ? `${esc([hh.partner?.name, hh.partner?.lastName].filter(Boolean).join(' ') || 'Yes')}${hh.partner?.age ? `, ${hh.partner.age}` : ''}` : 'No'}</dd>
    <dt>Dependants</dt><dd>${(hh.dependantsDetail ?? hh.dependants ?? []).length || 'None'}</dd>
    <dt>Salary</dt><dd>${money(hh.you?.salary)}${hh.hasPartner ? ` · ${money(hh.partner?.salary)}` : ''}</dd>
  </dl>` : '<p class="muted small" style="margin-top:12px">They haven’t started setting up their plan.</p>'}</section>
</div>
${p ? `<div class="grid2">
  <section class="panel pad"><h2 style="font-size:20px">Properties</h2>${props.length ? `<ul class="list">${props.map((pr) => `<li><b>${esc(pr.address)}</b>, ${esc(pr.suburb)} ${esc(pr.state)} <span class="muted">· ${pr.use === 'home' ? 'Home' : 'Investment'} · about ${money(value(pr))}</span></li>`).join('')}</ul>` : '<p class="muted small" style="margin-top:12px">No properties yet.</p>'}
  ${(p.plannedPurchases ?? []).slice(0, Math.max(0, (g?.targetProperties ?? 0) - props.length)).length ? `<p class="small muted" style="margin:14px 0 0">Planning to buy: ${(p.plannedPurchases ?? []).slice(0, Math.max(0, (g?.targetProperties ?? 0) - props.length)).map((pp: any) => `${esc(pp.label)} (${money(pp.price)})`).join(', ')}</p>` : ''}</section>
  <section class="panel pad"><h2 style="font-size:20px">Goals</h2><dl>
    <dt>Stop work at</dt><dd>${g?.retirementAge ?? '–'}</dd><dt>Income wanted</dt><dd>${money(g?.passiveIncome)} a year</dd>
    <dt>Properties wanted</dt><dd>${g?.targetProperties ?? '–'}</dd><dt>Share goal</dt><dd>${g?.sharesTarget ? money(g.sharesTarget) : 'None set'}</dd>
    <dt>Share holdings</dt><dd>${(p.holdings ?? []).length}</dd><dt>Plan locked</dt><dd>${p.planLocked ? 'Yes' : 'No'}</dd>
  </dl></section>
</div>` : ''}
<section class="panel pad" style="margin-top:16px"><h2 style="font-size:20px">Admin activity</h2>
${(events ?? []).length ? `<ul class="list">${events!.map((e) => `<li>${when(e.at)} · ${esc(e.name || 'Admin')} ${esc(e.action)}${e.detail ? ` <span class="muted">(${esc(e.detail)})</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted small" style="margin-top:12px">No admin activity on this account yet.</p>'}
</section>`));
}

/* ---------- routes ---------- */
async function handle(req: Request, env: Env) {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === '/favicon.ico' || path === '/robots.txt') return path === '/robots.txt' ? new Response('User-agent: *\nDisallow: /\n') : new Response(null, { status: 204 });
  await ensureSchema(env.DB);

  // Forms only ever post from this site (the session cookie is SameSite=Strict too)
  if (req.method === 'POST') {
    const origin = req.headers.get('origin');
    let host = '';
    try { host = origin ? new URL(origin).host : req.headers.get('host') || ''; } catch { /* malformed or "null" */ }
    if (host !== req.headers.get('host')) return new Response('Forbidden', { status: 403 });
  }

  if (path === '/login') {
    if (req.method === 'GET') return (await currentAdmin(req, env)) ? redirect('/') : page(loginPage());
    if (req.method === 'POST') {
      const f = await req.formData();
      const email = String(f.get('email') || '').trim().toLowerCase().slice(0, 200);
      const password = String(f.get('password') || '').slice(0, 200);
      const key = `admin:${email}`;
      const since = Date.now() - 15 * 60000;
      const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND at > ?').bind(key, since).first<{ n: number }>();
      if ((recent?.n ?? 0) >= 5) return page(loginPage('Too many attempts. Wait 15 minutes and try again.', email), 429);
      const row = await env.DB.prepare('SELECT id, email, name, pw_hash, pw_salt FROM admins WHERE email = ?').bind(email).first<any>();
      const ok = row && safeEqual(await hashPassword(password, row.pw_salt), row.pw_hash);
      if (!ok) {
        await env.DB.prepare('INSERT INTO login_failures (email, at) VALUES (?, ?)').bind(key, Date.now()).run();
        return page(loginPage('That email and password don’t match an admin account.', email), 401);
      }
      await env.DB.prepare('DELETE FROM login_failures WHERE email = ?').bind(key).run();
      await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(Date.now()).run();
      const token = randomHex(32);
      await env.DB.prepare('INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), row.id, Date.now() + SESSION_HOURS * 3600e3).run();
      return redirect('/', { 'set-cookie': cookie(token, SESSION_HOURS * 3600) });
    }
  }

  if (path === '/logout' && req.method === 'POST') {
    const token = readCookie(req);
    if (token) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return redirect('/login', { 'set-cookie': cookie('', 0) });
  }

  const admin = await currentAdmin(req, env);
  if (!admin) return redirect('/login');

  if (path === '/' && req.method === 'GET') return usersPage(env, admin);

  const m = /^\/users\/([0-9a-f-]{36})(?:\/(view|reset))?$/.exec(path);
  if (m) {
    const [, id, act] = m;
    if (!act && req.method === 'GET') return userPage(env, admin, id, url.searchParams.get('done') || '');
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const user = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(id).first<{ id: string; email: string }>();
    if (!user) return redirect('/');
    if (act === 'view') {
      // One-time read-only access to the app, for this admin, for 15 minutes
      await env.DB.prepare('DELETE FROM view_tokens WHERE expires_at < ?').bind(Date.now()).run();
      const token = randomHex(32);
      await env.DB.prepare('INSERT INTO view_tokens (token_hash, user_id, admin_id, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), id, admin.id, Date.now() + VIEW_MINUTES * 60000).run();
      await log(env, admin, id, 'viewed the account', 'read only');
      return redirect(`${env.APP_URL}/#view=${token}`);
    }
    if (act === 'reset') {
      // Placeholder: records the request only. Wire this up to an email service when resets go live.
      await log(env, admin, id, 'requested a password reset', 'demo: no email sent');
      return redirect(`/users/${id}?done=reset`);
    }
  }
  return page(layout('Not found', admin, '<h1>Page not found</h1><p><a href="/">Back to users</a></p>'), 404);
}

export default {
  async fetch(req: Request, env: Env) {
    if (env.APP_URL) APP_ORIGIN = new URL(env.APP_URL).origin;
    try { return await handle(req, env); }
    catch (e) { console.error(e); return new Response('Something went wrong. Try again.', { status: 500 }); }
  },
};
