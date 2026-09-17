// Hand-drawn primitives.
//
// Everything in the game that looks drawn is drawn by something in here. The
// rules, in short: nothing is geometrically perfect, every line is gone over
// two or three times, strokes overshoot their corners, and crayon never quite
// reaches the outline.
//
// Nearly all of this runs at bake time, not per frame. See sprites.js.

import { SKETCH, PAPER, PAPER_SHADE, GRAPHITE } from './config.js';
import { isLight } from './theme.js';

// ── Paths ───────────────────────────────────────────────────────────────────

export function circlePath(rng, r, opts = {}) {
  const steps = opts.steps || SKETCH.circleSteps;
  const wob = opts.wobble ?? SKETCH.wobble;
  // A slight ellipse, because nobody draws a true circle freehand.
  const sx = 1 + rng.wobble(0.05);
  const sy = 1 + rng.wobble(0.05);
  const tilt = rng.range(0, Math.PI);
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (1 + rng.wobble(wob));
    const x = Math.cos(a) * rr * sx;
    const y = Math.sin(a) * rr * sy;
    pts.push({
      x: x * Math.cos(tilt) - y * Math.sin(tilt),
      y: x * Math.sin(tilt) + y * Math.cos(tilt),
    });
  }
  return pts;
}

export function ellipsePath(rng, rx, ry, opts = {}) {
  const steps = opts.steps || SKETCH.circleSteps;
  const wob = opts.wobble ?? SKETCH.wobble;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({
      x: Math.cos(a) * rx * (1 + rng.wobble(wob)),
      y: Math.sin(a) * ry * (1 + rng.wobble(wob)),
    });
  }
  return pts;
}

export function rectPath(rng, w, h, opts = {}) {
  const wob = opts.wobble ?? 1.6;
  // Subdivide the edges so a long platform bows the way a ruler-less line does.
  const per = Math.max(2, Math.round(Math.max(w, h) / 26));
  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  const pts = [];
  for (let c = 0; c < 4; c++) {
    const a = corners[c];
    const b = corners[(c + 1) % 4];
    const n = c % 2 === 0 ? per : Math.max(2, Math.round(per * (h / w) * 2)) || 2;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push({
        x: a.x + (b.x - a.x) * t + rng.wobble(wob),
        y: a.y + (b.y - a.y) * t + rng.wobble(wob),
      });
    }
  }
  return pts;
}

export function shrinkPath(pts, amount) {
  const c = centroid(pts);
  return pts.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.max(0, d - amount) / d;
    return { x: c.x + dx * k, y: c.y + dy * k };
  });
}

