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

const KIND_COLOR: Record<Holding['kind'], string> = { etf: 'rgb(var(--sky))', share: 'rgb(var(--gum))', crypto: 'rgb(var(--brass))', fund: 'rgb(var(--sage))' };
const KIND_LABEL: Record<Holding['kind'], string> = { etf: 'ETFs', share: 'Shares', crypto: 'Crypto', fund: 'Funds' };

export function Investments({ quotes, asOf }: { quotes: Quotes; asOf: Date | null }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const [sheet, setSheet] = useState<'import' | 'trade' | null>(null);
  const st = holdingsStats(p.holdings, quotes);
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
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Shares and crypto</h1>
          <p className="text-muted">{priceMode === 'demo' ? 'Demo prices' : 'Prices delayed 15–20 minutes'}{asOf ? ` · updated ${asOf.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-quiet" onClick={() => setSheet('import')}><Icon name="upload" className="h-4 w-4" />Import a file</button>
          <button className="btn-primary" onClick={() => setSheet('trade')}><Icon name="plus" className="h-4 w-4" />Log a trade</button>
        </div>
      </div>

      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div><p className="text-sm text-muted">Portfolio value</p><p className="font-display text-4xl font-semibold">{money(st.value)}</p></div>
          <div><p className="text-xs text-muted">Total gain</p><p className={`font-display text-xl font-semibold ${st.gain >= 0 ? 'text-gum' : 'text-clay'}`}>{money(st.gain, { sign: true })} <span className="text-sm font-normal">{pct(st.gainPct, 1, true)}</span></p></div>
          <div><p className="text-xs text-muted">Today</p><p className={`font-display text-xl font-semibold ${st.dayMove >= 0 ? 'text-gum' : 'text-clay'}`}>{money(st.dayMove, { sign: true })}</p></div>
          <div><p className="text-xs text-muted">Cost base</p><p className="font-display text-xl font-semibold">{money(st.cost)}</p></div>
        </div>
        {st.value > 0 && (
          <div className="mt-6">
            <div className="flex h-2.5 overflow-hidden rounded-full">{byKind.map(([k, v]) => <div key={k} style={{ width: `${(v / st.value) * 100}%`, background: KIND_COLOR[k as Holding['kind']] }} />)}</div>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">{byKind.map(([k, v]) => <li key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k as Holding['kind']] }} />{KIND_LABEL[k as Holding['kind']]} {pct((v / st.value) * 100, 0)}</li>)}</ul>
          </div>
        )}
      </section>

      {p.holdings.length === 0 ? (
        <div className="panel p-10 text-center"><p className="font-medium">No holdings yet</p><p className="mt-1 text-sm text-muted">Import your broker’s trade history or log a trade to start tracking.</p></div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr className="border-b border-line">{['Holding', 'Units', 'Avg cost', 'Price', 'Today', 'Value', 'Gain', ''].map((h, i) => <th key={i} className={`px-4 py-3 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {[...st.rows].sort((a, b) => b.value - a.value).map((r) => (
                <tr key={r.h.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3"><p className="font-semibold">{r.h.code} <span className="text-xs font-normal text-muted">{r.h.exchange}</span></p><p className="text-xs text-muted">{r.h.name !== r.h.code ? r.h.name : KIND_LABEL[r.h.kind].replace(/s$/, '')}</p></td>
                  <td className="px-4 py-3 text-right">{num(r.h.units, 4)}</td>
                  <td className="px-4 py-3 text-right">{fmtPrice(r.h.avgCost, r.h.currency)}</td>
                  <td className="px-4 py-3 text-right">{money(r.price, { cents: true })}</td>
                  <td className={`px-4 py-3 text-right ${r.dayChange >= 0 ? 'text-gum' : 'text-clay'}`}>{pct(r.dayChange, 2, true)}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(r.value)}</td>
                  <td className={`px-4 py-3 text-right ${r.gain >= 0 ? 'text-gum' : 'text-clay'}`}>{money(r.gain, { sign: true })}<br /><span className="text-xs">{pct(r.gainPct, 1, true)}</span></td>
                  <td className="px-2 py-3 text-right"><button className="btn-ghost p-2" aria-label={`Remove ${r.h.code}`} onClick={() => update((d) => { d.holdings = d.holdings.filter((x) => x.id !== r.h.id); })}><Icon name="trash" className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sheet === 'import' && <Sheet title="Import trades" onClose={() => setSheet(null)}><CsvImport onImport={(h) => { merge(h); setSheet(null); }} /></Sheet>}
      {sheet === 'trade' && <Sheet title="Log a trade" onClose={() => setSheet(null)}><TradeForm onDone={() => setSheet(null)} /></Sheet>}
    </div>
  );
}

function TradeForm({ onDone }: { onDone: () => void }) {
  const update = useApp((s) => s.update);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [code, setCode] = useState('');
  const [exchange, setExchange] = useState<Holding['exchange']>('ASX');
  const [units, setUnits] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [fees, setFees] = useState<number | null>(9.5);
  const [currency, setCurrency] = useState('AUD');
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
        <Field label="Code">{(id) => <TextInput id={id} value={code} onChange={(v) => setCode(v.toUpperCase().trim())} placeholder="VAS" />}</Field>
        <Field label="Market">{(id) => <Select id={id} value={exchange} onChange={(v) => { setExchange(v); setCurrency(defaultCurrency(v)); }} options={[{ value: 'ASX', label: 'ASX' }, { value: 'NASDAQ', label: 'NASDAQ' }, { value: 'NYSE', label: 'NYSE' }, { value: 'CRYPTO', label: 'Crypto' }]} />}</Field>
        <Field label="Units">{(id) => <NumInput id={id} value={units} onChange={setUnits} step={0.0001} />}</Field>
        <Field label="Price per unit" className="sm:col-span-2">{(id) => <PriceInput id={id} value={price} onChange={setPrice} currency={currency} onCurrency={setCurrency} />}</Field>
        <Field label="Brokerage">{(id) => <MoneyInput id={id} value={fees} onChange={setFees} />}</Field>
      </div>
      {error && <p role="alert" className="text-sm text-clay">{error}</p>}
      <button className="btn-primary" onClick={save}>{side === 'buy' ? 'Save purchase' : 'Save sale'}</button>
    </div>
  );
}
