// The Choose icon menu.
//
// One panel, two ways in. From a name's own icon button it picks that racer's
// look: tap an icon and they wear it, or tap Random to go back to being dealt
// one. From the "Choose icon" button under the list it edits the set instead:
// tap an icon to leave it out of the random deal, or put it back.
//
// Both ways share the drawing pad at the bottom. Whatever is drawn there is
// saved as an icon of its own, and when the menu was opened for a name, that
// name wears it straight away.
//
// The menu only reads and writes looks.js; whoever is lined up finds out
// through onLooksChange, the same as any other change to the looks.

import {
  allLooks, inSet, setInSet, pickOf, setPick, ownersOf, addCustom, removeCustom,
  customCount, CUSTOM_LIMIT, paintThumb, onLooksChange,
} from './looks.js';
import { t, onLang } from './i18n.js';

const TILE_PX = 144;     // backing size of each tile's preview canvas (72 CSS px, 2x)
const PAD_PX = 320;      // backing size of the drawing pad
const SAVE_PX = 128;     // drawings are stored this size, as PNG
const PENS = ['#2E2934', '#E2574C', '#F2A93B', '#F4D35E', '#6CC57C', '#4FA3E0', '#9B6BD6', '#F2EADB'];

const DICE = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" '
  + 'stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/></g>'
  + '<g fill="currentColor"><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="15" r="1.5"/>'
  + '<circle cx="15" cy="9" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="12" cy="12" r="1.5"/></g></svg>';
const CROSS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" '
  + 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

