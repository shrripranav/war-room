// War Room effects: everything that moves or burns, drawn on a canvas laid over the globe.
// Missiles (boost, midcourse, re-entry), aircraft, drones, ground offensives, interceptors, nuclear
// detonations with fireball, shockwave and mushroom cloud, conventional strikes, EMP, cyber attacks,
// artillery in war zones and ship wakes. It is all computed from the shared state each frame, so every
// screen shows the same thing at the same moment. Nothing here changes the state.
(() => {
'use strict';
const { world, nukeFx, dest, slerp, traj, dist, canSee } = WR;
const RAD = Math.PI / 180;
const stage = document.querySelector('.stage');
const cv = document.createElement('canvas'); cv.id = 'fx'; cv.setAttribute('aria-hidden', 'true');
document.getElementById('globe').after(cv);
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function size() { DPR = Math.min(2, devicePixelRatio || 1); W = stage.clientWidth; H = stage.clientHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
new ResizeObserver(size).observe(stage); size();
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => 1 - (1 - clamp(t)) ** 3;

// ---------- projection with occlusion: null when the point is behind the Earth ----------
let cam, Rg, now, zs;
function P(lat, lng, alt = 0) {
  const c = world.getCoords(lat, lng, alt), dx = c.x - cam.x, dy = c.y - cam.y, dz = c.z - cam.z, t = -(cam.x * dx + cam.y * dy + cam.z * dz) / (dx * dx + dy * dy + dz * dz);
  if (t > 0 && t < 1) { const qx = cam.x + t * dx, qy = cam.y + t * dy, qz = cam.z + t * dz; if (qx * qx + qy * qy + qz * qz < Rg * Rg * 0.995) return null; }
  const s = world.getScreenCoords(lat, lng, alt); return { x: s.x, y: s.y };
}
const Pp = p => P(p.lat, p.lng, p.alt || 0);
function pxPerKm(lat, lng) { const c = P(lat, lng, 0); if (!c) return 0; const e = dest(lat, lng, 60, 90), n = dest(lat, lng, 60, 0), a = P(e.lat, e.lng, 0), b = P(n.lat, n.lng, 0);
  return Math.max(a ? Math.hypot(a.x - c.x, a.y - c.y) : 0, b ? Math.hypot(b.x - c.x, b.y - c.y) : 0) / 60; }

// ---------- soft sprites, tinted once ----------
function sprite(rgb, mid = 0.45, edge = 0) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, `rgba(${rgb},1)`); r.addColorStop(mid, `rgba(${rgb},0.5)`); r.addColorStop(1, `rgba(${rgb},${edge})`); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return c; }
const SP = { hot: sprite('255,252,240', 0.25), fire: sprite('255,160,60', 0.4), ember: sprite('255,96,28', 0.35), red: sprite('190,52,24', 0.5),
  smoke: sprite('132,126,120', 0.55), dark: sprite('52,47,44', 0.6), dust: sprite('150,128,104', 0.55), steam: sprite('236,238,242', 0.55),
  blue: sprite('160,200,255', 0.3), cloud: sprite('226,216,204', 0.6, 0), shade: sprite('96,84,76', 0.6), plasma: sprite('255,186,120', 0.2), green: sprite('90,255,170', 0.3) };
function blot(sp, x, y, r, a) { if (a <= 0.004 || r <= 0.3) return; ctx.globalAlpha = Math.min(1, a); ctx.drawImage(sp, x - r, y - r, r * 2, r * 2); }
function seeded(id) { let h = 1779033703; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }; }

// ---------- particles that live in geographic space (smoke stays where the missile was) ----------
const parts = [];
function puff(lat, lng, alt, sp, life, r0, r1, a0, rise = 0, mode = 'source-over') { if (REDUCED) return; if (parts.length > 2200) parts.splice(0, 200); parts.push({ lat, lng, alt, sp, life, r0, r1, a0, rise, mode, born: now }); }
function drawParts() {
  const wind = (WR.S.cfg.wind || 90) * RAD, wl = Math.sin(wind) * 0.012, wn = Math.cos(wind) * 0.012;
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i], age = (now - q.born) / 1000, k = age / q.life; if (k >= 1) { parts.splice(i, 1); continue; }
    const p = P(q.lat + wn * age, q.lng + wl * age, Math.max(0, q.alt + q.rise * age)); if (!p) continue;
    ctx.globalCompositeOperation = q.mode; blot(q.sp, p.x, p.y, (q.r0 + (q.r1 - q.r0) * ease(k)) * zs, q.a0 * (1 - k) * (k < 0.08 ? k / 0.08 : 1)); }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- lines along a flight ----------
