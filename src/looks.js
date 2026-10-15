// Choose icon: what each racer looks like.
//
// Two layers, both optional. The set decides which icons a racer can be dealt
// at random; a pick pins one racer, by name, to one icon. Nobody has to touch
// either: out of the box every icon is in the set and nobody has a pick, so a
// race looks the way it always did, just with more to be dealt.
//
// Drawings made in the pad are icons too. They are kept as small PNGs and
// turned back into images on load; until an image has decoded it stands in as
// a planet rather than holding the race up.
//
// Everything lives in this browser only, like the names list. Every read and
// write is guarded, because storage can be missing or full and the race must
// never care.

import { bakeBody, bakeCustom } from './sprites.js';
import { PALETTE, BODY } from './config.js';

const STORE = 'cosmos.looks';
const MAX_CUSTOM = 12;

export const BUILTIN = [
  { id: 'saturn', name: 'Saturn' },
  { id: 'planet', name: 'Planet' },
  { id: 'rocket', name: 'Rocket' },
  { id: 'groot', name: 'Groot' },
  { id: 'ufo', name: 'UFO' },
  { id: 'satellite', name: 'Satellite' },
  { id: 'astronaut', name: 'Astronaut' },
  { id: 'alien', name: 'Alien' },
];

// { off: [ids left out of the set], picks: { name: id }, custom: [{ id, name, data }] }
let state = { off: [], picks: {}, custom: [] };
const images = new Map();
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(STORE);
    const s = raw ? JSON.parse(raw) : null;
    if (s && typeof s === 'object') {
      state = {
        off: Array.isArray(s.off) ? s.off : [],
        picks: s.picks && typeof s.picks === 'object' ? s.picks : {},
        custom: Array.isArray(s.custom) ? s.custom.filter((c) => c && c.id && c.data) : [],
      };
    }
  } catch (e) { /* a fresh start is fine */ }
}

function write() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage full or off */ }
}

function changed() {
  write();
  for (const fn of listeners) fn();
}

function loadImage(c) {
  if (images.has(c.id)) return;
  const img = new Image();
  images.set(c.id, null);
  img.onload = () => {
    images.set(c.id, img);
    thumbs.clear();
    // Anyone already lined up with this drawing gets redrawn now it is ready.
    for (const fn of listeners) fn();
  };
  img.src = c.data;
}

read();
state.custom.forEach(loadImage);

export function onLooksChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function allLooks() {
  return [...BUILTIN, ...state.custom.map((c) => ({ id: c.id, name: c.name, custom: true }))];
}

function exists(id) {
  return allLooks().some((l) => l.id === id);
}

export function inSet(id) {
  return !state.off.includes(id);
}

export function setInSet(id, on) {
  state.off = state.off.filter((x) => x !== id);
  if (!on) state.off.push(id);
  changed();
}

export function pickOf(name) {
  const id = name ? state.picks[name] : null;
  return id && exists(id) ? id : null;
}

// Every name that has picked this icon, in the order they were saved.
export function ownersOf(id) {
  return Object.keys(state.picks).filter((n) => state.picks[n] === id && exists(id));
}

export function setPick(name, id) {
  if (!name) return;
  if (id && exists(id)) state.picks[name] = id;
  else delete state.picks[name];
  changed();
}

// Returns the new drawing's id, or null when there is no room for another.
export function addCustom(name, data) {
  if (state.custom.length >= MAX_CUSTOM) return null;
  const id = `custom-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const c = { id, name: (name || '').trim().slice(0, 18) || 'My drawing', data };
  state.custom.push(c);
  loadImage(c);
  changed();
  return id;
}

export function removeCustom(id) {
  state.custom = state.custom.filter((c) => c.id !== id);
  state.off = state.off.filter((x) => x !== id);
  for (const n of Object.keys(state.picks)) if (state.picks[n] === id) delete state.picks[n];
  images.delete(id);
  thumbs.clear();
  changed();
}

export function customCount() {
  return state.custom.length;
}

export const CUSTOM_LIMIT = MAX_CUSTOM;

// The icon a racer wears: their own pick if they have one, otherwise one dealt
// from the set. `rng` keeps the deal tied to the round's seed. An empty set
// deals from everything rather than leaving racers with nothing to wear.
export function lookFor(name, rng) {
  const own = pickOf(name);
  if (own) return own;
  let pool = allLooks().filter((l) => inSet(l.id));
  if (!pool.length) pool = BUILTIN;
  return pool[rng.int(0, pool.length - 1)].id;
}

export function isCustom(id) {
  return typeof id === 'string' && id.startsWith('custom-');
}

// A baked sprite for a look in a given colour, or null for a drawing whose
// image has not decoded yet (the caller falls back to a planet).
export function bakeLook(id, col, seed, radius = BODY.radius) {
  if (isCustom(id)) {
    const img = images.get(id);
    return img ? bakeCustom(img, col, seed, radius) : null;
  }
  return bakeBody(id, col, seed, radius);
}

// Small previews for the menu and the name rows, cached by look and size.
const thumbs = new Map();
const THUMB_COL = PALETTE.find((p) => p.name === 'sky') || PALETTE[0];

export function thumbnail(id, px) {
  const key = `${id}|${px}`;
  if (thumbs.has(key)) return thumbs.get(key);
  const sprite = bakeLook(id, THUMB_COL, 7, BODY.radius);
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  if (sprite) {
    const img = sprite.frames[0];
    // Bodies are baked with room around them for rays and flames; trim most of
    // it so the icon fills its tile.
    const crop = img.width * 0.16;
    c.getContext('2d').drawImage(img, crop, crop, img.width - crop * 2, img.height - crop * 2, 0, 0, px, px);
    thumbs.set(key, c);
  }
  return c;
}

// Paints a look's preview onto a canvas the caller owns, at that canvas's own
// backing size. A cached preview is one element, and putting it in two places
// would move it rather than copy it.
export function paintThumb(target, id) {
  const g = target.getContext('2d');
  g.clearRect(0, 0, target.width, target.height);
  if (id) g.drawImage(thumbnail(id, target.width), 0, 0, target.width, target.height);
}
