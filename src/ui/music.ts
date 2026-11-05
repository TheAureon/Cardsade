/**
 * Procedural soundtrack (Web Audio, no files): quiz-show bounce scored like
 * a film trailer.
 *
 * The game-show half: FM marimba and bell leads, offbeat electric-piano
 * stabs, claps and a woodblock "clock". The cinema half: a string section
 * with vibrato, spiccato string ostinatos, brass stabs and a horn line,
 * timpani, war drums and cymbal swells, all in a generated concert-hall
 * reverb and glued with a compressor.
 *
 * A song is a chord progression plus a lead melody and a few per-song
 * patterns; a lookahead scheduler queues notes ~120 ms ahead so timing stays
 * tight even while the page animates.
 *
 * Intensity 2 ("danger") turns the battle theme into a countdown climax:
 * faster, sixteenth-note strings, drums on every beat, double-time clock and
 * a cymbal swell into every other bar. Used when you're low on HP, something
 * is coming at you, or it's the final duel.
 */
import { getAudio, getNoise, isMuted, onUnlock } from './audio';

export type TrackName = 'menu' | 'battle';
export type Intensity = 1 | 2;
export type Sting = 'ko' | 'win' | 'lose';

/**
 * Optional recorded music. Publish audio files next to the page (or bundle
 * them) and list their URLs here; a listed track plays instead of the synth
 * version. `danger` is used for the battle theme at intensity 2.
 */
export const TRACK_FILES: Partial<Record<TrackName | 'danger', string>> = {};

interface Chord {
  /** Bass root as a MIDI note (octave 1–2). */
  root: number;
  /** Chord tones as semitones above the root (7ths welcome). */
  tones: number[];
}

interface Song {
  bpm: number;
  dangerBpm: number;
  chords: Chord[];
  /** One list of MIDI notes per bar, played on `rhythm`. */
  lead: number[][];
  /** [step, length] pairs within a 16-step bar. */
  rhythm: [number, number][];
  /** [step, semitones above root] bass hits within a bar. */
  bass: [number, number][];
  /** Steps where the electric piano stabs the chord. */
  stabs: number[];
  style: 'lobby' | 'battle';
}

const MAJ7 = [0, 4, 7, 11];
const MIN7 = [0, 3, 7, 10];
const DOM7 = [0, 4, 7, 10];
const MINOR = [0, 3, 7];
const MAJOR = [0, 4, 7];

