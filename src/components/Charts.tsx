import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearPoint } from '../lib/calc';
import { money } from '../lib/format';

const C = {
  equity: 'rgb(var(--gum))', shares: 'rgb(var(--sky))', super: 'rgb(var(--sage))', cash: 'rgb(var(--brass))',
  grid: 'rgb(var(--line))', muted: 'rgb(var(--muted))', brass: 'rgb(var(--brass))', clay: 'rgb(var(--clay))', ink: 'rgb(var(--ink))',
};
const axis = { stroke: C.muted, fontSize: 11, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, rows, rowsAll, real }: any) {
  if (!active || !payload?.length) return null;
  const d: YearPoint = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-lg">
      <p className="font-semibold text-ink">{label} · age {d.age}</p>
      {real != null && <p className="text-[11px] text-muted">{real ? 'in today’s money' : `in ${label} dollars`}</p>}
      {rows.map((r: { key: keyof YearPoint; label: string; color: string }) => (
        <p key={String(r.key)} className="mt-1 flex items-center justify-between gap-6 text-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.label}</span>
          <span className="text-ink">{money(d[r.key] as number, { compact: true })}</span>
        </p>
      ))}
      {d.bought && <p className="mt-1.5 text-brass">Buys property for {money(d.bought, { compact: true })}</p>}
      {d.paidOff && <p className="mt-1.5 text-gum">Paid off: {d.paidOff.join(', ')}</p>}
      {d.sold && <p className="mt-1.5 text-clay">Sold: {d.sold.join(', ')}</p>}
      {d.liquidated && <p className="mt-1.5 text-clay">Liquidation event: {money(d.liquidated, { compact: true })} to savings</p>}
      {d.giftIn > 0 && <p className="mt-1.5 text-gum">Gift or inheritance: {money(d.giftIn, { compact: true })}</p>}
      {rows.length < (rowsAll ?? rows.length) && <p className="mt-1.5 border-t border-line pt-1.5 text-muted">Net worth (everything) <span className="float-right ml-4 font-medium text-ink">{money(d.netWorth, { compact: true })}</span></p>}
    </div>
  );
}

// Cash sits at the bottom of the stack, next to property equity: buying a property moves money from one to the other, so the layers above stay smooth.
export const wealthSeries = [
  { key: 'cash' as const, label: 'Cash', color: C.cash },
  { key: 'propertyEquity' as const, label: 'Property equity', color: C.equity },
  { key: 'shares' as const, label: 'Shares', color: C.shares },
  { key: 'super' as const, label: 'Super', color: C.super },
  { key: 'crypto' as const, label: 'Crypto', color: '#8b6fb3' },
];

export function toReal(points: YearPoint[], inflation: number): YearPoint[] {
  return points.map((p, i) => {
    const d = Math.pow(1 + inflation / 100, i);
    return { ...p, propertyEquity: p.propertyEquity / d, shares: p.shares / d, super: p.super / d, cash: p.cash / d, crypto: p.crypto / d, payNet: p.payNet / d, rentIncome: p.rentIncome / d, superDrawn: p.superDrawn / d, saleIn: p.saleIn / d, giftIn: p.giftIn / d, liqIn: p.liqIn / d, spending: p.spending / d, propNet: p.propNet / d, netWorth: p.netWorth / d, bought: p.bought ? p.bought / d : undefined };
  });
}

