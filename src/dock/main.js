// Shuttle Docking: the page.
//
// Joins a room, sends this player's controls, and draws what the room's
// referee (worker/dock-room.js, running src/dock/game.js) says is happening.
// The referee decides everything that matters, including every docking; this
// page only predicts its own ship between updates so the controls feel
// immediate, then eases back to wherever the referee has it.

import { DOCK, NO_INPUT, stepShip, wrapAngle } from './sim.js';
import { TIMER_CHOICES } from './game.js';
import { createScene } from './draw.js';
import { PALETTE } from '../config.js';
import { t, installLang, onLang } from '../i18n.js';

const STORE_NAME = 'cosmos.dock.name';
const STORE_GUIDE = 'cosmos.dock.guide';
const INTERP_MS = 110;

const $ = (id) => document.getElementById(id);
const colourOf = (name) => (PALETTE.find((c) => c.name === name) || PALETTE[0]).crayon;

let ws = null;
let myId = null;
let joined = false;
let room = '';
let snaps = [];            // recent states, for smoothing other ships
let latest = null;
let me = null;             // this player's ship, predicted locally
let mePrev = null;
let acc = 0;
let lastFrame = performance.now();
let rtt = 120;
let clockOffset = 0;       // server time = Date.now() + clockOffset
let cam = { x: 0, y: 0, zoom: 0.8 };
let lastPhase = null;
let lastReason = null;
let lastInRange = false;
let bannerTimer = 0;
let sentInput = '';
let sentAt = 0;
let pingTimer = null;
let guideSeen = readStore(STORE_GUIDE) === 'seen';

const scene = createScene($('stage'));
const keys = new Set();
const touch = { x: 0, y: 0, on: false, brake: false, boost: false };

// ── Joining ──────────────────────────────────────────────────────────────

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

function setupJoin() {
  const q = new URLSearchParams(location.search);
  $('in-name').value = readStore(STORE_NAME) || '';
  $('in-room').value = (q.get('room') || newCode()).toUpperCase().slice(0, 8);
  $('btn-newcode').addEventListener('click', () => {
    $('in-room').value = newCode();
  });
  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('in-name').value.trim();
    const code = $('in-room').value.trim().toUpperCase();
    if (!name || !/^[A-Z0-9]{3,8}$/.test(code)) return;
    writeStore(STORE_NAME, name);
    sound.unlock();
    connect(name, code);
  });
  if (!$('in-name').value) $('in-name').focus();
}

