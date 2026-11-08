import { useEffect, useRef, useState } from 'react';
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getHistory, rangeSince, useHistory, type Range } from '../lib/history';
import { money, price as fmtPrice, pct } from '../lib/format';
import { Icon, Segmented } from './ui';
import type { Holding } from '../lib/types';
import type { Quotes } from '../lib/calc';

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

function MarketCard({ id, range, fill }: { id: string; range: Range; fill?: boolean }) {
  const s = useHistory(id, range);
  if (s === 'loading' || !s) return <div className="h-36 rounded-xl border border-line bg-raised/50 p-4">{s === null ? <p className="text-sm text-muted">Unavailable right now</p> : <div className="h-full animate-pulse rounded bg-line/40" />}</div>;
  const first = s.points[0].c, last = s.points[s.points.length - 1].c;
  const ch = ((last - first) / first) * 100;
  const color = ch >= 0 ? 'rgb(var(--gum))' : 'rgb(var(--clay))';
  const dp = id === 'IDX:AUDUSD' ? 4 : 0;
  return (
    <div className={`rounded-xl border border-line bg-raised/50 p-4 ${fill ? 'flex h-full flex-col' : ''}`}>
      <div className="flex items-baseline justify-between"><p className="text-sm font-medium">{s.name}</p><p className={`text-sm font-medium ${ch >= 0 ? 'text-gum' : 'text-clay'}`}>{pct(ch, 1, true)}</p></div>
      <p className="font-display text-2xl font-semibold">{last.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}</p>
      <div className={`mt-2 ${fill ? 'relative min-h-28 flex-1' : 'h-28'}`}>
        <div className={fill ? 'absolute inset-0' : 'h-full'}>
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

/* ---------- Top-of-page carousel: markets, then your portfolio over time ---------- */
export function SharesCarousel({ holdings, quotes }: { holdings: Holding[]; quotes: Quotes }) {
  // Your portfolio first (when you have holdings), then Markets
  const slides = holdings.length ? ['Your portfolio over time', 'Markets'] : ['Markets'];
  const mkIdx = slides.indexOf('Markets');
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touched = useRef(0);
  const earliest = holdings.map((h) => h.firstBought).filter(Boolean).sort()[0] ?? '';
  const [mRange, setMRange] = useState<Range>('1y');
  const [pRange, setPRange] = useState<Range>(rangeSince(earliest));
  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const t = setInterval(() => { if (Date.now() - touched.current > 30000) setI((x) => (x + 1) % slides.length); }, 15000);
    return () => clearInterval(t);
  }, [slides.length, paused]);
  const go = (d: number) => { touched.current = Date.now(); setI((x) => (x + d + slides.length) % slides.length); };
  const onMarkets = i === mkIdx;
  return (
    <section className="panel overflow-hidden" aria-roledescription="carousel" aria-label="Your portfolio and markets" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="font-display text-xl font-semibold">{slides[i]}</h2>
          {onMarkets
            ? <Segmented size="sm" label="Time range" value={mRange} onChange={setMRange} options={RANGE_OPTS} />
            : <Segmented size="sm" label="Time range" value={pRange} onChange={setPRange} options={[...RANGE_OPTS, { value: '10y', label: '10Y' }]} />}
        </div>
        {slides.length > 1 && (
          <div className="flex items-center gap-2">
            <button className="btn-quiet h-9 w-9 justify-center p-0" aria-label="Previous" onClick={() => go(-1)}><Icon name="back" className="h-4 w-4" /></button>
            <div className="flex gap-1.5">{slides.map((s, k) => <button key={s} aria-label={s} aria-current={k === i} onClick={() => { touched.current = Date.now(); setI(k); }} className={`h-2 rounded-full transition-all ${k === i ? 'w-5 bg-brass' : 'w-2 bg-line'}`} />)}</div>
            <button className="btn-quiet h-9 w-9 justify-center p-0" aria-label="Next" onClick={() => go(1)}><Icon name="back" className="h-4 w-4 rotate-180" /></button>
          </div>
        )}
      </div>
      <div className="relative overflow-hidden">
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
          {slides.map((s, k) => (
            <div key={s} className="flex w-full shrink-0 flex-col p-5 pt-4 sm:p-6 sm:pt-4" aria-hidden={i !== k}>
              {s === 'Markets'
                ? <div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{MARKETS.map((m) => <MarketCard key={m} id={m} range={mRange} fill={slides.length > 1} />)}</div>
                : <PortfolioHistory holdings={holdings} quotes={quotes} range={pRange} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Portfolio value over time: each holding's units at each day's price, from when you first bought it, against what you put in. */
function PortfolioHistory({ holdings, quotes, range }: { holdings: Holding[]; quotes: Quotes; range: Range }) {
  const [data, setData] = useState<{ t: number; value: number; invested: number }[] | 'loading' | null>('loading');
  const sig = holdings.map((h) => `${h.exchange}:${h.code}:${h.units}:${h.avgCost}:${h.firstBought}`).join('|');
  useEffect(() => {
    let on = true;
    setData('loading');
    Promise.all(holdings.map((h) => {
      const q = quotes[`${h.exchange}:${h.code}`]?.price;
      return getHistory(`${h.exchange}:${h.code}`, range, q ?? h.avgCost);
    })).then((all) => {
      if (!on) return;
      const base = all.filter(Boolean).sort((a, b) => b!.points.length - a!.points.length)[0];
      if (!base) { setData(null); return; }
      const fx = (cur: string | undefined) => (cur && cur !== 'AUD' ? quotes[`FX:${cur}`]?.price ?? 1 : 1);
      const rows = base.points.map(({ t }) => {
        let value = 0, invested = 0;
        holdings.forEach((h, k) => {
          const from = h.firstBought ? new Date(h.firstBought).getTime() : 0;
          if (t < from) return;
          const s = all[k];
          let price = h.avgCost;
          if (s) { let best = s.points[0]; for (const pt of s.points) { if (pt.t <= t) best = pt; else break; } price = best.c * fx(s.currency || h.currency); }
          value += price * h.units;
          invested += h.avgCost * h.units * fx(h.currency);
        });
        return { t, value, invested };
      }).filter((r) => r.value > 0 || r.invested > 0);
      setData(rows.length ? rows : null);
    });
    return () => { on = false; };
  }, [sig, range]); // eslint-disable-line react-hooks/exhaustive-deps
  if (data === 'loading') return <div className="h-64 animate-pulse rounded-xl bg-line/40" />;
  if (!data) return <p className="py-16 text-center text-sm text-muted">No price history available right now.</p>;
  const last = data[data.length - 1], first = data[0];
  const gain = last.value - last.invested;
  const color = gain >= 0 ? 'rgb(var(--gum))' : 'rgb(var(--clay))';
  return (<>
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <div><p className="text-xs text-muted">Value now</p><p className="font-display text-2xl font-semibold">{money(last.value)}</p></div>
        <div><p className="text-xs text-muted">Put in</p><p className="font-display text-2xl font-semibold">{money(last.invested)}</p></div>
        <div><p className="text-xs text-muted">Gain</p><p className={`font-display text-2xl font-semibold ${gain >= 0 ? 'text-gum' : 'text-clay'}`}>{money(gain, { sign: true })}</p></div>
      </div>
    </div>
    <div className="mt-3 h-56 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs><linearGradient id="pf-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.35} /><stop offset="1" stopColor={color} stopOpacity={0.02} /></linearGradient></defs>
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(t) => fmtDate(t)} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis domain={['auto', 'auto']} tickFormatter={(v) => money(v, { compact: true })} tick={{ fill: 'rgb(var(--muted))', fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
          <Tooltip content={({ active, payload }: any) => active && payload?.length ? (
            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow">
              <p className="font-medium">{fmtDate(payload[0].payload.t, true)}</p>
              <p>Value {money(payload[0].payload.value)}</p><p className="text-muted">Put in {money(payload[0].payload.invested)}</p>
            </div>) : null} />
          <Area type="stepAfter" dataKey="invested" stroke="rgb(var(--muted))" strokeDasharray="4 4" strokeWidth={1.2} fill="none" isAnimationActive={false} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#pf-v)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <p className="mt-1 text-[11px] text-muted">What your current holdings were worth each day since you first bought them{first ? ` (${fmtDate(first.t, true)})` : ''}. Dashed line: what you put in.</p>
  </>);
}
