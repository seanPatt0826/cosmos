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
    banner: document.getElementById('banner'),
    fade: document.getElementById('fade'),
    controls: document.getElementById('controls'),
  };

  let lastBanner = '';
  let lastSig = '';
  let idle = 0;

  const hud = {
    el,

    setMap(mapDef) {
      el.mapName.textContent = mapDef.name;
      el.mapBlurb.textContent = mapDef.blurb;
      el.mapName.classList.remove('intro');
      // Restart the CSS animation by forcing a reflow.
      void el.mapName.offsetWidth;
      el.mapName.classList.add('intro');
      lastSig = '';
    },

    update(round, dtMs) {
      const n = round.aliveCount;

      if (round.phase === PHASE.COUNTDOWN) {
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

      renderStandings(round);

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
