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
/** Average cost of raising a child in Australia, birth to 18 (about $474k in 2026 dollars), spread evenly. */
export const CHILD_COST_YEAR = 474000 / 18;
/** Cash we suggest keeping on hand in retirement, today's money. */
export const RETIRE_CASH_MIN = 50000;

export function dependantsMonthly(p: Profile, yearsAhead = 0) {
  const year = new Date().getFullYear() + yearsAhead;
  const planned = (p.goals.plannedChildren ?? []).filter((c) => year >= c.year && year < c.year + 18).length * CHILD_COST_YEAR / 12;
  return planned + (p.household.dependantsDetail ?? []).reduce((a, d) => {
    if (d.age != null && d.age + yearsAhead >= d.supportUntil) return a;
    const year = new Date().getFullYear() + yearsAhead;
    const start = d.schoolStartYear ?? (d.age != null ? new Date().getFullYear() + 5 - d.age : null); // most children start school at 5
    const atSchool = !d.schoolDone && start != null && year >= start && year < start + 13; // prep to year 12
    return a + n(d.monthlyCosts) + n(d.childcareMonthly) + n(d.activitiesMonthly) + (atSchool || start == null && !d.schoolDone ? n(d.schoolFeesYearly) / 12 : 0);
  }, 0);
}

/** A sensible minimum emergency cash buffer from age, property, partner and dependants (today's money). */
export function recommendedBuffer(p: Profile) {
  const hh = p.household;
  const age = Math.max(n(hh.you.age), hh.hasPartner ? n(hh.partner.age) : 0);
  const hasProperty = p.properties.length > 0;
  const base = age >= 35 ? 20000 : age >= 30 ? (hasProperty ? 15000 : 10000) : age >= 25 ? (hasProperty ? 10000 : 5000) : 5000;
  const kids = (hh.dependantsDetail?.length ?? hh.dependants.length ?? 0);
  return base * (hh.hasPartner ? 2 : 1) + kids * 10000;
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
  // Finished renovations add their value on top of any estimate made before they were done; later estimates already include them.
  const addsAfter = (date: string) => (p.renoAdds ?? []).filter((r) => r.date >= date).reduce((t, r) => t + r.amount, 0);
  const latest = new Map<string, { value: number; date: string }>();
  [...p.valuations].sort((a, b) => a.date.localeCompare(b.date)).forEach((v) => latest.set(v.source, { value: v.value, date: v.date }));
  const vals = [...latest.values()].filter((v) => v.value > 0).map((v) => v.value + addsAfter(v.date));
  if (vals.length) {
    const value = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { value, low: Math.min(...vals), high: Math.max(...vals), sources: vals.length, basis: 'sources' };
  }
  if (p.purchasePrice) {
    const [y, m] = (p.purchaseDate || `${thisYear()}-01`).split('-').map(Number);
    const yrs = Math.max(0, (Date.now() - new Date(y, (m || 1) - 1, 1).getTime()) / (365.25 * 864e5));
    const value = p.purchasePrice * Math.pow(1 + p.growthRate / 100, yrs) + addsAfter('');
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
  const otherDebt = p.finances.debts.filter((d) => d.kind !== 'credit-card').reduce((a, d) => a + n(d.balance), 0); // cards: only the limit counts
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
  year: number; age: number; propertyValue: number; propertyDebt: number; propertyEquity: number; shares: number; cashShares: number; super: number; cash: number; crypto: number;
  netWorth: number; passiveIncome: number; passiveIncomeReal: number; properties: number; investProps: number; borrowing: number; monthlySavings: number;
  repayUp2: number; repayBase: number; repayDown2: number; bought?: number;
  spendGoalReal: number; spendFundedReal: number; shareContribution: number; sharePlanned: number; rentIncome: number; superDrawn: number; paidOff?: string[]; sold?: string[]; payNet: number; investNet: number; saleIn: number; giftIn: number; liqIn: number; shareSaleIn: number; propSaleIn: number; propNet: number; spending: number; liquidated?: number;
}
export interface PurchaseBlock { year: number; reason: 'deposit' | 'servicing' | 'date'; price: number; deposit: number; available: number; monthlyShort: number }
export interface PlanEvent { year: number; age: number; kind: 'buy' | 'sell' | 'debt' | 'pay' | 'gift' | 'liquidate' | 'kids' | 'retire' | 'super' | 'shares' | 'runout' | 'cost' | 'goal'; text: string }
export interface Projection {
  points: YearPoint[]; purchases: { year: number; price: number; id?: string }[]; shortfallYear: number | null; sharesAtRetire: number; buffer: number; retireYear: number; block: PurchaseBlock | null;
  events: PlanEvent[]; runsOutAge: number | null; shareMonthly: number; requiredShareMonthly: number; cryptoExcluded: number;
  cashSharesTax: number; // capital gains tax paid selling spare-cash shares for deposits
  sales: { year: number; age: number; name: string; net: number; reason: 'loan' | 'income' | 'move' }[]; // properties the plan sells by itself; net in today's money
}

const FALLBACK_DEBT_RATE: Record<string, number> = { car: 9.5, personal: 12.5, 'credit-card': 20.99, other: 10 };
const SG_RATE = 0.12; // superannuation guarantee
const CC_CAP = 32500; // concessional contributions cap, 2026-27
const PRESERVATION_AGE = 60;
/** Minimum yearly payment from an account-based pension, by age. */
export const minDrawdown = (age: number) => age < 65 ? 0.04 : age < 75 ? 0.05 : age < 80 ? 0.06 : age < 85 ? 0.07 : age < 90 ? 0.09 : age < 95 ? 0.11 : 0.14;
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

  type Sim = {
    name: string; value: number; cost: number; debt: number; rate: number; ioLeft: number; years: number; rent: number; costs: number; mgmt: number; g: number;
    invest: boolean; pay: number; payOff: boolean; home: boolean; pid?: string;
    ng: boolean; ngUntil?: number; carry: number; // negative gearing allowed (until a year), and losses carried forward when it isn't
  };
  const sims: Sim[] = pos.props.map(({ pr, s }) => ({
    name: pr.address || 'A property', value: s.val.value, cost: n(pr.purchasePrice) || s.val.value, debt: s.debt, rate: s.avgRate || a.newLoanRate,
    ioLeft: pr.planIo5 ? 5 : 0, years: Math.max(1, ...pr.loans.map((l) => n(l.yearsLeft) || 25)),
    rent: s.rentGross, costs: n(pr.annualCosts), mgmt: n(pr.managementPct) / 100, g: pr.growthRate / 100, invest: pr.use === 'investment', pay: pr.use === 'home' ? share : 1,
    payOff: pr.planPayOff ?? pr.use === 'home', home: pr.use === 'home', pid: pr.id,
    // 2026 Budget: properties held before 7:30pm 12 May 2026 keep negative gearing; established homes bought after it lose it from 1 July 2027
    ng: pr.oldNegGearing ?? (!pr.purchaseDate || pr.purchaseDate < '2026-05'), ngUntil: (pr.oldNegGearing ?? (!pr.purchaseDate || pr.purchaseDate < '2026-05')) ? undefined : 2027, carry: 0,
  }));
  const valueNow = new Map(pos.props.map(({ pr, s }) => [pr.id, s.val.value]));
  const renos = (p.renovations ?? []).filter((r) => !r.done && valueNow.has(r.propertyId));

  // Crypto is too volatile to project: it counts in today's net worth but not in the plan.
  // Unless the person opts in with their own growth rate: then it's a simple pot growing at that rate.
  const isCryptoRow = (r: { h: { kind: string; exchange: string } }) => r.h.kind === 'crypto' || r.h.exchange === 'CRYPTO';
  const cryptoNow = pos.shares.rows.filter(isCryptoRow).reduce((t, r) => t + r.value, 0);
  const cryptoIn = !!p.cryptoInPlan && p.cryptoGrowth != null;
  const cryptoExcluded = cryptoIn ? 0 : cryptoNow;
  let cryptoBal = cryptoIn ? cryptoNow : 0;
  let cryptoOut = cryptoIn ? 0 : cryptoNow; // left out of the plan: held at today's value, only touched by liquidation events
  let cryptoOutCost = cryptoIn ? 0 : pos.shares.rows.filter(isCryptoRow).reduce((t, r) => t + r.cost, 0);
  let cryptoCost = cryptoIn ? pos.shares.rows.filter(isCryptoRow).reduce((t, r) => t + r.cost, 0) : 0;
  let shares = pos.shares.value - cryptoNow;
  let shareCost = pos.shares.rows.filter((r) => !isCryptoRow(r)).reduce((t, r) => t + r.cost, 0);
  // Cash plan (Cash tab): where accessible cash sits, and spare cash above the cap invested in shares until a purchase needs it
  const cp = p.cashPlan?.active ? p.cashPlan : null;
  let sweepBal = 0, sweepCost = 0, sweepSaid = false, cashSharesTax = 0;
  const sales: Projection['sales'] = [];
  const mtrOf = (inc: number) => (incomeTax(inc + 1000) - incomeTax(inc)) / 1000;
  const reqMonthly = requiredShareMonthly(p, shares);
  const shareMonthly = p.goals.shareMonthly == null ? reqMonthly : n(p.goals.shareMonthly);
  let sup = pos.superBal;
  let cash = pos.cash;
  let youSal = n(p.household.you.salary);
  let partSal = p.household.hasPartner ? n(p.household.partner.salary) : 0;
  const baseLiving = Math.max(livingCosts(p), livingFloor(p) - dependantsMonthly(p)) + housingMonthly(p);
  let living = (baseLiving + dependantsMonthly(p)) * 12;
  let baseLivingAdj = 0; // e.g. rent stops once a first home is bought
  let hecsBal = hecsAnnual(p).balance;
  const buffer = n(p.finances.buffer) || recommendedBuffer(p);
  const retireBuffer = p.goals.retireCash != null ? n(p.goals.retireCash) : RETIRE_CASH_MIN;
  // Car and personal loans, one by one, run off on their repayments. Credit cards aren't tracked as debt (balances move too much); only their limit counts, for borrowing.
  const DEBT_NAME: Record<string, string> = { car: 'car loan', personal: 'personal loan', 'credit-card': 'credit card', other: 'loan' };
  const debtSims = p.finances.debts.filter((d) => d.kind !== 'hecs' && d.kind !== 'credit-card' && n(d.balance) > 0).map((d) => {
    const rate = n(d.rate ?? FALLBACK_DEBT_RATE[d.kind] ?? 10) / 100;
    const monthly = n(d.monthlyRepayment) || pmt(rate * 100, 5, n(d.balance));
    const label = d.label?.trim(); return { name: !label || /^(credit card|car loan|personal loan|loan)$/i.test(label) ? (label?.toLowerCase() || DEBT_NAME[d.kind] || 'loan') : label, card: d.kind === 'credit-card', bal: n(d.balance), rate, monthly };
  });
  let otherDebt = debtSims.reduce((t, d) => t + d.bal, 0);
  const otherRepay = () => debtSims.filter((d) => d.bal > 0).reduce((t, d) => t + d.monthly, 0) * 12;
  const cardLoad = p.finances.debts.filter((d) => d.kind === 'credit-card').reduce((t, d) => t + n(d.limit), 0) * 0.038 * 12;
  /** Monthly surplus as a lender would assess it. Car loans and cards only count against the first new purchase; after that they're assumed paid off. */
  const serviceSurplus = (list: Sim[], ys: number, ps: number, liv: number, countOtherDebts: boolean) => {
    const rent80 = list.reduce((t, s) => t + s.rent, 0) * 0.8;
    const net = afterTax(ys + n(p.household.otherIncome) * 0.8 + rent80) + (ps ? afterTax(ps) : 0) - (hecsBal > 0 ? hecsAnnual(p, ys, ps).compulsory : 0);
    const assessed = list.reduce((t, s) => t + pmt(s.rate + a.serviceBuffer, 30, s.debt) * 12, 0);
    const others = countOtherDebts ? otherRepay() + cardLoad : 0;
    return (net - liv - assessed - others) / 12;
  };

  const points: YearPoint[] = [];
  const purchases: { year: number; price: number; id?: string }[] = [];
  let block: PurchaseBlock | null = null;
  let waitFrom: number | null = null;
  let shortfallYear: number | null = null;
  let superGone = false, reinvestSaid = false, sharesGoneSaid = false, shareShortSaid = false, shareStartSaid = false, ngSaid = false, renting = p.finances.housing === 'rent';
  let sharesAtRetire = 0;
  let runsOutAge: number | null = null;
  const kidsEnd = new Set<string>();
  const paidAtStart: string[] = [];
  for (const d of debtSims) if (d.card) {
    const pay = Math.min(d.bal, Math.max(0, cash - buffer));
    if (pay >= d.bal - 1) { cash -= d.bal; paidAtStart.push(d.name); say(y0, 'debt', `Pay off the ${d.name} now (${fmt(d.bal)}) from savings above your emergency fund. At ${Math.round(d.rate * 1000) / 10}% it’s the most expensive money you owe.`); d.bal = 0; }
  }
  otherDebt = debtSims.reduce((t, d) => t + d.bal, 0);

  if (shareMonthly > 0 && !n(p.goals.shareStartAfter)) say(y0, 'shares', p.goals.shareMonthly == null ? `Invest about ${fmt(shareMonthly)} a month in shares${p.goals.sharesTarget ? ` to reach your ${fmt(n(p.goals.sharesTarget))} goal by ${retireAge}` : ''}, rising with inflation.` : `Invest ${fmt(shareMonthly)} a month in shares (your own amount), rising with inflation.`);
  if (cryptoIn && cryptoNow > 0) say(y0, 'goal', `Your ${fmt(cryptoNow)} in crypto is included in the plan, growing at your own estimate of ${n(p.cryptoGrowth)}% a year. It’s a volatile asset, so treat this part of the plan as a rough guide.`);
  if (cryptoExcluded > 0) say(y0, 'goal', `Your ${fmt(cryptoExcluded)} in crypto counts in today’s net worth but isn’t projected forward.`);

  for (let i = 0; i <= endAge - startAge; i++) {
    const year = y0 + i;
    const age = startAge + i;
    const working = age < retireAge;
    let bought: number | undefined;
    let contribution = 0;
    let spendGoal = 0, spendFunded = 0, superDrawn = 0, sharePlanned = 0;
    let payNet = 0, saleIn = 0, giftIn = 0, liqIn = 0, propNetY = 0, liquidated = 0, investNet = 0, rentTax = 0;
    let shareSaleIn = 0, propSaleIn = 0; // money from selling, by what's sold (planned liquidations and the plan's own sales)
    const paidOff: string[] = i === 0 ? [...paidAtStart] : [];
    const sold: string[] = [];

    if (i > 0) {
      // Property: grow, collect rent, pay loans (interest-only while that lasts, then principal and interest)
      let propNet = 0;
      investNet = 0;
      let taxableRent = 0; // rental profit (or deductible loss) added to taxable income this year
      for (const s of sims) {
        s.value *= 1 + s.g;
        s.rent *= 1 + a.rentGrowth / 100;
        s.costs *= 1 + a.inflation / 100;
        const interest = (s.debt * s.rate) / 100;
        const toRetire = retireYear - year + 1; // years of repayments left before work stops, counting this one
        let repay = interest;
        if (s.debt > 0) {
          if (s.ioLeft > 0 && !(s.payOff && working && toRetire <= 1)) { s.ioLeft--; }
          else {
            const term = s.payOff && working ? Math.max(1, Math.min(s.years, toRetire)) : s.years;
            repay = Math.min(s.debt + interest, pmt(s.rate, term, s.debt) * 12);
            s.debt = Math.max(0, s.debt - (repay - interest));
          }
        }
        s.years = Math.max(1, s.years - 1);
        if (s.invest) {
          const result = s.rent * (1 - s.mgmt) - s.costs - interest; // principal isn't deductible
          const geared = s.ng || (s.ngUntil != null && year <= s.ngUntil);
          if (result < 0) { if (geared) taxableRent += result; else s.carry -= result; }
          else { const used = Math.min(s.carry, result); s.carry -= used; taxableRent += result - used; }
        }
        propNet += s.invest ? s.rent * (1 - s.mgmt) - s.costs - repay : -(s.costs + repay * s.pay);
        if (s.invest) investNet += s.rent * (1 - s.mgmt) - s.costs - repay;
      }
      propNetY = propNet;
      // Planned renovations: pay the cost, lift the value (and rent) from that year on
      let renoCost = 0;
      for (const r of renos) if (Math.max(r.year, y0 + 1) === year) {
        const sim = sims.find((x) => x.pid === r.propertyId);
        if (!sim) continue;
        renoCost += r.cost * infl(i);
        const lift = r.uplift / Math.max(1, valueNow.get(r.propertyId) ?? 1);
        sim.value *= 1 + lift; sim.cost += r.cost * infl(i);
        if (sim.invest && r.rentPerWeek) sim.rent += r.rentPerWeek * 52 * infl(i);
        say(year, 'cost', `Renovate ${sim.name} (${r.items.join(', ').toLowerCase() || r.label}): about ${fmt(r.cost)} (in today’s money), adding about ${fmt(r.uplift)} to its value${sim.invest && r.rentPerWeek ? ` and ${fmt(r.rentPerWeek)} a week in rent` : ''}.`);
      }

      // What cash earns. Without a cash plan: it all sits in an offset where there's debt, saving that interest.
      // With one: the offset share saves interest on the chosen loans (after the lost deduction on investment loans),
      // the high-interest and everyday shares earn their rates after tax.
      let offsetSaving: number;
      if (!cp) {
        const debtTotal = sims.reduce((t, s) => t + s.debt, 0);
        const avgRate = debtTotal ? sims.reduce((t, s) => t + s.debt * s.rate, 0) / debtTotal : 0;
        offsetSaving = Math.min(Math.max(0, cash), debtTotal) * avgRate / 100;
      } else {
        const mtr = mtrOf(working ? youSal + n(p.household.otherIncome) : 0);
        // The emergency fund sits outside the cash plan (in a high-interest account); the split applies to cash above it, up to the cap
        const emergency = Math.min(Math.max(0, cash), buffer * infl(i));
        const capNow = cp.accessMax != null ? n(cp.accessMax) * infl(i) : Infinity;
        const acc = Math.max(0, Math.min(cash - emergency, capNow));
        const targets = sims.filter((s) => s.debt > 0 && (cp.offsetProperties.length === 0 || cp.offsetProperties.includes(s.pid ?? '')));
        const offDebt = targets.reduce((t, s) => t + s.debt, 0);
        const wantOff = acc * cp.split.offset / 100;
        const offAmt = Math.min(wantOff, offDebt);
        const hisaAmt = acc * cp.split.hisa / 100 + (wantOff - offAmt); // offset money with no loan left to offset earns high interest
        const everyAmt = Math.max(0, acc - offAmt - hisaAmt);
        const offSave = offDebt ? targets.reduce((t, s) => t + (offAmt * s.debt / offDebt) * (s.rate / 100) * (s.invest ? 1 - mtr : 1), 0) : 0;
        offsetSaving = offSave + ((hisaAmt + emergency) * cp.hisaRate / 100 + everyAmt * cp.everydayRate / 100) * (1 - mtr);
      }

      const nextSalary = (who: 'you' | 'partner', cur: number) => {
        const person = p.household[who];
        const promo = (person.promotions ?? []).filter((x) => x.year === year && x.salary > 0).pop();
        if (promo) { say(year, 'pay', `${person.name ? `${person.name}’s` : who === 'you' ? 'Your' : 'Your partner’s'} salary steps up to ${fmt(promo.salary)} with a promotion.`); return promo.salary; }
        return cur * (1 + (person.salaryGrowth ?? 3) / 100);
      };
      youSal = working ? nextSalary('you', youSal) : 0;
      partSal = working && p.household.hasPartner ? nextSalary('partner', partSal) : 0;
      living = (baseLiving + baseLivingAdj + dependantsMonthly(p, i)) * 12 * infl(i);
      for (const c of p.goals.plannedChildren ?? []) {
        if (c.year === year) say(year, 'kids', `A new baby is planned. About ${fmt(CHILD_COST_YEAR)} a year (in today’s money) is added to your costs until they turn 18, based on the Australian average.`);
        if (c.year + 18 === year) say(year, 'kids', 'Your planned child turns 18: their costs drop out of your budget.');
      }
      for (const d of p.household.dependantsDetail ?? []) if (d.age != null && d.age + i === d.supportUntil && !kidsEnd.has(d.id)) { kidsEnd.add(d.id); say(year, 'kids', `${d.name || 'A dependant'} turns ${d.supportUntil}: their costs drop out of your budget.`); }
      // Super: employer contributions (12%, capped at the concessional cap, less 15% contributions tax), grows at the assumed return after fees
      const ccCap = CC_CAP * infl(i);
      sup = sup * (1 + a.superReturn / 100) + (Math.min(youSal * SG_RATE, ccCap) + Math.min(partSal * SG_RATE, ccCap)) * 0.85;
      shares *= 1 + a.shareReturn / 100;
      sweepBal *= 1 + a.shareReturn / 100;
      cryptoBal *= 1 + n(p.cryptoGrowth) / 100;

      let debtRepay = 0;
      for (const d of debtSims) if (d.bal > 0) {
        const interest = d.bal * d.rate;
        let pay = Math.min(d.bal + interest, d.monthly * 12);
        if (d.card) pay = Math.max(pay, Math.min(d.bal + interest, Math.max(0, cash - buffer * infl(i)))); // spare savings clear the card first
        d.bal = Math.max(0, d.bal + interest - pay); debtRepay += pay;
        if (d.bal <= 1) { d.bal = 0; paidOff.push(d.name); say(year, 'debt', `${d.name[0].toUpperCase()}${d.name.slice(1)} paid off${d.card ? ' from spare savings' : ' on its regular repayments'}.`); }
      }
      otherDebt = debtSims.reduce((t, d) => t + d.bal, 0);
      let hecsPaid = 0;
      if (hecsBal > 0) { const h = hecsAnnual(p, youSal, partSal); hecsPaid = Math.min(hecsBal, h.compulsory + h.voluntary); hecsBal -= hecsPaid; if (hecsBal <= 0) { paidOff.push('HECS'); say(year, 'debt', 'HECS is paid off.'); } }
      const net = afterTax(youSal + n(p.household.otherIncome)) + (partSal ? afterTax(partSal) : 0) - hecsPaid;
      payNet = working ? net : 0;
      // Tax on rent: profits are taxed at your marginal rate; losses on negatively geared properties come back as a tax refund (split between partners if both earn)
      const base1 = youSal + n(p.household.otherIncome), split = p.household.hasPartner && partSal > 0;
      rentTax = split ? (incomeTax(base1 + taxableRent / 2) - incomeTax(base1)) + (incomeTax(partSal + taxableRent / 2) - incomeTax(partSal)) : incomeTax(base1 + taxableRent) - incomeTax(base1);
      if (taxableRent < 0 && !ngSaid) { ngSaid = true; say(year, 'goal', `Negative gearing: your rental losses cut your tax by about ${fmt(-rentTax)} this year.`); }

      // Gifts and inheritances land in savings
      for (const gft of p.gifts ?? []) if (Math.max(gft.year, y0 + 1) === year && gft.amount > 0) {
        cash += gft.amount; giftIn += gft.amount;
        say(year, 'gift', `${gft.kind === 'inheritance' ? 'Inheritance' : 'Gift'}${gft.from ? ` from ${gft.from}` : ''}: ${fmt(gft.amount)}${gft.note ? ` (${gft.note})` : ''}, added to your savings.`);
      }
      // Liquidation events: sell some crypto or shares (after capital gains tax at your marginal rate), or sell a property
      for (const lq of p.liquidations ?? []) if (Math.max(lq.year, y0 + 1) === year) {
        const income = youSal + n(p.household.otherIncome);
        if (lq.asset === 'property') {
          const idx = sims.findIndex((x) => x.pid === lq.propertyId);
          if (idx < 0) continue;
          const s = sims[idx];
          const price = lq.salePrice ?? s.value;
          const costs = price * (lq.sellCostPct ?? SELL_COSTS * 100) / 100;
          const gain = Math.max(0, price - costs - s.cost);
          const tax = s.home ? 0 : Math.max(0, incomeTax(income + gain * 0.5) - incomeTax(income)); // main residence is CGT-free
          const net = price - costs - s.debt - tax;
          sims.splice(idx, 1);
          cash += net; liqIn += net; propSaleIn += net; liquidated += Math.max(1, net);
          say(year, 'liquidate', `Liquidation event: sell ${s.name} for about ${fmt(price)}. After ${fmt(costs)} in agent fees and selling costs, ${fmt(s.debt)} to pay out the loan${tax ? ` and an estimated ${fmt(tax)} in capital gains tax` : ''}, ${fmt(net)} goes into your savings.`);
          continue;
        }
        const bal = lq.asset === 'crypto' ? (cryptoIn ? cryptoBal : cryptoOut) : shares;
        if (bal < 1) continue;
        const f = lq.amount != null ? Math.min(1, lq.amount / bal) : Math.min(1, (lq.pct ?? 0) / 100);
        if (f <= 0) continue;
        let gross = 0, gain = 0;
        if (lq.asset === 'crypto') {
          if (cryptoIn) { gross = cryptoBal * f; gain = Math.max(0, cryptoBal - cryptoCost) * f; cryptoBal -= gross; cryptoCost *= 1 - f; }
          else { gross = cryptoOut * f; gain = Math.max(0, cryptoOut - cryptoOutCost) * f; cryptoOut -= gross; cryptoOutCost *= 1 - f; }
        } else { gross = shares * f; gain = Math.max(0, shares - shareCost) * f; shares -= gross; shareCost *= 1 - f; }
        if (gross < 1) continue;
        const tax = Math.max(0, incomeTax(income + gain * 0.5) - incomeTax(income));
        cash += gross - tax; liqIn += gross - tax; shareSaleIn += gross - tax; liquidated += gross - tax;
        say(year, 'liquidate', `Liquidation event: sell ${fmt(gross)} of your ${lq.asset}. After an estimated ${fmt(tax)} in capital gains tax, ${fmt(gross - tax)} goes into your savings.`);
      }

      const sellShares = (need: number) => {
        if (need <= 0 || shares <= 0) return;
        const gainShare = Math.max(0, 1 - shareCost / shares);
        const gross = Math.min(shares, need / (1 - gainShare * CGT_RATE));
        if (gross >= shares * 0.999 && shares > 1000 && !sharesGoneSaid) { sharesGoneSaid = true; say(year, 'sell', 'Your share portfolio is fully sold down by now.'); }
        shareCost *= 1 - gross / shares; shares -= gross; cash += gross * (1 - gainShare * CGT_RATE); saleIn += gross * (1 - gainShare * CGT_RATE); shareSaleIn += gross * (1 - gainShare * CGT_RATE);
      };
      const sellProperty = (idx: number, why: string, reason: 'loan' | 'income') => {
        const s = sims[idx];
        const proceeds = s.value * (1 - SELL_COSTS) - s.debt - Math.max(0, s.value - s.cost) * CGT_RATE;
        sims.splice(idx, 1);
        cash += proceeds; saleIn += Math.max(0, proceeds); propSaleIn += Math.max(0, proceeds); sold.push(s.name);
        sales.push({ year, age, name: s.name, net: proceeds / infl(i), reason });
        say(year, 'sell', `Sell ${s.name} for about ${fmt(s.value / infl(i))} (in today’s money)${why}, freeing about ${fmt(proceeds / infl(i))} after the loan, selling costs and tax.`);
      };

      const bigBuys = p.goals.events.filter((ev) => Math.max(ev.year, y0 + 1) === year && n(ev.amount) > 0); // big purchases, in today's money
      const eventCost = bigBuys.reduce((t, ev) => t + n(ev.amount) * infl(i), 0) + renoCost;
      if (working) {
        cash += net + propNet + offsetSaving - living - debtRepay - eventCost - rentTax; // planned one-off costs come before investing
        // Shares are bought only from savings above the emergency fund: you can't invest money you don't have
        const waitForBuys = n(p.goals.shareStartAfter);
        sharePlanned = waitForBuys > 0 && purchases.length < waitForBuys ? 0 : shareMonthly * 12 * infl(i);
        if (waitForBuys > 0 && sharePlanned > 0 && !shareStartSaid) { shareStartSaid = true; say(year, 'shares', `Start investing ${fmt(shareMonthly)} a month in shares (in today’s money), now that property ${p.properties.length + waitForBuys} is bought.`); }
        contribution = Math.min(sharePlanned, Math.max(0, cash - buffer * infl(i)));
        shares += contribution; shareCost += contribution; cash -= contribution;
        if (sharePlanned > 0 && contribution < sharePlanned * 0.98 && !shareShortSaid && (!n(p.goals.shareStartAfter) || shareStartSaid)) { shareShortSaid = true; say(year, 'shares', `Your savings can’t cover the full ${fmt(shareMonthly)} a month share plan this year, so only ${fmt(contribution / 12 / infl(i))} a month goes in. Shares are only bought from money above your emergency fund.`); }
        if (cash < 0 && shortfallYear == null) shortfallYear = year;
        // Cash plan: anything above the most they want accessible goes into shares
        if (cp?.sweep && cp.accessMax != null) {
          const capNow = (buffer + n(cp.accessMax)) * infl(i); // emergency fund + what they want within reach
          if (cash > capNow + 100) {
            const ex = cash - capNow; cash -= ex; sweepBal += ex; sweepCost += ex;
            if (!sweepSaid) { sweepSaid = true; say(year, 'shares', `Your cash passes your emergency fund plus the ${fmt(n(cp.accessMax))} you want to keep within reach (in today’s money), so the extra starts going into shares. They’re sold down when a property needs the deposit.`); }
          }
        }
      } else {
        if (age === retireAge) {
          if (sweepBal > 1) { shares += sweepBal; shareCost += sweepCost; sweepBal = 0; sweepCost = 0; } // spare-cash shares join your portfolio
          sharesAtRetire = shares;
          // Stopping work: investments that still carry a loan (and weren't set to be paid off) are sold
          const at = events.length;
          for (let k = sims.length - 1; k >= 0; k--) if (sims[k].invest && !sims[k].payOff && sims[k].debt > 1000) sellProperty(k, '', 'loan');
          const snap = `After that you’d have about ${fmt(sup / infl(i))} in super, ${fmt(shares / infl(i))} in shares, ${cryptoBal > 1000 ? `${fmt(cryptoBal / infl(i))} in crypto, ` : ''}${fmt(Math.max(0, cash) / infl(i))} in cash and ${sims.length} ${sims.length === 1 ? 'property' : 'properties'} (in today’s money).`;
          const sold = events.length - at;
          say(year, 'retire', `Stop work at ${retireAge}${sold ? ` and sell the ${sold === 1 ? 'property that still has a loan and isn’t' : `${sold} properties that still have a loan and aren’t`} set to be paid off (below). ${snap}` : `. ${snap.replace('After that you’d', 'You’d')}`} From here you live on ${fmt(p.goals.passiveIncome)} a year.`);
          events.splice(at, 0, events.pop()!);
        }
        // A home loan still owing in retirement is cleared from savings, then from super once it can be reached
        for (const s of sims) if (s.home && s.debt > 1000) {
          const fromCash = Math.min(Math.max(0, cash - retireBuffer * infl(i)), s.debt); cash -= fromCash; s.debt -= fromCash;
          let fromSuper = 0;
          if (age >= PRESERVATION_AGE && s.debt > 0) { fromSuper = Math.min(sup, s.debt); sup -= fromSuper; s.debt -= fromSuper; }
          if (s.debt <= 1000) { s.debt = 0; say(year, 'debt', `Pay off the rest of the ${s.name} home loan${fromSuper > 0 ? ` with ${fmt(fromSuper / infl(i))} from super` : ' from savings'}.`); }
        }
        // Retired: spend the income goal (plus any dependants still at home). Super pays first (from 60), then rent and savings, then shares, then investment property sales.
        spendGoal = p.goals.passiveIncome * infl(i) + dependantsMonthly(p, i) * 12 * infl(i);
        if (age === PRESERVATION_AGE && sup > 0 && age > retireAge) say(year, 'super', `Super opens at 60: about ${fmt(sup / infl(i))} (in today’s money). It now pays your yearly income first.`);
        let superDraw = 0;
        if (age >= PRESERVATION_AGE && sup > 0) {
          superDraw = Math.min(sup, Math.max(sup * minDrawdown(age), spendGoal));
          sup -= superDraw; superDrawn = superDraw;
          if (sup < 1000 && superDraw > 0 && !superGone) { superGone = true; sup = 0; say(year, 'super', 'Your super is used up. Rent, savings and shares take over.'); }
        }
        cash += propNet + offsetSaving + superDraw - spendGoal - debtRepay - renoCost - rentTax;
        const floor = retireBuffer * infl(i);
        if (cash < floor - 1) sellShares(floor - cash);
        if (cash < floor - 1 && cryptoBal > 0) {
          const need = floor - cash;
          const gainShare = Math.max(0, 1 - cryptoCost / cryptoBal);
          const gross = Math.min(cryptoBal, need / (1 - gainShare * CGT_RATE));
          if (gross >= cryptoBal * 0.999 && cryptoBal > 1000) say(year, 'sell', 'Your crypto is fully sold down by now.');
          cryptoCost *= 1 - gross / cryptoBal; cryptoBal -= gross; cash += gross * (1 - gainShare * CGT_RATE); saleIn += gross * (1 - gainShare * CGT_RATE); shareSaleIn += gross * (1 - gainShare * CGT_RATE);
        }
        while (cash < floor - 1) {
          const idx = sims.map((s, k) => ({ s, k })).filter((x) => x.s.invest).map((x) => x.k).pop(); // newest investment first
          if (idx == null) break;
          sellProperty(idx, '', 'income');
        }
        // Spare cash (extra super drawn, rent, sale money) is invested in shares rather than left idle
        if (cash > floor * 1.25) {
          const extra = cash - floor; cash -= extra; shares += extra; shareCost += extra;
          if (!reinvestSaid) { reinvestSaid = true; say(year, 'shares', 'Money you don’t need straight away (rent, sale proceeds, required super payments) is invested in shares.'); }
        }
        spendFunded = cash >= 0 ? spendGoal : Math.max(0, spendGoal + cash);
        if (cash < 0 && runsOutAge == null) { runsOutAge = age; say(year, 'runout', `Money runs out at ${age}: your super, rent, savings and investments can no longer fund ${fmt(p.goals.passiveIncome)} a year.${sims.some((x) => x.home) ? ' You’d still own your home, which is why the chart keeps a balance after this point.' : ''}`); }
      }
      for (const ev of bigBuys) { if (!working) cash -= n(ev.amount) * infl(i); say(year, 'cost', `${ev.label || 'Big purchase'}: about ${fmt(n(ev.amount))} (in today’s money; ${fmt(n(ev.amount) * infl(i))} at the time), paid from your savings.`); }

      // Buying: when equity + spare cash covers the deposit and a lender would approve the loan
      const ownedNow = p.properties.length + purchases.length;
      if (working && ownedNow < p.goals.targetProperties) {
        const k = purchases.length;
        const plan = p.plannedPurchases?.[k];
        const growth = (plan?.growth ?? 5) / 100;
        const price = (plan?.price ?? a.newPurchasePrice) * Math.pow(1 + growth, i);
        const yieldPct = plan?.yieldPct ?? a.newPurchaseYield;
        const rate = plan?.rate ?? a.newLoanRate;
        // A home you'll live in (owner-occupier) earns no rent and pays no capital gains tax. First home buyer benefits only apply to a first home you live in.
        const asHome = (plan?.use ?? (plan?.firstHome ? 'home' : 'investment')) === 'home';
        const fhb = asHome && plan?.firstHome && p.properties.length === 0 && k === 0 ? plan.fhb ?? {} : null;
        // Moving out of a home you own: either sell it (the money helps fund this purchase) or keep it and rent it out
        const oldIdx = asHome ? sims.findIndex((s) => s.home) : -1;
        const old = oldIdx >= 0 ? sims[oldIdx] : null;
        const sellOld = !!old && plan?.oldHome === 'sell';
        const oldNet = old && sellOld ? old.value * (1 - SELL_COSTS) - old.debt : 0; // a main residence is free of capital gains tax
        const oldRent = old && !sellOld ? old.value * ((plan?.oldHomeYield ?? a.newPurchaseYield) / 100) * (50 / 52) : 0;
        const assessed = sellOld ? sims.filter((_, j) => j !== oldIdx) : old ? sims.map((s, j) => (j === oldIdx ? { ...s, rent: oldRent } : s)) : sims;
        const costsPct = (fhb?.noStampDuty ? 1 : plan?.costsPct ?? 5) / 100; // with no stamp duty, roughly legals and inspections are left
        const grant = fhb?.grant ? n(fhb.grantAmount ?? 15000) : 0;
        const usable = (sellOld ? assessed : sims).reduce((t, s) => t + Math.max(0, s.value * (a.lvr / 100) - s.debt), 0);
        const deposit = Math.max(0, price * ((fhb?.deposit5 ? 5 : plan?.depositPct ?? 20) / 100 + costsPct) - grant);
        let spare = Math.max(0, cash - buffer * infl(i) + oldNet);
        const cashOnly = spare;
        // Shares bought with spare cash count towards the deposit, after the capital gains tax on selling them
        const incNow = youSal + n(p.household.otherIncome);
        const sweepTax = (gross: number) => { const gf = sweepBal > 0 ? Math.max(0, 1 - sweepCost / sweepBal) : 0; return Math.max(0, incomeTax(incNow + gross * gf * 0.5) - incomeTax(incNow)); };
        if (sweepBal > 1) spare += sweepBal - sweepTax(sweepBal);
        // The most a lender would lend now (car loans and cards only count for the first new purchase)
        const maxLoan = Math.max(0, pv(rate + a.serviceBuffer, 30, serviceSurplus(assessed, youSal, partSal, living, k === 0)));
        // Cash needed: at least whatever equity can't cover of the deposit, and enough to keep the loan within what a lender allows
        const total = price * (1 + costsPct) - grant;
        const needCash = Math.max(0, deposit - usable, total - maxLoan);
        const fromCash = Math.min(spare, Math.max(needCash, Math.min(spare, deposit)));
        const fromEquity = Math.max(0, deposit - fromCash);
        const newLoan = total - fromCash;
        if (spare >= needCash && newLoan <= maxLoan + 1) {
          const prevBlock = block;
          block = null;
          if (fromCash > cashOnly + 1 && sweepBal > 1) {
            const need = fromCash - cashOnly;
            let g = Math.min(sweepBal, need);
            for (let it = 0; it < 4; it++) g = Math.min(sweepBal, need + sweepTax(g));
            const tax = sweepTax(g), got = g - tax;
            sweepCost *= 1 - g / sweepBal; sweepBal -= g; cash += got; liqIn += got; shareSaleIn += got; liquidated += got; cashSharesTax += tax;
            say(year, 'liquidate', `Sell ${fmt(g)} of the shares your spare cash went into, for this deposit. After about ${fmt(tax)} in capital gains tax, ${fmt(got)} goes towards the purchase.`);
          }
          const label = plan?.label || `Property ${ownedNow + 1}`;
          if (old && sellOld) {
            sims.splice(oldIdx, 1);
            cash += oldNet; saleIn += Math.max(0, oldNet); propSaleIn += Math.max(0, oldNet); sold.push(old.name);
            sales.push({ year, age, name: old.name, net: oldNet / infl(i), reason: 'move' });
            say(year, 'sell', `Sell ${old.name}, your current home, when you move into ${label}. After selling costs and paying out its loan, about ${fmt(oldNet)} goes towards the new home. There’s no capital gains tax on the home you live in.`);
          } else if (old) {
            // Rented out after being your home: its value now is its starting point for capital gains tax
            old.home = false; old.invest = true; old.pay = 1; old.rent = oldRent; old.mgmt = (plan?.mgmtPct ?? 7) / 100; old.cost = old.value;
            say(year, 'goal', `Move out of ${old.name} and rent it out for about ${fmt(oldRent / 52 / infl(i))} a week (in today’s money). From now it’s an investment property; its value today becomes its starting point for capital gains tax.`);
          }
          cash -= fromCash;
          sims.push({ name: label, value: price, cost: price, debt: newLoan, rate, ioLeft: plan?.ioFirst5 === false ? 0 : 5, years: 30, rent: asHome ? 0 : price * (yieldPct / 100) * (50 / 52), costs: price * ((plan?.holdingPct ?? 1.2) / 100), mgmt: (plan?.mgmtPct ?? 7) / 100, g: growth, invest: !asHome, pay: asHome ? share : 1, payOff: asHome ? plan?.payOff !== false : !!plan?.payOff, home: asHome,
            ng: !asHome && !!plan?.newBuild, ngUntil: !asHome && !plan?.newBuild ? 2027 : undefined, carry: 0, pid: plan?.id });
          if (asHome && renting) { renting = false; baseLivingAdj -= housingMonthly(p); say(year, 'goal', `You stop paying rent once you move into ${label}.`); }
          if (grant) { giftIn += grant; }
          purchases.push({ year, price, id: plan?.id });
          bought = price;
          const via = [fromEquity > 1000 ? `${fmt(fromEquity)} of equity` : '', fromCash > 1000 ? `${fmt(fromCash)} of savings` : ''].filter(Boolean).join(' and ');
          const waited = prevBlock && waitFrom != null && waitFrom < year - 1 ? (prevBlock.reason === 'servicing' ? ' It can’t happen sooner because a lender wouldn’t lend enough on your income until now.' : ' It can’t happen sooner because your equity and savings don’t cover the deposit and costs until now.') : '';
          const loanPlan = ` ${plan?.ioFirst5 === false ? 'Principal and interest from day one' : 'Interest-only for 5 years, then principal and interest'}${asHome ? (plan?.payOff !== false ? `, paid off by ${retireAge}` : `. Any loan left at ${retireAge} is paid from savings, then super`) : plan?.payOff ? `, paid off by ${retireAge}` : `. Sold at ${retireAge} if a loan is left`}.`;
          waitFrom = null;
          const fhbNote = fhb ? ` First home buyer help: ${[fhb.deposit5 && '5% deposit with no mortgage insurance', fhb.grant && `a ${fmt(grant)} First Home Owner Grant`, fhb.noStampDuty && 'no stamp duty'].filter(Boolean).join(', ') || 'none ticked'}.` : '';
          const ngNote = !asHome ? (plan?.newBuild ? ' As a new build it keeps negative gearing.' : ' As an established property bought after Budget night 2026, its rental losses can’t reduce your other tax from July 2027. They carry forward against its future rent.') : '';
          say(year, 'buy', `Buy ${label}${fhb ? ' as your first home' : asHome ? ' as your new home' : ''} for about ${fmt(price / infl(i))} (in today’s money; ${fmt(price)} at the time), using ${via || 'equity'} and borrowing ${fmt(newLoan)}.${waited}${fhb ? '' : loanPlan}${fhbNote}${ngNote}`);
        } else {
          if (waitFrom == null) waitFrom = year;
          block = { year, reason: deposit - usable > spare ? 'deposit' : 'servicing', price, deposit, available: usable + spare, monthlyShort: Math.max(0, pmt(rate + a.serviceBuffer, 30, total - spare) - pmt(rate + a.serviceBuffer, 30, maxLoan)) };
        }
      }
    }

    const propertyValue = sims.reduce((t, s) => t + s.value, 0);
    const propertyDebt = sims.reduce((t, s) => t + s.debt, 0);
    const rentNet = sims.filter((s) => s.invest).reduce((t, s) => t + s.rent * (1 - s.mgmt) - s.costs - (s.debt * s.rate) / 100, 0);
    const passiveIncome = rentNet + shares * 0.04 + (age >= 60 ? sup * 0.05 : 0);
    const totalRepay = (delta: number) => sims.reduce((t, s) => t + (s.ioLeft > 0 ? (s.debt * (s.rate + delta)) / 100 : pmt(s.rate + delta, s.years, s.debt) * 12), 0);
    const income = working ? afterTax(youSal + n(p.household.otherIncome)) + (partSal ? afterTax(partSal) : 0) : 0;
    const monthlyNet = working
      ? (income + sims.reduce((t, s) => t + (s.invest ? s.rent * (1 - s.mgmt) : 0) - s.costs, 0) - totalRepay(0) - living - contribution) / 12
      : (rentNet - spendGoal) / 12;
    points.push({
      year, age, propertyValue, propertyDebt, propertyEquity: propertyValue - propertyDebt, shares: shares + sweepBal, cashShares: sweepBal, super: sup, cash,
      crypto: cryptoBal, netWorth: propertyValue - propertyDebt + shares + sweepBal + sup + cash + cryptoBal - Math.max(0, otherDebt) - Math.max(0, hecsBal),
      passiveIncome, passiveIncomeReal: passiveIncome / infl(i), properties: sims.length, investProps: sims.filter((s) => s.invest).length,
      borrowing: i === 0 ? pos.bc.capacity : working ? Math.max(0, pv(a.newLoanRate + a.serviceBuffer, 30, serviceSurplus(sims, youSal, partSal, living, false))) : 0,
      monthlySavings: monthlyNet, repayUp2: totalRepay(2), repayBase: totalRepay(0), repayDown2: totalRepay(-2), bought,
      spendGoalReal: working ? p.goals.passiveIncome : spendGoal / infl(i), spendFundedReal: working ? passiveIncome / infl(i) : spendFunded / infl(i), shareContribution: contribution, sharePlanned, rentIncome: sims.filter((x) => x.invest).reduce((t, x) => t + x.rent, 0), superDrawn, paidOff: paidOff.length ? paidOff : undefined, sold: sold.length ? sold : undefined, payNet, investNet, saleIn, giftIn, liqIn, shareSaleIn, propSaleIn, propNet: propNetY, spending: working ? living : spendGoal, liquidated: liquidated || undefined,
    });
  }
  if (runsOutAge == null) say(y0 + (endAge - startAge), 'goal', `Your money lasts to ${endAge}, with about ${fmt((points[points.length - 1].netWorth) / infl(endAge - startAge))} (in today’s money) left over.`);
  events.sort((x, y) => x.year - y.year);
  return { points, purchases, retireYear, block: purchases.length + p.properties.length >= p.goals.targetProperties ? null : block, events, runsOutAge, shortfallYear, sharesAtRetire, buffer, shareMonthly, requiredShareMonthly: reqMonthly, cryptoExcluded, cashSharesTax, sales };
}

