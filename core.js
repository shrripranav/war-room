// War Room core: state, sync, globe, effects model, sound. Shared by chair.html and display.html.
// The chair window owns the state; display windows only render what their viewer is allowed to see.
window.WR = (() => {
'use strict';
const ROLE = document.body.dataset.role;
const VIEWER = ROLE === 'chair' ? 'chair' : (new URLSearchParams(location.search).get('as') || 'public');
const KEY = 'warroom-v2', bus = new BroadcastChannel(KEY);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nf = new Intl.NumberFormat('en-US');
const sig = (n, d = 2) => { if (!n || n < 1) return 0; const m = 10 ** Math.max(0, Math.floor(Math.log10(n)) - d + 1); return Math.round(n / m) * m; };
const big = n => n == null ? '–' : n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + ' bn' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' m' : nf.format(Math.round(n));
const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const utc = t => new Date(t).toISOString().slice(11, 19);
const span = min => min < 1 ? Math.round(min * 60) + ' s' : min < 90 ? Math.round(min) + ' min' : min < 2880 ? (min / 60).toFixed(1) + ' h' : (min / 1440).toFixed(1) + ' days';

// ---------- icons (one outline set, 16px grid) ----------
const IC = {
  air: 'M8 1.5v13M8 6l-6 3.5M8 6l6 3.5M8 12.5l-2.5 1.5M8 12.5l2.5 1.5',
  naval: 'M8 4v10M8 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M5 7h6M2.5 9.5c.5 3 2.5 4.5 5.5 4.5s5-1.5 5.5-4.5',
  army: 'M8 1.5l5.5 2v4.5c0 3.2-2.3 5.4-5.5 6.5-3.2-1.1-5.5-3.3-5.5-6.5V3.5z',
  silo: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M8 8V1.5M8 8l5.6 3.3M8 8l-5.6 3.3',
  launcher: 'M2 11h12M4 11V8.5l8-3V11M5 13.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2M11 13.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  fleet: 'M1.5 10h13l-2 4h-9zM4 10V6.5h8V10M8 6.5V2.5',
  sub: 'M2 9.5c0-1.7 1.3-3 3-3h6.5c1.7 0 3 1.3 3 3s-1.3 3-3 3H5c-1.7 0-3-1.3-3-3M7 6.5V4h2.5v2.5',
  convoy: 'M1.5 4.5h8v7h-8zM9.5 7h3l2 2v2.5h-5M4.5 13.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4M11.5 13.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4',
  zone: 'M8 2l6.5 11.5h-13zM8 6.5V10M8 12v.5',
  impact: 'M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  history: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M8 4.5V8l2.5 1.5',
  pulse: 'M1.5 8h3l2-5 3 10 2-5h3',
  route: 'M2 12c3-8 9-8 12 0M10.5 11.5l3.5.5.5-3.5',
  wire: 'M2 3.5h12V11H7l-3 2.5V11H2z',
  sliders: 'M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7M10.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M5.5 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  undo: 'M5.5 3L2 6.5 5.5 10M2 6.5h7.5a4 4 0 0 1 0 8H6',
  sound: 'M2 6v4h3l4 3V3L5 6zM11.5 5.5a3.5 3.5 0 0 1 0 5M13 3.5a6.5 6.5 0 0 1 0 9',
  mute: 'M2 6v4h3l4 3V3L5 6zM11.5 6l3 4M14.5 6l-3 4',
  globe: 'M12 22.5a10.5 10.5 0 1 0 0-21 10.5 10.5 0 0 0 0 21M1.5 12h21M12 1.5c3 3 4.5 6.5 4.5 10.5S15 19.5 12 22.5M12 1.5C9 4.5 7.5 8 7.5 12s1.5 7.5 4.5 10.5',
};
const icon = (k, s = 14) => `<svg viewBox="0 0 ${k === 'globe' ? 24 : 16} ${k === 'globe' ? 24 : 16}" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[k]}"/></svg>`;

// ---------- catalogues ----------
const UNIT = { air: { n: 'Air base' }, naval: { n: 'Naval base' }, army: { n: 'Army base' }, silo: { n: 'Nuclear site' },
  launcher: { n: 'Mobile launcher', mobile: 1 }, fleet: { n: 'Fleet', mobile: 1 }, sub: { n: 'Submarine', mobile: 1 } };
const ZONE = { critical: { n: 'Critical zone', c: '#d9a441', cls: 'warn' }, war: { n: 'Active war zone', c: '#e5566f', cls: 'neg' },
  dead: { n: 'Uninhabitable zone', c: '#e5566f', cls: 'neg' }, blockade: { n: 'Naval blockade', c: '#d9a441', cls: 'warn' },
  nofly: { n: 'No-fly zone', c: '#bdbdc0', cls: 'quiet' }, blackout: { n: 'Blackout', c: '#bdbdc0', cls: 'quiet' } };
// Speeds and ranges are typical published figures; "def" is the default chance that defences stop it (the chair can change it).
const DELIVERY = {
  icbm: { n: 'Intercontinental ballistic missile', s: 'ICBM', kmh: 21000, range: 13000, arc: 'ballistic', def: 45, boost: 4, pay: ['nuke', 'emp', 'conv'] },
  slbm: { n: 'Submarine-launched ballistic missile', s: 'SLBM', kmh: 20000, range: 12000, arc: 'ballistic', def: 45, boost: 3, pay: ['nuke', 'emp'] },
  irbm: { n: 'Medium-range ballistic missile', s: 'MRBM', kmh: 11000, range: 4000, arc: 'ballistic', def: 55, boost: 2, pay: ['nuke', 'conv', 'emp'] },
  hgv: { n: 'Hypersonic glide vehicle', s: 'Hypersonic', kmh: 14000, range: 6000, arc: 'glide', def: 10, boost: 2, pay: ['nuke', 'conv'] },
  cruise: { n: 'Cruise missile', s: 'Cruise missile', kmh: 880, range: 2500, arc: 'low', def: 65, boost: 0, pay: ['conv', 'nuke'] },
  bomber: { n: 'Strategic bomber sortie', s: 'Bomber', kmh: 900, range: 12000, arc: 'low', def: 50, boost: 0, pay: ['conv', 'nuke'] },
  strike: { n: 'Fighter air strike', s: 'Air strike', kmh: 1500, range: 1500, arc: 'low', def: 40, boost: 0, pay: ['conv', 'nuke'] },
  drone: { n: 'Drone swarm', s: 'Drones', kmh: 185, range: 2000, arc: 'low', def: 80, boost: 0, pay: ['conv'] },
  ground: { n: 'Ground offensive', s: 'Ground offensive', kmh: 25, range: 1500, arc: 'surface', def: 50, boost: 0, pay: ['ground'] },
  cyber: { n: 'Cyber attack', s: 'Cyber attack', instant: 1, def: 50, pay: ['cyber'] },
};
const PAYLOAD = { nuke: 'Nuclear warhead', conv: 'Conventional explosive', emp: 'High-altitude nuclear burst (EMP)', ground: 'Troops and armour', cyber: 'Network intrusion' };
const DEFCON = { 5: ['Fade Out', 'Normal readiness'], 4: ['Double Take', 'Increased intelligence watch'], 3: ['Round House', 'Air force ready in 15 minutes'],
  2: ['Fast Pace', 'Armed forces ready in 6 hours'], 1: ['Cocked Pistol', 'Nuclear war imminent'] };
const MODES = { standard: 'Standard', population: 'Population', military: 'Military', history: 'Nuclear history' };
const HIST = [
  ['Trinity test', 1945, 33.677, -106.475, 21, 'First nuclear detonation, New Mexico'],
  ['Hiroshima', 1945, 34.395, 132.455, 15, 'First use in war, 6 August'],
  ['Nagasaki', 1945, 32.774, 129.863, 21, 'Second use in war, 9 August'],
  ['Semipalatinsk', 1949, 50.44, 77.81, 22, 'First Soviet test'],
  ['Montebello Islands', 1952, -20.41, 115.57, 25, 'First British test'],
  ['Ivy Mike, Enewetak', 1952, 11.67, 162.19, 10400, 'First hydrogen bomb'],
  ['Castle Bravo, Bikini', 1954, 11.7, 165.27, 15000, 'Largest US test'],
  ['Nevada Test Site', 1951, 37.12, -116.05, null, '928 US tests, 1951 to 1992'],
  ['Maralinga', 1956, -30.16, 131.6, null, 'British tests in Australia, 1956 to 1963'],
  ['Reggane', 1960, 26.31, -0.06, 70, 'First French test'],
  ['Tsar Bomba, Novaya Zemlya', 1961, 73.81, 54.98, 50000, 'Largest detonation in history'],
  ['San Cristobal, Cuba', 1962, 22.71, -83.05, null, 'Soviet missile sites of the Cuban Missile Crisis'],
  ['Lop Nur', 1964, 40.81, 89.79, 22, 'First Chinese test'],
  ['Mururoa', 1966, -21.83, -138.88, null, 'French Pacific tests, 1966 to 1996'],
  ['Pokhran', 1974, 27.095, 71.752, 12, 'First Indian test'],
  ['Vela incident', 1979, -47, 40, null, 'Suspected undeclared test'],
  ['Chagai', 1998, 28.79, 64.95, 40, 'First Pakistani tests'],
  ['Punggye-ri', 2006, 41.28, 129.09, 1, 'First North Korean test'],
].map(h => ({ id: 'h' + h[1] + h[2], n: h[0], y: h[1], lat: h[2], lng: h[3], kt: h[4], d: h[5] }));

// ---------- geography ----------
const RAD = Math.PI / 180, RE = 6371;
const COUNTRY = new Map(WORLD.map(f => [f.properties.name, f.properties]));
const CITY = CITIES.map(c => ({ n: c[0], c: c[1], lat: c[2], lng: c[3], p: c[4], cap: c[5] }));
const iso = name => COUNTRY.get(name)?.iso || name;
const dist = (a, b) => { const h = Math.sin((b.lat - a.lat) * RAD / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin((b.lng - a.lng) * RAD / 2) ** 2; return 2 * RE * Math.asin(Math.min(1, Math.sqrt(h))); };
function slerp(a, b, t) {
  const v = p => [Math.cos(p.lat * RAD) * Math.cos(p.lng * RAD), Math.cos(p.lat * RAD) * Math.sin(p.lng * RAD), Math.sin(p.lat * RAD)];
  const A = v(a), B = v(b), d = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (d < 1e-6) return { lat: a.lat, lng: a.lng };
  const k1 = Math.sin((1 - t) * d) / Math.sin(d), k2 = Math.sin(t * d) / Math.sin(d), x = A.map((q, i) => k1 * q + k2 * B[i]);
  return { lat: Math.asin(Math.max(-1, Math.min(1, x[2]))) / RAD, lng: Math.atan2(x[1], x[0]) / RAD };
}
// Point at a distance and bearing. Longitude is left unwrapped so shapes that cross the date line stay in one piece.
function dest(lat, lng, km, brg) {
  const d = km / RE, b = brg * RAD, la = Math.asin(Math.sin(lat * RAD) * Math.cos(d) + Math.cos(lat * RAD) * Math.sin(d) * Math.cos(b));
  return { lat: la / RAD, lng: lng + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat * RAD), Math.cos(d) - Math.sin(lat * RAD) * Math.sin(la)) / RAD };
}
const disc = (lat, lng, km) => { const ring = []; for (let i = 0; i <= 64; i++) { const p = dest(lat, lng, km, i * 5.625); ring.push([p.lng, p.lat]); } return { type: 'Polygon', coordinates: [ring] }; };
function plumeShape(lat, lng, len, wind) {
  const ring = [], w = len / 5;
  for (let i = 0; i <= 48; i++) { const a = i * 7.5 * RAD, x = len / 2 + len / 2 * Math.cos(a), y = w / 2 * Math.sin(a), p = dest(lat, lng, Math.hypot(x, y), wind + Math.atan2(y, x) / RAD); ring.push([p.lng, p.lat]); }
  return { type: 'Polygon', coordinates: [ring] };
}
function nearestCity(lat, lng, maxKm = 80) {
  let best = null, score = 0;
  for (const c of CITY) { if (Math.abs(c.lat - lat) > 1) continue; const d = dist(c, { lat, lng }); if (d > maxKm) continue; const s = c.p / (1 + d * d / 100); if (s > score) { score = s; best = c; } }
  return best;
}

// ---------- effects model ----------
// Blast and thermal radii follow the standard cube-root scaling laws for an air burst at optimum height
// (the method public calculators such as NUKEMAP use). Everything here is an estimate for the simulation.
function nukeFx(kt, burst) {
  const c = Math.cbrt(kt), k = burst === 'surface' ? 0.75 : 1;
  return { fireball: 0.06 * kt ** 0.4 * (burst === 'surface' ? 1.3 : 1), psi20: 0.28 * c * k, psi5: 0.71 * c * k,
    thermal: 0.67 * kt ** 0.41 * (burst === 'surface' ? 0.8 : 1), psi1: 2.2 * c * k, plume: burst === 'surface' ? 12 * kt ** 0.4 : 0 };
}
const empRadius = h => Math.sqrt(2 * RE * h);   // line of sight from the burst height
const lens = (R, r, d) => { if (d >= R + r) return 0; if (d <= Math.abs(R - r)) return Math.PI * Math.min(R, r) ** 2;
  const a = Math.acos((d * d + r * r - R * R) / (2 * d * r)), b = Math.acos((d * d + R * R - r * r) / (2 * d * R));
  return r * r * a + R * R * b - 0.5 * Math.sqrt((-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)); };
// People within a radius: each city is treated as a disc whose density grows with its size (2,000 to 15,000 per km2), plus thinned-out countryside.
function popWithin(lat, lng, km, country) {
  let pop = 0; const box = (km + 60) / 111;
  for (const c of CITY) { if (Math.abs(c.lat - lat) > box) continue; const rc = Math.sqrt(c.p / (Math.PI * Math.min(15000, 2000 * Math.max(1, c.p / 1e5) ** 0.3))), d = dist(c, { lat, lng }); if (d < km + rc) pop += c.p * lens(km, rc, d) / (Math.PI * rc * rc); }
  const cp = COUNTRY.get(country); if (cp) pop += Math.min(cp.dens * 0.5, 150) * Math.PI * km * km;
  return pop;
}
function casualties(o, wind) {
  let deaths = 0, injured = 0;
  if (o.payload === 'nuke') {
    const fx = nukeFx(o.kt, o.burst); deaths = popWithin(o.lat, o.lng, fx.psi5, o.country);
    injured = Math.max(0, popWithin(o.lat, o.lng, fx.psi1, o.country) - deaths) * 0.45;
    if (fx.plume) { const c = dest(o.lat, o.lng, fx.plume / 2, wind); deaths += popWithin(c.lat, c.lng, Math.sqrt(fx.plume * fx.plume / 5) / 2, o.country) * 0.15; }
  } else if (o.payload === 'conv') { const r = 0.06 * Math.sqrt(o.n || 1); deaths = popWithin(o.lat, o.lng, r, o.country) * 0.5; injured = popWithin(o.lat, o.lng, r * 3, o.country) * 0.3; }
  return { deaths: sig(deaths), injured: sig(injured) };
}
function flightPlan(a, b, kind, compress) {
  const D = DELIVERY[kind], km = dist(a, b);
  if (D.instant) return { km, realMin: 0, roomSec: 0, inRange: true };
  const realMin = km / D.kmh * 60 + D.boost;
  return { km, realMin, roomSec: Math.round(Math.min(600, Math.max(8, realMin * 60 / compress))), inRange: km <= D.range };
}
function traj(s, t) {
  const p = slerp(s.a, s.b, t), sn = Math.sin(Math.PI * t);
  p.alt = s.arc === 'ballistic' ? s.peak * sn : s.arc === 'glide' ? 0.012 + 0.03 * sn : s.arc === 'surface' ? 0.0068 : 0.009;
  return p;
}

// ---------- state ----------
function defaults() {
  const u = (name, country, type, lat, lng, nukes = 0, vis = 'public') => ({ id: uid(), name, country, type, lat, lng, nukes, vis, moving: null });
  const US = 'United States of America';
  return { v: 2, rev: 0, defcon: 5, participants: [US, 'Russia', 'China', 'United Kingdom', 'France'],
    units: [ u('Diego Garcia (placeholder)', US, 'naval', -7.31, 72.41), u('Minot (placeholder)', US, 'silo', 48.42, -101.36, 150), u('Ramstein (placeholder)', US, 'air', 49.44, 7.6),
      u('Atlantic patrol (placeholder)', US, 'sub', 44, -38, 20, 'hidden'), u('Severomorsk (placeholder)', 'Russia', 'naval', 69.07, 33.42, 40), u('Engels (placeholder)', 'Russia', 'air', 51.48, 46.21, 30),
      u('Barents patrol (placeholder)', 'Russia', 'sub', 74, 40, 16, 'hidden'), u('Faslane (placeholder)', 'United Kingdom', 'naval', 56.07, -4.82, 40),
      u('Ile Longue (placeholder)', 'France', 'naval', 48.31, -4.51, 48), u('Yulin (placeholder)', 'China', 'naval', 18.22, 109.55, 24) ],
    zones: [], moves: [], strikes: [], impacts: [], cfg: { compress: 30, wind: 90, autoFocus: true },
    view: { rev: 0, mode: 'standard', pov: null, spin: true, basemap: 'live', clouds: true },
    log: [{ id: uid(), t: Date.now(), text: 'Crisis map online. Placeholder forces loaded.', cls: '', vis: 'public' }] };
}
let S; try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* fall through to defaults */ }
if (!S || S.v !== 2) S = defaults();
const ui = { sel: null, selUnit: null, mode: S.view.mode };
const canSee = o => VIEWER === 'chair' || !o.vis || o.vis === 'public' || (Array.isArray(o.vis) && o.vis.includes(VIEWER));
const hooks = [], listeners = {};
const on = (ev, fn) => (listeners[ev] ||= []).push(fn), emit = (ev, x) => (listeners[ev] || []).forEach(fn => fn(x));

