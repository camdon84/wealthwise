import { create } from 'zustand';
import type { Profile, Session } from './types';
import { createAdapter } from './storage';
import { normalize } from './defaults';

const adapter = createAdapter();

/**
 * Offset money lives on each loan and is entered per property in My Details. Cash at the bank
 * (excluding offsets) is entered separately. The total the engine uses is always the two added up.
 */
export function syncOffsets(p: Profile) {
  const loans = p.properties.flatMap((pr) => pr.loans);
  p.finances.cashOffset = loans.reduce((t, l) => t + (l.offset ?? 0), 0) || null;
  if (p.finances.cashSavings != null || p.finances.cashOffset != null) p.finances.cash = (p.finances.cashSavings ?? 0) + (p.finances.cashOffset ?? 0);
}
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
    // An administrator opening a user's account from the admin portal: #view=<token>. Read-only, never saved.
    const viewed = await openViewLink();
    if (viewed) { set({ ...viewed, ready: true }); return; }
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
    if (get().session?.viewing) { endView(); return; }
    await adapter.signOut();
    set({ session: null, profile: null });
    location.hash = '';
  },
  update(fn) {
    const cur = get().profile;
    if (!cur || get().session?.viewing) return; // viewing someone's account: nothing can be changed or saved
    const next: Profile = structuredClone(cur);
    fn(next);
    syncOffsets(next);
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

const VIEW_KEY = 'ww.view';
/**
 * Read-only access for administrators. The admin portal sends them here with #view=<token>; the token is
 * kept for this tab only (so a refresh still works within its 15 minutes) and removed from the address bar.
 */
async function openViewLink(): Promise<Pick<State, 'session' | 'profile'> | null> {
  const m = /^#view=([a-f0-9]{64})$/.exec(location.hash);
  let token = m?.[1] ?? null;
  try { if (token) sessionStorage.setItem(VIEW_KEY, token); else token = sessionStorage.getItem(VIEW_KEY); } catch { /* storage blocked */ }
  if (!token) return null;
  if (m) history.replaceState(null, '', `${location.pathname}#overview`);
  const r = await fetch('/api/view', { headers: { 'x-view-token': token } }).catch(() => null);
  if (!r?.ok) { try { sessionStorage.removeItem(VIEW_KEY); } catch { /* ignore */ } alert('This view link has expired. Open the account again from the admin portal.'); return null; }
  const v = (await r.json()) as { userId: string; email: string; name: string; profile: Profile | null };
  if (!v.profile) { alert(`${v.name} hasn’t started setting up their plan yet, so there’s nothing to view.`); endView(false); return null; }
  return { session: { userId: v.userId, email: v.email, name: v.name, viewing: true }, profile: normalize(v.profile) };
}
/** Leave a viewed account: forget the token and close the tab (or reload to the normal app). */
export function endView(close = true) {
  try { sessionStorage.removeItem(VIEW_KEY); } catch { /* ignore */ }
  if (close) { window.close(); location.replace(`${location.pathname}#overview`); location.reload(); }
}

/** One-off navigation intent, e.g. "open the plan's property portfolio with this property expanded". */
export const useNavIntent = create<{ planTab: string | null; focusProperty: string | null; editProperty: string | null; set(v: { planTab?: string | null; focusProperty?: string | null; editProperty?: string | null }): void }>((set) => ({
  planTab: null, focusProperty: null, editProperty: null, set: (v) => set(v),
}));
