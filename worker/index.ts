/**
 * WealthWise API on Cloudflare Workers.
 * - Static app served from ./dist (Workers static assets); this worker handles /api/*.
 * - D1 stores users, sessions and one JSON profile per user.
 * - Passwords: PBKDF2-SHA256 with a per-user salt. Sessions: random token in an HttpOnly cookie,
 *   only its SHA-256 hash is stored.
 * - Quotes: 15–20 minute delayed prices, cached in D1 so free limits hold.
 */
export interface Env { DB: D1Database; ASSETS: Fetcher; AI: Ai }

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
    db.prepare('CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS image_runs (who TEXT NOT NULL, at INTEGER NOT NULL)'),
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

/* ---------- address lookup for aerial photos (OpenStreetMap Nominatim, cached so we stay well inside its 1 request/second policy) ---------- */
async function geocode(req: Request, env: Env) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 200);
  if (q.length < 6) return fail('Enter an address.', 400);
  const key = `geo:${q.toLowerCase()}`;
  const hit = await env.DB.prepare('SELECT data FROM ai_cache WHERE key = ?').bind(key).first<{ data: string }>();
  if (hit) return json(JSON.parse(hit.data));
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'WealthWise/1.0 (portfolio demo; https://wealthwise.cam-donley.workers.dev)', 'Accept-Language': 'en-AU' },
  });
  if (!r.ok) return fail('Map lookup is unavailable right now.', 503);
  const list = (await r.json()) as { lat: string; lon: string; addresstype?: string; type?: string }[];
  const first = list[0];
  const out = first ? { lat: Number(first.lat), lon: Number(first.lon), street: first.addresstype === 'road' } : null;
  await env.DB.prepare('INSERT OR REPLACE INTO ai_cache (key, data, created_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(out), Date.now()).run();
  return json(out, 200, { 'cache-control': 'public, max-age=86400' });
}

/* ---------- AI renovation preview (FLUX.2 klein on Workers AI, editing the user's photo) ---------- */
const STYLE_WORDS: Record<string, string> = {
  modern: 'modern, clean lines, flat-panel cabinetry, stone benchtops, matte black tapware',
  coastal: 'coastal Hamptons, white shaker cabinetry, light timber, soft blue accents',
  scandi: 'Scandinavian, pale oak, white walls, simple handle-less joinery, warm minimal',
  industrial: 'industrial, dark cabinetry, concrete-look surfaces, black steel, pendant lights',
  classic: 'classic Queenslander, painted timber, VJ panelling, brass fittings, warm and traditional',
};
async function renovateImage(req: Request, env: Env) {
  const who = (await currentUser(req, env))?.id ?? `ip:${req.headers.get('cf-connecting-ip') ?? 'unknown'}`;
  const dayAgo = Date.now() - 864e5;
  const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM image_runs WHERE who = ? AND at > ?').bind(who, dayAgo).first<{ n: number }>();
  if ((used?.n ?? 0) >= 12) return fail('That’s the limit for AI previews today. Try again tomorrow.', 429);
  const form = await req.formData().catch(() => null);
  const photo = form?.get('photo');
  if (!form || !photo || typeof photo === 'string') return fail('Add a photo of the room first.');
  if (photo.size > 600_000) return fail('That photo is too large. Try a smaller one.', 413);
  const room = String(form.get('room') ?? 'kitchen').slice(0, 30);
  const style = STYLE_WORDS[String(form.get('style') ?? 'modern')] ?? STYLE_WORDS.modern;
  const extra = String(form.get('notes') ?? '').slice(0, 200);
  const prompt = `Renovate the ${room} in image 0 in a ${style} style. Keep exactly the same camera angle, room shape, walls, windows, doors and ceiling height. Replace the old finishes, cabinetry, benchtops, flooring, fixtures and lighting with new ones. ${extra} Photorealistic real-estate listing photo, bright natural light, tidy, no people, no text.`;
  const out = new FormData();
  out.append('input_image_0', photo, 'room.jpg');
  out.append('prompt', prompt);
  out.append('width', String(form.get('width') ?? 1024));
  out.append('height', String(form.get('height') ?? 768));
  const packed = new Response(out);
  try {
    const res: any = await (env.AI as any).run('@cf/black-forest-labs/flux-2-klein-4b', { multipart: { body: packed.body, contentType: packed.headers.get('content-type') } });
    const image = res?.image ?? res?.result?.image;
    if (!image) return fail('The AI didn’t return an image. Try again.', 502);
    await env.DB.prepare('INSERT INTO image_runs (who, at) VALUES (?, ?)').bind(who, Date.now()).run();
    return json({ image: `data:image/jpeg;base64,${image}` });
  } catch (e: any) {
    return fail(`The AI preview didn’t work this time (${String(e?.message ?? e).slice(0, 120)}).`, 502);
  }
}

