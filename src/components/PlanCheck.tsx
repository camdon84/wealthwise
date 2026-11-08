import type { PlanCheck } from '../lib/planCheck';
import { Icon } from './ui';
import { usePlanMode, usePlanProfile, usePlanUpdate } from '../lib/planContext';
import { useApp } from '../lib/store';
import { uid } from '../lib/defaults';
import { afterTax } from '../lib/calc';
import { money } from '../lib/format';

/** Friendly nudge when no retirement income has been set. Not an error: it suggests a starting figure. */
function RetireIncomeNotice() {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  if ((p.goals.passiveIncome ?? 0) > 0) return null;
  const h = p.household;
  const takeHome = afterTax((h.you.salary ?? 0) + (h.otherIncome ?? 0)) + (h.hasPartner ? afterTax(h.partner.salary ?? 0) : 0);
  const suggest = Math.max(5000, Math.round(takeHome / 5000) * 5000);
  return (
    <section className="mb-4 rounded-2xl border border-brass/50 bg-brass/10 p-4" aria-label="Retirement income not set">
      <div className="flex gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass font-display text-lg font-bold leading-none text-surface" aria-hidden="true">!</span>
        <div className="text-[15px] leading-relaxed">
          <p>Your yearly income after retirement hasn’t been set. Let’s put a value in here now so we can build the rest of your plan around it. Based on your current yearly income, why don’t you start with <strong>{money(suggest)} a year</strong>? You can always change this later.</p>
          <button className="mt-3 rounded-lg border border-brass/60 bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-brass/15" onClick={() => update((d) => { d.goals.passiveIncome = suggest; })}>Use {money(suggest)} a year</button>
          <p className="mt-2 text-[11px] text-muted">This is your current take-home pay{h.hasPartner ? ' (both of you)' : ''}, rounded to the nearest $5,000.</p>
        </div>
      </div>
    </section>
  );
}

/** "Does this plan work?" box, shared by the Goals tab and Your Wise Future. */
export function PlanCheckBox(props: { check: PlanCheck; compact?: boolean }) {
  return <><RetireIncomeNotice /><PlanCheckResult {...props} />{props.check.works && <LockNudge />}</>;
}

/** Once the plan works and nothing is flagged, suggest locking it in. Live plan only. */
function LockNudge() {
  const p = usePlanProfile();
  const mode = usePlanMode();
  const update = useApp((s) => s.update);
  if (mode !== 'live' || p.planLocked || !((p.goals.passiveIncome ?? 0) > 0)) return null;
  return (
    <section className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sky/40 bg-sky/10 p-4" aria-label="Lock your plan">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky text-surface"><Icon name="lock" className="h-4 w-4" /></span>
      <p className="min-w-0 flex-1 text-[15px] leading-relaxed">Now that your plan is complete and looks great, it’s a good time to lock it using the button in the top right corner. To try different scenarios, you can always use Forecast mode.</p>
      <button className="inline-flex items-center gap-1.5 rounded-lg border border-sky/50 bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-sky/15" onClick={() => update((d) => { d.planLocked = true; })}><Icon name="lock" className="h-4 w-4" />Lock my plan</button>
    </section>
  );
}

function PlanCheckResult({ check, compact }: { check: PlanCheck; compact?: boolean }) {
  const update = usePlanUpdate();
  if (check.works) {
    return (
      <section className={compact ? 'rounded-2xl border border-gum/40 bg-gum/10 p-4' : 'panel border-l-4 border-l-gum p-5 sm:p-6'} aria-label="Plan check">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gum text-surface"><Icon name="check" className="h-5 w-5" /></span>
          <h2 className="font-display text-lg font-semibold">This plan works on your numbers</h2>
        </div>
        <ul className="mt-3 space-y-2 text-[15px] leading-relaxed">
          {check.good.map((t) => <li key={t} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gum" aria-hidden="true" />{t}</li>)}
        </ul>
      {check.ideas.length > 0 && (
        <div className="mt-4 rounded-xl bg-raised p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">{check.works ? 'Ways to do even better' : 'Other ideas'}</p>
          <ul className="mt-2 space-y-2 text-[15px] leading-relaxed">
            {check.ideas.map((t) => (
              <li key={t.text} className="flex gap-3"><Icon name="spark" className="mt-1 h-4 w-4 shrink-0 text-brass" />
                <span>{t.text}
                  {t.liquidation && <button className="mt-2 flex items-center gap-1.5 rounded-lg border border-clay/50 bg-clay/10 px-3 py-1.5 text-sm font-semibold text-clay hover:bg-clay/20"
                    onClick={() => { const l = t.liquidation!; update((d) => { (d.liquidations ??= []).push({ id: uid(), year: new Date().getFullYear(), asset: l.asset, pct: l.pct }); }); }}>
                    <span className="font-display text-base leading-none">$</span>Add liquidation event to my plan</button>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Each idea was tested against your numbers. General information, not financial advice.</p>
        </div>
      )}
      </section>
    );
  }
  return (
    <section role="alert" className={compact ? 'rounded-2xl border border-clay/50 bg-clay/10 p-4' : 'panel border-l-4 border-l-clay p-5 sm:p-6'} aria-label="Plan check">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay text-surface"><Icon name="x" className="h-5 w-5" /></span>
        <div><h2 className="font-display text-lg font-semibold">This plan doesn’t work yet</h2><p className="text-sm text-muted">Here’s what breaks, and what would fix it.</p></div>
      </div>
      <ul className="mt-4 space-y-2 text-[15px] leading-relaxed">
        {check.problems.map((t) => <li key={t} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-clay" aria-hidden="true" />{t}</li>)}
      </ul>
      {check.fixes.length > 0 && (
        <div className="mt-4 rounded-xl bg-raised p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">We’d recommend</p>
          <ul className="mt-2 space-y-2 text-[15px] leading-relaxed">
            {check.fixes.map((t) => <li key={t} className="flex gap-3"><Icon name="arrow" className="mt-1 h-4 w-4 shrink-0 text-brass" />{t}</li>)}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Each suggestion was tested against your numbers. Change it in Goals, Property portfolio or Shares and this updates.</p>
        </div>
      )}
      {check.ideas.length > 0 && (
        <div className="mt-4 rounded-xl bg-raised p-4 ring-1 ring-line">
          <p className="text-sm font-semibold">{check.works ? 'Ways to do even better' : 'Other ideas'}</p>
          <ul className="mt-2 space-y-2 text-[15px] leading-relaxed">
            {check.ideas.map((t) => (
              <li key={t.text} className="flex gap-3"><Icon name="spark" className="mt-1 h-4 w-4 shrink-0 text-brass" />
                <span>{t.text}
                  {t.liquidation && <button className="mt-2 flex items-center gap-1.5 rounded-lg border border-clay/50 bg-clay/10 px-3 py-1.5 text-sm font-semibold text-clay hover:bg-clay/20"
                    onClick={() => { const l = t.liquidation!; update((d) => { (d.liquidations ??= []).push({ id: uid(), year: new Date().getFullYear(), asset: l.asset, pct: l.pct }); }); }}>
                    <span className="font-display text-base leading-none">$</span>Add liquidation event to my plan</button>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Each idea was tested against your numbers. General information, not financial advice.</p>
        </div>
      )}
      {check.good.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-muted">
          {check.good.map((t) => <li key={t} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gum" aria-hidden="true" />{t}</li>)}
        </ul>
      )}
    </section>
  );
}
