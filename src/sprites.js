// Baked drawings.
//
// Multi-pass strokes and crayon hatching are far too expensive to run live for
// thirty objects at 60fps. So everything gets drawn once, into a small offscreen
// canvas, and blitted forever after. The per-frame loop is compositing.
//
// Each object is baked three times with a different seed. Cycling those at
// ~7.5fps makes the linework wriggle the way hand-drawn animation does — what
// animators call shooting on threes.

import { SKETCH, PAPER, GRAPHITE, PAPER_SHADE } from './config.js';
import { makeRng, hashSeed } from './rng.js';
import {
  circlePath, ellipsePath, strokeSketch, strokeLine,
  paperFill, hatch, mixHex, pathTo, shrinkPath,
} from './sketch.js';

// Sprites are baked with this much room around them. It is deliberately tight:
// a generous margin means every frame downscales a mostly-empty canvas, which
// is what held the busiest maps at thirty frames a second. 1.58 clears
// the longest thing any archetype draws (a sun's rays, at 1.44).
const MARGIN = 1.58;

// ── Sprite cache ────────────────────────────────────────────────────────────
//
// Baking was never the expensive part of changing universe — measured, it is
// three to twenty-six milliseconds. The freeze was the *first frame* of the new
// round, where sixty-odd brand-new canvases all get handed to the GPU at once.
// Transitions hitched for up to 233ms at 2560x1440, every thirty seconds.
//
// So scenery sprites are kept between rounds. Sizes are quantised and seeds are
// folded into a small range, which bounds how many distinct textures can ever
// exist: after the first pass through the maps, a transition uploads nothing.
// Reuse is less work under any rasterizer, which is the only kind of
// optimisation worth making here.

const spriteCache = new Map();
const SEED_VARIANTS = 8;

function cached(key, make) {
  let s = spriteCache.get(key);
  if (!s) {
    s = make();
    // Generous, and bounded. Every key quantises its size and seed, so this is
    // a safety net rather than something the game reaches in normal play.
    if (spriteCache.size > 600) spriteCache.clear();
    spriteCache.set(key, s);
  }
  return s;
}

// Sizes are quantised so a random radius cannot mint a new texture every round.
// Callers ask for the rounded value too, so the drawing and the physics agree.
export function quantise(v, step = 2) {
  return Math.max(step, Math.round(v / step) * step);
}

function variant(seed) {
  return ((seed % SEED_VARIANTS) + SEED_VARIANTS) % SEED_VARIANTS;
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

// Grain is deliberately NOT applied here. Filling a sprite's whole canvas with
// a texture paints a visible square halo around every object, because the
// canvas is square and the drawing inside it is not. The paper texture is
// applied once, over the finished frame, in the renderer instead.
function bake(worldRadius, drawFn, seed, frames = SKETCH.boilFrames) {
  const S = worldRadius * SKETCH.spriteScale;
  const size = Math.ceil(S * 2 * MARGIN);
  const out = [];
  for (let f = 0; f < frames; f++) {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.translate(size / 2, size / 2);
    drawFn(ctx, S, makeRng(hashSeed(seed, f)));
    out.push(c);
  }
  const w = size / SKETCH.spriteScale;
  return { frames: out, worldW: w, worldH: w };
}

// ── Player archetypes ───────────────────────────────────────────────────────

function drawSun(ctx, S, rng, col) {
  // Rays first so the body's outline crosses over them.
  const n = rng.int(8, 11);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.wobble(0.18);
    const r0 = S * rng.range(0.92, 1.02);
    const r1 = S * rng.range(1.18, 1.44);
    strokeLine(
      ctx,
      { x: Math.cos(a) * r0, y: Math.sin(a) * r0 },
      { x: Math.cos(a) * r1, y: Math.sin(a) * r1 },
      rng,
      { color: col.crayon, width: S * 0.11, passes: 2, alpha: 0.8, segments: 3, wobble: S * 0.03 },
    );
  }
  const body = circlePath(rng, S * 0.82);
  paperFill(ctx, body, rng);
  hatch(ctx, body, rng, { color: col.crayon, angle: rng.range(-1, 1), alpha: 0.62, width: S * 0.16 });
  strokeSketch(ctx, body, rng, { color: GRAPHITE, width: S * 0.09 });

  // A face, because a child would.
  const ey = -S * 0.14;
  const ex = S * 0.27;
  for (const sx of [-1, 1]) {
    strokeSketch(ctx, circlePath(rng, S * 0.07).map((p) => ({ x: p.x + sx * ex, y: p.y + ey })), rng, {
      color: GRAPHITE, width: S * 0.07, passes: 2,
    });
  }
  const smile = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    smile.push({ x: (-0.26 + 0.52 * t) * S, y: S * (0.2 + Math.sin(t * Math.PI) * 0.16) });
  }
  strokeSketch(ctx, smile, rng, { color: GRAPHITE, width: S * 0.07, passes: 2, closed: false });
}

