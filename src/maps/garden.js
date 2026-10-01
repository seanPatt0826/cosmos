// Black Hole Garden — the one that hunts you.
//
// An open room with bouncy walls and a handful of wells. Momentum can carry a
// body straight through a well's pull, which is the whole pleasure of the map:
// half the arena is always in the middle of a near miss.
//
// The nebula patches and pulsars exist to make the space *between* the holes
// worth watching. A patch robs you of the speed you needed to escape; a pulsar
// can throw you clear at the last second.

import { makeRng, hashSeed } from '../rng.js';
import { staticRect, add } from '../engine.js';
import { drawEdge } from './common.js';
import {
  createHole, updateHoles, holeCapturing, drawHoles,
  createNebula, applyNebula, drawNebula,
  createPulsar, updatePulsars, drawPulsars,
  createComet, updateComets, drawComets,
  createStuckWatch,
} from './hazards.js';

const W = 2650;
const H = 1700;

export default {
  id: 'garden',
  name: 'Black Hole Garden',
  theme: 'garden',
  population: [22, 30],
  blurb: 'mind the holes',
  description: "An open room with a few black holes wandering about in it. Fall into one and you are gone. The nebula patches bleed off the speed you needed to escape, and the pulsars can throw you clear at the last second. The holes creep toward the middle as the round ages, narrowing the safe lanes.",

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('garden', seed));
    const half = { w: W / 2, h: H / 2 };
    const bounds = { x: -half.w, y: -half.h, w: W, h: H };

    const wallOpts = { restitution: 1.0, friction: 0 };
    add(sim,
      staticRect(sim, 0, -half.h - 40, W + 200, 80, wallOpts),
      staticRect(sim, 0, half.h + 40, W + 200, 80, wallOpts),
      staticRect(sim, -half.w - 40, 0, 80, H + 200, wallOpts),
      staticRect(sim, half.w + 40, 0, 80, H + 200, wallOpts),
    );

    const holes = [];
    const holeCount = rng.int(2, 3);
    for (let i = 0; i < holeCount; i++) {
      // A jittered ring, so no two ever sit on top of each other and read as
      // one bigger hole.
      const a = (i / holeCount) * Math.PI * 2 + rng.wobble(0.4);
      const d = rng.range(0.28, 0.62);
      const r = rng.range(26, 38);
      holes.push(createHole(sim, {
        x: Math.cos(a) * half.w * d,
        y: Math.sin(a) * half.h * d,
        r,
        seed: hashSeed('bh', seed, i),
        drift: rng() < 0.55 ? 0.42 : 0,
        mu: r * 195,
        maxAccel: 1.05,
      }));
    }

    // Patches sit clear of the holes. Dropped on top of one a patch would just
    // be a bigger hole; placed nearby it is a trap you can watch approaching.
    const nebulae = [];
    for (let i = 0; i < rng.int(3, 4); i++) {
      for (let attempt = 0; attempt < 24; attempt++) {
        const x = rng.range(-half.w * 0.78, half.w * 0.78);
        const y = rng.range(-half.h * 0.78, half.h * 0.78);
        const r = rng.range(150, 240);
        const clear = holes.every((h) => Math.hypot(x - h.well.x, y - h.well.y) > r * 0.75 + 90);
        if (clear) {
          nebulae.push(createNebula(x, y, r, hashSeed('neb', seed, i)));
          break;
        }
      }
    }

    const pulsars = [];
    for (let i = 0; i < rng.int(2, 3); i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.45, 0.8);
      pulsars.push(createPulsar(
        sim,
        Math.cos(a) * half.w * d,
        Math.sin(a) * half.h * d,
        hashSeed('pul', seed, i),
      ));
    }

    const comets = [createComet(sim, bounds, hashSeed('com', seed))];

    // Anything that stops moving for long enough goes up. See hazards.js.
    const stuckWatch = createStuckWatch();

    return {
      bounds,
      holes,
      time: 0,

      spawn(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const d = 0.82 + rng.wobble(0.06);
          out.push({
            x: Math.cos(a) * half.w * d * 0.92,
            y: Math.sin(a) * half.h * d * 0.92,
            vx: -Math.sin(a) * rng.range(1.6, 3.2),
            vy: Math.cos(a) * rng.range(1.6, 3.2),
          });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        const p = round.pressure;
        const alive = round.alivePlayers();

        updateHoles(holes, dt, p, bounds, round.particles, { grow: 0.3, muGrow: 0.4 });

        // Creep toward the middle as the round ages, narrowing the safe lanes.
        const drift = 0.00035 * p * (dt / 16.667);
        for (const h of holes) {
          h.well.x -= h.well.x * drift;
          h.well.y -= h.well.y * drift;
        }

        applyNebula(sim, nebulae, alive, dt);
        updatePulsars(sim, pulsars, dt, alive, round.particles);
        updateComets(sim, comets, dt, round.particles);

        for (const pl of alive) {
          const pos = pl.body.position;
          const h = holeCapturing(holes, pos);
          if (h) round.kill(pl, 'hole', { at: pos, target: { x: h.well.x, y: h.well.y } });
        }

        stuckWatch(round.alivePlayers(), dt, (pl) => {
          round.kill(pl, 'boom', { at: pl.body.position });
        });
      },

      drawBack(g, cam, time) {
        drawEdge(g, [
          { x: -W / 2, y: -H / 2 }, { x: W / 2, y: -H / 2 },
          { x: W / 2, y: H / 2 }, { x: -W / 2, y: H / 2 },
        ], 4242, { color: '#9B7FD6', width: 3, alpha: 0.45, closed: true, passes: 3 });
        drawNebula(g, nebulae, time);
      },

      drawFront(g, cam, time) {
        drawHoles(g, holes, time);
        drawPulsars(g, pulsars, time);
        drawComets(g, comets, time);
      },
    };
  },
};