// ---------- sound (synthesised, no files) ----------
const audio = (() => {
  let ctx, siren = null, enabled = (localStorage.getItem(KEY + '-snd-' + ROLE) ?? (ROLE === 'display' ? '1' : '0')) === '1';
  const wake = () => { if (!enabled) return; ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); emit('audio'); };
  addEventListener('pointerdown', wake, { passive: true }); addEventListener('keydown', wake);
  const live = () => enabled && ctx && ctx.state === 'running';
  function tone(type, f, at, dur, vol, f2) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, at); if (f2) o.frequency.linearRampToValueAtTime(f2, at + dur);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol, at + 0.02); g.gain.setValueAtTime(vol, at + dur - 0.05); g.gain.linearRampToValueAtTime(0, at + dur);
    o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + dur + 0.05);
  }
  const api = {
    get enabled() { return enabled; }, get live() { return live(); },
    toggle() { enabled = !enabled; localStorage.setItem(KEY + '-snd-' + ROLE, enabled ? '1' : '0'); if (enabled) wake(); else api.silence(); return enabled; },
    silence() { if (siren) { try { siren.g.gain.cancelScheduledValues(0); siren.g.gain.setValueAtTime(0, ctx.currentTime); siren.o.stop(); } catch (e) { /* already stopped */ } siren = null; } },
    siren() { if (!live() || siren) return; const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.type = 'sawtooth';
      for (let i = 0; i < 20; i++) { o.frequency.setValueAtTime(380, t + i * 3); o.frequency.linearRampToValueAtTime(880, t + i * 3 + 1.5); o.frequency.linearRampToValueAtTime(380, t + i * 3 + 3); }
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11, t + 0.4);
      o.connect(lp).connect(g).connect(ctx.destination); o.start(t); o.stop(t + 60); siren = { o, g }; o.onended = () => { if (siren && siren.o === o) siren = null; }; },
    klaxon() { if (!live()) return; const t = ctx.currentTime; for (let i = 0; i < 3; i++) tone('square', 520, t + i * 0.45, 0.3, 0.1); },
    chime() { if (!live()) return; const t = ctx.currentTime; tone('sine', 880, t, 0.18, 0.12); tone('sine', 1320, t + 0.2, 0.26, 0.12); },
    boom(scale = 1) { if (!live()) return; const t = ctx.currentTime, len = 4, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = buf; lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(40, t + len);
      g.gain.setValueAtTime(0.9 * scale, t); g.gain.exponentialRampToValueAtTime(0.001, t + len); n.connect(lp).connect(g).connect(ctx.destination); n.start(t); tone('sine', 70, t, 1.6, 0.5 * scale, 28); },
  };
  return api;
})();

