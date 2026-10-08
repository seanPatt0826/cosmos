import { strokeSketch } from './sketch.js';
import { makeRng } from './rng.js';
// The chase camera.
//
// A close-up in the side column, the way a marble race keeps a second camera
// down on the track. The wide shot tells you where everyone is; this tells you
// what is actually happening to somebody.
//
// It does not render the scene a second time. It takes a crop of the frame the
// arena has already drawn and blows it up — one drawImage per frame, no extra
// physics, no second pass over the sprites, and it can never disagree with the
// main view because it *is* the main view.
//
// Who it watches:
//   many alive  — the fastest object, re-chosen every couple of seconds, since
//                 speed is a decent proxy for "something is happening here"
//   final few   — all of them, framed together, because by then the whole board
//                 is the story
//   nobody      — the middle of the arena, waiting
//
// And above all of those, the mouse. Over the arena, the viewfinder sits under
// the cursor and the close-up shows whatever is inside it, the way a marble
// race lets you move its little camera box around the track.

import { worldToScreen, screenToWorld } from './camera.js';

// How much world the close-up holds. Smaller is tighter.
const WINDOW_W = 620;
const MIN_WINDOW = 420;
const SWITCH_MS = 2200;
const FOLLOW_EASE = 0.12;   // per frame at 60fps; smoothed below for real dt
// Under the mouse: a smaller box than the automatic shot, so it reads as a
// magnifier being moved about, and a much quicker ease so it keeps up with
// the cursor instead of trailing behind it.
const POINTER_WINDOW = 340;
const POINTER_EASE = 0.45;

// A rounded rectangle as a list of points, wobbled like everything else here so
// the frame looks drawn rather than placed. Walked as four straight sides, each
// followed by the quarter turn at its end.
const VF_SEED = 0x5EEDF00D;

