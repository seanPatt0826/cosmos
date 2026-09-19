// The ad rail.
//
// The slot reserves its space from first paint whether or not an ad ever
// arrives, so switching advertising on — or having it blocked, or failing
// review — never shifts the layout. A slot that pops in and shoves the arena
// sideways is exactly the jank that would break the calm this thing runs on.

import { ADS_ENABLED, ADSENSE_CLIENT, ADSENSE_SLOT } from './config.js';

const slot = document.getElementById('ad-slot');

// While advertising is off, the slot still reserves its exact 300x250 — but an
// empty dashed rectangle is the least appealing thing on the page, and it sits
// in the most prominent corner. So it holds a card until there is an ad to put
// there. Identical dimensions, so switching ads on shifts nothing.
if (!ADS_ENABLED && slot) {
  slot.classList.add('ad-empty');
  slot.innerHTML = `
    <div class="ad-card">
      <p class="ad-card-lead">Nobody is playing.</p>
      <p class="ad-card-body">Objects are released into a physics playground and
        knocked out one at a time. The last one left wins, then it happens again
        somewhere else. Nothing is scripted.</p>
      <a class="ad-card-link" href="./about.html">how it works</a>
    </div>`;
}

if (ADS_ENABLED && slot) {
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
