import { useApp } from '../lib/store';
import { Segmented } from './ui';

export type Dollars = 'real' | 'nominal';

export function DollarsToggle({ value, onChange }: { value: Dollars; onChange: (v: Dollars) => void }) {
  return <Segmented size="sm" label="Show values in" value={value} onChange={onChange} options={[{ value: 'real', label: 'Today’s money' }, { value: 'nominal', label: 'Future money' }]} />;
}

export function DollarsNote({ value }: { value: Dollars }) {
  const p = useApp((s) => s.profile)!;
  const inf = p.assumptions.inflation;
  return value === 'real'
    ? <>Shown in <strong className="font-medium text-ink">today’s money</strong>: every year is adjusted for {inf}% a year inflation, so a figure means what it would buy now.</>
    : <>Shown in <strong className="font-medium text-ink">future money</strong>: each year is in that year’s own dollars, before inflation is taken out, so later figures look bigger than they’ll feel.</>;
}

export function LiveToAge() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const v = p.goals.lifeExpectancy ?? 90;
  const min = Math.max((p.household.you.age ?? 30) + 5, p.goals.retirementAge + 1);
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      I’m planning to live to
      <select className="rounded-lg border border-line bg-raised px-2 py-1 text-sm font-medium text-ink focus:border-brass focus:outline-none" value={v} onChange={(e) => update((d) => { d.goals.lifeExpectancy = Number(e.target.value); })}>
        {Array.from({ length: 111 - min }, (_, i) => min + i).filter((a) => a <= 110).map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
    </label>
  );
}