function connect(name, code) {
  room = code;
  $('join-msg').textContent = t('Connecting…');
  $('btn-join').disabled = true;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/api/dock/${code}`);
  ws.addEventListener('open', () => send({ t: 'join', name }));
  ws.addEventListener('message', (e) => onMessage(JSON.parse(e.data)));
  ws.addEventListener('close', () => {
    clearInterval(pingTimer);
    $('btn-join').disabled = false;
    const was = joined;
    joined = false;
    myId = null;
    latest = null;
    me = null;
    snaps = [];
    $('hud').hidden = true;
    $('join').hidden = false;
    if (!$('join-msg').dataset.code) {
      $('join-msg').textContent = was ? t('Lost the connection to the room.') : t('Could not reach the room. Try again.');
    }
    delete $('join-msg').dataset.code;
  });
}

function send(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}

function onMessage(m) {
  if (m.t === 'hello') {
    myId = m.id;
    return;
  }
  if (m.t === 'error') {
    if (m.code === 'full') {
      $('join-msg').textContent = t('This room is full (16 players).');
      $('join-msg').dataset.code = 'full';
    } else if (m.code === 'needTwo') {
      flash(t('Need two players'), 'bad');
    }
    return;
  }
  if (m.t === 'pong') {
    const now = Date.now();
    rtt = rtt * 0.7 + (now - m.c) * 0.3;
    clockOffset = m.now + rtt / 2 - now;
    return;
  }
  if (m.t !== 'state') return;
  if (!joined) {
    joined = true;
    $('join').hidden = true;
    $('hud').hidden = false;
    $('room-code').textContent = t('Room {code}', { code: room });
    history.replaceState(null, '', `?room=${room}`);
    ping();
    pingTimer = setInterval(ping, 2000);
  }
  receive(m);
}

function ping() {
  send({ t: 'ping', c: Date.now() });
}

// ── State from the room ──────────────────────────────────────────────────

function receive(s) {
  const recv = performance.now();
  s.recv = recv;
  s.byId = new Map(s.players.map((p) => [p.id, p]));
  snaps.push(s);
  while (snaps.length && recv - snaps[0].recv > 1000) snaps.shift();
  latest = s;

  const mine = s.byId.get(myId);
  reconcile(mine, s);

  for (const e of s.events) onEvent(e, s);
  if (s.phase !== lastPhase) onPhase(s.phase, s);
  lastPhase = s.phase;
  feedback(mine, s);
  updateHud(s, mine);
}

// Keep the predicted ship close to the referee's, without visible snapping.
function reconcile(mine, s) {
  const srv = mine && mine.ship;
  if (!srv) {
    me = null;
    return;
  }
  if (!me || mine.dockedTo !== null || s.phase === 'countdown') {
    me = { ...srv };
    mePrev = { ...srv };
    return;
  }
  // The referee's copy is about half a round trip old; carry it forward.
  const lag = Math.min(8, rtt / 2 / DOCK.tickMs);
  const ex = srv.x + srv.vx * lag;
  const ey = srv.y + srv.vy * lag;
  const err = Math.hypot(ex - me.x, ey - me.y);
  if (err > 160) {
    me = { ...srv, x: ex, y: ey };
    mePrev = { ...me };
    return;
  }
  me.x += (ex - me.x) * 0.12;
  me.y += (ey - me.y) * 0.12;
  me.vx += (srv.vx - me.vx) * 0.12;
  me.vy += (srv.vy - me.vy) * 0.12;
  const da = wrapAngle(srv.a - me.a);
  if (Math.abs(da) > 0.7) me.a = srv.a;
  else me.a += da * 0.1;
}

function onEvent(e, s) {
  const now = performance.now();
  if (e.type === 'go') {
    banner(t('Go!'), 'good', 900);
    sound.go();
    // The guide was there while everyone lined up; now it would be in the way.
    showGuide(false);
  } else if (e.type === 'docked') {
    const sh = s.shuttles.find((x) => x.id === e.shuttle);
    const who = s.byId.get(e.id);
    if (sh) {
      const d = DOCK.shuttleR + DOCK.portGap;
      scene.burst(sh.x + Math.cos(sh.port) * d, sh.y + Math.sin(sh.port) * d, who ? colourOf(who.col) : '#F2EADB', now);
    }
    if (e.id === myId) {
      banner(t('DOCKING SUCCESSFUL'), 'good', 2600, sh ? shuttleLabel(sh) : '');
      sound.docked();
    } else {
      sound.other();
      if (who && sh) toast(t('{name} docked with {shuttle}', { name: who.name, shuttle: shuttleLabel(sh) }));
    }
  } else if (e.type === 'end') {
    sound.end();
  }
}

function onPhase(phase, s) {
  document.body.classList.toggle('in-lobby', phase === 'lobby');
  if (phase === 'countdown') sound.count();
  if (phase !== 'summary') $('summary').hidden = true;
  if (phase === 'summary') {
    showGuide(false);
    showSummary(s);
  }
  const mine = s.byId.get(myId);
  if ((phase === 'lobby' || phase === 'countdown') && mine && mine.ship && !guideSeen) showGuide(true);
}

// Messages for this player's docking: what happened, and what to do next.
function feedback(mine, s) {
  const d = mine && mine.dock;
  const inRange = !!(d && d.inRange) && mine.dockedTo === null;
  const reason = inRange ? d.reason : null;
  if (inRange && !lastInRange) {
    if (reason !== 'occupied') banner(t('Docking Range Reached'), '', 1300);
    sound.range();
  }
  if (reason && reason !== lastReason && ['occupied', 'reserved', 'tooFast', 'misaligned'].includes(reason)) {
    sound.fail();
  }
  lastInRange = inRange;
  lastReason = reason;
}

// ── Readouts ─────────────────────────────────────────────────────────────

function updateHud(s, mine) {
  const playing = s.phase === 'countdown' || s.phase === 'playing';
  setText('c-players', s.counts.players);
  if (playing || s.phase === 'summary') {
    setText('c-shuttles-label', t('Shuttles free'));
    setText('c-shuttles', s.counts.available);
    $('c-shuttles').classList.toggle('low', s.counts.available <= 1);
  } else {
    setText('c-shuttles-label', t('Shuttles next round'));
    setText('c-shuttles', s.counts.nextShuttles);
    $('c-shuttles').classList.remove('low');
  }

  // Lobby
  $('lobby').hidden = s.phase !== 'lobby';
  if (s.phase === 'lobby') updateLobby(s, mine);

  // Status line
  let status = '';
  let good = false;
  if (mine && mine.dockedTo !== null) {
    const sh = s.shuttles.find((x) => x.id === mine.dockedTo);
    status = t('You secured {shuttle}!', { shuttle: sh ? shuttleLabel(sh) : '' });
    good = true;
  } else if (mine && !mine.inRound && playing) {
    status = t('You are watching. You will play from the next round.');
  } else if (s.phase === 'lobby') {
    status = t('Fly around while you wait. Docking opens when the round starts.');
  }
  $('status').hidden = !status;
  setText('status', status);
  $('status').classList.toggle('good', good);

  // Docking panel
  const d = mine && mine.dock;
  const show = d && d.inRange && mine.dockedTo === null;
  $('dockpanel').hidden = !show;
  if (show) {
    const sh = s.shuttles.find((x) => x.id === d.shuttle);
    setText('dp-name', sh ? shuttleLabel(sh) : '');
    setText('dp-dist', `${t('Distance')} ${d.dist}`);
    const { text, cls } = reasonText(d.reason, s.rules);
    setText('dp-reason', text);
    $('dp-reason').className = `dp-reason ${cls}`;
    const speed = me ? Math.hypot(me.vx, me.vy) : 0;
    const sp = $('dp-speed');
    sp.hidden = !s.rules.requireSlow;
    sp.querySelector('b').textContent = `${(speed * 20).toFixed(0)} / ${(s.rules.maxDockSpeed * 20).toFixed(0)}`;
    sp.querySelector('b').className = d.speedOk ? 'ok' : 'no';
    const al = $('dp-align');
    al.hidden = !s.rules.requireAlign;
    al.querySelector('b').textContent = d.alignOk ? '✓' : '✗';
    al.querySelector('b').className = d.alignOk ? 'ok' : 'no';
    $('dp-hold').style.width = `${Math.round((d.reason === 'holding' ? d.hold : 0) * 100)}%`;
  }
}

function reasonText(reason, rules) {
  switch (reason) {
    case 'holding': return { text: t('Hold steady… docking'), cls: 'good' };
    case 'occupied': return { text: `${t('Shuttle Already Occupied')} — ${t('Try another shuttle')}`, cls: 'bad' };
    case 'reserved': return { text: `${t('Shuttle Reserved by Another Pilot')} — ${t('Try another shuttle')}`, cls: 'bad' };
    case 'tooFast': return { text: `${t('Approach Too Fast')} — ${t('Slow down to {v} or less', { v: (rules.maxDockSpeed * 20).toFixed(0) })}`, cls: 'bad' };
    case 'misaligned': return { text: `${t('Incorrect Docking Alignment')} — ${t('Point your nose at the port')}`, cls: 'bad' };
    case 'lobby': return { text: t('Docking opens when the round starts'), cls: '' };
    default: return { text: t('Docking Range Reached'), cls: '' };
  }
}

function updateLobby(s, mine) {
  const isHost = !!(mine && mine.host);
  const list = s.players.filter((p) => p.connected).map((p) => `<li><i style="background:${colourOf(p.col)}"></i>`
    + `<span class="name">${esc(p.name)}</span>`
    + (p.id === myId ? `<span class="me">(${esc(t('you'))})</span>` : '')
    + (p.host ? `<span class="tag">${esc(t('Host'))}</span>` : '') + '</li>').join('');
  setHtml('plist', list);

  for (const el of ['set-timer', 'set-slow', 'set-align']) $(el).disabled = !isHost;
  const timerVal = s.settings.timer ? String(s.settings.timerSec) : '0';
  if (document.activeElement !== $('set-timer')) $('set-timer').value = timerVal;
  $('set-slow').checked = s.settings.requireSlow;
  $('set-align').checked = s.settings.requireAlign;

  const n = s.counts.players;
  $('btn-start').hidden = !isHost;
  $('btn-start').disabled = n < 2;
  $('btn-practice').hidden = !isHost || n !== 1;
  let note = '';
  if (n < 2) note = t('At least two players are needed to start. Share the invite link, or practise alone.');
  else if (!isHost) note = t('Waiting for the host to start.');
  setText('lobby-note', note);
}

function showSummary(s) {
  $('summary').hidden = false;
  setText('sum-title', s.practice ? t('Practice over') : t('Round over'));
  setText('sum-reason', {
    allClaimed: t('Every shuttle is claimed.'),
    noneLeft: t('Nobody is left looking for a shuttle.'),
    time: t('Time is up.'),
  }[s.endReason] || '');
  const round = s.players.filter((p) => p.inRound);
  const group = (cls, title, people, what) => `<div class="sum-group ${cls}"><h4>${esc(title)}</h4><ul>${
    people.length ? people.map((p) => `<li class="${p.id === myId ? 'me' : ''}"><i style="background:${colourOf(p.col)}"></i>`
      + `<span class="who">${esc(p.name)}</span><span class="what">${esc(what(p))}</span></li>`).join('')
      : `<li><span class="what">${esc(t('Nobody'))}</span></li>`
  }</ul></div>`;
  const docked = round.filter((p) => p.result === 'docked').sort((a, b) => a.dockedMs - b.dockedMs);
  const failed = round.filter((p) => p.result === 'failed');
  const left = round.filter((p) => p.result === 'left');
  setHtml('sum-groups',
    group('ok', t('Docked'), docked, (p) => {
      const sh = s.shuttles.find((x) => x.id === p.dockedTo);
      return `${sh ? shuttleLabel(sh) : ''} · ${(p.dockedMs / 1000).toFixed(1)}s`;
    })
    + group('no', t('No shuttle'), failed, () => '')
    + (left.length ? group('gone', t('Left the game'), left, () => '') : ''));
  const mine = s.byId.get(myId);
  const isHost = !!(mine && mine.host);
  $('btn-again').hidden = !isHost;
  setText('sum-note', isHost ? '' : t('Waiting for the host…'));
}

function shuttleLabel(sh) {
  return `S${sh.num} ${t(sh.name)}`;
}

function banner(text, cls, ms, sub = '') {
  const b = $('banner');
  b.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
  b.className = `on ${cls}`;
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => { b.className = ''; }, ms);
}

function flash(text, cls) {
  banner(text, cls, 1500);
}

function toast(text) {
  const el = document.createElement('div');
  el.textContent = text;
  $('toast').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 3500);
  setTimeout(() => el.remove(), 4000);
}

// ── Lobby controls ───────────────────────────────────────────────────────

function setupLobby() {
  $('set-timer').addEventListener('change', () => {
    const v = Number($('set-timer').value);
    send({ t: 'settings', s: v ? { timer: true, timerSec: v } : { timer: false } });
  });
  $('set-slow').addEventListener('change', () => send({ t: 'settings', s: { requireSlow: $('set-slow').checked } }));
  $('set-align').addEventListener('change', () => send({ t: 'settings', s: { requireAlign: $('set-align').checked } }));
  $('btn-start').addEventListener('click', () => send({ t: 'start' }));
  $('btn-practice').addEventListener('click', () => send({ t: 'start', practice: true }));
  $('btn-again').addEventListener('click', () => send({ t: 'again' }));
  $('btn-copy').addEventListener('click', async () => {
    const link = `${location.origin}${location.pathname}?room=${room}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      window.prompt('', link);
    }
    toast(t('Link copied'));
    $('btn-copy').textContent = t('Link copied');
    setTimeout(() => { $('btn-copy').textContent = t('Copy invite link'); }, 1600);
  });
  $('btn-guide').addEventListener('click', () => showGuide($('guide').hidden));
  $('btn-guide-ok').addEventListener('click', () => {
    showGuide(false);
    guideSeen = true;
    writeStore(STORE_GUIDE, 'seen');
  });
  paintTimerOptions();
  onLang(paintTimerOptions);
}

