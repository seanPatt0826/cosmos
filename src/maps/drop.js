// Cosmic Drop — the one closest to classic marble roulette.
//
// A long shaft. Everyone falls. Platforms, pegs and bouncers scatter the pack,
// gaps in the walls swallow the unlucky, and a nebula tide sweeps down from
// above so nobody survives by getting stuck on a ledge.

import { makeRng, hashSeed } from '../rng.js';
import { staticRect, staticCircle, add } from '../engine.js';
import { bakePlatform, bakePeg } from '../sprites.js';
import { piece, drawPieces, drawEdge, platformPiece } from './common.js';
import { strokeSketch, hexToRgba, softGlow } from '../sketch.js';
import {
  createHole, updateHoles, holeCapturing, drawHoles,
  createPinwheel, updatePinwheels, drawPinwheels,
  createCrumble, touchCrumble, updateCrumbles, drawCrumbles,
} from './hazards.js';
import { onCollide } from '../engine.js';

const W = 860;
const SEG = 470;
const SEGMENTS = 22;
const HEIGHT = SEG * SEGMENTS;
const GAP_H = 210;

export default {
  id: 'drop',
  name: 'Cosmic Drop',
  theme: 'drop',
  population: [18, 26],
  blurb: 'everyone falls',

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('drop', seed));
    const pieces = [];
    const gaps = [];
    const movers = [];
    const wheels = [];
    const crumbles = [];
    const holes = [];

    // ── Walls, with holes punched in them ──────────────────────────────────
    for (const side of [0, 1]) {
      const x = side ? W : 0;
      let cursor = -400;
      for (let s = 0; s < SEGMENTS; s++) {
        const top = s * SEG;
        const hasGap = s > 1 && rng() < 0.34;
        if (hasGap) {
          const gy = top + rng.range(60, SEG - GAP_H - 60);
          gaps.push({ side, y0: gy, y1: gy + GAP_H });
          addWallRun(sim, x, cursor, gy, side);
          cursor = gy + GAP_H;
        }
      }
      addWallRun(sim, x, cursor, HEIGHT + 400, side);
    }

    // ── Floor, so the stragglers have somewhere to be caught ───────────────
    add(sim, staticRect(sim, W / 2, HEIGHT + 60, W + 400, 120, { restitution: 0.5 }));
    pieces.push(piece(bakePlatform(W + 100, 40, 991, { color: '#6E7BB8' }), null, {
      x: W / 2, y: HEIGHT + 20, angle: 0,
    }));

    // ── The course ─────────────────────────────────────────────────────────
    for (let s = 1; s < SEGMENTS; s++) {
      const top = s * SEG;
      const n = rng.int(2, 3);
      for (let i = 0; i < n; i++) {
        const w = rng.range(150, 310);
        const h = 22;
        const x = rng.range(w / 2 + 40, W - w / 2 - 40);
        const y = top + rng.range(70, SEG - 90);
        const angle = rng.wobble(0.3);

        // Some ledges are not to be trusted. Land on one and it cracks, then
        // drops away — and comes back a few seconds later.
        if (rng() < 0.24) {
          crumbles.push(createCrumble(sim, x, y, w, h, hashSeed('cr', s, i), { angle }));
          continue;
        }

        const bouncy = rng() < 0.3;
        const p = platformPiece(sim, x, y, w, h, hashSeed('p', s, i), {
          angle,
          restitution: bouncy ? 1.12 : 0.5,
          color: bouncy ? '#F2D06B' : '#8FA3C8',
          label: bouncy ? 'bouncer' : 'platform',
        });
        p.bouncy = bouncy;
        if (bouncy) {
          p.glow = '#FFE79B';
          p.glowR = w * 0.55;
        }
        add(sim, p.body);
        pieces.push(p);

        // A third of them slide side to side.
        if (rng() < 0.34) {
          movers.push({
            p,
            x0: x,
            range: rng.range(60, Math.min(190, W / 2 - w / 2 - 60)),
            speed: rng.range(0.35, 0.95) * (rng.sign()),
            phase: rng.range(0, Math.PI * 2),
          });
        }
      }

      const pegs = rng.int(1, 4);
      for (let i = 0; i < pegs; i++) {
        const r = rng.range(13, 26);
        const x = rng.range(50, W - 50);
        const y = top + rng.range(40, SEG - 40);
        const body = staticCircle(sim, x, y, r, { restitution: 0.95 });
        add(sim, body);
        pieces.push(piece(bakePeg(r, hashSeed('peg', s, i), '#B9A3E8'), body));
      }

      // A turnstile every few segments, well clear of the walls so it has room
      // to swing without permanently sealing the shaft.
      if (s > 1 && rng() < 0.13) {
        const len = rng.range(170, 240);
        wheels.push(createPinwheel(
          sim,
          rng.range(len / 2 + 60, W - len / 2 - 60),
          top + rng.range(120, SEG - 120),
          len,
          hashSeed('pw', s),
          rng.pick(['#7FD6A5', '#BFB2FF', '#FFC66B']),
        ));
      }
    }

    // ── Black holes in the shaft ───────────────────────────────────────────
    //
    // These are funnels, not the free-standing wells the open maps use. The
    // first version pulled from range in a shaft only 860 wide, which held
    // objects circling at the mouth instead of ever swallowing them — the
    // mechanic worked, but it read as the object being stuck.
    //
    // So: no pull at all beyond `reach`, a firm one inside it, and a mouth wide
    // enough that anything drawn in is gone within a moment. They now either
    // eat you or let you fall past.
    const holeCount = rng.int(2, 3);
    const used = [];
    for (let i = 0; i < holeCount; i++) {
      let s = 0;
      for (let attempt = 0; attempt < 30; attempt++) {
        s = rng.int(3, SEGMENTS - 2);
        if (used.every((u) => Math.abs(u - s) > 2)) break;
      }
      used.push(s);
      // Big enough to read as a hole rather than a smudge, and to be a decision
      // point in the fall.
      const r = rng.range(38, 52);
      const h = createHole(sim, {
        x: rng.range(190, W - 190),
        y: s * SEG + rng.range(150, SEG - 150),
        r,
        seed: hashSeed('dbh', seed, i),
        mu: r * 260,
        maxAccel: 0.9,
      });
      h.well.reach = r * 3.4;
      holes.push(h);
    }

    onCollide(sim, (a, b) => touchCrumble(crumbles, a, b));

    const bounds = { x: -120, y: -200, w: W + 240, h: HEIGHT + 500 };

    const state = {
      bounds,
      tide: -820,
      tideSpeed: 26,
      time: 0,
      gaps,

      spawn(n) {
        const out = [];
        const cols = Math.ceil(Math.sqrt(n * 1.6));
        for (let i = 0; i < n; i++) {
          const c = i % cols;
          const r = Math.floor(i / cols);
          out.push({
            x: 90 + (c + 0.5) * ((W - 180) / cols) + rng.wobble(12),
            y: 60 - r * 46,
            vx: rng.wobble(0.6),
            vy: 0,
          });
        }
        return out;
      },

      update(dt, round) {
        state.time += dt;
        const t = dt / 1000;

        for (const m of movers) {
          m.phase += m.speed * t;
          const nx = m.x0 + Math.sin(m.phase) * m.range;
          const vx = (nx - m.p.body.position.x) / (dt || 16);
          sim.Matter.Body.setPosition(m.p.body, { x: nx, y: m.p.body.position.y });
          // Static bodies need their velocity set by hand or the solver sees a
          // stationary wall and gives the player no push.
          sim.Matter.Body.setVelocity(m.p.body, { x: vx * 16, y: 0 });
        }

        // The tide chases the pack rather than descending on a fixed schedule.
        // Left to a timer it would either outrun everyone in the first segment
        // or dawdle thousands of pixels behind while the survivors sat on the
        // floor with nothing happening. Following the lowest player keeps it on
        // screen, and shrinking its lead is what closes the round out.
        const living = round.alivePlayers();
        let lowest = state.tide;
        for (const p of living) lowest = Math.max(lowest, p.body.position.y);
        const lead = 1500 - round.pressure * 1150;
        state.tideSpeed = 90 + round.pressure * 260;
        state.tide = Math.max(
          state.tide,
          Math.min(lowest - lead, state.tide + state.tideSpeed * t),
        );

        updatePinwheels(sim, wheels, dt);
        updateCrumbles(sim, crumbles, dt, round.particles);
        // Holes here neither grow nor drift: the shaft is narrow enough that a
        // spreading horizon would simply block it.
        updateHoles(holes, dt, round.pressure, state.bounds, round.particles,
          { grow: 0.25, muGrow: 0.3 });

        // Topmost first, so the player who has fallen furthest is the one left
        // standing when a sweep would otherwise take everybody at once.
        const alive = round.alivePlayers().sort((a, b) => a.body.position.y - b.body.position.y);
        for (const p of alive) {
          const pos = p.body.position;
          if (pos.y < state.tide) {
            round.kill(p, 'scribble', { at: pos });
            continue;
          }
          if (pos.x < -70 || pos.x > W + 70) {
            round.kill(p, 'drift', { at: pos });
            continue;
          }
          const h = holeCapturing(holes, pos);
          if (h) round.kill(p, 'hole', { at: pos, target: { x: h.well.x, y: h.well.y } });
        }
      },

      drawBack(g, cam, time) {
        drawPieces(g, pieces, time);

        // The shaft walls, drawn as continuous runs. Each run is a solid line
        // with a rounded end, so a break in the wall reads as a doorway rather
        // than as the drawing having given up.
        for (const side of [0, 1]) {
          const x = side ? W : 0;
          for (const [a, b] of wallRuns(gaps, side)) {
            drawEdge(g, [
              { x, y: a }, { x, y: (a + b) / 2 }, { x, y: b },
            ], hashSeed('w', side, a), { color: '#8B93D0', width: 4, alpha: 0.62, passes: 3 });
          }
        }

        // The openings themselves. The previous version put a small angled tick
        // at each lip, which at any distance read as stray pen marks flicked
        // across the page. A soft outward wash instead: unmistakably a way out,
        // and it does not litter the shaft.
        for (const gap of gaps) {
          const x = gap.side ? W : 0;
          const dir = gap.side ? 1 : -1;
          const my = (gap.y0 + gap.y1) / 2;
          const reach = 150;
          const rh = (gap.y1 - gap.y0) * 0.62;
          // An ellipse rather than a filled rect. A rect fades sideways but
          // keeps hard top and bottom edges, which reads as a pink block stuck
          // to the wall instead of light leaking out of a doorway.
          g.save();
          g.translate(x + dir * 24, my);
          g.scale(1, rh / reach);
          const grad = g.createRadialGradient(0, 0, 0, 0, 0, reach);
          grad.addColorStop(0, hexToRgba('#E0728C', 0.34));
          grad.addColorStop(0.45, hexToRgba('#E0728C', 0.13));
          grad.addColorStop(1, hexToRgba('#E0728C', 0));
          g.fillStyle = grad;
          g.beginPath();
          g.arc(0, 0, reach, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      },

      drawFront(g, cam, time) {
        drawCrumbles(g, crumbles, time);
        drawPinwheels(g, wheels, time);
        drawHoles(g, holes, time);
        drawTide(g, state.tide, time);
      },
    };

    return state;
  },
};

