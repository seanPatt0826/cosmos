import garden from './garden.js';
import orbit from './orbit.js';
import belt from './belt.js';
import binary from './binary.js';
import bumpers from './bumpers.js';

export const MAPS = [garden, orbit, belt, binary, bumpers];

export function mapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}