function drawUfo(ctx, S, rng, col) {
  const dome = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (i / 16) * Math.PI;
    dome.push({ x: Math.cos(a) * S * 0.52 * (1 + rng.wobble(0.05)), y: Math.sin(a) * S * 0.62 - S * 0.1 });
  }
  dome.push({ x: S * 0.52, y: -S * 0.1 });
  paperFill(ctx, dome, rng);
  hatch(ctx, dome, rng, { color: col.glow, angle: -0.6, alpha: 0.5, width: S * 0.13, cross: false });
  strokeSketch(ctx, dome, rng, { color: GRAPHITE, width: S * 0.085 });

  const saucer = ellipsePath(rng, S * 1.0, S * 0.34);
  const shifted = saucer.map((p) => ({ x: p.x, y: p.y + S * 0.06 }));
  paperFill(ctx, shifted, rng);
  hatch(ctx, shifted, rng, { color: col.crayon, angle: 0.25, alpha: 0.6, width: S * 0.15 });
  strokeSketch(ctx, shifted, rng, { color: GRAPHITE, width: S * 0.09 });

  for (let i = -2; i <= 2; i++) {
    const x = i * S * 0.32 + rng.wobble(S * 0.03);
    strokeSketch(ctx, circlePath(rng, S * 0.075).map((p) => ({ x: p.x + x, y: p.y + S * 0.09 })), rng, {
      color: col.glow, width: S * 0.06, passes: 2, alpha: 0.95,
    });
  }
}

function drawMoon(ctx, S, rng, col) {
  const body = circlePath(rng, S * 0.9);
  paperFill(ctx, body, rng);
  hatch(ctx, body, rng, { color: col.crayon, angle: rng.range(-1.2, -0.4), alpha: 0.45, width: S * 0.16 });
  // Crescent shading: hatch again, harder, on one side only.
  ctx.save();
  pathTo(ctx, shrinkPath(body, S * 0.05), true);
  ctx.clip();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = mixHex(col.crayon, GRAPHITE, 0.45);
  ctx.beginPath();
  ctx.ellipse(S * 0.55, S * 0.2, S * 0.85, S * 0.95, rng.range(-0.4, 0.4), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const craters = rng.int(3, 4);
  for (let i = 0; i < craters; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0.15, 0.55) * S;
    const cr = circlePath(rng, S * rng.range(0.1, 0.2)).map((p) => ({
      x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
    }));
    strokeSketch(ctx, cr, rng, { color: GRAPHITE, width: S * 0.06, passes: 2, alpha: 0.6 });
  }
  strokeSketch(ctx, body, rng, { color: GRAPHITE, width: S * 0.09 });
}

