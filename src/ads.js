// The ad slot.
//
// It sits under the "How it works" card, beside the arena, where it is seen
// without anyone scrolling. At the bottom of the side column it was 300px
// below the fold on a laptop, which for an ad is the same as not being there.
//
// Until advertising is switched on, the slot runs house ads: the same shape as
// any display ad you would see elsewhere (a picture, a headline, one button),
// each one pointing at something in Cosmos that is easy to miss. They rotate
// every few seconds, hold still under the pointer, and each button does what
// it says. Short screens get the 300x100 banner cut of the same ads, so the
// slot never pushes past the bottom of the window.
//
// The slot reserves its space from first paint whether or not an ad ever
// arrives, so switching advertising on, or having it blocked, never shifts
// the layout.

import { ADS_ENABLED, ADSENSE_CLIENT, ADSENSE_SLOT } from './config.js';
import { paintThumb } from './looks.js';
import { t, onLang } from './i18n.js';

const ROTATE_MS = 8000;
const ART_PX = 128;   // backing size of each racer drawn in the art, 2x

// `onDraw()` opens the icon menu for someone on the list and returns false
// when there is nobody to open it for. `onPlay(id)` switches universe.
// `maps` is the list of universes, for the "try this one" ad.
export function installAds({ onDraw, onPlay, maps = [] } = {}) {
  const slot = document.getElementById('ad-slot');
  if (!slot) return;
  if (ADS_ENABLED) {
    installNetwork(slot);
    return;
  }

  let index = 0;
  let timer = null;
  let paused = false;
  let tryMap = maps[0] || null;
  let flash = '';

  const ADS = [
    {
      id: 'draw',
      art: ['rocket', 'alien', 'astronaut'],
      head: () => t('Draw your own racer'),
      body: () => t('Doodle anything, and it races against your friends.'),
      cta: () => t('Draw now'),
      act: () => {
        if (onDraw && onDraw() === false) say(t('Add a name first'));
      },
    },
    {
      id: 'share',
      art: ['saturn', 'ufo', 'groot', 'satellite'],
      head: () => t('Race your friends'),
      body: () => t('Send the link, add everyone’s name, and see who is left standing.'),
      cta: () => t('Copy link'),
      act: () => {
        const url = location.origin + location.pathname;
        const done = () => say(t('Copied!'));
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, () => say(url));
        } else {
          say(url);
        }
      },
    },
    {
      id: 'universe',
      art: ['planet', 'satellite', 'saturn'],
      head: () => (tryMap ? t('Try {name}', { name: t(tryMap.name) }) : t('Race your friends')),
      body: () => (tryMap ? t(tryMap.blurb) : ''),
      cta: () => t('Play it'),
      act: () => { if (tryMap && onPlay) onPlay(tryMap.id); },
    },
  ];

  slot.classList.add('house');
  slot.textContent = '';
  slot.innerHTML = `
    <div class="hads" role="region">
      <span class="hads-badge"></span>
      <div class="hads-art"></div>
      <div class="hads-copy">
        <b class="hads-head"></b>
        <span class="hads-body"></span>
      </div>
      <button type="button" class="hads-cta"></button>
      <div class="hads-dots"></div>
    </div>`;
  const root = slot.querySelector('.hads');
  const art = root.querySelector('.hads-art');
  const dots = root.querySelector('.hads-dots');

  ADS.forEach((ad, i) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'hads-dot';
    d.addEventListener('click', () => show(i, true));
    dots.appendChild(d);
  });

  root.querySelector('.hads-cta').addEventListener('click', () => ADS[index].act());
  root.addEventListener('pointerenter', () => { paused = true; });
  root.addEventListener('pointerleave', () => { paused = false; });

  function say(text) {
    flash = text;
    paint();
    setTimeout(() => { if (flash === text) { flash = ''; paint(); } }, 2200);
  }

  function paintArt(ad) {
    art.textContent = '';
    ad.art.forEach((id, k) => {
      const c = document.createElement('canvas');
      c.width = ART_PX;
      c.height = ART_PX;
      c.className = 'hads-racer';
      c.style.setProperty('--k', k);
      paintThumb(c, id);
      art.appendChild(c);
    });
  }

  function paint() {
    const ad = ADS[index];
    root.dataset.ad = ad.id;
    root.querySelector('.hads-badge').textContent = t('Ad');
    root.querySelector('.hads-head').textContent = ad.head();
    root.querySelector('.hads-body').textContent = ad.body();
    const cta = root.querySelector('.hads-cta');
    cta.textContent = flash || ad.cta();
    cta.classList.toggle('flash', !!flash);
    root.setAttribute('aria-label', `${t('Ad')}: ${ad.head()}`);
    [...dots.children].forEach((d, i) => {
      d.classList.toggle('on', i === index);
      d.setAttribute('aria-label', `${t('Ad')} ${i + 1}`);
    });
  }

  function show(i, byHand = false) {
    index = (i + ADS.length) % ADS.length;
    flash = '';
    // A different universe each time the "try" ad comes round.
    if (ADS[index].id === 'universe' && maps.length) {
      tryMap = maps[Math.floor(Math.random() * maps.length)];
    }
    root.classList.remove('in');
    void root.offsetWidth;
    root.classList.add('in');
    paintArt(ADS[index]);
    paint();
    if (byHand) restart();
  }

  function restart() {
    clearInterval(timer);
    timer = setInterval(() => { if (!paused && !document.hidden) show(index + 1); }, ROTATE_MS);
  }

  onLang(paint);
  show(0);
  restart();
}

function installNetwork(slot) {
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(s);

  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'inline-block';
  ins.style.width = '300px';
  ins.style.height = '250px';
  ins.setAttribute('data-ad-client', ADSENSE_CLIENT);
  ins.setAttribute('data-ad-slot', ADSENSE_SLOT);
  slot.textContent = '';
  slot.appendChild(ins);

  s.addEventListener('load', () => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      /* An ad that fails to fill is not an error worth surfacing. */
    }
  });
}
