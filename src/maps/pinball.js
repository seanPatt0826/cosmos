// Cosmic Pinball — the ridiculous one.
//
// Bumpers, wormholes, spinning paddles, kick pads, a pocket of reversed
// gravity, and a hole in the floor. Everything is on at once. This is the map
// that produces the stories.

import { makeRng, hashSeed } from '../rng.js';
import { staticRect, staticCircle, add, addWell, onCollide } from '../engine.js';
import { bakeBumper, bakeBlackHole, bakePlatform, drawSprite, boilFrame } from '../sprites.js';
import { piece, drawPieces, drawEdge, platformPiece, subdivide } from './common.js';
import { strokeSketch, softGlow } from '../sketch.js';
import { PALETTE } from '../config.js';
import * as Particles from '../particles.js';
import {
  createPinwheel, updatePinwheels, drawPinwheels,
  createPulsar, updatePulsars, drawPulsars,
} from './hazards.js';

const W = 1180;
const H = 1560;
const FLOOR = H - 40;

// A wormhole mouth: three spiral arms, drawn once and then spun by rotating the
// blit. The drawing is symmetric about its centre, so a rotation is all the
// animation it ever needed.
function bakeWormhole(r, col, seed) {
  const pad = 1.15;
  const size = Math.ceil(r * 2 * pad);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const rng = makeRng(seed);
  const cx = size / 2;
  const cy = size / 2;
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const u = i / 26;
      const ang = k * 2.1 + u * 5.4;
      const rr = r * (1 - u * 0.86);
      pts.push({ x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr * 0.92 });
    }
    strokeSketch(g, pts, rng, {
      color: k === 1 ? '#F2EADB' : col.crayon, width: 2.6, passes: 2, alpha: 0.75, closed: false,
    });
  }
  return { canvas: c, worldSize: size };
}

