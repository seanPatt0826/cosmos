// The universe picker: a small portrait of every map.
//
// The row of names along the bottom told you a universe was called "Supernova"
// but not what that meant. These are the actual arenas — each one built for
// real, drawn once into a thumbnail, and thrown away. Not an illustration of
// the map, the map itself, so a new one added to MAPS gets a portrait without
// anybody drawing anything.
//
// Rendered once and cached as bitmaps. Building seven physics worlds is not
// something to do on a timer, so it happens once after first paint, and again
// only if the palette changes under it.

import { MAPS } from './maps/index.js';
import { createSim, destroy } from './engine.js';
import { createBackground } from './background.js';
import { makeRng, hashSeed } from './rng.js';

const CARD_W = 132;
const CARD_H = 84;

export function createUniverses(hostEl, onPick) {
  if (!hostEl) return { refresh() {}, setActive() {} };

  const cards = new Map();   // map id -> { canvas, button }
  let activeId = null;

  for (const mapDef of MAPS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'universe';
    button.dataset.map = mapDef.id;
    button.title = mapDef.blurb;

    const canvas = document.createElement('canvas');
    canvas.className = 'universe-shot';
    canvas.width = CARD_W;
    canvas.height = CARD_H;

    const label = document.createElement('span');
    label.className = 'universe-name';
    label.textContent = mapDef.name;

    button.append(canvas, label);
    button.addEventListener('click', () => onPick(mapDef.id));
    hostEl.appendChild(button);
    cards.set(mapDef.id, { canvas, button, mapDef });
  }

  function paint(entry) {
    const { canvas, mapDef } = entry;
    const g = canvas.getContext('2d');
    const seed = hashSeed('preview', mapDef.id);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, CARD_W, CARD_H);

    // The sky first, at thumbnail size, so each portrait carries its own
    // palette and the row reads as six different places.
    createBackground(CARD_W, CARD_H, seed, mapDef.theme).draw(g);

    // Build the real arena, with nobody in it.
    let sim = null;
    try {
      sim = createSim();
      const map = mapDef.build({ sim, seed, rng: makeRng(seed) });
      const b = map.bounds;
      // Fit the arena's own bounds into the card, with a little air.
      const scale = Math.min(CARD_W / b.w, CARD_H / b.h) * 0.94;

      g.save();
      g.translate(CARD_W / 2, CARD_H / 2);
      g.scale(scale, scale);
      g.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
      // No camera is passed: every map takes one and not one of them reads it.
      // Time zero, so a portrait is the same picture every time it is drawn.
      if (map.drawBack) map.drawBack(g, null, 0);
      if (map.drawFront) map.drawFront(g, null, 0);
      g.restore();
    } catch (err) {
      // A map that cannot be previewed must not take the sidebar down with it.
      g.restore();
      console.warn('Cosmos: could not draw a preview for', mapDef.id, err);
    } finally {
      if (sim) destroy(sim);
    }
  }

  const api = {
    // Re-paints every portrait. Called once after boot, and after a palette
    // change, which repaints the skies.
    refresh() {
      for (const entry of cards.values()) paint(entry);
    },

    setActive(id) {
      if (id === activeId) return;
      activeId = id;
      for (const [key, entry] of cards) {
        entry.button.classList.toggle('active', key === id);
        if (key === id) entry.button.setAttribute('aria-current', 'true');
        else entry.button.removeAttribute('aria-current');
      }
    },
  };

  return api;
}
