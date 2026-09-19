// Deep space, hand-made.
//
// The background is the one place the game is allowed to be genuinely pretty
// rather than scruffy — but it still joins the style: nebulae are smudged
// crayon washes, and stars are pencil dots and little ink sparkles rather than
// clean points.
//
// Baked to two offscreen layers and blitted with parallax. Redrawn only on
// resize or a change of universe.

import { SPACE } from './config.js';
import { makeRng, hashSeed } from './rng.js';
import { applyGrain, hexToRgba } from './sketch.js';
import { isLight } from './theme.js';

export const THEMES = {
  garden: { wash: ['#4A1F5E', '#7A2A63', '#241640'], deep: '#0A0616' },
  orbit: { wash: ['#1E3A6E', '#245F73', '#18265C'], deep: '#060A18' },
  belt: { wash: ['#5A3A24', '#6E4630', '#2A2038'], deep: '#0C0812' },
  binary: { wash: ['#6E3A2A', '#2A4A7A', '#5A2E6E'], deep: '#0A0712' },
  bumpers: { wash: ['#6B2A5E', '#3A2A7A', '#7A3A4E'], deep: '#0B0618' },
};

// Daytime. Not the dark palette lightened — a different drawing: a cool sheet
// of paper with pale pastel washes and stars put in with a sharp pencil.
export const LIGHT_THEMES = {
  garden: { wash: ['#C4A2D8', '#DDA6C6', '#B4A0D4'], deep: '#EAE1D8' },
  orbit: { wash: ['#A8C0E4', '#A6CBD6', '#B0BCE6'], deep: '#E4E6DC' },
  belt: { wash: ['#DCBFA2', '#D6B49C', '#C0B4CE'], deep: '#EDE5D6' },
  binary: { wash: ['#E4BCA2', '#A8BEE0', '#CEA8DC'], deep: '#EDE5D6' },
  bumpers: { wash: ['#DCA8D2', '#B0A8E0', '#E0AABC'], deep: '#EBE2D8' },
};

const PARALLAX_FAR = 0.055;
const PARALLAX_NEAR = 0.15;
const OVERSCAN = 1.5;

function layerCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w));
  c.height = Math.max(2, Math.ceil(h));
  return c;
}

function drawWash(ctx, rng, w, h, theme) {
  const light = isLight();

  ctx.fillStyle = theme.deep;
  ctx.fillRect(0, 0, w, h);

  if (!light) {
    // A slow vertical shift from deep to slightly warmer, so the field is never
    // a flat black rectangle.
    const base = ctx.createLinearGradient(0, 0, w * 0.3, h);
    base.addColorStop(0, hexToRgba(SPACE.horizon, 0.55));
    base.addColorStop(0.5, hexToRgba(SPACE.mid, 0.35));
    base.addColorStop(1, hexToRgba(SPACE.deep, 0.7));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
  }

  // Nebulae: big soft smudges, several overlapping. Additive on dark; plain
  // washes on paper, where "lighter" would only bleach the sheet.
  ctx.save();
  if (!light) ctx.globalCompositeOperation = 'lighter';
  const clouds = rng.int(7, 10);
  for (let i = 0; i < clouds; i++) {
    const cx = rng.range(-0.1, 1.1) * w;
    const cy = rng.range(-0.1, 1.1) * h;
    const r = rng.range(0.18, 0.5) * Math.max(w, h);
    const col = rng.pick(theme.wash);
    // Each cloud is a few offset blobs rather than one clean circle, which is
    // what stops it reading as a radial gradient.
    const blobs = rng.int(3, 6);
    for (let b = 0; b < blobs; b++) {
      const bx = cx + rng.wobble(r * 0.45);
      const by = cy + rng.wobble(r * 0.45);
      const br = r * rng.range(0.4, 1);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      const peak = light ? rng.range(0.16, 0.3) : rng.range(0.1, 0.22);
      g.addColorStop(0, hexToRgba(col, peak));
      g.addColorStop(0.45, hexToRgba(col, peak * 0.45));
      g.addColorStop(1, hexToRgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawStars(ctx, rng, w, h, count, opts = {}) {
  const big = opts.big ?? false;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const a = rng.range(0.25, 0.95) * (isLight() ? 0.62 : 1);
    const tint = rng.range(0, 1);
    // On paper a star is a pencil dot, not a spark of light.
    const col = isLight()
      ? (tint > 0.85 ? '#8A7C68' : tint > 0.7 ? '#6E7890' : '#5E5A66')
      : (tint > 0.85 ? '#FFD9A8' : tint > 0.7 ? '#BFD6FF' : '#F2EADB');

    if (big && rng() < 0.3) {
      // A four-point ink sparkle: two crossed strokes, drawn by hand so the
      // arms are uneven.
      const s = rng.range(2.4, 6);
      ctx.globalAlpha = a;
      ctx.strokeStyle = col;
      ctx.lineWidth = rng.range(0.7, 1.3);
      ctx.beginPath();
      ctx.moveTo(x - s * rng.range(0.7, 1), y);
      ctx.lineTo(x + s * rng.range(0.7, 1), y);
      ctx.moveTo(x, y - s * rng.range(0.7, 1));
      ctx.lineTo(x, y + s * rng.range(0.7, 1));
      ctx.stroke();
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, rng.range(0.8, 1.6), 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    } else {
      // A pencil dot: pressed, not plotted.
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, y, rng.range(0.5, big ? 2.1 : 1.2), rng.range(0.5, big ? 1.8 : 1.2), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function createBackground(w, h, seed, themeKey) {
  const set = isLight() ? LIGHT_THEMES : THEMES;
  const theme = set[themeKey] || set.garden;
  const bw = w * OVERSCAN;
  const bh = h * OVERSCAN;

  const far = layerCanvas(bw, bh);
  const fctx = far.getContext('2d');
  const rng = makeRng(hashSeed('bg', seed, themeKey));
  drawWash(fctx, rng, bw, bh, theme);
  drawStars(fctx, rng, bw, bh, Math.round((bw * bh) / 5200));
  applyGrain(fctx, bw, bh, 0.28);

  const near = layerCanvas(bw, bh);
  const nctx = near.getContext('2d');
  drawStars(nctx, rng, bw, bh, Math.round((bw * bh) / 26000), { big: true });

  return {
    far,
    near,
    theme,
    w,
    h,
    // `pan` is a normalised -1..1 position derived from the camera, so parallax
    // stays inside the overscan and never exposes an edge.
    draw(ctx, panX, panY) {
      const slackX = (bw - w) / 2;
      const slackY = (bh - h) / 2;
      const px = clamp(panX, -1, 1);
      const py = clamp(panY, -1, 1);
      ctx.drawImage(far, -slackX - px * slackX * (PARALLAX_FAR / 0.055) * 0.55, -slackY - py * slackY * 0.55);
      ctx.drawImage(near, -slackX - px * slackX * (PARALLAX_NEAR / 0.055) * 0.16, -slackY - py * slackY * 0.16);
    },
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
