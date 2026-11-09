import type { ReactNode } from 'react';
import { usePlanProfile } from '../lib/planContext';
import { Segmented } from './ui';

export type Dollars = 'real' | 'nominal';

export function DollarsToggle({ value, onChange, stretch, size = 'sm' }: { value: Dollars; onChange: (v: Dollars) => void; stretch?: boolean; size?: 'xs' | 'sm' }) {
  return <Segmented size={size} stretch={stretch} label="Show values in" value={value} onChange={onChange} options={[{ value: 'real', label: 'Today’s money' }, { value: 'nominal', label: 'Future money' }]} />;
}

export function DollarsNote({ value }: { value: Dollars }) {
  const p = usePlanProfile();
  const inf = p.assumptions.inflation;
  return value === 'real'
    ? <>Shown in <strong className="font-medium text-ink">today’s money</strong>: every year is adjusted for {inf}% a year inflation, so a figure means what it would buy now.</>
    : <>Shown in <strong className="font-medium text-ink">future money</strong>: each year is in that year’s own dollars, before inflation is taken out, so later figures look bigger than they’ll feel.</>;
}

/**
 * The series tick boxes for the top-right of the chart panel, with the hint underneath. Pages put it in a wrapping row
 * beside the headline figure, so it sits top right when there's room and drops neatly under the figure when there isn't.
 */
export function ChartToolbar({ series }: { series?: ReactNode }) {
  if (!series) return null;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      {series}
      <p className="text-[11px] text-muted">Tick to show or hide. Your plan doesn’t change.</p>
    </div>
  );
}

/** Under the chart: its key on the left, a small today's/future money toggle (the size of Net worth / Cash flow) bottom right. */
export function ChartFooter({ dollars, setDollars, children }: { dollars: Dollars; setDollars: (v: Dollars) => void; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-[min(100%,18rem)] flex-1">{children}</div>
      <div className="ml-auto mt-2"><DollarsToggle value={dollars} onChange={setDollars} size="xs" /></div>
    </div>
  );
}
