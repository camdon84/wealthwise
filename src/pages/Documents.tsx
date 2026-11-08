import { useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { money, pct } from '../lib/format';
import { uid } from '../lib/defaults';
import { longDate } from '../lib/rates';
import type { DocKind, Holding, Profile, Property } from '../lib/types';
import { Field, Icon, MoneyInput, NumInput, Select } from '../components/ui';

const live = (import.meta as any).env?.VITE_STORAGE === 'api';

export const DOC_KINDS: { value: DocKind; label: string }[] = [
  { value: 'valuation', label: 'Property valuation' },
  { value: 'super', label: 'Super statement' },
  { value: 'loan', label: 'Loan or mortgage statement' },
  { value: 'rental', label: 'Rental statement' },
  { value: 'payslip', label: 'Payslip' },
  { value: 'trades', label: 'Share trades or holdings' },
  { value: 'other', label: 'Something else' },
];
const nice = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? longDate(d) : d || '');
const SAMPLES = [
  { file: 'valuation-sample.pdf', kind: 'valuation' as DocKind, label: 'a valuation' },
  { file: 'super-sample.pdf', kind: 'super' as DocKind, label: 'a super statement' },
  { file: 'loan-sample.pdf', kind: 'loan' as DocKind, label: 'a loan statement' },
];

