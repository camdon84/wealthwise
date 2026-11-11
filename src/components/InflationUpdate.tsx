import { useEffect, useMemo, useState } from 'react';
import { useApp, useNavIntent } from '../lib/store';
import { monthsBetween, periodLabel, useCpi, yearBefore, type Cpi } from '../lib/cpi';
import { money } from '../lib/format';
import type { Profile } from '../lib/types';
import { Icon } from './ui';

/** Round an indexed figure to something a person would type. */
const tidy = (v: number) => (v < 2000 ? Math.round(v / 10) * 10 : v < 200000 ? Math.round(v / 100) * 100 : Math.round(v / 1000) * 1000);

type Item = { key: string; label: string; old: number; next: number; unit: string; apply: (d: Profile, v: number) => void };

/** The plan figures that are in "today's money" and should move with prices. Gifts and liquidation events don't. */
function indexItems(p: Profile, m: number): Item[] {
  const g = p.goals;
  const out: Item[] = [];
  const add = (key: string, label: string, old: number | null | undefined, unit: string, apply: Item['apply']) => {
    if (old != null && old > 0) out.push({ key, label, old, next: tidy(old * m), unit, apply });
  };
  add('income', 'Yearly income after retirement', g.passiveIncome, 'a year', (d, v) => { d.goals.passiveIncome = v; });
  add('shareMonthly', 'Monthly investment into shares', g.shareMonthly, 'a month', (d, v) => { d.goals.shareMonthly = v; });
  add('sharesTarget', 'Share portfolio goal at retirement', g.sharesTarget, '', (d, v) => { d.goals.sharesTarget = v; });
  add('retireCash', 'Accessible cash reserves in retirement', g.retireCash, '', (d, v) => { d.goals.retireCash = v; });
  for (const ev of g.events ?? []) add(`big:${ev.id}`, `Big purchase, ${ev.label || 'unnamed'}`, ev.amount, '', (d, v) => { const x = d.goals.events.find((y) => y.id === ev.id); if (x) x.amount = v; });
  (p.plannedPurchases ?? []).forEach((pp, k) => add(`buy:${pp.id}`, `Purchase price, ${pp.label || `property ${p.properties.length + k + 1}`}`, pp.price, '', (d, v) => { const x = d.plannedPurchases?.find((y) => y.id === pp.id); if (x) x.price = v; }));
  return out;
}

/**
 * Once a year, when the ABS releases the CPI, a locked plan's "today's money" figures fall behind prices.
 * This offers to move them up by exactly what prices did since the plan was locked. Each one can be kept as is.
 */
export function InflationUpdate() {
  const p = useApp((s) => s.profile)!;
  const session = useApp((s) => s.session);
  const update = useApp((s) => s.update);
  const cpi = useCpi();
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState(false);

  // Baseline: the quarter the plan's figures belong to. Set when we first see a locked plan.
  // The demo starts a year back so visitors can see the update straight away.
  useEffect(() => {
    if (!cpi || !p.planLocked || p.cpiBase) return;
    const base = session?.demo ? yearBefore(cpi) : cpi.latest;
    update((d) => { d.cpiBase = { period: base.period, index: base.index }; });
  }, [cpi, p.planLocked, p.cpiBase, session?.demo, update]);

  const due = !!(cpi && p.planLocked && p.cpiBase && monthsBetween(p.cpiBase.period, cpi.latest.period) >= 12);
  const m = due ? cpi!.latest.index / p.cpiBase!.index : 1;
  const items = useMemo(() => (due ? indexItems(p, m) : []), [due, p, m]);
  if (!due || done) return null;
  const c = cpi as Cpi;
  const months = monthsBetween(p.cpiBase!.period, c.latest.period);
  const pct = months === 12 ? c.latest.annual : Math.round((m - 1) * 1000) / 10;

  const finish = (apply: boolean) => {
    const now = new Date().toISOString().slice(0, 10);
    update((d) => {
      const updated: string[] = [], kept: string[] = [];
      for (const it of items) {
        if (apply && !keep[it.key]) { it.apply(d, it.next); updated.push(it.label); } else kept.push(it.label);
      }
      d.cpiBase = { period: c.latest.period, index: c.latest.index };
      (d.cpiLog ??= []).push({ period: c.latest.period, annual: pct, at: now, updated, kept });
    });
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="cpi-h">
      <div className="paper max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass text-ground"><Icon name="spark" className="h-5 w-5" /></span>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-brass">Inflation update</p><h2 id="cpi-h" className="font-display text-xl font-semibold">Prices rose {pct}% {months === 12 ? 'over the last 12 months' : `since you locked your plan`}</h2></div>
        </div>
        <p className="mt-4 leading-relaxed">
          The government has just announced inflation for the {months === 12 ? '12 months' : `${months} months`} to {periodLabel(c.latest.period)}. It came back at <strong>{pct}%</strong>.
          In order to keep your plan and financial modelling up to date, things like the purchase price of your properties (in today’s money), as well as your monthly investment into shares, need to be updated to continue to align with your retirement outcomes. Here are your new figures.
        </p>
        {items.length > 0 ? (
          <div className="mt-5 overflow-hidden rounded-xl ring-1 ring-line">
            <table className="w-full text-sm">
              <thead className="bg-raised text-xs text-muted"><tr><th className="px-4 py-2 text-left font-medium">In your plan</th><th className="px-3 py-2 text-right font-medium">Was</th><th className="px-3 py-2 text-right font-medium">New</th><th className="px-4 py-2 text-right font-medium">Update</th></tr></thead>
              <tbody className="divide-y divide-line">
                {items.map((it) => (
                  <tr key={it.key} className={keep[it.key] ? 'text-muted' : ''}>
                    <td className="px-4 py-2.5">{it.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{money(it.old)}{it.unit && <span className="text-xs text-muted"> {it.unit}</span>}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${keep[it.key] ? 'line-through' : 'text-gum'}`}>{money(it.next)}</td>
                    <td className="px-4 py-2.5 text-right"><input type="checkbox" aria-label={`Update ${it.label}`} className="h-4 w-4 accent-[rgb(var(--brass))]" checked={!keep[it.key]} onChange={(e) => setKeep((k) => ({ ...k, [it.key]: !e.target.checked }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-4 text-sm text-muted">Nothing in your plan needs updating this time.</p>}
        <p className="mt-3 text-xs leading-relaxed text-muted">Untick anything you’d rather leave as it is. That’s fine, but your retirement figures will shift a little, and you’ll see that in Your Wise Future. Gifts, inheritances and liquidation events stay exactly as you entered them. Source: Australian Bureau of Statistics consumer price index{c.released ? `, released ${new Date(`${c.released}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button className="btn-quiet" onClick={() => finish(false)}>Keep all my current figures</button>
          <button className="btn-primary" onClick={() => { finish(true); }}>{items.some((it) => keep[it.key]) ? 'Update the ticked figures' : 'Update my plan'}</button>
        </div>
        <button className="mt-3 block w-full text-right text-xs text-muted underline hover:text-ink" onClick={() => { finish(true); useNavIntent.getState().set({ planTab: 'projections' }); location.hash = 'plan'; }}>Update and see Your Wise Future</button>
      </div>
    </div>
  );
}
