import { position, project, recommendedBuffer, type Quotes } from './calc';
import { listJoin, money } from './format';
import type { Profile } from './types';

/**
 * Wise Actions: the things to set up so the plan runs on its own. Built from the plan's own figures,
 * so when the plan changes, an action's `sig` changes and a ticked action shows as needing an update.
 */
export interface WiseAction {
  key: string;
  group: 'setup' | 'payday' | 'check';
  title: string;
  body: string;
  amount?: string; // headline figure, e.g. "$1,250 a month"
  sig: string; // the figures it depends on
  links?: { label: string; url: string }[];
}

export interface PayFlow { takeHome: number; living: number; bills: number; shares: number; offset: number; hisa: number; everyday: number }

const loanName = (d: { label?: string; kind: string }) => {
  const generic = d.kind === 'car' ? 'car loan' : d.kind === 'personal' ? 'personal loan' : 'loan';
  const l = d.label?.trim();
  return !l || /^(car loan|personal loan|loan)$/i.test(l) ? (l?.toLowerCase() || generic) : l;
};
const r10 = (v: number) => Math.max(0, Math.round(v / 10) * 10);
const pm = (v: number) => `${money(v)} a month`;

export function wiseActions(p: Profile, quotes: Quotes): { actions: WiseAction[]; flow: PayFlow } {
  const pos = position(p, quotes);
  const proj = project(p, quotes);
  const y0 = new Date().getFullYear();
  const buffer = p.finances.buffer || recommendedBuffer(p);
  const cp = p.cashPlan?.active ? p.cashPlan : null;
  const loanProps = p.properties.filter((pr) => pr.loans.some((l) => (l.balance ?? 0) > 0));

  // Where each pay goes, a month at a time (today's figures)
  const takeHome = r10(pos.takeHome);
  const living = r10(pos.living);
  const surplus = Math.max(0, pos.monthlySurplus);
  const bills = r10(Math.max(0, pos.takeHome - pos.living - pos.monthlySurplus)); // loan repayments, property costs, other debts
  // Shares only once the plan starts them (e.g. 'don't invest until I've bought property 2')
  const waiting = (p.goals.shareStartAfter ?? 0) > 0 && (proj.points[0]?.shareContribution ?? 0) < 1;
  const shareStart = proj.points.find((x) => x.shareContribution > 0)?.year ?? null;
  const shares = waiting ? 0 : r10(Math.min(surplus, proj.shareMonthly));
  const rest = Math.max(0, surplus - shares);
  const split = cp ? cp.split : loanProps.length ? { offset: 100, hisa: 0, everyday: 0 } : { offset: 0, hisa: 100, everyday: 0 };
  // The 'savings account' share of Cash Reserves is everyday money, so it joins everyday spending
  const offset = r10(rest * split.offset / 100), hisa = r10(rest * split.hisa / 100);
  const flow: PayFlow = { takeHome, living: r10(living + Math.max(0, rest - offset - hisa)), bills, shares, offset, hisa, everyday: 0 };

  const out: WiseAction[] = [];
  const offsetTargets = cp ? loanProps.filter((pr) => cp.offsetProperties.includes(pr.id)) : loanProps.filter((pr) => pr.use === 'home').slice(0, 1);

  // ---- Set up once
  out.push({
    key: 'hisa', group: 'setup', title: 'Open a high-interest savings account',
    body: `${split.hisa > 0 ? `This is where ${split.hisa}% of the cash you’re building earns interest.` : 'A good home for your emergency fund.'} Compare a few banks for the best rate.`,
    sig: 'hisa',
  });
  out.push({
    key: 'emergency', group: 'setup', title: `Keep your ${money(buffer)} emergency fund in its own account`,
    body: `Keeping it separate means it isn’t spent by accident. A high-interest account works well.${pos.cash < buffer ? ` You have about ${money(pos.cash)} in cash today, so build it up first.` : ''}`,
    amount: money(buffer), sig: `emergency:${buffer}`,
  });
  if (flow.bills > 0) out.push({
    key: 'bills-account', group: 'setup', title: 'Set up a separate bills account',
    body: 'Loan repayments, rates, insurance and other regular bills come out of one account, topped up from each pay. Your spending money stays clear.',
    amount: pm(flow.bills), sig: `bills:${flow.bills}`,
  });
  for (const pr of offsetTargets) {
    const hasOffset = pr.loans.some((l) => (l.offset ?? 0) > 0);
    if (hasOffset) continue;
    out.push({
      key: `offset:${pr.id}`, group: 'setup', title: `Set up an offset account on the ${pr.address || 'property'} loan`,
      body: `Ask your lender to link an offset account to this loan. Every dollar in it reduces the interest you pay${pr.use === 'home' ? ', and on your home loan that saving isn’t taxed' : ''}. Your Cash Reserves plan puts ${split.offset}% of your savings here.`,
      sig: `offset:${pr.id}`,
    });
  }
  if (flow.shares > 0 || waiting) out.push({
    key: 'broker', group: 'setup', title: 'Use a share trading account that can auto-invest',
    body: 'Check your broker can schedule a regular buy into ETFs or index funds. Many Australian brokers now can.',
    sig: 'broker',
  });

  // ---- Every payday
  if (flow.shares > 0) out.push({
    key: 'auto-invest', group: 'payday', title: 'Set up an automatic share purchase',
    body: 'A regular buy into a diversified ETF or index fund on the same day each month, whatever the market is doing. It’s the amount your share plan uses.',
    amount: pm(flow.shares), sig: `shares:${flow.shares}`,
  });
  if (flow.offset > 0) out.push({
    key: 'xfer-offset', group: 'payday', title: `Automatic transfer to your offset account`,
    body: `Schedule it for the day after payday${offsetTargets.length ? `, into the offset on ${offsetTargets.map((x) => x.address).join(' and ')}` : ''}.`,
    amount: pm(flow.offset), sig: `offset:${flow.offset}`,
  });
  if (flow.hisa > 0) out.push({
    key: 'xfer-hisa', group: 'payday', title: 'Automatic transfer to your high-interest account',
    body: 'Schedule it for the day after payday. Check it’s at least the monthly deposit your account needs for the bonus rate.',
    amount: pm(flow.hisa), sig: `hisa:${flow.hisa}`,
  });
  if (p.finances.debts.some((d) => d.kind === 'credit-card')) out.push({
    key: 'card-autopay', group: 'payday', title: 'Set up regular monthly credit card repayments',
    body: 'Pay off the full balance each month. If you don’t need the card, consider closing it.',
    sig: 'card',
  });
  for (const d of p.finances.debts.filter((x) => (x.kind === 'car' || x.kind === 'personal' || x.kind === 'other') && (x.balance ?? 0) > 0)) {
    const amt = r10(d.monthlyRepayment ?? 0);
    out.push({
      key: `loan:${d.id}`, group: 'payday', title: `Automatic repayments on your ${loanName(d)}`,
      body: 'Set the repayment to come out just after payday so it’s never missed.', amount: amt ? pm(amt) : undefined, sig: `loan:${d.id}:${amt}`,
    });
  }
  const rentals = p.properties.filter((pr) => pr.use === 'investment' && (pr.weeklyRent ?? 0) > 0);
  if (rentals.length && offsetTargets.length) out.push({
    key: 'rent-offset', group: 'payday', title: 'Have your rent paid into your offset account',
    body: `Ask your property manager to pay the rent from ${listJoin(rentals.map((x) => x.address))} straight into your offset, so it starts saving interest the day it arrives.`,
    sig: `rent:${rentals.map((x) => x.id).join(',')}`,
  });
  const holding = p.properties.reduce((t, pr) => t + (pr.annualCosts ?? 0), 0);
  if (holding > 0) out.push({
    key: 'holding', group: 'payday', title: 'Put money aside for property bills',
    body: 'Rates, insurance, strata and maintenance arrive in lumps. Setting this much aside in your bills account each month means they’re covered when they land.',
    amount: pm(r10(holding / 12)), sig: `holding:${r10(holding / 12)}`,
  });

  // ---- Check in
  if (waiting && proj.shareMonthly > 0) out.push({
    key: 'shares-later', group: 'check', title: `Start your automatic share purchase ${shareStart ? `in ${shareStart}` : 'later'}`,
    body: `You’ve chosen not to invest in shares until you’ve bought property ${p.properties.length + (p.goals.shareStartAfter ?? 0)}. Once it’s bought, set up a regular automatic buy into a diversified ETF or index fund.`,
    amount: pm(r10(proj.shareMonthly)), sig: `shares-later:${shareStart}:${r10(proj.shareMonthly)}`,
  });
  out.push({
    key: 'super', group: 'check', title: 'Check your super is being paid',
    body: 'Your employer should pay 12% of your salary into super at least every quarter. Look for the payments in your fund’s app, and make sure your fund has your tax file number.',
    sig: 'super',
  });
  const next = proj.purchases.find((b) => b.year <= y0 + 2);
  if (next) out.push({
    key: `prebuy:${next.id ?? next.year}`, group: 'check', title: `Get ready to buy in ${next.year}`,
    body: 'Your plan buys its next property soon. About 3 to 6 months before, talk to a mortgage broker about pre-approval, and keep the deposit in your offset or high-interest account so it’s ready.',
    amount: `${money(next.price, { compact: true })} purchase`, sig: `prebuy:${next.year}:${Math.round(next.price / 1000)}`,
  });
  for (const lq of (p.liquidations ?? []).filter((x) => x.year <= y0 + 1)) {
    const what = lq.asset === 'property' ? (p.properties.find((x) => x.id === lq.propertyId)?.address ?? 'a property') : `some ${lq.asset}`;
    out.push({
      key: `liq:${lq.id}`, group: 'check', title: `Talk to an accountant before selling ${what}`,
      body: `It’s planned for ${lq.year}. When in the financial year you sell can change the capital gains tax, especially around the new rules from 1 July 2027.`,
      sig: `liq:${lq.id}:${lq.year}`,
    });
  }
  return { actions: out, flow };
}

/** How many ticked actions have changed since they were done. */
export function actionsNeedingUpdate(p: Profile, actions: WiseAction[]) {
  const done = p.actionState?.done ?? {};
  return actions.filter((a) => done[a.key] && done[a.key].sig !== a.sig);
}

/** True once a year has passed since the last review. */
export const reviewDue = (p: Profile) => !!p.actionState?.reviewedAt && Date.now() - new Date(p.actionState.reviewedAt).getTime() > 365 * 864e5;
