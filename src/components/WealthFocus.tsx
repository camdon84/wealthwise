import type { Goals } from '../lib/types';

export type WealthFocus = NonNullable<Goals['wealthFocus']>;
export const FOCUS: { value: WealthFocus; label: string; text: string }[] = [
  { value: 'property', label: 'Mostly property', text: 'I’m more heavily focused on property.' },
  { value: 'shares', label: 'Mostly shares', text: 'I’m more heavily focused on shares and equities.' },
  { value: 'balanced', label: 'A balance of both', text: 'I want a balance of property and shares.' },
];

/** "How do you prefer to build wealth?" Used in setup and on the Goals tab; it shapes Wise's ideas. */
export function WealthFocusPicker({ value, onChange }: { value: Goals['wealthFocus']; onChange: (v: WealthFocus) => void }) {
  return (
    <div>
      <p className="field-label">How do you prefer to build wealth?</p>
      <p className="-mt-1 mb-2 text-xs text-muted">Wise tailors its ideas to this. For example, someone focused on shares won’t be told to sell shares to buy more property.</p>
      <div role="radiogroup" aria-label="How do you prefer to build wealth?" className="grid gap-2 sm:grid-cols-3">
        {FOCUS.map((f) => (
          <button key={f.value} type="button" role="radio" aria-checked={value === f.value} onClick={() => onChange(f.value)}
            className={`rounded-xl p-3 text-left ring-1 transition-colors ${value === f.value ? 'bg-brass/10 ring-2 ring-brass' : 'ring-line hover:ring-brass/50'}`}>
            <span className="block font-semibold">{f.label}</span><span className="block text-xs text-muted">{f.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