const SONGS: Record<TrackName, Song> = {
  // Lobby: | Cmaj7 Am7 Dm7 G7 | Cmaj7 A7 Dm7 G7 |
  menu: {
    bpm: 116,
    dangerBpm: 116,
    style: 'lobby',
    chords: [
      { root: 36, tones: MAJ7 },
      { root: 33, tones: MIN7 },
      { root: 38, tones: MIN7 },
      { root: 31, tones: DOM7 },
      { root: 36, tones: MAJ7 },
      { root: 33, tones: DOM7 },
      { root: 38, tones: MIN7 },
      { root: 31, tones: DOM7 },
    ],
    rhythm: [
      [0, 2],
      [3, 2],
      [6, 2],
      [8, 1],
      [10, 3],
      [14, 2],
    ],
    lead: [
      [76, 79, 76, 74, 72, 71],
      [72, 76, 72, 69, 67, 69],
      [74, 77, 74, 72, 69, 72],
      [71, 74, 77, 76, 74, 71],
      [79, 83, 79, 76, 74, 76],
      [73, 76, 79, 76, 73, 69],
      [77, 76, 74, 72, 74, 77],
      [79, 77, 74, 71, 67, 71],
    ],
    bass: [
      [0, 0],
      [3, 12],
      [6, 7],
      [8, 0],
      [10, 12],
      [14, 7],
    ],
    stabs: [2, 6, 10, 14],
  },
  // Battle: | Am Am F G | Am Am Dm E7 |
  battle: {
    bpm: 124,
    dangerBpm: 140,
    style: 'battle',
    chords: [
      { root: 33, tones: MINOR },
      { root: 33, tones: MINOR },
      { root: 29, tones: MAJOR },
      { root: 31, tones: MAJOR },
      { root: 33, tones: MINOR },
      { root: 33, tones: MINOR },
      { root: 38, tones: MINOR },
      { root: 28, tones: DOM7 },
    ],
    rhythm: [
      [0, 1],
      [2, 1],
      [3, 2],
      [6, 2],
      [8, 1],
      [10, 1],
      [11, 2],
      [14, 2],
    ],
    lead: [
      [69, 72, 76, 74, 72, 69, 71, 72],
      [76, 74, 72, 71, 69, 71, 72, 74],
      [72, 69, 65, 69, 72, 77, 76, 72],
      [74, 71, 67, 71, 74, 79, 77, 74],
      [81, 79, 76, 79, 81, 76, 74, 72],
      [76, 72, 69, 72, 76, 79, 81, 79],
      [77, 74, 69, 74, 77, 81, 79, 77],
      [76, 80, 83, 80, 76, 74, 71, 68],
    ],
    bass: [
      [0, 0],
      [6, 0],
      [8, 0],
      [14, 0],
    ],
    stabs: [3, 11],
  },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- Instruments ----------

function env(g: GainNode, t: number, attack: number, peak: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return t + attack + hold + release;
}

/** FM pluck: marimba (low ratio, short) through bell (higher ratio, longer). */
function fm(ac: AudioContext, out: AudioNode, t: number, midi: number, dur: number, gain: number, ratio: number, index: number) {
  const f = mtof(midi);
  const car = ac.createOscillator();
  const mod = ac.createOscillator();
  const modGain = ac.createGain();
  const g = ac.createGain();
  car.frequency.value = f;
  mod.frequency.value = f * ratio;
  modGain.gain.setValueAtTime(f * index, t);
  modGain.gain.exponentialRampToValueAtTime(f * 0.05, t + dur * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  mod.connect(modGain).connect(car.frequency);
  car.connect(g).connect(out);
  mod.start(t);
  car.start(t);
  mod.stop(t + dur + 0.02);
  car.stop(t + dur + 0.02);
}

const marimba = (ac: AudioContext, out: AudioNode, t: number, midi: number, gain = 0.2) => fm(ac, out, t, midi, 0.4, gain, 4, 1.3);
const bell = (ac: AudioContext, out: AudioNode, t: number, midi: number, dur = 0.7, gain = 0.12) => fm(ac, out, t, midi, dur, gain, 3.5, 2.2);

/** Electric piano chord stab (soft FM, 1:1 ratio). */
function epStab(ac: AudioContext, out: AudioNode, t: number, notes: number[], dur: number, gain = 0.045) {
  for (const n of notes) fm(ac, out, t, n, dur, gain, 1, 1.4);
}

/** A bank of detuned saws through a lowpass: the raw material for strings and brass. */
function saws(ac: AudioContext, dest: AudioNode, t: number, end: number, midi: number, detunes: number[], vibrato = 0) {
  let lfo: OscillatorNode | null = null;
  let depth: GainNode | null = null;
  if (vibrato) {
    lfo = ac.createOscillator();
    depth = ac.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.value = vibrato;
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(end + 0.05);
  }
  for (const d of detunes) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    o.detune.value = d;
    if (depth) depth.connect(o.detune);
    o.connect(dest);
    o.start(t);
    o.stop(end + 0.05);
  }
}

/** Sustained string section: slow bow attack, vibrato, warm filter. */
function strings(ac: AudioContext, out: AudioNode, t: number, notes: number[], dur: number, gain = 0.03, bright = 1500) {
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(bright * 0.6, t);
  filter.frequency.linearRampToValueAtTime(bright, t + dur * 0.6);
  filter.Q.value = 0.5;
  const end = env(g, t, Math.min(0.5, dur * 0.35), gain, dur * 0.4, Math.max(0.3, dur * 0.4));
  filter.connect(g).connect(out);
  for (const n of notes) saws(ac, filter, t, end, n, [-11, 0, 11], 6);
}

/** Short bowed spiccato note for driving ostinatos. */
function spiccato(ac: AudioContext, out: AudioNode, t: number, midi: number, gain = 0.06) {
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2600, t);
  filter.frequency.exponentialRampToValueAtTime(700, t + 0.12);
  const end = env(g, t, 0.006, gain, 0.02, 0.11);
  filter.connect(g).connect(out);
  saws(ac, filter, t, end, midi, [-7, 7]);
}

