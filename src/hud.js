// The interface.
//
// Still deliberately thin: how many are left, who they are, and three words at
// the big moments. No score, no combo, no XP — the tension is meant to come
// from watching the list get shorter.

import { PHASE } from './round.js';
import { ROUND } from './config.js';

const MAX_ROWS = 14;

export function createHud() {
  const el = {
    count: document.getElementById('count'),
    list: document.getElementById('standings-list'),
    standings: document.getElementById('standings'),
    mapName: document.getElementById('map-name'),
    mapBlurb: document.getElementById('map-blurb'),
    aboutTitle: document.getElementById('map-about-title'),
    aboutText: document.getElementById('map-about-text'),
    banner: document.getElementById('banner'),
    fade: document.getElementById('fade'),
    controls: document.getElementById('controls'),
    start: document.getElementById('btn-start'),
    feed: document.getElementById('feed'),
    feedList: document.getElementById('feed-list'),
  };

  let lastBanner = '';
  let lastSig = '';
  let lastFeed = '';
  let idle = 0;

  const hud = {
    el,

    setMap(mapDef) {
      el.mapName.textContent = mapDef.name;
      el.mapBlurb.textContent = mapDef.blurb;
      // The long explanation lives on the arena, so you can read what the
      // universe does while watching it do it.
      // The name is already written just above the card, so the heading
      // does not repeat it (and long names would only be clipped).
      if (el.aboutTitle) el.aboutTitle.setAttribute('aria-label', `How ${mapDef.name} works`);
      if (el.aboutText) el.aboutText.textContent = mapDef.description || mapDef.blurb || '';
      el.mapName.classList.remove('intro');
      // Restart the CSS animation by forcing a reflow.
      void el.mapName.offsetWidth;
      el.mapName.classList.add('intro');
      lastSig = '';
    },

    update(round, dtMs) {
      const n = round.aliveCount;

      // An empty universe is waiting, not losing. "0 left" reads like a race
      // that went badly rather than one that has not been entered.
      if (round.idle) {
        setBanner('', '');
        el.count.textContent = 'waiting for names';
      } else if (round.phase === PHASE.READY) {
        setBanner('', '');
        el.count.textContent = `${round.startCount} entrants`;
      } else if (round.phase === PHASE.COUNTDOWN) {
        const left = Math.ceil((ROUND.countdownMs - round.phaseTime) / 1000);
        setBanner(String(Math.max(1, left)), 'count-in');
        el.count.textContent = `${round.startCount} entrants`;
      } else if (round.phase === PHASE.WINNER) {
        // With a roster, the name is the payoff. Without one, the word will do.
        setBanner(round.winner && round.winner.name ? round.winner.name : 'winner', 'winner');
        el.count.textContent = 'winner';
      } else if (n <= ROUND.finalCallout && n > 1) {
        setBanner(`final ${n}`, 'final');
        el.count.textContent = `${n} left`;
      } else {
        setBanner('', '');
        el.count.textContent = `${n} left`;
      }

      // Only offered while a field is on the line. Kept out of the controls
      // bar's auto-hide: nobody should have to wiggle the mouse to find it.
      if (el.start) el.start.hidden = round.phase !== PHASE.READY;

      renderStandings(round);
      drawFeed(round);

      idle += dtMs;
      if (idle > 2800) el.controls.classList.add('hidden');
    },

    wake() {
      idle = 0;
      el.controls.classList.remove('hidden');
    },

    fadeOut() {
      el.fade.classList.add('on');
    },
    fadeIn() {
      el.fade.classList.remove('on');
    },
  };

  // The DOM is only touched when the standings actually change. Rebuilding
  // twenty rows sixty times a second would cost more than the entire physics
  // simulation does.
  function renderStandings(round) {
    const alive = round.players.filter((p) => p.alive);
    const sig = `${alive.length}:${alive.map((p) => p.id).join(',')}:${round.phase}`;
    if (sig === lastSig) return;
    lastSig = sig;

    const shown = alive.slice(0, MAX_ROWS);
    const rows = shown.map((p) => {
      const win = round.winner === p ? ' win' : '';
      return `<li class="row${win}"><i style="background:${p.col.crayon}"></i><span>${
        escapeHtml(p.label)
      }</span></li>`;
    });
    if (alive.length > MAX_ROWS) {
      rows.push(`<li class="row more"><i></i><span>+${alive.length - MAX_ROWS} more</span></li>`);
    }
    el.list.innerHTML = rows.join('');
  }

  // Four causes, in the words someone watching would use. The engine's names
  // for them — scribble, boom — describe the drawing, not what happened.
  const CAUSE = {
    hole: 'black hole',
    drift: 'flung out',
    scribble: 'burned up',
    boom: 'blown apart',
  };

  // How long an entry stays on the left before it fades out. This is a feed of
  // what just happened, not a record of the round; the standings already say
  // who is left, and a list that only grows would end up repeating them.
  const FEED_MS = 8000;

  function drawFeed(round) {
    if (!el.feed || !el.feedList) return;
    const live = round.out.filter((o) => round.time - o.at < FEED_MS);
    // The age bucket is part of the signature on purpose: without it the
    // rows would be rebuilt only when an entry arrived or dropped off, and
    // the fade would sit frozen in between.
    const bucket = live.length ? Math.floor(round.time / 700) : 0;
    const sig = bucket + ':' + live.map((o) => o.name + o.kind + o.at).join('|');
    if (sig === lastFeed) return;
    lastFeed = sig;

    el.feed.hidden = live.length === 0;
    el.feedList.innerHTML = live.map((o) => {
      // Oldest entries dim rather than vanishing, so the list does not twitch.
      const age = (round.time - o.at) / FEED_MS;
      const alpha = (1 - age * age).toFixed(2);
      return `<li style="opacity:${alpha}"><i style="background:${o.crayon}"></i>`
        + `<span class="who">${escapeHtml(o.name)}</span>`
        + `<span class="how">${CAUSE[o.kind] || 'out'}</span></li>`;
    }).join('');
  }

  function setBanner(text, cls) {
    const key = `${text}|${cls}`;
    if (key === lastBanner) return;
    lastBanner = key;
    el.banner.textContent = text;
    el.banner.className = text ? `on ${cls}` : '';
  }

  return hud;
}

// Names come from a text box, so they are untrusted input and must never reach
// innerHTML unescaped.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