const fmt = (v: number) => {
  const x = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (x >= 1e6) return `${s}$${(x / 1e6).toFixed(x >= 1e7 ? 1 : 2)}m`;
  if (x >= 1e4) return `${s}$${Math.round(x / 1e3)}k`;
  return `${s}$${Math.round(x).toLocaleString('en-AU')}`;
};

/** What the shares reach by retirement (today's money, to the nearest $1,000) as the plan stands. Used as the goal when the person set a monthly amount. */
export function sharesGoalFromPlan(p: Profile, quotes: Quotes): number {
  const years = Math.max(1, p.goals.retirementAge - (p.household.you.age ?? 35));
  return Math.round(project(p, quotes).sharesAtRetire / Math.pow(1 + p.assumptions.inflation / 100, years) / 1000) * 1000;
}

/** The monthly amount (today's money, to the nearest $10) that reaches a shares goal by retirement, allowing for a delayed start. Null if it can't be reached. */
export function monthlyForShareGoal(p: Profile, quotes: Quotes, target: number): number | null {
  const at = (v: number) => { const x: Profile = JSON.parse(JSON.stringify(p)); x.goals.shareMonthly = v; return sharesGoalFromPlan(x, quotes); };
  if (target <= 0 || at(30000) < target) return null;
  let lo = 0, hi = 30000;
  for (let k = 0; k < 16; k++) { const mid = (lo + hi) / 2; if (at(mid) >= target) hi = mid; else lo = mid; }
  return Math.ceil(hi / 10) * 10;
}
