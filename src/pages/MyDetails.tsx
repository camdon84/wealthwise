import { useState } from 'react';
import { useApp } from '../lib/store';
import { dependantsMonthly } from '../lib/calc';
import { money } from '../lib/format';
import { emptyDependant } from '../lib/defaults';
import type { Dependant } from '../lib/types';
import { CashSuper, Income, Spending } from '../onboarding/Onboarding';
import { Field, Icon, MoneyInput, NumInput, Segmented, Select, TextInput } from '../components/ui';

type Tab = 'income' | 'home' | 'cash' | 'dependants';

export function MyDetails({ initialTab = 'income' }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-3xl font-semibold sm:text-4xl">My Details</h1><p className="text-muted">Keep these up to date and your plan updates with them.</p></div>
        <Segmented scroll="fit" label="Section" value={tab} onChange={setTab} options={[{ value: 'income', label: 'Work and Income' }, { value: 'home', label: 'Home and Living Costs' }, { value: 'cash', label: 'Cash, Superannuation and Debts' }, { value: 'dependants', label: 'Dependants' }]} />
      </div>
      {tab === 'dependants' ? <Dependants embedded /> : (
      <section className="panel p-5 sm:p-7">
        {tab === 'income' && <Income thorough withDates />}
        {tab === 'home' && <Spending thorough />}
        {tab === 'cash' && <CashSuper thorough withDates />}
      </section>
      )}
    </div>
  );
}

const thisYear = new Date().getFullYear();

export function Dependants({ embedded }: { embedded?: boolean } = {}) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const list = p.household.dependantsDetail ?? [];
  const sync = (d: typeof p) => { d.household.dependants = (d.household.dependantsDetail ?? []).map((x) => x.age ?? 0); };
  const set = (id: string, patch: Partial<Dependant>) => update((d) => { Object.assign(d.household.dependantsDetail!.find((x) => x.id === id)!, patch); sync(d); });
  const total = dependantsMonthly(p);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>{embedded ? <h2 className="font-display text-xl font-semibold">Dependants</h2> : <h1 className="font-display text-3xl font-semibold sm:text-4xl">Dependants</h1>}<p className="text-muted">Children or anyone else you support. Their costs stop in your plan once they reach the age you set.</p></div>
        <button className="btn-primary" onClick={() => update((d) => { (d.household.dependantsDetail ??= []).push(emptyDependant(d.household.dependantsDetail.length)); sync(d); })}><Icon name="plus" className="h-4 w-4" />Add a dependant</button>
      </div>
      {list.length > 0 && <p className="text-sm text-muted">Together they cost about <span className="font-semibold text-ink">{money(total)} a month</span> right now. That’s counted on top of your own living costs, so leave school fees and kids’ costs out of those.</p>}
      {list.length === 0 && <div className="panel p-10 text-center"><p className="font-medium">No dependants added</p><p className="mt-1 text-sm text-muted">Add a child or anyone else you support to include their costs in your plan.</p></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        {list.map((dep, i) => {
          const monthly = (dep.monthlyCosts ?? 0) + (dep.childcareMonthly ?? 0) + (dep.activitiesMonthly ?? 0) + (dep.schoolFeesYearly ?? 0) / 12;
          return (
            <section key={dep.id} className="panel p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs text-muted">Dependant {i + 1}</p><p className="font-display text-xl font-semibold">{dep.name || `Dependant ${i + 1}`}</p></div>
                <button className="btn-ghost p-2" aria-label={`Remove ${dep.name}`} onClick={() => update((d) => { d.household.dependantsDetail = d.household.dependantsDetail!.filter((x) => x.id !== dep.id); sync(d); })}><Icon name="trash" className="h-4 w-4" /></button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Name">{(id) => <TextInput id={id} value={dep.name} onChange={(v) => set(dep.id, { name: v })} />}</Field>
                <Field label="Age">{(id) => <NumInput id={id} value={dep.age} onChange={(v) => set(dep.id, { age: v })} />}</Field>
                <Field label="Support until age">{(id) => <NumInput id={id} value={dep.supportUntil} onChange={(v) => set(dep.id, { supportUntil: v ?? 18 })} />}</Field>
                <Field label="Everyday costs" hint="Food, clothes, phone, pocket money">{(id) => <MoneyInput id={id} value={dep.monthlyCosts} onChange={(v) => set(dep.id, { monthlyCosts: v })} suffix="/ mo" />}</Field>
                <Field label="Childcare">{(id) => <MoneyInput id={id} value={dep.childcareMonthly} onChange={(v) => set(dep.id, { childcareMonthly: v })} suffix="/ mo" />}</Field>
                <Field label="Sport and activities">{(id) => <MoneyInput id={id} value={dep.activitiesMonthly} onChange={(v) => set(dep.id, { activitiesMonthly: v })} suffix="/ mo" />}</Field>
                <Field label="School fees">{(id) => <MoneyInput id={id} value={dep.schoolFeesYearly} onChange={(v) => set(dep.id, { schoolFeesYearly: v })} suffix="/ year" />}</Field>
                <div>
                  <Field label="Expected year to start school" hint={dep.schoolDone ? 'No school fees in the plan.' : (() => { const y = dep.schoolStartYear ?? (dep.age != null ? thisYear + 5 - dep.age : null); return y == null ? 'Fees count from now.' : y <= thisYear ? y + 12 < thisYear ? 'Finished school: no fees in the plan.' : `At school now: fees run to ${y + 12}.` : `Expected to start school in ${y - thisYear} ${y - thisYear === 1 ? 'year’s' : 'years’'} time. Fees run ${y} to ${y + 12}.`; })()}>
                    {(id) => <Select id={id} value={String(dep.schoolStartYear ?? (dep.age != null ? thisYear + 5 - dep.age : thisYear))} onChange={(v) => set(dep.id, { schoolStartYear: Number(v) })}
                      options={Array.from({ length: 36 }, (_, j) => thisYear - 18 + j).map((y) => ({ value: String(y), label: y < thisYear ? `${y} (started)` : String(y) }))} />}
                  </Field>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brass))]" checked={!!dep.schoolDone} onChange={(e) => set(dep.id, { schoolDone: e.target.checked })} />My child has already finished school</label>
                </div>
              </div>
              <p className="mt-4 border-t border-line pt-3 text-sm">About <span className="font-semibold">{money(monthly)} a month</span>{dep.age != null && <span className="text-muted">, for another {Math.max(0, dep.supportUntil - dep.age)} years</span>}</p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
