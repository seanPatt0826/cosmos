// The interface.
//
// Still deliberately thin: three words at the big moments, a feed of who just
// went out, and the Ranking on the right: everyone in the race, the ones still
// in at the top and the ones out below in the place they finished. No score,
// no combo, no XP.

import { PHASE } from './round.js';
import { ROUND } from './config.js';
import { t, getLang } from './i18n.js';
import { createSteps } from './steps.js';
import { paintThumb, onLooksChange } from './looks.js';

const RANK_ICON_PX = 44;   // backing size of a ranking icon; drawn at 22 CSS px

export function createHud() {
  const steps = createSteps();
  const el = {
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
    rankCount: document.getElementById('ranking-count'),
    rankList: document.getElementById('ranking-list'),
  };

  let lastBanner = '';
  let lastSig = '';
  let lastFeed = '';
  let lastRank = '';
  // A drawing that finishes decoding repaints the ranking's icons too.
  onLooksChange(() => { lastRank = ''; });
  let idle = 0;

  const hud = {
    el,

    setMap(mapDef) {
      el.mapName.textContent = t(mapDef.name);
      el.mapBlurb.textContent = t(mapDef.blurb);
      // The long explanation lives on the arena, so you can read what the
      // universe does while watching it do it.
      // The name is already written just above the card, so the heading
      // does not repeat it (and long names would only be clipped).
      if (el.aboutTitle) el.aboutTitle.setAttribute('aria-label', t('How {name} works', { name: t(mapDef.name) }));
      if (el.aboutText) el.aboutText.textContent = t(mapDef.description || mapDef.blurb || '');
      // The step-by-step pictures above it: on the line, how you go out, and
      // the winner, each with its one line of rules. See steps.js.
      steps.setMap(mapDef);
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
      } else if (round.phase === PHASE.WINNER) {
        // With a roster, the name is the payoff. Without one, the word will do.
        setBanner(round.winner && round.winner.name ? round.winner.name : t('winner'), 'winner');
      } else if (round.phase === PHASE.RUNNING && !round.idle && n <= ROUND.finalCallout && n > 1) {
        setBanner(t('final {n}', { n }), 'final');
      } else {
        setBanner('', '');
      }

      // Only offered while a field is on the line. Kept out of the controls
      // bar's auto-hide: nobody should have to wiggle the mouse to find it.
      if (el.start) el.start.hidden = round.phase !== PHASE.READY;

      drawFeed(round);
      drawRanking(round);

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

  // Four causes, in the words someone watching would use. The engine's names
  // for them — scribble, boom — describe the drawing, not what happened.
  const CAUSE = {
    hole: 'black hole',
    drift: 'flung out',
    scribble: 'burned up',
    boom: 'blown apart',
  };

  // How long an entry stays on the left before it fades out. This is a feed of
  // what just happened, not a record of the round; a list that only grows
  // would end up a ledger nobody reads.
  const FEED_MS = 8000;

  function drawFeed(round) {
    if (!el.feed || !el.feedList) return;
    const live = round.out.filter((o) => round.time - o.at < FEED_MS);
    // The age bucket is part of the signature on purpose: without it the
    // rows would be rebuilt only when an entry arrived or dropped off, and
    // the fade would sit frozen in between.
    const bucket = live.length ? Math.floor(round.time / 700) : 0;
    const sig = getLang() + bucket + ':' + live.map((o) => o.name + o.kind + o.at).join('|');
    if (sig === lastFeed) return;
    lastFeed = sig;

    el.feed.hidden = live.length === 0;
    el.feedList.innerHTML = live.map((o) => {
      // Oldest entries dim rather than vanishing, so the list does not twitch.
      const age = (round.time - o.at) / FEED_MS;
      const alpha = (1 - age * age).toFixed(2);
      return `<li style="opacity:${alpha}"><i style="background:${o.crayon}"></i>`
        + `<span class="who">${escapeHtml(o.name)}</span>`
        + `<span class="how">${t(CAUSE[o.kind] || 'out')}</span></li>`;
    }).join('');
  }

  // Everyone in the race, in one list. Still in at the top, in the order they
  // stand; out below them, best place first, struck through and dimmed, with
  // what got them. The winner sits on top with a 1. Rebuilt only when someone
  // goes out or the field changes, never every frame.
  function drawRanking(round) {
    if (!el.rankList) return;
    const ps = round.idle ? [] : round.players;
    const sig = getLang() + round.phase + ':' + (round.winner ? round.winner.id : '') + ':'
      + ps.map((p) => `${p.id}${p.label}${p.archetype}${p.col.name}${p.alive ? '' : p.place}`).join('|');
    if (sig === lastRank) return;
    lastRank = sig;

    const alive = ps.filter((p) => p.alive);
    if (el.rankCount) {
      el.rankCount.textContent = !ps.length ? ''
        : round.winner ? t('winner')
          : alive.length === ps.length ? t('{n} entrants', { n: ps.length })
            : t('{n} left', { n: alive.length });
    }

    if (!ps.length) {
      el.rankList.innerHTML = `<li class="rank-empty">${escapeHtml(t('waiting for names'))}</li>`;
      return;
    }

    const out = ps.filter((p) => !p.alive).sort((a, b) => a.place - b.place);
    // The winner first, then whoever else is still in (only before the end).
    const inRows = round.winner
      ? [round.winner, ...alive.filter((p) => p !== round.winner)]
      : alive;

    const row = (p, place, cls, status) => `<li class="rank-row ${cls}">`
      + `<span class="rank-place">${place}</span>`
      + `<canvas class="rank-icon" width="${RANK_ICON_PX}" height="${RANK_ICON_PX}"`
      + ` style="--crayon:${p.col.crayon}"></canvas>`
      + `<span class="rank-name">${escapeHtml(p.label)}</span>`
      + `<span class="rank-status">${escapeHtml(status)}</span></li>`;

    el.rankList.innerHTML = [
      ...inRows.map((p) => (round.winner === p
        ? row(p, '1', 'win', t('winner'))
        : row(p, '·', 'in', t('in')))),
      ...out.map((p) => row(p, String(p.place), 'out', t(CAUSE[p.outKind] || 'out'))),
    ].join('');

    // Each icon in its racer's own colour, as it looks in the arena.
    const shown = [...inRows, ...out];
    el.rankList.querySelectorAll('canvas.rank-icon').forEach((c, k) => paintThumb(c, shown[k].archetype, shown[k].col));
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
