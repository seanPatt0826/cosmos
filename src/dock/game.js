// Shuttle Docking: the rules of one room.
//
// This is the referee. It holds every player, ship and shuttle in a room and
// is the only thing allowed to say who docked; the browsers just draw what it
// says. It runs inside the room's Durable Object (worker/dock-room.js), which
// handles one message at a time, so a check-then-claim here can never be
// interleaved with another player's: two ships reaching the same port in the
// same tick cannot both win it.
//
// No network or page code lives here, so it can be tested on its own
// (tools/dock.test.mjs).
//
// A round goes lobby -> countdown -> playing -> summary -> lobby.
//
//   lobby      everyone flies around freely; the shuttles shown are a preview
//              of the round's count (players - 1) and cannot be docked with.
//   countdown  everyone is lined up in the start area, engines off.
//   playing    docking is live. Ends when every shuttle is claimed, when no
//              one is left without one, or when the timer (if on) runs out.
//   summary    who docked, who did not, who left. The host starts again.
//
// Leaving mid-round: someone already docked keeps their shuttle and their
// success. Someone still flying is out, and one unclaimed shuttle goes with
// them, so the shuttles still free stay one fewer than the players still
// looking. Someone joining mid-round watches and plays from the next round.

import {
  DOCK, NO_INPUT, shuttleCount, stepShip, dockReading, attach, bumpShips,
} from './sim.js';
import { PALETTE } from '../config.js';

export const SHUTTLE_NAMES = [
  'Aurora', 'Comet', 'Nova', 'Orion', 'Vega', 'Lyra', 'Atlas', 'Halley',
  'Juno', 'Polaris', 'Sirius', 'Kepler', 'Tycho', 'Apollo', 'Pioneer',
];

export const TIMER_CHOICES = [60, 90, 120, 180];

const MAX_NAME = 16;

export class DockGame {
  constructor({ now = () => Date.now(), random = Math.random } = {}) {
    this.now = now;
    this.random = random;
    this.phase = 'lobby';
    this.players = new Map();
    this.shuttles = [];
    this.order = 0;
    this.startAt = 0;
    this.endsAt = null;
    this.practice = false;
    this.endReason = null;
    this.settings = {
      timer: true,
      timerSec: 120,
      requireSlow: true,
      requireAlign: false,
    };
    this.layoutShuttles(0);
  }

  // The docking rules in force: the defaults, plus what the host chose.
  get rules() {
    return {
      dockRadius: DOCK.dockRadius,
      maxDockSpeed: DOCK.maxDockSpeed,
      alignDeg: DOCK.alignDeg,
      holdMs: DOCK.holdMs,
      requireSlow: this.settings.requireSlow,
      requireAlign: this.settings.requireAlign,
    };
  }

  connected() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  // ── People ──────────────────────────────────────────────────────────────

  join(id, rawName) {
    if (this.connected().length >= DOCK.maxPlayers) return { error: 'full' };
    const name = this.uniqueName(cleanName(rawName) || 'Pilot');
    const taken = new Set(this.connected().map((p) => p.col.name));
    const col = PALETTE.find((c) => !taken.has(c.name)) || PALETTE[this.order % PALETTE.length];
    const p = {
      id,
      name,
      col,
      order: this.order++,
      host: false,
      connected: true,
      inRound: false,
      ship: null,
      input: { ...NO_INPUT },
      dockedTo: null,
      dockedMs: null,
      reserving: null,
      holdFrom: 0,
      result: null,
      dock: null,
    };
    this.players.set(id, p);
    if (!this.host()) p.host = true;
    if (this.phase === 'lobby' || this.phase === 'summary') {
      p.ship = this.freeSpawn();
    }
    if (this.phase === 'lobby') this.layoutShuttles(shuttleCount(this.connected().length));
    return { player: p };
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    p.input = { ...NO_INPUT };
    if (p.host) {
      p.host = false;
      const next = this.connected().sort((a, b) => a.order - b.order)[0];
      if (next) next.host = true;
    }

    if (this.phase === 'lobby' || !p.inRound) {
      this.players.delete(id);
      if (this.phase === 'lobby') this.layoutShuttles(shuttleCount(this.connected().length));
      return;
    }

    if (p.dockedTo !== null) {
      // They made it; the shuttle stays theirs and so does the success.
      return;
    }
    p.result = 'left';
    p.ship = null;
    this.release(p);
    if (this.phase === 'playing' || this.phase === 'countdown') {
      // Keep "one fewer shuttle than players still looking".
      const looking = this.looking().length;
      const free = this.shuttles.filter((s) => s.occupant === null);
      const extra = free.length - Math.max(0, looking - (this.practice ? 0 : 1));
      for (let i = 0; i < extra; i++) this.removeFreeShuttle();
    }
  }

