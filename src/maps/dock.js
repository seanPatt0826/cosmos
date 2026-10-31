// Docking Bay — musical chairs with shuttles.
//
// The race happens in heats. Each heat lays out one shuttle fewer than the
// racers still in. Nobody steers: racers float and bounce round the room the
// way they do in every universe, and a racer that drifts into a free
// shuttle's docking circle is caught and latched on. When the last shuttle
// is taken, whoever is still floating is out. Everyone lets go, drifts off,
// and the next heat starts with one shuttle fewer, until one racer is left.
//
// Floating alone could leave the last racer drifting past the last shuttle
// for ages, so every free shuttle has a tractor beam: a gentle pull toward its
// port that reaches further and pulls harder the longer the heat goes on.
// The beams are the same for everyone; who gets caught is down to where they
// happen to be drifting.
//
// Two or three black holes sit out past the shuttles (the right-hand corners,
// sometimes one by the top or bottom edge), each wobbling slowly round its
// own spot. They pull, and a floating racer that
// falls in is out on the spot. Docked racers are safe. A free shuttle leaves
// with whoever fell in, so the seats still free stay one fewer than the
// racers still looking for one.

import { makeRng, hashSeed } from '../rng.js';
import { staticRect, staticCircle, add, remove } from '../engine.js';
import { drawEdge } from './common.js';
import { createHole, updateHoles, holeCapturing, drawHoles } from './hazards.js';
import { BODY } from '../config.js';
import { t } from '../i18n.js';

const W = 2400;
const H = 1600;
const HULL_R = 72;                       // the shuttle's solid body
const PORT_D = HULL_R + BODY.radius + 4; // where a docked racer's centre sits
const CATCH_R = 76;                      // drift this close to a free port and you're caught
const BEAM_R = [480, 1400];               // tractor reach, at the start of a heat and at full strength
const BEAM_PULL = [0.02, 0.09];         // pull at the port, in speed per physics step
const BEAM_RAMP_MS = 12000;              // how long the beams take to reach full strength
const BEAM_DAMP = 0.06;                 // how much sideways drift a beam bleeds off per step
const MIN_SPEED = 1.6;                   // a racer slower than this gets a nudge, so nobody stalls
const HEAT_LIMIT_MS = 45000;             // insurance: a heat this long is called
const VERDICT_MS = 1300;                 // the left-out racer is shown, then goes
const BREAK_MS = 1400;                   // between heats, before the next shuttles arrive
const HOLE_WOBBLE = 110;                 // how far a black hole wanders from its corner
const HOLE_CLEAR = 300;                  // shuttles keep at least this far from a hole