/** Brass: the filter opens on the attack ("blat") then settles. */
function brass(ac: AudioContext, out: AudioNode, t: number, notes: number[], dur: number, gain = 0.05, peak = 2600) {
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = 'lowpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(300, t);
  filter.frequency.exponentialRampToValueAtTime(peak, t + 0.07);
  filter.frequency.exponentialRampToValueAtTime(peak * 0.45, t + 0.35);
  const end = env(g, t, 0.03, gain, Math.max(0, dur - 0.2), 0.25);
  filter.connect(g).connect(out);
  for (const n of notes) saws(ac, filter, t, end, n, [-6, 6], 3);
}

/** French-horn melody: brass with a softer attack and darker tone. */
function horn(ac: AudioContext, out: AudioNode, t: number, midi: number, dur: number, gain = 0.06) {
  brass(ac, out, t, [midi], dur, gain, 1300);
}

/** Round plucked bass: sine plus a little triangle through a lowpass. */
function bass(ac: AudioContext, out: AudioNode, t: number, midi: number, dur: number, gain = 0.3) {
  const f = mtof(midi);
  const a = ac.createOscillator();
  const b = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  const bGain = ac.createGain();
  a.type = 'sine';
  b.type = 'triangle';
  a.frequency.value = f;
  b.frequency.value = f;
  bGain.gain.value = 0.35;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(260, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  a.connect(filter);
  b.connect(bGain).connect(filter);
  filter.connect(g).connect(out);
  for (const o of [a, b]) {
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

function noiseHit(ac: AudioContext, out: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
  const src = ac.createBufferSource();
  src.buffer = getNoise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

/** Tuned timpani: a slightly sagging sine plus a felt-mallet thump. */
function timpani(ac: AudioContext, out: AudioNode, t: number, midi: number, gain = 0.45) {
  const f = mtof(midi);
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.setValueAtTime(f * 1.04, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 1.35);
  noiseHit(ac, out, t, 0.08, gain * 0.5, 'lowpass', 400);
}

/** Big low war drum. */
function warDrum(ac: AudioContext, out: AudioNode, t: number, gain = 0.55, pitch = 70) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.setValueAtTime(pitch * 2, t);
  o.frequency.exponentialRampToValueAtTime(pitch, t + 0.12);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.5);
  noiseHit(ac, out, t, 0.12, gain * 0.35, 'lowpass', 800);
}

function kick(ac: AudioContext, out: AudioNode, t: number, gain = 0.55) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.1);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.22);
}

/** Hand clap: a few fast bursts then a short tail. */
function clap(ac: AudioContext, out: AudioNode, t: number, gain = 0.25) {
  for (const d of [0, 0.011, 0.022]) noiseHit(ac, out, t + d, 0.02, gain, 'bandpass', 1500);
  noiseHit(ac, out, t + 0.03, 0.12, gain * 0.7, 'bandpass', 1300);
}

function shaker(ac: AudioContext, out: AudioNode, t: number, gain = 0.04) {
  noiseHit(ac, out, t, 0.04, gain, 'highpass', 6500);
}

/** Woodblock tick: the quiz countdown clock. */
function tickBlock(ac: AudioContext, out: AudioNode, t: number, gain = 0.1, high = false) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.setValueAtTime(high ? 2100 : 1600, t);
  osc.frequency.exponentialRampToValueAtTime(high ? 1700 : 1300, t + 0.04);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.06);
}

