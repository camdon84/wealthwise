const aud0 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const aud2 = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(n: number | null | undefined, opts: { compact?: boolean; cents?: boolean; sign?: boolean } = {}) {
  if (n == null || !isFinite(n)) return '—';
  const sign = opts.sign && n > 0 ? '+' : '';
  if (opts.compact) {
    const a = Math.abs(n);
    const s = n < 0 ? '-' : sign;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}m`;
    if (a >= 1e4) return `${s}$${Math.round(a / 1e3)}k`;
    if (a >= 1e3) return `${s}$${Math.round(a).toLocaleString('en-AU')}`;
    return `${s}$${Math.round(a)}`;
  }
  return sign + (opts.cents ? aud2 : aud0).format(n);
}

export const pct = (n: number | null | undefined, dp = 1, sign = false) =>
  n == null || !isFinite(n) ? '—' : `${sign && n > 0 ? '+' : ''}${n.toFixed(dp)}%`;

export const num = (n: number, dp = 0) => n.toLocaleString('en-AU', { maximumFractionDigits: dp });

export function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

export const monthYear = (ym: string) => {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
};

export const CURRENCIES = [
  { code: 'AUD', label: 'AUD, Australian dollar' }, { code: 'USD', label: 'USD, US dollar' }, { code: 'EUR', label: 'EUR, Euro' },
  { code: 'GBP', label: 'GBP, British pound' }, { code: 'JPY', label: 'JPY, Japanese yen' }, { code: 'CNY', label: 'CNY, Chinese yuan' },
  { code: 'HKD', label: 'HKD, Hong Kong dollar' }, { code: 'CAD', label: 'CAD, Canadian dollar' }, { code: 'INR', label: 'INR, Indian rupee' },
  { code: 'CHF', label: 'CHF, Swiss franc' }, { code: 'SGD', label: 'SGD, Singapore dollar' }, { code: 'NZD', label: 'NZD, New Zealand dollar' },
];
/** A price in its own currency: "$104.20" for AUD, "US$358.00" style otherwise. */
export function price(n: number, currency = 'AUD') {
  if (currency === 'AUD') return money(n, { cents: true });
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency, maximumFractionDigits: currency === 'JPY' ? 0 : 2 }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}
export const defaultCurrency = (exchange: string) => (exchange === 'NASDAQ' || exchange === 'NYSE' ? 'USD' : 'AUD');

/** Shown wherever capital gains tax is estimated. Update the engine and this line when the new rules are final. */
export const CGT_2027_NOTE = 'From 1 July 2027, new capital gains tax rules from the 2026–27 Budget take effect: the 50% discount is replaced by inflation indexation, with a 30% minimum tax on gains made from that date. WealthWise will update how it calculates capital gains tax once the rules are final.';
