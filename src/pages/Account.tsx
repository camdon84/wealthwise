import { useState } from 'react';
import { useApp, storageKind } from '../lib/store';
import { Field, Icon, NumInput, TextInput, Toggle } from '../components/ui';

export function Account() {
  const p = useApp((s) => s.profile)!;
  const session = useApp((s) => s.session)!;
  const update = useApp((s) => s.update);
  const signOut = useApp((s) => s.signOut);
  const hh = p.household;
  return (
    <div className="max-w-3xl space-y-6">
      <div><h1 className="font-display text-3xl font-semibold sm:text-4xl">Account</h1><p className="text-muted">Your sign-in and who’s in your plan.</p></div>
      <section className="panel p-6">
        <p className="font-medium">You</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="First name">{(id) => <TextInput id={id} value={hh.you.name} onChange={(v) => update((d) => { d.household.you.name = v; })} />}</Field>
          <Field label="Last name">{(id) => <TextInput id={id} value={hh.you.lastName ?? ''} onChange={(v) => update((d) => { d.household.you.lastName = v; })} />}</Field>
          <Field label="Age">{(id) => <NumInput id={id} value={hh.you.age} onChange={(v) => update((d) => { d.household.you.age = v; })} />}</Field>
          <div><p className="field-label">Email</p><p className="py-2.5 text-[15px]">{session.demo ? 'Demo account' : session.email}</p></div>
        </div>
      </section>
      <section className="panel p-6">
        <Toggle checked={hh.hasPartner} onChange={(v) => update((d) => { d.household.hasPartner = v; })} label="I’m planning with a partner" description="Their income, super and share of each asset count toward the plan. Add their details in My Details." />
        {hh.hasPartner && (
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Field label="Partner’s first name">{(id) => <TextInput id={id} value={hh.partner.name} onChange={(v) => update((d) => { d.household.partner.name = v; })} />}</Field>
            <Field label="Partner’s last name">{(id) => <TextInput id={id} value={hh.partner.lastName ?? ''} onChange={(v) => update((d) => { d.household.partner.lastName = v; })} />}</Field>
            <Field label="Partner’s age">{(id) => <NumInput id={id} value={hh.partner.age} onChange={(v) => update((d) => { d.household.partner.age = v; })} />}</Field>
          </div>
        )}
      </section>
      {!session.demo && session.userId !== 'sandbox' && storageKind === 'api' && <ChangePassword />}
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-6">
        <div><p className="font-medium">Setup questionnaire</p><p className="text-sm text-muted">Go back through every question from the start.</p></div>
        <button className="btn-quiet" onClick={() => update((d) => { d.onboarded = false; d.onboardingStep = 0; })}><Icon name="back" className="h-4 w-4" />Go through setup again</button>
      </section>
      <button className="btn-ghost" onClick={signOut}><Icon name="out" className="h-4 w-4" />Sign out</button>
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    setMsg(null);
    if (next.length < 8) return setMsg({ ok: false, text: 'Use a new password of at least 8 characters.' });
    const res = await fetch('/api/password', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ current, next }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setMsg({ ok: true, text: 'Password changed.' }); setCurrent(''); setNext(''); } else setMsg({ ok: false, text: data.error || 'That didn’t work. Try again.' });
  };
  return (
    <section className="panel p-6">
      <p className="font-medium">Change password</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Current password">{(id) => <TextInput id={id} type="password" value={current} onChange={setCurrent} autoComplete="current-password" />}</Field>
        <Field label="New password">{(id) => <TextInput id={id} type="password" value={next} onChange={setNext} autoComplete="new-password" />}</Field>
        <button className="btn-primary" onClick={save} disabled={!current || !next}>Change password</button>
      </div>
      {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? 'text-gum' : 'text-clay'}`}>{msg.text}</p>}
    </section>
  );
}