function drawRinged(ctx, S, rng, col) {
  const tilt = rng.range(-0.5, -0.15);
  const ring = ellipsePath(rng, S * 1.32, S * 0.4, { steps: 26 });
  const rotated = ring.map((p) => ({
    x: p.x * Math.cos(tilt) - p.y * Math.sin(tilt),
    y: p.x * Math.sin(tilt) + p.y * Math.cos(tilt),
  }));
  // Back half of the ring, drawn before the planet so it passes behind it.
  strokeSketch(ctx, rotated, rng, { color: mixHex(col.crayon, PAPER, 0.4), width: S * 0.1, alpha: 0.9 });

  const body = circlePath(rng, S * 0.78);
  paperFill(ctx, body, rng);
  hatch(ctx, body, rng, { color: col.crayon, angle: rng.range(0.2, 1.1), alpha: 0.6, width: S * 0.17 });
  // A gas-giant band or two.
  ctx.save();
  pathTo(ctx, shrinkPath(body, S * 0.04), true);
  ctx.clip();
  for (let i = 0; i < 2; i++) {
    const y = rng.range(-0.45, 0.45) * S;
    strokeLine(ctx, { x: -S, y }, { x: S, y }, rng, {
      color: mixHex(col.crayon, GRAPHITE, 0.35), width: S * 0.13, passes: 2, alpha: 0.5, segments: 6, wobble: S * 0.04,
    });
  }
  ctx.restore();
  strokeSketch(ctx, body, rng, { color: GRAPHITE, width: S * 0.09 });

  // Front half: just the lower arc, so the ring reads as encircling.
  const front = rotated.filter((p) => p.y > -S * 0.03);
  if (front.length > 3) {
    strokeSketch(ctx, front, rng, { color: GRAPHITE, width: S * 0.09, closed: false, alpha: 0.9 });
  }
}

function drawCapsule(ctx, S, rng, col) {
  const w = S * 0.62;
  const h = S * 0.95;
  const body = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = t * Math.PI * 2 - Math.PI / 2;
    // A rounded, slightly nose-heavy capsule.
    const rx = w * (1 + rng.wobble(0.05));
    const ry = h * (1 + rng.wobble(0.05));
    const pinch = Math.sin(a) < 0 ? 0.86 : 1;
    body.push({ x: Math.cos(a) * rx * pinch, y: Math.sin(a) * ry });
  }
  // Fins first, behind the hull.
  for (const sx of [-1, 1]) {
    const fin = [
      { x: sx * w * 0.75, y: h * 0.25 },
      { x: sx * w * 1.5, y: h * 0.85 },
      { x: sx * w * 0.7, y: h * 0.8 },
    ];
    paperFill(ctx, fin, rng);
    hatch(ctx, fin, rng, { color: col.crayon, alpha: 0.55, width: S * 0.12, cross: false, inset: 1 });
    strokeSketch(ctx, fin, rng, { color: GRAPHITE, width: S * 0.08 });
  }
  paperFill(ctx, body, rng);
  hatch(ctx, body, rng, { color: col.crayon, angle: 1.35, alpha: 0.58, width: S * 0.15 });
  strokeSketch(ctx, body, rng, { color: GRAPHITE, width: S * 0.09 });

  const port = circlePath(rng, S * 0.24).map((p) => ({ x: p.x, y: p.y - S * 0.22 }));
  paperFill(ctx, port, rng, { color: mixHex(col.glow, PAPER, 0.35), alpha: 0.9 });
  strokeSketch(ctx, port, rng, { color: GRAPHITE, width: S * 0.07, passes: 2 });
}

function drawComet(ctx, S, rng, col) {
  // A lumpy rock: a circle with a few vertices dragged well out of true.
  const pts = circlePath(rng, S * 0.82, { steps: 15, wobble: 0.2 });
  for (let i = 0; i < 3; i++) {
    const k = rng.int(0, pts.length - 1);
    pts[k].x *= rng.range(1.1, 1.3);
    pts[k].y *= rng.range(1.1, 1.3);
  }
  paperFill(ctx, pts, rng);
  hatch(ctx, pts, rng, { color: col.crayon, angle: rng.range(-1.4, 1.4), alpha: 0.6, width: S * 0.16 });
  strokeSketch(ctx, pts, rng, { color: GRAPHITE, width: S * 0.095 });

  const nicks = rng.int(2, 4);
  for (let i = 0; i < nicks; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0.1, 0.45) * S;
    strokeSketch(ctx, circlePath(rng, S * rng.range(0.08, 0.15)).map((p) => ({
      x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
    })), rng, { color: GRAPHITE, width: S * 0.055, passes: 1, alpha: 0.5 });
  }
}