function path(s, t0, t1, n = 24) { const out = []; for (let i = 0; i <= n; i++) { const g = traj(s, t0 + (t1 - t0) * i / n); out.push(Pp(g)); } return out; }
function trail(pts, w, rgb, a0, a1, mode = 'lighter') {   // alpha runs from a0 at the tail to a1 at the head
  ctx.globalCompositeOperation = mode; ctx.lineCap = 'round'; ctx.lineWidth = w;
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; if (!a || !b) continue; ctx.globalAlpha = clamp(a0 + (a1 - a0) * (i / (pts.length - 1)));
    ctx.strokeStyle = `rgb(${rgb})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
const heading = (s, t) => { const a = Pp(traj(s, Math.max(0, t - 0.004))), b = Pp(traj(s, Math.min(1, t + 0.004))); return a && b ? Math.atan2(b.y - a.y, b.x - a.x) : 0; };
function jet(x, y, ang, sz, col = '#e9e9ec') {   // swept-wing aircraft silhouette
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sz / 10, sz / 10); ctx.fillStyle = col; ctx.globalAlpha = 1; ctx.beginPath();
  ctx.moveTo(10, 0); ctx.lineTo(2, -1.4); ctx.lineTo(-3, -9); ctx.lineTo(-5, -9); ctx.lineTo(-2, -1.5); ctx.lineTo(-7, -1.2); ctx.lineTo(-9, -4); ctx.lineTo(-10, -4);
  ctx.lineTo(-9, 0); ctx.lineTo(-10, 4); ctx.lineTo(-9, 4); ctx.lineTo(-7, 1.2); ctx.lineTo(-2, 1.5); ctx.lineTo(-5, 9); ctx.lineTo(-3, 9); ctx.lineTo(2, 1.4); ctx.closePath(); ctx.fill(); ctx.restore();
}

// ---------- one strike in flight ----------
function flight(s) {
  const dur = Math.max(1, (s.eta - s.t0) / 1000), age = (now - s.t0) / 1000, t = clamp(age / dur), g = traj(s, t), h = Pp(g);
  const fl = 0.75 + 0.25 * Math.sin(now / 37 + s.t0) * Math.sin(now / 23);
  // launch: flash, then a ground cloud of exhaust (water spray for a submarine)
  if (age < 6 && (s.arc === 'ballistic' || s.arc === 'glide')) { const a = P(s.a.lat, s.a.lng, 0);
    if (a) { ctx.globalCompositeOperation = 'lighter'; blot(SP.hot, a.x, a.y, 22 * zs, clamp(1 - age / 0.8)); blot(SP.fire, a.x, a.y, 36 * zs, clamp(0.7 - age / 2)); ctx.globalCompositeOperation = 'source-over'; }
    if (age < 2.5 && Math.random() < 0.6) { const o = dest(s.a.lat, s.a.lng, Math.random() * 8, Math.random() * 360); puff(o.lat, o.lng, 0, s.kind === 'slbm' ? SP.steam : SP.smoke, 7 + Math.random() * 4, 4, 22 + Math.random() * 14, 0.5); } }
  if (s.arc !== 'surface' && t > 0.01) trail(path(s, 0, t, 40), 1.4 * zs, '255,120,110', 0.12, 0.6, 'source-over');
  if (s.arc === 'ballistic' || s.arc === 'glide') {
    const tb = Math.min(0.16, 70 / dur * 0.16 + 0.06);           // boost phase as a share of the flight
    if (t < tb) {                                                  // burning motor: flame, smoke column
      if (Math.random() < 0.85) puff(g.lat, g.lng, g.alt, SP.steam, 9, 2.2, 13 + Math.random() * 8, 0.42);
      trail(path(s, Math.max(0, t - 0.05), t, 10), 2.2 * zs, '255,210,150', 0, 0.9);
      if (h) { ctx.globalCompositeOperation = 'lighter'; blot(SP.fire, h.x, h.y, 13 * zs * fl, 0.85); blot(SP.hot, h.x, h.y, 5 * zs, 1); ctx.globalCompositeOperation = 'source-over'; }
    } else if (s.arc === 'glide') {                               // hypersonic glide: plasma sheath the whole way
      trail(path(s, Math.max(tb, t - 0.08), t, 14), 2.4 * zs, '255,170,90', 0, 0.85);
      if (h) { ctx.globalCompositeOperation = 'lighter'; blot(SP.plasma, h.x, h.y, 11 * zs * fl, 0.9); blot(SP.hot, h.x, h.y, 3.5 * zs, 1); ctx.globalCompositeOperation = 'source-over'; }
      if (Math.random() < 0.3) puff(g.lat, g.lng, g.alt, SP.ember, 1.2, 1.5, 0.5, 0.7, 0, 'lighter');
    } else if (t < 0.86) {                                         // coasting through space: a cold point and a thin track
      trail(path(s, Math.max(tb, t - 0.22), t, 18), 1.1 * zs, '210,225,255', 0, 0.55);
      if (h) { ctx.globalCompositeOperation = 'lighter'; blot(SP.blue, h.x, h.y, 10 * zs * (0.85 + 0.15 * Math.sin(now / 180)), 0.85); blot(SP.hot, h.x, h.y, 3.2 * zs, 1); ctx.globalCompositeOperation = 'source-over'; }
      if (s.kind === 'icbm' && t > 0.5 && h) {                    // warhead bus releases decoys that fly alongside
        const ang = heading(s, t) + Math.PI / 2, sep = (t - 0.5) * 60 * zs;
        for (const k of [-1, 1, -0.45]) blot(SP.blue, h.x + Math.cos(ang) * sep * k - Math.cos(ang - Math.PI / 2) * 6 * Math.abs(k), h.y + Math.sin(ang) * sep * k - Math.sin(ang - Math.PI / 2) * 6 * Math.abs(k), 3 * zs, 0.55);
      }
    } else {                                                       // re-entry: the warhead burns through the air
      trail(path(s, Math.max(0.78, t - 0.07), t, 14), 2.6 * zs, '255,150,70', 0, 0.95);
      if (h) { ctx.globalCompositeOperation = 'lighter'; blot(SP.plasma, h.x, h.y, 15 * zs * fl, 0.95); blot(SP.hot, h.x, h.y, 4.5 * zs, 1); ctx.globalCompositeOperation = 'source-over'; }
      if (Math.random() < 0.5) puff(g.lat, g.lng, g.alt, SP.ember, 0.9, 2, 0.4, 0.8, 0, 'lighter');
    }
  } else if (s.arc === 'low') {
    const ang = heading(s, t);
    if (s.kind === 'bomber' || s.kind === 'strike') {
      const n = s.kind === 'strike' ? 3 : 1, back = Math.PI + ang;
      for (let k = 0; k < n; k++) { const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * 9 * zs, bk = k === 0 ? 0 : 8 * zs;
        if (!h) break; const x = h.x + Math.cos(back) * bk + Math.cos(ang + Math.PI / 2) * off, y = h.y + Math.sin(back) * bk + Math.sin(ang + Math.PI / 2) * off;
        ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1 * zs; ctx.lineCap = 'round';
        for (const w of [-2.2, 2.2]) { const ox = Math.cos(ang + Math.PI / 2) * w * zs, oy = Math.sin(ang + Math.PI / 2) * w * zs, L = (s.kind === 'bomber' ? 60 : 34) * zs;
          const gr = ctx.createLinearGradient(x, y, x + Math.cos(back) * L, y + Math.sin(back) * L); gr.addColorStop(0, 'rgba(255,255,255,0.65)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = gr; ctx.beginPath(); ctx.moveTo(x + ox - Math.cos(ang) * 4 * zs, y + oy - Math.sin(ang) * 4 * zs); ctx.lineTo(x + ox + Math.cos(back) * L, y + oy + Math.sin(back) * L); ctx.stroke(); }
        jet(x, y, ang, (s.kind === 'bomber' ? 12 : 8) * zs); }
    } else if (s.kind === 'drone') {
      if (h) { const r = seeded(s.id); for (let k = 0; k < 10; k++) { const a = r() * Math.PI * 2 + now / (900 + r() * 700), d = (4 + r() * 12) * zs, x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.7;
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#d8d8dc'; ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4); if ((now / 400 + k) % 2 < 0.25) { ctx.globalCompositeOperation = 'lighter'; blot(SP.ember, x, y, 3, 0.9); ctx.globalCompositeOperation = 'source-over'; } } }
    } else {                                                       // cruise missile: hugs the ground, small flame, faint smoke
      trail(path(s, Math.max(0, t - 0.06), t, 10), 1 * zs, '235,235,240', 0, 0.5, 'source-over');
      if (h) { ctx.globalCompositeOperation = 'lighter'; blot(SP.fire, h.x, h.y, 6 * zs * fl, 0.85); blot(SP.hot, h.x, h.y, 2 * zs, 1); ctx.globalCompositeOperation = 'source-over'; }
      if (Math.random() < 0.25) puff(g.lat, g.lng, g.alt, SP.smoke, 4, 1.5, 6, 0.25);
    }
  } else if (s.arc === 'surface') {                                // ground offensive: the front pushes forward as an arrow
    const pts = path(s, 0, t, 30).filter(Boolean); if (pts.length > 1) {
      ctx.globalAlpha = 0.55; ctx.strokeStyle = '#e5566f'; ctx.lineWidth = 7 * zs; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      const a = pts[pts.length - 2], b = pts[pts.length - 1], ang = Math.atan2(b.y - a.y, b.x - a.x), L = 16 * zs;
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#e5566f'; ctx.beginPath(); ctx.moveTo(b.x + Math.cos(ang) * L, b.y + Math.sin(ang) * L);
      ctx.lineTo(b.x + Math.cos(ang + 2.4) * L * 0.8, b.y + Math.sin(ang + 2.4) * L * 0.8); ctx.lineTo(b.x + Math.cos(ang - 2.4) * L * 0.8, b.y + Math.sin(ang - 2.4) * L * 0.8); ctx.closePath(); ctx.fill(); }
    if (Math.random() < 0.35) puff(g.lat, g.lng, 0, SP.dust, 3, 2, 9, 0.35);
    if (Math.random() < 0.12) { const o = dest(g.lat, g.lng, Math.random() * 30, Math.random() * 360); boom(o.lat, o.lng, 0.6); }
  }
  // interceptors rise from the target's defences shortly before the decision point
  if (s.ti && s.def > 0) { const km = dist(s.a, s.b), fi = Math.min(4 / dur, 0.14), u = (t - (s.ti - fi)) / fi;
    if (u > 0 && u <= 1) { const site = slerp(s.b, s.a, Math.min(0.5, 260 / Math.max(km, 1))), aim = traj(s, s.ti);
      for (let k = 0; k < 2; k++) { const lag = k * 0.12, uu = clamp(u - lag); if (uu <= 0) continue;
        const pt = i => { const q = slerp(site, aim, i); return { lat: q.lat, lng: q.lng, alt: aim.alt * (1 - (1 - i) ** 2) }; };
        const pts = Array.from({ length: 13 }, (_, i) => Pp(pt(uu * i / 12))); trail(pts, 1.6 * zs, '200,225,255', 0, 0.9);
        const hp = pts[pts.length - 1]; if (hp) { ctx.globalCompositeOperation = 'lighter'; blot(SP.blue, hp.x, hp.y, 7 * zs, 0.9); blot(SP.hot, hp.x, hp.y, 2.5 * zs, 1); ctx.globalCompositeOperation = 'source-over'; }
        if (Math.random() < 0.5) { const q = pt(uu); puff(q.lat, q.lng, q.alt, SP.steam, 4, 1.5, 7, 0.3); } } }
    if (t > s.ti && t < s.ti + Math.min(1.2 / dur, 0.1) && !s.hit) { const q = traj(s, s.ti), p = Pp(q); if (p) { const k = (t - s.ti) / Math.min(1.2 / dur, 0.1);   // a miss: interceptors burst off to the side
      ctx.globalCompositeOperation = 'lighter'; blot(SP.blue, p.x + 18 * zs, p.y - 10 * zs, 22 * zs, 1 - k); blot(SP.hot, p.x + 18 * zs, p.y - 10 * zs, 7 * zs, 1 - k); ctx.globalCompositeOperation = 'source-over'; } }
  }
}

// ---------- short-lived flashes (artillery, conventional hits) ----------
const flashes = [];
function boom(lat, lng, scale = 1) { if (flashes.length < 160) flashes.push({ lat, lng, scale, born: now }); }
function drawFlashes() {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i], k = (now - f.born) / 450; if (k >= 1) { flashes.splice(i, 1); continue; }
    const p = P(f.lat, f.lng, 0); if (!p) continue; blot(SP.fire, p.x, p.y, 9 * zs * f.scale * (0.6 + k), (1 - k) * 0.9); blot(SP.hot, p.x, p.y, 3 * zs * f.scale, (1 - k)); }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- nuclear detonation ----------
// Real dimensions come from the effects model; on screen they are enlarged to stay visible from orbit.
function upVector(lat, lng, c) {
  const u = P(lat, lng, 0.012); let ux = u ? u.x - c.x : 0, uy = u ? u.y - c.y : -1;
  const ppk = pxPerKm(lat, lng) || 1, v = clamp(Math.hypot(ux, uy) / 76.4 / ppk);     // 0.012 of the radius is 76.4 km
  const w = clamp(v / 0.5), l = Math.hypot(ux, uy) || 1; ux = ux / l * w; uy = uy / l * w - (1 - w);
  const l2 = Math.hypot(ux, uy) || 1; return { ux: ux / l2, uy: uy / l2, ell: Math.max(0.3, Math.sqrt(1 - Math.max(v, 0.55) ** 2)), ppk };
}
function geoRing(lat, lng, km, fill, stroke, lw) {
  const pts = []; for (let i = 0; i <= 48; i++) { const d = dest(lat, lng, km, i * 7.5); pts.push(P(d.lat, d.lng, 0)); }
  if (pts.some(p => !p)) return; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function nuke(i) {
  const age = (now - i.t) / 1000; if (age < 0 || age > 900) return;
  const c = P(i.lat, i.lng, 0); if (!c) return;
  const f = nukeFx(i.kt, i.burst), { ux, uy, ell, ppk } = upVector(i.lat, i.lng, c), px = -uy, py = ux;
  const topKm = 5.5 * i.kt ** 0.2, Hm = clamp(Math.max(topKm * ppk * 0.9, 58 + 24 * Math.log10(i.kt + 1)), 40, H * 0.36), Rf = Math.max(f.fireball * ppk, Hm * 0.13);
  const wind = (WR.S.cfg.wind || 90), wp = dest(i.lat, i.lng, 300, i.wind ?? wind), wq = P(wp.lat, wp.lng, 0), wx = wq ? (wq.x - c.x) : 0, wy = wq ? (wq.y - c.y) : 0, wl = Math.hypot(wx, wy) || 1;
  const shear = Math.max(0, age - 7) * 2.2 * zs, sx = wx / wl * shear, sy = wy / wl * shear;
  const fade = age < 30 ? 1 : clamp(1 - (age - 30) / 40);
  // lingering fires across the burn radius, with smoke rising off them
  if (age > 1.5) { const Rt = Math.max(f.thermal, Hm * 0.55 / (ppk || 1)), life = clamp(1 - age / 900), rnd = seeded(i.id + 'fire'); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 46; k++) { const d = dest(i.lat, i.lng, Math.sqrt(rnd()) * Rt, rnd() * 360), ph = rnd() * 6.28, sp = 2 + rnd() * 5, hot = rnd() < 0.3, r = 1.5 + rnd() * 3, smoky = rnd() < 0.08, p = P(d.lat, d.lng, 0);
      if (p) blot(hot ? SP.fire : SP.ember, p.x, p.y, r * zs, life * (0.45 + 0.4 * Math.sin(now / 1000 * sp + ph)));
      if (smoky && Math.random() < 0.06 && life > 0.2) puff(d.lat, d.lng, 0.0005, SP.dark, 14, 2, 16, 0.32 * life, 0.0006); }
    ctx.globalCompositeOperation = 'source-over'; }
  if (age > 70) return;
  // shockwave racing outward over the ground, with a dust skirt behind it
  if (age < 5) { const R = Math.max(f.psi1, Hm * 1.4 / (ppk || 1)) * ease(age / 4.5), a = 1 - age / 5;
    geoRing(i.lat, i.lng, R, `rgba(160,130,100,${0.18 * a})`, `rgba(255,244,225,${0.85 * a})`, 2 * zs);
    geoRing(i.lat, i.lng, R * 0.82, null, `rgba(255,244,225,${0.3 * a})`, 1); }
  const Ht = Hm * (1 - Math.exp(-age / 3.2)), capR = Hm * 0.4 * (1 - Math.exp(-age / 3.6)) + Rf * 0.6, heat = clamp(1 - age / 9);
  const at = (h, side, depth = 0) => ({ x: c.x + ux * h + px * side + sx * (h / Hm), y: c.y + uy * h + py * side + sy * (h / Hm) + depth });
  // base surge rolling out along the ground
  if (age > 0.6) { const rnd = seeded(i.id + 'surge'); for (let k = 0; k < 22; k++) { const a = rnd() * 6.28, r = (0.4 + rnd() * 0.7) * Hm * 0.38 * ease((age - 0.6) / 6), q = at(0, Math.cos(a) * r, Math.sin(a) * r * ell);
    blot(i.burst === 'surface' ? SP.dust : SP.smoke, q.x, q.y, (8 + rnd() * 10) * zs * (0.6 + ease(age / 8)), 0.38 * fade * clamp((age - 0.6) * 1.5)); } }
  // the cap: a rolling ring of cloud, drawn back half first so the stem passes in front of it
  const cap = (front) => { const rnd = seeded(i.id + 'cap'); for (let k = 0; k < 30; k++) { const j1 = rnd(), j2 = rnd(), j3 = rnd(), a = k / 30 * 6.28 + age * 0.35 + j1 * 0.2, s = Math.sin(a); if ((s > 0) !== front) continue;
    const grow = 0.5 + 0.5 * ease(age / 4), vis = fade * clamp(age * 1.4);
    for (const [rf, hf, sz] of [[0.95, 0, 0.17], [0.5, 0.16, 0.2]]) {          // the rolling rim, then the dome above it
      const rr = capR * rf * (0.8 + j2 * 0.3), q = at(Ht + hf * Hm + Math.sin(a * 2 + age) * Hm * 0.025, Math.cos(a) * rr, s * rr * ell), r = (Hm * sz + j3 * Hm * 0.06) * grow;
      blot(SP.shade, q.x, q.y + r * 0.3, r, vis * 0.9);
      blot(age < 4 ? SP.red : SP.cloud, q.x, q.y - r * 0.12, r * 0.92, vis * (age < 4 ? 0.9 : clamp((age - 2) / 6) * 0.85 + 0.1));
      if (heat > 0) { ctx.globalCompositeOperation = 'lighter'; blot(SP.fire, q.x, q.y + r * 0.25, r * 0.7, heat * 0.6); ctx.globalCompositeOperation = 'source-over'; } } } };
  if (age > 0.35) cap(false);
  // the stem, narrow under the cap and widening at the base
  if (age > 0.8) { const top = Ht * 0.92, rnd = seeded(i.id + 'stem'); for (let k = 0; k < 18; k++) { const u = k / 17, h = top * u * clamp((age - 0.8) / 2.5), wdt = Hm * (0.075 + 0.11 * (1 - u) ** 3), j1 = rnd(), j2 = rnd(), q = at(h, (j1 - 0.5) * wdt * 0.6, 0);
    blot(SP.shade, q.x + wdt * 0.15, q.y, wdt * (0.95 + j2 * 0.3), fade * 0.95); blot(u > 0.6 ? SP.cloud : SP.dust, q.x - wdt * 0.12, q.y, wdt * (0.8 + j2 * 0.25), fade * 0.9); if (heat > 0 && u > 0.6) { ctx.globalCompositeOperation = 'lighter'; blot(SP.ember, q.x, q.y, wdt * 0.6, heat * 0.4); ctx.globalCompositeOperation = 'source-over'; } } }
  // the fireball: white, then yellow and orange as it climbs and cools into the cap
  if (age < 9) { const q = at(Ht * clamp(age / 2.2) * 0.98, 0), r = Rf * (age < 0.6 ? ease(age / 0.6) : 1 + (age - 0.6) * 0.12) * 1.15;
    ctx.globalCompositeOperation = 'lighter'; blot(SP.hot, q.x, q.y, r * 1.1, clamp(1 - age / 2.5)); blot(SP.fire, q.x, q.y, r * 1.6, heat); blot(SP.red, q.x, q.y, r * 2.1, heat * 0.6); ctx.globalCompositeOperation = 'source-over'; }
  if (age > 0.35) cap(true);
  // condensation ring that flashes around the fireball in humid air
  if (age > 0.25 && age < 2.6) { const k = (age - 0.25) / 2.35, q = at(Ht * 0.5, 0), r = Rf * (1.8 + k * 1.6);
    for (let n = 0; n < 24; n++) { const a = n / 24 * 6.28; blot(SP.steam, q.x + Math.cos(a) * r, q.y + Math.sin(a) * r * ell, Rf * 0.5, (1 - k) * 0.45); } }
  // the first instant: light brighter than the sun
  if (age < 0.6) { ctx.globalCompositeOperation = 'lighter'; blot(SP.hot, c.x, c.y, Hm * 2.2, (1 - age / 0.6)); blot(SP.hot, c.x, c.y, Hm * 0.6, 1 - age / 0.6); ctx.globalCompositeOperation = 'source-over'; }
}

// ---------- conventional hit, EMP, cyber, interception ----------
function conv(i) {
  const age = (now - i.t) / 1000; if (age < 0 || age > 240) return; const c = P(i.lat, i.lng, 0); if (!c) return;
  if (age < 1.6) { const rnd = seeded(i.id + 'spark'); { ctx.globalCompositeOperation = 'lighter'; blot(SP.hot, c.x, c.y, 14 * zs, 1 - age / 0.5); blot(SP.fire, c.x, c.y, 26 * zs * ease(age / 0.4), 1 - age / 1.6); ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,190,120,0.9)'; ctx.lineWidth = 1; ctx.globalAlpha = clamp(1 - age / 1.2); for (let k = 0; k < 14; k++) { const a = rnd() * 6.28, r0 = 6 * zs, r1 = (14 + rnd() * 26) * zs * ease(age / 1.2);
      ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0); ctx.lineTo(c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1); ctx.stroke(); } ctx.globalAlpha = 1; } }
  if (age < 12 && Math.random() < 0.5) puff(i.lat, i.lng, 0.0004, SP.dark, 16, 3, 18, 0.5, 0.0005);
  if (age > 1) { const rnd = seeded(i.id + 'embers'); ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 8; k++) { const d = dest(i.lat, i.lng, rnd() * 2.5, rnd() * 360), p = P(d.lat, d.lng, 0); if (p) blot(SP.ember, p.x, p.y, (1.5 + rnd() * 2) * zs, clamp(1 - age / 240) * (0.5 + 0.4 * Math.sin(now / 160 + k))); } ctx.globalCompositeOperation = 'source-over'; }
}
function emp(i) {
  const age = (now - i.t) / 1000; if (age < 0 || age > 14) return; const h = (i.h || 400) / 6371, p = P(i.lat, i.lng, h);
  if (p && age < 2) { ctx.globalCompositeOperation = 'lighter'; blot(SP.hot, p.x, p.y, 90 * zs * (1 - age / 2), 1 - age / 2); blot(SP.blue, p.x, p.y, 160 * zs, (1 - age / 2) * 0.6); ctx.globalCompositeOperation = 'source-over'; }
  const R = i.r * ease(age / 3), a = clamp(1 - age / 14);   // artificial aurora spreading to the horizon
  ctx.globalCompositeOperation = 'lighter'; geoRing(i.lat, i.lng, R, null, `rgba(90,255,170,${0.55 * a})`, 3 * zs); geoRing(i.lat, i.lng, R * 0.94, null, `rgba(255,90,110,${0.35 * a})`, 2 * zs); ctx.globalCompositeOperation = 'source-over';
  if (age < 7) { ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 14; k++) { const d = dest(i.lat, i.lng, Math.sqrt(Math.random()) * i.r * ease(age / 3), Math.random() * 360), q = P(d.lat, d.lng, 0); if (q) blot(SP.blue, q.x, q.y, 3 * zs, 0.8 * (1 - age / 7)); } ctx.globalCompositeOperation = 'source-over'; }
}
function cyber(z) {
  const age = (now - (z.t || 0)) / 1000; if (age < 0 || age > 6) return; const c = P(z.lat, z.lng, 0); if (!c) return;
  ctx.strokeStyle = '#4a8ad6'; ctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) { const u = ((age * 0.8 + k / 4) % 1), r = u * 70 * zs; ctx.globalAlpha = (1 - u) * clamp(1 - age / 6); ctx.strokeRect(c.x - r, c.y - r * 0.7, r * 2, r * 1.4); }
  ctx.fillStyle = '#9cc3f0'; for (let k = 0; k < 10; k++) { if (Math.random() < 0.5) continue; ctx.globalAlpha = 0.5 * clamp(1 - age / 6); ctx.fillRect(c.x + (Math.random() - 0.5) * 90 * zs, c.y + (Math.random() - 0.5) * 60 * zs, 4 + Math.random() * 22, 2); }
  ctx.globalAlpha = 1;
}
function intercept(fx, t) {
  const age = (now - t) / 1000; if (age < 0 || age > 2.5) return; const p = P(fx.lat, fx.lng, fx.alt || 0); if (!p) return;
  ctx.globalCompositeOperation = 'lighter'; blot(SP.hot, p.x, p.y, 26 * zs * ease(age / 0.3), 1 - age / 1.2); blot(SP.blue, p.x, p.y, 44 * zs, (1 - age / 2.5) * 0.7);
  const rnd = seeded(t); for (let k = 0; k < 16; k++) { const a = rnd() * 6.28, d = (8 + rnd() * 30) * zs * ease(age / 2), fall = age * age * 9 * zs; blot(SP.ember, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d + fall, 2.2 * zs, 1 - age / 2.5); }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- the frame ----------
let lastArty = 0;
function frame() {
  requestAnimationFrame(frame);
  now = Date.now(); cam = world.camera().position; Rg = world.getGlobeRadius();
  const alt = world.pointOfView().altitude; zs = clamp(1.35 / (alt + 0.35), 0.9, 2.6);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const S = WR.S;
  // artillery and air defence fire inside every active war zone
  if (!REDUCED && now - lastArty > 120) { lastArty = now;
    for (const z of S.zones) if (z.type === 'war' && canSee(z) && Math.random() < 0.55) { const d = dest(z.lat, z.lng, Math.sqrt(Math.random()) * z.r, Math.random() * 360); boom(d.lat, d.lng, 0.5 + Math.random() * 0.6);
      if (Math.random() < 0.25) puff(d.lat, d.lng, 0, SP.smoke, 6, 2, 10, 0.35, 0.0002); } }
  // ship wakes and convoy dust
  for (const u of S.units) if (u.moving && canSee(u)) { const k = clamp((now - u.moving.t0) / (u.moving.eta - u.moving.t0)), g = slerp(u.moving.a, u.moving.b, k);
    if (Math.random() < 0.3) puff(g.lat, g.lng, 0, ['fleet', 'sub', 'naval'].includes(u.type) ? SP.steam : SP.dust, 5, 2, 8, 0.4); }
  for (const m of S.moves) if (canSee(m) && Math.random() < 0.25) { const k = clamp((now - m.t0) / (m.eta - m.t0)), g = slerp(m.a, m.b, k); puff(g.lat, g.lng, 0, SP.dust, 4, 2, 7, 0.35); }
  drawParts();
  for (const i of S.impacts) { if (i.kind === 'nuke') nuke(i); else if (i.kind === 'emp') emp(i); else conv(i); }
  for (const z of S.zones) if (z.type === 'blackout' && canSee(z)) cyber(z);
  for (const s of S.strikes) flight(s);
  for (let k = S.log.length - 1, n = 0; k >= 0 && n < 12; k--, n++) { const l = S.log[k]; if (now - l.t > 3000) break; if (l.fx && canSee(l)) intercept(l.fx, l.t); }
  drawFlashes();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
requestAnimationFrame(frame);
})();
