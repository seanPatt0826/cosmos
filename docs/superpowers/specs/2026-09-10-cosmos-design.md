# COSMOS — Design Spec

**Date:** 2026-09-10
**Status:** Approved for implementation
**Working title:** Cosmos (changeable)

## 1. What it is

A cozy browser toy. Fifteen to thirty little hand-drawn celestial objects are
released into a physics playground and knocked out one by one until a single
survivor remains. Then it fades into a different universe and does it again,
forever, with nobody having to touch anything.

The viewer is not a player. There are no names, no picks, no score. It is a
space screensaver with stakes, built out of a real rigid-body simulation.

### Design pillars

1. **It runs itself.** A universe is already in motion when the page paints.
   Every control is optional and hidden until the mouse moves.
2. **The physics is the entertainment.** Nothing is scripted or rigged. Every
   near-miss and every last-second capture falls out of the simulation.
3. **Rough drawings, smooth motion.** Everything looks pencil-and-crayon on
   paper; everything moves at a fluid 60fps. That contrast is the whole look.
4. **No numbers.** The only readout is how many are left.

## 2. Art direction

A child's sketchbook came to life in outer space.

The background stays a genuinely beautiful deep-space scene — layered nebulae,
drifting stars, soft colour. Every gameplay object, though, looks drawn by hand:
imperfect outlines, visible pencil strokes, crayon hatching that does not quite
reach the edges, paper grain.

### Rules that make it read as handmade

- **Imperfection is seeded, never random per frame.** Each body owns a seeded
  PRNG. Its wobble is *its* wobble and never changes. Re-randomising per frame
  across thirty objects would shimmer like television static.
- **No perfect circles.** Every shape is a polygon with per-vertex radial noise.
- **Lines are drawn more than once.** The same wobbly path is re-stroked two or
  three times at small offsets with varying width and partial alpha. Stroke ends
  overshoot past corners. Graphite is a warm dark grey (`#2E2B33`), never black.
- **Fills are crayon.** Uneven diagonal hatching clipped to the shape, varying
  stroke length and pressure, deliberately stopping short of the outline so the
  paper shows through. A grain pattern multiplied over the top.
- **Boil.** Each object is drawn into three slightly different variants, cycled
  at ~8fps so linework wriggles the way hand-drawn animation does. Boil is
  strongest on scenery and slow bodies, damped on fast movers, which are already
  supplying motion.
- **Glow survives, but grainy.** Suns and event horizons still bleed light; it
  is a smudged crayon halo, not a lens bloom.
- **Paper unifies.** A faint fibre grain sits over the whole screen at ~5%, so
  the drawings sit inside the scene instead of floating on it.

Typography is Shantell Sans, a real hand-drawn variable face.

## 3. The round

### Flow

1. Objects fade in and hang suspended. Three-second countdown.
2. Release. Physics takes over.
3. Eliminations accumulate. The HUD counts down.
4. At three remaining the camera tightens; the HUD reads **Final 3**.
5. One survives. Slow bloom of light. **WINNER**. Four seconds.
6. Cross-fade into the next universe. Automatically.

Measured length across every map is 30–100 seconds, most rounds landing near a
minute.

### Tightening — the termination guarantee

Two objects can orbit each other forever, and an ambient toy that never resolves
is broken. Every map therefore has an escalating pressure on a timer that makes
survival strictly harder as the round ages. It guarantees a winner and doubles
as the drama.

A hard ceiling backs it up: past 95 seconds the tightening ramps sharply until
the population resolves.

Two failures found while tuning are worth recording, because both produced
rounds that could never end:

- In Cosmic Pinball, a widened drain still left a survivable strip of floor
  between its edge and the central well's reach. A body that settled there
  lived forever. Past full pressure the entire floor now gives way.
- Also in Pinball, a wormhole pair could form a perpetual elevator: fall into
  the lower mouth, emerge from the upper one, repeat. The exit is now offset
  along the body's own heading so it leaves the far mouth rather than
  materialising inside it, and the pair collapses once the round has run long.

A last-resort backstop in `round.js` covers whatever else the simulation
invents: past four minutes, the stillest surviving object is let go every five
seconds. It should never run, and does not in any measured round.

### HUD

`Players remaining: 17`, low-contrast, in a corner. It becomes `Final 3`, then
`WINNER`. Nothing else. No score, no combo, no XP, no damage numbers.

### Camera

Auto-frames the surviving population with eased motion, tightening as the count
drops, so the finale becomes a close-up without a cut. Slight bias toward
clusters and near-misses. Never cuts, only drifts.

### Controls

A thin strip that fades out after a few seconds without mouse movement:

| Control | Effect |
| --- | --- |
| Universe picker | Jump to a specific map |
| Play / pause | Freeze the simulation |
| Time scale | 0.5× / 1× / 2× |
| Mute | Toggle audio (starts muted) |
| Skip | Abandon the round, start the next |

## 4. The objects

Six archetypes, drawn procedurally as simple vector shapes with a coloured glow:

little sun · UFO · moon · ringed planet · capsule · comet

Big readable silhouettes, no fine detail — thirty may be on screen at once. Each
gets a distinct hue from a curated cozy palette: warm ambers, soft teals, dusty
roses, pale violets. No harsh reds, no pure white.

All bodies are physically circles regardless of drawn shape. Uniform collision
behaviour keeps the simulation readable and fair; the drawing is decoration.

## 5. The universes

Population is 20–32, chosen per map.

*Two maps built around falling — Cosmic Drop, a vertical shaft, and Cosmic
Pinball — were built, then removed at the owner's request and later deleted
outright. The notes below on rounds that could never end came from Pinball and
are kept because the lessons outlived the map.*

### Black Hole Garden

