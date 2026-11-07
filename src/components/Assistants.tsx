import { useMemo, useState } from 'react';
import type { Profile } from '../lib/types';
import type { Quotes } from '../lib/calc';
import { wiseInsights, type Insight } from '../lib/insights';
import { equitySpot, propertyPulse, type Briefing } from '../lib/briefings';
import { Icon, Segmented } from './ui';

const KIND: Record<Insight['kind'], { label: string; cls: string }> = {
  opportunity: { label: 'Opportunity', cls: 'bg-gum/15 text-gum' },
  watch: { label: 'Worth a look', cls: 'bg-clay/15 text-clay' },
  milestone: { label: 'Milestone', cls: 'bg-brass/15 text-brass' },
  goal: { label: 'Your goal', cls: 'bg-sky/15 text-sky' },
};
const ASK = { broker: 'Ask your mortgage broker', adviser: 'Ask a licensed financial adviser', accountant: 'Ask your accountant' };

export function WisePanel({ profile, quotes, go }: { profile: Profile; quotes: Quotes; go: (r: string) => void }) {
  const insights = useMemo(() => wiseInsights(profile, quotes), [profile, quotes]);
  const [open, setOpen] = useState(0);
  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="wise-h">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brass text-ground"><Icon name="spark" /></span>
        <div>
          <h2 id="wise-h" className="font-display text-xl font-semibold">Wise</h2>
          <p className="text-sm text-muted">{insights.length} ideas from your numbers, refreshed whenever they change</p>
        </div>
      </div>
      <ul className="mt-5 divide-y divide-line">
        {insights.map((ins, i) => {
          const expanded = open === i;
          return (
            <li key={ins.id}>
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
                    {ins.action && <button className="btn-quiet py-1.5" onClick={() => go(ins.action!.to)}>{ins.action.label}</button>}
                    {ins.ask && <span className="text-xs text-muted">{ASK[ins.ask]}</span>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">Wise gives general information based on the figures you’ve entered. It doesn’t consider your full objectives or needs and isn’t financial, tax or credit advice.</p>
    </section>
  );
}

export function NewsPanel({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<'property' | 'equity'>('property');
  const b: Briefing = tab === 'property' ? propertyPulse(profile) : equitySpot();
  return (
    <section className="panel p-5 sm:p-6" aria-label="Market briefings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-raised ring-1 ring-line text-ink"><Icon name="news" /></span>
          <div><h2 className="font-display text-xl font-semibold">{tab === 'property' ? 'Property Pulse' : 'Equity Spot'}</h2><p className="text-sm text-muted">{tab === 'property' ? 'Your suburbs and the national market' : 'What the share market did this week'}</p></div>
        </div>
        <Segmented size="sm" label="Briefing" value={tab} onChange={setTab} options={[{ value: 'property', label: 'Property' }, { value: 'equity', label: 'Shares' }]} />
      </div>
      {b.sample && <p className="mt-4 rounded-lg bg-raised px-3 py-2 text-xs text-muted ring-1 ring-line">Sample briefing. Live weekly news, with sources, switches on once WealthWise is hosted.</p>}
      <ul className="mt-2 divide-y divide-line">
        {b.items.map((it) => (
          <li key={it.id} className="flex gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{it.scope}</p>
              <p className="mt-0.5 font-medium leading-snug">{it.headline}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{it.body}</p>
            </div>
            {it.stat && (
              <div className="w-24 shrink-0 text-right">
                <p className={`font-display text-lg font-semibold ${it.tone === 'up' ? 'text-gum' : it.tone === 'down' ? 'text-clay' : ''}`}>{it.stat}</p>
                <p className="text-[11px] leading-tight text-muted">{it.statLabel}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">General market information only. Nothing here is a recommendation to buy or sell.</p>
    </section>
  );
}
