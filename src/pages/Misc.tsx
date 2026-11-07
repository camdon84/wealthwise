import { useApp } from '../lib/store';
import { Field, Icon, MoneyInput, NumInput } from '../components/ui';

export function Renovate() {
  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-semibold sm:text-4xl">Renovator</h1><p className="text-muted">Plan an equity uplift, room by room.</p></div>
      <div className="panel p-8">
        <p className="font-display text-xl font-semibold">Coming in the next build</p>
        <ul className="mt-4 space-y-2 text-sm text-muted">
          <li>Pick a property and tick the rooms to renovate, with typical Australian cost ranges for each.</li>
          <li>Set a budget per room and see the estimated value uplift, new equity and borrowing power.</li>
          <li>Get a warning before you over-capitalise for the street.</li>
          <li>Upload a photo of a room and get an AI image of how it could look renovated, in the style you pick.</li>
        </ul>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const p = useApp((s) => s.profile)!;
  const session = useApp((s) => s.session)!;
  const update = useApp((s) => s.update);
  const g = p.goals;
  return (
    <div className="max-w-3xl space-y-6">
      <div><h1 className="font-display text-3xl font-semibold sm:text-4xl">Profile</h1><p className="text-muted">{session.email}{session.demo ? ' · demo account' : ''}</p></div>
      <section className="panel p-6">
        <p className="font-medium">Goals</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Stop working at">{(id) => <NumInput id={id} value={g.retirementAge} onChange={(v) => update((d) => { d.goals.retirementAge = v ?? 60; })} suffix="years" />}</Field>
          <Field label="Income wanted then">{(id) => <MoneyInput id={id} value={g.passiveIncome} onChange={(v) => update((d) => { d.goals.passiveIncome = v ?? 0; })} suffix="/ yr" />}</Field>
          <Field label="Properties to own">{(id) => <NumInput id={id} value={g.targetProperties} onChange={(v) => update((d) => { d.goals.targetProperties = v ?? 0; })} />}</Field>
        </div>
      </section>
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-6">
        <div><p className="font-medium">Your setup answers</p><p className="text-sm text-muted">Income, spending, debts, cash, super and household details.</p></div>
        <button className="btn-quiet" onClick={() => update((d) => { d.onboarded = false; d.onboardingStep = 0; })}><Icon name="back" className="h-4 w-4" />Go through setup again</button>
      </section>
    </div>
  );
}
