// Obstacles, shared across universes.
//
// One rule holds for everything in this file except the black holes: none of it
// eliminates anybody. A pinwheel flings you, a nebula slows you, a pulsar
// shoves you, a comet barges through you — and then the map's own hazards
// decide what that cost you. That keeps the tone gentle, and it keeps six new
// obstacle types from collapsing every round into twenty seconds.
//
// Black holes are the exception, because a black hole that does not swallow
// anything is just scenery.

import { makeRng, hashSeed } from '../rng.js';
import {
  bakeBlackHole, bakePinwheel, bakeShard, bakeComet, bakePulsar, bakePlatform,
  drawSprite, boilFrame,
} from '../sprites.js';
import { staticRect, staticCircle, add, remove, addWell } from '../engine.js';
import { strokeSketch, softGlow, hexToRgba } from '../sketch.js';
import * as Particles from '../particles.js';

// ── Black holes ─────────────────────────────────────────────────────────────

export function createHole(sim, { x, y, r, seed, drift = 0, mu = null, maxAccel = 0.85 }) {
  const well = addWell(sim, {
    x, y,
    mu: mu ?? r * 150,
    capture: r,
    minR: r * 1.1,
    maxAccel,
    ignoreDrifters: true,
  });
  return {
    well,
    baseR: r,
    baseMu: mu ?? r * 150,
    sprite: bakeBlackHole(r, hashSeed('hole', seed)),
    boil: seed % 3,
    vx: drift ? (Math.random() - 0.5) * drift : 0,
    vy: drift ? (Math.random() - 0.5) * drift : 0,
    emit: 0,
  };
}

export function updateHoles(holes, dt, pressure, bounds, particles, opts = {}) {
  const grow = opts.grow ?? 0.6;
  const t = dt / 1000;
  for (const h of holes) {
    const r = h.baseR * (1 + pressure * grow);
    h.well.capture = r;
    h.well.mu = h.baseMu * (1 + pressure * (opts.muGrow ?? 0.8));

    if (h.vx || h.vy) {
      h.well.x += h.vx * t * 60;
      h.well.y += h.vy * t * 60;
      const minX = bounds.x + r + 60;
      const maxX = bounds.x + bounds.w - r - 60;
      const minY = bounds.y + r + 60;
      const maxY = bounds.y + bounds.h - r - 60;
      if (h.well.x < minX || h.well.x > maxX) h.vx *= -1;
      if (h.well.y < minY || h.well.y > maxY) h.vy *= -1;
      h.well.x = Math.max(minX, Math.min(maxX, h.well.x));
      h.well.y = Math.max(minY, Math.min(maxY, h.well.y));
    }

    // A thin drizzle of matter spiralling in, so a hole never looks inert.
    h.emit += dt;
    if (h.emit > 420) {
      h.emit = 0;
      const a = Math.random() * Math.PI * 2;
      const rr = r * (1.5 + Math.random() * 1.3);
      Particles.unravel(
        particles,
        h.well.x + Math.cos(a) * rr, h.well.y + Math.sin(a) * rr,
        h.well.x, h.well.y, '#C9A8FF', 2, 0.42,
      );
    }
  }
}

// Returns the hole that has this position, or null.
export function holeCapturing(holes, pos) {
  for (const h of holes) {
    if (Math.hypot(pos.x - h.well.x, pos.y - h.well.y) < h.well.capture) return h;
  }
  return null;
}

export function drawHoles(g, holes, time) {
  for (const h of holes) {
    softGlow(g, h.well.x, h.well.y, h.well.capture * 4.2, '#7B4FCF', 0.2);
    drawSprite(g, h.sprite, h.well.x, h.well.y, 0, h.well.capture / h.baseR, 1, boilFrame(time, h.boil));
  }
}

// ── Pinwheels ───────────────────────────────────────────────────────────────

