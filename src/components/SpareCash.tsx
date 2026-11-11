import { useMemo } from 'react';
import { project, recommendedBuffer, retireCashMin, type Quotes } from '../lib/calc';
import { listJoin, money } from '../lib/format';
import { usePlanProfile, usePlanUpdate } from '../lib/planContext';
import type { Profile } from '../lib/types';
import { Field, MoneyInput } from './ui';

type Choice = 'keep' | 'invest';
/** Two-way choice that wraps its labels on narrow screens. */
function Pick({ label, value, onChange, options }: { label: string; value: Choice; onChange: (v: Choice) => void; options: { value: Choice; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-raised p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium leading-snug transition-colors ${value === o.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}>{o.label}</button>
      ))}
    </div>
  );
}
/** "All your loans are paid off by 2048." or "Loans paid off: A and B in 2041, C in 2048." */
function loansLine(paid: { year: number; name: string }[], all: boolean) {
  if (!paid.length) return null;
  const years = [...new Set(paid.map((x) => x.year))].sort((a, b) => a - b);
  const groups = years.map((y) => `${listJoin(paid.filter((x) => x.year === y).map((x) => x.name))} in ${y}`);
  if (all && years.length === 1) return <> All your loans are paid off in <strong>{years[0]}</strong>.</>;
  if (paid.length === 1) return <> The {paid[0].name} loan is paid off in {paid[0].year}.</>;
  return <> {all ? 'All your loans are paid off by' : 'Loans paid off:'} {all ? <><strong>{years[years.length - 1]}</strong> ({groups.join('; ')})</> : groups.join('; ')}.</>;
}
const withGoals = (p: Profile, g: Partial<Profile['goals']>): Profile => ({ ...p, goals: { ...p.goals, ...g } });

/**
 * Spare cash (Shares tab). Once every property is bought, cash keeps building. By default it stays in the bank;
 * two rules can move the extra into shares: one while working (after the last purchase), one once retired.
 * Each card shows the figures from the projection with and without its rule.
 */
