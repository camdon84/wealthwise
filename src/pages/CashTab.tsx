import { useMemo, useState } from 'react';
import { project, recommendedBuffer, type Quotes } from '../lib/calc';
import { CGT_2027_NOTE, money } from '../lib/format';
import { usePlanProfile, usePlanUpdate } from '../lib/planContext';
import { useSavingsRates } from '../lib/rates';
import type { CashPlan, Profile } from '../lib/types';
import { Field, Icon, NumInput } from '../components/ui';

type Split = CashPlan['split'];

/** Loans the offset could sit against: ones you have now, and properties in your plan. */
function offsetChoices(p: Profile) {
  return [
    ...p.properties.filter((pr) => pr.loans.some((l) => (l.balance ?? 0) > 0)).map((pr) => ({ id: pr.id, label: pr.address || 'A property', sub: pr.use === 'home' ? 'Your home · loan now' : 'Investment · loan now', home: pr.use === 'home' })),
    ...(p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - p.properties.length)).map((pp, k) => ({ id: pp.id, label: pp.label || `Property ${p.properties.length + k + 1}`, sub: pp.firstHome ? 'Planned home · once bought' : 'Planned investment · once bought', home: !!pp.firstHome })),
  ];
}

function starting(p: Profile, hisaRate: number): CashPlan {
  const choices = offsetChoices(p);
  const homeIds = choices.filter((c) => c.home).map((c) => c.id);
  return {
    active: true, risk: 'conservative', accessMax: null, sweep: false,
    split: choices.length ? { offset: 60, hisa: 30, everyday: 10 } : { offset: 0, hisa: 85, everyday: 15 },
    offsetProperties: homeIds.length ? homeIds : choices.map((c) => c.id),
    hisaRate, everydayRate: 0,
  };
}

const OPTIONS: { key: keyof Split; label: string; text: (rate: string) => string }[] = [
  { key: 'offset', label: 'Offset accounts', text: () => 'Your cash sits against a loan, so you pay less interest. It works best on your home loan, where there’s no tax deduction to lose.' },
  { key: 'hisa', label: 'High-interest savings', text: (r) => `Earns interest, currently about ${r} on average. The interest is taxed.` },
  { key: 'everyday', label: 'Savings account', text: () => 'Your everyday savings account, for spending and anything urgent. Usually earns close to nothing.' },
];

/**
 * Cash Reserves: where the cash a plan builds up (mostly for deposits) sits while it builds.
 * Offset, high-interest savings or a savings account. Shares are deliberately not part of this.
 */
