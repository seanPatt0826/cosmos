// Binary Stars — the chaotic one.
//
// Two heavy stars circling a common centre. One fixed mass gives you tidy
// ellipses; two moving ones give you a genuinely chaotic field, where a body
// can be flung right across the arena by passing behind a star at the wrong
// moment. Nothing here needs scripting — the slingshots come free.
//
// The stars spiral toward each other as the round ages, which tightens the
// stable region around them until there isn't one.

import { makeRng, hashSeed } from '../rng.js';
import { addWell, orbitalSpeed, ACCEL_SCALE } from '../engine.js';
import { bakePlanet, drawSprite, boilFrame } from '../sprites.js';
import { drawRing } from './common.js';
import { softGlow } from '../sketch.js';
import { PALETTE } from '../config.js';
import {
  createHole, updateHoles, holeCapturing, drawHoles,
  createStuckWatch,
} from './hazards.js';
import * as Particles from '../particles.js';

const ARENA = 1520;
const STAR_R = 66;
const SEP = 300;
const MU = 15000;

export default {
  id: 'binary',
  name: 'Binary Stars',
  theme: 'binary',
  population: [22, 30],
  blurb: 'two suns, no rest',
  description: "Two heavy stars circling a common centre. One fixed mass would give tidy ellipses; two moving ones give genuine chaos, and an object can be slung right across the arena for passing behind a star at the wrong moment. The stars spiral together as the round ages, until there is no stable place left to be.",

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('binary', seed));
    const bounds = { x: -ARENA, y: -ARENA, w: ARENA * 2, h: ARENA * 2 };

    // Warm and cool, so you can tell at a glance which one has you.
    const cols = [
      rng.pick([PALETTE[0], PALETTE[11], PALETTE[1]]),
      rng.pick([PALETTE[7], PALETTE[6], PALETTE[5]]),
    ];

    const stars = [];
    for (let i = 0; i < 2; i++) {
      stars.push({
        well: addWell(sim, { x: 0, y: 0, mu: MU, minR: STAR_R, maxAccel: 3.2 }),
        col: cols[i],
        sprite: bakePlanet(STAR_R, hashSeed('star', seed, i), cols[i], { bands: 2 }),
        boil: i % 3,
        phase: i * Math.PI,
      });
    }

    // A pair of black holes well outside the stars, so there is somewhere
    // dangerous to be flung to rather than just "out".
    const holes = [];
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2) + i * Math.PI;
      const d = rng.range(760, 950);
      const r = rng.range(26, 36);
      holes.push(createHole(sim, {
        x: Math.cos(a) * d, y: Math.sin(a) * d, r,
        seed: hashSeed('bnh', seed, i),
        mu: r * 175,
        maxAccel: 0.95,
      }));
    }

    const stuckWatch = createStuckWatch();

    return {
      bounds,
      time: 0,
      edge: ARENA,
      sep: SEP,
      angle: rng.range(0, Math.PI * 2),

      spawn(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          // Well outside the pair, on an orbit around the system as a whole —
          // from out there the two stars pull almost like one, so everyone
          // starts stable and is drawn into the mess on their own.
          const shell = i % 2;
          // Further out than feels necessary, deliberately. Inside about three
          // times the separation a binary is chaotic and orbits decay straight
          // into a star: at 720 that was eleven of eighteen deaths in the first
          // half-minute. Out here everyone starts stable, and the chaos arrives
          // as the pair closes.
          const r = 990 + shell * 160 + rng.wobble(40);
          const a = (i / n) * Math.PI * 2 * 1.7 + rng.wobble(0.2);
          const v = orbitalSpeed(MU * 2, r) * rng.range(0.96, 1.04);
          out.push({
            x: Math.cos(a) * r,
            y: Math.sin(a) * r,
            vx: -Math.sin(a) * v,
            vy: Math.cos(a) * v,
          });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        const t = dt / 1000;
        const p = round.pressure;

        // The pair closes as the round ages, and both grow heavier.
        this.sep = SEP * (1 - p * 0.45);
        this.edge = ARENA - p * (ARENA - 780);
        const mu = MU * (1 + p * 0.7);

        // Each star orbits the barycentre at the speed its partner's mass
        // demands, so the pair holds together instead of drifting apart.
        const omega = Math.sqrt((ACCEL_SCALE * mu) / (4 * this.sep * this.sep * this.sep)) * 60;
        this.angle += omega * t * 60;

        for (const s of stars) {
          s.well.mu = mu;
          s.well.x = Math.cos(this.angle + s.phase) * this.sep;
          s.well.y = Math.sin(this.angle + s.phase) * this.sep;
        }

        updateHoles(holes, dt, p, bounds, round.particles, { grow: 0.25, muGrow: 0.3 });

        for (const pl of round.alivePlayers()) {
          const pos = pl.body.position;

          let burned = false;
          for (const s of stars) {
            if (Math.hypot(pos.x - s.well.x, pos.y - s.well.y) < STAR_R) {
              if (round.kill(pl, 'scribble', { at: pos, colour: s.col.glow })) {
                Particles.burst(round.particles, pos.x, pos.y, s.col.glow, { count: 18, speed: 3 });
              }
              burned = true;
              break;
            }
          }
          if (burned) continue;

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

      drawBack(g, cam, time) {
        drawRing(g, 0, 0, this.edge, 31, { color: '#C8A0D6', alpha: 0.4, width: 2.6 });
        // The path the pair sweeps, faint, so the system reads as a system.
        drawRing(g, 0, 0, this.sep, 32, { color: '#8E86C8', alpha: 0.16, width: 1.4, passes: 1 });
      },

      drawFront(g, cam, time) {
        drawHoles(g, holes, time);
        for (const s of stars) {
          softGlow(g, s.well.x, s.well.y, STAR_R * 5.5, s.col.glow, 0.34);
          drawSprite(g, s.sprite, s.well.x, s.well.y, this.time * 0.00006, 1, 1, boilFrame(time, s.boil));
        }
      },
    };
  },
};
