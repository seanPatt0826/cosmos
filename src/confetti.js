// Confetti for the end of a race.
//
// A short burst of paper scraps falling over the whole page, on a canvas of
// its own that lets every click through and removes itself when the last
// scrap has fallen. Nothing here touches the arena's canvas or the race.

const COLOURS = ['#E8A33D', '#F2EADB', '#7ED491', '#9BE1FF', '#E0728C', '#C77BD6', '#F2D06B'];

export function confetti({ count = 140, duration = 3200 } = {}) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.setAttribute('aria-hidden', 'true');
  Object.assign(c.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '40',
  });
  document.body.appendChild(c);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);

  // Two cannons, low on each side, firing up and in.
  const bits = Array.from({ length: count }, (_, i) => {
    const left = i % 2 === 0;
    const a = (left ? -Math.PI / 3 : -2 * Math.PI / 3) + (Math.random() - 0.5) * 0.7;
    const v = 9 + Math.random() * 9;
    return {
      x: left ? w * 0.08 : w * 0.92,
      y: h * 0.82,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      s: 6 + Math.random() * 7,
      col: COLOURS[i % COLOURS.length],
      wob: Math.random() * 6,
    };
  });

  const start = performance.now();
  let last = start;
  function frame(now) {
    const dt = Math.min(48, now - last) / 16.667;
    last = now;
    const age = now - start;
    g.clearRect(0, 0, w, h);
    g.globalAlpha = age > duration - 600 ? Math.max(0, (duration - age) / 600) : 1;
    for (const b of bits) {
      b.vy += 0.32 * dt;
      b.vx *= Math.pow(0.985, dt);
      b.vy = Math.min(b.vy, 4.2);
      b.x += (b.vx + Math.sin(age / 220 + b.wob) * 0.6) * dt;
      b.y += b.vy * dt;
      b.r += b.vr * dt;
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.r);
      g.fillStyle = b.col;
      g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2 * (0.4 + 0.6 * Math.abs(Math.cos(age / 140 + b.wob))));
      g.restore();
    }
    if (age < duration) requestAnimationFrame(frame);
    else c.remove();
  }
  requestAnimationFrame(frame);
}