export function CashTab({ quotes, onGo }: { quotes: Quotes; onGo: (tab: 'shares' | 'timeline') => void }) {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  const rates = useSavingsRates();
  const hisaNow = rates?.highInterest ?? 5.05;
  const saved = p.cashPlan?.active ? p.cashPlan : null;
  const buffer = p.finances.buffer || recommendedBuffer(p);
  const choices = offsetChoices(p);
  const [editing, setEditing] = useState(!saved);
  const [draft, setDraft] = useState<CashPlan>(() => saved ?? starting(p, hisaNow));
  const set = (patch: Partial<CashPlan>) => setDraft((d) => ({ ...d, ...patch }));
  const plan = editing ? draft : saved!;

  // How big the reserves get, in today's money, on the plan as it stands (with any saved split)
  const inf = (i: number) => Math.pow(1 + p.assumptions.inflation / 100, i);
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const ri = Math.max(0, proj.points.findIndex((x) => x.year === proj.retireYear));
  const work = proj.points.slice(0, ri).map((x, i) => ({ year: x.year, v: x.cash / inf(i) }));
  const peak = work.reduce((m, x) => (x.v > m.v ? x : m), { year: 0, v: 0 });
  const big = peak.v > Math.max(100000, buffer * 2);
  // Cash builds up in waves, each spent on a deposit: the high point before each purchase, and after the last one
  const waves: { year: number; v: number; label: string }[] = [];
  let from = 0;
  const buys = proj.purchases.map((b) => b.year).filter((y) => y < proj.retireYear);
  const lastBuy = buys.length ? buys[buys.length - 1] : 0;
  [...buys, proj.retireYear].forEach((until, k) => {
    const seg = work.filter((x) => x.year >= from && x.year < until);
    const top = seg.reduce((m, x) => (x.v > m.v ? x : m), { year: 0, v: 0 });
    if (top.v > Math.max(50000, buffer * 1.5)) waves.push({ ...top, label: k < buys.length ? `before you buy property ${p.properties.length + k + 1} in ${until}` : `after your last purchase, before you stop work` });
    from = until;
  });

  // One plain comparison: this split against leaving it all in an everyday account
  const gain = useMemo(() => {
    const at = (cp: CashPlan) => { const r = project({ ...p, cashPlan: cp }, quotes); const i = Math.max(0, r.points.findIndex((x) => x.year === r.retireYear)); return r.points[i].netWorth / inf(i); };
    return at({ ...plan, sweep: false, accessMax: null }) - at({ ...plan, sweep: false, accessMax: null, split: { offset: 0, hisa: 0, everyday: 100 } });
  }, [p, quotes, plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSplit = (k: keyof Split, v: number) => setDraft((d) => {
    const [a, b] = (Object.keys(d.split) as (keyof Split)[]).filter((x) => x !== k);
    const rest = 100 - v, wa = d.split[a], wb = d.split[b];
    const na = wa + wb ? Math.round(rest * wa / (wa + wb)) : Math.round(rest / 2);
    return { ...d, split: { ...d.split, [k]: v, [a]: na, [b]: rest - na } as Split };
  });
  const save = () => { update((d) => { d.cashPlan = { ...draft, active: true, sweep: false, accessMax: null, answeredAt: new Date().toISOString().slice(0, 10) }; }); setEditing(false); };
  const rateLabel = `${plan.hisaRate}%`;

  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-2xl font-semibold">Cash Reserves</h2>
        <div className="mt-2 max-w-3xl space-y-2 leading-relaxed">
          {big
            ? <>
              {peak.year >= lastBuy
                ? <p>You’re going to build up large cash reserves in the bank, up to about <strong>{money(peak.v, { compact: true })}</strong> by <strong>{peak.year}</strong> (in today’s money). {buys.length ? <>The biggest build-up comes after your last property purchase, so that money isn’t needed for a deposit.{waves.length > 1 ? ' Before that, your cash builds towards each deposit:' : ''}</> : 'Your plan doesn’t have another property purchase before you stop work, so it isn’t needed for a deposit.'}</p>
                : <p>You’re going to build up large cash reserves in the bank, up to about <strong>{money(peak.v, { compact: true })}</strong> by <strong>{peak.year}</strong> (in today’s money). Based on your plan, most of this will go towards the deposits on your property purchases:</p>}
              {waves.length > 1 && (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {waves.map((w) => <li key={w.year} className="rounded-lg bg-raised px-3 py-2 text-sm ring-1 ring-line"><span className="font-display font-semibold">{money(w.v, { compact: true })}</span> by {w.year}<span className="block text-xs text-muted">{w.label}</span></li>)}
                </ul>
              )}
            </>
            : <p>Your cash reserves stay fairly close to your emergency fund, but they still need somewhere to sit while they build towards your next deposit.</p>}
          <p className="text-muted">This section helps you decide where to hold your cash reserves while they build, so the money is working for you until you buy. Your share plan sits outside this, and so does your {money(buffer)} emergency fund.</p>
        </div>
      </section>

      {editing ? (
        <section className="panel border-2 border-brass/50 p-5 sm:p-6" aria-label="Choose where your cash reserves sit">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass text-ground"><Icon name="spark" className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brass">{saved ? 'Update your cash reserves' : 'Start here'}</p>
              <h3 className="font-display text-xl font-semibold">Choose where your cash reserves sit</h3>
              <p className="text-sm text-muted">Move the sliders to split your cash between the three options. They always add up to 100%.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <div className="space-y-5">
              {OPTIONS.map((o) => {
                const off = o.key === 'offset' && !choices.length;
                return (
                  <div key={o.key} className={off ? 'opacity-50' : ''}>
                    <div className="flex items-baseline justify-between"><label htmlFor={`sl-${o.key}`} className="font-medium">{o.label}</label><span className="font-display text-lg font-semibold tabular-nums">{draft.split[o.key]}%</span></div>
                    <input id={`sl-${o.key}`} type="range" min={0} max={100} step={5} value={draft.split[o.key]} disabled={off} onChange={(e) => setSplit(o.key, Number(e.target.value))} className="w-full accent-[rgb(var(--brass))]" />
                    <p className="text-xs text-muted">{off ? 'You don’t have a loan yet, so there’s nothing to offset.' : o.text(`${draft.hisaRate}%`)}</p>
                  </div>
                );
              })}
              <div className="grid grid-cols-2 gap-3">
                <Field label="High-interest rate" hint={rates?.asOf ? `Average for ${new Date(`${rates.asOf}T00:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}` : undefined}>{(id) => <NumInput id={id} value={draft.hisaRate} onChange={(v) => set({ hisaRate: v ?? 0 })} step={0.05} min={0} max={10} suffix="%" />}</Field>
                <Field label="Savings account rate">{(id) => <NumInput id={id} value={draft.everydayRate} onChange={(v) => set({ everydayRate: v ?? 0 })} step={0.05} min={0} max={10} suffix="%" />}</Field>
              </div>
            </div>
            <div>
              <p className="font-medium">Which loans should the offset sit against?</p>
              {choices.length === 0 ? <p className="mt-1 text-sm text-muted">You don’t have a loan yet. Once you buy, you can put an offset against it here.</p> : (
                <ul className="mt-2 space-y-2">
                  {choices.map((c) => (
                    <li key={c.id}><label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-line hover:ring-brass/50">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--brass))]" checked={draft.offsetProperties.includes(c.id)} onChange={(e) => set({ offsetProperties: e.target.checked ? [...draft.offsetProperties, c.id] : draft.offsetProperties.filter((x) => x !== c.id) })} />
                      <span><span className="block font-medium">{c.label}</span><span className="text-xs text-muted">{c.sub}</span></span>
                    </label></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {gain > 1000 && <p className="mt-6 rounded-lg bg-gum/10 px-4 py-3 text-sm ring-1 ring-gum/30">Held this way, your cash reserves leave you about <strong>{money(gain, { compact: true })}</strong> better off by {p.goals.retirementAge} (today’s money) than keeping it all in an everyday account.</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            {saved && <button className="btn-ghost text-sm" onClick={() => { update((d) => { d.cashPlan = undefined; }); setDraft(starting(p, hisaNow)); }}>Remove</button>}
            {saved && <button className="btn-quiet" onClick={() => { setDraft(saved); setEditing(false); }}>Cancel</button>}
            <button className="btn-primary" onClick={save}><Icon name="check" className="h-4 w-4" />Save where my cash sits</button>
          </div>
        </section>
      ) : (
        <section className="panel p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-gum text-surface"><Icon name="check" className="h-5 w-5" /></span><h3 className="font-display text-lg font-semibold">Where your cash reserves sit</h3></div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {OPTIONS.map((o) => (
              <li key={o.key} className="rounded-xl bg-raised p-4 ring-1 ring-line">
                <p className="text-xs text-muted">{o.label}</p>
                <p className="font-display text-2xl font-semibold">{plan.split[o.key]}%</p>
                <p className="text-xs text-muted">{o.key === 'offset' ? (plan.split.offset ? `Against ${choices.filter((c) => plan.offsetProperties.includes(c.id)).map((c) => c.label).join(', ') || 'your loans'}` : '—') : o.key === 'hisa' ? `About ${rateLabel} a year` : `About ${plan.everydayRate}% a year`}</p>
              </li>
            ))}
          </ul>
          {gain > 1000 && <p className="mt-4 text-sm">That leaves you about <strong>{money(gain, { compact: true })}</strong> better off by {p.goals.retirementAge} than keeping it all in an everyday account.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-quiet" onClick={() => { setDraft(saved!); setEditing(true); }}>Review my cash reserves</button>
            <button className="btn-quiet" onClick={() => onGo('timeline')}>See your Property Portfolio</button>
          </div>
        </section>
      )}

      {!saved && <p className="rounded-lg bg-raised px-4 py-3 text-xs text-muted ring-1 ring-line">Until you save this, your plan assumes all your cash sits in offset accounts against every loan you have. That’s the best case, and most people don’t hold it that way.</p>}

      <section className="rounded-2xl border border-line bg-raised/60 p-5 sm:p-6">
        <p className="font-semibold">What about shares?</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">As your cash reserves build up, you may want to adjust the investment strategy for your share portfolio, as shares may see higher returns. However, this can be riskier. If you invest money you’re setting aside for a deposit into shares, you’ll need to allow for capital gains tax when you sell them, and when you’re ready to buy your next property, you’ll need to sell enough to cover the deposit, even if the market is down. That money would be separate from your long-term share portfolio plan.</p>
        <p className="mt-2 text-xs text-muted">{CGT_2027_NOTE}</p>
        <button className="btn-quiet mt-3 py-1.5" onClick={() => onGo('shares')}>Go to your share plan</button>
      </section>
      <p className="text-[11px] text-muted">High-interest rate: Canstar average published by the Reserve Bank of Australia. General information, not financial advice.</p>
    </div>
  );
}
