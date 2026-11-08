import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CURRENCIES, parseMoney } from '../lib/format';

export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">{label}</label>
      {children(id)}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function MoneyInput({ id, value, onChange, placeholder, suffix, disabled }: { id?: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string; suffix?: string; disabled?: boolean }) {
  const fmt = (v: number | null) => (v == null ? '' : v.toLocaleString('en-AU', { maximumFractionDigits: 2 }));
  const [text, setText] = useState(fmt(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(fmt(value)); }, [value, focus]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
      <input
        id={id} inputMode="decimal" className={`input pl-7 pr-14 ${disabled ? 'cursor-not-allowed opacity-50' : ''}`} placeholder={placeholder ?? '0'} value={text} disabled={disabled} readOnly={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); setText(fmt(value)); }}
        onChange={(e) => { setText(e.target.value); onChange(parseMoney(e.target.value)); }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
    </div>
  );
}

export function NumInput({ id, value, onChange, placeholder, suffix, step = 1, min, max }: { id?: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string; suffix?: string; step?: number; min?: number; max?: number }) {
  return (
    <div className="relative">
      <input id={id} type="number" inputMode="decimal" className={`input ${suffix ? 'pr-12' : ''}`} placeholder={placeholder} value={value ?? ''} step={step} min={min} max={max}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
    </div>
  );
}

export function TextInput({ id, value, onChange, placeholder, type = 'text', autoComplete }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoComplete?: string }) {
  return <input id={id} type={type} className="input" placeholder={placeholder} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />;
}

export function Select<T extends string>({ id, value, onChange, options }: { id?: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select id={id} className="input appearance-none bg-[length:12px] bg-no-repeat bg-[right_12px_center] pr-8" value={value} onChange={(e) => onChange(e.target.value as T)}
      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.6' fill='none'/%3E%3C/svg%3E")` }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/**
 * A row of options. `scroll`: on phones and tablets the row scrolls sideways instead of squashing or overlapping
 * (the chosen option scrolls into view); from `xl` it stretches to fill the width like `stretch`. `scroll="fit"` keeps its natural width when there's room.
 */
export function Segmented<T extends string>({ value, onChange, options, size = 'md', label, stretch, scroll }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; size?: 'xs' | 'sm' | 'md'; label?: string; stretch?: boolean; scroll?: boolean | 'fit' }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scroll || !row.current) return;
    const on = row.current.querySelector<HTMLElement>('[aria-checked="true"]');
    if (on) row.current.scrollTo({ left: on.offsetLeft - (row.current.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  }, [scroll, value]);
  if (scroll) return (
    <div ref={row} role="radiogroup" aria-label={label} className={`no-scrollbar flex min-w-0 snap-x overflow-x-auto rounded-xl border border-line bg-raised p-1 ${scroll === 'fit' ? 'max-w-full' : 'w-full xl:flex-1'}`}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`shrink-0 snap-start whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${scroll === 'fit' ? '' : 'xl:flex-1'} ${value === o.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
  if (size === 'xs') return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line/70 p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-4 transition-colors ${value === o.value ? 'bg-ink/10 text-ink' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
  return (
    <div role="radiogroup" aria-label={label} className={`${stretch ? 'flex min-w-0 flex-1' : 'inline-flex'} rounded-xl border border-line bg-raised p-1`}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`${stretch ? 'flex-1 whitespace-nowrap' : o.label.length <= 14 ? 'whitespace-nowrap' : ''} rounded-lg ${size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-2 text-sm'} font-medium transition-colors ${value === o.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-start gap-3 text-left">
      <span className={`mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? 'bg-brass' : 'bg-line'}`}>
        <span className={`h-5 w-5 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted mt-0.5">{description}</span>}
      </span>
    </button>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-xl font-semibold mt-0.5">{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${tone === 'up' ? 'text-gum' : tone === 'down' ? 'text-clay' : 'text-muted'}`}>{sub}</p>}
    </div>
  );
}

export function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const paths: Record<string, ReactNode> = {
    overview: <path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z" />,
    property: <path d="M3 11l9-7 9 7v10H3zM9 21v-6h6v6" />,
    coin: <><circle cx="12" cy="12" r="8.5" /><path d="M10 8h3.2a2 2 0 0 1 0 4H10m0 0h3.6a2 2 0 0 1 0 4H10V8m1.5-2v2m0 8v2" /></>,
    shares: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
    plan: <path d="M4 20V4M4 20h16M8 16c3-1 4-6 7-7s4-3 5-5" />,
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    unlock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
    renovate: <path d="M14 4l6 6-9 9H5v-6zM12 6l6 6" />,
    profile: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-4 4-6 8-6s7 2 8 6" />,
    sun: <path d="M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />,
    moon: <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />,
    out: <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />,
    plus: <path d="M12 5v14M5 12h14" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    check: <path d="M5 12l5 5L20 7" />,
    actions: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
    upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    back: <path d="M19 12H5M11 6l-6 6 6 6" />,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
    news: <path d="M4 5h13v14H6a2 2 0 01-2-2zM17 9h3v8a2 2 0 01-2 2M8 9h5M8 13h5" />,
    trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    details: <path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h4" />,
    family: <path d="M8 11a3 3 0 100-6 3 3 0 000 6zM17 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2 20c.6-3.4 3-5 6-5s5.4 1.6 6 5M14 20c.3-2.3 1.6-3.8 3.5-3.8S21 17.7 21.5 20" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="rgb(var(--brass))" />
        <path d="M7 21l4.5-9 4.5 7 4.5-11L25 21" fill="none" stroke="rgb(var(--ground))" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight">WealthWise</span>
    </span>
  );
}

/** Wide price box with its currency, for share and crypto buy prices. */
export function PriceInput({ id, value, onChange, currency, onCurrency }: { id?: string; value: number | null; onChange: (v: number | null) => void; currency: string; onCurrency: (c: string) => void }) {
  const fmt = (v: number | null) => (v == null ? '' : v.toLocaleString('en-AU', { maximumFractionDigits: 6 }));
  const [text, setText] = useState(fmt(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(fmt(value)); }, [value, focus]);
  return (
    <div className="flex rounded-lg border border-line bg-raised focus-within:border-brass focus-within:ring-2 focus-within:ring-brass/25">
      <input id={id} inputMode="decimal" className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus:outline-none" placeholder="0.00" value={text}
        onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); setText(fmt(value)); }}
        onChange={(e) => { setText(e.target.value); onChange(parseMoney(e.target.value)); }} />
      <select aria-label="Currency" className="rounded-r-lg border-l border-line bg-transparent px-2 text-sm font-medium text-ink focus:outline-none" value={currency} onChange={(e) => onCurrency(e.target.value)}>
        {CURRENCIES.map((c) => <option key={c.code} value={c.code} title={c.label}>{c.code}</option>)}
      </select>
    </div>
  );
}
