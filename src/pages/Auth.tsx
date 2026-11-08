import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/store';
import { Field, Logo, Segmented, TextInput } from '../components/ui';

export function Auth() {
  const { signIn, signUp, signInDemo } = useApp();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && !name.trim()) return setError('Enter your first name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.');
    if (pw.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    try { mode === 'signup' ? await signUp(name, email, pw) : await signIn(email, pw); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-surface lg:flex lg:flex-col lg:justify-between p-12 border-r border-line">
        <Logo />
        <div className="max-w-lg">
          <h1 className="font-display text-5xl font-semibold leading-[1.05]">See every property, share and dollar on one plan.</h1>
          <p className="mt-5 text-lg text-muted">Plan when to buy each property, how much to invest and when you can retire.</p>
        </div>
        <HeroTimeline />
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10"><Logo /></div>
          <h2 className="font-display text-3xl font-semibold">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
          <p className="mt-1 text-muted">{mode === 'signup' ? 'Setup takes about ten minutes. Your answers save as you go.' : 'Sign in to your plan.'}</p>
          <div className="mt-6"><Segmented value={mode} onChange={(v) => { setMode(v); setError(''); }} options={[{ value: 'signup', label: 'Create account' }, { value: 'signin', label: 'Sign in' }]} /></div>
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {mode === 'signup' && <Field label="First name">{(id) => <TextInput id={id} value={name} onChange={setName} autoComplete="given-name" />}</Field>}
            <Field label="Email">{(id) => <TextInput id={id} type="email" value={email} onChange={setEmail} autoComplete="email" />}</Field>
            <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>{(id) => <TextInput id={id} type="password" value={pw} onChange={setPw} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />}</Field>
            {error && <p role="alert" className="text-sm text-clay">{error}</p>}
            <button type="submit" className="btn-primary w-full py-3" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          </form>
          <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <button className="btn-quiet w-full py-3" onClick={() => signInDemo()}>Explore the demo account</button>
          <p className="mt-3 text-center text-xs text-muted">A sample household with three properties and a share portfolio.</p>
        </div>
      </section>
    </div>
  );
}

function HeroTimeline() {
  // A static sketch of the plan the app produces: equity climbing, purchases marked, retirement line.
  const pts = Array.from({ length: 24 }, (_, i) => [i * 20, 150 - Math.pow(i / 23, 1.7) * 120 - Math.sin(i / 2) * 3]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
  return (
    <svg viewBox="0 0 470 180" className="w-full max-w-xl" aria-hidden="true">
      {[40, 80, 120].map((y) => <line key={y} x1="0" x2="470" y1={y} y2={y} stroke="rgb(var(--line))" strokeDasharray="2 4" />)}
      <path d={`${line} L460 170 L0 170 Z`} fill="rgb(var(--gum) / 0.14)" />
      <path d={line} fill="none" stroke="rgb(var(--gum))" strokeWidth="2.2" />
      {[5, 11, 16].map((i) => (
        <g key={i}><circle cx={pts[i][0]} cy={pts[i][1]} r="5" fill="rgb(var(--surface))" stroke="rgb(var(--brass))" strokeWidth="2" />
          <text x={pts[i][0]} y={pts[i][1] - 12} textAnchor="middle" fontSize="11" fill="rgb(var(--muted))" fontFamily="Figtree">Buy #{[3, 4, 5][[5, 11, 16].indexOf(i)]}</text></g>
      ))}
      <line x1="380" x2="380" y1="10" y2="170" stroke="rgb(var(--brass))" strokeDasharray="4 4" />
      <text x="386" y="22" fontSize="11" fill="rgb(var(--brass))" fontFamily="Figtree">Stop work at 58</text>
    </svg>
  );
}
