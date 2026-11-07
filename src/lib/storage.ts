import type { Profile, Session } from './types';
import { blankProfile, demoProfile, uid } from './defaults';

/**
 * Storage adapter. The preview build keeps data in the browser (LocalAdapter).
 * The hosted build swaps in ApiAdapter, which talks to the Cloudflare Worker + D1 database.
 * Every screen goes through this interface, so switching is one line in createAdapter().
 */
export interface StorageAdapter {
  kind: 'local' | 'api';
  currentSession(): Promise<Session | null>;
  signUp(name: string, email: string, password: string): Promise<Session>;
  signIn(email: string, password: string): Promise<Session>;
  signInDemo(): Promise<Session>;
  signInSandbox(): Promise<Session>;
  signOut(): Promise<void>;
  loadProfile(session: Session): Promise<Profile>;
  saveProfile(session: Session, profile: Profile): Promise<void>;
}

const mem = new Map<string, string>();
const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return mem.get(k) ?? null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { mem.set(k, v); } },
  del(k: string) { try { localStorage.removeItem(k); } catch { mem.delete(k); } },
};

async function hash(text: string) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return btoa(unescape(encodeURIComponent(text)));
  }
}

type UserRec = { id: string; email: string; name: string; pw: string };
const USERS = 'gw.users';
const SESSION = 'gw.session';
const DEMO: Session = { userId: 'demo', email: 'demo@wealthwise.app', name: 'Tom', demo: true };
const SANDBOX: Session = { userId: 'sandbox', email: 'test mode', name: '', demo: true, sandbox: true };

class LocalAdapter implements StorageAdapter {
  kind = 'local' as const;
  private users(): UserRec[] { return JSON.parse(ls.get(USERS) || '[]'); }
  async currentSession() { const s = ls.get(SESSION); return s ? (JSON.parse(s) as Session) : null; }
  async signUp(name: string, email: string, password: string) {
    const users = this.users();
    const e = email.trim().toLowerCase();
    if (users.some((u) => u.email === e)) throw new Error('An account with that email already exists. Sign in instead.');
    const rec = { id: uid(), email: e, name: name.trim(), pw: await hash(password) };
    ls.set(USERS, JSON.stringify([...users, rec]));
    const s: Session = { userId: rec.id, email: e, name: rec.name };
    ls.set(SESSION, JSON.stringify(s));
    return s;
  }
  async signIn(email: string, password: string) {
    const e = email.trim().toLowerCase();
    const rec = this.users().find((u) => u.email === e);
    if (!rec || rec.pw !== (await hash(password))) throw new Error('That email and password don’t match an account.');
    const s: Session = { userId: rec.id, email: e, name: rec.name };
    ls.set(SESSION, JSON.stringify(s));
    return s;
  }
  async signInDemo() { ls.set(SESSION, JSON.stringify(DEMO)); return DEMO; }
  async signInSandbox() { ls.del(`gw.profile.${SANDBOX.userId}`); ls.set(SESSION, JSON.stringify(SANDBOX)); return SANDBOX; }
  async signOut() { const s = await this.currentSession(); if (s?.sandbox) ls.del(`gw.profile.${SANDBOX.userId}`); ls.del(SESSION); }
  async loadProfile(s: Session) {
    const raw = ls.get(`gw.profile.${s.userId}`);
    if (raw) return JSON.parse(raw) as Profile;
    return s.demo ? demoProfile() : blankProfile(s.name);
  }
  async saveProfile(s: Session, p: Profile) { ls.set(`gw.profile.${s.userId}`, JSON.stringify(p)); }
}

class ApiAdapter implements StorageAdapter {
  kind = 'api' as const;
  private local = new LocalAdapter(); // the demo account lives in the visitor's browser, so every visitor gets a fresh copy
  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api${path}`, { credentials: 'include', headers: { 'content-type': 'application/json' }, ...init });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Something went wrong. Try again.');
    return res.json();
  }
  async currentSession() {
    const demo = await this.local.currentSession();
    if (demo?.demo) return demo;
    return this.call<Session | null>('/session');
  }
  signUp(name: string, email: string, password: string) { return this.call<Session>('/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) }); }
  signIn(email: string, password: string) { return this.call<Session>('/signin', { method: 'POST', body: JSON.stringify({ email, password }) }); }
  signInDemo() { return this.local.signInDemo(); }
  signInSandbox() { return this.local.signInSandbox(); }
  async signOut() {
    const s = await this.local.currentSession();
    await this.local.signOut();
    if (!s?.demo) await this.call('/signout', { method: 'POST' }).catch(() => {});
  }
  async loadProfile(s: Session) {
    if (s.demo) return this.local.loadProfile(s);
    return (await this.call<Profile | null>('/profile')) ?? blankProfile(s.name);
  }
  async saveProfile(s: Session, p: Profile) {
    if (s.demo) return this.local.saveProfile(s, p);
    await this.call('/profile', { method: 'PUT', body: JSON.stringify(p) });
  }
}

export function createAdapter(): StorageAdapter {
  const useApi = (import.meta as any).env?.VITE_STORAGE === 'api';
  return useApi ? new ApiAdapter() : new LocalAdapter();
}
