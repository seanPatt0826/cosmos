// Snowy Night — the winter one.
//
// A round room on a snowy night with a Christmas tree in the middle. Snowmen
// stand about as bumpers and bat racers away, Santa's sleigh tears through
// now and then, and two holes in the ice swallow anyone who slides in. The
// ring closes as the round goes on and has gaps to be thrown out through.
//
// Built from the same parts as the other universes: bumpers (Bumper Field),
// a comet for the sleigh, black holes for the ice holes, an arc fence for the
// ring. Only the drawing is new, so its pace is the familiar one.

import { makeRng, hashSeed } from '../rng.js';
import { staticCircle, add, onCollide } from '../engine.js';
import { drawRing } from './common.js';
import { softGlow } from '../sketch.js';
import {
  createHole, updateHoles, holeCapturing,
  createComet, updateComets,
  createStuckWatch,
  createArcFence, drawFence,
} from './hazards.js';

const ARENA = 1500;
const TREE_R = 78;
const SNOWMAN_R = 46;
const FLAKES = 140;

export default {
  id: 'snow',
  name: 'Snowy Night',
  theme: 'snow',
  population: [20, 30],
  blurb: 'mind the ice',
  rules: {
    out: 'Sliding into a hole in the ice, or being thrown past the ring.',
    watch: 'Snowmen bat you away, and Santa\'s sleigh tears through now and then.',
  },
  description: 'A snowy night round a Christmas tree: snowmen bounce you, Santa\'s sleigh barges through, and holes in the ice swallow you.',

  build({ sim, seed }) {
    const rng = makeRng(hashSeed('snow', seed));
    const bounds = { x: -ARENA, y: -ARENA, w: ARENA * 2, h: ARENA * 2 };

    // The tree in the middle: solid, so the field flows round it.
    const tree = staticCircle(sim, 0, 0, TREE_R, { restitution: 0.9, friction: 0, label: 'tree' });
    add(sim, tree);

    // Two holes in the ice, on opposite sides, drifting slowly.
    const holes = [];
    const holeTurn = rng() * Math.PI * 2;
    for (let i = 0; i < 2; i++) {
      const a = holeTurn + i * Math.PI + rng.wobble(0.5);
      const d = rng.range(420, 760);
      const r = rng.range(30, 38);
      holes.push(createHole(sim, {
        x: Math.cos(a) * d, y: Math.sin(a) * d, r,
        seed: hashSeed('ice', seed, i),
        drift: 0.35,
        mu: r * 160,
        maxAccel: 0.85,
      }));
    }

    // Snowmen round the tree, kept clear of the holes and of each other.
    const snowmen = [];
    const count = rng.int(6, 8);
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 30; attempt++) {
        const a = (i / count) * Math.PI * 2 + rng.wobble(0.4);
        const d = rng.range(330, 1050);
        const x = Math.cos(a) * d;
        const y = Math.sin(a) * d;
        const clear = holes.every((h) => Math.hypot(x - h.well.x, y - h.well.y) > 220)
          && snowmen.every((s) => Math.hypot(x - s.x, y - s.y) > 200);
        if (!clear) continue;
        const body = staticCircle(sim, x, y, SNOWMAN_R, { restitution: 1.12, friction: 0, label: 'snowman' });
        add(sim, body);
        snowmen.push({ x, y, body, flash: 0, tilt: rng.wobble(0.15), hat: rng() < 0.5 });
        break;
      }
    }

    // A bump off a snowman is a real kick, as off Bumper Field's bumpers.
    onCollide(sim, (a, b) => {
      for (const s of snowmen) {
        if (a !== s.body && b !== s.body) continue;
        const other = a === s.body ? b : a;
        if (other.isStatic) continue;
        const dx = other.position.x - s.x;
        const dy = other.position.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        sim.Matter.Body.applyForce(other, other.position, {
          x: (dx / d) * other.mass * 0.006,
          y: (dy / d) * other.mass * 0.006,
        });
        s.flash = 1;
      }
    });

    // Santa's sleigh: a comet with a sleigh drawn on it, trailing sparkles.
    const sleigh = createComet(sim, bounds, hashSeed('sleigh', seed), '#FFFFFF');

    const fence = createArcFence(sim, {
      radius: ARENA,
      arcs: 5,
      openFrac: 0.3,
      colour: '#BFE3F2',
      seed: hashSeed('snowfence', seed),
    });

    const stuckWatch = createStuckWatch({ travel: 40, windowMs: 8000 });

    // Snow, falling the whole time: fixed flakes that loop top to bottom.
    const flakes = Array.from({ length: FLAKES }, () => ({
      x: rng.range(-ARENA, ARENA),
      y: rng.range(-ARENA, ARENA),
      r: rng.range(2, 6),
      fall: rng.range(0.03, 0.08),
      sway: rng() * Math.PI * 2,
      alpha: rng.range(0.35, 0.85),
    }));

    return {
      bounds,
      time: 0,
      edge: ARENA,

      spawn(n) {
        const out = [];
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * Math.PI * 2;
          const d = ARENA * 0.82;
          out.push({
            x: Math.cos(a) * d,
            y: Math.sin(a) * d,
            vx: -Math.cos(a) * rng.range(1.5, 2.8) + rng.wobble(0.6),
            vy: -Math.sin(a) * rng.range(1.5, 2.8) + rng.wobble(0.6),
          });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        const p = round.pressure;
        this.edge = ARENA - p * (ARENA - 880);
        fence.update(dt, this.edge, p, round.particles);
        for (const s of snowmen) s.flash *= Math.pow(0.86, dt / 16.667);

        updateHoles(holes, dt, p, bounds, round.particles, { grow: 0.35, muGrow: 0.5 });
        // Holes stay inside the ring and out of the tree.
        for (const h of holes) {
          const d = Math.hypot(h.well.x, h.well.y) || 1;
          const limit = this.edge - h.well.capture - 120;
          const inner = TREE_R + h.well.capture + 90;
          if (d > limit || d < inner) {
            const to = Math.max(inner, Math.min(limit, d));
            h.well.x = (h.well.x / d) * to;
            h.well.y = (h.well.y / d) * to;
            h.vx *= -1;
            h.vy *= -1;
          }
        }
        updateComets(sim, [sleigh], dt, round.particles);

        for (const pl of round.alivePlayers()) {
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
        // Snow on the ground: a pale wash over the room.
        g.save();
        g.globalAlpha = 0.07;
        g.fillStyle = '#E8F4FA';
        g.beginPath();
        g.arc(0, 0, this.edge, 0, Math.PI * 2);
        g.fill();
        g.restore();
        drawFence(g, fence);
        drawRing(g, 0, 0, this.edge, 71, { color: '#BFE3F2', alpha: 0.45, width: 2.8 });
        // Falling snow.
        g.save();
        g.fillStyle = '#FFFFFF';
        for (const f of flakes) {
          const span = ARENA * 2;
          const y = ((((f.y + ARENA + time * f.fall) % span) + span) % span) - ARENA;
          const x = f.x + Math.sin(time * 0.0009 + f.sway) * 24;
          g.globalAlpha = f.alpha;
          g.beginPath();
          g.arc(x, y, f.r, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      },

      drawFront(g, cam, time) {
        for (const h of holes) drawIceHole(g, h, time);
        drawTree(g, time);
        for (const s of snowmen) drawSnowman(g, s);
        if (sleigh.active) drawSleigh(g, sleigh);
      },
    };
  },
};

// A hole in the ice: dark water ringed by a jagged white edge.
function drawIceHole(g, h, time) {
  const { x, y, capture: r } = h.well;
  softGlow(g, x, y, r * 3.2, '#5BB8E0', 0.18);
  g.save();
  g.fillStyle = '#071423';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(155, 225, 255, 0.55)';
  g.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    g.arc(x, y, r * (0.35 + k * 0.2), time * 0.002 * (k + 1), time * 0.002 * (k + 1) + Math.PI * 1.2);
    g.stroke();
  }
  g.strokeStyle = '#EAF7FD';
  g.lineWidth = 4;
  g.beginPath();
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (1.08 + (i % 2 ? 0.14 : 0));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.stroke();
  g.restore();
}

