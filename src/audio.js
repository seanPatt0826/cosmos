// Sound, synthesised from nothing.
//
// No files, no licensing, nothing to download — and because it is generated
// live it can respond to the physics in a way a clip never could: every bell is
// pitched by the energy of the collision that caused it.
//
// Muted by default. Browsers block autoplay audio anyway, and a cozy toy that
// starts humming unbidden is the fastest way to get a tab closed.

const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22]; // minor pentatonic, two octaves
const ROOT = 220;

const CHORDS = [
  [0, 7, 15, 19],
  [-2, 5, 12, 17],
  [3, 10, 15, 22],
  [-4, 3, 8, 15],
];

function midiRatio(semitones) {
  return Math.pow(2, semitones / 12);
}

export function createAudio() {
  const a = {
    ctx: null,
    muted: true,
    master: null,
    padGain: null,
    voices: [],
    chordIndex: 0,
    lastBellAt: 0,
    bellCount: 0,
    started: false,
  };

  function ensure() {
    if (a.ctx) return a.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    a.ctx = new AC();

    a.master = a.ctx.createGain();
    a.master.gain.value = 0;

    // A gentle limiter so a pile-up of simultaneous bells never spikes.
    const comp = a.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 22;
    comp.ratio.value = 6;
    comp.attack.value = 0.006;
    comp.release.value = 0.28;

    a.master.connect(comp);
    comp.connect(a.ctx.destination);

    a.padGain = a.ctx.createGain();
    a.padGain.gain.value = 0.22;
    const padFilter = a.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 900;
    padFilter.Q.value = 0.4;
    a.padGain.connect(padFilter);
    padFilter.connect(a.master);

    // A slow wobble on the filter, so the drone breathes instead of sitting.
    const lfo = a.ctx.createOscillator();
    const lfoGain = a.ctx.createGain();
    lfo.frequency.value = 0.045;
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start();

    buildPad();
    return a.ctx;
  }

  function buildPad() {
    const chord = CHORDS[0];
    for (let i = 0; i < chord.length; i++) {
      const osc = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = ROOT * midiRatio(chord[i]);
      // Two cents of detune per voice keeps the pad from sounding synthetic.
      osc.detune.value = (i - 1.5) * 5;
      g.gain.value = i === 0 ? 0.5 : 0.22;
      osc.connect(g);
      g.connect(a.padGain);
      osc.start();
      a.voices.push({ osc, g });
    }
  }

  function drift() {
    if (!a.ctx || a.muted) return;
    a.chordIndex = (a.chordIndex + 1) % CHORDS.length;
    const chord = CHORDS[a.chordIndex];
    const t = a.ctx.currentTime;
    a.voices.forEach((v, i) => {
      // Glide, never jump. A stepped chord change would read as an event.
      v.osc.frequency.setTargetAtTime(ROOT * midiRatio(chord[i % chord.length]), t, 3.5);
    });
  }
  setInterval(drift, 13000);

  a.setMuted = (m) => {
    a.muted = m;
    if (!m) {
      const ctx = ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      a.master.gain.cancelScheduledValues(ctx.currentTime);
      a.master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.2);
    } else if (a.ctx) {
      a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.4);
    }
  };

  // Impact bells. Rate-limited hard: thirty bodies in a pile-up would otherwise
  // produce a wall of noise instead of the occasional pleasing chime.
  a.bell = (energy, pan = 0) => {
    if (a.muted || !a.ctx) return;
    const now = performance.now();
    if (now - a.lastBellAt < 45) return;
    if (now - a.lastBellAt > 500) a.bellCount = 0;
    if (a.bellCount > 7) return;
    a.lastBellAt = now;
    a.bellCount++;

    const e = Math.max(0, Math.min(1, energy));
    const t = a.ctx.currentTime;
    // Harder hits sound lower — the way a bigger bell does.
    const step = SCALE[Math.max(0, Math.min(SCALE.length - 1,
      Math.floor((1 - e) * SCALE.length)))];
    const freq = ROOT * 2 * midiRatio(step);

    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    const p = a.ctx.createStereoPanner ? a.ctx.createStereoPanner() : null;
    osc.type = 'sine';
    osc.frequency.value = freq;
    const vol = 0.05 + e * 0.16;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55 + e * 0.5);
    osc.connect(g);
    if (p) {
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(a.master);
    } else {
      g.connect(a.master);
    }
    osc.start(t);
    osc.stop(t + 1.2);
  };

  // Falling into a black hole: a long glide down, because gravity.
  a.capture = () => {
    if (a.muted || !a.ctx) return;
    const t = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    const filt = a.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(2400, t);
    filt.frequency.exponentialRampToValueAtTime(200, t + 1.1);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(72, t + 1.1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(filt);
    filt.connect(g);
    g.connect(a.master);
    osc.start(t);
    osc.stop(t + 1.3);
  };

  // A softer goodbye for everything that is not a black hole.
  a.poof = () => {
    if (a.muted || !a.ctx) return;
    const t = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g);
    g.connect(a.master);
    osc.start(t);
    osc.stop(t + 0.6);
  };

  // A soft thump rather than a bang. This is still a cozy toy; the explosion
  // should read as "oh!" and not as artillery.
  a.boom = () => {
    if (a.muted || !a.ctx) return;
    const t = a.ctx.currentTime;

    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.34);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g);
    g.connect(a.master);
    osc.start(t);
    osc.stop(t + 0.55);

    // A short filtered noise burst for the crumple.
    const len = Math.floor(a.ctx.sampleRate * 0.3);
    const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    const src = a.ctx.createBufferSource();
    const bp = a.ctx.createBiquadFilter();
    const ng = a.ctx.createGain();
    src.buffer = buf;
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    bp.Q.value = 0.8;
    ng.gain.value = 0.11;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(a.master);
    src.start(t);
  };

  a.win = () => {
    if (a.muted || !a.ctx) return;
    const t = a.ctx.currentTime;
    [0, 7, 12, 19, 24].forEach((s, i) => {
      const osc = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      osc.type = i > 2 ? 'sine' : 'triangle';
      osc.frequency.value = ROOT * midiRatio(s);
      const at = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.13, at + 0.14);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
      osc.connect(g);
      g.connect(a.master);
      osc.start(at);
      osc.stop(at + 2.6);
    });
  };

  a.whoosh = () => {
    if (a.muted || !a.ctx) return;
    const t = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    const filt = a.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(300, t);
    filt.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
    filt.Q.value = 1.6;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(filt);
    filt.connect(g);
    g.connect(a.master);
    osc.start(t);
    osc.stop(t + 0.5);
  };

  return a;
}
