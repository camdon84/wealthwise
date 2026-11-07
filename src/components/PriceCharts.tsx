import { useState } from 'react';
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { rangeSince, useHistory, type Range } from '../lib/history';
import { price as fmtPrice, pct } from '../lib/format';
import { Segmented } from './ui';
import type { Holding } from '../lib/types';

const fmtDate = (t: number, long = false) => new Date(t).toLocaleDateString('en-AU', long ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'short', year: '2-digit' });
const MARKETS = ['IDX:AXJO', 'IDX:GSPC', 'IDX:IXIC', 'IDX:AUDUSD'];
const RANGE_OPTS: { value: Range; label: string }[] = [{ value: '1mo', label: '1M' }, { value: '6mo', label: '6M' }, { value: '1y', label: '1Y' }, { value: '5y', label: '5Y' }];

export function MarketStrip() {
  const [range, setRange] = useState<Range>('1y');
  return (
    <section className="panel p-5 sm:p-6" aria-label="Markets">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">Markets</h2>
        <Segmented size="sm" label="Time range" value={range} onChange={setRange} options={RANGE_OPTS} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MARKETS.map((k) => <MarketCard key={k} id={k} range={range} />)}
      </div>
    </section>
  );
}

function MarketCard({ id, range }: { id: string; range: Range }) {
  const s = useHistory(id, range);
  if (s === 'loading' || !s) return <div className="h-36 rounded-xl border border-line bg-raised/50 p-4">{s === null ? <p className="text-sm text-muted">Unavailable right now</p> : <div className="h-full animate-pulse rounded bg-line/40" />}</div>;
  const first = s.points[0].c, last = s.points[s.points.length - 1].c;
  const ch = ((last - first) / first) * 100;
  const color = ch >= 0 ? 'rgb(var(--gum))' : 'rgb(var(--clay))';
  const dp = id === 'IDX:AUDUSD' ? 4 : 0;
  return (
    <div className="rounded-xl border border-line bg-raised/50 p-4">
      <div className="flex items-baseline justify-between"><p className="text-sm font-medium">{s.name}</p><p className={`text-sm font-medium ${ch >= 0 ? 'text-gum' : 'text-clay'}`}>{pct(ch, 1, true)}</p></div>
      <p className="font-display text-2xl font-semibold">{last.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}</p>
      <div className="mt-2 h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={s.points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs><linearGradient id={`m-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.35} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip content={({ active, payload }: any) => active && payload?.length ? <div className="rounded-lg border border-line bg-surface px-2 py-1 text-xs shadow">{fmtDate(payload[0].payload.t, true)} · {payload[0].payload.c.toLocaleString('en-AU', { maximumFractionDigits: dp || 2 })}</div> : null} />
            <Area type="monotone" dataKey="c" stroke={color} strokeWidth={1.5} fill={`url(#m-${id})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function HoldingChart({ h, currentPrice }: { h: Holding; currentPrice: number }) {
  const auto = rangeSince(h.firstBought);
  const [range, setRange] = useState<Range>(auto);
  const key = `${h.exchange}:${h.code}`;
  const s = useHistory(key, range, h.currency && h.currency !== 'AUD' ? h.avgCost * 1.3 : currentPrice);
  const cur = s && s !== 'loading' ? s.currency || h.currency || 'AUD' : h.currency || 'AUD';
  const sameCurrency = (h.currency ?? 'AUD') === cur;
  const buyT = h.firstBought ? new Date(h.firstBought).getTime() : null;
  const inRange = s && s !== 'loading' && buyT && buyT >= s.points[0].t;
  const buyPoint = inRange ? s.points.reduce((best, p) => (Math.abs(p.t - buyT!) < Math.abs(best.t - buyT!) ? p : best), s.points[0]) : null;
  const first = s && s !== 'loading' ? s.points[0].c : 0;
  const last = s && s !== 'loading' ? s.points[s.points.length - 1].c : 0;
  const sinceBuy = sameCurrency && h.avgCost ? ((last - h.avgCost) / h.avgCost) * 100 : null;
  const opts = [...RANGE_OPTS, { value: '10y' as Range, label: '10Y' }];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-6 text-sm">
          <div><p className="text-xs text-muted">Price</p><p className="font-display text-xl font-semibold">{last ? fmtPrice(last, cur) : '—'}</p></div>
          <div><p className="text-xs text-muted">Over this range</p><p className={`font-display text-xl font-semibold ${last >= first ? 'text-gum' : 'text-clay'}`}>{first ? pct(((last - first) / first) * 100, 1, true) : '—'}</p></div>
          {sinceBuy != null && <div><p className="text-xs text-muted">Since your average buy</p><p className={`font-display text-xl font-semibold ${sinceBuy >= 0 ? 'text-gum' : 'text-clay'}`}>{pct(sinceBuy, 1, true)}</p></div>}
        </div>
        <Segmented size="sm" label="Time range" value={range} onChange={setRange} options={opts} />
      </div>
      <div className="mt-4 h-72">
        {s === 'loading' ? <div className="h-full animate-pulse rounded-xl bg-line/40" /> : !s ? <p className="text-sm text-muted">Price history isn’t available for {h.code} right now.</p> : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={s.points} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <defs><linearGradient id="hold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(var(--sky))" stopOpacity={0.35} /><stop offset="1" stopColor="rgb(var(--sky))" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(t) => fmtDate(t)} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis domain={['auto', 'auto']} stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => fmtPrice(v, cur).replace(/\.\d+$/, '')} />
              <Tooltip content={({ active, payload }: any) => active && payload?.length ? <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow">{fmtDate(payload[0].payload.t, true)}<br /><span className="font-semibold">{fmtPrice(payload[0].payload.c, cur)}</span></div> : null} />
              <Area type="monotone" dataKey="c" stroke="rgb(var(--sky))" strokeWidth={1.8} fill="url(#hold)" isAnimationActive={false} />
              {sameCurrency && h.avgCost > 0 && <ReferenceLine y={h.avgCost} stroke="rgb(var(--brass))" strokeDasharray="4 4" label={{ value: `Your average buy ${fmtPrice(h.avgCost, cur)}`, position: 'insideBottomLeft', fill: 'rgb(var(--brass))', fontSize: 11 }} />}
              {buyPoint && <ReferenceDot x={buyPoint.t} y={buyPoint.c} r={5} fill="rgb(var(--surface))" stroke="rgb(var(--brass))" strokeWidth={2} label={{ value: 'First bought', position: 'top', fill: 'rgb(var(--muted))', fontSize: 10 }} />}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {!live && <p className="mt-2 text-[11px] text-muted">Demo price history in this preview. The live site shows real prices.</p>}
    </div>
  );
}
const live = (import.meta as any).env?.VITE_STORAGE === 'api';