export default {
  id: 'dock',
  name: 'Docking Bay',
  theme: 'dock',
  population: [2, 16],
  blurb: 'one shuttle short',
  rules: {
    out: 'Still floating when the last shuttle is taken, or falling into a black hole.',
    watch: 'Every heat has one shuttle fewer than racers. Drift into a docking circle to get a seat, and keep clear of the black holes in the corners.',
  },
  description: 'There is always one shuttle too few: drift into a docking circle to take a seat, mind the black holes, and whoever is left floating each heat is out.',

  build({ sim, seed }) {
    const { Matter } = sim;
    const rng = makeRng(hashSeed('dock', seed));
    const half = { w: W / 2, h: H / 2 };
    const bounds = { x: -half.w, y: -half.h, w: W, h: H };

    // Bouncy walls: nothing here should ever come to rest against an edge.
    const wallOpts = { restitution: 1.0, friction: 0 };
    add(sim,
      staticRect(sim, 0, -half.h - 40, W + 200, 80, wallOpts),
      staticRect(sim, 0, half.h + 40, W + 200, 80, wallOpts),
      staticRect(sim, -half.w - 40, 0, 80, H + 200, wallOpts),
      staticRect(sim, half.w + 40, 0, 80, H + 200, wallOpts),
    );

    // Black holes in the two right-hand corners, and sometimes a third near
    // the top or bottom edge, each with its own slow wobble round its home
    // spot. Never on the left: on a computer the page's left-hand cards
    // cover that third of the room, and a hole nobody can see is not fair.
    const spots = [[0.78, 0.7], [0.78, -0.7]];
    if (rng() < 0.5) spots.push([rng.range(-0.05, 0.3), rng.sign() * 0.8]);
    const holes = spots.map(([fx, fy], i) => {
      const r = rng.range(38, 48);
      const home = { x: fx * half.w, y: fy * half.h };
      const h = createHole(sim, {
        x: home.x, y: home.y, r,
        seed: hashSeed('dockhole', seed, i),
        mu: r * 150,
        maxAccel: 0.75,
      });
      h.home = home;
      h.phase = rng() * Math.PI * 2;
      h.speed = rng.range(0.00025, 0.0005);
      return h;
    });

    let shuttles = [];   // { id, num, x, y, port, body, occupant, born, gone }
    let leaving = [];    // last heat's shuttles, fading out
    let heatNo = 0;
    let heat = null;     // { phase: 'race' | 'verdict' | 'break' | 'done', t, loser }

    // Lays out `count` shuttles round the room, spread evenly so no part of
    // it is favoured, each with its port facing somewhere between the middle
    // and side-on, never into a wall, and clear of the black holes: it turns
    // the whole ring until nothing sits within HOLE_CLEAR of a hole's home.
    function layout(count, time) {
      let best = null;
      let bestGap = -1;
      for (let attempt = 0; attempt < 24; attempt++) {
        const ring = ringOf(count, time);
        let gap = Infinity;
        for (const s of ring) {
          const q = portOf(s);
          for (const h of holes) {
            gap = Math.min(gap,
              Math.hypot(s.x - h.home.x, s.y - h.home.y),
              Math.hypot(q.x - h.home.x, q.y - h.home.y));
          }
        }
        if (gap > bestGap) {
          best = ring;
          bestGap = gap;
        }
        if (gap >= HOLE_CLEAR + HOLE_WOBBLE) break;
      }
      return best || [];
    }

    function ringOf(count, time) {
      const out = [];
      const turn = rng() * Math.PI * 2;
      const rx = half.w * 0.66;
      const ry = half.h * 0.62;
      for (let i = 0; i < count; i++) {
        const slot = (Math.PI * 2) / Math.max(1, count);
        const a = turn + i * slot + rng.wobble(slot * 0.18);
        const k = 0.88 + rng.wobble(0.08);
        const x = Math.cos(a) * rx * k;
        const y = Math.sin(a) * ry * k;
        const port = Math.atan2(-y, -x) + rng.wobble(1.4);
        out.push({ id: `${heatNo}-${i}`, num: i + 1, x, y, port, body: null, occupant: null, born: time, gone: 0 });
      }
      return out;
    }

    function portOf(s) {
      return { x: s.x + Math.cos(s.port) * PORT_D, y: s.y + Math.sin(s.port) * PORT_D };
    }

    function solidify(list) {
      for (const s of list) {
        s.body = staticCircle(sim, s.x, s.y, HULL_R, { restitution: 0.9, label: 'shuttle' });
        add(sim, s.body);
      }
    }

    // How far the beams reach and how hard they pull, 0 to 1 over a heat.
    function beamLevel() {
      return Math.min(1, heat.t / BEAM_RAMP_MS);
    }

    // Past full strength the beams keep getting stronger, so a racer
    // bouncing between the last free shuttles is reeled in before long.
    function overtime() {
      return 1 + Math.max(0, heat.t - BEAM_RAMP_MS) / 8000;
    }

    // Every free shuttle pulls on racers in reach, harder the closer they
    // are to its port. A pull alone makes racers orbit a port like a planet
    // round a sun, so the beam also bleeds off the sideways part of their
    // drift: caught in a beam, a racer sinks in instead of swinging round.
    function beams(round, frames) {
      const k = beamLevel();
      const reach = BEAM_R[0] + (BEAM_R[1] - BEAM_R[0]) * k;
      const more = overtime();
      const pull = (BEAM_PULL[0] + (BEAM_PULL[1] - BEAM_PULL[0]) * k) * more;
      const dampBy = BEAM_DAMP * more;
      for (const p of round.alivePlayers()) {
        if (p.docked) continue;
        const pos = p.body.position;
        const v = p.body.velocity;
        let vx = v.x;
        let vy = v.y;
        for (const s of shuttles) {
          if (s.occupant !== null) continue;
          const q = portOf(s);
          const dx = q.x - pos.x;
          const dy = q.y - pos.y;
          const d = Math.hypot(dx, dy);
          if (d > reach || d < 1) continue;
          const nx = dx / d;
          const ny = dy / d;
          const w = 1 - d / reach;
          const f = pull * w * frames;
          vx += nx * f;
          vy += ny * f;
          // Damp the sideways part of the drift.
          const along = vx * nx + vy * ny;
          const sx = vx - nx * along;
          const sy = vy - ny * along;
          const damp = Math.min(1, dampBy * w * frames);
          vx -= sx * damp;
          vy -= sy * damp;
        }
        // Keep everyone floating: a racer that has nearly stopped gets a
        // nudge the way it is already going (or anywhere, if it has stopped).
        const sp = Math.hypot(vx, vy);
        if (sp < MIN_SPEED) {
          const a = sp > 0.05 ? Math.atan2(vy, vx) : rng() * Math.PI * 2;
          vx = Math.cos(a) * MIN_SPEED;
          vy = Math.sin(a) * MIN_SPEED;
        }
        Matter.Body.setVelocity(p.body, { x: vx, y: vy });
      }
    }

    // Anyone drifting inside a free port's circle is caught. If two reach
    // the same port in the same frame, the closer one gets it.
    function catches(round) {
      const cands = [];
      for (const p of round.alivePlayers()) {
        if (p.docked) continue;
        const pos = p.body.position;
        for (const s of shuttles) {
          if (s.occupant !== null) continue;
          const q = portOf(s);
          const d = Math.hypot(q.x - pos.x, q.y - pos.y);
          if (d <= CATCH_R) cands.push({ p, s, d });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      for (const { p, s } of cands) {
        if (p.docked || s.occupant !== null) continue;
        s.occupant = p.id;
        p.docked = s.id;
        round.audio.bell(0.9, 0);
      }
    }

    // A docked racer is not frozen or teleported: toggling Matter's static
    // flag mid-contact, or jumping onto a spot someone else is touching,
    // breaks its collision maths. It stays an ordinary body, held still and
    // eased onto the port a little every frame.
    function pin(p, frames) {
      const s = shuttles.find((x) => x.id === p.docked);
      if (!s) return;
      const q = portOf(s);
      const pos = p.body.position;
      const k = Math.min(1, 0.18 * frames);
      Matter.Body.setPosition(p.body, { x: pos.x + (q.x - pos.x) * k, y: pos.y + (q.y - pos.y) * k });
      Matter.Body.setVelocity(p.body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(p.body, 0);
    }

    // The racer to call out if a heat drags on: whoever is farthest from any
    // port still free.
    // The holes wobble round their corners; never far enough to reach the
    // shuttles, which were laid out clear of them.
    function moveHoles(dt, round) {
      updateHoles(holes, dt, 0, bounds, round.particles);
      for (const h of holes) {
        const a = h.phase + round.time * h.speed;
        h.well.x = h.home.x + Math.cos(a) * HOLE_WOBBLE;
        h.well.y = h.home.y + Math.sin(a * 1.3) * HOLE_WOBBLE * 0.7;
      }
    }

    // A floating racer inside a hole's edge is out. Docked racers are safe.
    function swallow(round) {
      let lost = false;
      for (const p of round.alivePlayers()) {
        if (p.docked) continue;
        const pos = p.body.position;
        const h = holeCapturing(holes, pos);
        if (h && round.kill(p, 'hole', { at: pos, target: { x: h.well.x, y: h.well.y } })) lost = true;
      }
      if (lost) rebalance(round);
    }

    // Keeps the free shuttles one fewer than the racers still floating, by
    // sending away the free ones farthest from anybody.
    function rebalance(round) {
      const floating = round.alivePlayers().filter((p) => !p.docked);
      let extra = shuttles.filter((s) => s.occupant === null).length - Math.max(0, floating.length - 1);
      while (extra-- > 0) {
        let pick = null;
        let far = -1;
        for (const s of shuttles) {
          if (s.occupant !== null) continue;
          const q = portOf(s);
          const d = Math.min(Infinity, ...floating.map((p) => Math.hypot(q.x - p.body.position.x, q.y - p.body.position.y)));
          if (d > far) {
            far = d;
            pick = s;
          }
        }
        if (!pick) break;
        if (pick.body) remove(sim, pick.body);
        pick.body = null;
        pick.gone = round.time;
        leaving.push(pick);
        shuttles = shuttles.filter((s) => s !== pick);
      }
    }

    function farthest(list) {
      let worst = null;
      let far = -1;
      for (const p of list) {
        const pos = p.body.position;
        let d = Infinity;
        for (const s of shuttles) {
          if (s.occupant !== null) continue;
          const q = portOf(s);
          d = Math.min(d, Math.hypot(q.x - pos.x, q.y - pos.y));
        }
        if (d > far) {
          far = d;
          worst = p;
        }
      }
      return worst;
    }

    // After a heat everyone lets go and floats off, pushed away from the
    // shuttle they were on, and the shuttles leave.
    function letGo(round) {
      for (const p of round.alivePlayers()) {
        if (!p.docked) continue;
        const s = shuttles.find((x) => x.id === p.docked);
        const a = (s ? s.port : rng() * Math.PI * 2) + rng.wobble(0.6);
        const sp = rng.range(2.6, 4.4);
        Matter.Body.setVelocity(p.body, { x: Math.cos(a) * sp, y: Math.sin(a) * sp });
        p.docked = null;
      }
      for (const s of shuttles) {
        if (s.body) remove(sim, s.body);
        s.body = null;
        s.gone = round.time;
      }
      leaving = leaving.concat(shuttles);
      shuttles = [];
    }

    function startHeat(round) {
      heatNo++;
      shuttles = layout(round.aliveCount - 1, round.time);
      solidify(shuttles);
      heat = { phase: 'race', t: 0, loser: null };
    }

    // Something to show before anyone lines up: the Universes card draws the
    // map with nobody in it.
    shuttles = layout(4, -1e9);

    return {
      bounds,
      time: 0,
      // Docked racers sit perfectly still on purpose; the round's "stillest
      // goes after four minutes" insurance must not pick them off. Heats have
      // their own limit instead (HEAT_LIMIT_MS).
      noBackstop: true,

      // For tests: the heat as it stands.
      inspect: () => ({ heatNo, heat, shuttles }),

      spawn(n) {
        // Lined up in a ring in the middle, the first heat's shuttles already
        // showing round them. Each racer leaves the line drifting a random way.
        shuttles = layout(Math.max(0, n - 1), 0);
        const out = [];
        const r = 120 + n * 12;
        for (let i = 0; i < n; i++) {
          const a = (i / Math.max(1, n)) * Math.PI * 2;
          const go = rng() * Math.PI * 2;
          const sp = rng.range(2.6, 4.4);
          out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, vx: Math.cos(go) * sp, vy: Math.sin(go) * sp });
        }
        return out;
      },

      update(dt, round) {
        this.time += dt;
        const frames = dt / 16.667;
        if (round.phase !== 'running') return;
        if (!heat) {
          // The line-up's shuttles become the first heat's.
          heatNo = 1;
          solidify(shuttles);
          heat = { phase: 'race', t: 0, loser: null };
        }
        heat.t += dt;
        moveHoles(dt, round);
        swallow(round);
        // A hole may just have taken the second-to-last racer.
        if (round.phase !== 'running') return;
        const alive = round.alivePlayers();
        for (const p of alive) if (p.docked) pin(p, frames);

        if (heat.phase === 'race') {
          beams(round, frames);
          catches(round);
          const free = shuttles.filter((s) => s.occupant === null).length;
          const floating = alive.filter((p) => !p.docked);
          if (free === 0 || heat.t > HEAT_LIMIT_MS) {
            heat.loser = floating.length === 1 ? floating[0] : farthest(floating);
            heat.phase = 'verdict';
            heat.t = 0;
          }
        } else if (heat.phase === 'verdict') {
          if (heat.t >= VERDICT_MS) {
            const loser = heat.loser;
            if (loser && loser.alive) round.kill(loser, 'boom', { at: loser.body.position });
            if (round.aliveCount <= 1) {
              heat.phase = 'done';
              return;
            }
            letGo(round);
            heat.phase = 'break';
            heat.t = 0;
          }
        } else if (heat.phase === 'break') {
          beams(round, frames);
          if (heat.t >= BREAK_MS) startHeat(round);
        }
      },

      drawBack(g, cam, time) {
        drawEdge(g, [
          { x: -W / 2, y: -H / 2 }, { x: W / 2, y: -H / 2 },
          { x: W / 2, y: H / 2 }, { x: -W / 2, y: H / 2 },
        ], 7311, { color: '#7EA2F0', width: 3, alpha: 0.45, closed: true, passes: 3 });

        const k = heat && heat.phase === 'race' ? beamLevel() : 0;
        for (const s of shuttles) {
          if (s.occupant !== null) continue;
          const q = portOf(s);
          // The tractor beam: a soft glow that widens as it strengthens.
          if (k > 0) {
            const reach = BEAM_R[0] + (BEAM_R[1] - BEAM_R[0]) * k;
            const grad = g.createRadialGradient(q.x, q.y, CATCH_R, q.x, q.y, reach);
            grad.addColorStop(0, `rgba(126, 212, 145, ${0.1 + 0.12 * k})`);
            grad.addColorStop(1, 'rgba(126, 212, 145, 0)');
            g.fillStyle = grad;
            g.beginPath();
            g.arc(q.x, q.y, reach, 0, Math.PI * 2);
            g.fill();
          }
          // The docking circle, dashed and turning.
          g.save();
          g.setLineDash([14, 12]);
          g.lineDashOffset = -time / 50;
          g.lineWidth = 3;
          g.strokeStyle = 'rgba(126, 212, 145, 0.7)';
          g.beginPath();
          g.arc(q.x, q.y, CATCH_R, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
      },

      drawFront(g, cam, time) {
        drawHoles(g, holes, time);
        for (const s of leaving) {
          const k = 1 - Math.min(1, (time - s.gone) / 700);
          if (k > 0) drawShuttle(g, s, time, k, null);
        }
        if (leaving.length && leaving.every((s) => time - s.gone > 700)) leaving = [];
        for (const s of shuttles) {
          const k = Math.min(1, (time - s.born) / 500);
          const occ = s.occupant !== null && sim.players.find((p) => p.id === s.occupant);
          drawShuttle(g, s, time, k, occ || null);
        }

        // The racer left floating, ringed in red while the verdict shows.
        if (heat && heat.phase === 'verdict' && heat.loser && heat.loser.body) {
          const pos = heat.loser.body.position;
          const pulse = 1 + 0.08 * Math.sin(time / 90);
          g.save();
          g.strokeStyle = '#F08A7A';
          g.lineWidth = 6;
          g.beginPath();
          g.arc(pos.x, pos.y, BODY.radius * 2 * pulse, 0, Math.PI * 2);
          g.stroke();
          label(g, t('No shuttle!'), pos.x, pos.y - BODY.radius * 2.6, 40, '#F08A7A');
          g.restore();
        }

        // Which heat, and how many seats, along the top of the room.
        if (heatNo > 0 && cam && shuttles.length) {
          const free = shuttles.filter((s) => s.occupant === null).length;
          const text = t('Round {n} · {free} of {all} shuttles free', { n: heatNo, free, all: shuttles.length });
          label(g, text, 0, -H / 2 + 70, 46, '#F2EADB');
        }
      },
    };
  },
};

// A shuttle: a capsule hull with swept wings, its nose and docking ring on
// the port side. `alpha` fades it in and out between heats. An occupied
// shuttle takes its racer's colour.
function drawShuttle(g, s, time, alpha, occupant) {
  const R = HULL_R;
  g.save();
  g.globalAlpha = alpha;
  g.translate(s.x, s.y);
  g.rotate(s.port);
  g.lineJoin = 'round';
  g.lineWidth = 4;
  g.strokeStyle = '#F2EADB';
  g.fillStyle = occupant ? occupant.col.glow : '#2B2545';
  g.beginPath();
  g.moveTo(-R * 0.55, -R * 0.5);
  g.lineTo(-R * 1.15, -R * 1.1);
  g.lineTo(-R * 1.0, -R * 0.46);
  g.closePath();
  g.moveTo(-R * 0.55, R * 0.5);
  g.lineTo(-R * 1.15, R * 1.1);
  g.lineTo(-R * 1.0, R * 0.46);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = occupant ? occupant.col.crayon : '#3A3260';
  g.beginPath();
  g.moveTo(-R * 1.05, -R * 0.5);
  g.lineTo(R * 0.5, -R * 0.5);
  g.quadraticCurveTo(R * 1.05, -R * 0.46, R * 1.05, 0);
  g.quadraticCurveTo(R * 1.05, R * 0.46, R * 0.5, R * 0.5);
  g.lineTo(-R * 1.05, R * 0.5);
  g.quadraticCurveTo(-R * 1.2, 0, -R * 1.05, -R * 0.5);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(242, 234, 219, 0.75)';
  for (const x of [-R * 0.55, -R * 0.15, R * 0.25]) {
    g.beginPath();
    g.arc(x, -R * 0.2, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = occupant ? '#F2EADB' : '#7ED491';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(R * 1.05, 0, 11, 0, Math.PI * 2);
  g.stroke();
  g.restore();

  g.save();
  g.globalAlpha = alpha;
  label(g, `S${s.num}`, s.x, s.y + 12, 34, occupant ? '#F2EADB' : '#E8A33D');
  g.restore();
}

function label(g, text, x, y, size, colour) {
  g.font = `700 ${size}px "Shantell Sans", "Gaegu", "Comic Sans MS", cursive`;
  g.textAlign = 'center';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.22;
  g.strokeStyle = 'rgba(7, 6, 15, 0.85)';
  g.strokeText(text, x, y);
  g.fillStyle = colour;
  g.fillText(text, x, y);
}