export function SeriesToggles({ hidden, onChange, crypto }: { hidden: string[]; onChange: (h: string[]) => void; crypto?: boolean }) {
  const list = wealthSeries.filter((s) => crypto || s.key !== 'crypto');
  return (
    <div className="flex flex-col items-end gap-1">
    <ul className="flex flex-wrap gap-x-2 gap-y-1" aria-label="Show or hide each part of the chart (this only changes the view, not your plan)" title="Ticking and unticking only changes what the chart shows. Your plan and net worth don’t change.">
      {list.map((s) => {
        const on = !hidden.includes(s.key);
        const onlyOne = on && list.filter((x) => !hidden.includes(x.key)).length === 1;
        return (
          <li key={s.key}>
            <label className={`flex cursor-pointer select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-raised ${on ? 'text-ink' : 'text-muted line-through decoration-muted/60'}`} title={onlyOne ? 'At least one needs to stay on' : undefined}>
              <input type="checkbox" className="sr-only" checked={on} disabled={onlyOne} onChange={() => onChange(on ? [...hidden, s.key] : hidden.filter((k) => k !== s.key))} />
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border" style={{ background: on ? s.color : 'transparent', borderColor: s.color }} aria-hidden="true">
                {on && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5"><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="rgb(var(--surface))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
              {s.label}
            </label>
          </li>
        );
      })}
    </ul>
    <p className="text-[11px] text-muted">Tick or untick to show or hide. It only changes the view, not your plan.</p>
    </div>
  );
}

export function WealthChart({ points, retireYear, height = 320, real, hidden = [], runsOutYear }: { points: YearPoint[]; retireYear: number; height?: number; real?: boolean; hidden?: string[]; runsOutYear?: number | null }) {
  const hasCrypto = points.some((p) => p.crypto > 0);
  const all = wealthSeries.filter((s) => hasCrypto || s.key !== 'crypto');
  const shown = all.filter((s) => !hidden.includes(s.key));
  points = points.map((p) => ({ ...p, cash: Math.max(0, p.cash), netWorth: p.netWorth - Math.min(0, p.cash) })); // a shortfall shows as the money running out, not negative cash
  // Ticking a series off only hides it: the scale stays set by everything, so the rest of the chart doesn't jump
  const top = Math.max(1, ...points.map((p) => all.reduce((t, s) => t + Math.max(0, p[s.key] as number), 0)));
  const step = Math.pow(10, Math.floor(Math.log10(top)));
  const yMax = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * step).find((v) => v >= top) ?? top;
  // Where a marker sits: property buys and sales on the property equity line, liquidations on the top line,
  // and a loan paid off on the cash line (repayments come out of cash)
  const upTo = (p: YearPoint, key: string) => { let t = 0; for (const s of shown) { t += Math.max(0, p[s.key] as number); if (s.key === key) break; } return t; };
  const equityTop = (p: YearPoint) => (shown.some((s) => s.key === 'propertyEquity') ? upTo(p, 'propertyEquity') : shown.filter((s) => s.key === 'cash').reduce((t, s) => t + Math.max(0, p[s.key] as number), 0));
  const stackTop = (p: YearPoint) => shown.reduce((t, s) => t + Math.max(0, p[s.key] as number), 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
        <defs>{wealthSeries.map((s) => (
          <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity={0.55} /><stop offset="1" stopColor={s.color} stopOpacity={0.12} /></linearGradient>
        ))}</defs>
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="2 4" />
        <XAxis dataKey="year" {...axis} interval="preserveStartEnd" minTickGap={28} />
        <YAxis {...axis} width={56} domain={[0, yMax]} allowDataOverflow ticks={[0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax]} tickFormatter={(v) => money(v, { compact: true })} />
        <Tooltip content={<Tip rows={shown} rowsAll={all.length} real={real} />} cursor={{ stroke: C.muted, strokeDasharray: '3 3' }} />
        {shown.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} stackId="1" stroke={s.color} strokeWidth={1.5} fill={`url(#g-${s.key})`} isAnimationActive={false} />)}
        <ReferenceLine x={retireYear} stroke={C.brass} strokeDasharray="4 4" label={{ value: 'Retirement', position: 'insideTopRight', fill: C.brass, fontSize: 11 }} />
        {runsOutYear != null && <ReferenceLine x={runsOutYear} stroke={C.clay} strokeWidth={1.5} label={{ value: 'Money runs out', position: 'insideTopLeft', fill: C.clay, fontSize: 11 }} />}
        {points.filter((p) => p.bought).map((p) => (
          <ReferenceDot key={p.year} x={p.year} y={equityTop(p)} r={5} fill="rgb(var(--surface))" stroke={C.brass} strokeWidth={2}
            label={{ value: `Buy #${p.properties}`, position: 'top', fill: C.muted, fontSize: 10 }} />
        ))}
        {points.filter((p) => p.sold).map((p) => (
          <ReferenceDot key={`s${p.year}`} x={p.year} y={equityTop(p)} r={5} fill="rgb(var(--surface))" stroke={C.clay} strokeWidth={2}
            label={{ value: p.sold!.length > 1 ? `Sell ×${p.sold!.length}` : 'Sell', position: 'top', fill: C.clay, fontSize: 10 }} />
        ))}
        {points.filter((p) => p.paidOff).map((p, k) => (
          <ReferenceDot key={`d${p.year}`} x={p.year} y={shown.some((x) => x.key === 'cash') ? upTo(p, 'cash') : 0} r={4.5} fill={C.equity} stroke="rgb(var(--surface))" strokeWidth={1.5} ifOverflow="visible" label={k === 0 ? { value: 'Loan paid off', position: 'top', fill: C.equity, fontSize: 10 } : undefined} />
        ))}
        {points.filter((p) => p.liquidated).map((p) => (
          <ReferenceDot key={`l${p.year}`} x={p.year} y={stackTop(p)} r={8} fill={C.clay} stroke="rgb(var(--surface))" strokeWidth={1.5}
            label={{ value: '$', position: 'center', fill: '#fff', fontSize: 11, fontWeight: 700 }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Key for the markers on the wealth chart. */
export function MarkerKey({ points }: { points: YearPoint[] }) {
  const debts = points.filter((p) => p.paidOff).map((p) => `${p.paidOff!.join(', ')} (${p.year})`);
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
      <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: C.brass }} />Property bought</li>
      {points.some((p) => p.sold) && <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: C.clay }} />Property sold</li>}
      {debts.length > 0 && <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: C.equity }} />Loan paid off: {debts.join(' · ')}</li>}
      {points.some((p) => p.liquidated) && <li className="flex items-center gap-1.5"><span className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: C.clay }}>$</span>Liquidation event</li>}
    </ul>
  );
}

