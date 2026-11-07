import { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { propertyStats } from '../lib/calc';
import { money, pct } from '../lib/format';
import { uid } from '../lib/defaults';
import { PropertyPhoto } from '../components/Aerial';
import { Field, Icon, MoneyInput, Select } from '../components/ui';
import { priceMode } from '../lib/prices';
import type { Renovation } from '../lib/types';

/** Typical 2026 Australian costs (mid-range, metro) and a simple value-uplift rule of thumb for each item. */
const ITEMS = [
  { key: 'kitchen', label: 'Kitchen renovation', low: 25000, high: 45000, budget: 30000, mult: 1.7 },
  { key: 'bathroom', label: 'Bathroom renovation', low: 15000, high: 35000, budget: 26000, mult: 1.7 },
  { key: 'addBathroom', label: 'Add a bathroom or ensuite', low: 25000, high: 50000, budget: 35000, mult: 2 },
  { key: 'addBedroom', label: 'Add a bedroom', low: 40000, high: 90000, budget: 60000, mult: 2 },
  { key: 'paintIn', label: 'Paint inside', low: 6000, high: 15000, budget: 9000, mult: 2 },
  { key: 'paintOut', label: 'Paint outside', low: 8000, high: 20000, budget: 12000, mult: 2 },
  { key: 'floors', label: 'New flooring', low: 8000, high: 20000, budget: 12000, mult: 1.8 },
  { key: 'lighting', label: 'Lighting and fixtures', low: 3000, high: 8000, budget: 5000, mult: 1.5 },
  { key: 'landscaping', label: 'Front yard and landscaping', low: 5000, high: 20000, budget: 10000, mult: 2 },
  { key: 'deck', label: 'Deck or outdoor area', low: 10000, high: 30000, budget: 18000, mult: 1.5 },
  { key: 'roof', label: 'Roof restoration', low: 8000, high: 15000, budget: 11000, mult: 1.2 },
  { key: 'pool', label: 'Add a pool', low: 50000, high: 90000, budget: 65000, mult: 2 },
];

export function Renovate() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const [propId, setPropId] = useState(p.properties.find((x) => x.yearBuilt && new Date().getFullYear() - x.yearBuilt > 15)?.id ?? p.properties[0]?.id);
  const [picked, setPicked] = useState<Record<string, { on: boolean; budget: number | null; mult: number | null }>>({});
  const [done, setDone] = useState('');
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear + 1);
  const [rentUp, setRentUp] = useState<number | null>(null);
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
          <p className="mt-1 text-sm text-muted">Typical mid-range costs in 2026. Tick what you’d do and set your own budget.</p>
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
                      <span className="text-sm text-muted">Renovation cost</span>
                      <div className="w-36"><MoneyInput value={r.state.budget} onChange={(v) => set(r.key, { budget: v })} /></div>
                      <span className="w-24 text-right text-sm font-medium text-gum" title="Estimated value added">+{money((r.state.budget ?? 0) * (r.state.mult ?? 1), { compact: true })}<span className="block text-[10px] font-normal text-muted">value added</span></span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Value added is a rule-of-thumb estimate for each type of work, not a valuation. A local agent or valuer can tell you what buyers in {pr.suburb} pay for.</p>
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
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Field label="Planned for">{(id) => <Select id={id} value={String(year)} onChange={(v) => setYear(Number(v))}
                  options={Array.from({ length: Math.max(2, p.goals.retirementAge - (p.household.you.age ?? 35) + 1) }, (_, j) => thisYear + j).map((y) => ({ value: String(y), label: y === thisYear ? `This year (${y})` : String(y) }))} />}</Field>
                {pr.use === 'investment' && <Field label="Extra rent after" hint="Optional">{(id) => <MoneyInput id={id} value={rentUp} onChange={setRentUp} suffix="/ week" />}</Field>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={!spend} onClick={() => {
                  const reno: Renovation = { id: uid(), propertyId: pr.id, year, label: `Renovate ${pr.address}`, items: chosen.map((r) => r.label), cost: spend, uplift: Math.round(uplift), rentPerWeek: rentUp ?? 0 };
                  update((d) => { (d.renovations ??= []).push(reno); });
                  setPicked({}); setRentUp(null);
                  setDone(`Added to your plan: ${money(spend, { compact: true })} spent in ${year}, and the property is worth about ${money(uplift, { compact: true })} more from then on.`);
                }}>Add to my plan</button>
              </div>
              <p className="mt-2 text-[11px] text-muted">Your plan pays for it from savings in {year} and lifts the property’s value{pr.use === 'investment' ? ' and rent' : ''} from that year. Today’s value doesn’t change until you mark it done.</p>
              {done && <p role="status" className="mt-3 flex items-center gap-1.5 text-sm text-gum"><Icon name="check" className="h-4 w-4" />{done}</p>}
            </div>
          </section>
          <PlannedRenovations />
          <BeforeAfter />
        </aside>
      </div>
    </div>
  );
}

