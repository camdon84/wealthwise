import { useState } from 'react';
import { useApp } from '../lib/store';
import { propertyStats } from '../lib/calc';
import { money, pct } from '../lib/format';
import { uid } from '../lib/defaults';
import { PropertyPhoto } from '../components/Aerial';
import { Icon, MoneyInput, NumInput } from '../components/ui';

/** Typical 2026 Australian costs (mid-range, metro) and a simple value-uplift rule of thumb for each item. */
const ITEMS = [
  { key: 'kitchen', label: 'Kitchen renovation', low: 25000, high: 45000, budget: 30000, mult: 1.5 },
  { key: 'bathroom', label: 'Bathroom renovation', low: 15000, high: 35000, budget: 26000, mult: 1.5 },
  { key: 'addBathroom', label: 'Add a bathroom or ensuite', low: 25000, high: 50000, budget: 35000, mult: 2 },
  { key: 'addBedroom', label: 'Add a bedroom', low: 40000, high: 90000, budget: 60000, mult: 2 },
  { key: 'paintIn', label: 'Paint inside', low: 6000, high: 15000, budget: 9000, mult: 2 },
  { key: 'paintOut', label: 'Paint outside', low: 8000, high: 20000, budget: 12000, mult: 2 },
  { key: 'floors', label: 'New flooring', low: 8000, high: 20000, budget: 12000, mult: 1.8 },
  { key: 'lighting', label: 'Lighting and fixtures', low: 3000, high: 8000, budget: 5000, mult: 1.5 },
  { key: 'landscaping', label: 'Front yard and landscaping', low: 5000, high: 20000, budget: 10000, mult: 2 },
  { key: 'deck', label: 'Deck or outdoor area', low: 10000, high: 30000, budget: 18000, mult: 1.5 },
  { key: 'roof', label: 'Roof restoration', low: 8000, high: 15000, budget: 11000, mult: 1.2 },
];