  host() {
    return this.connected().find((p) => p.host) || null;
  }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p || !p.connected || !input || typeof input !== 'object') return;
    const next = {};
    for (const k of Object.keys(NO_INPUT)) next[k] = input[k] === true;
    p.input = next;
  }

  setSettings(id, s) {
    const p = this.players.get(id);
    if (!p || !p.host || this.phase !== 'lobby' || !s || typeof s !== 'object') return false;
    if (typeof s.timer === 'boolean') this.settings.timer = s.timer;
    if (TIMER_CHOICES.includes(s.timerSec)) this.settings.timerSec = s.timerSec;
    if (typeof s.requireSlow === 'boolean') this.settings.requireSlow = s.requireSlow;
    if (typeof s.requireAlign === 'boolean') this.settings.requireAlign = s.requireAlign;
    return true;
  }

  // ── Round ───────────────────────────────────────────────────────────────

  // Only the host starts. Two or more players make a real round; one player
  // alone can only start a practice run, with one shuttle to themselves.
  start(id, { practice = false } = {}) {
    const p = this.players.get(id);
    if (!p || !p.host || this.phase !== 'lobby') return { error: 'notHost' };
    const field = this.connected();
    if (practice) {
      if (field.length !== 1) return { error: 'practiceSolo' };
    } else if (field.length < 2) {
      return { error: 'needTwo' };
    }

    this.practice = practice;
    this.endReason = null;
    // Anyone who left last round is forgotten now.
    for (const [pid, q] of this.players) if (!q.connected) this.players.delete(pid);

    const n = field.length;
    this.layoutShuttles(practice ? 1 : shuttleCount(n));
    const ring = 110 + n * 14;
    const turn = this.random() * Math.PI * 2;
    field.sort((a, b) => a.order - b.order).forEach((q, i) => {
      const a = turn + (i / n) * Math.PI * 2;
      q.inRound = true;
      q.ship = { x: Math.cos(a) * ring, y: Math.sin(a) * ring, vx: 0, vy: 0, a };
      q.input = { ...NO_INPUT };
      q.dockedTo = null;
      q.dockedMs = null;
      q.reserving = null;
      q.holdFrom = 0;
      q.result = null;
      q.dock = null;
    });
    this.phase = 'countdown';
    this.startAt = this.now() + DOCK.countdownMs;
    this.endsAt = this.settings.timer ? this.startAt + this.settings.timerSec * 1000 : null;
    return { ok: true };
  }

  // Back to the lobby after a summary; the host's call.
  again(id) {
    const p = this.players.get(id);
    if (!p || !p.host || this.phase !== 'summary') return false;
    this.toLobby();
    return true;
  }

  toLobby() {
    this.phase = 'lobby';
    for (const [pid, q] of this.players) {
      if (!q.connected) {
        this.players.delete(pid);
        continue;
      }
      q.inRound = false;
      q.dockedTo = null;
      q.reserving = null;
      q.result = null;
      q.dock = null;
      if (!q.ship) q.ship = this.freeSpawn();
    }
    this.practice = false;
    this.endsAt = null;
    this.layoutShuttles(shuttleCount(this.connected().length));
  }

  // Players in the round, still here, still without a shuttle.
  looking() {
    return [...this.players.values()].filter((p) => p.inRound && p.connected && p.dockedTo === null);
  }

  // ── The tick ────────────────────────────────────────────────────────────

  // Advances the room one tick. Returns what happened, for sounds and effects.
  tick() {
    const now = this.now();
    const events = [];

    if (this.phase === 'countdown' && now >= this.startAt) {
      this.phase = 'playing';
      events.push({ type: 'go' });
    }

    const frozen = this.phase === 'countdown';
    const flying = [];
    for (const p of this.players.values()) {
      if (!p.ship || !p.connected) continue;
      if (p.dockedTo !== null) continue;
      if (!frozen) stepShip(p.ship, p.input, this.shuttles);
      flying.push(p);
    }
    for (let i = 0; i < flying.length; i++) {
      for (let j = i + 1; j < flying.length; j++) bumpShips(flying[i].ship, flying[j].ship);
    }

    if (this.phase === 'playing') this.dockingPass(now, events);
    else this.previewPass();

    if (this.phase === 'playing') {
      const reason = this.endCheck(now);
      if (reason) this.finish(reason, events);
    }
    return events;
  }

  // Docking, every tick, for every ship still looking. Candidates are taken
  // nearest first, so if two ships reach a free port in the same tick the
  // closer one reserves it; a reservation then holds until its owner leaves
  // range, slows the wrong way, docks or leaves the game.
  dockingPass(now, events) {
    const rules = this.rules;
    const cands = [];
    for (const p of this.looking()) {
      const near = this.nearest(p.ship, rules);
      if (!near) {
        p.dock = null;
        this.release(p);
        continue;
      }
      const { s, r } = near;
      p.dock = { shuttle: s.id, dist: r.dist, inRange: r.inRange, speedOk: r.speedOk, alignOk: r.alignOk, hold: 0, reason: null };
      if (!r.inRange) {
        this.release(p);
        continue;
      }
      if (s.occupant !== null) {
        p.dock.reason = 'occupied';
        this.release(p);
        continue;
      }
      cands.push({ p, s, r });
    }

    cands.sort((a, b) => a.r.dist - b.r.dist);
    for (const { p, s, r } of cands) {
      if (s.occupant !== null) {
        p.dock.reason = 'occupied';
        this.release(p);
        continue;
      }
      if (s.reservedBy !== null && s.reservedBy !== p.id) {
        p.dock.reason = 'reserved';
        this.release(p);
        continue;
      }
      if (!r.speedOk) {
        p.dock.reason = 'tooFast';
        this.release(p);
        continue;
      }
      if (!r.alignOk) {
        p.dock.reason = 'misaligned';
        this.release(p);
        continue;
      }
      if (p.reserving !== s.id) {
        this.release(p);
        s.reservedBy = p.id;
        p.reserving = s.id;
        p.holdFrom = now;
      }
      const hold = rules.holdMs > 0 ? (now - p.holdFrom) / rules.holdMs : 1;
      if (hold >= 1) {
        this.dock(p, s, now);
        events.push({ type: 'docked', id: p.id, shuttle: s.id });
      } else {
        p.dock.hold = hold;
        p.dock.reason = 'holding';
      }
    }
  }

  // In the lobby and summary the shuttles are only shown; flying into range
  // says so instead of docking.
  previewPass() {
    const rules = this.rules;
    for (const p of this.players.values()) {
      if (!p.ship || p.dockedTo !== null) {
        p.dock = null;
        continue;
      }
      const near = this.nearest(p.ship, rules);
      if (!near || !near.r.inRange || this.phase !== 'lobby') {
        p.dock = null;
        continue;
      }
      const { s, r } = near;
      p.dock = { shuttle: s.id, dist: r.dist, inRange: true, speedOk: r.speedOk, alignOk: r.alignOk, hold: 0, reason: 'lobby' };
    }
  }

  nearest(ship, rules) {
    let best = null;
    for (const s of this.shuttles) {
      const r = dockReading(ship, s, rules);
      if (!best || r.dist < best.r.dist) best = { s, r };
    }
    return best;
  }

  dock(p, s, now) {
    s.occupant = p.id;
    s.reservedBy = null;
    p.dockedTo = s.id;
    p.reserving = null;
    p.result = 'docked';
    p.dockedMs = now - this.startAt;
    p.dock = { shuttle: s.id, dist: 0, inRange: true, speedOk: true, alignOk: true, hold: 1, reason: 'docked' };
    attach(p.ship, s);
  }

  release(p) {
    if (p.reserving === null) return;
    const s = this.shuttles.find((x) => x.id === p.reserving);
    if (s && s.reservedBy === p.id) s.reservedBy = null;
    p.reserving = null;
    p.holdFrom = 0;
  }

  endCheck(now) {
    if (!this.shuttles.some((s) => s.occupant === null)) return 'allClaimed';
    if (this.looking().length === 0) return 'noneLeft';
    if (this.endsAt !== null && now >= this.endsAt) return 'time';
    return null;
  }

  finish(reason, events) {
    this.phase = 'summary';
    this.endReason = reason;
    for (const p of this.players.values()) {
      if (!p.inRound) continue;
      this.release(p);
      if (p.dockedTo === null && p.result !== 'left') p.result = 'failed';
    }
    for (const s of this.shuttles) s.reservedBy = null;
    events.push({ type: 'end', reason });
  }

  // ── Shuttles ────────────────────────────────────────────────────────────

  // Lays out `count` shuttles on a ring around the start area: far enough to
  // need flying to, spread evenly so nobody spawns facing a free one, never
  // overlapping each other, the start area or the arena edge. Each gets a
  // number, a name and a port facing a random way.
  layoutShuttles(count) {
    const shuttles = [];
    const ringR = Math.min(DOCK.arenaR - 260, 620 + count * 45);
    const turn = this.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const slot = (Math.PI * 2) / Math.max(1, count);
      const a = turn + i * slot + (this.random() - 0.5) * slot * 0.35;
      const r = ringR + (this.random() - 0.5) * 220;
      shuttles.push({
        id: i,
        num: i + 1,
        name: SHUTTLE_NAMES[i % SHUTTLE_NAMES.length],
        x: Math.round(Math.cos(a) * r),
        y: Math.round(Math.sin(a) * r),
        port: this.random() * Math.PI * 2,
        occupant: null,
        reservedBy: null,
      });
    }
    this.shuttles = shuttles;
  }

  // Drops the free, unreserved shuttle farthest from anyone still looking.
  removeFreeShuttle() {
    const looking = this.looking();
    const free = this.shuttles.filter((s) => s.occupant === null && s.reservedBy === null);
    if (!free.length) return;
    const gap = (s) => Math.min(Infinity, ...looking.map((p) => Math.hypot(p.ship.x - s.x, p.ship.y - s.y)));
    free.sort((a, b) => gap(b) - gap(a));
    this.shuttles = this.shuttles.filter((s) => s !== free[0]);
  }

  freeSpawn() {
    const a = this.random() * Math.PI * 2;
    const r = 60 + this.random() * 220;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, a };
  }

  uniqueName(name) {
    const taken = new Set(this.connected().map((p) => p.name));
    if (!taken.has(name)) return name;
    for (let i = 2; ; i++) {
      const next = `${name.slice(0, MAX_NAME - 3)} ${i}`;
      if (!taken.has(next)) return next;
    }
  }

  // ── What the browsers are sent ──────────────────────────────────────────

  snapshot() {
    const field = this.connected();
    const r1 = (v) => Math.round(v * 10) / 10;
    return {
      phase: this.phase,
      now: this.now(),
      startAt: this.startAt,
      endsAt: this.endsAt,
      practice: this.practice,
      endReason: this.endReason,
      settings: this.settings,
      rules: this.rules,
      counts: {
        players: field.length,
        inRound: [...this.players.values()].filter((p) => p.inRound).length,
        shuttles: this.shuttles.length,
        available: this.shuttles.filter((s) => s.occupant === null).length,
        looking: this.looking().length,
        // What a round started now would get.
        nextShuttles: shuttleCount(field.length),
      },
      players: [...this.players.values()].sort((a, b) => a.order - b.order).map((p) => ({
        id: p.id,
        name: p.name,
        col: p.col.name,
        host: p.host,
        connected: p.connected,
        inRound: p.inRound,
        result: p.result,
        dockedTo: p.dockedTo,
        dockedMs: p.dockedMs,
        ship: p.ship && { x: r1(p.ship.x), y: r1(p.ship.y), vx: r1(p.ship.vx), vy: r1(p.ship.vy), a: Math.round(p.ship.a * 1000) / 1000 },
        thrust: !!(p.input.up || p.input.down || p.input.sl || p.input.sr),
        boost: !!(p.input.boost && p.input.up),
        dock: p.dock && {
          ...p.dock,
          dist: Math.round(p.dock.dist),
          hold: Math.round(p.dock.hold * 100) / 100,
        },
      })),
      shuttles: this.shuttles,
    };
  }
}

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME);
}
