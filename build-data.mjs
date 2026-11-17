// Builds data/world.js and data/cities.js from the raw downloads in data/raw.
// Sources: Natural Earth (borders 1:50m, populated places 1:10m), World Bank / SIPRI (military), FAS (warheads).
import { readFileSync, writeFileSync } from 'node:fs';
const raw = f => JSON.parse(readFileSync(new URL('./data/raw/' + f, import.meta.url)));
const R = 6371, rad = Math.PI / 180;

const ringArea = ring => { let s = 0; for (let i = 0; i < ring.length - 1; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[i + 1]; s += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad)); } return Math.abs(s * R * R / 2); };
const polyArea = p => p.reduce((a, ring, i) => a + (i ? -1 : 1) * ringArea(ring), 0);
const round = ring => { const out = []; for (const [x, y] of ring) { const p = [+x.toFixed(2), +y.toFixed(2)]; const l = out[out.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) out.push(p); } return out; };

const wb = f => Object.fromEntries(raw(f)[1].filter(r => r.value != null && r.countryiso3code).map(r => [r.countryiso3code, { v: r.value, y: +r.date }]));
const spend = wb('wb_MS.MIL.XPND.CD.json'), pct = wb('wb_MS.MIL.XPND.GD.ZS.json'), troops = wb('wb_MS.MIL.TOTL.P1.json');
// Estimated total warhead inventories, Federation of American Scientists, 2025.
const NUKES = { RUS: 5459, USA: 5177, CHN: 600, FRA: 290, GBR: 225, IND: 180, PAK: 170, ISR: 90, PRK: 50 };

const features = [];
for (const f of raw('countries.geojson').features) {
  const p = f.properties, polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const area = polys.reduce((a, poly) => a + polyArea(poly), 0);
  const rp = polys.map(poly => poly.map(round).filter(r => r.length >= 4)).filter(poly => poly.length);
  if (!rp.length) continue;
  const iso = p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3, pop = p.POP_EST || 0;
  features.push({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: rp }, properties: {
    name: p.ADMIN, iso, pop, area: Math.round(area), dens: area > 0 ? +(pop / area).toFixed(2) : 0,
    mil: spend[iso] ? Math.round(spend[iso].v) : null, milYear: spend[iso]?.y ?? null,
    milPct: pct[iso] ? +pct[iso].v.toFixed(2) : null, troops: troops[iso] ? Math.round(troops[iso].v) : null, nukes: NUKES[iso] ?? 0 } });
}
writeFileSync(new URL('./data/world.js', import.meta.url), 'window.WORLD=' + JSON.stringify(features) + ';');

const skip = /station/i, cities = [];
for (const f of raw('places.geojson').features) {
  const p = f.properties; if (skip.test(p.featurecla) || !p.pop_max) continue;
  cities.push([p.nameascii || p.name, p.adm0name, +p.latitude.toFixed(3), +p.longitude.toFixed(3), p.pop_max, p.featurecla === 'Admin-0 capital' ? 1 : 0]);
}
cities.sort((a, b) => b[4] - a[4]);
writeFileSync(new URL('./data/cities.js', import.meta.url), 'window.CITIES=' + JSON.stringify(cities) + ';');
const tot = features.reduce((a, f) => a + f.properties.pop, 0);
console.log(features.length, 'countries, world pop', tot, '| with mil data', features.filter(f => f.properties.mil).length, '|', cities.length, 'cities,', cities.filter(c => c[5]).length, 'capitals');
for (const n of ['India', 'United States of America', 'Russia', 'Monaco']) { const p = features.find(f => f.properties.name === n).properties; console.log(n, p.area, 'km2', p.dens, '/km2', p.mil, p.milYear, p.milPct, p.troops, p.nukes); }
