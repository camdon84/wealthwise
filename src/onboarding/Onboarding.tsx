import { useState, type ReactNode } from 'react';
import { useApp } from '../lib/store';
import { useQuotes } from '../lib/hooks';
import { afterTax, recommendedBuffer, hecsAnnual, hecsCompulsory, livingCosts, position, propertyStats } from '../lib/calc';
import { defaultCurrency, money, num, price } from '../lib/format';
import { DEBT_RATE, LIVING_CATEGORIES, emptyDebt, emptyDependant, emptyProperty, uid } from '../lib/defaults';
import type { Debt, Holding, Profile, Property } from '../lib/types';
import { WealthFocusPicker } from '../components/WealthFocus';
import { Field, Icon, Logo, MoneyInput, NumInput, PriceInput, Segmented, Select, TextInput, Toggle } from '../components/ui';
import { PropertyEditor } from '../components/PropertyEditor';
import { CsvImport } from '../components/CsvImport';
import { LotPlan } from '../components/LotPlan';

const STEPS = [
  { title: 'About you', blurb: 'Who the plan is for.' },
  { title: 'Income', blurb: 'What comes in each year.' },
  { title: 'Spending and debts', blurb: 'Where you live, what goes out each month, and what you owe.' },
  { title: 'Cash and super', blurb: 'Money you already have set aside.' },
  { title: 'Properties', blurb: 'Your home and any investments.' },
  { title: 'Shares and crypto', blurb: 'Upload a file or add them by hand.' },
  { title: 'Goals', blurb: 'Where you want to end up.' },
  { title: 'Review', blurb: 'Check everything, then build your plan.' },
];

export function Onboarding() {
  const profile = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const signOut = useApp((s) => s.signOut);
  const session = useApp((s) => s.session);
  const restart = useApp((s) => s.signInSandbox);
  const step = profile.onboardingStep;
  const thorough = true;
  const go = (n: number) => { update((p) => { p.onboardingStep = Math.max(0, Math.min(STEPS.length - 1, n)); }); window.scrollTo({ top: 0 }); };

  const body: Record<number, ReactNode> = {
    0: <AboutYou thorough={thorough} />, 1: <Income thorough={thorough} />, 2: <Spending thorough={thorough} />, 3: <CashSuper thorough={thorough} />,
    4: <Properties thorough={thorough} />, 5: <Shares />, 6: <Goals thorough={thorough} />, 7: <Review go={go} />,
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-line bg-ground/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            {session?.sandbox
              ? <><button className="btn-ghost hidden sm:inline-flex" onClick={() => restart()}>Start again</button><button className="btn-ghost hidden sm:inline-flex" onClick={signOut}>Leave test mode</button></>
              : <button className="btn-ghost hidden sm:inline-flex" onClick={signOut}>Save and exit</button>}
          </div>
        </div>
        {session?.sandbox && <p className="bg-brass px-5 py-1.5 text-center text-xs font-medium text-ground">Test mode. Nothing you enter is saved, and you can start again at any time.</p>}
        <div className="h-1 bg-line/60"><div className="h-1 bg-brass transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <nav aria-label="Setup steps" className="hidden lg:block">
          <ol className="sticky top-24 space-y-1">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <button onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${i === step ? 'bg-surface text-ink ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${i < step ? 'bg-gum/20 text-gum' : i === step ? 'bg-brass text-ground' : 'border border-line'}`}>
                    {i < step ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-w-0">
          <p className="text-sm text-muted lg:hidden">Step {step + 1} of {STEPS.length}</p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{STEPS[step].title}</h1>
          <p className="mt-1 text-muted">{STEPS[step].blurb}</p>
          <div key={step} className="rise panel mt-8 p-5 sm:p-7">{body[step]}</div>
          {step < 7 && (
            <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
              <button className="btn-ghost" onClick={() => go(step - 1)} disabled={step === 0}><Icon name="back" className="h-4 w-4" />Back</button>
              <button className="btn-primary" onClick={() => go(step + 1)}>{step === 6 ? 'Review my answers' : 'Continue'}<Icon name="arrow" className="h-4 w-4" /></button>
            </div>
          )}
        </main>

        <aside className="hidden lg:block"><LivePosition profile={profile} /></aside>
      </div>
    </div>
  );
}

/* ---------- live balance sheet ---------- */
function LivePosition({ profile }: { profile: Profile }) {
  const { quotes } = useQuotes();
  const pos = position(profile, quotes);
  const rows = [
    { label: 'Property', v: pos.propValue },
    { label: 'Shares and crypto', v: pos.shares.value },
    { label: 'Super', v: pos.superBal },
    { label: 'Cash', v: pos.cash },
  ];
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="panel sticky top-24 p-5">
      <p className="text-sm text-muted">Your position so far</p>
      <p className="font-display text-3xl font-semibold mt-1">{money(pos.netWorth)}</p>
      <p className="text-xs text-muted">net worth, updating as you answer</p>
      <div className="mt-5 space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-sm"><span className="text-muted">{r.label}</span><span>{money(r.v, { compact: true })}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-line/60"><div className="h-1.5 rounded-full bg-brass transition-all duration-500" style={{ width: `${(r.v / max) * 100}%` }} /></div>
          </div>
        ))}
        <div className="flex justify-between border-t border-line pt-3 text-sm"><span className="text-muted">Debts</span><span className={pos.liabilities > 0 ? 'text-clay' : ''}>{pos.liabilities > 0 ? '−' : ''}{money(pos.liabilities, { compact: true })}</span></div>
        {pos.takeHome > 0 && <div className="flex justify-between text-sm"><span className="text-muted">Monthly take-home</span><span>{money(pos.takeHome)}</span></div>}
      </div>
      <p className="mt-5 text-xs text-muted">Your answers save as you go. You can leave and pick up here later.</p>
    </div>
  );
}

