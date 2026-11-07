import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../lib/store';
import { position, project, propertyStats, requiredShareMonthly, type Quotes } from '../lib/calc';
import { goalAnalysis, wiseInsights } from '../lib/insights';
import { money } from '../lib/format';
import { plannedPurchase } from '../lib/defaults';
import { useCashRate } from '../lib/rates';
import type { Assumptions } from '../lib/types';
import { MiniLine, SeriesToggles, chartColors as C, WealthChart, toReal } from '../components/Charts';
import { DollarsNote, DollarsToggle, LiveToAge } from '../components/ChartControls';
import { useWiseTake } from '../components/Assistants';
import { Field, Icon, MoneyInput, NumInput, Segmented, Select } from '../components/ui';

type Tab = 'goals' | 'assumptions' | 'timeline' | 'shares' | 'projections';

export function Plan({ quotes }: { quotes: Quotes }) {
  const [tab, setTab] = useState<Tab>('goals');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-3xl font-semibold sm:text-4xl">Your plan</h1><p className="text-muted">Set where you want to end up, check the assumptions, and see how it plays out.</p></div>
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Plan section">
          <Segmented label="Plan section" value={tab === 'projections' ? ('' as Tab) : tab} onChange={setTab} options={[{ value: 'goals', label: 'Goals' }, { value: 'assumptions', label: 'Assumptions' }, { value: 'timeline', label: 'Property portfolio' }, { value: 'shares', label: 'Shares' }]} />
          <button role="tab" aria-selected={tab === 'projections'} onClick={() => setTab('projections')}
            className={`group inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${tab === 'projections'
              ? 'bg-brass text-ground shadow-[0_6px_20px_-6px_rgb(var(--brass)/0.7)] ring-2 ring-brass/40'
              : 'border border-brass/60 bg-brass/10 text-brass hover:bg-brass/20 hover:shadow-[0_4px_16px_-6px_rgb(var(--brass)/0.6)]'}`}>
            <Icon name="spark" className={`h-4 w-4 ${tab === 'projections' ? '' : 'transition-transform group-hover:rotate-45'}`} />Your Wise Future
          </button>
        </div>
      </div>
      {tab === 'goals' && <Goals quotes={quotes} />}
      {tab === 'assumptions' && <AssumptionsTab />}
      {tab === 'timeline' && <Timeline quotes={quotes} />}
      {tab === 'shares' && <SharesPlan quotes={quotes} />}
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
          <Field label="Properties owned by retirement" hint={`You own ${p.properties.length} now. Set prices in Property portfolio.`}>{(id) => <NumInput id={id} value={g.targetProperties} onChange={(v) => update((d) => { d.goals.targetProperties = v ?? 0; })} min={0} max={15} />}</Field>
          <Field label="Share portfolio by retirement" hint="In today’s money. Leave blank if you don’t have a target. Set the monthly amount in the Shares tab.">{(id) => <MoneyInput id={id} value={g.sharesTarget ?? null} onChange={(v) => update((d) => { d.goals.sharesTarget = v; })} />}</Field>
          <Field label="Yearly income after retirement" hint="What you want to live on each year once you stop working, in today’s money. The plan sells shares and properties if it needs to." className="sm:col-span-2">{(id) => <MoneyInput id={id} value={g.passiveIncome} onChange={(v) => update((d) => { d.goals.passiveIncome = v ?? 0; })} suffix="/ year" />}</Field>
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
          <div><h2 className="font-display text-xl font-semibold">Your property portfolio</h2><p className="text-sm text-muted">From what you own now to {p.goals.targetProperties} properties by {p.goals.retirementAge}. Change the target in Goals.</p></div>
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
                    <Field label="When">{(id) => <Select id={id} value={String(plan.notBefore ?? '')} onChange={(v) => set({ notBefore: v ? Number(v) : null })}
                      options={[{ value: '', label: 'As soon as possible' }, ...Array.from({ length: Math.max(1, p.goals.retirementAge - startAge) }, (_, j) => startYear + 1 + j).map((y) => ({ value: String(y), label: `Not before ${y}` }))]} />}</Field>
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

/* ---------- Shares plan ---------- */
function SharesPlan({ quotes }: { quotes: Quotes }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const pos = useMemo(() => position(p, quotes), [p, quotes]);
  const sharesNow = pos.shares.value - proj.cryptoExcluded;
  const required = requiredShareMonthly(p, sharesNow);
  const auto = p.goals.shareMonthly == null;
  const startAge = p.household.you.age ?? 35;
  const years = Math.max(1, p.goals.retirementAge - startAge);
  const atRetire = proj.points.find((x) => x.year === proj.retireYear);
  const realAtRetire = atRetire ? atRetire.shares / Math.pow(1 + p.assumptions.inflation / 100, years) : 0;
  const pts = proj.points.filter((x) => x.age <= p.goals.retirementAge).map((x, i) => ({ ...x, sharesReal: x.shares / Math.pow(1 + p.assumptions.inflation / 100, i) }));
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Your share plan</h2>
        <p className="mt-1 text-sm text-muted">Shares only. Crypto is tracked in its own tab but left out of the plan.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs text-muted">Shares today</p><p className="font-display text-2xl font-semibold">{money(sharesNow)}</p></div>
          <Field label="Share portfolio by retirement" hint="In today’s money. Also set in Goals.">{(id) => <MoneyInput id={id} value={p.goals.sharesTarget ?? null} onChange={(v) => update((d) => { d.goals.sharesTarget = v; })} />}</Field>
        </div>
        <div className="mt-6 rounded-xl bg-raised p-4 ring-1 ring-line">
          <p className="text-sm text-muted">To reach {money(p.goals.sharesTarget ?? 0, { compact: true })} by {p.goals.retirementAge} at {p.assumptions.shareReturn}% a year, you’d invest about</p>
          <p className="font-display text-3xl font-semibold">{money(required)} <span className="text-base font-normal text-muted">a month</span></p>
          <p className="text-xs text-muted">{money(required * 12)} a year in today’s money, rising with inflation, for {years} years.</p>
        </div>
        <div className="mt-6">
          <p className="field-label">How much will you invest?</p>
          <Segmented value={auto ? 'auto' : 'custom'} onChange={(v) => update((d) => { d.goals.shareMonthly = v === 'auto' ? null : Math.round(required); })} options={[{ value: 'auto', label: 'What’s needed for my goal' }, { value: 'custom', label: 'My own amount' }]} />
          {!auto && <div className="mt-3 max-w-xs"><MoneyInput value={p.goals.shareMonthly ?? null} onChange={(v) => update((d) => { d.goals.shareMonthly = v ?? 0; })} suffix="/ month" /></div>}
        </div>
        <p className={`mt-6 text-sm ${realAtRetire >= (p.goals.sharesTarget ?? 0) ? 'text-gum' : 'text-clay'}`}>
          At {money(proj.shareMonthly)} a month, your shares reach about {money(realAtRetire, { compact: true })} in today’s money by {p.goals.retirementAge}{p.goals.sharesTarget ? (realAtRetire >= p.goals.sharesTarget ? ', on target.' : `, short of your ${money(p.goals.sharesTarget, { compact: true })} goal.`) : '.'}
        </p>
        <p className="mt-2 text-xs text-muted">This money comes out of your savings before anything is set aside for property deposits, so a bigger share plan can push purchases later. Check Your Wise Future to see the trade-off.</p>
      </section>
      <section className="panel p-5 sm:p-6">
        <h3 className="font-display text-lg font-semibold">Shares to retirement, in today’s money</h3>
        <div className="mt-3 -ml-2"><MiniLine points={pts as any} retireYear={proj.retireYear} goal={p.goals.sharesTarget ?? undefined} series={[{ key: 'sharesReal' as any, label: 'Shares', color: C.shares }]} height={280} /></div>
      </section>
    </div>
  );
}

