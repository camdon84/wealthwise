import { SpareCash } from '../components/SpareCash';
import { useEffect, useMemo, useState } from 'react';
import { useApp, useNavIntent } from '../lib/store';
import { applySnapshot, newForecast, PlanProvider, snapshot, useForecast, usePlanMode, usePlanProfile, usePlanUpdate, type PlanCtx } from '../lib/planContext';
import { CHILD_COST_YEAR, RETIRE_CASH_PER_PERSON, retireCashMin, pmt, position, project, propertyStats, recommendedBuffer, requiredShareMonthly, monthlyForShareGoal, type Quotes } from '../lib/calc';
import { holdingValue, liquidationEstimate, maxShareMonthly, planCheck, propertyValueIn } from '../lib/planCheck';
import { PlanCheckBox } from '../components/PlanCheck';
import { CashTab } from './CashTab';
import { WealthFocusPicker } from '../components/WealthFocus';
import { wiseInsights } from '../lib/insights';
import { CGT_2027_NOTE, money, nProps } from '../lib/format';
import { plannedPurchase, uid } from '../lib/defaults';
import { useCashRate } from '../lib/rates';
import type { Assumptions, Forecast, Gift, Liquidation, PlanSnapshot, PlannedPurchase, Profile, Property } from '../lib/types';
import { CashFlowChart, CashFlowKey, MarkerKey, SeriesToggles, WealthChart, toReal } from '../components/Charts';
import { ChartFooter, ChartToolbar } from '../components/ChartControls';
import { useWiseTake } from '../components/Assistants';
import { Field, Icon, MoneyInput, NumInput, Segmented, Select, TextInput, Toggle } from '../components/ui';

type Tab = 'goals' | 'assumptions' | 'timeline' | 'shares' | 'cash' | 'liquidations' | 'gifts' | 'projections';

