import { useEffect, useState } from 'react';

export interface Series { key: string; name: string; currency: string; points: { t: number; c: number }[] }
export type Range = '1mo' | '6mo' | '1y' | '5y' | '10y' | 'max';

const live = (import.meta as any).env?.VITE_STORAGE === 'api';
const memo = new Map<string, Promise<Series | null>>();
const NAMES: Record<string, string> = { 'IDX:AXJO': 'ASX 200', 'IDX:GSPC': 'S&P 500', 'IDX:IXIC': 'Nasdaq', 'IDX:AUDUSD': 'AUD/USD' };
const LEVELS: Record<string, number> = { 'IDX:AXJO': 8650, 'IDX:GSPC': 6480, 'IDX:IXIC': 21300, 'IDX:AUDUSD': 0.658 };

/** Preview build: a seeded random walk that ends near today's level, clearly demo data. */
function demo(key: string, range: Range, end: number): Series {
  const days = { '1mo': 30, '6mo': 180, '1y': 365, '5y': 1825, '10y': 3650, max: 3650 }[range];
  const step = days > 400 ? 7 : 1;
  let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  const n = Math.floor(days / step);
  const vals: number[] = [end];
  for (let i = 1; i <= n; i++) vals.push(vals[i - 1] / (1 + 0.0002 * step + (rnd() - 0.5) * 0.02 * Math.sqrt(step)));
  vals.reverse();
  const now = Date.now();
  return { key, name: NAMES[key] ?? key.split(':')[1], currency: key.startsWith('IDX:') ? '' : 'AUD', points: vals.map((c, i) => ({ t: now - (n - i) * step * 864e5, c })) };
}

/** One-off fetch (cached), for combining several series. */
export function getHistory(key: string, range: Range, demoEnd?: number): Promise<Series | null> {
  if (!live) return Promise.resolve(demo(key, range, demoEnd ?? LEVELS[key] ?? 100));
  const k = `${key}|${range}`;
  if (!memo.has(k)) memo.set(k, fetch(`/api/history?key=${encodeURIComponent(key)}&range=${range}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return memo.get(k)!;
}

export function useHistory(key: string | null, range: Range, demoEnd?: number) {
  const [data, setData] = useState<Series | null | 'loading'>('loading');
  useEffect(() => {
    if (!key) return;
    if (!live) { setData(demo(key, range, demoEnd ?? LEVELS[key] ?? 100)); return; }
    const k = `${key}|${range}`;
    if (!memo.has(k)) memo.set(k, fetch(`/api/history?key=${encodeURIComponent(key)}&range=${range}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    let on = true;
    setData('loading');
    memo.get(k)!.then((v) => on && setData(v));
    return () => { on = false; };
  }, [key, range, demoEnd]);
  return data;
}

export function rangeSince(date: string): Range {
  const yrs = date ? (Date.now() - new Date(date).getTime()) / (365.25 * 864e5) : 1;
  return yrs <= 0.08 ? '1mo' : yrs <= 0.5 ? '6mo' : yrs <= 1 ? '1y' : yrs <= 5 ? '5y' : yrs <= 10 ? '10y' : 'max';
}
