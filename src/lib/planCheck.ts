import { holdingsStats, incomeTax, position, project, propertyStats, type Projection, type Quotes } from './calc';
import { money } from './format';
import type { Liquidation, Profile } from './types';

/**
 * Checks whether the plan holds together, and if it doesn't, tests changes against the same
 * projection so every recommendation is one that actually fixes the problem on these numbers.
 */
export interface PlanIdea { text: string; liquidation?: { asset: 'crypto' | 'shares'; pct: number } }
export interface PlanCheck { works: boolean; problems: string[]; fixes: string[]; good: string[]; ideas: PlanIdea[]; proj: Projection }

const clone = (p: Profile): Profile => JSON.parse(JSON.stringify(p));
const m = (v: number) => money(v, { compact: true });
const round = (v: number, step: number) => Math.floor(v / step) * step;

function propsOk(p: Profile, r: Projection) {
  const reached = p.properties.length + r.purchases.length >= p.goals.targetProperties;
  const deadlines = (p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - p.properties.length)).every((pp, k) => !pp.buyBy || (r.purchases[k] && r.purchases[k].year < pp.buyBy));
  return reached && deadlines;
}
const lastsOk = (r: Projection) => r.runsOutAge == null;
const cashOk = (r: Projection) => r.shortfallYear == null;

/** Largest value in [lo, hi] for which test passes, assuming it passes at lo and gets harder as the value rises. */
function bisect(lo: number, hi: number, test: (v: number) => boolean, steps = 12) {
  if (!test(lo)) return null;
  for (let i = 0; i < steps; i++) { const mid = (lo + hi) / 2; if (test(mid)) lo = mid; else hi = mid; }
  return lo;
}

/**
 * The most a person could put into shares each month (today's money) and still buy every planned property on time.
 * null when the properties don't fit even with no share plan.
 */
export function maxShareMonthly(p: Profile, quotes: Quotes): { monthly: number; sharesAtRetireReal: number } | null {
  if ((p.goals.targetProperties ?? 0) <= p.properties.length) return null;
  const at = (v: number) => { const x = clone(p); x.goals.shareMonthly = v; return project(x, quotes); };
  if (!propsOk(p, at(0))) return null;
  const hi = Math.max(20000, (p.goals.shareMonthly ?? 0) * 2);
  if (propsOk(p, at(hi))) return null; // shares don't compete with the property plan in any realistic range
  const best = bisect(0, hi, (v) => propsOk(p, at(v)), 14) ?? 0;
  const monthly = Math.floor(best / 50) * 50;
  const r = at(monthly);
  const years = Math.max(1, p.goals.retirementAge - (p.household.you.age ?? 35));
  return { monthly, sharesAtRetireReal: r.sharesAtRetire / Math.pow(1 + p.assumptions.inflation / 100, years) };
}

