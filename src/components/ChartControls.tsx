import type { ReactNode } from 'react';
import { usePlanProfile } from '../lib/planContext';
import { Segmented } from './ui';

export type Dollars = 'real' | 'nominal';

export function DollarsToggle({ value, onChange, stretch }: { value: Dollars; onChange: (v: Dollars) => void; stretch?: boolean }) {
  return <Segmented size="sm" stretch={stretch} label="Show values in" value={value} onChange={onChange} options={[{ value: 'real', label: 'Today’s money' }, { value: 'nominal', label: 'Future money' }]} />;
}

export function DollarsNote({ value }: { value: Dollars }) {
  const p = usePlanProfile();
  const inf = p.assumptions.inflation;
  return value === 'real'
    ? <>Shown in <strong className="font-medium text-ink">today’s money</strong>: every year is adjusted for {inf}% a year inflation, so a figure means what it would buy now.</>
    : <>Shown in <strong className="font-medium text-ink">future money</strong>: each year is in that year’s own dollars, before inflation is taken out, so later figures look bigger than they’ll feel.</>;
}

/**
 * The row straight above a chart: the series tick boxes on the left, today's or future money on the right.
 * On a phone the money toggle runs full width above the tick boxes, so nothing lands in an odd spot and the chart keeps its full width.
 */
export function ChartToolbar({ dollars, setDollars, series }: { dollars: Dollars; setDollars: (v: Dollars) => void; series?: ReactNode }) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="flex sm:order-2">
        <DollarsToggle value={dollars} onChange={setDollars} stretch />
      </div>
      <div className="min-w-0">{series}</div>
    </div>
  );
}
