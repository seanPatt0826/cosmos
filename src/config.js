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
  // 40, up from 18 and then 32, so a racer can be picked out at a glance.
  // Measured over 15 seeded rounds a universe at 18, 32 and 40: medians
  // stayed within the run-to-run noise and nothing stalled, so the pacing
  // tuning still holds.
  radius: 40,
  // Every racer is drawn this much larger than the circle it collides as, so
  // the icons read at the zoom that shows a whole universe.
  drawScale: 1.1,
  // Racers who wear the same icon are drawn at these sizes in turn (first
  // one, second one, ...), so two aliens can be told apart at a glance. Only
  // the drawing changes; every body still collides as the same circle. The
  // smallest, 0.88 x 1.1 x 40, is still a fifth bigger than racers were at 32.
  twinScales: [1, 1.25, 0.88, 1.15, 0.94, 1.32],
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
  // While the mini map is steering the camera; see camera.js.
  aimEase: 0.3,
  // How much world the arena holds while it is being steered from the mini map.
  aimSpan: 1100,
  // When someone still in the race is within this many screen pixels of the
  // edge (or past it), the camera eases this much faster to keep them in.
  catchUpMargin: 40,
  catchUpEase: 0.16,
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

// Paying to remove the ads. ADFREE_LINK is a Stripe Payment Link, set up in
// the Stripe dashboard with its "after payment" redirect pointing at
//   https://cosmosroulette.com/?adfree_session={CHECKOUT_SESSION_ID}
// The payment is then confirmed by worker/index.js on Cloudflare, which needs
// the STRIPE_SECRET_KEY secret (see that file). Left empty, the lock
// button still shows the offer but says payments open soon.
// ADFREE_PRICE is only what the button says; it must match the link's price.
export const ADFREE_LINK = '';
export const ADFREE_PRICE = '₩3,000';
