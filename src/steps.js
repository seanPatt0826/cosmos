// The step-by-step pictures in the "How it works" card.
//
// Three real stills from a real race on the map you are in (taken by
// tools/shoot-steps.js): everyone on the line, somebody going out, and the
// winner. Each comes with one short line, so the card can be read as a strip
// of instructions rather than a paragraph. It walks through the steps on its
// own until somebody picks one, and then stays where they put it.

import { t, onLang } from './i18n.js';
import { isLight } from './theme.js';

const COUNT = 3;
const AUTO_MS = 4200;

export function createSteps() {
  const el = {
    shot: document.getElementById('map-step-shot'),
    label: document.getElementById('map-step-label'),
    text: document.getElementById('map-step-text'),
    prev: document.getElementById('btn-step-prev'),
    next: document.getElementById('btn-step-next'),
    dots: [...document.querySelectorAll('.map-step-dot')],
    card: document.getElementById('map-about'),
  };
  if (!el.shot) return { setMap() {} };

  let mapDef = null;
  let step = 0;
  let timer = null;
  let touched = false;

  // What each step says. The middle one is the map's own rule.
  function lines() {
    const r = (mapDef && mapDef.rules) || {};
    return [
      [t('Line up'), t('Everyone waits on the line. Press Start to go.')],
      [t('Out if'), t(r.out || 'Knocked off the map.')],
      [t('Goal'), t('Last one left wins.')],
    ];
  }

  function src(id, n) {
    return `./assets/steps/${id}-${n}-${isLight() ? 'light' : 'dark'}.webp`;
  }

  function show(n) {
    if (!mapDef) return;
    step = (n + COUNT) % COUNT;
    el.shot.src = src(mapDef.id, step + 1);
    el.shot.alt = t('Step {n} of {total}', { n: step + 1, total: COUNT });
    const [label, text] = lines()[step];
    el.label.textContent = `${step + 1}. ${label}`;
    el.text.textContent = text;
    el.dots.forEach((d, i) => {
      d.classList.toggle('on', i === step);
      if (i === step) d.setAttribute('aria-current', 'step');
      else d.removeAttribute('aria-current');
    });
  }

  // Only turns the page while the card is open and nobody has taken over.
  function schedule() {
    clearInterval(timer);
    if (touched) return;
    timer = setInterval(() => {
      if (!el.card || !el.card.hidden) show(step + 1);
    }, AUTO_MS);
  }

  function pick(n) {
    touched = true;
    clearInterval(timer);
    show(n);
  }

  el.prev.addEventListener('click', () => pick(step - 1));
  el.next.addEventListener('click', () => pick(step + 1));
  el.dots.forEach((d, i) => d.addEventListener('click', () => pick(i)));

  // The pictures come in a dark and a light set; the theme lives on <body>.
  new MutationObserver(() => show(step))
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  onLang(() => show(step));

  return {
    setMap(def) {
      mapDef = def;
      // A new universe starts its walkthrough from the top, playing again.
      touched = false;
      show(0);
      schedule();
      // Fetch the other two now so flipping through never waits on a load.
      for (let n = 2; n <= COUNT; n++) new Image().src = src(def.id, n);
    },
  };
}
