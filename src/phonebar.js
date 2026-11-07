// Phones: a universe dropdown under the race, and cards that fold.
//
// On a phone the universe portraits were thumbnail-sized and a long scroll
// down the page, so picking a map was hard. Here the same choice is a plain
// dropdown right under the race, which the phone shows as its own big list.
// The cards' headings fold them, so the page is a short list of headings
// instead of a long scroll. None of this shows on a desktop (see the phone
// CSS in index.html); it only drives the portraits and cards already there.

import { t, onLang } from './i18n.js';

const PHONE = window.matchMedia(
  '(max-width: 600px) and (orientation: portrait), '
  + '(max-width: 1100px) and (max-height: 520px) and (orientation: landscape)'
);
// Folded to begin with: the dropdown covers the portraits, and the map is
// mostly useful during a race.
const START_FOLDED = ['.universes', '.chase'];

const grid = document.getElementById('universe-grid');
const canvas = document.getElementById('stage');

const bar = document.createElement('div');
bar.className = 'phone-bar';
const label = document.createElement('label');
label.htmlFor = 'phone-universe';
const select = document.createElement('select');
select.id = 'phone-universe';
bar.append(label, select);
canvas.after(bar);

// The portraits are the source of truth: their names (already translated)
// fill the list, and choosing one presses its portrait, so picking a map
// works exactly as it does on a desktop.
function fill() {
  label.textContent = t('Universes');
  const cards = [...grid.querySelectorAll('.universe')];
  const want = cards.map((b) => `${b.dataset.map}:${b.querySelector('.universe-name').textContent}`).join('|');
  if (select.dataset.made !== want) {
    select.textContent = '';
    for (const b of cards) {
      select.add(new Option(b.querySelector('.universe-name').textContent, b.dataset.map));
    }
    select.dataset.made = want;
  }
  const active = grid.querySelector('.universe.active');
  if (active) select.value = active.dataset.map;
}

select.addEventListener('change', () => {
  const b = grid.querySelector(`.universe[data-map="${CSS.escape(select.value)}"]`);
  if (b) b.click();
  // If the race refused the change (mid-transition), show what is really on.
  setTimeout(fill, 600);
});

new MutationObserver(fill).observe(grid, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], characterData: true });
onLang(fill);
fill();

// Folding cards by their headings.
for (const panel of document.querySelectorAll('.rail > .panel')) {
  const head = panel.querySelector(':scope > label');
  if (!head) continue;
  head.setAttribute('role', 'button');
  head.tabIndex = 0;
  const sync = () => head.setAttribute('aria-expanded', panel.classList.contains('phone-folded') ? 'false' : 'true');
  const toggle = (e) => {
    if (!PHONE.matches) return;
    e.preventDefault();
    panel.classList.toggle('phone-folded');
    sync();
  };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') toggle(e); });
  if (START_FOLDED.some((sel) => panel.matches(sel))) panel.classList.add('phone-folded');
  sync();
}
