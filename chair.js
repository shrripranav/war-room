// Chair console: the only screen that can change the map. Everything here ends in WR.commit(), which
// saves the state and sends it to every display window.
(() => {
'use strict';
const { $, esc, uid, nf, big, clock, utc, span, icon, UNIT, ZONE, DELIVERY, PAYLOAD, DEFCON, COUNTRY, iso, dist, nearestCity, nukeFx, empRadius, casualties, flightPlan, audio, world, focus, ui, bus } = WR;
const S = () => WR.S, val = id => $('#' + id).value, num = (id, d = 0) => { const v = parseFloat(val(id)); return Number.isFinite(v) ? v : d; };
const unit = id => S().units.find(u => u.id === id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- undo ----------
const stack = [];
function act(label, fn) { stack.push({ label, at: Date.now(), json: JSON.stringify(S()) }); if (stack.length > 60) stack.shift(); fn(); WR.commit(); }
function undo() {
  const s = stack.pop(); if (!s) return;
  const R = JSON.parse(s.json), d = Date.now() - s.at, shift = o => { o.t0 += d; o.eta += d; };
  R.strikes.forEach(shift); R.moves.forEach(shift); R.units.forEach(u => u.moving && shift(u.moving));   // clocks resume where they stood
  R.rev = S().rev; WR.S = R; if (!R.strikes.length) { audio.silence(); bus.postMessage({ t: 'silence' }); }
  WR.commit();
}
addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); undo(); } });

// ---------- unbiased adjudicator: operating-system randomness, result shown in the log ----------
function roll() { const a = new Uint32Array(1); let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= 4294967200); return x % 100 + 1; }
function adjudicate(what, pct, vis = 'public') { const r = roll(), ok = r <= pct; WR.say(`Adjudicator: ${what}. Needed ${pct} or under, rolled ${r}: ${ok ? 'success' : 'failure'}.`, 'dice', { vis }); return ok; }