// ---------- globe ----------
const stage = $('#globe'), overlay = $('#overlay'), IMG = 'vendor/img/';
const rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)).join(',');
const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)), A = p(a), B = p(b); return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join(''); };
const POP_T = [1, 10, 25, 50, 100, 200, 400, 1000], MIL_T = [1e8, 5e8, 1e9, 5e9, 1e10, 5e10, 1e11, 5e11];
const step = (v, T) => T.filter(x => v >= x).length / T.length;
const popColor = d => mix('#1c2430', '#a8ccf4', step(d, POP_T)), milColor = m => m == null ? '#1e1e21' : mix('#2a2416', '#f2cd7a', step(m, MIL_T));
const imagery = () => (S.view.basemap || 'live') !== 'tactical';
function countryColor(p) {
  const img = imagery();
  if (ui.mode === 'population') return img ? `rgba(${rgb(popColor(p.dens))},0.72)` : popColor(p.dens);
  if (ui.mode === 'military') return img ? `rgba(${rgb(milColor(p.mil))},0.72)` : milColor(p.mil);
  const mem = S.participants.includes(p.name);
  return img ? (mem ? 'rgba(74,138,214,0.16)' : 'rgba(0,0,0,0)') : (mem ? '#5a5b63' : '#2b2b30');
}
const countryStroke = p => !imagery() ? '#6a6b73' : ui.mode === 'standard' && S.participants.includes(p.name) ? 'rgba(165,205,250,0.95)' : 'rgba(255,255,255,0.34)';
function tip(d) {
  if (d.fx) return `<div class="tip">${esc(d.label)}</div>`;
  const p = d.properties, row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`, dash = '<span class="muted">–</span>';
  let rows = row('Population', big(p.pop));
  if (ui.mode === 'population') rows += row('People per km²', nf.format(Math.round(p.dens)));
  if (ui.mode === 'military') rows += row('Military budget', p.mil ? '$' + big(p.mil) + ` <span class="muted">(${p.milYear})</span>` : dash) + row('Share of GDP', p.milPct != null ? p.milPct.toFixed(1) + '%' : dash) + row('Armed forces', p.troops ? big(p.troops) : dash) + row('Warheads (est.)', nf.format(p.nukes));
  return `<div class="tip"><b>${esc(p.name)}</b>${S.participants.includes(p.name) ? ' <span class="muted">committee member</span>' : ''}<dl class="kv">${rows}</dl></div>`;
}
const world = Globe()(stage).backgroundColor('#000000').backgroundImageUrl(IMG + 'night-sky.png')
  .globeImageUrl(IMG + 'earth-blue-marble.jpg').bumpImageUrl(IMG + 'earth-topology.png')
  .showAtmosphere(true).atmosphereColor('#7fb2ff').atmosphereAltitude(0.17).showGraticules(false)
  .polygonAltitude(d => d.fx ? d.alt : 0.005).polygonSideColor(() => 'rgba(0,0,0,0)').polygonStrokeColor(d => d.fx ? d.stroke : countryStroke(d.properties)).polygonCapColor(d => d.fx ? d.fill : countryColor(d.properties)).polygonLabel(tip).polygonsTransitionDuration(0)
  .htmlElement(d => d.el).htmlAltitude(0.012).htmlTransitionDuration(0)
  .ringColor(d => t => `rgba(${d.rgb},${1 - t})`).ringMaxRadius('maxR').ringPropagationSpeed('speed').ringRepeatPeriod('period').ringAltitude(0.0085)
  .pathPoints('pts').pathPointLat(p => p[0]).pathPointLng(p => p[1]).pathPointAlt(p => p[2]).pathColor(d => d.color).pathStroke(null).pathDashLength(0.012).pathDashGap(0.008).pathDashAnimateTime(0).pathTransitionDuration(0)
  .labelLat('lat').labelLng('lng').labelText('n').labelSize('size').labelDotRadius('dot').labelColor(d => d.cap ? '#ffffff' : '#dcdce0').labelAltitude(0.0075).labelResolution(2).labelsTransitionDuration(0)
  .labelLabel(d => `<div class="tip"><b>${esc(d.n)}</b>${d.cap ? ' <span class="muted">capital</span>' : ''}<dl class="kv"><dt>Country</dt><dd>${esc(d.c)}</dd><dt>Population</dt><dd>${big(d.p)}</dd></dl></div>`)
  .hexBinPointLat('lat').hexBinPointLng('lng').hexBinPointWeight('p').hexBinResolution(3).hexMargin(0.25).hexBinMerge(true).hexTransitionDuration(0)
  .hexAltitude(d => 0.006 + Math.min(0.4, d.sumWeight / 3.5e7 * 0.4)).hexTopColor(d => mix('#3a6aa6', '#cfe3fa', Math.min(1, d.sumWeight / 1.5e7))).hexSideColor(d => mix('#27456b', '#6f9fd6', Math.min(1, d.sumWeight / 1.5e7)))
  .onGlobeClick(c => emit('pick', { lat: c.lat, lng: c.lng, country: null })).onPolygonClick((p, ev, c) => emit('pick', { lat: c.lat, lng: c.lng, country: p.fx ? p.country || null : p.properties.name }));
const mat = world.globeMaterial();
world.pointOfView({ lat: 30, lng: 40, altitude: 2.2 });
world.enablePointerInteraction(false); stage.addEventListener('pointermove', () => world.enablePointerInteraction(true), { once: true });   // no stray tooltip before the mouse arrives
const fit = () => world.width(stage.clientWidth).height(stage.clientHeight);
new ResizeObserver(fit).observe(stage); fit();
const focus = (lat, lng, altitude = 1.4, ms = 1400) => world.pointOfView({ lat, lng, altitude }, ms);

// ---------- the real Earth: NASA imagery lit by today's sun, city lights on the night side ----------
// Textures: NASA Blue Marble (day), Black Marble (night lights), SRTM relief, water mask, clouds, Tycho star map.
const SUN = { sunDir: { value: { x: 1, y: 0, z: 0 } }, nightMode: { value: 1 }, nightMap: { value: null } };
function sunPoint(d = new Date()) {   // the point on Earth where the sun is overhead right now
  const n = d.getTime() / 86400000 - 10957.5, g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lam = ((280.46 + 0.9856474 * n) % 360 + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD, eps = 23.439 * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)), ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / RAD;
  const lng = ((ra - (280.46061837 + 360.98564736629 * n)) % 360 + 540) % 360 - 180;
  return { lat: dec / RAD, lng };
}
function aimSun() { const s = sunPoint(), c = world.getCoords(s.lat, s.lng, 0), l = Math.hypot(c.x, c.y, c.z); SUN.sunDir.value = { x: c.x / l, y: c.y / l, z: c.z / l }; }
const GLSL = {
  globe: `#ifdef USE_MAP
  { float sd = dot(normalize(vWN), sunDir);
    if (nightMode > 2.5) { gl_FragColor.rgb = vec3(0.051, 0.051, 0.063); }
    else { float day = nightMode > 1.5 ? 0.0 : smoothstep(-0.07, 0.13, sd);
      vec3 lights = texture2D(nightMap, vMapUv).rgb;
      vec3 night = linearToOutputTexel(vec4(texture2D(map, vMapUv).rgb * 0.02 + lights * vec3(1.35, 1.05, 0.72) * 1.6, 1.0)).rgb;
      float band = (1.0 - abs(day * 2.0 - 1.0)) * step(nightMode, 1.5);
      gl_FragColor.rgb = mix(night, gl_FragColor.rgb, day) + vec3(0.9, 0.38, 0.12) * 0.08 * band; } }
  #endif`,
  cloud: `{ float sd = dot(normalize(vWN), sunDir); float day = nightMode > 1.5 ? 0.0 : smoothstep(-0.1, 0.16, sd);
    gl_FragColor.rgb *= mix(0.05, 1.0, day); gl_FragColor.a *= mix(0.4, 1.0, day); }`,
};
function shade(m, kind) {
  m.customProgramCacheKey = () => 'warroom-' + kind;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, SUN);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN;\nuniform vec3 sunDir;\nuniform float nightMode;\nuniform sampler2D nightMap;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + GLSL[kind]);
  };
  m.needsUpdate = true;
}
let clouds = null, dressed = false, baseSig = '';
function dressGlobe() {
  if (dressed || !mat.map) return; dressed = true;
  const Tex = mat.map.constructor, load = (url, fn) => { const im = new Image(); im.onload = () => { const t = new Tex(im); t.colorSpace = mat.map.colorSpace; t.anisotropy = 4; t.needsUpdate = true; fn(t); }; im.src = url; };
  shade(mat, 'globe'); aimSun(); setInterval(aimSun, 30000);
  load(IMG + 'earth-night.jpg', t => { SUN.nightMap.value = t; });
  load(IMG + 'earth-water.png', t => { t.colorSpace = ''; mat.specularMap = t; mat.specular = new mat.specular.constructor('#38485a'); mat.shininess = 16; mat.needsUpdate = true; });
  let gm = null; world.scene().traverse(o => { if (o.material === mat) gm = o; });
  if (gm && gm.geometry.type === 'SphereGeometry') load(IMG + 'clouds.png', t => {
    const cm = new mat.constructor({ map: t, transparent: true, opacity: 0.55, depthWrite: false }); shade(cm, 'cloud');
    clouds = new gm.constructor(new gm.geometry.constructor(world.getGlobeRadius() * 1.0042, 75, 75), cm);
    clouds.rotation.copy(gm.rotation); gm.parent.add(clouds); baseSig = ''; applyBase();
  });
}
world.onGlobeReady(dressGlobe);
const dressTry = setInterval(() => { if (mat.map) { clearInterval(dressTry); dressGlobe(); } }, 250);
function applyBase() {
  const b = S.view.basemap || 'live', cl = S.view.clouds !== false, k = b + cl + !!clouds;
  if (k === baseSig) return; baseSig = k;
  SUN.nightMode.value = b === 'live' ? 1 : b === 'night' ? 2 : 3;
  world.showAtmosphere(b !== 'tactical');
  if (clouds) clouds.visible = cl && b !== 'tactical';
  colorSig = '';
}