function roundedRectPath(rng, x, y, w, h, r, wob = 0.9) {
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
    const n = Math.max(2, Math.round(Math.hypot(s.bx - s.ax, s.by - s.ay) / 26));
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

export function createCameraBox(canvasEl, captionEl) {
  // The same shape, so callers never have to check whether the box exists.
  if (!canvasEl) {
    return {
      update() {}, reset() {}, lock() {}, lockedOn() { return null; },
      aimAt() {}, aimClear() {}, worldAtBox() { return null; },
      pointAt() {}, pointClear() {},
      hoverFocus() {}, hoverOn() { return null; }, drawViewfinder() {},
    };
  }
  const g = canvasEl.getContext('2d');

  let cx = 0;
  let cy = 0;
  let placed = false;        // snap on the first frame, ease after that
  let subjectId = null;
  let sinceSwitch = 0;
  // Set by clicking an object in the arena. While it holds, it beats both the
  // automatic pick and the finale framing: having chosen somebody to watch, you
  // want to keep watching them when it gets interesting, not be panned away.
  let lockedId = null;
  // Where inside the box the pointer is, as an offset from its middle in the
  // range -0.5 to 0.5 on each axis. Null when the pointer is elsewhere.
  let aim = null;
  // The crop the last frame actually drew, so a pointer over the box can be
  // turned back into a point in the arena.
  let crop = null;
  // Whoever the pointer is resting on inside the box. Beats the lock and the
  // automatic pick while it lasts, and is forgotten the moment the pointer
  // leaves.
  let hoverId = null;
  // Where the mouse is over the arena, in CSS pixels on the main canvas. Kept
  // as a screen point and turned into a world point every frame, so the box
  // stays under the cursor while the wide shot pans and zooms beneath it.
  let pointer = null;

  function pickSubject(alive) {
    let best = null;
    let bestSpeed = -1;
    for (const p of alive) {
      if (!p.body) continue;
      const v = p.body.velocity;
      const s = v.x * v.x + v.y * v.y;
      if (s > bestSpeed) { bestSpeed = s; best = p; }
    }
    return best;
  }

  return {
    reset() {
      placed = false;
      subjectId = null;
      sinceSwitch = 0;
      // A new round is a new cast. Holding the old id would mean holding
      // nothing, and the first frame would jump.
      lockedId = null;
    },

    // Null releases the lock and hands the shot back to the automatic pick.
    lock(player) {
      lockedId = player && player.body ? player.body.id : null;
      sinceSwitch = 0;
    },

    lockedOn() {
      return lockedId;
    },

    // Point the shot at whatever is under the pointer. `fx` and `fy` are the
    // pointer's position inside the box, 0 to 1.
    //
    // Deliberately a fraction of the box rather than the world point under the
    // cursor. Projecting the cursor back through the live crop would feed back
    // on itself: the shot re-centres, which moves the crop, which maps the same
    // cursor position to a new place, and the view slides away on its own. An
    // offset from whatever is being followed cannot do that.
    aimAt(fx, fy) {
      aim = {
        x: Math.max(-0.5, Math.min(0.5, fx - 0.5)),
        y: Math.max(-0.5, Math.min(0.5, fy - 0.5)),
      };
    },

    aimClear() {
      aim = null;
      hoverId = null;
    },

    // The point in the arena under a pointer sitting at `fx`, `fy` of the box.
    // Null before the first frame has drawn anything.
    worldAtBox(fx, fy) {
      if (!crop) return null;
      // Box fraction -> device pixels on the main canvas -> CSS pixels -> world.
      const px = (crop.sx + fx * crop.sw) / crop.dpr;
      const py = (crop.sy + fy * crop.sh) / crop.dpr;
      return screenToWorld(crop.cam, px, py, crop.stageW, crop.viewH);
    },

    // Hold whoever the pointer is resting on. Null means the pointer is over
    // the box but not over anybody, which still steers via aimAt.
    hoverFocus(player) {
      hoverId = player && player.body ? player.body.id : null;
    },

    hoverOn() {
      return hoverId;
    },

    pointAt(px, py) {
      pointer = { x: px, y: py };
    },

    pointClear() {
      pointer = null;
    },

    // The viewfinder: a roundish square on the wide shot marking the patch the
    // close-up is holding.
    //
    // Without it the two views are unrelated pictures. Something happens in the
    // close-up and there is no way to tell where in the arena it happened, or
    // to look ahead of it — you cannot see what the subject is about to run
    // into, because you cannot see where the subject is.
    //
    // Drawn after the close-up has taken its crop, never before. The close-up
    // copies pixels straight off this canvas, so a frame drawn first would be
    // copied into the very box it describes and sit inside its own view as a
    // border.
    drawViewfinder(mainG) {
      if (!crop) return;
      const { sx, sy, sw, sh, dpr } = crop;
      if (!(sw > 0 && sh > 0)) return;

      const x = sx / dpr;
      const y = sy / dpr;
      const w = sw / dpr;
      const h = sh / dpr;
      // While the close-up is holding the whole arena — between rounds, or with
      // nobody left — the crop is the screen, and a frame around the screen
      // says nothing. Only drawn when it is actually framing something.
      if (w >= crop.stageW * 0.97 || h >= crop.viewH * 0.97) return;

      const r = Math.min(w, h) * 0.17;
      const pts = roundedRectPath(makeRng(VF_SEED), x, y, w, h, r);

      mainG.save();
      // Back into CSS pixels, whatever the scene left on the context.
      mainG.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Two passes: a dark one to lift the line off a pale nebula, a light one
      // over it for the dark skies. Neither theme can swallow the frame.
      strokeSketch(mainG, pts, makeRng(VF_SEED), {
        color: 'rgba(14,12,26,0.45)', width: 4.2, alpha: 0.5, passes: 1,
      });
      strokeSketch(mainG, pts, makeRng(VF_SEED), {
        color: 'rgba(242,240,255,0.78)', width: 1.7, alpha: 0.8, passes: 2,
      });
      mainG.restore();
    },
    update(round, dtMs, mainCanvas, stageW, viewH, dpr) {
      const W = canvasEl.width;
      const H = canvasEl.height;
      const cam = round.cam;
      const alive = round.alivePlayers();

      let targetX;
      let targetY;
      let windowW = WINDOW_W;
      let caption = '';

      // A locked subject that has been eliminated releases itself, rather than
      // leaving the shot parked on an empty patch of space.
      const locked = lockedId === null
        ? null
        : alive.find((p) => p.body && p.body.id === lockedId) || null;
      if (lockedId !== null && !locked) lockedId = null;

      // Pointing at somebody in the box beats everything else, including a
      // lock. It is the most direct statement of intent there is: you are
      // pointing straight at them.
      const hovered = hoverId === null
        ? null
        : alive.find((p) => p.body && p.body.id === hoverId) || null;
      if (hoverId !== null && !hovered) hoverId = null;

      if (pointer) {
        // The mouse is over the arena: the box goes where it goes. Beats a
        // lock too; moving off the arena hands the shot back to it.
        const w = screenToWorld(cam, pointer.x, pointer.y, stageW, viewH);
        targetX = w.x;
        targetY = w.y;
        windowW = POINTER_WINDOW;
        const under = playerAt(round, w.x, w.y);
        caption = under ? (under.name || 'unnamed') : '';
      } else if (hovered) {
        targetX = hovered.body.position.x;
        targetY = hovered.body.position.y;
        // Tighter than a lock, so pointing at somebody visibly closes in on
        // them rather than just nudging the frame across.
        windowW = MIN_WINDOW * 0.62;
        caption = hovered.name || 'unnamed';
      } else if (locked) {
        targetX = locked.body.position.x;
        targetY = locked.body.position.y;
        windowW = MIN_WINDOW;
        caption = locked.name || 'unnamed';
      } else if (round.idle || alive.length === 0) {
        const b = round.map.bounds;
        targetX = b.x + b.w / 2;
        targetY = b.y + b.h / 2;
        windowW = Math.max(b.w, b.h);
        caption = 'waiting';
      } else if (alive.length <= 3) {
        // Frame the survivors together, with enough room that none of them is
        // sitting on the edge of the shot.
        let minX = Infinity; let maxX = -Infinity;
        let minY = Infinity; let maxY = -Infinity;
        for (const p of alive) {
          const q = p.body.position;
          minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
          minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
        }
        targetX = (minX + maxX) / 2;
        targetY = (minY + maxY) / 2;
        windowW = Math.max(MIN_WINDOW, (maxX - minX) * 1.9, (maxY - minY) * 1.9 * (W / H));
        caption = alive.length === 1
          ? (alive[0].name || 'the winner')
          : `final ${alive.length}`;
      } else {
        sinceSwitch += dtMs;
        let subject = alive.find((p) => p.body && p.body.id === subjectId);
        if (!subject || sinceSwitch >= SWITCH_MS) {
          subject = pickSubject(alive) || subject;
          if (subject) { subjectId = subject.body.id; sinceSwitch = 0; }
        }
        if (!subject) return;
        targetX = subject.body.position.x;
        targetY = subject.body.position.y;
        caption = subject.name || '';
      }

      // Hovering empty space in the box slides the shot toward the corner you
      // are pointing at, up to half a window each way. Skipped when the pointer
      // is on somebody, because then the shot is already centring on them and
      // an offset would only shove them back out of the middle.
      if (aim && !hovered && !pointer) {
        targetX += aim.x * windowW;
        targetY += aim.y * windowW * (H / W);
      }

      if (!placed) {
        cx = targetX; cy = targetY; placed = true;
      } else {
        // Framerate-independent easing, so a slow frame does not jerk the shot.
        const ease = pointer ? POINTER_EASE : FOLLOW_EASE;
        const k = 1 - Math.pow(1 - ease, Math.max(0.1, dtMs / 16.667));
        cx += (targetX - cx) * k;
        cy += (targetY - cy) * k;
      }

      // Where that lands on the frame the arena just drew, in device pixels.
      const centre = worldToScreen(cam, cx, cy, stageW, viewH);
      let sw = windowW * cam.zoom * dpr;
      let sh = sw * (H / W);
      // The arena is only the part of the canvas the rail does not cover.
      //
      // The canvas runs the full width of the window and the panels sit on
      // top of it, so its right-hand strip is drawn but never seen. Clamping
      // to the canvas let the close-up — and the viewfinder that marks it —
      // wander into that strip, showing a slice of arena that is behind the
      // panels from the viewer's side. Clamped to the stage instead, both stay
      // in the part of the world somebody is actually looking at.
      const liveW = Math.min(mainCanvas.width, Math.round(stageW * dpr));

      // Never ask for more than exists, or the crop comes back letterboxed in
      // transparent black.
      if (sw > liveW) { sw = liveW; sh = sw * (H / W); }
      if (sh > mainCanvas.height) { sh = mainCanvas.height; sw = sh * (W / H); }

      let sx = centre.x * dpr - sw / 2;
      let sy = centre.y * dpr - sh / 2;
      // Slide the crop back inside rather than letting the edge of the world
      // show as a black band.
      sx = Math.max(0, Math.min(liveW - sw, sx));
      sy = Math.max(0, Math.min(mainCanvas.height - sh, sy));

      // Remembered so a pointer sitting over the box can be turned back into a
      // place in the arena. Only the finished, clamped crop will do: the
      // unclamped one lies about what is actually on screen near an edge.
      crop = { sx, sy, sw, sh, dpr, cam, stageW, viewH };

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      try {
        g.drawImage(mainCanvas, sx, sy, sw, sh, 0, 0, W, H);
      } catch (err) {
        /* A zero-width crop on the very first frame is not worth a stack trace. */
      }

      if (captionEl && captionEl.textContent !== caption) {
        captionEl.textContent = caption;
      }
    },
  };
}

// Which object is under a point in the arena, if any.
//
// The grab radius has a floor well above the objects' own radius. They are
// eighteen units across and can be moving fast; asking someone to land a click
// inside eighteen units of world space would make the feature feel broken
// rather than precise. Nearest-within-reach, so a crowd still resolves to the
// one you actually meant.
const GRAB_MIN = 30;

export function playerAt(round, wx, wy) {
  let best = null;
  let bestD = Infinity;
  for (const p of round.alivePlayers()) {
    if (!p.body) continue;
    const q = p.body.position;
    const d = Math.hypot(q.x - wx, q.y - wy);
    const reach = Math.max(GRAB_MIN, (p.body.circleRadius || 0) * 1.6);
    if (d < reach && d < bestD) { bestD = d; best = p; }
  }
  return best;
}