// `names` reports who is on the list right now, so an icon someone else
// already wears can be marked as theirs. Picks left behind by names that have
// since been deleted are not shown as taken.
export function createLookMenu({ names = () => [] } = {}) {
  let el = null;
  let mode = 'set';      // 'name' while choosing for one racer, 'set' for the deal
  let forName = '';
  let lastFocus = null;
  let pen = PENS[0];
  let erasing = false;
  let drawn = false;

  function build() {
    el = document.createElement('div');
    el.className = 'look-backdrop';
    el.hidden = true;
    el.innerHTML = `
      <div class="look-menu panel" role="dialog" aria-modal="true" aria-labelledby="look-title">
        <div class="look-head">
          <span class="look-title" id="look-title"></span>
          <button type="button" class="about-toggle look-close">${CROSS}</button>
        </div>
        <p class="look-hint"></p>
        <div class="look-grid" role="list"></div>
        <div class="look-draw">
          <span class="look-sub"></span>
          <div class="look-pad-row">
            <canvas class="look-pad" width="${PAD_PX}" height="${PAD_PX}"></canvas>
            <div class="look-tools">
              <div class="look-pens"></div>
              <button type="button" class="look-tool look-eraser"></button>
              <button type="button" class="look-tool look-wipe"></button>
            </div>
          </div>
          <div class="look-save-row">
            <input type="text" class="look-name" maxlength="18" spellcheck="false">
            <button type="button" class="look-save"></button>
          </div>
          <p class="look-note" aria-live="polite"></p>
        </div>
        <button type="button" class="look-done"></button>
      </div>`;
    document.body.appendChild(el);

    el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
    // On the whole page rather than the panel: saving a drawing disables the
    // Save button under the pointer, focus falls back to the page, and a
    // listener on the panel would never hear the Escape that followed.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.hidden) { e.stopPropagation(); close(); }
    }, true);
    el.querySelector('.look-close').addEventListener('click', close);
    el.querySelector('.look-done').addEventListener('click', close);

    const pens = el.querySelector('.look-pens');
    for (const c of PENS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'look-pen';
      b.style.background = c;
      b.dataset.pen = c;
      b.addEventListener('click', () => { pen = c; erasing = false; markTools(); });
      pens.appendChild(b);
    }
    el.querySelector('.look-eraser').addEventListener('click', () => { erasing = !erasing; markTools(); });
    el.querySelector('.look-wipe').addEventListener('click', wipe);
    el.querySelector('.look-save').addEventListener('click', save);
    el.querySelector('.look-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
    });
    wirePad(el.querySelector('.look-pad'));
    markTools();
  }

  // ── The pad ──────────────────────────────────────────────────────────────

  function wirePad(pad) {
    const g = pad.getContext('2d');
    let last = null;
    const at = (e) => {
      const r = pad.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * PAD_PX, y: ((e.clientY - r.top) / r.height) * PAD_PX };
    };
    const stroke = (a, b) => {
      g.save();
      g.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
      g.strokeStyle = pen;
      g.lineWidth = erasing ? 34 : 14;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x + 0.01, b.y);
      g.stroke();
      g.restore();
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      last = at(e);
      stroke(last, last);
      if (!erasing) setDrawn(true);
    });
    pad.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = at(e);
      stroke(last, p);
      last = p;
    });
    const end = () => { last = null; };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
  }

  function wipe() {
    const pad = el.querySelector('.look-pad');
    pad.getContext('2d').clearRect(0, 0, PAD_PX, PAD_PX);
    setDrawn(false);
  }

  function setDrawn(v) {
    drawn = v;
    el.querySelector('.look-save').disabled = !drawn || customCount() >= CUSTOM_LIMIT;
  }

  function markTools() {
    for (const b of el.querySelectorAll('.look-pen')) {
      b.classList.toggle('on', !erasing && b.dataset.pen === pen);
    }
    el.querySelector('.look-eraser').classList.toggle('on', erasing);
  }

  function save() {
    if (!drawn) return;
    if (customCount() >= CUSTOM_LIMIT) {
      note(t('No room for more drawings. Delete one first.'));
      return;
    }
    // Stored small: twelve drawings at full pad size would crowd out the rest
    // of what this browser remembers.
    const out = document.createElement('canvas');
    out.width = SAVE_PX;
    out.height = SAVE_PX;
    out.getContext('2d').drawImage(el.querySelector('.look-pad'), 0, 0, SAVE_PX, SAVE_PX);
    const nameEl = el.querySelector('.look-name');
    const id = addCustom(nameEl.value || t('My drawing'), out.toDataURL('image/png'));
    if (!id) {
      note(t('No room for more drawings. Delete one first.'));
      return;
    }
    if (mode === 'name' && forName) setPick(forName, id);
    nameEl.value = '';
    wipe();
    note(mode === 'name' && forName
      ? t('Saved. {name} is wearing it.', { name: forName })
      : t('Saved. It is in the random deal now.'));
  }

  function note(text) {
    el.querySelector('.look-note').textContent = text;
  }

  // ── The grid ─────────────────────────────────────────────────────────────

  // `index` staggers the float so the icons drift out of step, like the
  // racers on the line. `owners` are the other names already wearing it.
  function tile({ id, label, on, custom, onClick, dice, index = 0, owners = [] }) {
    const wrap = document.createElement('div');
    wrap.className = 'look-cell';
    wrap.style.setProperty('--float-delay', `${-((index * 0.61) % 3.4).toFixed(2)}s`);
    wrap.setAttribute('role', 'listitem');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'look-tile';
    b.classList.toggle('on', on);
    b.classList.toggle('taken', owners.length > 0);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (dice) {
      b.insertAdjacentHTML('beforeend', `<span class="look-float"><span class="look-dice">${DICE}</span></span>`);
    } else {
      const f = document.createElement('span');
      f.className = 'look-float';
      const c = document.createElement('canvas');
      c.width = TILE_PX;
      c.height = TILE_PX;
      paintThumb(c, id);
      f.appendChild(c);
      b.appendChild(f);
    }
    const s = document.createElement('span');
    s.className = 'look-label';
    s.textContent = label;
    b.appendChild(s);
    // Taken: the owner's name rides on the tile in its own colour. It can
    // still be picked; the two racers just race in different colours.
    if (owners.length) {
      const o = document.createElement('span');
      o.className = 'look-owner';
      o.textContent = owners.length > 1 ? `${owners[0]} +${owners.length - 1}` : owners[0];
      b.appendChild(o);
      const who = t('Taken by {name}', { name: owners.join(', ') });
      b.title = who;
      b.setAttribute('aria-label', `${label}, ${who}`);
    }
    b.addEventListener('click', onClick);
    wrap.appendChild(b);
    if (custom) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'look-del';
      del.innerHTML = CROSS;
      del.title = t('Delete this drawing');
      del.setAttribute('aria-label', t('Delete this drawing'));
      del.addEventListener('click', () => removeCustom(id));
      wrap.appendChild(del);
    }
    return wrap;
  }

  function render() {
    if (!el || el.hidden) return;
    const naming = mode === 'name';
    el.querySelector('.look-title').textContent = naming
      ? t('Icon for {name}', { name: forName })
      : t('Choose icon');
    el.querySelector('.look-hint').textContent = naming
      ? t('Tap an icon to wear it. Blue ones are already taken, but you can still pick one: you race in your own colour.')
      : t('Icons that are lit get dealt at random. Tap one to leave it out or put it back.');
    el.querySelector('.look-sub').textContent = t('Draw your own');
    el.querySelector('.look-eraser').textContent = t('Eraser');
    el.querySelector('.look-wipe').textContent = t('Clear');
    el.querySelector('.look-save').textContent = t('Save drawing');
    el.querySelector('.look-name').placeholder = t('Name your drawing');
    el.querySelector('.look-done').textContent = t('Done');
    const close1 = el.querySelector('.look-close');
    close1.title = t('Close');
    close1.setAttribute('aria-label', t('Close'));
    for (const b of el.querySelectorAll('.look-pen')) b.setAttribute('aria-label', t('Pen colour'));

    const grid = el.querySelector('.look-grid');
    const keep = grid.contains(document.activeElement) ? [...grid.querySelectorAll('.look-tile')].indexOf(document.activeElement) : -1;
    grid.textContent = '';
    const mine = naming ? pickOf(forName) : null;
    const here = new Set(names());
    const others = (id) => ownersOf(id).filter((n) => n !== forName && here.has(n));
    let index = 0;
    if (naming) {
      grid.appendChild(tile({
        dice: true, label: t('Random'), on: !mine, index: index++,
        onClick: () => setPick(forName, null),
      }));
    }
    for (const look of allLooks()) {
      grid.appendChild(tile({
        id: look.id,
        label: look.custom ? look.name : t(look.name),
        custom: look.custom,
        index: index++,
        owners: others(look.id),
        on: naming ? mine === look.id : inSet(look.id),
        onClick: naming
          ? () => setPick(forName, look.id)
          : () => setInSet(look.id, !inSet(look.id)),
      }));
    }
    if (keep >= 0) {
      const tiles = grid.querySelectorAll('.look-tile');
      (tiles[keep] || tiles[tiles.length - 1])?.focus();
    }
    setDrawn(drawn);
  }

  // ── Open and close ───────────────────────────────────────────────────────

  function open(m, name) {
    if (!el) build();
    mode = m;
    forName = name || '';
    lastFocus = document.activeElement;
    note('');
    el.hidden = false;
    render();
    const first = el.querySelector('.look-tile.on') || el.querySelector('.look-tile');
    if (first) first.focus();
  }

  function close() {
    if (!el || el.hidden) return;
    el.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  onLooksChange(render);
  onLang(render);

  return {
    openFor(name) { open('name', name); },
    openSet() { open('set'); },
    isOpen() { return !!el && !el.hidden; },
  };
}
