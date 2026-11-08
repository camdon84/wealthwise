/**
 * Shared by the app's worker (worker/index.ts) and the admin portal's worker (admin/index.ts).
 * Both use the same D1 database, so password hashing and the admin tables live here once.
 */
export const enc = new TextEncoder();

export const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

/** PBKDF2-SHA256, 100,000 rounds, per-user salt (hex). */
export async function hashPassword(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return hex(bits);
}

/** Constant-time comparison of two hex strings. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Admin tables. Administrators are kept apart from app users: their own table, their own sessions
 * (on the admin portal's address only) and a log of what they did.
 * - view_tokens: one-time, 15-minute tokens that let an admin open a user's account read-only in the app.
 */
export const ADMIN_TABLES = [
  'CREATE TABLE IF NOT EXISTS admins (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS admin_events (at TEXT NOT NULL, admin_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, detail TEXT)',
  'CREATE TABLE IF NOT EXISTS view_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, admin_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
];

export const VIEW_MINUTES = 15;
