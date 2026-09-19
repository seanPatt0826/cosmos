// Deep space, hand-made.
//
// One flat wash per universe. Nothing is baked, nothing is blitted, and the
// whole background costs two fillRects a frame.
//
// It used to bake two overscanned canvases — nebula smudges, pencil stars, ink
// sparkles, grain — and draw both of them, each 1.5x the window, before
// anything else happened in the frame. That was the single largest cost in the
// renderer and the reason the game felt heavy. The layered version has been
// removed rather than left behind a flag, so it cannot quietly come back; it
// is in the git history if the artwork is ever wanted again.

import { hexToRgba } from './sketch.js';
import { isLight } from './theme.js';

export const THEMES = {
  garden: { wash: ['#4A1F5E', '#7A2A63', '#241640'], deep: '#0A0616' },
  orbit: { wash: ['#1E3A6E', '#245F73', '#18265C'], deep: '#060A18' },
  belt: { wash: ['#5A3A24', '#6E4630', '#2A2038'], deep: '#0C0812' },
  binary: { wash: ['#6E3A2A', '#2A4A7A', '#5A2E6E'], deep: '#0A0712' },
  bumpers: { wash: ['#6B2A5E', '#3A2A7A', '#7A3A4E'], deep: '#0B0618' },
  // Scorched: the sky of a room with something far too bright in it.
  nova: { wash: ['#8A3418', '#C26A22', '#3E1830'], deep: '#120608' },
  // Cold and glassy: the sky of a place with holes cut in it.
  warp: { wash: ['#1D4A5E', '#2E6E6A', '#3A3A7E'], deep: '#060E16' },
};

// Daytime. Not the dark palette lightened — a different drawing: a cool sheet
// of paper with pale pastel washes.
export const LIGHT_THEMES = {
  garden: { wash: ['#C4A2D8', '#DDA6C6', '#B4A0D4'], deep: '#EAE1D8' },
  orbit: { wash: ['#A8C0E4', '#A6CBD6', '#B0BCE6'], deep: '#E4E6DC' },
  belt: { wash: ['#DCBFA2', '#D6B49C', '#C0B4CE'], deep: '#EDE5D6' },
  binary: { wash: ['#E4BCA2', '#A8BEE0', '#CEA8DC'], deep: '#EDE5D6' },
  bumpers: { wash: ['#DCA8D2', '#B0A8E0', '#E0AABC'], deep: '#EBE2D8' },
  nova: { wash: ['#F0B894', '#E8C49A', '#D2A8BE'], deep: '#F0E7DA' },
  warp: { wash: ['#A6CBD8', '#A8D6CE', '#B4B4DE'], deep: '#E2EAE6' },
};

export function createBackground(w, h, seed, themeKey) {
  const set = isLight() ? LIGHT_THEMES : THEMES;
  const theme = set[themeKey] || set.garden;
  const top = theme.deep;
  const base = theme.wash[0];

  return {
    theme,
    w,
    h,
    // The pan arguments the renderer passes are ignored: with no parallax
    // layers there is nothing to move, and the wash is the same everywhere.
    draw(ctx) {
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
      g.addColorStop(0, hexToRgba(base, isLight() ? 0.5 : 0.28));
      g.addColorStop(1, hexToRgba(top, 1));
      ctx.fillStyle = theme.deep;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    },
  };
}
