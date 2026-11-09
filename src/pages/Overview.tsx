import { useState, useMemo } from 'react';
import { useApp, useNavIntent } from '../lib/store';
import { project, position } from '../lib/calc';
import { money } from '../lib/format';
import type { Quotes } from '../lib/calc';
import { CashFlowChart, CashFlowKey, MarkerKey, SeriesToggles, WealthChart, toReal } from '../components/Charts';
import { Icon, Segmented } from '../components/ui';
import { ChartToolbar } from '../components/ChartControls';
import { NewsPanel, WisePanel } from '../components/Assistants';
import { RateWatch } from '../components/RateWatch';
import { InflationUpdate } from '../components/InflationUpdate';
import { reviewDue } from '../lib/actions';

export function Overview({ quotes, go }: { quotes: Quotes; go: (r: string) => void }) {
  const p = useApp((s) => s.profile)!;
  const pos = useMemo(() => position(p, quotes), [p, quotes]);
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const life = p.goals.lifeExpectancy ?? 90;
  const atRetire = proj.points.find((x) => x.year === proj.retireYear);
  const span = Math.max(1, life - p.goals.retirementAge);
  const progress = proj.runsOutAge == null ? 1 : Math.max(0, Math.min(1, (proj.runsOutAge - p.goals.retirementAge) / span));
  const [dollars, setDollars] = useState<'real' | 'nominal'>('real');
  const [hidden, setHidden] = useState<string[]>([]);
  const [view, setView] = useState<'worth' | 'flow'>('worth');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted">{greet}, {p.household.you.name || 'there'}</p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Here’s where you stand</h1>
        </div>
        <button className="group inline-flex items-center gap-2 rounded-xl border border-brass/60 bg-brass/10 px-4 py-2.5 text-sm font-semibold text-brass transition-all hover:bg-brass/20 hover:shadow-[0_4px_16px_-6px_rgb(var(--brass)/0.6)]"
          onClick={() => { useNavIntent.getState().set({ planTab: 'projections' }); go('plan'); }}>
          <Icon name="spark" className="h-4 w-4 transition-transform group-hover:rotate-45" />Create your Wise Future
        </button>
      </div>

      <RateWatch />
      <InflationUpdate />
      {reviewDue(p) && (
        <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-brass/15 p-4 ring-1 ring-brass/50">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass text-ground"><Icon name="calendar" className="h-5 w-5" /></span>
          <div className="min-w-[13rem] flex-1"><p className="font-semibold">It’s time for your yearly Wise review</p><p className="text-sm text-muted">Check your plan still fits, then update any automatic payments in Wise Actions.</p></div>
          <button className="btn-primary" onClick={() => go('actions')}>Open Wise Actions</button>
        </section>
      )}

      <section className="panel overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div>
              <p className="text-sm text-muted">{p.household.hasPartner ? 'Your combined net worth' : 'Your current net worth'}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{money(pos.netWorth)}</p><Segmented size="xs" label="Chart" value={view} onChange={setView} options={[{ value: 'worth', label: 'Net worth' }, { value: 'flow', label: 'Cash flow' }]} /></div>
              <p className="mt-1 text-sm text-muted">{money(pos.assets, { compact: true })} in assets, {money(pos.liabilities, { compact: true })} owing</p>
            </div>
            <ChartToolbar dollars={dollars} setDollars={setDollars} series={view === 'worth' ? <SeriesToggles hidden={hidden} onChange={setHidden} crypto={proj.points.some((x) => x.crypto > 0)} /> : null} />
            </div>
            {view === 'worth' ? (<>
              <div className="mt-4 -ml-2"><WealthChart points={dollars === 'real' ? toReal(proj.points, p.assumptions.inflation) : proj.points} retireYear={proj.retireYear} real={dollars === 'real'} hidden={hidden} runsOutYear={proj.runsOutAge != null ? proj.retireYear + (proj.runsOutAge - p.goals.retirementAge) : null} /></div>
              <MarkerKey points={proj.points} />
            </>) : (<>
              <div className="mt-4 -ml-2"><CashFlowChart points={dollars === 'real' ? toReal(proj.points, p.assumptions.inflation) : proj.points} retireYear={proj.retireYear} real={dollars === 'real'} /></div>
              <CashFlowKey />
            </>)}
            <p className="mt-2 text-xs text-muted">Projected to age {p.goals.lifeExpectancy ?? 90}, using your plan’s assumptions.</p>
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-1 lg:border-l lg:border-t-0">
            <Kpi label="Usable equity today" value={money(pos.usable, { compact: true })} sub={`at ${p.assumptions.lvr}% LVR`} />
            <Kpi label="Borrowing capacity today" value={money(pos.bc.capacity, { compact: true })} sub="estimate, before a lender checks" />
            <Kpi label="Left over cash each month" value={money(pos.monthlySurplus)} sub="after living costs and all repayments" wide />
            <div className="col-span-2 border-t-4 border-line bg-raised px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted lg:col-span-1">At retirement</div>
            {atRetire && <Kpi label={`${p.household.hasPartner ? 'Combined net worth' : 'Net worth'} at retirement (${p.goals.retirementAge})`} value={money(atRetire.netWorth / Math.pow(1 + p.assumptions.inflation / 100, atRetire.year - proj.points[0].year), { compact: true })} sub={`in today’s money · ${money(atRetire.netWorth, { compact: true })} in ${atRetire.year} dollars`} accent />}
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

function Kpi({ label, value, sub, accent, wide }: { label: string; value: string; sub: string; accent?: boolean; wide?: boolean }) {
  return (
    <div className={`bg-surface p-5 ${wide ? 'col-span-2 lg:col-span-1' : ''}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-display text-2xl font-semibold mt-0.5 ${accent ? 'text-gum' : ''}`}>{value}</p>
      <p className="text-xs text-muted mt-0.5">{sub}</p>
    </div>
  );
}
