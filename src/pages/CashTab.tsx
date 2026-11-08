import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { project, recommendedBuffer, type Quotes } from '../lib/calc';
import { money } from '../lib/format';
import { usePlanProfile, usePlanUpdate } from '../lib/planContext';
import { useSavingsRates } from '../lib/rates';
import type { CashPlan, Profile } from '../lib/types';
import { Field, Icon, MoneyInput, NumInput } from '../components/ui';

type Risk = CashPlan['risk'];
type Split = CashPlan['split'];
const round10k = (v: number) => Math.max(0, Math.round(v / 10000) * 10000);

/** Everything the offset could sit against: loans you have now, and properties in your plan. */
function offsetChoices(p: Profile) {
  return [
    ...p.properties.filter((pr) => pr.loans.some((l) => (l.balance ?? 0) > 0)).map((pr) => ({ id: pr.id, label: pr.address || 'A property', sub: pr.use === 'home' ? 'Your home · loan now' : 'Investment · loan now', home: pr.use === 'home' })),
    ...(p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - p.properties.length)).map((pp, k) => ({ id: pp.id, label: pp.label || `Property ${p.properties.length + k + 1}`, sub: pp.firstHome ? 'Planned home · once bought' : 'Planned investment · once bought', home: !!pp.firstHome })),
  ];
}

/** Sensible starting answers for each approach. */
function preset(p: Profile, risk: Risk, hisaRate: number, prev?: CashPlan): CashPlan {
  const buffer = p.finances.buffer || recommendedBuffer(p);
  const choices = offsetChoices(p);
  const hasLoan = choices.length > 0;
  const next = (p.plannedPurchases ?? [])[0];
  const nextDeposit = next ? next.price * ((next.depositPct ?? 20) + (next.costsPct ?? 5)) / 100 : 0;
  const split: Split = hasLoan ? (risk === 'conservative' ? { offset: 70, hisa: 25, everyday: 5 } : { offset: 60, hisa: 30, everyday: 10 }) : { offset: 0, hisa: 85, everyday: 15 };
  const homeIds = choices.filter((c) => c.home).map((c) => c.id);
  return {
    active: true, risk,
    accessMax: risk === 'conservative' ? null : risk === 'balanced' ? round10k(nextDeposit * 0.5) : 20000, // on top of the emergency fund
    split, offsetProperties: prev?.offsetProperties?.length ? prev.offsetProperties : homeIds.length ? homeIds : choices.map((c) => c.id),
    hisaRate: prev?.hisaRate ?? hisaRate, everydayRate: prev?.everydayRate ?? 0, sweep: risk !== 'conservative',
  };
}

const RISK_CLS: Record<string, string> = { 'Very low': 'bg-gum/15 text-gum', Low: 'bg-gum/15 text-gum', Medium: 'bg-brass/15 text-brass', 'Medium–high': 'bg-clay/15 text-clay', High: 'bg-clay/20 text-clay' };
const STEPS = ['Approach', 'Emergency fund', 'Within reach', 'Where it sits', 'Shares'] as const;