/* ---------- steps ---------- */
function AboutYou({ thorough }: { thorough: boolean }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const hh = p.household;
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Your first name">{(id) => <TextInput id={id} value={hh.you.name} onChange={(v) => update((d) => { d.household.you.name = v; })} />}</Field>
        <Field label="Your age">{(id) => <NumInput id={id} value={hh.you.age} onChange={(v) => update((d) => { d.household.you.age = v; })} placeholder="35" />}</Field>
        <Field label="State you live in">{(id) => <Select id={id} value={hh.state} onChange={(v) => update((d) => { d.household.state = v; })} options={['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'ACT', 'NT'].map((s) => ({ value: s as any, label: s }))} />}</Field>
      </div>
      <div className="panel p-5">
        <Toggle checked={hh.hasPartner} onChange={(v) => update((d) => { d.household.hasPartner = v; })} label="I’m planning with a partner" description="Your partner’s income, super and share of each asset will count toward the plan." />
        {hh.hasPartner && (
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Field label="Partner’s first name">{(id) => <TextInput id={id} value={hh.partner.name} onChange={(v) => update((d) => { d.household.partner.name = v; })} />}</Field>
            <Field label="Partner’s age">{(id) => <NumInput id={id} value={hh.partner.age} onChange={(v) => update((d) => { d.household.partner.age = v; })} />}</Field>
          </div>
        )}
      </div>
      <div>
        <p className="field-label">Children or other dependants</p>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-quiet h-10 w-10 p-0" aria-label="Remove a dependant" onClick={() => update((d) => { d.household.dependants.pop(); d.household.dependantsDetail?.pop(); })}>−</button>
          <span className="w-8 text-center font-display text-xl">{hh.dependants.length}</span>
          <button type="button" className="btn-quiet h-10 w-10 p-0" aria-label="Add a dependant" onClick={() => update((d) => { d.household.dependants.push(5); (d.household.dependantsDetail ??= []).push(emptyDependant(d.household.dependantsDetail.length, 5)); })}>+</button>
        </div>
        {thorough && hh.dependants.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {hh.dependants.map((age, i) => (
              <label key={i} className="w-28"><span className="text-xs text-muted">Age of child {i + 1}</span>
                <input type="number" className="input mt-1" value={age} onChange={(e) => update((d) => { d.household.dependants[i] = Number(e.target.value); const dd = d.household.dependantsDetail?.[i]; if (dd) dd.age = Number(e.target.value); })} /></label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The marginal tax bracket for a salary (2026–27 resident rates) and what's left after tax. */
function TaxBracket({ salary }: { salary: number }) {
  const rate = salary > 190000 ? 45 : salary > 135000 ? 37 : salary > 45000 ? 30 : salary > 18200 ? 15 : 0;
  return (
    <span className="mt-1 block">
      <span className="rounded bg-raised px-1.5 py-0.5 font-medium text-ink ring-1 ring-line">{rate}% tax bracket</span>
      <span className="ml-1.5">plus 2% Medicare levy · about {money(afterTax(salary))} a year after tax ({money(afterTax(salary) / 12)} a month)</span>
    </span>
  );
}

/** Expected promotions: a new salary from a given year, then the yearly pay rise carries on from there. */
function Promotions({ who }: { who: 'you' | 'partner' }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const list = p.household[who].promotions ?? [];
  const y0 = new Date().getFullYear();
  const age = p.household[who].age ?? p.household.you.age ?? 35;
  const years = Array.from({ length: Math.max(1, p.goals.retirementAge - age) }, (_, j) => y0 + 1 + j).map((y) => ({ value: String(y), label: String(y) }));
  const set = (fn: (l: NonNullable<typeof list>) => void) => update((d) => { const l = (d.household[who].promotions ??= []); fn(l); });
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="field-label">Expected promotions</p>
      <p className="-mt-1 mb-3 text-xs text-muted">A new salary from the year you expect it. Your yearly pay rise carries on from there.</p>
      <div className="space-y-2">
        {list.map((pr, k) => (
          <div key={pr.id} className="flex flex-wrap items-center gap-2">
            <div className="w-28"><Select value={String(pr.year)} onChange={(v) => set((l) => { l[k].year = Number(v); })} options={years} /></div>
            <div className="w-48"><MoneyInput value={pr.salary} onChange={(v) => set((l) => { l[k].salary = v ?? 0; })} suffix="/ year" /></div>
            <button className="btn-ghost p-2" aria-label="Remove promotion" onClick={() => set((l) => { l.splice(k, 1); })}><Icon name="trash" className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button className="btn-quiet mt-2 text-sm" onClick={() => set((l) => { l.push({ id: uid(), year: y0 + 2, salary: Math.round(((p.household[who].salary ?? 0) * 1.2) / 5000) * 5000 }); })}><Icon name="plus" className="h-4 w-4" />Add a promotion</button>
    </div>
  );
}

export function Income({ thorough, withDates }: { thorough: boolean; withDates?: boolean }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const hh = p.household;
  const emp = [{ value: 'payg', label: 'Employee' }, { value: 'self', label: 'Self-employed' }, { value: 'not-working', label: 'Not working' }] as const;
  return (
    <div className="space-y-8">
      {(['you', 'partner'] as const).filter((w) => w === 'you' || hh.hasPartner).map((who) => (
        <div key={who} className="panel p-5">
          <p className="font-display text-lg font-semibold">{who === 'you' ? hh.you.name || 'You' : hh.partner.name || 'Your partner'}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Job title">{(id) => <TextInput id={id} value={hh[who].jobTitle ?? ''} onChange={(v) => update((d) => { d.household[who].jobTitle = v; })} placeholder="e.g. Project manager" />}</Field>
            <Field label="Salary before tax" hint={<>{withDates ? <AsOf date={hh[who].salaryAsOf} onToday={() => update((d) => { d.household[who].salaryAsOf = today(); })} /> : 'Include regular overtime and allowances. Leave super out.'}{(hh[who].salary ?? 0) > 0 && <TaxBracket salary={hh[who].salary!} />}</>}>{(id) => <MoneyInput id={id} value={hh[who].salary} onChange={(v) => update((d) => { d.household[who].salary = v; if (withDates) d.household[who].salaryAsOf = today(); })} suffix="/ year" />}</Field>
            {thorough && <div><p className="field-label">Work</p><Segmented size="sm" value={hh[who].employment} onChange={(v) => update((d) => { d.household[who].employment = v; })} options={[...emp]} /></div>}
            <Field label="Expected pay rise each year" hint="About 3% keeps pace with wages. Inflation is assumed at 2.75%.">{(id) => <NumInput id={id} value={hh[who].salaryGrowth ?? 3} onChange={(v) => update((d) => { d.household[who].salaryGrowth = v ?? 3; })} step={0.5} suffix="% / yr" />}</Field>
          </div>
          <Promotions who={who} />
        </div>
      ))}
      <Field label="Other income" hint="Bonuses, dividends, side business, family payments. Rent from your properties comes in the property step.">{(id) => <MoneyInput id={id} value={hh.otherIncome} onChange={(v) => update((d) => { d.household.otherIncome = v; })} suffix="/ year" />}</Field>
    </div>
  );
}

export function Spending(_: { thorough: boolean }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const f = p.finances;
  const hh = p.household;
  const setDebt = (id: string, patch: Partial<Debt>) => update((d) => { d.finances.debts = d.finances.debts.map((x) => (x.id === id ? { ...x, ...patch } : x)); });
  const total = livingCosts(p);
  const helped = (f.mortgageSharePct ?? 100) < 100;
  const who = hh.hasPartner ? 'you and your partner' : 'you';
  return (
    <div className="space-y-10">
      <section>
        <p className="field-label">Do you own where you live, or rent?</p>
        <Segmented value={f.housing} onChange={(v) => update((d) => { d.finances.housing = v; })} options={[{ value: 'own', label: 'I own it' }, { value: 'rent', label: 'I rent' }, { value: 'other', label: 'Neither (e.g. living with family)' }]} />
        {f.housing === 'rent' && (
          <div className="mt-4 max-w-sm"><Field label="Rent you personally pay" hint="Your share only, if you split rent with housemates.">{(id) => <MoneyInput id={id} value={f.rentMonthly} onChange={(v) => update((d) => { d.finances.rentMonthly = v; })} suffix="/ month" />}</Field></div>
        )}
        {f.housing === 'own' && (
          <div className="mt-4 space-y-4">
            <div className="max-w-sm"><Field label="Mortgage repayments" hint="The full monthly repayment on your home loan. Leave blank if it’s paid off, or to work it out from the loan you add in the Properties step.">{(id) => <MoneyInput id={id} value={f.mortgageMonthly} onChange={(v) => update((d) => { d.finances.mortgageMonthly = v; })} suffix="/ month" />}</Field></div>
            <Toggle checked={helped} onChange={(v) => update((d) => { d.finances.mortgageSharePct = v ? 50 : 100; })} label="Someone else helps pay the mortgage" description={`For example a family member or someone outside this plan. We’ll only count the share ${who} pay.`} />
            {helped && (
              <div className="max-w-xs pl-14"><Field label={`Share ${who} pay`}>{(id) => <NumInput id={id} value={f.mortgageSharePct} onChange={(v) => update((d) => { d.finances.mortgageSharePct = Math.min(100, Math.max(0, v ?? 0)); })} suffix="%" min={0} max={100} />}</Field></div>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="field-label mb-0">Monthly living costs</p>
            <p className="mt-1 max-w-xl text-sm text-muted">Groceries, bills, petrol, transport, subscriptions, insurance, school and everything else you spend each month. Leave out rent, mortgage and loan repayments: they’re counted separately.</p>
          </div>
          <Segmented size="sm" label="How to enter living costs" value={f.livingMode} onChange={(v) => update((d) => { d.finances.livingMode = v; })} options={[{ value: 'total', label: 'Enter a total' }, { value: 'breakdown', label: 'Break it down' }]} />
        </div>
        {f.livingMode === 'total' ? (
          <div className="mt-4 max-w-sm"><Field label="Living costs per month">{(id) => <MoneyInput id={id} value={f.livingMonthly} onChange={(v) => update((d) => { d.finances.livingMonthly = v; })} suffix="/ month" placeholder="e.g. 4,500" />}</Field></div>
        ) : (
          <div className="mt-4 rounded-xl border border-line bg-raised/50 p-4">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {LIVING_CATEGORIES.map((c) => (
                <Field key={c.key} label={c.label}>{(id) => <MoneyInput id={id} value={f.livingBreakdown[c.key] ?? null} onChange={(v) => update((d) => { d.finances.livingBreakdown[c.key] = v; })} suffix="/ mo" />}</Field>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <p className="text-xs text-muted">Car loans and other repayments go in the debts section below.</p>
              <p className="text-sm">Total <span className="font-display text-lg font-semibold">{money(total)}</span> <span className="text-muted">/ month</span></p>
            </div>
          </div>
        )}
      </section>

      <section>
        <p className="field-label">Other debts</p>
        <p className="mb-3 text-sm text-muted">Car loans, personal loans, HECS and credit cards. Lenders count a card’s full limit, even if you pay it off each month.</p>
        <div className="space-y-3">
          {f.debts.map((d) => {
            const isHecs = d.kind === 'hecs';
            const owner = d.owner ?? 'you';
            const person = owner === 'partner' && hh.hasPartner ? hh.partner : hh.you;
            const income = (person.salary ?? 0) + (owner === 'you' ? hh.otherIncome ?? 0 : 0);
            const compulsory = hecsCompulsory(income);
            return (
              <div key={d.id} className="paper rounded-xl border border-line bg-surface p-4">
                <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
                  <Field label="Type">{(id) => <Select id={id} value={d.kind} onChange={(v) => setDebt(d.id, { kind: v, owner: d.owner ?? 'you', rate: v === 'hecs' ? null : d.rate ?? DEBT_RATE[v] })} options={[{ value: 'car', label: 'Car loan' }, { value: 'personal', label: 'Personal loan' }, { value: 'hecs', label: 'HECS / HELP' }, { value: 'credit-card', label: 'Credit card' }, { value: 'other', label: 'Other' }]} />}</Field>
                  {d.kind !== 'credit-card' && <Field label="Amount owing">{(id) => <MoneyInput id={id} value={d.balance} onChange={(v) => setDebt(d.id, { balance: v })} />}</Field>}
                  {d.kind === 'credit-card' && <Field label="Card limit" hint="Lenders count your limit, not what you owe, when working out what you can borrow.">{(id) => <MoneyInput id={id} value={d.limit} onChange={(v) => setDebt(d.id, { limit: v, balance: 0 })} />}</Field>}
                  {!isHecs && d.kind !== 'credit-card' && <Field label="Repayment">{(id) => <MoneyInput id={id} value={d.monthlyRepayment} onChange={(v) => setDebt(d.id, { monthlyRepayment: v })} suffix="/ mo" />}</Field>}
                  {!isHecs && d.kind !== 'credit-card' && <Field label="Interest rate" hint={d.rate === DEBT_RATE[d.kind] ? 'Typical rate. Change it to yours.' : undefined}>{(id) => <NumInput id={id} value={d.rate ?? null} onChange={(v) => setDebt(d.id, { rate: v })} step={0.01} suffix="% p.a." />}</Field>}
                  {isHecs && hh.hasPartner && <Field label="Whose HECS">{(id) => <Select id={id} value={owner} onChange={(v) => setDebt(d.id, { owner: v })} options={[{ value: 'you', label: hh.you.name || 'Mine' }, { value: 'partner', label: hh.partner.name || 'My partner’s' }]} />}</Field>}
                  {isHecs && <Field label="Extra repayments">{(id) => <MoneyInput id={id} value={d.voluntaryMonthly ?? null} onChange={(v) => setDebt(d.id, { voluntaryMonthly: v })} suffix="/ mo" />}</Field>}
                  <div className="flex items-end"><button type="button" className="btn-ghost" onClick={() => update((x) => { x.finances.debts = x.finances.debts.filter((y) => y.id !== d.id); })}><Icon name="trash" className="h-4 w-4" />Remove</button></div>
                </div>
                {isHecs && (d.balance ?? 0) > 0 && (
                  <p className="mt-3 rounded-lg bg-raised px-3 py-2 text-sm">
                    {income > 0
                      ? <>Based on {owner === 'partner' && hh.hasPartner ? `${hh.partner.name || 'your partner'}’s` : 'your'} income of {money(income)}, the compulsory repayment is about <span className="font-semibold">{money(compulsory)} a year</span>{compulsory > 0 ? <> ({money(compulsory / 12)} a month), taken through the tax system</> : <>, because it’s under the repayment threshold</>}.{compulsory > 0 && (d.balance ?? 0) > 0 && <> At that rate it’s paid off in about {Math.ceil((d.balance ?? 0) / (compulsory + (d.voluntaryMonthly ?? 0) * 12))} years.</>}</>
                      : <>Add {owner === 'partner' ? 'their' : 'your'} income in the Income step to see the compulsory repayment.</>}
                    <span className="block text-xs text-muted mt-1">2026–27 estimate from the ATO’s marginal repayment rates. Indexation isn’t included.</span>
                  </p>
                )}
              </div>
            );
          })}
          <button type="button" className="btn-quiet" onClick={() => update((d) => { d.finances.debts.push({ ...emptyDebt(), owner: 'you' }); })}><Icon name="plus" className="h-4 w-4" />Add a debt</button>
          {f.debts.length === 0 && <p className="text-sm text-muted">No other debts? Skip this and continue.</p>}
        </div>
      </section>
      <p className="text-xs text-muted">We use the higher of your living costs and a standard benchmark for your household size, as lenders do.</p>
    </div>
  );
}

export function CashSuper({ withDates }: { thorough: boolean; withDates?: boolean }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const hh = p.household; const f = p.finances;
  const props = p.properties.map((pr) => ({ pr, loans: pr.loans.filter((l) => (l.balance ?? 0) > 0) })).filter((x) => x.loans.length > 0);
  return (
    <div className="space-y-8">
      <div className="paper rounded-xl border border-line bg-surface p-5">
        <div className="max-w-lg"><Field label="Total cash and savings at bank, excluding any offset accounts" hint="Everyday and savings accounts. Offset balances go below, against each property.">{(id) => <MoneyInput id={id} value={f.cashSavings ?? null} onChange={(v) => update((d) => { d.finances.cashSavings = v; })} />}</Field></div>
        <div className="mt-5 border-t border-line pt-5">
          <p className="field-label">Amount in offset accounts</p>
          {props.length === 0 ? (
            <p className="text-sm text-muted">An offset account is linked to a property loan. Add a property with a loan first, then you can put its offset balance here.</p>
          ) : (<>
            <div className="mt-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {props.map(({ pr, loans: ls }) => (
                <div key={pr.id} className="rounded-xl bg-raised p-4 ring-1 ring-line">
                  <p className="font-medium leading-snug">{pr.address || 'Property'}</p>
                  <p className="mb-2 text-xs text-muted">{pr.suburb ? `${pr.suburb} · ` : ''}{pr.use === 'home' ? 'Home' : 'Investment'}</p>
                  <div className="space-y-2">
                    {ls.map((l) => (
                      <div key={l.id}>
                        {ls.length > 1 && <p className="mb-1 text-xs text-muted">{l.lender || 'Loan'} {money(l.balance ?? 0, { compact: true })}</p>}
                        <MoneyInput value={l.offset ?? null} onChange={(v) => update((d) => { const x = d.properties.find((y) => y.id === pr.id)?.loans.find((y) => y.id === l.id); if (x) x.offset = v; })} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Offsets total {money(f.cashOffset ?? 0)}. Your cash in all: {money((f.cashSavings ?? 0) + (f.cashOffset ?? 0))}.</p>
          </>)}
        </div>
      </div>
      <div className="max-w-xl">
        <div className="max-w-sm"><Field label="Emergency cash buffer you want to keep" hint="Kept aside in savings. We won’t use it for deposits, shares or paying off debt.">{(id) => <MoneyInput id={id} value={f.buffer} onChange={(v) => update((d) => { d.finances.buffer = v; })} />}</Field></div>
        {f.buffer != null && f.buffer < recommendedBuffer(p) && (
          <p role="status" className="mt-2 flex gap-2 rounded-lg bg-brass/10 px-3 py-2 text-sm"><Icon name="spark" className="mt-0.5 h-4 w-4 shrink-0 text-brass" />Based on your age and current financial situation, we recommend keeping at least {money(recommendedBuffer(p))} in savings as an emergency reserve.</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['you', 'partner'] as const).filter((w) => w === 'you' || hh.hasPartner).map((who) => {
          const nm = hh[who].name ? `${hh[who].name}’s` : who === 'you' ? 'Your' : 'Partner’s';
          return (
          <div key={who} className="space-y-3 rounded-xl border border-line p-4">
            <Field label={`${nm} superannuation balance`} hint={withDates ? <AsOf date={hh[who].superAsOf} onToday={() => update((d) => { d.household[who].superAsOf = today(); })} /> : undefined}>
              {(id) => <MoneyInput id={id} value={hh[who].superBalance} onChange={(v) => update((d) => { d.household[who].superBalance = v; if (withDates) d.household[who].superAsOf = today(); })} />}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider (optional)">{(id) => <TextInput id={id} value={hh[who].superFund ?? ''} onChange={(v) => update((d) => { d.household[who].superFund = v || undefined; })} placeholder="e.g. your super fund’s name" />}</Field>
              <Field label="Policy / account number (optional)">{(id) => <TextInput id={id} value={hh[who].superMember ?? ''} onChange={(v) => update((d) => { d.household[who].superMember = v || undefined; })} placeholder="Member number" />}</Field>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function Properties({ thorough }: { thorough: boolean }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const [editing, setEditing] = useState<Property | null>(null);
  const save = () => {
    if (!editing) return;
    update((d) => { const i = d.properties.findIndex((x) => x.id === editing.id); if (i >= 0) d.properties[i] = editing; else d.properties.push(editing); });
    setEditing(null);
  };
  if (editing) {
    return (
      <div className="panel p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between"><p className="font-display text-xl font-semibold">{editing.address || 'New property'}</p><button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button></div>
        <PropertyEditor value={editing} onChange={setEditing} thorough={thorough} />
        <div className="mt-6 flex justify-end gap-2"><button className="btn-primary" onClick={save} disabled={!editing.address}>Save property</button></div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {p.properties.map((pr) => {
        const s = propertyStats(pr, p.assumptions.lvr);
        return (
          <div key={pr.id} className="panel flex flex-col overflow-hidden sm:flex-row">
            <LotPlan property={pr} className="h-28 w-full sm:h-auto sm:w-48" />
            <div className="flex flex-1 flex-wrap items-center justify-between gap-4 p-4">
              <div><p className="font-semibold">{pr.address}</p><p className="text-sm text-muted">{pr.suburb} {pr.state} {pr.postcode} · {pr.use === 'home' ? 'Home' : 'Investment'}</p></div>
              <div className="flex gap-6 text-sm"><div><p className="text-muted text-xs">Value</p><p>{money(s.val.value, { compact: true })}</p></div><div><p className="text-muted text-xs">Owing</p><p>{money(s.debt, { compact: true })}</p></div><div><p className="text-muted text-xs">Equity</p><p className="text-gum">{money(s.equity, { compact: true })}</p></div></div>
              <div className="flex gap-1"><button className="btn-quiet py-2" onClick={() => setEditing(structuredClone(pr))}>Edit</button><button className="btn-ghost py-2" aria-label={`Remove ${pr.address}`} onClick={() => update((d) => { d.properties = d.properties.filter((x) => x.id !== pr.id); })}><Icon name="trash" className="h-4 w-4" /></button></div>
            </div>
          </div>
        );
      })}
      <button className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-6 text-muted transition-colors hover:border-brass hover:text-ink" onClick={() => setEditing({ ...emptyProperty(), use: p.properties.some((x) => x.use === 'home') ? 'investment' : 'home' })}>
        <Icon name="plus" />{p.properties.length ? 'Add another property' : 'Add your first property'}
      </button>
      {p.properties.length === 0 && <p className="text-center text-sm text-muted">Renting or don’t own property yet? Continue. Your plan will show when you could buy.</p>}
    </div>
  );
}

function Shares() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const [manual, setManual] = useState<Holding>({ id: uid(), code: '', exchange: 'ASX', name: '', units: 0, avgCost: 0, firstBought: '', kind: 'share', currency: 'AUD' });
  const merge = (list: Holding[]) => update((d) => {
    for (const h of list) {
      const cur = d.holdings.find((x) => x.code === h.code && x.exchange === h.exchange);
      if (cur) { const cost = cur.units * cur.avgCost + h.units * h.avgCost; cur.units += h.units; cur.avgCost = cost / cur.units; }
      else d.holdings.push({ ...h, id: uid() });
    }
  });
  return (
    <div className="space-y-8">
      <CsvImport onImport={merge} />
      <details className="panel p-5">
        <summary className="cursor-pointer font-medium">Or add a holding by hand</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Code">{(id) => <TextInput id={id} value={manual.code} onChange={(v) => setManual({ ...manual, code: v.toUpperCase(), name: v.toUpperCase() })} placeholder="VAS" />}</Field>
          <Field label="Market">{(id) => <Select id={id} value={manual.exchange} onChange={(v) => setManual({ ...manual, exchange: v, kind: v === 'CRYPTO' ? 'crypto' : manual.kind, currency: defaultCurrency(v) })} options={[{ value: 'ASX', label: 'ASX' }, { value: 'NASDAQ', label: 'NASDAQ' }, { value: 'NYSE', label: 'NYSE' }, { value: 'CRYPTO', label: 'Crypto' }]} />}</Field>
          <Field label="Units">{(id) => <NumInput id={id} value={manual.units || null} onChange={(v) => setManual({ ...manual, units: v ?? 0 })} step={0.0001} />}</Field>
          <Field label="Average buy price" className="sm:col-span-2">{(id) => <PriceInput id={id} value={manual.avgCost || null} onChange={(v) => setManual({ ...manual, avgCost: v ?? 0 })} currency={manual.currency ?? 'AUD'} onCurrency={(c) => setManual({ ...manual, currency: c })} />}</Field>
          <div className="flex items-end"><button className="btn-primary w-full" disabled={!manual.code || !manual.units || !manual.avgCost} onClick={() => { merge([manual]); setManual({ ...manual, id: uid(), code: '', name: '', units: 0, avgCost: 0 }); }}>Add</button></div>
        </div>
      </details>
      {p.holdings.length > 0 && (
        <div>
          <p className="field-label">{p.holdings.length} holdings in your plan</p>
          <div className="flex flex-wrap gap-2">
            {p.holdings.map((h) => (
              <span key={h.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm">
                <span className="font-semibold">{h.code}</span><span className="text-muted">{num(h.units, 4)} @ {price(h.avgCost, h.currency)}</span>
                <button aria-label={`Remove ${h.code}`} className="rounded-full p-1 text-muted hover:bg-raised hover:text-clay" onClick={() => update((d) => { d.holdings = d.holdings.filter((x) => x.id !== h.id); })}><Icon name="x" className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Goals({ thorough }: { thorough: boolean }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const g = p.goals;
  const riskLabels = ['Very cautious', 'Cautious', 'Balanced', 'Growth', 'High growth'];
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Age you’d like to stop working">{(id) => <NumInput id={id} value={g.retirementAge} onChange={(v) => update((d) => { d.goals.retirementAge = v ?? 60; })} />}</Field>
        <Field label="Yearly income you want then" hint="In today’s dollars, before tax.">{(id) => <MoneyInput id={id} value={g.passiveIncome} onChange={(v) => update((d) => { d.goals.passiveIncome = v ?? 0; })} suffix="/ year" />}</Field>
        <Field label="Properties you’d like to own">{(id) => <NumInput id={id} value={g.targetProperties} onChange={(v) => update((d) => { d.goals.targetProperties = v ?? 0; })} />}</Field>
        <Field label="Age you’re planning to live to" hint="Your plan runs to this age, so you can see if the money lasts.">{(id) => <NumInput id={id} value={g.lifeExpectancy ?? 90} onChange={(v) => update((d) => { d.goals.lifeExpectancy = v ?? 90; })} min={60} max={110} />}</Field>
      </div>
      <WealthFocusPicker value={g.wealthFocus} onChange={(v) => update((d) => { d.goals.wealthFocus = v; })} />
      <div className="panel p-5">
        <label htmlFor="risk" className="field-label">How comfortable are you with ups and downs?</label>
        <input id="risk" type="range" min={1} max={5} value={g.risk} onChange={(e) => update((d) => { d.goals.risk = Number(e.target.value); })} className="mt-3 w-full" />
        <div className="mt-1 flex justify-between text-xs text-muted"><span>Steady, slower growth</span><span className="font-medium text-ink">{riskLabels[g.risk - 1]}</span><span>Bigger swings, more growth</span></div>
      </div>
      {thorough && (
        <div>
          <p className="field-label">Big costs coming up</p>
          <p className="text-sm text-muted mb-3">Renovations, school fees, a wedding, a car. The plan sets cash aside for them.</p>
          <div className="space-y-3">
            {g.events.map((ev) => (
              <div key={ev.id} className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-[1fr_120px_160px_auto]">
                <TextInput value={ev.label} onChange={(v) => update((d) => { d.goals.events.find((x) => x.id === ev.id)!.label = v; })} placeholder="What is it?" />
                <NumInput value={ev.year} onChange={(v) => update((d) => { d.goals.events.find((x) => x.id === ev.id)!.year = v ?? ev.year; })} />
                <MoneyInput value={ev.amount} onChange={(v) => update((d) => { d.goals.events.find((x) => x.id === ev.id)!.amount = v ?? 0; })} />
                <button className="btn-ghost" aria-label="Remove" onClick={() => update((d) => { d.goals.events = d.goals.events.filter((x) => x.id !== ev.id); })}><Icon name="trash" className="h-4 w-4" /></button>
              </div>
            ))}
            <button className="btn-quiet" onClick={() => update((d) => { d.goals.events.push({ id: uid(), label: '', year: new Date().getFullYear() + 2, amount: 20000 }); })}><Icon name="plus" className="h-4 w-4" />Add a cost</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Review({ go }: { go: (n: number) => void }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const { quotes } = useQuotes();
  const pos = position(p, quotes);
  const hh = p.household;
  const missing: string[] = [];
  if (!hh.you.age) missing.push('your age');
  if (!hh.you.salary && hh.you.employment !== 'not-working') missing.push('your income');
  if (!livingCosts(p)) missing.push('living costs');
  const sections = [
    { step: 0, title: 'About you', lines: [`${hh.you.name || 'You'}${hh.you.age ? `, ${hh.you.age}` : ''}${hh.hasPartner ? ` and ${hh.partner.name || 'partner'}${hh.partner.age ? `, ${hh.partner.age}` : ''}` : ''}`, `${hh.dependants.length} dependant${hh.dependants.length === 1 ? '' : 's'} · ${hh.state}`] },
    { step: 1, title: 'Income', lines: [`${money((hh.you.salary ?? 0) + (hh.hasPartner ? hh.partner.salary ?? 0 : 0))} household salary`, `${money(hh.otherIncome ?? 0)} other income`] },
    { step: 2, title: 'Spending and debts', lines: [`${p.finances.housing === 'rent' ? `Renting, ${money(p.finances.rentMonthly ?? 0)} a month` : p.finances.housing === 'own' ? 'Owns their home' : 'Not paying rent or a mortgage'}`, `${money(livingCosts(p))} a month living costs`, `${p.finances.debts.length} other debt${p.finances.debts.length === 1 ? '' : 's'} · ${money(pos.otherDebt)}`] },
    { step: 3, title: 'Cash and super', lines: [`${money(pos.cash)} cash${p.finances.cashOffset ? `, ${money(p.finances.cashOffset)} in offset` : ''}`, `${money(pos.superBal)} super`] },
    { step: 4, title: 'Properties', lines: p.properties.length ? p.properties.map((x) => `${x.address}, ${x.suburb}`) : ['None yet'] },
    { step: 5, title: 'Shares and crypto', lines: [`${p.holdings.length} holdings · ${money(pos.shares.value)}`] },
    { step: 6, title: 'Goals', lines: [`Stop work at ${p.goals.retirementAge} on ${money(p.goals.passiveIncome)} a year`, `${p.goals.targetProperties} properties`] },
  ];
  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-end justify-between gap-6 p-6">
        <div><p className="text-sm text-muted">Net worth today</p><p className="font-display text-4xl font-semibold">{money(pos.netWorth)}</p></div>
        <div className="flex gap-8 text-sm">
          <div><p className="text-muted text-xs">Usable equity</p><p className="font-display text-xl">{money(pos.usable, { compact: true })}</p></div>
          <div><p className="text-muted text-xs">Borrowing capacity</p><p className="font-display text-xl">{money(pos.bc.capacity, { compact: true })}</p></div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {sections.map((s) => (
          <div key={s.title} className="paper rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between"><p className="font-medium">{s.title}</p><button className="text-sm text-brass hover:underline" onClick={() => go(s.step)}>Edit</button></div>
            {s.lines.map((l, i) => <p key={i} className="mt-1 text-sm text-muted">{l}</p>)}
          </div>
        ))}
      </div>
      {missing.length > 0 && <p className="text-sm text-clay">Your plan will be more accurate with {missing.join(', ')}.</p>}
      <div className="flex items-center justify-between border-t border-line pt-6">
        <button className="btn-ghost" onClick={() => go(6)}><Icon name="back" className="h-4 w-4" />Back</button>
        <button className="btn-primary px-6 py-3 text-base" onClick={() => update((d) => { d.onboarded = true; d.firstLookSeen = false; })}>Build my plan<Icon name="arrow" className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
function AsOf({ date, onToday }: { date?: string; onToday: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <span>{date ? `As of ${new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not dated yet'}</span>
      <button type="button" className="font-medium text-brass hover:underline" onClick={onToday}>Update as of today</button>
    </span>
  );
}