export function Renovate() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const [propId, setPropId] = useState(p.properties.find((x) => x.yearBuilt && new Date().getFullYear() - x.yearBuilt > 15)?.id ?? p.properties[0]?.id);
  const [picked, setPicked] = useState<Record<string, { on: boolean; budget: number | null; mult: number | null }>>({});
  const [done, setDone] = useState('');
  const pr = p.properties.find((x) => x.id === propId);
  if (!pr) return <div className="space-y-6"><h1 className="font-display text-3xl font-semibold sm:text-4xl">Renovator</h1><div className="panel p-10 text-center"><p className="font-medium">Add a property first</p><p className="mt-1 text-sm text-muted">The Renovator works out what a renovation could add to one of your properties.</p></div></div>;

  const s = propertyStats(pr, p.assumptions.lvr);
  const rows = ITEMS.map((it) => ({ ...it, state: picked[it.key] ?? { on: false, budget: it.budget, mult: it.mult } }));
  const chosen = rows.filter((r) => r.state.on);
  const spend = chosen.reduce((a, r) => a + (r.state.budget ?? 0), 0);
  const uplift = chosen.reduce((a, r) => a + (r.state.budget ?? 0) * (r.state.mult ?? 1), 0);
  const newValue = s.val.value + uplift;
  const usableAfter = Math.max(0, newValue * (p.assumptions.lvr / 100) - s.debt);
  const share = s.val.value ? spend / s.val.value : 0;
  const set = (key: string, patch: Partial<{ on: boolean; budget: number | null; mult: number | null }>) => {
    const base = rows.find((r) => r.key === key)!.state;
    setPicked({ ...picked, [key]: { ...base, ...patch } });
  };
  const age = pr.yearBuilt ? new Date().getFullYear() - pr.yearBuilt : null;

  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-semibold sm:text-4xl">Renovator</h1><p className="text-muted">Pick a property and the work you’re thinking about. See what it could add in value and usable equity.</p></div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Property">
        {p.properties.map((x) => (
          <button key={x.id} role="radio" aria-checked={x.id === propId} onClick={() => { setPropId(x.id); setPicked({}); setDone(''); }}
            className={`rounded-xl border px-4 py-2 text-left text-sm transition-colors ${x.id === propId ? 'border-brass bg-surface text-ink paper' : 'border-line text-muted hover:text-ink'}`}>
            <span className="block font-medium">{x.address}</span><span className="block text-xs text-muted">{x.suburb}{x.yearBuilt ? ` · built ${x.yearBuilt}` : ''}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="panel p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold">What would you do?</h2>
          <p className="mt-1 text-sm text-muted">Typical mid-range costs in 2026. Set your own budget and how much value you expect each dollar to add.</p>
          <ul className="mt-5 divide-y divide-line">
            {rows.map((r) => (
              <li key={r.key} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex min-w-[220px] flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brass))]" checked={r.state.on} onChange={(e) => set(r.key, { on: e.target.checked })} />
                    <span><span className="block font-medium">{r.label}</span><span className="block text-xs text-muted">Typically {money(r.low, { compact: true })} to {money(r.high, { compact: true })}</span></span>
                  </label>
                  {r.state.on && (
                    <div className="flex items-center gap-2">
                      <div className="w-36"><MoneyInput value={r.state.budget} onChange={(v) => set(r.key, { budget: v })} /></div>
                      <span className="text-sm text-muted">×</span>
                      <div className="w-20"><NumInput value={r.state.mult} onChange={(v) => set(r.key, { mult: v })} step={0.1} /></div>
                      <span className="w-24 text-right text-sm font-medium text-gum">+{money((r.state.budget ?? 0) * (r.state.mult ?? 1), { compact: true })}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">“×” is the value you expect each dollar to add, a simple rule of thumb. Resale studies often find kitchens and bathrooms return less than their cost, while cosmetic work can return more. A local agent or valuer can tell you what buyers in {pr.suburb} pay for.</p>
        </section>

        <aside className="space-y-6">
          <section className="panel overflow-hidden">
            <PropertyPhoto property={pr} className="h-28 w-full" />
            <div className="p-5 sm:p-6">
              <p className="text-sm text-muted">{pr.address}{age ? ` · ${age} years old` : ''}</p>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div><p className="text-xs text-muted">You’d spend</p><p className="font-display text-2xl font-semibold">{money(spend)}</p></div>
                <div><p className="text-xs text-muted">Value could rise by</p><p className="font-display text-2xl font-semibold text-gum">{money(uplift, { sign: true })}</p></div>
                <div><p className="text-xs text-muted">Value now → after</p><p className="font-medium">{money(s.val.value, { compact: true })} → {money(newValue, { compact: true })}</p></div>
                <div><p className="text-xs text-muted">Usable equity after</p><p className="font-medium">{money(s.usable, { compact: true })} → {money(usableAfter, { compact: true })}</p></div>
              </div>
              {spend > 0 && <p className="mt-4 text-sm">Net gain after costs <span className="font-semibold">{money(uplift - spend, { sign: true })}</span>{spend ? <span className="text-muted"> · {pct(((uplift - spend) / spend) * 100, 0, true)} on what you spend</span> : null}</p>}
              {share > 0.12 && (
                <p className="mt-4 rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">Careful of over-capitalising: this is {pct(share * 100, 0)} of the property’s value. Past about 10–15%, buyers in the street often won’t pay for the extra.</p>
              )}
              {pr.use === 'investment' && spend > 0 && <p className="mt-3 text-xs text-muted">On an investment property, some of this may be claimable as depreciation. Ask your accountant.</p>}
              <div className="mt-5 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={!spend} onClick={() => { update((d) => { d.goals.events.push({ id: uid(), label: `Renovate ${pr.address}`, year: new Date().getFullYear() + 1, amount: spend }); }); setDone('Added the cost to your plan for next year. Change the year under big costs in setup.'); }}>Add the cost to my plan</button>
                <button className="btn-quiet" disabled={!uplift} onClick={() => { update((d) => { d.properties.find((x) => x.id === pr.id)!.valuations.push({ id: uid(), source: 'My estimate', value: Math.round(newValue), date: new Date().toISOString().slice(0, 10) }); }); setDone('Added your after-renovation value as an estimate on the property.'); }}>Use the new value</button>
              </div>
              {done && <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-gum"><Icon name="check" className="h-4 w-4" />{done}</p>}
            </div>
          </section>
          <section className="panel p-5 sm:p-6">
            <p className="font-medium">See it before you build it</p>
            <p className="mt-1 text-sm text-muted">Coming next: upload a photo of the room and AI shows how it could look renovated, in the style you choose.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
