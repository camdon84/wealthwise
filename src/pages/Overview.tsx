import { useState, useMemo } from 'react';
import { useApp } from '../lib/store';
import { project, position } from '../lib/calc';
import { money } from '../lib/format';
import type { Quotes } from '../lib/calc';
import { SeriesToggles, WealthChart, toReal } from '../components/Charts';
import { DollarsNote, DollarsToggle, LiveToAge } from '../components/ChartControls';
import { NewsPanel, WisePanel } from '../components/Assistants';
import { RateWatch } from '../components/RateWatch';

export function Overview({ quotes, go }: { quotes: Quotes; go: (r: string) => void }) {
  const p = useApp((s) => s.profile)!;
  const pos = useMemo(() => position(p, quotes), [p, quotes]);
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const life = p.goals.lifeExpectancy ?? 90;
  const span = Math.max(1, life - p.goals.retirementAge);
  const progress = proj.runsOutAge == null ? 1 : Math.max(0, Math.min(1, (proj.runsOutAge - p.goals.retirementAge) / span));
  const [dollars, setDollars] = useState<'real' | 'nominal'>('real');
  const [hidden, setHidden] = useState<string[]>([]);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted">{greet}, {p.household.you.name || 'there'}</p>
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Here’s where you stand</h1>
      </div>

      <RateWatch />

      <section className="panel overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted">Net worth</p>
                <p className="font-display text-5xl font-semibold tracking-tight">{money(pos.netWorth)}</p>
                <p className="mt-1 text-sm text-muted">{money(pos.assets, { compact: true })} in assets, {money(pos.liabilities, { compact: true })} owing</p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex flex-wrap items-center justify-end gap-3"><LiveToAge /><DollarsToggle value={dollars} onChange={setDollars} /></div>
                <SeriesToggles hidden={hidden} onChange={setHidden} />
              </div>
            </div>
            <div className="mt-4 -ml-2"><WealthChart points={dollars === 'real' ? toReal(proj.points, p.assumptions.inflation) : proj.points} retireYear={proj.retireYear} real={dollars === 'real'} hidden={hidden} /></div>
            <p className="mt-2 text-xs text-muted"><DollarsNote value={dollars} /> Projected from your current position to age {p.goals.lifeExpectancy ?? 90}, using the assumptions in your plan. Markers show when your equity could fund each new purchase.</p>
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-1 lg:border-l lg:border-t-0">
            <Kpi label="Usable equity" value={money(pos.usable, { compact: true })} sub={`at ${p.assumptions.lvr}% LVR`} />
            <Kpi label="Borrowing capacity" value={money(pos.bc.capacity, { compact: true })} sub="estimate, before a lender checks" />
            <Kpi label="Left over each month" value={money(pos.monthlySurplus)} sub="after living costs and all repayments" />
            <div className="bg-surface p-5">
              <p className="text-xs text-muted">Living on {money(p.goals.passiveIncome, { compact: true })} a year from {p.goals.retirementAge}</p>
              <p className={`font-display text-2xl font-semibold mt-0.5 ${proj.runsOutAge == null ? '' : 'text-clay'}`}>{proj.runsOutAge == null ? `Lasts past ${life}` : `Runs out at ${proj.runsOutAge}`}</p>
              <div className="mt-2 h-1.5 rounded-full bg-line"><div className={`h-1.5 rounded-full ${proj.runsOutAge == null ? 'bg-gum' : 'bg-clay'}`} style={{ width: `${progress * 100}%` }} /></div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <WisePanel profile={p} quotes={quotes} go={go} />
        <NewsPanel profile={p} />
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-2xl font-semibold mt-0.5">{value}</p>
      <p className="text-xs text-muted mt-0.5">{sub}</p>
    </div>
  );
}
