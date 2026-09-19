// Shared drawing for the arenas.
//
// This file used to carry scenery helpers too — platform pieces, sprite blitting
// for placed objects, rectangle bounds checks. All of that existed for the two
// maps built around falling, and went with them.

import { strokeSketch } from '../sketch.js';
import { makeRng, hashSeed } from '../rng.js';

// Corners must be subdivided before stroking. strokeSketch smooths through its
// points with quadratic curves, so a four-point rectangle comes out as a
// rounded blob — the corners get eaten. Adding points along each run gives the
// smoothing something straight to follow.
function subdivide(pts, closed, step = 60) {
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

// A wall or arena edge, drawn as one long hand-ruled line.
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

// A hand-drawn ring, used for every circular arena boundary. Redrawn each frame
// because the boundaries contract, but it is one stroke pass — cheap enough.
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
