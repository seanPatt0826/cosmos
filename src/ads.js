// The ad slot.
//
// It sits under the "How it works" card, beside the arena, where it is seen
// without anyone scrolling. At the bottom of the side column it was 300px
// below the fold on a laptop, which for an ad is the same as not being there.
//
// Until advertising is switched on, the slot runs sample ads for made-up
// companies, built the way display ads are built anywhere else: the brand's
// own colours and logo, a product picture, an offer or a price, and one
// button. They show what the slot will look like with real ads in it. The
// companies are invented on purpose; none of them is a real brand. Pressing
// one only says that it is a sample.
//
// They rotate every few seconds and hold still under the pointer. Short
// screens get the 300x100 banner cut of the same ads. The slot reserves its
// space from first paint whether or not an ad ever arrives, so switching
// advertising on, or having it blocked, never shifts the layout.

import { ADS_ENABLED, ADSENSE_CLIENT, ADSENSE_SLOT } from './config.js';
import { t, onLang } from './i18n.js';

const ROTATE_MS = 8000;

// Product pictures, drawn inline so the slot never waits on the network.
const ART = {
  moonbun: `<svg viewBox="0 0 140 100" aria-hidden="true">
      <g fill="none" stroke="#C98B43" stroke-width="3" stroke-linecap="round" opacity=".55">
        <path d="M52 22c-5-6 5-9 0-16"/><path d="M70 18c-5-6 5-9 0-16"/><path d="M88 22c-5-6 5-9 0-16"/>
      </g>
      <ellipse cx="70" cy="80" rx="52" ry="12" fill="#B9773A" opacity=".25"/>
      <path d="M20 74c0-28 22-46 50-46s50 18 50 46z" fill="#F6CF8F" stroke="#B9773A" stroke-width="3"/>
      <path d="M58 40a16 16 0 1 0 18 22a13 13 0 1 1-18-22z" fill="#FFF3D6" opacity=".9"/>
      <path d="M34 60c4-12 12-19 22-22" stroke="#FFF7E6" stroke-width="5" stroke-linecap="round" fill="none" opacity=".7"/>
    </svg>`,
  zappawatt: `<svg viewBox="0 0 140 110" aria-hidden="true">
      <defs><linearGradient id="zw-cup" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#A78BFA"/><stop offset="1" stop-color="#6D28D9"/></linearGradient></defs>
      <path d="M30 70V58a40 40 0 0 1 80 0v12" fill="none" stroke="#E5E7FF" stroke-width="9" stroke-linecap="round"/>
      <rect x="16" y="60" width="28" height="42" rx="12" fill="url(#zw-cup)"/>
      <rect x="96" y="60" width="28" height="42" rx="12" fill="url(#zw-cup)"/>
      <rect x="22" y="68" width="8" height="26" rx="4" fill="#C4B5FD" opacity=".6"/>
      <path d="M74 30l-12 20h9l-5 16 14-22h-9z" fill="#FDE047"/>
    </svg>`,
  driftly: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <defs><linearGradient id="dr-icon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#38BDF8"/><stop offset="1" stop-color="#2563EB"/></linearGradient></defs>
      <rect width="64" height="64" rx="15" fill="url(#dr-icon)"/>
      <path d="M14 33l34-15-10 30-7-10z" fill="#FFFFFF"/>
      <path d="M31 38l-3 10 7-6" fill="#DBEAFE"/>
    </svg>`,
};

// Small brand marks for the logo row.
const LOGO = {
  moonbun: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 2a8 8 0 1 0 6 12A7 7 0 1 1 12 2z" fill="#D9534F"/></svg>',
  zappawatt: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M11 1L3 12h6l-2 7 9-12h-6z" fill="#FDE047"/></svg>',
  driftly: '',
};

const ADS = [
  {
    id: 'moonbun',
    brand: 'Moonbun Bakery',
    head: () => t('Fresh buns, delivered warm'),
    body: () => t('Baked at dawn, at your door by breakfast.'),
    offer: () => t('30% off your first box'),
    cta: () => t('Order now'),
  },
  {
    id: 'zappawatt',
    brand: 'Zappawatt',
    head: () => t('Hear every star.'),
    body: () => t('Wireless headphones with 40 hours of battery.'),
    offer: () => t('$59'),
    cta: () => t('Shop now'),
  },
  {
    id: 'driftly',
    brand: 'Driftly',
    app: true,
    head: () => t('Weekend trips, planned in a minute'),
    line: () => t('Stays, trains and tickets in one app.'),
    body: () => t('Travel'),
    offer: () => '4.8',
    cta: () => t('Install'),
  },
];

export function installAds() {
  const slot = document.getElementById('ad-slot');
  if (!slot) return;
  if (ADS_ENABLED) {
    installNetwork(slot);
    return;
  }

  let index = 0;
  let timer = null;
  let paused = false;
  let flash = '';

  slot.classList.add('house');
  const root = document.createElement('div');
  root.className = 'hads';
  root.setAttribute('role', 'region');
  slot.textContent = '';
  slot.appendChild(root);

  root.addEventListener('pointerenter', () => { paused = true; });
  root.addEventListener('pointerleave', () => { paused = false; });
  root.addEventListener('click', (e) => {
    if (!e.target.closest('.hads-cta, .hads-info')) return;
    say(t('Sample ad'));
  });

  function say(text) {
    flash = text;
    paint();
    setTimeout(() => { if (flash === text) { flash = ''; paint(); } }, 2200);
  }

  function paint() {
    const ad = ADS[index];
    root.dataset.ad = ad.id;
    root.classList.toggle('app', !!ad.app);
    const stars = ad.app
      ? `<span class="hads-stars" aria-label="${ad.offer()}">★★★★★ <em>${ad.offer()}</em></span>`
      : '';
    root.innerHTML = `
      <span class="hads-badge">${esc(t('Ad'))}</span>
      <button type="button" class="hads-info" aria-label="${esc(t('Why this ad?'))}">i</button>
      ${ad.app
        ? `<div class="hads-app">
             <span class="hads-icon">${ART[ad.id]}</span>
             <span class="hads-app-meta">
               <b class="hads-brand-name">${esc(ad.brand)}</b>
               <span class="hads-cat">${esc(ad.body())} · ${esc(t('Free'))}</span>
               ${stars}
             </span>
           </div>`
        : `<div class="hads-art">${ART[ad.id]}</div>`}
      <div class="hads-copy">
        ${ad.app ? '' : `<span class="hads-brand"><span class="hads-logo">${LOGO[ad.id]}</span>${esc(ad.brand)}</span>`}
        <b class="hads-head">${esc(ad.head())}</b>
        <span class="hads-body">${esc(ad.app ? ad.line() : ad.body())}</span>
      </div>
      <div class="hads-foot">
        ${ad.app ? '' : `<span class="hads-offer">${esc(ad.offer())}</span>`}
        <button type="button" class="hads-cta${flash ? ' flash' : ''}">${esc(flash || ad.cta())}</button>
      </div>`;
    root.setAttribute('aria-label', `${t('Ad')}: ${ad.brand}, ${ad.head()}`);
  }

  function show(i) {
    index = (i + ADS.length) % ADS.length;
    flash = '';
    root.classList.remove('in');
    void root.offsetWidth;
    root.classList.add('in');
    paint();
  }

  onLang(paint);
  show(0);
  timer = setInterval(() => { if (!paused && !document.hidden) show(index + 1); }, ROTATE_MS);
  return () => clearInterval(timer);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
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
