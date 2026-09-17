// Light and dark.
//
// The objects themselves never change: a scrap of paper with crayon on it and a
// graphite outline reads correctly on a dark ground *and* on a light one, which
// is the one piece of luck in this art direction. So switching themes never
// re-bakes a sprite — only the background, the glow and the page chrome move.
//
// Glow is the part that cannot simply carry over. Additive light on a pale
// ground turns every object into a grey smudge, so in light mode the halo
// becomes a soft coloured pencil shadow instead.

export const THEME = { mode: 'dark' };

export function setMode(m) {
  THEME.mode = m === 'light' ? 'light' : 'dark';
}

export function isLight() {
  return THEME.mode === 'light';
}
