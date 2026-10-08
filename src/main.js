// Boot, the master loop, and the controls.

import { MAPS, mapById } from './maps/index.js';
import { createRound, PHASE } from './round.js';
import { render, drawNameTags } from './renderer.js';
import { createBackground } from './background.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { ROUND } from './config.js';
import { update as updateCamera, screenToWorld } from './camera.js';
import { setMode, isLight } from './theme.js';
import { createRoster } from './roster.js';
import { createMiniMap, playerAt } from './minimap.js';
import { createUniverses } from './universes.js';
import { installTooltips } from './tooltip.js';
import { t, installLang, onLang, examplePool } from './i18n.js';
import { setIcon } from './icons.js';

const STORE_NAMES = 'cosmos.names';
const STORE_THEME = 'cosmos.theme';
const STORE_ABOUT = 'cosmos.about';

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
let minimap = null;
// Whoever has been clicked in the arena, and whoever the pointer is resting on
// in the mini map. Either one gets the ring; the hover wins while it lasts.
let lockedId = null;
let hoverId = null;
let universes = null;

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

// A race needs at least two. Below that there is nobody to run against, so the
// universe is drawn empty and waits for names rather than inventing entrants.
const MIN_RACERS = 2;

function racing() {
  return names.length >= MIN_RACERS;
}

/* A cast for the example run. Deliberately not real-sounding people: these are
   obviously placeholders, so nobody mistakes a demo for a roster someone left
   behind, and nobody has to wonder who "Maya" is. Written in whichever
   language the page is showing; the lists live in i18n.js. */

function exampleNames() {
  const pool = examplePool();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 8);
}

function startRound(mapDef, { seed = (Math.random() * 4294967295) >>> 0 } = {}) {
  const prev = round;
  if (round) round.destroy();
  round = createRound(mapDef, seed, audio, names, { idle: !racing() });
  // Re-lining the same universe keeps its baked sky; only the field changed.
  const sameSky = prev && prev.seed === seed && prev.mapDef === mapDef;
  if (!sameSky) bg = createBackground(viewW, viewH, seed, mapDef.theme);
  // Already faded up on the line: do not shrink everyone and grow them again
  // just because a name was added beside them.
  if (sameSky && prev.phase === PHASE.READY && round.phase === PHASE.READY) {
    round.phaseTime = prev.phaseTime;
  }
  hud.setMap(mapDef);
  if (minimap) minimap.reset();
  // A new round is a new cast; an old id would ring nobody.
  lockedId = null;
  hoverId = null;
  markActiveMap(mapDef.id);
}

// ── Entrants ────────────────────────────────────────────────────────────────

// Reflects the boxes into the hint line, and onto the map. While the field is
// still waiting on the line (or there is no field yet), the names go straight
// into the universe as they are typed, in the same universe with the same
// sky. It never starts anything: Start is still the only way a race begins.
// Mid-race, edits wait and join at the next line-up.
function refreshHint() {
  const n = roster ? roster.names().length : 0;
  document.getElementById('names-hint').textContent =
    n >= MIN_RACERS ? t('{n} entrants on the line. Shuffle, then press Start.', { n })
      : n === 1 ? t('One more and they can race.')
        : t('Add names, or watch an example.');

  const demo = document.getElementById('btn-example');
  if (demo) demo.hidden = n >= MIN_RACERS;

  if (roster) save(STORE_NAMES, JSON.stringify(roster.names()));
  scheduleLineUp();
  refreshShuffle();
}

function onTheLine() {
  return round && (round.idle || round.phase === PHASE.READY);
}

// A short pause after the last keystroke, so typing "Bramble" does not line up
// seven different fields on the way.
let lineUpTimer = null;
function scheduleLineUp() {
  clearTimeout(lineUpTimer);
  lineUpTimer = setTimeout(lineUp, 260);
}