export function CashTab({ quotes, onGo }: { quotes: Quotes; onGo: (tab: 'shares' | 'timeline') => void }) {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  const rates = useSavingsRates();
  const hisaNow = rates?.highInterest ?? 5.05;
  const saved = p.cashPlan?.active ? p.cashPlan : null;
  const buffer = p.finances.buffer || recommendedBuffer(p);
  const choices = offsetChoices(p);
  const [step, setStep] = useState<number>(saved ? -1 : 0); // -1 = summary of the saved plan
  const [draft, setDraft] = useState<CashPlan>(() => saved ?? preset(p, 'balanced', hisaNow));
  const set = (patch: Partial<CashPlan>) => setDraft((d) => ({ ...d, ...patch }));
  const plan = step === -1 && saved ? saved : draft;

  // The idle cash problem, in today's money, on the plan as it stands without a cash plan
  const inf = (i: number) => Math.pow(1 + p.assumptions.inflation / 100, i);
  const before = useMemo(() => project({ ...p, cashPlan: undefined }, quotes), [p, quotes]);
  const withPlan = useMemo(() => project({ ...p, cashPlan: plan }, quotes), [p, quotes, plan]);
  const ri = (r: typeof before) => Math.max(0, r.points.findIndex((x) => x.year === r.retireYear));
  const big = before.points.slice(0, ri(before)).map((x, i) => ({ year: x.year, cash: x.cash / inf(i) })).filter((x) => x.cash > Math.max(100000, buffer * 2));
  const peak = big.reduce((m, x) => Math.max(m, x.cash), 0);
  // The year cash first reaches the limit (when the extra starts going into shares)
  const capYear = withPlan.points.find((x) => x.cashShares > 1)?.year ?? null;
  const chart = before.points.slice(0, ri(before) + 1).map((x, i) => ({ year: x.year, now: Math.max(0, x.cash / inf(i)), plan: Math.max(0, withPlan.points[i]?.cash ?? 0) / inf(i), shares: (withPlan.points[i]?.cashShares ?? 0) / inf(i) }));

  // Scenarios: the same plan with the cash kept in different places
  const scen = useMemo(() => {
    const base = { ...plan, accessMax: null, sweep: false };
    const list: { key: string; label: string; cp: CashPlan; note: string }[] = [
      { key: 'everyday', label: 'All in an everyday account', cp: { ...base, split: { offset: 0, hisa: 0, everyday: 100 } }, note: `Earns about ${plan.everydayRate}% a year.` },
      { key: 'hisa', label: 'All in a high-interest account', cp: { ...base, split: { offset: 0, hisa: 100, everyday: 0 } }, note: `Earns about ${plan.hisaRate}% a year, taxed at your marginal rate.` },
      ...(choices.length ? [{ key: 'offset', label: 'All in offset accounts', cp: { ...base, split: { offset: 100, hisa: 0, everyday: 0 } }, note: 'Saves the loan rate, tax-free on a home loan. Anything over the loan balance earns high interest.' }] : []),
      { key: 'shares', label: 'Everything above your emergency fund in shares', cp: { ...base, accessMax: 0, sweep: true }, note: 'Grows at your share return, then capital gains tax when sold for a deposit. Shares can be down when you need them.' },
      { key: 'mine', label: 'Your mix', cp: plan, note: 'The answers above.' },
    ];
    return list.map((s) => {
      const r = project({ ...p, cashPlan: s.cp }, quotes);
      const i = ri(r);
      // Risk: how much of the spare cash ends up in shares over the working years
      const work = r.points.slice(0, i);
      const inShares = work.reduce((t, x) => t + x.cashShares, 0), total = work.reduce((t, x) => t + Math.max(0, x.cash) + x.cashShares, 0);
      const share = total ? inShares / total : 0;
      const risk = share < 0.05 ? 'Very low' : share < 0.25 ? 'Low' : share < 0.5 ? 'Medium' : share < 0.75 ? 'Medium–high' : 'High';
      return { ...s, risk, buys: r.purchases.map((x) => x.year), atRetire: r.points[i].netWorth / inf(i), peakCash: Math.max(0, ...work.map((x, k) => x.cash / inf(k))), tax: r.cashSharesTax, runsOut: r.runsOutAge };
    });
  }, [p, quotes, plan, choices.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const worst = Math.min(...scen.map((s) => s.atRetire));
  const wanted = Math.max(0, p.goals.targetProperties - p.properties.length); // purchases the plan needs

  const setSplit = (k: keyof Split, v: number) => setDraft((d) => {
    const [a, b] = (Object.keys(d.split) as (keyof Split)[]).filter((x) => x !== k);
    const rest = 100 - v, wa = d.split[a], wb = d.split[b];
    const na = wa + wb ? Math.round(rest * wa / (wa + wb)) : Math.round(rest / 2);
    return { ...d, split: { ...d.split, [k]: v, [a]: na, [b]: rest - na } as Split };
  });
  const save = () => { update((d) => { d.cashPlan = { ...draft, active: true, answeredAt: new Date().toISOString().slice(0, 10) }; }); setStep(-1); };
  const restart = () => { setDraft(saved ?? preset(p, 'balanced', hisaNow)); setStep(0); };

  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h2 className="font-display text-xl font-semibold">Cash</h2>
            {big.length ? (
              <p className="mt-1 leading-relaxed">Based on your savings plan, from <strong>{big[0].year}</strong> to <strong>{big[big.length - 1].year}</strong> you’re going to build up a large cash reserve, up to about <strong>{money(peak, { compact: true })}</strong> in today’s money. You’ll need a lot of it for your next deposit, but sitting in the bank it isn’t doing much for you. Let’s work out how to put it to work.</p>
            ) : (
              <p className="mt-1 leading-relaxed">Your cash stays fairly close to your emergency fund, so there isn’t much sitting idle. You can still choose where it sits and how it’s used for your next deposit.</p>
            )}
          </div>
          {saved && step === -1 && <button className="btn-quiet" onClick={restart}><Icon name="spark" className="h-4 w-4" />Start the questions again</button>}
        </div>
        <div className="mt-4 h-48 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="2 4" />
              <XAxis dataKey="year" tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => money(v, { compact: true })} />
              <Tooltip formatter={(v: number, k: string) => [money(v, { compact: true }), k === 'now' ? 'In the bank if you change nothing' : k === 'plan' ? (step === -1 ? 'In the bank with your cash plan' : 'In the bank with your answers') : 'Invested in shares']} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="now" stroke="rgb(var(--muted))" strokeDasharray="4 4" fill="none" isAnimationActive={false} />
              <Area type="monotone" dataKey="shares" stackId="w" stroke="rgb(var(--sky))" fill="rgb(var(--sky) / 0.25)" isAnimationActive={false} />
              <Area type="monotone" dataKey="plan" stackId="w" stroke="rgb(var(--brass))" fill="rgb(var(--brass) / 0.25)" isAnimationActive={false} />
              <ReferenceLine y={buffer} stroke="rgb(var(--gum))" strokeDasharray="3 3" label={{ value: 'Emergency fund', position: 'insideTopLeft', fill: 'rgb(var(--gum))', fontSize: 10 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-muted" />Cash in the bank if you change nothing</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brass/60" />Cash in the bank {step === -1 ? 'with your cash plan' : 'with your answers below'}</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky/60" />Spare cash invested in shares</li>
        </ul>
        {!saved && <p className="mt-3 rounded-lg bg-raised px-3 py-2 text-xs text-muted ring-1 ring-line">Until you set this up, your plan assumes all your cash sits in offset accounts against every loan you have. That’s the best case, and most people don’t hold it that way.</p>}
      </section>

      {step === -1 && saved ? (
        <section className="panel p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-gum text-surface"><Icon name="check" className="h-5 w-5" /></span><h3 className="font-display text-lg font-semibold">Your cash plan</h3></div>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <li className="rounded-xl bg-raised p-4 ring-1 ring-line"><p className="text-xs text-muted">Within reach</p><p className="font-display text-lg font-semibold">{saved.accessMax == null ? 'No limit' : `Up to ${money(saved.accessMax)}${capYear ? ` by ${capYear}` : ''}`}</p><p className="text-xs text-muted">On top of your {money(buffer)} emergency fund · today’s money{saved.accessMax != null && !capYear ? ' · you don’t reach it before you retire' : ''}</p></li>
            <li className="rounded-xl bg-raised p-4 ring-1 ring-line"><p className="text-xs text-muted">Where it sits</p><p className="font-display text-lg font-semibold">{saved.split.offset}% offset · {saved.split.hisa}% high interest · {saved.split.everyday}% everyday</p>{saved.split.offset > 0 && <p className="text-xs text-muted">Offset against {choices.filter((c) => saved.offsetProperties.includes(c.id)).map((c) => c.label).join(', ') || 'your loans'}</p>}</li>
            <li className="rounded-xl bg-raised p-4 ring-1 ring-line sm:col-span-2"><p className="text-xs text-muted">Above that</p><p className="font-medium">{saved.sweep && saved.accessMax != null ? 'Goes into shares, and is sold down to cover the deposit when you buy your next property, after capital gains tax. It shows on the Shares tab.' : 'Stays in cash.'}</p></li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-quiet" onClick={() => onGo('shares')}>See it on the Shares tab</button>
            <button className="btn-quiet" onClick={() => onGo('timeline')}>See your Property Portfolio</button>
            <button className="btn-quiet" onClick={restart}>Review my cash plan</button>
          </div>
        </section>
      ) : (
        <section className="panel border-2 border-brass/50 p-5 sm:p-6" aria-label="Cash questions">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass text-ground"><Icon name="spark" className="h-5 w-5" /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brass">{saved ? 'Update your cash plan' : 'Start here'}</p>
              <h3 className="font-display text-xl font-semibold">Plan how you want to put your cash to work</h3>
              <p className="text-sm text-muted">Answer these 5 quick questions. The chart above and the comparison below update as you go, and nothing changes in your plan until you press “Use this cash plan”.</p>
            </div>
          </div>
          <ol className="flex flex-wrap gap-2 text-xs">
            {STEPS.map((s, k) => <li key={s}><button onClick={() => setStep(k)} className={`rounded-full px-3 py-1 font-medium ring-1 ${k === step ? 'bg-brass text-ground ring-brass' : k < step ? 'ring-brass/50 text-brass' : 'ring-line text-muted'}`}>{k + 1}. {s}</button></li>)}
          </ol>

          {step === 0 && (
            <div className="mt-5">
              <h3 className="font-display text-lg font-semibold">You need cash for your next property. How hard do you want the rest of it working?</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {([
                  ['conservative', 'Keep it safe', 'All of it stays in cash: offset and high-interest accounts. No market ups and downs.'],
                  ['balanced', 'Balanced', 'Keep enough within reach for about half your next deposit. The rest goes into shares and is sold when you buy.'],
                  ['growth', 'Put it to work', 'Keep your emergency fund and a little more in cash. Everything else goes into shares until a deposit is needed.'],
                ] as [Risk, string, string][]).map(([k, t, d]) => (
                  <button key={k} onClick={() => setDraft(preset(p, k, hisaNow, draft))} className={`rounded-xl p-4 text-left ring-1 transition-colors ${draft.risk === k ? 'bg-brass/10 ring-2 ring-brass' : 'ring-line hover:ring-brass/50'}`}>
                    <p className="font-semibold">{t}</p><p className="mt-1 text-sm text-muted">{d}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-5 max-w-xl">
              <h3 className="font-display text-lg font-semibold">Your emergency fund stays as cash, always</h3>
              <p className="mt-2 leading-relaxed">You’ve set <strong>{money(buffer)}</strong> as the emergency cash buffer you want to keep. It sits outside these calculations (we assume a high-interest account), and nothing in this plan touches it. To change it, go to My Details, under Cash, Superannuation and Debts.</p>
            </div>
          )}

          {step === 2 && (
            <div className="mt-5 max-w-xl">
              <h3 className="font-display text-lg font-semibold">What’s the most you want within reach?</h3>
              <p className="mt-1 text-sm text-muted">Across your offset, high-interest and everyday accounts, not including your emergency fund (that stays outside these calculations). Anything above this can go into shares.</p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="w-56"><Field label="Most I want within reach">{(id) => <MoneyInput id={id} value={draft.accessMax} onChange={(v) => set({ accessMax: v, sweep: v != null && draft.sweep })} placeholder="No limit" />}</Field></div>
                <button className="btn-ghost mb-1 text-sm" onClick={() => set({ accessMax: null, sweep: false })}>No limit, keep it all as cash</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-5">
              <h3 className="font-display text-lg font-semibold">How should the cash you keep be split?</h3>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  {([['offset', 'Offset accounts', 'Saves the interest on a loan. Tax-free on your home loan; worth less on an investment loan, where the interest is tax-deductible.'], ['hisa', 'High-interest savings', `Today’s average is about ${hisaNow}%${rates?.asOf ? ` (${new Date(`${rates.asOf}T00:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })})` : ''}. Interest is taxed.`], ['everyday', 'Everyday account', 'For spending. Usually earns close to nothing.']] as [keyof Split, string, string][]).map(([k, t, d]) => (
                    <div key={k} className={k === 'offset' && !choices.length ? 'opacity-50' : ''}>
                      <div className="flex items-baseline justify-between"><label htmlFor={`sl-${k}`} className="font-medium">{t}</label><span className="font-display text-lg font-semibold tabular-nums">{draft.split[k]}%</span></div>
                      <input id={`sl-${k}`} type="range" min={0} max={100} step={5} value={draft.split[k]} disabled={k === 'offset' && !choices.length} onChange={(e) => setSplit(k, Number(e.target.value))} className="w-full accent-[rgb(var(--brass))]" />
                      <p className="text-xs text-muted">{d}</p>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="High-interest rate">{(id) => <NumInput id={id} value={draft.hisaRate} onChange={(v) => set({ hisaRate: v ?? 0 })} step={0.05} min={0} max={10} suffix="%" />}</Field>
                    <Field label="Everyday account rate">{(id) => <NumInput id={id} value={draft.everydayRate} onChange={(v) => set({ everydayRate: v ?? 0 })} step={0.05} min={0} max={10} suffix="%" />}</Field>
                  </div>
                </div>
                <div>
                  <p className="font-medium">Which loans should the offset sit against?</p>
                  {choices.length === 0 ? <p className="mt-1 text-sm text-muted">You don’t have a loan yet, so there’s nothing to offset.</p> : (
                    <ul className="mt-2 space-y-2">
                      {choices.map((c) => (
                        <li key={c.id}><label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-line hover:ring-brass/50">
                          <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--brass))]" checked={draft.offsetProperties.includes(c.id)} onChange={(e) => set({ offsetProperties: e.target.checked ? [...draft.offsetProperties, c.id] : draft.offsetProperties.filter((x) => x !== c.id) })} />
                          <span><span className="block font-medium">{c.label}</span><span className="text-xs text-muted">{c.sub}</span></span>
                        </label></li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-muted">Your home loan saves the most: there’s no tax deduction to lose.</p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-5 max-w-2xl">
              <h3 className="font-display text-lg font-semibold">Put the rest into shares?</h3>
              {draft.accessMax == null ? <p className="mt-2 leading-relaxed">You chose to keep it all as cash, so nothing goes into shares. Go back to step 3 to set a limit if you’d like to.</p> : (<>
                <p className="mt-2 leading-relaxed">Anything above <strong>{money(draft.accessMax)}</strong>, plus your {money(buffer)} emergency fund (today’s money), goes into shares. When you buy your next property, we sell enough to cover the deposit, after capital gains tax, and show it as a liquidation event on your charts. This sits in its own part of the Shares tab, and only changes from here.</p>
                <label className="mt-4 flex cursor-pointer items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brass))]" checked={draft.sweep} onChange={(e) => set({ sweep: e.target.checked })} /><span className="font-medium">Yes, invest the extra in shares</span></label>
              </>)}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</button>
            <div className="flex gap-2">
              {saved && <button className="btn-ghost text-sm" onClick={() => { update((d) => { d.cashPlan = undefined; }); setStep(0); }}>Remove my cash plan</button>}
              {saved && <button className="btn-quiet" onClick={() => { setDraft(saved); setStep(-1); }}>Cancel</button>}
              {step < STEPS.length - 1 ? <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>Next</button> : <button className="btn-primary" onClick={save}><Icon name="check" className="h-4 w-4" />Use this cash plan</button>}
            </div>
          </div>
        </section>
      )}

      <section className="panel p-5 sm:p-6">
        <h3 className="font-display text-lg font-semibold">How each option plays out</h3>
        <p className="mt-1 text-sm text-muted">Your whole plan run with the cash held each way. Net worth at {p.goals.retirementAge}, in today’s money. Risk is how much of your spare cash would be in shares, which can fall just when you need a deposit.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="align-bottom text-xs text-muted"><tr className="border-b border-line"><th className="py-2 pr-3 text-left font-medium">Where the cash goes</th><th className="px-3 py-2 text-left font-medium">Risk</th><th className="px-3 py-2 text-right font-medium">Highest bank balance<span className="block font-normal">before you retire, today’s money</span></th><th className="px-3 py-2 text-right font-medium">Property purchases<span className="block font-normal">year bought</span></th><th className="px-3 py-2 text-right font-medium">Tax on selling shares<span className="block font-normal">capital gains tax</span></th><th className="whitespace-nowrap py-2 pl-3 text-right font-medium">Net worth at {p.goals.retirementAge}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {scen.map((s) => (
                <tr key={s.key} className={s.key === 'mine' ? 'bg-brass/10 font-medium' : ''}>
                  <td className="py-2.5 pr-3"><p>{s.label}</p><p className="text-xs font-normal text-muted">{s.note}</p></td>
                  <td className="px-3 py-2.5"><span className={`chip whitespace-nowrap ${RISK_CLS[s.risk]}`}>{s.risk}</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(s.peakCash, { compact: true })}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.buys.join(', ') || '—'}{s.buys.length < wanted && <span className="block text-xs text-clay">{wanted - s.buys.length === 1 ? `Property ${p.properties.length + s.buys.length + 1} doesn’t fit` : `${wanted - s.buys.length} properties don’t fit`} before you stop work</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{s.tax > 0 ? money(s.tax, { compact: true }) : '—'}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums"><span className="font-semibold">{money(s.atRetire, { compact: true })}</span>{s.atRetire - worst > 1000 && <span className="block text-xs text-gum">+{money(s.atRetire - worst, { compact: true })}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(() => {
          const sh = scen.find((s) => s.key === 'shares'), hi = scen.find((s) => s.key === 'hisa');
          if (!sh || !hi) return null;
          const gain = sh.atRetire - hi.atRetire;
          return <p className="mt-4 rounded-lg bg-raised px-4 py-3 text-sm ring-1 ring-line">{gain > 0
            ? `Putting everything above your emergency fund into shares leaves you about ${money(gain, { compact: true })} better off at ${p.goals.retirementAge} than a high-interest account${sh.tax > 0 ? `, even after about ${money(sh.tax, { compact: true })} in capital gains tax when you sell for deposits` : ''}. Shares can fall just when you need the money, though, so a mix is common.`
            : `On your numbers, shares don’t come out ahead of a high-interest account once you allow for the tax when you sell for deposits. Keeping it in cash looks just as good.`}</p>;
        })()}
        <p className="mt-3 text-[11px] text-muted">Savings rates: Canstar averages published by the Reserve Bank of Australia. Share returns use your assumptions. General information, not financial advice.</p>
      </section>
    </div>
  );
}
