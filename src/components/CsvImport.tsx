import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import type { Holding } from '../lib/types';
import { SAMPLE_CSV, uid } from '../lib/defaults';
import { money, num } from '../lib/format';
import { Icon } from './ui';

type FieldKey = 'code' | 'units' | 'price' | 'date' | 'side' | 'market' | 'fees';
const FIELDS: { key: FieldKey; label: string; required?: boolean; guess: RegExp }[] = [
  { key: 'code', label: 'Ticker or code', required: true, guess: /^(code|ticker|symbol|security|stock|asx code|instrument)/i },
  { key: 'units', label: 'Units', required: true, guess: /(qty|quantity|units|shares|volume)/i },
  { key: 'price', label: 'Price per unit', required: true, guess: /(^price|unit price|avg|average|cost per|trade price|execution price)/i },
  { key: 'date', label: 'Trade date', guess: /date/i },
  { key: 'side', label: 'Buy or sell', guess: /(buy\/sell|side|type|action|transaction)/i },
  { key: 'market', label: 'Market', guess: /(market|exchange)/i },
  { key: 'fees', label: 'Brokerage', guess: /(brokerage|fee|commission)/i },
];

const CRYPTO = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE']);
const toNum = (s: string | undefined) => { const v = Number(String(s ?? '').replace(/[^0-9.\-]/g, '')); return isFinite(v) ? v : 0; };

function aggregate(rows: Record<string, string>[], map: Partial<Record<FieldKey, string>>): Holding[] {
  const by = new Map<string, Holding & { cost: number }>();
  for (const r of rows) {
    const rawCode = String(r[map.code!] ?? '').trim().toUpperCase();
    if (!rawCode) continue;
    const code = rawCode.replace(/\.(AX|ASX)$/, '');
    const units = Math.abs(toNum(r[map.units!]));
    const price = toNum(r[map.price!]);
    if (!units || !price) continue;
    const mk = String(map.market ? r[map.market] : '').toUpperCase();
    const exchange: Holding['exchange'] = CRYPTO.has(code) ? 'CRYPTO' : /NASDAQ/.test(mk) ? 'NASDAQ' : /NYSE|US/.test(mk) ? 'NYSE' : 'ASX';
    const sell = map.side ? /^(s|sell|sold)/i.test(String(r[map.side] ?? '').trim()) : false;
    const fees = map.fees ? toNum(r[map.fees]) : 0;
    const date = map.date ? String(r[map.date] ?? '') : '';
    const key = `${exchange}:${code}`;
    const cur = by.get(key) ?? { id: uid(), code, exchange, name: code, units: 0, avgCost: 0, firstBought: date, kind: exchange === 'CRYPTO' ? 'crypto' : /^(V|A2|NDQ|IVV|IOZ|STW|ETHI|VDHG)/.test(code) ? 'etf' : 'share', cost: 0 } as Holding & { cost: number };
    if (sell) {
      const avg = cur.units ? cur.cost / cur.units : 0;
      cur.units = Math.max(0, cur.units - units);
      cur.cost = avg * cur.units;
    } else {
      cur.units += units;
      cur.cost += units * price + fees;
      if (!cur.firstBought || (date && date < cur.firstBought)) cur.firstBought = date;
    }
    by.set(key, cur);
  }
  return [...by.values()].filter((h) => h.units > 0).map(({ cost, ...h }) => ({ ...h, avgCost: cost / h.units }));
}

export function CsvImport({ onImport, compact }: { onImport: (h: Holding[]) => void; compact?: boolean }) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [cols, setCols] = useState<string[]>([]);
  const [map, setMap] = useState<Partial<Record<FieldKey, string>>>({});
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = (text: string, name: string) => {
    const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
    const headers = res.meta.fields ?? [];
    if (!headers.length || !res.data.length) { setError('That file has no rows we can read. Check it’s a CSV with a header row.'); return; }
    const guess: Partial<Record<FieldKey, string>> = {};
    for (const f of FIELDS) { const hit = headers.find((h) => f.guess.test(h.trim()) && !Object.values(guess).includes(h)); if (hit) guess[f.key] = hit; }
    setError(''); setFileName(name); setCols(headers); setRows(res.data); setMap(guess);
  };
  const readFile = (f: File) => { const fr = new FileReader(); fr.onload = () => load(String(fr.result), f.name); fr.readAsText(f); };

  const ready = FIELDS.filter((f) => f.required).every((f) => map[f.key]);
  const preview = useMemo(() => (rows && ready ? aggregate(rows, map) : []), [rows, map, ready]);

  if (!rows) {
    return (
      <div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
          className={`rounded-2xl border-2 border-dashed ${drag ? 'border-brass bg-brass/5' : 'border-line'} ${compact ? 'p-6' : 'p-10'} text-center transition-colors`}>
          <Icon name="upload" className="mx-auto h-7 w-7 text-brass" />
          <p className="mt-3 font-medium">Drop your broker’s trade history here</p>
          <p className="mt-1 text-sm text-muted">CSV from CommSec, Stake, SelfWealth, Pearler, Sharesight or a spreadsheet. You’ll match the columns next.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => input.current?.click()}>Choose a file</button>
            <button type="button" className="btn-quiet" onClick={() => load(SAMPLE_CSV, 'sample-trades.csv')}>Use a sample file</button>
          </div>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm"><span className="font-medium">{fileName}</span> <span className="text-muted">· {rows.length} rows</span></p>
        <button type="button" className="btn-ghost" onClick={() => setRows(null)}>Use another file</button>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Match your columns</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs text-muted">{f.label}{f.required ? '' : ' (optional)'}</span>
              <select className="input mt-1 py-2" value={map[f.key] ?? ''} onChange={(e) => setMap({ ...map, [f.key]: e.target.value || undefined })}>
                <option value="">Not in this file</option>
                {cols.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      {ready && (
        <div>
          <p className="text-sm font-medium mb-2">{preview.length} holdings found <span className="font-normal text-muted">(buys and sells combined into your current position)</span></p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-raised text-muted text-xs"><tr><th className="text-left px-3 py-2 font-medium">Code</th><th className="text-left px-3 py-2 font-medium">Market</th><th className="text-right px-3 py-2 font-medium">Units</th><th className="text-right px-3 py-2 font-medium">Average cost</th><th className="text-right px-3 py-2 font-medium">Cost base</th></tr></thead>
              <tbody>
                {preview.map((h) => (
                  <tr key={h.code + h.exchange} className="border-t border-line">
                    <td className="px-3 py-2 font-semibold">{h.code}</td><td className="px-3 py-2 text-muted">{h.exchange}</td>
                    <td className="px-3 py-2 text-right">{num(h.units, 4)}</td><td className="px-3 py-2 text-right">{money(h.avgCost, { cents: true })}</td>
                    <td className="px-3 py-2 text-right">{money(h.avgCost * h.units)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-primary mt-4" onClick={() => { onImport(preview); setRows(null); }} disabled={!preview.length}>
            Import {preview.length} holdings
          </button>
        </div>
      )}
    </div>
  );
}
