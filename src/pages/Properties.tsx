import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp, useNavIntent } from '../lib/store';
import { propertyStats } from '../lib/calc';
import { money, monthYear, pct } from '../lib/format';
import { emptyProperty, uid } from '../lib/defaults';
import type { Property, ValuationEntry } from '../lib/types';
import { PhotoControls, PropertyPhoto } from '../components/Aerial';
import { PropertyEditor } from '../components/PropertyEditor';
import { Icon, MoneyInput, Select, Segmented } from '../components/ui';

const n = (v: number | null | undefined) => v ?? 0;

const reaUrl = (p: Property) =>
  `https://www.realestate.com.au/property/${[p.address, p.suburb, p.state, p.postcode].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

export function Properties() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [editing, setEditing] = useState<Property | null>(() => {
    const id = useNavIntent.getState().editProperty; if (!id) return null;
    useNavIntent.getState().set({ editProperty: null });
    const found = useApp.getState().profile?.properties.find((x) => x.id === id);
    return found ? structuredClone(found) : null;
  });
  const lvr = p.assumptions.lvr;
  const sel = p.properties.find((x) => x.id === selected);

  const totals = p.properties.reduce((a, pr) => { const s = propertyStats(pr, lvr); return { v: a.v + s.val.value, d: a.d + s.debt, u: a.u + s.usable, c: a.c + (pr.use === 'investment' ? s.cashflow : 0) }; }, { v: 0, d: 0, u: 0, c: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-3xl font-semibold sm:text-4xl">Your current property portfolio</h1><p className="text-muted">{p.properties.length} properties · {money(totals.v, { compact: true })} value · {money(totals.v - totals.d, { compact: true })} equity</p></div>
        <div className="flex gap-2">
          <Segmented size="sm" label="Layout" value={view} onChange={setView} options={[{ value: 'cards', label: 'Cards' }, { value: 'list', label: 'List' }]} />
          <button className="btn-primary" onClick={() => setEditing(emptyProperty())}><Icon name="plus" className="h-4 w-4" />Add property</button>
        </div>
      </div>

      <div className="paper grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {[['Portfolio value', money(totals.v)], ['Owing', money(totals.d)], [`Usable equity (${lvr}% LVR)`, money(totals.u)], ['Investment cash flow', `${money(totals.c, { sign: true })} / yr`]].map(([l, v]) => (
          <div key={l} className="bg-surface p-4"><p className="text-xs text-muted">{l}</p><p className="font-display text-xl font-semibold">{v}</p></div>
        ))}
      </div>

      {p.properties.length === 0 && (
        <div className="panel p-10 text-center"><p className="font-medium">No properties yet</p><p className="text-sm text-muted mt-1">Add your home or an investment to see its value, equity and cash flow.</p></div>
      )}

      {view === 'cards' ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-5">
          {p.properties.map((pr) => {
            const s = propertyStats(pr, lvr);
            return (
              <button key={pr.id} onClick={() => setSelected(pr.id)} onMouseEnter={() => setFocus(pr.id)} onFocus={() => setFocus(pr.id)} className={`panel block w-full overflow-hidden text-left transition-colors hover:border-brass/60 ${(focus ?? p.properties[0]?.id) === pr.id ? 'ring-2 ring-brass/50' : ''}`}>
                <PropertyPhoto property={pr} className="h-36 w-full" />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold">{pr.address}</p><p className="text-sm text-muted">{pr.suburb} {pr.state} {pr.postcode}</p></div>
                    <span className={`chip ${pr.use === 'home' ? 'bg-sky/15 text-sky' : 'bg-gum/15 text-gum'}`}>{pr.use === 'home' ? 'Home' : 'Investment'}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-y-3 text-sm">
                    <div><p className="text-xs text-muted">Value</p><p className="font-display text-lg font-semibold">{money(s.val.value)}</p>{s.growthSincePurchase != null && <p className="text-xs text-gum">{pct(s.growthSincePurchase, 0, true)} since purchase</p>}</div>
                    <div><p className="text-xs text-muted">{pr.use === 'investment' ? 'Cash flow' : 'Yearly cost'}</p><p className={`font-display text-lg font-semibold ${s.cashflow >= 0 ? 'text-gum' : 'text-clay'}`}>{money(s.cashflow, { sign: true })}</p><p className="text-xs text-muted">a year after repayments</p></div>
                    <div><p className="text-xs text-muted">Equity</p><p>{money(s.equity)}</p></div>
                    <div><p className="text-xs text-muted">Usable equity</p><p>{money(s.usable)}</p></div>
                    {pr.use === 'investment' && <div><p className="text-xs text-muted">Gross yield</p><p>{pct(s.grossYield)}</p></div>}
                    <div><p className="text-xs text-muted">LVR</p><p>{pct(s.lvrNow, 0)}</p></div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {p.properties.length > 0 && (
          <div className="lg:sticky lg:top-6">
            <ValueHistory property={p.properties.find((x) => x.id === focus) ?? p.properties[0]} onPick={setFocus} />
          </div>
        )}
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr className="border-b border-line">{['Property', 'Value', 'Owing', 'Equity', 'Usable', 'Yield', 'Cash flow / yr'].map((h, i) => <th key={h} className={`px-4 py-3 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {p.properties.map((pr) => { const s = propertyStats(pr, lvr); return (
                <tr key={pr.id} className="border-b border-line last:border-0 hover:bg-raised cursor-pointer" onClick={() => setSelected(pr.id)}>
                  <td className="px-4 py-3"><p className="font-medium">{pr.address}</p><p className="text-xs text-muted">{pr.suburb} {pr.state}</p></td>
                  <td className="px-4 py-3 text-right">{money(s.val.value)}</td><td className="px-4 py-3 text-right">{money(s.debt)}</td><td className="px-4 py-3 text-right">{money(s.equity)}</td>
                  <td className="px-4 py-3 text-right">{money(s.usable)}</td><td className="px-4 py-3 text-right">{pr.use === 'investment' ? pct(s.grossYield) : '—'}</td>
                  <td className={`px-4 py-3 text-right ${s.cashflow >= 0 ? 'text-gum' : 'text-clay'}`}>{money(s.cashflow, { sign: true })}</td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      )}

      {sel && <PropertyDetail property={sel} onClose={() => setSelected(null)} onEdit={() => { setEditing(structuredClone(sel)); setSelected(null); }} />}
      {editing && (
        <Sheet title={p.properties.some((x) => x.id === editing.id) ? `Edit ${editing.address}` : 'Add a property you own'} onClose={() => setEditing(null)}>
          {!p.properties.some((x) => x.id === editing.id) && (
            <p className="-mt-4 mb-6 text-sm text-muted">To add a future property, go to <button className="font-medium text-brass hover:underline" onClick={() => { useNavIntent.getState().set({ planTab: 'timeline' }); setEditing(null); location.hash = 'plan'; }}>your plan</button>.</p>
          )}
          <PropertyEditor value={editing} onChange={setEditing} thorough />
          <div className="mt-6 flex justify-between">
            {p.properties.some((x) => x.id === editing.id) ? <button className="btn-ghost text-clay" onClick={() => { update((d) => { d.properties = d.properties.filter((x) => x.id !== editing.id); }); setEditing(null); }}>Remove property</button> : <span />}
            <button className="btn-primary" disabled={!editing.address} onClick={() => { update((d) => { const i = d.properties.findIndex((x) => x.id === editing.id); const prev = i >= 0 ? d.properties[i] : null; const next = { ...editing }; if (prev && (prev.address !== next.address || prev.suburb !== next.suburb || prev.postcode !== next.postcode)) delete next.geo; if (i >= 0) d.properties[i] = next; else d.properties.push(next); }); setEditing(null); }}>Save property</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="rise h-full w-full max-w-2xl overflow-y-auto bg-ground p-6 shadow-2xl sm:border-l sm:border-line" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between gap-4"><h2 className="font-display text-2xl font-semibold">{title}</h2><div className="flex shrink-0 items-center gap-2">{actions}<button className="btn-ghost p-2" aria-label="Close" onClick={onClose}><Icon name="x" /></button></div></div>
        {children}
      </div>
    </div>
  );
}

function PropertyDetail({ property: pr, onClose, onEdit }: { property: Property; onClose: () => void; onEdit: () => void }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const s = propertyStats(pr, p.assumptions.lvr);
  const [src, setSrc] = useState<ValuationEntry['source']>('realestate.com.au');
  const [val, setVal] = useState<number | null>(null);
  const addVal = () => { if (!val) return; update((d) => { d.properties.find((x) => x.id === pr.id)!.valuations.push({ id: uid(), source: src, value: val, date: new Date().toISOString().slice(0, 10) }); }); setVal(null); };
  const latest = [...new Map([...pr.valuations].sort((a, b) => a.date.localeCompare(b.date)).map((v) => [v.source, v])).values()];
  const rows: [string, number][] = pr.use === 'investment'
    ? [['Rent after vacancy', s.rentGross], ['Management', -s.mgmt], ['Rates, insurance, upkeep', -(pr.annualCosts ?? 0)], ['Loan repayments', -s.repayments]]
    : [['Loan repayments', -s.repayments], ['Rates, insurance, upkeep', -(pr.annualCosts ?? 0)]];

  return (
    <Sheet title={pr.address} onClose={onClose} actions={<button className="btn-primary" onClick={onEdit}><Icon name="details" className="h-4 w-4" />Edit property details</button>}>
      <PropertyPhoto property={pr} className="h-52 w-full rounded-xl border border-line" />
      <PhotoControls property={pr} />
      <p className="mt-3 text-sm text-muted">{pr.suburb} {pr.state} {pr.postcode} · {pr.kind}{pr.bedrooms ? `, ${pr.bedrooms} bed` : ''}{pr.yearBuilt ? ` · built ${pr.yearBuilt}` : ''} · bought {monthYear(pr.purchaseDate)} for {money(pr.purchasePrice)}</p>

      <section className="mt-6 panel p-5">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-sm text-muted">Estimated value</p><p className="font-display text-4xl font-semibold">{money(s.val.value)}</p>
            <p className="text-sm text-muted">{s.val.basis === 'sources' ? `Average of ${s.val.sources} source${s.val.sources > 1 ? 's' : ''} · range ${money(s.val.low, { compact: true })} to ${money(s.val.high, { compact: true })}` : 'Purchase price grown at your growth assumption. Add an estimate below.'}</p></div>
          <div className="flex shrink-0 flex-col gap-2">
            <a className="btn-quiet" href={reaUrl(pr)} target="_blank" rel="noreferrer">Open on realestate.com.au</a>
            <button className="btn-quiet" onClick={() => { useNavIntent.getState().set({ planTab: 'timeline', focusProperty: pr.id }); onClose(); location.hash = 'plan'; }}><Icon name="plan" className="h-4 w-4" />Plan for this property</button>
          </div>
        </div>
        <ul className="mt-5 space-y-2">
          {latest.map((v) => {
            const w = s.val.high > s.val.low ? ((v.value - s.val.low) / (s.val.high - s.val.low)) * 100 : 50;
            return (
              <li key={v.id} className="grid grid-cols-[140px_1fr_100px] items-center gap-3 text-sm">
                <span className="text-muted">{v.source}</span>
                <span className="relative h-1.5 rounded-full bg-line"><span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brass" style={{ left: `${w}%` }} /></span>
                <span className="text-right">{money(v.value, { compact: true })}</span>
              </li>
            );
          })}
          <li className="grid grid-cols-[140px_1fr_100px] items-center gap-3 text-sm opacity-60"><span className="text-muted">Microburbs</span><span className="text-xs text-muted">Automatic monthly valuation, connecting soon</span><span /></li>
        </ul>
        <div className="mt-5 grid gap-2 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto]">
          <Select value={src} onChange={setSrc} options={(['realestate.com.au', 'Domain', 'RP Data', 'Bank valuation', 'My estimate'] as const).map((x) => ({ value: x, label: x }))} />
          <MoneyInput value={val} onChange={setVal} placeholder="Estimate" />
          <button className="btn-primary" onClick={addVal} disabled={!val}>Add estimate</button>
        </div>
      </section>

      <section className="paper mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {[['Equity', money(s.equity)], [`Usable equity at ${p.assumptions.lvr}%`, money(s.usable)], ['Owing', money(s.debt)], ['LVR', pct(s.lvrNow, 0)]].map(([l, v]) => (
          <div key={l} className="bg-surface p-4"><p className="text-xs text-muted">{l}</p><p className="font-display text-xl font-semibold">{v}</p></div>
        ))}
      </section>

      <section className="mt-6 panel p-5">
        <p className="font-medium">Cash flow per year</p>
        <dl className="mt-3 space-y-2 text-sm">
          {rows.map(([l, v]) => <div key={l} className="flex justify-between"><dt className="text-muted">{l}</dt><dd>{money(v, { sign: true })}</dd></div>)}
          <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Before tax</dt><dd className={s.cashflow >= 0 ? 'text-gum' : 'text-clay'}>{money(s.cashflow, { sign: true })}</dd></div>
        </dl>
      </section>

      <section className="mt-6 panel p-5">
        <p className="font-medium">Loans</p>
        <ul className="mt-3 divide-y divide-line text-sm">
          {pr.loans.map((l) => <li key={l.id} className="flex justify-between py-2"><span>{l.lender || 'Loan'} · {l.type === 'io' ? 'interest only' : 'P&I'} · {l.rate?.toFixed(2)}%</span><span>{money(l.balance)}</span></li>)}
        </ul>
      </section>
    </Sheet>
  );
}