// The Christmas tree, three tiers, a star that twinkles, a few baubles.
function drawTree(g, time) {
  const R = TREE_R;
  g.save();
  softGlow(g, 0, -R * 0.2, R * 3, '#F2D06B', 0.12 + 0.05 * Math.sin(time * 0.003));
  g.fillStyle = '#6E4630';
  g.fillRect(-R * 0.16, R * 0.55, R * 0.32, R * 0.4);
  g.strokeStyle = '#F2EADB';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  const tiers = [[0.95, 0.55, -0.15], [0.75, 0.05, -0.55], [0.52, -0.42, -0.95]];
  for (const [w, base, top] of tiers) {
    g.fillStyle = '#2F7A4F';
    g.beginPath();
    g.moveTo(-R * w, R * base);
    g.lineTo(0, R * top);
    g.lineTo(R * w, R * base);
    g.closePath();
    g.fill();
    g.stroke();
  }
  const baubles = [[-0.45, 0.35, '#E0728C'], [0.4, 0.3, '#9BE1FF'], [-0.2, -0.15, '#F2D06B'], [0.25, -0.35, '#E0728C'], [0.05, 0.15, '#C77BD6']];
  for (const [bx, by, c] of baubles) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(R * bx, R * by, 6, 0, Math.PI * 2);
    g.fill();
  }
  // The star.
  const tw = 1 + 0.15 * Math.sin(time * 0.006);
  g.translate(0, -R * 1.02);
  g.scale(tw, tw);
  g.fillStyle = '#F2D06B';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? 7 : 16;
    if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.restore();
}

