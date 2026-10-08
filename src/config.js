// Every tunable in one place.

// ── Look ────────────────────────────────────────────────────────────────────
//
// The art direction resolves a tension worth writing down. "Pencil and crayon
// on paper" wants a light ground; "deep space" wants a dark one. Drawing
// graphite lines straight onto navy would make them invisible, and chalk-on-
// black loses the sketchbook read.
//
// So each object is a little scrap of paper: a warm off-white base, crayon
// hatching over it, a dark graphite outline around it, and a coloured glow
// bleeding out into the void. Unmistakably hand-drawn, and it pops against
// deep space instead of disappearing into it.

export const PAPER = '#F2EADB';
export const PAPER_SHADE = '#DCD1BC';
export const GRAPHITE = '#2A2731';
export const GRAPHITE_SOFT = 'rgba(42, 39, 49, 0.55)';

export const SPACE = {
  deep: '#080714',
  mid: '#0E0C20',
  horizon: '#151033',
};

// Crayons a child would actually reach for. No harsh reds, no pure white.
export const PALETTE = [
  { name: 'amber', crayon: '#E8A33D', glow: '#FFC66B' },
  { name: 'apricot', crayon: '#EE8E5A', glow: '#FFB489' },
  { name: 'rose', crayon: '#E0728C', glow: '#FF9FB3' },
  { name: 'blush', crayon: '#EFA0B4', glow: '#FFC4D2' },
  { name: 'orchid', crayon: '#C77BD6', glow: '#E4A8EE' },
  { name: 'violet', crayon: '#9B8AE6', glow: '#BFB2FF' },
  { name: 'periwinkle', crayon: '#7EA2F0', glow: '#A8C4FF' },
  { name: 'sky', crayon: '#6EC6E8', glow: '#9BE1FF' },
  { name: 'teal', crayon: '#57C4B4', glow: '#8AE5D6' },
  { name: 'seafoam', crayon: '#7FD6A5', glow: '#AAF0C9' },
  { name: 'moss', crayon: '#A8CE6C', glow: '#CBE894' },
  { name: 'butter', crayon: '#F2D06B', glow: '#FFE79B' },
  { name: 'clay', crayon: '#D08A6A', glow: '#F0AF92' },
  { name: 'lilac', crayon: '#B9A3E8', glow: '#D6C7FF' },
];

export const ARCHETYPES = ['sun', 'ufo', 'moon', 'ringed', 'capsule', 'comet'];

// ── Hand-drawn rendering ────────────────────────────────────────────────────

export const SKETCH = {
  // Vertices used to approximate a circle. Low enough that the polygon reads as
  // a hand-drawn "round-ish" shape rather than a machined one.
  circleSteps: 22,
  // How far each vertex strays from true, as a fraction of radius.
  wobble: 0.055,
  // Times the same path is re-stroked. Two or three passes is what makes a line
  // look gone-over rather than plotted.
  passes: 3,
  passOffset: 0.9,
  // Strokes running past the corner they end on: the giveaway of a real hand.
  overshoot: 0.06,
  hatchSpacing: 4.2,
  hatchInset: 2.0,
  // Distinct drawings of each object, cycled to make the linework wriggle.
  boilFrames: 3,
  boilFps: 7.5,
  // Sprites are baked at this multiple of their on-screen size so a camera
  // push-in during the finale does not reveal soft edges.
  spriteScale: 1.4,
};

// ── Bodies ──────────────────────────────────────────────────────────────────

export const BODY = {
  radius: 18,
  restitution: 0.72,
  friction: 0.008,
  frictionStatic: 0.02,
  // Space has no air. Matter's default drag would kill every orbit.
  frictionAir: 0,
  density: 0.0016,
  trailPoints: 22,
  trailSampleMs: 26,
  // Trails are capped by distance, not just by point count: a body falling at
  // full tilt would otherwise drag a streak across the entire screen.
  trailMaxLen: 250,
};

// ── Round pacing ────────────────────────────────────────────────────────────

export const ROUND = {
  countdownMs: 2600,
  winnerMs: 4200,
  fadeMs: 900,
  // Tightening starts after this and ramps to full over the ramp window.
  calmMs: 12000,
  rampMs: 55000,
  // Hard ceiling. Past this the pressure escalates sharply until it resolves.
  desperateMs: 95000,
  finalCallout: 3,
};

// ── Camera ──────────────────────────────────────────────────────────────────

export const CAMERA = {
  ease: 0.055,
  zoomEase: 0.035,
  padding: 155,
  // Low enough that the whole arena fits the stage.
  //
  // This was 0.35, which is above the zoom every arena needs to fit beside a
  // two-column rail — 0.23 for Bumper Field, 0.31 for the tightest. The floor
  // won, so the ring was drawn wider than the stage and its right-hand arc
  // passed behind the panels. A rim that goes all the way round is no use if
  // a third of it is underneath something.
  minZoom: 0.2,
  maxZoom: 2.1,
  // Extra push-in once the population is small, so the finale reads close.
  finaleZoom: 1.55,
};

// ── Background ──────────────────────────────────────────────────────────────
//
// There is no longer a setting here. The background is one flat wash, always.
// The switchable 'full' version — drifting nebulae, pencil stars, parallax —
// blitted two canvases the size of the window (times 1.5 overscan) before
// anything else in every frame, and was the single biggest cost in the
// renderer. A one-word flag that could put that back is not a fix, so the code
// behind it has been deleted; see background.js, and git history for the
// artwork.

// ── Physics loop ────────────────────────────────────────────────────────────

export const SIM = {
  stepMs: 1000 / 60,
  maxStepsPerFrame: 5,
};

// ── Advertising ─────────────────────────────────────────────────────────────
//
// Flip ADS_ENABLED once AdSense has approved the site. Until then the rail
// still reserves its space, so switching it on never shifts the layout.

export const ADS_ENABLED = false;
export const ADSENSE_CLIENT = 'ca-pub-0000000000000000';
export const ADSENSE_SLOT = '0000000000';
