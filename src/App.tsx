import { WiseActions } from './pages/WiseActions';
import { actionsNeedingUpdate, reviewDue, wiseActions } from './lib/actions';
import { useEffect, useMemo, useState } from 'react';
import { endView, useApp } from './lib/store';
import { useHashRoute, useQuotes } from './lib/hooks';
import { Auth } from './pages/Auth';
import { Onboarding } from './onboarding/Onboarding';
import { Overview } from './pages/Overview';
import { Properties } from './pages/Properties';
import { Investments } from './pages/Investments';
import { Plan } from './pages/Plan';
import { Renovate } from './pages/Renovate';
import { MyDetails } from './pages/MyDetails';
import { Account } from './pages/Account';
import { FirstLook } from './pages/FirstLook';
import { Documents, eofyItems } from './pages/Documents';
import { Icon, Logo } from './components/ui';

const NAV = [
  { id: 'overview', label: 'Overview', icon: 'overview' },
  { id: 'properties', label: 'Properties', icon: 'property' },
  { id: 'investments', label: 'Shares', icon: 'shares' },
  { id: 'crypto', label: 'Crypto', icon: 'coin' },
  { id: 'plan', label: 'Wise Plan', icon: 'plan' },
  { id: 'actions', label: 'Wise Actions', icon: 'actions' },
  { id: 'renovate', label: 'Renovator Centre', icon: 'renovate' },
  { id: 'details', label: 'My Details', icon: 'details' },
  { id: 'documents', label: 'Upload your documents', icon: 'upload' },
  { id: 'account', label: 'Account', icon: 'profile' },
];

export default function App() {
  const { ready, session, profile, init } = useApp();
  useEffect(() => { init(); }, [init]);
  if (!ready) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;
  if (!session || !profile) return <Auth />;
  if (!profile.onboarded) return <Onboarding />;
  return <Shell />;
}

function Shell() {
  const { route, go } = useHashRoute('overview');
  const { quotes, asOf } = useQuotes();
  const { session, saving, theme, toggleTheme, signOut } = useApp();
  const [menu, setMenu] = useState(false);
  const current = NAV.some((n) => n.id === route) ? route : 'overview';
  const profile = useApp((s) => s.profile)!;
  const due = eofyItems(profile).outstanding.length;
  const acts = useMemo(() => wiseActions(profile, quotes).actions, [profile, quotes]);
  const actionAlerts = actionsNeedingUpdate(profile, acts).length + (reviewDue(profile) ? 1 : 0);
  if (profile.firstLookSeen === false && !session?.viewing) return <FirstLook quotes={quotes} />;

  const nav = (
    <nav aria-label="Main" className="space-y-1">
      {NAV.map((n) => (
        <button key={n.id} onClick={() => { go(n.id); setMenu(false); }} aria-current={current === n.id ? 'page' : undefined}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${current === n.id ? 'bg-raised text-ink ring-1 ring-line' : 'text-muted hover:text-ink hover:bg-raised/60'}`}>
          <Icon name={n.icon} className="h-[18px] w-[18px]" />{n.label}
          {n.id === 'actions' && actionAlerts > 0 && <span className="ml-auto rounded-full bg-clay px-1.5 text-[11px] font-semibold text-white" aria-label={`${actionAlerts} actions need attention`}>{actionAlerts}</span>}
          {n.id === 'documents' && due > 0 && <span className="ml-auto rounded-full bg-brass px-1.5 text-[11px] font-semibold text-ground" aria-label={`${due} end of year updates due`}>{due}</span>}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between lg:sticky lg:top-0 lg:h-screen p-4">
        <div><div className="px-2 py-2"><Logo /></div><div className="mt-6">{nav}</div></div>
        <div className="space-y-1 border-t border-line pt-4">
          <p className="px-3 pb-2 text-xs text-muted">{session?.viewing ? `Viewing ${session.email}` : session?.sandbox ? 'Test mode, nothing is saved' : session?.demo ? 'Demo account' : session?.email}</p>
          <button className="btn-ghost w-full justify-start" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4" />{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
          <button className="btn-ghost w-full justify-start" onClick={signOut}><Icon name="out" className="h-4 w-4" />{session?.viewing ? 'Exit' : 'Sign out'}</button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ground/90 px-5 py-3 backdrop-blur lg:hidden">
          <Logo size={24} />
          <button className="btn-ghost p-2" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name={menu ? 'x' : 'menu'} /></button>
        </header>
        {menu && <div className="border-b border-line bg-surface p-4 lg:hidden">{nav}<div className="mt-3 flex gap-2 border-t border-line pt-3"><button className="btn-ghost" onClick={toggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button><button className="btn-ghost" onClick={signOut}>{session?.viewing ? 'Exit' : 'Sign out'}</button></div></div>}
        {session?.viewing && (
          <div className="sticky top-0 z-40 flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#3d6891] px-5 py-2.5 text-sm text-white sm:px-8" role="status">
            <Icon name="lock" className="h-4 w-4 shrink-0" />
            <p className="min-w-[12rem] flex-1"><span className="font-semibold">Viewing {session.name}’s account.</span> Read only: nothing here can be changed.</p>
            <button className="rounded-lg bg-white/15 px-3 py-1 font-semibold hover:bg-white/25" onClick={() => endView()}>Exit</button>
          </div>
        )}
        <main className={`mx-auto max-w-[1400px] px-5 py-8 sm:px-8 ${session?.viewing ? 'view-only' : ''}`}>
          <p className="mb-2 h-4 text-right text-xs text-muted" aria-live="polite">{session?.viewing ? '' : saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'All changes saved' : ''}</p>
          {current === 'overview' && <Overview quotes={quotes} go={go} />}
          {current === 'properties' && <Properties />}
          {current === 'investments' && <Investments quotes={quotes} asOf={asOf} />}
          {current === 'crypto' && <Investments key="crypto" quotes={quotes} asOf={asOf} mode="crypto" />}
          {current === 'plan' && <Plan quotes={quotes} />}
          {current === 'actions' && <WiseActions quotes={quotes} go={go} />}
          {current === 'documents' && <Documents />}
          {current === 'renovate' && <Renovate />}
          {current === 'details' && <MyDetails />}
          {current === 'dependants' && <MyDetails initialTab="dependants" />}
          {current === 'account' && <Account />}
        </main>
      </div>
    </div>
  );
}
