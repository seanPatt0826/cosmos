// Orbital Arena — the peaceful one.
//
// A planet, some moons, and real orbital mechanics. Bodies are placed on
// genuine circular orbits at spawn rather than thrown in and left to sort
// themselves out, which is why this map looks composed instead of chaotic.
//
// The planet's mass creeps upward as the round ages, so every orbit slowly
// decays. Nobody is safe forever; they just don't know it yet.

import { makeRng, hashSeed } from '../rng.js';
import { add, addWell, orbitalSpeed, staticCircle } from '../engine.js';
import { bakePlanet, bakeAsteroid, drawSprite, boilFrame } from '../sprites.js';
import {
  createHole, updateHoles, holeCapturing, drawHoles,
  createArcFence, drawFence,
} from './hazards.js';
import { drawRing } from './common.js';
import { softGlow } from '../sketch.js';
import { PALETTE } from '../config.js';
import * as Particles from '../particles.js';

const ARENA = 1250;
const PLANET_R = 118;

export default {
  id: 'orbit',
  name: 'Orbital Arena',
  theme: 'orbit',
  population: [20, 28],
  blurb: 'round and round',
  description: "A planet and its moons, on real orbits. Everything starts on a genuine circular path rather than being thrown in and left to sort itself out, which is why it looks composed instead of chaotic. The planet quietly gains mass as the round goes on, so every orbit decays. Nobody is safe forever; they just do not know it yet.",

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('orbit', seed));

    const planetCol = rng.pick([PALETTE[1], PALETTE[4], PALETTE[6], PALETTE[10]]);
    const baseMu = 26000;
    const planet = addWell(sim, { x: 0, y: 0, mu: baseMu, minR: PLANET_R, maxAccel: 3 });
    const planetSprite = bakePlanet(PLANET_R, hashSeed('pl', seed), planetCol, { bands: 4 });

    // Moons are solid: they knock bodies off course, which is where most
    // eliminations actually begin.
    const moons = [];
    const moonCount = 2;
    for (let i = 0; i < moonCount; i++) {
      const r = rng.range(26, 38);
      // Parked between the player shells, never on one, or the moons would be
      // ploughing through the starting formation before anyone has settled.
      const dist = (i === 0 ? 490 : 850) + rng.wobble(22);
      const col = rng.pick(PALETTE);
      const body = staticCircle(sim, dist, 0, r, { restitution: 0.85, friction: 0, label: "moon" });
      add(sim, body);
      const w = addWell(sim, { x: dist, y: 0, mu: r * 70, minR: r * 1.5, maxAccel: 0.55, ignoreDrifters: true });
      moons.push({
        body, well: w, r, dist,
        angle: rng.range(0, Math.PI * 2),
        // Moons orbit at the correct speed too, just in the opposite sense
        // half the time so the traffic crosses.
        omega: (orbitalSpeed(baseMu, dist) / dist) * (rng() < 0.5 ? 1 : -1),
        sprite: bakePlanet(r, hashSeed('mn', seed, i), col, { bands: 1 }),
        boil: i % 3,
        col,
      });
    }

    const bounds = { x: -ARENA, y: -ARENA, w: ARENA * 2, h: ARENA * 2 };

    // ── Debris ring ────────────────────────────────────────────────────────
    //
    // A band of loose rock parked between two of the player shells, so nearly
    // everyone has to cross it. These are real bodies under the planet's
    // gravity — placed at true orbital speed, they hold the ring themselves.
    const debris = [];
    const debrisR = 880;
    const debrisCount = rng.int(10, 14);
    for (let i = 0; i < debrisCount; i++) {
      const a = (i / debrisCount) * Math.PI * 2 + rng.wobble(0.12);
      const d = debrisR + rng.wobble(34);
      const rad = rng.range(9, 17);
      const body = sim.Matter.Bodies.circle(Math.cos(a) * d, Math.sin(a) * d, rad, {
        restitution: 0.9, friction: 0.002, frictionAir: 0, frictionStatic: 0,
        density: 0.0017, label: "asteroid",
      });
      const v = orbitalSpeed(baseMu, d);
      sim.Matter.Body.setVelocity(body, { x: -Math.sin(a) * v, y: Math.cos(a) * v });
      sim.Matter.Body.setAngularVelocity(body, rng.range(-0.04, 0.04));
      add(sim, body);
      // No `ignoreWells`: the planet is what keeps this ring a ring.
      sim.drifters.push({ body });
      debris.push({ body, r: rad, sprite: bakeAsteroid(rad, hashSeed('deb', seed, i)), boil: i % 3 });
    }

    // ── Black holes ────────────────────────────────────────────────────────
    //
    // Kept light. A well heavy enough to be felt across the arena would drag
    // every orbit off true, and the composed look of this map is the point.
    const holes = [];
    for (let i = 0; i < 2; i++) {
      const r = rng.range(21, 28);
      // Parked in the lanes *between* the player shells (300 / 480 / 660). The
      // first version orbited at shell radii and swept the field clean in half
      // a minute.
      const dist = (i === 0 ? 320 : 670) + rng.wobble(18);
      const h = createHole(sim, {
        x: dist, y: 0, r,
        seed: hashSeed('obh', seed, i),
        mu: r * 145,
        maxAccel: 0.8,
      });
      h.dist = dist;
      h.angle = rng.range(0, Math.PI * 2);
      // Slow sweep. Now that the wells are large, a quick orbit drags them
      // through every shell and clears the field in half a minute.
      h.omega = (orbitalSpeed(baseMu, dist) / dist) * (i % 2 ? -1 : 1) * 0.16;
      holes.push(h);
    }

    const fence = createArcFence(sim, {
      radius: ARENA,
      arcs: 4,
      openFrac: 0,
      spin: 0,
      colour: '#6E86C8',
      seed: hashSeed('fence', seed),
    });

    return {
      bounds,
      time: 0,
      edge: ARENA,
      mu: baseMu,

      spawn(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          // Layered shells, so the arena looks like an orrery at the start.
          const shell = i % 3;
          const r = 400 + shell * 180 + rng.wobble(30);
          const a = (i / n) * Math.PI * 2 * 1.6 + rng.wobble(0.25);
          // Nearly circular. Wider scatter gave orbits a low perihelion from the
          // outset, and anything dipping toward the planet burns up.
          const v = orbitalSpeed(baseMu, r) * rng.range(0.975, 1.025);
          // Everybody orbits the same way. An earlier version ran the middle
          // shell retrograde, which looked wonderful for about ten seconds and
          // then met the debris ring head-on at double the relative speed and
          // wrecked the field in under half a minute. The crossing traffic now
          // comes from the moons, which are heavy enough to be interesting and
          // few enough not to be a meat grinder.
          const dir = 1;
          out.push({
            x: Math.cos(a) * r,
            y: Math.sin(a) * r,
            vx: -Math.sin(a) * v * dir,
            vy: Math.cos(a) * v * dir,
          });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        const t = dt / 1000;
        const p = round.pressure;

        // The squeeze: a heavier planet and a closing ring.
        this.mu = baseMu * (1 + p * 1.25);
        planet.mu = this.mu;
        this.edge = ARENA - p * (ARENA - 380);
        fence.update(dt, this.edge, round.pressure, round.particles);

        for (const m of moons) {
          m.angle += m.omega * t * 60;
          const nx = Math.cos(m.angle) * m.dist;
          const ny = Math.sin(m.angle) * m.dist;
          const vx = (nx - m.body.position.x) / (dt || 16) * 16;
          const vy = (ny - m.body.position.y) / (dt || 16) * 16;
          sim.Matter.Body.setPosition(m.body, { x: nx, y: ny });
          sim.Matter.Body.setVelocity(m.body, { x: vx, y: vy });
          m.well.x = nx;
          m.well.y = ny;
        }

        // The wells ride their own orbits, sweeping through the traffic.
        for (const h of holes) {
          h.angle += h.omega * t * 60;
          h.well.x = Math.cos(h.angle) * h.dist;
          h.well.y = Math.sin(h.angle) * h.dist;
        }
        updateHoles(holes, dt, p, bounds, round.particles, { grow: 0.2, muGrow: 0.25 });

        for (const pl of round.alivePlayers()) {
          const pos = pl.body.position;
          const d = Math.hypot(pos.x, pos.y);
          const hole = holeCapturing(holes, pos);
          if (hole) {
            round.kill(pl, 'hole', { at: pos, target: { x: hole.well.x, y: hole.well.y } });
            continue;
          }
          if (d < PLANET_R + 6) {
            // Burning up on entry. Warm, not gory. The particles are tied to
            // the kill succeeding — the last survivor cannot be eliminated, and
            // without this it would sit inside the planet throwing sparks.
            if (round.kill(pl, 'scribble', { at: pos, colour: '#FFC66B' })) {
              Particles.burst(round.particles, pos.x, pos.y, '#FFC66B', { count: 16, speed: 2.6 });
            }
          } else if (d > this.edge) {
            round.kill(pl, 'drift', { at: pos });
          }
        }
      },

      drawBack(g, cam, time) {

        drawFence(g, fence);
        softGlow(g, 0, 0, PLANET_R * 5.5, planetCol.glow, 0.16);
        drawRing(g, 0, 0, this.edge, 77, { color: '#6E86C8', alpha: 0.4, width: 2.6 });
        drawRing(g, 0, 0, this.edge - 9, 78, { color: '#6E86C8', alpha: 0.16, width: 1.4, passes: 1 });
      },

      drawFront(g, cam, time) {
        drawSprite(g, planetSprite, 0, 0, this.time * 0.00004, 1, 1, boilFrame(time, 0));
        for (const d of debris) {
          drawSprite(g, d.sprite, d.body.position.x, d.body.position.y, d.body.angle, 1, 1, boilFrame(time, d.boil));
        }
        drawHoles(g, holes, time);
        for (const m of moons) {
          softGlow(g, m.body.position.x, m.body.position.y, m.r * 3, m.col.glow, 0.12);
          drawSprite(g, m.sprite, m.body.position.x, m.body.position.y, m.angle * 0.4, 1, 1, boilFrame(time, m.boil));
        }
      },
    };
  },
};
