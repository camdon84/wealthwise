/**
 * WealthWise API on Cloudflare Workers.
 * - Static app served from ./dist (Workers static assets); this worker handles /api/*.
 * - D1 stores users, sessions and one JSON profile per user.
 * - Passwords: PBKDF2-SHA256 with a per-user salt. Sessions: random token in an HttpOnly cookie,
 *   only its SHA-256 hash is stored.
 * - Quotes: 15–20 minute delayed prices, cached in D1 so free limits hold.
 */
export interface Env { DB: D1Database; ASSETS: Fetcher }

const COOKIE = 'ww_session';
const SESSION_DAYS = 30;
const enc = new TextEncoder();

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const fail = (error: string, status = 400) => json({ error }, status);

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return hex(bits);
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

let schemaReady = false;
async function ensureSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, created_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS profiles (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS quotes (key TEXT PRIMARY KEY, price REAL NOT NULL, change REAL NOT NULL, as_of TEXT NOT NULL, fetched_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS login_failures (email TEXT NOT NULL, at INTEGER NOT NULL)'),
  ]);
  schemaReady = true;
}

function readCookie(req: Request) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m?.[1] ?? null;
}
const sessionCookie = (token: string, maxAge: number) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

async function startSession(env: Env, user: { id: string; email: string; name: string }) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), user.id, Date.now() + SESSION_DAYS * 864e5).run();
  return json({ userId: user.id, email: user.email, name: user.name }, 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400) });
}

async function currentUser(req: Request, env: Env) {
  const token = readCookie(req);
  if (!token) return null;
  return env.DB.prepare('SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(await sha256(token), Date.now()).first<{ id: string; email: string; name: string }>();
}

async function body<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}

/* ---------- quotes ---------- */
function yahooSymbol(key: string) {
  const [ex, code] = key.split(':');
  if (ex === 'ASX') return `${code}.AX`;
  if (ex === 'CRYPTO') return `${code}-AUD`;
  return code; // NASDAQ / NYSE, priced in USD and converted below
}
const marketOpenNow = () => {
  const h = new Date().getUTCHours(); // ASX 10:00–16:10 AEST is 00:00–06:10 UTC; US session overlaps 14:30–21:00 UTC
  return h < 7 || (h >= 14 && h < 22);
};

async function fetchYahoo(symbol: string) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; WealthWise/1.0)' },
    cf: { cacheTtl: 300, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`quote ${symbol} ${res.status}`);
  const data: any = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error(`no price for ${symbol}`);
  const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
  return { price: meta.regularMarketPrice as number, change: ((meta.regularMarketPrice - prev) / prev) * 100, asOf: new Date((meta.regularMarketTime || Date.now() / 1000) * 1000).toISOString() };
}

async function quotes(req: Request, env: Env) {
  const keys = [...new Set((new URL(req.url).searchParams.get('codes') || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^(ASX|NASDAQ|NYSE|CRYPTO):[A-Z0-9.\-]{1,12}$/.test(s)))].slice(0, 40);
  const maxAge = (marketOpenNow() ? 15 : 360) * 60000;
  const out: Record<string, { price: number; change: number; asOf: string }> = {};
  const stale: string[] = [];
  for (const k of keys) {
    const row = await env.DB.prepare('SELECT price, change, as_of, fetched_at FROM quotes WHERE key = ?').bind(k).first<any>();
    if (row) out[k] = { price: row.price, change: row.change, asOf: row.as_of };
    if (!row || Date.now() - row.fetched_at > maxAge) stale.push(k);
  }
  if (stale.length) {
    let audusd = 0;
    if (stale.some((k) => k.startsWith('NASDAQ') || k.startsWith('NYSE'))) audusd = (await fetchYahoo('AUDUSD=X').catch(() => ({ price: 0 }))).price;
    await Promise.all(stale.map(async (k) => {
      try {
        const q = await fetchYahoo(yahooSymbol(k));
        if ((k.startsWith('NASDAQ') || k.startsWith('NYSE')) && audusd) q.price = q.price / audusd; // show US holdings in AUD
        out[k] = q;
        await env.DB.prepare('INSERT INTO quotes (key, price, change, as_of, fetched_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET price = excluded.price, change = excluded.change, as_of = excluded.as_of, fetched_at = excluded.fetched_at')
          .bind(k, q.price, q.change, q.asOf, Date.now()).run();
      } catch { /* keep the cached value if there is one */ }
    }));
  }
  return json(out);
}