export function createPinwheel(sim, x, y, len, seed, colour = '#B9A3E8') {
  const thick = Math.max(16, len * 0.09);
  // Two bars rather than one sprite-shaped body: the physics has to be a cross
  // too, or objects pass straight through half of what they can see.
  const bars = [
    staticRect(sim, x, y, len, thick, { restitution: 0.95, friction: 0.01, label: 'pinwheel' }),
    staticRect(sim, x, y, thick, len, { restitution: 0.95, friction: 0.01, label: 'pinwheel' }),
  ];
  add(sim, bars);
  const rng = makeRng(hashSeed('pw', seed));
  return {
    bars, x, y, len,
    angle: rng.range(0, Math.PI),
    omega: rng.range(0.5, 1.25) * rng.sign(),
    sprite: bakePinwheel(len, thick, seed, colour),
    boil: seed % 3,
  };
}

export function updatePinwheels(sim, wheels, dt) {
  const t = dt / 1000;
  for (const w of wheels) {
    w.angle += w.omega * t;
    for (let i = 0; i < w.bars.length; i++) {
      sim.Matter.Body.setAngle(w.bars[i], w.angle + (i ? Math.PI / 2 : 0));
      sim.Matter.Body.setAngularVelocity(w.bars[i], w.omega * t);
    }
  }
}

export function drawPinwheels(g, wheels, time) {
  for (const w of wheels) {
    drawSprite(g, w.sprite, w.x, w.y, w.angle, 1, 1, boilFrame(time, w.boil));
  }
}

// ── Crumbling ledges ────────────────────────────────────────────────────────

export function createCrumble(sim, x, y, w, h, seed, opts = {}) {
  const body = staticRect(sim, x, y, w, h, {
    angle: opts.angle || 0,
    restitution: 0.5,
    friction: 0.02,
    label: 'crumble',
  });
  add(sim, body);
  return {
    body, x, y, w, h,
    angle: opts.angle || 0,
    solid: bakePlatform(w, h, seed, { color: '#C8A07E' }),
    cracked: bakePlatform(w, h, seed, { color: '#C8A07E', cracks: true }),
    boil: seed % 3,
    state: 'solid',
    timer: 0,
    inWorld: true,
  };
}

// Hooked up through the sim's collision listener: a ledge starts failing the
// moment something lands on it, not on a timer.
export function touchCrumble(crumbles, bodyA, bodyB) {
  for (const c of crumbles) {
    if (c.state !== 'solid') continue;
    if (bodyA !== c.body && bodyB !== c.body) continue;
    const other = bodyA === c.body ? bodyB : bodyA;
    if (other.label !== 'player') continue;
    c.state = 'cracking';
    c.timer = 620;
  }
}

export function updateCrumbles(sim, crumbles, dt, particles) {
  for (const c of crumbles) {
    if (c.state === 'solid') continue;
    c.timer -= dt;
    if (c.timer > 0) continue;

    if (c.state === 'cracking') {
      c.state = 'gone';
      c.timer = 7000;
      if (c.inWorld) {
        remove(sim, c.body);
        c.inWorld = false;
      }
      Particles.burst(particles, c.x, c.y, '#C8A07E', { count: 12, speed: 1.8, ring: false });
      Particles.puff(particles, c.x, c.y, '#DCD5C6', 8);
    } else {
      c.state = 'solid';
      if (!c.inWorld) {
        add(sim, c.body);
        c.inWorld = true;
      }
    }
  }
}

export function drawCrumbles(g, crumbles, time) {
  for (const c of crumbles) {
    if (c.state === 'gone') continue;
    const cracking = c.state === 'cracking';
    // A last shudder before it lets go.
    const shake = cracking ? (Math.random() - 0.5) * 2.4 : 0;
    drawSprite(
      g, cracking ? c.cracked : c.solid,
      c.x + shake, c.y + shake, c.angle, 1, 1, boilFrame(time, c.boil),
    );
  }
}

// ── Nebula patches ──────────────────────────────────────────────────────────
//
// Soft drag. Drift into one near a black hole and you may no longer have the
// momentum to climb back out, which is the whole idea.

