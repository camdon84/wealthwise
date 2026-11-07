import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../lib/store';
import { project, propertyStats, type Quotes } from '../lib/calc';
import { goalAnalysis, wiseInsights } from '../lib/insights';
import { money } from '../lib/format';
import { plannedPurchase } from '../lib/defaults';
import { useCashRate } from '../lib/rates';
import type { Assumptions } from '../lib/types';
import { MiniLine, SeriesToggles, chartColors as C, WealthChart, toReal } from '../components/Charts';
import { DollarsNote, DollarsToggle, LiveToAge } from '../components/ChartControls';
import { useWiseTake } from '../components/Assistants';
import { Field, Icon, MoneyInput, NumInput, Segmented } from '../components/ui';

type Tab = 'goals' | 'assumptions' | 'timeline' | 'projections';

export function Plan({ quotes }: { quotes: Quotes }) {
  const [tab, setTab] = useState<Tab>('goals');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-3xl font-semibold sm:text-4xl">Your plan</h1><p className="text-muted">Set where you want to end up, check the assumptions, and see how it plays out.</p></div>
        <Segmented label="Plan section" value={tab} onChange={setTab} options={[{ value: 'goals', label: 'Goals' }, { value: 'assumptions', label: 'Assumptions' }, { value: 'timeline', label: 'Property timeline' }, { value: 'projections', label: 'Projections' }]} />
      </div>
      {tab === 'goals' && <Goals quotes={quotes} />}
      {tab === 'assumptions' && <AssumptionsTab />}
      {tab === 'timeline' && <Timeline quotes={quotes} />}
      {tab === 'projections' && <Projections quotes={quotes} />}
    </div>
  );
}

