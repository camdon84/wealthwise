import { useMemo } from 'react';
import { useApp } from '../lib/store';
import { position, type Quotes } from '../lib/calc';
import { wiseInsights } from '../lib/insights';
import { money } from '../lib/format';
import { ASK, KIND, useWiseTake } from '../components/Assistants';
import { Icon, Logo } from '../components/ui';

/** Shown once, straight after setup: the AI's first read of the household, led by quick wins. */
export function FirstLook({ quotes }: { quotes: Quotes }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const pos = useMemo(() => position(p, quotes), [p, quotes]);
  const insights = useMemo(() => wiseInsights(p, quotes), [p, quotes]);
  const take = useWiseTake(p, quotes, insights, 'first-look');
  // Debts and cash first: those are the quickest wins straight after setup.
  const money1 = (id: string) => (/^(pay-|equity-|offset|cards|hecs-order)/.test(id) ? 0 : 1);
  const wins = insights.filter((i) => i.kind === 'opportunity' || i.kind === 'watch').sort((a, b) => money1(a.id) - money1(b.id)).slice(0, 6);
  const done = () => { update((d) => { d.firstLookSeen = true; }); location.hash = 'overview'; };

  return (
    <div className="min-h-full">
      <header className="border-b border-line"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3"><Logo /><button className="btn-ghost" onClick={done}>Skip to dashboard</button></div></header>
      <main className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-muted">Your plan is ready, {p.household.you.name || 'there'}</p>
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">Here’s your first look</h1>

        <div className="paper mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
          {[['Net worth', money(pos.netWorth)], ['Usable equity', money(pos.usable, { compact: true })], ['Borrowing capacity', money(pos.bc.capacity, { compact: true })], ['Left over each month', money(pos.monthlySurplus)]].map(([l, v]) => (
            <div key={l} className="bg-surface p-5"><p className="text-xs text-muted">{l}</p><p className="font-display text-2xl font-semibold">{v}</p></div>
          ))}
        </div>

        <section className="panel mt-6 p-6">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brass text-ground"><Icon name="spark" /></span><h2 className="font-display text-xl font-semibold">What Wise noticed</h2></div>
          {take === 'loading' || take === null ? (
            take === 'loading'
              ? <div className="mt-5 space-y-2" aria-label="Wise is reading your answers"><div className="h-3.5 w-3/4 animate-pulse rounded bg-line" /><div className="h-3.5 w-full animate-pulse rounded bg-line" /><div className="h-3.5 w-5/6 animate-pulse rounded bg-line" /><p className="pt-1 text-xs text-muted">Reading your answers…</p></div>
              : null
          ) : (
            <div className="mt-4">
              <p className="text-lg leading-relaxed">{take.summary}</p>
              {take.ideas.length > 0 && <ul className="mt-4 space-y-2">{take.ideas.map((i) => <li key={i.title}><span className="font-medium">{i.title}.</span> <span className="text-muted">{i.body}</span></li>)}</ul>}
            </div>
          )}

          {wins.length > 0 && (
            <>
              <h3 className="mt-8 font-display text-lg font-semibold">Quick wins and things to check</h3>
              <ul className="mt-3 divide-y divide-line">
                {wins.map((w) => (
                  <li key={w.id} className="flex gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <span className={`chip ${KIND[w.kind].cls}`}>{KIND[w.kind].label}</span>
                      <p className="mt-2 font-medium">{w.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{w.body}</p>
                      {w.ask && <p className="mt-1 text-xs text-muted">{ASK[w.ask]}</p>}
                    </div>
                    {w.figure && <div className="shrink-0 text-right"><p className="font-display text-xl font-semibold">{w.figure}</p><p className="text-[11px] text-muted">{w.figureLabel}</p></div>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-[11px] text-muted">General information based on the figures you entered. It doesn’t consider your full objectives or needs and isn’t financial, tax or credit advice.</p>
        </section>

        <div className="mt-8 flex justify-end"><button className="btn-primary px-6 py-3 text-base" onClick={done}>Go to my dashboard<Icon name="arrow" className="h-4 w-4" /></button></div>
      </main>
    </div>
  );
}