// city labels follow the zoom: capitals and megacities from far out, smaller cities as you move in
let labelTimer;
function refreshLabels() {
  const pov = world.pointOfView(), alt = pov.altitude, reach = Math.acos(1 / (1 + alt)) * RE * 0.9, far = alt > 1.25;
  document.body.classList.toggle('far', far);
  const size = Math.min(0.5, Math.max(0.01, alt * 0.22)), [max, minPop, minCap] = alt > 2 ? [45, 6e6, 3e6] : alt > 1.2 ? [80, 2.5e6, 1e6] : alt > 0.6 ? [120, 6e5, 0] : alt > 0.3 ? [150, 1e5, 0] : [170, 0, 0], out = [];
  for (const c of CITY) { if (out.length >= max) break; if (c.p < (c.cap ? minCap : minPop)) continue; if (dist(c, pov) > reach) continue; out.push({ ...c, size: c.cap ? size * 1.15 : size, dot: size * 0.28 }); }
  world.labelsData(out);
}
let lastPov = '';
setInterval(() => { const p = world.pointOfView(), k = [p.lat.toFixed(1), p.lng.toFixed(1), p.altitude.toFixed(2)].join(); if (k === lastPov) return; lastPov = k; clearTimeout(labelTimer); labelTimer = setTimeout(refreshLabels, 120); }, 250);