export function Plan({ quotes }: { quotes: Quotes }) {
  const [tab, setTab] = useState<Tab>(() => { const t = useNavIntent.getState().planTab as Tab | null; useNavIntent.getState().set({ planTab: null }); return t ?? 'goals'; });
  const live = useApp((s) => s.profile)!;
  const liveUpdate = useApp((s) => s.update);
  const fc = useForecast();
  const forecasting = fc.mode === 'forecast' && fc.draft != null;
  const locked = !forecasting && !!live.planLocked;
  const [ask, setAsk] = useState<null | { then?: (p: Profile) => void }>(null);
  const ctx: PlanCtx = forecasting
    ? { profile: fc.draft!, update: fc.edit, mode: 'forecast', locked: false }
    : { profile: live, update: (fn) => (locked ? setAsk({ then: fn }) : liveUpdate(fn)), mode: 'live', locked };
  const startForecast = () => {
    if (!fc.draft) fc.set({ draft: structuredClone(live), name: '', sourceId: null });
    fc.set({ mode: 'forecast' });
  };
  const editable = tab !== 'projections';
  return (
    <PlanProvider value={ctx}>
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex rounded-lg border border-line bg-surface/5 p-0.5" role="radiogroup" aria-label="Plan mode">
            {(['live', 'forecast'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={(forecasting ? 'forecast' : 'live') === m} onClick={() => (m === 'live' ? fc.set({ mode: 'live' }) : startForecast())}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${(forecasting ? 'forecast' : 'live') === m ? (m === 'live' ? 'bg-gum text-surface' : 'bg-sky text-surface') : 'text-muted hover:text-ink'}`}>
                {m === 'live' ? 'Live plan' : 'Forecast'}
              </button>
            ))}
          </div>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{forecasting ? 'Forecast' : 'Your plan'}</h1>
          <p className="text-muted">{forecasting ? 'Try changes here without touching your live plan. Save it, or make it your new Wise Future.' : 'Set your goals, check the assumptions and see how it plays out.'}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 min-[1400px]:flex-nowrap" role="tablist" aria-label="Plan section">
          <Segmented scroll label="Plan section" value={tab === 'projections' ? ('' as Tab) : tab} onChange={setTab} options={[{ value: 'goals', label: 'Goals' }, { value: 'assumptions', label: 'Assumptions' }, { value: 'timeline', label: 'Property Portfolio' }, { value: 'shares', label: 'Shares' }, { value: 'cash', label: 'Cash Reserves' }, { value: 'liquidations', label: 'Liquidation Events' }, { value: 'gifts', label: 'Gifts' }]} />
          <button role="tab" aria-selected={tab === 'projections'} onClick={() => setTab('projections')}
            className={`group inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all sm:flex-none ${tab === 'projections'
              ? 'bg-brass text-ground shadow-[0_6px_20px_-6px_rgb(var(--brass)/0.7)] ring-2 ring-brass/40'
              : 'border border-brass/60 bg-brass/10 text-brass hover:bg-brass/20 hover:shadow-[0_4px_16px_-6px_rgb(var(--brass)/0.6)]'}`}>
            <Icon name="spark" className={`h-4 w-4 ${tab === 'projections' ? '' : 'transition-transform group-hover:rotate-45'}`} />{forecasting ? 'Forecast Future' : 'Your Wise Future'}
          </button>
          {!forecasting && (
            <button onClick={() => (locked ? setAsk({}) : liveUpdate((d) => { d.planLocked = true; d.cpiBase = undefined; }))} title={locked ? 'Your plan is locked. Click to unlock.' : 'Lock your plan so it can’t be changed by accident'}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold ${locked ? 'bg-ink text-surface' : 'border border-line text-muted hover:text-ink'}`}>
              <Icon name={locked ? 'lock' : 'unlock'} className="h-4 w-4" />{locked ? 'Plan locked' : 'Lock my plan'}
            </button>
          )}
        </div>
      </div>

      {forecasting && <ForecastBar />}
      {locked && editable && <p className="flex items-center gap-2 rounded-xl border border-line bg-raised/40 px-4 py-2.5 text-sm text-muted"><Icon name="lock" className="h-4 w-4" />Your Wise Future plan is locked. Switch to Forecast to try changes, or click Locked to unlock.</p>}

      <div className={locked && editable ? 'plan-locked' : ''} onMouseDownCapture={(e) => {
        if (!locked || !editable) return;
        const t = e.target as HTMLElement;
        if (t.closest('input, select, textarea, button, label, [role=radio]') && !t.closest('[data-free]')) { e.preventDefault(); e.stopPropagation(); setAsk({}); }
      }} onKeyDownCapture={(e) => { if (locked && editable && (e.target as HTMLElement).closest('input, select, textarea')) { e.preventDefault(); setAsk({}); } }}>
        {tab === 'goals' && <Goals quotes={quotes} go={setTab} />}
        {tab === 'assumptions' && <AssumptionsTab />}
        {tab === 'timeline' && <Timeline quotes={quotes} onGoals={() => setTab('goals')} />}
        {tab === 'shares' && <SharesPlan quotes={quotes} onGoals={() => setTab('goals')} />}
        {tab === 'cash' && <CashTab quotes={quotes} onGo={(t) => setTab(t)} />}
        {tab === 'liquidations' && <LiquidationsTab quotes={quotes} />}
        {tab === 'gifts' && <GiftsTab />}
      </div>
      {tab === 'projections' && <Projections quotes={quotes} />}

      {ask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="lock-h" onClick={() => setAsk(null)}>
          <div className="paper w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-surface"><Icon name="lock" className="h-5 w-5" /></span><h2 id="lock-h" className="font-display text-xl font-semibold">Your plan is locked</h2></div>
            <p className="mt-4 leading-relaxed">Your Wise Future plan has been locked in. If you want to play with the variables, try doing a forecast. Changing live variables can affect your plan in real time.</p>
            <p className="mt-3 font-medium">Do you want to unlock it?</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button className="btn-quiet" onClick={() => { setAsk(null); startForecast(); }}>Try a forecast instead</button>
              <button className="btn-quiet" onClick={() => setAsk(null)}>No</button>
              <button className="btn-primary" onClick={() => { const then = ask.then; liveUpdate((d) => { d.planLocked = false; d.cpiBase = undefined; if (then) then(d); }); setAsk(null); }}>Yes, unlock</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PlanProvider>
  );
}

/** Forecast controls: name and save the draft, make it live, or open a saved one. */
function ForecastBar() {
  const fc = useForecast();
  const live = useApp((s) => s.profile)!;
  const liveUpdate = useApp((s) => s.update);
  const [confirm, setConfirm] = useState<null | { name: string; plan: PlanSnapshot }>(null);
  const [saved, setSaved] = useState('');
  const list = live.forecasts ?? [];
  const save = () => {
    const name = fc.name.trim() || `Forecast ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
    const f = newForecast(name, fc.draft!);
    liveUpdate((d) => {
      d.forecasts ??= [];
      const i = fc.sourceId ? d.forecasts.findIndex((x) => x.id === fc.sourceId && x.kind === 'forecast') : -1;
      if (i >= 0) d.forecasts[i] = { ...f, id: fc.sourceId! }; else d.forecasts.unshift(f);
    });
    if (!fc.sourceId) fc.set({ sourceId: f.id, name });
    setSaved(`Saved “${name}”.`);
  };
  const makeLive = (name: string, plan: PlanSnapshot) => {
    liveUpdate((d) => {
      (d.forecasts ??= []).unshift(newForecast(`Wise Future before “${name}” (${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })})`, d, 'previous'));
      applySnapshot(d, plan); d.cpiBase = undefined; // fresh figures: index from now
    });
    fc.set({ mode: 'live', draft: null, name: '', sourceId: null });
    setConfirm(null);
  };
  const open = (f: Forecast) => { const d = structuredClone(live); applySnapshot(d, f.plan); fc.set({ draft: d, name: f.kind === 'forecast' ? f.name : `Copy of ${f.name}`, sourceId: f.kind === 'forecast' ? f.id : null, mode: 'forecast' }); setSaved(''); };
  return (
    <section className="panel border-l-4 border-l-sky p-5" data-free>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1"><Field label="Forecast name">{(id) => <TextInput id={id} value={fc.name} onChange={(v) => fc.set({ name: v })} placeholder="e.g. Buy property 3 sooner, retire at 55" />}</Field></div>
        <button className="btn-quiet" onClick={save}><Icon name="check" className="h-4 w-4" />Save forecast</button>
        <button className="btn-primary" onClick={() => setConfirm({ name: fc.name.trim() || 'this forecast', plan: snapshot(fc.draft!) })}><Icon name="spark" className="h-4 w-4" />Make this my new Wise Future</button>
        <button className="btn-ghost text-sm" onClick={() => fc.set({ draft: structuredClone(live), name: '', sourceId: null })} title="Start again from your live plan">Start again from live plan</button>
      </div>
      {saved && <p role="status" className="mt-2 text-sm text-gum">{saved}</p>}
      {list.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm font-semibold">Saved forecasts and previous plans</p>
          <ul className="mt-2 divide-y divide-line">
            {list.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div><p className="font-medium">{f.name}{fc.sourceId === f.id && <span className="ml-2 rounded bg-sky/15 px-1.5 py-0.5 text-[11px] text-sky">open</span>}</p>
                  <p className="text-xs text-muted">{f.kind === 'previous' ? 'Previous Wise Future' : 'Forecast'} · saved {new Date(f.savedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · {nProps(f.plan.goals.targetProperties)} · {money(f.plan.goals.passiveIncome, { compact: true })} a year from {f.plan.goals.retirementAge}</p></div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-quiet py-1.5 text-sm" onClick={() => open(f)}>Open</button>
                  <button className="btn-quiet py-1.5 text-sm" onClick={() => setConfirm({ name: f.name, plan: f.plan })}>{f.kind === 'previous' ? 'Reinstate' : 'Make it my Wise Future'}</button>
                  <button className="btn-ghost p-2" aria-label={`Delete ${f.name}`} onClick={() => liveUpdate((d) => { d.forecasts = (d.forecasts ?? []).filter((x) => x.id !== f.id); })}><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="mk-h" onClick={() => setConfirm(null)}>
          <div className="paper w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="mk-h" className="font-display text-xl font-semibold">Make this your Wise Future?</h2>
            <p className="mt-3 leading-relaxed">Are you sure? The details from “{confirm.name}” will now be put in your current Wise Future plan. Your current plan is kept under Saved forecasts, so you can reinstate it later.</p>
            <div className="mt-6 flex justify-end gap-2"><button className="btn-quiet" onClick={() => setConfirm(null)}>No</button><button className="btn-primary" onClick={() => makeLive(confirm.name, confirm.plan)}>Yes, make it live</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Goals ---------- */
function Goals({ quotes, go }: { quotes: Quotes; go: (t: Tab) => void }) {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  const g = p.goals;
  const check = useMemo(() => planCheck(p, quotes), [p, quotes]);
  const insights = useMemo(() => wiseInsights(p, quotes), [p, quotes]);
  // The Goals read leads with the app's own tested results, so it says something specific rather than restating the goals
  const tested = useMemo(() => ({ planCheck: { works: check.works, problems: check.problems, testedFixes: check.fixes, whatWorks: check.good, testedIdeas: check.ideas.map((x) => x.text) } }), [check]);
  const take = useWiseTake(p, quotes, insights, 'goals', undefined, tested);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">What you want</h2>
        <div className="mt-5"><WealthFocusPicker value={g.wealthFocus} onChange={(v) => update((d) => { d.goals.wealthFocus = v; })} /></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Stop working at age">{(id) => <NumInput id={id} value={g.retirementAge} onChange={(v) => update((d) => { d.goals.retirementAge = v ?? 60; })} />}</Field>
          <Field label="Planning to live to">{(id) => <NumInput id={id} value={g.lifeExpectancy ?? 90} onChange={(v) => update((d) => { d.goals.lifeExpectancy = v ?? 90; })} />}</Field>
          <LinkedValue label="Properties owned by retirement" value={`${g.targetProperties} ${g.targetProperties === 1 ? 'property' : 'properties'}`} hint="Set on the Property Portfolio tab." tabLabel="Property Portfolio" onGo={() => go('timeline')} />
          <LinkedValue label="Share portfolio value at retirement" value={g.sharesTarget ? `${money(g.sharesTarget)}` : 'No goal set'} hint="Set on the Shares tab." tabLabel="Shares" onGo={() => go('shares')} />
          <Field label="Yearly income after retirement" hint="What you want to live on each year after you stop work (in today’s money). The plan sells shares and properties if needed.">{(id) => <MoneyInput id={id} value={g.passiveIncome} onChange={(v) => update((d) => { d.goals.passiveIncome = v ?? 0; })} suffix="/ year" />}</Field>
          <div className="mt-4 sm:col-span-2">
            <h2 className="font-display text-xl font-semibold">Cash reserves in retirement</h2>
            <p className="mt-1 mb-3 text-xs text-muted">It’s worth staying more liquid in retirement, so you can pay for anything unforeseen without having to sell an asset. We recommend at least {money(RETIRE_CASH_PER_PERSON)} per person as a minimum{p.household.hasPartner ? ` (${money(retireCashMin(p))} for the two of you)` : ''}. Once you retire, this replaces the emergency fund you set in My Details.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Field label="Accessible cash reserves in retirement" hint="The least you want in your bank accounts at all times (in today’s money).">{(id) => <MoneyInput id={id} value={g.retireCash ?? null} onChange={(v) => update((d) => { d.goals.retireCash = v; })} placeholder={retireCashMin(p).toLocaleString('en-AU')} />}</Field>
                {g.retireCash != null && g.retireCash < retireCashMin(p) && <p role="status" className="mt-2 rounded-lg bg-brass/10 px-3 py-2 text-sm">That’s below the {money(retireCashMin(p))} we recommend.</p>}</div>
            </div>
            <div className="mt-3 rounded-xl bg-raised p-4 ring-1 ring-line">
              <p className="text-sm">Once you reach your minimum, you may want to keep growing your money in high-interest accounts, or invest anything over it in shares.</p>
              <p className="mt-1 text-xs text-muted">{g.spareCashRetired ? `You’ve chosen to invest anything over ${money(g.retireCash ?? retireCashMin(p))} in shares.` : `Right now, anything over ${money(g.retireCash ?? retireCashMin(p))} stays in the bank.`}</p>
              <button className="btn-quiet mt-3 py-1.5 text-sm" onClick={() => { go('shares'); setTimeout(() => document.getElementById('spare-cash')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }}>{g.spareCashRetired ? 'Change this in Shares' : 'Set this up in Shares'}</button>
            </div>
          </div>
          <div className="mt-4 sm:col-span-2">
            <h2 className="font-display text-xl font-semibold">Planning a big purchase?</h2>
            <p className="mt-1 mb-3 text-xs text-muted">Include any large assets you plan to buy, like a car or a boat, or a life event like a wedding: anything you need to factor into your plan. Enter the cost in today’s money. The plan pays for it from your savings in that year.</p>
            <div className="space-y-3">
              {g.events.map((ev, k) => (
                <div key={ev.id} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_150px_110px_auto] sm:items-end">
                  <Field label="Description">{(id) => <TextInput id={id} value={ev.label} onChange={(v) => update((d) => { d.goals.events[k].label = v; })} placeholder="e.g. Wedding, new car" />}</Field>
                  <Field label="Cost">{(id) => <MoneyInput id={id} value={ev.amount || null} onChange={(v) => update((d) => { d.goals.events[k].amount = v ?? 0; })} />}</Field>
                  <Field label="Year">{(id) => <Select id={id} value={String(ev.year)} onChange={(v) => update((d) => { d.goals.events[k].year = Number(v); })} options={Array.from({ length: Math.max(1, g.retirementAge - (p.household.you.age ?? 35)) + 15 }, (_, j) => new Date().getFullYear() + j).map((y) => ({ value: String(y), label: String(y) }))} />}</Field>
                  <button className="btn-ghost mb-0.5 p-2" aria-label={`Remove ${ev.label || 'big purchase'}`} onClick={() => update((d) => { d.goals.events.splice(k, 1); })}><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button className="btn-quiet mt-2 text-sm" onClick={() => update((d) => { d.goals.events.push({ id: uid(), label: '', year: new Date().getFullYear() + 1, amount: 0 }); })}><Icon name="plus" className="h-4 w-4" />{g.events.length ? 'Add another big purchase' : 'Add a big purchase'}</button>
          </div>
          <div className="mt-4 sm:col-span-2">
            <h2 className="font-display text-xl font-semibold">Planning to have children?</h2>
            <p className="mt-1 mb-3 text-xs text-muted">Add the year you expect each one. We allow the Australian average of about {money(CHILD_COST_YEAR)} a year per child until 18 (in today’s money). Children you already have go in My Details, under Dependants.</p>
            <div className="space-y-2">
              {(g.plannedChildren ?? []).map((c, k) => (
                <div key={c.id} className="flex items-center gap-2">
                  <span className="text-sm text-muted">Child {k + 1}, born in</span>
                  <div className="w-28"><Select value={String(c.year)} onChange={(v) => update((d) => { d.goals.plannedChildren![k].year = Number(v); })} options={Array.from({ length: 20 }, (_, j) => new Date().getFullYear() + j).map((y) => ({ value: String(y), label: String(y) }))} /></div>
                  <button className="btn-ghost p-2" aria-label="Remove planned child" onClick={() => update((d) => { d.goals.plannedChildren!.splice(k, 1); })}><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button className="btn-quiet mt-2 text-sm" onClick={() => update((d) => { const l = (d.goals.plannedChildren ??= []); l.push({ id: uid(), year: (l[l.length - 1]?.year ?? new Date().getFullYear()) + 2 }); })}><Icon name="plus" className="h-4 w-4" />{(g.plannedChildren ?? []).length ? 'Add another child' : 'Add a planned child'}</button>
          </div>
        </div>
      </section>

      <section className="panel p-5 sm:p-6">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brass text-ground"><Icon name="spark" /></span><h2 className="font-display text-xl font-semibold">How your goals fit together</h2></div>
        <div className="mt-5"><PlanCheckBox check={check} compact take={take} /></div>
        <p className="mt-4 text-[11px] text-muted">Estimates from your figures and assumptions. General information, not financial advice.</p>
      </section>
    </div>
  );
}

/** A goal that's set on another tab: shown here, read-only, with a pointer to where to change it. */
function LinkedValue({ label, value, hint, tabLabel, onGo }: { label: string; value: string; hint: string; tabLabel: string; onGo: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" data-free onMouseLeave={() => setOpen(false)}>
      <p className="field-label">{label}</p>
      <button type="button" className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-left text-ink hover:border-brass/60" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={hint}>
        <span>{value}</span><Icon name="plan" className="h-4 w-4 text-muted" />
      </button>
      <p className="mt-1.5 text-xs text-muted">{hint}</p>
      <div role="dialog" aria-hidden={!open} className={`absolute left-0 right-0 top-[4.6rem] z-20 rounded-xl border border-brass/50 bg-surface p-3 text-sm shadow-xl transition-all duration-300 ${open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}>
        <button className="btn-primary py-1.5 text-sm" tabIndex={open ? 0 : -1} onClick={onGo}>Go to {tabLabel}</button>
      </div>
    </div>
  );
}

