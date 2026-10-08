// Tooltips, drawn like the rest of the page.
//
// The browser's own title popup is a grey system box that ignores the theme
// and looks pasted on top of a hand-drawn page. This takes over every element
// with a title: the text moves into data-tip (so the native popup never
// appears) and is shown in one shared panel styled like the description card.

const DELAY_MS = 380;
const GAP = 9;
const MARGIN = 8;

export function installTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);

  let target = null;
  let timer = null;

  function find(el) {
    const t = el && el.closest ? el.closest('[title], [data-tip]') : null;
    if (!t) return null;
    // Adopt the title the first time it is seen, wherever it came from:
    // static markup or a button built later by script.
    if (t.hasAttribute('title')) {
      const text = t.getAttribute('title');
      t.removeAttribute('title');
      if (text) t.dataset.tip = text;
    }
    return t.dataset.tip ? t : null;
  }

  function place() {
    if (!target || !target.isConnected) return hide();
    const r = target.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(MARGIN, Math.min(window.innerWidth - w - MARGIN, x));
    // Above by default; below when the element sits at the top of the screen.
    let y = r.top - h - GAP;
    if (y < MARGIN) y = r.bottom + GAP;
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y)}px`;
  }

  function show(t) {
    target = t;
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
    tip.classList.remove('on');
    place();
    // Next frame, so the fade starts from the placed position.
    requestAnimationFrame(() => tip.classList.add('on'));
  }

  function hide() {
    clearTimeout(timer);
    target = null;
    tip.classList.remove('on');
    tip.hidden = true;
  }

  document.addEventListener('pointerover', (ev) => {
    // A tap is not a hover; on touch the popup would only get in the way.
    if (ev.pointerType === 'touch') return;
    const t = find(ev.target);
    if (t === target) return;
    clearTimeout(timer);
    if (!t) return hide();
    // Moving straight from one tooltip to the next shows it at once.
    if (target) show(t);
    else timer = setTimeout(() => show(t), DELAY_MS);
  });

  document.addEventListener('pointerout', (ev) => {
    if (ev.relatedTarget && find(ev.relatedTarget)) return;
    hide();
  });

  // Keyboard users get the same hint on focus.
  document.addEventListener('focusin', (ev) => {
    const t = find(ev.target);
    if (t && ev.target.matches(':focus-visible')) show(t);
  });
  document.addEventListener('focusout', hide);

  for (const ev of ['pointerdown', 'scroll', 'keydown']) {
    window.addEventListener(ev, hide, { capture: true, passive: true });
  }
  window.addEventListener('resize', hide);
}
