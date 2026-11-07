import { useEffect, useState } from 'react';
import type { Property } from '../lib/types';
import { useApp } from '../lib/store';
import { priceMode } from '../lib/prices';
import { LotPlan } from './LotPlan';

const TILE = 256;
const tileUrl = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

export const geoQuery = (pr: Property) =>
  `${pr.address.replace(/^\s*[\w-]+\s*\/\s*/, '')}, ${pr.suburb} ${pr.state} ${pr.postcode}, Australia`.replace(/\s+,/g, ',');

/** Bird's-eye photo of the property from its address, falling back to the drawn lot plan. */
export function PropertyPhoto({ property: pr, className = '', zoom = 19 }: { property: Property; className?: string; zoom?: number }) {
  const update = useApp((s) => s.update);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (pr.geo !== undefined || priceMode !== 'live' || !pr.address) return;
    let on = true;
    fetch(`/api/geocode?q=${encodeURIComponent(geoQuery(pr))}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((g) => { if (on && g !== undefined) update((d) => { const x = d.properties.find((y) => y.id === pr.id); if (x) x.geo = g; }); })
      .catch(() => {});
    return () => { on = false; };
  }, [pr.id, pr.geo, pr.address, pr.suburb, pr.postcode, update]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pr.geo || failed) return <LotPlan property={pr} className={className} />;
  return <AerialTiles lat={pr.geo.lat} lon={pr.geo.lon} zoom={pr.geo.street ? zoom - 1 : zoom} className={className} onFail={() => setFailed(true)} label={pr.address} />;
}

function AerialTiles({ lat, lon, zoom, className, onFail, label }: { lat: number; lon: number; zoom: number; className: string; onFail: () => void; label: string }) {
  const n = 2 ** zoom;
  const px = ((lon + 180) / 360) * n * TILE;
  const r = (lat * Math.PI) / 180;
  const py = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * TILE;
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  const [errors, setErrors] = useState(0);
  useEffect(() => { if (errors >= 4) onFail(); }, [errors, onFail]);
  const tiles: { x: number; y: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) tiles.push({ x: tx + dx, y: ty + dy });
  return (
    <div className={`relative overflow-hidden bg-raised ${className}`} role="img" aria-label={`Aerial view of ${label}`}>
      {tiles.map((t) => (
        <img key={`${t.x}-${t.y}`} src={tileUrl(zoom, t.x, t.y)} alt="" draggable={false} loading="lazy" onError={() => setErrors((e) => e + 1)}
          className="pointer-events-none absolute max-w-none select-none" style={{ width: TILE, height: TILE, left: `calc(50% + ${t.x * TILE - px}px)`, top: `calc(50% + ${t.y * TILE - py}px)` }} />
      ))}
      <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-brass shadow-[0_0_0_4px_rgba(0,0,0,0.25)]" aria-hidden="true" />
      <span className="absolute bottom-1 right-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[9px] text-white/90">Imagery © Esri, Maxar</span>
    </div>
  );
}