const ARCHETYPE_DRAW = {
  sun: drawSun,
  ufo: drawUfo,
  moon: drawMoon,
  ringed: drawRinged,
  capsule: drawCapsule,
  comet: drawComet,
};

export function bakeBody(archetype, col, seed, worldRadius) {
  const draw = ARCHETYPE_DRAW[archetype] || drawMoon;
  return bake(worldRadius, (ctx, S, rng) => draw(ctx, S, rng, col), hashSeed('body', archetype, seed));
}

// ── Scenery ─────────────────────────────────────────────────────────────────

export function bakePlanet(radius, seed, col, opts = {}) {
  const r = quantise(radius); const v = variant(seed);
  return cached(`planet|${r}|${v}|${col.name}|${opts.bands ?? 3}`, () => bakePlanetRaw(r, v, col, opts));
}

function bakePlanetRaw(radius, seed, col, opts) {
  return bake(radius, (ctx, S, rng) => {
    const body = circlePath(rng, S * 0.94, { steps: 34, wobble: 0.035 });
    paperFill(ctx, body, rng);
    hatch(ctx, body, rng, { color: col.crayon, angle: rng.range(-1, 1), alpha: 0.6, width: S * 0.045, spacing: S * 0.085 });
    ctx.save();
    pathTo(ctx, shrinkPath(body, S * 0.03), true);
    ctx.clip();
    const bands = opts.bands ?? 3;
    for (let i = 0; i < bands; i++) {
      const y = rng.range(-0.7, 0.7) * S;
      strokeLine(ctx, { x: -S * 1.1, y }, { x: S * 1.1, y }, rng, {
        color: mixHex(col.crayon, GRAPHITE, 0.4), width: S * rng.range(0.05, 0.11),
        passes: 2, alpha: 0.4, segments: 9, wobble: S * 0.02,
      });
    }
    // Terminator shading down one limb.
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = GRAPHITE;
    ctx.beginPath();
    ctx.ellipse(S * 0.62, S * 0.25, S * 0.9, S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    strokeSketch(ctx, body, rng, { color: GRAPHITE, width: S * 0.045 });
  }, hashSeed('planet', seed));
}

export function bakeAsteroid(radius, seed) {
  const r = quantise(radius); const v = variant(seed);
  return cached(`ast|${r}|${v}`, () => bakeAsteroidRaw(r, v));
}

function bakeAsteroidRaw(radius, seed) {
  return bake(radius, (ctx, S, rng) => {
    const pts = circlePath(rng, S * 0.86, { steps: 13, wobble: 0.22 });
    paperFill(ctx, pts, rng, { color: '#DCD5C6', alpha: 0.92 });
    hatch(ctx, pts, rng, { color: '#9C93A8', angle: rng.range(-1.4, 1.4), alpha: 0.55, width: S * 0.16 });
    strokeSketch(ctx, pts, rng, { color: GRAPHITE, width: S * 0.09 });
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.1, 0.45) * S;
      strokeSketch(ctx, circlePath(rng, S * rng.range(0.09, 0.17)).map((p) => ({
        x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d,
      })), rng, { color: GRAPHITE, width: S * 0.055, passes: 1, alpha: 0.45 });
    }
  }, hashSeed('rock', seed));
}

// A black hole is the one thing here drawn in negative: scribbled dark, with a
// bright crayon rim, so the eye reads a hole punched in the paper.
export function bakeBlackHole(radius, seed) {
  const r = quantise(radius); const v = variant(seed);
  return cached(`hole|${r}|${v}`, () => bakeBlackHoleRaw(r, v));
}

