import type { Profile } from './types';
import { borrowingCapacity, livingCosts, position, project, propertyStats, type Quotes } from './calc';
import { money } from './format';

export type InsightKind = 'opportunity' | 'watch' | 'milestone' | 'goal';
export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  figure?: string;
  figureLabel?: string;
  action?: { label: string; to: string };
  ask?: 'broker' | 'adviser' | 'accountant';
}

/**
 * Wise: rule-based observations over the user's own numbers. Every insight is arithmetic on
 * their data plus a general idea. Anything that touches loans, shares or super is framed as a
 * question to take to a licensed professional rather than a recommendation.
 */
export function wiseInsights(p: Profile, quotes: Quotes): Insight[] {
  const out: Insight[] = [];
  const pos = position(p, quotes);
  const a = p.assumptions;
  const year = new Date().getFullYear();

  // 1. Retirement goal
  const proj = project(p, quotes);
  const atRetire = proj.points.find((x) => x.year === proj.retireYear) ?? proj.points[proj.points.length - 1];
  if (atRetire) {
    const gap = atRetire.passiveIncomeReal - p.goals.passiveIncome;
    const onTrack = gap >= 0;
    out.push({
      id: 'goal', kind: 'goal',
      title: onTrack ? `On track for ${money(p.goals.passiveIncome, { compact: true })} a year at ${p.goals.retirementAge}` : `Your plan falls short of your ${money(p.goals.passiveIncome, { compact: true })} income goal`,
      body: onTrack
        ? `At current assumptions you'd have about ${money(atRetire.passiveIncomeReal, { compact: true })} a year in today's dollars from rent, shares and super. That's ${money(gap, { compact: true })} of headroom.`
        : `At current assumptions you'd reach about ${money(atRetire.passiveIncomeReal, { compact: true })} a year in today's dollars. Closing a ${money(-gap, { compact: true })} gap usually means one more growth asset, more years of contributions, or lower debt by retirement. Try them in the plan to see which moves the number most.`,
      figure: money(atRetire.passiveIncomeReal, { compact: true }), figureLabel: 'projected passive income',
      action: { label: 'Open the plan', to: 'plan' },
    });
  }

  // 2. Next purchase from equity
  const nextDeposit = a.newPurchasePrice * 0.25;
  const available = pos.usable + Math.max(0, pos.cash - (p.finances.buffer ?? 0));
  if (p.properties.length < p.goals.targetProperties) {
    if (available >= nextDeposit && pos.bc.capacity >= a.newPurchasePrice * 0.8) {
      out.push({
        id: 'next-buy', kind: 'opportunity',
        title: 'Your equity could fund your next deposit',
        body: `You have about ${money(pos.usable, { compact: true })} of usable equity at ${a.lvr}% LVR. A ${money(a.newPurchasePrice, { compact: true })} purchase needs roughly ${money(nextDeposit, { compact: true })} for deposit and costs, and your estimated borrowing capacity of ${money(pos.bc.capacity, { compact: true })} looks like it could cover the loan. A broker can confirm what a lender would actually approve.`,
        figure: money(available, { compact: true }), figureLabel: 'available for a deposit', ask: 'broker',
      });
    } else if (proj.purchases[0]) {
      out.push({
        id: 'next-buy', kind: 'goal',
        title: `Next purchase looks possible around ${proj.purchases[0].year}`,
        body: `You need about ${money(nextDeposit, { compact: true })} for a deposit and costs on a ${money(a.newPurchasePrice, { compact: true })} property. With projected growth and savings, your equity and cash should cover that around ${proj.purchases[0].year}.`,
        figure: money(nextDeposit - available, { compact: true }), figureLabel: 'still to build', action: { label: 'See the timeline', to: 'plan' },
      });
    }
  }

  // 3. Ageing property → renovation idea
  for (const pr of p.properties) {
    if (!pr.yearBuilt) continue;
    const age = year - pr.yearBuilt;
    if (age >= 15) {
      const s = propertyStats(pr, a.lvr);
      out.push({
        id: `reno-${pr.id}`, kind: 'opportunity',
        title: `${pr.address} is ${age} years old, a renovation could add equity`,
        body: pr.use === 'investment'
          ? `Older properties often respond well to a cosmetic refresh (paint, flooring, lighting, fixtures). It can lift both the value and the rent, and some costs may be deductible or depreciable. An accountant can confirm what applies.`
          : `A targeted kitchen or bathroom update on an older home can lift its value and your usable equity. Run the numbers before committing, so you don't over-capitalise for the street.`,
        figure: money(s.val.value, { compact: true }), figureLabel: 'current estimate', action: { label: 'Try the renovator', to: 'renovate' },
        ask: pr.use === 'investment' ? 'accountant' : undefined,
      });
      break;
    }
  }

  // 4. Rate review
  for (const pr of p.properties) {
    for (const l of pr.loans) {
      if (l.rate && l.balance && l.rate > a.newLoanRate + 0.25) {
        const saving = (l.balance * (l.rate - a.newLoanRate)) / 100;
        out.push({
          id: `rate-${l.id}`, kind: 'watch',
          title: `The rate on ${pr.address} is above new-loan rates`,
          body: `You're paying ${l.rate.toFixed(2)}% with ${l.lender || 'your lender'}, against about ${a.newLoanRate.toFixed(2)}% assumed for new loans. On ${money(l.balance, { compact: true })} that difference is roughly ${money(saving)} a year. That's worth raising with your broker or lender.`,
          figure: money(saving, { compact: true }), figureLabel: 'a year in interest', ask: 'broker',
        });
        break;
      }
    }
  }

  // 5. Credit card limits vs borrowing capacity
  const limit = p.finances.debts.filter((d) => d.kind === 'credit-card').reduce((s, d) => s + (d.limit ?? 0), 0);
  if (limit >= 8000) {
    const cut = limit - 2000;
    const gain = borrowingCapacity(p, { cardLimitCut: cut }).capacity - pos.bc.capacity;
    if (gain > 10000) out.push({
      id: 'cards', kind: 'opportunity',
      title: 'Credit card limits are reducing your borrowing power',
      body: `Lenders count the full ${money(limit)} limit as if it were used, whatever the balance. Cutting it to ${money(2000)} would lift your estimated borrowing capacity by about ${money(gain, { compact: true })}.`,
      figure: money(gain, { compact: true }), figureLabel: 'extra borrowing capacity',
    });
  }

  // 6. Cash outside offset
  const home = p.properties.find((pr) => pr.use === 'home' && pr.loans.some((l) => l.type === 'pi'));
  const spare = (p.finances.cash ?? 0) - (home?.loans[0]?.offset ?? 0);
  if (home && home.loans[0]?.rate && spare > 10000 && !p.finances.offsetIsCash) {
    const save = (spare * home.loans[0].rate) / 100;
    out.push({
      id: 'offset', kind: 'opportunity', title: 'Cash outside your offset is costing interest',
      body: `Moving ${money(spare, { compact: true })} into the offset on ${home.address} would save about ${money(save)} a year in interest, and you can still get to it.`,
      figure: money(save, { compact: true }), figureLabel: 'a year saved',
    });
  }

  // 7. Buffer
  const living = Math.max(livingCosts(p), 1);
  const months = (p.finances.cash ?? 0) / living;
  if (months < 3) out.push({
    id: 'buffer', kind: 'watch', title: `Your cash buffer covers ${months.toFixed(1)} months`,
    body: 'Most investors keep 3–6 months of living costs, plus a holding-cost reserve for each investment property, so a vacancy or rate rise doesn’t force a sale.',
    figure: `${months.toFixed(1)} mo`, figureLabel: 'of living costs',
  });

  // 8. Concentration
  const top = [...pos.shares.rows].sort((x, y) => y.value - x.value)[0];
  if (top && pos.shares.value > 0 && top.value / pos.shares.value > 0.35 && top.h.kind !== 'etf') out.push({
    id: 'conc', kind: 'watch', title: `${top.h.code} is ${Math.round((top.value / pos.shares.value) * 100)}% of your share portfolio`,
    body: 'A single company that large makes your portfolio swing with one result. This is general information only. An adviser can look at it against your full situation.',
    ask: 'adviser',
  });

  // 9. Milestones
  const marks = [5e6, 3e6, 2e6, 1e6, 5e5];
  const hit = marks.find((m) => pos.netWorth >= m);
  if (hit) out.push({
    id: 'nw', kind: 'milestone', title: `You've passed ${money(hit, { compact: true })} in net worth`,
    body: `Your property equity, shares, super and cash add up to ${money(pos.netWorth, { compact: true })} after debts.`,
    figure: money(pos.netWorth, { compact: true }), figureLabel: 'net worth',
  });

  return out;
}

