import { useEffect, useMemo } from 'react';
import type { Quotes } from '../lib/calc';
import { actionsNeedingUpdate, reviewDue, wiseActions, type WiseAction } from '../lib/actions';
import { money } from '../lib/format';
import { useApp, useNavIntent } from '../lib/store';
import { Icon } from '../components/ui';

const GROUPS: { id: WiseAction['group']; title: string; sub: string }[] = [
  { id: 'setup', title: 'Set up once', sub: 'The accounts your plan needs.' },
  { id: 'payday', title: 'Automate every payday', sub: 'Set these once and your plan runs itself each month.' },
  { id: 'check', title: 'Check in', sub: 'Things to keep an eye on.' },
];

/**
 * Wise Actions: turn the plan into automatic payments and accounts, with ticks.
 * Live profile only (not a forecast), and ticks aren't part of the plan, so they work when it's locked.
 */
export function WiseActions({ quotes, go }: { quotes: Quotes; go: (r: string) => void }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const { actions, flow } = useMemo(() => wiseActions(p, quotes), [p, quotes]);
  const changed = actionsNeedingUpdate(p, actions);
  const done = p.actionState?.done ?? {};
  const isDone = (a: WiseAction) => !!done[a.key] && done[a.key].sig === a.sig;
  const count = actions.filter(isDone).length;
  const due = reviewDue(p);
  const reviewed = p.actionState?.reviewedAt;
  const nextReview = reviewed ? new Date(new Date(reviewed).getTime() + 365 * 864e5) : null;

  // Start the yearly review clock the first time someone opens this page
  useEffect(() => { if (!p.actionState?.reviewedAt) update((d) => { (d.actionState ??= {}).reviewedAt = new Date().toISOString().slice(0, 10); }); }, [p.actionState?.reviewedAt, update]);

  const toggle = (a: WiseAction, on: boolean) => update((d) => {
    const s = ((d.actionState ??= {}).done ??= {});
    if (on) s[a.key] = { at: new Date().toISOString().slice(0, 10), sig: a.sig }; else delete s[a.key];
  });
  const markReviewed = () => update((d) => { (d.actionState ??= {}).reviewedAt = new Date().toISOString().slice(0, 10); });
  const toPlan = () => { useNavIntent.getState().set({ planTab: 'goals' }); go('plan'); };

  const legs = [
    { label: 'Everyday spending', v: flow.living, cls: 'bg-muted/50' },
    { label: 'Loan repayments and bills', v: flow.bills, cls: 'bg-clay/60' },
    { label: 'Shares', v: flow.shares, cls: 'bg-sky' },
    { label: 'Offset', v: flow.offset, cls: 'bg-gum' },
    { label: 'High-interest savings', v: flow.hisa, cls: 'bg-brass' },
    { label: 'Savings account', v: flow.everyday, cls: 'bg-brass/50' },
  ].filter((x) => x.v > 0);
  const total = Math.max(1, legs.reduce((t, x) => t + x.v, 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Wise Actions</h1>
          <p className="mt-1 max-w-2xl text-muted">Set up your accounts and automatic payments so your Wise Plan happens on its own. Tick each one off as you do it.</p>
        </div>
        <div className="text-right"><p className="font-display text-3xl font-semibold">{count}<span className="text-lg text-muted"> / {actions.length}</span></p><p className="text-xs text-muted">set up</p></div>
      </div>

      {changed.length > 0 && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-clay/50 bg-clay/10 p-4" role="alert">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay font-display text-lg font-bold text-white">!</span>
          <p className="min-w-0 flex-1">Your Wise Plan has changed since you set {changed.length === 1 ? 'this one' : `these ${changed.length}`} up. Update {changed.length === 1 ? 'it' : 'them'} with your bank or broker, then tick {changed.length === 1 ? 'it' : 'them'} again: <strong>{changed.map((a) => a.title).join('; ')}</strong>.</p>
        </section>
      )}

      <section className={`flex flex-wrap items-center gap-4 rounded-2xl p-4 ring-1 ${due ? 'bg-brass/15 ring-brass/50' : 'bg-raised ring-line'}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${due ? 'bg-brass text-ground' : 'bg-surface text-muted ring-1 ring-line'}`}><Icon name="calendar" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{due ? 'It’s time for your yearly review' : 'Review your plan at least once a year'}</p>
          <p className="text-sm text-muted">{due
            ? 'Check your goals and figures are still right, then come back here and update any automatic payments that changed.'
            : `We’ll remind you when it’s due${nextReview ? `, around ${nextReview.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}` : ''}. Pay rises, a new property or a change in rates are good reasons to review sooner.`}</p>
        </div>
        <div className="flex gap-2">
          {due && <button className="btn-quiet" onClick={toPlan}>Open my Wise Plan</button>}
          <button className={due ? 'btn-primary' : 'btn-quiet'} onClick={markReviewed}><Icon name="check" className="h-4 w-4" />I’ve reviewed my plan</button>
        </div>
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Where your pay goes each month</h2>
        <p className="mt-1 text-sm text-muted">About <strong className="text-ink">{money(flow.takeHome)}</strong> take-home a month after tax, split the way your Wise Plan and Cash Reserves need it.</p>
        <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full ring-1 ring-line" aria-hidden="true">
          {legs.map((x) => <div key={x.label} className={x.cls} style={{ width: `${(x.v / total) * 100}%` }} />)}
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {legs.map((x) => (
            <li key={x.label} className="flex items-center gap-3 rounded-xl bg-raised p-3 ring-1 ring-line">
              <span className={`h-3 w-3 shrink-0 rounded-full ${x.cls}`} />
              <span className="min-w-0 flex-1 text-sm">{x.label}</span>
              <span className="font-display font-semibold tabular-nums">{money(x.v)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted">From your current income, living expenses, loans and plan. Monthly amounts, rounded to the nearest $10. If your pay comes fortnightly, halve them and add a little.</p>
      </section>

      {GROUPS.map((g) => {
        const list = actions.filter((a) => a.group === g.id);
        if (!list.length) return null;
        return (
          <section key={g.id} className="panel p-5 sm:p-6">
            <h2 className="font-display text-xl font-semibold">{g.title}</h2>
            <p className="text-sm text-muted">{g.sub}</p>
            <ul className="mt-4 divide-y divide-line">
              {list.map((a) => {
                const ok = isDone(a);
                const stale = !!done[a.key] && !ok;
                return (
                  <li key={a.key} className="flex gap-4 py-4">
                    <input type="checkbox" aria-label={a.title} className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--gum))]" checked={ok} onChange={(e) => toggle(a, e.target.checked)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className={`font-medium ${ok ? 'text-muted line-through decoration-muted/50' : ''}`}>{a.title}</p>
                        {a.amount && <p className={`font-display text-lg font-semibold tabular-nums ${ok ? 'text-muted' : ''}`}>{a.amount}</p>}
                      </div>
                      {stale && <p className="mt-1 text-sm font-medium text-clay">Your plan changed: update this with your bank or broker, then tick it again.</p>}
                      {!ok && <p className="mt-1 text-sm leading-relaxed text-muted">{a.body}</p>}
                      {!ok && a.links && <div className="mt-2 flex flex-wrap gap-2">{a.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 text-xs font-medium text-brass ring-1 ring-brass/40 hover:bg-brass/10">{l.label} ↗</a>)}</div>}
                      {ok && <p className="mt-0.5 text-xs text-muted">Done {new Date(`${done[a.key].at}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="text-[11px] text-muted">Banks and products are named because they’re widely compared, not as recommendations, and WealthWise isn’t paid by any of them. Check current rates and conditions with the provider. General information, not financial advice.</p>
    </div>
  );
}