// keep object identity stable between renders so the globe only rebuilds what changed
const cache = new Map();
const keep = (id, make) => { let o = cache.get(id); if (!o) cache.set(id, o = make()); o.live = true; return o; };
// a marker's icon sits exactly on its point; the label reads to the right of it
function marker(id, lat, lng, cls, ic, lb, pickId) {
  const o = keep('m' + id, () => { const el = document.createElement('div'); if (pickId) el.addEventListener('click', e => { e.stopPropagation(); emit('unit', pickId); }); return { el, h: '' }; });
  const h = `<i class="ic">${ic}</i>${lb ? `<div class="lb">${lb}</div>` : ''}`;
  o.lat = lat; o.lng = lng; if (o.el.className !== cls) o.el.className = cls; if (o.h !== h) { o.el.innerHTML = h; o.h = h; } return o;
}
let polySig = null, colorSig = '';

function render() {
  applyBase();
  const now = Date.now(), html = [], fx = [], rings = [], paths = [];
  for (const o of cache.values()) o.live = false;
  const pathOf = (id, s, color) => paths.push(keep('p' + id, () => ({ color, pts: Array.from({ length: 61 }, (_, i) => { const p = traj(s, i / 60); return [p.lat, p.lng, p.alt]; }) })));
  const poly = (id, make, fill, stroke, alt, label, country) => fx.push(Object.assign(keep('f' + id, () => ({ fx: 1, fid: id, geometry: make() })), { fill, stroke, alt, label, country }));
  const dead = d => d ? 'est. ' + big(d) + ' dead' : '';

  for (const u of S.units) { if (!canSee(u)) continue;
    if (u.moving) { pathOf(u.id + u.moving.t0, { a: u.moving.a, b: u.moving.b, arc: 'surface' }, 'rgba(189,189,192,0.7)'); continue; }
    const covert = u.vis !== 'public';
    html.push(marker(u.id, u.lat, u.lng, `mk unit pick${covert ? ' covert' : ''}${ui.selUnit === u.id ? ' sel' : ''}`, icon(u.type),
      `<span>${esc(u.name)}</span><small>${esc(iso(u.country))}${u.nukes ? ` · ${nf.format(u.nukes)} warheads` : ''}${covert && VIEWER === 'chair' ? ' · hidden' : ''}</small>`, u.id)); }
  for (const z of S.zones) { if (!canSee(z)) continue; const Z = ZONE[z.type];
    html.push(marker(z.id, z.lat, z.lng, 'mk ' + Z.cls, icon('zone'), `<span>${esc(Z.n)}${z.label ? ': ' + esc(z.label) : ''}</span>`));
    const fill = z.type === 'blackout' ? 'rgba(0,0,0,0.8)' : z.type === 'dead' ? 'rgba(40,10,10,0.5)' : `rgba(${rgb(Z.c)},0.16)`;
    poly(z.id, () => disc(z.lat, z.lng, z.r), fill, Z.c, 0.0062, `${Z.n}${z.label ? ': ' + z.label : ''}, radius ${nf.format(z.r)} km`, z.country);
    if (z.type === 'war') rings.push(keep('r' + z.id, () => ({ lat: z.lat, lng: z.lng, rgb: rgb(Z.c), maxR: z.r / 111, speed: z.r / 111 / 2.5, period: 1800 }))); }
  for (const m of S.moves) if (canSee(m)) pathOf(m.id, { a: m.a, b: m.b, arc: 'surface' }, '#d9a441');
  for (const s of S.strikes) pathOf(s.id, s, 'rgba(229,86,111,0.55)');
  for (const i of S.impacts) {
    if (i.kind === 'nuke') { const f = nukeFx(i.kt, i.burst), where = i.city ? i.city + ', ' : '';
      html.push(marker(i.id, i.lat, i.lng, 'mk neg', icon('silo'), `<span>Ground zero · ${nf.format(i.kt)} kt</span><small>${dead(i.deaths) || 'no recorded population'}</small>`));
      if (f.plume) poly(i.id + 'pl', () => plumeShape(i.lat, i.lng, f.plume, i.wind), 'rgba(217,164,65,0.22)', '#d9a441', 0.0064, `Fallout plume, about ${Math.round(f.plume)} km downwind: uninhabitable`, i.country);
      [['psi1', 'rgba(229,86,111,0.12)', 'Light blast (1 psi): windows shatter', 0.0066], ['thermal', 'rgba(217,120,50,0.24)', 'Third-degree burns', 0.0069], ['psi5', 'rgba(200,60,60,0.38)', 'Moderate blast (5 psi): most buildings collapse', 0.0072],
        ['psi20', 'rgba(150,30,30,0.62)', 'Heavy blast (20 psi): concrete buildings destroyed', 0.0075], ['fireball', 'rgba(18,10,8,0.92)', 'Fireball: everything vaporised', 0.0078]]
        .forEach(([k, fill, label, alt]) => poly(i.id + k, () => disc(i.lat, i.lng, f[k]), fill, '#e5566f', alt, `${where}${label}, radius ${f[k].toFixed(f[k] < 10 ? 1 : 0)} km`, i.country));
      if (now - i.t < 90000) rings.push(keep('r' + i.id, () => ({ lat: i.lat, lng: i.lng, rgb: '229,86,111', maxR: Math.max(4, f.psi1 / 111 * 3), speed: 3, period: 900 })));
    } else if (i.kind === 'emp') {
      html.push(marker(i.id, i.lat, i.lng, 'mk quiet', icon('impact'), `<span>High-altitude burst</span><small>electronics down within ${nf.format(Math.round(i.r))} km</small>`));
      poly(i.id, () => disc(i.lat, i.lng, i.r), 'rgba(0,0,0,0.72)', '#bdbdc0', 0.0064, `EMP footprint: grid and electronics disrupted, radius ${nf.format(Math.round(i.r))} km`, i.country);
    } else html.push(marker(i.id, i.lat, i.lng, 'mk neg', icon('impact'), `<span>${esc(i.label)}</span><small>${dead(i.deaths) || 'damage reported'}</small>`));
  }
  if (ui.mode === 'history') for (const h of HIST) html.push(marker(h.id, h.lat, h.lng, 'mk hist quiet', icon('history'), `<span>${esc(h.n)}, ${h.y}</span><small>${h.kt ? nf.format(h.kt) + ' kt · ' : ''}${esc(h.d)}</small>`));
  if (ui.mode === 'military') for (const p of COUNTRY.values()) if (p.nukes) { const c = CITY.find(c => c.cap && c.c === p.name); if (c) html.push(marker('n' + p.iso, c.lat, c.lng, 'mk warn', icon('silo'), `<span>${nf.format(p.nukes)} warheads</span><small>${esc(p.name)}</small>`)); }
  if (ui.sel && ROLE === 'chair') html.push(marker('sel', ui.sel.lat, ui.sel.lng, 'mk bare cross', icon('impact', 18), ''));

  for (const [k, o] of cache) if (!o.live) cache.delete(k);
  world.htmlElementsData(html).ringsData(rings).pathsData(paths);
  const sigNow = fx.map(f => f.fid).join(), cs = ui.mode + '|' + S.participants.join() + '|' + (S.view.basemap || 'live');
  if (sigNow !== polySig) { polySig = sigNow; world.polygonsData(WORLD.concat(fx)); }
  if (cs !== colorSig) { colorSig = cs; world.polygonCapColor(d => d.fx ? d.fill : countryColor(d.properties)).polygonStrokeColor(d => d.fx ? d.stroke : countryStroke(d.properties)); }
  drawChrome(); hooks.forEach(fn => fn());
}

