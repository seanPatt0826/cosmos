// Drawing a round.
//
// The expensive hand-drawn work happened at bake time (see sprites.js). What
// happens here, sixty times a second, is compositing: background, scenery,
// trails, sprites, particles, grain.

import { drawSprite, boilFrame } from './sprites.js';
import { applyTransform, panOf, worldToScreen } from './camera.js';
import { softGlow, applyGrain, hexToRgba } from './sketch.js';
import { makeRng, hashSeed } from './rng.js';
import * as Particles from './particles.js';
import { PHASE } from './round.js';
import { ROUND, BODY } from './config.js';
import { isLight } from './theme.js';
import { getLang } from './i18n.js';

export function render(g, round, bg, viewW, viewH, time, stageW = viewW) {
  const { cam, map, players } = round;

  /* Clear the whole backing store, then put back the device-pixel-ratio
     transform that sizing established.

     Resetting to the identity matrix here was wrong on any screen with a
     pixel ratio above 1. The canvas is viewW*dpr by viewH*dpr device pixels,
     so under identity a clear of viewW by viewH wiped only the top-left
     1/dpr of it: the right and bottom edges were never cleared and built up
     smeared streaks of every frame ever drawn. Everything after the clear was
     drawn at 1/dpr scale into that same corner. At dpr 1 the identity matrix
     happens to be correct, which is why this only ever showed up on a
     high-density display. */
  const scale = g.canvas.width / viewW;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.setTransform(scale, 0, 0, scale, 0, 0);

  const pan = panOf(cam, map.bounds);
  bg.draw(g, pan.x, pan.y);

  g.save();
  applyTransform(g, cam, stageW, viewH);

  map.drawBack(g, cam, time);
  drawTrails(g, players);
  drawPlayers(g, round, time);
  map.drawFront(g, cam, time);
  Particles.draw(round.particles, g);
  if (round.phase === PHASE.WINNER) drawWinnerBloom(g, round, time);

  g.restore();


  // Paper on top of everything, so the drawings sit inside the scene rather
  // than floating over it. Grain and vignette are pre-composited into a single
  // screen-sized image and blitted once — see finish().
  finish(g, viewW, viewH);
}

// Each entrant's name, written just under its drawing, so whoever typed it in
// can find themselves in the crowd.
//
// Drawn in screen space rather than in the arena. The camera pulls out as far
// as 0.2× to fit a whole ring, and lettering scaled with it would shrink to a
// smudge exactly when the field is biggest and hardest to search.
//
// Not part of render(): main.js calls it after the close-up has copied the
// frame, and after the paper, so neither magnifies nor muddies the lettering.
export function drawNameTags(g, round, time, stageW, viewH) {
  const { players, phase, phaseTime, cam } = round;
  if (!players.some((p) => p.name)) return;

  const waiting = phase === PHASE.READY || phase === PHASE.COUNTDOWN;
  const intro = phase === PHASE.READY
    ? Math.min(1, phaseTime / (ROUND.countdownMs * 0.55))
    : 1;
  const light = isLight();

  g.save();
  // Gaegu draws small, so Korean tags get a larger size to match.
  g.font = getLang() === 'ko'
    ? '700 16px "Gaegu", "Shantell Sans", cursive'
    : '600 12.5px "Shantell Sans", "Gaegu", "Comic Sans MS", cursive';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.lineJoin = 'round';
  g.lineWidth = 3.5;
  g.strokeStyle = light ? 'rgba(250, 246, 237, 0.92)' : 'rgba(7, 6, 15, 0.85)';
  g.fillStyle = light ? '#2E2934' : '#F2EADB';

  for (const p of players) {
    if (!p.name || !p.alive || !p.body) continue;
    const pos = p.body.position;
    // Follows the same bob as the drawing, or the tag swims under it.
    let y = pos.y;
    let scale = 1;
    if (waiting) {
      y += Math.sin(time * 0.0022 + p.id * 0.9) * 7;
      scale = 0.62 + 0.38 * ease(intro);
    }
    const s = worldToScreen(cam, pos.x, y, stageW, viewH);
    const below = BODY.radius * scale * cam.zoom + 5;
    g.globalAlpha = intro;
    g.strokeText(p.name, s.x, s.y + below);
    g.fillText(p.name, s.x, s.y + below);
  }
  g.restore();
}

// The paper-and-vignette pass, built once per size and theme.
//
// This used to be a full-screen `overlay` composite (for the grain) plus a
// full-screen gradient fill (for the vignette), every single frame. Together
// with the uncached glows, that was most of the frame budget: two passes over
// every pixel on the canvas, sixty times a second, to draw something that never
// changes. Now it is one drawImage.
let overlay = null;
let overlayKey = '';

