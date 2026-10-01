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

// A four-chord cycle that goes somewhere and comes back, rather than four
// unrelated stacks of notes. Semitones from the root: i, VI, III, VII — minor,
// warm, and it resolves, which is what lets it loop for an hour without
// nagging. The first number of each is its bass note, an octave down.
const CHORDS = [
  { bass: -12, notes: [0, 7, 12, 15, 19] },
  { bass: -4, notes: [-4, 3, 8, 12, 15] },
  { bass: -9, notes: [-9, 3, 7, 10, 15] },
  { bass: -2, notes: [-2, 5, 10, 14, 17] },
];

// How long each chord is held, and how long it takes to hand over. The
// crossfade is deliberately a third of the hold: long enough that no edge is
// audible, short enough that the harmony is unambiguous most of the time.
const CHORD_MS = 16000;
const CROSSFADE = 5.2;

// The gaps between struck notes, in seconds. Free time on purpose — a grid
// would turn the toy into something with a soundtrack.
const NOTE_MIN = 2.0;
const NOTE_MAX = 4.5;
// How often the music-box simply says nothing. Rests are what keep it from
// becoming a jingle; this is the single most important number in the file.
const REST_CHANCE = 0.38;

function midiRatio(semitones) {
  return Math.pow(2, semitones / 12);
}

export function createAudio() {
  const a = {
    ctx: null,
    muted: true,
    master: null,
    padGain: null,
    bellBus: null,
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
    a.padGain.gain.value = 0.17;
    const padFilter = a.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    // Opened up from 900. Down there the pad was muffled rather than warm, and
    // muffled plus a wobbling filter is most of what made it a drone.
    padFilter.frequency.value = 1600;
    padFilter.Q.value = 0.4;
    a.padGain.connect(padFilter);
    padFilter.connect(a.master);

    // A very slow breath on the filter. It used to swing three hundred and
    // twenty hertz at a twentieth of a hertz, which is not breathing, it is a
    // siren; a sixth of that is movement you feel rather than hear.
    const lfo = a.ctx.createOscillator();
    const lfoGain = a.ctx.createGain();
    lfo.frequency.value = 0.035;
    lfoGain.gain.value = 55;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start();

    // The music box has its own path to the master, so the pad's filter never
    // dulls it. Bells want to stay clear.
    a.bellBus = a.ctx.createGain();
    a.bellBus.gain.value = 0.5;
    a.bellBus.connect(a.master);

    playChord(0, a.ctx.currentTime, 0.9);
    return a.ctx;
  }

  // One chord, as a set of voices that fade in, hold, and fade out again.
  //
  // The old pad never stopped: four oscillators ran for the life of the page
  // and their *pitch* was slid from chord to chord. A sliding pitch is the
  // sound of a machine changing its mind, and that slide was the "wirrr".
  // Striking and releasing notes instead is the whole difference between a
  // drone and an instrument.
  function playChord(index, at, gain = 1) {
    const chord = CHORDS[index];
    const voices = [];
    const all = [chord.bass, ...chord.notes];
    for (let i = 0; i < all.length; i++) {
      const osc = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      const isBass = i === 0;
      osc.type = isBass ? 'sine' : 'triangle';
      osc.frequency.value = ROOT * midiRatio(all[i]);
      // A few cents apart, so the voices beat gently against each other rather
      // than phase-locking into one thin tone.
      osc.detune.value = (i - all.length / 2) * 4;
      g.gain.value = 0;
      g.gain.setTargetAtTime((isBass ? 0.42 : 0.17) * gain, at, CROSSFADE * 0.45);
      osc.connect(g);
      g.connect(a.padGain);
      osc.start(at);
      voices.push({ osc, g });
    }
    a.voices.push(...voices);
    return voices;
  }

  function releaseVoices(voices, at) {
    for (const v of voices) {
      v.g.gain.cancelScheduledValues(at);
      v.g.gain.setTargetAtTime(0, at, CROSSFADE * 0.4);
      // Stopped well after the fade has run its course, so nothing clicks.
      v.osc.stop(at + CROSSFADE * 3);
      const i = a.voices.indexOf(v);
      if (i >= 0) a.voices.splice(i, 1);
    }
  }

  // A single struck note: quick on, long off. Nothing else in the file sounds
  // like an instrument being played rather than a synth being held.
  function pluck(semitone, at, level) {
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    const pan = a.ctx.createStereoPanner
      ? a.ctx.createStereoPanner() : null;
    osc.type = 'sine';
    osc.frequency.value = ROOT * midiRatio(semitone);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.6);
    osc.connect(g);
    if (pan) {
      pan.pan.value = (Math.random() - 0.5) * 0.55;
      g.connect(pan);
      pan.connect(a.bellBus);
    } else {
      g.connect(a.bellBus);
    }
    osc.start(at);
    osc.stop(at + 2.8);
  }

  // Hand the harmony over: the voices in place fade out while the next chord
  // fades in underneath them. For a few seconds both are sounding, which is
  // what makes the change feel like weather rather than a switch being thrown.
  function drift() {
    if (!a.ctx || a.muted) return;
    const t = a.ctx.currentTime;
    const old = a.voices.slice();
    a.chordIndex = (a.chordIndex + 1) % CHORDS.length;
    playChord(a.chordIndex, t);
    releaseVoices(old, t);
  }
  setInterval(drift, CHORD_MS);

  // The music box. One note at a time, from the chord that is currently
  // sounding, at an interval that is never the same twice — and often no note
  // at all, because the silences are what keep this from becoming a tune you
  // end up waiting for.
  let noteTimer = null;
  function scheduleNote() {
    clearTimeout(noteTimer);
    const wait = (NOTE_MIN + Math.random() * (NOTE_MAX - NOTE_MIN)) * 1000;
    noteTimer = setTimeout(() => {
      scheduleNote();
      if (!a.ctx || a.muted) return;
      if (Math.random() < REST_CHANCE) return;
      const chord = CHORDS[a.chordIndex];
      const pick = chord.notes[Math.floor(Math.random() * chord.notes.length)];
      // Mostly an octave up, where a small bell belongs; occasionally two, for
      // the one note in a while that catches your attention.
      const octave = Math.random() < 0.22 ? 24 : 12;
      pluck(pick + octave, a.ctx.currentTime + 0.02, 0.09 + Math.random() * 0.05);
    }, wait);
  }
  scheduleNote();

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
