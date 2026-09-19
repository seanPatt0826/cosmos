// A round, start to finish.
//
// Spawn, countdown, release, attrition, winner, fade. The map supplies the
// physics and decides who dies; this file owns the clock, the population, and
// the one rule that matters: a round always ends, and it always ends with
// exactly one survivor.

import { ROUND, BODY, SIM } from './config.js';
import { createSim, add, remove, step, onCollide, destroy } from './engine.js';
import { createPlayers, makeBody, sampleTrail } from './bodies.js';
import { createParticles } from './particles.js';
import * as Particles from './particles.js';
import { createCamera, nudge } from './camera.js';
import { makeRng, hashSeed } from './rng.js';

export const PHASE = {
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  WINNER: 'winner',
  DONE: 'done',
};

const DEATH_MS = { hole: 1150, scribble: 620, drift: 1500, boom: 760 };

// How hard an exploding object shoves whatever is standing near it.
const BLAST_RADIUS = 260;
const BLAST_FORCE = 0.026;

export function createRound(mapDef, seed, audio, names = []) {
  const rng = makeRng(hashSeed('round', seed));
  // No map has ambient gravity any more; the two that fell were deleted.
  const sim = createSim();

  const map = mapDef.build({ sim, seed, rng });
  const [lo, hi] = mapDef.population;
  const count = rng.int(lo, hi);
  const players = createPlayers(count, seed, names);
  sim.players = players;

  const spawns = map.spawn(count);
  players.forEach((p, i) => {
    const s = spawns[i] || spawns[spawns.length - 1];
    const b = makeBody(sim.Matter, p, s.x, s.y);
    // Held in place until the countdown finishes. Nothing moves before "go".
    sim.Matter.Body.setStatic(b, true);
    p.spawnVel = { x: s.vx || 0, y: s.vy || 0 };
    add(sim, b);
  });

  const particles = createParticles();
  const cam = createCamera(map.bounds);

  const round = {
    map,
    mapDef,
    sim,
    players,
    particles,
    cam,
    audio,
    seed,
    phase: PHASE.COUNTDOWN,
    time: 0,
    elapsed: 0,
    phaseTime: 0,
    aliveCount: count,
    startCount: count,
    pressure: 0,
    winner: null,
    winnerBloom: 0,

    alivePlayers() {
      const out = [];
      for (const p of players) if (p.alive && p.body) out.push(p);
      return out;
    },

    kill(player, kind, opts = {}) {
      // The single invariant of the whole game: never take the last one.
      if (!player.alive || round.aliveCount <= 1) return false;
      player.alive = false;
      round.aliveCount--;

      const pos = opts.at || player.body.position;
      const vel = player.body.velocity;
      player.death = {
        kind,
        t: 0,
        dur: DEATH_MS[kind] || 700,
        pos: { x: pos.x, y: pos.y },
        vel: { x: vel.x, y: vel.y },
        angle: player.body.angle,
        target: opts.target || null,
        r0: opts.target ? Math.hypot(pos.x - opts.target.x, pos.y - opts.target.y) : 0,
        a0: opts.target ? Math.atan2(pos.y - opts.target.y, pos.x - opts.target.x) : 0,
      };

      remove(sim, player.body);
      player.body = null;

      const colour = opts.colour || player.col.glow;
      if (kind === 'hole') {
        Particles.unravel(particles, pos.x, pos.y, opts.target.x, opts.target.y, colour);
        Particles.burst(particles, pos.x, pos.y, colour, { count: 10, speed: 1.6, ring: false });
        audio.capture();
      } else if (kind === 'boom') {
        // Going out with a bang, and taking the neighbourhood with it. The
        // shove is the useful part: an object wedged badly enough to explode is
        // often wedged against somebody else, and this frees them both.
        Particles.burst(particles, pos.x, pos.y, colour, {
          count: 26, speed: 5.2, ringTo: BLAST_RADIUS * 0.8, ringLife: 760, size: 8,
        });
        Particles.burst(particles, pos.x, pos.y, '#FFE79B', {
          count: 14, speed: 3.4, ring: false, maxLife: 520,
        });
        Particles.scribble(particles, pos.x, pos.y, colour, BODY.radius * 2);
        for (const other of round.alivePlayers()) {
          const dx = other.body.position.x - pos.x;
          const dy = other.body.position.y - pos.y;
          const d = Math.hypot(dx, dy);
          if (d > BLAST_RADIUS || d < 1) continue;
          const k = (1 - d / BLAST_RADIUS) * BLAST_FORCE;
          sim.Matter.Body.applyForce(other.body, other.body.position, {
            x: (dx / d) * other.body.mass * k,
            y: (dy / d) * other.body.mass * k,
          });
        }
        nudge(cam, 5);
        audio.boom();
      } else if (kind === 'scribble') {
        Particles.scribble(particles, pos.x, pos.y, colour, BODY.radius * 1.5);
        Particles.burst(particles, pos.x, pos.y, colour, { count: 13, speed: 2.2 });
        audio.poof();
      } else {
        Particles.puff(particles, pos.x, pos.y, colour, 10);
        audio.poof();
      }

      if (round.aliveCount === 1) {
        const last = round.alivePlayers()[0];
        round.winner = last;
        round.phase = PHASE.WINNER;
        round.phaseTime = 0;
        round.winnerBloom = 0;
        audio.win();
      }
      return true;
    },
  };

  // Impact sound and a touch of camera weight, for players only. Asteroids
  // clacking into each other all day would be exhausting.
  onCollide(sim, (a, b, rel) => {
    const isPlayer = a.label === 'player' || b.label === 'player';
    if (!isPlayer || rel < 1.4) return;
    const e = Math.min(1, (rel - 1.4) / 12);
    const p = a.label === 'player' ? a : b;
    audio.bell(e, Math.max(-1, Math.min(1, (p.position.x - cam.x) / 700)));
    if (rel > 8) {
      Particles.burst(particles, p.position.x, p.position.y, '#F2EADB', {
        count: 4, speed: 1.6, ring: false, maxLife: 380, size: 4,
      });
      nudge(cam, Math.min(3.2, (rel - 8) * 0.28));
    }
  });

  // Insurance, and nothing more.
  //
  // Every map has an escalating pressure that is supposed to close a round out
  // on its own, and in normal play this never runs. But a physics simulation
  // can always find a pocket its designer did not imagine — a body wedged where
  // no hazard reaches, two objects in a stable exchange — and a toy that hangs
  // forever is worse than one that occasionally lets someone drift away. Past
  // four minutes, the stillest object goes first.
  const BACKSTOP_AFTER = 240000;
  const BACKSTOP_EVERY = 5000;
  let backstopAt = BACKSTOP_AFTER;

  function backstop(dtMs) {
    if (round.elapsed < backstopAt || round.aliveCount <= 1) return;
    backstopAt = round.elapsed + BACKSTOP_EVERY;
    let stillest = null;
    let least = Infinity;
    for (const p of round.alivePlayers()) {
      const v = p.body.velocity;
      const s = v.x * v.x + v.y * v.y;
      if (s < least) {
        least = s;
        stillest = p;
      }
    }
    if (stillest) round.kill(stillest, 'drift', { at: stillest.body.position });
  }

  round.update = function update(dtMs) {
    round.time += dtMs;

    if (round.phase === PHASE.COUNTDOWN) {
      round.phaseTime += dtMs;
      if (round.phaseTime >= ROUND.countdownMs) {
        for (const p of players) {
          if (!p.body) continue;
          sim.Matter.Body.setStatic(p.body, false);
          sim.Matter.Body.setVelocity(p.body, p.spawnVel);
          sim.Matter.Body.setAngularVelocity(p.body, p.spin);
        }
        round.phase = PHASE.RUNNING;
        round.phaseTime = 0;
      }
    } else if (round.phase === PHASE.RUNNING) {
      round.elapsed += dtMs;

      // Calm, then a long ramp, then — if two bodies have settled into a
      // stalemate — a sharp escalation until it resolves.
      const e = round.elapsed;
      let p = 0;
      if (e > ROUND.calmMs) p = Math.min(1, (e - ROUND.calmMs) / ROUND.rampMs);
      if (e > ROUND.desperateMs) p += (e - ROUND.desperateMs) / 14000;
      round.pressure = Math.min(3.2, p);

      const steps = Math.min(SIM.maxStepsPerFrame, Math.max(1, Math.round(dtMs / SIM.stepMs)));
      const sub = dtMs / steps;
      for (let i = 0; i < steps; i++) step(sim, sub);

      map.update(dtMs, round);
      backstop(dtMs);

      for (const pl of players) sampleTrail(pl, round.time);
    } else if (round.phase === PHASE.WINNER) {
      round.phaseTime += dtMs;
      round.winnerBloom = Math.min(1, round.phaseTime / 900);
      // The winner keeps flying. Freezing them would break the spell.
      const steps = Math.min(SIM.maxStepsPerFrame, Math.max(1, Math.round(dtMs / SIM.stepMs)));
      for (let i = 0; i < steps; i++) step(sim, dtMs / steps);
      map.update(dtMs, round);
      for (const pl of players) sampleTrail(pl, round.time);

      if (round.phaseTime > 260 && round.phaseTime < 900 && Math.random() < 0.35 && round.winner.body) {
        Particles.burst(particles, round.winner.body.position.x, round.winner.body.position.y,
          round.winner.col.glow, { count: 8, speed: 3.4, ringTo: 120, ringLife: 900 });
      }
      if (round.phaseTime >= ROUND.winnerMs) round.phase = PHASE.DONE;
    }

    // Death animations, and trails fading out behind the departed.
    for (const pl of players) {
      if (pl.death && pl.death.t < 1) {
        pl.death.t = Math.min(1, pl.death.t + dtMs / pl.death.dur);
      }
      if (!pl.alive && pl.trail.length && Math.random() < 0.4) pl.trail.shift();
    }

    Particles.update(particles, dtMs);
  };

  round.destroy = () => destroy(sim);

  return round;
}
