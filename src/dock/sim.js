// Shuttle Docking: the physics both sides run.
//
// The server (worker/dock-room.js) is the referee: it moves every ship and
// decides who docks. Each browser runs these same functions for its own ship
// between the server's updates, so the controls answer at once instead of a
// network round trip later. Nothing in here touches the page or the network.
//
// The world is flat and seen from above. One "tick" is DOCK.tickMs; speeds are
// in world units per tick.

export const DOCK = {
  tickMs: 50,
  arenaR: 1500,

  // Ships
  shipR: 16,
  turn: 0.11,          // radians a tick
  thrust: 0.55,
  reverse: 0.3,
  strafe: 0.3,
  maxSpeed: 14,
  boost: 1.8,          // thrust and top speed while boosting
  precision: 0.35,     // thrust and turn while in precision mode
  drag: 0.992,         // a little, so a ship left alone slowly settles
  brake: 0.82,

  // Shuttles
  shuttleR: 56,
  portGap: 22,         // the docking point sits this far outside the hull

  // Docking. Every value here is a default the host can change in the lobby
  // or that can be tuned in one place.
  dockRadius: 70,      // how close to the docking point counts as in range
  maxDockSpeed: 4.5,   // "approach slowly": a quarter of top speed or less
  alignDeg: 45,        // "face the port": nose within this of straight in
  holdMs: 600,         // stay in range this long before the latch closes

  countdownMs: 3000,
  summaryMs: 0,        // the summary stays until the host starts again
  maxPlayers: 16,
};

// The rule the whole mode turns on: one shuttle fewer than players, and never
// a negative number.
export function shuttleCount(players) {
  return Math.max(0, players - 1);
}

export const NO_INPUT = Object.freeze({
  up: false, down: false, left: false, right: false,
  sl: false, sr: false, brake: false, boost: false, prec: false,
});

// Moves one ship one tick. `ship` is {x, y, vx, vy, a}; it is changed in place.
export function stepShip(ship, input, shuttles = []) {
  const k = input.prec ? DOCK.precision : 1;
  const b = input.boost && !input.prec ? DOCK.boost : 1;
  if (input.left) ship.a -= DOCK.turn * (input.prec ? 0.5 : 1);
  if (input.right) ship.a += DOCK.turn * (input.prec ? 0.5 : 1);
  ship.a = wrapAngle(ship.a);

  const fx = Math.cos(ship.a);
  const fy = Math.sin(ship.a);
  let ax = 0;
  let ay = 0;
  if (input.up) { ax += fx * DOCK.thrust * k * b; ay += fy * DOCK.thrust * k * b; }
  if (input.down) { ax -= fx * DOCK.reverse * k; ay -= fy * DOCK.reverse * k; }
  // Sliding sideways without turning: the flat world's stand-in for roll.
  if (input.sl) { ax += fy * DOCK.strafe * k; ay -= fx * DOCK.strafe * k; }
  if (input.sr) { ax -= fy * DOCK.strafe * k; ay += fx * DOCK.strafe * k; }
  ship.vx += ax;
  ship.vy += ay;

  const drag = input.brake ? DOCK.brake : DOCK.drag;
  ship.vx *= drag;
  ship.vy *= drag;
  if (Math.abs(ship.vx) < 0.01) ship.vx = 0;
  if (Math.abs(ship.vy) < 0.01) ship.vy = 0;

  const top = DOCK.maxSpeed * b;
  const sp = Math.hypot(ship.vx, ship.vy);
  if (sp > top) {
    // Eased back down rather than clipped, so letting go of boost feels smooth.
    const s = Math.max(top, sp * 0.94) / sp;
    ship.vx *= s;
    ship.vy *= s;
  }

  ship.x += ship.vx;
  ship.y += ship.vy;
  keepInArena(ship);
  for (const s of shuttles) bounceOff(ship, s.x, s.y, DOCK.shuttleR + DOCK.shipR);
}

export function speedOf(ship) {
  return Math.hypot(ship.vx, ship.vy);
}

// The docking point: just outside the hull, in the direction the port faces.
export function portOf(shuttle) {
  const d = DOCK.shuttleR + DOCK.portGap;
  return { x: shuttle.x + Math.cos(shuttle.port) * d, y: shuttle.y + Math.sin(shuttle.port) * d };
}

// Everything the docking rules need to know about one ship and one shuttle.
export function dockReading(ship, shuttle, rules) {
  const p = portOf(shuttle);
  const dist = Math.hypot(ship.x - p.x, ship.y - p.y);
  const speed = speedOf(ship);
  // Straight in means pointing back along the port's direction, at the hull.
  const off = Math.abs(wrapAngle(ship.a - (shuttle.port + Math.PI))) * 180 / Math.PI;
  return {
    dist,
    inRange: dist <= rules.dockRadius,
    speed,
    speedOk: !rules.requireSlow || speed <= rules.maxDockSpeed,
    alignOff: off,
    alignOk: !rules.requireAlign || off <= rules.alignDeg,
  };
}

// Where a docked ship sits: on the port, nose to the hull.
export function attach(ship, shuttle) {
  const p = portOf(shuttle);
  ship.x = p.x;
  ship.y = p.y;
  ship.vx = 0;
  ship.vy = 0;
  ship.a = wrapAngle(shuttle.port + Math.PI);
}

// Two ships that touch push apart and trade some speed, so racing for the
// same port can turn into a shove. Only the server runs this.
export function bumpShips(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = DOCK.shipR * 2;
  if (d >= min || d === 0) return;
  const nx = dx / d;
  const ny = dy / d;
  const push = (min - d) / 2;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const j = -rel * 0.8;
    a.vx -= nx * j; a.vy -= ny * j;
    b.vx += nx * j; b.vy += ny * j;
  }
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function keepInArena(ship) {
  const lim = DOCK.arenaR - DOCK.shipR;
  const d = Math.hypot(ship.x, ship.y);
  if (d <= lim) return;
  const nx = ship.x / d;
  const ny = ship.y / d;
  ship.x = nx * lim;
  ship.y = ny * lim;
  const out = ship.vx * nx + ship.vy * ny;
  if (out > 0) {
    ship.vx -= nx * out * 1.5;
    ship.vy -= ny * out * 1.5;
  }
}

function bounceOff(ship, cx, cy, min) {
  const dx = ship.x - cx;
  const dy = ship.y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= min || d === 0) return;
  const nx = dx / d;
  const ny = dy / d;
  ship.x = cx + nx * min;
  ship.y = cy + ny * min;
  const into = ship.vx * nx + ship.vy * ny;
  if (into < 0) {
    ship.vx -= nx * into * 1.4;
    ship.vy -= ny * into * 1.4;
  }
}
