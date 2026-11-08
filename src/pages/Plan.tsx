import { useEffect, useMemo, useState } from 'react';
import { useApp, useNavIntent } from '../lib/store';
import { applySnapshot, newForecast, PlanProvider, snapshot, useForecast, usePlanMode, usePlanProfile, usePlanUpdate, type PlanCtx } from '../lib/planContext';
import { CHILD_COST_YEAR, pmt, position, project, propertyStats, recommendedBuffer, requiredShareMonthly, type Quotes } from '../lib/calc';
import { maxShareMonthly, planCheck, saleAfterTax } from '../lib/planCheck';
import { PlanCheckBox } from '../components/PlanCheck';
import { wiseInsights } from '../lib/insights';
import { money } from '../lib/format';
import { plannedPurchase, uid } from '../lib/defaults';
import { useCashRate } from '../lib/rates';
import type { Assumptions, Forecast, Gift, Liquidation, PlanSnapshot, PlannedPurchase, Profile, Property } from '../lib/types';
import { CashFlowChart, CashFlowKey, MarkerKey, SeriesToggles, WealthChart, toReal } from '../components/Charts';
import { DollarsNote, DollarsToggle, LiveToAge } from '../components/ChartControls';
import { useWiseTake } from '../components/Assistants';
import { Field, Icon, MoneyInput, NumInput, Segmented, Select, TextInput, Toggle } from '../components/ui';

