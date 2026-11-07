import type { Holding, Profile, Property } from './types';

const n = (v: number | null | undefined) => (v == null || !isFinite(v) ? 0 : v);
const thisYear = () => new Date().getFullYear();

/* ---------- Loans ---------- */
/** A loan with no rate entered is treated as a typical variable rate rather than 0%. */
export const FALLBACK_RATE = 6.85;
const rateOf = (l: { rate: number | null }) => (l.rate == null || !isFinite(l.rate) ? FALLBACK_RATE : l.rate);
export function pmt(ratePct: number, years: number, principal: number) {
  if (principal <= 0) return 0;
  const r = ratePct / 100 / 12;
  const k = Math.max(1, Math.round(years * 12));
  if (r === 0) return principal / k;
  return (principal * r) / (1 - Math.pow(1 + r, -k));
}
export function pv(ratePct: number, years: number, monthly: number) {
  if (monthly <= 0) return 0;
  const r = ratePct / 100 / 12;
  const k = years * 12;
  return (monthly * (1 - Math.pow(1 + r, -k))) / r;
}

/* ---------- Tax (2026–27 resident rates + 2% Medicare levy) ---------- */
export function incomeTax(gross: number) {
  const g = Math.max(0, gross);
  let t = 0;
  if (g > 190000) t = 51370 + (g - 190000) * 0.45;
  else if (g > 135000) t = 31020 + (g - 135000) * 0.37;
  else if (g > 45000) t = 4020 + (g - 45000) * 0.3;
  else if (g > 18200) t = (g - 18200) * 0.15;
  return t + (g > 27222 ? g * 0.02 : 0);
}
export const afterTax = (gross: number) => gross - incomeTax(gross);

/** Compulsory HELP/HECS repayment, 2026–27 estimate: the 2025–26 marginal scale indexed to the $69,528 threshold. */
export function hecsCompulsory(income: number) {
  const t1 = 69528, t2 = 129716, t3 = 186052;
  if (income <= t1) return 0;
  if (income >= t3) return income * 0.1;
  if (income <= t2) return (income - t1) * 0.15;
  return (t2 - t1) * 0.15 + (income - t2) * 0.17;
}

/** Monthly cost of dependants this year, or `yearsAhead` from now (costs stop at each one's support age). */
export function dependantsMonthly(p: Profile, yearsAhead = 0) {
  return (p.household.dependantsDetail ?? []).reduce((a, d) => {
    if (d.age != null && d.age + yearsAhead >= d.supportUntil) return a;
    return a + n(d.monthlyCosts) + n(d.childcareMonthly) + n(d.activitiesMonthly) + n(d.schoolFeesYearly) / 12;
  }, 0);
}

export function livingCosts(p: Profile) {
  const f = p.finances;
  const broken = Object.values(f.livingBreakdown ?? {}).reduce((a: number, v) => a + n(v), 0);
  return f.livingMode === 'breakdown' && broken > 0 ? broken : n(f.livingMonthly) || broken; // an empty breakdown falls back to the total
}
/** Monthly housing cost not already counted through a property's loan: rent, or a mortgage figure entered directly. */
export function housingMonthly(p: Profile) {
  const f = p.finances;
  if (f.housing === 'rent') return n(f.rentMonthly);
  return 0;
}
export const mortgageShare = (p: Profile) => (p.finances.housing === 'own' ? Math.min(100, Math.max(0, p.finances.mortgageSharePct ?? 100)) / 100 : 1);

/** HECS: compulsory repayments for each person who owes it, plus voluntary extras. Annual. */
export function hecsAnnual(p: Profile, youSal = n(p.household.you.salary), partSal = n(p.household.partner.salary)) {
  const debts = p.finances.debts.filter((d) => d.kind === 'hecs' && n(d.balance) > 0);
  const owes = (who: 'you' | 'partner') => debts.some((d) => (d.owner ?? 'you') === who);
  const compulsory = (owes('you') ? hecsCompulsory(youSal + n(p.household.otherIncome)) : 0) + (p.household.hasPartner && owes('partner') ? hecsCompulsory(partSal) : 0);
  const voluntary = debts.reduce((a, d) => a + n(d.voluntaryMonthly) * 12, 0);
  return { compulsory, voluntary, balance: debts.reduce((a, d) => a + n(d.balance), 0) };
}