// ---------- dialog ----------
function ask({ title, text = '', fields = [], ok = 'Confirm', danger = false }) {
  return new Promise(res => {
    const d = $('#dlg'); $('#dTitle').textContent = title; $('#dText').textContent = text; $('#dOk').textContent = ok; $('#dOk').className = 'btn ' + (danger ? 'danger' : 'primary');
    $('#dFields').innerHTML = fields.map(f => `<label for="d_${f.name}">${esc(f.label)}</label>` + (f.options
      ? `<select id="d_${f.name}">${f.options.map(o => `<option${o === f.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      : `<input id="d_${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.type === 'number' ? 'min="0" max="100"' : ''} required>`)).join('');
    let done = false; const finish = v => { if (!done) { done = true; res(v); } };
    d.querySelector('form').onsubmit = e => finish(e.submitter && e.submitter.value === 'ok' ? Object.fromEntries(fields.map(f => [f.name, $('#d_' + f.name).value])) : null);
    d.oncancel = () => finish(null); d.onclose = () => finish(null);
    d.showModal();
  });
}

// ---------- selection ----------
WR.on('pick', p => { const c = nearestCity(p.lat, p.lng); ui.sel = { lat: +p.lat.toFixed(3), lng: +p.lng.toFixed(3), country: p.country, city: c ? c.n : null, cityCountry: c ? c.c : null };
  if (p.country) $('#uCountry').value = p.country; WR.render(); });
WR.on('unit', id => { ui.selUnit = ui.selUnit === id ? null : id; if (ui.selUnit) { $('#sFrom').value = id; $('#mFrom').value = id; } WR.render(); });
const placeName = s => s.city ? `${s.city}, ${s.cityCountry}` : s.country || 'open sea';
const needPoint = () => ui.sel || (ask({ title: 'Pick a point first', text: 'Click the globe where this should happen, then try again.', ok: 'Understood' }), null);

// ---------- actions ----------
const visOf = (v, country) => v === 'owner' ? [country] : v;
const logVis = o => o.vis === 'public' ? 'public' : 'hidden';
const A = {
  silence() { audio.silence(); bus.postMessage({ t: 'silence' }); },
  undo,
  openDisplay() { open('display.html', 'warroom-display'); },
  pushView() { const s = S(); s.view = { rev: s.view.rev + 1, mode: ui.mode, pov: world.pointOfView(), spin: false }; $('#spin').checked = false; WR.commit(); },
  addUnit() { const p = needPoint(); if (!p) return; const country = val('uCountry').trim() || 'Unassigned', type = val('uType');
    act('place unit', () => S().units.push({ id: uid(), name: val('uName').trim() || UNIT[type].n, country, type, lat: p.lat, lng: p.lng, nukes: Math.max(0, Math.round(num('uNukes'))), vis: visOf(val('uVis'), country), moving: null }));
    $('#uName').value = ''; },
  delUnit(id) { act('remove unit', () => { S().units = S().units.filter(u => u.id !== id); if (ui.selUnit === id) ui.selUnit = null; }); },
  findUnit(id) { const u = unit(id); if (u) focus(u.lat, u.lng, 1); },
  setVis(id, v) { const u = unit(id); act('change visibility', () => { u.vis = visOf(v, u.country); }); },
  setNukes(id, v) { const u = unit(id); act('change warheads', () => { u.nukes = Math.max(0, Math.round(+v || 0)); }); },
  async moveUnit(id) { const u = unit(id), p = needPoint(); if (!u || !p) return;
    const r = await ask({ title: `Move ${u.name}`, text: `To ${placeName(p)}, ${nf.format(Math.round(dist(u, p)))} km away.`, fields: [{ name: 'sec', label: 'Transit time on screen, seconds', type: 'number', value: 60 }], ok: 'Get under way' }); if (!r) return;
    act('move unit', () => { const t0 = Date.now(); u.moving = { a: { lat: u.lat, lng: u.lng }, b: { lat: p.lat, lng: p.lng }, t0, eta: t0 + Math.max(5, +r.sec || 60) * 1000 };
      WR.say(`${u.name} is under way toward ${placeName(p)}.`, '', { vis: logVis(u) }); }); },
  async sweep(id) { const u = unit(id); if (!u) return;
    const r = await ask({ title: `Search for ${u.name}`, text: 'A state hunts for this hidden unit. The dice decide.', fields: [{ name: 'who', label: 'Searching state', options: S().participants, value: S().participants[0] }, { name: 'pct', label: 'Chance of success, %', type: 'number', value: 25 }], ok: 'Roll' }); if (!r) return;
    act('detection sweep', () => { if (adjudicate(`${r.who} search for a hidden ${UNIT[u.type].n.toLowerCase()}`, clamp(+r.pct || 0, 0, 100), 'hidden')) { u.vis = 'public';
      WR.say(`${r.who} has detected ${u.country}'s ${UNIT[u.type].n.toLowerCase()} "${u.name}".`, 'warn', { snd: 'chime', at: { lat: u.lat, lng: u.lng, alt: 1.2 } }); } else WR.say(`${r.who} searched and found nothing.`, '', { vis: 'hidden' }); }); },
  addZone() { const p = needPoint(); if (!p) return; const type = val('zType'), label = val('zLabel').trim(), vis = val('zVis');
    act('add zone', () => { S().zones.push({ id: uid(), type, label, lat: p.lat, lng: p.lng, r: Math.max(1, num('zR', 300)), vis, country: p.country, t: Date.now() });
      WR.say(`${ZONE[type].n} declared${label ? ': ' + label : ' at ' + placeName(p)}.`, ZONE[type].cls === 'neg' ? 'bad' : 'warn', { vis, snd: 'chime', at: { lat: p.lat, lng: p.lng, alt: 1.3 } }); }); $('#zLabel').value = ''; },
  delZone(id) { act('remove zone', () => { S().zones = S().zones.filter(z => z.id !== id); }); },
  delImpact(id) { act('clear strike site', () => { S().impacts = S().impacts.filter(z => z.id !== id); }); },
  find(ll) { const [lat, lng] = ll.split(',').map(Number); focus(lat, lng, 1); },
  transfer() { const a = unit(val('mFrom')), b = unit(val('mTo')), n = Math.round(num('mN', 1)), covert = $('#mCovert').checked;
    if (!a || !b || a === b) return ask({ title: 'Pick two different units', text: 'A transfer needs a sender and a receiver.', ok: 'Understood' });
    if (n < 1 || n > a.nukes) return ask({ title: 'Not enough warheads', text: `${a.name} holds ${nf.format(a.nukes)}.`, ok: 'Understood' });
    act('order transfer', () => { a.nukes -= n; const t0 = Date.now(), vis = covert ? 'hidden' : 'public';
      S().moves.push({ id: uid(), country: a.country, n, to: b.id, a: { lat: a.lat, lng: a.lng }, b: { lat: b.lat, lng: b.lng }, t0, eta: t0 + Math.max(5, num('mSec', 120)) * 1000, label: `${a.name} to ${b.name}`, vis });
      WR.say(`${a.country} is moving ${n} warhead${n > 1 ? 's' : ''} from ${a.name} to ${b.name}.`, 'warn', { vis, snd: 'chime', at: { lat: a.lat, lng: a.lng, alt: 1.5 } }); }); },
  async intercept(id) { const m = S().moves.find(x => x.id === id); if (!m) return;
    const r = await ask({ title: 'Intercept the convoy', text: `${m.country} convoy, ${m.label}, ${m.n} warheads. The dice decide.`, fields: [{ name: 'who', label: 'Intercepting state', options: S().participants.filter(p => p !== m.country), value: '' }, { name: 'pct', label: 'Chance of success, %', type: 'number', value: 35 }], ok: 'Roll' });
    if (!r || !S().moves.includes(m)) return;
    act('intercept convoy', () => { if (adjudicate(`${r.who} interception of the ${m.country} convoy`, clamp(+r.pct || 0, 0, 100), m.vis)) { S().moves = S().moves.filter(x => x !== m);
      WR.say(`${r.who} intercepted the ${m.country} convoy. ${m.n} warhead${m.n > 1 ? 's' : ''} destroyed.`, 'bad', { snd: 'chime' }); } else WR.say(`${r.who} failed to intercept the ${m.country} convoy.`, 'warn', { vis: m.vis }); }); },
  abort(id) { act('abort strike', () => { S().strikes = S().strikes.filter(s => s.id !== id); WR.say('Strike aborted in flight by order of the chair.', 'warn', { snd: 'clear' }); }); },
  news() { const text = val('nText').trim(); if (!text) return; act('news flash', () => WR.say(text, val('nTone'), { vis: val('nVis'), snd: 'chime' })); $('#nText').value = ''; },
  toggleMember() { const p = needPoint(); if (!p) return; if (!p.country) return ask({ title: 'That is open sea', text: 'Click a country on the globe first.', ok: 'Understood' });
    act('change members', () => { const l = S().participants, i = l.indexOf(p.country); i < 0 ? l.push(p.country) : l.splice(i, 1); }); },
  dropMember(name) { act('change members', () => { S().participants = S().participants.filter(p => p !== name); }); },
  export() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S(), null, 1)], { type: 'application/json' })); a.download = 'war-room-scenario.json'; a.click(); },
  import() { $('#file').click(); },
  async reset() { if (await ask({ title: 'Reset the map?', text: 'Every unit, zone and strike is removed and the placeholders return. Undo brings it back.', ok: 'Reset', danger: true })) act('reset', () => { WR.S = WR.defaults(); ui.selUnit = null; }); },
  launch,
};
$('#file').onchange = async e => { try { const R = JSON.parse(await e.target.files[0].text()); if (R.v !== 2 || !Array.isArray(R.units)) throw 0; act('load scenario', () => { WR.S = R; WR.say('Scenario loaded from file.', '', { vis: 'hidden' }); }); }
  catch (err) { ask({ title: 'That file is not a War Room scenario', text: 'Choose a file saved with "Save to file".', ok: 'Understood' }); } e.target.value = ''; };