function addWallRun(sim, x, y0, y1, side) {
  if (y1 - y0 < 4) return;
  const h = y1 - y0;
  add(sim, staticRect(sim, x + (side ? 30 : -30), y0 + h / 2, 60, h, { restitution: 0.5 }));
}

function wallRuns(gaps, side) {
  const mine = gaps.filter((g) => g.side === side).sort((a, b) => a.y0 - b.y0);
  const runs = [];
  let cursor = -400;
  for (const g of mine) {
    runs.push([cursor, g.y0]);
    cursor = g.y1;
  }
  runs.push([cursor, HEIGHT + 400]);
  return runs.filter(([a, b]) => b - a > 8);
}

function drawTide(g, tide, time) {
  const left = -400;
  const right = W + 400;

  // Everything above the line is already gone.
  const grad = g.createLinearGradient(0, tide - 900, 0, tide);
  grad.addColorStop(0, hexToRgba('#2A1B4E', 0.86));
  grad.addColorStop(0.72, hexToRgba('#6B3A8C', 0.5));
  grad.addColorStop(1, hexToRgba('#C77BD6', 0.14));
  g.save();
  g.fillStyle = grad;
  g.fillRect(left, tide - 900, right - left, 900);
  g.restore();

  const rng = makeRng(hashSeed('tide', Math.floor(time / 90)));
  const pts = [];
  for (let x = left; x <= right; x += 44) {
    const w1 = Math.sin((x + time * 0.09) * 0.006) * 13;
    const w2 = Math.sin((x - time * 0.14) * 0.013) * 7;
    pts.push({ x, y: tide + w1 + w2 + rng.wobble(3) });
  }
  softGlow(g, W / 2, tide, 560, '#C77BD6', 0.16);
  strokeSketch(g, pts, rng, { color: '#E4A8EE', width: 3.4, passes: 3, alpha: 0.85, closed: false, spread: 2.2 });
  strokeSketch(g, pts.map((p) => ({ x: p.x, y: p.y - 13 })), rng, {
    color: '#FFC66B', width: 1.8, passes: 2, alpha: 0.4, closed: false, spread: 2.6,
  });
}
