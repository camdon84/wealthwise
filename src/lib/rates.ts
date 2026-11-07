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