export function planCheck(p: Profile, quotes: Quotes): PlanCheck {
  const r = project(p, quotes);
  const g = p.goals;
  const owned = p.properties.length;
  const life = g.lifeExpectancy ?? 90;
  const retireAge = g.retirementAge;
  const planned = (p.plannedPurchases ?? []).slice(0, Math.max(0, g.targetProperties - owned));
  const run = (mod: (x: Profile) => void) => { const x = clone(p); mod(x); return project(x, quotes); };
  const problems: string[] = [];
  const fixes: string[] = [];
  const good: string[] = [];

  // 1. Savings running out while still working (usually repayments to pay loans off fast)
  if (!cashOk(r)) {
    problems.push(`Your savings run out in ${r.shortfallYear}, while you’re still working: loan repayments and living expenses would be more than you earn.`);
    const sellInstead = run((x) => { x.plannedPurchases?.forEach((pp) => { pp.payOff = false; }); x.properties.forEach((pr) => { if (pr.use === 'investment') pr.planPayOff = false; }); });
    if (cashOk(sellInstead)) fixes.push('Don’t pay the investment properties off by retirement. Paying them off that quickly needs bigger repayments than your income covers; selling them when you stop work avoids that.');
    const io = run((x) => { x.plannedPurchases?.forEach((pp) => { pp.ioFirst5 = true; }); });
    if (cashOk(io) && fixes.length === 0) fixes.push('Use interest-only loans for the first 5 years on new purchases, so repayments stay lower while you build up.');
    if (g.shareMonthly !== 0 && r.shareMonthly > 0) { const noShares = run((x) => { x.goals.shareMonthly = 0; }); if (cashOk(noShares)) fixes.push(`Pause the ${m(r.shareMonthly)} a month share plan until the loans are under control.`); }
  }

  // 2. Properties: not all bought, or not by the year wanted
  const reached = owned + r.purchases.length;
  if (reached < g.targetProperties) {
    const why = r.block?.reason === 'servicing' ? 'Borrowing power is what holds it back: a lender wouldn’t lend enough on your income.' : r.block?.reason === 'deposit' ? 'There isn’t enough equity and savings for the next deposit.' : '';
    problems.push(`You’d own ${reached} of the ${g.targetProperties} properties you want by ${retireAge}. ${why}`.trim());
  }
  planned.forEach((pp, k) => {
    if (!pp.buyBy) return;
    const got = r.purchases[k];
    if (!got || got.year >= pp.buyBy) problems.push(`${pp.label || `Property ${owned + k + 1}`}: you want it before ${pp.buyBy}, but ${got ? `the earliest it fits is ${got.year}` : 'it doesn’t fit before you stop work'}.`);
  });
  const cap = !propsOk(p, r) && r.shareMonthly > 0 ? maxShareMonthly(p, quotes) : null;
  if (cap) problems.push(`Your share plan of ${m(r.shareMonthly)} a month uses savings your property plan needs. Based on your property purchasing goals, the most you can invest in shares is about ${money(cap.monthly)} a month, which grows to about ${m(cap.sharesAtRetireReal)} by ${retireAge}.`);
  if (!propsOk(p, r)) {
    if (cap) fixes.push(`Invest ${money(cap.monthly)} a month in shares (set “Monthly investment” in Shares), or lower your share goal to about ${m(round(cap.sharesAtRetireReal, 50000))}.`);
    // Cheaper properties
    const scale = bisect(0.3, 1, (f) => propsOk(p, run((x) => { x.plannedPurchases?.forEach((pp) => { pp.price *= f; }); })));
    if (scale != null && scale < 0.97) {
      const prices = [...new Set(planned.map((pp) => m(round(pp.price * scale, 5000))))];
      fixes.push(`Choose cheaper properties: about ${prices.length === 1 ? `${prices[0]} each` : prices.join(', then ')} (in today’s money) would fit.`);
    }
    // Smaller share goal frees savings for deposits
    if (r.shareMonthly > 0 && !cap) {
      const target = g.sharesTarget ?? 0;
      const ok0 = propsOk(p, run((x) => { x.goals.shareMonthly = 0; }));
      if (ok0) {
        const best = g.shareMonthly == null && target > 0
          ? bisect(0, target, (t) => propsOk(p, run((x) => { x.goals.sharesTarget = t; })))
          : null;
        fixes.push(best != null && best > 50000
          ? `Lower your share portfolio goal to about ${m(round(best, 50000))}, so more of your savings go to property deposits.`
          : 'Pause the share plan while you buy, so your savings go to property deposits first.');
      }
    }
    // Fewer properties
    if (reached < g.targetProperties && reached > owned) fixes.push(`Aim for ${reached} properties instead of ${g.targetProperties}.`);
    else if (reached < g.targetProperties && reached === owned) fixes.push(`Hold off on adding properties for now: on these numbers none fits before ${retireAge}.`);
    // Move the deadline
    planned.forEach((pp, k) => {
      const got = r.purchases[k];
      if (pp.buyBy && got && got.year >= pp.buyBy) fixes.push(`Change ${pp.label || `property ${owned + k + 1}`} to “Before ${got.year + 1}”.`);
    });
    // Retiring later gives more years to buy
    if (reached < g.targetProperties) for (let d = 1; d <= 6 && g.retirementAge + d <= 70; d++) {
      if (owned + run((x) => { x.goals.retirementAge += d; }).purchases.length >= g.targetProperties) { fixes.push(`Keep working to ${g.retirementAge + d} to fit in all ${g.targetProperties} properties.`); break; }
    }
  }

  // 3. Money lasting through retirement
  if (!lastsOk(r)) {
    problems.push(`At ${m(g.passiveIncome)} a year, your money runs out at ${r.runsOutAge}, well before ${life}.`);
    const maxIncome = bisect(0, g.passiveIncome, (v) => lastsOk(run((x) => { x.goals.passiveIncome = v; })), 14);
    if (maxIncome != null && maxIncome > 10000) fixes.push(`Lower your yearly income after retirement to about ${m(round(maxIncome, 5000))}. That lasts to ${life}.`);
    for (let d = 1; d <= 8 && g.retirementAge + d <= 72; d++) {
      if (lastsOk(run((x) => { x.goals.retirementAge += d; }))) { fixes.push(`Or keep working to ${g.retirementAge + d}: more years of saving and fewer years to fund.`); break; }
    }
    if (g.targetProperties > owned && lastsOk(run((x) => { x.goals.targetProperties = Math.max(owned, x.goals.targetProperties - 1); }))) fixes.push(`Or aim for ${g.targetProperties - 1} properties: the last purchase costs more than it adds by retirement.`);
  }

  // 4. Shares short of goal with a custom amount
  const years = Math.max(1, retireAge - (p.household.you.age ?? 35));
  const sharesReal = r.sharesAtRetire / Math.pow(1 + p.assumptions.inflation / 100, years); // before any retirement sale money is added
  if ((g.sharesTarget ?? 0) > 0 && sharesReal < (g.sharesTarget ?? 0) * 0.97) {
    problems.push(`Investing ${m(r.shareMonthly)} a month, your shares reach about ${m(sharesReal)} by ${retireAge}, short of your ${m(g.sharesTarget ?? 0)} goal.`);
    fixes.push(`Invest about ${money(r.requiredShareMonthly)} a month (set “Monthly investment” in Shares), or lower your share goal to about ${m(round(sharesReal, 50000))}.`);
  }

  // What's working
  if (g.targetProperties > owned && propsOk(p, r)) good.push(`You reach ${g.targetProperties} properties, buying in ${r.purchases.map((x) => x.year).join(', ')}.`);
  if ((g.sharesTarget ?? 0) > 0 && sharesReal >= (g.sharesTarget ?? 0) * 0.97) good.push(`Investing ${m(r.shareMonthly)} a month, your shares reach about ${m(sharesReal)} by ${retireAge}.`);
  if (lastsOk(r)) {
    const last = r.points[r.points.length - 1];
    const left = last ? Math.max(0, last.netWorth) / Math.pow(1 + p.assumptions.inflation / 100, r.points.length - 1) : 0;
    good.push(`Living on ${m(g.passiveIncome)} a year from ${retireAge}, your money lasts past ${life}, with about ${m(left)} (in today’s money) to spare.`);
    // Room for more?
    if (propsOk(p, r) && cashOk(r) && g.targetProperties < 10 && g.wealthFocus !== 'shares') {
      const more = run((x) => { x.goals.targetProperties += 1; });
      const extra = more.purchases[r.purchases.length];
      if (extra && extra.year <= r.retireYear - 3 && lastsOk(more) && cashOk(more)) good.push(`There’s room for one more: property ${g.targetProperties + 1} would fit around ${extra.year}. Raise “Properties owned by retirement” to add it.`);
    }
  }
  if (cashOk(r) && position(p, quotes).monthlySurplus < 0) problems.push('You’re spending more than you earn each month right now. Check your living expenses in My Details.');

  // Ideas follow how they prefer to build wealth: share-focused people hear about owning fewer properties
  // and investing more, not about selling shares for property; property-focused people see property levers first.
  const focus = g.wealthFocus ?? 'balanced';
  const buy = buyIdeas(p, r, run, quotes, focus);
  const retire = lastsOk(r) && cashOk(r) && propsOk(p, r) ? retireIdeas(p, run).map((text) => ({ text })) : [];
  const equity = focus === 'property' ? [] : equityIdeas(p, r, run, focus);
  const ideas: PlanIdea[] = focus === 'shares' ? [...equity, ...retire, ...buy] : focus === 'property' ? [...buy, ...retire] : [...buy, ...equity, ...retire];
  return { works: problems.length === 0, problems, fixes: [...new Set(fixes)], good, ideas, proj: r };
}

