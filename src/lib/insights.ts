import type { InsightState, Profile } from './types';
import { borrowingCapacity, livingCosts, position, project, propertyStats, retireCashMin, type Quotes } from './calc';
import { money, nProps } from './format';

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
    const life = p.goals.lifeExpectancy ?? 90;
    const onTrack = proj.runsOutAge == null;
    const last = proj.points[proj.points.length - 1];
    const leftReal = last ? last.netWorth / Math.pow(1 + a.inflation / 100, proj.points.length - 1) : 0;
    out.push({
      id: 'goal', kind: 'goal',
      title: onTrack ? `${money(p.goals.passiveIncome, { compact: true })} a year from ${p.goals.retirementAge} looks affordable` : `At ${money(p.goals.passiveIncome, { compact: true })} a year, your money runs out at ${proj.runsOutAge}`,
      body: onTrack
        ? `Rent, savings, super and, if needed, selling shares and investment properties pay for it. Your money lasts past ${life}, with about ${money(Math.max(0, leftReal), { compact: true })} (in today’s money) to spare.`
        : `Even after selling shares and investment properties, the plan can’t keep paying ${money(p.goals.passiveIncome, { compact: true })} a year past ${proj.runsOutAge}. A lower yearly income or a bigger share plan would stretch it.`,
      figure: onTrack ? `${life}+` : `${proj.runsOutAge}`, figureLabel: onTrack ? 'money lasts past' : 'money runs out at age',
    });
  }

  // 1b. Room to spend more in retirement (snoozed for 12 months once they've adjusted it)
  if (proj.runsOutAge == null && !((p.insightState?.spendSnoozeUntil ?? 0) > Date.now())) {
    const more = affordableIncome(p, quotes);
    const cur = p.goals.passiveIncome;
    if (more != null && more >= cur * 1.1 && more - cur >= 10000) {
      out.push({
        id: 'spend-more', kind: 'opportunity',
        title: 'You look set for a comfortable retirement',
        body: `At ${money(cur, { compact: true })} a year from ${p.goals.retirementAge}, your plan still leaves a large nest egg at the end. You could live on up to about ${money(more, { compact: true })} a year and your money would still last past ${p.goals.lifeExpectancy ?? 90}. Consider raising your yearly income after retirement, or keep the extra as a safety margin.`,
        figure: money(more, { compact: true }), figureLabel: 'a year you could afford',
        action: { label: 'Adjust my retirement income', to: 'plan:goals' },
      });
    }
  }

  // 1c. Idle cash: the plan builds a big cash pile on the way to the next deposit
  if (!p.cashPlan?.active) {
    const buf = p.finances.buffer ?? 0;
    const ri = proj.points.findIndex((x) => x.year === proj.retireYear);
    const real = proj.points.slice(0, Math.max(0, ri)).map((x, i) => ({ year: x.year, v: x.cash / Math.pow(1 + a.inflation / 100, i) }));
    const pk = real.reduce((m, x) => (x.v > m.v ? x : m), { year: 0, v: 0 });
    if (pk.v > Math.max(150000, buf * 3)) out.push({
      id: 'idle-cash', kind: 'opportunity',
      title: 'Your plan builds up large cash reserves',
      body: `On the way to your next deposit you’d hold up to about ${money(pk.v, { compact: true })} in cash (in today’s money) around ${pk.year}. Cash Reserves helps you choose where it sits while it builds: offset, high-interest savings or a savings account.`,
      figure: money(pk.v, { compact: true }), figureLabel: `cash around ${pk.year}`,
      action: { label: 'Choose where your cash sits', to: 'plan:cash' },
    });
  }

  // 1d. Spare cash: once every property is bought (or once retired) cash keeps piling up, and no rule says what to do with it
  if (p.goals.spareCashAbove == null || !p.goals.spareCashRetired) {
    const real = proj.points.map((x, i) => ({ year: x.year, v: x.cash / Math.pow(1 + a.inflation / 100, i), retired: x.year >= proj.retireYear }));
    const allBought = p.properties.length + proj.purchases.length >= p.goals.targetProperties;
    const from = proj.purchases.length ? proj.purchases[proj.purchases.length - 1].year + 1 : year;
    const keep = p.goals.retireCash ?? retireCashMin(p);
    const pick = (xs: typeof real) => xs.reduce((m, x) => (x.v > m.v ? x : m), { year: 0, v: 0, retired: false });
    const work = p.goals.spareCashAbove == null && allBought ? pick(real.filter((x) => !x.retired && x.year >= from)) : null;
    const ret = !p.goals.spareCashRetired ? pick(real.filter((x) => x.retired)) : null;
    const pk = work && work.v > Math.max(250000, keep * 1.5) ? work : ret && ret.v > Math.max(250000, keep * 2) ? ret : null;
    if (pk) out.push({
      id: 'spare-cash', kind: 'opportunity',
      title: pk.retired ? 'Your cash keeps building in retirement' : 'Your cash keeps building after your last property',
      body: `Left in the bank, it reaches about ${money(pk.v, { compact: true })} (in today’s money) around ${pk.year}. You can keep it there, or invest anything over a set amount in shares.`,
      figure: money(pk.v, { compact: true }), figureLabel: `cash around ${pk.year}`,
      action: { label: 'Choose what happens to it', to: 'plan:shares' },
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
        body: available >= nextDeposit
          ? `You already have about ${money(available, { compact: true })} in equity and savings, enough for the deposit. What holds it back is borrowing power: on your income a lender would lend about ${money(pos.bc.capacity, { compact: true })} today. As your income grows and savings build, the loan you'd need shrinks to fit around ${proj.purchases[0].year}.`
          : `You need about ${money(nextDeposit, { compact: true })} for a deposit and costs on a ${money(a.newPurchasePrice, { compact: true })} property. With projected growth and savings, your equity and cash should cover that around ${proj.purchases[0].year}.`,
        figure: available >= nextDeposit ? money(pos.bc.capacity, { compact: true }) : money(nextDeposit - available, { compact: true }),
        figureLabel: available >= nextDeposit ? 'borrowing capacity today' : 'still to build', action: { label: 'See your property portfolio', to: 'plan' },
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
        title: `${pr.address} is ${age} years old: a renovation could add equity`,
        body: pr.use === 'investment'
          ? `Older properties often respond well to a cosmetic refresh (paint, flooring, lighting, fixtures). It can lift both the value and the rent, and some costs may be deductible or depreciable. An accountant can confirm what applies.`
          : `A targeted kitchen or bathroom update on an older home can lift its value and your usable equity. Run the numbers before committing, so you don't over-capitalise for the street.`,
        figure: money(s.val.value, { compact: true }), figureLabel: 'current estimate', action: { label: 'Try the renovator', to: 'renovate' },
        ask: pr.use === 'investment' ? 'accountant' : undefined,
      });
      break;
    }
  }

  // 3b. Loans with no interest rate entered
  const noRate = p.properties.find((pr) => pr.loans.some((l) => (l.balance ?? 0) > 0 && l.rate == null));
  if (noRate) out.push({
    id: 'no-rate', kind: 'watch', title: `Add the interest rate on ${noRate.address}`,
    body: 'There’s a loan with no rate, so the plan is assuming a typical variable rate. Your actual rate makes repayments, cash flow and borrowing power more accurate.',
    action: { label: 'Open properties', to: 'properties' },
  });

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
  const home = p.properties.find((pr) => pr.use === 'home' && pr.loans.some((l) => l.type === 'pi' && (l.balance ?? 0) > 0));
  const homeL = home?.loans.find((l) => l.type === 'pi' && (l.balance ?? 0) > 0);
  const inSavings = p.finances.cashSavings ?? 0;
  const movable = inSavings; // money in an offset stays available, so the whole amount can move
  if (home && homeL?.rate && movable > 5000) {
    const save = (movable * homeL.rate) / 100;
    out.push({
      id: 'offset', kind: 'opportunity', title: `${money(movable, { compact: true })} in normal savings could sit in your offset`,
      body: `Money in an offset reduces the interest on ${home.address} at ${homeL.rate.toFixed(2)}%, and you can still get to it. Moving it would save about ${money(save)} a year, and that saving isn’t taxed the way savings interest is.`,
      figure: money(save, { compact: true }), figureLabel: 'a year saved',
    });
  }

  // 6b. High-interest debts: savings and equity compared with what each debt costs
  const debts = p.finances.debts.filter((d) => d.kind !== 'hecs' && d.kind !== 'credit-card' && (d.balance ?? 0) > 0 && (d.rate ?? 0) > 0).sort((x, y) => (y.rate ?? 0) - (x.rate ?? 0));
  const homeLoan = p.properties.find((pr) => pr.use === 'home')?.loans.find((l) => l.rate);
  const homeRate = homeLoan?.rate ?? null;
  let spareCash = Math.max(0, (p.finances.cash ?? 0) - (p.finances.buffer ?? 0));
  const label = (d: (typeof debts)[number]) => ({ car: 'car loan', personal: 'personal loan', 'credit-card': 'credit card', other: 'loan' } as Record<string, string>)[d.kind] || 'loan';
  for (const d of debts) {
    const bal = d.balance ?? 0, rate = d.rate ?? 0;
    if (spareCash >= Math.min(bal, 1000)) {
      const pay = Math.min(bal, spareCash);
      spareCash -= pay;
      out.push({
        id: `pay-${d.id}`, kind: 'opportunity',
        title: `Your ${label(d)} costs ${rate.toFixed(1)}%. Your savings could clear ${pay >= bal ? 'it' : 'part of it'}`,
        body: `You have cash above your emergency buffer. Using ${money(pay, { compact: true })} of it on the ${label(d)} would save about ${money((pay * rate) / 100)} a year in interest, more than that cash earns${homeRate ? ` sitting in an offset at ${homeRate.toFixed(2)}%` : ' in savings'}. Highest-rate debts first usually saves the most.`,
        figure: money((pay * rate) / 100, { compact: true }), figureLabel: 'a year in interest',
      });
    } else if (homeRate && rate > homeRate + 3 && pos.usable > bal) {
      const save = (bal * (rate - homeRate)) / 100;
      out.push({
        id: `equity-${d.id}`, kind: 'opportunity',
        title: `Your ${label(d)} is at ${rate.toFixed(1)}%, against ${homeRate.toFixed(2)}% on your home loan`,
        body: `You have ${money(pos.usable, { compact: true })} of usable equity. Moving the ${money(bal, { compact: true })} balance onto the home loan would cut the interest by about ${money(save)} a year. Only if you then pay it off quickly, though: spread over 25+ years it can cost more in total. Worth raising with your broker.`,
        figure: money(save, { compact: true }), figureLabel: 'a year in interest', ask: 'broker',
      });
    }
  }
  if (p.finances.debts.some((d) => d.kind === 'hecs' && (d.balance ?? 0) > 0) && debts.length) out.push({
    id: 'hecs-order', kind: 'watch', title: 'Pay down interest-bearing debts before extra HECS repayments',
    body: 'HECS doesn’t charge interest, only yearly indexation, and repayments come out through the tax system. Extra money usually goes further on loans first.',
  });

  // 6c. Fixed rates ending soon
  for (const pr of p.properties) for (const l of pr.loans) {
    if (l.rateType !== 'fixed' || !l.fixedUntil) continue;
    const [y, m] = l.fixedUntil.split('-').map(Number);
    const months = (y - new Date().getFullYear()) * 12 + (m - 1 - new Date().getMonth());
    if (months >= 0 && months <= 6) out.push({
      id: `fixed-${l.id}`, kind: 'watch', title: `The fixed rate on ${pr.address} ends in ${months <= 1 ? 'about a month' : `${months} months`}`,
      body: `You’re fixed at ${(l.rate ?? 0).toFixed(2)}%. When it ends the loan usually rolls onto the lender’s variable rate, often higher than new-customer rates. A good time to compare options with your broker.`,
      figure: `${(l.rate ?? 0).toFixed(2)}%`, figureLabel: 'fixed rate now', ask: 'broker',
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

  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

/** Highest yearly retirement income (today's money, to the $5k below) that still lasts to life expectancy. */
export function affordableIncome(p: Profile, quotes: Quotes): number | null {
  const cur = p.goals.passiveIncome;
  if (!(cur > 0)) return null;
  const lasts = (inc: number) => project({ ...p, goals: { ...p.goals, passiveIncome: inc } }, quotes).runsOutAge == null;
  let lo = cur, hi = cur * 3;
  if (lasts(hi)) return Math.floor(hi / 5000) * 5000;
  for (let k = 0; k < 9 && hi - lo > 2500; k++) { const mid = (lo + hi) / 2; if (lasts(mid)) lo = mid; else hi = mid; }
  return Math.floor(lo / 5000) * 5000;
}

export const MAX_INSIGHTS = 10;
const SIX_MONTHS = 182 * 864e5;
export const insightKey = (i: Insight) => `${i.id}|${i.title}`;
const RANK: Record<InsightKind, number> = { goal: 0, opportunity: 1, watch: 2, milestone: 3 };

/**
 * Which insights to show, in order. Dismissed ones stay hidden for 6 months unless "Give me Wise Insights"
 * was pressed since. Order: ones not yet sent to the back of the queue, then by importance, then newest first.
 */
export function rankInsights(all: Insight[], st: InsightState | undefined, now = Date.now()) {
  const seen = st?.seen ?? {}, back = st?.back ?? {}, dis = st?.dismissed ?? {}, refreshed = st?.refreshedAt ?? 0;
  const live = all.filter((i) => { const d = dis[insightKey(i)]; return !(d && now - d < SIX_MONTHS && d > refreshed); });
  const sorted = [...live].sort((a, b) => (back[insightKey(a)] ?? 0) - (back[insightKey(b)] ?? 0) || RANK[a.kind] - RANK[b.kind] || (seen[insightKey(b)] ?? now) - (seen[insightKey(a)] ?? now));
  return { visible: sorted.slice(0, MAX_INSIGHTS), queued: Math.max(0, sorted.length - MAX_INSIGHTS), dismissed: all.length - live.length };
}

/**
 * The plan settings Wise needs so it doesn't suggest something they've already done: the share plan (and whether
 * it waits for a purchase) and each planned purchase with the year it fits.
 */
export function planSettings(p: Profile, proj: { purchases: { year: number }[]; shareMonthly: number }) {
  const owned = p.properties.length;
  const hold = p.goals.shareStartAfter ?? 0;
  return {
    sharePlan: {
      perMonthTodayDollars: Math.round(proj.shareMonthly / 50) * 50,
      ownAmount: p.goals.shareMonthly != null,
      alreadyOnHoldUntilPropertyNumber: hold > 0 ? owned + hold : null,
      startsInYear: hold > 0 ? proj.purchases[hold - 1]?.year ?? null : new Date().getFullYear(),
    },
    spareCash: {
      afterLastPurchase: p.goals.spareCashAbove != null ? `cash over $${Math.round(p.goals.spareCashAbove / 1000)}k is invested in shares` : 'kept in the bank',
      inRetirement: p.goals.spareCashRetired ? `cash over the retirement cash reserve is invested in shares` : 'kept in the bank',
    },
    bigPurchasesTodayDollars: p.goals.events.filter((ev) => ev.amount > 0).map((ev) => ({ what: ev.label || 'big purchase', year: ev.year, cost: Math.round(ev.amount / 1000) * 1000 })),
    plannedPurchases: (p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - owned)).map((pp, k) => ({
      name: pp.label || `Property ${owned + k + 1}`,
      priceTodayDollars: Math.round(pp.price / 5000) * 5000,
      wantedBefore: pp.buyBy ?? 'as soon as possible',
      earliestYearItFits: proj.purchases[k]?.year ?? null,
      interestOnlyFirst5Years: !!pp.ioFirst5,
      paidOffByRetirement: !!pp.payOff,
      use: pp.use === 'home' ? 'home to live in (no rent)' : 'investment',
    })),
  };
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
    wealthFocus: p.goals.wealthFocus ?? 'balanced',
    goal: { stopWorkAge: p.goals.retirementAge, stopWorkYear: proj.retireYear, incomeWantedTodayDollars: p.goals.passiveIncome, propertiesWanted: p.goals.targetProperties, sharePortfolioWantedTodayDollars: p.goals.sharesTarget ?? null },
    today: {
      netWorth: r(pos.netWorth, 5000), usableEquity: r(pos.usable, 5000), borrowingCapacity: r(pos.bc.capacity, 10000), leftOverEachMonth: r(pos.monthlySurplus, 100),
      cash: r(pos.cash), super: r(pos.superBal, 5000), sharesValue: r(pos.shares.value, 5000),
      properties: pos.props.map(({ pr, s }) => ({ suburb: `${pr.suburb} ${pr.state}`, use: pr.use, value: r(s.val.value, 5000), equity: r(s.equity, 5000), ageYears: pr.yearBuilt ? year - pr.yearBuilt : null, cashflowPerYear: r(s.cashflow, 100) })),
    },
    debts: p.finances.debts.filter((d) => d.kind !== 'credit-card' && (d.balance ?? 0) > 0).map((d) => ({ type: d.kind, owing: r(d.balance ?? 0, 100), ratePercent: d.kind === 'hecs' ? 'indexation only' : d.rate ?? null })),
    homeLoanRatePercent: p.properties.find((x) => x.use === 'home')?.loans[0]?.rate ?? null,
    spareCashAboveEmergencyBuffer: r(Math.max(0, (p.finances.cash ?? 0) - (p.finances.buffer ?? 0)), 500),
    ...planSettings(p, proj),
    projection: { yearlySpendGoalTodayDollars: r(p.goals.passiveIncome), moneyRunsOutAtAge: proj.runsOutAge, moneyLastsPastLifeExpectancy: proj.runsOutAge == null, plannedPurchaseYears: proj.purchases.map((x) => x.year), shareInvestmentPerMonth: r(proj.shareMonthly), cryptoExcludedFromProjection: r(proj.cryptoExcluded) },
    observations: insights.map((i) => i.title),
    goalChecks: goalAnalysisLines(p, quotes),
  };
}
const goalAnalysisLines = (p: Profile, quotes: Quotes) => { try { return goalAnalysis(p, quotes).lines.map((l) => l.text); } catch { return []; } };

/* ---------- Goals: do the targets fit together? ---------- */
export function goalAnalysis(p: Profile, quotes: Quotes) {
  const a = p.assumptions;
  const pos = position(p, quotes);
  const proj = project(p, quotes);
  const startAge = p.household.you.age ?? 35;
  const years = Math.max(1, p.goals.retirementAge - startAge);
  const atRetire = proj.points.find((x) => x.year === proj.retireYear) ?? proj.points[proj.points.length - 1];
  const deflate = Math.pow(1 + a.inflation / 100, years);
  const owned = p.properties.length;
  const projectedProps = owned + proj.purchases.filter((x) => x.year <= proj.retireYear).length;
  const sharesAtRetireReal = proj.sharesAtRetire / deflate;
  const target = p.goals.sharesTarget ?? 0;
  const requiredYearly = proj.requiredShareMonthly * 12;
  const spareYearly = Math.max(0, pos.monthlySurplus * 12);
  const lines: { tone: 'good' | 'warn'; text: string }[] = [];
  if (p.goals.targetProperties > owned) {
    if (projectedProps >= p.goals.targetProperties) lines.push({ tone: 'good', text: `You’re on track to own ${p.goals.targetProperties} ${p.goals.targetProperties === 1 ? 'property' : 'properties'} by ${p.goals.retirementAge}. Purchases land around ${proj.purchases.map((x) => x.year).join(', ')}.` });
    else if (proj.block?.reason === 'servicing') lines.push({ tone: 'warn', text: `You’d reach ${projectedProps} of your ${nProps(p.goals.targetProperties)} by ${p.goals.retirementAge}. The next one is held back by borrowing power: lenders would want to see about ${money(proj.block.monthlyShort, { compact: true })} a month more income than you’d have, or a cheaper property.` });
    else if (proj.block?.reason === 'deposit') lines.push({ tone: 'warn', text: `You’d reach ${projectedProps} of your ${nProps(p.goals.targetProperties)} by ${p.goals.retirementAge}. The next one needs about ${money(proj.block.deposit, { compact: true })} for a deposit, and you’d have ${money(proj.block.available, { compact: true })} in equity and savings.` });
  }
  // Could one more property fit before retirement?
  if (projectedProps >= p.goals.targetProperties && p.goals.targetProperties < 8) {
    const more = project({ ...p, goals: { ...p.goals, targetProperties: p.goals.targetProperties + 1 } }, quotes);
    const extra = more.purchases[proj.purchases.length];
    if (extra && extra.year <= proj.retireYear - 3) lines.push({ tone: 'good', text: `There looks to be room for one more. On these numbers you could also buy property ${p.goals.targetProperties + 1} around ${extra.year} at about ${money(extra.price, { compact: true })}. Raise your property goal on the Property Portfolio tab to add it.` });
  }
  if (target > 0) {
    if (sharesAtRetireReal >= target * 0.98) lines.push({ tone: 'good', text: `Investing ${money(proj.shareMonthly)} a month, your shares reach about ${money(sharesAtRetireReal, { compact: true })} (in today’s money) by ${p.goals.retirementAge}, meeting your ${money(target, { compact: true })} goal.` });
    else if (proj.requiredShareMonthly > proj.shareMonthly + 50) lines.push({ tone: 'warn', text: `To grow your shares to ${money(target, { compact: true })} by ${p.goals.retirementAge}, you’d invest about ${money(proj.requiredShareMonthly)} a month. At ${money(proj.shareMonthly)} a month you’d reach about ${money(sharesAtRetireReal, { compact: true })}.` });
    // The amount is right on paper, but savings can't always cover it or it waits for a purchase: say that, not "invest the same again"
    else {
      const work = proj.points.filter((x) => x.year < proj.retireYear);
      const short = work.reduce((t, x) => t + x.shareContribution, 0) < work.reduce((t, x) => t + x.sharePlanned, 0) * 0.98;
      const why = [(p.goals.shareStartAfter ?? 0) > 0 && 'it waits for your next purchase', short && 'your savings can’t always cover it'].filter(Boolean).join(' and ') || 'not every month goes in';
      lines.push({ tone: 'warn', text: `Your ${money(proj.shareMonthly)} a month share plan would reach ${money(target, { compact: true })} if it went in every month from now, but ${why}, so your shares reach about ${money(sharesAtRetireReal, { compact: true })} by ${p.goals.retirementAge}. See the plan check on Goals for what would close the gap.` });
    }
  }
  const incomeReal = atRetire?.passiveIncomeReal ?? 0;
  const life = p.goals.lifeExpectancy ?? 90;
  lines.push(proj.runsOutAge == null
    ? { tone: 'good', text: `Living on ${money(p.goals.passiveIncome, { compact: true })} a year from ${p.goals.retirementAge}, your money lasts past ${life}. See Your Wise Future for how it’s paid.` }
    : { tone: 'warn', text: `Living on ${money(p.goals.passiveIncome, { compact: true })} a year from ${p.goals.retirementAge}, your money runs out at ${proj.runsOutAge}, even after selling shares and investment properties. A lower yearly income or a bigger share plan would stretch it.` });
  return { owned, projectedProps, sharesAtRetireReal, requiredYearly, spareYearly, incomeReal, lines, proj };
}

/** Ideas WealthWise never gives: more work in any form, or structures and strategies the app can't model yet (trusts, SMSFs, salary sacrifice…). Hides any the AI slips through, including ones saved earlier. */
const WORK_IDEA = /\btrusts?\b|company structure|\bsmsf\b|self[- ]managed super|ownership structure|bucket company|salary sacrific|extra (super )?contribution|concessional contribution|debt recycl|insurance|refinanc|rent[- ]?vest|part[- ]?time|consult|side[- ]?(hustle|business|gig|income)|second job|freelanc|gig work|(keep|continue|start) working|work(ing)? (longer|after|past|beyond|into)|delay(ing)? (your )?retire|retir(e|ing) later|later retire|(older|higher|later) (retirement )?age|postpone (your )?retire|return to work|extra (hours|shifts)|overtime|pay rise|ask for a raise/i;
export const notWorkIdea = (i: { title?: string; body?: string }) => !WORK_IDEA.test(`${i.title ?? ''} ${i.body ?? ''}`);

/** False when an AI idea suggests delaying or postponing a property purchase. People want to buy as soon as they can. */
export const notDelayIdea = (i: { title?: string; body?: string }) => !/\b(delay\w*|postpon\w*|defer\w*|push(ing)? back|hold(ing)? off on (buying|the|your next|property))\b[^.]{0,60}\b(property|purchase|buy\w*)|\b(property|purchase)\b[^.]{0,30}\b(later|delay\w*|postpon\w*)\b/i.test(`${i.title ?? ''} ${i.body ?? ''}`);

/** False when an AI idea suggests cutting or pausing the share plan for a deposit when the share plan already waits for that purchase. */
export const respectsShareHold = (p: Profile) => (i: { title?: string; body?: string }) => {
  if (!(p.goals.shareStartAfter ?? 0)) return true;
  return !/\b(lower\w*|reduc\w*|pause\w*|paus\w*|cut\w*|halv\w*|hold(ing)? off|re-?balanc\w*|redirect\w*|divert\w*)\b[^.]{0,60}\bshare/i.test(`${i.title ?? ''} ${i.body ?? ''}`);
};

/** Every check an AI idea has to pass before it's shown. */
export const wiseIdeaOk = (p: Profile, stopYear: number) => {
  const buys = buysBeforeRetiring(stopYear), hold = respectsShareHold(p);
  return (i: { title?: string; body?: string }) => notWorkIdea(i) && notDelayIdea(i) && buys(i) && hold(i);
};

/** The calendar year they stop work, the same way the projection works it out. */
export const stopWorkYear = (p: Profile) => {
  const age = p.household.you.age ?? 35;
  return new Date().getFullYear() + Math.max(1, p.goals.retirementAge - age);
};
/**
 * False when an AI idea talks about buying a property in or after the year they stop work. Purchases only happen
 * while they're working, so an idea like that can't be modelled. A backstop for the AI's instructions.
 */
export const buysBeforeRetiring = (stopYear: number) => (i: { title?: string; body?: string }) => {
  const t = `${i.title ?? ''} ${i.body ?? ''}`;
  if (/\b(buy|buying|purchas\w*|add(ing)? (a|another|one more) property)\b[^.]{0,40}\b(in|during|after|into) (your )?retirement\b/i.test(t)) return false;
  if (/\b(once|after) you(’|')?(ve)? (stop(ped)? work|retire[ds]?)\b[^.]{0,40}\b(buy|purchas)/i.test(t)) return false;
  const near = /\b(?:buy|buying|bought|purchas\w*|settle\w*)\b[^.]{0,50}?\b(20\d\d)\b|\b(20\d\d)\s+(?:purchase|buy)/gi;
  for (const m of t.matchAll(near)) if (Number(m[1] ?? m[2]) >= stopYear) return false;
  return true;
};
