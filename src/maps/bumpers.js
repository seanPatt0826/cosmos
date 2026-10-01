// Bumper Field — the loud one.
//
// No gravity, no orbits, nothing to fall down. Just a field of repulsors and a
// boundary that closes. Everything ricochets, and because nothing slows down,
// a single good hit keeps paying out for the rest of the round.
//
// The bumpers outlived the pinball map they were built for. They were the best
// thing in it, and they never needed gravity to work.

import { makeRng, hashSeed } from '../rng.js';
import { staticCircle, add, onCollide } from '../engine.js';
import { bakeBumper, drawSprite, boilFrame } from '../sprites.js';
import { drawRing } from './common.js';
import { softGlow } from '../sketch.js';
import { PALETTE } from '../config.js';
import {
  createHole, updateHoles, holeCapturing, drawHoles,
  createPulsar, updatePulsars, drawPulsars,
  createStuckWatch,
  createArcFence, drawFence,
} from './hazards.js';

const ARENA = 1680;

export default {
  id: 'bumpers',
  name: 'Bumper Field',
  theme: 'bumpers',
  population: [24, 32],
  blurb: 'everything bounces',
  description: "No gravity, no orbits, nothing to fall down: a field of repulsors and a boundary that closes. Because nothing ever slows down, one good hit keeps paying out for the rest of the round.",

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('bumpers', seed));
    const bounds = { x: -ARENA, y: -ARENA, w: ARENA * 2, h: ARENA * 2 };

    // Spread on jittered rings rather than at random: pure random clumps, and a
    // clump reads as one lumpy obstacle instead of several bumpers.
    const bumpers = [];
    const rings = [
      { count: rng.int(3, 4), d: 250 },
      { count: rng.int(5, 7), d: 560 },
      { count: rng.int(6, 8), d: 860 },
    ];
    // Four sizes and four colours, fixed for the round, and the drawing keyed to
    // the bumper's index rather than the round seed.
    //
    // This map was the one transition that never got cheaper: eighteen bumpers
    // drawn from a continuous radius and the full fourteen-colour palette on a
    // fresh seed meant every round minted eighteen textures it had never seen,
    // and the hitch stayed at 100ms however long you played. Narrowing the
    // combinations lets the cache actually land — and a field of four related
    // colours looks more composed than fourteen scattered ones anyway.
    const SIZES = [36, 44, 52, 60];
    const palette = [];
    while (palette.length < 4) {
      const c = rng.pick(PALETTE);
      if (!palette.includes(c)) palette.push(c);
    }

    let n = 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.count; i++) {
        const a = (i / ring.count) * Math.PI * 2 + rng.wobble(0.35);
        const d = ring.d + rng.wobble(70);
        const r = SIZES[rng.int(0, SIZES.length - 1)];
        const col = palette[n % palette.length];
        const body = staticCircle(sim, Math.cos(a) * d, Math.sin(a) * d, r, {
          restitution: 1.15, friction: 0, label: 'bumper',
        });
        add(sim, body);
        bumpers.push({
          body, r, col, flash: 0,
          sprite: bakeBumper(r, n, col),
          boil: n % 3,
        });
        n++;
      }
    }

    const pulsars = [];
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2) + i * Math.PI;
      const d = rng.range(380, 700);
      pulsars.push(createPulsar(sim, Math.cos(a) * d, Math.sin(a) * d, hashSeed('bfp', seed, i)));
    }

    const holes = [];
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2) + i * Math.PI;
      const d = rng.range(340, 720);
      const r = rng.range(25, 34);
      holes.push(createHole(sim, {
        x: Math.cos(a) * d, y: Math.sin(a) * d, r,
        seed: hashSeed('bfh', seed, i),
        drift: 0.45,
        mu: r * 165,
        maxAccel: 0.9,
      }));
    }

    onCollide(sim, (a, b) => {
      for (const bump of bumpers) {
        if (a !== bump.body && b !== bump.body) continue;
        const other = a === bump.body ? b : a;
        if (other.isStatic) continue;
        const dx = other.position.x - bump.body.position.x;
        const dy = other.position.y - bump.body.position.y;
        const d = Math.hypot(dx, dy) || 1;
        // An honest kick outward, on top of the restitution.
        sim.Matter.Body.applyForce(other, other.position, {
          x: (dx / d) * other.mass * 0.007,
          y: (dy / d) * other.mass * 0.007,
        });
        bump.flash = 1;
      }
    });

    const stuckWatch = createStuckWatch();

    const fence = createArcFence(sim, {
      radius: ARENA,
      arcs: 5,
      openFrac: 0.40,
      spin: -0.00012,
      colour: '#D6A0C8',
      seed: hashSeed('fence', seed),
    });

    return {
      bounds,
      time: 0,
      edge: ARENA,

      spawn(n2) {
        const out = [];
        for (let i = 0; i < n2; i++) {
          const a = (i / n2) * Math.PI * 2;
          const d = ARENA * 0.92;
          // Aimed inward, so the field starts working immediately.
          out.push({
            x: Math.cos(a) * d,
            y: Math.sin(a) * d,
            vx: -Math.cos(a) * rng.range(1.6, 3.1) + rng.wobble(0.7),
            vy: -Math.sin(a) * rng.range(1.6, 3.1) + rng.wobble(0.7),
          });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        const p = round.pressure;
        this.edge = ARENA - p * (ARENA - 980);
        fence.update(dt, this.edge, round.pressure);

        for (const b of bumpers) b.flash *= Math.pow(0.86, dt / 16.667);
        const alive = round.alivePlayers();
        updatePulsars(sim, pulsars, dt, alive, round.particles);
        updateHoles(holes, dt, p, bounds, round.particles, { grow: 0.3, muGrow: 0.4 });

        for (const h of holes) {
          const d = Math.hypot(h.well.x, h.well.y);
          const limit = this.edge - h.well.capture - 110;
          if (d > limit && d > 0) {
            h.well.x = (h.well.x / d) * limit;
            h.well.y = (h.well.y / d) * limit;
            h.vx *= -1;
            h.vy *= -1;
          }
        }

        for (const pl of alive) {
          const pos = pl.body.position;
          if (Math.hypot(pos.x, pos.y) > this.edge) {
            round.kill(pl, 'drift', { at: pos });
            continue;
          }
          const h = holeCapturing(holes, pos);
          if (h) round.kill(pl, 'hole', { at: pos, target: { x: h.well.x, y: h.well.y } });
        }

        stuckWatch(round.alivePlayers(), dt, (pl) => {
          round.kill(pl, 'boom', { at: pl.body.position });
        });
      },

      drawBack(g, cam, time) {

        drawFence(g, fence);
        drawRing(g, 0, 0, this.edge, 44, { color: '#D6A0C8', alpha: 0.42, width: 2.8 });
        drawRing(g, 0, 0, this.edge + 14, 45, { color: '#D6A0C8', alpha: 0.14, width: 1.4, passes: 1 });
      },

      drawFront(g, cam, time) {
        drawHoles(g, holes, time);
        for (const b of bumpers) {
          const s = 1 + b.flash * 0.16;
          if (b.flash > 0.02) {
            softGlow(g, b.body.position.x, b.body.position.y, b.r * 3.4, b.col.glow, b.flash * 0.4);
          }
          drawSprite(g, b.sprite, b.body.position.x, b.body.position.y, 0, s, 1, boilFrame(time, b.boil));
        }
        drawPulsars(g, pulsars, time);
      },
    };
  },
};