/** Tested levers that would bring a property purchase forward. */
function buyIdeas(p: Profile, r: Projection, run: (mod: (x: Profile) => void) => Projection, quotes: Quotes, focus: 'property' | 'shares' | 'balanced' = 'balanced'): PlanIdea[] {
  const owned = p.properties.length;
  const planned = (p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - owned));
  if (planned.length === 0) return [];
  const base = planned.map((_, k) => r.purchases[k]?.year ?? null);
  const levers: { text: string; mod: (x: Profile) => void; liquidation?: PlanIdea['liquidation'] }[] = [];
  if (r.shareMonthly > 0 && focus !== 'shares') {
    if (!p.goals.shareStartAfter) levers.push({ text: `hold off on your ${m(r.shareMonthly)} a month share plan until it’s bought (tick the box in Shares)`, mod: (x) => { x.goals.shareMonthly = Math.round(r.shareMonthly); x.goals.shareStartAfter = 1; } });
    else levers.push({ text: 'pause the share plan until then', mod: (x) => { x.goals.shareMonthly = 0; } });
    levers.push({ text: `halve your share plan to about ${money(Math.round(r.shareMonthly / 2 / 50) * 50)} a month`, mod: (x) => { x.goals.shareMonthly = Math.round(r.shareMonthly / 2); } });
  }
  const withDebt = p.properties.filter((pr) => pr.loans.some((l) => (l.balance ?? 0) > 0));
  if (withDebt.some((pr) => pr.planIo5)) levers.push({ text: 'switch your current loans from interest-only to principal and interest', mod: (x) => { x.properties.forEach((pr) => { pr.planIo5 = false; }); } });
  if (withDebt.some((pr) => !pr.planIo5)) levers.push({ text: 'move your current loans to interest-only for 5 years, so repayments are lower while you save', mod: (x) => { x.properties.forEach((pr) => { pr.planIo5 = true; }); } });
  if (planned.some((pp) => pp.ioFirst5 === false)) levers.push({ text: 'use interest-only for the first 5 years on new purchases', mod: (x) => { x.plannedPurchases?.forEach((pp) => { pp.ioFirst5 = true; }); } });
  if (withDebt.some((pr) => pr.planPayOff && pr.use === 'investment') || planned.some((pp) => pp.payOff)) levers.push({ text: 'don’t pay the investment loans off by retirement (it means bigger repayments now)', mod: (x) => { x.properties.forEach((pr) => { if (pr.use === 'investment') pr.planPayOff = false; }); x.plannedPurchases?.forEach((pp) => { pp.payOff = false; }); } });
  // Selling some crypto or shares to fund the deposit, after capital gains tax (tested as a liquidation event this year)
  const y0 = new Date().getFullYear();
  for (const kind of (focus === 'shares' ? ['crypto'] : ['crypto', 'shares']) as ('crypto' | 'shares')[]) {
    for (const frac of [0.5, 1]) {
      const sale = saleAfterTax(p, quotes, kind, frac);
      if (!sale || sale.gross < 10000) continue;
      levers.push({
        text: `consider a liquidation event: sell ${frac === 1 ? 'all of your' : 'about half your'} ${kind} (${m(sale.gross)}). After an estimated ${m(sale.tax)} in capital gains tax, that adds about ${m(sale.net)} to your deposit savings. An accountant can help you time the sale${kind === 'shares' && (p.goals.sharesTarget ?? 0) > 0 ? ', and your share goal would need more invested later' : ''}`,
        mod: (x) => { (x.liquidations ??= []).push({ id: 'test', year: y0, asset: kind, pct: frac * 100 }); },
        liquidation: { asset: kind, pct: frac * 100 },
      });
    }
  }
  levers.push({ text: `aim for a property about 10% cheaper (around ${m(round(planned[0].price * 0.9, 5000))}, today’s money)`, mod: (x) => { x.plannedPurchases?.forEach((pp) => { pp.price *= 0.9; }); } });
  levers.push({ text: 'reduce your living expenses by about 10%', mod: (x) => { const f = x.finances; if (f.livingMonthly) f.livingMonthly *= 0.9; for (const k in f.livingBreakdown ?? {}) if (f.livingBreakdown[k]) f.livingBreakdown[k] = (f.livingBreakdown[k] ?? 0) * 0.9; } });

  const out: { k: number; gain: number; text: string; liquidation?: PlanIdea['liquidation'] }[] = [];
  for (const lv of levers) {
    const rr = run(lv.mod);
    if (!lastsOk(rr) || !cashOk(rr)) continue;
    let best: { k: number; gain: number; to: number } | null = null;
    planned.forEach((_, k) => {
      const was = base[k], now = rr.purchases[k]?.year ?? null;
      if (now == null) return;
      const gain = was == null ? 99 : was - now;
      if (gain >= 1 && !best) best = { k, gain, to: now }; // the next purchase that moves is the one worth talking about
    });
    if (best) {
      const b = best as { k: number; gain: number; to: number };
      const name = planned[b.k].label || `property ${owned + b.k + 1}`;
      out.push({ k: b.k, gain: b.gain, liquidation: lv.liquidation, text: base[b.k] == null
        ? `To fit ${name} in before you stop work (around ${b.to}), ${lv.text}.`
        : `To buy ${name} sooner (${b.to} instead of ${base[b.k]}), ${lv.text}.` });
    }
  }
  // For each asset, keep one sale idea: the smaller sale if it does as well as selling everything
  const pick = out.filter((x) => {
    if (!x.liquidation) return true;
    const twin = out.find((y) => y !== x && y.liquidation?.asset === x.liquidation!.asset);
    if (!twin) return true;
    const half = x.liquidation.pct < 100;
    const better = x.k < twin.k || (x.k === twin.k && x.gain > twin.gain);
    const same = x.k === twin.k && x.gain === twin.gain;
    return better || (same && half);
  });
  return pick.sort((a, b) => a.k - b.k || b.gain - a.gain).slice(0, 4).map((x) => ({ text: x.text, liquidation: x.liquidation }));
}

