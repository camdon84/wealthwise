import type { Property } from '../lib/types';

function rand(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967295; };
}

/** A survey-plan style drawing of the lot, unique to each property: the visual signature of the app. */
export function LotPlan({ property, className = '' }: { property: Property; className?: string }) {
  const r = rand(property.id + property.address);
  const unit = property.kind === 'unit';
  const W = 520, H = 150;
  const w = unit ? 170 : 150 + r() * 40, h = H - 40 - r() * 10;
  const x0 = W / 2 - w / 2 + (r() - 0.5) * 20, y0 = 18 + r() * 8;
  const skew = (r() - 0.5) * 26;
  const lot = [[x0, y0], [x0 + w, y0 + skew * 0.3], [x0 + w + skew * 0.4, y0 + h], [x0 - skew * 0.2, y0 + h - skew * 0.2]];
  const hx = x0 + 22 + r() * 18, hy = y0 + 22 + r() * 10, hw = unit ? w - 50 : 60 + r() * 30, hh = unit ? h - 46 : 40 + r() * 18;
  const lotNo = Math.floor(r() * 900 + 10);
  const plan = `RP${Math.floor(r() * 900000 + 100000)}`;
  const contours = Array.from({ length: 5 }, (_, i) => {
    const yy = 10 + i * 30 + r() * 8;
    return `M0 ${yy} C ${W * 0.3} ${yy - 14 + r() * 10}, ${W * 0.6} ${yy + 16 - r() * 10}, ${W} ${yy - 4}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={`Lot plan sketch for ${property.address}`}>
      <rect width={W} height={H} fill="rgb(var(--raised))" />
      {contours.map((d, i) => <path key={i} d={d} fill="none" stroke="rgb(var(--line))" strokeWidth="1" />)}
      <polygon points={lot.map((p) => p.join(',')).join(' ')} fill="rgb(var(--gum) / 0.08)" stroke="rgb(var(--gum))" strokeWidth="1.4" strokeDasharray="5 3" />
      {unit ? (
        <g stroke="rgb(var(--brass))" strokeWidth="1.2" fill="rgb(var(--brass) / 0.12)">
          <rect x={hx} y={hy} width={hw} height={hh} />
          {[1, 2, 3].map((i) => <line key={i} x1={hx + (hw / 4) * i} y1={hy} x2={hx + (hw / 4) * i} y2={hy + hh} />)}
        </g>
      ) : (
        <rect x={hx} y={hy} width={hw} height={hh} fill="rgb(var(--brass) / 0.14)" stroke="rgb(var(--brass))" strokeWidth="1.2" />
      )}
      <text x={x0 + w / 2} y={y0 + h - 8} textAnchor="middle" fontSize="9" fill="rgb(var(--muted))" fontFamily="Figtree">Lot {lotNo} on {plan}</text>
      <line x1={x0} y1={y0 - 7} x2={x0 + w} y2={y0 - 7 + skew * 0.3} stroke="rgb(var(--muted))" strokeWidth="0.6" />
      <text x={x0 + w / 2} y={y0 - 10} textAnchor="middle" fontSize="8" fill="rgb(var(--muted))" fontFamily="Figtree">{(w / 8.5).toFixed(2)} m</text>
      <path d={`M${x0 + w + 40} 16 l0 20 M${x0 + w + 36} 22 l4 -6 4 6`} stroke="rgb(var(--muted))" strokeWidth="1" fill="none" />
      <text x={x0 + w + 40} y={46} textAnchor="middle" fontSize="8" fill="rgb(var(--muted))" fontFamily="Figtree">N</text>
    </svg>
  );
}