export function centroid(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

export function bbox(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// ── Tracing ─────────────────────────────────────────────────────────────────

function traceSmooth(ctx, pts) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

export function pathTo(ctx, pts, closed) {
  ctx.beginPath();
  traceSmooth(ctx, closed ? pts.concat([pts[0], pts[1]]) : pts);
  if (closed) ctx.closePath();
}

// ── Strokes ─────────────────────────────────────────────────────────────────

// The core move: draw the same line more than once, never identically.
export function strokeSketch(ctx, pts, rng, opts = {}) {
  const color = opts.color || GRAPHITE;
  const width = opts.width ?? 1.6;
  const passes = opts.passes ?? SKETCH.passes;
  const closed = opts.closed ?? true;
  const alpha = opts.alpha ?? 0.85;
  const spread = opts.spread ?? SKETCH.passOffset;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;

  for (let p = 0; p < passes; p++) {
    // Each pass drifts a little further off true and presses a little lighter.
    const off = spread * (p === 0 ? 0.35 : 1) * (0.6 + p * 0.35);
    let seq = pts.map((pt) => ({
      x: pt.x + rng.wobble(off),
      y: pt.y + rng.wobble(off),
    }));

    if (closed) {
      // Run past the start rather than meeting it cleanly.
      const extra = Math.max(2, Math.round(pts.length * SKETCH.overshoot * rng.range(0.8, 2.4)));
      seq = seq.concat(seq.slice(0, extra));
    } else {
      seq = seq.slice();
    }

    ctx.globalAlpha = alpha * (p === 0 ? 1 : rng.range(0.3, 0.62));
    ctx.lineWidth = width * (p === 0 ? 1 : rng.range(0.5, 0.95));
    ctx.beginPath();
    traceSmooth(ctx, seq);
    ctx.stroke();
  }

  ctx.restore();
}

export function strokeLine(ctx, a, b, rng, opts = {}) {
  const segs = opts.segments ?? 5;
  const wob = opts.wobble ?? 0.9;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push({
      x: a.x + (b.x - a.x) * t + rng.wobble(wob),
      y: a.y + (b.y - a.y) * t + rng.wobble(wob),
    });
  }
  strokeSketch(ctx, pts, rng, { ...opts, closed: false });
}

// ── Fills ───────────────────────────────────────────────────────────────────

// The paper the object is drawn on. Warm, slightly uneven, a touch of shading
// down one side so it does not read as flat vector.
export function paperFill(ctx, pts, rng, opts = {}) {
  const alpha = opts.alpha ?? 0.94;
  ctx.save();
  ctx.globalAlpha = alpha;
  pathTo(ctx, pts, true);
  ctx.fillStyle = opts.color || PAPER;
  ctx.fill();

  const box = bbox(pts);
  const g = ctx.createLinearGradient(box.minX, box.minY, box.maxX, box.maxY);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, PAPER_SHADE);
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

// Crayon. Uneven parallel strokes, varying pressure, stopping short of the
// outline so the paper shows through at the edges — which is the single most
// legible signal that a fill was made by a hand and not a bucket tool.
export function hatch(ctx, pts, rng, opts = {}) {
  const color = opts.color || '#E8A33D';
  const angle = opts.angle ?? -Math.PI / 4;
  const spacing = opts.spacing ?? SKETCH.hatchSpacing;
  const inset = opts.inset ?? SKETCH.hatchInset;
  const alpha = opts.alpha ?? 0.55;
  const width = opts.width ?? 2.4;

  const clip = shrinkPath(pts, inset);
  const box = bbox(pts);
  const diag = Math.hypot(box.w, box.h) * 0.75 + 6;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;

  ctx.save();
  pathTo(ctx, clip, true);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;

  for (let y = -diag; y <= diag; y += spacing * rng.range(0.78, 1.32)) {
    // Each stroke falls short at both ends by a different amount, and bows in
    // the middle the way a dragged crayon does.
    const x0 = -diag + rng.range(0, diag * 0.28);
    const x1 = diag - rng.range(0, diag * 0.28);
    const bow = rng.wobble(2.2);
    ctx.globalAlpha = alpha * rng.range(0.5, 1);
    ctx.lineWidth = width * rng.range(0.6, 1.25);
    ctx.beginPath();
    ctx.moveTo(x0, y + rng.wobble(0.7));
    ctx.quadraticCurveTo((x0 + x1) / 2, y + bow, x1, y + rng.wobble(0.7));
    ctx.stroke();
  }

  // A few strokes crossing the other way, where a child pressed harder.
  if (opts.cross !== false) {
    ctx.rotate(rng.range(0.9, 1.5));
    const n = rng.int(3, 7);
    for (let i = 0; i < n; i++) {
      const y = rng.range(-diag * 0.7, diag * 0.7);
      ctx.globalAlpha = alpha * rng.range(0.2, 0.45);
      ctx.lineWidth = width * rng.range(0.5, 1);
      ctx.beginPath();
      ctx.moveTo(-diag * rng.range(0.3, 0.8), y);
      ctx.quadraticCurveTo(0, y + rng.wobble(3), diag * rng.range(0.3, 0.8), y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ── Grain ───────────────────────────────────────────────────────────────────

let grainTile = null;

export function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    // Fibrous rather than uniform: a few strong flecks in a quiet field.
    const base = 120 + Math.random() * 60;
    const fleck = Math.random() < 0.035 ? Math.random() * 110 : 0;
    const v = Math.min(255, base + fleck);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 26 + Math.random() * 34;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

export function applyGrain(ctx, w, h, alpha = 0.5) {
  const tile = getGrainTile();
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = alpha;
  const pat = ctx.createPattern(tile, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ── Glow ────────────────────────────────────────────────────────────────────

// Cozy light bleed, kept soft and grainy so it reads as a smudge rather than a
// lens effect.
// Glows are baked once per colour and size, then blitted.
//
// This is called well over a hundred times a frame — every object, every hazard,
// every bloom — and building a radial gradient plus filling an arc each time was
// one of the two things holding the whole game at twenty frames a second. The
// shape is identical every time; only its position, size and opacity change.
const glowCache = new Map();

function glowSprite(color, bucket) {
  const key = `${color}|${bucket}`;
  let c = glowCache.get(key);
  if (c) return c;

  const size = bucket * 2;
  c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const gx = c.getContext('2d');
  const g = gx.createRadialGradient(bucket, bucket, 0, bucket, bucket, bucket);
  g.addColorStop(0, hexToRgba(color, 1));
  g.addColorStop(0.4, hexToRgba(color, 0.35));
  g.addColorStop(1, hexToRgba(color, 0));
  gx.fillStyle = g;
  gx.fillRect(0, 0, size, size);

  // Colours come from a fixed palette and radii are bucketed, so this settles
  // quickly. The cap is only insurance against an unexpected caller.
  if (glowCache.size > 400) glowCache.clear();
  glowCache.set(key, c);
  return c;
}

export function softGlow(ctx, x, y, r, color, alpha = 0.5) {
  if (r <= 0 || alpha <= 0.002) return;
  // Quantised so a smoothly growing bloom reuses one cached sprite rather than
  // baking a new one every frame. Drawn at the true radius, so nothing snaps.
  const bucket = Math.max(8, Math.min(512, Math.round(r / 8) * 8));
  const sprite = glowSprite(color, bucket);

  ctx.save();
  if (isLight()) {
    // On paper, additive light only greys things out. A coloured pencil smudge
    // laid over the ground does the same job of saying "this thing is bright".
    ctx.globalAlpha = Math.min(1, alpha * 0.55);
  } else {
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.globalCompositeOperation = 'lighter';
  }
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

export function hexToRgba(hex, a) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function mixHex(a, b, t) {
  const pa = parseInt(a.replace('#', ''), 16);
  const pb = parseInt(b.replace('#', ''), 16);
  const r = Math.round((((pa >> 16) & 255) * (1 - t)) + (((pb >> 16) & 255) * t));
  const g = Math.round((((pa >> 8) & 255) * (1 - t)) + (((pb >> 8) & 255) * t));
  const bl = Math.round(((pa & 255) * (1 - t)) + ((pb & 255) * t));
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
