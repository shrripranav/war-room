// Delegate display: read-only. It shows only what its viewer may see (everyone, or one state with ?as=Country).
(() => {
'use strict';
const { $, esc, nf, big, clock, icon, HIST, COUNTRY, CITY, canSee, audio, focus, ui } = WR;
$('#mark').innerHTML = icon('globe', 28);
const lead = (S, now) => S.strikes.length ? `${S.strikes.length} in flight. First impact in ${clock(Math.min(...S.strikes.map(s => s.eta)) - now)}.` : `DEFCON ${S.defcon}. Nothing in flight.`;
function draw() {
  const S = WR.S, now = Date.now();
  const flights = [...S.strikes.map(s => ({ eta: s.eta, h: `${icon('impact')}<span class="two neg">${esc(s.short)} to ${esc(s.tgt)}<small>${esc(s.country)}, from ${esc(s.from)}</small></span>` })),
    ...S.moves.filter(canSee).map(m => ({ eta: m.eta, h: `${icon('convoy')}<span class="two">${esc(m.country)} convoy<small>${m.n} warheads, ${esc(m.label)}</small></span>` })),
    ...S.units.filter(u => u.moving && canSee(u)).map(u => ({ eta: u.moving.eta, h: `${icon(u.type)}<span class="two">${esc(u.name)}<small>${esc(u.country)}, under way</small></span>` }))].sort((a, b) => a.eta - b.eta);
  $('#flights').innerHTML = flights.map(f => `<li>${f.h}<span class="num" data-eta="${f.eta}">${clock(f.eta - now)}</span></li>`).join('') || '<li class="empty">Nothing in flight.</li>';
  $('#lead').textContent = lead(S, now);
  const by = {}; let dead = 0, hurt = 0;
  for (const i of S.impacts) { dead += i.deaths || 0; hurt += i.injured || 0; if (i.deaths) { const k = i.country || 'At sea'; by[k] = (by[k] || 0) + i.deaths; } }
  $('#toll').innerHTML = `<p class="figure${dead ? ' neg' : ''}">${dead ? big(dead) : '0'} <span class="muted" style="font-size:13px;font-weight:400">dead</span></p><p class="soft">${hurt ? big(hurt) : '0'} injured across ${S.impacts.length} strike site${S.impacts.length === 1 ? '' : 's'}</p>`
    + (dead ? `<ul class="list" style="margin-top:8px">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<li><span class="grow">${esc(c)}</span><span class="num">${big(n)}</span></li>`).join('')}</ul>` : '');
  const rows = (title, list, note) => `<h2>${title}</h2><ul class="list">${list.join('')}</ul>${note ? `<p class="muted" style="font-size:12px;margin-top:8px">${note}</p>` : ''}`;
  $('#modeCard').innerHTML = ui.mode === 'population' ? rows('Largest cities', CITY.slice(0, 8).map(c => `<li><span class="two">${esc(c.n)}<small>${esc(c.c)}</small></span><span class="num">${big(c.p)}</span></li>`), 'Metropolitan population, Natural Earth.')
    : ui.mode === 'military' ? rows('Largest military budgets', [...COUNTRY.values()].filter(p => p.mil).sort((a, b) => b.mil - a.mil).slice(0, 8).map(p => `<li><span class="two">${esc(p.name)}<small>${p.milPct != null ? p.milPct.toFixed(1) + '% of GDP' : ''}${p.nukes ? ' · ' + nf.format(p.nukes) + ' warheads' : ''}</small></span><span class="num">$${big(p.mil)}</span></li>`), 'World Bank and SIPRI, latest year. Warheads: FAS, 2025.')
    : ui.mode === 'history' ? rows('Since 1945', [...HIST].sort((a, b) => a.y - b.y).map(h => `<li><span class="muted">${h.y}</span><span class="grow">${esc(h.n)}</span><span class="num">${h.kt ? nf.format(h.kt) + ' kt' : '<span class="muted">–</span>'}</span><button class="btn small" data-go="${h.lat},${h.lng}">Show</button></li>`))
    : rows('Committee members', S.participants.map(p => `<li><span class="grow">${esc(p)}</span><span class="num muted">${COUNTRY.get(p)?.nukes ? nf.format(COUNTRY.get(p).nukes) + ' warheads' : 'no warheads'}</span></li>`), 'Warhead inventories: FAS estimates, 2025.');
  $('#soundHint').hidden = !audio.enabled || audio.live;
}
WR.hooks.push(draw); draw();
WR.on('audio', () => setTimeout(() => { $('#soundHint').hidden = !audio.enabled || audio.live; }, 300));
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { const [lat, lng] = b.dataset.go.split(',').map(Number); focus(lat, lng, 0.9); } });
setInterval(() => { const now = Date.now(); document.querySelectorAll('[data-eta]').forEach(e => { e.textContent = clock(e.dataset.eta - now); }); if (WR.S.strikes.length) $('#lead').textContent = lead(WR.S, now); }, 500);
})();
