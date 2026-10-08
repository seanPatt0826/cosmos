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

const MIN_ROWS = 8;
const MAX_ROWS = 40;
const MAX_LEN = 22;

export function createRoster(listEl, onChange) {
  const roster = {
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
      input.placeholder = `Name ${i + 1}`;
    });
    // Every box gone: say so, rather than leaving an empty hole in the panel.
    let empty = listEl.querySelector('.name-empty');
    if (inputs().length) {
      if (empty) empty.remove();
    } else if (!empty) {
      empty = document.createElement('p');
      empty.className = 'name-empty';
      empty.textContent = 'waiting for names';
      listEl.appendChild(empty);
    }
  }

  function addRow(value) {
    const row = document.createElement('div');
    row.className = 'name-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = MAX_LEN;
    input.spellcheck = false;
    input.value = value;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'name-del';
    del.tabIndex = -1;
    del.title = 'Remove';
    del.setAttribute('aria-label', 'Remove this name');
    // Drawn rather than typed: the font's × sits on a text baseline and never
    // lands in the middle of a round button. Same cross as the card's close.
    del.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"'
      + ' fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

    del.addEventListener('click', () => {
      row.remove();
      renumber();
      onChange();
    });

    input.addEventListener('input', () => {
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

    row.append(input, del);
    listEl.appendChild(row);
    return row;
  }

  return roster;
}
