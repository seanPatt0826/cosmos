// Boot, the master loop, and the controls nobody has to touch.

import { MAPS, mapById } from './maps/index.js';
import { createRound, PHASE } from './round.js';
import { render } from './renderer.js';
import { createBackground } from './background.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { ROUND } from './config.js';
import { update as updateCamera } from './camera.js';
import { setMode, isLight } from './theme.js';
import { createRoster } from './roster.js';

const STORE_NAMES = 'cosmos.names';
const STORE_THEME = 'cosmos.theme';

// Storage is a convenience, never a requirement. A private window, blocked site
// data or a quota error must all degrade to "no saved roster", not to a broken
// page — so every access is wrapped.
function load(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}
function save(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    /* Nothing to do: the toy works fine without remembering. */
  }
}

const canvas = document.getElementById('stage');
const g = canvas.getContext('2d', { alpha: false });
const hud = createHud();
const audio = createAudio();

let viewW = 1;
let viewH = 1;
let stageW = 1;
let dpr = 1;
let round = null;
let bg = null;
let paused = false;
let timeScale = 1;
let transitioning = false;
let last = performance.now();
let order = [];
let orderIndex = 0;
let names = [];
let roster = null;

// ── Sizing ──────────────────────────────────────────────────────────────────

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  viewW = Math.max(320, Math.floor(rect.width));
  viewH = Math.max(240, Math.floor(rect.height));

  // The canvas now runs edge to edge, but the right-hand column sits on top of
  // it. The camera frames into the space actually left visible, so nothing
  // important ends up behind the ad. Measured from the rail rather than
  // hard-coded, because it narrows on small screens.
  // On a desktop there is room to keep the arena clear of the column entirely.
  // On a phone that would leave the game barely half the screen, so there the
  // arena uses the full width and the translucent panels simply float over it.
  if (viewW > 900) {
    const railRect = document.querySelector('.rail').getBoundingClientRect();
    stageW = Math.max(320, Math.floor(railRect.left - rect.left - 10));
  } else {
    stageW = viewW;
  }
  // Capped at 1.5. Now that the canvas runs edge to edge it covers roughly
  // seventy per cent more pixels than it did inside a frame, and fill rate is
  // the budget that matters here. On artwork that is deliberately soft and
  // wobbly the difference between 1.5x and 2x is invisible; the difference in
  // pixels pushed every frame is not.
  dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (round) bg = createBackground(viewW, viewH, round.seed, round.mapDef.theme);
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  // Rebaking the background on every resize event during a drag would stutter.
  resizeTimer = setTimeout(resize, 140);
});

// ── Rounds ──────────────────────────────────────────────────────────────────

