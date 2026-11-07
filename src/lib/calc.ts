import type { Holding, Profile, Property } from './types';

const n = (v: number | null | undefined) => (v == null || !isFinite(v) ? 0 : v);
const thisYear = () => new Date().getFullYear();

/* ---------- Loans ---------- */
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

/* ---------- Tax (2025–26 resident rates + 2% Medicare levy) ---------- */
export function incomeTax(gross: number) {
  const g = Math.max(0, gross);
  let t = 0;
  if (g > 190000) t = 51638 + (g - 190000) * 0.45;
  else if (g > 135000) t = 31288 + (g - 135000) * 0.37;
  else if (g > 45000) t = 4288 + (g - 45000) * 0.3;
  else if (g > 18200) t = (g - 18200) * 0.16;
  return t + (g > 27222 ? g * 0.02 : 0);
}
export const afterTax = (gross: number) => gross - incomeTax(gross);

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
  if (l.type === 'io') return (owing * n(l.rate)) / 100;
  return pmt(n(l.rate), n(l.yearsLeft) || 25, n(l.balance)) * 12 - (n(l.offset) * n(l.rate)) / 100;
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
  const interest = p.loans.reduce((a, l) => a + (Math.max(0, n(l.balance) - n(l.offset)) * n(l.rate)) / 100, 0);
  const cashflow = rentGross - mgmt - n(p.annualCosts) - repayments;
  const grossYield = val.value ? ((n(p.weeklyRent) * 52) / val.value) * 100 : 0;
  const growthSincePurchase = p.purchasePrice ? ((val.value - p.purchasePrice) / p.purchasePrice) * 100 : null;
  const avgRate = debt ? p.loans.reduce((a, l) => a + n(l.rate) * n(l.balance), 0) / debt : 0;
  const lvrNow = val.value ? (debt / val.value) * 100 : 0;
  return { val, debt, offset, equity, usable, rentGross, mgmt, repayments, interest, cashflow, grossYield, growthSincePurchase, avgRate, lvrNow };
}

/* ---------- Holdings ---------- */
export type Quotes = Record<string, { price: number; change: number; asOf: string }>;
export const holdingKey = (h: Pick<Holding, 'code' | 'exchange'>) => `${h.exchange}:${h.code}`;