/* ---------- Property ---------- */
export interface Valuation { value: number; low: number; high: number; sources: number; basis: 'sources' | 'indexed' | 'none' }

export function propertyValuation(p: Property): Valuation {
  const latest = new Map<string, number>();
  [...p.valuations].sort((a, b) => a.date.localeCompare(b.date)).forEach((v) => latest.set(v.source, v.value));
  const vals = [...latest.values()].filter((v) => v > 0);
  if (vals.length) {
    const value = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { value, low: Math.min(...vals), high: Math.max(...vals), sources: vals.length, basis: 'sources' };
  }
  if (p.purchasePrice) {
    const [y, m] = (p.purchaseDate || `${thisYear()}-01`).split('-').map(Number);
    const yrs = Math.max(0, (Date.now() - new Date(y, (m || 1) - 1, 1).getTime()) / (365.25 * 864e5));
    const value = p.purchasePrice * Math.pow(1 + p.growthRate / 100, yrs);
    return { value, low: value * 0.93, high: value * 1.07, sources: 0, basis: 'indexed' };
  }
  return { value: 0, low: 0, high: 0, sources: 0, basis: 'none' };
}

export function loanRepaymentAnnual(l: Property['loans'][number]) {
  const owing = Math.max(0, n(l.balance) - n(l.offset));
  if (l.type === 'io') return (owing * rateOf(l)) / 100;
  return pmt(rateOf(l), n(l.yearsLeft) || 25, n(l.balance)) * 12 - (n(l.offset) * rateOf(l)) / 100;
}

export function propertyStats(p: Property, lvr: number) {
  const val = propertyValuation(p);
  const debt = p.loans.reduce((a, l) => a + n(l.balance), 0);
  const offset = p.loans.reduce((a, l) => a + n(l.offset), 0);
  const equity = val.value - debt;
  const usable = Math.max(0, val.value * (lvr / 100) - debt);
  const rentGross = n(p.weeklyRent) * Math.max(0, 52 - n(p.vacancyWeeks));
  const mgmt = rentGross * (n(p.managementPct) / 100);
  const repayments = p.loans.reduce((a, l) => a + loanRepaymentAnnual(l), 0);
  const interest = p.loans.reduce((a, l) => a + (Math.max(0, n(l.balance) - n(l.offset)) * rateOf(l)) / 100, 0);
  const cashflow = rentGross - mgmt - n(p.annualCosts) - repayments;
  const grossYield = val.value ? ((n(p.weeklyRent) * 52) / val.value) * 100 : 0;
  const growthSincePurchase = p.purchasePrice ? ((val.value - p.purchasePrice) / p.purchasePrice) * 100 : null;
  const avgRate = debt ? p.loans.reduce((a, l) => a + rateOf(l) * n(l.balance), 0) / debt : 0;
  const lvrNow = val.value ? (debt / val.value) * 100 : 0;
  return { val, debt, offset, equity, usable, rentGross, mgmt, repayments, interest, cashflow, grossYield, growthSincePurchase, avgRate, lvrNow };
}

/* ---------- Holdings ---------- */
export type Quotes = Record<string, { price: number; change: number; asOf: string }>;
export const holdingKey = (h: Pick<Holding, 'code' | 'exchange'>) => `${h.exchange}:${h.code}`;