export function createNebula(x, y, r, seed) {
  // Quantised and cached for the same reason the scenery sprites are: a patch
  // canvas is up to 500px square, and minting two or three fresh ones on every
  // change of universe is texture upload the transition cannot afford.
  const qr = Math.round(r / 20) * 20;
  const v = ((seed % 6) + 6) % 6;
  const key = `${qr}|${v}`;
  let sprite = nebulaCache.get(key);
  if (!sprite) {
    sprite = bakeNebula(qr, v);
    nebulaCache.set(key, sprite);
  }
  return { x, y, r: qr, seed, phase: Math.random() * 6, sprite };
}

const nebulaCache = new Map();

// Baked once. A patch is five overlapping radial gradients plus a scruffy
// outline; rebuilding all of that every frame for three or four patches was
// enough on its own to hold the Garden at thirty frames a second.
function bakeNebula(r, seed) {
  const pad = 1.12;
  const size = Math.ceil(r * 2 * pad);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const rng = makeRng(hashSeed('neb', seed));
  const cx = size / 2;
  const cy = size / 2;

  for (let i = 0; i < 5; i++) {
    const bx = cx + rng.wobble(r * 0.4);
    const by = cy + rng.wobble(r * 0.4);
    const br = r * rng.range(0.5, 0.95);
    const grad = g.createRadialGradient(bx, by, 0, bx, by, br);
    grad.addColorStop(0, hexToRgba('#7E6BC8', 0.2));
    grad.addColorStop(0.5, hexToRgba('#5A4A9E', 0.1));
    grad.addColorStop(1, hexToRgba('#5A4A9E', 0));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
  }

  // A scruffy outline, so it is legible as a *thing* and not just haze.
  const ring = [];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const rr = r * (1 + rng.wobble(0.09));
    ring.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  strokeSketch(g, ring, rng, {
    color: '#A08ED6', width: 2, passes: 2, alpha: 0.22, closed: true, spread: 2.2,
  });

  return { canvas: c, worldSize: size };
}

// A patch must never bring anything to a complete stop.
//
// In an arena with no ambient gravity, a body damped to zero has nothing left
// to accelerate it — and the patches are deliberately placed clear of the wells,
// so nothing is nearby to pull it out either. It simply sits there for the rest
// of the round. This floor keeps a patch a bog rather than a tarpit.
const NEBULA_FLOOR = 0.6;

export function applyNebula(sim, patches, players, dt) {
  const f = dt / 16.667;
  for (const p of players) {
    if (!p.body) continue;
    const pos = p.body.position;
    for (const n of patches) {
      const d = Math.hypot(pos.x - n.x, pos.y - n.y);
      if (d > n.r) continue;
      const v = p.body.velocity;
      const s = Math.hypot(v.x, v.y);
      if (s <= NEBULA_FLOOR) continue;
      // Thickest in the middle, so the edge is a nudge and the core is a bog.
      const k = 1 - d / n.r;
      const damp = Math.pow(1 - 0.028 * k, f);
      const next = Math.max(NEBULA_FLOOR, s * damp);
      sim.Matter.Body.setVelocity(p.body, { x: (v.x / s) * next, y: (v.y / s) * next });
    }
  }
}

// ── Getting stuck ───────────────────────────────────────────────────────────
//
// Even with the floor above, a physics sim will find somewhere to wedge an
// object: a corner it bounces in forever, a tiny circle it never leaves. This
// watches displacement rather than speed, so it catches both a dead stop and a
// slow pointless loop.

