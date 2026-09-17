// Seeded pseudo-randomness.
//
// Every hand-drawn imperfection in this game comes from here. That matters more
// than it sounds: if wobble were re-rolled each frame, thirty sketchy objects
// would shimmer like television static. Each body owns a seeded stream, so its
// crookedness is *its own* and never changes.

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.sign = () => (next() < 0.5 ? -1 : 1);
  // Centre-weighted: most values near zero, occasional larger ones. Reads more
  // like a human hand than a flat distribution.
  next.wobble = (amount) => (next() + next() - 1) * amount;
  next.fork = () => makeRng(Math.floor(next() * 4294967296));
  return next;
}

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}
