// The interface.
//
// Still deliberately thin: three words at the big moments and a feed of who
// just went out. No score, no combo, no XP. There is no "N left" list any
// more; the mini map and the arena already show who is still in.

import { PHASE } from './round.js';
import { ROUND } from './config.js';
import { t, getLang } from './i18n.js';

export function createHud() {
  const el = {
    mapName: document.getElementById('map-name'),
    mapBlurb: document.getElementById('map-blurb'),
    aboutTitle: document.getElementById('map-about-title'),
    aboutText: document.getElementById('map-about-text'),
    rules: document.getElementById('map-rules'),
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
      el.mapName.textContent = t(mapDef.name);
      el.mapBlurb.textContent = t(mapDef.blurb);
      // The long explanation lives on the arena, so you can read what the
      // universe does while watching it do it.
      // The name is already written just above the card, so the heading
      // does not repeat it (and long names would only be clipped).
      if (el.aboutTitle) el.aboutTitle.setAttribute('aria-label', t('How {name} works', { name: t(mapDef.name) }));
      if (el.aboutText) el.aboutText.textContent = t(mapDef.description || mapDef.blurb || '');
      // The short version above it: the goal, how you go out, what to watch.
      // Built from text nodes, never innerHTML, like everything else here.
      if (el.rules) {
        el.rules.textContent = '';
        const r = mapDef.rules;
        const rows = [['Goal', 'Last one left wins.']];
        if (r && r.out) rows.push(['Out if', r.out]);
        if (r && r.watch) rows.push(['Watch for', r.watch]);
        for (const [label, text] of rows) {
          const dt = document.createElement('dt');
          dt.textContent = t(label);
          const dd = document.createElement('dd');
          dd.textContent = t(text);
          el.rules.append(dt, dd);
        }
      }
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