/** Purchase to today to ten years out, for one property. */
function ValueHistory({ property: pr, onPick }: { property: Property; onPick: (id: string) => void }) {
  const p = useApp((s) => s.profile)!;
  const now = propertyStats(pr, p.assumptions.lvr).val.value;
  const y0 = new Date().getFullYear();
  const [by, bm] = (pr.purchaseDate || `${y0}-01`).split('-').map(Number);
  const bought = n(pr.purchasePrice);
  const held = Math.max(0, y0 + (new Date().getMonth()) / 12 - (by + ((bm || 1) - 1) / 12));
  // Growth: this property's own average since purchase if held 3+ years, otherwise its growth setting
  const own = bought > 0 && held >= 3 ? Math.pow(now / bought, 1 / held) - 1 : null;
  const g = own != null ? own : pr.growthRate / 100;
  const data: { year: number; past?: number; future?: number }[] = [];
  if (bought > 0 && by < y0) for (let y = by; y < y0; y++) data.push({ year: y, past: bought * Math.pow(now / bought, (y - by) / Math.max(0.5, held)) });
  data.push({ year: y0, past: now, future: now });
  for (let k = 1; k <= 10; k++) data.push({ year: y0 + k, future: now * Math.pow(1 + g, k) });
  const end = data[data.length - 1].future!;
  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-xl font-semibold">{pr.address}</h2><p className="text-sm text-muted">{pr.suburb} {pr.state} · value since you bought it, and the next 10 years</p></div>
        {p.properties.length > 1 && (
          <div className="flex flex-wrap gap-1.5">{p.properties.map((x) => (
            <button key={x.id} onClick={() => onPick(x.id)} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${x.id === pr.id ? 'bg-brass text-ground ring-brass' : 'ring-line text-muted hover:text-ink'}`}>{x.address}</button>
          ))}</div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div><p className="text-xs text-muted">Bought {bought > 0 ? `${by}` : ''}</p><p className="font-display text-xl font-semibold">{bought > 0 ? money(bought, { compact: true }) : '—'}</p></div>
        <div><p className="text-xs text-muted">Today</p><p className="font-display text-xl font-semibold">{money(now, { compact: true })}</p>{bought > 0 && <p className="text-xs text-gum">{money(now - bought, { compact: true, sign: true })}</p>}</div>
        <div><p className="text-xs text-muted">Forecast {y0 + 10}</p><p className="font-display text-xl font-semibold text-gum">{money(end, { compact: true })}</p><p className="text-xs text-muted">{(g * 100).toFixed(1)}% a year</p></div>
      </div>
      <div className="mt-4 -ml-2">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
            <defs><linearGradient id="vh-past" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(var(--gum))" stopOpacity={0.35} /><stop offset="1" stopColor="rgb(var(--gum))" stopOpacity={0.05} /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="2 4" />
            <XAxis dataKey="year" tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => money(v, { compact: true })} domain={['dataMin', 'dataMax']} />
            <Tooltip formatter={(v: number, k: string) => [money(v, { compact: true }), k === 'past' ? 'Value' : 'Forecast']} labelFormatter={(l) => String(l)} contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--line))', borderRadius: 12, fontSize: 12 }} />
            <Area type="monotone" dataKey="past" stroke="rgb(var(--gum))" strokeWidth={2} fill="url(#vh-past)" isAnimationActive={false} connectNulls />
            <Area type="monotone" dataKey="future" stroke="rgb(var(--brass))" strokeWidth={2} strokeDasharray="5 4" fill="rgb(var(--brass) / 0.06)" isAnimationActive={false} connectNulls />
            {bought > 0 && by < y0 && <ReferenceDot x={by} y={bought} r={5} fill="rgb(var(--surface))" stroke="rgb(var(--gum))" strokeWidth={2} label={{ value: `Bought ${money(bought, { compact: true })}`, position: 'top', fill: 'rgb(var(--muted))', fontSize: 10 }} />}
            <ReferenceDot x={y0} y={now} r={5} fill="rgb(var(--gum))" stroke="rgb(var(--surface))" strokeWidth={2} label={{ value: 'Today', position: 'top', fill: 'rgb(var(--muted))', fontSize: 10 }} />
            <ReferenceLine x={y0} stroke="rgb(var(--muted))" strokeDasharray="3 3" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-muted">{own != null
        ? `Property forecast based on this property’s average growth since you bought it (${(own * 100).toFixed(1)}% a year). Suburb data from the last 10 years will replace this once it’s connected.`
        : `Property forecast based on the growth rate set for this property (${pr.growthRate}% a year). Suburb data from the last 10 years will replace this once it’s connected.`} The line between purchase and today is smoothed. Not a valuation.</p>
    </section>
  );
}
