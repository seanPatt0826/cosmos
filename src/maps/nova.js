// Supernova — the one that breathes.
//
// A single star sits in the middle and cannot make up its mind. It spends a few
// seconds inhaling: the pull strengthens, the core swells, and everything in
// the arena is dragged into a tighter and tighter huddle. Then it lets go, and
// a shockwave throws the whole huddle back out again.
//
// The appeal is that you can see it coming. The charge is slow and visible, so
// the interesting question is never "what happened" but "who is closest to the
// middle when it goes". Objects flung outward may not have room to stop, and
// the ring is always closing, so a blast that was survivable a minute ago is
// the one that finally clears the board.
//
// Nothing here is scripted: the star keeps its rhythm regardless of who is
// where, and the eliminations fall out of who happened to be standing in the
// wrong place when it did.

import { makeRng, hashSeed } from '../rng.js';
import { staticCircle, add, addWell } from '../engine.js';
import { drawRing } from './common.js';
import { softGlow, strokeSketch } from '../sketch.js';
import * as Particles from '../particles.js';
import { createStuckWatch, createNebula, applyNebula, drawNebula } from './hazards.js';

const ARENA = 1320;        // starting radius of the ring
const ARENA_MIN = 840;     // where it has closed to at full pressure
const CORE_R = 44;         // the physical star; the glow is drawn much larger

// Inhale, then blow. The charge shortens as the round ages, so the last few
// objects are dealing with a star that barely pauses between blasts.
const CHARGE_MS = 4200;
const CHARGE_MIN_MS = 1900;
const WAVE_SPEED = 1.95;   // px per ms — fast enough to read as a bang
const WAVE_BAND = 120;     // how thick the wavefront is when it hits you

const MU_REST = 9000;      // pull while it is collapsed and harmless
const MU_PEAK = 46000;     // pull at the top of the charge

// Peak outward acceleration at the very centre, falling to nothing at the ring.
// For scale, a pulsar's hardest shove is 0.02 — and that only reaches 340px.
const BLAST_PEAK = 0.03;

