import garden from './garden.js';
import orbit from './orbit.js';
import belt from './belt.js';

// The two maps built around falling — Cosmic Drop (a vertical shaft) and Cosmic
// Pinball (downward gravity into a hole in the floor) — were removed from
// rotation at the owner's request.
//
// Their source is untouched at ./drop.js and ./pinball.js. Putting either back
// is two lines: import it again and add it to this list.
export const MAPS = [garden, orbit, belt];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}
