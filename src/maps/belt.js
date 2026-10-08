// Asteroid Belt — the chain-reaction one.
//
// No gravity at all. Just a lot of rock with a lot of momentum. Everything here
// happens because something hit something else, which is the most legible kind
// of physics drama there is: you can always see exactly whose fault it was.

import { makeRng, hashSeed } from '../rng.js';
import { add } from '../engine.js';
import { bakeAsteroid, drawSprite, boilFrame } from '../sprites.js';
import { drawRing } from './common.js';
import * as Particles from '../particles.js';
import {
  createHole, updateHoles, holeCapturing, drawHoles,
  createShard, drawShards,
  createNebula, applyNebula, drawNebula,
  createComet, updateComets, drawComets,
  createStuckWatch,
  createArcFence, drawFence,
} from './hazards.js';

const ARENA = 1620;

export default {
  id: 'belt',
  name: 'Asteroid Belt',
  theme: 'belt',
  population: [24, 32],
  blurb: 'watch out',
  // The short version, shown above the description: how you go out, and
  // what to keep an eye on. The goal is the same everywhere.
  rules: {
    out: "Getting knocked past the closing ring, or into a black hole.",
    watch: "No gravity here. Only collisions move you, and the ring keeps shrinking.",
  },
  description: "No gravity, just rocks with momentum: every knockout is a collision you can see coming.",

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('belt', seed));
    const rocks = [];

    // Rocks draw from a small shared pool rather than each baking its own.
    //
    // Forty-odd rocks with a private three-frame sprite each meant well over a
    // hundred distinct canvases being composited every frame, which is a cost
    // the browser pays whether or not the JS looks fast. Eight variants scaled
    // to size are indistinguishable in motion and cost a fraction as much.
    const ROCK_VARIANTS = 8;
    const rockPool = [];
    for (let i = 0; i < ROCK_VARIANTS; i++) {
      rockPool.push({ base: 40, sprite: bakeAsteroid(40, hashSeed('rockpool', seed, i)) });
    }

    function spawnRock(rad, x, y, speed) {
      const body = sim.Matter.Bodies.circle(x, y, rad, {
        restitution: 0.95,
        friction: 0.001,
        frictionAir: 0,
        frictionStatic: 0,
        // Heavier than a player, so a rock wins every exchange.
        density: 0.004 + rad * 0.00006,
        label: 'asteroid',
      });
      const a = rng.range(0, Math.PI * 2);
      sim.Matter.Body.setVelocity(body, { x: Math.cos(a) * speed, y: Math.sin(a) * speed });
      sim.Matter.Body.setAngularVelocity(body, rng.range(-0.03, 0.03));
      add(sim, body);
      const v = rockPool[rocks.length % ROCK_VARIANTS];
      const rock = {
        body, r: rad, sprite: v.sprite, scale: rad / v.base, boil: rocks.length % 3,
      };
      rocks.push(rock);
      sim.drifters.push({ body, ignoreWells: true });
      return rock;
    }

    const initial = rng.int(20, 26);
    for (let i = 0; i < initial; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.15, 0.88) * ARENA;
      spawnRock(rng.range(16, 46), Math.cos(a) * d, Math.sin(a) * d, rng.range(0.8, 2.2));
    }

    const bounds = { x: -ARENA, y: -ARENA, w: ARENA * 2, h: ARENA * 2 };

    // Long angular rocks, tumbling end over end. They collide nothing like the
    // round ones, which is the entire reason they are here.
    const shards = [];
    for (let i = 0; i < rng.int(5, 8); i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.2, 0.8) * ARENA;
      shards.push(createShard(
        sim, Math.cos(a) * d, Math.sin(a) * d,
        rng.range(120, 210), hashSeed('sh', seed, i), rng.range(0.7, 1.8),
      ));
    }

    const nebulae = [];
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.2, 0.62) * ARENA;
      nebulae.push(createNebula(
        Math.cos(a) * d, Math.sin(a) * d, rng.range(160, 250), hashSeed('bneb', seed, i),
      ));
    }

    // Black holes among the rock. Drifting, and deaf to the asteroids — a well
    // that ate the field would leave an empty arena within a minute.
    const holes = [];
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0.25, 0.6) * ARENA;
      const r = rng.range(28, 40);
      holes.push(createHole(sim, {
        x: Math.cos(a) * d, y: Math.sin(a) * d, r,
        seed: hashSeed('bbh', seed, i),
        drift: 0.5,
        mu: r * 185,
        maxAccel: 1.0,
      }));
    }

    const comets = [createComet(sim, bounds, hashSeed('bcom', seed))];
    const stuckWatch = createStuckWatch();

    const fence = createArcFence(sim, {
      radius: ARENA,
      arcs: 4,
      openFrac: 0,
      spin: 0,
      colour: '#C8A07E',
      seed: hashSeed('fence', seed),
    });

    return {
      bounds,
      time: 0,
      edge: ARENA,
      nextRock: 6000,

      spawn(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const d = ARENA * 0.72;
          out.push({
            x: Math.cos(a) * d,
            y: Math.sin(a) * d,
            vx: -Math.cos(a) * rng.range(0.4, 1.3) + rng.wobble(0.5),
            vy: -Math.sin(a) * rng.range(0.4, 1.3) + rng.wobble(0.5),
          });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        const p = round.pressure;
        this.edge = ARENA - p * (ARENA - 920);
        fence.update(dt, this.edge, round.pressure, round.particles);

        // Rocks stay in the ring; players do not. That asymmetry is the map.
        for (const r of rocks.concat(shards.map((s) => ({ body: s.body, r: s.len * 0.4 })))) {
          const b = r.body;
          const d = Math.hypot(b.position.x, b.position.y);
          const limit = this.edge - r.r;
          if (d > limit) {
            const nx = b.position.x / d;
            const ny = b.position.y / d;
            const dot = b.velocity.x * nx + b.velocity.y * ny;
            if (dot > 0) {
              sim.Matter.Body.setVelocity(b, {
                x: b.velocity.x - 2 * dot * nx,
                y: b.velocity.y - 2 * dot * ny,
              });
            }
            sim.Matter.Body.setPosition(b, { x: nx * limit, y: ny * limit });
          }
          // Nothing slows down in space, but nothing should stall either.
          const s = Math.hypot(b.velocity.x, b.velocity.y);
          if (s < 0.35) {
            const a = Math.random() * Math.PI * 2;
            sim.Matter.Body.setVelocity(b, { x: Math.cos(a) * 0.8, y: Math.sin(a) * 0.8 });
          }
        }

        // More rock, faster, as the round wears on.
        this.nextRock -= dt * (1 + p * 3);
        if (this.nextRock <= 0 && rocks.length < 44) {
          this.nextRock = 5200;
          const a = Math.random() * Math.PI * 2;
          const rock = spawnRock(
            17 + Math.random() * 32,
            Math.cos(a) * this.edge * 0.92,
            Math.sin(a) * this.edge * 0.92,
            1.6 + p * 2.4,
          );
          Particles.puff(round.particles, rock.body.position.x, rock.body.position.y, '#DCD5C6', 8);
        }

        const alive = round.alivePlayers();
        applyNebula(sim, nebulae, alive, dt);
        updateComets(sim, comets, dt, round.particles);
        updateHoles(holes, dt, p, bounds, round.particles, { grow: 0.3, muGrow: 0.4 });

        // Keep the wells inside the contracting ring, or they end up stranded
        // outside the arena where nothing can reach them.
        for (const h of holes) {
          const d = Math.hypot(h.well.x, h.well.y);
          const limit = this.edge - h.well.capture - 90;
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
        drawRing(g, 0, 0, this.edge, 55, { color: '#C8A07E', alpha: 0.42, width: 2.8 });
        drawRing(g, 0, 0, this.edge + 14, 56, { color: '#C8A07E', alpha: 0.14, width: 1.4, passes: 1 });
        drawNebula(g, nebulae, time);
      },

      drawFront(g, cam, time) {
        for (const r of rocks) {
          drawSprite(g, r.sprite, r.body.position.x, r.body.position.y, r.body.angle, r.scale, 1, boilFrame(time, r.boil));
        }
        drawShards(g, shards, time);
        drawHoles(g, holes, time);
        drawComets(g, comets, time);
      },
    };
  },
};