/** For people who'd rather build wealth in shares: own fewer properties and invest the difference, or start the share plan sooner. */
function equityIdeas(p: Profile, r: Projection, run: (mod: (x: Profile) => void) => Projection, focus: 'shares' | 'balanced'): PlanIdea[] {
  const out: PlanIdea[] = [];
  const g = p.goals;
  const owned = p.properties.length;
  const years = Math.max(1, g.retirementAge - (p.household.you.age ?? 35));
  const real = (v: number) => v / Math.pow(1 + p.assumptions.inflation / 100, years);
  const ok = (x: Projection) => lastsOk(x) && cashOk(x);
  // One (shares focus: or two) fewer property purchases, with the savings going into shares instead
  if (g.targetProperties > owned) {
    const t = focus === 'shares' && g.targetProperties - owned >= 2 && g.targetProperties >= 4 ? g.targetProperties - 2 : g.targetProperties - 1;
    const fewer = (v: number) => run((x) => { x.goals.targetProperties = t; x.goals.shareMonthly = v; x.goals.shareStartAfter = 0; });
    const fewerGoals = { ...p, goals: { ...g, targetProperties: t } };
    // The most a month that still buys the remaining properties on time and never runs short
    const most = bisect(Math.max(0, r.shareMonthly), Math.max(5000, r.shareMonthly * 4), (v) => { const x = fewer(v); return ok(x) && propsOk(fewerGoals, x); }, 12);
    if (most != null) {
      const rr = fewer(Math.floor(most / 50) * 50);
      // What actually goes in, on average, in today's money (shares only take savings above the emergency fund)
      const work = rr.points.filter((x) => x.year < rr.retireYear);
      const avg = work.reduce((t2, x, i) => t2 + x.shareContribution / Math.pow(1 + p.assumptions.inflation / 100, i), 0) / Math.max(1, work.length * 12);
      const monthly = Math.floor(avg / 50) * 50;
      const gain = real(rr.sharesAtRetire) - real(r.sharesAtRetire);
      if (gain > 50000 && monthly > r.shareMonthly + 100) out.push({ text: `Have you thought about owning ${t} ${t === 1 ? 'property' : 'properties'} instead of ${g.targetProperties}? You could invest about ${m(monthly)} a month in shares on average instead of ${m(r.shareMonthly)}, with your shares reaching about ${m(real(rr.sharesAtRetire))} by ${g.retirementAge} (in today’s money) (${m(gain)} more), and less borrowing.` });
    }
  }
  // A share plan that waits for a property purchase: starting now gives it longer to grow
  if (n0(g.shareStartAfter) > 0 && r.shareMonthly > 0) {
    const rr = run((x) => { x.goals.shareStartAfter = 0; });
    if (ok(rr) && propsOk(p, rr)) out.push({ text: `Start your ${m(r.shareMonthly)} a month share plan now rather than after property ${owned + n0(g.shareStartAfter)}. Your property plan still works, and your shares reach about ${m(real(rr.sharesAtRetire))} by ${g.retirementAge} instead of ${m(real(r.sharesAtRetire))}.` });
  }
  return out;
}
const n0 = (v: number | null | undefined) => v ?? 0;

