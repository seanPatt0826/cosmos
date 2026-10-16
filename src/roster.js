// The entrants list: one box per name.
//
// A single textarea worked, but it read as a form rather than a roster. Giving
// each entrant its own box makes the list feel like the thing it is, and fills
// the side column properly.
//
// Three conveniences carry the weight here. Typing in the last empty box adds
// another, so the list grows as you go. Enter moves down instead of doing
// nothing. And pasting several lines into any box splits them across boxes —
// which is what keeps the old "paste a list of names" workflow alive now that
// there is no textarea to paste into.
//
// Every box can be removed, so a race of two or three is just two or three
// boxes. Remove them all and the list says it is waiting instead of going
// blank.
//
// Each box also carries a small icon button on its left: what that racer is
// wearing in the arena, whether they chose it or were dealt it at random. It
// opens Choose icon for that name (see lookmenu.js).

import { t, setTip, onLang } from './i18n.js';
import { pickOf, paintThumb, onLooksChange } from './looks.js';

const ICON_PX = 64;   // backing size of the row icon; drawn at 32 CSS px
// What an unpicked row offers on hover: a dashed ring with a plus, meaning
// "give this racer an icon". A dice here read as an icon they had chosen.
const ADD = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" '
  + 'stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2.6"/><path d="M12 8v8M8 12h8" '
  + 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const MIN_ROWS = 8;
const MAX_ROWS = 40;
const MAX_LEN = 22;

export function createRoster(listEl, onChange, { onIcon = null } = {}) {
  // What each name is wearing on the field right now, dealt ones included.
  let worn = new Map();

  const roster = {
    // Called with the field after every line-up, so a racer dealt a random
    // icon shows that icon here too, not only someone who picked one.
    setWorn(players) {
      worn = new Map();
      for (const p of players) if (p.name) worn.set(p.name, p.archetype);
      paintIcons();
    },

    names() {
      return inputs()
        .map((i) => i.value.trim())
        .filter(Boolean)
        .slice(0, MAX_ROWS);
    },

    setNames(arr) {
      listEl.textContent = '';
      const wanted = Math.max(MIN_ROWS, Math.min(MAX_ROWS, arr.length + 2));
      for (let i = 0; i < wanted; i++) addRow(arr[i] || '');
      renumber();
    },

    clear() {
      listEl.textContent = '';
      renumber();
      onChange();
    },

    addAndFocus() {
      if (inputs().length >= MAX_ROWS) return;
      const row = addRow('');
      renumber();
      row.querySelector('input').focus();
    },
  };

  function inputs() {
    return [...listEl.querySelectorAll('input')];
  }

  function renumber() {
    inputs().forEach((input, i) => {
      input.placeholder = t('Name {n}', { n: i + 1 });
    });
    // Every box gone: say so, rather than leaving an empty hole in the panel.
    let empty = listEl.querySelector('.name-empty');
    if (inputs().length) {
      if (empty) empty.remove();
    } else if (!empty) {
      empty = document.createElement('p');
      empty.className = 'name-empty';
      empty.textContent = t('waiting for names');
      listEl.appendChild(empty);
    }
  }

  // The icon button shows what that racer wears: their own pick, or else the
  // icon they were dealt for this line-up. A name not on the field yet (typed
  // mid-race) shows nothing until hovered or focused, then a faint "+"; an
  // empty box has nobody to dress and shows nothing. The space stays reserved
  // either way, so the names still line up.
  function paintIcon(row) {
    const btn = row.querySelector('.name-icon');
    if (!btn) return;
    const name = row.querySelector('input').value.trim();
    const own = name ? pickOf(name) : null;
    const pick = own || (name ? worn.get(name) : null) || null;
    btn.disabled = !name;
    btn.classList.toggle('picked', !!pick);
    btn.classList.toggle('dealt', !!pick && !own);
    btn.classList.toggle('unpicked', !!name && !pick);
    const label = name ? t('Choose an icon for {name}', { name }) : t('Choose icon');
    setTip(btn, label);
    btn.setAttribute('aria-label', label);
    if (pick) {
      let c = btn.querySelector('canvas');
      if (!c) {
        btn.textContent = '';
        c = document.createElement('canvas');
        c.width = ICON_PX;
        c.height = ICON_PX;
        btn.appendChild(c);
      }
      paintThumb(c, pick);
    } else if (!btn.querySelector('svg')) {
      btn.innerHTML = ADD;
    }
  }

  function paintIcons() {
    for (const row of listEl.querySelectorAll('.name-row')) paintIcon(row);
  }

  function addRow(value) {
    const row = document.createElement('div');
    row.className = 'name-row';
    if (onIcon) row.classList.add('with-icon');

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = MAX_LEN;
    input.spellcheck = false;
    input.value = value;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'name-del';
    del.tabIndex = -1;
    del.title = t('Remove');
    del.setAttribute('aria-label', t('Remove this name'));
    // Drawn rather than typed: the font's × sits on a text baseline and never
    // lands in the middle of a round button. Same cross as the card's close.
    del.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"'
      + ' fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

    del.addEventListener('click', () => {
      row.remove();
      renumber();
      onChange();
    });

    let icon = null;
    if (onIcon) {
      icon = document.createElement('button');
      icon.type = 'button';
      icon.className = 'name-icon';
      icon.addEventListener('click', () => {
        const name = input.value.trim();
        if (name) onIcon(name);
      });
    }

    input.addEventListener('input', () => {
      paintIcon(row);
      // Typing in the last box opens another, so the list is never a dead end.
      const all = inputs();
      if (input === all[all.length - 1] && input.value.trim() && all.length < MAX_ROWS) {
        addRow('');
        renumber();
      }
      onChange();
    });

    // Pasting a list fans it out across boxes rather than cramming it into one.
    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text') || '';
      const parts = text.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) return;
      e.preventDefault();

      const all = inputs();
      let at = all.indexOf(input);
      for (const part of parts) {
        let target = inputs()[at];
        if (!target) {
          if (inputs().length >= MAX_ROWS) break;
          target = addRow('').querySelector('input');
        }
        target.value = part.slice(0, MAX_LEN);
        at++;
      }
      if (inputs().length < MAX_ROWS) addRow('');
      renumber();
      paintIcons();
      onChange();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const all = inputs();
      const next = all[all.indexOf(input) + 1];
      if (next) next.focus();
      else roster.addAndFocus();
    });

    if (icon) row.append(icon);
    row.append(input, del);
    listEl.appendChild(row);
    if (icon) paintIcon(row);
    return row;
  }

  // The placeholders and remove buttons are written in the page's language.
  onLooksChange(paintIcons);

  onLang(() => {
    renumber();
    paintIcons();
    for (const del of listEl.querySelectorAll('.name-del')) {
      setTip(del, t('Remove'));
      del.setAttribute('aria-label', t('Remove this name'));
    }
  });

  return roster;
}
