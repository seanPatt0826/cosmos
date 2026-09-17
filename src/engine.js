// The simulation.
//
// Matter.js does the rigid-body work — restitution, rotating scenery, sensors.
// Everything gravitational is a force applied by hand each tick, because Matter
// only knows about uniform gravity and space is more interesting than that.

const M = () => window.Matter;

export function createSim(opts = {}) {
  const Matter = M();
  const engine = Matter.Engine.create({
    gravity: { x: 0, y: opts.gravityY ?? 0, scale: 0.001 },
    // Space has nothing to slow you down. Matter's default drag would decay
    // every orbit into the planet within seconds.
    enableSleeping: false,
  });
  engine.positionIterations = 8;
  engine.velocityIterations = 8;

  const sim = {
    Matter,
    engine,
    world: engine.world,
    wells: [],
    players: [],
    listeners: [],
    // Bodies that ignore gravity wells (asteroids, scenery that drifts).
    drifters: [],
  };

  Matter.Events.on(engine, 'collisionStart', (ev) => {
    for (const pair of ev.pairs) {
      const { bodyA, bodyB } = pair;
      const rel = Matter.Vector.magnitude(
        Matter.Vector.sub(bodyA.velocity, bodyB.velocity),
      );
      for (const fn of sim.listeners) fn(bodyA, bodyB, rel, pair);
    }
  });

  return sim;
}

export function onCollide(sim, fn) {
  sim.listeners.push(fn);
}

export function add(sim, ...bodies) {
  sim.Matter.Composite.add(sim.world, bodies.flat());
}

export function remove(sim, body) {
  sim.Matter.Composite.remove(sim.world, body);
}

// ── Gravity wells ───────────────────────────────────────────────────────────
//
// A well is `{ x, y, mu, capture, maxAccel }`. Acceleration is mu / r², so mass
// cancels out and every object falls the same way — which is both correct and,
// more usefully, fair.

// Matter integrates `velocity += (force / mass) * dt²`, and applyWells scales
// its force by 0.001. So an acceleration parameter of 1 yields this many pixels
// per step, per step — which is what lets us place a body in a real orbit
// rather than guessing at a velocity until it looks about right.
export const ACCEL_SCALE = 0.001 * (1000 / 60) * (1000 / 60);

// Speed required to hold a circular orbit of radius r around a well of mu.
export function orbitalSpeed(mu, r) {
  return Math.sqrt((ACCEL_SCALE * mu) / Math.max(1, r));
}

export function addWell(sim, well) {
  const w = {
    x: 0, y: 0, mu: 40000, capture: 0, maxAccel: 2.4, vx: 0, vy: 0, ...well,
  };
  sim.wells.push(w);
  return w;
}

export function applyWells(sim) {
  const { Matter } = sim;
  if (!sim.wells.length) return;

  for (const p of sim.players) {
    if (!p.alive || !p.body) continue;
    const b = p.body;
    let fx = 0;
    let fy = 0;
    for (const w of sim.wells) {
      if (w.disabled) continue;
      const dx = w.x - b.position.x;
      const dy = w.y - b.position.y;
      // `reach` turns a well into a funnel: nothing at all until you are close,
      // then a firm pull. Without it a well in a confined space can hold a body
      // circling at range instead of ever swallowing it, which reads as the
      // object being stuck rather than being caught.
      if (w.reach && dx * dx + dy * dy > w.reach * w.reach) continue;
      const d2 = Math.max(w.minR ? w.minR * w.minR : 400, dx * dx + dy * dy);
      const d = Math.sqrt(d2);
      // Acceleration, clamped so a near-miss cannot fling a body across the
      // map at a speed the solver would tunnel straight through walls.
      const a = Math.min(w.mu / d2, w.maxAccel);
      fx += (dx / d) * a;
      fy += (dy / d) * a;
    }
    Matter.Body.applyForce(b, b.position, { x: fx * b.mass * 0.001, y: fy * b.mass * 0.001 });
  }

  for (const d of sim.drifters) {
    if (!d.body || d.ignoreWells) continue;
    const b = d.body;
    let fx = 0;
    let fy = 0;
    for (const w of sim.wells) {
      if (w.disabled || w.ignoreDrifters) continue;
      const dx = w.x - b.position.x;
      const dy = w.y - b.position.y;
      const d2 = Math.max(900, dx * dx + dy * dy);
      const dd = Math.sqrt(d2);
      const a = Math.min(w.mu / d2, w.maxAccel);
      fx += (dx / dd) * a;
      fy += (dy / dd) * a;
    }
    Matter.Body.applyForce(b, b.position, { x: fx * b.mass * 0.001, y: fy * b.mass * 0.001 });
  }
}

// Runaway speeds make the sim unreadable and let bodies tunnel through thin
// scenery. This keeps everything inside a sane envelope without visibly
// braking anything.
export function clampSpeeds(sim, max = 26) {
  const { Matter } = sim;
  for (const p of sim.players) {
    if (!p.alive || !p.body) continue;
    const v = p.body.velocity;
    const s = Math.hypot(v.x, v.y);
    if (s > max) {
      Matter.Body.setVelocity(p.body, { x: (v.x / s) * max, y: (v.y / s) * max });
    }
  }
}

export function step(sim, dtMs) {
  applyWells(sim);
  sim.Matter.Engine.update(sim.engine, dtMs);
  clampSpeeds(sim);
}

// ── Scenery helpers ─────────────────────────────────────────────────────────

export function staticRect(sim, x, y, w, h, opts = {}) {
  return sim.Matter.Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    restitution: opts.restitution ?? 0.6,
    friction: opts.friction ?? 0.02,
    angle: opts.angle || 0,
    label: opts.label || 'wall',
    ...opts,
  });
}

export function staticCircle(sim, x, y, r, opts = {}) {
  return sim.Matter.Bodies.circle(x, y, r, {
    isStatic: true,
    restitution: opts.restitution ?? 0.7,
    friction: opts.friction ?? 0.02,
    label: opts.label || 'wall',
    ...opts,
  });
}

export function destroy(sim) {
  const { Matter } = sim;
  Matter.Events.off(sim.engine);
  Matter.Composite.clear(sim.world, false, true);
  Matter.Engine.clear(sim.engine);
  sim.listeners.length = 0;
  sim.wells.length = 0;
  sim.drifters.length = 0;
  sim.players.length = 0;
}
