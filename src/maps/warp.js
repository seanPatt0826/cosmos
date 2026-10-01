// Wormholes — the one with back doors.
//
// Three pairs of doors, scattered around a closing ring. Fall into one and you
// come out of its twin, still carrying whatever speed you had, pointed the way
// you were already going.
//
// The doors are what make it worth watching. An object heading for the edge —
// about to be lost — can drop through a door and reappear safe in the middle.
// The same door, taken a second later at a different angle, spits it out
// straight into the black hole. Nobody is aiming at anything, so which of those
// happens is entirely down to where the traffic pushed you.
//
// Each pair is drawn in its own colour, with a faint tether between the two
// ends, so it is always readable which door leads where.

import { makeRng, hashSeed } from '../rng.js';
import { add } from '../engine.js';
import { drawRing } from './common.js';
import { softGlow, strokeSketch, strokeLine } from '../sketch.js';
import * as Particles from '../particles.js';
import {
  createHole, updateHoles, holeCapturing, drawHoles,
  createStuckWatch,
  createArcFence, drawFence,
} from './hazards.js';

const ARENA = 1280;
const ARENA_MIN = 380;
const CLOSE_AT = 0.8;      // the pressure at which the ring is fully closed
const MOUTH_R = 58;        // how close you must pass to be taken
const COOLDOWN_MS = 560;   // stops a body ping-ponging between the two ends
const EXIT_CLEAR = 40;     // how far beyond the far mouth you are put down

const PAIR_COLOURS = ['#7FE0C8', '#C0A0FF', '#FFC06A'];