An open arena with bouncy walls and three to six inverse-square gravity wells,
some of them drifting. Momentum can carry a body out of a well's pull.

- **Elimination:** crossing an event horizon.
- **Tightening:** horizons grow; wells drift toward the centre.

### Orbital Arena

A circular arena with a massive central planet and a few moons. Bodies enter
orbit and collisions perturb each other's trajectories.

- **Elimination:** burning up on the planet, or being flung past the boundary
  ring.
- **Tightening:** the ring contracts; the planet's mass creeps upward so every
  orbit slowly decays.

### Asteroid Belt

An open field of drifting asteroids of varied mass. No ambient gravity, so
everything is collision chaos and chain reactions.

- **Elimination:** ejected past the boundary.
- **Tightening:** the boundary contracts; asteroids get faster and more numerous.

### Binary Stars

Two heavy suns circling a barycentre. Two moving masses give a chaotic field:
passing behind a star at the wrong moment flings a body across the arena.

- **Elimination:** burning up on either star, capture by an outlying well, or
  being flung past the boundary ring.
- **Tightening:** the pair spirals together and gains mass; the ring contracts.

### Bumper Field

No gravity and no orbits. A field of repulsors and a closing boundary, where
nothing slows down so one good hit keeps paying out.

- **Elimination:** ejected past the boundary, or into one of the wells.
- **Tightening:** the boundary contracts; the wells grow.

### Elimination effects

Never violent. A black hole capture unravels the object's outlines into
stretching pencil strokes that spiral inward. Other eliminations scribble the
object out, the way you cross something out in a notebook. Each is a soft chime
and a small ring of particles.

## 6. Architecture

### Stack

Static site. Vanilla ES modules, no build step, no bundler, no framework, no
backend. Matter.js 0.19.0 from cdnjs for rigid-body physics. Canvas 2D for
rendering. Web Audio for sound. Deploys to Vercel as-is.

Matter.js handles restitution, rotating bodies, sensors and collision events.
Gravity wells are custom forces applied per tick.

### Files

```
cosmos/
├── index.html          markup, ad rail, canvas
├── about.html
├── privacy.html
└── src/
    ├── main.js         boot, resize, master loop, controls
    ├── config.js       every tunable in one place
    ├── rng.js          seeded PRNG
    ├── sketch.js       hand-drawn primitives
    ├── sprites.js      baked drawings and boil frames
    ├── background.js   stars and nebula washes
    ├── engine.js       Matter world, gravity wells, orbital helpers
    ├── bodies.js       archetypes, palette, trails
    ├── particles.js
    ├── camera.js
    ├── renderer.js     per-frame compositing
    ├── audio.js
    ├── hud.js
    ├── ads.js          AdSense slot, behind ADS_ENABLED
    ├── round.js        state machine
    └── maps/
        ├── index.js
        ├── common.js   shared scenery and edge drawing
        ├── drop.js
        ├── garden.js
        ├── orbit.js
        ├── belt.js
        └── pinball.js
```

### Map contract

Each map module exports one object:

```js
{
  id, name,
  population: [min, max],
  build(api) -> {
    bounds,              // world-space rect the camera may roam
    spawn(n) -> points,  // where bodies start
    update(dt, round),   // move scenery, apply tightening
    drawBack(g, cam),    // scenery behind bodies
    drawFront(g, cam),   // scenery in front of bodies
  }
}
```

Adding a sixth universe means dropping in one file.

### Render layers

1. **Background** — stars, nebulae. Redrawn on resize or map change, blitted with
   camera transform for parallax.
2. **Scenery back** — baked per map, redrawn only when tightening changes it.
3. **Trails** — per-body world-space point history, redrawn each frame as a
   tapering scratchy line. *Not* a fading screen-space layer: that would smear
   sideways whenever the camera pans, and a soft gradient smear is the wrong
   aesthetic.
4. **Bodies** — blitted from cached sprites with rotation.
5. **Particles**, **scenery front**, then **paper grain** and vignette.

### Loop

A fixed 60Hz physics accumulator decoupled from rendering. Time scaling changes
steps-per-frame, never the timestep, so the simulation stays stable and
identical at any speed.

### Performance

Hatching and multi-pass strokes are far too expensive to run live for thirty
objects at 60fps. Every object is rendered once into a small offscreen canvas
per boil frame — roughly ninety tiny sprites — and blitted thereafter. Scenery
bakes once per map. The per-frame loop is compositing plus trails plus
particles.

Target: 60fps at 30 bodies and ~400 particles on a mid-range laptop.

## 7. Audio

Entirely synthesised through the Web Audio API. No files, no licensing, nothing
to download.

- A soft sine-pad drone underneath, drifting between a few chord voicings.
- A gentle bell on collision, pitched by impact energy.
- A descending sweep on black-hole capture.
- A slow bloom on the winner.

**Muted by default**, with a small speaker toggle. Browsers block autoplay audio
regardless, and a toy that starts humming unbidden gets its tab closed.

## 8. Advertising

A single 300×250 unit in a rail beside the arena. The arena never goes
fullscreen; the rail is part of the console frame.

- Space reserved from first paint. An ad slot that pops in and shoves the arena
  sideways is exactly the jank that kills a cozy feel.
- Degrades to reserved-but-empty when AdSense is unapproved or blocked.
- One `ADS_ENABLED` flag in `config.js` controls the whole thing.
- On narrow screens the rail moves below the arena.

`about.html` and `privacy.html` are adapted from Centrifuge's, rewritten for
this app, retaining the advertising and cookies section for AdSense review.

## 9. Out of scope

Scores, XP, accounts, multiplayer, a backend, persistence, saved settings,
leaderboards, unlockables, and any build step.