/* ---------- Goals ---------- */
function Goals({ quotes }: { quotes: Quotes }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const g = p.goals;
  const ga = useMemo(() => goalAnalysis(p, quotes), [p, quotes]);
  const insights = useMemo(() => wiseInsights(p, quotes), [p, quotes]);
  const take = useWiseTake(p, quotes, insights, 'goals');
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">What you want</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Stop working at age">{(id) => <NumInput id={id} value={g.retirementAge} onChange={(v) => update((d) => { d.goals.retirementAge = v ?? 60; })} />}</Field>
          <Field label="Planning to live to">{(id) => <NumInput id={id} value={g.lifeExpectancy ?? 90} onChange={(v) => update((d) => { d.goals.lifeExpectancy = v ?? 90; })} />}</Field>
          <Field label="Properties owned by then" hint={`You own ${p.properties.length} now.`}>{(id) => <NumInput id={id} value={g.targetProperties} onChange={(v) => update((d) => { d.goals.targetProperties = v ?? 0; })} min={0} max={15} />}</Field>
          <Field label="Share portfolio by then" hint="In today’s money. Leave blank if you don’t have a target.">{(id) => <MoneyInput id={id} value={g.sharesTarget ?? null} onChange={(v) => update((d) => { d.goals.sharesTarget = v; })} />}</Field>
          <Field label="Yearly income without working" hint="In today’s money, before tax." className="sm:col-span-2">{(id) => <MoneyInput id={id} value={g.passiveIncome} onChange={(v) => update((d) => { d.goals.passiveIncome = v ?? 0; })} suffix="/ year" />}</Field>
        </div>
      </section>

      <section className="panel p-5 sm:p-6">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brass text-ground"><Icon name="spark" /></span><h2 className="font-display text-xl font-semibold">How your goals fit together</h2></div>
        <ul className="mt-5 space-y-3">
          {ga.lines.map((l, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${l.tone === 'good' ? 'bg-gum' : 'bg-clay'}`} aria-hidden="true" />
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
        {take && take !== 'loading' && (
          <div className="mt-5 rounded-xl bg-raised p-4 ring-1 ring-line">
            <p className="text-xs font-medium text-muted">Wise suggests</p>
            <p className="mt-1 leading-relaxed">{take.summary}</p>
            {take.ideas.length > 0 && <ul className="mt-2 space-y-1.5 text-sm">{take.ideas.map((i) => <li key={i.title}><span className="font-medium">{i.title}.</span> <span className="text-muted">{i.body}</span></li>)}</ul>}
          </div>
        )}
        {take === 'loading' && <div className="mt-5 space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-line" /><div className="h-3 w-full animate-pulse rounded bg-line" /></div>}
        <p className="mt-4 text-[11px] text-muted">Estimates from your figures and assumptions. General information, not financial advice.</p>
      </section>
    </div>
  );
}

/* ---------- Assumptions with recommended markers ---------- */
function AssumptionsTab() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const rba = useCashRate();
  const loanRec = rba ? Math.round((rba.current + 2) * 20) / 20 : 6.85;
  const rows: { key: keyof Assumptions; label: string; min: number; max: number; step: number; fmt: (v: number) => string; rec: number; note: string }[] = [
    { key: 'shareReturn', label: 'Share returns', min: 3, max: 12, step: 0.25, fmt: (v) => `${v}% a year`, rec: 8, note: 'The ASX 200 with dividends reinvested has returned about 8% a year over the last 20 years.' },
    { key: 'superReturn', label: 'Super returns', min: 3, max: 11, step: 0.25, fmt: (v) => `${v}% a year`, rec: 7, note: 'A common long-run planning figure for balanced super options, after fees.' },
    { key: 'inflation', label: 'Inflation', min: 1, max: 6, step: 0.25, fmt: (v) => `${v}% a year`, rec: 2.75, note: 'Australian inflation averaged about 2.75% a year over the last 20 years, and about 3% over the last 10.' },
    { key: 'newLoanRate', label: 'Interest rate on new loans', min: 4, max: 10, step: 0.05, fmt: (v) => `${v.toFixed(2)}%`, rec: loanRec, note: `The RBA cash rate is ${rba ? rba.current.toFixed(2) : '4.85'}%. Lenders’ variable rates usually sit about 2 percentage points above it.` },
    { key: 'rentGrowth', label: 'Rent growth', min: 0, max: 7, step: 0.25, fmt: (v) => `${v}% a year`, rec: 3, note: 'A common planning figure: roughly inflation plus a little, over the long run.' },
    { key: 'lvr', label: 'Borrow against equity up to', min: 60, max: 90, step: 5, fmt: (v) => `${v}% LVR`, rec: 80, note: 'Most lenders lend up to 80% of a property’s value without lenders mortgage insurance.' },
  ];
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Assumptions</h2>
      <p className="mt-1 text-sm text-muted">Each one has a recommended setting, marked on the slider, based on long-run averages. Tap the marker to use it.</p>
      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-2">
        {rows.map((r) => {
          const v = p.assumptions[r.key];
          const pos = ((r.rec - r.min) / (r.max - r.min)) * 100;
          const atRec = Math.abs(v - r.rec) < r.step / 2;
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-3"><label htmlFor={`as-${r.key}`} className="text-sm font-medium">{r.label}</label><span className="font-display text-lg font-semibold">{r.fmt(v)}</span></div>
              <div className="relative mt-2 pt-4">
                <button type="button" aria-label={`Use the recommended ${r.label.toLowerCase()}: ${r.fmt(r.rec)}`} title={`Recommended: ${r.fmt(r.rec)}`}
                  className="group absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: `${pos}%` }} onClick={() => update((d) => { d.assumptions[r.key] = r.rec; })}>
                  <span className={`h-3 w-3 rounded-full ring-2 ring-surface ${atRec ? 'bg-gum' : 'bg-gum/60 group-hover:bg-gum'}`} />
                </button>
                <input id={`as-${r.key}`} type="range" className="w-full" min={r.min} max={r.max} step={r.step} value={v} onChange={(e) => update((d) => { d.assumptions[r.key] = Number(e.target.value); })} />
              </div>
              <p className="mt-1 text-xs text-muted"><span className="font-medium text-gum">Recommended {r.fmt(r.rec)}.</span> {r.note}{!atRec && <> <button className="font-medium text-brass hover:underline" onClick={() => update((d) => { d.assumptions[r.key] = r.rec; })}>Use it</button></>}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-8 text-[11px] text-muted">Past returns don’t guarantee future ones. Sources: S&P/ASX 200 accumulation index, ABS consumer price index and the Reserve Bank of Australia’s cash rate.</p>
    </section>
  );
}

/* ---------- Property timeline ---------- */
function Timeline({ quotes }: { quotes: Quotes }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const need = Math.max(0, p.goals.targetProperties - p.properties.length);
  useEffect(() => {
    const have = p.plannedPurchases?.length ?? 0;
    if (have !== need) update((d) => {
      d.plannedPurchases ??= [];
      while (d.plannedPurchases.length < need) d.plannedPurchases.push(plannedPurchase(d.properties.length + d.plannedPurchases.length + 1, d.assumptions));
      d.plannedPurchases.length = need;
    });
  }, [need, p.plannedPurchases?.length, update]);
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const startYear = new Date().getFullYear();
  const startAge = p.household.you.age ?? 35;
  const plans = (p.plannedPurchases ?? []).slice(0, need);
  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-display text-xl font-semibold">Your property timeline</h2><p className="text-sm text-muted">From what you own now to {p.goals.targetProperties} properties by {p.goals.retirementAge}. Change the target in Goals.</p></div>
        </div>
        <ol className="relative mt-8 space-y-0 border-l-2 border-line pl-8">
          {p.properties.map((pr, i) => {
            const s = propertyStats(pr, p.assumptions.lvr);
            return (
              <li key={pr.id} className="relative pb-8">
                <span className="absolute -left-[41px] flex h-6 w-6 items-center justify-center rounded-full bg-gum text-[11px] font-semibold text-surface">{i + 1}</span>
                <p className="text-xs text-muted">Owned · bought {pr.purchaseDate ? pr.purchaseDate.slice(0, 4) : ''}</p>
                <p className="font-medium">{pr.address}, {pr.suburb}</p>
                <p className="text-sm text-muted">Worth about {money(s.val.value, { compact: true })} · {money(s.equity, { compact: true })} equity</p>
              </li>
            );
          })}
          {plans.map((plan, k) => {
            const bought = proj.purchases[k];
            const n = p.properties.length + k + 1;
            const set = (patch: Partial<typeof plan>) => update((d) => { Object.assign(d.plannedPurchases![k], patch); });
            const firstMissing = k === proj.purchases.length;
            return (
              <li key={plan.id} className="relative pb-8 last:pb-0">
                <span className={`absolute -left-[41px] flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${bought ? 'bg-brass text-ground' : 'border-2 border-dashed border-clay/60 bg-surface text-clay'}`}>{n}</span>
                <div className="rounded-xl border border-line bg-raised/50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-display text-lg font-semibold">Property {n}</p>
                    {bought
                      ? <p className="text-sm"><span className="font-semibold">{bought.year}</span> <span className="text-muted">· age {startAge + (bought.year - startYear)} · about {money(bought.price, { compact: true })} by then</span></p>
                      : <p className="text-sm font-medium text-clay">Doesn’t fit before {p.goals.retirementAge}</p>}
                  </div>
                  {!bought && firstMissing && proj.block && (
                    <p className="mt-1 text-sm text-muted">{proj.block.reason === 'servicing' ? `Held back by borrowing power: lenders would want about ${money(proj.block.monthlyShort, { compact: true })} a month more income. Try a cheaper price or a higher yield.` : proj.block.reason === 'deposit' ? `Needs about ${money(proj.block.deposit, { compact: true })} for the deposit and costs; you’d have ${money(proj.block.available, { compact: true })}.` : 'You’ve set it not to happen before a later year.'}</p>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Field label="Price in today’s money" className="lg:col-span-2">{(id) => <MoneyInput id={id} value={plan.price} onChange={(v) => set({ price: v ?? 0 })} />}</Field>
                    <Field label="Rental yield">{(id) => <NumInput id={id} value={plan.yieldPct} onChange={(v) => set({ yieldPct: v ?? 0 })} step={0.1} suffix="%" />}</Field>
                    <Field label="Price growth">{(id) => <NumInput id={id} value={plan.growth} onChange={(v) => set({ growth: v ?? 0 })} step={0.5} suffix="% / yr" />}</Field>
                    <Field label="Not before">{(id) => <NumInput id={id} value={plan.notBefore ?? null} onChange={(v) => set({ notBefore: v })} placeholder="Any year" />}</Field>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {need === 0 && <p className="mt-4 text-sm text-muted">You already own your target number of properties. Raise the target in Goals to plan the next one.</p>}
        <p className="mt-6 text-[11px] text-muted">A purchase happens in the first year your equity and savings cover a 20% deposit plus about 5% in costs, and estimated borrowing power covers the loan. The price grows at the rate you set until then.</p>
      </section>
    </div>
  );
}

/* ---------- Projections ---------- */
function Projections({ quotes }: { quotes: Quotes }) {
  const p = useApp((s) => s.profile)!;
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const [dollars, setDollars] = useState<'real' | 'nominal'>('real');
  const [hidden, setHidden] = useState<string[]>([]);
  const pts = proj.points;
  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Wealth over time</h2>
          <div className="flex flex-wrap items-center justify-end gap-3"><LiveToAge /><DollarsToggle value={dollars} onChange={setDollars} /></div></div>
        <div className="mt-3 flex justify-end"><SeriesToggles hidden={hidden} onChange={setHidden} /></div>
        <p className="mt-2 text-xs text-muted"><DollarsNote value={dollars} /></p>
        <div className="mt-4 -ml-2"><WealthChart points={dollars === 'real' ? toReal(pts, p.assumptions.inflation) : pts} retireYear={proj.retireYear} height={300} real={dollars === 'real'} hidden={hidden} /></div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Income without working" note="Rent after costs and interest, plus a 4% drawdown from shares (and super from 60), in today’s money.">
          <MiniLine points={pts} retireYear={proj.retireYear} goal={p.goals.passiveIncome} series={[{ key: 'passiveIncomeReal', label: 'Passive income', color: C.equity }]} />
        </ChartCard>
        <ChartCard title="Property value and debt" note="The gap between the lines is your property equity.">
          <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'propertyValue', label: 'Value', color: C.equity }, { key: 'propertyDebt', label: 'Debt', color: C.clay }]} />
        </ChartCard>
        <ChartCard title="Borrowing capacity" note="Estimated with a 3% buffer on every loan, as lenders assess. It dips after each purchase.">
          <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'borrowing', label: 'Capacity', color: C.shares }]} />
        </ChartCard>
        <ChartCard title="Left over each month" note="Take-home pay and rent, minus living costs, dependants and all repayments.">
          <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'monthlySavings', label: 'Monthly surplus', color: C.brass }]} />
        </ChartCard>
        <ChartCard title="If rates move 2%" note="Yearly loan repayments at today’s rates, and if rates rise or fall by 2 percentage points." wide>
          <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'repayUp2', label: 'Rates +2%', color: C.clay, dash: true }, { key: 'repayBase', label: 'Current rates', color: C.ink }, { key: 'repayDown2', label: 'Rates −2%', color: C.equity, dash: true }]} />
        </ChartCard>
      </div>
      <p className="text-xs text-muted">Projections are estimates from your inputs and assumptions. They aren’t guaranteed and aren’t financial advice.</p>
    </div>
  );
}

function ChartCard({ title, note, children, wide }: { title: string; note: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`panel p-5 ${wide ? 'lg:col-span-2' : ''}`}>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="text-xs text-muted">{note}</p>
      <div className="mt-3 -ml-2">{children}</div>
    </section>
  );
}
