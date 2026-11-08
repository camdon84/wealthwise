import type { PlanCheck } from '../lib/planCheck';
import { Icon } from './ui';
import { usePlanMode, usePlanProfile, usePlanUpdate } from '../lib/planContext';
import { useApp } from '../lib/store';
import { useEffect, useState } from 'react';
import type { PlanIdea } from '../lib/planCheck';
import { notWorkIdea } from '../lib/insights';
import { uid } from '../lib/defaults';
import { afterTax } from '../lib/calc';
import { CGT_2027_NOTE, money } from '../lib/format';

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
  return <><RetireIncomeNotice />{props.check.works && <LockNudge />}<PlanCheckResult {...props} /></>;
}

/** Once the plan works and nothing is flagged, suggest locking it in. Live plan only. */
function LockNudge() {
  const p = usePlanProfile();
  const mode = usePlanMode();
  const update = useApp((s) => s.update);
  if (mode !== 'live' || p.planLocked || !((p.goals.passiveIncome ?? 0) > 0)) return null;
  return (
    <section className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sky/40 bg-sky/10 p-4" aria-label="Lock your plan">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky text-surface"><Icon name="lock" className="h-4 w-4" /></span>
      <p className="min-w-0 flex-1 text-[15px] leading-relaxed">Now that your plan is complete, it’s a good time to lock it in. To try different scenarios, you can always use Forecast mode.</p>
      <button className="inline-flex items-center gap-1.5 rounded-lg border border-sky/50 bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-sky/15" onClick={() => update((d) => { d.planLocked = true; d.cpiBase = undefined; })}><Icon name="lock" className="h-4 w-4" />Lock my plan</button>
    </section>
  );
}

function PlanCheckResult({ check, compact }: { check: PlanCheck; compact?: boolean }) {
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
      <PlanIdeas check={check} />
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
          <p className="mt-3 text-[11px] text-muted">Each suggestion was tested against your numbers. Change it in Goals, Property Portfolio or Shares and this updates.</p>
        </div>
      )}
      <PlanIdeas check={check} />
      {check.good.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-muted">
          {check.good.map((t) => <li key={t} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gum" aria-hidden="true" />{t}</li>)}
        </ul>
      )}
    </section>
  );
}

