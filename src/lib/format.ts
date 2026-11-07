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