// Stuck means "going nowhere", which is not the same as "moving slowly".
//
// The first version measured distance from a reference point and reset the
// moment an object strayed past it. That misses the commonest case entirely:
// something bouncing between two walls, or looping in a small circle, travels
// plenty while ending up exactly where it began. It also fired on merely slow
// objects and became the map's main cause of death, halving round length.
//
// So sample the position on a timer and compare the ends of a rolling window.
// Net displacement is the thing that actually matters.
// Measured: travel=62 leaves zero objects visibly parked. Tightening to 46 did
// not reduce how often this fires — it just let more stuck objects slip through
// the net, which is the opposite of the point.
export function createStuckWatch({ travel = 62, windowMs = 5500, sampleMs = 700 } = {}) {
  const tracks = new Map();
  const slots = Math.max(2, Math.round(windowMs / sampleMs));

  return function check(players, dt, onStuck) {
    const live = new Set();
    for (const p of players) {
      if (!p.body) continue;
      live.add(p.id);
      let t = tracks.get(p.id);
      if (!t) {
        t = { acc: 0, pts: [] };
        tracks.set(p.id, t);
      }
      t.acc += dt;
      if (t.acc < sampleMs) continue;
      t.acc = 0;

      t.pts.push({ x: p.body.position.x, y: p.body.position.y });
      if (t.pts.length > slots) t.pts.shift();
      if (t.pts.length < slots) continue;

      const a = t.pts[0];
      const b = t.pts[t.pts.length - 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < travel) {
        tracks.delete(p.id);
        onStuck(p);
      }
    }
    // Do not leak state for objects that have already left the round.
    for (const id of [...tracks.keys()]) if (!live.has(id)) tracks.delete(id);
  };
}

export function drawNebula(g, patches, time) {
  for (const n of patches) {
    // The breathing is a scale on the blit, not a redraw.
    const pulse = 1 + Math.sin(time * 0.0004 + n.phase) * 0.04;
    const s = n.sprite.worldSize * pulse;
    g.drawImage(n.sprite.canvas, n.x - s / 2, n.y - s / 2, s, s);
  }
}

// ── Pulsars ─────────────────────────────────────────────────────────────────
//
// As much a rescue as a hazard: a pulsar can shove somebody clear of a black
// hole at the last possible moment, which is exactly the sort of thing this
// game exists to produce.

export function createPulsar(sim, x, y, seed, colour = '#9BE1FF') {
  const r = 30;
  const body = staticCircle(sim, x, y, r * 0.8, { restitution: 1.1, friction: 0, label: 'pulsar' });
  add(sim, body);
  return {
    x, y, r, colour, body,
    reach: 340,
    period: 3200 + Math.random() * 1400,
    t: Math.random() * 2000,
    flash: 0,
    sprite: bakePulsar(r, seed, colour),
    boil: seed % 3,
  };
}

export function updatePulsars(sim, pulsars, dt, players, particles) {
  for (const p of pulsars) {
    p.t += dt;
    p.flash = Math.max(0, p.flash - dt / 620);
    if (p.t < p.period) continue;
    p.t = 0;
    p.flash = 1;
    Particles.burst(particles, p.x, p.y, p.colour, {
      count: 10, speed: 3.2, ringTo: p.reach * 0.8, ringLife: 620,
    });
    for (const pl of players) {
      if (!pl.body) continue;
      const dx = pl.body.position.x - p.x;
      const dy = pl.body.position.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > p.reach || d < 1) continue;
      // Falls off with distance, so standing next to one really matters.
      const k = (1 - d / p.reach) * 0.02;
      sim.Matter.Body.applyForce(pl.body, pl.body.position, {
        x: (dx / d) * pl.body.mass * k,
        y: (dy / d) * pl.body.mass * k,
      });
    }
  }
}

export function drawPulsars(g, pulsars, time) {
  for (const p of pulsars) {
    if (p.flash > 0.01) {
      softGlow(g, p.x, p.y, p.reach * (1 - p.flash) * 0.9, p.colour, p.flash * 0.22);
      const rng = makeRng(hashSeed('pulse', Math.round(p.t)));
      const rr = p.reach * (1 - p.flash) * 0.85;
      const seg = Math.max(30, Math.round(rr / 4));
      const ring = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        ring.push({
          x: p.x + Math.cos(a) * rr * (1 + rng.wobble(0.03)),
          y: p.y + Math.sin(a) * rr * (1 + rng.wobble(0.03)),
        });
      }
      strokeSketch(g, ring, rng, {
        color: p.colour, width: 2.6 * p.flash + 0.6, passes: 2,
        alpha: p.flash * 0.55, closed: true, spread: 1.4,
      });
    }
    softGlow(g, p.x, p.y, p.r * 2.6, p.colour, 0.16 + p.flash * 0.3);
    drawSprite(g, p.sprite, p.x, p.y, time * 0.0004, 1 + p.flash * 0.1, 1, boilFrame(time, p.boil));
  }
}