export function holdingsStats(holdings: Holding[], quotes: Quotes) {
  const rows = holdings.map((h) => {
    const q = quotes[holdingKey(h)];
    const price = q?.price ?? (h.currency && h.currency !== 'AUD' ? h.avgCost * (quotes[`FX:${h.currency}`]?.price ?? 1) : h.avgCost);
    const value = price * h.units;
    const cur = h.currency ?? 'AUD';
    const fx = cur === 'AUD' ? 1 : quotes[`FX:${cur}`]?.price ?? NaN; // AUD per 1 unit of the currency
    const cost = h.avgCost * h.units * (isNaN(fx) ? 1 : fx);
    return { h, price, value, cost, gain: value - cost, gainPct: cost ? ((value - cost) / cost) * 100 : 0, dayChange: q ? q.change : 0 };
  });
  const value = rows.reduce((a, r) => a + r.value, 0);
  const cost = rows.reduce((a, r) => a + r.cost, 0);
  const dayMove = rows.reduce((a, r) => a + r.value - r.value / (1 + r.dayChange / 100), 0);
  return { rows, value, cost, gain: value - cost, gainPct: cost ? ((value - cost) / cost) * 100 : 0, dayMove };
}

/* ---------- Household position ---------- */
export function livingFloor(p: Profile) {
  const couple = p.household.hasPartner;
  return (couple ? 3600 : 2400) + p.household.dependants.length * 650;
}

export function borrowingCapacity(p: Profile, overrides: { cardLimitCut?: number } = {}) {
  const hh = p.household;
  const a = p.assumptions;
  const rent = p.properties.reduce((s, pr) => s + n(pr.weeklyRent) * 52, 0) * 0.8;
  const youGross = n(hh.you.salary) + n(hh.otherIncome) * 0.8 + rent;
  const partnerGross = hh.hasPartner ? n(hh.partner.salary) : 0;
  const netMonthly = (afterTax(youGross) + (partnerGross ? afterTax(partnerGross) : 0)) / 12;
  const living = Math.max(livingCosts(p) + dependantsMonthly(p), livingFloor(p)) + housingMonthly(p);
  const cardLimits = p.finances.debts.filter((d) => d.kind === 'credit-card').reduce((s, d) => s + n(d.limit), 0) - n(overrides.cardLimitCut);
  const commitments = p.finances.debts.filter((d) => d.kind !== 'credit-card' && d.kind !== 'hecs').reduce((s, d) => s + n(d.monthlyRepayment), 0) + Math.max(0, cardLimits) * 0.038
    + hecsAnnual(p).compulsory / 12;
  const assessed = p.properties.reduce(
    (s, pr) => s + pr.loans.reduce((t, l) => t + pmt(rateOf(l) + a.serviceBuffer, Math.max(5, n(l.yearsLeft) || 25), n(l.balance)), 0), 0);
  const surplus = netMonthly - living - commitments - assessed;
  return { capacity: Math.max(0, pv(a.newLoanRate + a.serviceBuffer, 30, surplus)), surplus, netMonthly, living, commitments, assessed };
}

export function position(p: Profile, quotes: Quotes) {
  const lvr = p.assumptions.lvr;
  const props = p.properties.map((pr) => ({ pr, s: propertyStats(pr, lvr) }));
  const propValue = props.reduce((a, x) => a + x.s.val.value, 0);
  const propDebt = props.reduce((a, x) => a + x.s.debt, 0);
  const usable = props.reduce((a, x) => a + x.s.usable, 0);
  const shares = holdingsStats(p.holdings, quotes);
  const superBal = n(p.household.you.superBalance) + (p.household.hasPartner ? n(p.household.partner.superBalance) : 0);
  const cash = n(p.finances.cash);
  const otherDebt = p.finances.debts.reduce((a, d) => a + n(d.balance), 0);
  const assets = propValue + shares.value + superBal + cash;
  const liabilities = propDebt + otherDebt;
  const bc = borrowingCapacity(p);
  const propCashflow = props.reduce((a, x) => a + (x.pr.use === 'investment' ? x.s.cashflow : 0), 0);
  const hh = p.household;
  const hecs = hecsAnnual(p);
  const takeHome = (afterTax(n(hh.you.salary) + n(hh.otherIncome)) + (hh.hasPartner ? afterTax(n(hh.partner.salary)) : 0) - hecs.compulsory) / 12;
  const f = p.finances;
  const homeLoanRepay = f.housing === 'own' && f.mortgageMonthly != null
    ? n(f.mortgageMonthly) * 12
    : props.reduce((a, x) => a + (x.pr.use === 'home' ? x.s.repayments : 0), 0);
  const homeCosts = homeLoanRepay * mortgageShare(p) + props.reduce((a, x) => a + (x.pr.use === 'home' ? n(x.pr.annualCosts) : 0), 0);
  const living = Math.max(livingCosts(p) + dependantsMonthly(p), livingFloor(p));
  const monthlySurplus = takeHome + (propCashflow - homeCosts) / 12 - living - housingMonthly(p)
    - f.debts.filter((d) => d.kind !== 'hecs').reduce((a, d) => a + n(d.monthlyRepayment), 0) - hecs.voluntary / 12;
  return { takeHome, monthlySurplus, hecs, living, homeCosts, props, propValue, propDebt, usable, shares, superBal, cash, otherDebt, assets, liabilities, netWorth: assets - liabilities, bc, propCashflow };
}

