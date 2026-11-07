import garden from './garden.js';
import orbit from './orbit.js';
import belt from './belt.js';
import binary from './binary.js';
import bumpers from './bumpers.js';
import nova from './nova.js';
import warp from './warp.js';
import dock from './dock.js';
import snow from './snow.js';

// Seasonal universes, by id, and the months they appear in (1 = January), by
// the visitor's own clock. Out of season they are left out of everything: the
// picker, the phone dropdown and the rotation.
const SEASONS = {
  snow: [12],
};

const month = new Date().getMonth() + 1;

export const MAPS = [garden, orbit, belt, binary, bumpers, nova, warp, dock, snow]
  .filter((m) => !SEASONS[m.id] || SEASONS[m.id].includes(month));

export function mapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}
