import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { YearPoint } from '../lib/calc';
import { money } from '../lib/format';

const C = {
  equity: 'rgb(var(--gum))', shares: 'rgb(var(--sky))', super: 'rgb(var(--sage))', cash: 'rgb(var(--brass))',
  grid: 'rgb(var(--line))', muted: 'rgb(var(--muted))', brass: 'rgb(var(--brass))', clay: 'rgb(var(--clay))', ink: 'rgb(var(--ink))',
};
const axis = { stroke: C.muted, fontSize: 11, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, rows }: any) {
  if (!active || !payload?.length) return null;
  const d: YearPoint = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-lg">
      <p className="font-semibold text-ink">{label} · age {d.age}</p>
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

export const wealthSeries = [
  { key: 'propertyEquity' as const, label: 'Property equity', color: C.equity },
  { key: 'shares' as const, label: 'Shares', color: C.shares },
  { key: 'super' as const, label: 'Super', color: C.super },
  { key: 'cash' as const, label: 'Cash', color: C.cash },
];

export function toReal(points: YearPoint[], inflation: number): YearPoint[] {
  return points.map((p, i) => {
    const d = Math.pow(1 + inflation / 100, i);
    return { ...p, propertyEquity: p.propertyEquity / d, shares: p.shares / d, super: p.super / d, cash: p.cash / d, netWorth: p.netWorth / d, bought: p.bought ? p.bought / d : undefined };
  });
}

export function WealthChart({ points, retireYear, height = 320 }: { points: YearPoint[]; retireYear: number; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
        <defs>{wealthSeries.map((s) => (
          <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity={0.55} /><stop offset="1" stopColor={s.color} stopOpacity={0.12} /></linearGradient>
        ))}</defs>
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="2 4" />
        <XAxis dataKey="year" {...axis} interval="preserveStartEnd" minTickGap={28} />
        <YAxis {...axis} width={56} tickFormatter={(v) => money(v, { compact: true })} />
        <Tooltip content={<Tip rows={wealthSeries} />} cursor={{ stroke: C.muted, strokeDasharray: '3 3' }} />
        {wealthSeries.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} stackId="1" stroke={s.color} strokeWidth={1.5} fill={`url(#g-${s.key})`} isAnimationActive={false} />)}
        <ReferenceLine x={retireYear} stroke={C.brass} strokeDasharray="4 4" label={{ value: 'Stop work', position: 'insideTopRight', fill: C.brass, fontSize: 11 }} />
        {points.filter((p) => p.bought).map((p) => (
          <ReferenceDot key={p.year} x={p.year} y={p.propertyEquity + p.shares + p.super + p.cash} r={5} fill="rgb(var(--surface))" stroke={C.brass} strokeWidth={2}
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
