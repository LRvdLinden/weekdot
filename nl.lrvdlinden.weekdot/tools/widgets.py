#!/usr/bin/env python3
"""Writes the small widgets (widgets/<id>/widget.compose.json, api.js, public/index.html).
Called by generate.py. Texts live in strings.py (W = compose, R["widget.*"] = runtime)."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BASE_CSS = """/* Light/dark follow Homey's dashboard (.homey-dark-mode + Homey's own CSS variables), not the phone's setting */
body{--text:var(--homey-text-color,#141418);--sec:var(--homey-text-color-light,#6e6e78);--line:var(--homey-line-color,rgba(0,0,0,.08));--soft:rgba(0,0,0,.05);--red:#E8352F;--redsoft:rgba(232,53,47,.1);--green:#34C759;--now:rgba(232,53,47,.08)}
.homey-dark-mode,.homey-dark-mode body{--text:var(--homey-text-color,#f4f4f6);--sec:var(--homey-text-color-light,#a3a3ad);--line:var(--homey-line-color,rgba(255,255,255,.12));--soft:rgba(255,255,255,.08);--red:#ff5a4f;--redsoft:rgba(255,90,79,.16);--green:#30d158;--now:rgba(255,90,79,.16)}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"SF Pro Text",Inter,Roboto,sans-serif;color:var(--text);padding:12px 14px 12px;-webkit-font-smoothing:antialiased;overflow:hidden}
.hdr{display:flex;align-items:center;gap:7px;margin-bottom:8px;min-width:0}
.logo{width:16px;height:16px;flex:none}
.lab{font-size:11px;font-weight:700;color:var(--sec);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp{flex:1}
.right{font-size:11px;font-weight:700;color:var(--red);text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
.hint{font-size:12px;color:var(--sec);line-height:1.4;padding:2px 0}
.ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
button:focus-visible{outline:2px solid var(--red);outline-offset:1px;border-radius:8px}
.sel-h{display:flex;align-items:baseline;gap:6px;margin:10px 0 4px;font-size:12px;font-weight:700;color:var(--sec);text-transform:uppercase;letter-spacing:.3px}
.sel-h .t{color:var(--red)}
.er{display:block;width:100%;text-align:start;padding:6px 0;border-top:1px solid var(--line)}
.er:first-of-type{border-top:0}
.er .r{display:flex;align-items:center;gap:8px;min-width:0}
.er .b{width:4px;align-self:stretch;min-height:18px;border-radius:2px;flex:none}
.er .tm{font-size:12px;color:var(--sec);font-variant-numeric:tabular-nums;flex:none;min-width:38px}
.er .ti{font-size:14px;font-weight:600;flex:1;min-width:0}
.er .ch{font-size:11px;color:var(--sec);flex:none;transition:transform .2s}
.er.open .ch{transform:rotate(90deg)}
.er .x{display:none;margin:4px 0 2px;padding-inline-start:12px;font-size:12.5px;color:var(--sec);line-height:1.45}
.er.open .x{display:block}
.er .x b{color:var(--text);font-weight:600}
.more{font-size:12px;color:var(--sec);padding-top:6px}
"""

LOGO = ("<svg class=\"logo\" viewBox=\"0 0 64 64\"><defs><clipPath id=\"wdc\"><rect x=\"2\" y=\"2\" width=\"60\" height=\"60\" rx=\"14\"/></clipPath></defs>"
        "<g clip-path=\"url(#wdc)\"><rect x=\"2\" y=\"2\" width=\"60\" height=\"60\" fill=\"#fff\"/><rect x=\"2\" y=\"2\" width=\"60\" height=\"19\" fill=\"#E8352F\"/>"
        + "".join(f"<circle cx=\"{13 + i * 6.3:.1f}\" cy=\"10\" r=\"2.1\" fill=\"#fff\"/>" for i in range(7))
        + "<rect x=\"14\" y=\"34\" width=\"36\" height=\"7\" rx=\"3.5\" fill=\"#E8352F\"/></g>"
        "<rect x=\"2.5\" y=\"2.5\" width=\"59\" height=\"59\" rx=\"13.5\" fill=\"none\" stroke=\"rgba(0,0,0,.12)\"/></svg>")

BASE_JS = r"""
const LOGO = '__LOGO__';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fill = (s, v) => Object.keys(v || {}).reduce((r, k) => r.split(`__${k}__`).join(v[k]), s);
const fmtDay = (day, o) => { try { return new Date(day + 'T12:00:00').toLocaleDateString(undefined, o); } catch (e) { return day; } };
// Tap state survives the minute refresh: the selected day (week/month) and the opened event row.
let SEL = null, OPEN = null;
const dayLabel = (day, d, t) => day === d.today ? t('today') : (day === d.tomorrow ? t('tomorrow') : fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' }));
// One tappable row per event; a tap shows the time span, place and calendar.
function evRows(list, t, key) {
  return list.map((e, i) => {
    const k = key + '|' + i, open = OPEN === k;
    const when = e.allDay ? t('all_day') : `${e.start} – ${e.end}`;
    return `<button class="er${open ? ' open' : ''}" data-ev="${esc(k)}" aria-expanded="${open}">`
      + `<div class="r"><i class="b" style="background:${esc(e.color || '#8e8e93')}"></i>`
      + `<span class="tm">${esc(e.allDay ? t('all_day') : e.start)}</span>`
      + `<span class="ti ell">${e.emoji ? esc(e.emoji) + ' ' : ''}${esc(e.title)}</span><span class="ch">›</span></div>`
      + `<div class="x"><b>${esc(when)}</b>${e.location ? '<br>' + esc(e.location) : ''}${e.calendar ? '<br>' + esc(e.calendar) : ''}</div></button>`;
  }).join('');
}
const header = (label, right) => `<div class="hdr">${LOGO}<div class="lab">${esc(label)}</div><div class="sp"></div>${right ? `<div class="right">${esc(right)}</div>` : ''}</div>`;

function onHomeyReady(Homey) {
  const t = (key, v) => fill(Homey.__('widget.' + key) || '', v);
  document.documentElement.dir = t('dir') === 'rtl' ? 'rtl' : 'ltr';
  const settings = Homey.getSettings() || {};
  const root = document.getElementById('root');
  let first = true;
  const query = () => {
    const p = new URLSearchParams();
    if (settings.calendar && settings.calendar.id && settings.calendar.id !== '*') p.set('calendar', settings.calendar.id);
    if (settings.keyword) p.set('keyword', settings.keyword);
    if (settings.weekStart) p.set('weekStart', settings.weekStart);
    return '/?' + p.toString();
  };
  let last = null;
  function draw() {
    if (!last || !last.linked) root.innerHTML = header('Weekdot') + `<div class="hint">${esc(t('not_linked'))}</div>`;
    else root.innerHTML = render(last, t, settings);
    const h = Math.max(document.body.scrollHeight, 70);
    if (first) { first = false; Homey.ready({ height: h }); } else Homey.setHeight(h);
  }
  async function load() {
    try { last = await Homey.api('GET', query()); } catch (e) { last = null; }
    draw();
  }
  // taps: a day in the week/month grid, or an event row
  root.addEventListener('click', ev => {
    const day = ev.target.closest('[data-day]');
    const row = ev.target.closest('[data-ev]');
    if (day) { SEL = day.getAttribute('data-day'); OPEN = null; draw(); }
    else if (row) { const k = row.getAttribute('data-ev'); OPEN = OPEN === k ? null : k; draw(); }
  });
  load();
  Homey.on('update', load);
  setInterval(load, 60 * 1000);
}
"""

WIDGETS = {
 "next_event": dict(height=120, name="wn_next_event", settings=["calendar", "keyword"], css="""
.ev{display:flex;gap:11px;align-items:stretch}
.bar{width:5px;border-radius:3px;flex:none}
.ti{font-size:19px;font-weight:800;line-height:1.2;letter-spacing:-.2px}
.meta{font-size:13px;color:var(--sec);margin-top:2px}
""", js=r"""
function rel(ms) {
  const mins = Math.round(ms / 60000);
  try {
    const f = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (Math.abs(mins) < 60) return f.format(mins, 'minute');
    if (Math.abs(mins) < 36 * 60) return f.format(Math.round(mins / 60), 'hour');
    return f.format(Math.round(mins / 1440), 'day');
  } catch (e) { return ''; }
}
function render(d, t) {
  const e = d.event;
  if (!e) return header(t('no_next')) + `<div class="hint">${esc(t('no_next'))}</div>`;
  const right = e.now ? t('now_until', { time: e.end }) : rel(e.startMs - d.now);
  const when = e.allDay ? `${fmtDay(e.day, { weekday: 'short', day: 'numeric', month: 'short' })} · ${t('all_day')}`
    : `${e.day !== d.today ? fmtDay(e.day, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' : ''}${e.start} – ${e.end}`;
  const label = e.day === d.today ? t('today') : fmtDay(e.day, { weekday: 'long', day: 'numeric', month: 'short' });
  return header(label, right)
    + `<div class="ev"><div class="bar" style="background:${esc(e.color)}"></div><div style="min-width:0">`
    + `<div class="ti ell">${e.emoji ? esc(e.emoji) + ' ' : ''}${esc(e.title)}</div>`
    + `<div class="meta ell">${esc(when)}${e.location ? ' · ' + esc(e.location) : ''}</div></div></div>`;
}
"""),
 "next_call": dict(height=130, name="wn_next_call", settings=["calendar", "keyword"], css="""
.ev{display:flex;gap:11px;align-items:center}
.cam{width:40px;height:40px;border-radius:12px;flex:none;display:grid;place-items:center;background:var(--soft);color:var(--sec)}
.cam.live{background:var(--brand);color:#fff}
.cam:not(.live){color:var(--brand)}
.cam svg{width:22px;height:22px}
.ti{font-size:18px;font-weight:800;line-height:1.2;letter-spacing:-.2px}
.meta{font-size:13px;color:var(--sec);margin-top:2px}
.svc{display:inline-block;margin-top:8px;font-size:11.5px;font-weight:700;border-radius:99px;padding:3px 9px;background:var(--soft)}
.svc.live{background:var(--brand);color:#fff}
""", js=r"""
// brand colours of the services, as in Weekdot (Teams purple, Meet green, Zoom blue, …)
const BRAND = { facetime: '#30B94D', teams: '#5B5FC7', meet: '#00832D', zoom: '#0B5CFF', webex: '#0A7FC2', whatsapp: '#128C7E',
  gotomeeting: '#E5751F', jitsi: '#1D76BA', whereby: '#5B3FD9', slack: '#4A154B', chime: '#0073BB', ringcentral: '#F57C00',
  bluejeans: '#0071CE', lifesize: '#0077C8', dialpad: '#7C52FF', gather: '#5B5BD6', discord: '#5865F2', signal: '#3A76F0',
  telegram: '#1E8BC3', generic: '#34B553' };
const CAM = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h8A2.5 2.5 0 0 1 16 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 16.5zM17 10l4-2.6v9.2L17 14z"/></svg>';
function rel(ms) {
  const mins = Math.round(ms / 60000);
  try {
    const f = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (Math.abs(mins) < 60) return f.format(mins, 'minute');
    if (Math.abs(mins) < 36 * 60) return f.format(Math.round(mins / 60), 'hour');
    return f.format(Math.round(mins / 1440), 'day');
  } catch (e) { return ''; }
}
function render(d, t) {
  const e = d.event;
  if (!e) return header(t('video_call')) + `<div class="hint">${esc(t('no_call'))}<br>${esc(t('no_call_hint'))}</div>`;
  // green from 10 minutes before the start, like the Join button in Weekdot
  const live = e.now || (e.startMs - d.now) <= 10 * 60000;
  const right = e.now ? t('now_until', { time: e.end }) : rel(e.startMs - d.now);
  const when = `${e.day !== d.today ? fmtDay(e.day, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' : ''}${e.start} – ${e.end}`;
  document.body.style.setProperty('--brand', BRAND[d.call] || BRAND.generic);
  return header(t('video_call'), right)
    + `<div class="ev"><div class="cam${live ? ' live' : ''}">${CAM}</div><div style="min-width:0">`
    + `<div class="ti ell">${e.emoji ? esc(e.emoji) + ' ' : ''}${esc(e.title)}</div>`
    + `<div class="meta ell">${esc(when)}</div></div></div>`
    + (d.service ? `<span class="svc${live ? ' live' : ''}">${esc(d.service)}</span>` : '');
}
"""),
 "free_busy": dict(height=100, name="wn_free_busy", settings=["calendar"], css="""
.st{display:flex;gap:12px;align-items:center}
.dot{width:14px;height:14px;border-radius:50%;flex:none}
.big{font-size:21px;font-weight:800;line-height:1.2;letter-spacing:-.2px}
.meta{font-size:13px;color:var(--sec);margin-top:2px}
""", js=r"""
function render(d, t) {
  let big, meta, color;
  if (d.busy) {
    color = 'var(--red)';
    big = d.until ? t('busy_until', { time: d.until }) : t('busy');
    meta = `${d.emoji ? d.emoji + ' ' : ''}${d.title}` + (d.until ? ' · ' + (d.freeUntil ? t('then_free_until', { time: d.freeUntil }) : t('then_free')) : '');
  } else {
    color = 'var(--green)';
    big = d.freeUntil ? t('free_until', { time: d.freeUntil }) : t('free_rest');
    meta = d.nextTitle ? t('next_is', { title: d.nextTitle }) : '';
  }
  return header(t('now'), '') + `<div class="st"><div class="dot" style="background:${color}"></div><div style="min-width:0">`
    + `<div class="big ell">${esc(big)}</div>${meta ? `<div class="meta ell">${esc(meta)}</div>` : ''}</div></div>`;
}
"""),
 "countdown": dict(height=120, name="wn_countdown", settings=["keyword_cd", "calendar"], css="""
.cd{display:flex;align-items:baseline;gap:10px;min-width:0}
.num{font-size:50px;font-weight:800;line-height:1;color:var(--red);letter-spacing:-1px;font-variant-numeric:tabular-nums}
.unit{font-size:20px;font-weight:800}
.meta{font-size:13px;color:var(--sec);margin-top:2px}
""", js=r"""
function unitParts(n) {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'day', unitDisplay: 'long' }).formatToParts(n);
    return parts.filter(p => p.type === 'unit').map(p => p.value).join('') || '';
  } catch (e) { return ''; }
}
function render(d, t, s) {
  if (d.setup) return header('Weekdot') + `<div class="hint">${esc(t('countdown_setup'))}</div>`;
  const e = d.event;
  if (!e) return header(s.keyword || '') + `<div class="hint">${esc(t('countdown_none', { word: d.keyword }))}</div>`;
  const title = `${e.emoji ? e.emoji + ' ' : ''}${e.title}`;
  const date = fmtDay(e.day, { weekday: 'short', day: 'numeric', month: 'short' });
  if (d.days === 0) {
    return header(s.keyword || '', '') + `<div class="cd"><div class="num" style="font-size:34px">${esc(t('today'))}</div></div>`
      + `<div class="meta ell">${esc(title)}${e.allDay ? '' : ' · ' + esc(e.start)}</div>`;
  }
  return header(s.keyword || '', date) + `<div class="cd"><div class="num">${d.days}</div><div style="min-width:0"><div class="unit">${esc(unitParts(d.days))}</div>`
    + `<div class="meta ell">${esc(t('until_title', { title }))}</div></div></div>`;
}
"""),
 "week": dict(height=210, name="wn_week", settings=["calendar", "keyword", "week_start"], css="""
.days{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;gap:2px}
.dc{display:block;padding:3px 0 4px;border-radius:12px}
.dc.on{background:var(--soft)}
.wd{font-size:10.5px;font-weight:700;color:var(--sec);text-transform:uppercase}
.dn{font-size:15px;font-weight:600;margin:3px auto 0;width:28px;height:28px;line-height:28px;border-radius:9px}
.dn.t{background:var(--red);color:#fff}
.dots{display:flex;gap:2px;justify-content:center;height:6px;margin-top:3px}
.dots i{width:5px;height:5px;border-radius:50%}
.unk{opacity:.4}
""", js=r"""
function isoWeek(day) {
  const d = new Date(day + 'T00:00:00Z'); const n = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - n + 3); const f = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - f) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7);
}
function render(d, t) {
  const sel = d.days.some(x => x.day === SEL) ? SEL : d.today;
  const cells = d.days.map(x => `<button class="dc${x.known ? '' : ' unk'}${x.day === sel ? ' on' : ''}" data-day="${x.day}" aria-pressed="${x.day === sel}" aria-label="${esc(fmtDay(x.day, { weekday: 'long', day: 'numeric', month: 'long' }))}">`
    + `<div class="wd">${esc(fmtDay(x.day, { weekday: 'short' }).replace('.', ''))}</div>`
    + `<div class="dn${x.today ? ' t' : ''}">${Number(x.day.slice(8))}</div>`
    + `<div class="dots">${x.colors.map(c => `<i style="background:${esc(c)}"></i>`).join('')}</div></button>`).join('');
  const day = d.days.find(x => x.day === sel);
  const list = day.events.length ? evRows(day.events, t, sel) : `<div class="hint">${esc(t('nothing'))}</div>`;
  return header(fmtDay(d.today, { month: 'long', year: 'numeric' }), t('week_n', { n: isoWeek(d.today) }))
    + `<div class="days">${cells}</div>`
    + `<div class="sel-h"><span class="${sel === d.today ? 't' : ''}">${esc(dayLabel(sel, d, t))}</span></div>${list}`;
}
"""),
 "timeline": dict(height=120, name="wn_timeline", settings=["calendar"], css="""
.tl,.hours{direction:ltr}
.tl{position:relative;height:46px;background:var(--soft);border-radius:10px;overflow:hidden}
.blk{position:absolute;top:7px;bottom:7px;border-radius:6px;color:#fff;font-size:10.5px;font-weight:700;padding:3px 5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:4px}
.now{position:absolute;top:0;bottom:0;width:2px;background:var(--red);box-shadow:0 0 0 1px rgba(255,255,255,.6)}
.hours{position:relative;height:14px;margin-top:3px;font-size:10px;color:var(--sec)}
.hours span{position:absolute;transform:translateX(-50%);font-variant-numeric:tabular-nums}
.cur{font-size:12px;color:var(--sec);margin-top:4px}
.cur b{color:var(--text);font-variant-numeric:tabular-nums}
.ad{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.ad span{font-size:11px;font-weight:700;color:#fff;border-radius:6px;padding:2px 7px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
""", js=r"""
function render(d, t) {
  const from = Math.min(7 * 60, ...d.timed.map(e => e.from), d.minute - 60);
  const to = Math.max(23 * 60, ...d.timed.map(e => e.to), d.minute + 60);
  const a = Math.max(0, Math.floor(from / 60) * 60), b = Math.min(1440, Math.ceil(to / 60) * 60);
  const pos = m => ((Math.min(Math.max(m, a), b) - a) / (b - a)) * 100;
  const blocks = d.timed.map(e => {
    const w = pos(e.to) - pos(e.from);
    const label = w >= 14 ? `${e.emoji ? esc(e.emoji) + ' ' : ''}${esc(e.title)}` : (w >= 6 && e.emoji ? esc(e.emoji) : '');
    return `<div class="blk" style="left:${pos(e.from)}%;width:calc(${w}% - 2px);background:${esc(e.color)}">${label}</div>`;
  }).join('');
  const cur = d.timed.find(e => e.from <= d.minute && d.minute < e.to) || d.timed.find(e => e.from > d.minute);
  const line = cur ? `<div class="cur ell"><b>${esc(cur.start)}</b> ${cur.emoji ? esc(cur.emoji) + ' ' : ''}${esc(cur.title)}</div>` : '';
  const step = (b - a) / 60 > 12 ? 180 : 120;
  let hours = '';
  for (let m = a; m <= b; m += step) hours += `<span style="left:${pos(m)}%">${String(Math.floor(m / 60) % 24).padStart(2, '0')}</span>`;
  const ad = d.allDay.length ? `<div class="ad">${d.allDay.map(e => `<span style="background:${esc(e.color)}">${e.emoji ? esc(e.emoji) + ' ' : ''}${esc(e.title)}</span>`).join('')}</div>` : '';
  const empty = !d.timed.length && !d.allDay.length ? `<div class="hint" style="margin-bottom:6px">${esc(t('nothing'))}</div>` : '';
  return header(t('today'), fmtDay(d.today, { weekday: 'long', day: 'numeric', month: 'short' }))
    + ad + empty + `<div class="tl">${blocks}<div class="now" style="left:${pos(d.minute)}%"></div></div><div class="hours">${hours}</div>` + line;
}
"""),
 "month": dict(height=330, name="wn_month", settings=["calendar", "keyword", "week_start"], css="""
.m{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;row-gap:2px}
.wd{font-size:10px;font-weight:700;color:var(--sec);text-transform:uppercase;padding-bottom:3px}
.c{height:32px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}
.n{font-size:13px;font-weight:500;width:24px;height:24px;line-height:24px;border-radius:50%}
.n.t{color:var(--red);font-weight:700}
.c.on .n{background:var(--sec);color:#fff;font-weight:700}
.c.on .n.t{background:var(--red);color:#fff}
.o .n{color:var(--sec);opacity:.55}
.dots{display:flex;gap:2px;height:5px;margin-top:1px}
.dots i{width:4px;height:4px;border-radius:50%}
""", js=r"""
function render(d, t) {
  const sel = d.days.some(x => x.day === SEL) ? SEL : d.today;
  const heads = d.days.slice(0, 7).map(x => `<div class="wd">${esc(fmtDay(x.day, { weekday: 'narrow' }))}</div>`).join('');
  const cells = d.days.map(x => `<button class="c${x.inMonth ? '' : ' o'}${x.day === sel ? ' on' : ''}" data-day="${x.day}" aria-pressed="${x.day === sel}" aria-label="${esc(fmtDay(x.day, { weekday: 'long', day: 'numeric', month: 'long' }))}">`
    + `<div class="n${x.today ? ' t' : ''}">${Number(x.day.slice(8))}</div>`
    + `<div class="dots">${x.colors.map(c => `<i style="background:${esc(c)}"></i>`).join('')}</div></button>`).join('');
  const day = d.days.find(x => x.day === sel);
  const list = day.events.length ? evRows(day.events, t, sel) : `<div class="hint">${esc(t('nothing'))}</div>`;
  return header(fmtDay(d.today, { month: 'long', year: 'numeric' })) + `<div class="m">${heads}${cells}</div>`
    + `<div class="sel-h"><span class="${sel === d.today ? 't' : ''}">${esc(dayLabel(sel, d, t))}</span></div>${list}`;
}
"""),
 "week_list": dict(height=260, name="wn_week_list", settings=["calendar", "keyword", "week_start"], css="""
.sel-h:first-of-type{margin-top:2px}
""", js=r"""
function render(d, t) {
  if (!d.groups.length) return header(t(d.label), d.range) + `<div class="hint">${esc(t(d.empty))}</div>`;
  const body = d.groups.map(g => `<div class="sel-h"><span class="${g.day === d.today ? 't' : ''}">${esc(dayLabel(g.day, d, t))}</span></div>` + evRows(g.events, t, g.day)).join('');
  return header(t(d.label), d.range) + body + (d.more ? `<div class="more">${esc(t('more', { n: d.more }))}</div>` : '');
}
"""),
 "month_list": dict(height=300, name="wn_month_list", settings=["calendar", "keyword"], css="""
.sel-h:first-of-type{margin-top:2px}
""", js=r"""
function render(d, t) {
  if (!d.groups.length) return header(t(d.label), d.range) + `<div class="hint">${esc(t(d.empty))}</div>`;
  const body = d.groups.map(g => `<div class="sel-h"><span class="${g.day === d.today ? 't' : ''}">${esc(dayLabel(g.day, d, t))}</span></div>` + evRows(g.events, t, g.day)).join('');
  return header(t(d.label), d.range) + body + (d.more ? `<div class="more">${esc(t('more', { n: d.more }))}</div>` : '');
}
"""),
}


def html(w):
    js = BASE_JS.replace("__LOGO__", LOGO.replace("'", "\\'"))
    return (f"<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
            f"<style>\n{BASE_CSS}{w['css']}</style>\n</head>\n<body class=\"homey-widget\">\n<div id=\"root\"></div>\n<script type=\"text/javascript\">{w['js']}{js}</script>\n</body>\n</html>\n")


API = """'use strict';

module.exports = {
  async getData({ homey, query }) {
    return homey.app.widgetFeed('%s', query || {});
  },
};
"""


def write_widgets(S, W):
    def setting(kind):
        if kind == "calendar":
            return {"id": "calendar", "type": "autocomplete", "title": S["arg_calendar"]}
        if kind == "keyword":
            return {"id": "keyword", "type": "text", "title": S["arg_keyword"], "value": ""}
        if kind == "keyword_cd":
            return {"id": "keyword", "type": "text", "title": W["ws_keyword_cd"], "value": ""}
        if kind == "week_start":
            return {"id": "weekStart", "type": "dropdown", "title": W["ws_week_start"], "value": "monday",
                    "values": [{"id": "monday", "title": W["ws_monday"]}, {"id": "sunday", "title": W["ws_sunday"]}]}
        raise KeyError(kind)

    for wid, w in WIDGETS.items():
        d = os.path.join(ROOT, "widgets", wid)
        os.makedirs(os.path.join(d, "public"), exist_ok=True)
        compose = {"name": W[w["name"]], "height": w["height"], "transparent": False,
                   "settings": [setting(k) for k in w["settings"]],
                   "api": {"getData": {"method": "GET", "path": "/"}}}
        with open(os.path.join(d, "widget.compose.json"), "w", encoding="utf-8") as f:
            json.dump(compose, f, indent=2, ensure_ascii=False)
            f.write("\n")
        with open(os.path.join(d, "api.js"), "w") as f:
            f.write(API % wid)
        with open(os.path.join(d, "public", "index.html"), "w", encoding="utf-8") as f:
            f.write(html(w))
    return list(WIDGETS)
