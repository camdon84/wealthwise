import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearPoint } from '../lib/calc';
import { money } from '../lib/format';

const C = {
  equity: 'rgb(var(--gum))', shares: 'rgb(var(--sky))', super: 'rgb(var(--sage))', cash: 'rgb(var(--brass))',
  grid: 'rgb(var(--line))', muted: 'rgb(var(--muted))', brass: 'rgb(var(--brass))', clay: 'rgb(var(--clay))', ink: 'rgb(var(--ink))',
};
const axis = { stroke: C.muted, fontSize: 11, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, rows, real }: any) {
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
    </div>
  );
}

// Cash sits at the bottom of the stack, next to property equity: buying a property moves money from one to the other, so the layers above stay smooth.
export const wealthSeries = [
  { key: 'cash' as const, label: 'Cash', color: C.cash },
  { key: 'propertyEquity' as const, label: 'Property equity', color: C.equity },
  { key: 'shares' as const, label: 'Shares', color: C.shares },
  { key: 'super' as const, label: 'Super', color: C.super },
];

export function toReal(points: YearPoint[], inflation: number): YearPoint[] {
  return points.map((p, i) => {
    const d = Math.pow(1 + inflation / 100, i);
    return { ...p, propertyEquity: p.propertyEquity / d, shares: p.shares / d, super: p.super / d, cash: p.cash / d, netWorth: p.netWorth / d, bought: p.bought ? p.bought / d : undefined };
  });
}

export function SeriesToggles({ hidden, onChange }: { hidden: string[]; onChange: (h: string[]) => void }) {
  return (
    <ul className="flex flex-wrap gap-x-2 gap-y-1" aria-label="Show or hide each part of the chart">
      {wealthSeries.map((s) => {
        const on = !hidden.includes(s.key);
        const onlyOne = on && wealthSeries.length - hidden.length === 1;
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
  );
}

export function WealthChart({ points, retireYear, height = 320, real, hidden = [], runsOutYear }: { points: YearPoint[]; retireYear: number; height?: number; real?: boolean; hidden?: string[]; runsOutYear?: number | null }) {
  const shown = wealthSeries.filter((s) => !hidden.includes(s.key));
  points = points.map((p) => ({ ...p, cash: Math.max(0, p.cash), netWorth: p.netWorth - Math.min(0, p.cash) })); // a shortfall shows as the money running out, not negative cash
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
        <defs>{wealthSeries.map((s) => (
          <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity={0.55} /><stop offset="1" stopColor={s.color} stopOpacity={0.12} /></linearGradient>
        ))}</defs>
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="2 4" />
        <XAxis dataKey="year" {...axis} interval="preserveStartEnd" minTickGap={28} />
        <YAxis {...axis} width={56} tickFormatter={(v) => money(v, { compact: true })} />
        <Tooltip content={<Tip rows={shown} real={real} />} cursor={{ stroke: C.muted, strokeDasharray: '3 3' }} />
        {shown.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} stackId="1" stroke={s.color} strokeWidth={1.5} fill={`url(#g-${s.key})`} isAnimationActive={false} />)}
        <ReferenceLine x={retireYear} stroke={C.brass} strokeDasharray="4 4" label={{ value: 'Stop work', position: 'insideTopRight', fill: C.brass, fontSize: 11 }} />
        {runsOutYear != null && <ReferenceLine x={runsOutYear} stroke={C.clay} strokeWidth={1.5} label={{ value: 'Money runs out', position: 'insideTopLeft', fill: C.clay, fontSize: 11 }} />}
        {points.filter((p) => p.bought).map((p) => (
          <ReferenceDot key={p.year} x={p.year} y={shown.reduce((t, s) => t + (p[s.key] as number), 0)} r={5} fill="rgb(var(--surface))" stroke={C.brass} strokeWidth={2}
            label={{ value: `Buy #${p.properties}`, position: 'top', fill: C.muted, fontSize: 10 }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
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