// The lengths come from the referee's own list, so the lobby can never offer
// one it would refuse.
function paintTimerOptions() {
  const sel = $('set-timer');
  const keep = sel.value;
  sel.textContent = '';
  sel.add(new Option(t('Off'), '0'));
  for (const s of TIMER_CHOICES) sel.add(new Option(t('{s} seconds', { s }), String(s)));
  if (keep) sel.value = keep;
}

function showGuide(on) {
  $('guide').hidden = !on;
}

// ── Controls ─────────────────────────────────────────────────────────────

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyQ: 'sl', KeyE: 'sr',
  Space: 'brake',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  KeyC: 'prec',
};

function setupControls() {
  window.addEventListener('keydown', (e) => {
    if (!joined || (e.target instanceof Element && e.target.closest('input, select'))) return;
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  });
  window.addEventListener('blur', () => keys.clear());

  const coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  $('touch').hidden = !coarse;
  document.body.classList.toggle('touch', coarse);
  const pad = $('pad');
  const knob = pad.querySelector('i');
  const movePad = (e) => {
    const r = pad.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    touch.x = x;
    touch.y = y;
    knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
  };
  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    touch.on = true;
    movePad(e);
  });
  pad.addEventListener('pointermove', (e) => { if (touch.on) movePad(e); });
  const endPad = () => {
    touch.on = false;
    touch.x = 0;
    touch.y = 0;
    knob.style.transform = '';
  };
  pad.addEventListener('pointerup', endPad);
  pad.addEventListener('pointercancel', endPad);
  for (const [id, key] of [['t-brake', 'brake'], ['t-boost', 'boost']]) {
    const b = $(id);
    const on = (v) => (e) => {
      e.preventDefault();
      touch[key] = v;
      b.classList.toggle('held', v);
    };
    b.addEventListener('pointerdown', on(true));
    b.addEventListener('pointerup', on(false));
    b.addEventListener('pointercancel', on(false));
    b.addEventListener('pointerleave', on(false));
  }
}