async function body<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}

/* ---------- quotes ---------- */
function yahooSymbol(key: string) {
  const [ex, code] = key.split(':');
  if (ex === 'ASX') return `${code}.AX`;
  if (ex === 'CRYPTO') return `${code}-AUD`;
  if (ex === 'FX') return `${code}AUD=X`;
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
  const keys = [...new Set((new URL(req.url).searchParams.get('codes') || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^(ASX|NASDAQ|NYSE|CRYPTO|FX):[A-Z0-9.\-]{1,12}$/.test(s)))].slice(0, 40);
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

  if (path === '/api/password' && method === 'POST') {
    const u = await currentUser(req, env);
    if (!u) return fail('Sign in again to continue.', 401);
    const b = await body<{ current?: string; next?: string }>(req);
    if (!b?.next || b.next.length < 8 || b.next.length > 200) return fail('Use a new password of at least 8 characters.');
    const row = await env.DB.prepare('SELECT pw_hash, pw_salt FROM users WHERE id = ?').bind(u.id).first<any>();
    if (!row || !safeEqual(await hashPassword(b.current || '', row.pw_salt), row.pw_hash)) return fail('Your current password isn’t right.', 403);
    const salt = randomHex(16);
    await env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(await hashPassword(b.next, salt), salt, u.id).run();
    const token = readCookie(req);
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(u.id, token ? await sha256(token) : '').run(); // sign out other devices
    return json({ ok: true });
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
  if (path === '/api/history' && method === 'GET') return history(req, env);
  if (path === '/api/briefing' && method === 'GET') return briefingRoute(req, env);
  if (path === '/api/wise' && method === 'POST') return wiseRoute(req, env);
  if (path === '/api/documents/read' && method === 'POST') return readDocument(req, env);
  if (path === '/api/geocode' && method === 'GET') return geocode(req, env);
  if (path === '/api/renovate-image' && method === 'POST') return renovateImage(req, env);
  if (path === '/api/cash-rate' && method === 'GET') {
    const data = await cashRate(env);
    return data ? json(data, 200, { 'cache-control': 'public, max-age=1800' }) : fail('Cash rate unavailable right now.', 503);
  }

  return fail('Not found', 404);
}

export default {
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await ensureSchema(env.DB);
      await nationalBriefing(env, 'equity', true);
      await nationalBriefing(env, 'property', true);
      await cashRate(env, true);
    })());
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url.pathname); }
      catch (e) { console.error(e); return fail('Something went wrong on our side. Try again.', 500); }
    }
    return env.ASSETS.fetch(req);
  },
};

/* ---------- AI briefings (Property Pulse, Equity Spot) and Wise's take ----------
 * Headlines come from Google News search feeds for the last 7–30 days. Cloudflare Workers AI
 * (free daily allowance) summarises them in its own words; every item links to its sources.
 * Results are cached in D1 and refreshed each morning by the cron trigger.
 */
const MODEL = '@cf/openai/gpt-oss-120b';
type Headline = { title: string; source: string; url: string; date: string };

