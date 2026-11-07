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

export function livingCosts(p: Profile) {
  const f = p.finances;
  return f.livingMode === 'breakdown' ? Object.values(f.livingBreakdown ?? {}).reduce((a: number, v) => a + n(v), 0) : n(f.livingMonthly);
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
  const living = Math.max(livingCosts(p), livingFloor(p)) + housingMonthly(p);
  const cardLimits = p.finances.debts.filter((d) => d.kind === 'credit-card').reduce((s, d) => s + n(d.limit), 0) - n(overrides.cardLimitCut);
  const commitments = p.finances.debts.filter((d) => d.kind !== 'credit-card' && d.kind !== 'hecs').reduce((s, d) => s + n(d.monthlyRepayment), 0) + Math.max(0, cardLimits) * 0.038
    + hecsAnnual(p).compulsory / 12;
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
  const hecs = hecsAnnual(p);
  const takeHome = (afterTax(n(hh.you.salary) + n(hh.otherIncome)) + (hh.hasPartner ? afterTax(n(hh.partner.salary)) : 0) - hecs.compulsory) / 12;
  const f = p.finances;
  const homeLoanRepay = f.housing === 'own' && f.mortgageMonthly != null
    ? n(f.mortgageMonthly) * 12
    : props.reduce((a, x) => a + (x.pr.use === 'home' ? x.s.repayments : 0), 0);
  const homeCosts = homeLoanRepay * mortgageShare(p) + props.reduce((a, x) => a + (x.pr.use === 'home' ? n(x.pr.annualCosts) : 0), 0);
  const living = Math.max(livingCosts(p), livingFloor(p));
  const monthlySurplus = takeHome + (propCashflow - homeCosts) / 12 - living - housingMonthly(p)
    - f.debts.filter((d) => d.kind !== 'hecs').reduce((a, d) => a + n(d.monthlyRepayment), 0) - hecs.voluntary / 12;
  return { takeHome, monthlySurplus, hecs, living, homeCosts, props, propValue, propDebt, usable, shares, superBal, cash, otherDebt, assets, liabilities, netWorth: assets - liabilities, bc, propCashflow };
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
  const endAge = Math.max(retireAge + 1, startAge + 5, Math.min(110, p.goals.lifeExpectancy ?? 90));
  const y0 = thisYear();
  const retireYear = y0 + (retireAge - startAge);

  const share = mortgageShare(p);
  type Sim = { value: number; debt: number; rate: number; io: boolean; years: number; rent: number; costs: number; mgmt: number; g: number; invest: boolean; pay?: number };
  const sims: Sim[] = pos.props.map(({ pr, s }) => ({
    value: s.val.value, debt: s.debt, rate: s.avgRate || 6, io: pr.loans.every((l) => l.type === 'io'),
    years: Math.max(1, ...pr.loans.map((l) => n(l.yearsLeft) || 25)), rent: s.rentGross, costs: n(pr.annualCosts),
    mgmt: n(pr.managementPct) / 100, g: pr.growthRate / 100, invest: pr.use === 'investment', pay: pr.use === 'home' ? share : 1,
  }));
  let shares = pos.shares.value;
  let sup = pos.superBal;
  let cash = pos.cash;
  let otherDebt = pos.otherDebt - hecsAnnual(p).balance;
  let youSal = n(p.household.you.salary);
  let partSal = p.household.hasPartner ? n(p.household.partner.salary) : 0;
  let living = (Math.max(livingCosts(p), livingFloor(p)) + housingMonthly(p)) * 12;
  let hecsBal = hecsAnnual(p).balance;
  let newPrice = a.newPurchasePrice;
  const buffer = n(p.finances.buffer) || living / 4;
  const otherRepay = p.finances.debts.filter((d) => d.kind !== 'hecs').reduce((s, d) => s + n(d.monthlyRepayment), 0) * 12;
  const cardLoad = p.finances.debts.filter((d) => d.kind === 'credit-card').reduce((s, d) => s + n(d.limit), 0) * 0.038;
  const serviceSurplus = (list: { rate: number; debt: number; rent: number }[], ys: number, ps: number, liv: number, otherAnnual: number) => {
    const rent80 = list.reduce((t, s) => t + s.rent, 0) * 0.8;
    const net = (afterTax(ys + n(p.household.otherIncome) * 0.8 + rent80) + (ps ? afterTax(ps) : 0) - (hecsBal > 0 ? hecsAnnual(p, ys, ps).compulsory : 0)) / 12;
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
        propNet += s.rent * (1 - s.mgmt) - s.costs - repay * (s.invest ? 1 : s.pay ?? 1);
      }
      youSal = working ? youSal * 1.03 : 0;
      partSal = working ? partSal * 1.03 : 0;
      living *= 1 + a.inflation / 100;
      const sg = (youSal + partSal) * 0.12;
      sup = sup * (1 + a.superReturn / 100) + sg * 0.85;
      shares *= 1 + a.shareReturn / 100;
      const debtRepay = otherDebt > 0 ? Math.min(otherDebt, otherRepay) : 0;
      otherDebt -= debtRepay;
      let hecsPaid = 0;
      if (hecsBal > 0) { const h = hecsAnnual(p, youSal, partSal); hecsPaid = Math.min(hecsBal, h.compulsory + h.voluntary); hecsBal -= hecsPaid; }
      const net = afterTax(youSal + n(p.household.otherIncome)) + (partSal ? afterTax(partSal) : 0) - hecsPaid;
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
      netWorth: propertyValue - propertyDebt + shares + sup + cash - otherDebt - Math.max(0, hecsBal),
      passiveIncome, passiveIncomeReal: passiveIncome / deflator, properties: sims.length,
      borrowing: i === 0 ? pos.bc.capacity : working ? Math.max(0, pv(a.newLoanRate + a.serviceBuffer, 30, surplusM)) : 0,
      monthlySavings: monthlyNet, repayUp2: totalRepay(2), repayBase: totalRepay(0), repayDown2: totalRepay(-2), bought,
    });
  }
  return { points, purchases, retireYear };
}