export default {
  id: 'nova',
  name: 'Supernova',
  theme: 'nova',
  population: [20, 28],
  blurb: 'it breathes in',

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('nova', seed));
    const bounds = { x: -ARENA, y: -ARENA, w: ARENA * 2, h: ARENA * 2 };

    // The star is solid. Being pulled all the way in is not fatal on its own —
    // you bounce — but it parks you at the exact centre, which is the worst
    // place to be standing when the thing goes off.
    const core = staticCircle(sim, 0, 0, CORE_R, {
      restitution: 1.05, friction: 0, label: 'star',
    });
    add(sim, core);

    const well = addWell(sim, { x: 0, y: 0, mu: MU_REST, capture: 0, maxAccel: 0.95 });

    // Two dust clouds well off-centre. They bleed speed, so an object thrown
    // into one by a blast loses the momentum it needed to come back — the only
    // thing on this map that punishes you slowly rather than all at once.
    const nebulae = [];
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2) + i * Math.PI;
      const d = rng.range(0.52, 0.72);
      nebulae.push(createNebula(
        Math.cos(a) * ARENA * d,
        Math.sin(a) * ARENA * d,
        rng.range(190, 260),
        hashSeed('novaneb', seed, i),
      ));
    }

    const stuckWatch = createStuckWatch();

    return {
      bounds,
      time: 0,
      edge: ARENA,

      // Charge state. `wave` is null between blasts; during one it is the
      // current radius of the shockwave.
      charge: 0,
      wave: null,
      shoved: new Set(),
      flash: 0,

      spawn(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          // A ring well clear of the star, moving sideways, so the opening
          // seconds are a slow spiral inward rather than a straight drop.
          const a = (i / n) * Math.PI * 2 + rng.wobble(0.12);
          const d = ARENA * (0.72 + rng.wobble(0.05));
          out.push({
            x: Math.cos(a) * d,
            y: Math.sin(a) * d,
            vx: -Math.sin(a) * rng.range(2.2, 3.6),
            vy: Math.cos(a) * rng.range(2.2, 3.6),
          });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        this.flash = Math.max(0, this.flash - dt / 500);

        const p = round.pressure;
        const alive = round.alivePlayers();

        this.edge = ARENA - (p / 3.2) * (ARENA - ARENA_MIN);

        applyNebula(sim, nebulae, alive, dt);

        if (this.wave === null) {
          this.inhale(dt, p, round);
        } else {
          this.blow(dt, alive);
        }

        this.judge(dt, round);
      },

      // ── Inhaling ────────────────────────────────────────────────────────
      inhale(dt, p, round) {
        const chargeMs = CHARGE_MS - (p / 3.2) * (CHARGE_MS - CHARGE_MIN_MS);
        this.charge = Math.min(1, this.charge + dt / chargeMs);
        // Eased so most of the pull arrives late: the huddle forms quickly
        // and then everyone sits in it, waiting.
        const k = this.charge * this.charge;
        well.mu = MU_REST + (MU_PEAK - MU_REST) * k;

        if (this.charge < 1) return;

        this.wave = 0;
        this.charge = 0;
        this.flash = 1;
        this.shoved.clear();
        well.mu = 0;                  // the star lets go entirely
        Particles.burst(round.particles, 0, 0, '#FFD9A0', {
          count: 22, speed: 5.4, ringTo: this.edge * 0.9, ringLife: 900,
        });
      },

      // ── Blowing out ─────────────────────────────────────────────────────
      blow(dt, alive) {
        this.wave += WAVE_SPEED * dt;

        for (const pl of alive) {
          if (!pl.body) continue;
          if (this.shoved.has(pl.body.id)) continue;
          const pos = pl.body.position;
          const d = Math.hypot(pos.x, pos.y);
          // Only the objects the wavefront is passing right now get hit, and
          // each gets hit once — otherwise a slow body riding the front would
          // be accelerated forever.
          if (Math.abs(d - this.wave) > WAVE_BAND) continue;
          this.shoved.add(pl.body.id);
          if (d < 1) continue;
          /* Falls away sharply with distance, and reaches nothing at the ring.
             The first tuning shoved everything almost equally hard and a single
             blast threw the entire field over the edge at once — twenty-two
             objects between two samples, which is a coin toss rather than a
             round. The blast is now a scattering force on the huddle in the
             middle; the closing ring is what actually eliminates, so attrition
             stays gradual and the objects most at risk are the ones the star
             has least hold over. */
          const reach = Math.max(0, 1 - Math.min(1, d / this.edge));
          const strength = BLAST_PEAK * reach * reach;
          sim.Matter.Body.applyForce(pl.body, pos, {
            x: (pos.x / d) * pl.body.mass * strength,
            y: (pos.y / d) * pl.body.mass * strength,
          });
        }

        if (this.wave > this.edge + WAVE_BAND) {
          this.wave = null;
          well.mu = MU_REST;
        }
      },

      // Both eliminations live at the end of update, the way every other map
      // does it: drift past the closing ring, or sit still long enough that
      // the stuck watch gives up on you.
      judge(dt, round) {
        for (const pl of round.alivePlayers()) {
          const pos = pl.body.position;
          if (Math.hypot(pos.x, pos.y) > this.edge) round.kill(pl, 'drift', { at: pos });
        }
        stuckWatch(round.alivePlayers(), dt, (pl) => {
          round.kill(pl, 'boom', { at: pl.body.position });
        });
      },

      drawBack(g) {
        drawRing(g, 0, 0, this.edge, 71, { color: '#E0925E', alpha: 0.42, width: 2.8 });
        drawRing(g, 0, 0, this.edge + 16, 72, {
          color: '#E0925E', alpha: 0.13, width: 1.4, passes: 1,
        });
        drawNebula(g, nebulae, this.time);
      },

      drawFront(g, cam, time) {
        // The core. It swells as it charges and snaps back the instant it
        // blows, so the size of the star is the countdown.
        const swell = 1 + this.charge * 0.55 + this.flash * 0.35;
        const hot = this.flash > 0.02;

        softGlow(g, 0, 0, CORE_R * (5.2 + this.charge * 5) * swell, '#FF9E4A',
          0.10 + this.charge * 0.20 + this.flash * 0.34);
        softGlow(g, 0, 0, CORE_R * 2.4 * swell, '#FFE7BE', 0.30 + this.flash * 0.5);

        const rng = makeRng(hashSeed('novacore', Math.round(this.time / 90)));
        const pts = [];
        const seg = 34;
        for (let i = 0; i < seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          const rr = CORE_R * swell * (1 + rng.wobble(0.06));
          pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
        }
        strokeSketch(g, pts, rng, {
          color: hot ? '#FFFFFF' : '#FFD79A',
          width: 2.4, passes: 2, alpha: 0.75, closed: true, spread: 1.3,
        });

        // The shockwave itself: one hand-drawn ring travelling outward.
        if (this.wave !== null) {
          const fade = Math.max(0, 1 - this.wave / (this.edge + WAVE_BAND));
          const wr = makeRng(hashSeed('novawave', Math.round(this.wave / 12)));
          const wpts = [];
          const wseg = Math.max(40, Math.round(this.wave / 7));
          for (let i = 0; i < wseg; i++) {
            const a = (i / wseg) * Math.PI * 2;
            const rr = this.wave * (1 + wr.wobble(0.02));
            wpts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
          }
          strokeSketch(g, wpts, wr, {
            color: '#FFC98A', width: 1 + fade * 3.2, passes: 2,
            alpha: 0.25 + fade * 0.45, closed: true, spread: 1.6,
          });
          softGlow(g, 0, 0, this.wave, '#FF9E4A', fade * 0.10);
        }
      },
    };
  },
};
