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

import { worldToScreen } from './camera.js';

// How much world the close-up holds. Smaller is tighter.
const WINDOW_W = 620;
const MIN_WINDOW = 420;
const SWITCH_MS = 2200;
const FOLLOW_EASE = 0.12;   // per frame at 60fps; smoothed below for real dt

export function createCameraBox(canvasEl, captionEl) {
  // The same shape, so callers never have to check whether the box exists.
  if (!canvasEl) {
    return {
      update() {}, reset() {}, lock() {}, lockedOn() { return null; },
      aimAt() {}, aimClear() {},
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

      if (locked) {
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

      // Hovering the box slides the shot toward the corner you are pointing at,
      // up to half a window each way, so the subject ends at the far edge
      // rather than leaving the frame. Easing is already below, so it glides.
      if (aim) {
        targetX += aim.x * windowW;
        targetY += aim.y * windowW * (H / W);
      }

      if (!placed) {
        cx = targetX; cy = targetY; placed = true;
      } else {
        // Framerate-independent easing, so a slow frame does not jerk the shot.
        const k = 1 - Math.pow(1 - FOLLOW_EASE, Math.max(0.1, dtMs / 16.667));
        cx += (targetX - cx) * k;
        cy += (targetY - cy) * k;
      }

      // Where that lands on the frame the arena just drew, in device pixels.
      const centre = worldToScreen(cam, cx, cy, stageW, viewH);
      let sw = windowW * cam.zoom * dpr;
      let sh = sw * (H / W);
      // Never ask for more than exists, or the crop comes back letterboxed in
      // transparent black.
      if (sw > mainCanvas.width) { sw = mainCanvas.width; sh = sw * (H / W); }
      if (sh > mainCanvas.height) { sh = mainCanvas.height; sw = sh * (W / H); }

      let sx = centre.x * dpr - sw / 2;
      let sy = centre.y * dpr - sh / 2;
      // Slide the crop back inside rather than letting the edge of the world
      // show as a black band.
      sx = Math.max(0, Math.min(mainCanvas.width - sw, sx));
      sy = Math.max(0, Math.min(mainCanvas.height - sh, sy));

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
