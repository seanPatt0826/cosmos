// The mini map.
//
// The side panel used to be a close-up: a magnified crop of the arena with a
// white box on the arena marking where the crop came from. It is now the other
// way round. The panel holds the whole universe, rim to rim, on every map, and
// the white box sits on the panel, marking the part of it the big arena is
// showing. When the arena pulls in for the finale, the box shrinks.
//
// Move the mouse over the arena and the panel follows it instead: it flies in
// on the cursor as a close-up, racers at their real size with their names, and
// pulls back out to the whole map when the mouse leaves.
//
// It draws the live map rather than a copy of the arena's pixels, because the
// arena is not always showing all of it. The scenery is the real thing, drawn
// with each map's own drawBack and drawFront exactly the way the universe
// portraits are, just every frame and at the round's own clock, so moving
// hazards move here too. The racers are dots: at this scale a full drawing
// would be a pixel across, and a dot in the racer's colour is the thing you
// can actually find.

import { strokeSketch } from './sketch.js';
import { makeRng } from './rng.js';
import { createBackground } from './background.js';
import { screenToWorld } from './camera.js';
import { isLight } from './theme.js';
import { t } from './i18n.js';

// Air between the rim and the panel's edge, as a fraction of the panel.
const FIT = 0.94;
const DOT = 3.2;
const VF_SEED = 0x5EEDF00D;
// With the mouse over the arena the panel becomes a close-up that follows the
// cursor, this much world across. It eases quickly enough to keep up with a
// moving hand, and pulls back out to the whole map more gently when the mouse
// leaves.
const POINTER_WINDOW = 520;
const POINTER_EASE = 0.45;
const RETURN_EASE = 0.18;

// A rounded rectangle as a list of points, wobbled like everything else here so
// the frame looks drawn rather than placed.
function roundedRectPath(rng, x, y, w, h, r, wob = 0.5) {
  const pts = [];
  const push = (px, py) => pts.push({ x: px + rng.wobble(wob), y: py + rng.wobble(wob) });
  const TURN = 4;
  const sides = [
    { ax: x + r, ay: y, bx: x + w - r, by: y, cx: x + w - r, cy: y + r, a0: -Math.PI / 2 },
    { ax: x + w, ay: y + r, bx: x + w, by: y + h - r, cx: x + w - r, cy: y + h - r, a0: 0 },
    { ax: x + w - r, ay: y + h, bx: x + r, by: y + h, cx: x + r, cy: y + h - r, a0: Math.PI / 2 },
    { ax: x, ay: y + h - r, bx: x, by: y + r, cx: x + r, cy: y + r, a0: Math.PI },
  ];
  for (const s of sides) {
    const n = Math.max(2, Math.round(Math.hypot(s.bx - s.ax, s.by - s.ay) / 18));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      push(s.ax + (s.bx - s.ax) * t, s.ay + (s.by - s.ay) * t);
    }
    for (let i = 0; i <= TURN; i++) {
      const a = s.a0 + (Math.PI / 2) * (i / TURN);
      push(s.cx + Math.cos(a) * r, s.cy + Math.sin(a) * r);
    }
  }
  return pts;
}