/** Crash cymbal. */
function crash(ac: AudioContext, out: AudioNode, t: number, gain = 0.18) {
  noiseHit(ac, out, t, 2.2, gain, 'highpass', 4500);
}

/** Reverse-cymbal swell that peaks exactly at `end`. */
function swell(ac: AudioContext, out: AudioNode, t: number, end: number, gain = 0.14) {
  const src = ac.createBufferSource();
  src.buffer = getNoise(ac);
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(1500, t);
  filter.frequency.exponentialRampToValueAtTime(6000, end);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, end);
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.04);
  src.connect(filter).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(end + 0.06);
}

/** Chord tones voiced in a given register for pads and stabs. */
function voicing(chord: Chord, low = 57, high = 69): number[] {
  return chord.tones.map((iv) => {
    let n = chord.root + iv;
    while (n < low) n += 12;
    while (n > high) n -= 12;
    return n;
  });
}

// ---------- Mix: dry + concert-hall reverb, glued by a compressor ----------

interface Mix {
  ac: AudioContext;
  /** Instruments connect here. */
  out: GainNode;
  /** Gain after the reverb, used for ducking under stings. */
  duck: GainNode;
}

let mix: Mix | null = null;

/** Two seconds-plus of decaying stereo noise: a cheap but convincing hall. */
function hallImpulse(ac: AudioContext, seconds = 2.8): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 3.2) * (i < ac.sampleRate * 0.012 ? i / (ac.sampleRate * 0.012) : 1);
    }
  }
  return buf;
}

function output(): Mix | null {
  const a = getAudio();
  if (!a) return null;
  if (!mix || mix.ac !== a.ctx) {
    const ac = a.ctx;
    const out = ac.createGain();
    const duck = ac.createGain();
    const verb = ac.createConvolver();
    const wet = ac.createGain();
    const comp = ac.createDynamicsCompressor();
    verb.buffer = hallImpulse(ac);
    wet.gain.value = 0.32;
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    out.connect(duck);
    out.connect(verb).connect(wet).connect(duck);
    duck.connect(comp).connect(a.music);
    mix = { ac, out, duck };
  }
  return mix;
}

// ---------- Sequencer ----------

let current: TrackName | null = null;
let desired: TrackName | null = null;
let intensity: Intensity = 1;
let step = 0;
let loop = 0;
let nextTime = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let fileEl: HTMLAudioElement | null = null;
let fileKey: string | null = null;

function stepSeconds(song: Song) {
  return 60 / (intensity === 2 ? song.dangerBpm : song.bpm) / 4;
}