export default {
  id: 'pinball',
  name: 'Cosmic Pinball',
  theme: 'pinball',
  population: [18, 28],
  blurb: 'everything at once',

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('pinball', seed));
    const pieces = [];
    const bumpers = [];
    const paddles = [];
    const flips = [];
    const cooldown = new Map();

    sim.engine.gravity.y = 0.40;

    // ── Shell ──────────────────────────────────────────────────────────────
    add(sim,
      staticRect(sim, -40, H / 2, 80, H + 400, { restitution: 0.8, friction: 0 }),
      staticRect(sim, W + 40, H / 2, 80, H + 400, { restitution: 0.8, friction: 0 }),
      staticRect(sim, W / 2, -60, W + 200, 120, { restitution: 0.7, friction: 0 }),
      staticRect(sim, W / 2, FLOOR + 60, W + 200, 120, { restitution: 0.72, friction: 0.01 }),
    );

    // ── Bumpers ────────────────────────────────────────────────────────────
    const bumpCount = rng.int(7, 9);
    for (let i = 0; i < bumpCount; i++) {
      const r = rng.range(34, 58);
      const x = rng.range(120, W - 120);
      const y = rng.range(230, H - 460);
      const col = rng.pick(PALETTE);
      const body = staticCircle(sim, x, y, r, { restitution: 1.25, friction: 0, label: 'bumper' });
      add(sim, body);
      const b = { body, r, col, sprite: bakeBumper(r, hashSeed('b', seed, i), col), boil: i % 3, flash: 0 };
      bumpers.push(b);
    }

    // ── Spinning paddles ───────────────────────────────────────────────────
    const paddleCount = rng.int(2, 3);
    for (let i = 0; i < paddleCount; i++) {
      const len = rng.range(230, 340);
      const x = rng.range(220, W - 220);
      const y = 380 + i * rng.range(330, 420);
      const body = staticRect(sim, x, y, len, 26, { restitution: 0.9, friction: 0.01, label: 'paddle' });
      add(sim, body);
      paddles.push({
        body,
        omega: rng.range(0.6, 1.5) * rng.sign(),
        angle: rng.range(0, Math.PI),
        piece: piece(bakePlatform(len, 26, hashSeed('pd', seed, i), { color: '#7FD6A5' }), body, { boil: i % 3 }),
      });
    }

    // ── Kick pads ──────────────────────────────────────────────────────────
    for (const side of [0, 1]) {
      const x = side ? W - 150 : 150;
      const y = H - 380;
      const angle = side ? -0.72 : 0.72;
      const p = platformPiece(sim, x, y, 300, 26, hashSeed('pad', seed, side), {
        angle, restitution: 1.45, color: '#FFC66B', label: 'pad',
      });
      add(sim, p.body);
      pieces.push(p);
      p.glow = '#FFE79B';
      p.glowR = 160;
    }

    // ── Wormholes ──────────────────────────────────────────────────────────
    const holes = [];
    const pairCount = 2;
    for (let i = 0; i < pairCount; i++) {
      const col = i === 0 ? PALETTE[7] : PALETTE[5];
      const a = { x: rng.range(120, W - 120), y: rng.range(300, H - 700), r: 42, col };
      const b = { x: rng.range(120, W - 120), y: rng.range(300, H - 700), r: 42, col };
      a.partner = b;
      b.partner = a;
      a.spin = rng.range(0.6, 1.2);
      b.spin = -a.spin;
      a.sprite = bakeWormhole(a.r, col, hashSeed('wh', seed, i, 0));
      b.sprite = bakeWormhole(b.r, col, hashSeed('wh', seed, i, 1));
      holes.push(a, b);
    }

    // ── Reversed gravity ───────────────────────────────────────────────────
    const flipCount = rng.int(1, 2);
    for (let i = 0; i < flipCount; i++) {
      flips.push({
        x: rng.range(160, W - 460),
        y: rng.range(500, H - 620),
        w: rng.range(280, 420),
        h: rng.range(220, 320),
        phase: rng.range(0, 6),
      });
    }

    // ── Turnstiles and a pulsar ────────────────────────────────────────────
    const wheels = [];
    for (let i = 0; i < rng.int(1, 2); i++) {
      const len = rng.range(180, 250);
      wheels.push(createPinwheel(
        sim,
        rng.range(len / 2 + 90, W - len / 2 - 90),
        rng.range(420, H - 520),
        len,
        hashSeed('pwb', seed, i),
        '#BFB2FF',
      ));
    }
    const pulsars = [createPulsar(
      sim, rng.range(220, W - 220), rng.range(500, H - 600), hashSeed('pulb', seed),
    )];

    // ── The hole in the floor ──────────────────────────────────────────────
    const well = addWell(sim, {
      x: W / 2, y: FLOOR + 30, mu: 7000, capture: 38, minR: 44, maxAccel: 1.1,
    });
    const wellSprite = bakeBlackHole(38, hashSeed("pbh", seed));

    // Side drains: not holes in the physics, just places you should not be.
    const drains = [
      { x: 84, w: 96 },
      { x: W - 84, w: 96 },
    ];

    onCollide(sim, (a, b, rel) => {
      for (const bump of bumpers) {
        if (a !== bump.body && b !== bump.body) continue;
        const other = a === bump.body ? b : a;
        if (other.isStatic) continue;
        const dx = other.position.x - bump.body.position.x;
        const dy = other.position.y - bump.body.position.y;
        const d = Math.hypot(dx, dy) || 1;
        // An honest kick outward, on top of the restitution.
        sim.Matter.Body.applyForce(other, other.position, {
          x: (dx / d) * other.mass * 0.011,
          y: (dy / d) * other.mass * 0.011,
        });
        bump.flash = 1;
      }
    });

    const bounds = { x: -60, y: -80, w: W + 120, h: H + 160 };

    return {
      bounds,
      time: 0,
      drainW: 1,
      floorGone: false,
      wormholes: true,

      spawn(n) {
        const out = [];
        const cols = Math.ceil(Math.sqrt(n * 1.5));
        for (let i = 0; i < n; i++) {
          const c = i % cols;
          const r = Math.floor(i / cols);
          out.push({
            x: 110 + (c + 0.5) * ((W - 220) / cols) + rng.wobble(10),
            y: 110 - r * 44,
            vx: rng.wobble(1.2),
            vy: 0,
          });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        const t = dt / 1000;
        const p = round.pressure;

        sim.engine.gravity.y = 0.40 + p * 0.42;
        well.capture = 38 * (1 + p * 0.75);
        this.drainW = 1 + p * 1.05;
        this.floorGone = p > 1;
        this.wormholes = p < 0.75;

        for (const pd of paddles) {
          pd.angle += pd.omega * t;
          sim.Matter.Body.setAngle(pd.body, pd.angle);
          sim.Matter.Body.setAngularVelocity(pd.body, pd.omega * t);
        }
        for (const b of bumpers) b.flash *= Math.pow(0.86, dt / 16.667);
        updatePinwheels(sim, wheels, dt);
        updatePulsars(sim, pulsars, dt, round.alivePlayers(), round.particles);

        for (const f of flips) f.phase += t * 0.7;

        for (const pl of round.alivePlayers()) {
          const b = pl.body;
          const pos = b.position;

          // Reversed gravity pockets: slightly more than cancelling, so bodies
          // hang and tumble rather than sink.
          for (const f of flips) {
            if (pos.x > f.x && pos.x < f.x + f.w && pos.y > f.y && pos.y < f.y + f.h) {
              sim.Matter.Body.applyForce(b, pos, { x: 0, y: -b.mass * 0.0014 });
            }
          }

          // Wormholes. Two things here are load-bearing.
          //
          // The exit is offset along the body's own heading, so it leaves the
          // far hole rather than materialising inside it and bouncing straight
          // back — which turned a wormhole pair into a perpetual elevator: fall
          // into the low one, pop out of the high one, repeat forever. A body
          // caught in that loop never touches the floor and the round never
          // ends. The second guard is that the pair collapses once the round
          // has run long enough, so the loop cannot outlive the map's patience.
          const cd = cooldown.get(pl.id) || 0;
          if (this.wormholes && this.time > cd) {
            for (const h of holes) {
              if (Math.hypot(pos.x - h.x, pos.y - h.y) < h.r) {
                const v = Math.hypot(b.velocity.x, b.velocity.y) || 1;
                const ox = (b.velocity.x / v) * h.r * 1.5;
                const oy = (b.velocity.y / v) * h.r * 1.5;
                Particles.burst(round.particles, pos.x, pos.y, h.col.glow, { count: 12, speed: 2.2 });
                sim.Matter.Body.setPosition(b, { x: h.partner.x + ox, y: h.partner.y + oy });
                Particles.burst(round.particles, h.partner.x, h.partner.y, h.col.glow, { count: 14, speed: 3 });
                cooldown.set(pl.id, this.time + 900);
                round.audio.whoosh();
                break;
              }
            }
          }

          // Down the hole.
          if (Math.hypot(pos.x - well.x, pos.y - well.y) < well.capture) {
            round.kill(pl, 'hole', { at: pos, target: { x: well.x, y: well.y } });
            continue;
          }
          // Down a side drain — and once the round has gone long enough, the
          // whole floor gives way. Without that last clause a body could settle
          // on the strip between a widened drain and the well's reach and sit
          // there forever, and the round would never end.
          if (pos.y > FLOOR - 18) {
            if (this.floorGone) {
              round.kill(pl, 'scribble', { at: pos });
              continue;
            }
            for (const d of drains) {
              if (Math.abs(pos.x - d.x) < (d.w * this.drainW) / 2) {
                round.kill(pl, 'scribble', { at: pos });
                break;
              }
            }
          }
          if (pos.y > H + 200 || pos.y < -400) round.kill(pl, 'drift', { at: pos });
        }
      },

      drawBack(g, cam, time) {
        drawEdge(g, [
          { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: FLOOR }, { x: 0, y: FLOOR },
        ], 8181, { color: '#C87FD6', width: 3, alpha: 0.4, closed: true, passes: 3 });

        // Reversed-gravity pockets, marked the way you would mark them in a
        // notebook: a dashed box and some arrows.
        for (const f of flips) {
          const rng2 = makeRng(hashSeed('flip', f.x, f.y));
          g.save();
          g.setLineDash([13, 11]);
          strokeSketch(g, subdivide([
            { x: f.x, y: f.y }, { x: f.x + f.w, y: f.y },
            { x: f.x + f.w, y: f.y + f.h }, { x: f.x, y: f.y + f.h },
          ], true), rng2, { color: '#7FD6A5', width: 2.4, passes: 2, alpha: 0.5, closed: true });
          g.restore();
          const n = Math.max(2, Math.round(f.w / 130));
          for (let i = 0; i < n; i++) {
            const ax = f.x + ((i + 0.5) / n) * f.w;
            const ay = f.y + f.h * 0.5 + Math.sin(f.phase + i) * 16;
            strokeSketch(g, [
              { x: ax, y: ay + 26 }, { x: ax, y: ay - 26 },
            ], rng2, { color: '#AAF0C9', width: 2.6, passes: 2, alpha: 0.55, closed: false });
            strokeSketch(g, [
              { x: ax - 11, y: ay - 12 }, { x: ax, y: ay - 28 }, { x: ax + 11, y: ay - 12 },
            ], rng2, { color: '#AAF0C9', width: 2.6, passes: 2, alpha: 0.55, closed: false });
          }
        }

        drawPieces(g, pieces, time);
        for (const pd of paddles) drawPieces(g, [pd.piece], time);
        drawPinwheels(g, wheels, time);
      },

      drawFront(g, cam, time) {
        // The spiral is baked and spun, not redrawn. Three arms of twenty-six
        // hand-drawn points, re-stroked twice, across four mouths came to some
        // six hundred curve segments every frame — on its own enough to halve
        // the frame rate on this map.
        for (const h of holes) {
          if (!this.wormholes) continue;
          const a = this.time * 0.002 * h.spin;
          softGlow(g, h.x, h.y, h.r * 2.1, h.col.glow, 0.3);
          const s = h.sprite.worldSize;
          g.save();
          g.translate(h.x, h.y);
          g.rotate(a);
          g.drawImage(h.sprite.canvas, -s / 2, -s / 2, s, s);
          g.restore();
        }

        for (const b of bumpers) {
          const s = 1 + b.flash * 0.16;
          if (b.flash > 0.02) softGlow(g, b.body.position.x, b.body.position.y, b.r * 3.4, b.col.glow, b.flash * 0.4);
          drawSprite(g, b.sprite, b.body.position.x, b.body.position.y, 0, s, 1, boilFrame(time, b.boil));
        }

        // Drains: scribbled mouths in the floor, widening as the round ages.
        const rngD = makeRng(hashSeed('drain', Math.floor(time / 120)));

        // Once the floor has gone, say so: the whole thing reads as one long
        // torn edge rather than two tidy mouths.
        if (this.floorGone) {
          g.save();
          g.globalAlpha = 0.9;
          g.fillStyle = '#0B0716';
          g.beginPath();
          g.ellipse(W / 2, FLOOR + 6, W / 2 + 30, 26, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
          const torn = [];
          for (let x = -30; x <= W + 30; x += 46) {
            torn.push({ x, y: FLOOR + rngD.wobble(13) });
          }
          strokeSketch(g, torn, rngD, {
            color: '#E0728C', width: 3, passes: 2, alpha: 0.7, closed: false, spread: 2.4,
          });
        }

        for (const d of drains) {
          if (this.floorGone) break;
          const w = d.w * this.drainW;
          g.save();
          g.globalAlpha = 0.85;
          g.fillStyle = '#0B0716';
          g.beginPath();
          g.ellipse(d.x, FLOOR, w / 2, 22, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
          strokeSketch(g, [
            { x: d.x - w / 2, y: FLOOR }, { x: d.x, y: FLOOR + 20 }, { x: d.x + w / 2, y: FLOOR },
          ], rngD, { color: '#E0728C', width: 2.8, passes: 2, alpha: 0.7, closed: false });
        }

        drawPulsars(g, pulsars, time);
        softGlow(g, well.x, well.y, well.capture * 5, '#7B4FCF', 0.26);
        drawSprite(g, wellSprite, well.x, well.y, 0, well.capture / 38, 1, boilFrame(time, 1));
      },
    };
  },
};
