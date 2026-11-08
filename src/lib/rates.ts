import { useEffect, useState } from 'react';

export interface CashRate { current: number; effective: string; previous: { date: string; rate: number } | null }

const live = (import.meta as any).env?.VITE_STORAGE === 'api';
// Preview build has no server: use the RBA's published figures as at November 2026.
const PREVIEW: CashRate = { current: 4.85, effective: '2026-11-04', previous: { date: '2026-09-30', rate: 4.6 } };
let cache: Promise<CashRate | null> | null = null;

export function useCashRate() {
  const [rate, setRate] = useState<CashRate | null>(null);
  useEffect(() => {
    if (!live) { setRate(PREVIEW); return; }
    cache ??= fetch('/api/cash-rate').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let on = true;
    cache.then((r) => on && setRate(r));
    return () => { on = false; };
  }, []);
  return rate;
}

export const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

/** Average savings rates (Canstar data published by the RBA, table F4). */
export interface SavingsRates { asOf: string; highInterest: number | null; online: number | null; everyday: number | null }
const PREVIEW_SAVINGS: SavingsRates = { asOf: '2026-10-31', highInterest: 5.05, online: 3.3, everyday: 0 };
let savingsCache: Promise<SavingsRates | null> | null = null;
export function useSavingsRates() {
  const [r, setR] = useState<SavingsRates | null>(null);
  useEffect(() => {
    if (!live) { setR(PREVIEW_SAVINGS); return; }
    savingsCache ??= fetch('/api/savings-rates').then((x) => (x.ok ? x.json() : null)).catch(() => null);
    let on = true;
    savingsCache.then((v) => on && setR(v ?? PREVIEW_SAVINGS));
    return () => { on = false; };
  }, []);
  return r;
}