const decode = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function news(query: string): Promise<Headline[]> {
  const ua = { 'user-agent': 'Mozilla/5.0 (compatible; WealthWise/1.0)' };
  let res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-AU&gl=AU&ceid=AU:en`, { headers: ua }).catch(() => null);
  if (!res?.ok) {
    console.log(`google news ${res?.status ?? 'error'} for ${query}, trying bing`);
    res = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(query.replace(/ when:\d+d/, ''))}&format=rss&mkt=en-AU`, { headers: ua }).catch(() => null);
    if (!res?.ok) return [];
  }
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12).map(([, it]) => {
    const raw = decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    const source = decode(it.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? it.match(/<News:Source>([\s\S]*?)<\/News:Source>/)?.[1] ?? '').replace(/ on MSN$/, '');
    const title = source && raw.endsWith(` - ${source}`) ? raw.slice(0, -(source.length + 3)) : raw;
    let url = decode(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
    try { const real = new URL(url).searchParams.get('url'); if (url.includes('bing.com/news/apiclick') && real) url = real; } catch { /* keep the feed link */ }
    return { title, source, url, date: new Date(it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? Date.now()).toISOString() };
  });
}

async function gather(queries: string[], max = 18, filter?: RegExp) {
  const all = (await Promise.all(queries.map((q) => news(q).catch(() => [])))).flat();
  const seen = new Set<string>();
  return all
    .filter((h) => h.title && !seen.has(h.title.toLowerCase()) && seen.add(h.title.toLowerCase()))
    .filter((h) => !filter || filter.test(h.title))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, max);
}

async function askAI(env: Env, system: string, user: string): Promise<any> {
  const r: any = await env.AI.run(MODEL as any, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 4000, reasoning: { effort: 'low' } } as any);
  const text: string = typeof r?.response === 'string' ? r.response : r?.response ? JSON.stringify(r.response) : r?.choices?.[0]?.message?.content ?? '';
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

const BRIEF_RULES = `Use ONLY the numbered headlines. Report only what they say: no added interpretation, causes, motives or predictions they don't state. Plain Australian English, in your own words; never copy a headline word for word. Never recommend buying, selling or holding any investment or property, and never present a stock as a pick.
Reply with JSON only:
{"items":[{"scope":"short label","headline":"max 10 words","body":"1-2 sentences, max 35 words","tone":"up|down|flat","stat":"a short figure copied exactly from a cited headline, or empty","statLabel":"max 5 words, or empty","sources":[1]}]}`;

function shape(raw: any, heads: Headline[], idPrefix: string) {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return items.slice(0, 5).map((it: any, i: number) => {
    const srcs = (Array.isArray(it.sources) ? it.sources : []).map((n: number) => heads[n - 1]).filter(Boolean).slice(0, 3);
    const cited = srcs.map((h: Headline) => h.title).join(' ');
    const stat = typeof it.stat === 'string' && it.stat && cited.includes(it.stat) ? it.stat : ''; // only figures that really appear in the sources
    return {
      id: `${idPrefix}-${i}`, scope: String(it.scope || '').slice(0, 40), headline: String(it.headline || '').slice(0, 120), body: String(it.body || '').slice(0, 400),
      tone: ['up', 'down', 'flat'].includes(it.tone) ? it.tone : 'flat', stat: stat || undefined, statLabel: stat ? String(it.statLabel || '').slice(0, 40) : undefined,
      sources: srcs.map((h: Headline) => ({ title: h.title, source: h.source, url: h.url, date: h.date })),
    };
  }).filter((it: any) => it.headline && it.body && it.sources.length);
}

const numbered = (heads: Headline[]) => heads.map((h, i) => `[${i + 1}] ${h.date.slice(0, 10)} | ${h.title} (${h.source})`).join('\n');

async function cached(env: Env, key: string, maxAgeMs: number, make: () => Promise<any>, force = false) {
  const row = await env.DB.prepare('SELECT data, created_at FROM ai_cache WHERE key = ?').bind(key).first<{ data: string; created_at: number }>();
  if (row && !force && Date.now() - row.created_at < maxAgeMs) return JSON.parse(row.data);
  try {
    const data = await make();
    await env.DB.prepare('INSERT INTO ai_cache (key, data, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, created_at = excluded.created_at')
      .bind(key, JSON.stringify(data), Date.now()).run();
    return data;
  } catch (e) {
    console.error(`ai ${key}: ${(e as Error)?.message ?? e}`);
    return row ? JSON.parse(row.data) : null; // serve the last good copy if the refresh fails
  }
}