export function SpareCash({ quotes, onGoals }: { quotes: Quotes; onGoals: () => void }) {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  const g = p.goals;
  const inf = (i: number) => Math.pow(1 + p.assumptions.inflation / 100, i);
  const keepMin = g.retireCash ?? retireCashMin(p);
  const buffer = p.finances.buffer || recommendedBuffer(p);

  const f = useMemo(() => {
    const cur = project(p, quotes);
    const noWork = project(withGoals(p, { spareCashAbove: null }), quotes); // without the working rule (retirement rule as set)
    const noRetire = g.spareCashRetired ? project(withGoals(p, { spareCashRetired: false }), quotes) : cur;
    const yesRetire = g.spareCashRetired ? cur : project(withGoals(p, { spareCashRetired: true }), quotes);
    const ri = Math.max(1, cur.points.findIndex((x) => x.year === cur.retireYear));
    const before = noWork.points[ri - 1];
    const owned = p.properties.length;
    const planned = Math.max(0, g.targetProperties - owned);
    const lastBuy = planned > 0 ? noWork.purchases[planned - 1] ?? null : null;
    const lastName = planned > 0 ? (p.plannedPurchases ?? [])[planned - 1]?.label || `Property ${g.targetProperties}` : '';
    const paid = noWork.loansPaid.filter((x) => x.year <= cur.retireYear);
    const later = noWork.loansPaid.filter((x) => x.year > cur.retireYear); // cleared from savings or super after work stops
    const fromYear = lastBuy?.year ?? noWork.points[0].year;
    const owingAfterBuy = noWork.points.slice(0, ri).some((x) => x.year >= fromYear && x.propertyDebt > 1000);
    const soldAtRetire = noWork.sales.filter((x) => x.year === cur.retireYear && x.reason === 'loan').map((x) => x.name);
    const moved = cur.points.slice(0, ri).reduce((t, x, i) => t + x.spareToShares / inf(i), 0);
    const sharesAt = (r: typeof cur) => r.sharesAtRetire / inf(ri);
    const retired = noRetire.points.slice(ri).map((x, k) => ({ year: x.year, v: x.cash / inf(ri + k) }));
    const peak = retired.reduce((m, x) => (x.v > m.v ? x : m), { year: 0, v: 0 });
    const endOf = (r: typeof cur) => Math.max(0, r.points[r.points.length - 1].netWorth) / inf(r.points.length - 1);
    return {
      cur, ri, owned, planned, lastBuy, lastName, paid, later, owingAfterBuy, soldAtRetire, moved, peak,
      cashBefore: before ? before.cash / inf(ri - 1) : 0,
      sharesWith: sharesAt(cur), sharesWithout: sharesAt(noWork),
      endKeep: endOf(noRetire), endInvest: endOf(yesRetire), lastsKeep: noRetire.runsOutAge, lastsInvest: yesRetire.runsOutAge,
    };
  }, [p, quotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const allBought = f.planned === 0 || !!f.lastBuy;
  const work: Choice = g.spareCashAbove != null ? 'invest' : 'keep';
  const ret: Choice = g.spareCashRetired ? 'invest' : 'keep';
  const life = g.lifeExpectancy ?? 90;
  const stopAge = g.retirementAge;

  return (
    <section id="spare-cash" className="panel scroll-mt-4 p-5 sm:p-6 xl:col-span-2">
      <h2 className="font-display text-xl font-semibold">Your spare cash</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">Once your properties are bought, cash keeps building in the bank. It stays there unless you choose to invest the extra in shares.{f.cur.shareMonthly > 0 ? ` Your ${money(f.cur.shareMonthly)} a month share investment carries on either way.` : ''}</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* 1. After the last purchase, while still working */}
        <div className="min-w-0 rounded-xl p-4 ring-1 ring-line sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brass">Step 1</p>
          <h3 className="font-display text-lg font-semibold">After your last property</h3>
          <div className="mt-2 space-y-1.5 text-sm leading-relaxed">
            <p>{f.planned === 0
              ? 'You’ve already bought every property in your plan.'
              : f.lastBuy
                ? <>You buy your last property, {f.lastName}, in <strong>{f.lastBuy.year}</strong>.</>
                : <>{f.lastName} doesn’t fit before you stop work yet, so this step only starts once it’s bought.</>}
              {loansLine(f.paid, f.soldAtRetire.length + f.later.length === 0)}
              {f.soldAtRetire.length > 0 && <> {listJoin(f.soldAtRetire)} {f.soldAtRetire.length === 1 ? 'isn’t' : 'aren’t'} set to be paid off, so {f.soldAtRetire.length === 1 ? 'it’s' : 'they’re'} sold when you stop work.</>}
              {f.later.map((x) => <span key={x.name}> The rest of the {x.name} loan is paid from savings and super by {x.year}.</span>)}
            </p>
            {allBought && <p>Left in the bank, your cash reaches about <strong>{money(f.cashBefore, { compact: true })}</strong> by {f.cur.retireYear - 1} (in today’s money).</p>}
          </div>
          <div className="mt-4">
            <Pick label="After your last property" value={work} onChange={(v) => update((d) => { d.goals.spareCashAbove = v === 'invest' ? keepMin : null; })}
              options={[{ value: 'keep', label: 'Keep it in the bank' }, { value: 'invest', label: 'Invest the extra' }]} />
          </div>
          {work === 'invest' && (
            <div className="mt-4 space-y-3">
              <div className="max-w-xs"><Field label="Keep this much in the bank" hint={`Anything over this goes into shares (in today’s money). It never drops below your ${money(buffer)} emergency fund.`}>{(id) => <MoneyInput id={id} value={g.spareCashAbove ?? null} onChange={(v) => update((d) => { d.goals.spareCashAbove = v ?? 0; })} />}</Field></div>
              {f.owingAfterBuy && <p className="text-xs text-muted">Cash in your offset accounts stays there until those loans are paid off, so only cash beyond that is invested.</p>}
              <p className="rounded-lg bg-gum/10 px-3 py-2 text-sm ring-1 ring-gum/30">{f.moved > 1000
                ? <>About <strong>{money(f.moved, { compact: true })}</strong> goes into shares by {stopAge}, so your shares reach about <strong>{money(f.sharesWith, { compact: true })}</strong> instead of {money(f.sharesWithout, { compact: true })} (in today’s money).</>
                : !allBought ? 'Nothing extra goes into shares until your last property is bought.'
                  : f.owingAfterBuy ? 'On these numbers, your offset accounts need all your cash while your loans are owing, so nothing extra goes into shares before you stop work.'
                    : 'On these numbers, your cash doesn’t pass this amount before you stop work, so nothing extra goes into shares.'}</p>
            </div>
          )}
        </div>

        {/* 2. Once retired */}
        <div className="min-w-0 rounded-xl p-4 ring-1 ring-line sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brass">Step 2</p>
          <h3 className="font-display text-lg font-semibold">Once you stop work</h3>
          <div className="mt-2 space-y-1.5 text-sm leading-relaxed">
            <p>You stop work at {stopAge}. You want to keep at least <strong>{money(keepMin)}</strong> in the bank (in today’s money).{' '}
              <button className="font-medium text-brass hover:underline" onClick={onGoals}>Change it in Goals</button></p>
            {f.peak.v > keepMin * 1.2 && <p>Left in the bank, your cash reaches about <strong>{money(f.peak.v, { compact: true })}</strong> by {f.peak.year} (in today’s money).</p>}
          </div>
          <div className="mt-4">
            <Pick label="Once you stop work" value={ret} onChange={(v) => update((d) => { d.goals.spareCashRetired = v === 'invest'; })}
              options={[{ value: 'keep', label: 'Keep it in the bank' }, { value: 'invest', label: `Invest anything over ${money(keepMin, { compact: true })}` }]} />
          </div>
          <p className="mt-4 rounded-lg bg-raised px-3 py-2 text-sm ring-1 ring-line">{
            f.lastsKeep !== f.lastsInvest
              ? (ret === 'invest'
                ? <>Investing the extra, your money lasts {f.lastsInvest == null ? `past ${life}` : `to ${f.lastsInvest}`}. Kept in the bank, it lasts {f.lastsKeep == null ? `past ${life}` : `to ${f.lastsKeep}`}.</>
                : <>Kept in the bank, your money lasts {f.lastsKeep == null ? `past ${life}` : `to ${f.lastsKeep}`}. Investing the extra, it lasts {f.lastsInvest == null ? `past ${life}` : `to ${f.lastsInvest}`}.</>)
              : Math.abs(f.endInvest - f.endKeep) < 10000
                ? 'Either way, you end up with about the same.'
                : ret === 'invest'
                  ? <>Investing the extra, you’d have about <strong>{money(f.endInvest, { compact: true })}</strong> at {life}, instead of {money(f.endKeep, { compact: true })} kept in the bank (in today’s money).</>
                  : <>Kept in the bank, you’d have about <strong>{money(f.endKeep, { compact: true })}</strong> at {life}. Investing the extra, it would be about {money(f.endInvest, { compact: true })} (in today’s money).</>
          }</p>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-muted">Shares can rise and fall, and selling them may mean paying capital gains tax. {p.cashPlan?.active ? 'Cash is assumed to earn the rates you set in Cash Reserves.' : 'Cash with no loan to offset is assumed to earn about 3.3% a year, the RBA’s average online savings rate.'} General information, not financial advice.</p>
    </section>
  );
}