/* ---------- Projection ---------- */
export interface YearPoint {
  year: number; age: number; propertyValue: number; propertyDebt: number; propertyEquity: number; shares: number; super: number; cash: number;
  netWorth: number; passiveIncome: number; passiveIncomeReal: number; properties: number; borrowing: number; monthlySavings: number;
  repayUp2: number; repayBase: number; repayDown2: number; bought?: number;
  spendGoalReal: number; spendFundedReal: number; shareContribution: number;
}
export interface PurchaseBlock { year: number; reason: 'deposit' | 'servicing' | 'date'; price: number; deposit: number; available: number; monthlyShort: number }
export interface PlanEvent { year: number; age: number; kind: 'buy' | 'sell' | 'debt' | 'kids' | 'retire' | 'super' | 'shares' | 'runout' | 'cost' | 'goal'; text: string }
export interface Projection {
  points: YearPoint[]; purchases: { year: number; price: number }[]; retireYear: number; block: PurchaseBlock | null;
  events: PlanEvent[]; runsOutAge: number | null; shareMonthly: number; requiredShareMonthly: number; cryptoExcluded: number;
}

const CGT_RATE = 0.16; // half the gain is taxed (50% discount), at roughly a 32% marginal rate in retirement
const SELL_COSTS = 0.025;

/** Monthly amount (today's money, rising with inflation) needed to reach the share target by retirement. */
export function requiredShareMonthly(p: Profile, sharesNow: number) {
  // Mirrors the projection exactly: shares grow each year, and a contribution (rising with inflation) goes in every working year.
  const a = p.assumptions;
  const years = Math.max(1, p.goals.retirementAge - (n(p.household.you.age) || 35));
  const R = a.shareReturn / 100, pi = a.inflation / 100;
  const targetNominal = n(p.goals.sharesTarget) * Math.pow(1 + pi, years);
  const grown = sharesNow * Math.pow(1 + R, years);
  if (targetNominal <= grown) return 0;
  let perDollar = 0; // what $1 a year (today's money) grows to
  for (let i = 1; i < years; i++) perDollar += Math.pow(1 + pi, i) * Math.pow(1 + R, years - i);
  return perDollar > 0 ? (targetNominal - grown) / perDollar / 12 : 0;
}

