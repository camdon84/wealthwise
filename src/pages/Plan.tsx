import { useState, useMemo, type ReactNode } from 'react';
import { useApp } from '../lib/store';
import { project, type Quotes } from '../lib/calc';
import { money } from '../lib/format';
import type { Assumptions } from '../lib/types';
import { MiniLine, SeriesToggles, chartColors as C, WealthChart, toReal } from '../components/Charts';
import { DollarsNote, DollarsToggle, LiveToAge } from '../components/ChartControls';

const SLIDERS: { key: keyof Assumptions; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: 'lvr', label: 'Borrow against equity up to', min: 60, max: 90, step: 5, fmt: (v) => `${v}% LVR` },
  { key: 'newPurchasePrice', label: 'Next purchase price', min: 300000, max: 1500000, step: 25000, fmt: (v) => money(v, { compact: true }) },
  { key: 'newPurchaseYield', label: 'Next purchase rental yield', min: 3, max: 8, step: 0.25, fmt: (v) => `${v}%` },
  { key: 'newLoanRate', label: 'Interest rate on new loans', min: 4, max: 9, step: 0.05, fmt: (v) => `${v.toFixed(2)}%` },
  { key: 'shareReturn', label: 'Share returns', min: 3, max: 11, step: 0.5, fmt: (v) => `${v}% a year` },
  { key: 'rentGrowth', label: 'Rent growth', min: 0, max: 6, step: 0.5, fmt: (v) => `${v}% a year` },
  { key: 'inflation', label: 'Inflation', min: 1, max: 5, step: 0.25, fmt: (v) => `${v}% a year` },
];

export function Plan({ quotes }: { quotes: Quotes }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const retire = proj.points.find((x) => x.year === proj.retireYear) ?? proj.points[proj.points.length - 1];
  const pts = proj.points;
  const [dollars, setDollars] = useState<'real' | 'nominal'>('real');
  const [hidden, setHidden] = useState<string[]>([]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Your plan</h1>
        <p className="text-muted">Change an assumption and every chart updates. Move the retirement age or property target in Profile.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="panel h-fit p-5 xl:sticky xl:top-20">
          <p className="font-medium">Assumptions</p>
          <div className="mt-4 space-y-5">
            {SLIDERS.map((s) => (
              <label key={s.key} className="block">
                <span className="flex justify-between text-sm"><span className="text-muted">{s.label}</span><span className="font-medium">{s.fmt(p.assumptions[s.key])}</span></span>
                <input type="range" className="mt-2 w-full" min={s.min} max={s.max} step={s.step} value={p.assumptions[s.key]} onChange={(e) => update((d) => { d.assumptions[s.key] = Number(e.target.value); })} />
              </label>
            ))}
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <p className="text-sm font-medium">At {p.goals.retirementAge} ({proj.retireYear})</p>
            <dl className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Net worth, today’s dollars</dt><dd>{money(retire.netWorth / Math.pow(1 + p.assumptions.inflation / 100, retire.year - pts[0].year), { compact: true })}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Properties</dt><dd>{retire.properties}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Income, today’s dollars</dt><dd>{money(retire.passiveIncomeReal, { compact: true })}</dd></div>
            </dl>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <section className="panel p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">Wealth over time</h2>
              <div className="flex flex-wrap items-center justify-end gap-3"><LiveToAge /><DollarsToggle value={dollars} onChange={setDollars} /></div></div>
            <div className="mt-3 flex justify-end">
              <SeriesToggles hidden={hidden} onChange={setHidden} /></div>
            <p className="mt-2 text-xs text-muted"><DollarsNote value={dollars} /></p>
            <div className="mt-4 -ml-2"><WealthChart points={dollars === 'real' ? toReal(pts, p.assumptions.inflation) : pts} retireYear={proj.retireYear} height={300} real={dollars === 'real'} hidden={hidden} /></div>
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="font-display text-xl font-semibold">Purchase timeline</h2>
            {proj.purchases.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{p.properties.length >= p.goals.targetProperties ? `You already own your target of ${p.goals.targetProperties} properties.` : 'No new purchases fit before retirement at these assumptions. Try a lower purchase price or a higher LVR.'}</p>
            ) : (
              <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {proj.purchases.map((x, i) => (
                  <li key={x.year} className="rounded-xl border border-line bg-raised/60 p-4">
                    <p className="text-xs text-muted">Property {p.properties.length + i + 1}</p>
                    <p className="font-display text-2xl font-semibold">{x.year}</p>
                    <p className="text-sm text-muted">around {money(x.price, { compact: true })} in that year’s prices, funded from equity and savings</p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Income without working" note="Rent after costs and interest, plus a 4% drawdown from shares (and super from 60), in today’s dollars.">
              <MiniLine points={pts} retireYear={proj.retireYear} goal={p.goals.passiveIncome} series={[{ key: 'passiveIncomeReal', label: 'Passive income', color: C.equity }]} />
            </ChartCard>
            <ChartCard title="Property value and debt" note="The gap between the lines is your property equity.">
              <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'propertyValue', label: 'Value', color: C.equity }, { key: 'propertyDebt', label: 'Debt', color: C.clay }]} />
            </ChartCard>
            <ChartCard title="Borrowing capacity" note="Estimated with a 3% buffer on every loan, as lenders assess. It dips after each purchase.">
              <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'borrowing', label: 'Capacity', color: C.shares }]} />
            </ChartCard>
            <ChartCard title="Left over each month" note="Take-home pay and rent, minus living costs and all repayments.">
              <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'monthlySavings', label: 'Monthly surplus', color: C.brass }]} />
            </ChartCard>
            <ChartCard title="If rates move 2%" note="Yearly loan repayments at today’s rates, and if rates rise or fall by 2 percentage points." wide>
              <MiniLine points={pts} retireYear={proj.retireYear} series={[{ key: 'repayUp2', label: 'Rates +2%', color: C.clay, dash: true }, { key: 'repayBase', label: 'Current rates', color: C.ink }, { key: 'repayDown2', label: 'Rates −2%', color: C.equity, dash: true }]} />
            </ChartCard>
          </div>
          <p className="text-xs text-muted">Projections are estimates from your inputs and the assumptions above. They aren’t guaranteed and aren’t financial advice.</p>
        </div>
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