// ---------- chrome shared by both screens: DEFCON ladder, mode tabs, legend, event strip ----------
function drawChrome() {
  document.body.dataset.alert = S.defcon;
  const lad = $('#ladder');
  if (lad) lad.innerHTML = [5, 4, 3, 2, 1].map(n => { const cur = S.defcon === n, tag = ROLE === 'chair' ? 'button' : 'span';
    return `<${tag} ${ROLE === 'chair' ? `data-defcon="${n}" title="Set DEFCON ${n}: ${DEFCON[n][1]}"` : ''} aria-current="${cur}" class="${cur && n <= 2 ? 'hot' : ''}"><b>${n}</b><small>${DEFCON[n][0]}</small></${tag}>`; }).join('');
  const dn = $('#defconNote'); if (dn) dn.textContent = `DEFCON ${S.defcon}: ${DEFCON[S.defcon][1]}`;
  const tabs = $('#modes'); if (tabs) tabs.innerHTML = Object.entries(MODES).map(([k, n]) => `<button data-mode="${k}" aria-pressed="${ui.mode === k}">${n}</button>`).join('');
  const lg = $('#legend'); if (lg) lg.innerHTML = legend();
  const strip = $('#strip ol'); if (strip) strip.innerHTML = S.log.filter(canSee).slice(-5).reverse().map(l => `<li class="${l.cls}${l.vis !== 'public' ? ' chair' : ''}"><time>${utc(l.t)}</time><span>${esc(l.text)}</span></li>`).join('');
}
function legend() {
  const scale = (fn, T, ticks, src, title) => `<h2>${title}</h2><div class="scale">${[0, ...T].map(v => `<i style="background:${fn(v)}"></i>`).join('')}</div><div class="ticks">${ticks.map(t => `<span>${t}</span>`).join('')}</div><p class="src">${src}</p>`;
  if (ui.mode === 'population') return scale(popColor, POP_T, ['1', '25', '100', '400', '1,000'], 'People per km² by country. Columns show how many people live in cities there. Natural Earth, 2019 estimates.', 'Population density');
  if (ui.mode === 'military') return scale(milColor, MIL_T, ['$0.1 bn', '$1 bn', '$10 bn', '$100 bn', '$500 bn'], 'Yearly military budget, World Bank and SIPRI, latest year on record. Warheads: FAS estimates, 2025.', 'Military spending');
  if (ui.mode === 'history') return '<h2>Nuclear history</h2><p class="src">Detonations, test sites and flashpoints since 1945, from the historical record.</p>';
  const img = imagery();
  return `<h2>Crisis map</h2><ul class="keys"><li><i style="background:${img ? '#4a8ad6' : '#5a5b63'}"></i>Committee member</li><li><i style="background:${img ? 'transparent' : '#2b2b30'};border:1px solid ${img ? 'rgba(255,255,255,.5)' : '#6a6b73'}"></i>Other state</li><li><i style="background:#d9a441"></i>Critical zone or blockade</li><li><i style="background:#e5566f"></i>War zone, strike or blast</li></ul>${img && (S.view.basemap || 'live') === 'live' ? '<p class="src">Daylight and night follow the real sun, right now.</p>' : ''}`;
}
function setMode(m) { ui.mode = m; world.hexBinPointsData(m === 'population' ? CITY : []); render(); }
document.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });

// ---------- labels that travel with moving things (the drawing itself is in fx.js) ----------
const movers = new Map();
const hiddenBehindGlobe = (lat, lng, alt) => { const p = world.getCoords(lat, lng, alt), c = world.camera().position, dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, t = -(c.x * dx + c.y * dy + c.z * dz) / (dx * dx + dy * dy + dz * dz);
  return t > 0 && t < 1 && Math.hypot(c.x + t * dx, c.y + t * dy, c.z + t * dz) < world.getGlobeRadius() * 0.997; };
function mover(id, cls, glyph) { let m = movers.get(id); if (!m) { const el = document.createElement('div'); el.className = 'fly ' + cls; el.innerHTML = (glyph ? `<i class="ic">${glyph}</i>` : '') + '<span></span>'; overlay.appendChild(el); movers.set(id, m = { el, s: el.lastChild, txt: '' }); } m.live = true; return m; }
function place(el, p) { if (hiddenBehindGlobe(p.lat, p.lng, p.alt)) { el.style.display = 'none'; return null; } const sc = world.getScreenCoords(p.lat, p.lng, p.alt); el.style.display = ''; el.style.transform = `translate(${sc.x}px,${sc.y}px)`; return sc; }
const prog = (o, now) => Math.min(1, Math.max(0, (now - o.t0) / (o.eta - o.t0)));
function frame() {
  requestAnimationFrame(frame); const now = Date.now();
  if (clouds && clouds.visible) clouds.rotation.y += 0.00002;
  for (const m of movers.values()) m.live = false;
  const put = (m, p, text) => { place(m.el, p); if (text !== m.txt) { m.s.textContent = text; m.txt = text; } };
  for (const s of S.strikes) put(mover(s.id, 'neg', ''), traj(s, prog(s, now)), `${s.short} ${clock(s.eta - now)}`);
  for (const c of S.moves) if (canSee(c)) put(mover(c.id, 'warn', icon('convoy')), traj({ a: c.a, b: c.b, arc: 'surface' }, prog(c, now)), `${iso(c.country)} convoy, ${c.n} warheads ${clock(c.eta - now)}`);
  for (const u of S.units) if (u.moving && canSee(u)) put(mover(u.id, 'quiet', icon(u.type)), traj({ a: u.moving.a, b: u.moving.b, arc: 'surface' }, prog(u.moving, now)), `${u.name} ${clock(u.moving.eta - now)}`);
  for (const [id, m] of movers) if (!m.live) { m.el.remove(); movers.delete(id); }
}
function flash() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fl = $('#flash'); if (fl) { fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); fl.onanimationend = () => fl.classList.remove('go'); }
  if (ROLE === 'display') { const st = $('.stage'); st.classList.remove('shake'); void st.offsetWidth; st.classList.add('shake'); }
}