function sameNames(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function lineUp() {
  clearTimeout(lineUpTimer);
  if (!roster || !onTheLine() || transitioning) return;
  const next = roster.names();
  if (sameNames(next, names)) return;
  names = next;
  startRound(round.mapDef, { seed: round.seed });
}

function refreshShuffle() {
  const b = document.getElementById('btn-shuffle');
  if (b) b.disabled = !(round && round.phase === PHASE.READY && round.players.length >= MIN_RACERS);
}

function shuffleField() {
  lineUp();
  if (round && !transitioning && round.phase === PHASE.READY) round.shuffle();
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
  updateCamera(round.cam, Math.max(1, raw), round.players, stageW, viewH, round.map.bounds,
    { edge: round.map.edge });
  // A ringed racer who has gone out releases the ring.
  if (lockedId !== null && !round.alivePlayers().some((p) => p.body.id === lockedId)) lockedId = null;
  round.focusId = hoverId ?? lockedId;
  render(g, round, bg, viewW, viewH, round.time, stageW);
  drawNameTags(g, round, round.time, stageW, viewH);
  if (minimap) minimap.update(round, stageW, viewH, dpr, round.focusId);
  hud.update(round, raw);
  refreshShuffle();
  sampleFps(raw);

  // A finished race lines the same field up again on the same map and waits.
  // It used to move on to the next universe by itself; which map comes next is
  // for the people watching to pick.
  if (round.phase === PHASE.DONE && !transitioning) {
    transitioning = true;
    hud.fadeOut();
    setTimeout(() => {
      // Anything typed during the race joins this line-up.
      names = roster.names();
      startRound(round.mapDef);
      hud.fadeIn();
      transitioning = false;
    }, ROUND.fadeMs * 0.55);
  }
}

// ── Frame counter ───────────────────────────────────────────────────────────
//
// Hidden until you press F. It exists because "it feels laggy" and "it is
// running at 41fps, worst frame 90ms" are very different reports, and only the
// second one can be acted on. Costs nothing while hidden.

const fpsEl = document.getElementById('fps');
let fpsOn = false;
let fpsFrames = [];
let fpsAt = 0;

function sampleFps(raw) {
  if (!fpsOn) return;
  fpsFrames.push(raw);
  fpsAt += raw;
  if (fpsAt < 500) return;
  fpsAt = 0;
  const s = fpsFrames.slice().sort((a, b) => a - b);
  const p50 = s[Math.floor(s.length / 2)] || 16.7;
  fpsEl.textContent =
    `${Math.round(1000 / p50)} fps   frame ${p50.toFixed(1)}ms   worst ${s[s.length - 1].toFixed(0)}ms\n`
    + `${viewW}x${viewH}  dpr ${dpr.toFixed(2)}  canvas ${canvas.width}x${canvas.height}`;
  fpsFrames = [];
}

window.addEventListener('keydown', (e) => {
  if (e.key !== 'f' && e.key !== 'F') return;
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  fpsOn = !fpsOn;
  fpsFrames = [];
  fpsAt = 0;
  fpsEl.hidden = !fpsOn;
  if (fpsOn) fpsEl.textContent = 'measuring…';
});

// ── Controls ────────────────────────────────────────────────────────────────

function markActiveMap(id) {
  if (universes) universes.setActive(id);
}

function buildControls() {
  // Icons, not words; the word lives in each button's tooltip. Each button
  // shows what clicking it does now: the pause bars while running, the sun
  // while dark.
  const playBtn = document.getElementById('btn-play');
  const showPlay = () => setIcon(playBtn, paused ? 'play' : 'pause', t(paused ? 'Play' : 'Pause'));
  showPlay();
  playBtn.addEventListener('click', () => {
    paused = !paused;
    showPlay();
    playBtn.classList.toggle('active', paused);
  });

  const speedBtn = document.getElementById('btn-speed');
  const speeds = [1, 0.5, 2];
  let si = 0;
  // The badge keeps the current speed readable at a glance; ½ is shorter
  // than 0.5 and fits beside the icon.
  const showSpeed = () => {
    const x = timeScale === 0.5 ? '½' : String(timeScale);
    setIcon(speedBtn, 'speed', t('Speed {n}×', { n: x }), `${x}×`);
  };
  showSpeed();
  speedBtn.addEventListener('click', () => {
    si = (si + 1) % speeds.length;
    timeScale = speeds[si];
    showSpeed();
    speedBtn.classList.toggle('active', timeScale !== 1);
  });

  const muteBtn = document.getElementById('btn-mute');
  const showSound = () => setIcon(muteBtn, audio.muted ? 'soundOff' : 'soundOn',
    t(audio.muted ? 'Sound off' : 'Sound on'));
  showSound();
  muteBtn.addEventListener('click', () => {
    const nowMuted = !audio.muted;
    audio.setMuted(nowMuted);
    showSound();
    muteBtn.classList.toggle('active', !nowMuted);
  });

  const showSkip = () => setIcon(document.getElementById('btn-skip'), 'skip', t('Skip to the next universe'));
  showSkip();

  const themeBtn = document.getElementById('btn-theme');
  const showTheme = () => setIcon(themeBtn, isLight() ? 'moon' : 'sun',
    t(isLight() ? 'Switch to dark mode' : 'Switch to light mode'));
  function applyTheme(mode, { rebuild = true } = {}) {
    setMode(mode);
    document.body.classList.toggle('light', isLight());
    showTheme();
    document.querySelector('meta[name="theme-color"]')
      .setAttribute('content', isLight() ? '#E9E4D6' : '#07060F');
    save(STORE_THEME, mode);
    // The background is baked, so a theme change means redrawing it. The
    // sprites are fine either way and never need re-baking.
    if (rebuild && round) bg = createBackground(viewW, viewH, round.seed, round.mapDef.theme);
    // The portraits carry their own skies, so they are stale the moment the
    // palette flips.
    // The portraits carry their own skies, so they are stale the moment the
    // palette flips.
    if (rebuild && universes) universes.refresh();
  }
  themeBtn.addEventListener('click', () => applyTheme(isLight() ? 'dark' : 'light'));
  applyTheme(load(STORE_THEME) === 'light' ? 'light' : 'dark', { rebuild: false });
  // The icons stay put when the language flips; only their tooltips change.
  onLang(() => { showPlay(); showSpeed(); showSound(); showSkip(); showTheme(); });

  // The "how this universe works" card on the arena. Open by default so a
  // first visit explains itself; once closed it stays closed, with the round
  // button left in its place to bring it back.
  const aboutCard = document.getElementById('map-about');
  const aboutOpen = document.getElementById('btn-about-open');
  const aboutClose = document.getElementById('btn-about-close');
  function showAboutCard(open, { focus = false } = {}) {
    aboutCard.hidden = !open;
    aboutOpen.hidden = open;
    save(STORE_ABOUT, open ? 'open' : 'closed');
    if (focus) (open ? aboutClose : aboutOpen).focus();
  }
  aboutClose.addEventListener('click', () => showAboutCard(false, { focus: true }));
  aboutOpen.addEventListener('click', () => showAboutCard(true, { focus: true }));
  showAboutCard(load(STORE_ABOUT) !== 'closed');

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
  onLang(refreshHint);

  document.getElementById('btn-shuffle').addEventListener('click', shuffleField);
  document.getElementById('btn-add').addEventListener('click', () => roster.addAndFocus());
  document.getElementById('btn-names-clear').addEventListener('click', () => {
    roster.clear();
    lineUp();
  });

  // A way to see what this is without typing a roster first: borrow a cast
  // and line it up in whichever universe is showing. Start still waits.
  document.getElementById('btn-example').addEventListener('click', () => {
    roster.setNames(exampleNames());
    refreshHint();
    lineUp();
  });

  // Rounds never begin by themselves; this is the only way a race starts.
  const startBtn = document.getElementById('btn-start');
  function pressStart() {
    if (!round || transitioning) return;
    // A name typed a moment ago should be in the race, not left behind.
    lineUp();
    if (round.start()) startBtn.hidden = true;
  }
  startBtn.addEventListener('click', pressStart);
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    if (ev.target && /^(INPUT|TEXTAREA|BUTTON)$/.test(ev.target.tagName)) return;
    ev.preventDefault();
    pressStart();
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 's' && ev.key !== 'S') return;
    if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
    shuffleField();
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

  // The picker builds seven physics worlds to photograph them, which is not
  // something to make the first frame wait for. Built now, painted once the
  // arena is already up.
  universes = createUniverses(document.getElementById('universe-grid'), (id) => {
    if (transitioning) return;
    goToMap(id);
  });
  // Seven physics worlds is not something to make the first frame wait for.
  const paintPortraits = () => {
    universes.refresh();
    if (round) universes.setActive(round.mapDef.id);
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(paintPortraits, { timeout: 1200 });
  else setTimeout(paintPortraits, 300);

  minimap = createMiniMap(
    document.getElementById('chase-cam'),
    document.getElementById('chase-caption'),
  );

  // Click an object in the arena to ring it, in the arena and on the mini map;
  // click past everything, or press Escape, to let go. The hit test runs
  // against the live camera, so it stays honest while the view drifts.
  function worldAt(ev) {
    const r = canvas.getBoundingClientRect();
    return screenToWorld(round.cam, ev.clientX - r.left, ev.clientY - r.top, stageW, viewH);
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (!round || transitioning) return;
    const w = worldAt(ev);
    const p = playerAt(round, w.x, w.y);
    lockedId = p ? p.body.id : null;
  });

  // The cursor is the only hint that any of this is clickable.
  canvas.addEventListener('pointermove', (ev) => {
    if (!round) return;
    const w = worldAt(ev);
    canvas.style.cursor = playerAt(round, w.x, w.y) ? 'pointer' : '';
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') lockedId = null;
  });

  // Resting the pointer on a dot in the mini map rings that racer in the arena,
  // so you can find the big drawing from the little one. Dots are tiny, so the
  // reach is measured in panel pixels and turned into world units here.
  const miniEl = document.getElementById('chase-cam');
  if (miniEl) {
    miniEl.addEventListener('pointermove', (ev) => {
      const r = miniEl.getBoundingClientRect();
      if (!round || !r.width || !r.height) return;
      const fx = (ev.clientX - r.left) / r.width;
      const fy = (ev.clientY - r.top) / r.height;
      const w = minimap.worldAt(fx, fy);
      const reach = minimap.worldPerPx(r.width) * 10;
      const p = w ? playerAt(round, w.x, w.y, reach) : null;
      hoverId = p ? p.body.id : null;
      miniEl.style.cursor = p ? 'pointer' : '';
    });
    miniEl.addEventListener('pointerleave', () => { hoverId = null; });
    // A click on a dot keeps the ring after the pointer moves away.
    miniEl.addEventListener('pointerdown', () => { if (hoverId !== null) lockedId = hoverId; });
  }

  for (const ev of ['mousemove', 'touchstart', 'keydown']) {
    window.addEventListener(ev, () => hud.wake(), { passive: true });
  }
  hud.wake();
}

// ── Go ──────────────────────────────────────────────────────────────────────

function boot() {
  if (!window.Matter) {
    document.getElementById('banner').textContent = t('physics failed to load');
    document.getElementById('banner').className = 'on final';
    return;
  }
  installTooltips();
  installLang(document.getElementById('btn-lang'));
  buildControls();
  resize();
  shuffleOrder();
  startRound(mapById(order[0]));
  // A language switch rewrites the universe's name and card. The field is
  // whoever is in the boxes, so it is never recast.
  onLang(() => {
    if (round) hud.setMap(round.mapDef);
  });
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
}

boot();