function shuffleOrder(firstId) {
  const ids = MAPS.map((m) => m.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  if (firstId) {
    const k = ids.indexOf(firstId);
    if (k > 0) [ids[0], ids[k]] = [ids[k], ids[0]];
  }
  order = ids;
  orderIndex = 0;
}

function startRound(mapDef) {
  if (round) round.destroy();
  const seed = (Math.random() * 4294967295) >>> 0;
  round = createRound(mapDef, seed, audio, names);
  bg = createBackground(viewW, viewH, seed, mapDef.theme);
  hud.setMap(mapDef);
  markActiveMap(mapDef.id);
}

// ── Entrants ────────────────────────────────────────────────────────────────

// Reflects the boxes into the hint line. Deliberately does NOT restart the
// round: you would not want the race resetting under you on every keystroke.
// "Race these" is what commits the roster.
function refreshHint() {
  const n = roster ? roster.names().length : 0;
  document.getElementById('names-hint').textContent = n
    // The population is set by the map, so a roster shorter than the field
    // leaves some objects unnamed rather than shrinking the race.
    ? `${n} named. Objects beyond that stay unnamed.`
    : 'Leave empty for unnamed objects.';
  if (roster) save(STORE_NAMES, JSON.stringify(roster.names()));
}

function applyNames({ restart = true } = {}) {
  names = roster.names();
  refreshHint();
  if (restart) restartRound();
}

function restartRound() {
  if (transitioning) return;
  transitioning = true;
  hud.fadeOut();
  setTimeout(() => {
    startRound(mapById(order[orderIndex % order.length]));
    hud.fadeIn();
    transitioning = false;
  }, ROUND.fadeMs * 0.55);
}

function nextRound() {
  orderIndex++;
  // A fresh shuffle each pass, so the sequence never becomes predictable.
  if (orderIndex >= order.length) shuffleOrder(order[order.length - 1]);
  startRound(mapById(order[orderIndex % order.length]));
}

function goToMap(id) {
  const k = order.indexOf(id);
  if (k >= 0) orderIndex = k;
  transitioning = true;
  hud.fadeOut();
  setTimeout(() => {
    startRound(mapById(id));
    hud.fadeIn();
    transitioning = false;
  }, ROUND.fadeMs * 0.55);
}

// ── Loop ────────────────────────────────────────────────────────────────────

function frame(now) {
  requestAnimationFrame(frame);

  // Clamped: a backgrounded tab returning after ten seconds must not advance
  // the simulation by ten seconds in one step.
  const raw = Math.min(48, now - last);
  last = now;
  const dt = paused ? 0 : raw * timeScale;

  if (!round) return;

  if (dt > 0) round.update(dt);
  updateCamera(round.cam, Math.max(1, raw), round.players, stageW, viewH, round.map.bounds);
  render(g, round, bg, viewW, viewH, round.time, stageW);
  hud.update(round, raw);

  if (round.phase === PHASE.DONE && !transitioning) {
    transitioning = true;
    hud.fadeOut();
    setTimeout(() => {
      nextRound();
      hud.fadeIn();
      transitioning = false;
    }, ROUND.fadeMs * 0.55);
  }
}

// ── Controls ────────────────────────────────────────────────────────────────

function markActiveMap(id) {
  document.querySelectorAll('#map-picker button').forEach((b) => {
    b.classList.toggle('active', b.dataset.map === id);
  });
}

function buildControls() {
  const picker = document.getElementById('map-picker');
  for (const m of MAPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.map = m.id;
    b.textContent = m.name;
    b.title = m.blurb;
    b.addEventListener('click', () => goToMap(m.id));
    picker.appendChild(b);
  }

  const playBtn = document.getElementById('btn-play');
  playBtn.addEventListener('click', () => {
    paused = !paused;
    playBtn.textContent = paused ? 'play' : 'pause';
    playBtn.classList.toggle('active', paused);
  });

  const speedBtn = document.getElementById('btn-speed');
  const speeds = [1, 0.5, 2];
  let si = 0;
  speedBtn.addEventListener('click', () => {
    si = (si + 1) % speeds.length;
    timeScale = speeds[si];
    speedBtn.textContent = `${timeScale}×`;
    speedBtn.classList.toggle('active', timeScale !== 1);
  });

  const muteBtn = document.getElementById('btn-mute');
  muteBtn.addEventListener('click', () => {
    const nowMuted = !audio.muted;
    audio.setMuted(nowMuted);
    muteBtn.textContent = nowMuted ? 'sound off' : 'sound on';
    muteBtn.classList.toggle('active', !nowMuted);
  });

  const themeBtn = document.getElementById('btn-theme');
  function applyTheme(mode, { rebuild = true } = {}) {
    setMode(mode);
    document.body.classList.toggle('light', isLight());
    themeBtn.textContent = isLight() ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')
      .setAttribute('content', isLight() ? '#E9E4D6' : '#07060F');
    save(STORE_THEME, mode);
    // The background is baked, so a theme change means redrawing it. The
    // sprites are fine either way and never need re-baking.
    if (rebuild && round) bg = createBackground(viewW, viewH, round.seed, round.mapDef.theme);
  }
  themeBtn.addEventListener('click', () => applyTheme(isLight() ? 'dark' : 'light'));
  applyTheme(load(STORE_THEME) === 'light' ? 'light' : 'dark', { rebuild: false });

  roster = createRoster(document.getElementById('name-list'), refreshHint);

  // Restore a saved roster. The old build stored the raw textarea contents, so
  // accept either shape rather than throwing away someone's list on upgrade.
  let saved = [];
  const raw = load(STORE_NAMES);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      saved = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      saved = String(raw).split('\n').map((s) => s.trim()).filter(Boolean);
    }
  }
  roster.setNames(saved);
  names = roster.names();
  refreshHint();

  document.getElementById('btn-names').addEventListener('click', () => applyNames());
  document.getElementById('btn-add').addEventListener('click', () => roster.addAndFocus());
  document.getElementById('btn-names-clear').addEventListener('click', () => {
    roster.clear();
    applyNames();
  });

  document.getElementById('btn-skip').addEventListener('click', () => {
    if (transitioning) return;
    transitioning = true;
    hud.fadeOut();
    setTimeout(() => {
      nextRound();
      hud.fadeIn();
      transitioning = false;
    }, ROUND.fadeMs * 0.55);
  });

  for (const ev of ['mousemove', 'touchstart', 'keydown']) {
    window.addEventListener(ev, () => hud.wake(), { passive: true });
  }
  hud.wake();
}

// ── Go ──────────────────────────────────────────────────────────────────────

function boot() {
  if (!window.Matter) {
    document.getElementById('banner').textContent = 'physics failed to load';
    document.getElementById('banner').className = 'on final';
    return;
  }
  buildControls();
  resize();
  shuffleOrder();
  startRound(mapById(order[0]));
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
}

boot();
