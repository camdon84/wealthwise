import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../lib/types';
import type { Quotes } from '../lib/calc';
import { insightKey, notWorkIdea, rankInsights, stopWorkYear, wiseIdeaOk, wiseFacts, wiseInsights, type Insight } from '../lib/insights';
import { equitySpot, loadBriefing, propertyPulse, type Briefing } from '../lib/briefings';
import { Icon, Segmented } from './ui';
import { useApp, useNavIntent } from '../lib/store';

export const KIND: Record<Insight['kind'], { label: string; cls: string }> = {
  opportunity: { label: 'Opportunity', cls: 'bg-gum/15 text-gum' },
  watch: { label: 'Worth a look', cls: 'bg-clay/15 text-clay' },
  milestone: { label: 'Milestone', cls: 'bg-brass/15 text-brass' },
  goal: { label: 'Your goal', cls: 'bg-sky/15 text-sky' },
};
export const ASK = { broker: 'Ask your mortgage broker', adviser: 'Ask a licensed financial adviser', accountant: 'Ask your accountant' };

const liveMode = (import.meta as any).env?.VITE_STORAGE === 'api';
const wiseMemo = new Map<string, Promise<{ summary: string; ideas: { title: string; body: string }[] } | null>>();

export function useWiseTake(profile: Profile, quotes: Quotes, insights: Insight[], mode?: 'first-look' | 'goals', fresh?: number, extra?: object) {
  const ready = profile.holdings.length === 0 || Object.keys(quotes).length > 0;
  const body = useMemo(() => (ready ? JSON.stringify({ ...wiseFacts(profile, quotes, insights), ...extra }) : ''), [profile, quotes, insights, ready, extra]);
  const [take, setTake] = useState<{ summary: string; ideas: { title: string; body: string }[] } | null | 'loading'>(liveMode ? 'loading' : null);
  useEffect(() => {
    if (!liveMode || !body) return;
    let on = true;
    const t = setTimeout(() => {
      const k = (mode ?? '') + (fresh ?? '') + body;
      const qs = [mode && `mode=${mode}`, fresh && `fresh=${fresh}`].filter(Boolean).join('&');
      if (!wiseMemo.has(k)) wiseMemo.set(k, fetch(`/api/wise${qs ? `?${qs}` : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
      const ok = wiseIdeaOk(profile, stopWorkYear(profile));
      wiseMemo.get(k)!.then((v) => on && setTake(v ? { ...v, ideas: (v.ideas ?? []).filter(ok) } : v));
    }, 800); // wait for typing to settle before asking for a new write-up
    return () => { on = false; clearTimeout(t); };
  }, [body, mode, fresh]);
  return take;
}

export function WisePanel({ profile, quotes, go }: { profile: Profile; quotes: Quotes; go: (r: string) => void }) {
  const all = useMemo(() => wiseInsights(profile, quotes), [profile, quotes]);
  const st = profile.insightState;
  const { visible: insights, queued, dismissed } = useMemo(() => rankInsights(all, st), [all, st]);
  const take = useWiseTake(profile, quotes, insights, undefined, st?.refreshedAt);
  const [open, setOpen] = useState(0);
  const [busy, setBusy] = useState(false);
  const update = useApp((s) => s.update);

  // Bookkeeping: note when each insight first appears, and whether they've changed their
  // retirement income since we suggested they could afford more (then wait 12 months).
  useEffect(() => {
    const now = Date.now();
    const keys = all.map(insightKey);
    const unseen = keys.filter((k) => !st?.seen?.[k]);
    const stale = Object.keys(st?.seen ?? {}).filter((k) => !keys.includes(k));
    const inc = profile.goals.passiveIncome;
    const showingSpend = all.some((i) => i.id === 'spend-more');
    const base = st?.spendBase ?? null;
    const adjusted = base != null && inc !== base;
    const startBase = base == null && showingSpend;
    if (!unseen.length && !stale.length && !adjusted && !startBase) return;
    update((d) => {
      const s = (d.insightState ??= {});
      s.seen ??= {};
      unseen.forEach((k) => { s.seen![k] = now; });
      stale.forEach((k) => { delete s.seen![k]; if (s.back) delete s.back[k]; });
      if (adjusted) { s.spendBase = null; s.spendSnoozeUntil = now + 365 * 864e5; }
      else if (startBase) s.spendBase = inc;
    });
  }, [all, st, profile.goals.passiveIncome, update]);

  const dismiss = (ins: Insight) => { update((d) => { const s = (d.insightState ??= {}); (s.dismissed ??= {})[insightKey(ins)] = Date.now(); }); setOpen(-1); };
  const refresh = () => {
    setBusy(true);
    const now = Date.now();
    update((d) => {
      const s = (d.insightState ??= {});
      s.refreshedAt = now; // brings back anything dismissed
      s.back ??= {};
      // What they've already seen (shown or dismissed since the last refresh) goes to the back of the queue
      insights.forEach((i) => { s.back![insightKey(i)] = now; });
      all.forEach((i) => { const k = insightKey(i); const dd = s.dismissed?.[k]; if (dd && dd > (st?.refreshedAt ?? 0)) s.back![k] = now; });
    });
    setOpen(0);
    setTimeout(() => setBusy(false), 900);
  };
  const act = (to: string) => {
    if (to.startsWith('plan:')) { useNavIntent.getState().set({ planTab: to.slice(5) }); go('plan'); } else go(to);
  };

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="wise-h">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brass text-ground"><Icon name="spark" /></span>
        <div>
          <h2 id="wise-h" className="font-display text-xl font-semibold">Wise Insights</h2>
          <p className="text-sm text-muted">{insights.length ? `${insights.length} ${insights.length === 1 ? 'idea' : 'ideas'} from your numbers, refreshed whenever they change${queued ? ` · ${queued} more waiting` : ''}` : 'Nothing to show right now'}</p>
        </div>
      </div>
      {take && insights.length > 0 && (
        <div className="mt-5 rounded-xl bg-raised p-4 ring-1 ring-line" aria-live="polite">
          {take === 'loading' || busy ? (
            <div className="space-y-2" aria-label="Wise is reading your numbers"><div className="h-3 w-3/4 animate-pulse rounded bg-line" /><div className="h-3 w-full animate-pulse rounded bg-line" /><div className="h-3 w-2/3 animate-pulse rounded bg-line" /></div>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed">{take.summary}</p>
              {take.ideas.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {take.ideas.filter(notWorkIdea).map((i) => <li key={i.title} className="text-sm"><span className="font-medium">{i.title}.</span> <span className="text-muted">{i.body}</span></li>)}
                </ul>
              )}
              <p className="mt-3 text-[11px] text-muted">Written by AI from the figures above.</p>
            </>
          )}
        </div>
      )}
      {insights.length === 0 ? (
        <div className="mt-5 rounded-xl bg-raised p-6 text-center ring-1 ring-line">
          <p className="font-medium">You’ve cleared all your insights</p>
          <p className="mt-1 text-sm text-muted">{dismissed ? 'Dismissed insights stay hidden for 6 months. ' : ''}Ask Wise to look through your numbers again.</p>
        </div>
      ) : (
      <ul className={`mt-5 divide-y divide-line transition-opacity ${busy ? 'opacity-40' : ''}`}>
        {insights.map((ins, i) => {
          const expanded = open === i;
          return (
            <li key={insightKey(ins)}>
              <button className="flex w-full items-start gap-4 py-4 text-left" aria-expanded={expanded} onClick={() => setOpen(expanded ? -1 : i)}>
                <div className="min-w-0 flex-1">
                  <span className={`chip ${KIND[ins.kind].cls}`}>{KIND[ins.kind].label}</span>
                  <p className="mt-2 font-medium leading-snug">{ins.title}</p>
                </div>
                {ins.figure && <div className="shrink-0 text-right"><p className="font-display text-lg font-semibold">{ins.figure}</p><p className="text-[11px] text-muted">{ins.figureLabel}</p></div>}
              </button>
              {expanded && (
                <div className="rise -mt-1 pb-4">
                  <p className="text-sm leading-relaxed text-muted">{ins.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {ins.action && (ins.action.to === 'plan:projections'
                      ? <button className="group inline-flex items-center gap-2 rounded-xl border border-brass/60 bg-brass/10 px-4 py-2.5 text-sm font-semibold text-brass transition-all hover:bg-brass/20 hover:shadow-[0_4px_16px_-6px_rgb(var(--brass)/0.6)]" onClick={() => act('plan:projections')}><Icon name="spark" className="h-4 w-4 transition-transform group-hover:rotate-45" />{ins.action.label}</button>
                      : <button className="btn-quiet py-1.5" onClick={() => act(ins.action!.to)}>{ins.action.label}</button>)}
                    {ins.ask && <span className="text-xs text-muted">{ASK[ins.ask]}</span>}
                    <button className="ml-auto rounded-lg px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-line hover:text-ink" onClick={() => dismiss(ins)} title="Hide this insight for 6 months">Dismiss</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      )}
      <div className="mt-4 flex justify-center border-t border-line pt-4">
        <button onClick={refresh} disabled={busy} className="group inline-flex items-center gap-2 rounded-xl border border-brass/60 bg-brass/10 px-4 py-2.5 text-sm font-semibold text-brass transition-all hover:bg-brass/20 disabled:opacity-60">
          <Icon name="spark" className={`h-4 w-4 transition-transform ${busy ? 'animate-spin' : 'group-hover:rotate-45'}`} />{busy ? 'Looking through your numbers…' : 'Give me Wise Insights'}
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">Wise gives general information based on the figures you’ve entered. It doesn’t consider your full objectives or needs and isn’t financial, tax or credit advice.</p>
    </section>
  );
}

export function NewsPanel({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<'property' | 'equity'>('property');
  const fallback: Briefing = tab === 'property' ? propertyPulse(profile) : equitySpot();
  const [loaded, setLoaded] = useState<Partial<Record<'property' | 'equity', Briefing>>>({});
  const suburbKey = profile.properties.map((x) => x.suburb + x.state).join(',');
  useEffect(() => {
    let on = true;
    setLoaded((l) => { const n = { ...l }; delete n[tab]; return n; });
    loadBriefing(tab, profile).then((b) => on && setLoaded((l) => ({ ...l, [tab]: b })));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, suburbKey]);
  const b: Briefing | undefined = liveMode ? loaded[tab] : fallback;
  return (
    <section className="panel p-5 sm:p-6" aria-label="Market briefings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-raised ring-1 ring-line text-ink"><Icon name="news" /></span>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-brass">News and updates</p><h2 className="font-display text-xl font-semibold">{tab === 'property' ? 'Property Pulse' : 'Equity Spot'}</h2><p className="text-sm text-muted">{tab === 'property' ? 'Your suburbs and the national market' : 'What the share market did this week'}</p></div>
        </div>
        <Segmented size="sm" label="Briefing" value={tab} onChange={setTab} options={[{ value: 'property', label: 'Property' }, { value: 'equity', label: 'Shares' }]} />
      </div>
      {!b && <div className="mt-6 space-y-5" aria-label="Reading this week's news">{[0, 1, 2].map((i) => <div key={i} className="space-y-2"><div className="h-3 w-24 animate-pulse rounded bg-line" /><div className="h-4 w-3/4 animate-pulse rounded bg-line" /><div className="h-3 w-full animate-pulse rounded bg-line" /></div>)}<p className="text-xs text-muted">Reading this week’s news…</p></div>}
      {b?.sample && <p className="mt-4 rounded-lg bg-raised px-3 py-2 text-xs text-muted ring-1 ring-line">Sample briefing. Live weekly news, with sources, switches on once WealthWise is hosted.</p>}
      {b && !b.sample && <p className="mt-4 text-xs text-muted">AI summary of {b.count ?? 'recent'} news stories from the past week · updated {new Date(b.asOf).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</p>}
      {b && <ul className="mt-2 divide-y divide-line">
        {b.items.map((it) => (
          <li key={it.id} className="flex gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{it.scope}</p>
              <p className="mt-0.5 font-medium leading-snug">{it.headline}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{it.body}</p>
              {it.sources && it.sources.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {it.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-brass hover:underline" title={s.title}>{s.source || 'Source'}</a>)}
                </p>
              )}
            </div>
            {it.stat && (
              <div className="w-24 shrink-0 text-right">
                <p className={`font-display text-lg font-semibold ${it.tone === 'up' ? 'text-gum' : it.tone === 'down' ? 'text-clay' : ''}`}>{it.stat}</p>
                <p className="text-[11px] leading-tight text-muted">{it.statLabel}</p>
              </div>
            )}
          </li>
        ))}
      </ul>}
      <p className="mt-2 text-[11px] text-muted">General market information only. Nothing here is a recommendation to buy or sell.</p>
    </section>
  );
}
