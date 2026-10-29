// Shuttle Docking: drawing the room.
//
// Everything on the canvas: stars, the arena's edge, shuttles with their
// docking circles, ships, arrows to shuttles out of view, and the burst when
// someone docks. It only draws what main.js hands it; it decides nothing.

import { DOCK, portOf } from './sim.js';
import { makeRng } from '../rng.js';
import { t } from '../i18n.js';

const PAPER = '#F2EADB';
const ACCENT = '#E8A33D';
const GOOD = '#7ED491';
const BAD = '#F08A7A';
const FONT = '"Shantell Sans", "Gaegu", "Comic Sans MS", cursive';

export function createScene(canvas) {
  const g = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;

  // A slightly wobbly ring, the way the rest of Cosmos is drawn by hand.
  const edge = (() => {
    const rng = makeRng(42);
    const pts = [];
    const n = 140;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = DOCK.arenaR * (1 + rng.wobble(0.004));
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  })();

  // Three layers of stars, each a tile repeated across the screen and moved
  // at its own fraction of the camera's speed.
  const TILE = 900;
  const layers = [0.15, 0.35, 0.6].map((p, k) => {
    const rng = makeRng(100 + k);
    return {
      p,
      stars: Array.from({ length: 70 - k * 18 }, () => ({
        x: rng() * TILE, y: rng() * TILE, r: 0.5 + rng() * (0.6 + k * 0.5), a: 0.25 + rng() * 0.5,
      })),
    };
  });

  const bursts = [];

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  function burst(x, y, colour, now) {
    bursts.push({ x, y, colour, t0: now });
  }

  // view: { cam:{x,y,zoom}, now, rules, shuttles, ships:[...], players (id ->
  // {name, colour}), myId, myDock, showZones, pointers }
  function draw(view) {
    const { cam, now } = view;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#07060F';
    g.fillRect(0, 0, w, h);
    drawStars(cam);

    g.save();
    g.translate(w / 2, h / 2);
    g.scale(cam.zoom, cam.zoom);
    g.translate(-cam.x, -cam.y);

    drawEdge(cam);
    for (const s of view.shuttles) drawShuttle(s, view);
    for (const ship of view.ships) drawShip(ship, view);
    drawBursts(now);
    g.restore();

    if (view.pointers) drawPointers(view);
  }

  function drawStars(cam) {
    for (const L of layers) {
      const ox = (((-cam.x * L.p * cam.zoom) % TILE) + TILE) % TILE;
      const oy = (((-cam.y * L.p * cam.zoom) % TILE) + TILE) % TILE;
      for (let tx = ox - TILE; tx < w; tx += TILE) {
        for (let ty = oy - TILE; ty < h; ty += TILE) {
          for (const s of L.stars) {
            const x = tx + s.x;
            const y = ty + s.y;
            if (x < -2 || y < -2 || x > w + 2 || y > h + 2) continue;
            g.globalAlpha = s.a;
            g.fillStyle = PAPER;
            g.fillRect(x, y, s.r, s.r);
          }
        }
      }
    }
    g.globalAlpha = 1;
  }

  function drawEdge(cam) {
    g.lineWidth = 3 / cam.zoom;
    g.strokeStyle = 'rgba(155, 138, 230, 0.55)';
    g.beginPath();
    edge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.stroke();
    // A soft wash outside, so the edge reads as a wall rather than a line.
    g.lineWidth = 60;
    g.strokeStyle = 'rgba(155, 138, 230, 0.05)';
    g.stroke();
  }

  function drawShuttle(s, view) {
    const { rules, now, myDock } = view;
    const occupant = s.occupant !== null ? view.players.get(s.occupant) : null;
    const reserved = s.reservedBy !== null;
    const mine = myDock && myDock.shuttle === s.id;
    const p = portOf(s);

    // The docking zone: a dashed circle around the port.
    if (!occupant && view.showZones) {
      g.save();
      g.setLineDash([10, 9]);
      g.lineDashOffset = -now / 60;
      let col = 'rgba(242, 234, 219, 0.28)';
      if (mine && myDock.inRange) {
        col = myDock.reason === 'holding' ? GOOD : myDock.reason === 'lobby' ? ACCENT : BAD;
      } else if (reserved) col = 'rgba(232, 163, 61, 0.6)';
      g.strokeStyle = col;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(p.x, p.y, rules.dockRadius, 0, Math.PI * 2);
      g.stroke();
      g.restore();
      // Chevrons pointing in at the port: the way to come in.
      g.save();
      g.translate(p.x, p.y);
      g.rotate(s.port);
      g.strokeStyle = reserved ? ACCENT : 'rgba(242, 234, 219, 0.5)';
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      for (const d of [rules.dockRadius + 22, rules.dockRadius + 40]) {
        g.beginPath();
        g.moveTo(d + 8, -9);
        g.lineTo(d, 0);
        g.lineTo(d + 8, 9);
        g.stroke();
      }
      g.restore();
    }

    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.port);
    const R = DOCK.shuttleR;
    // Wings
    g.fillStyle = occupant ? occupant.colour : '#2B2545';
    g.strokeStyle = PAPER;
    g.lineWidth = 2.4;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(-R * 0.55, -R * 0.42);
    g.lineTo(-R * 1.05, -R * 0.98);
    g.lineTo(-R * 0.95, -R * 0.4);
    g.closePath();
    g.moveTo(-R * 0.55, R * 0.42);
    g.lineTo(-R * 1.05, R * 0.98);
    g.lineTo(-R * 0.95, R * 0.4);
    g.closePath();
    g.fill();
    g.stroke();
    // Hull: a capsule with its nose on the port side.
    g.fillStyle = occupant ? mix(occupant.colour, '#2B2545', 0.35) : '#3A3260';
    g.beginPath();
    g.moveTo(-R, -R * 0.42);
    g.lineTo(R * 0.45, -R * 0.42);
    g.quadraticCurveTo(R * 1.02, -R * 0.4, R * 1.02, 0);
    g.quadraticCurveTo(R * 1.02, R * 0.4, R * 0.45, R * 0.42);
    g.lineTo(-R, R * 0.42);
    g.quadraticCurveTo(-R * 1.12, 0, -R, -R * 0.42);
    g.fill();
    g.stroke();
    // Windows
    g.fillStyle = 'rgba(242, 234, 219, 0.7)';
    for (const x of [-R * 0.5, -R * 0.15, R * 0.2]) {
      g.beginPath();
      g.arc(x, -R * 0.16, 3.2, 0, Math.PI * 2);
      g.fill();
    }
    // The docking ring on the nose.
    const pulse = reserved && !occupant ? 0.5 + 0.5 * Math.sin(now / 120) : 1;
    g.strokeStyle = occupant ? PAPER : reserved ? ACCENT : GOOD;
    g.globalAlpha = 0.5 + 0.5 * pulse;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(R * 1.02, 0, 8, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    g.restore();

    // Labels stay upright.
    g.textAlign = 'center';
    g.font = `700 22px ${FONT}`;
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(7, 6, 15, 0.85)';
    g.fillStyle = occupant ? PAPER : ACCENT;
    g.strokeText(`S${s.num}`, s.x, s.y + 8);
    g.fillText(`S${s.num}`, s.x, s.y + 8);
    g.font = `600 15px ${FONT}`;
    const label = occupant ? `★ ${occupant.name}` : t(s.name);
    g.fillStyle = occupant ? PAPER : 'rgba(242, 234, 219, 0.75)';
    g.strokeText(label, s.x, s.y + R + 30);
    g.fillText(label, s.x, s.y + R + 30);
  }

  function drawShip(ship, view) {
    g.save();
    g.translate(ship.x, ship.y);
    if (ship.me) {
      g.strokeStyle = 'rgba(242, 234, 219, 0.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 0, DOCK.shipR + 9, 0, Math.PI * 2);
      g.stroke();
    }
    g.rotate(ship.a);
    if (ship.thrust && !ship.docked) {
      const flick = 0.75 + 0.25 * Math.sin(view.now / 35 + ship.x);
      const len = (ship.boost ? 26 : 15) * flick;
      g.fillStyle = ship.boost ? '#9BE1FF' : ACCENT;
      g.beginPath();
      g.moveTo(-9, -6);
      g.lineTo(-9 - len, 0);
      g.lineTo(-9, 6);
      g.closePath();
      g.fill();
    }
    g.fillStyle = ship.colour;
    g.strokeStyle = PAPER;
    g.lineWidth = 2.2;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(19, 0);
    g.lineTo(-12, -12);
    g.lineTo(-6, 0);
    g.lineTo(-12, 12);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(7, 6, 15, 0.6)';
    g.beginPath();
    g.arc(5, 0, 3.4, 0, Math.PI * 2);
    g.fill();
    g.restore();

    g.textAlign = 'center';
    g.font = `600 14px ${FONT}`;
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(7, 6, 15, 0.85)';
    g.fillStyle = ship.me ? ACCENT : PAPER;
    g.strokeText(ship.name, ship.x, ship.y + DOCK.shipR + 22);
    g.fillText(ship.name, ship.x, ship.y + DOCK.shipR + 22);
  }

  function drawBursts(now) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      const k = (now - b.t0) / 1100;
      if (k >= 1) {
        bursts.splice(i, 1);
        continue;
      }
      g.globalAlpha = 1 - k;
      g.strokeStyle = b.colour;
      g.lineWidth = 4 * (1 - k) + 1;
      for (const m of [1, 0.6]) {
        g.beginPath();
        g.arc(b.x, b.y, 20 + k * 150 * m, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = PAPER;
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2;
        const r = 18 + k * 120;
        g.fillRect(b.x + Math.cos(a) * r - 2, b.y + Math.sin(a) * r - 2, 4, 4);
      }
    }
    g.globalAlpha = 1;
  }

  // Arrows at the screen's edge for shuttles out of view, with their number
  // and distance, so nobody flies around lost.
  function drawPointers(view) {
    const { cam, pointers } = view;
    const m = 34;
    for (const s of pointers.shuttles) {
      const sx = (s.x - cam.x) * cam.zoom + w / 2;
      const sy = (s.y - cam.y) * cam.zoom + h / 2;
      if (sx > m && sy > m && sx < w - m && sy < h - m) continue;
      const dx = sx - w / 2;
      const dy = sy - h / 2;
      const k = Math.min((w / 2 - m) / Math.abs(dx || 1e-6), (h / 2 - m) / Math.abs(dy || 1e-6));
      const px = w / 2 + dx * k;
      const py = h / 2 + dy * k;
      const a = Math.atan2(dy, dx);
      const free = s.occupant === null;
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.fillStyle = free ? (s.reservedBy !== null ? ACCENT : GOOD) : 'rgba(242, 234, 219, 0.35)';
      g.beginPath();
      g.moveTo(14, 0);
      g.lineTo(-6, -10);
      g.lineTo(-2, 0);
      g.lineTo(-6, 10);
      g.closePath();
      g.fill();
      g.restore();
      const d = Math.round(Math.hypot(s.x - pointers.from.x, s.y - pointers.from.y));
      g.textAlign = 'center';
      g.font = `600 12px ${FONT}`;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(7, 6, 15, 0.9)';
      g.fillStyle = free ? PAPER : 'rgba(242, 234, 219, 0.45)';
      const lx = px - Math.cos(a) * 26;
      const ly = py - Math.sin(a) * 22 + 4;
      g.strokeText(`S${s.num} · ${d}`, lx, ly);
      g.fillText(`S${s.num} · ${d}`, lx, ly);
    }
  }

  return { resize, draw, burst, size: () => ({ w, h }) };
}

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k));
  return `rgb(${c.join(',')})`;
}

export const COLOURS = { PAPER, ACCENT, GOOD, BAD };
