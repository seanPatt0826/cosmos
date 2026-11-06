// Bumper Field — the loud one.
//
// No gravity, no orbits, nothing to fall down. Just a field of repulsors and a
// boundary that closes. Everything ricochets, and because nothing slows down,
// a single good hit keeps paying out for the rest of the round.
//
// The bumpers outlived the pinball map they were built for. They were the best
// thing in it, and they never needed gravity to work.
//
// No black holes any more: a ring of bumpers turns slowly round the inside of
// the boundary instead, riding in with it as it closes, so the edge itself
// throws you about. Going past the ring is the only way out.

import { makeRng, hashSeed } from '../rng.js';
import { staticCircle, add, onCollide } from '../engine.js';
import { bakeBumper, drawSprite, boilFrame } from '../sprites.js';
import { drawRing } from './common.js';
import { softGlow } from '../sketch.js';
import { PALETTE } from '../config.js';
import {
  createPulsar, updatePulsars, drawPulsars,
  createStuckWatch,
  createArcFence, drawFence,
} from './hazards.js';

const ARENA = 1680;
const RIM_COUNT = 12;     // bumpers in the ring round the edge
const RIM_R = 34;         // their size
const RIM_IN = 140;       // how far inside the boundary they ride
const RIM_MIN = 1010;     // closer in than this they would crowd the field; they leave
const RIM_TURN = 0.00007; // radians per ms the ring turns

export default {
  id: 'bumpers',
  name: 'Bumper Field',
  theme: 'bumpers',
  population: [24, 32],
  blurb: 'everything bounces',
  // The short version, shown above the description: how you go out, and
  // what to keep an eye on. The goal is the same everywhere.
  rules: {
    out: "Bouncing past the shrinking ring.",
    watch: "Nothing ever slows down, so one big hit keeps you flying.",
  },
  description: "Repulsors and a closing ring, and nothing ever slows down.",

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

    // The ring round the edge: evenly spaced so no stretch of the boundary is
    // safer than another, in the same four colours as the field.
    const rim = [];
    for (let i = 0; i < RIM_COUNT; i++) {
      const a = (i / RIM_COUNT) * Math.PI * 2;
      const d = ARENA - RIM_IN;
      const col = palette[i % palette.length];
      const body = staticCircle(sim, Math.cos(a) * d, Math.sin(a) * d, RIM_R, {
        restitution: 1.15, friction: 0, label: 'bumper',
      });
      add(sim, body);
      const b = { body, r: RIM_R, col, flash: 0, sprite: bakeBumper(RIM_R, n, col), boil: n % 3, home: a, gone: false };
      bumpers.push(b);
      rim.push(b);
      n++;
    }
    let rimTurn = 0;

    const pulsars = [];
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2) + i * Math.PI;
      const d = rng.range(380, 700);
      pulsars.push(createPulsar(sim, Math.cos(a) * d, Math.sin(a) * d, hashSeed('bfp', seed, i)));
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

    // Stricter than the default: in a field this bouncy a racer can ping-pong
    // hard between two bumpers and land near where it started, which is busy,
    // not stuck. Only one that has truly stalled should go up.
    const stuckWatch = createStuckWatch({ travel: 30, windowMs: 9000 });

    const fence = createArcFence(sim, {
      radius: ARENA,
      arcs: 5,
      openFrac: 0.38,
      spin: 0.00011,
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
        fence.update(dt, this.edge, round.pressure, round.particles);

        for (const b of bumpers) b.flash *= Math.pow(0.86, dt / 16.667);
        const alive = round.alivePlayers();
        updatePulsars(sim, pulsars, dt, alive, round.particles);

        // The edge ring turns and rides in with the boundary. Once the
        // boundary closes far enough that it would crowd the field's own
        // bumpers, it leaves.
        rimTurn += dt * RIM_TURN;
        const rimD = this.edge - RIM_IN;
        for (const b of rim) {
          if (b.gone) continue;
          if (rimD < RIM_MIN) {
            b.gone = true;
            sim.Matter.Body.setPosition(b.body, { x: -99999, y: -99999 });
            continue;
          }
          const a = b.home + rimTurn;
          sim.Matter.Body.setPosition(b.body, { x: Math.cos(a) * rimD, y: Math.sin(a) * rimD });
        }

        for (const pl of alive) {
          const pos = pl.body.position;
          if (Math.hypot(pos.x, pos.y) > this.edge) {
            round.kill(pl, 'drift', { at: pos });
          }
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
        for (const b of bumpers) {
          if (b.gone) continue;
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
