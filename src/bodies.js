// The little celestial objects.
//
// Every one is physically a circle of identical size, whatever it is drawn as.
// Uniform collision behaviour is what keeps thirty bodies readable and keeps
// the outcome honest — the drawing is decoration, never an advantage.

import { PALETTE, BODY } from './config.js';
import { makeRng, hashSeed } from './rng.js';
import { lookFor, bakeLook } from './looks.js';

let spriteCache = new Map();

export function clearSpriteCache() {
  spriteCache = new Map();
}

// A drawing whose image is still decoding comes back null; it wears a planet
// for now and is not cached, so the next line-up picks the drawing up.
function spriteFor(look, col, variant, radius) {
  const key = `${look}|${col.name}|${variant}|${radius}`;
  let s = spriteCache.get(key);
  if (!s) {
    s = bakeLook(look, col, hashSeed(key), radius);
    if (!s) return bakeLook('planet', col, hashSeed(key), radius);
    spriteCache.set(key, s);
  }
  return s;
}

// `names` is the marble-roulette roster: one entrant per name, in shuffled
// order so the list you typed gives nobody a starting advantage. Left empty,
// objects go unnamed and the toy behaves as it always did.
export function createPlayers(count, seed, names = []) {
  const rng = makeRng(hashSeed('players', seed));

  const colours = PALETTE.slice();
  for (let i = colours.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [colours[i], colours[j]] = [colours[j], colours[i]];
  }

  const roster = names.slice();
  for (let i = roster.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [roster[i], roster[j]] = [roster[j], roster[i]];
  }

  const players = [];
  // The colours each icon already wears, so a second alien is drawn at a
  // different size from the first (BODY.twinScales) and in a colour far from
  // the first one's, never sky beside periwinkle.
  const worn = new Map();
  // Colours still to deal in this pass through the palette. Without twins they
  // go out in shuffled order, exactly as before.
  let left = [];
  let pass = -1;
  for (let i = 0; i < count; i++) {
    if (!left.length) {
      left = colours.slice();
      pass++;
    }
    // Their own icon from Choose icon, or one dealt from the set.
    const archetype = lookFor(roster[i] || null, rng);
    const twins = worn.get(archetype) || [];
    const col = left.splice(farthestFrom(left, twins), 1)[0];
    twins.push(col);
    worn.set(archetype, twins);
    const twin = twins.length - 1;
    // Two objects sharing a colour must not share a silhouette.
    const variant = pass;
    // The size it is drawn at. The body underneath stays BODY.radius.
    const drawR = Math.round(BODY.radius * BODY.drawScale * BODY.twinScales[twin % BODY.twinScales.length]);
    players.push({
      id: i,
      col,
      // With no roster, the colour is the name — enough for the standings list
      // to say something meaningful without inventing an identity.
      name: roster[i] || null,
      label: roster[i] || col.name,
      archetype,
      drawR,
      sprite: spriteFor(archetype, col, variant, drawR),
      body: null,
      alive: true,
      trail: [],
      lastTrailAt: 0,
      boilOffset: rng.int(0, 2),
      spin: rng.range(-0.02, 0.02),
      // Set when eliminated, so the death animation knows how to play out.
      death: null,
    });
  }
  return players;
}

// Index of the colour in `pool` whose hue is farthest from every colour in
// `taken` (the closest one counts). Nothing taken: the first, so the shuffled
// order stands. Ties keep the earlier one, so no randomness is needed.
function farthestFrom(pool, taken) {
  if (!taken.length) return 0;
  let best = 0;
  let bestGap = -1;
  pool.forEach((c, k) => {
    const gap = Math.min(...taken.map((t) => hueGap(c.crayon, t.crayon)));
    if (gap > bestGap) {
      best = k;
      bestGap = gap;
    }
  });
  return best;
}

// Distance round the colour wheel between two #rrggbb colours, 0 to 180.
function hueGap(a, b) {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

function hue(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

export function makeBody(Matter, player, x, y) {
  const b = Matter.Bodies.circle(x, y, BODY.radius, {
    restitution: BODY.restitution,
    friction: BODY.friction,
    frictionStatic: BODY.frictionStatic,
    frictionAir: BODY.frictionAir,
    density: BODY.density,
    slop: 0.02,
    label: 'player',
  });
  b.plugin = { player };
  player.body = b;
  return b;
}

export function sampleTrail(player, now) {
  if (!player.alive || !player.body) return;
  if (now - player.lastTrailAt < BODY.trailSampleMs) return;
  player.lastTrailAt = now;
  const { x, y } = player.body.position;
  // Jitter is baked into the point, not applied at draw time, or the whole
  // trail would crawl every time the oldest point is dropped.
  player.trail.push({ x, y, jx: (Math.random() - 0.5) * 3.2, jy: (Math.random() - 0.5) * 3.2 });
  if (player.trail.length > BODY.trailPoints) player.trail.shift();

  // Trim by distance as well as by count. A body at full speed covers far more
  // ground per sample than a drifting one, and without this it drags a streak
  // clear across the screen.
  let len = 0;
  const t = player.trail;
  for (let i = t.length - 1; i > 0; i--) {
    len += Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y);
    if (len > BODY.trailMaxLen) {
      t.splice(0, i);
      break;
    }
  }
}

export function fadeTrail(player) {
  if (player.trail.length) player.trail.shift();
}