/** Renovations saved to the plan, with mark-as-done (updates today's value) and undo. */
function PlannedRenovations() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const list = p.renovations ?? [];
  if (list.length === 0) return null;
  const markDone = (r: Renovation) => update((d) => {
    const x = d.renovations!.find((y) => y.id === r.id)!;
    const prop = d.properties.find((y) => y.id === r.propertyId);
    if (!prop) return;
    (prop.renoAdds ??= []).push({ id: r.id, amount: r.uplift, date: new Date().toISOString().slice(0, 10) });
    if (prop.use === 'investment' && r.rentPerWeek) prop.weeklyRent = (prop.weeklyRent ?? 0) + r.rentPerWeek;
    x.done = true;
  });
  const undo = (r: Renovation) => update((d) => {
    const x = d.renovations!.find((y) => y.id === r.id)!;
    const prop = d.properties.find((y) => y.id === r.propertyId);
    if (prop) { prop.renoAdds = (prop.renoAdds ?? []).filter((v) => v.id !== r.id); if (prop.use === 'investment' && r.rentPerWeek) prop.weeklyRent = Math.max(0, (prop.weeklyRent ?? 0) - r.rentPerWeek); }
    x.done = false;
  });
  const remove = (r: Renovation) => { if (r.done) undo(r); update((d) => { d.renovations = d.renovations!.filter((y) => y.id !== r.id); }); };
  return (
    <section className="panel p-5 sm:p-6">
      <h3 className="font-display text-lg font-semibold">Renovations in your plan</h3>
      <ul className="mt-3 divide-y divide-line">
        {list.map((r) => {
          const prop = p.properties.find((x) => x.id === r.propertyId);
          return (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{prop?.address ?? 'A property'} · {r.year}</p>
                  <p className="text-sm text-muted">{r.items.join(', ')} · {money(r.cost, { compact: true })} for {money(r.uplift, { compact: true, sign: true })}{r.rentPerWeek ? ` and ${money(r.rentPerWeek)} a week more rent` : ''}</p>
                  {r.done && <p className="mt-1 text-xs text-gum">Done: today’s value includes it.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.done
                    ? <button className="btn-quiet text-sm" onClick={() => undo(r)}>Undo done</button>
                    : <button className="btn-quiet text-sm" onClick={() => markDone(r)} title="Adds the after-renovation value to the property now">Mark as done</button>}
                  <button className="btn-ghost text-sm text-clay" onClick={() => remove(r)}>Remove</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-muted">“Mark as done” adds the value it creates to the property today, on top of any estimate made before the work, so it counts in your equity and borrowing now (and in rent, for an investment). Valuations you add later already include it. “Undo done” takes it off again.</p>
    </section>
  );
}

/** Before and after: the user's photo, renovated by AI in the chosen style. */
const ROOMS = [{ value: 'kitchen', label: 'Kitchen' }, { value: 'bathroom', label: 'Bathroom' }, { value: 'living room', label: 'Living room' }, { value: 'bedroom', label: 'Bedroom' }, { value: 'house front and yard', label: 'Outside' }];
const STYLES = [{ value: 'modern', label: 'Modern' }, { value: 'coastal', label: 'Coastal' }, { value: 'scandi', label: 'Scandi' }, { value: 'industrial', label: 'Industrial' }, { value: 'classic', label: 'Classic Queenslander' }];

async function shrink(file: File): Promise<{ blob: Blob; url: string; w: number; h: number }> {
  const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 512 / Math.max(img.width, img.height));
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.9));
  return { blob, url: img.src, w: img.width, h: img.height };
}

function BeforeAfter() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [before, setBefore] = useState<{ blob: Blob; url: string; w: number; h: number } | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [room, setRoom] = useState('kitchen');
  const [style, setStyle] = useState('modern');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const live = priceMode === 'live';
  const run = async () => {
    if (!before) return;
    setBusy(true); setErr(''); setAfter(null);
    const ratio = before.h / before.w;
    const width = 1024, height = Math.max(256, Math.min(1920, Math.round((1024 * ratio) / 16) * 16));
    const form = new FormData();
    form.append('photo', before.blob, 'room.jpg'); form.append('room', room); form.append('style', style);
    form.append('width', String(width)); form.append('height', String(height));
    try {
      const r = await fetch('/api/renovate-image', { method: 'POST', body: form, credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'The AI preview didn’t work this time.');
      setAfter(j.image);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brass text-ground"><Icon name="spark" className="h-4 w-4" /></span><div><p className="font-display text-lg font-semibold">See it before you build it</p><p className="text-sm text-muted">Upload a photo of the room. AI shows it renovated in your style.</p></div></div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setAfter(null); setErr(''); setBefore(await shrink(f)); } e.target.value = ''; }} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Room">{(id) => <Select id={id} value={room} onChange={setRoom} options={ROOMS} />}</Field>
        <Field label="Style">{(id) => <Select id={id} value={style} onChange={setStyle} options={STYLES} />}</Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={() => fileRef.current?.click()} className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-raised text-sm text-muted hover:border-brass">
          {before ? <img src={before.url} alt="Your room before" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1"><Icon name="upload" className="h-5 w-5" />Add a photo</span>}
          {before && <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">Before</span>}
        </button>
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-raised text-sm text-muted">
          {after ? <img src={after} alt="AI preview of the room renovated" className="h-full w-full object-cover" /> : busy ? <span className="animate-pulse">Renovating…</span> : <span>After</span>}
          {after && <span className="absolute left-2 top-2 rounded bg-brass px-2 py-0.5 text-[11px] text-ground">After · AI preview</span>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={!before || busy || !live} onClick={run}>{busy ? 'Working… about 10 seconds' : after ? 'Try again' : 'Renovate this photo'}</button>
        {after && <a className="btn-quiet" href={after} download="renovation-preview.jpg">Download</a>}
      </div>
      {!live && <p className="mt-2 text-xs text-muted">AI previews run on the live site. This preview build has no server.</p>}
      {err && <p role="alert" className="mt-2 text-sm text-clay">{err}</p>}
      <p className="mt-3 text-[11px] text-muted">An AI impression of the style, not a design or a quote. Up to 12 previews a day.</p>
    </section>
  );
}
