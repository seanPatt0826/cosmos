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
  // Lined up and waiting for somebody to press start. Nothing moves until then.
  READY: 'ready',
  COUNTDOWN: 'countdown',
  RUNNING: 'running',
  WINNER: 'winner',
  DONE: 'done',
};

const DEATH_MS = { hole: 1150, scribble: 620, drift: 1500, boom: 760 };

// How many eliminations the feed on the left remembers.
const OUT_LOG = 6;

// How hard an exploding object shoves whatever is standing near it.
const BLAST_RADIUS = 260;
const BLAST_FORCE = 0.026;

export function createRound(mapDef, seed, audio, names = [], opts = {}) {
  const rng = makeRng(hashSeed('round', seed));
  // No map has ambient gravity any more; the two that fell were deleted.
  const sim = createSim();

  const map = mapDef.build({ sim, seed, rng });

  /* The field is exactly the people in the box, and nobody else.
     It used to be the map that decided the population — a number between its
     own two bounds — and any object past the end of the roster simply went
     unnamed. That meant typing three names got you three names and twenty-odd
     strangers racing alongside them, which is not what anyone asked for.
     An idle round has no objects at all: the universe is drawn, and waits. */
  const idle = opts.idle === true;
  const count = idle ? 0 : names.length;
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
    idle,
    // Nothing to count in for when there is nobody on the start line. With a
    // field, the round waits on the line until someone presses start.
    phase: idle ? PHASE.RUNNING : PHASE.READY,
    time: 0,
    elapsed: 0,
    phaseTime: 0,
    aliveCount: count,
    out: [],
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

      // A short record of what just happened, for the feed on the left. Only
      // the last few matter — it is there to say who went out a moment ago,
      // not to keep a ledger of the whole round — so it is capped here rather
      // than left to grow for the reader to trim.
      round.out.unshift({
        name: player.name || player.col.name,
        crayon: player.col.crayon,
        kind,
        at: round.time,
      });
      if (round.out.length > OUT_LOG) round.out.length = OUT_LOG;

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

  // Shuffling on the line, like cups in a shell game. The spots stay where the
  // map put them; who stands on which one changes. It plays as a few passes of
  // pairs trading places along little arcs, so you can watch it happen rather
  // than just seeing the field blink into a new order. Each spot keeps its own
  // launch velocity, because that belongs to the place, not the person.
  const SHUFFLE_PASSES = 4;
  const SHUFFLE_PASS_MS = 420;
  let shuffle = null;

  function slots() {
    return players.filter((p) => p.body).map((p) => ({
      p,
      x: p.body.position.x,
      y: p.body.position.y,
      vel: p.spawnVel,
    }));
  }

  function planPass(field) {
    // Pair people off at random; an odd one out sits this pass out.
    const idx = field.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const moves = field.map((s) => ({ p: s.p, from: s, to: s }));
    for (let k = 0; k + 1 < idx.length; k += 2) {
      const a = idx[k];
      const b = idx[k + 1];
      moves[a].to = field[b];
      moves[b].to = field[a];
    }
    return moves;
  }

  function land(moves) {
    // Snap everyone onto their new spot and hand the spot its velocity.
    const next = [];
    for (const m of moves) {
      sim.Matter.Body.setPosition(m.p.body, { x: m.to.x, y: m.to.y });
      m.p.spawnVel = m.to.vel;
      next.push({ p: m.p, x: m.to.x, y: m.to.y, vel: m.to.vel });
    }
    return next;
  }

  round.shuffle = () => {
    if (round.phase !== PHASE.READY || shuffle) return false;
    const field = slots();
    if (field.length < 2) return false;
    shuffle = { pass: 0, t: 0, moves: planPass(field) };
    audio.poof();
    return true;
  };

  round.shuffling = () => shuffle !== null;

  function updateShuffle(dtMs) {
    shuffle.t += dtMs / SHUFFLE_PASS_MS;
    if (shuffle.t >= 1) {
      const field = land(shuffle.moves);
      shuffle.pass++;
      if (shuffle.pass >= SHUFFLE_PASSES) {
        shuffle = null;
        return;
      }
      shuffle.t = 0;
      shuffle.moves = planPass(field);
      audio.poof();
      return;
    }
    // Eased slide along a bowed path, so two people trading places pass each
    // other side by side instead of meeting head-on in the middle.
    const t = shuffle.t;
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const bow = Math.sin(Math.PI * t) * 0.22;
    for (const m of shuffle.moves) {
      if (m.to === m.from) continue;
      const dx = m.to.x - m.from.x;
      const dy = m.to.y - m.from.y;
      sim.Matter.Body.setPosition(m.p.body, {
        x: m.from.x + dx * e - dy * bow,
        y: m.from.y + dy * e + dx * bow,
      });
    }
  }

  // The only way out of READY. Returns false if there was nothing to start.
  round.start = () => {
    if (round.phase !== PHASE.READY) return false;
    // Pressing start mid-shuffle finishes it on the spot.
    if (shuffle) {
      land(shuffle.moves);
      shuffle = null;
    }
    round.phase = PHASE.COUNTDOWN;
    round.phaseTime = 0;
    return true;
  };

  round.update = function update(dtMs) {
    round.time += dtMs;

    if (round.phase === PHASE.READY) {
      // Only drives the fade-in on the line; the countdown keeps its own clock.
      round.phaseTime += dtMs;
      if (shuffle) updateShuffle(dtMs);
    } else if (round.phase === PHASE.COUNTDOWN) {
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
      // An idle universe still turns — the star breathes, the doors spin — but
      // its clock does not run. Letting elapsed climb would wind the pressure
      // up and close the ring around an arena with nobody in it.
      if (!round.idle) round.elapsed += dtMs;

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
