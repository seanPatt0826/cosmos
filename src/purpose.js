// What the race is for.
//
// The same race can answer different questions, and saying which one up
// front is what makes Cosmos read as a name picker rather than a toy. The
// choice changes nothing about the race itself, only how its end is told:
//
//   pick     one name is picked: the last one left
//   penalty  one name gets the penalty: also the last one left
//   order    everyone in finishing order, best first
//   teams    everyone split into two teams, drafted in finishing order
//
// Chosen with the chips in the Entrants panel (main.js), remembered in this
// browser, and read by the banner (hud.js) and the result card (result.js).

const STORE = 'cosmos.purpose';
export const PURPOSES = ['pick', 'penalty', 'order', 'teams'];

// Icon, chip label, and the line under Start saying what pressing it does.
export const PURPOSE_INFO = {
  pick: { icon: '🏆', label: 'Pick one', line: 'The last one left is picked' },
  penalty: { icon: '😈', label: 'Penalty', line: 'The last one left gets the penalty' },
  order: { icon: '🔢', label: 'Turn order', line: 'Everyone gets a place in order' },
  teams: { icon: '👥', label: 'Two teams', line: 'Everyone is split into two teams' },
};

let current = read();
const listeners = new Set();

function read() {
  try {
    const v = localStorage.getItem(STORE);
    return PURPOSES.includes(v) ? v : 'pick';
  } catch (e) {
    return 'pick';
  }
}

export function getPurpose() {
  return current;
}

export function setPurpose(p) {
  if (!PURPOSES.includes(p) || p === current) return;
  current = p;
  try { localStorage.setItem(STORE, p); } catch (e) { /* remembering is a convenience */ }
  for (const fn of listeners) fn(p);
}

export function onPurpose(fn) {
  listeners.add(fn);
}

// Everyone in the order they finished, best first. Normally the last one
// left is first and the first out is last; where the last one left is the
// loser (Docking Bay), the first out is first and the last one left last.
export function finishOrder(round) {
  const out = round.players.filter((p) => !p.alive).sort((a, b) => a.place - b.place);
  const last = round.winner ? [round.winner] : [];
  return round.mapDef.lastIsLoser ? [...out, ...last] : [...last, ...out];
}

// Two teams drafted from the finishing order, snake style (A, B, B, A, A,
// B, ...), so neither side gets all the early finishers.
export function teamsOf(order) {
  const a = [];
  const b = [];
  order.forEach((p, i) => {
    const k = i % 4;
    (k === 0 || k === 3 ? a : b).push(p);
  });
  return [a, b];
}

// The one name the race picked, and how to say it: "wins", "last place" or
// "gets the penalty".
export function verdict(round) {
  const p = round.winner;
  const name = p ? (p.name || p.label) : '';
  if (current === 'penalty') return { name, kind: 'penalty' };
  if (round.mapDef.lastIsLoser) return { name, kind: 'last' };
  return { name, kind: 'win' };
}
