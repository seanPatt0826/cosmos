// Tests for the Shuttle Docking referee (src/dock/game.js).
//
//   node --test tools/dock.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { DockGame } from '../src/dock/game.js';
import { DOCK, shuttleCount, portOf, attach } from '../src/dock/sim.js';

// A room on a clock the test moves by hand.
function room(names = ['A', 'B']) {
  const clock = { t: 1000 };
  let seed = 7;
  const g = new DockGame({
    now: () => clock.t,
    random: () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296),
  });
  for (const n of names) g.join(n, n);
  return { g, clock };
}

function tick(g, clock, n = 1) {
  const events = [];
  for (let i = 0; i < n; i++) {
    clock.t += DOCK.tickMs;
    events.push(...g.tick());
  }
  return events;
}

function play(names) {
  const r = room(names);
  assert.deepEqual(r.g.start(names[0]), { ok: true });
  r.clock.t = r.g.startAt;
  tick(r.g, r.clock);
  assert.equal(r.g.phase, 'playing');
  return r;
}

// Parks a player's ship on a shuttle's docking point, still and facing in.
function park(g, id, shuttleId) {
  const s = g.shuttles.find((x) => x.id === shuttleId);
  attach(g.players.get(id).ship, s);
}

const holdTicks = Math.ceil(DOCK.holdMs / DOCK.tickMs) + 1;

test('one shuttle fewer than players, never negative', () => {
  assert.equal(shuttleCount(0), 0);
  assert.equal(shuttleCount(1), 0);
  for (const n of [2, 3, 4, 5, 10]) assert.equal(shuttleCount(n), n - 1);
});

test('the lobby preview follows people joining and leaving', () => {
  const { g } = room(['A']);
  assert.equal(g.shuttles.length, 0);
  g.join('B', 'B');
  g.join('C', 'C');
  assert.equal(g.shuttles.length, 2);
  g.leave('C');
  assert.equal(g.shuttles.length, 1);
});

test('a round needs two players; one alone can only practise', () => {
  const { g, clock } = room(['A']);
  assert.equal(g.start('A').error, 'needTwo');
  assert.deepEqual(g.start('A', { practice: true }), { ok: true });
  assert.equal(g.shuttles.length, 1);
  clock.t = g.startAt;
  tick(g, clock);
  park(g, 'A', 0);
  tick(g, clock, holdTicks);
  assert.equal(g.phase, 'summary');
  assert.equal(g.players.get('A').result, 'docked');
});

test('only the host can start, and the round spawns players - 1 shuttles', () => {
  const { g } = room(['A', 'B', 'C', 'D']);
  assert.equal(g.start('B').error, 'notHost');
  assert.deepEqual(g.start('A'), { ok: true });
  assert.equal(g.shuttles.length, 3);
  assert.equal(g.phase, 'countdown');
});

test('shuttles never overlap each other or the start area', () => {
  const { g } = room(Array.from({ length: 16 }, (_, i) => `P${i}`));
  g.start('P0');
  for (const a of g.shuttles) {
    assert.ok(Math.hypot(a.x, a.y) > 400, 'clear of the start area');
    assert.ok(Math.hypot(a.x, a.y) < DOCK.arenaR - DOCK.shuttleR, 'inside the arena');
    for (const b of g.shuttles) {
      if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > DOCK.shuttleR * 3);
    }
  }
});

test('engines are off during the countdown', () => {
  const { g, clock } = room(['A', 'B']);
  g.start('A');
  const before = { ...g.players.get('A').ship };
  g.setInput('A', { up: true });
  tick(g, clock, 5);
  assert.equal(g.players.get('A').ship.x, before.x);
});

test('docking needs the hold time, then claims the shuttle for good', () => {
  const { g, clock } = play(['A', 'B', 'C']);
  park(g, 'A', 0);
  tick(g, clock);
  assert.equal(g.players.get('A').dock.reason, 'holding');
  assert.equal(g.shuttles[0].reservedBy, 'A');
  const events = tick(g, clock, holdTicks);
  assert.ok(events.some((e) => e.type === 'docked' && e.id === 'A' && e.shuttle === 0));
  assert.equal(g.shuttles[0].occupant, 'A');
  assert.equal(g.snapshot().counts.available, 1);
  // Docked once: flying near another shuttle changes nothing.
  g.setInput('A', { up: true });
  tick(g, clock, 10);
  assert.equal(g.players.get('A').dockedTo, 0);
  assert.equal(g.shuttles[1].occupant, null);
});

test('too fast is refused with a reason, and slowing down then works', () => {
  const { g, clock } = play(['A', 'B']);
  park(g, 'A', 0);
  const ship = g.players.get('A').ship;
  const s = g.shuttles[0];
  // Moving fast along the port, so it stays in range for a tick.
  ship.vx = -Math.sin(s.port) * 9;
  ship.vy = Math.cos(s.port) * 9;
  g.setInput('A', { brake: false });
  tick(g, clock);
  assert.equal(g.players.get('A').dock.reason, 'tooFast');
  assert.equal(s.reservedBy, null);
  park(g, 'A', 0);
  tick(g, clock, holdTicks);
  assert.equal(s.occupant, 'A');
});