function scheduleStep(ac: AudioContext, out: AudioNode, song: Song, s: number, t: number) {
  const bar = Math.floor(s / 16) % song.chords.length;
  const pos = s % 16;
  const chord = song.chords[bar];
  const sd = stepSeconds(song);
  const hot = intensity === 2 && song.style === 'battle';
  const lastBar = bar === song.chords.length - 1;
  const firstBar = bar === 0;

  // Rhythm section (shared): bass, electric piano bounce, claps, shaker.
  for (const [at, iv] of song.bass) if (at === pos) bass(ac, out, t, chord.root + iv, sd * 2.4);
  if (song.stabs.includes(pos)) epStab(ac, out, t, voicing(chord), sd * 1.6);
  if (pos === 4 || pos === 12) clap(ac, out, t, song.style === 'lobby' ? 0.18 : 0.2);
  shaker(ac, out, t, pos % 2 === 0 ? 0.04 : 0.025);

  if (song.style === 'lobby') {
    // Warm string bed under the bounce; timpani and a swell around the loop point.
    if (pos === 0) strings(ac, out, t, voicing(chord, 55, 67), sd * 16, 0.022, 1300);
    if (pos === 0 || pos === 8) kick(ac, out, t, 0.4);
    if (firstBar && pos === 0) timpani(ac, out, t, chord.root + 12, 0.3);
    if (lastBar && pos === 0) swell(ac, out, t, t + sd * 16, 0.1);
  } else {
    // Cinematic engine room: spiccato ostinato, brass, timpani, war drums.
    const low = chord.root + 12;
    const pattern = [0, 0, 7, 0, 12, 0, 7, 0];
    if (hot || pos % 2 === 0) spiccato(ac, out, t, low + pattern[(hot ? pos : pos / 2) % 8], hot ? 0.065 : 0.055);
    if (pos === 0) {
      strings(ac, out, t, voicing(chord, 52, 64), sd * 16, hot ? 0.03 : 0.02, hot ? 2400 : 1500);
      brass(ac, out, t, voicing(chord, 48, 60), sd * 3, 0.05);
      timpani(ac, out, t, chord.root + 12, 0.42);
    }
    if (pos === 8) timpani(ac, out, t, chord.root + 19, 0.25);
    if (pos === 0 || pos === 8 || (hot && (pos === 4 || pos === 12))) warDrum(ac, out, t, hot ? 0.55 : 0.45);
    // Drum fill and brass pickup into the top of the loop.
    if (lastBar && pos >= 12) warDrum(ac, out, t, 0.3 + (pos - 12) * 0.08, 90 - (pos - 12) * 6);
    if (lastBar && (pos === 12 || pos === 14)) brass(ac, out, t, voicing(chord, 52, 64), sd * 1.5, 0.045);
    if (firstBar && pos === 0 && loop > 0) crash(ac, out, t, 0.14);
    // Swell into the next bar every other bar when the pressure's on.
    if (hot && pos === 0 && bar % 2 === 1) swell(ac, out, t, t + sd * 16, 0.12);
    // The quiz clock keeps ticking over the orchestra.
    if (pos % (hot ? 2 : 4) === 0) tickBlock(ac, out, t, hot ? 0.11 : 0.085, pos % 8 === 0);
  }

  // Lead melody. Lobby: marimba, then bell on the repeat. Battle: bell over
  // the orchestra, then the horns take the tune an octave down.
  const hit = song.rhythm.findIndex(([at]) => at === pos);
  if (hit >= 0) {
    const [, len] = song.rhythm[hit];
    const note = song.lead[bar][hit];
    if (song.style === 'lobby') {
      if (loop % 2 === 0) marimba(ac, out, t, note, 0.2);
      else bell(ac, out, t, note, 0.6, 0.1);
    } else if (loop % 2 === 0) {
      bell(ac, out, t, note, Math.max(0.3, len * sd * 1.5), hot ? 0.12 : 0.1);
    } else {
      horn(ac, out, t, note - 12, Math.max(0.18, len * sd * 0.95), hot ? 0.065 : 0.055);
      marimba(ac, out, t, note + 12, 0.07);
    }
  }
}