const QUERIES = {
  equity: ['ASX 200 when:7d', 'Australian shares week when:7d', 'ASX IPO listing when:21d', 'Wall Street stocks Nasdaq when:7d', 'RBA interest rate decision when:14d'],
  property: ['Australian property market when:7d', 'house prices Australia when:7d', 'auction clearance rate when:7d', 'rents vacancy Australia when:14d', 'home lending investors Australia when:14d'],
};

function nationalBriefing(env: Env, kind: 'equity' | 'property', force = false) {
  return cached(env, `brief:${kind}`, 20 * 3600e3, async () => {
    const heads = await gather(QUERIES[kind]);
    if (heads.length < 3) throw new Error('not enough headlines');
    const focus = kind === 'equity'
      ? 'You write the weekly share-market briefing ("Equity Spot") for an Australian personal-wealth app: index moves, interest rates, IPOs and listings, big company moves, global markets. 3 to 5 items, each a different theme, most recent first. Scope labels like ASX 200, Wall Street, Rates, IPOs, Movers, Commodities.'
      : 'You write the national property briefing ("Property Pulse") for an Australian personal-wealth app: values, auctions, rents, lending, buyer sentiment. 3 to 4 items, each a different theme, most recent first. Scope labels like National, Sydney, Brisbane, Rents, Lending.';
    return { asOf: new Date().toISOString(), items: shape(await askAI(env, `${focus}\n${BRIEF_RULES}`, `Headlines:\n${numbered(heads)}`), heads, kind), count: heads.length };
  }, force);
}

const PROPERTY_WORDS = /(propert|house|home|unit|apartment|real estate|price|market|rent|auction|sold|sale|listing|buyer|develop|land|median|record)/i;
const NOT_PROPERTY = /(police|charged|crash|arrest|court|stabb|assault|fire crews|missing)/i;

function suburbBriefing(env: Env, suburb: string, state: string) {
  return cached(env, `brief:suburb:${suburb.toLowerCase()}:${state}`, 3 * 864e5, async () => {
    const heads = (await gather([`"${suburb}" ${state} property OR "real estate" OR house when:30d`], 10, PROPERTY_WORDS)).filter((h) => !NOT_PROPERTY.test(h.title));
    if (!heads.length) return { asOf: new Date().toISOString(), items: [] };
    const sys = `You write one local property update about ${suburb} ${state} for an Australian personal-wealth app. Write at most ONE item, only from headlines that are clearly about property or the housing market in or right around ${suburb}; if none are, return {"items":[]}. Scope must be "${suburb} ${state}".\n${BRIEF_RULES}`;
    return { asOf: new Date().toISOString(), items: shape(await askAI(env, sys, `Headlines:\n${numbered(heads)}`), heads, `sub-${suburb}`) };
  });
}