// A snowman: two snowballs, coal eyes, a carrot nose, and sometimes a hat.
// Lights up for a moment when someone bounces off.
function drawSnowman(g, s) {
  const R = SNOWMAN_R;
  g.save();
  g.translate(s.x, s.y);
  g.rotate(s.tilt);
  if (s.flash > 0.02) softGlow(g, 0, 0, R * 3, '#BFE3F2', s.flash * 0.45);
  const grow = 1 + s.flash * 0.1;
  g.scale(grow, grow);
  g.fillStyle = '#F4F9FC';
  g.strokeStyle = '#9FB7C8';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, R * 0.32, R * 0.78, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(0, -R * 0.62, R * 0.5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#1D1A24';
  for (const ex of [-0.17, 0.17]) {
    g.beginPath();
    g.arc(R * ex, -R * 0.7, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  for (const by of [0.05, 0.32, 0.6]) {
    g.beginPath();
    g.arc(0, R * by, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#EE8E5A';
  g.beginPath();
  g.moveTo(0, -R * 0.6);
  g.lineTo(R * 0.4, -R * 0.55);
  g.lineTo(0, -R * 0.5);
  g.closePath();
  g.fill();
  g.fillStyle = '#E0728C';
  g.fillRect(-R * 0.42, -R * 0.22, R * 0.84, R * 0.12);
  if (s.hat) {
    g.fillStyle = '#1D1A24';
    g.fillRect(-R * 0.42, -R * 1.08, R * 0.84, R * 0.08);
    g.fillRect(-R * 0.28, -R * 1.42, R * 0.56, R * 0.36);
  }
  g.restore();
}

// Santa's sleigh, pointed the way it is going.
function drawSleigh(g, c) {
  const { x, y } = c.body.position;
  const v = c.body.velocity;
  const a = Math.atan2(v.y, v.x);
  const flip = Math.cos(a) < 0 ? -1 : 1;
  g.save();
  softGlow(g, x, y, 90, '#FFE79B', 0.25);
  g.translate(x, y);
  g.rotate(a);
  g.scale(1, flip);
  g.lineJoin = 'round';
  g.strokeStyle = '#F2EADB';
  g.lineWidth = 3;
  // Body.
  g.fillStyle = '#D2423A';
  g.beginPath();
  g.moveTo(-34, -10);
  g.lineTo(18, -10);
  g.quadraticCurveTo(34, -10, 30, 8);
  g.lineTo(-30, 8);
  g.quadraticCurveTo(-40, 0, -34, -10);
  g.fill();
  g.stroke();
  // Runner.
  g.strokeStyle = '#F2D06B';
  g.beginPath();
  g.moveTo(-36, 16);
  g.lineTo(26, 16);
  g.quadraticCurveTo(40, 16, 38, 4);
  g.stroke();
  // The sack of presents.
  g.fillStyle = '#8A5A3A';
  g.beginPath();
  g.arc(-20, -16, 11, 0, Math.PI * 2);
  g.fill();
  // Santa's hat.
  g.fillStyle = '#D2423A';
  g.beginPath();
  g.moveTo(2, -10);
  g.lineTo(12, -30);
  g.lineTo(20, -10);
  g.closePath();
  g.fill();
  g.fillStyle = '#FFFFFF';
  g.beginPath();
  g.arc(12, -31, 4, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