// ---------- attack ----------
function spec() {
  const u = unit(val('sFrom')), kind = val('sKind'), D = DELIVERY[kind], payload = val('sPay'), p = ui.sel;
  if (!u || !p) return null;
  const plan = flightPlan(u, p, kind, S().cfg.compress), kt = Math.max(0.1, num('sKt', 300)), burst = val('sBurst'), n = Math.max(1, Math.round(num('sN', 1))), empH = +val('sEmpH');
  const cas = casualties({ payload, kt, burst, n, lat: p.lat, lng: p.lng, country: p.country }, S().cfg.wind);
  return { u, kind, D, payload, p, plan, kt, burst, n, empH, cas, def: clamp(num('sDef', D.def), 0, 100), roomSec: val('sSec') ? Math.max(5, num('sSec')) : plan.roomSec };
}
function preview() {
  const s = spec(), dl = $('#sPreview'), note = $('#sNote'); note.textContent = '';
  if (!s) { dl.innerHTML = '<dt>Target</dt><dd class="muted">click the globe</dd>'; return; }
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`; let h = row('Target', esc(placeName(s.p))) + row('Distance', nf.format(Math.round(s.plan.km)) + ' km');
  if (!s.D.instant) h += row('Real flight time', span(s.plan.realMin)) + row('Time on screen', clock(s.roomSec * 1000));
  if (s.payload === 'nuke') { const f = nukeFx(s.kt, s.burst); h += row('Fireball radius', f.fireball.toFixed(2) + ' km') + row('Buildings collapse within', f.psi5.toFixed(1) + ' km') + row('Severe burns within', f.thermal.toFixed(1) + ' km') + (f.plume ? row('Fallout plume', Math.round(f.plume) + ' km downwind') : ''); }
  if (s.payload === 'emp') h += row('Electronics down within', nf.format(Math.round(empRadius(s.empH))) + ' km');
  if (s.payload === 'nuke' || s.payload === 'conv') h += row('Projected deaths', s.cas.deaths ? 'about ' + big(s.cas.deaths) : '0') + row('Projected injured', s.cas.injured ? 'about ' + big(s.cas.injured) : '0');
  dl.innerHTML = h;
  if (!s.plan.inRange) note.textContent = `Out of range: a ${s.D.n.toLowerCase()} reaches about ${nf.format(s.D.range)} km. The chair may still allow it.`;
  else if ((s.payload === 'nuke' || s.payload === 'emp') && !s.u.nukes) note.textContent = `${s.u.name} holds no warheads. The chair may still allow it.`;
}
function syncStrikeForm(resetDef) {
  const D = DELIVERY[val('sKind')], pay = $('#sPay'), keepPay = pay.value;
  pay.innerHTML = D.pay.map(p => `<option value="${p}">${PAYLOAD[p]}</option>`).join(''); if (D.pay.includes(keepPay)) pay.value = keepPay;
  if (resetDef) $('#sDef').value = D.def;
  $('#nukeRow').hidden = pay.value !== 'nuke'; $('#convRow').hidden = pay.value !== 'conv'; $('#empRow').hidden = pay.value !== 'emp';
  $('#sSec').closest('div').hidden = !!D.instant; preview();
}
async function launch() {
  if (!unit(val('sFrom'))) return ask({ title: 'Pick a launching unit', text: 'Choose one in "Launch from", or click a unit on the globe.', ok: 'Understood' });
  if (!needPoint()) return; const s = spec(), tgt = placeName(s.p);
  const lines = `${s.u.country}, ${s.D.n.toLowerCase()} from ${s.u.name}, target ${tgt}.` + (s.payload === 'nuke' ? ` ${nf.format(s.kt)} kt ${s.burst} burst. Projected deaths: about ${big(s.cas.deaths)}.` : '');
  if (!await ask({ title: 'Launch this attack?', text: lines, ok: 'Launch', danger: true })) return;
  act('launch', () => { const st = S(), u = s.u, now = Date.now();
    if ((s.payload === 'nuke' || s.payload === 'emp') && u.nukes > 0) u.nukes--;
    if (u.vis !== 'public' && !s.D.instant) u.vis = 'public';                       // firing gives the position away
    if (s.D.instant) { if (adjudicate(`${u.country} cyber attack on ${tgt}`, 100 - s.def)) { st.zones.push({ id: uid(), type: 'blackout', label: tgt, lat: s.p.lat, lng: s.p.lng, r: 150, vis: 'public', country: s.p.country, t: now });
      WR.say(`Cyber attack: power and networks are down around ${tgt}.`, 'bad', { snd: 'chime', at: { lat: s.p.lat, lng: s.p.lng, alt: 1.2 } }); } else WR.say(`A cyber attack on ${tgt} was repelled.`, 'warn', { snd: 'chime' }); return; }
    const ti = s.def > 0 && s.kind !== 'ground' ? (s.D.arc === 'ballistic' ? 0.88 : s.D.arc === 'glide' ? 0.9 : 0.82) : 0, rl = ti ? roll() : 0;
    st.strikes.push({ id: uid(), ti, roll: rl, hit: ti ? rl <= s.def : false, kind: s.kind, payload: s.payload, kt: s.kt, burst: s.burst, n: s.n, empH: s.empH, def: s.def, country: u.country, from: u.name, short: s.D.s, tgt, tgtCountry: s.p.country, city: s.p.city,
      a: { lat: u.lat, lng: u.lng }, b: { lat: s.p.lat, lng: s.p.lng }, arc: s.D.arc, peak: clamp(s.plan.km / 6371 * 0.13, 0.02, 0.3), t0: now, eta: now + s.roomSec * 1000 });
    const loud = s.payload === 'nuke' || s.payload === 'emp' || s.D.arc === 'ballistic', half = WR.slerp(u, s.p, 0.5);
    WR.say(s.kind === 'ground' ? `${u.country} ground forces are advancing on ${tgt}.` : `Launch detected: ${u.country} ${s.D.n.toLowerCase()} from ${u.name}. Target: ${tgt}.`, 'bad',
      { snd: loud ? 'launch' : 'chime', at: { lat: half.lat, lng: half.lng, alt: clamp(s.plan.km / 6371 * 1.2, 0.7, 2.6) } }); });
}
function resolve(s) {
  const st = S(), now = Date.now(), at = (alt) => ({ lat: s.b.lat, lng: s.b.lng, alt }); st.strikes = st.strikes.filter(x => x !== s);
  if (s.kind === 'ground') { if (adjudicate(`Defenders holding ${s.tgt} against ${s.country}`, s.def)) return WR.say(`The ${s.country} offensive on ${s.tgt} was repelled.`, 'warn', { snd: 'chime' });
    st.zones.push({ id: uid(), type: 'war', label: s.tgt, lat: s.b.lat, lng: s.b.lng, r: 60, vis: 'public', country: s.tgtCountry, t: now });
    return WR.say(`${s.country} ground forces have entered ${s.tgt}. Active war zone declared.`, 'bad', { snd: 'chime', at: at(1) }); }
  if (!s.ti && s.def > 0 && adjudicate(`Defences against the ${s.short} bound for ${s.tgt}`, s.def)) return WR.say(`${s.short} intercepted before reaching ${s.tgt}.`, 'warn', { snd: 'clear' });
  const id = uid(), base = { id, lat: s.b.lat, lng: s.b.lng, t: now, country: s.tgtCountry, city: s.city, by: s.country };
  if (s.payload === 'emp') { const r = empRadius(s.empH); st.impacts.push({ ...base, kind: 'emp', r, h: s.empH });
    return WR.say(`High-altitude nuclear burst over ${s.tgt}. Power grids and electronics are failing within ${nf.format(Math.round(r))} km.`, 'bad', { snd: 'impact', ref: id, at: at(1.8) }); }
  const c = casualties({ payload: s.payload, kt: s.kt, burst: s.burst, n: s.n, lat: s.b.lat, lng: s.b.lng, country: s.tgtCountry }, st.cfg.wind);
  if (s.payload === 'nuke') { st.impacts.push({ ...base, kind: 'nuke', kt: s.kt, burst: s.burst, wind: st.cfg.wind, deaths: c.deaths, injured: c.injured });
    return WR.say(`Nuclear detonation: ${nf.format(s.kt)} kt ${s.burst} burst on ${s.tgt}. Estimated ${big(c.deaths)} dead and ${big(c.injured)} injured.`, 'bad', { snd: 'impact', ref: id, at: at(clamp(nukeFx(s.kt, s.burst).psi1 / 60, 0.35, 0.9)) }); }
  st.impacts.push({ ...base, kind: 'conv', label: `${s.short} strike`, deaths: c.deaths, injured: c.injured });
  WR.say(`${s.short} strike hit ${s.tgt}.${c.deaths ? ` Estimated ${big(c.deaths)} dead.` : ''}`, 'bad', { snd: 'impact', ref: id, at: at(0.6) });
}
// the chair window keeps the clock: arrivals and impacts are settled here
setInterval(() => { const st = S(), now = Date.now(); let changed = false;
  for (const u of st.units) if (u.moving && u.moving.eta <= now) { u.lat = u.moving.b.lat; u.lng = u.moving.b.lng; u.moving = null; WR.say(`${u.name} has arrived on station.`, '', { vis: logVis(u) }); changed = true; }
  for (const m of st.moves.filter(m => m.eta <= now)) { st.moves = st.moves.filter(x => x !== m); const b = unit(m.to); if (b) b.nukes += m.n; WR.say(`${m.country} convoy arrived: ${m.label}.`, '', { vis: m.vis }); changed = true; }
  for (const s of st.strikes.filter(s => s.ti && !s.engaged && now >= s.t0 + (s.eta - s.t0) * s.ti)) { s.engaged = true; changed = true;
    WR.say(`Adjudicator: defences against the ${s.short} bound for ${s.tgt}. Needed ${s.def} or under, rolled ${s.roll}: ${s.hit ? 'success' : 'failure'}.`, 'dice');
    if (s.hit) { st.strikes = st.strikes.filter(x => x !== s); const q = WR.traj(s, s.ti); WR.say(`${s.short} intercepted before reaching ${s.tgt}.`, 'warn', { snd: 'clear', fx: { k: 'intercept', lat: q.lat, lng: q.lng, alt: q.alt } }); }
    else WR.say(`Interceptors missed the ${s.short} bound for ${s.tgt}.`, 'warn'); }
  for (const s of st.strikes.filter(s => s.eta <= now)) { resolve(s); changed = true; }
  if (changed) WR.commit(); }, 200);

// ---------- panels ----------
const PANELS = { situation: ['Situation', 'pulse'], forces: ['Forces', 'army'], movement: ['Warhead transfers', 'route'], strike: ['Attack', 'impact'], zones: ['Zones', 'zone'], wire: ['News wire', 'wire'], scenario: ['Scenario', 'sliders'] };
let panel = 'situation';
function show(p) { panel = PANELS[p] ? p : 'situation'; document.querySelectorAll('[data-p]').forEach(s => s.hidden = s.dataset.p !== panel);
  document.querySelectorAll('[data-panel]').forEach(b => b.setAttribute('aria-current', b.dataset.panel === panel ? 'page' : 'false')); $('#ptitle').textContent = PANELS[panel][0]; if (location.hash.slice(1) !== panel) history.replaceState(null, '', '#' + panel); draw(); }
function fill(sel, html) { const e = $('#' + sel), v = e.value; e.innerHTML = html; if (v && [...e.options].some(o => o.value === v)) e.value = v; }
const btn = (act, arg, label, cls = '') => `<button class="btn small ${cls}" data-act="${act}" data-arg="${esc(arg)}">${label}</button>`;
function draw() {
  const st = S(), now = Date.now(), last = st.log[st.log.length - 1];
  $('#psub').textContent = { situation: `DEFCON ${st.defcon}. ${st.strikes.length ? st.strikes.length + ' in flight.' : 'Nothing in flight.'}`, forces: `${st.units.length} units, ${nf.format(st.units.reduce((a, u) => a + u.nukes, 0))} warheads on the map.`,
    movement: st.moves.length ? `${st.moves.length} convoy${st.moves.length > 1 ? 's' : ''} on the road.` : 'No convoys on the road.', strike: 'Flight times follow real speeds, compressed for the room.', zones: `${st.zones.length} zones, ${st.impacts.length} strike sites.`,
    wire: last ? `Last: ${last.text}`.slice(0, 90) : '', scenario: `${st.participants.length} committee members.` }[panel];
  $('#selbar').innerHTML = `Point: <b>${ui.sel ? `${ui.sel.lat.toFixed(2)}, ${ui.sel.lng.toFixed(2)} · ${esc(placeName(ui.sel))}` : 'click the globe'}</b>${ui.selUnit && unit(ui.selUnit) ? `<br>Unit: <b>${esc(unit(ui.selUnit).name)}</b>` : ''}`;
  const opts = st.units.map(u => `<option value="${u.id}">${esc(u.name)} (${esc(iso(u.country))}, ${nf.format(u.nukes)})</option>`).join('');
  fill('mFrom', opts); fill('mTo', opts); fill('sFrom', opts);
  $('#undoBtn').disabled = !stack.length; $('#undoBtn').title = stack.length ? `Undo: ${stack[stack.length - 1].label}` : 'Nothing to undo';
  $('#spin').checked = !!st.view.spin; $('#basemap').value = st.view.basemap || 'live'; $('#clouds').checked = st.view.clouds !== false; $('#autoFocus').checked = !!st.cfg.autoFocus; $('#cCompress').value = st.cfg.compress; $('#cWind').value = st.cfg.wind;
  const flights = [...st.strikes.map(s => `<li>${icon('impact')}<span class="two neg">${esc(s.short)} to ${esc(s.tgt)}<small>${esc(s.country)}, from ${esc(s.from)}</small></span><span class="num" data-eta="${s.eta}">${clock(s.eta - now)}</span>${btn('abort', s.id, 'Abort')}</li>`),
    ...st.moves.map(m => `<li>${icon('convoy')}<span class="two">${esc(m.label)}<small>${esc(m.country)}, ${m.n} warheads${m.vis !== 'public' ? ', covert' : ''}</small></span><span class="num" data-eta="${m.eta}">${clock(m.eta - now)}</span>${btn('intercept', m.id, 'Intercept')}</li>`),
    ...st.units.filter(u => u.moving).map(u => `<li>${icon(u.type)}<span class="two">${esc(u.name)}<small>${esc(u.country)}, under way</small></span><span class="num" data-eta="${u.moving.eta}">${clock(u.moving.eta - now)}</span></li>`)];
  $('#flightList').innerHTML = flights.join('') || '<li class="empty">Nothing in flight, nothing on the road.</li>';
  $('#moveList').innerHTML = st.moves.map(m => `<li>${icon('convoy')}<span class="two">${esc(m.label)}<small>${esc(m.country)}, ${m.n} warheads${m.vis !== 'public' ? ', covert' : ''}</small></span><span class="num" data-eta="${m.eta}">${clock(m.eta - now)}</span>${btn('intercept', m.id, 'Intercept')}</li>`).join('') || '<li class="empty">No convoys on the road.</li>';
  const visName = u => u.vis === 'public' ? '' : Array.isArray(u.vis) ? 'owner only' : 'chair only';
  $('#unitList').innerHTML = st.units.map(u => `<li>${icon(u.type)}<span class="two">${esc(u.name)}<small>${esc(u.country)} · ${UNIT[u.type].n}${u.nukes ? ' · ' + nf.format(u.nukes) + ' warheads' : ''}</small></span>${visName(u) ? `<span class="tag">${visName(u)}</span>` : ''}${btn('select', u.id, ui.selUnit === u.id ? 'Selected' : 'Select')}</li>`).join('') || '<li class="empty">No units yet. Place the first one above.</li>';
  const su = unit(ui.selUnit);
  $('#unitCard').innerHTML = su ? `<div class="card" style="margin-top:20px"><h2>${esc(su.name)}</h2><p class="muted">${esc(su.country)} · ${UNIT[su.type].n}</p>
    <div class="row"><div><label for="cuN">Warheads held</label><input id="cuN" type="number" min="0" value="${su.nukes}" data-change="setNukes" data-arg="${su.id}"></div>
    <div><label for="cuV">Who can see it</label><select id="cuV" data-change="setVis" data-arg="${su.id}">${[['public', 'Everyone'], ['owner', 'Owner only'], ['hidden', 'Chair only']].map(([v, n]) => `<option value="${v}"${(Array.isArray(su.vis) ? 'owner' : su.vis) === v ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <div class="actions">${btn('findUnit', su.id, 'Show on globe')}${UNIT[su.type].mobile && !su.moving ? btn('moveUnit', su.id, 'Move to selected point') : ''}${su.vis !== 'public' ? btn('sweep', su.id, 'Search for it') : ''}${btn('delUnit', su.id, 'Remove', 'danger')}</div></div>` : '';
  $('#zoneList').innerHTML = st.zones.map(z => `<li>${icon('zone')}<span class="two">${esc(ZONE[z.type].n)}${z.label ? ': ' + esc(z.label) : ''}<small>radius ${nf.format(z.r)} km${z.vis !== 'public' ? ' · chair only' : ''}</small></span>${btn('find', z.lat + ',' + z.lng, 'Show')}${btn('delZone', z.id, 'Remove')}</li>`).join('') || '<li class="empty">No zones marked.</li>';
  $('#impactList').innerHTML = st.impacts.map(i => `<li>${icon('impact')}<span class="two">${i.kind === 'nuke' ? nf.format(i.kt) + ' kt detonation' : i.kind === 'emp' ? 'High-altitude burst' : esc(i.label)}<small>${esc(i.city || i.country || 'open sea')}${i.deaths ? ' · est. ' + big(i.deaths) + ' dead' : ''}</small></span>${btn('find', i.lat + ',' + i.lng, 'Show')}${btn('delImpact', i.id, 'Clear')}</li>`).join('') || '<li class="empty">No strikes have landed.</li>';
  $('#logList').innerHTML = st.log.slice(-40).reverse().map(l => `<li><span class="muted">${utc(l.t)}</span><span class="two ${l.cls === 'bad' ? 'neg' : l.cls === 'warn' ? 'warn' : ''}">${esc(l.text)}${l.vis !== 'public' ? '<small>chair only</small>' : ''}</span></li>`).join('');
  $('#memberList').innerHTML = st.participants.map(p => `<li><span class="grow">${esc(p)}</span>${btn('dropMember', p, 'Remove')}</li>`).join('') || '<li class="empty">No members yet.</li>';
  if (panel === 'strike') preview();
}
WR.hooks.push(draw);
setInterval(() => { const now = Date.now(); document.querySelectorAll('[data-eta]').forEach(e => { e.textContent = clock(e.dataset.eta - now); }); }, 500);

// ---------- wiring ----------
$('#mark').innerHTML = icon('globe', 24); $('#undoBtn').innerHTML = icon('undo', 16);
const soundIcon = () => { $('#soundBtn').innerHTML = icon(audio.enabled ? 'sound' : 'mute', 16); $('#soundBtn').title = audio.enabled ? 'Sound on this screen: on' : 'Sound on this screen: off'; };
$('#soundBtn').onclick = () => { audio.toggle(); soundIcon(); }; soundIcon(); $('#undoBtn').onclick = undo;
document.querySelectorAll('[data-panel]').forEach(b => { b.innerHTML = icon(PANELS[b.dataset.panel][1], 16); b.onclick = () => show(b.dataset.panel); });
$('#uType').innerHTML = Object.entries(UNIT).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('');
$('#zType').innerHTML = Object.entries(ZONE).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('');
$('#sKind').innerHTML = Object.entries(DELIVERY).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('');
$('#countries').innerHTML = [...COUNTRY.keys()].sort().map(n => `<option value="${esc(n)}">`).join('');
document.addEventListener('click', e => {
  const d = e.target.closest('[data-defcon]'); if (d) { const n = +d.dataset.defcon; if (n !== S().defcon) act('set DEFCON', () => { S().defcon = n; WR.say(`DEFCON ${n} declared: ${DEFCON[n][1].toLowerCase()}.`, n <= 2 ? 'bad' : 'warn', { snd: 'defcon' }); }); return; }
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'select') { ui.selUnit = ui.selUnit === b.dataset.arg ? null : b.dataset.arg; if (ui.selUnit) { $('#sFrom').value = ui.selUnit; $('#mFrom').value = ui.selUnit; } return WR.render(); }
  A[a] && A[a](b.dataset.arg);
});
document.addEventListener('change', e => { const t = e.target;
  if (t.dataset.change) return A[t.dataset.change](t.dataset.arg, t.value);
  if (t.id === 'sKind') return syncStrikeForm(true);
  if (/^s(Pay|Kt|Burst|N|EmpH|Def|Sec|From)$/.test(t.id)) return syncStrikeForm(false);
  if (t.id === 'spin') { const s = S(); s.view = { ...s.view, rev: s.view.rev + 1, spin: t.checked, pov: null, mode: ui.mode }; return WR.commit(); }
  if (t.id === 'autoFocus') { S().cfg.autoFocus = t.checked; return WR.commit(); }
  if (t.id === 'cCompress') { S().cfg.compress = +t.value; return WR.commit(); }
  if (t.id === 'cWind') { S().cfg.wind = +t.value; return WR.commit(); }
  if (t.id === 'basemap') { S().view.basemap = t.value; return WR.commit(); }
  if (t.id === 'clouds') { S().view.clouds = t.checked; return WR.commit(); } });
$('#sKt').addEventListener('input', preview);
syncStrikeForm(true); show(location.hash.slice(1));
})();