// ---------- events: every new log line may carry a sound, a blast and a camera move ----------
const seen = new Set(S.log.map(l => l.id));
function react() {
  for (const l of S.log) { if (seen.has(l.id)) continue; seen.add(l.id); if (!canSee(l)) continue;
    if (l.snd === 'launch') audio.siren(); else if (l.snd === 'defcon') audio.klaxon(); else if (l.snd === 'chime') audio.chime();
    else if (l.snd === 'impact') { const i = S.impacts.find(x => x.id === l.ref); if (i) { audio.boom(i.kind === 'conv' ? 0.35 : 1); if (i.kind !== 'conv') flash(); } if (!S.strikes.length) audio.silence(); }
    if (l.snd === 'clear' && !S.strikes.length) audio.silence();
    if (ROLE === 'display' && S.cfg.autoFocus && l.at) { world.controls().autoRotate = false; focus(l.at.lat, l.at.lng, l.at.alt || 1.3); }
  }
}
let viewRev = -1;
function applyView() { if (ROLE !== 'display' || S.view.rev === viewRev) return; viewRev = S.view.rev; if (S.view.mode !== ui.mode) { ui.mode = S.view.mode; world.hexBinPointsData(ui.mode === 'population' ? CITY : []); } if (S.view.pov) world.pointOfView(S.view.pov, 1200); world.controls().autoRotate = !!S.view.spin; }
world.controls().autoRotateSpeed = 0.25;

bus.onmessage = e => { const m = e.data;
  if (m.t === 'silence') audio.silence();
  if (ROLE === 'display' && m.t === 'state') { S = m.S; react(); applyView(); render(); }
  if (ROLE === 'chair' && m.t === 'hello') bus.postMessage({ t: 'state', S }); };
function commit() { S.rev++; localStorage.setItem(KEY, JSON.stringify(S)); bus.postMessage({ t: 'state', S }); react(); render(); }
function say(text, cls = '', extra = {}) { S.log.push({ id: uid(), t: Date.now(), text, cls, vis: 'public', ...extra }); if (S.log.length > 300) S.log.shift(); }

applyView(); if (ROLE === 'display') bus.postMessage({ t: 'hello' });
setTimeout(() => { refreshLabels(); render(); }, 0);
requestAnimationFrame(frame);

return { ROLE, VIEWER, KEY, bus, $, esc, uid, nf, big, clock, utc, span, sig, icon, UNIT, ZONE, DELIVERY, PAYLOAD, DEFCON, MODES, HIST, COUNTRY, CITY, iso, dist, dest, slerp, traj, prog, sunPoint, disc,
  nearestCity, nukeFx, empRadius, casualties, flightPlan, popWithin, defaults, canSee, on, hooks, audio, world, focus, render, setMode, commit, say, ui,
  get S() { return S; }, set S(v) { S = v; } };
})();
