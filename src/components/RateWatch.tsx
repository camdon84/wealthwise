import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { longDate, useCashRate } from '../lib/rates';
import { Icon, NumInput } from './ui';

/** When the RBA moves the cash rate, ask the user to confirm the new rate on each variable loan. */
export function RateWatch() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const rba = useCashRate();
  const variable = useMemo(() => p.properties.flatMap((pr) => pr.loans.filter((l) => (l.rateType ?? 'variable') === 'variable' && l.rate && (l.balance ?? 0) > 0).map((l) => ({ pr, l }))), [p.properties]);
  const [edits, setEdits] = useState<Record<string, number | null>>({});

  // First time we see the cash rate for this profile, record it as the starting point (no prompt).
  useEffect(() => {
    if (rba && !p.rateWatch) update((d) => { d.rateWatch = { cashRate: rba.current, date: rba.effective }; });
  }, [rba, p.rateWatch, update]);

  if (!rba || !p.rateWatch || p.rateWatch.cashRate === rba.current || !variable.length) return null;
  const delta = Math.round((rba.current - p.rateWatch.cashRate) * 100) / 100;
  const up = delta > 0;
  const suggested = (rate: number) => Math.round((rate + delta) * 100) / 100;
  const close = (apply: boolean) => update((d) => {
    if (apply) for (const pr of d.properties) for (const l of pr.loans) if (l.id in edits || variable.some((v) => v.l.id === l.id)) l.rate = edits[l.id] ?? suggested(l.rate ?? 0);
    d.rateWatch = { cashRate: rba.current, date: rba.effective };
  });

  return (
    <section className="panel overflow-hidden" aria-labelledby="rate-h">
      <div className={`h-1 ${up ? 'bg-clay' : 'bg-gum'}`} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${up ? 'bg-clay/15 text-clay' : 'bg-gum/15 text-gum'}`}><Icon name="shares" /></span>
          <div>
            <h2 id="rate-h" className="font-display text-xl font-semibold">The RBA {up ? 'raised' : 'cut'} the cash rate by {Math.abs(delta).toFixed(2)}%</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">It moved from {p.rateWatch.cashRate.toFixed(2)}% to {rba.current.toFixed(2)}% on {longDate(rba.effective)}. Lenders usually pass this on to variable rates within a few weeks. We’ve estimated your new rates below. Check them against your lender’s email, change any that differ, then confirm.</p>
          </div>
        </div>
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {variable.map(({ pr, l }) => (
            <li key={l.id} className="grid items-center gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
              <div><p className="font-medium">{pr.address}</p><p className="text-sm text-muted">{l.lender || 'Home loan'} · variable · was {(l.rate ?? 0).toFixed(2)}%</p></div>
              <Icon name="arrow" className="hidden h-4 w-4 text-muted sm:block" />
              <div className="w-40"><NumInput value={edits[l.id] ?? suggested(l.rate ?? 0)} onChange={(v) => setEdits({ ...edits, [l.id]: v })} step={0.01} suffix="% p.a." /></div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => close(true)}>Confirm new rates</button>
          <button className="btn-quiet" onClick={() => close(false)}>My rates haven’t changed</button>
        </div>
        <p className="mt-3 text-[11px] text-muted">Cash rate from the Reserve Bank of Australia’s published series. Fixed-rate loans aren’t affected until their fixed term ends.</p>
      </div>
    </section>
  );
}