export function createMiniMap(canvasEl, captionEl) {
  if (!canvasEl) return { update() {}, reset() {}, worldAt() { return null; }, worldPerPx() { return 1; } };
  const g = canvasEl.getContext('2d');

  let bg = null;
  let bgKey = '';
  let last = null;   // the fit the last frame used, for pointer lookups
  let view = null;   // the panel's camera: world centre and scale, eased
  let viewKey = '';  // a new round or a resized panel snaps rather than eases
  let font = '';
  // The page's own handwriting, read once, so names here match the arena's.
  const labelFont = () => font
    || (font = getComputedStyle(document.body).fontFamily || 'cursive');

  // Backing store follows the box's real size, so the map is drawn at the
  // resolution it is shown at rather than stretched from a fixed bitmap.
  function size(dpr) {
    const r = canvasEl.getBoundingClientRect();
    const w = Math.max(1, Math.round((r.width || canvasEl.width) * dpr));
    const h = Math.max(1, Math.round((r.height || canvasEl.height) * dpr));
    if (canvasEl.width !== w) canvasEl.width = w;
    if (canvasEl.height !== h) canvasEl.height = h;
    return { w, h };
  }

  return {
    reset() {
      bg = null;
      bgKey = '';
      view = null;
    },

    // World units per CSS pixel of the panel, for sizing a pointer's reach.
    worldPerPx(cssW) {
      return last ? last.w / cssW / last.s : 1;
    },

    // Panel fractions (0..1) to a place in the world, for a pointer over it.
    worldAt(fx, fy) {
      if (!last) return null;
      return {
        x: (fx * last.w - last.ox) / last.s,
        y: (fy * last.h - last.oy) / last.s,
      };
    },

    // `aim` is the world point under the mouse while it is over the arena, or
    // null; with it, the panel zooms in on that point and follows it.
    update(round, stageW, viewH, dpr, focusId = null, aim = null) {
      const { w: W, h: H } = size(Math.min(2, dpr || 1));
      const b = round.map.bounds;
      // The panel's own camera. At rest it holds the whole universe; with the
      // mouse over the arena it flies in on the cursor and follows it, and
      // when the mouse leaves it pulls back out to the whole map again.
      const fitS = Math.min(W / b.w, H / b.h) * FIT;
      const want = aim
        ? { x: aim.x, y: aim.y, s: W / POINTER_WINDOW }
        : { x: b.x + b.w / 2, y: b.y + b.h / 2, s: fitS };
      const vk = `${round.seed}|${round.mapDef.id}|${W}x${H}`;
      if (!view || viewKey !== vk) {
        view = { ...want };
        viewKey = vk;
      } else {
        const e = aim ? POINTER_EASE : RETURN_EASE;
        view.x += (want.x - view.x) * e;
        view.y += (want.y - view.y) * e;
        // Zoom eases in log space, so going in and coming out feel the same.
        view.s = Math.exp(Math.log(view.s) + (Math.log(want.s) - Math.log(view.s)) * e);
      }
      const s = view.s;
      // 0 at the whole map, 1 fully zoomed in on the cursor.
      const zoom = Math.max(0, Math.min(1,
        Math.log(s / fitS) / Math.log(Math.max(1.0001, (W / POINTER_WINDOW) / fitS))));
      // World -> panel: p * s + o.
      const ox = W / 2 - view.x * s;
      const oy = H / 2 - view.y * s;
      last = { s, ox, oy, w: W, h: H };

      const key = `${round.seed}|${round.mapDef.id}|${W}x${H}|${isLight() ? 'l' : 'd'}`;
      if (!bg || bgKey !== key) {
        bg = createBackground(W, H, round.seed, round.mapDef.theme);
        bgKey = key;
      }

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      bg.draw(g);

      g.save();
      g.setTransform(s, 0, 0, s, ox, oy);
      try {
        // No camera, the same as the portraits: none of the maps read it.
        if (round.map.drawBack) round.map.drawBack(g, null, round.time);
        if (round.map.drawFront) round.map.drawFront(g, null, round.time);
      } catch (err) {
        /* A map that will not draw small must not take the frame with it. */
      }
      g.restore();

      // The racers, as dots in their own colour with a dark rim so they read
      // on any sky. Whoever the arena is ringing gets a bigger, haloed dot.
      const k = Math.min(2, dpr || 1);
      const light = isLight();
      for (const p of round.players) {
        if (!p.alive || !p.body) continue;
        const x = p.body.position.x * s + ox;
        const y = p.body.position.y * s + oy;
        const focus = focusId !== null && p.body.id === focusId;
        // Zoomed in, a dot grows to the racer's real size, so the close-up
        // reads as the objects themselves rather than as pins.
        const r = Math.max(DOT * k, (p.body.circleRadius || 0) * s) * (focus ? 1.6 : 1);
        if (focus) {
          g.beginPath();
          g.arc(x, y, r + 3.5 * k, 0, Math.PI * 2);
          g.strokeStyle = light ? 'rgba(46,41,52,0.8)' : 'rgba(242,240,255,0.85)';
          g.lineWidth = 1.4 * k;
          g.stroke();
        }
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = light ? p.col.crayon : p.col.glow;
        g.fill();
        g.lineWidth = 1 * k;
        g.strokeStyle = light ? 'rgba(46,41,52,0.55)' : 'rgba(7,6,15,0.7)';
        g.stroke();
        // Close enough in to read, the name goes under the drawing.
        if (zoom > 0.6 && p.name) {
          g.font = `600 ${11 * k}px ${labelFont()}`;
          g.textAlign = 'center';
          g.textBaseline = 'top';
          g.globalAlpha = Math.min(1, (zoom - 0.6) / 0.3);
          g.lineWidth = 3 * k;
          g.strokeStyle = light ? 'rgba(242,238,228,0.9)' : 'rgba(7,6,15,0.85)';
          g.strokeText(p.name, x, y + r + 3 * k);
          g.fillStyle = light ? 'rgba(46,41,52,0.95)' : 'rgba(242,240,255,0.95)';
          g.fillText(p.name, x, y + r + 3 * k);
          g.globalAlpha = 1;
        }
      }

      // The white box: the patch of the universe the arena is showing right
      // now, its corners the stage's corners run back through the camera.
      // Only while the panel holds the whole map; zoomed in on the cursor the
      // panel is a close-up, and the arena's frame would be far off its edges.
      const a = screenToWorld(round.cam, 0, 0, stageW, viewH);
      const c = screenToWorld(round.cam, stageW, viewH, stageW, viewH);
      let x0 = a.x * s + ox;
      let y0 = a.y * s + oy;
      let x1 = c.x * s + ox;
      let y1 = c.y * s + oy;
      const boxAlpha = 1 - Math.min(1, zoom / 0.25);
      // Kept inside the panel, so a view wider than the map still has a
      // visible frame rather than one drawn off the edge.
      const inset = 2 * k;
      x0 = Math.max(inset, x0); y0 = Math.max(inset, y0);
      x1 = Math.min(W - inset, x1); y1 = Math.min(H - inset, y1);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw > 4 && bh > 4 && boxAlpha > 0.01) {
        g.globalAlpha = boxAlpha;
        const pts = roundedRectPath(makeRng(VF_SEED), x0, y0, bw, bh, Math.min(bw, bh) * 0.12, 0.5 * k);
        // Dark under light, so neither theme can swallow it.
        strokeSketch(g, pts, makeRng(VF_SEED), {
          color: 'rgba(14,12,26,0.5)', width: 3.4 * k, alpha: 0.5, passes: 1,
        });
        strokeSketch(g, pts, makeRng(VF_SEED), {
          color: 'rgba(242,240,255,0.9)', width: 1.4 * k, alpha: 0.85, passes: 2,
        });
        g.globalAlpha = 1;
      }

      const alive = round.alivePlayers().length;
      const caption = round.idle ? t('waiting for names')
        : alive === 1 && round.winner ? (round.winner.name || t('the winner'))
          : t('{n} still in', { n: alive });
      if (captionEl && captionEl.textContent !== caption) captionEl.textContent = caption;
    },
  };
}

// Which object is under a point in the arena, if any. Nearest within reach, so
// a crowd still resolves to the one you meant. The reach has a floor well above
// the objects' own radius: asking for a click inside eighteen units of a fast
// mover would make the feature feel broken rather than precise.
const GRAB_MIN = 30;

export function playerAt(round, wx, wy, reachMin = GRAB_MIN) {
  let best = null;
  let bestD = Infinity;
  for (const p of round.alivePlayers()) {
    if (!p.body) continue;
    const q = p.body.position;
    const d = Math.hypot(q.x - wx, q.y - wy);
    const reach = Math.max(reachMin, (p.body.circleRadius || 0) * 1.6);
    if (d < reach && d < bestD) { bestD = d; best = p; }
  }
  return best;
}