/** When the plan has room to spare: an earlier finish, or a bigger retirement income. */
function retireIdeas(p: Profile, run: (mod: (x: Profile) => void) => Projection): string[] {
  const out: string[] = [];
  const age = p.household.you.age ?? 35;
  for (let d = 5; d >= 1; d--) {
    const at = p.goals.retirementAge - d;
    if (at <= age + 2) continue;
    const rr = run((x) => { x.goals.retirementAge = at; });
    if (lastsOk(rr) && cashOk(rr) && propsOk({ ...p, goals: { ...p.goals, retirementAge: at } }, rr)) { out.push(`You could stop work at ${at} instead of ${p.goals.retirementAge} and still reach your property goal with money lasting to ${p.goals.lifeExpectancy ?? 90}.`); break; }
  }
  const most = bisect(p.goals.passiveIncome, p.goals.passiveIncome * 4, (v) => lastsOk(run((x) => { x.goals.passiveIncome = v; })), 12);
  if (most != null && most > p.goals.passiveIncome * 1.15) out.push(`Or stop at ${p.goals.retirementAge} as planned and live on up to about ${m(round(most, 5000))} a year in retirement instead of ${m(p.goals.passiveIncome)}.`);
  return out;
}

const isCryptoHolding = (h: { kind: string; exchange: string }) => h.kind === 'crypto' || h.exchange === 'CRYPTO';