test('alignment only matters when the host turns it on', () => {
  const { g, clock } = room(['A', 'B']);
  g.setSettings('A', { requireAlign: true });
  g.start('A');
  clock.t = g.startAt;
  tick(g, clock);
  park(g, 'A', 0);
  g.players.get('A').ship.a += Math.PI; // nose pointing away
  tick(g, clock);
  assert.equal(g.players.get('A').dock.reason, 'misaligned');
});

test('two ships on the same port in the same tick: exactly one wins', () => {
  for (let trial = 0; trial < 20; trial++) {
    const { g, clock } = play(['A', 'B', 'C']);
    park(g, 'A', 0);
    park(g, 'B', 0);
    // Nudge one so they are not stacked, alternating which is closer.
    const s = g.shuttles[0];
    const p = portOf(s);
    const nudge = trial % 2 ? 'A' : 'B';
    g.players.get(nudge).ship.x = p.x + 3;
    tick(g, clock, holdTicks + 2);
    const claims = ['A', 'B'].filter((id) => g.players.get(id).dockedTo === 0);
    assert.equal(claims.length, 1, 'one claim only');
    assert.notEqual(claims[0], nudge, 'the closer ship wins');
    assert.equal(s.occupant, claims[0]);
  }
});

test('a reservation holds against a closer ship that arrives later', () => {
  const { g, clock } = play(['A', 'B', 'C']);
  park(g, 'A', 0);
  g.players.get('A').ship.x += 20;
  tick(g, clock);
  assert.equal(g.shuttles[0].reservedBy, 'A');
  park(g, 'B', 0);
  tick(g, clock);
  assert.equal(g.players.get('B').dock.reason, 'reserved');
  tick(g, clock, holdTicks);
  assert.equal(g.shuttles[0].occupant, 'A');
});

test('when every shuttle is claimed the round ends and the rest failed', () => {
  const { g, clock } = play(['A', 'B', 'C']);
  park(g, 'A', 0);
  park(g, 'B', 1);
  const events = tick(g, clock, holdTicks);
  assert.ok(events.some((e) => e.type === 'end' && e.reason === 'allClaimed'));
  assert.equal(g.phase, 'summary');
  assert.equal(g.players.get('A').result, 'docked');
  assert.equal(g.players.get('B').result, 'docked');
  assert.equal(g.players.get('C').result, 'failed');
});

test('the timer ends the round; only finished dockings count', () => {
  const { g, clock } = play(['A', 'B', 'C']);
  park(g, 'A', 0);
  tick(g, clock, holdTicks);
  clock.t = g.endsAt;
  park(g, 'B', 1);
  tick(g, clock);
  assert.equal(g.phase, 'summary');
  assert.equal(g.endReason, 'time');
  assert.equal(g.players.get('A').result, 'docked');
  assert.equal(g.players.get('B').result, 'failed');
});

test('the timer can be switched off', () => {
  const { g } = room(['A', 'B']);
  g.setSettings('A', { timer: false });
  g.start('A');
  assert.equal(g.endsAt, null);
});

test('someone still flying leaves: one free shuttle goes too', () => {
  const { g, clock } = play(['A', 'B', 'C', 'D']);
  assert.equal(g.shuttles.length, 3);
  g.leave('D');
  assert.equal(g.shuttles.filter((s) => s.occupant === null).length, 2);
  assert.equal(g.players.get('D').result, 'left');
  tick(g, clock);
  assert.equal(g.phase, 'playing');
});

test('someone docked leaves: they keep the shuttle and the success', () => {
  const { g, clock } = play(['A', 'B', 'C']);
  park(g, 'A', 0);
  tick(g, clock, holdTicks);
  g.leave('A');
  assert.equal(g.shuttles[0].occupant, 'A');
  assert.equal(g.players.get('A').result, 'docked');
});

test('down to one player looking and no free shuttle: that player failed', () => {
  const { g, clock } = play(['A', 'B', 'C']);
  park(g, 'A', 0);
  tick(g, clock, holdTicks);
  g.leave('C');
  tick(g, clock);
  assert.equal(g.phase, 'summary');
  assert.equal(g.players.get('B').result, 'failed');
  assert.equal(g.players.get('C').result, 'left');
});

test('a leaving reserver frees the shuttle at once', () => {
  const { g, clock } = play(['A', 'B', 'C']);
  park(g, 'A', 0);
  tick(g, clock);
  assert.equal(g.shuttles[0].reservedBy, 'A');
  g.leave('A');
  assert.ok(g.shuttles.every((s) => s.reservedBy !== 'A'));
});

test('joining mid-round watches until the next round', () => {
  const { g, clock } = play(['A', 'B']);
  g.join('Z', 'Z');
  assert.equal(g.players.get('Z').inRound, false);
  assert.equal(g.players.get('Z').ship, null);
  assert.equal(g.shuttles.length, 1);
  park(g, 'A', 0);
  tick(g, clock, holdTicks);
  g.again('A');
  assert.equal(g.phase, 'lobby');
  assert.equal(g.shuttles.length, 2);
});

test('the host passes on when the host leaves', () => {
  const { g } = room(['A', 'B', 'C']);
  g.leave('A');
  assert.equal(g.host().id, 'B');
});

test('names are cleaned and kept unique', () => {
  const { g } = room([]);
  g.join('x', '<b>Ann</b>');
  g.join('y', 'bAnn/b');
  g.join('z', '');
  assert.equal(g.players.get('x').name, 'bAnn/b');
  assert.equal(g.players.get('y').name, 'bAnn/b 2');
  assert.equal(g.players.get('z').name, 'Pilot');
});