type Tab = 'goals' | 'assumptions' | 'timeline' | 'shares' | 'liquidations' | 'gifts' | 'projections';

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
          <div className="mb-3 inline-flex rounded-xl border border-line bg-surface/5 p-1" role="radiogroup" aria-label="Plan mode">
            {(['live', 'forecast'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={(forecasting ? 'forecast' : 'live') === m} onClick={() => (m === 'live' ? fc.set({ mode: 'live' }) : startForecast())}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${(forecasting ? 'forecast' : 'live') === m ? (m === 'live' ? 'bg-gum text-surface' : 'bg-sky text-surface') : 'text-muted hover:text-ink'}`}>
                {m === 'live' ? 'Live plan' : 'Forecast'}
              </button>
            ))}
          </div>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{forecasting ? 'Forecast' : 'Your plan'}</h1>
          <p className="text-muted">{forecasting ? 'Try changes here without touching your live plan. Save it, or make it your new Wise Future.' : 'Set where you want to end up, check the assumptions, and see how it plays out.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Plan section">
          <Segmented label="Plan section" value={tab === 'projections' ? ('' as Tab) : tab} onChange={setTab} options={[{ value: 'goals', label: 'Goals' }, { value: 'assumptions', label: 'Assumptions' }, { value: 'timeline', label: 'Property portfolio' }, { value: 'shares', label: 'Shares' }, { value: 'liquidations', label: 'Liquidation events' }, { value: 'gifts', label: 'Gifts' }]} />
          <button role="tab" aria-selected={tab === 'projections'} onClick={() => setTab('projections')}
            className={`group inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${tab === 'projections'
              ? 'bg-brass text-ground shadow-[0_6px_20px_-6px_rgb(var(--brass)/0.7)] ring-2 ring-brass/40'
              : 'border border-brass/60 bg-brass/10 text-brass hover:bg-brass/20 hover:shadow-[0_4px_16px_-6px_rgb(var(--brass)/0.6)]'}`}>
            <Icon name="spark" className={`h-4 w-4 ${tab === 'projections' ? '' : 'transition-transform group-hover:rotate-45'}`} />{forecasting ? 'Forecast Future' : 'Your Wise Future'}
          </button>
          {!forecasting && (
            <button onClick={() => (locked ? setAsk({}) : liveUpdate((d) => { d.planLocked = true; }))} title={locked ? 'Your plan is locked. Click to unlock.' : 'Lock your plan so it can’t be changed by accident'}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${locked ? 'bg-ink text-surface' : 'border border-line text-muted hover:text-ink'}`}>
              <Icon name={locked ? 'lock' : 'unlock'} className="h-4 w-4" />{locked ? 'Locked' : 'Lock'}
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
        {tab === 'timeline' && <Timeline quotes={quotes} />}
        {tab === 'shares' && <SharesPlan quotes={quotes} />}
        {tab === 'liquidations' && <LiquidationsTab quotes={quotes} />}
        {tab === 'gifts' && <GiftsTab />}
      </div>
      {tab === 'projections' && <Projections quotes={quotes} onLock={() => liveUpdate((d) => { d.planLocked = true; })} onAskUnlock={() => setAsk({})} />}

      {ask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="lock-h" onClick={() => setAsk(null)}>
          <div className="paper w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-surface"><Icon name="lock" className="h-5 w-5" /></span><h2 id="lock-h" className="font-display text-xl font-semibold">Your plan is locked</h2></div>
            <p className="mt-4 leading-relaxed">Your Wise Future plan has been locked in. If you want to play with the variables, try doing a forecast. Changing live variables can affect your plan in real time.</p>
            <p className="mt-3 font-medium">Do you want to unlock it?</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button className="btn-quiet" onClick={() => { setAsk(null); startForecast(); }}>Try a forecast instead</button>
              <button className="btn-quiet" onClick={() => setAsk(null)}>No</button>
              <button className="btn-primary" onClick={() => { const then = ask.then; liveUpdate((d) => { d.planLocked = false; if (then) then(d); }); setAsk(null); }}>Yes, unlock</button>
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
      applySnapshot(d, plan);
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
                  <p className="text-xs text-muted">{f.kind === 'previous' ? 'Previous Wise Future' : 'Forecast'} · saved {new Date(f.savedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · {f.plan.goals.targetProperties} properties · {money(f.plan.goals.passiveIncome, { compact: true })} a year from {f.plan.goals.retirementAge}</p></div>
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
  const take = useWiseTake(p, quotes, insights, 'goals');
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">What you want</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Stop working at age">{(id) => <NumInput id={id} value={g.retirementAge} onChange={(v) => update((d) => { d.goals.retirementAge = v ?? 60; })} />}</Field>
          <Field label="Planning to live to">{(id) => <NumInput id={id} value={g.lifeExpectancy ?? 90} onChange={(v) => update((d) => { d.goals.lifeExpectancy = v ?? 90; })} />}</Field>
          <LinkedValue label="Properties owned by retirement" value={`${g.targetProperties} ${g.targetProperties === 1 ? 'property' : 'properties'}`} hint="Update your property goal on the Property portfolio tab." tabLabel="Property portfolio" onGo={() => go('timeline')} />
          <LinkedValue label="Share portfolio value at retirement" value={g.sharesTarget ? `${money(g.sharesTarget)}` : 'No goal set'} hint="Update your share plan on the Shares tab." tabLabel="Shares" onGo={() => go('shares')} />
          <Field label="Yearly income after retirement" hint="What you want to live on each year once you stop working, in today’s money. The plan sells shares and properties if it needs to.">{(id) => <MoneyInput id={id} value={g.passiveIncome} onChange={(v) => update((d) => { d.goals.passiveIncome = v ?? 0; })} suffix="/ year" />}</Field>
          <Field label="Cash to keep on hand in retirement" hint="The least you want in the bank at any time once you stop work, in today’s money. It replaces your emergency cash buffer from then on.">{(id) => <MoneyInput id={id} value={g.retireCash ?? null} onChange={(v) => update((d) => { d.goals.retireCash = v; })} placeholder={String(Math.round(p.finances.buffer ?? recommendedBuffer(p)))} />}</Field>
          <div className="sm:col-span-2">
            <p className="field-label">Planning to have children?</p>
            <p className="-mt-1 mb-2 text-xs text-muted">Add the year you expect each one. We allow the Australian average cost of raising a child, about {money(CHILD_COST_YEAR)} a year from birth to 18 in today’s money. Leave it blank if you’re not planning any. Children you already have go in Dependants.</p>
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
        <div className="mt-5"><PlanCheckBox check={check} compact /></div>
        {take && take !== 'loading' && (
          <div className="mt-5 rounded-xl bg-raised p-4 ring-1 ring-line">
            <p className="text-xs font-medium text-muted">Wise suggests</p>
            <p className="mt-1 leading-relaxed">{take.summary}</p>
            {take.ideas.length > 0 && <ul className="mt-2 space-y-1.5 text-sm">{take.ideas.map((i) => <li key={i.title}><span className="font-medium">{i.title}.</span> <span className="text-muted">{i.body}</span></li>)}</ul>}
          </div>
        )}
        {take === 'loading' && <div className="mt-5 space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-line" /><div className="h-3 w-full animate-pulse rounded bg-line" /></div>}
        <p className="mt-4 text-[11px] text-muted">Estimates from your figures and assumptions. General information, not financial advice.</p>
      </section>
    </div>
  );
}

/** A goal that's set on another tab: shown here, read-only, with a pointer to where to change it. */
function LinkedValue({ label, value, hint, tabLabel, onGo }: { label: string; value: string; hint: string; tabLabel: string; onGo: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" data-free>
      <p className="field-label">{label}</p>
      <button type="button" className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-left text-ink hover:border-brass/60" onClick={() => setOpen((o) => !o)} aria-expanded={open} title={hint}>
        <span>{value}</span><Icon name="plan" className="h-4 w-4 text-muted" />
      </button>
      <p className="mt-1.5 text-xs text-muted">{hint}</p>
      {open && (
        <div role="dialog" className="absolute left-0 right-0 top-[4.6rem] z-20 rounded-xl border border-brass/50 bg-surface p-3 text-sm shadow-xl">
          <p>This is set on the {tabLabel} tab, so it always matches your plan there.</p>
          <div className="mt-2 flex gap-2"><button className="btn-primary py-1.5 text-sm" onClick={onGo}>Go to {tabLabel}</button><button className="btn-ghost py-1.5 text-sm" onClick={() => setOpen(false)}>Close</button></div>
        </div>
      )}
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
      <p className="mt-1 text-sm text-muted">Each one has a recommended setting, marked on the slider, based on long-run averages. Tap the marker to use it.</p>
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
function Timeline({ quotes }: { quotes: Quotes }) {
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
          <div><h2 className="font-display text-xl font-semibold">Your property portfolio</h2><p className="text-sm text-muted">From what you own now to {p.goals.targetProperties} properties by {retireAge}. Open a property to set its loan plan.</p></div>
          <div>
            <p className="field-label">Properties I want to own by {retireAge}</p>
            <div className="flex items-center gap-2">
              <button className="btn-quiet h-10 w-10 justify-center p-0 text-lg" aria-label="One fewer property" disabled={p.goals.targetProperties <= p.properties.length} onClick={() => update((d) => { d.goals.targetProperties = Math.max(d.properties.length, d.goals.targetProperties - 1); })}>−</button>
              <div className="w-20"><NumInput value={p.goals.targetProperties} onChange={(v) => update((d) => { d.goals.targetProperties = Math.max(d.properties.length, Math.min(15, v ?? d.properties.length)); })} min={p.properties.length} max={15} /></div>
              <button className="btn-quiet h-10 w-10 justify-center p-0 text-lg" aria-label="One more property" disabled={p.goals.targetProperties >= 15} onClick={() => update((d) => { d.goals.targetProperties = Math.min(15, d.goals.targetProperties + 1); })}>+</button>
            </div>
            <p className="mt-1 text-xs text-muted">You own {p.properties.length} now. This is also your goal on the Goals tab.</p>
          </div>
        </div>
        <ol className="relative mt-8 space-y-4 border-l-2 border-line pl-8">
          {p.properties.map((pr, i) => (
            <OwnedRow key={pr.id} pr={pr} n={i + 1} open={open === pr.id} onToggle={() => toggle(pr.id)} retireAge={retireAge} startAge={startAge} />
          ))}
          {plans.map((plan, k) => (
            <PlannedRow key={plan.id} plan={plan} k={k} n={p.properties.length + k + 1} open={open === plan.id} onToggle={() => toggle(plan.id)}
              bought={proj.purchases[k]} firstMissing={k === proj.purchases.length} block={proj.block} startYear={startYear} startAge={startAge} retireAge={retireAge} />
          ))}
        </ol>
        {need === 0 && <p className="mt-4 text-sm text-muted">You already own your target number of properties. Raise the target in Goals to plan the next one.</p>}
        <p className="mt-6 text-[11px] text-muted">A purchase happens in the first year your equity and savings cover the deposit and buying costs, and estimated borrowing power covers the loan. Prices grow at the rate you set until then. At retirement, an investment property that isn’t set to be paid off and still has a loan is sold; a home loan still owing is paid out from savings, then super once you can reach it at 60.</p>
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

function PlannedRow({ plan, k, n, open, onToggle, bought, firstMissing, block, startYear, startAge, retireAge }: {
  plan: PlannedPurchase; k: number; n: number; open: boolean; onToggle: () => void; bought?: { year: number; price: number }; firstMissing: boolean;
  block: ReturnType<typeof project>['block']; startYear: number; startAge: number; retireAge: number;
}) {
  const update = usePlanUpdate();
  const assumedRate = usePlanProfile().assumptions.newLoanRate;
  const fhbEligible = usePlanProfile().properties.length === 0 && k === 0;
  const set = (patch: Partial<PlannedPurchase>) => update((d) => { Object.assign(d.plannedPurchases![k], patch); });
  const late = plan.buyBy && bought && bought.year >= plan.buyBy;
  const io5 = plan.ioFirst5 !== false;
  const weeklyRent = (plan.price * plan.yieldPct) / 100 / 52;
  const chips = [plan.buyBy ? `Before ${plan.buyBy}` : 'As soon as possible', ...(plan.firstHome && fhbEligible ? ['First home'] : [plan.newBuild ? 'New build' : 'Established', io5 ? 'Interest-only for 5 years' : 'Principal and interest', plan.payOff ? `Paid off by ${retireAge}` : `Sold at ${retireAge} if a loan is left`])];
  const right = bought
    ? <p className={`text-right text-sm ${late ? 'text-clay' : ''}`}><span className="font-semibold">{bought.year}</span><br /><span className="text-muted">age {startAge + (bought.year - startYear)} · {money(bought.price, { compact: true })} then</span></p>
    : <p className="text-sm font-medium text-clay">Doesn’t fit before {retireAge}</p>;
  return (
    <RowShell n={n} tone={bought && !late ? 'planned' : 'missing'} title={plan.label || `Property ${n}`} sub={`Planned · ${money(plan.price, { compact: true })} in today’s money · ${plan.yieldPct}% yield, about ${money(weeklyRent)} a week rent`} right={right} chips={chips} open={open} onToggle={onToggle}>
      {!bought && firstMissing && block && (
        <p className="mb-3 text-sm text-clay">{block.reason === 'servicing' ? `Held back by borrowing power: lenders would want about ${money(block.monthlyShort, { compact: true })} a month more income. Try a cheaper price or a higher yield.` : `Needs about ${money(block.deposit, { compact: true })} for the deposit and costs; you’d have ${money(block.available, { compact: true })}.`}</p>
      )}
      {late && <p className="mb-3 text-sm text-clay">You want this before {plan.buyBy}, but the earliest it fits is {bought!.year}.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name (optional)">{(id) => <TextInput id={id} value={plan.label} onChange={(v) => set({ label: v })} placeholder={`Property ${n}`} />}</Field>
        <Field label="Price in today’s money">{(id) => <MoneyInput id={id} value={plan.price} onChange={(v) => set({ price: v ?? 0 })} />}</Field>
        <Field label="When">{(id) => <Select id={id} value={String(plan.buyBy ?? '')} onChange={(v) => set({ buyBy: v ? Number(v) : null })}
          options={[{ value: '', label: 'As soon as possible' }, ...Array.from({ length: Math.max(1, retireAge - startAge) }, (_, j) => startYear + 1 + j).map((y) => ({ value: String(y), label: `Before ${y}` }))]} />}</Field>
        <Field label="Interest rate" hint={plan.rate === assumedRate ? 'Same as your assumptions' : <button type="button" className="font-medium text-brass hover:underline" onClick={() => set({ rate: assumedRate })}>Use interest rate from assumptions ({assumedRate}%)</button>}>{(id) => <NumInput id={id} value={plan.rate} onChange={(v) => set({ rate: v ?? 0 })} step={0.05} suffix="%" />}</Field>
        <Field label="Rental yield" hint={`About ${money(weeklyRent)} a week`}>{(id) => <NumInput id={id} value={plan.yieldPct} onChange={(v) => set({ yieldPct: v ?? 0 })} step={0.1} suffix="%" />}</Field>
        <Field label="Price growth">{(id) => <NumInput id={id} value={plan.growth} onChange={(v) => set({ growth: v ?? 0 })} step={0.5} suffix="% / yr" />}</Field>
        <Field label="Deposit" hint="20% avoids mortgage insurance">{(id) => <NumInput id={id} value={plan.depositPct ?? 20} onChange={(v) => set({ depositPct: v ?? 20 })} step={1} suffix="%" />}</Field>
        <Field label="Stamp duty and buying costs">{(id) => <NumInput id={id} value={plan.costsPct ?? 5} onChange={(v) => set({ costsPct: v ?? 5 })} step={0.5} suffix="%" />}</Field>
        <Field label="Rates, insurance, upkeep" hint="Of the price, each year">{(id) => <NumInput id={id} value={plan.holdingPct ?? 1.2} onChange={(v) => set({ holdingPct: v ?? 1.2 })} step={0.1} suffix="%" />}</Field>
        <Field label="Property management" hint="Of the rent">{(id) => <NumInput id={id} value={plan.mgmtPct ?? 7} onChange={(v) => set({ mgmtPct: v ?? 7 })} step={0.5} suffix="%" />}</Field>
      </div>
      <div className="mt-5 space-y-3">
        {!plan.firstHome && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brass))]" checked={!!plan.newBuild} onChange={(e) => set({ newBuild: e.target.checked })} />
            <span className="text-sm"><span className="font-medium">This will be a new build and subject to negative gearing</span>
              <span className="block text-xs text-muted">Under the 2026 Budget rules, new builds keep negative gearing: rental losses reduce the tax on your salary. An established home bought now can’t do that from 1 July 2027; its losses carry forward against its own future rent instead.</span></span>
          </label>
        )}
        {fhbEligible && (
          <div className="rounded-xl border border-line p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brass))]" checked={!!plan.firstHome} onChange={(e) => set({ firstHome: e.target.checked, fhb: plan.fhb ?? { deposit5: true, noStampDuty: true } })} />
              <span className="text-sm"><span className="font-medium">I am using my first home buyer benefits</span>
                <span className="block text-xs text-muted">This becomes your first home to live in, so there’s no rent from it and your own rent stops when you move in.</span></span>
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
        <Toggle checked={!!plan.payOff} onChange={(v) => set({ payOff: v })} label={`Pay this property off by ${retireAge}?`}
          description={plan.payOff ? `Repayments are sized to clear the loan by ${retireAge}, so it’s kept for rent in retirement. Expect much higher repayments, especially if it’s bought late.` : `If a loan is still owing at ${retireAge}, we assume you sell it then and the money goes towards your retirement.`} />
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
  const investKept = next ? next.properties - p.properties.filter((x) => x.use === 'home').length : 0;
  const tile = (label: string, value: string, sub: string, tone = '') => (
    <div className="bg-surface p-5"><p className="text-xs text-muted">{label}</p><p className={`mt-0.5 font-display text-2xl font-semibold ${tone}`}>{value}</p><p className="text-xs text-muted">{sub}</p></div>
  );
  return (
    <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-1 lg:border-l lg:border-t-0">
      <div className="col-span-2 bg-raised px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted lg:col-span-1">At retirement ({p.goals.retirementAge}) · today’s money</div>
      {tile('Yearly income after retirement', money(p.goals.passiveIncome, { compact: true }), proj.runsOutAge == null ? `Lasts past ${life}` : `Runs out at ${proj.runsOutAge}`, proj.runsOutAge == null ? '' : 'text-clay')}
      {at && tile(p.household.hasPartner ? 'Combined net worth' : 'Net worth', c(at.netWorth), `${c(at.super)} in super · ${c(at.shares)} in shares`, 'text-gum')}
      {at && tile('Investment property cash flow', investKept > 0 ? `${propMonthly >= 0 ? '' : '−'}${money(Math.abs(propMonthly))}` : '$0', investKept > 0 ? `a month from the ${investKept} investment ${investKept === 1 ? 'property' : 'properties'} you keep, after loans and costs` : 'No investment properties kept. Set one to be paid off by retirement to keep its rent.', propMonthly < 0 ? 'text-clay' : '')}
      {at && tile('Super paid out in the first year', c(at.superDrawn), at.age >= 60 ? 'Super pays your income first' : `Super opens at 60, ${60 - at.age} ${60 - at.age === 1 ? 'year' : 'years'} after you stop`)}
      {tile('Cash on hand', money(p.goals.retireCash ?? p.finances.buffer ?? 0, { compact: true }), 'kept in the bank at all times. Set it in Goals.')}
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
  const hasCrypto = p.holdings.some((h) => h.kind === 'crypto' || h.exchange === 'CRYPTO');
  const hasShares = p.holdings.some((h) => !(h.kind === 'crypto' || h.exchange === 'CRYPTO'));
  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-xl font-semibold">Liquidation events</h2><p className="mt-1 max-w-2xl text-sm text-muted">Planned sales of part of your crypto or shares, to free up cash for a deposit or anything else. The money goes into your savings after an estimate of capital gains tax. They show on your charts as a red $.</p></div>
        <button className="btn-primary" disabled={!hasCrypto && !hasShares} onClick={() => update((d) => { (d.liquidations ??= []).push({ id: uid(), year: y0, asset: hasCrypto ? 'crypto' : 'shares', pct: 50 }); })}><Icon name="plus" className="h-4 w-4" />Add a liquidation event</button>
      </div>
      {list.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No liquidation events yet. Add one here, or from a suggestion in Your Wise Future.</p> : (
        <ul className="mt-6 space-y-3">
          {list.map((lq) => {
            const est = saleAfterTax(p, quotes, lq.asset, lq.pct / 100);
            return (
              <li key={lq.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <span className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-clay font-display font-bold text-white">$</span>
                  <div className="w-44"><Field label="Year">{(id) => <Select id={id} value={String(lq.year)} onChange={(v) => set(lq.id, { year: Number(v) })} options={Array.from({ length: lastYear - y0 + 1 }, (_, j) => y0 + j).map((y) => ({ value: String(y), label: y === y0 ? `This year (${y})` : String(y) }))} />}</Field></div>
                  <div className="w-36"><Field label="Sell">{(id) => <Select id={id} value={lq.asset} onChange={(v) => set(lq.id, { asset: v as Liquidation['asset'] })} options={[{ value: 'crypto', label: 'Crypto' }, { value: 'shares', label: 'Shares' }]} />}</Field></div>
                  <div className="w-36"><Field label="How much">{(id) => <Select id={id} value={String(lq.pct)} onChange={(v) => set(lq.id, { pct: Number(v) })} options={[10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 100].map((v) => ({ value: String(v), label: v === 100 ? 'All of it' : `${v}%` }))} />}</Field></div>
                  <div className="min-w-[12rem] flex-1"><Field label="Note (optional)">{(id) => <TextInput id={id} value={lq.note ?? ''} onChange={(v) => set(lq.id, { note: v })} placeholder="e.g. Deposit for property 2" />}</Field></div>
                  <button className="btn-ghost mb-0.5 p-2" aria-label="Remove liquidation event" onClick={() => update((d) => { d.liquidations = d.liquidations!.filter((x) => x.id !== lq.id); })}><Icon name="trash" className="h-4 w-4" /></button>
                </div>
                <p className="mt-3 text-sm text-muted">{est ? `At today’s prices: about ${money(est.gross, { compact: true })}, less about ${money(est.tax, { compact: true })} capital gains tax, leaves ${money(est.net, { compact: true })}. The plan uses the value in ${lq.year}.` : `You don’t hold any ${lq.asset} right now.`}</p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-5 text-[11px] text-muted">Capital gains tax is estimated at your marginal rate with the 50% discount for anything held over 12 months. Crypto left out of your plan is valued at today’s price. An accountant can help you time a sale. General information, not financial advice.</p>
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
        <button className="btn-primary" onClick={() => update((d) => { (d.gifts ??= []).push({ id: uid(), year: y0 + 1, amount: 0, from: '', kind: 'gift' }); })}><Icon name="plus" className="h-4 w-4" />Add a gift or inheritance</button>
      </div>
      {list.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing here yet. If someone has said they’ll help, add it so your plan can count on it.</p> : (
        <ul className="mt-6 space-y-3">
          {list.map((gft) => (
            <li key={gft.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-36"><Field label="Type">{(id) => <Select id={id} value={gft.kind} onChange={(v) => set(gft.id, { kind: v as Gift['kind'] })} options={[{ value: 'gift', label: 'Gift' }, { value: 'inheritance', label: 'Inheritance' }]} />}</Field></div>
                <div className="min-w-[10rem] flex-1"><Field label="From">{(id) => <TextInput id={id} value={gft.from} onChange={(v) => set(gft.id, { from: v })} placeholder="e.g. Mum and Dad" />}</Field></div>
                <div className="w-44"><Field label="Amount">{(id) => <MoneyInput id={id} value={gft.amount || null} onChange={(v) => set(gft.id, { amount: v ?? 0 })} />}</Field></div>
                <div className="w-44"><Field label="Year">{(id) => <Select id={id} value={String(gft.year)} onChange={(v) => set(gft.id, { year: Number(v) })} options={Array.from({ length: lastYear - y0 + 1 }, (_, j) => y0 + j).map((y) => ({ value: String(y), label: y === y0 ? `This year (${y})` : String(y) }))} />}</Field></div>
                <button className="btn-ghost mb-0.5 p-2" aria-label="Remove" onClick={() => update((d) => { d.gifts = d.gifts!.filter((x) => x.id !== gft.id); })}><Icon name="trash" className="h-4 w-4" /></button>
              </div>
              <div className="mt-3"><Field label="What it’s for (optional)">{(id) => <TextInput id={id} value={gft.note ?? ''} onChange={(v) => set(gft.id, { note: v })} placeholder="e.g. Towards the deposit on our next property" />}</Field></div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-[11px] text-muted">Gifts in Australia aren’t usually taxed, but some lenders ask for a gift letter. Amounts are in the dollars of the year you expect them.</p>
    </section>
  );
}

/* ---------- Shares plan ---------- */
function SharesPlan({ quotes }: { quotes: Quotes }) {
  const p = usePlanProfile();
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
  const over = cap != null && proj.shareMonthly > cap.monthly + 1;
  // With a delayed start there are fewer years to invest, so work the monthly amount out from the projection itself
  const neededDelayed = useMemo(() => {
    const target = p.goals.sharesTarget ?? 0;
    if (!p.goals.shareStartAfter || target <= 0) return null;
    const at = (v: number) => { const x: typeof p = JSON.parse(JSON.stringify(p)); x.goals.shareMonthly = v; return project(x, quotes).sharesAtRetire / Math.pow(1 + p.assumptions.inflation / 100, years); };
    if (at(30000) < target) return null;
    let lo = 0, hi = 30000;
    for (let k = 0; k < 16; k++) { const mid = (lo + hi) / 2; if (at(mid) >= target) hi = mid; else lo = mid; }
    return Math.ceil(hi / 10) * 10;
  }, [p, quotes, years]);
  const needed = neededDelayed ?? required;
  const useAmount = (v: number) => update((d) => { d.goals.shareMonthly = Math.round(v); });
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Your share plan</h2>
        <p className="mt-1 text-sm text-muted">Shares only. Crypto is tracked in its own tab but left out of the plan.</p>
        <div className="mt-5"><p className="text-xs text-muted">Shares today</p><p className="font-display text-2xl font-semibold">{money(sharesNow)}</p></div>
        <p className="mt-5 text-sm">Plan your shares one of two ways: set a goal for retirement, or set how much you’ll invest each month. We’ll work out the other.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Retirement goal" hint="What you’d like your shares to be worth when you stop work, in today’s money. Leave blank if you don’t have one.">{(id) => <MoneyInput id={id} value={p.goals.sharesTarget ?? null} onChange={(v) => update((d) => { d.goals.sharesTarget = v; d.goals.shareMonthly = null; })} />}</Field>
          <Field label="Monthly investment" hint={auto && p.goals.sharesTarget ? 'Worked out from your goal. Type an amount to set your own instead.' : 'The amount goes up with inflation each year.'}>{(id) => <MoneyInput id={id} value={auto ? (p.goals.sharesTarget ? Math.round(required) : null) : p.goals.shareMonthly ?? null} onChange={(v) => {
            // Typing a monthly amount works the retirement goal out from it, so the two boxes always agree
            const x: typeof p = JSON.parse(JSON.stringify(p)); x.goals.shareMonthly = v ?? 0;
            const reach = project(x, quotes).sharesAtRetire / Math.pow(1 + p.assumptions.inflation / 100, years);
            update((d) => { d.goals.shareMonthly = v ?? 0; d.goals.sharesTarget = v ? Math.round(reach / 1000) * 1000 : null; });
          }} suffix="/ month" />}</Field>
        </div>
        {(p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - p.properties.length)).length > 0 && (
          <div className="mt-4 rounded-xl border border-line p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--brass))]" checked={!!p.goals.shareStartAfter}
                onChange={(e) => update((d) => { d.goals.shareStartAfter = e.target.checked ? 1 : null; if (e.target.checked && d.goals.shareMonthly == null) d.goals.shareMonthly = Math.round(proj.shareMonthly || required); })} />
              <span className="text-sm">I don’t want to invest in shares until after I’ve bought
                {p.goals.shareStartAfter ? (
                  <select className="mx-1.5 rounded-md border border-line bg-surface px-1.5 py-0.5 text-sm" value={p.goals.shareStartAfter} onClick={(e) => e.preventDefault()} onChange={(e) => update((d) => { d.goals.shareStartAfter = Number(e.target.value); })}>
                    {(p.plannedPurchases ?? []).slice(0, Math.max(0, p.goals.targetProperties - p.properties.length)).map((pp, k) => <option key={pp.id} value={k + 1}>{pp.label || `property ${p.properties.length + k + 1}`}</option>)}
                  </select>
                ) : ' my next property'}.
                <span className="block text-xs text-muted">Your monthly amount stays the same; it just starts once that purchase is done.{p.goals.shareStartAfter && proj.purchases[p.goals.shareStartAfter - 1] ? ` On these numbers that’s ${proj.purchases[p.goals.shareStartAfter - 1].year + 1}.` : p.goals.shareStartAfter ? ' On these numbers that purchase doesn’t happen before you stop work, so no shares would be bought.' : ''}</span>
              </span>
            </label>
          </div>
        )}
        <div className="mt-5 rounded-xl bg-raised p-4 ring-1 ring-line">
          {auto && p.goals.sharesTarget ? (<>
            <p className="text-sm text-muted">To reach {money(p.goals.sharesTarget, { compact: true })} by {p.goals.retirementAge} at {p.assumptions.shareReturn}% a year, you’d invest about</p>
            <p className="font-display text-3xl font-semibold">{money(required)} <span className="text-base font-normal text-muted">a month</span></p>
            <p className="text-xs text-muted">{money(required * 12)} a year in today’s money, rising with inflation, for {years} years.</p>
          </>) : !auto && proj.shareMonthly > 0 ? (<>
            <p className="text-sm text-muted">By investing {money(proj.shareMonthly)} a month, you’d have about</p>
            <p className="font-display text-3xl font-semibold">{money(realAtRetire, { compact: true })} <span className="text-base font-normal text-muted">by {p.goals.retirementAge}</span></p>
            <p className="text-xs text-muted">In today’s money, at {p.assumptions.shareReturn}% a year.{p.goals.sharesTarget ? (realAtRetire >= p.goals.sharesTarget * 0.98 ? ` That meets your ${money(p.goals.sharesTarget, { compact: true })} target.` : ` That’s short of your ${money(p.goals.sharesTarget, { compact: true })} target.`) : ''}{proj.points.some((x) => x.sharePlanned > 0 && x.shareContribution < x.sharePlanned * 0.98) ? ' Some years your savings can’t cover the full amount, so less goes in.' : ''}</p>
            {p.goals.sharesTarget && realAtRetire < p.goals.sharesTarget * 0.98 ? <button className="btn-quiet mt-3 text-sm" onClick={() => update((d) => { d.goals.shareMonthly = d.goals.shareStartAfter ? needed : null; })}>Invest what’s needed for my target instead ({money(needed)} a month{p.goals.shareStartAfter ? ', from the later start' : ''})</button> : null}
          </>) : (
            <p className="text-sm text-muted">Enter a share portfolio value for retirement, or how much you’d invest each month, to see where it gets you by {p.goals.retirementAge}.</p>
          )}
        </div>
        {over && cap && (
          <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-clay/50 bg-clay/10 p-4">
            <Icon name="x" className="mt-0.5 h-5 w-5 shrink-0 text-clay" />
            <div>
              <p className="font-semibold">This share plan stops your property purchases</p>
              <p className="mt-1 text-sm">Based on your property purchasing goals, the maximum you can invest in shares is <span className="font-semibold">{money(cap.monthly)} a month</span>. That grows to about {money(cap.sharesAtRetireReal, { compact: true })} by {p.goals.retirementAge} in today’s money.</p>
              <button className="btn-quiet mt-3" onClick={() => useAmount(cap.monthly)}>Use {money(cap.monthly)} a month</button>
            </div>
          </div>
        )}
        {!over && cap && <p className="mt-5 text-sm text-gum">Your property plan still works. You could invest up to {money(cap.monthly)} a month before it starts delaying a purchase.</p>}

      </section>
      <ShareTradeOff quotes={quotes} current={proj.shareMonthly} required={required} cap={cap?.monthly ?? null} onUse={useAmount} />
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
      <h3 className="font-display text-lg font-semibold">What your share plan does to your property portfolio</h3>
      <p className="mt-1 text-sm text-muted">Every dollar into shares comes out of the savings that fund your deposits. Here’s when each property lands at different monthly amounts.</p>
      {planned.length === 0 ? <p className="mt-6 text-sm text-muted">You haven’t planned any more properties. Raise “Properties owned by retirement” in Goals to see the trade-off.</p> : (
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

function Projections({ quotes, onLock, onAskUnlock }: { quotes: Quotes; onLock: () => void; onAskUnlock: () => void }) {
  const mode = usePlanMode();
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-display text-2xl font-semibold">Your Wise Future</h2>
                <p className={`text-sm font-medium ${proj.runsOutAge != null ? 'text-clay' : 'text-gum'}`}>{proj.runsOutAge != null ? `At ${money(p.goals.passiveIncome, { compact: true })} a year, your money runs out at ${proj.runsOutAge}.` : `At ${money(p.goals.passiveIncome, { compact: true })} a year, your money lasts to ${p.goals.lifeExpectancy ?? 90}.`}</p></div>
              <div className="flex flex-wrap items-center justify-end gap-3"><LiveToAge /><DollarsToggle value={dollars} onChange={setDollars} /></div>
            </div>
            {mode === 'live' && (
              <div className="mt-3">
                {p.planLocked
                  ? <button className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-surface" onClick={onAskUnlock}><Icon name="lock" className="h-4 w-4" />Plan locked · unlock</button>
                  : <button className="inline-flex items-center gap-2 rounded-xl border border-ink/70 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink hover:text-surface" onClick={onLock}><Icon name="lock" className="h-4 w-4" />Lock my plan</button>}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <Segmented size="sm" label="Chart" value={view} onChange={setView} options={[{ value: 'worth', label: 'Net worth' }, { value: 'flow', label: 'Cash flow' }]} />
              {view === 'worth' && <SeriesToggles hidden={hidden} onChange={setHidden} crypto={proj.points.some((x) => x.crypto > 0)} />}
            </div>
            <p className="mt-2 text-xs text-muted"><DollarsNote value={dollars} />{proj.cryptoExcluded > 0 && ` Crypto (${money(proj.cryptoExcluded, { compact: true })} today) is left out because its future value can’t be estimated.`}</p>
            {view === 'worth' ? (<>
              <div className="mt-4 -ml-2"><WealthChart points={dollars === 'real' ? toReal(pts, p.assumptions.inflation) : pts} retireYear={proj.retireYear} height={340} real={dollars === 'real'} hidden={hidden} runsOutYear={runsOutYear} /></div>
              <MarkerKey points={pts} />
            </>) : (<>
              <div className="mt-4 -ml-2"><CashFlowChart points={dollars === 'real' ? toReal(pts, p.assumptions.inflation) : pts} retireYear={proj.retireYear} height={340} real={dollars === 'real'} /></div>
              <CashFlowKey />
            </>)}
          </div>
          <RetirementMetrics proj={proj} />
        </div>
      </section>

      <PlanCheckBox check={check} />

      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">What happens, year by year</h2>
        <p className="mt-1 text-sm text-muted">Worked out from your figures, goals and assumptions. Change any of them and this updates.</p>
        <p className="mt-4 text-xs text-muted">Milestone years only. Under each one: your cash at year end (including your {money(proj.buffer, { compact: true })} emergency fund), rent collected and what goes into shares, {dollars === 'real' ? 'in today’s money' : 'in the dollars of that year'}.</p>
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
        <p className="mt-5 text-[11px] text-muted">In retirement your yearly income is paid from super first (it opens at 60; a minimum amount must come out each year, from 4% rising with age), then rent and savings, then by selling shares, then by selling investment properties newest first. Money not needed straight away is invested in shares. Your home is kept. Super contributions are 12% of salary, capped at $32,500 a year, less 15% tax. Sale figures allow for selling costs and capital gains tax at an estimated rate. Estimates only, not financial advice.</p>
      </section>

    </div>
  );
}