async function briefingRoute(req: Request, env: Env) {
  const u = new URL(req.url);
  const kind = u.searchParams.get('kind') === 'property' ? 'property' : 'equity';
  const national = await nationalBriefing(env, kind);
  let items = national?.items ?? [];
  if (kind === 'property') {
    const subs = (u.searchParams.get('suburbs') || '').split(',').map((s) => s.split('|')).filter(([s, st]) => s && /^[A-Za-z' -]{2,40}$/.test(s) && /^(QLD|NSW|VIC|SA|WA|TAS|ACT|NT)$/.test(st)).slice(0, 3);
    const local = (await Promise.all(subs.map(([s, st]) => suburbBriefing(env, s.trim(), st)))).flatMap((b) => b?.items ?? []);
    items = [...items, ...local];
  }
  if (!national) return fail('Briefing unavailable right now.', 503);
  return json({ kind, sample: false, asOf: national.asOf, count: national.count, items }, 200, { 'cache-control': 'public, max-age=600' });
}

async function wiseRoute(req: Request, env: Env) {
  const text = await req.text();
  if (text.length > 8000) return fail('Too much data.', 413);
  let facts: any;
  try { facts = JSON.parse(text); } catch { return fail('Could not read that.'); }
  const mode = new URL(req.url).searchParams.get('mode');
  const firstLook = mode === 'first-look';
  const key = `wise:${mode ?? ''}:${await sha256(text)}`;
  const data = await cached(env, key, 7 * 864e5, async () => {
    const lead = firstLook
      ? `This is the household's first look straight after finishing setup. Lead with their quickest wins, especially debts: compare each debt's interest rate with their savings, offset and home loan rate, and point out where paying down or restructuring high-interest debt would save money (the app's observations include the exact savings). Then one line on how they track against their goal.\n`
      : mode === 'goals'
      ? `The household is reviewing whether their goals fit together: properties wanted by retirement, a share portfolio target and income in retirement. The app's goal analysis gives exact figures, including the yearly share investment needed. Say plainly which goals compete for the same savings or borrowing power and suggest a sensible trade-off to explore (for example a lower share target to make room for the properties, a cheaper next property, or retiring a little later), using only the figures given.\n`
      : '';
    const sys = lead + `You are Wise, the assistant inside WealthWise, an Australian property and wealth planning app. You get a household's figures, already calculated exactly by the app, plus the app's rule-based observations.
Write a short, warm, plain-English overview of where they stand against their goal, then up to 2 ideas or scenarios worth exploring in the app (for example a renovation, timing the next purchase, building a buffer, testing a later retirement age).
Rules: use ONLY the numbers given and never calculate new ones. This is general information, not personal financial advice: suggest things to explore or questions to ask a broker, accountant or licensed adviser; never tell them to buy, sell or borrow, and never name a lender, fund or stock.
Reply with JSON only: {"summary":"2-3 sentences, max 60 words","ideas":[{"title":"max 8 words","body":"1-2 sentences, max 40 words"}]}`;
    const out = await askAI(env, sys, JSON.stringify(facts));
    return { summary: String(out?.summary || '').slice(0, 600), ideas: (Array.isArray(out?.ideas) ? out.ideas : []).slice(0, 2).map((i: any) => ({ title: String(i.title || '').slice(0, 80), body: String(i.body || '').slice(0, 300) })) };
  });
  return data?.summary ? json(data) : fail('Wise is unavailable right now.', 503);
}

/* ---------- RBA cash rate (official daily series) ---------- */
function cashRate(env: Env, force = false) {
  return cached(env, 'rba:cash-rate', 12 * 3600e3, async () => {
    const res = await fetch('https://www.rba.gov.au/statistics/tables/csv/f1-data.csv', { headers: { 'user-agent': 'Mozilla/5.0 (compatible; WealthWise/1.0)' } });
    if (!res.ok) throw new Error(`rba ${res.status}`);
    const rows = (await res.text()).split(/\r?\n/).map((l) => l.split(',')).filter((c) => /^\d{2}-[A-Za-z]{3}-\d{4}$/.test(c[0]) && c[1] && !isNaN(Number(c[1])));
    const changes: { date: string; rate: number }[] = [];
    for (const [d, v] of rows) {
      const rate = Number(v);
      if (!changes.length || changes[changes.length - 1].rate !== rate) changes.push({ date: new Date(`${d} UTC`).toISOString().slice(0, 10), rate });
    }
    if (!changes.length) throw new Error('no cash rate rows');
    const recent = changes.slice(-6);
    return { current: recent[recent.length - 1].rate, effective: recent[recent.length - 1].date, previous: recent[recent.length - 2] ?? null, changes: recent };
  }, force);
}

/* ---------- Document reading: convert with Workers AI, then extract the figures ----------
 * The file is read in memory and discarded; only the extracted figures go back to the app.
 */
const DOC_TYPES = ['valuation', 'super', 'loan', 'rental', 'payslip', 'trades', 'other'];

async function readDocument(req: Request, env: Env) {
  let form: FormData;
  try { form = await req.formData(); } catch { return fail('Upload a file to read.'); }
  const file = form.get('file');
  if (!(file instanceof File)) return fail('Upload a file to read.');
  if (file.size > 6 * 1024 * 1024) return fail('That file is over 6 MB. Try a smaller PDF or a photo of the page.', 413);
  const kind = DOC_TYPES.includes(String(form.get('kind'))) ? String(form.get('kind')) : 'other';
  const context = String(form.get('context') || '{}').slice(0, 4000);

  const converted: any = await (env.AI as any).toMarkdown([{ name: file.name || 'document', blob: new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' }) }]);
  const text = String(converted?.[0]?.data || '').replace(/## Metadata[\s\S]*?## Contents/, '').slice(0, 14000);
  if (!text.trim() || converted?.[0]?.format === 'error') return fail('We couldn’t read any text in that file. Try a PDF, or a clearer photo of the page.', 422);

  const sys = `You read Australian personal-finance documents for a wealth app and pull out figures exactly as written. The user says this is a "${kind}" document; correct that if the text clearly shows otherwise.
Never guess or calculate: if a value isn't in the text, use null. Money as plain numbers (415000 not "$415,000"). Dates as YYYY-MM-DD.
The household's properties and people, to help you name the right ones: ${context}
Reply with JSON only, filling only the section that matches the document and null for the rest:
{"detectedType":"valuation|super|loan|rental|payslip|trades|other","summary":"one plain sentence describing the document",
"valuation":{"address":"","value":0,"date":"","weeklyRent":null,"valuer":""},
"super":{"memberName":"","fund":"","closingBalance":0,"periodEnd":"","returnPercent":null,"contributions":null},
"loan":{"propertyAddress":"","lender":"","balance":0,"ratePercent":null,"rateType":"variable|fixed|null","offsetBalance":null,"date":""},
"rental":{"address":"","weeklyRent":null,"periodEnd":""},
"payslip":{"name":"","annualSalary":null,"payDate":""},
"trades":[{"code":"","market":"ASX","side":"buy|sell","units":0,"price":0,"date":""}]}`;
  try {
    const out = await askAI(env, sys, `Document text:\n${text}`);
    return json({ fileName: file.name, ...out });
  } catch (e) {
    console.error(`doc read: ${(e as Error).message}`);
    return fail('We read the file but couldn’t pick out the figures. You can enter them by hand instead.', 422);
  }
}

/* ---------- Price history for charts ---------- */
const INDEX_SYMBOLS: Record<string, { symbol: string; name: string }> = {
  'IDX:AXJO': { symbol: '^AXJO', name: 'ASX 200' }, 'IDX:GSPC': { symbol: '^GSPC', name: 'S&P 500' },
  'IDX:IXIC': { symbol: '^IXIC', name: 'Nasdaq' }, 'IDX:AUDUSD': { symbol: 'AUDUSD=X', name: 'AUD/USD' },
};
const RANGES: Record<string, { interval: string; ttl: number }> = { '1mo': { interval: '1d', ttl: 1 }, '6mo': { interval: '1d', ttl: 3 }, '1y': { interval: '1d', ttl: 6 }, '5y': { interval: '1wk', ttl: 24 }, '10y': { interval: '1mo', ttl: 48 }, max: { interval: '1mo', ttl: 48 } };

async function history(req: Request, env: Env) {
  const u = new URL(req.url);
  const key = (u.searchParams.get('key') || '').toUpperCase();
  const range = RANGES[u.searchParams.get('range') || ''] ? u.searchParams.get('range')! : '1y';
  if (!/^(ASX|NASDAQ|NYSE|CRYPTO|IDX):[A-Z0-9.\-]{1,12}$/.test(key)) return fail('Unknown symbol.');
  const idx = INDEX_SYMBOLS[key];
  if (key.startsWith('IDX:') && !idx) return fail('Unknown index.');
  const symbol = idx?.symbol ?? yahooSymbol(key);
  const data = await cached(env, `hist:${key}:${range}`, RANGES[range].ttl * 3600e3, async () => {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${RANGES[range].interval}`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; WealthWise/1.0)' } });
    if (!res.ok) throw new Error(`history ${symbol} ${res.status}`);
    const r = (await res.json() as any)?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const closes: (number | null)[] = r?.indicators?.adjclose?.[0]?.adjclose ?? r?.indicators?.quote?.[0]?.close ?? [];
    const points = ts.map((t, i) => ({ t: t * 1000, c: closes[i] })).filter((x) => x.c != null);
    if (!points.length) throw new Error('no history');
    return { key, name: idx?.name ?? key.split(':')[1], currency: r?.meta?.currency ?? 'AUD', points };
  });
  return data ? json(data, 200, { 'cache-control': 'public, max-age=900' }) : fail('Price history unavailable right now.', 503);
}
