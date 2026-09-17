// The little celestial objects.
//
// Every one is physically a circle of identical size, whatever it is drawn as.
// Uniform collision behaviour is what keeps thirty bodies readable and keeps
// the outcome honest — the drawing is decoration, never an advantage.

import { PALETTE, ARCHETYPES, BODY } from './config.js';
import { makeRng, hashSeed } from './rng.js';
import { bakeBody } from './sprites.js';

let spriteCache = new Map();

export function clearSpriteCache() {
  spriteCache = new Map();
}

function spriteFor(archetype, col, variant) {
  const key = `${archetype}|${col.name}|${variant}`;
  let s = spriteCache.get(key);
  if (!s) {
    s = bakeBody(archetype, col, hashSeed(key), BODY.radius);
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
  for (let i = 0; i < count; i++) {
    const col = colours[i % colours.length];
    const archetype = ARCHETYPES[(i + rng.int(0, 5)) % ARCHETYPES.length];
    // Two objects sharing a colour must not share a silhouette.
    const variant = Math.floor(i / colours.length);
    players.push({
      id: i,
      col,
      // With no roster, the colour is the name — enough for the standings list
      // to say something meaningful without inventing an identity.
      name: roster[i] || null,
      label: roster[i] || col.name,
      archetype,
      sprite: spriteFor(archetype, col, variant),
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