function tick() {
  const o = output();
  if (!o) return;
  const { ac, out } = o;
  // After the tab was in the background, skip ahead instead of bursting notes.
  if (nextTime < ac.currentTime - 0.2) nextTime = ac.currentTime + 0.05;
  while (nextTime < ac.currentTime + 0.12) {
    // Track changes land on a beat so they sound intentional but don't lag.
    if (desired !== current && (current === null || step % 4 === 0)) {
      current = desired;
      step = 0;
      loop = 0;
      if (!current) return stopTimer();
    }
    if (!current) return stopTimer();
    const song = SONGS[current];
    if (!isMuted('music')) scheduleStep(ac, out, song, step, nextTime);
    nextTime += stepSeconds(song);
    step++;
    if (step % (16 * song.chords.length) === 0) loop++;
  }
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startTimer() {
  const o = output();
  if (!o || timer) return;
  nextTime = o.ac.currentTime + 0.06;
  o.duck.gain.cancelScheduledValues(o.ac.currentTime);
  o.duck.gain.setValueAtTime(1, o.ac.currentTime);
  timer = setInterval(tick, 25);
  tick();
}

/** Plays a recorded file instead of the synth when one is configured. */
function syncFile(): boolean {
  const key = desired ? (desired === 'battle' && intensity === 2 && TRACK_FILES.danger ? 'danger' : desired) : null;
  const url = key ? TRACK_FILES[key as keyof typeof TRACK_FILES] : undefined;
  if (key === fileKey && (url ? fileEl : true)) return Boolean(url);
  fileEl?.pause();
  fileEl = null;
  fileKey = key;
  const o = output();
  if (!url || !o) return false;
  fileEl = new Audio(url);
  fileEl.loop = true;
  o.ac.createMediaElementSource(fileEl).connect(o.duck);
  void fileEl.play().catch(() => undefined);
  return true;
}

function refresh() {
  if (!getAudio()) return;
  if (syncFile()) {
    current = null;
    stopTimer();
    return;
  }
  if (desired) startTimer();
}

export const music = {
  play(track: TrackName | null) {
    if (desired === track) return;
    desired = track;
    refresh();
  },
  setIntensity(level: Intensity) {
    if (intensity === level) return;
    intensity = level;
    refresh();
  },
  /** Short musical hits for big moments. Win and lose end the battle theme. */
  sting(kind: Sting) {
    const o = output();
    if (!o || isMuted('music')) {
      if (kind !== 'ko') desired = null;
      return;
    }
    const { ac, out, duck } = o;
    const t = ac.currentTime + 0.05;
    if (kind === 'ko') {
      // Duck the loop under a trailer hit: timpani, low brass, crash, falling bells.
      duck.gain.cancelScheduledValues(t);
      duck.gain.setTargetAtTime(0.3, t, 0.03);
      duck.gain.setTargetAtTime(1, t + 1.4, 0.3);
      timpani(ac, out, t, 33, 0.6);
      warDrum(ac, out, t, 0.6, 55);
      brass(ac, out, t, [45, 52, 57], 1.1, 0.07, 1800);
      crash(ac, out, t, 0.16);
      [79, 75, 72, 67].forEach((n, i) => bell(ac, out, t + 0.15 + i * 0.12, n, 0.6, 0.09));
      return;
    }
    desired = null;
    current = null;
    stopTimer();
    fileEl?.pause();
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(1, t);
    if (kind === 'win') {
      // Winner reveal: timpani roll and swell, then a brass fanfare chord with strings, crash and claps.
      for (let i = 0; i < 8; i++) timpani(ac, out, t + i * 0.06, 36, 0.12 + i * 0.03);
      swell(ac, out, t, t + 0.55, 0.14);
      [60, 64, 67, 72].forEach((n, i) => marimba(ac, out, t + i * 0.09, n + 12, 0.16));
      const hit = t + 0.55;
      brass(ac, out, hit, [48, 55, 60, 64, 67], 2.2, 0.06, 3000);
      strings(ac, out, hit, [72, 76, 79, 83], 2.6, 0.03, 3000);
      bell(ac, out, hit, 84, 1.8, 0.11);
      timpani(ac, out, hit, 36, 0.55);
      bass(ac, out, hit, 36, 2, 0.32);
      crash(ac, out, hit, 0.2);
      [0, 0.24, 0.36].forEach((d) => clap(ac, out, hit + d, 0.2));
    } else {
      // Defeat: low strings and a soft horn fall over a distant timpani.
      strings(ac, out, t, [45, 52, 57, 60], 3, 0.03, 900);
      [69, 67, 64, 60].forEach((n, i) => horn(ac, out, t + i * 0.42, n - 12, 0.5, 0.05));
      timpani(ac, out, t, 33, 0.3);
      timpani(ac, out, t + 1.7, 28, 0.35);
    }
  },
};

// Start whatever was requested as soon as the first click unlocks audio.
onUnlock(refresh);