const live = (import.meta as any).env?.VITE_STORAGE === 'api';
const SIX_MONTHS = 182 * 864e5;
let autoAsked = false; // one automatic refresh per visit
/** Ideas are matched without their figures, so one that's been dismissed stays dismissed when the numbers move a little. */
const ideaKey = (t: string) => t.replace(/[\d$,.%]+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();

/** "Have you thought about these options?": tested ideas plus Wise's AI ideas, each dismissable for 6 months. */
function PlanIdeas({ check }: { check: PlanCheck }) {
  const p = usePlanProfile();
  const planUpdate = usePlanUpdate();
  const update = useApp((s) => s.update); // dismissals are a preference, not part of the plan, so they work when it's locked
  const st = useApp((s) => s.profile?.planIdeas);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const now = Date.now();
  const hidden = (k: string) => { const d = st?.dismissed?.[k]; return !!(d && now - d < SIX_MONTHS && d > (st?.refreshedAt ?? 0)); };
  // At most 6 at a time: Wise's newest first, then tested ideas, keeping one liquidation idea if there is one
  const MAX = 6;
  const allTested = check.ideas.filter((t) => !hidden(ideaKey(t.text)));
  const ai = (st?.ai ?? []).filter((x) => !hidden(`ai:${x.id}`) && notWorkIdea(x)).slice(0, 3);
  let tested = allTested.slice(0, Math.max(0, MAX - ai.length));
  const liq = allTested.find((t) => t.liquidation);
  if (liq && !tested.includes(liq)) tested = [...tested.slice(0, Math.max(0, tested.length - 1)), liq];
  if (liq && !tested.length) tested = [liq];
  const dismiss = (k: string) => update((d) => { ((d.planIdeas ??= {}).dismissed ??= {})[k] = Date.now(); });

  const generate = async () => {
    setBusy(true); setNote('');
    const t = Date.now();
    let fresh: { id: string; title: string; body: string; at: number }[] = [];
    if (live) {
      const facts = {
        wealthFocus: p.goals.wealthFocus ?? 'balanced',
        goal: { stopWorkAge: p.goals.retirementAge, incomeWantedTodayDollars: p.goals.passiveIncome, propertiesWanted: p.goals.targetProperties, sharePortfolioWantedTodayDollars: p.goals.sharesTarget ?? null, shareInvestmentPerMonth: p.goals.shareMonthly ?? null },
        planWorks: check.works, problems: check.problems, testedFixes: check.fixes, whatWorks: check.good,
        ideasAlreadyShown: [...check.ideas.map((x) => x.text), ...(st?.ai ?? []).map((x) => x.title)],
      };
      const r = await fetch(`/api/wise?mode=ideas&fresh=${t}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(facts) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      fresh = (r?.ideas ?? []).filter(notWorkIdea).map((i: { title: string; body: string }, k: number) => ({ id: `${t}-${k}`, title: i.title, body: i.body, at: t }));
      if (!fresh.length) setNote('Wise couldn’t come up with anything new just now. Try again in a moment.');
    } else setNote('In the live app, Wise also writes new ideas for your plan here.');
    update((d) => {
      const s = (d.planIdeas ??= {});
      s.refreshedAt = t; // brings back anything dismissed
      s.ai = [...fresh, ...(s.ai ?? [])].slice(0, 6); // newest first; older ones drop off the end
    });
    setBusy(false);
  };

  // Fresh ideas every 6 months (or the first time), if they haven't asked for some recently
  useEffect(() => {
    if (!live || autoAsked || busy) return;
    if (st?.refreshedAt && Date.now() - st.refreshedAt < SIX_MONTHS) return;
    autoAsked = true;
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLiquidation = (t: PlanIdea) => { const l = t.liquidation!; planUpdate((d) => { (d.liquidations ??= []).push({ id: uid(), year: new Date().getFullYear(), asset: l.asset, pct: l.pct }); }); };
  const Dismiss = ({ k }: { k: string }) => <button className="ml-auto shrink-0 self-start rounded-md px-2 py-0.5 text-xs text-muted ring-1 ring-line hover:text-ink" onClick={() => dismiss(k)} title="Hide this idea for 6 months">Dismiss</button>;

  return (
    <div className="mt-4 rounded-xl bg-raised p-4 ring-1 ring-line">
      <p className="text-sm font-semibold">Have you thought about these options?</p>
      {tested.length + ai.length === 0 ? <p className="mt-2 text-sm text-muted">No ideas to show right now.</p> : (
        <ul className={`mt-2 space-y-3 text-[15px] leading-relaxed transition-opacity ${busy ? 'opacity-40' : ''}`}>
          {ai.slice(0, MAX - tested.length).map((x) => (
            <li key={x.id} className="flex gap-3"><Icon name="spark" className="mt-1 h-4 w-4 shrink-0 text-brass" />
              <span><span className="mr-1.5 rounded bg-brass/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brass">Wise</span><span className="font-medium">{x.title}.</span> <span className="text-muted">{x.body}</span></span>
              <Dismiss k={`ai:${x.id}`} />
            </li>
          ))}
          {tested.map((t) => (
            <li key={t.text} className="flex gap-3"><Icon name="spark" className="mt-1 h-4 w-4 shrink-0 text-brass" />
              <span>{t.text}
                {t.liquidation && <button className="mt-2 flex items-center gap-1.5 rounded-lg border border-clay/50 bg-clay/10 px-3 py-1.5 text-sm font-semibold text-clay hover:bg-clay/20" onClick={() => addLiquidation(t)}>
                  <span className="font-display text-base leading-none">$</span>Add liquidation event to my plan</button>}
              </span>
              <Dismiss k={ideaKey(t.text)} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-[11px] text-muted">Ideas with figures were tested against your numbers; Wise’s are written by AI. General information, not financial advice.{tested.some((t) => t.liquidation) && ` ${CGT_2027_NOTE}`}</p>
        <button onClick={generate} disabled={busy} className="group inline-flex items-center gap-2 rounded-xl border border-brass/60 bg-brass/10 px-3.5 py-2 text-sm font-semibold text-brass transition-all hover:bg-brass/20 disabled:opacity-60">
          <Icon name="spark" className={`h-4 w-4 ${busy ? 'animate-spin' : 'transition-transform group-hover:rotate-45'}`} />{busy ? 'Thinking about your plan…' : 'Give me Wise ideas about my plan'}
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-muted" role="status">{note}</p>}
    </div>
  );
}
