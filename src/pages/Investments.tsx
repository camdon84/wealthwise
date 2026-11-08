import { useState } from 'react';
import { useApp } from '../lib/store';
import { holdingsStats, type Quotes } from '../lib/calc';
import { defaultCurrency, money, num, pct, price as fmtPrice } from '../lib/format';
import { priceMode } from '../lib/prices';
import { uid } from '../lib/defaults';
import type { Holding } from '../lib/types';
import { CsvImport } from '../components/CsvImport';
import { Field, Icon, MoneyInput, NumInput, PriceInput, Segmented, Select, TextInput } from '../components/ui';
import { Sheet } from './Properties';
import { HoldingChart, SharesCarousel } from '../components/PriceCharts';

const KIND_COLOR: Record<Holding['kind'], string> = { etf: 'rgb(var(--sky))', share: 'rgb(var(--gum))', crypto: 'rgb(var(--brass))', fund: 'rgb(var(--sage))' };
const KIND_LABEL: Record<Holding['kind'], string> = { etf: 'ETFs', share: 'Shares', crypto: 'Crypto', fund: 'Funds' };

export const isCrypto = (h: Holding) => h.kind === 'crypto' || h.exchange === 'CRYPTO';

export function Investments({ quotes, asOf, mode = 'shares' }: { quotes: Quotes; asOf: Date | null; mode?: 'shares' | 'crypto' }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const [sheet, setSheet] = useState<'import' | 'trade' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const crypto = mode === 'crypto';
  const mine = p.holdings.filter((h) => isCrypto(h) === crypto);
  const st = holdingsStats(mine, quotes);
  const byKind = Object.entries(st.rows.reduce<Record<string, number>>((a, r) => { a[r.h.kind] = (a[r.h.kind] ?? 0) + r.value; return a; }, {})).sort((a, b) => b[1] - a[1]);

  const merge = (list: Holding[]) => update((d) => {
    for (const h of list) {
      const cur = d.holdings.find((x) => x.code === h.code && x.exchange === h.exchange);
      if (cur) { const cost = cur.units * cur.avgCost + h.units * h.avgCost; cur.units += h.units; cur.avgCost = cost / cur.units; }
      else d.holdings.push({ ...h, id: uid() });
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{crypto ? 'Crypto' : 'Shares'}</h1>
          <p className="text-muted">{priceMode === 'demo' ? 'Demo prices' : 'Prices delayed 15–20 minutes'} · select a holding to see its chart{asOf ? ` · updated ${asOf.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-quiet" onClick={() => setSheet('import')}><Icon name="upload" className="h-4 w-4" />Import a file</button>
          <button className="btn-primary" onClick={() => setSheet('trade')}><Icon name="plus" className="h-4 w-4" />Log a trade</button>
        </div>
      </div>

      {crypto ? (
        <div className="flex gap-3 rounded-xl border border-brass/40 bg-brass/10 p-4 text-sm">
          <Icon name="coin" className="mt-0.5 h-5 w-5 shrink-0 text-brass" />
          <p>{p.cryptoInPlan && p.cryptoGrowth != null
            ? `Your crypto is included in your plan as a simple figure: today’s value growing at your own estimate of ${p.cryptoGrowth}% a year. Cryptocurrency is volatile, so treat that part of the plan as a rough guide.`
            : 'As cryptocurrency is a volatile asset, we cannot measure its future performance. Your crypto counts towards your net worth today, but it’s left out of your plan, projections and Your Wise Future unless you choose to include it below.'}</p>
        </div>
      ) : <SharesCarousel holdings={mine} quotes={quotes} />}

      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div><p className="text-sm text-muted">Portfolio value</p><p className="font-display text-4xl font-semibold">{money(st.value)}</p></div>
          <div><p className="text-xs text-muted">Total gain</p><p className={`font-display text-xl font-semibold ${st.gain >= 0 ? 'text-gum' : 'text-clay'}`}>{money(st.gain, { sign: true })} <span className="text-sm font-normal">{pct(st.gainPct, 1, true)}</span></p></div>
          <div><p className="text-xs text-muted">Today</p><p className={`font-display text-xl font-semibold ${st.dayMove >= 0 ? 'text-gum' : 'text-clay'}`}>{money(st.dayMove, { sign: true })}</p></div>
          <div><p className="text-xs text-muted">Cost base</p><p className="font-display text-xl font-semibold">{money(st.cost)}</p></div>
        </div>
        {crypto && st.value > 0 && <CryptoGuess value={st.value} />}
        {st.value > 0 && (
          <div className="mt-6">
            <div className="flex h-2.5 overflow-hidden rounded-full">{byKind.map(([k, v]) => <div key={k} style={{ width: `${(v / st.value) * 100}%`, background: KIND_COLOR[k as Holding['kind']] }} />)}</div>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">{byKind.map(([k, v]) => <li key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k as Holding['kind']] }} />{KIND_LABEL[k as Holding['kind']]} {pct((v / st.value) * 100, 0)}</li>)}</ul>
          </div>
        )}
      </section>

      {mine.length === 0 ? (
        <div className="panel p-10 text-center"><p className="font-medium">{crypto ? 'No crypto yet' : 'No shares yet'}</p><p className="mt-1 text-sm text-muted">{crypto ? 'Import your exchange’s trade history or log a trade to track a coin at live prices.' : 'Import your broker’s trade history or log a trade to start tracking.'}</p></div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr className="border-b border-line">{['Holding', 'Units', 'Avg cost', 'Price', 'Today', 'Value', 'Gain', ''].map((h, i) => <th key={i} className={`px-4 py-3 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {[...st.rows].sort((a, b) => b.value - a.value).map((r) => (
                <tr key={r.h.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-raised" onClick={() => setOpen(r.h.id)} title={`See ${r.h.code}'s price history`}>
                  <td className="px-4 py-3"><p className="font-semibold">{r.h.code} <span className="text-xs font-normal text-muted">{r.h.exchange}</span></p><p className="text-xs text-muted">{r.h.name !== r.h.code ? r.h.name : KIND_LABEL[r.h.kind].replace(/s$/, '')}</p></td>
                  <td className="px-4 py-3 text-right">{num(r.h.units, 4)}</td>
                  <td className="px-4 py-3 text-right">{fmtPrice(r.h.avgCost, r.h.currency)}</td>
                  <td className="px-4 py-3 text-right">{money(r.price, { cents: true })}</td>
                  <td className={`px-4 py-3 text-right ${r.dayChange >= 0 ? 'text-gum' : 'text-clay'}`}>{pct(r.dayChange, 2, true)}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(r.value)}</td>
                  <td className={`px-4 py-3 text-right ${r.gain >= 0 ? 'text-gum' : 'text-clay'}`}>{money(r.gain, { sign: true })}<br /><span className="text-xs">{pct(r.gainPct, 1, true)}</span></td>
                  <td className="px-2 py-3 text-right"><button className="btn-ghost p-2" aria-label={`Remove ${r.h.code}`} onClick={(e) => { e.stopPropagation(); update((d) => { d.holdings = d.holdings.filter((x) => x.id !== r.h.id); }); }}><Icon name="trash" className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (() => { const r = st.rows.find((x) => x.h.id === open); return r ? (
        <Sheet title={`${r.h.code}${r.h.name !== r.h.code ? `: ${r.h.name}` : ''}`} onClose={() => setOpen(null)}>
          <p className="mb-4 text-sm text-muted">{num(r.h.units, 4)} units · average buy {fmtPrice(r.h.avgCost, r.h.currency)}{r.h.firstBought ? ` · first bought ${new Date(r.h.firstBought).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''} · worth {money(r.value)} ({money(r.gain, { sign: true })})</p>
          <div className="panel p-5"><HoldingChart h={r.h} currentPrice={r.price} /></div>
        </Sheet>) : null; })()}
      {sheet === 'import' && <Sheet title="Import trades" onClose={() => setSheet(null)}><CsvImport crypto={crypto} onImport={(h) => { merge(h); setSheet(null); }} /></Sheet>}
      {sheet === 'trade' && <Sheet title="Log a trade" onClose={() => setSheet(null)}><TradeForm onDone={() => setSheet(null)} crypto={crypto} /></Sheet>}
    </div>
  );
}

function TradeForm({ onDone, crypto }: { onDone: () => void; crypto?: boolean }) {
  const update = useApp((s) => s.update);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [code, setCode] = useState('');
  const [exchange, setExchange] = useState<Holding['exchange']>(crypto ? 'CRYPTO' : 'ASX');
  const [units, setUnits] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [fees, setFees] = useState<number | null>(9.5);
  const [currency, setCurrency] = useState(crypto ? defaultCurrency('CRYPTO') : 'AUD');
  const [error, setError] = useState('');
  const save = () => {
    if (!code || !units || !price) return setError('Enter a code, units and price.');
    let failed = '';
    update((d) => {
      const cur = d.holdings.find((h) => h.code === code && h.exchange === exchange);
      if (side === 'buy') {
        if (cur) { const cost = cur.units * cur.avgCost + units * price + (fees ?? 0); cur.units += units; cur.avgCost = cost / cur.units; }
        else d.holdings.push({ id: uid(), code, exchange, name: code, units, avgCost: (units * price + (fees ?? 0)) / units, currency, firstBought: new Date().toISOString().slice(0, 10), kind: exchange === 'CRYPTO' ? 'crypto' : 'share' });
      } else {
        if (!cur || cur.units < units) { failed = `You hold ${cur ? cur.units : 0} ${code}. You can’t sell more than that.`; return; }
        cur.units -= units;
        if (cur.units <= 0) d.holdings = d.holdings.filter((h) => h !== cur);
      }
    });
    if (failed) setError(failed); else onDone();
  };
  return (
    <div className="space-y-5">
      <Segmented value={side} onChange={setSide} options={[{ value: 'buy', label: 'Bought' }, { value: 'sell', label: 'Sold' }]} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code">{(id) => <TextInput id={id} value={code} onChange={(v) => setCode(v.toUpperCase().trim())} placeholder={crypto ? 'BTC' : 'VAS'} />}</Field>
        <Field label="Market">{(id) => <Select id={id} value={exchange} onChange={(v) => { setExchange(v); setCurrency(defaultCurrency(v)); }} options={crypto ? [{ value: 'CRYPTO', label: 'Crypto' }] : [{ value: 'ASX', label: 'ASX' }, { value: 'NASDAQ', label: 'NASDAQ' }, { value: 'NYSE', label: 'NYSE' }]} />}</Field>
        <Field label="Units">{(id) => <NumInput id={id} value={units} onChange={setUnits} step={0.0001} />}</Field>
        <Field label="Price per unit" className="sm:col-span-2">{(id) => <PriceInput id={id} value={price} onChange={setPrice} currency={currency} onCurrency={setCurrency} />}</Field>
        <Field label="Brokerage">{(id) => <MoneyInput id={id} value={fees} onChange={setFees} />}</Field>
      </div>
      {error && <p role="alert" className="text-sm text-clay">{error}</p>}
      <button className="btn-primary" onClick={save}>{side === 'buy' ? 'Save purchase' : 'Save sale'}</button>
    </div>
  );
}

/** The user's own growth guess for crypto. Shown here only: never fed into the plan or projections. */
function CryptoGuess({ value }: { value: number }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const [asking, setAsking] = useState(false);
  const g = p.cryptoGrowth ?? null;
  const inPlan = !!p.cryptoInPlan;
  const age = p.household.you.age ?? 35;
  const years = Math.max(0, p.goals.retirementAge - age);
  const future = g != null ? value * Math.pow(1 + g / 100, years) : null;
  const real = future != null ? future / Math.pow(1 + p.assumptions.inflation / 100, years) : null;
  const missing = inPlan && g == null;
  return (
    <div className="mt-6 space-y-4 rounded-xl bg-raised p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="w-44"><Field label="My expected growth">{(id) => <NumInput id={id} value={g} onChange={(v) => update((d) => { d.cryptoGrowth = v; })} step={1} suffix="% / yr" placeholder="e.g. 15" />}</Field></div>
        {future != null ? (
          <div><p className="text-xs text-muted">Expected value at {p.goals.retirementAge}</p><p className="font-display text-2xl font-semibold">{money(future, { compact: true })}</p><p className="text-xs text-muted">about {money(real!, { compact: true })} in today’s money</p></div>
        ) : <p className="pb-2 text-sm text-muted">Enter a growth rate to see what your crypto could be worth at {p.goals.retirementAge}.</p>}
      </div>
      <label className="flex cursor-pointer items-start gap-3 border-t border-line pt-4">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brass))]" checked={inPlan} onChange={(e) => { if (e.target.checked) setAsking(true); else update((d) => { d.cryptoInPlan = false; }); }} />
        <span className="text-sm font-medium">I want to include my crypto in my full financial plan
          <span className="block text-xs font-normal text-muted">{inPlan ? 'Included: it grows at your expected rate in your projections and Your Wise Future, and can be sold in retirement after your shares.' : 'Off: your crypto only counts in today’s net worth.'}</span>
        </span>
      </label>
      {missing && <p role="alert" className="rounded-lg bg-clay/10 px-3 py-2 text-sm text-clay">Enter your expected growth above to include crypto in your plan, or untick the box. Until then it’s left out.</p>}
      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="crypto-warn" onClick={() => setAsking(false)}>
          <div className="paper w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-clay/15 text-clay"><Icon name="coin" className="h-5 w-5" /></span><h2 id="crypto-warn" className="font-display text-xl font-semibold">Cryptocurrency</h2></div>
            <p className="mt-4 leading-relaxed">Cryptocurrency is a volatile asset. We can include it in your plan, but it will only be a simple metric of your current portfolio value in today’s money and the expected growth that is set by you.</p>
            {g == null && <p className="mt-3 text-sm text-clay">You’ll need to enter your expected growth for it to be included.</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-quiet" onClick={() => setAsking(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => { update((d) => { d.cryptoInPlan = true; }); setAsking(false); }}>Include my crypto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