// The keys, or the touch pad turned into the same keys: turn toward where
// the pad points, and thrust once roughly facing that way.
function currentInput() {
  const i = { ...NO_INPUT };
  for (const k of keys) i[k] = true;
  if (touch.on && me) {
    const mag = Math.hypot(touch.x, touch.y);
    if (mag > 0.2) {
      const want = Math.atan2(touch.y, touch.x);
      const diff = wrapAngle(want - me.a);
      if (diff > 0.12) i.right = true;
      else if (diff < -0.12) i.left = true;
      if (Math.abs(diff) < 1.2 && mag > 0.45) i.up = true;
      if (mag < 0.7) i.prec = true;
    }
  }
  if (touch.brake) i.brake = true;
  if (touch.boost) i.boost = true;
  return i;
}

function sendInput(input, now) {
  const key = Object.keys(NO_INPUT).map((k) => (input[k] ? 1 : 0)).join('');
  if (key === sentInput && now - sentAt < 500) return;
  sentInput = key;
  sentAt = now;
  send({ t: 'input', i: input });
}

// ── Loop ─────────────────────────────────────────────────────────────────

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(250, now - lastFrame);
  lastFrame = now;

  if (joined && latest) {
    const input = currentInput();
    sendInput(input, now);
    const mine = latest.byId.get(myId);
    const canFly = me && mine && mine.dockedTo === null && latest.phase !== 'countdown';
    acc += dt;
    while (acc >= DOCK.tickMs) {
      acc -= DOCK.tickMs;
      if (canFly) {
        mePrev = { ...me };
        stepShip(me, input, latest.shuttles);
      }
    }
    countdown(latest);
    timer(latest);
  }
  render(now);
}

