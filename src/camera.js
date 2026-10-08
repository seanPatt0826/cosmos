// The camera does the work a commentator would.
//
// It frames whoever is still alive and tightens as the population drops, so the
// finale becomes a close-up without ever cutting. Everything is eased; nothing
// snaps. A hard cut would break the spell this whole thing runs on.

import { CAMERA, ROUND } from './config.js';

// How much of the arena diameter the wide shot has to hold. Slightly under
// one, so the rim sits at the edge of the frame rather than floating inside
// it with dead space beyond.
const RIM_IN_SHOT = 0.92;

export function createCamera(bounds) {
  const cx = bounds ? bounds.x + bounds.w / 2 : 0;
  const cy = bounds ? bounds.y + bounds.h / 2 : 0;
  return {
    x: cx, y: cy, zoom: 1,
    tx: cx, ty: cy, tz: 1,
    shake: 0,
    ox: 0, oy: 0,
  };
}

export function nudge(cam, amount) {
  cam.shake = Math.min(9, cam.shake + amount);
}

export function update(cam, dtMs, players, viewW, viewH, bounds, opts = {}) {
  const alive = players.filter((p) => p.alive && p.body);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const focus = alive.length ? alive : players.filter((p) => p.death && p.death.t < 1);

  if (focus.length) {
    for (const p of focus) {
      const pos = p.body ? p.body.position : p.death.pos;
      if (!pos) continue;
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y > maxY) maxY = pos.y;
    }
  }

  if (!isFinite(minX)) {
    minX = bounds.x;
    minY = bounds.y;
    maxX = bounds.x + bounds.w;
    maxY = bounds.y + bounds.h;
  }

  const pad = CAMERA.padding;
  let w = Math.max(220, maxX - minX) + pad * 2;
  let h = Math.max(220, maxY - minY) + pad * 2;

  // Keep the arena wall in shot.
  //
  // Framing the survivors alone is the right instinct and it was quietly
  // hiding the thing the arena is built around. The rim sits at radius 1250
  // to 1680 depending on the map, the objects spend the early round clustered
  // near the middle, and the result was a view cropped so far inside the
  // boundary that the fence only ever appeared as a stray arc clipping one
  // corner — a closed rim and an open one looked identical from the seat the
  // player is actually in.
  //
  // So the framing has a floor: whatever the pack is doing, hold enough of
  // the world to show the boundary. It still follows the pack, still eases,
  // and `edge` contracts as the round tightens, so this pulls in on its own
  // rather than locking the shot wide.
  //
  // Deliberately not applied to the finale. Once it is down to the last few
  // the close-up matters more than the wall, and `finaleZoom` below should be
  // free to push past this.
  //
  // Nor to a field still waiting on the line. Two or three entrants stand
  // far apart near the rim, and the close-up pushed in past every one of
  // them: names were typed and nothing appeared on screen. On the line the
  // whole field is the point, so it is framed wide.
  const finale = !opts.waiting && alive.length > 0 && alive.length <= ROUND.finalCallout;
  if (!finale) {
    // Circular arenas carry a live `edge`; Nebula Garden is a walled box and
    // carries none, so its own bounds stand in.
    const spanW = opts.edge ? opts.edge * 2 : (bounds ? bounds.w : 0);
    const spanH = opts.edge ? opts.edge * 2 : (bounds ? bounds.h : 0);
    if (spanW) w = Math.max(w, spanW * RIM_IN_SHOT + pad);
    if (spanH) h = Math.max(h, spanH * RIM_IN_SHOT + pad);
  }

  cam.tx = (minX + maxX) / 2;
  cam.ty = (minY + maxY) / 2;
  // On the line the whole arena is in shot, so centre on the arena itself.
  // Centred on the field, one entrant pulled the ring half off the screen.
  if (opts.waiting && bounds) {
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    w = Math.max(w, 2 * Math.max(maxX - cx, cx - minX) + pad * 2);
    h = Math.max(h, 2 * Math.max(maxY - cy, cy - minY) + pad * 2);
    cam.tx = cx;
    cam.ty = cy;
  }

  let z = Math.min(viewW / w, viewH / h);
  // Once it is down to the last few, push in. The tension is on their faces,
  // so to speak, not on the empty arena around them.
  if (finale) z *= CAMERA.finaleZoom;
  if (opts.zoomBias) z *= opts.zoomBias;
  cam.tz = Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, z));

  // Someone is steering. With the pointer over the mini map, the white box sits
  // under it and the arena shows what is inside the box, the way a marble race
  // lets you drag its camera around the track. The commentator waits.
  const aim = opts.aim;
  if (aim) {
    cam.tx = aim.x;
    cam.ty = aim.y;
    cam.tz = Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, viewW / aim.span));
  }

  // Frame-rate independent easing: the same feel at 30fps as at 144. A hand on
  // the mini map wants the arena to keep up with it, so steering eases faster.
  const f = Math.min(3, dtMs / 16.667);
  const ke = 1 - Math.pow(1 - (aim ? CAMERA.aimEase : CAMERA.ease), f);
  const kz = 1 - Math.pow(1 - (aim ? CAMERA.aimEase : CAMERA.zoomEase), f);
  cam.x += (cam.tx - cam.x) * ke;
  cam.y += (cam.ty - cam.y) * ke;
  cam.zoom += (cam.tz - cam.zoom) * kz;

  if (cam.shake > 0.01) {
    cam.ox = (Math.random() - 0.5) * cam.shake;
    cam.oy = (Math.random() - 0.5) * cam.shake;
    cam.shake *= Math.pow(0.88, f);
  } else {
    cam.ox = 0;
    cam.oy = 0;
    cam.shake = 0;
  }
}

export function applyTransform(ctx, cam, viewW, viewH) {
  ctx.translate(viewW / 2 + cam.ox, viewH / 2 + cam.oy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

// World to screen. Name labels are drawn after the camera transform is undone,
// so they stay a constant readable size however far the camera has pushed in.
export function worldToScreen(cam, x, y, viewW, viewH) {
  return {
    x: (x - cam.x) * cam.zoom + viewW / 2 + cam.ox,
    y: (y - cam.y) * cam.zoom + viewH / 2 + cam.oy,
  };
}

// The inverse, for turning a click back into a place in the arena. Kept next to
// its twin so the two cannot drift apart.
export function screenToWorld(cam, x, y, viewW, viewH) {
  return {
    x: (x - viewW / 2 - cam.ox) / cam.zoom + cam.x,
    y: (y - viewH / 2 - cam.oy) / cam.zoom + cam.y,
  };
}

// Normalised -1..1 pan, for the parallax background.
export function panOf(cam, bounds) {
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  return {
    x: clamp((cam.x - cx) / (bounds.w / 2 || 1), -1, 1),
    y: clamp((cam.y - cy) / (bounds.h / 2 || 1), -1, 1),
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