/** Selling part of the crypto or share portfolio today: gross, estimated capital gains tax and what's left. */
export function saleAfterTax(p: Profile, quotes: Quotes, kind: 'crypto' | 'shares', frac: number) {
  const rows = holdingsStats(p.holdings, quotes).rows.filter((r) => isCryptoHolding(r.h) === (kind === 'crypto'));
  if (rows.length === 0) return null;
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  let gross = 0, taxable = 0;
  for (const r of rows) {
    gross += r.value * frac;
    const gain = Math.max(0, r.gain) * frac;
    const held12 = !r.h.firstBought || r.h.firstBought < yearAgo;
    taxable += held12 ? gain * 0.5 : gain; // 50% CGT discount after 12 months
  }
  const income = (p.household.you.salary ?? 0) + (p.household.otherIncome ?? 0);
  const tax = Math.max(0, incomeTax(income + taxable) - incomeTax(income));
  return { gross, tax, net: gross - tax };
}


/** Today's value of the share or crypto portfolio. */
export function holdingValue(p: Profile, quotes: Quotes, kind: 'crypto' | 'shares') {
  return holdingsStats(p.holdings, quotes).rows.filter((r) => isCryptoHolding(r.h) === (kind === 'crypto')).reduce((t, r) => t + r.value, 0);
}

/** A property's estimated value in a given year, at its own growth rate. */
export function propertyValueIn(p: Profile, propertyId: string, year: number) {
  const pr = p.properties.find((x) => x.id === propertyId);
  if (!pr) return 0;
  const now = propertyStats(pr, p.assumptions.lvr).val.value;
  return now * Math.pow(1 + pr.growthRate / 100, Math.max(0, year - new Date().getFullYear()));
}

/**
 * What a liquidation event leaves you with. Shares and crypto at today's prices; a property at its sale price
 * less agent fees and selling costs, the loan (today's balance) and capital gains tax (none on your home).
 */
export function liquidationEstimate(p: Profile, quotes: Quotes, lq: Liquidation) {
  const income = (p.household.you.salary ?? 0) + (p.household.otherIncome ?? 0);
  if (lq.asset === 'property') {
    const pr = p.properties.find((x) => x.id === lq.propertyId);
    if (!pr) return null;
    const st = propertyStats(pr, p.assumptions.lvr);
    const gross = lq.salePrice ?? Math.round(propertyValueIn(p, pr.id, lq.year) / 1000) * 1000;
    const costs = gross * (lq.sellCostPct ?? 2.5) / 100;
    const base = (pr.purchasePrice ?? 0) || st.val.value;
    const gain = Math.max(0, gross - costs - base);
    const home = pr.use === 'home';
    const tax = home ? 0 : Math.max(0, incomeTax(income + gain * 0.5) - incomeTax(income));
    const debt = st.debt;
    return { holding: st.val.value, gross, costs, debt, tax, net: gross - costs - debt - tax, home, gain };
  }
  const holding = holdingValue(p, quotes, lq.asset);
  if (holding <= 0) return { holding: 0, gross: 0, costs: 0, debt: 0, tax: 0, net: 0, home: false, gain: 0 };
  const amount = lq.amount ?? holding * Math.min(1, (lq.pct ?? 0) / 100);
  const sale = saleAfterTax(p, quotes, lq.asset, Math.min(1, amount / holding));
  return { holding, gross: sale?.gross ?? 0, costs: 0, debt: 0, tax: sale?.tax ?? 0, net: sale?.net ?? 0, home: false, gain: 0 };
}
