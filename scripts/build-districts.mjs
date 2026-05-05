// Regenerate src/lib/cno-districts.js from the source CNOCD.geojson.
// Run: `node scripts/build-districts.mjs`
//
// Applies Douglas-Peucker simplification (~500 m tolerance) and rounds
// coordinates to 4 decimals so the output is small enough to inline in
// the single-file build. Re-run whenever CNOCD.geojson changes.

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'CNOCD.geojson';
const OUT = 'src/lib/cno-districts.js';
const EPS = 0.005; // degrees, ~500 m. Plenty of detail at zoom ≤ 12.

const round = (n) => Math.round(n * 10000) / 10000;

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const px = a[0] + t * dx, py = a[1] + t * dy;
  return Math.hypot(p[0] - px, p[1] - py);
}
function rdp(points, eps) {
  if (points.length < 3) return points;
  const last = points.length - 1;
  let maxD = 0, idx = 0;
  for (let i = 1; i < last; i++) {
    const d = perpDist(points[i], points[0], points[last]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[last]];
}
function simpleRing(ring, eps) {
  const closed = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
  const open = closed ? ring.slice(0, -1) : ring;
  const out = rdp(open, eps).map(([x, y]) => [round(x), round(y)]);
  out.push([out[0][0], out[0][1]]);
  return out;
}
function ringCentroid(ring) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    A += cross; cx += (ring[j][0] + ring[i][0]) * cross; cy += (ring[j][1] + ring[i][1]) * cross;
  }
  A *= 0.5;
  return [round(cx / (6 * A)), round(cy / (6 * A))];
}

const src = JSON.parse(readFileSync(SRC, 'utf8'));
const features = src.features.map((f) => {
  const rings = f.geometry.coordinates.map((r) => simpleRing(r, EPS));
  const p = f.properties;
  const n = parseInt(p.NAME.replace(/\D/g, ''), 10) || p.Page || 0;
  const lat = p.INTPTLAT ? parseFloat(p.INTPTLAT) : null;
  const lng = p.INTPTLON ? parseFloat(p.INTPTLON) : null;
  const center = (lat != null && lng != null) ? [round(lng), round(lat)] : ringCentroid(rings[0]);
  console.error(`District ${String(n).padStart(2, '0')}: ${f.geometry.coordinates[0].length} → ${rings[0].length} pts`);
  return { n, name: p.NAMELSAD, member: (p.MEMBER_NAM || '').trim(), center, rings };
});
features.sort((a, b) => a.n - b.n);

const banner = `// Auto-generated from CNOCD.geojson by scripts/build-districts.mjs.
// Do not edit by hand — re-run the script if the source GeoJSON changes.
// Douglas-Peucker tolerance: ${EPS}° (~500 m). Coordinates rounded to 4 decimals.

`;
writeFileSync(OUT, banner + 'export const CNO_DISTRICTS = ' + JSON.stringify(features) + ';\n');
console.error(`\nWrote ${OUT}`);