// ── Tumbling shards ─────────────────────────────────────────────────────────

export function createShard(sim, x, y, len, seed, speed = 1.4) {
  const M = sim.Matter;
  // A hexagon squashed along one axis: convex, so Matter needs no decomposition.
  const body = M.Bodies.polygon(x, y, 6, len / 2, {
    restitution: 0.92,
    friction: 0.002,
    frictionAir: 0,
    frictionStatic: 0,
    density: 0.005,
    label: 'asteroid',
  });
  M.Body.scale(body, 1, 0.36);
  const a = Math.random() * Math.PI * 2;
  M.Body.setVelocity(body, { x: Math.cos(a) * speed, y: Math.sin(a) * speed });
  M.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.06);
  add(sim, body);
  sim.drifters.push({ body, ignoreWells: true });
  return { body, len, sprite: bakeShard(len, seed), boil: seed % 3 };
}

export function drawShards(g, shards, time) {
  for (const s of shards) {
    drawSprite(g, s.sprite, s.body.position.x, s.body.position.y, s.body.angle, 1, 1, boilFrame(time, s.boil));
  }
}

// ── Comets ──────────────────────────────────────────────────────────────────

export function createComet(sim, bounds, seed, colour = '#FFB489') {
  const r = 26;
  const body = sim.Matter.Bodies.circle(-99999, -99999, r, {
    restitution: 0.9,
    friction: 0,
    frictionAir: 0,
    frictionStatic: 0,
    // Heavy: it barges through the traffic rather than being deflected by it.
    density: 0.02,
    label: 'comet',
  });
  add(sim, body);
  sim.drifters.push({ body, ignoreWells: true });
  const c = {
    body, r, bounds, colour,
    sprite: bakeComet(r, seed, colour),
    boil: seed % 3,
    wait: 2600 + Math.random() * 3000,
    active: false,
  };
  return c;
}

export function updateComets(sim, comets, dt, particles) {
  const M = sim.Matter;
  for (const c of comets) {
    if (!c.active) {
      c.wait -= dt;
      if (c.wait > 0) continue;
      // Enter from a random point on the boundary, aimed loosely at the middle.
      const b = c.bounds;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const a = Math.random() * Math.PI * 2;
      const rad = Math.max(b.w, b.h) * 0.62;
      const sx = cx + Math.cos(a) * rad;
      const sy = cy + Math.sin(a) * rad;
      const aim = Math.atan2(cy - sy, cx - sx) + (Math.random() - 0.5) * 0.7;
      const speed = 5.5 + Math.random() * 2.5;
      M.Body.setPosition(c.body, { x: sx, y: sy });
      M.Body.setVelocity(c.body, { x: Math.cos(aim) * speed, y: Math.sin(aim) * speed });
      M.Body.setAngularVelocity(c.body, (Math.random() - 0.5) * 0.05);
      c.active = true;
      continue;
    }

    const pos = c.body.position;
    const b = c.bounds;
    const margin = Math.max(b.w, b.h) * 0.85;
    if (
      pos.x < b.x - margin || pos.x > b.x + b.w + margin ||
      pos.y < b.y - margin || pos.y > b.y + b.h + margin
    ) {
      c.active = false;
      c.wait = 4200 + Math.random() * 5000;
      M.Body.setPosition(c.body, { x: -99999, y: -99999 });
      M.Body.setVelocity(c.body, { x: 0, y: 0 });
      continue;
    }
    if (Math.random() < 0.35) {
      Particles.puff(particles, pos.x, pos.y, c.colour, 1);
    }
  }
}

export function drawComets(g, comets, time) {
  for (const c of comets) {
    if (!c.active) continue;
    const v = c.body.velocity;
    softGlow(g, c.body.position.x, c.body.position.y, c.r * 3.4, c.colour, 0.3);
    drawSprite(
      g, c.sprite, c.body.position.x, c.body.position.y,
      Math.atan2(v.y, v.x) + Math.PI, 1, 1, boilFrame(time, c.boil),
    );
  }
}
