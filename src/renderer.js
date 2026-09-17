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

export function render(g, round, bg, viewW, viewH, time, stageW = viewW) {
  const { cam, map, players } = round;

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, viewW, viewH);

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

  // Names go on after the camera transform is undone, so they stay legible at
  // a fixed size however far the camera has pushed in.
  drawLabels(g, round, stageW, viewH);

  // Paper on top of everything, so the drawings sit inside the scene rather
  // than floating over it. Grain and vignette are pre-composited into a single
  // screen-sized image and blitted once — see finish().
  finish(g, viewW, viewH);
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

function drawLabels(g, round, viewW, viewH) {
  const { cam, players } = round;
  const named = players.some((p) => p.name);
  if (!named) return;

  const light = isLight();
  g.save();
  g.font = '600 13px "Shantell Sans", "Comic Sans MS", cursive';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.lineJoin = 'round';

  for (const p of players) {
    if (!p.alive || !p.body || !p.name) continue;
    const s = worldToScreen(cam, p.body.position.x, p.body.position.y, viewW, viewH);
    const y = s.y + BODY.radius * cam.zoom + 6;
    if (s.x < -80 || s.x > viewW + 80 || y < -20 || y > viewH + 20) continue;

    const isWinner = round.winner === p;
    // Outlined rather than boxed: a chip behind every name would clutter the
    // arena, but plain text vanishes over a bright nebula.
    g.globalAlpha = isWinner ? 1 : 0.92;
    g.lineWidth = 3.5;
    g.strokeStyle = light ? 'rgba(244, 238, 226, 0.92)' : 'rgba(10, 8, 22, 0.85)';
    g.strokeText(p.name, s.x, y);
    g.fillStyle = isWinner ? p.col.glow : (light ? '#312C38' : '#F2EADB');
    g.fillText(p.name, s.x, y);
  }
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
      g.globalAlpha = (p.alive ? 0.42 : 0.22) * near * near;
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

  // During the countdown everything hangs suspended, fading up with a slow bob.
  const intro = phase === PHASE.COUNTDOWN
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
      if (phase === PHASE.COUNTDOWN) {
        y += Math.sin(time * 0.0022 + p.id * 0.9) * 7;
        scale = 0.62 + 0.38 * ease(intro);
      }
      const isWinner = round.winner === p;
      const glowA = isWinner ? 0.34 + round.winnerBloom * 0.3 : 0.2;
      softGlow(g, pos.x, y, 46 * (isWinner ? 1.7 : 1), p.col.glow, glowA * intro);
      drawSprite(g, p.sprite, pos.x, y, p.body.angle, scale, intro, frame);
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
