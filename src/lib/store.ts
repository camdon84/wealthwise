import { create } from 'zustand';
import type { Profile, Session } from './types';
import { createAdapter } from './storage';
import { normalize } from './defaults';

const adapter = createAdapter();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

interface State {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  saving: 'idle' | 'saving' | 'saved';
  theme: 'dark' | 'light';
  init(): Promise<void>;
  signUp(name: string, email: string, pw: string): Promise<void>;
  signIn(email: string, pw: string): Promise<void>;
  signInDemo(): Promise<void>;
  signInSandbox(): Promise<void>;
  signOut(): Promise<void>;
  update(fn: (p: Profile) => void): void;
  replace(p: Profile): void;
  toggleTheme(): void;
}

function readTheme(): 'dark' | 'light' {
  try { return (localStorage.getItem('gw.theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
}
function applyTheme(t: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', t === 'dark');
  try { localStorage.setItem('gw.theme', t); } catch { /* preview frame may block storage */ }
}

export const useApp = create<State>((set, get) => ({
  ready: false,
  session: null,
  profile: null,
  saving: 'idle',
  theme: readTheme(),
  async init() {
    applyTheme(get().theme);
    const session = await adapter.currentSession().catch(() => null);
    const profile = session ? normalize(await adapter.loadProfile(session)) : null;
    set({ session, profile, ready: true });
  },
  async signUp(name, email, pw) {
    const session = await adapter.signUp(name, email, pw);
    set({ session, profile: normalize(await adapter.loadProfile(session)) });
  },
  async signIn(email, pw) {
    const session = await adapter.signIn(email, pw);
    set({ session, profile: normalize(await adapter.loadProfile(session)) });
  },
  async signInDemo() {
    const session = await adapter.signInDemo();
    set({ session, profile: normalize(await adapter.loadProfile(session)) });
  },
  async signInSandbox() {
    const session = await adapter.signInSandbox();
    set({ session, profile: normalize(await adapter.loadProfile(session)) });
  },
  async signOut() {
    await adapter.signOut();
    set({ session: null, profile: null });
    location.hash = '';
  },
  update(fn) {
    const cur = get().profile;
    if (!cur) return;
    const next: Profile = structuredClone(cur);
    fn(next);
    next.updatedAt = new Date().toISOString();
    set({ profile: next, saving: 'saving' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const s = get().session;
      if (s) await adapter.saveProfile(s, get().profile!);
      set({ saving: 'saved' });
    }, 400);
  },
  replace(p) { get().update((d) => Object.assign(d, structuredClone(p))); },
  toggleTheme() {
    const t = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    set({ theme: t });
  },
}));

export const storageKind = adapter.kind;