function bakeBlackHoleRaw(radius, seed) {
  return bake(radius * 1.35, (ctx, S, rng) => {
    const r = S / 1.35;
    const rim = circlePath(rng, r * 1.06, { steps: 30, wobble: 0.05 });

    ctx.save();
    pathTo(ctx, rim, true);
    ctx.clip();
    ctx.fillStyle = '#100C1C';
    ctx.globalAlpha = 0.96;
    ctx.fill();
    // Furious scribbling, the way you black something out in a notebook.
    ctx.strokeStyle = '#05030B';
    ctx.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = rng.range(0, r);
      ctx.globalAlpha = rng.range(0.2, 0.6);
      ctx.lineWidth = r * rng.range(0.04, 0.13);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      ctx.quadraticCurveTo(
        Math.cos(a + 0.6) * rr * 0.5, Math.sin(a + 0.6) * rr * 0.5,
        Math.cos(a + 1.4) * rr * rng.range(0.6, 1), Math.sin(a + 1.4) * rr * rng.range(0.6, 1),
      );
      ctx.stroke();
    }
    ctx.restore();

    strokeSketch(ctx, rim, rng, { color: '#C9A8FF', width: r * 0.09, alpha: 0.85 });
    // Accretion: a couple of bright arcs swept around the rim.
    for (let i = 0; i < 3; i++) {
      const arc = [];
      const a0 = rng.range(0, Math.PI * 2);
      const span = rng.range(1.2, 2.6);
      const rr = r * rng.range(1.16, 1.4);
      for (let k = 0; k <= 12; k++) {
        const a = a0 + (k / 12) * span;
        arc.push({ x: Math.cos(a) * rr * (1 + rng.wobble(0.04)), y: Math.sin(a) * rr * 0.45 });
      }
      strokeSketch(ctx, arc, rng, {
        color: i % 2 ? '#FFC66B' : '#9BE1FF', width: r * 0.07, passes: 2, alpha: 0.6, closed: false,
      });
    }
  }, hashSeed('hole', seed));
}

// A turnstile: two crossed bars on a hub, spinning slowly. Baked as one sprite
// and rotated, though the physics behind it is two separate bars.
// A long angular rock. Collides nothing like a circle does, which is the point.
export function bakeShard(len, seed) {
  const L = quantise(len, 8); const v = variant(seed);
  return cached(`shard|${L}|${v}`, () => bakeShardRaw(L, v));
}

function bakeShardRaw(len, seed) {
  return bake(len / 2, (ctx, S, rng) => {
    const pts = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // Stretched along one axis and dented at random, so no two are alike.
      const rr = S * 0.9 * rng.range(0.78, 1.05);
      pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.34 });
    }
    paperFill(ctx, pts, rng, { color: '#D6CEBE', alpha: 0.93 });
    hatch(ctx, pts, rng, { color: '#928AA0', angle: 0.3, alpha: 0.55, width: S * 0.07 });
    strokeSketch(ctx, pts, rng, { color: GRAPHITE, width: S * 0.045 });
    for (let i = 0; i < 3; i++) {
      const x = rng.range(-0.6, 0.6) * S;
      strokeLine(ctx, { x, y: -S * 0.16 }, { x: x + rng.wobble(S * 0.1), y: S * 0.16 }, rng, {
        color: GRAPHITE, width: S * 0.028, passes: 1, alpha: 0.4, segments: 3,
      });
    }
  }, hashSeed('shard', seed));
}

export function bakeComet(radius, seed, colour) {
  const r = quantise(radius); const v = variant(seed);
  return cached(`comet|${r}|${v}|${colour}`, () => bakeCometRaw(r, v, colour));
}