function finish(g, w, h) {
  const key = `${w}x${h}|${isLight() ? 'l' : 'd'}`;
  if (!overlay || overlayKey !== key) {
    overlayKey = key;
    overlay = document.createElement('canvas');
    overlay.width = Math.max(1, w);
    overlay.height = Math.max(1, h);
    const o = overlay.getContext('2d');

    applyGrain(o, w, h, isLight() ? 0.55 : 0.75);

    const r = Math.hypot(w, h) * 0.62;
    const grad = o.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    // On paper the corners darken barely at all; a heavy vignette would read as
    // a smudge rather than as depth.
    grad.addColorStop(1, isLight() ? 'rgba(120, 108, 96, 0.2)' : 'rgba(4,3,12,0.6)');
    o.fillStyle = grad;
    o.fillRect(0, 0, w, h);
  }
  g.save();
  g.globalAlpha = isLight() ? 0.5 : 0.62;
  g.drawImage(overlay, 0, 0, w, h);
  g.restore();
}


function drawTrails(g, players) {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const p of players) {
    const t = p.trail;
    if (t.length < 3) continue;
    // Three chunks rather than a per-segment gradient: same taper, a fraction
    // of the draw calls.
    const chunks = 3;
    for (let c = 0; c < chunks; c++) {
      const a = Math.floor((c / chunks) * (t.length - 1));
      const b = Math.floor(((c + 1) / chunks) * (t.length - 1));
      if (b - a < 1) continue;
      const near = (c + 1) / chunks;
      g.globalAlpha = (p.alive ? (isLight() ? 0.55 : 0.42) : 0.22) * near * near;
      g.strokeStyle = p.col.crayon;
      g.lineWidth = 0.9 + near * 2.2;
      g.beginPath();
      for (let i = a; i <= b; i++) {
        const pt = t[i];
        const x = pt.x + pt.jx;
        const y = pt.y + pt.jy;
        if (i === a) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  g.restore();
}

function drawPlayers(g, round, time) {
  const { players, phase, phaseTime } = round;

  // On the line and through the countdown everything hangs suspended with a
  // slow bob. The fade-up happens while waiting for start, so the countdown
  // begins at full size instead of popping back down when start is pressed.
  const waiting = phase === PHASE.READY || phase === PHASE.COUNTDOWN;
  const intro = phase === PHASE.READY
    ? Math.min(1, phaseTime / (ROUND.countdownMs * 0.55))
    : 1;

  for (const p of players) {
    if (p.alive && p.body) {
      const pos = p.body.position;
      const v = p.body.velocity;
      const speed = Math.hypot(v.x, v.y);
      // Boil is charm on something drifting and noise on something flying, so
      // fast movers get a frozen drawing.
      const frame = speed > 6.5 ? p.boilOffset % 3 : boilFrame(time, p.boilOffset);

      let y = pos.y;
      let scale = 1;
      if (waiting) {
        y += Math.sin(time * 0.0022 + p.id * 0.9) * 7;
        scale = 0.62 + 0.38 * ease(intro);
      }
      const isWinner = round.winner === p;
      const glowA = isWinner ? 0.34 + round.winnerBloom * 0.3 : 0.2;

      const big = isWinner ? 1.7 : 1;
      if (isLight()) {
        // On paper a glow cannot make anything stand out — a pale wash on a pale
        // ground just disappears. A soft shadow underneath does the job instead:
        // it lifts the scrap of paper off the page and gives the outline
        // something to sit against.
        //
        // It was not nearly strong enough. Measured against the paper, the
        // racers were the faintest things in the arena — fainter than the
        // asteroids drifting past them, which are mere scenery — and once the
        // framing pulled back to keep the rim in shot they became specks. The
        // shade is heavier now, and the colour pool under each one uses the
        // crayon rather than the glow, because the glow is the pale end of the
        // palette and pale is exactly what does not work here.
        softGlow(g, pos.x + 3, y + 5, 46 * big, '#6A5E52', 0.9 * intro);
        softGlow(g, pos.x, y, 44 * big, p.col.crayon, (glowA + 0.26) * intro);
      } else {
        softGlow(g, pos.x, y, 46 * big, p.col.glow, glowA * intro);
      }
      drawSprite(g, p.sprite, pos.x, y, p.body.angle, scale, intro, frame);
      // Whoever the close-up has been told to hold. The side panel is small and
      // easy to lose track of, so the wide shot says who you picked.
      if (round.focusId !== null && round.focusId === p.body.id) drawFocusRing(g, pos.x, y, p, time);
      continue;
    }

    const d = p.death;
    if (!d || d.t >= 1) continue;
    const t = d.t;

    if (d.kind === 'hole') {
      // Spiralling in: the angle accelerates while the radius collapses, which
      // is what makes it read as *falling* rather than shrinking.
      const ang = d.a0 + t * 7.2;
      const r = d.r0 * Math.pow(1 - t, 1.5);
      const x = d.target.x + Math.cos(ang) * r;
      const y = d.target.y + Math.sin(ang) * r;
      const scale = Math.max(0.05, 1 - t * 0.9);
      g.save();
      g.globalAlpha = 1 - t * 0.75;
      // Stretched along the direction of travel, the way a drawing smears when
      // you drag it before the ink is dry.
      g.translate(x, y);
      g.rotate(ang + Math.PI / 2);
      g.scale(scale * (1 - t * 0.55), scale * (1 + t * 1.1));
      g.rotate(-(ang + Math.PI / 2));
      drawSprite(g, p.sprite, 0, 0, d.angle + t * 5, 1, 1, p.boilOffset % 3);
      g.restore();
      softGlow(g, x, y, 34 * (1 - t), p.col.glow, 0.3 * (1 - t));
    } else if (d.kind === 'boom') {
      // Blown apart: the drawing swells, spins and thins out fast.
      const e = 1 - Math.pow(1 - t, 3);
      const scale = 1 + e * 1.5;
      softGlow(g, d.pos.x, d.pos.y, 70 + e * 190, '#FFE79B', 0.5 * (1 - e));
      drawSprite(g, p.sprite, d.pos.x, d.pos.y, d.angle + e * 3.4, scale, 1 - e, p.boilOffset % 3);
    } else if (d.kind === 'scribble') {
      const scale = 1 + t * 0.14;
      drawSprite(g, p.sprite, d.pos.x, d.pos.y, d.angle, scale, 1 - t, p.boilOffset % 3);
    } else {
      // Drifting off into the dark.
      const k = t * d.dur * 0.055;
      const x = d.pos.x + d.vel.x * k;
      const y = d.pos.y + d.vel.y * k;
      const scale = 1 - t * 0.45;
      softGlow(g, x, y, 40 * (1 - t), p.col.glow, 0.18 * (1 - t));
      drawSprite(g, p.sprite, x, y, d.angle + t * 1.4, scale, 1 - t * t, p.boilOffset % 3);
    }
  }
}

function drawWinnerBloom(g, round, time) {
  const w = round.winner;
  if (!w || !w.body) return;
  const { x, y } = w.body.position;
  const b = round.winnerBloom;

  softGlow(g, x, y, 90 + b * 210, w.col.glow, 0.32 * (1 - b * 0.4));

  const rng = makeRng(hashSeed('win', Math.floor(time / 140)));
  g.save();
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const t = Math.min(1, b * 1.25 - k * 0.22);
    if (t <= 0) continue;
    const r = 26 + t * (110 + k * 42);
    g.globalAlpha = (1 - t) * 0.6;
    g.strokeStyle = k === 1 ? '#F2EADB' : w.col.glow;
    g.lineWidth = 3 * (1 - t) + 0.8;
    g.beginPath();
    // Segment count scales with radius. A fixed count looks hand-drawn on a
    // small ring and like a polygon on a large one — and the camera is pushed
    // all the way in by the time this plays.
    const steps = Math.max(44, Math.round(r / 1.6));
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const rr = r * (1 + rng.wobble(0.05));
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.stroke();
  }

  // Little celebratory ticks radiating out, hand-drawn.
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + b * 0.6;
    const r0 = 40 + b * 58;
    const r1 = r0 + 14 + rng.range(0, 16);
    g.globalAlpha = (1 - b) * 0.7;
    g.strokeStyle = w.col.glow;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    g.stroke();
  }
  g.restore();
}

function ease(t) {
  return 1 - Math.pow(1 - t, 3);
}

export { hexToRgba };

// The ring around whoever the close-up is locked onto.
//
// Hand-drawn like everything else, and redrawn from a seed that ticks a few
// times a second so it wriggles instead of sitting there as a clean circle. It
// is the one piece of interface that lives inside the arena, so it has to look
// like it belongs to the drawing rather than to the browser.
function drawFocusRing(g, x, y, p, time) {
  const rng = makeRng(hashSeed('focus', p.id, Math.floor(time / 130)));
  const r = 40 + Math.sin(time * 0.004) * 2.5;
  const steps = 26;
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = p.col.glow;
  for (let pass = 0; pass < 2; pass++) {
    g.globalAlpha = pass === 0 ? 0.85 : 0.35;
    g.lineWidth = pass === 0 ? 2.2 : 3.6;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      // Stops a little short of a full turn, the way a circled word in a
      // notebook never quite closes.
      const a = (i / steps) * Math.PI * 1.88 - 0.4;
      const rr = r * (1 + rng.wobble(0.045));
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
  g.restore();
}