/* ---------- router ---------- */
async function api(req: Request, env: Env, path: string) {
  await ensureSchema(env.DB);
  const method = req.method;

  if (path === '/api/session' && method === 'GET') {
    const u = await currentUser(req, env);
    return json(u ? { userId: u.id, email: u.email, name: u.name } : null);
  }

  if (path === '/api/signup' && method === 'POST') {
    const b = await body<{ name?: string; email?: string; password?: string }>(req);
    const name = (b?.name || '').trim().slice(0, 60);
    const email = (b?.email || '').trim().toLowerCase();
    const password = b?.password || '';
    if (!name) return fail('Enter your first name.');
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return fail('Enter a valid email address.');
    if (password.length < 8 || password.length > 200) return fail('Use a password of at least 8 characters.');
    if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return fail('An account with that email already exists. Sign in instead.', 409);
    const salt = randomHex(16);
    const user = { id: crypto.randomUUID(), email, name };
    await env.DB.prepare('INSERT INTO users (id, email, name, pw_hash, pw_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(user.id, email, name, await hashPassword(password, salt), salt, new Date().toISOString()).run();
    return startSession(env, user);
  }

  if (path === '/api/signin' && method === 'POST') {
    const b = await body<{ email?: string; password?: string }>(req);
    const email = (b?.email || '').trim().toLowerCase();
    const since = Date.now() - 15 * 60000;
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_failures WHERE email = ? AND at > ?').bind(email, since).first<{ n: number }>();
    if ((recent?.n ?? 0) >= 8) return fail('Too many attempts. Wait 15 minutes and try again.', 429);
    const row = await env.DB.prepare('SELECT id, email, name, pw_hash, pw_salt FROM users WHERE email = ?').bind(email).first<any>();
    const ok = row && safeEqual(await hashPassword(b?.password || '', row.pw_salt), row.pw_hash);
    if (!ok) {
      await env.DB.prepare('INSERT INTO login_failures (email, at) VALUES (?, ?)').bind(email, Date.now()).run();
      return fail('That email and password don’t match an account.', 401);
    }
    await env.DB.prepare('DELETE FROM login_failures WHERE email = ? OR at < ?').bind(email, since).run();
    return startSession(env, row);
  }

  if (path === '/api/signout' && method === 'POST') {
    const token = readCookie(req);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  if (path === '/api/profile') {
    const u = await currentUser(req, env);
    if (!u) return fail('Sign in again to continue.', 401);
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT data FROM profiles WHERE user_id = ?').bind(u.id).first<{ data: string }>();
      return json(row ? JSON.parse(row.data) : null);
    }
    if (method === 'PUT') {
      const text = await req.text();
      if (text.length > 500_000) return fail('That profile is too large to save.', 413);
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { return fail('That profile could not be read.'); }
      if (!parsed || parsed.version !== 1) return fail('That profile could not be read.');
      await env.DB.prepare('INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
        .bind(u.id, text, new Date().toISOString()).run();
      return json({ ok: true });
    }
  }

  if (path === '/api/quotes' && method === 'GET') return quotes(req, env);

  return fail('Not found', 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url.pathname); }
      catch (e) { console.error(e); return fail('Something went wrong on our side. Try again.', 500); }
    }
    return env.ASSETS.fetch(req);
  },
};