/* ---------- Your Wise Future ---------- */
const EVENT_STYLE: Record<string, { icon: string; cls: string }> = {
  buy: { icon: 'property', cls: 'bg-brass/15 text-brass' }, sell: { icon: 'arrow', cls: 'bg-sky/15 text-sky' }, debt: { icon: 'check', cls: 'bg-gum/15 text-gum' },
  kids: { icon: 'family', cls: 'bg-sage/20 text-sage' }, retire: { icon: 'spark', cls: 'bg-brass text-ground' }, super: { icon: 'plan', cls: 'bg-gum/15 text-gum' },
  shares: { icon: 'shares', cls: 'bg-sky/15 text-sky' }, runout: { icon: 'x', cls: 'bg-clay/15 text-clay' }, cost: { icon: 'details', cls: 'bg-line text-ink' }, goal: { icon: 'check', cls: 'bg-gum/15 text-gum' },
};

function Projections({ quotes }: { quotes: Quotes }) {
  const p = useApp((s) => s.profile)!;
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const [dollars, setDollars] = useState<'real' | 'nominal'>('real');
  const [hidden, setHidden] = useState<string[]>([]);
  const pts = proj.points;
  const runsOutYear = proj.runsOutAge != null ? proj.retireYear + (proj.runsOutAge - p.goals.retirementAge) : null;
  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-gum via-brass to-sky" />
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-display text-2xl font-semibold">Your Wise Future</h2>
              <p className={`text-sm font-medium ${proj.runsOutAge != null ? 'text-clay' : 'text-gum'}`}>{proj.runsOutAge != null ? `At ${money(p.goals.passiveIncome, { compact: true })} a year, your money runs out at ${proj.runsOutAge}.` : `At ${money(p.goals.passiveIncome, { compact: true })} a year, your money lasts to ${p.goals.lifeExpectancy ?? 90}.`}</p></div>
            <div className="flex flex-wrap items-center justify-end gap-3"><LiveToAge /><DollarsToggle value={dollars} onChange={setDollars} /></div>
          </div>
          <div className="mt-3 flex justify-end"><SeriesToggles hidden={hidden} onChange={setHidden} /></div>
          <p className="mt-2 text-xs text-muted"><DollarsNote value={dollars} />{proj.cryptoExcluded > 0 && ` Crypto (${money(proj.cryptoExcluded, { compact: true })} today) is left out because its future value can’t be estimated.`}</p>
          <div className="mt-4 -ml-2"><WealthChart points={dollars === 'real' ? toReal(pts, p.assumptions.inflation) : pts} retireYear={proj.retireYear} height={320} real={dollars === 'real'} hidden={hidden} runsOutYear={runsOutYear} /></div>
        </div>
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">What happens, year by year</h2>
        <p className="mt-1 text-sm text-muted">Worked out from your figures, goals and assumptions. Change any of them and this updates.</p>
        <ol className="mt-5 space-y-3">
          {proj.events.map((e, i) => {
            const st = EVENT_STYLE[e.kind] ?? EVENT_STYLE.goal;
            return (
              <li key={i} className="flex gap-4">
                <div className="w-20 shrink-0 text-right"><p className="font-display font-semibold">{e.year}</p><p className="text-xs text-muted">age {e.age}</p></div>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${st.cls}`}><Icon name={st.icon} className="h-4 w-4" /></span>
                <p className="pt-1 leading-relaxed">{e.text}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 text-[11px] text-muted">In retirement the plan pays your yearly income from rent first, then savings, then super (from 60), then by selling shares, then by selling investment properties newest first. Your home is kept. Sale figures allow for selling costs and capital gains tax at an estimated rate. Estimates only, not financial advice.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Spending in retirement" note="The income you want (dashed) against what your plan can actually pay, in today’s money. Before retirement it shows what your investments could pay.">
          <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'spendFundedReal', label: 'Can pay', color: C.equity }, { key: 'spendGoalReal', label: 'Your goal', color: C.brass, dash: true }]} />
        </ChartCard>
        <ChartCard title="Property value and debt" note="The gap between the lines is your property equity. Drops show properties being sold in retirement.">
          <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'propertyValue', label: 'Value', color: C.equity }, { key: 'propertyDebt', label: 'Debt', color: C.clay }]} />
        </ChartCard>
        <ChartCard title="Borrowing capacity" note="What a lender might lend you each year, tested at your new-loan rate plus 3%. It dips after each purchase.">
          <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'borrowing', label: 'Capacity', color: C.shares }]} />
        </ChartCard>
        <ChartCard title="Left over each month" note="Take-home pay and rent, minus living costs, dependants, repayments and your share plan. In retirement, rent minus your yearly spending.">
          <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'monthlySavings', label: 'Monthly surplus', color: C.brass }]} />
        </ChartCard>
        <ChartCard title="If rates move 2%" note="Yearly loan repayments at today’s rates, and if rates rise or fall by 2 percentage points." wide>
          <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'repayUp2', label: 'Rates +2%', color: C.clay, dash: true }, { key: 'repayBase', label: 'Current rates', color: C.ink }, { key: 'repayDown2', label: 'Rates −2%', color: C.equity, dash: true }]} />
        </ChartCard>
      </div>
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
