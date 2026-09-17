// Shared furniture for the five universes.

import { boilFrame, drawSprite, bakePlatform } from '../sprites.js';
import { strokeSketch, hexToRgba, softGlow } from '../sketch.js';
import { makeRng, hashSeed } from '../rng.js';
import { staticRect } from '../engine.js';

// A drawn thing with a physics body behind it. Scenery is baked once and
// blitted; the only per-frame cost is the boil frame lookup.
export function piece(sprite, body, opts = {}) {
  return {
    sprite,
    body,
    scale: opts.scale ?? 1,
    boil: opts.boil ?? ((Math.random() * 3) | 0),
    alpha: opts.alpha ?? 1,
    x: opts.x ?? (body ? body.position.x : 0),
    y: opts.y ?? (body ? body.position.y : 0),
    angle: opts.angle ?? (body ? body.angle : 0),
    glow: opts.glow || null,
    glowR: opts.glowR || 0,
  };
}

export function drawPieces(g, list, time) {
  for (const p of list) {
    const x = p.body ? p.body.position.x : p.x;
    const y = p.body ? p.body.position.y : p.y;
    const angle = p.body ? p.body.angle : p.angle;
    if (p.glow && p.glowR) {
      softGlow(g, x, y, p.glowR, p.glow, 0.18);
    }
    drawSprite(g, p.sprite, x, y, angle, p.scale, p.alpha, boilFrame(time, p.boil));
  }
}

// Walls drawn as one long hand-ruled line rather than a baked sprite: cheaper,
// and a wobbling edge reads better than a wobbling rectangle.
// Corners must be subdivided before stroking. strokeSketch smooths through its
// points with quadratic curves, so a four-point rectangle comes out as a
// rounded blob — the corners get eaten. Adding points along each run gives the
// smoothing something straight to follow.
export function subdivide(pts, closed, step = 60) {
  const out = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.round(d / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
}

export function drawEdge(g, pts, seed, opts = {}) {
  const rng = makeRng(hashSeed('edge', seed));
  strokeSketch(g, subdivide(pts, opts.closed ?? false), rng, {
    color: opts.color || '#8C7FB8',
    width: opts.width ?? 2.4,
    passes: opts.passes ?? 1,
    alpha: opts.alpha ?? 0.55,
    closed: opts.closed ?? false,
    spread: 1.6,
  });
}

export function platformPiece(sim, x, y, w, h, seed, opts = {}) {
  const body = staticRect(sim, x, y, w, h, {
    angle: opts.angle || 0,
    restitution: opts.restitution ?? 0.55,
    friction: opts.friction ?? 0.02,
    label: opts.label || 'platform',
  });
  const sprite = bakePlatform(w, h, seed, { color: opts.color });
  return piece(sprite, body, { boil: seed % 3 });
}

export function outsideRect(pos, rect, margin = 0) {
  return (
    pos.x < rect.x - margin ||
    pos.x > rect.x + rect.w + margin ||
    pos.y < rect.y - margin ||
    pos.y > rect.y + rect.h + margin
  );
}

// A hand-drawn ring, used for every arena boundary. Redrawn each frame because
// the boundaries contract, but it is one stroke pass — cheap enough.
export function drawRing(g, cx, cy, r, seed, opts = {}) {
  const rng = makeRng(hashSeed('ring', seed, Math.round(r / 24)));
  const steps = opts.steps || 40;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (1 + rng.wobble(0.008));
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  g.save();
  if (opts.dash) g.setLineDash(opts.dash);
  strokeSketch(g, pts, rng, {
    color: opts.color || '#7E86C8',
    width: opts.width ?? 2.6,
    passes: opts.passes ?? 1,
    alpha: opts.alpha ?? 0.5,
    closed: true,
    spread: 1.2,
  });
  g.restore();
  return pts;
}

export { hexToRgba };