/* ---------- Assumptions with recommended markers ---------- */
function AssumptionsTab() {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  const rba = useCashRate();
  const loanRec = rba ? Math.round((rba.current + 2) * 20) / 20 : 6.85;
  const rows: { key: keyof Assumptions; label: string; min: number; max: number; step: number; fmt: (v: number) => string; rec: number; note: string }[] = [
    { key: 'shareReturn', label: 'Share returns', min: 3, max: 12, step: 0.25, fmt: (v) => `${v}% a year`, rec: 8, note: 'The ASX 200 with dividends reinvested has returned about 8% a year over the last 20 years.' },
    { key: 'superReturn', label: 'Super returns', min: 3, max: 11, step: 0.25, fmt: (v) => `${v}% a year`, rec: 7, note: 'A common long-run planning figure for balanced super options, after fees.' },
    { key: 'inflation', label: 'Inflation', min: 1, max: 6, step: 0.25, fmt: (v) => `${v}% a year`, rec: 2.75, note: 'Australian inflation averaged about 2.75% a year over the last 20 years, and about 3% over the last 10.' },
    { key: 'newLoanRate', label: 'Interest rate on new loans', min: 4, max: 10, step: 0.05, fmt: (v) => `${v.toFixed(2)}%`, rec: loanRec, note: `The RBA cash rate is ${rba ? rba.current.toFixed(2) : '4.85'}%. Lenders’ variable rates usually sit about 2 percentage points above it.` },
    { key: 'rentGrowth', label: 'Rent growth', min: 0, max: 7, step: 0.25, fmt: (v) => `${v}% a year`, rec: 3, note: 'A common planning figure: roughly inflation plus a little, over the long run.' },
    { key: 'lvr', label: 'Borrow against equity up to', min: 60, max: 90, step: 5, fmt: (v) => `${v}% LVR`, rec: 80, note: 'Most lenders lend up to 80% of a property’s value without lenders mortgage insurance.' },
  ];
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold">Assumptions</h2>
      <p className="mt-1 text-sm text-muted">Each slider marks a recommended setting, based on long-run averages. Tap the marker to use it.</p>
      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-2">
        {rows.map((r) => {
          const v = p.assumptions[r.key];
          const pos = ((r.rec - r.min) / (r.max - r.min)) * 100;
          const atRec = Math.abs(v - r.rec) < r.step / 2;
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-3"><label htmlFor={`as-${r.key}`} className="text-sm font-medium">{r.label}</label><span className="font-display text-lg font-semibold">{r.fmt(v)}</span></div>
              <div className="relative mt-2 pt-4">
                <button type="button" aria-label={`Use the recommended ${r.label.toLowerCase()}: ${r.fmt(r.rec)}`} title={`Recommended: ${r.fmt(r.rec)}`}
                  className="group absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: `${pos}%` }} onClick={() => update((d) => { d.assumptions[r.key] = r.rec; })}>
                  <span className={`h-3 w-3 rounded-full ring-2 ring-surface ${atRec ? 'bg-gum' : 'bg-gum/60 group-hover:bg-gum'}`} />
                </button>
                <input id={`as-${r.key}`} type="range" className="w-full" min={r.min} max={r.max} step={r.step} value={v} onChange={(e) => update((d) => { d.assumptions[r.key] = Number(e.target.value); })} />
              </div>
              <p className="mt-1 text-xs text-muted"><span className="font-medium text-gum">Recommended {r.fmt(r.rec)}.</span> {r.note}{!atRec && <> <button className="font-medium text-brass hover:underline" onClick={() => update((d) => { d.assumptions[r.key] = r.rec; })}>Use it</button></>}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-8 text-[11px] text-muted">Past returns don’t guarantee future ones. Sources: S&P/ASX 200 accumulation index, ABS consumer price index and the Reserve Bank of Australia’s cash rate.</p>
    </section>
  );
}

/* ---------- Property portfolio ---------- */
function Timeline({ quotes, onGoals }: { quotes: Quotes; onGoals: () => void }) {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  const need = Math.max(0, p.goals.targetProperties - p.properties.length);
  useEffect(() => {
    const have = p.plannedPurchases?.length ?? 0;
    if (have < need) update((d) => {
      d.plannedPurchases ??= [];
      while (d.plannedPurchases.length < need) d.plannedPurchases.push(plannedPurchase(d.properties.length + d.plannedPurchases.length + 1, d.assumptions));
    });
  }, [need, p.plannedPurchases?.length, update]);
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const [open, setOpen] = useState<string | null>(() => { const f = useNavIntent.getState().focusProperty; useNavIntent.getState().set({ focusProperty: null }); return f; });
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const startYear = new Date().getFullYear();
  const startAge = p.household.you.age ?? 35;
  const retireAge = p.goals.retirementAge;
  const plans = (p.plannedPurchases ?? []).slice(0, need);
  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2 className="font-display text-xl font-semibold">Your Property Portfolio</h2><p className="text-sm text-muted">Open a property to set its loan plan.</p></div>
          <div>
            <p className="field-label">Properties I want to own by {retireAge}</p>
            <div className="flex items-center gap-2">
              <button className="btn-quiet h-10 w-10 justify-center p-0 text-lg" aria-label="One fewer property" disabled={p.goals.targetProperties <= p.properties.length} onClick={() => update((d) => { d.goals.targetProperties = Math.max(d.properties.length, d.goals.targetProperties - 1); })}>−</button>
              <div className="w-20"><NumInput value={p.goals.targetProperties} onChange={(v) => update((d) => { d.goals.targetProperties = Math.max(d.properties.length, Math.min(15, v ?? d.properties.length)); })} min={p.properties.length} max={15} /></div>
              <button className="btn-quiet h-10 w-10 justify-center p-0 text-lg" aria-label="One more property" disabled={p.goals.targetProperties >= 15} onClick={() => update((d) => { d.goals.targetProperties = Math.min(15, d.goals.targetProperties + 1); })}>+</button>
            </div>
            <p className="mt-1 text-xs text-muted">You own {p.properties.length} now.</p>
          </div>
        </div>
        <ol className="relative mt-8 space-y-4 border-l-2 border-line pl-8">
          {p.properties.map((pr, i) => (
            <OwnedRow key={pr.id} pr={pr} n={i + 1} open={open === pr.id} onToggle={() => toggle(pr.id)} retireAge={retireAge} startAge={startAge} />
          ))}
          {plans.map((plan, k) => (
            <PlannedRow key={plan.id} plan={plan} k={k} n={p.properties.length + k + 1} open={open === plan.id} onToggle={() => toggle(plan.id)}
              bought={proj.purchases[k]} firstMissing={k === proj.purchases.length} block={proj.block} startYear={startYear} startAge={startAge} retireAge={retireAge} onGoals={onGoals} />
          ))}
        </ol>
        {need === 0 && <p className="mt-4 text-sm text-muted">You already own your target number of properties. Raise the target in Goals to plan the next one.</p>}
        <p className="mt-6 text-[11px] text-muted">Each property is bought in the first year your equity and savings cover the deposit and costs, and a lender would lend the rest. At retirement, investment properties that still have a loan are sold, unless you set them to be paid off. A home loan still owing is paid from savings, then from super at 60.</p>
      </section>
    </div>
  );
}

function RowShell({ n, tone, title, sub, right, chips, open, onToggle, children }: { n: number; tone: 'owned' | 'planned' | 'missing'; title: string; sub: string; right?: React.ReactNode; chips: string[]; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[41px] top-4 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${tone === 'owned' ? 'bg-gum text-surface' : tone === 'planned' ? 'bg-brass text-ground' : 'border-2 border-dashed border-clay/60 bg-surface text-clay'}`}>{n}</span>
      <div className={`rounded-xl border ${open ? 'border-brass/50 bg-raised/60' : 'border-line bg-raised/30'}`}>
        <button className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left" aria-expanded={open} onClick={onToggle}>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold">{title}</p>
            <p className="text-sm text-muted">{sub}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((c) => <span key={c} className="rounded-full bg-surface px-2.5 py-0.5 text-xs ring-1 ring-line">{c}</span>)}</div>
          </div>
          <div className="flex items-center gap-3">{right}<Icon name="back" className={`h-4 w-4 text-muted transition-transform ${open ? 'rotate-90' : '-rotate-90'}`} /></div>
        </button>
        {open && <div className="border-t border-line p-4">{children}</div>}
      </div>
    </li>
  );
}

function OwnedRow({ pr, n, open, onToggle, retireAge, startAge }: { pr: Property; n: number; open: boolean; onToggle: () => void; retireAge: number; startAge: number }) {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  const s = propertyStats(pr, p.assumptions.lvr);
  const set = (patch: Partial<Property>) => update((d) => { Object.assign(d.properties.find((x) => x.id === pr.id)!, patch); });
  const home = pr.use === 'home';
  const io5 = !!pr.planIo5;
  const payOff = !!pr.planPayOff;
  const years = Math.max(1, retireAge - startAge - (io5 ? 5 : 0));
  const payOffMonthly = s.debt > 0 ? pmt(s.avgRate || p.assumptions.newLoanRate, years, s.debt) : 0;
  const chips = [home ? 'Home' : 'Investment', s.debt > 0 ? (io5 ? 'Interest-only for 5 years' : 'Principal and interest') : 'No loan', s.debt > 0 ? (payOff ? `Paid off by ${retireAge}` : home ? `Loan cleared from super at retirement` : `Sold at ${retireAge} if a loan is left`) : 'Owned outright'];
  return (
    <RowShell n={n} tone="owned" title={pr.address || 'Property'} sub={`Owned · worth about ${money(s.val.value, { compact: true })} · ${money(s.debt, { compact: true })} owing · ${money(s.equity, { compact: true })} equity`} chips={chips} open={open} onToggle={onToggle}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-semibold">{pr.address}</p>
        <button className="btn-primary" onClick={() => { useNavIntent.getState().set({ editProperty: pr.id }); location.hash = 'properties'; }}><Icon name="details" className="h-4 w-4" />Edit property details</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2 text-sm">
          <p className="font-medium">Current loans</p>
          {pr.loans.length === 0 ? <p className="text-muted">No loans on this property.</p> : pr.loans.map((l) => (
            <p key={l.id} className="text-muted">{l.lender || 'Lender'} · {money(l.balance ?? 0)} at {l.rate ?? '?'}% · {l.type === 'io' ? 'interest-only' : 'principal and interest'} · {l.yearsLeft ?? 25} years left</p>
          ))}
          <p className="text-muted">{pr.use === 'investment' ? `Rent ${money(pr.weeklyRent ?? 0)} a week · ` : ''}growth {pr.growthRate}% a year</p>
        </div>
        {s.debt > 0 ? (
          <div className="space-y-4">
            <Toggle checked={io5} onChange={(v) => set({ planIo5: v })} label="Interest-only for the next 5 years?" description="Lower repayments now; principal and interest after that." />
            <Toggle checked={payOff} onChange={(v) => set({ planPayOff: v })} label={`Pay this property off by ${retireAge}?`}
              description={payOff
                ? `Repayments become principal and interest, sized to clear the loan by ${retireAge}: about ${money(payOffMonthly)} a month${io5 ? ' once the interest-only years end' : ''}.`
                : home ? `Any home loan still owing at ${retireAge} is paid out from your savings, then your super once you can reach it (60).` : `If a loan is still owing at ${retireAge}, we assume you sell it then and the money goes towards your retirement.`} />
          </div>
        ) : <p className="text-sm text-muted">No loan to plan for. It’s kept in retirement for its rent, and only sold if your plan runs short.</p>}
      </div>
    </RowShell>
  );
}

function PlannedRow({ plan, k, n, open, onToggle, bought, firstMissing, block, startYear, startAge, retireAge, onGoals }: {
  plan: PlannedPurchase; k: number; n: number; open: boolean; onToggle: () => void; bought?: { year: number; price: number }; firstMissing: boolean;
  block: ReturnType<typeof project>['block']; startYear: number; startAge: number; retireAge: number; onGoals: () => void;
}) {
  const update = usePlanUpdate();
  const pp0 = usePlanProfile();
  const assumedRate = pp0.assumptions.newLoanRate;
  const fhbEligible = pp0.properties.length === 0 && k === 0;
  const set = (patch: Partial<PlannedPurchase>) => update((d) => { Object.assign(d.plannedPurchases![k], patch); });
  const late = plan.buyBy && bought && bought.year >= plan.buyBy;
  const io5 = plan.ioFirst5 !== false;
  const home = plan.use === 'home';
  const payOff = home ? plan.payOff !== false : !!plan.payOff;
  const weeklyRent = (plan.price * plan.yieldPct) / 100 / 52;
  // The home you'd be moving out of: one you own now, or an earlier planned home
  const prevHome = [...pp0.properties.filter((x) => x.use === 'home').map((x) => x.address || 'your current home'), ...(pp0.plannedPurchases ?? []).slice(0, k).map((x, j) => (x.use === 'home' ? x.label || `Property ${pp0.properties.length + j + 1}` : null)).filter((x): x is string => !!x)].pop();
  const renting = !prevHome && pp0.finances.housing === 'rent';
  const oldYield = plan.oldHomeYield ?? pp0.assumptions.newPurchaseYield;
  const chips = [plan.buyBy ? `Before ${plan.buyBy}` : 'As soon as possible', ...(home
    ? ['Home to live in', ...(plan.firstHome && fhbEligible ? ['First home'] : []), io5 ? 'Interest-only for 5 years' : 'Principal and interest', payOff ? `Paid off by ${retireAge}` : `Loan left at ${retireAge} paid from savings`]
    : [plan.newBuild ? 'New build' : 'Established', io5 ? 'Interest-only for 5 years' : 'Principal and interest', payOff ? `Paid off by ${retireAge}` : `Sold at ${retireAge} if a loan is left`])];
  const right = bought
    ? <p className={`text-right text-sm ${late ? 'text-clay' : ''}`}><span className="font-semibold">{bought.year}</span><br /><span className="text-muted">age {startAge + (bought.year - startYear)} · {money(bought.price, { compact: true })} then</span></p>
    : <p className="text-sm font-medium text-clay">Doesn’t fit before {retireAge}</p>;
  return (
    <RowShell n={n} tone={bought && !late ? 'planned' : 'missing'} title={plan.label || `Property ${n}`} sub={home ? `Planned home · ${money(plan.price, { compact: true })} (in today’s money)` : `Planned investment · ${money(plan.price, { compact: true })} (in today’s money) · ${plan.yieldPct}% yield, about ${money(weeklyRent)} a week rent`} right={right} chips={chips} open={open} onToggle={onToggle}>
      {!bought && firstMissing && block && (
        <p className="mb-3 text-sm text-clay">{block.reason === 'servicing' ? `Held back by borrowing power: lenders would want about ${money(block.monthlyShort, { compact: true })} a month more income. Try a cheaper price or a higher yield.` : `Needs about ${money(block.deposit, { compact: true })} for the deposit and costs; you’d have ${money(block.available, { compact: true })}.`}</p>
      )}
      {late && <p className="mb-3 text-sm text-clay">You want to purchase this property before {plan.buyBy}, but the earliest it fits is {bought!.year}. Adjust the price, the purchase year, or go to your <button className="font-semibold underline" onClick={onGoals}>Goals tab</button> for further recommendations.</p>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">This property will be</span>
        <Segmented size="sm" label="How you’ll use this property" value={home ? 'home' : 'investment'}
          onChange={(v) => set(v === 'home' ? { use: 'home', payOff: true, newBuild: false } : { use: 'investment', firstHome: false, payOff: false })}
          options={[{ value: 'investment', label: 'An investment' }, { value: 'home', label: 'My home to live in' }]} />
      </div>
      {home && (
        <div className="mb-4 rounded-xl border border-line p-3">
          <p className="text-sm">You’ll live here, so it earns no rent, can’t be negatively geared, and has no capital gains tax when you sell.{renting ? ' Your rent stops when you move in.' : ''}</p>
          {prevHome && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-sm font-medium">What happens to {prevHome} when you move?</p>
              <div className="mt-2"><Segmented size="sm" label={`What happens to ${prevHome}`} value={plan.oldHome ?? 'rent'} onChange={(v) => set({ oldHome: v })}
                options={[{ value: 'rent', label: 'Keep it and rent it out' }, { value: 'sell', label: 'Sell it' }]} /></div>
              {(plan.oldHome ?? 'rent') === 'rent' ? (<>
                <p className="mt-2 text-xs text-muted">It becomes an investment property. Its rent helps your borrowing for this purchase, and its value when you move out becomes its starting point for capital gains tax.</p>
                <div className="mt-3 max-w-xs"><Field label="Its rental yield" hint="Rent a year as a share of its value">{(id) => <NumInput id={id} value={oldYield} onChange={(v) => set({ oldHomeYield: v ?? pp0.assumptions.newPurchaseYield })} step={0.1} suffix="%" />}</Field></div>
              </>) : <p className="mt-2 text-xs text-muted">What’s left after selling costs and its loan goes towards this purchase. There’s no capital gains tax on the home you live in.</p>}
            </div>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name (optional)">{(id) => <TextInput id={id} value={plan.label} onChange={(v) => set({ label: v })} placeholder={`Property ${n}`} />}</Field>
        <Field label="Price (in today’s money)">{(id) => <MoneyInput id={id} value={plan.price} onChange={(v) => set({ price: v ?? 0 })} />}</Field>
        <Field label="When">{(id) => <Select id={id} value={String(plan.buyBy ?? '')} onChange={(v) => set({ buyBy: v ? Number(v) : null })}
          options={[{ value: '', label: 'As soon as possible' }, ...Array.from({ length: Math.max(1, retireAge - startAge) }, (_, j) => startYear + 1 + j).map((y) => ({ value: String(y), label: `Before ${y}` }))]} />}</Field>
        <Field label="Interest rate" hint={plan.rate === assumedRate ? 'Same as your assumptions' : <button type="button" className="font-medium text-brass hover:underline" onClick={() => set({ rate: assumedRate })}>Use interest rate from assumptions ({assumedRate}%)</button>}>{(id) => <NumInput id={id} value={plan.rate} onChange={(v) => set({ rate: v ?? 0 })} step={0.05} suffix="%" />}</Field>
        {!home && <Field label="Rental yield" hint={`About ${money(weeklyRent)} a week`}>{(id) => <NumInput id={id} value={plan.yieldPct} onChange={(v) => set({ yieldPct: v ?? 0 })} step={0.1} suffix="%" />}</Field>}
        <Field label="Price growth">{(id) => <NumInput id={id} value={plan.growth} onChange={(v) => set({ growth: v ?? 0 })} step={0.5} suffix="% / yr" />}</Field>
        <Field label="Deposit" hint="20% avoids mortgage insurance">{(id) => <NumInput id={id} value={plan.depositPct ?? 20} onChange={(v) => set({ depositPct: v ?? 20 })} step={1} suffix="%" />}</Field>
        <Field label="Stamp duty and buying costs" hint={home ? 'A home you live in often gets a stamp duty concession. Check your state’s calculator.' : undefined}>{(id) => <NumInput id={id} value={plan.costsPct ?? 5} onChange={(v) => set({ costsPct: v ?? 5 })} step={0.5} suffix="%" />}</Field>
        <Field label="Rates, insurance, upkeep" hint="Of the price, each year">{(id) => <NumInput id={id} value={plan.holdingPct ?? 1.2} onChange={(v) => set({ holdingPct: v ?? 1.2 })} step={0.1} suffix="%" />}</Field>
        {!home && <Field label="Property management" hint="Of the rent">{(id) => <NumInput id={id} value={plan.mgmtPct ?? 7} onChange={(v) => set({ mgmtPct: v ?? 7 })} step={0.5} suffix="%" />}</Field>}
      </div>
      <div className="mt-5 space-y-3">
        {!home && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brass))]" checked={!!plan.newBuild} onChange={(e) => set({ newBuild: e.target.checked })} />
            <span className="text-sm"><span className="font-medium">This will be a new build and subject to negative gearing</span>
              <span className="block text-xs text-muted">Under the 2026 Budget rules, new builds keep negative gearing: rental losses reduce the tax on your salary. An established home bought now can’t do that from 1 July 2027; its losses carry forward against its own future rent instead.</span></span>
          </label>
        )}
        {fhbEligible && home && (
          <div className="rounded-xl border border-line p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brass))]" checked={!!plan.firstHome} onChange={(e) => set({ firstHome: e.target.checked, fhb: plan.fhb ?? { deposit5: true, noStampDuty: true } })} />
              <span className="text-sm"><span className="font-medium">I am using my first home buyer benefits</span>
                <span className="block text-xs text-muted">First home buyer schemes, grants and stamp duty help in your state.</span></span>
            </label>
            {plan.firstHome && (
              <div className="mt-3 space-y-2 border-t border-line pt-3 pl-7">
                <p className="text-sm font-medium">Which benefits are you using?</p>
                {([['deposit5', '5% Deposit Scheme', 'Buy with a 5% deposit and no lenders mortgage insurance (the government guarantees the rest).'], ['noStampDuty', 'No stamp duty', 'First home stamp duty exemption or concession in your state.'], ['grant', 'First Home Owner Grant', 'A one-off grant, usually for new homes. The amount depends on your state.']] as const).map(([key, label, hint]) => (
                  <label key={key} className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brass))]" checked={!!plan.fhb?.[key]} onChange={(e) => set({ fhb: { ...plan.fhb, [key]: e.target.checked } })} />
                    <span className="text-sm">{label}<span className="block text-xs text-muted">{hint}</span></span>
                  </label>
                ))}
                {plan.fhb?.grant && <div className="max-w-xs pl-7"><Field label="Grant amount" hint="Queensland is $15,000 for a new home under $750,000 (contracts from 1 July 2026). Check your state.">{(id) => <MoneyInput id={id} value={plan.fhb?.grantAmount ?? 15000} onChange={(v) => set({ fhb: { ...plan.fhb, grantAmount: v } })} />}</Field></div>}
                <p className="text-[11px] text-muted">Eligibility, price caps and amounts vary by state and change often. Check with your broker or state revenue office.</p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Toggle checked={io5} onChange={(v) => set({ ioFirst5: v })} label="Interest-only for the first 5 years?" description="Lower repayments while you build up; principal and interest after that." />
        <Toggle checked={payOff} onChange={(v) => set({ payOff: v })} label={`Pay this property off by ${retireAge}?`}
          description={home
            ? (payOff ? `Repayments are sized to clear the loan by ${retireAge}. Expect higher repayments, especially if it’s bought late.` : `Any home loan still owing at ${retireAge} is paid out from your savings, then your super once you can reach it (60).`)
            : (payOff ? `Repayments are sized to clear the loan by ${retireAge}, so it’s kept for rent in retirement. Expect much higher repayments, especially if it’s bought late.` : `If a loan is still owing at ${retireAge}, we assume you sell it then and the money goes towards your retirement.`)} />
      </div>
    </RowShell>
  );
}

/** Retirement at a glance, beside the Your Wise Future chart (today's money). */
function RetirementMetrics({ proj }: { proj: ReturnType<typeof project> }) {
  const p = usePlanProfile();
  const life = p.goals.lifeExpectancy ?? 90;
  const at = proj.points.find((x) => x.year === proj.retireYear);
  const i = at ? at.year - proj.points[0].year : 0;
  const d = Math.pow(1 + p.assumptions.inflation / 100, i);
  const c = (v: number) => money(v / d, { compact: true });
  const next = proj.points.find((x) => x.year === proj.retireYear + 1) ?? at; // first full year after any retirement sales
  const propMonthly = next ? next.investNet / 12 / Math.pow(1 + p.assumptions.inflation / 100, i + 1) : 0;
  const investKept = next ? next.investProps : 0;
  const tile = (label: string, value: string, sub: string, tone = '', wide = false) => (
    <div className={`bg-surface p-5 ${wide ? 'col-span-2 lg:col-span-1' : ''}`}><p className="text-xs text-muted">{label}</p><p className={`mt-0.5 font-display text-2xl font-semibold ${tone}`}>{value}</p><p className="text-xs text-muted">{sub}</p></div>
  );
  return (
    <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-1 lg:border-l lg:border-t-0">
      <div className="col-span-2 bg-raised px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted lg:col-span-1">At retirement ({p.goals.retirementAge}) · today’s money</div>
      {tile('Yearly income after retirement', money(p.goals.passiveIncome, { compact: true }), proj.runsOutAge == null ? `Lasts past ${life}` : `Runs out at ${proj.runsOutAge}`, proj.runsOutAge == null ? '' : 'text-clay')}
      {at && tile(p.household.hasPartner ? 'Combined net worth' : 'Net worth', c(at.netWorth), `${c(at.super)} in super · ${c(at.shares)} in shares`, 'text-gum')}
      {at && tile('Investment property cash flow', investKept > 0 ? `${propMonthly >= 0 ? '' : '−'}${money(Math.abs(propMonthly))}` : '$0', investKept > 0 ? `a month from the ${investKept} investment ${investKept === 1 ? 'property' : 'properties'} you keep, after loans and costs` : 'No investment properties kept. Set one to be paid off by retirement to keep its rent.', propMonthly < 0 ? 'text-clay' : '')}
      {at && tile('Super paid out in the first year', c(at.superDrawn), at.age >= 60 ? 'Super pays your income first' : `Super opens at 60, ${60 - at.age} ${60 - at.age === 1 ? 'year' : 'years'} after you stop`)}
      {tile('Cash on hand', money(p.goals.retireCash ?? retireCashMin(p), { compact: true }), 'kept in the bank at all times. Set it in Goals.', '', !!at /* fifth tile: full width on phones so there's no empty box */)}
    </div>
  );
}

/* ---------- Liquidation events ---------- */
function LiquidationsTab({ quotes }: { quotes: Quotes }) {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  const list = p.liquidations ?? [];
  const y0 = new Date().getFullYear();
  const lastYear = y0 + Math.max(1, (p.goals.lifeExpectancy ?? 90) - (p.household.you.age ?? 35));
  const set = (id: string, patch: Partial<Liquidation>) => update((d) => { Object.assign(d.liquidations!.find((x) => x.id === id)!, patch); });
  const sharesNow = holdingValue(p, quotes, 'shares');
  const cryptoNow = holdingValue(p, quotes, 'crypto');
  // Sales the engine makes by itself (e.g. investment properties sold in retirement), shown read-only
  const auto = useMemo(() => project(p, quotes).sales, [p, quotes]);
  const round1k = (v: number) => Math.round(v / 1000) * 1000;
  const what = [
    ...(sharesNow > 0 ? [{ value: 'shares', label: 'Shares' }] : []),
    ...(cryptoNow > 0 ? [{ value: 'crypto', label: 'Crypto' }] : []),
    ...p.properties.map((pr) => ({ value: `property:${pr.id}`, label: pr.address || 'A property' })),
  ];
  const pick = (lq: Liquidation, v: string) => {
    if (v.startsWith('property:')) set(lq.id, { asset: 'property', propertyId: v.slice(9), salePrice: null, sellCostPct: null, amount: null, pct: undefined });
    else { const k = v as 'shares' | 'crypto'; set(lq.id, { asset: k, propertyId: undefined, salePrice: null, amount: round1k((k === 'shares' ? sharesNow : cryptoNow) / 2), pct: undefined }); }
  };
  const add = () => update((d) => {
    const first = what[0]?.value ?? 'shares';
    const lq: Liquidation = first.startsWith('property:') ? { id: uid(), year: y0, asset: 'property', propertyId: first.slice(9) } : { id: uid(), year: y0, asset: first as 'shares' | 'crypto', amount: round1k((first === 'shares' ? sharesNow : cryptoNow) / 2) };
    (d.liquidations ??= []).push(lq);
  });
  const row = (label: string, v: number, cls = '') => <div className={`flex justify-between gap-4 py-1 ${cls}`}><span>{label}</span><span className="tabular-nums">{money(v)}</span></div>;
  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-xl font-semibold">Liquidation Events</h2><p className="mt-1 max-w-2xl text-sm text-muted">Plan the sale of shares, crypto or a property you own. Selling shares or crypto can free up capital for another property purchase, and selling any of your assets can strengthen your cash reserves.</p></div>
        <button className="btn-primary" disabled={what.length === 0} onClick={add}><Icon name="plus" className="h-4 w-4" />Add a liquidation event</button>
      </div>
      {list.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No liquidation events yet. Add one here, or from an idea on the Goals tab.</p> : (
        <ul className="mt-6 space-y-3">
          {list.map((lq) => {
            const est = liquidationEstimate(p, quotes, lq);
            const isProp = lq.asset === 'property';
            const pr = isProp ? p.properties.find((x) => x.id === lq.propertyId) : undefined;
            const holding = lq.asset === 'shares' ? sharesNow : lq.asset === 'crypto' ? cryptoNow : 0;
            const amount = lq.amount ?? (lq.pct != null ? round1k(holding * Math.min(1, lq.pct / 100)) : null);
            const estPrice = isProp && pr ? round1k(propertyValueIn(p, pr.id, lq.year)) : 0;
            const value = isProp ? `property:${lq.propertyId}` : lq.asset;
            return (
              <li key={lq.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <span className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-clay font-display font-bold text-white">$</span>
                  <div className="w-40"><Field label="Year">{(id) => <Select id={id} value={String(lq.year)} onChange={(v) => set(lq.id, { year: Number(v) })} options={Array.from({ length: lastYear - y0 + 1 }, (_, j) => y0 + j).map((y) => ({ value: String(y), label: y === y0 ? `This year (${y})` : String(y) }))} />}</Field></div>
                  <div className="w-56"><Field label="Sell">{(id) => <Select id={id} value={what.some((w) => w.value === value) ? value : (what[0]?.value ?? value)} onChange={(v) => pick(lq, v)} options={what.length ? what : [{ value, label: lq.asset }]} />}</Field></div>
                  {isProp ? (<>
                    <div className="w-44"><Field label={`Sale price in ${lq.year}`}>{(id) => <MoneyInput id={id} value={lq.salePrice ?? estPrice} onChange={(v) => set(lq.id, { salePrice: v })} />}</Field></div>
                    <div className="w-48"><Field label="Agent and selling costs">{(id) => <NumInput id={id} value={lq.sellCostPct ?? 2.5} onChange={(v) => set(lq.id, { sellCostPct: v })} step={0.1} min={0} max={10} suffix="%" />}</Field></div>
                  </>) : (
                    <div className="w-44"><Field label="Amount to sell">{(id) => <MoneyInput id={id} value={amount} onChange={(v) => set(lq.id, { amount: v, pct: undefined })} />}</Field></div>
                  )}
                  <div className="min-w-[10rem] flex-1"><Field label="Note (optional)">{(id) => <TextInput id={id} value={lq.note ?? ''} onChange={(v) => set(lq.id, { note: v })} placeholder="e.g. Deposit for property 2" />}</Field></div>
                  <button className="btn-ghost mb-0.5 p-2" aria-label="Remove liquidation event" onClick={() => update((d) => { d.liquidations = d.liquidations!.filter((x) => x.id !== lq.id); })}><Icon name="trash" className="h-4 w-4" /></button>
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                  <div className="text-sm text-muted">
                    {isProp && pr ? (<>
                      <p>{pr.address} is worth about <span className="font-semibold text-ink">{money(est?.holding ?? 0)}</span> today{lq.year > y0 ? <>, and about {money(estPrice)} by {lq.year} at {pr.growthRate}% a year</> : null}.</p>
                      {lq.salePrice != null && <button className="mt-1 text-xs underline" onClick={() => set(lq.id, { salePrice: null })}>Use the estimate ({money(estPrice)})</button>}
                      <p className="mt-1">{est?.home ? 'This is your home, so no capital gains tax applies.' : 'Capital gains tax is worked out on the gain over what you paid, after selling costs, with the 50% discount.'}</p>
                    </>) : (<>
                      <p>Your {lq.asset === 'shares' ? 'share portfolio' : 'crypto'} is worth <span className="font-semibold text-ink">{money(holding)}</span> today.</p>
                      {holding > 0 && <div className="mt-1 flex gap-2 text-xs">{[0.25, 0.5, 1].map((f) => <button key={f} className="rounded-md px-2 py-0.5 ring-1 ring-line hover:text-ink" onClick={() => set(lq.id, { amount: round1k(holding * f), pct: undefined })}>{f === 1 ? 'All' : f === 0.5 ? 'Half' : 'A quarter'}</button>)}</div>}
                      {amount != null && amount > holding && holding > 0 && <p className="mt-1 text-xs text-clay">That’s more than you hold today. The plan sells what you have in {lq.year}, up to this amount.</p>}
                    </>)}
                  </div>
                  {est && (est.gross > 0 || isProp) && (
                    <div className="rounded-lg bg-raised p-3 text-sm ring-1 ring-line">
                      {row(isProp ? 'Sale price' : 'Sell (today’s prices)', est.gross)}
                      {isProp && row('Agent fees and selling costs', -est.costs, 'text-muted')}
                      {isProp && est.debt > 0 && row('Loan paid out (today’s balance)', -est.debt, 'text-muted')}
                      {row('Capital gains tax (estimate)', -est.tax, 'text-muted')}
                      {row('Into your savings', est.net, 'mt-1 border-t border-line pt-2 font-semibold')}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {auto.length > 0 && (
        <div className="mt-6 rounded-xl border border-line p-4">
          <p className="font-semibold">Property sales already in your plan</p>
          {(['move', 'loan', 'income'] as const).map((why) => {
            // The reason is said once for each group, rather than under every sale
            const items = auto.filter((e) => e.reason === why);
            if (!items.length) return null;
            const one = items.length === 1;
            return (
              <div key={why} className="mt-3">
                <p className="text-sm text-muted">{why === 'move'
                  ? <>{one ? 'Your home is' : 'Your homes are'} sold when you move into the next home you buy, and the money goes towards it. There’s no capital gains tax on the home you live in.</>
                  : why === 'loan'
                  ? <>{one ? 'This property still has a loan' : 'These properties still have a loan'} when you stop work and {one ? 'isn’t' : 'aren’t'} set to be paid off, so {one ? 'it’s' : 'they’re'} sold. To keep one, tick “pay off by retirement” on the Property Portfolio tab.</>
                  : <>{one ? 'This property is' : 'These properties are'} sold when your savings, super and shares run low, to keep paying your retirement income.</>}</p>
                <ul className="mt-2 space-y-2">
                  {items.map((e, k) => (
                    <li key={k} className="flex gap-3 text-sm">
                      <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-clay bg-surface" aria-hidden="true" />
                      <p><span className="font-semibold">{e.year} (age {e.age}):</span> {e.name} is sold, leaving about {money(e.net, { compact: true })} (in today’s money) after the loan{e.reason === 'move' ? ' and selling costs' : ', selling costs and tax'}.</p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-5 text-[11px] text-muted">Capital gains tax is estimated at your marginal rate, with the 50% discount for assets held over 12 months. Your home is exempt. An accountant can help you time a sale. General information, not financial advice.</p>
      <p className="mt-2 rounded-lg bg-brass/10 px-3 py-2 text-[11px] text-ink ring-1 ring-brass/30">{CGT_2027_NOTE}</p>
    </section>
  );
}

/* ---------- Gifts and inheritances ---------- */
function GiftsTab() {
  const p = usePlanProfile();
  const update = usePlanUpdate();
  const list = p.gifts ?? [];
  const y0 = new Date().getFullYear();
  const lastYear = y0 + Math.max(1, (p.goals.lifeExpectancy ?? 90) - (p.household.you.age ?? 35));
  const set = (id: string, patch: Partial<Gift>) => update((d) => { Object.assign(d.gifts!.find((x) => x.id === id)!, patch); });
  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-xl font-semibold">Gifts and inheritances</h2><p className="mt-1 max-w-2xl text-sm text-muted">Money you expect from family, like a parent helping with a deposit or a future inheritance. It goes into your savings in that year, so it can bring a purchase forward.</p></div>
        <button className="btn-primary" onClick={() => update((d) => { (d.gifts ??= []).push({ id: uid(), year: y0 + 1, amount: 0, from: '', kind: 'gift', saved: false }); })}><Icon name="plus" className="h-4 w-4" />Add a gift or inheritance</button>
      </div>
      {list.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing here yet. If someone has said they’ll help, add it so your plan can count on it.</p> : (
        <ul className="mt-6 space-y-3">
          {list.map((gft) => {
            const saved = gft.saved ?? gft.amount > 0;
            const ready = gft.amount > 0 && gft.from.trim().length > 0;
            const remove = () => update((d) => { d.gifts = d.gifts!.filter((x) => x.id !== gft.id); });
            if (saved) return (
              <li key={gft.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-raised/60 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gum/15 text-gum"><Icon name="check" className="h-4 w-4" /></span>
                <div className="min-w-[10rem] flex-1">
                  <p className="font-medium">{money(gft.amount)} {gft.kind === 'inheritance' ? 'inheritance' : 'gift'}{gft.from ? ` from ${gft.from}` : ''}</p>
                  <p className="text-sm text-muted">{gft.year === y0 ? `This year (${y0})` : `In ${gft.year}`}{gft.note ? ` · ${gft.note}` : ''}</p>
                </div>
                <button className="btn-quiet py-1.5" onClick={() => set(gft.id, { saved: false })}>Edit</button>
                <button className="btn-ghost p-2" aria-label="Remove" onClick={remove}><Icon name="trash" className="h-4 w-4" /></button>
              </li>
            );
            return (
            <li key={gft.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-36"><Field label="Type">{(id) => <Select id={id} value={gft.kind} onChange={(v) => set(gft.id, { kind: v as Gift['kind'] })} options={[{ value: 'gift', label: 'Gift' }, { value: 'inheritance', label: 'Inheritance' }]} />}</Field></div>
                <div className="min-w-[10rem] flex-1"><Field label="From">{(id) => <TextInput id={id} value={gft.from} onChange={(v) => set(gft.id, { from: v })} placeholder="e.g. Mum and Dad" />}</Field></div>
                <div className="w-44"><Field label="Amount">{(id) => <MoneyInput id={id} value={gft.amount || null} onChange={(v) => set(gft.id, { amount: v ?? 0, saved: false })} />}</Field></div>
                <div className="w-44"><Field label="Year">{(id) => <Select id={id} value={String(gft.year)} onChange={(v) => set(gft.id, { year: Number(v) })} options={Array.from({ length: lastYear - y0 + 1 }, (_, j) => y0 + j).map((y) => ({ value: String(y), label: y === y0 ? `This year (${y})` : String(y) }))} />}</Field></div>
                <button className="btn-ghost mb-0.5 p-2" aria-label="Remove" onClick={remove}><Icon name="trash" className="h-4 w-4" /></button>
              </div>
              <div className="mt-3"><Field label="What it’s for (optional)">{(id) => <TextInput id={id} value={gft.note ?? ''} onChange={(v) => set(gft.id, { note: v })} placeholder="e.g. Towards the deposit on our next property" />}</Field></div>
              <div className="mt-3 flex items-center justify-end gap-3">
                {!ready && <span className="text-xs text-muted">Add who it’s from and the amount to save it.</span>}
                <button className="btn-primary py-2" disabled={!ready} onClick={() => set(gft.id, { saved: true })}><Icon name="check" className="h-4 w-4" />Save</button>
              </div>
            </li>
            );
          })}
        </ul>
      )}
      <p className="mt-5 text-[11px] text-muted">Gifts in Australia aren’t usually taxed, but some lenders ask for a gift letter. Amounts are in the dollars of the year you expect them.</p>
    </section>
  );
}

/** Pop-up: the monthly share investment, year by year (or month by month), as it rises with inflation. */
function ShareGrowth({ p, proj, onClose }: { p: Profile; proj: ReturnType<typeof project>; onClose: () => void }) {
  const [view, setView] = useState<'year' | 'month'>('year');
  const rows = proj.points.filter((x) => x.year < proj.retireYear).map((x) => ({ year: x.year, age: x.age, monthly: x.sharePlanned / 12 }));
  // The projection starts next year: this year it's today's amount, unless the plan is waiting for a purchase
  if (rows[0] && rows[0].monthly < 1 && (!p.goals.shareStartAfter || (rows[1]?.monthly ?? 0) > 0)) rows[0].monthly = proj.shareMonthly;
  const firstMonth = new Date().getMonth(); // this year: from this month on
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startAfter = p.goals.shareStartAfter ? p.properties.length + p.goals.shareStartAfter : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="sg-h" onClick={onClose}>
      <div className="paper flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="sg-h" className="font-display text-xl font-semibold">Your monthly share investment over time</h2>
            <p className="mt-1 text-sm text-muted">To stay on track for your goal, {money(proj.shareMonthly)} a month (in today’s money) rises each year with inflation, assumed at {p.assumptions.inflation}% a year. Each year the official inflation figure comes out, Wise checks it against this.</p>
          </div>
          <button className="btn-ghost p-2" aria-label="Close" onClick={onClose}><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="mt-4"><Segmented size="sm" label="View" value={view} onChange={setView} options={[{ value: 'year', label: 'By year' }, { value: 'month', label: 'By month' }]} /></div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl ring-1 ring-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-raised text-xs text-muted"><tr><th className="px-4 py-2 text-left font-medium">{view === 'year' ? 'Year' : 'Month'}</th><th className="px-3 py-2 text-left font-medium">Age</th><th className="px-4 py-2 text-right font-medium">Each month</th>{view === 'year' && <th className="px-4 py-2 text-right font-medium">That year</th>}</tr></thead>
            <tbody className="divide-y divide-line">
              {view === 'year' ? rows.map((r, k) => (
                <tr key={r.year} className={r.monthly < 1 ? 'text-muted' : ''}>
                  <td className="px-4 py-2 tabular-nums">{r.year}</td><td className="px-3 py-2 tabular-nums">{r.age}</td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{r.monthly < 1 ? (startAfter ? `Waiting for property ${startAfter}` : '—') : money(Math.round(r.monthly))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.monthly < 1 ? '' : money(Math.round(r.monthly * (k === 0 ? 12 - firstMonth : 12)))}</td>
                </tr>
              )) : rows.flatMap((r, k) => MONTHS.map((mo, mi) => (k === 0 && mi < firstMonth) ? null : (
                <tr key={`${r.year}-${mi}`} className={`${r.monthly < 1 ? 'text-muted' : ''} ${mi === 0 ? 'border-t-2 border-line' : ''}`}>
                  <td className="px-4 py-1.5 tabular-nums">{mo} {r.year}</td><td className="px-3 py-1.5 tabular-nums">{r.age}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{r.monthly < 1 ? (startAfter ? 'Waiting' : '—') : money(Math.round(r.monthly))}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted">Amounts are what you’d actually invest each month in that year’s dollars, stepping up once a year. They stop when you retire at {p.goals.retirementAge}.</p>
      </div>
    </div>
  );
}

/* ---------- Shares plan ---------- */
function SharesPlan({ quotes, onGoals }: { quotes: Quotes; onGoals: () => void }) {
  const p = usePlanProfile();
  const [growOpen, setGrowOpen] = useState(false);
  const update = usePlanUpdate();
  const proj = useMemo(() => project(p, quotes), [p, quotes]);
  const pos = useMemo(() => position(p, quotes), [p, quotes]);
  const cap = useMemo(() => maxShareMonthly(p, quotes), [p, quotes]);
  const sharesNow = pos.shares.value - proj.cryptoExcluded;
  const required = requiredShareMonthly(p, sharesNow);
  const auto = p.goals.shareMonthly == null;
  const startAge = p.household.you.age ?? 35;
  const years = Math.max(1, p.goals.retirementAge - startAge);
  const realAtRetire = proj.sharesAtRetire / Math.pow(1 + p.assumptions.inflation / 100, years);
  // A delayed start means fewer years of investing, so say so and show what starting now would give
  const investing = proj.points.filter((x) => x.sharePlanned > 0);
  const delayStart = p.goals.shareStartAfter && investing.length ? investing[0].year : null;
  const investYears = investing.length;
  const nowAtRetire = useMemo(() => {
    if (delayStart == null) return null;
    const x: typeof p = JSON.parse(JSON.stringify(p)); x.goals.shareStartAfter = null;
    return project(x, quotes).sharesAtRetire / Math.pow(1 + p.assumptions.inflation / 100, years);
  }, [p, quotes, years, delayStart]);
  const over = cap != null && proj.shareMonthly > cap.monthly + 1;
  const goalFromMonthly = !auto && proj.shareMonthly > 0 ? Math.round(realAtRetire / 1000) * 1000 : null;
  const useAmount = (v: number) => update((d) => { d.goals.shareMonthly = Math.round(v); });
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Your share plan</h2>
        <p className="mt-1 text-sm text-muted">Crypto has its own tab and isn’t part of this plan.</p>
        <div className="mt-5"><p className="text-xs text-muted">Shares today</p><p className="font-display text-2xl font-semibold">{money(sharesNow)}</p></div>
        <p className="mt-5 text-sm">Set a retirement goal or a monthly amount, and we’ll work out the other.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Retirement goal" hint={goalFromMonthly != null ? 'Worked out from your monthly amount (in today’s money). Type a goal to set your own instead.' : 'What you’d like your shares to be worth when you stop work (in today’s money). Leave blank if you don’t have one.'}>{(id) => <MoneyInput id={id} value={goalFromMonthly ?? p.goals.sharesTarget ?? null} onChange={(v) => update((d) => { d.goals.sharesTarget = v; d.goals.shareMonthly = v && p.goals.shareStartAfter ? monthlyForShareGoal({ ...p, goals: { ...p.goals, sharesTarget: v } }, quotes, v) : null; })} />}</Field>
          <Field label="Monthly investment" hint={auto && p.goals.sharesTarget ? 'Worked out from your goal. Type an amount to set your own instead.' : 'The amount goes up with inflation each year.'}>{(id) => <MoneyInput id={id} value={auto ? (p.goals.sharesTarget ? Math.round(required) : null) : p.goals.shareMonthly ?? null} onChange={(v) => {
            // Typing a monthly amount works the retirement goal out from it, so the two boxes always agree
            const x: typeof p = JSON.parse(JSON.stringify(p)); x.goals.shareMonthly = v ?? 0;
            const reach = project(x, quotes).sharesAtRetire / Math.pow(1 + p.assumptions.inflation / 100, years);
            update((d) => { d.goals.shareMonthly = v ?? 0; d.goals.sharesTarget = v ? Math.round(reach / 1000) * 1000 : null; });
          }} suffix="/ month" />}</Field>
        </div>
        {proj.shareMonthly > 0 && <button className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brass hover:underline" onClick={() => setGrowOpen(true)}><Icon name="calendar" className="h-4 w-4" />See how your monthly investment rises with inflation</button>}
        {growOpen && <ShareGrowth p={p} proj={proj} onClose={() => setGrowOpen(false)} />}
        {(p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - p.properties.length)).length > 0 && (
          <div className="mt-4 rounded-xl border border-line p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brass))]" checked={!!p.goals.shareStartAfter}
                onChange={(e) => update((d) => { d.goals.shareStartAfter = e.target.checked ? 1 : null; if (e.target.checked && d.goals.shareMonthly == null) { const x: typeof p = JSON.parse(JSON.stringify(p)); x.goals.shareStartAfter = 1; d.goals.shareMonthly = (p.goals.sharesTarget ? monthlyForShareGoal(x, quotes, p.goals.sharesTarget) : null) ?? Math.round(proj.shareMonthly || required); } })} />
              <span className="text-sm">I don’t want to invest in shares until after I’ve bought
                {p.goals.shareStartAfter ? (
                  <select className="mx-1.5 rounded-md border border-line bg-surface px-1.5 py-0.5 text-sm" value={p.goals.shareStartAfter} onClick={(e) => e.preventDefault()} onChange={(e) => update((d) => { d.goals.shareStartAfter = Number(e.target.value); })}>
                    {(p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - p.properties.length)).map((pp, k) => <option key={pp.id} value={k + 1}>{pp.label || `property ${p.properties.length + k + 1}`}</option>)}
                  </select>
                ) : ' my next property'}.
                <span className="block text-xs text-muted">Your monthly amount stays the same. It just starts after that purchase.{p.goals.shareStartAfter && proj.purchases[p.goals.shareStartAfter - 1] && delayStart != null ? (() => {
                  const pp = (p.plannedPurchases ?? [])[p.goals.shareStartAfter - 1];
                  const got = proj.purchases[p.goals.shareStartAfter - 1].year;
                  const name = pp?.label || `Property ${p.properties.length + p.goals.shareStartAfter}`;
                  return pp?.buyBy && got >= pp.buyBy ? ` You want to buy ${name} before ${pp.buyBy}, but on your numbers the earliest it fits is ${got}, so shares start in ${delayStart}.` : ` On these numbers that’s ${delayStart}.`;
                })() : p.goals.shareStartAfter ? ' On these numbers that purchase doesn’t happen before you stop work, so no shares would be bought.' : ''}</span>
              </span>
            </label>
          </div>
        )}
        <div className="mt-5 rounded-xl bg-raised p-4 ring-1 ring-line">
          {auto && p.goals.sharesTarget ? (<>
            <p className="text-sm text-muted">To reach {money(p.goals.sharesTarget, { compact: true })} by {p.goals.retirementAge} at {p.assumptions.shareReturn}% a year, you’d invest about</p>
            <p className="font-display text-3xl font-semibold">{money(required)} <span className="text-base font-normal text-muted">a month</span></p>
            <p className="text-xs text-muted">{money(required * 12)} a year (in today’s money), rising with inflation, for {years} years.</p>
          </>) : !auto && proj.shareMonthly > 0 ? (<>
            <p className="text-sm text-muted">{delayStart != null ? `Investing ${money(proj.shareMonthly)} a month from ${delayStart} (${investYears} ${investYears === 1 ? 'year' : 'years'} of investing), you’d have about` : `By investing ${money(proj.shareMonthly)} a month, you’d have about`}</p>
            <p className="font-display text-3xl font-semibold">{money(realAtRetire, { compact: true })} <span className="text-base font-normal text-muted">by {p.goals.retirementAge}</span></p>
            <p className="text-xs text-muted">In today’s money, at {p.assumptions.shareReturn}% a year.{proj.points.some((x) => x.sharePlanned > 0 && x.shareContribution < x.sharePlanned * 0.98) ? ' Some years your savings can’t cover the full amount, so less goes in.' : ''}</p>
            {nowAtRetire != null && nowAtRetire > realAtRetire * 1.05 && <p className="mt-2 text-xs text-muted">If you started now instead, the same amount would grow to about <span className="font-semibold text-ink">{money(nowAtRetire, { compact: true })}</span> by {p.goals.retirementAge}.</p>}
          </>) : (
            <p className="text-sm text-muted">Enter a share portfolio value for retirement, or how much you’d invest each month, to see where it gets you by {p.goals.retirementAge}.</p>
          )}
        </div>
        {over && cap && (
          <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-clay/50 bg-clay/10 p-4">
            <Icon name="x" className="mt-0.5 h-5 w-5 shrink-0 text-clay" />
            <div>
              <p className="font-semibold">This share plan stops your property purchases</p>
              <p className="mt-1 text-sm">Based on your property purchasing goals, the maximum you can invest in shares is <span className="font-semibold">{money(cap.monthly)} a month</span>. That grows to about {money(cap.sharesAtRetireReal, { compact: true })} by {p.goals.retirementAge} (in today’s money).</p>
              <button className="btn-quiet mt-3" onClick={() => useAmount(cap.monthly)}>Use {money(cap.monthly)} a month</button>
            </div>
          </div>
        )}
        {!over && cap && <p className="mt-5 text-sm text-gum">Your property plan still works. You could invest up to {money(cap.monthly)} a month before it starts delaying a purchase.</p>}
      </section>
      <ShareTradeOff quotes={quotes} current={proj.shareMonthly} required={required} cap={cap?.monthly ?? null} onUse={useAmount} />
      <SpareCash quotes={quotes} onGoals={onGoals} />
    </div>
  );
}

/** Property-first view of the share plan: what each monthly amount does to the purchase years. */
function ShareTradeOff({ quotes, current, required, cap, onUse }: { quotes: Quotes; current: number; required: number; cap: number | null; onUse: (v: number) => void }) {
  const p = usePlanProfile();
  const owned = p.properties.length;
  const planned = (p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - owned));
  const rows = useMemo(() => {
    const top = Math.max(required, current, cap ?? 0, 1000);
    const special = [0, Math.round(current), Math.round(required), ...(cap != null ? [cap] : [])];
    const steps = [500, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000].filter((v) => v <= top * 1.1 && !special.includes(v));
    const room = Math.max(0, 10 - new Set(special).size);
    const picked = steps.length <= room ? steps : steps.filter((_, j) => j % Math.ceil(steps.length / room) === 0).slice(0, room);
    const amounts = [...new Set([...special, ...picked])].sort((x, y) => x - y);
    const years = Math.max(1, p.goals.retirementAge - (p.household.you.age ?? 35));
    return amounts.map((v) => {
      const x: typeof p = JSON.parse(JSON.stringify(p)); x.goals.shareMonthly = v;
      const r = project(x, quotes);
      return { v, buys: planned.map((pp, k) => ({ year: r.purchases[k]?.year ?? null, late: !!pp.buyBy && (!r.purchases[k] || r.purchases[k].year >= pp.buyBy) })), shares: r.sharesAtRetire / Math.pow(1 + p.assumptions.inflation / 100, years), lasts: r.runsOutAge };
    });
  }, [p, quotes, current, required, cap]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="panel p-5 sm:p-6">
      <h3 className="font-display text-lg font-semibold">How shares affect your property plan</h3>
      <p className="mt-1 text-sm text-muted">Shares and deposits come out of the same savings. Here’s when each property fits at different monthly amounts.</p>
      {planned.length === 0 ? <p className="mt-6 text-sm text-muted">You haven’t planned any more properties. Raise your property goal on the Property Portfolio tab to see the trade-off.</p> : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr className="border-b border-line">
              <th className="py-2 pr-3 text-left font-medium">Shares a month</th>
              {planned.map((pp, k) => <th key={pp.id} className="px-2 py-2 text-right font-medium">{pp.label || `Property ${owned + k + 1}`}{pp.buyBy ? <span className="block font-normal">before {pp.buyBy}</span> : null}</th>)}
              <th className="px-2 py-2 text-right font-medium">Shares at {p.goals.retirementAge}</th>
              <th className="py-2 pl-2" />
            </tr></thead>
            <tbody>
              {rows.map((row) => {
                const isCurrent = Math.abs(row.v - current) < 1;
                const broken = row.buys.some((b) => !b.year || b.late);
                return (
                  <tr key={row.v} className={`border-b border-line last:border-0 ${isCurrent ? 'bg-brass/10' : ''}`}>
                    <td className="py-2.5 pr-3"><span className="font-semibold">{money(row.v)}</span>
                      <span className="block text-[11px] text-muted">{[isCurrent && 'your plan', (p.goals.sharesTarget ?? 0) > 0 && row.shares >= (p.goals.sharesTarget ?? 0) * 0.98 && rows.find((x) => x.shares >= (p.goals.sharesTarget ?? 0) * 0.98)?.v === row.v && 'reaches your share target', cap != null && row.v === cap && 'most that still fits every property'].filter(Boolean).join(' · ')}</span></td>
                    {row.buys.map((b, k) => <td key={k} className={`px-2 py-2.5 text-right ${!b.year || b.late ? 'font-medium text-clay' : ''}`}>{b.year ?? 'Doesn’t fit'}</td>)}
                    <td className="px-2 py-2.5 text-right">{money(row.shares, { compact: true })}</td>
                    <td className="py-2.5 pl-2 text-right">{!isCurrent && <button className={`text-xs font-medium hover:underline ${broken ? 'text-muted' : 'text-brass'}`} onClick={() => onUse(row.v)}>Use</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-muted">Shares at {p.goals.retirementAge} are in today’s money. Red means a property misses the year you set, or doesn’t fit before you stop work.</p>
        </div>
      )}
    </section>
  );
}

/* ---------- Your Wise Future ---------- */
const EVENT_STYLE: Record<string, { icon: string; cls: string }> = {
  buy: { icon: 'property', cls: 'bg-brass/15 text-brass' }, gift: { icon: 'family', cls: 'bg-gum/15 text-gum' }, liquidate: { icon: 'coin', cls: 'bg-clay/15 text-clay' }, pay: { icon: 'arrow', cls: 'bg-gum/15 text-gum' }, sell: { icon: 'arrow', cls: 'bg-sky/15 text-sky' }, debt: { icon: 'check', cls: 'bg-gum/15 text-gum' },
  kids: { icon: 'family', cls: 'bg-sage/20 text-sage' }, retire: { icon: 'spark', cls: 'bg-brass text-ground' }, super: { icon: 'plan', cls: 'bg-gum/15 text-gum' },
  shares: { icon: 'shares', cls: 'bg-sky/15 text-sky' }, runout: { icon: 'x', cls: 'bg-clay/15 text-clay' }, cost: { icon: 'details', cls: 'bg-line text-ink' }, goal: { icon: 'check', cls: 'bg-gum/15 text-gum' },
};

function Projections({ quotes }: { quotes: Quotes }) {
  const p = usePlanProfile();
  const check = useMemo(() => planCheck(p, quotes), [p, quotes]);
  const proj = check.proj;
  const [dollars, setDollars] = useState<'real' | 'nominal'>('real');
  const [hidden, setHidden] = useState<string[]>([]);
  const [view, setView] = useState<'worth' | 'flow'>('worth');
  const pts = proj.points;
  const runsOutYear = proj.runsOutAge != null ? proj.retireYear + (proj.runsOutAge - p.goals.retirementAge) : null;
  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-gum via-brass to-sky" />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 className="font-display text-2xl font-semibold">Your Wise Future</h2><Segmented size="xs" label="Chart" value={view} onChange={setView} options={[{ value: 'worth', label: 'Net worth' }, { value: 'flow', label: 'Cash flow' }]} /></div>
                <p className={`text-sm font-medium ${proj.runsOutAge != null ? 'text-clay' : 'text-gum'}`}>{proj.runsOutAge != null ? `At ${money(p.goals.passiveIncome, { compact: true })} a year, your money runs out at ${proj.runsOutAge}.` : `At ${money(p.goals.passiveIncome, { compact: true })} a year, your money lasts to ${p.goals.lifeExpectancy ?? 90}.`}</p></div>
              <ChartToolbar series={view === 'worth' ? <SeriesToggles hidden={hidden} onChange={setHidden} crypto={proj.points.some((x) => x.crypto > 0)} /> : null} />
            </div>
            {view === 'worth' ? (<>
              <div className="mt-4 -ml-2"><WealthChart points={dollars === 'real' ? toReal(pts, p.assumptions.inflation) : pts} retireYear={proj.retireYear} height={340} real={dollars === 'real'} hidden={hidden} runsOutYear={runsOutYear} /></div>
              <ChartFooter dollars={dollars} setDollars={setDollars}><MarkerKey points={pts} /></ChartFooter>
            </>) : (<>
              <div className="mt-4 -ml-2"><CashFlowChart points={dollars === 'real' ? toReal(pts, p.assumptions.inflation) : pts} retireYear={proj.retireYear} height={340} real={dollars === 'real'} /></div>
              <ChartFooter dollars={dollars} setDollars={setDollars}><CashFlowKey /></ChartFooter>
            </>)}
          </div>
          <RetirementMetrics proj={proj} />
        </div>
      </section>

      <PlanCheckBox check={check} notesOnly />

      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">What happens, year by year</h2>
        <p className="mt-1 text-sm text-muted">Worked out from your figures, goals and assumptions.</p>
        <p className="mt-4 text-xs text-muted">Milestone years only, {dollars === 'real' ? 'in today’s money' : 'in the dollars of each year'}. Cash includes your {money(proj.buffer, { compact: true })} emergency fund.</p>
        <ol className="mt-4 divide-y divide-line">
          {pts.map((pt, i) => {
            const evs = proj.events.filter((e) => e.year === pt.year);
            if (evs.length === 0) return null;
            const d = dollars === 'real' ? Math.pow(1 + p.assumptions.inflation / 100, i) : 1;
            const c = (v: number) => money(v / d, { compact: true });
            const working = pt.age < p.goals.retirementAge;
            const rent = pt.rentIncome > 0 ? [`Rent ${c(pt.rentIncome)}`] : [];
            const stats = working
              ? [`Cash at year end ${c(Math.max(0, pt.cash))}`, ...rent, pt.sharePlanned > 0 && pt.shareContribution < pt.sharePlanned * 0.98 ? `${c(pt.shareContribution)} into shares (plan ${c(pt.sharePlanned)})` : pt.shareContribution > 0 ? `${c(pt.shareContribution)} into shares` : 'Nothing into shares', `Shares ${c(pt.shares)}`, `Super ${c(pt.super)}`]
              : [pt.superDrawn > 0 ? `${c(pt.superDrawn)} paid from super` : pt.age < 60 ? 'Super not open until 60' : 'Super used up', ...rent, `Cash at year end ${c(Math.max(0, pt.cash))}`, `Shares ${c(pt.shares)}`, `Super left ${c(pt.super)}`];
            return (
              <li key={pt.year} className={`flex gap-4 py-3 ${pt.age === p.goals.retirementAge ? 'bg-brass/5' : ''}`}>
                <div className="w-16 shrink-0 text-right"><p className="font-display font-semibold">{pt.year}</p><p className="text-xs text-muted">age {pt.age}</p></div>
                <div className="min-w-0 flex-1 space-y-2">
                  {evs.map((e, k) => {
                    const st = EVENT_STYLE[e.kind] ?? EVENT_STYLE.goal;
                    return (
                      <div key={k} className="flex gap-3">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${st.cls}`}><Icon name={st.icon} className="h-3.5 w-3.5" /></span>
                        <p className="pt-0.5 leading-relaxed">{e.text}</p>
                      </div>
                    );
                  })}
                  <p className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${pt.cash < 0 ? 'text-clay' : 'text-muted'}`}>{stats.map((t) => <span key={t}>{t}</span>)}{pt.cash < 0 && <span className="font-medium">Short by {c(-pt.cash)}</span>}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 text-[11px] text-muted">In retirement your income comes from super first (from 60, with a minimum yearly withdrawal), then rent and savings, then selling shares, then selling investment properties, newest first. Your home is kept. Super contributions are 12% of salary, capped at $32,500 a year, less 15% tax. Sale figures allow for selling costs and capital gains tax. {CGT_2027_NOTE} Estimates only, not financial advice.</p>
      </section>

    </div>
  );
}

