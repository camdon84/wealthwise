import type { Holding } from './types';
import { holdingKey, type Quotes } from './calc';

/**
 * Price feed. In the preview build there is no server, so prices come from a seeded demo feed
 * that drifts slightly through the day. The hosted build calls /api/quotes on the Cloudflare
 * Worker, which fetches 15–20 minute delayed prices and caches them so free API limits hold.
 */
const SEED: Record<string, number> = {
  'ASX:VAS': 104.6, 'ASX:VGS': 141.9, 'ASX:CBA': 168.2, 'ASX:BHP': 40.35, 'ASX:CSL': 184.1, 'ASX:NDQ': 54.2,
  'ASX:A200': 146.8, 'ASX:WES': 79.4, 'ASX:MQG': 214.5, 'NASDAQ:AAPL': 392.0, 'CRYPTO:BTC': 158000,
};

function hashStr(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; }

export const priceMode: 'demo' | 'live' = (import.meta as any).env?.VITE_STORAGE === 'api' ? 'live' : 'demo';

export async function fetchQuotes(holdings: Holding[]): Promise<Quotes> {
  if (priceMode === 'live') {
    const codes = [...new Set(holdings.map(holdingKey))].join(',');
    if (!codes) return {};
    const res = await fetch(`/api/quotes?codes=${encodeURIComponent(codes)}`, { credentials: 'include' }).catch(() => null);
    return res?.ok ? res.json() : {};
  }
  const now = new Date();
  const slot = Math.floor(now.getTime() / 300000); // moves every 5 minutes
  const out: Quotes = {};
  for (const h of holdings) {
    const key = holdingKey(h);
    const base = SEED[key] ?? h.avgCost * (0.9 + hashStr(key) * 0.55);
    const day = (hashStr(key + now.toDateString()) - 0.5) * 3.2; // daily move, -1.6%..+1.6%
    const tick = (hashStr(key + slot) - 0.5) * 0.4;
    const change = day + tick;
    out[key] = { price: base * (1 + change / 100), change, asOf: now.toISOString() };
  }
  return out;
}