export function project(p: Profile, quotes: Quotes): Projection {
  const a = p.assumptions;
  const pos = position(p, quotes);
  const startAge = n(p.household.you.age) || 35;
  const retireAge = Math.max(startAge + 1, p.goals.retirementAge);
  const endAge = Math.max(retireAge + 1, startAge + 5, Math.min(110, p.goals.lifeExpectancy ?? 90));
  const y0 = thisYear();
  const retireYear = y0 + (retireAge - startAge);
  const infl = (i: number) => Math.pow(1 + a.inflation / 100, i);
  const share = mortgageShare(p);
  const events: PlanEvent[] = [];
  const say = (year: number, kind: PlanEvent['kind'], text: string) => events.push({ year, age: startAge + (year - y0), kind, text });

  type Sim = { name: string; value: number; cost: number; debt: number; rate: number; io: boolean; years: number; rent: number; costs: number; mgmt: number; g: number; invest: boolean; pay: number };
  const sims: Sim[] = pos.props.map(({ pr, s }) => ({
    name: pr.address || 'A property', value: s.val.value, cost: n(pr.purchasePrice) || s.val.value, debt: s.debt, rate: s.avgRate || a.newLoanRate,
    io: pr.loans.length > 0 && pr.loans.every((l) => l.type === 'io'), years: Math.max(1, ...pr.loans.map((l) => n(l.yearsLeft) || 25)),
    rent: s.rentGross, costs: n(pr.annualCosts), mgmt: n(pr.managementPct) / 100, g: pr.growthRate / 100, invest: pr.use === 'investment', pay: pr.use === 'home' ? share : 1,
  }));

  // Crypto is too volatile to project: it counts in today's net worth but not in the plan.
  const cryptoExcluded = pos.shares.rows.filter((r) => r.h.kind === 'crypto').reduce((t, r) => t + r.value, 0);
  let shares = pos.shares.value - cryptoExcluded;
  let shareCost = pos.shares.rows.filter((r) => r.h.kind !== 'crypto').reduce((t, r) => t + r.cost, 0);
  const reqMonthly = requiredShareMonthly(p, shares);
  const shareMonthly = p.goals.shareMonthly == null ? reqMonthly : n(p.goals.shareMonthly);
  let sup = pos.superBal;
  let cash = pos.cash;
  let otherDebt = pos.otherDebt - hecsAnnual(p).balance;
  let youSal = n(p.household.you.salary);
  let partSal = p.household.hasPartner ? n(p.household.partner.salary) : 0;
  const baseLiving = Math.max(livingCosts(p), livingFloor(p) - dependantsMonthly(p)) + housingMonthly(p);
  let living = (baseLiving + dependantsMonthly(p)) * 12;
  let hecsBal = hecsAnnual(p).balance;
  const buffer = n(p.finances.buffer) || living / 4;
  const otherRepay = p.finances.debts.filter((d) => d.kind !== 'hecs').reduce((t, d) => t + n(d.monthlyRepayment), 0) * 12;
  const cardLoad = p.finances.debts.filter((d) => d.kind === 'credit-card').reduce((t, d) => t + n(d.limit), 0) * 0.038 * 12;
  /** Monthly surplus as a lender would assess it. Car loans and cards only count against the first new purchase; after that they're assumed paid off. */
  const serviceSurplus = (list: Sim[], ys: number, ps: number, liv: number, countOtherDebts: boolean) => {
    const rent80 = list.reduce((t, s) => t + s.rent, 0) * 0.8;
    const net = afterTax(ys + n(p.household.otherIncome) * 0.8 + rent80) + (ps ? afterTax(ps) : 0) - (hecsBal > 0 ? hecsAnnual(p, ys, ps).compulsory : 0);
    const assessed = list.reduce((t, s) => t + pmt(s.rate + a.serviceBuffer, 30, s.debt) * 12, 0);
    const others = countOtherDebts ? (otherDebt > 0 ? otherRepay : 0) + cardLoad : 0;
    return (net - liv - assessed - others) / 12;
  };

  const points: YearPoint[] = [];
  const purchases: { year: number; price: number }[] = [];
  let block: PurchaseBlock | null = null;
  let waitFrom: number | null = null;
  let runsOutAge: number | null = null;
  const kidsEnd = new Set<string>();
  let debtsCleared = otherDebt <= 0;

  if (shareMonthly > 0) say(y0, 'shares', `Invest about ${fmt(shareMonthly)} a month in shares${p.goals.sharesTarget ? ` to reach your ${fmt(n(p.goals.sharesTarget))} goal by ${retireAge}` : ''}, rising with inflation.`);
  if (cryptoExcluded > 0) say(y0, 'goal', `Your ${fmt(cryptoExcluded)} in crypto stays in today’s net worth but isn’t projected forward, because its future value can’t be reasonably estimated.`);

  for (let i = 0; i <= endAge - startAge; i++) {
    const year = y0 + i;
    const age = startAge + i;
    const working = age < retireAge;
    let bought: number | undefined;
    let contribution = 0;
    let spendGoal = 0, spendFunded = 0;

    if (i > 0) {
      // Property: grow, collect rent, pay loans
      let propNet = 0;
      for (const s of sims) {
        s.value *= 1 + s.g;
        s.rent *= 1 + a.rentGrowth / 100;
        s.costs *= 1 + a.inflation / 100;
        const interest = (s.debt * s.rate) / 100;
        let repay = interest;
        if (!s.io && s.debt > 0) {
          repay = Math.min(s.debt + interest, pmt(s.rate, s.years, s.debt) * 12);
          s.debt = Math.max(0, s.debt - (repay - interest));
          s.years = Math.max(1, s.years - 1);
        }
        propNet += s.invest ? s.rent * (1 - s.mgmt) - s.costs - repay : -(s.costs + repay * s.pay);
      }
      // Cash sits in an offset where there's debt, saving that interest
      const debtTotal = sims.reduce((t, s) => t + s.debt, 0);
      const avgRate = debtTotal ? sims.reduce((t, s) => t + s.debt * s.rate, 0) / debtTotal : 0;
      const offsetSaving = Math.min(Math.max(0, cash), debtTotal) * avgRate / 100;

      youSal = working ? youSal * 1.03 : 0;
      partSal = working ? partSal * 1.03 : 0;
      living = (baseLiving + dependantsMonthly(p, i)) * 12 * infl(i);
      for (const d of p.household.dependantsDetail ?? []) if (d.age != null && d.age + i === d.supportUntil && !kidsEnd.has(d.id)) { kidsEnd.add(d.id); say(year, 'kids', `${d.name || 'A dependant'} turns ${d.supportUntil}: their costs drop out of your budget.`); }
      sup = sup * (1 + a.superReturn / 100) + (youSal + partSal) * 0.12 * 0.85;
      shares *= 1 + a.shareReturn / 100;

      const debtRepay = otherDebt > 0 ? Math.min(otherDebt, otherRepay) : 0;
      otherDebt -= debtRepay;
      if (!debtsCleared && otherDebt <= 0) { debtsCleared = true; say(year, 'debt', 'Car loans and personal debts are paid off.'); }
      let hecsPaid = 0;
      if (hecsBal > 0) { const h = hecsAnnual(p, youSal, partSal); hecsPaid = Math.min(hecsBal, h.compulsory + h.voluntary); hecsBal -= hecsPaid; if (hecsBal <= 0) say(year, 'debt', 'HECS is paid off.'); }
      const net = afterTax(youSal + n(p.household.otherIncome)) + (partSal ? afterTax(partSal) : 0) - hecsPaid;

      if (working) {
        contribution = shareMonthly * 12 * infl(i);
        shares += contribution; shareCost += contribution;
        cash += net + propNet + offsetSaving - living - debtRepay - contribution;
      } else {
        // Retired: spend the income goal (plus any dependants still at home), funded in order from rent, cash, super (60+), shares, then investment property sales.
        spendGoal = p.goals.passiveIncome * infl(i) + dependantsMonthly(p, i) * 12 * infl(i);
        cash += propNet + offsetSaving - spendGoal - debtRepay;
        if (age === 60 && sup > 0) say(year, 'super', `Super becomes available at 60: about ${fmt(sup / infl(i))} in today’s money.`);
        let need = buffer * infl(i) - cash;
        if (need > 0 && age >= 60 && sup > 0) { const take = Math.min(sup, need); sup -= take; cash += take; need -= take; }
        if (need > 0 && shares > 0) {
          const gainShare = shares > 0 ? Math.max(0, 1 - shareCost / shares) : 0;
          const gross = Math.min(shares, need / (1 - gainShare * CGT_RATE));
          if (shares > 0 && gross >= shares * 0.999 && shares > 1000) say(year, 'sell', 'Your share portfolio is fully sold down by now.');
          shareCost *= 1 - gross / shares; shares -= gross; cash += gross * (1 - gainShare * CGT_RATE); need = buffer * infl(i) - cash;
        }
        while (need > 0) {
          const idx = sims.map((s, k) => ({ s, k })).filter((x) => x.s.invest).map((x) => x.k).pop(); // newest investment first
          if (idx == null) break;
          const s = sims[idx];
          const proceeds = s.value * (1 - SELL_COSTS) - s.debt - Math.max(0, s.value - s.cost) * CGT_RATE;
          sims.splice(idx, 1);
          cash += proceeds; need = buffer * infl(i) - cash;
          say(year, 'sell', `Sell ${s.name} for about ${fmt(s.value / infl(i))} in today’s money, freeing about ${fmt(proceeds / infl(i))} after the loan, selling costs and tax.`);
        }
        spendFunded = cash >= 0 ? spendGoal : Math.max(0, spendGoal + cash);
        if (cash < 0 && runsOutAge == null) { runsOutAge = age; say(year, 'runout', `Money runs out at ${age}: your rent, super and investments can no longer fund ${fmt(p.goals.passiveIncome)} a year.${sims.some((x) => !x.invest) ? ' You’d still own your home, which is why the chart keeps a balance after this point.' : ''}`); }
      }
      for (const ev of p.goals.events) if (ev.year === year) { cash -= ev.amount; say(year, 'cost', `${ev.label || 'Planned cost'}: ${fmt(ev.amount)}.`); }

      // Buying: when equity + spare cash covers the deposit and a lender would approve the loan
      if (working && sims.length < p.goals.targetProperties) {
        const k = purchases.length;
        const plan = p.plannedPurchases?.[k];
        const growth = (plan?.growth ?? 5) / 100;
        const price = (plan?.price ?? a.newPurchasePrice) * Math.pow(1 + growth, i);
        const yieldPct = plan?.yieldPct ?? a.newPurchaseYield;
        const rate = plan?.rate ?? a.newLoanRate;
        const usable = sims.reduce((t, s) => t + Math.max(0, s.value * (a.lvr / 100) - s.debt), 0);
        const deposit = price * 0.25; // 20% deposit plus about 5% stamp duty and costs
        const spare = Math.max(0, cash - buffer);
        // The most a lender would lend now (car loans and cards only count for the first new purchase)
        const maxLoan = Math.max(0, pv(rate + a.serviceBuffer, 30, serviceSurplus(sims, youSal, partSal, living, k === 0)));
        // Cash needed: at least whatever equity can't cover of the deposit, and enough to keep the loan within what a lender allows
        const needCash = Math.max(0, deposit - usable, price * 1.05 - maxLoan);
        const fromCash = Math.min(spare, Math.max(needCash, Math.min(spare, deposit)));
        const fromEquity = Math.max(0, deposit - fromCash);
        const newLoan = price * 1.05 - fromCash;
        const dateOk = !plan?.notBefore || year >= plan.notBefore;
        if (dateOk && spare >= needCash && newLoan <= maxLoan + 1) {
          const prevBlock = block;
          block = null;
          cash -= fromCash;
          sims.push({ name: `Property ${p.properties.length + k + 1}`, value: price, cost: price, debt: newLoan, rate, io: true, years: 30, rent: price * (yieldPct / 100) * (50 / 52), costs: price * 0.012, mgmt: 0.07, g: growth, invest: true, pay: 1 });
          purchases.push({ year, price });
          bought = price;
          const via = [fromEquity > 1000 ? `${fmt(fromEquity)} of equity` : '', fromCash > 1000 ? `${fmt(fromCash)} of savings` : ''].filter(Boolean).join(' and ');
          const waited = prevBlock?.reason === 'servicing' && waitFrom != null && waitFrom < year - 1 ? ` It waits until now because a lender would only lend about ${fmt(maxLoan)} on your income, so the rest comes from savings built up in the meantime.` : '';
          waitFrom = null;
          say(year, 'buy', `Buy property ${p.properties.length + k + 1} for about ${fmt(price / infl(i))} in today’s money (${fmt(price)} at the time), putting in ${via || 'equity'} and borrowing ${fmt(newLoan)}.${waited}`);
        } else {
          if (waitFrom == null) waitFrom = year;
          block = { year, reason: !dateOk ? 'date' : deposit - usable > spare ? 'deposit' : 'servicing', price, deposit, available: usable + spare, monthlyShort: Math.max(0, pmt(rate + a.serviceBuffer, 30, price * 1.05 - spare) - pmt(rate + a.serviceBuffer, 30, maxLoan)) };
        }
      }
      if (age === retireAge) say(year, 'retire', `Stop working at ${retireAge}. From here you live on ${fmt(p.goals.passiveIncome)} a year in today’s money.`);
    }

    const propertyValue = sims.reduce((t, s) => t + s.value, 0);
    const propertyDebt = sims.reduce((t, s) => t + s.debt, 0);
    const rentNet = sims.filter((s) => s.invest).reduce((t, s) => t + s.rent * (1 - s.mgmt) - s.costs - (s.debt * s.rate) / 100, 0);
    const passiveIncome = rentNet + shares * 0.04 + (age >= 60 ? sup * 0.05 : 0);
    const totalRepay = (delta: number) => sims.reduce((t, s) => t + (s.io ? (s.debt * (s.rate + delta)) / 100 : pmt(s.rate + delta, s.years, s.debt) * 12), 0);
    const income = working ? afterTax(youSal + n(p.household.otherIncome)) + (partSal ? afterTax(partSal) : 0) : 0;
    const monthlyNet = working
      ? (income + sims.reduce((t, s) => t + (s.invest ? s.rent * (1 - s.mgmt) : 0) - s.costs, 0) - totalRepay(0) - living - contribution) / 12
      : (rentNet - spendGoal) / 12;
    points.push({
      year, age, propertyValue, propertyDebt, propertyEquity: propertyValue - propertyDebt, shares, super: sup, cash,
      netWorth: propertyValue - propertyDebt + shares + sup + cash - Math.max(0, otherDebt) - Math.max(0, hecsBal),
      passiveIncome, passiveIncomeReal: passiveIncome / infl(i), properties: sims.length,
      borrowing: i === 0 ? pos.bc.capacity : working ? Math.max(0, pv(a.newLoanRate + a.serviceBuffer, 30, serviceSurplus(sims, youSal, partSal, living, false))) : 0,
      monthlySavings: monthlyNet, repayUp2: totalRepay(2), repayBase: totalRepay(0), repayDown2: totalRepay(-2), bought,
      spendGoalReal: working ? p.goals.passiveIncome : spendGoal / infl(i), spendFundedReal: working ? passiveIncome / infl(i) : spendFunded / infl(i), shareContribution: contribution,
    });
  }
  if (runsOutAge == null) say(y0 + (endAge - startAge), 'goal', `Your money lasts to ${endAge}, with about ${fmt((points[points.length - 1].netWorth) / infl(endAge - startAge))} in today’s money left over.`);
  events.sort((x, y) => x.year - y.year);
  return { points, purchases, retireYear, block: purchases.length + p.properties.length >= p.goals.targetProperties ? null : block, events, runsOutAge, shareMonthly, requiredShareMonthly: reqMonthly, cryptoExcluded };
}

const fmt = (v: number) => {
  const x = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (x >= 1e6) return `${s}$${(x / 1e6).toFixed(x >= 1e7 ? 1 : 2)}m`;
  if (x >= 1e4) return `${s}$${Math.round(x / 1e3)}k`;
  return `${s}$${Math.round(x).toLocaleString('en-AU')}`;
};
