import type { AuState, Property, ValuationEntry } from '../lib/types';
import { emptyLoan, uid } from '../lib/defaults';
import { Field, Icon, MoneyInput, NumInput, Segmented, Select, TextInput } from './ui';

const STATES: AuState[] = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'ACT', 'NT'];

export function PropertyEditor({ value, onChange, thorough }: { value: Property; onChange: (p: Property) => void; thorough: boolean }) {
  const set = (patch: Partial<Property>) => onChange({ ...value, ...patch });
  const myEstimate = value.valuations.find((v) => v.source === 'My estimate')?.value ?? null;
  const setEstimate = (v: number | null) => {
    const rest = value.valuations.filter((x) => x.source !== 'My estimate');
    const entry: ValuationEntry[] = v ? [{ id: uid(), source: 'My estimate', value: v, date: new Date().toISOString().slice(0, 10) }] : [];
    set({ valuations: [...rest, ...entry] });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-6">
        <Field label="Street address" className="sm:col-span-6">{(id) => <TextInput id={id} value={value.address} onChange={(v) => set({ address: v })} placeholder="14 Kirkland Avenue" autoComplete="street-address" />}</Field>
        <Field label="Suburb" className="sm:col-span-3">{(id) => <TextInput id={id} value={value.suburb} onChange={(v) => set({ suburb: v })} placeholder="Coorparoo" />}</Field>
        <Field label="State" className="sm:col-span-1">{(id) => <Select id={id} value={value.state} onChange={(v) => set({ state: v })} options={STATES.map((s) => ({ value: s, label: s }))} />}</Field>
        <Field label="Postcode" className="sm:col-span-2">{(id) => <TextInput id={id} value={value.postcode} onChange={(v) => set({ postcode: v.replace(/\D/g, '').slice(0, 4) })} placeholder="4151" />}</Field>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <div><p className="field-label">What is it?</p><Segmented value={value.use} onChange={(v) => set({ use: v })} options={[{ value: 'home', label: 'Our home' }, { value: 'investment', label: 'Investment' }]} /></div>
        <div><p className="field-label">Type</p><Segmented value={value.kind} onChange={(v) => set({ kind: v })} options={[{ value: 'house', label: 'House' }, { value: 'unit', label: 'Unit' }, { value: 'townhouse', label: 'Townhouse' }, { value: 'land', label: 'Land' }]} /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Purchase price">{(id) => <MoneyInput id={id} value={value.purchasePrice} onChange={(v) => set({ purchasePrice: v })} />}</Field>
        <Field label="Purchased">{(id) => <input id={id} type="month" className="input" value={value.purchaseDate} onChange={(e) => set({ purchaseDate: e.target.value })} />}</Field>
        <Field label="What you think it’s worth" hint="Optional. You can add realestate.com.au or RP Data estimates later.">{(id) => <MoneyInput id={id} value={myEstimate} onChange={setEstimate} />}</Field>
        {value.use === 'investment' && <Field label="Rent">{(id) => <MoneyInput id={id} value={value.weeklyRent} onChange={(v) => set({ weeklyRent: v })} suffix="/ week" />}</Field>}
        <Field label="Year built" hint="Helps Wise spot renovation opportunities.">{(id) => <NumInput id={id} value={value.yearBuilt} onChange={(v) => set({ yearBuilt: v })} placeholder="2005" />}</Field>
        {thorough && <Field label="Bedrooms">{(id) => <NumInput id={id} value={value.bedrooms} onChange={(v) => set({ bedrooms: v })} placeholder="3" />}</Field>}
      </div>

      {thorough && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Owned by">{(id) => <Select id={id} value={value.structure} onChange={(v) => set({ structure: v })} options={[
            { value: 'personal', label: 'Me personally' }, { value: 'joint', label: 'Jointly' }, { value: 'trust', label: 'Family trust' }, { value: 'company', label: 'Company' }, { value: 'smsf', label: 'SMSF' }]} />}</Field>
          <Field label="Yearly holding costs" hint="Rates, insurance, strata, maintenance">{(id) => <MoneyInput id={id} value={value.annualCosts} onChange={(v) => set({ annualCosts: v })} suffix="/ year" />}</Field>
          <Field label="Growth assumption">{(id) => <NumInput id={id} value={value.growthRate} onChange={(v) => set({ growthRate: v ?? 0 })} step={0.5} suffix="% p.a." />}</Field>
          {value.use === 'investment' && <>
            <Field label="Vacancy">{(id) => <NumInput id={id} value={value.vacancyWeeks} onChange={(v) => set({ vacancyWeeks: v ?? 0 })} suffix="wks / yr" />}</Field>
            <Field label="Management fee">{(id) => <NumInput id={id} value={value.managementPct} onChange={(v) => set({ managementPct: v ?? 0 })} step={0.5} suffix="% of rent" />}</Field>
          </>}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="field-label mb-0">Loans on this property</p>
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => set({ loans: [...value.loans, emptyLoan()] })}><Icon name="plus" className="h-4 w-4" />Add a split</button>
        </div>
        <div className="space-y-3">
          {value.loans.map((l, i) => {
            const setL = (patch: Partial<typeof l>) => set({ loans: value.loans.map((x) => (x.id === l.id ? { ...x, ...patch } : x)) });
            return (
              <div key={l.id} className="rounded-xl border border-line bg-raised/50 p-4">
                <div className="grid gap-3 sm:grid-cols-6">
                  <Field label="Lender" className="sm:col-span-2">{(id) => <TextInput id={id} value={l.lender} onChange={(v) => setL({ lender: v })} placeholder="e.g. CBA" />}</Field>
                  <Field label="Balance owing" className="sm:col-span-2">{(id) => <MoneyInput id={id} value={l.balance} onChange={(v) => setL({ balance: v })} />}</Field>
                  <Field label="Interest rate" className="sm:col-span-2">{(id) => <NumInput id={id} value={l.rate} onChange={(v) => setL({ rate: v })} step={0.01} suffix="% p.a." placeholder="6.19" />}</Field>
                  <div className="sm:col-span-3"><p className="field-label">Repayments</p><Segmented size="sm" value={l.type} onChange={(v) => setL({ type: v })} options={[{ value: 'pi', label: 'Principal & interest' }, { value: 'io', label: 'Interest only' }]} /></div>
                  {thorough && <Field label="Years left" className="sm:col-span-1">{(id) => <NumInput id={id} value={l.yearsLeft} onChange={(v) => setL({ yearsLeft: v })} />}</Field>}
                  {thorough && <Field label="Offset balance" className="sm:col-span-2">{(id) => <MoneyInput id={id} value={l.offset} onChange={(v) => setL({ offset: v })} />}</Field>}
                </div>
                {value.loans.length > 1 && <button type="button" className="mt-2 text-xs text-muted hover:text-clay" onClick={() => set({ loans: value.loans.filter((x) => x.id !== l.id) })}>Remove split {i + 1}</button>}
              </div>
            );
          })}
          {value.loans.length === 0 && <p className="text-sm text-muted">No loan. Owned outright.</p>}
        </div>
      </div>
    </div>
  );
}