export function holdingsStats(holdings: Holding[], quotes: Quotes) {
  const rows = holdings.map((h) => {
    const q = quotes[holdingKey(h)];
    const price = q?.price ?? h.avgCost;
    const value = price * h.units;
    const cost = h.avgCost * h.units;
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
  const living = Math.max(n(p.finances.livingMonthly), livingFloor(p));
  const cardLimits = p.finances.debts.filter((d) => d.kind === 'credit-card').reduce((s, d) => s + n(d.limit), 0) - n(overrides.cardLimitCut);
  const commitments = p.finances.debts.filter((d) => d.kind !== 'credit-card').reduce((s, d) => s + n(d.monthlyRepayment), 0) + Math.max(0, cardLimits) * 0.038;
  const assessed = p.properties.reduce(
    (s, pr) => s + pr.loans.reduce((t, l) => t + pmt(n(l.rate) + a.serviceBuffer, Math.max(5, n(l.yearsLeft) || 25), n(l.balance)), 0), 0);
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
  const takeHome = (afterTax(n(hh.you.salary) + n(hh.otherIncome)) + (hh.hasPartner ? afterTax(n(hh.partner.salary)) : 0)) / 12;
  const homeCosts = props.reduce((a, x) => a + (x.pr.use === 'home' ? x.s.repayments + n(x.pr.annualCosts) : 0), 0);
  const monthlySurplus = takeHome + (propCashflow - homeCosts) / 12 - Math.max(n(p.finances.livingMonthly), livingFloor(p))
    - p.finances.debts.reduce((a, d) => a + n(d.monthlyRepayment), 0);
  return { takeHome, monthlySurplus, props, propValue, propDebt, usable, shares, superBal, cash, otherDebt, assets, liabilities, netWorth: assets - liabilities, bc, propCashflow };
}

/* ---------- Projection ---------- */
export interface YearPoint {
  year: number; age: number; propertyValue: number; propertyDebt: number; propertyEquity: number; shares: number; super: number; cash: number;
  netWorth: number; passiveIncome: number; passiveIncomeReal: number; properties: number; borrowing: number; monthlySavings: number;
  repayUp2: number; repayBase: number; repayDown2: number; bought?: number;
}

export function project(p: Profile, quotes: Quotes): { points: YearPoint[]; purchases: { year: number; price: number }[]; retireYear: number } {
  const a = p.assumptions;
  const pos = position(p, quotes);
  const startAge = n(p.household.you.age) || 35;
  const retireAge = Math.max(startAge + 1, p.goals.retirementAge);
  const endAge = Math.max(retireAge + 8, startAge + 25);
  const y0 = thisYear();
  const retireYear = y0 + (retireAge - startAge);

  type Sim = { value: number; debt: number; rate: number; io: boolean; years: number; rent: number; costs: number; mgmt: number; g: number; invest: boolean };
  const sims: Sim[] = pos.props.map(({ pr, s }) => ({
    value: s.val.value, debt: s.debt, rate: s.avgRate || 6, io: pr.loans.every((l) => l.type === 'io'),
    years: Math.max(1, ...pr.loans.map((l) => n(l.yearsLeft) || 25)), rent: s.rentGross, costs: n(pr.annualCosts),
    mgmt: n(pr.managementPct) / 100, g: pr.growthRate / 100, invest: pr.use === 'investment',
  }));
  let shares = pos.shares.value;
  let sup = pos.superBal;
  let cash = pos.cash;
  let otherDebt = pos.otherDebt;
  let youSal = n(p.household.you.salary);
  let partSal = p.household.hasPartner ? n(p.household.partner.salary) : 0;
  let living = Math.max(n(p.finances.livingMonthly), livingFloor(p)) * 12;
  let newPrice = a.newPurchasePrice;
  const buffer = n(p.finances.buffer) || living / 4;
  const otherRepay = p.finances.debts.reduce((s, d) => s + n(d.monthlyRepayment), 0) * 12;
  const cardLoad = p.finances.debts.filter((d) => d.kind === 'credit-card').reduce((s, d) => s + n(d.limit), 0) * 0.038;
  const serviceSurplus = (list: { rate: number; debt: number; rent: number }[], ys: number, ps: number, liv: number, otherAnnual: number) => {
    const rent80 = list.reduce((t, s) => t + s.rent, 0) * 0.8;
    const net = (afterTax(ys + n(p.household.otherIncome) * 0.8 + rent80) + (ps ? afterTax(ps) : 0)) / 12;
    const assessed = list.reduce((t, s) => t + pmt(s.rate + a.serviceBuffer, 30, s.debt), 0);
    return net - Math.max(liv / 12, 0) - assessed - cardLoad - otherAnnual / 12;
  };
  const points: YearPoint[] = [];
  const purchases: { year: number; price: number }[] = [];

  for (let i = 0; i <= endAge - startAge; i++) {
    const year = y0 + i;
    const age = startAge + i;
    const working = age < retireAge;
    let bought: number | undefined;

    if (i > 0) {
      // grow & amortise
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
        propNet += s.rent * (1 - s.mgmt) - s.costs - repay;
      }
      youSal = working ? youSal * 1.03 : 0;
      partSal = working ? partSal * 1.03 : 0;
      living *= 1 + a.inflation / 100;
      const sg = (youSal + partSal) * 0.12;
      sup = sup * (1 + a.superReturn / 100) + sg * 0.85;
      shares *= 1 + a.shareReturn / 100;
      const debtRepay = otherDebt > 0 ? Math.min(otherDebt, otherRepay) : 0;
      otherDebt -= debtRepay;
      const net = afterTax(youSal + n(p.household.otherIncome)) + (partSal ? afterTax(partSal) : 0);
      const drawdown = working ? 0 : shares * 0.04;
      shares -= drawdown;
      cash += net + propNet + drawdown - living - debtRepay;
      for (const ev of p.goals.events) if (ev.year === year) cash -= ev.amount;
      // surplus beyond 2x buffer gets invested, as a disciplined investor would
      if (working && cash > buffer * 2) { shares += cash - buffer * 2; cash = buffer * 2; }
      newPrice *= 1.05;

      // acquisition engine: buy when equity + cash covers deposit and servicing allows
      if (working && sims.length < p.goals.targetProperties) {
        const usable = sims.reduce((t, s) => t + Math.max(0, s.value * (a.lvr / 100) - s.debt), 0);
        const deposit = newPrice * 0.25; // 20% deposit + ~5% stamp duty & costs
        const newLoan = newPrice * 1.05 - Math.min(Math.max(0, cash - buffer), deposit);
        const services = serviceSurplus(sims, youSal, partSal, living, otherDebt > 0 ? otherRepay : 0) - pmt(a.newLoanRate + a.serviceBuffer, 30, newLoan) > 0;
        if (usable + Math.max(0, cash - buffer) >= deposit && services) {
          const fromCash = Math.min(Math.max(0, cash - buffer), deposit);
          cash -= fromCash;
          sims.push({
            value: newPrice, debt: newPrice * 1.05 - fromCash, rate: a.newLoanRate, io: true, years: 30,
            rent: newPrice * (a.newPurchaseYield / 100) * (50 / 52), costs: newPrice * 0.012, mgmt: 0.07, g: 0.05, invest: true,
          });
          purchases.push({ year, price: newPrice });
          bought = newPrice;
        }
      }
    }

    const propertyValue = sims.reduce((t, s) => t + s.value, 0);
    const propertyDebt = sims.reduce((t, s) => t + s.debt, 0);
    const rentNet = sims.filter((s) => s.invest).reduce((t, s) => t + s.rent * (1 - s.mgmt) - s.costs - (s.debt * s.rate) / 100, 0);
    const passiveIncome = rentNet + shares * 0.04 + (age >= 60 ? sup * 0.05 : 0);
    const deflator = Math.pow(1 + a.inflation / 100, i);
    const totalRepay = (delta: number) => sims.reduce((t, s) => t + (s.io ? (s.debt * (s.rate + delta)) / 100 : pmt(s.rate + delta, s.years, s.debt) * 12), 0);
    const drawIncome = working ? 0 : shares * 0.04 + (age >= 60 ? sup * 0.05 : 0);
    const monthlyNet = (afterTax(youSal + n(p.household.otherIncome)) + (partSal ? afterTax(partSal) : 0) + drawIncome + sims.reduce((t, s) => t + s.rent * (1 - s.mgmt) - s.costs, 0) - totalRepay(0) - living) / 12;
    const surplusM = serviceSurplus(sims, youSal, partSal, living, otherDebt > 0 ? otherRepay : 0);
    points.push({
      year, age, propertyValue, propertyDebt, propertyEquity: propertyValue - propertyDebt, shares, super: sup, cash,
      netWorth: propertyValue - propertyDebt + shares + sup + cash - otherDebt,
      passiveIncome, passiveIncomeReal: passiveIncome / deflator, properties: sims.length,
      borrowing: i === 0 ? pos.bc.capacity : working ? Math.max(0, pv(a.newLoanRate + a.serviceBuffer, 30, surplusM)) : 0,
      monthlySavings: monthlyNet, repayUp2: totalRepay(2), repayBase: totalRepay(0), repayDown2: totalRepay(-2), bought,
    });
  }
  return { points, purchases, retireYear };
}