export default {
  id: 'warp',
  name: 'Wormholes',
  theme: 'warp',
  population: [20, 28],
  blurb: 'in one side, out the other',
  description: "Three pairs of doors. Fall into one and you come out of its twin, still carrying your speed and pointed the way you were already going. A door can rescue an object about to be lost over the edge, or drop it straight into the black hole. Each pair is tethered in its own colour so you can see where it leads.",

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('warp', seed));
    const bounds = { x: -ARENA, y: -ARENA, w: ARENA * 2, h: ARENA * 2 };

    // Doors are placed as opposed pairs on a jittered ring, so the two ends of
    // a pair are always a long way apart — a door that moved you six inches
    // would not be worth drawing.
    const pairs = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng.wobble(0.5);
      const d = rng.range(0.46, 0.72);
      pairs.push({
        colour: PAIR_COLOURS[i],
        seed: hashSeed('pair', seed, i),
        // Each end drifts on its own slow circle, so the geometry is never the
        // same twice and no route stays reliable for long.
        spin: rng.range(0.00009, 0.00022) * (rng() < 0.5 ? -1 : 1),
        phase: rng.range(0, Math.PI * 2),
        dist: ARENA * d,
        angle: a,
        a: { x: 0, y: 0 },
        b: { x: 0, y: 0 },
      });
    }

    // One well, off to the side. It is not the main threat — the closing ring
    // is — but it gives the doors something cruel to open onto.
    const holes = [createHole(sim, {
      x: Math.cos(rng.range(0, Math.PI * 2)) * ARENA * 0.3,
      y: Math.sin(rng.range(0, Math.PI * 2)) * ARENA * 0.3,
      r: 34,
      seed: hashSeed('warphole', seed),
      drift: 0.3,
      mu: 34 * 190,
      maxAccel: 1.0,
    })];

    const stuckWatch = createStuckWatch();
    const cooldown = new Map();   // body id -> ms left before it can warp again

    function placeMouths(t) {
      for (const p of pairs) {
        const a = p.angle + p.phase + t * p.spin;
        p.a.x = Math.cos(a) * p.dist;
        p.a.y = Math.sin(a) * p.dist;
        p.b.x = -p.a.x;
        p.b.y = -p.a.y;
      }
    }
    placeMouths(0);

    const fence = createArcFence(sim, {
      radius: ARENA,
      // A complete rim, like every other arena. These two used to keep gaps
      // because drifting out was the only way their rounds ended; the wells
      // below do that work now.
      arcs: 4,
      openFrac: 0,
      spin: 0,
      colour: '#8FA8D8',
      seed: hashSeed('fence', seed),
    });

    return {
      bounds,
      time: 0,
      edge: ARENA,
      pairs,

      spawn(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rng.wobble(0.1);
          const d = ARENA * (0.78 + rng.wobble(0.05));
          out.push({
            x: Math.cos(a) * d,
            y: Math.sin(a) * d,
            vx: -Math.sin(a) * rng.range(2, 3.4),
            vy: Math.cos(a) * rng.range(2, 3.4),
          });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        const p = round.pressure;
        const alive = round.alivePlayers();
        const M = sim.Matter;

        // The ring closes early and closes far.
        //
        // With the rim sealed all the way round, nothing leaves, so the arena
        // has to be what runs out. The well below grows into the shrinking
        // space at the same time, which is what actually ends the round: the
        // portals keep working to the last, so the finish is a scramble rather
        // than a slow squeeze.
        this.edge = ARENA - (p / CLOSE_AT) * (ARENA - ARENA_MIN);

        fence.update(dt, this.edge, round.pressure, round.particles);
        placeMouths(this.time);

        updateHoles(holes, dt, p, bounds, round.particles, { grow: 1.05, muGrow: 0.8 });

        for (const [id, left] of cooldown) {
          const next = left - dt;
          if (next <= 0) cooldown.delete(id); else cooldown.set(id, next);
        }

        for (const pl of alive) {
          if (!pl.body) continue;
          if (cooldown.has(pl.body.id)) continue;
          const pos = pl.body.position;

          for (const pair of pairs) {
            const from = near(pos, pair.a) ? pair.a : near(pos, pair.b) ? pair.b : null;
            if (!from) continue;
            const to = from === pair.a ? pair.b : pair.a;

            const v = pl.body.velocity;
            const speed = Math.hypot(v.x, v.y);
            // Keep the direction of travel. A body that was falling inward
            // keeps falling inward — out of the other door.
            const dir = speed > 0.05
              ? { x: v.x / speed, y: v.y / speed }
              : (() => { const a = Math.random() * Math.PI * 2;
                  return { x: Math.cos(a), y: Math.sin(a) }; })();

            Particles.burst(round.particles, from.x, from.y, pair.colour, {
              count: 8, speed: 2.6, ringTo: MOUTH_R * 1.6, ringLife: 420,
            });
            M.Body.setPosition(pl.body, {
              x: to.x + dir.x * (MOUTH_R + EXIT_CLEAR),
              y: to.y + dir.y * (MOUTH_R + EXIT_CLEAR),
            });
            M.Body.setVelocity(pl.body, v);
            Particles.burst(round.particles, to.x, to.y, pair.colour, {
              count: 10, speed: 3.2, ringTo: MOUTH_R * 1.9, ringLife: 520,
            });
            cooldown.set(pl.body.id, COOLDOWN_MS);
            break;
          }
        }

        for (const pl of round.alivePlayers()) {
          const pos = pl.body.position;
          const h = holeCapturing(holes, pos);
          if (h) {
            round.kill(pl, 'hole', { at: pos, target: { x: h.well.x, y: h.well.y } });
            continue;
          }
          if (Math.hypot(pos.x, pos.y) > this.edge) round.kill(pl, 'drift', { at: pos });
        }

        stuckWatch(round.alivePlayers(), dt, (pl) => {
          round.kill(pl, 'boom', { at: pl.body.position });
        });
      },

      drawBack(g) {

        drawFence(g, fence);
        drawRing(g, 0, 0, this.edge, 81, { color: '#8FA8D8', alpha: 0.4, width: 2.8 });
        drawRing(g, 0, 0, this.edge + 16, 82, {
          color: '#8FA8D8', alpha: 0.12, width: 1.4, passes: 1,
        });

        // The tethers. Faint on purpose: they are a hint about where a door
        // goes, not a feature competing with the objects.
        for (const p of pairs) {
          const rng2 = makeRng(hashSeed('tether', p.seed));
          strokeLine(g, p.a, p.b, rng2, {
            color: p.colour, width: 1.1, alpha: 0.10, passes: 1,
          });
        }
      },

      drawFront(g, cam, time) {
        for (const p of pairs) {
          for (const mouth of [p.a, p.b]) {
            softGlow(g, mouth.x, mouth.y, MOUTH_R * 2.1, p.colour, 0.17);
            // Two rings turning against each other, which is the cheapest way
            // to make a hole in space look like it is doing something.
            for (let k = 0; k < 2; k++) {
              const spin = time * (k === 0 ? 0.0006 : -0.0009);
              const rr = MOUTH_R * (k === 0 ? 1 : 0.68);
              const rng3 = makeRng(hashSeed('mouth', p.seed, k));
              const pts = [];
              const seg = 26;
              for (let i = 0; i < seg; i++) {
                const a = (i / seg) * Math.PI * 2 + spin;
                const w = rr * (1 + rng3.wobble(0.07));
                pts.push({ x: mouth.x + Math.cos(a) * w, y: mouth.y + Math.sin(a) * w });
              }
              strokeSketch(g, pts, rng3, {
                color: p.colour, width: k === 0 ? 2.2 : 1.4, passes: 2,
                alpha: k === 0 ? 0.62 : 0.4, closed: true, spread: 1.3,
              });
            }
          }
        }
        drawHoles(g, holes, time);
      },
    };
  },
};

function near(pos, mouth) {
  return Math.hypot(pos.x - mouth.x, pos.y - mouth.y) < MOUTH_R;
}
