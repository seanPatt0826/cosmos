import garden from './garden.js';
import orbit from './orbit.js';
import belt from './belt.js';
import binary from './binary.js';
import bumpers from './bumpers.js';

// The two maps built around falling — Cosmic Drop (a vertical shaft) and Cosmic
// Pinball (downward gravity into a hole in the floor) — were removed from
// rotation at the owner's request. Their source is untouched at ./drop.js and
// ./pinball.js; putting either back is two lines.
export const MAPS = [garden, orbit, belt, binary, bumpers];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}
