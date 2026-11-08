import { useEffect, useState } from 'react';

/** Official CPI (ABS, republished by the RBA in table G1). Quarterly index levels let us index a locked plan exactly. */
export interface CpiPoint { period: string; index: number; annual: number | null } // period = quarter end, 'YYYY-MM'
export interface Cpi { latest: CpiPoint & { annual: number }; released: string | null; series: CpiPoint[] }

const live = (import.meta as any).env?.VITE_STORAGE === 'api';
// Preview build has no server: the ABS figures as published on 29 October 2026.
const PREVIEW: Cpi = {
  latest: { period: '2026-09', index: 103.64, annual: 3.9 }, released: '2026-10-29',
  series: [
    { period: '2024-09', index: 96.62, annual: 2.9 }, { period: '2024-12', index: 96.81, annual: 2.4 }, { period: '2025-03', index: 97.7, annual: 2.4 },
    { period: '2025-06', index: 98.43, annual: 2.1 }, { period: '2025-09', index: 99.73, annual: 3.2 }, { period: '2025-12', index: 100.32, annual: 3.6 },
    { period: '2026-03', index: 101.7, annual: 4.1 }, { period: '2026-06', index: 102.31, annual: 3.9 }, { period: '2026-09', index: 103.64, annual: 3.9 },
  ],
};
let cache: Promise<Cpi | null> | null = null;

export function useCpi() {
  const [cpi, setCpi] = useState<Cpi | null>(null);
  useEffect(() => {
    if (!live) { setCpi(PREVIEW); return; }
    cache ??= fetch('/api/cpi').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let on = true;
    cache.then((r) => on && setCpi(r));
    return () => { on = false; };
  }, []);
  return cpi;
}

export const monthsBetween = (a: string, b: string) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + (bm - am); };
export const periodLabel = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }); };
/** The CPI point a year (four quarters) before the latest: used as the demo's baseline so the update shows straight away. */
export const yearBefore = (cpi: Cpi) => cpi.series.find((x) => monthsBetween(x.period, cpi.latest.period) === 12) ?? cpi.series[0];