function bakeCometRaw(radius, seed, colour) {
  return bake(radius, (ctx, S, rng) => {
    const head = circlePath(rng, S * 0.78, { steps: 13, wobble: 0.16 });
    paperFill(ctx, head, rng);
    hatch(ctx, head, rng, { color: colour, angle: rng.range(-1, 1), alpha: 0.7, width: S * 0.18 });
    strokeSketch(ctx, head, rng, { color: GRAPHITE, width: S * 0.1 });
    // Speed ticks, the way a child draws something going fast.
    for (let i = 0; i < 5; i++) {
      const y = rng.range(-0.7, 0.7) * S;
      const x0 = S * rng.range(0.8, 0.95);
      strokeLine(ctx, { x: x0, y }, { x: x0 + S * rng.range(0.2, 0.45), y }, rng, {
        color: colour, width: S * 0.09, passes: 1, alpha: 0.75, segments: 2,
      });
    }
  }, hashSeed('comet', seed));
}

// A little star that periodically shoves everything away from it.
export function bakePulsar(radius, seed, colour) {
  const r = quantise(radius); const v = variant(seed);
  return cached(`pulsar|${r}|${v}|${colour}`, () => bakePulsarRaw(r, v, colour));
}

function bakePulsarRaw(radius, seed, colour) {
  return bake(radius, (ctx, S, rng) => {
    const n = 9;
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const rr = S * (i % 2 ? 0.42 : 0.92) * (1 + rng.wobble(0.08));
      pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
    }
    paperFill(ctx, pts, rng);
    hatch(ctx, pts, rng, { color: colour, angle: 0.6, alpha: 0.62, width: S * 0.16 });
    strokeSketch(ctx, pts, rng, { color: GRAPHITE, width: S * 0.085 });
    const core = circlePath(rng, S * 0.24, { steps: 12, wobble: 0.1 });
    paperFill(ctx, core, rng, { color: mixHex(colour, PAPER, 0.2) });
    strokeSketch(ctx, core, rng, { color: GRAPHITE, width: S * 0.07, passes: 2 });
  }, hashSeed('pulsar', seed));
}

export function bakeBumper(radius, seed, col) {
  const r = quantise(radius); const v = variant(seed);
  return cached(`bumper|${r}|${v}|${col.name}`, () => bakeBumperRaw(r, v, col));
}

function bakeBumperRaw(radius, seed, col) {
  return bake(radius, (ctx, S, rng) => {
    const outer = circlePath(rng, S * 0.94, { steps: 20, wobble: 0.06 });
    paperFill(ctx, outer, rng);
    hatch(ctx, outer, rng, { color: col.crayon, angle: 0.7, alpha: 0.6, width: S * 0.18 });
    strokeSketch(ctx, outer, rng, { color: GRAPHITE, width: S * 0.1 });
    const inner = circlePath(rng, S * 0.46, { steps: 14, wobble: 0.09 });
    paperFill(ctx, inner, rng, { color: mixHex(col.glow, PAPER, 0.25) });
    strokeSketch(ctx, inner, rng, { color: GRAPHITE, width: S * 0.08, passes: 2 });
    // Little "boing" ticks radiating outward.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rng.wobble(0.2);
      strokeLine(ctx, {
        x: Math.cos(a) * S * 0.99, y: Math.sin(a) * S * 0.99,
      }, {
        x: Math.cos(a) * S * 1.18, y: Math.sin(a) * S * 1.18,
      }, rng, { color: col.glow, width: S * 0.07, passes: 1, alpha: 0.7, segments: 2 });
    }
  }, hashSeed('bump', seed));
}

// ── Drawing ─────────────────────────────────────────────────────────────────

export function boilFrame(timeMs, offset = 0) {
  return (Math.floor((timeMs / 1000) * SKETCH.boilFps) + offset) % SKETCH.boilFrames;
}

// `scale` is world units per baked unit; sprites are baked oversize so a
// push-in during the finale never reveals soft edges.
export function drawSprite(ctx, sprite, x, y, angle, scale = 1, alpha = 1, frame = 0) {
  if (!sprite) return;
  const img = sprite.frames[frame % sprite.frames.length];
  const w = sprite.worldW * scale;
  const h = sprite.worldH * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