function countdown(s) {
  if (s.phase !== 'countdown') return;
  const left = Math.ceil((s.startAt - serverNow()) / 1000);
  const text = left > 0 ? String(left) : t('Go!');
  if ($('banner').dataset.count !== text) {
    $('banner').dataset.count = text;
    banner(text, 'count', 0, left > 0 ? t('Get ready') : '');
    if (left > 0) sound.tick();
  }
}

function timer(s) {
  const show = s.endsAt !== null && (s.phase === 'playing' || s.phase === 'countdown');
  $('c-time-label').hidden = !show;
  $('c-time').hidden = !show;
  if (!show) return;
  const left = Math.max(0, Math.ceil((s.endsAt - serverNow()) / 1000));
  setText('c-time', `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
  $('c-time').classList.toggle('low', left <= 10);
}

function serverNow() {
  return Date.now() + clockOffset;
}

function render(now) {
  const { w, h } = scene.size();
  const s = latest;
  if (!s) {
    // Behind the join screen: a slow drift through the stars.
    cam.x = Math.sin(now / 9000) * 300;
    cam.y = Math.cos(now / 11000) * 200;
    cam.zoom = 0.7;
    scene.draw({ cam, now, rules: { dockRadius: DOCK.dockRadius }, shuttles: [], ships: [], players: new Map(), showZones: false });
    return;
  }

  // Others, drawn a moment in the past between two known states.
  const at = now - INTERP_MS;
  let a = null;
  let b = null;
  for (let i = snaps.length - 1; i >= 0; i--) {
    if (snaps[i].recv <= at) {
      a = snaps[i];
      b = snaps[i + 1] || snaps[i];
      break;
    }
  }
  if (!a) {
    a = snaps[0];
    b = snaps[0];
  }
  const k = b.recv > a.recv ? Math.min(1, (at - a.recv) / (b.recv - a.recv)) : 1;

  const players = new Map(s.players.map((p) => [p.id, { name: p.name, colour: colourOf(p.col) }]));
  const ships = [];
  for (const p of s.players) {
    if (!p.ship || !p.connected) continue;
    let x;
    let y;
    let ang;
    if (p.id === myId && me) {
      const f = acc / DOCK.tickMs;
      const from = mePrev || me;
      x = from.x + (me.x - from.x) * f;
      y = from.y + (me.y - from.y) * f;
      ang = from.a + wrapAngle(me.a - from.a) * f;
    } else {
      const pa = a.byId.get(p.id);
      const pb = b.byId.get(p.id);
      if (pa && pb && pa.ship && pb.ship) {
        x = pa.ship.x + (pb.ship.x - pa.ship.x) * k;
        y = pa.ship.y + (pb.ship.y - pa.ship.y) * k;
        ang = pa.ship.a + wrapAngle(pb.ship.a - pa.ship.a) * k;
      } else {
        ({ x, y, a: ang } = p.ship);
      }
    }
    ships.push({
      x, y, a: ang,
      name: p.name,
      colour: colourOf(p.col),
      me: p.id === myId,
      docked: p.dockedTo !== null,
      thrust: p.id === myId ? (sentInput[0] === '1' || sentInput[1] === '1') : p.thrust,
      boost: p.id === myId ? sentInput[0] === '1' && sentInput[7] === '1' : p.boost,
    });
  }
  // Draw this player's ship last, on top.
  ships.sort((p, q) => (p.me ? 1 : 0) - (q.me ? 1 : 0));

  const mine = s.byId.get(myId);
  const following = mine && mine.ship && me && s.phase !== 'summary';
  const target = following
    // Closer on a phone, so ships are not specks on a narrow screen.
    ? { x: me.x + me.vx * 6, y: me.y + me.vy * 6, zoom: Math.max(0.58, Math.min(1.05, Math.min(w, h) / 760)) }
    : { x: 0, y: 0, zoom: Math.min(w, h) / (DOCK.arenaR * 2 + 200) };
  const e = following ? 0.12 : 0.05;
  cam.x += (target.x - cam.x) * e;
  cam.y += (target.y - cam.y) * e;
  cam.zoom += (target.zoom - cam.zoom) * 0.06;

  scene.draw({
    cam, now,
    rules: s.rules,
    shuttles: s.shuttles,
    ships,
    players,
    myDock: mine && mine.dock,
    showZones: true,
    pointers: following ? { shuttles: s.shuttles, from: me } : null,
  });
}

// ── Sound ────────────────────────────────────────────────────────────────
//
// A few synthesised blips; no files to load. Started on the Join press,
// because browsers only allow sound after someone has clicked something.

const sound = (() => {
  let ctx = null;
  const note = (freq, at, len, type = 'sine', vol = 0.12) => {
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(gn).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + len + 0.05);
  };
  return {
    unlock() {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) {
        ctx = null;
      }
    },
    range() { note(880, 0, 0.15, 'triangle', 0.08); },
    fail() { note(180, 0, 0.18, 'square', 0.05); note(150, 0.12, 0.2, 'square', 0.05); },
    docked() { [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.09, 0.35, 'triangle', 0.12)); },
    other() { note(660, 0, 0.12, 'sine', 0.05); note(990, 0.08, 0.16, 'sine', 0.05); },
    tick() { note(440, 0, 0.1, 'sine', 0.07); },
    count() { note(330, 0, 0.12, 'sine', 0.06); },
    go() { note(880, 0, 0.25, 'triangle', 0.1); note(1320, 0.05, 0.3, 'triangle', 0.08); },
    end() { [784, 659, 523].forEach((f, i) => note(f, i * 0.12, 0.3, 'triangle', 0.09)); },
  };
})();

// ── Bits ─────────────────────────────────────────────────────────────────

function setText(id, v) {
  const el = $(id);
  const s = String(v);
  if (el.textContent !== s) el.textContent = s;
}

function setHtml(id, v) {
  const el = $(id);
  if (el.dataset.html !== v) {
    el.innerHTML = v;
    el.dataset.html = v;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function readStore(k) {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
}

function writeStore(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch (e) {
    /* Remembering is only a convenience. */
  }
}

// ── Start ────────────────────────────────────────────────────────────────

installLang($('btn-lang'));
const setTitle = () => { document.title = t('Shuttle Docking — Cosmos'); };
setTitle();
onLang(() => {
  setTitle();
  if (latest) {
    $('room-code').textContent = t('Room {code}', { code: room });
    updateHud(latest, latest.byId.get(myId));
    if (latest.phase === 'summary') showSummary(latest);
  }
});
window.addEventListener('resize', scene.resize);
scene.resize();
setupJoin();
setupLobby();
setupControls();
requestAnimationFrame(frame);

// For automated tests only (?debug=1): read-only views of the state.
if (new URLSearchParams(location.search).has('debug')) {
  window.__dock = { state: () => latest, me: () => me, id: () => myId };
}
