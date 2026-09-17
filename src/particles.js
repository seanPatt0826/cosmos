// Particles, drawn like everything else: ticks, scribbles and wobbly rings
// rather than soft round sprites.
//
// These are cheap and live in world space, so they survive camera moves.

import { makeRng } from './rng.js';
import { hexToRgba } from './sketch.js';

export function createParticles() {
  return { items: [], seed: 1 };
}

function push(sys, p) {
  p.seed = sys.seed++;
  p.life = 0;
  sys.items.push(p);
  // A hard ceiling, so a pile-up of eliminations can never tank the frame rate.
  if (sys.items.length > 700) sys.items.splice(0, sys.items.length - 700);
}

export function burst(sys, x, y, col, opts = {}) {
  const n = opts.count ?? 14;
  const speed = opts.speed ?? 2.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const s = speed * (0.4 + Math.random() * 1.1);
    push(sys, {
      kind: 'tick',
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      maxLife: (opts.maxLife ?? 700) * (0.6 + Math.random() * 0.7),
      col,
      size: (opts.size ?? 5) * (0.6 + Math.random() * 0.9),
      drag: opts.drag ?? 0.965,
    });
  }
  if (opts.ring !== false) {
    push(sys, {
      kind: 'ring', x, y, vx: 0, vy: 0,
      maxLife: opts.ringLife ?? 620,
      col,
      size: opts.ringFrom ?? 6,
      grow: opts.ringTo ?? 52,
    });
  }
}

export function scribble(sys, x, y, col, size, life = 520) {
  push(sys, { kind: 'scribble', x, y, vx: 0, vy: 0, maxLife: life, col, size });
}

export function unravel(sys, x, y, cx, cy, col, count = 7, alpha = 1) {
  // Strands of the object's own linework, peeling off toward the singularity.
  for (let i = 0; i < count; i++) {
    const a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 1.4;
    const r = Math.hypot(x - cx, y - cy);
    push(sys, {
      kind: 'strand',
      x, y, cx, cy, col,
      r0: r * (0.85 + Math.random() * 0.4),
      a0: a,
      spin: (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 2.4),
      maxLife: 620 + Math.random() * 380,
      alpha,
      size: 1.4 + Math.random() * 1.6,
      vx: 0, vy: 0,
    });
  }
}

export function puff(sys, x, y, col, n = 6) {
  for (let i = 0; i < n; i++) {
    push(sys, {
      kind: 'dot',
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8 - 0.3,
      maxLife: 900 + Math.random() * 600,
      col,
      size: 1.5 + Math.random() * 2.5,
      drag: 0.99,
    });
  }
}

export function update(sys, dtMs) {
  const items = sys.items;
  for (let i = items.length - 1; i >= 0; i--) {
    const p = items[i];
    p.life += dtMs;
    if (p.life >= p.maxLife) {
      items.splice(i, 1);
      continue;
    }
    const f = dtMs / 16.667;
    if (p.kind === 'strand') {
      p.a0 += p.spin * 0.012 * f;
      p.r0 *= Math.pow(0.978, f);
    } else {
      p.x += p.vx * f;
      p.y += p.vy * f;
      if (p.drag) {
        const d = Math.pow(p.drag, f);
        p.vx *= d;
        p.vy *= d;
      }
    }
  }
}

export function draw(sys, ctx) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const p of sys.items) {
    const t = p.life / p.maxLife;
    const a = 1 - t * t;
    const rng = makeRng(p.seed);

    if (p.kind === 'tick') {
      // A short pencil tick flying along its own direction of travel.
      const len = p.size * (1 - t * 0.5);
      const ang = Math.atan2(p.vy, p.vx);
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = p.col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
      ctx.stroke();
    } else if (p.kind === 'dot') {
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'ring') {
      const r = p.size + (p.grow - p.size) * (1 - Math.pow(1 - t, 2));
      ctx.globalAlpha = a * 0.6;
      ctx.strokeStyle = p.col;
      ctx.lineWidth = 2 * (1 - t) + 0.6;
      ctx.beginPath();
      // Wobbly, because a perfect expanding circle would be the only
      // machine-drawn thing on screen.
      const seg = Math.max(18, Math.round(r / 3));
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * Math.PI * 2;
        const rr = r * (1 + rng.wobble(0.07));
        const x = p.x + Math.cos(ang) * rr;
        const y = p.y + Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (p.kind === 'scribble') {
      // Crossed out, the way you cross something out in a notebook.
      const prog = Math.min(1, t * 2.2);
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.col;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      const n = 9;
      for (let k = 0; k <= n * prog; k++) {
        const u = k / n;
        const x = p.x + (u - 0.5) * p.size * 2.1 + rng.wobble(p.size * 0.2);
        const y = p.y + (k % 2 ? -1 : 1) * p.size * 0.62 + rng.wobble(p.size * 0.2);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (p.kind === 'strand') {
      ctx.globalAlpha = a * 0.85 * (p.alpha ?? 1);
      ctx.strokeStyle = p.col;
      ctx.lineWidth = p.size * (1 - t * 0.6);
      ctx.beginPath();
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        // The strand trails behind itself along the spiral, stretching as it
        // is drawn inward.
        const ang = p.a0 + u * 1.5 * (1 + t * 2);
        const rr = p.r0 * (1 - u * 0.55);
        const x = p.cx + Math.cos(ang) * rr;
        const y = p.cy + Math.sin(ang) * rr;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}


export { hexToRgba };