/* Facts for Wise's AI write-up. Figures are rounded so small price moves don't trigger a new write-up. */
export function wiseFacts(p: Profile, quotes: Quotes, insights: Insight[]) {
  const pos = position(p, quotes);
  const proj = project(p, quotes);
  const r = (v: number, to = 1000) => Math.round(v / to) * to;
  const year = new Date().getFullYear();
  const atRetire = proj.points.find((x) => x.year === proj.retireYear) ?? proj.points[proj.points.length - 1];
  return {
    household: { age: p.household.you.age, partner: p.household.hasPartner, dependants: p.household.dependants.length, state: p.household.state },
    goal: { stopWorkAge: p.goals.retirementAge, incomeWantedTodayDollars: p.goals.passiveIncome, propertiesWanted: p.goals.targetProperties },
    today: {
      netWorth: r(pos.netWorth, 5000), usableEquity: r(pos.usable, 5000), borrowingCapacity: r(pos.bc.capacity, 10000), leftOverEachMonth: r(pos.monthlySurplus, 100),
      cash: r(pos.cash), super: r(pos.superBal, 5000), sharesValue: r(pos.shares.value, 5000),
      properties: pos.props.map(({ pr, s }) => ({ suburb: `${pr.suburb} ${pr.state}`, use: pr.use, value: r(s.val.value, 5000), equity: r(s.equity, 5000), ageYears: pr.yearBuilt ? year - pr.yearBuilt : null, cashflowPerYear: r(s.cashflow, 100) })),
    },
    projection: { incomeAtStopWorkTodayDollars: r(atRetire?.passiveIncomeReal ?? 0), gapToGoal: r((atRetire?.passiveIncomeReal ?? 0) - p.goals.passiveIncome), nextPurchaseYear: proj.purchases[0]?.year ?? null },
    observations: insights.map((i) => i.title),
  };
}