export function MiniLine({ points, series, retireYear, height = 180, goal }: { points: YearPoint[]; series: { key: keyof YearPoint; label: string; color: string; dash?: boolean }[]; retireYear: number; height?: number; goal?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="2 4" />
        <XAxis dataKey="year" {...axis} interval="preserveStartEnd" minTickGap={28} />
        <YAxis {...axis} width={52} tickFormatter={(v) => money(v, { compact: true })} />
        <Tooltip content={<Tip rows={series} />} cursor={{ stroke: C.muted, strokeDasharray: '3 3' }} />
        <ReferenceLine x={retireYear} stroke={C.brass} strokeDasharray="4 4" />
        {goal != null && <ReferenceLine y={goal} stroke={C.muted} strokeDasharray="2 3" label={{ value: 'Goal', position: 'insideTopLeft', fill: C.muted, fontSize: 10 }} />}
        {series.map((s) => <Line key={String(s.key)} type="monotone" dataKey={s.key as string} stroke={s.color} strokeWidth={2} dot={false} strokeDasharray={s.dash ? '5 4' : undefined} isAnimationActive={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export const chartColors = C;

/* ---------- Cash flow: where each year's money comes from, against what you spend ---------- */
const flowSeries = [
  { key: 'payNet', label: 'Take-home pay', color: C.brass },
  { key: 'rentIncome', label: 'Rent', color: C.equity },
  { key: 'superDrawn', label: 'From super', color: C.super },
  { key: 'saleIn', label: 'From selling shares or property', color: C.shares },
  { key: 'oneOff', label: 'Gifts and liquidation events', color: '#8b6fb3' },
] as const;

export function CashFlowKey() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {flowSeries.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>)}
      <li className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: C.clay }} />Spending</li>
    </ul>
  );
}

export function CashFlowChart({ points, retireYear, height = 320, real }: { points: YearPoint[]; retireYear: number; height?: number; real?: boolean }) {
  const data = points.slice(1).map((p) => ({ ...p, oneOff: p.giftIn + p.liqIn }));
  // One big sale (usually properties at retirement) would flatten every other year, so the scale is set by the typical years and tall bars are labelled instead
  const totals = data.map((d) => flowSeries.reduce((t, s) => t + Math.max(0, (d as any)[s.key] ?? 0), 0));
  const sorted = [...totals].sort((a, b) => a - b);
  const typical = Math.max(sorted[Math.floor(sorted.length * 0.9)] ?? 0, ...data.map((d) => d.spending));
  const rough = typical * 1.3 || 1;
  const step = Math.pow(10, Math.floor(Math.log10(rough)));
  const cap = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * step).find((v) => v >= rough) ?? rough;
  const tall = data.map((d, k) => ({ year: d.year, total: totals[k] })).filter((x) => x.total > cap);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="2 4" />
        <XAxis dataKey="year" {...axis} interval="preserveStartEnd" minTickGap={28} />
        <YAxis {...axis} width={56} domain={[0, cap]} allowDataOverflow ticks={[0, cap / 4, cap / 2, (cap * 3) / 4, cap]} tickFormatter={(v) => money(v, { compact: true })} />
        <Tooltip cursor={{ fill: 'rgb(var(--line) / 0.35)' }} content={({ active, payload, label }: any) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload;
          const total = flowSeries.reduce((t, s) => t + (d[s.key] ?? 0), 0);
          return (
            <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-lg">
              <p className="font-semibold text-ink">{label} · age {d.age}</p>
              <p className="text-[11px] text-muted">{real ? 'in today’s money' : `in ${label} dollars`}</p>
              {flowSeries.filter((s) => (d[s.key] ?? 0) > 0).map((s) => (
                <p key={s.key} className="mt-1 flex items-center justify-between gap-6 text-muted"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span><span className="text-ink">{money(d[s.key], { compact: true })}</span></p>
              ))}
              <p className="mt-1.5 flex justify-between gap-6 border-t border-line pt-1.5 text-muted"><span>Money in</span><span className="font-medium text-ink">{money(total, { compact: true })}</span></p>
              <p className="flex justify-between gap-6 text-muted"><span>Spending</span><span className="text-ink">{money(d.spending, { compact: true })}</span></p>
            </div>
          );
        }} />
        {flowSeries.map((s) => <Bar key={s.key} dataKey={s.key} stackId="in" fill={s.color} fillOpacity={0.8} isAnimationActive={false} />)}
        <Line type="monotone" dataKey="spending" stroke={C.clay} strokeWidth={2} dot={false} isAnimationActive={false} />
        {tall.map((t) => <ReferenceDot key={t.year} x={t.year} y={cap} r={0} label={{ value: `↑ ${money(t.total, { compact: true })}`, position: 'right', fill: C.ink, fontSize: 10, fontWeight: 600 }} />)}
        <ReferenceLine x={retireYear} stroke={C.brass} strokeDasharray="4 4" label={{ value: 'Retirement', position: 'insideBottomLeft', fill: C.brass, fontSize: 11 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
