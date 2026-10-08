// The controls bar draws icons instead of words.
//
// Every icon is on a 24-unit grid centred at (12, 12), stroked in the current
// text colour with round ends, the same pen as the remove cross and the
// description card's close button. The word an icon replaces moves into the
// button's title and aria-label, so the tooltip and screen readers still say it.

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  pause: `<rect x="7" y="5.5" width="3.2" height="13" rx="1.2" fill="currentColor"/>`
    + `<rect x="13.8" y="5.5" width="3.2" height="13" rx="1.2" fill="currentColor"/>`,

  play: `<path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4A.8.8 0 0 0 8 5.6z" fill="currentColor"/>`,

  // The video-player button: a rounded box with the triangle cut out of it.
  speed: `<path fill-rule="evenodd" fill="currentColor" d="M5.5 5h13A3.5 3.5 0 0 1 22 8.5v7a3.5 3.5 0 0 1-3.5 3.5h-13A3.5 3.5 0 0 1 2 15.5v-7A3.5 3.5 0 0 1 5.5 5zM10 8.6v6.8l5.6-3.4z"/>`,

  soundOn: `<path d="M4 9.5h3l4.5-4v13L7 14.5H4z" fill="currentColor" ${S}/>`
    + `<path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8" ${S}/>`,

  soundOff: `<path d="M4 9.5h3l4.5-4v13L7 14.5H4z" fill="currentColor" ${S}/>`
    + `<path d="M15.5 9.5l5 5M20.5 9.5l-5 5" ${S}/>`,

  sun: `<circle cx="12" cy="12" r="4" ${S}/>`
    + `<path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5L7 7M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5" ${S}/>`,

  moon: `<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z" ${S}/>`,

  skip: `<path d="M5.5 6.2v11.6a.7.7 0 0 0 1.1.6l8.6-5.8a.7.7 0 0 0 0-1.2L6.6 5.6a.7.7 0 0 0-1.1.6z" fill="currentColor"/>`
    + `<path d="M18.5 5.5v13" ${S} stroke-width="2.4"/>`,
};

// Puts an icon (and optionally a small text badge beside it) on a button and
// moves the word into the tooltip. Safe to call again whenever state changes.
export function setIcon(button, name, label, badge = '') {
  button.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`
    + (badge ? `<span class="badge">${badge}</span>` : '');
  button.setAttribute('aria-label', label);
  // The tooltip module adopts title into data-tip on first hover, so set both
  // or a changed label would keep showing the old word.
  button.dataset.tip = label;
  button.removeAttribute('title');
}