/* ---------- financial year checklist ---------- */
export function endedFY(d = new Date()) { const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y - 1}–${String(y).slice(2)}`; }
export function eofyItems(p: Profile) {
  const hh = p.household;
  const items = [
    { id: 'super-you', label: `${hh.you.name || 'Your'}${hh.you.name ? '’s' : ''} super balance and return`, kind: 'super' as DocKind },
    ...(hh.hasPartner ? [{ id: 'super-partner', label: `${hh.partner.name || 'Partner'}${hh.partner.name ? '’s' : ''} super balance and return`, kind: 'super' as DocKind }] : []),
    ...(p.properties.some((x) => x.loans.length) ? [{ id: 'loans', label: 'Loan balances and interest rates', kind: 'loan' as DocKind }] : []),
    ...(p.properties.some((x) => x.use === 'investment') ? [{ id: 'rental', label: 'Rent from your investment properties', kind: 'rental' as DocKind }] : []),
    { id: 'income', label: 'Salary for the new financial year', kind: 'payslip' as DocKind },
  ];
  const fy = endedFY();
  const done = p.eofy?.fy === fy ? p.eofy.done : [];
  return { fy, items, done, outstanding: items.filter((i) => !done.includes(i.id)) };
}
const markDone = (d: Profile, id: string) => {
  const fy = endedFY();
  if (d.eofy?.fy !== fy) d.eofy = { fy, done: [] };
  if (!d.eofy.done.includes(id)) d.eofy.done.push(id);
};

/* ---------- matching what the AI read to the household ---------- */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(street|st|road|rd|avenue|ave|esplanade|esp|drive|dr|court|ct|parade|pde)\b/g, '').replace(/\s+/g, ' ').trim();
function matchProperty(p: Profile, address?: string | null): Property | undefined {
  if (!address) return undefined;
  const a = norm(address);
  let best: Property | undefined, score = 0;
  for (const pr of p.properties) {
    const words = norm(`${pr.address} ${pr.suburb}`).split(' ').filter(Boolean);
    const hit = words.filter((w) => a.includes(w)).length / Math.max(1, words.length);
    if (hit > score) { score = hit; best = pr; }
  }
  return score >= 0.5 ? best : undefined;
}
function matchPerson(p: Profile, name?: string | null): 'you' | 'partner' | undefined {
  const n = (name || '').toLowerCase();
  if (!n) return undefined;
  if (p.household.hasPartner && p.household.partner.name && n.includes(p.household.partner.name.toLowerCase())) return 'partner';
  if (p.household.you.name && n.includes(p.household.you.name.toLowerCase())) return 'you';
  return undefined;
}

interface Change { id: string; label: string; detail: string; apply: (d: Profile) => void; eofy?: string }
interface Reading { fileName: string; detectedType: DocKind; summary: string; [k: string]: any }

function proposeChanges(p: Profile, r: Reading, pick: { property?: string; person?: 'you' | 'partner' }): { changes: Change[]; needs?: 'property' | 'person' } {
  const out: Change[] = [];
  const t = r.detectedType;
  const prop = (addr?: string | null) => p.properties.find((x) => x.id === pick.property) ?? matchProperty(p, addr);
  if (t === 'valuation' && r.valuation?.value) {
    const pr = prop(r.valuation.address);
    if (!pr) return { changes: [], needs: 'property' };
    const v = r.valuation;
    out.push({ id: 'val', label: `Add a valuation of ${money(v.value)} to ${pr.address}`, detail: `${v.valuer ? `By ${v.valuer}, ` : ''}dated ${nice(v.date) || 'today'}. It becomes one of the sources behind the property’s estimated value.`,
      apply: (d) => d.properties.find((x) => x.id === pr.id)!.valuations.push({ id: uid(), source: 'Bank valuation', value: v.value, date: v.date || new Date().toISOString().slice(0, 10) }) });
    if (v.weeklyRent && pr.use === 'investment' && v.weeklyRent !== pr.weeklyRent) out.push({ id: 'rent', label: `Update rent on ${pr.address} to ${money(v.weeklyRent)} a week`, detail: `Currently ${money(pr.weeklyRent)} a week. The valuer’s rent estimate. Only update if that’s what you now charge.`, apply: (d) => { d.properties.find((x) => x.id === pr.id)!.weeklyRent = v.weeklyRent; } });
  }
  if (t === 'super' && r.super?.closingBalance) {
    const who = pick.person ?? matchPerson(p, r.super.memberName);
    if (!who) return { changes: [], needs: 'person' };
    const person = p.household[who];
    const s = r.super;
    out.push({ id: 'super', label: `Update ${person.name ? `${person.name}’s` : who === 'you' ? 'your' : 'your partner’s'} super to ${money(s.closingBalance)}`, detail: `${s.fund ? `${s.fund}, ` : ''}balance at ${nice(s.periodEnd) || 'the statement date'}. Was ${money(person.superBalance)}.${s.returnPercent != null ? ` The fund returned ${pct(s.returnPercent)} for the year.` : ''}`,
      apply: (d) => { d.household[who].superBalance = s.closingBalance; if (s.returnPercent != null) d.household[who].superReturn = s.returnPercent; }, eofy: `super-${who}` });
  }
  if (t === 'loan' && r.loan?.balance) {
    const pr = prop(r.loan.propertyAddress);
    if (!pr) return { changes: [], needs: 'property' };
    const l = r.loan;
    const loan = pr.loans.find((x) => l.lender && x.lender && l.lender.toLowerCase().includes(x.lender.toLowerCase())) ?? pr.loans[0];
    if (loan) {
      out.push({ id: 'bal', label: `Update the loan on ${pr.address} to ${money(l.balance)}`, detail: `Was ${money(loan.balance)}${l.date ? `. Balance as at ${nice(l.date)}` : ''}.`, apply: (d) => { d.properties.find((x) => x.id === pr.id)!.loans.find((x) => x.id === loan.id)!.balance = l.balance; }, eofy: 'loans' });
      if (l.ratePercent && l.ratePercent !== loan.rate) out.push({ id: 'rate', label: `Update the interest rate to ${l.ratePercent.toFixed(2)}%${l.rateType && l.rateType !== 'null' ? ` ${l.rateType}` : ''}`, detail: `Was ${(loan.rate ?? 0).toFixed(2)}%.`, apply: (d) => { const x = d.properties.find((q) => q.id === pr.id)!.loans.find((q) => q.id === loan.id)!; x.rate = l.ratePercent; if (l.rateType === 'fixed' || l.rateType === 'variable') x.rateType = l.rateType; } });
      if (l.offsetBalance != null && l.offsetBalance !== loan.offset) out.push({ id: 'offset', label: `Update the offset balance to ${money(l.offsetBalance)}`, detail: `Was ${money(loan.offset)}.`, apply: (d) => { d.properties.find((q) => q.id === pr.id)!.loans.find((q) => q.id === loan.id)!.offset = l.offsetBalance; } });
    }
  }
  if (t === 'rental' && r.rental?.weeklyRent) {
    const pr = prop(r.rental.address);
    if (!pr) return { changes: [], needs: 'property' };
    out.push({ id: 'rent', label: `Update rent on ${pr.address} to ${money(r.rental.weeklyRent)} a week`, detail: `Was ${money(pr.weeklyRent)} a week.`, apply: (d) => { d.properties.find((x) => x.id === pr.id)!.weeklyRent = r.rental.weeklyRent; }, eofy: 'rental' });
  }
  if (t === 'payslip' && r.payslip?.annualSalary) {
    const who = pick.person ?? matchPerson(p, r.payslip.name);
    if (!who) return { changes: [], needs: 'person' };
    out.push({ id: 'salary', label: `Update ${p.household[who].name ? `${p.household[who].name}’s` : 'the'} salary to ${money(r.payslip.annualSalary)} a year`, detail: `Was ${money(p.household[who].salary)}.`, apply: (d) => { d.household[who].salary = r.payslip.annualSalary; }, eofy: 'income' });
  }
  if (t === 'trades' && Array.isArray(r.trades) && r.trades.length) {
    const buys = r.trades.filter((x: any) => x.code && x.units > 0 && x.price > 0);
    if (buys.length) out.push({ id: 'trades', label: `Add ${buys.length} trade${buys.length > 1 ? 's' : ''} to your shares`, detail: buys.map((x: any) => `${x.side === 'sell' ? 'Sold' : 'Bought'} ${x.units} ${x.code} at ${money(x.price, { cents: true })}`).join(' · '),
      apply: (d) => { for (const x of buys) {
        const ex = (['ASX', 'NASDAQ', 'NYSE', 'CRYPTO'].includes(String(x.market).toUpperCase()) ? String(x.market).toUpperCase() : 'ASX') as Holding['exchange'];
        const cur = d.holdings.find((h) => h.code === x.code.toUpperCase() && h.exchange === ex);
        if (x.side === 'sell') { if (cur) { cur.units = Math.max(0, cur.units - x.units); if (!cur.units) d.holdings = d.holdings.filter((h) => h !== cur); } continue; }
        if (cur) { const cost = cur.units * cur.avgCost + x.units * x.price; cur.units += x.units; cur.avgCost = cost / cur.units; }
        else d.holdings.push({ id: uid(), code: x.code.toUpperCase(), exchange: ex, name: x.code.toUpperCase(), units: x.units, avgCost: x.price, firstBought: x.date || '', kind: 'share' });
      } } });
  }
  return { changes: out };
}

/* ---------- page ---------- */
export function Documents() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const [kind, setKind] = useState<DocKind>('valuation');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState<Reading | null>(null);
  const [pick, setPick] = useState<{ property?: string; person?: 'you' | 'partner' }>({});
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const eofy = eofyItems(p);

  const read = async (file: File, k: DocKind) => {
    if (!live) { setError('Reading documents needs the live site. In this preview you can enter figures by hand in the checklist.'); return; }
    setBusy(true); setError(''); setReading(null); setPick({}); setChosen({});
    const ctx = { properties: p.properties.map((x) => `${x.address}, ${x.suburb} ${x.state}`), people: [p.household.you.name, p.household.hasPartner ? p.household.partner.name : ''].filter(Boolean) };
    const form = new FormData(); form.append('file', file); form.append('kind', k); form.append('context', JSON.stringify(ctx));
    try {
      const res = await fetch('/api/documents/read', { method: 'POST', body: form, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'We couldn’t read that document.');
      setReading(data);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const sample = async (s: (typeof SAMPLES)[number]) => {
    setKind(s.kind);
    const blob = await fetch(`./samples/${s.file}`).then((r) => r.blob());
    read(new File([blob], s.file, { type: 'application/pdf' }), s.kind);
  };

  const proposal = reading ? proposeChanges(p, reading, pick) : null;
  const apply = () => {
    if (!reading || !proposal) return;
    const picked = proposal.changes.filter((c) => chosen[c.id] !== false);
    update((d) => {
      for (const c of picked) { c.apply(d); if (c.eofy) markDone(d, c.eofy); }
      (d.documents ??= []).unshift({ id: uid(), name: reading.fileName, kind: reading.detectedType, uploadedAt: new Date().toISOString(), summary: reading.summary, applied: picked.map((c) => c.label) });
    });
    setReading(null);
  };

  return (
    <div className="space-y-6">
      <div><h1 className="font-display text-3xl font-semibold sm:text-4xl">Documents</h1><p className="text-muted">Upload a statement or report. Wise reads it and suggests updates to your plan.</p></div>

      {eofy.outstanding.length > 0 && <EofyChecklist />}

      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-72"><Field label="What are you uploading?">{(id) => <Select id={id} value={kind} onChange={setKind} options={DOC_KINDS} />}</Field></div>
          <p className="pb-2 text-sm text-muted">PDF, photo, Word or spreadsheet, up to 6 MB.</p>
        </div>
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) read(f, kind); }}
          className={`mt-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${drag ? 'border-brass bg-brass/5' : 'border-line'}`}>
          {busy ? (
            <div aria-live="polite"><div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-line border-t-brass" /><p className="mt-3 font-medium">Reading your document…</p><p className="text-sm text-muted">Pulling out the figures and matching them to your plan.</p></div>
          ) : (
            <>
              <Icon name="upload" className="mx-auto h-7 w-7 text-brass" />
              <p className="mt-3 font-medium">Drop a document here</p>
              <button type="button" className="btn-primary mt-4" onClick={() => input.current?.click()}>Choose a file</button>
              <input ref={input} type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f, kind); e.target.value = ''; }} />
              <p className="mt-4 text-xs text-muted">No document handy? Try {SAMPLES.map((s, i) => <span key={s.file}>{i ? (i === SAMPLES.length - 1 ? ' or ' : ', ') : ''}<button className="text-brass underline-offset-2 hover:underline" onClick={() => sample(s)}>{s.label}</button></span>)}.</p>
            </>
          )}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}

        {reading && proposal && (
          <div className="rise mt-6 rounded-2xl border border-line bg-raised/60 p-5">
            <p className="text-xs text-muted">{reading.fileName} · read as {DOC_KINDS.find((k) => k.value === reading.detectedType)?.label.toLowerCase() ?? 'a document'}</p>
            <p className="mt-1 font-medium">{reading.summary}</p>
            {proposal.needs === 'property' && (
              <div className="mt-4 max-w-sm"><Field label="Which property is this for?">{(id) => <Select id={id} value={pick.property ?? ''} onChange={(v) => setPick({ ...pick, property: v })} options={[{ value: '', label: 'Choose a property' }, ...p.properties.map((x) => ({ value: x.id, label: x.address }))]} />}</Field></div>
            )}
            {proposal.needs === 'person' && (
              <div className="mt-4 max-w-sm"><Field label="Whose is this?">{(id) => <Select id={id} value={pick.person ?? ''} onChange={(v) => setPick({ ...pick, person: (v || undefined) as any })} options={[{ value: '', label: 'Choose a person' }, { value: 'you', label: p.household.you.name || 'Me' }, ...(p.household.hasPartner ? [{ value: 'partner', label: p.household.partner.name || 'My partner' }] : [])]} />}</Field></div>
            )}
            {proposal.changes.length > 0 ? (
              <>
                <p className="mt-5 text-sm font-medium">Suggested updates</p>
                <ul className="mt-2 space-y-2">
                  {proposal.changes.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer gap-3 rounded-xl border border-line bg-surface p-3">
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--brass))]" checked={chosen[c.id] !== false} onChange={(e) => setChosen({ ...chosen, [c.id]: e.target.checked })} />
                        <span><span className="block font-medium">{c.label}</span><span className="block text-sm text-muted">{c.detail}</span></span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2"><button className="btn-primary" onClick={apply}>Apply updates</button><button className="btn-ghost" onClick={() => setReading(null)}>Discard</button></div>
              </>
            ) : !proposal.needs && <p className="mt-3 text-sm text-muted">We couldn’t find figures to update from this one. You can enter them by hand instead.</p>}
            <p className="mt-3 text-[11px] text-muted">Read by AI. Check each figure against your document before applying. The file itself isn’t stored, only the figures you apply.</p>
          </div>
        )}
      </section>

      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Uploaded</h2>
        {(p.documents ?? []).length === 0 ? <p className="mt-2 text-sm text-muted">Nothing uploaded yet.</p> : (
          <ul className="mt-3 divide-y divide-line">
            {(p.documents ?? []).map((d) => (
              <li key={d.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">{d.name}</p><p className="text-xs text-muted">{DOC_KINDS.find((k) => k.value === d.kind)?.label} · {new Date(d.uploadedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
                <p className="text-sm text-muted">{d.summary}</p>
                {d.applied.length > 0 && <ul className="mt-1 text-sm">{d.applied.map((a) => <li key={a} className="flex items-center gap-1.5"><Icon name="check" className="h-3.5 w-3.5 text-gum" />{a}</li>)}</ul>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EofyChecklist() {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  const { fy, items, done } = eofyItems(p);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="panel overflow-hidden" aria-labelledby="eofy-h">
      <div className="h-1 bg-brass" />
      <div className="p-5 sm:p-6">
        <h2 id="eofy-h" className="font-display text-xl font-semibold">The {fy} financial year has ended. Time to update your figures</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">Your end-of-year statements should have arrived. Upload them, or enter the numbers here. {done.length} of {items.length} done.</p>
        <div className="mt-3 h-1.5 max-w-md rounded-full bg-line"><div className="h-1.5 rounded-full bg-brass transition-all" style={{ width: `${(done.length / items.length) * 100}%` }} /></div>
        <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
          {items.map((it) => {
            const isDone = done.includes(it.id);
            return (
              <li key={it.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className={`flex items-center gap-2 font-medium ${isDone ? 'text-muted line-through' : ''}`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${isDone ? 'bg-gum text-surface' : 'border border-line'}`}>{isDone && <Icon name="check" className="h-3 w-3" />}</span>{it.label}
                  </p>
                  {!isDone && <button className="btn-quiet py-1.5" onClick={() => setOpen(open === it.id ? null : it.id)}>{open === it.id ? 'Close' : 'Enter by hand'}</button>}
                </div>
                {open === it.id && <ManualEntry id={it.id} onDone={() => { update((d) => markDone(d, it.id)); setOpen(null); }} />}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function ManualEntry({ id, onDone }: { id: string; onDone: () => void }) {
  const p = useApp((s) => s.profile)!;
  const update = useApp((s) => s.update);
  if (id.startsWith('super-')) {
    const who = id === 'super-partner' ? 'partner' : 'you';
    const person = p.household[who];
    return (
      <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Balance at 30 June">{(fid) => <MoneyInput id={fid} value={person.superBalance} onChange={(v) => update((d) => { d.household[who].superBalance = v; })} />}</Field>
        <Field label="Fund’s return for the year">{(fid) => <NumInput id={fid} value={person.superReturn ?? null} onChange={(v) => update((d) => { d.household[who].superReturn = v; })} step={0.1} suffix="%" />}</Field>
        <button className="btn-primary" onClick={onDone}>Save</button>
      </div>
    );
  }
  if (id === 'loans' || id === 'rental') {
    const list = p.properties.filter((x) => (id === 'loans' ? x.loans.length : x.use === 'investment'));
    return (
      <div className="mt-4 space-y-3">
        {list.map((pr) => (
          <div key={pr.id} className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <p className="text-sm font-medium sm:pb-3">{pr.address}</p>
            {id === 'loans' ? (<>
              <Field label="Balance owing">{(fid) => <MoneyInput id={fid} value={pr.loans[0].balance} onChange={(v) => update((d) => { d.properties.find((x) => x.id === pr.id)!.loans[0].balance = v; })} />}</Field>
              <Field label="Interest rate">{(fid) => <NumInput id={fid} value={pr.loans[0].rate} onChange={(v) => update((d) => { d.properties.find((x) => x.id === pr.id)!.loans[0].rate = v; })} step={0.01} suffix="%" />}</Field>
            </>) : (
              <Field label="Rent">{(fid) => <MoneyInput id={fid} value={pr.weeklyRent} onChange={(v) => update((d) => { d.properties.find((x) => x.id === pr.id)!.weeklyRent = v; })} suffix="/ week" />}</Field>
            )}
          </div>
        ))}
        <button className="btn-primary" onClick={onDone}>Save</button>
      </div>
    );
  }
  return (
    <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label={`${p.household.you.name || 'Your'} salary`}>{(fid) => <MoneyInput id={fid} value={p.household.you.salary} onChange={(v) => update((d) => { d.household.you.salary = v; })} suffix="/ yr" />}</Field>
      {p.household.hasPartner && <Field label={`${p.household.partner.name || 'Partner'} salary`}>{(fid) => <MoneyInput id={fid} value={p.household.partner.salary} onChange={(v) => update((d) => { d.household.partner.salary = v; })} suffix="/ yr" />}</Field>}
      <button className="btn-primary" onClick={onDone}>Save</button>
    </div>
  );
}
