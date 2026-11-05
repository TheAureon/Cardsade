/**
 * Procedural quiz-show soundtrack (Web Audio, no files).
 *
 * Bright, bouncy game-show style: FM marimba and bell plucks, offbeat
 * electric-piano stabs, a round bass, claps, shakers and a woodblock
 * "clock". A song is a chord progression plus a lead melody and a few
 * per-song patterns; a lookahead scheduler queues notes ~120 ms ahead so
 * timing stays tight even while the page animates.
 *
 * Intensity 2 ("danger") turns the battle theme into a countdown: faster,
 * double-time clock ticks, a driving kick and a tension pad that swells.
 * Used when you're low on HP, something is coming at you, or it's the
 * final duel.
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
  /** Bass root as a MIDI note. */
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
  // Jazzy lobby loop: | Cmaj7 Am7 Dm7 G7 | Cmaj7 A7 Dm7 G7 |
  menu: {
    bpm: 122,
    dangerBpm: 122,
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
  // Countdown battle loop: | Am Am F G | Am Am Dm E7 |
  battle: {
    bpm: 128,
    dangerBpm: 144,
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
      [3, 0],
      [6, 12],
      [8, 0],
      [10, 7],
      [11, 0],
      [14, 12],
    ],
    stabs: [3, 6, 11, 14],
  },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- Instruments ----------

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

const marimba = (ac: AudioContext, out: AudioNode, t: number, midi: number, gain = 0.2) => fm(ac, out, t, midi, 0.35, gain, 4, 1.3);
const bell = (ac: AudioContext, out: AudioNode, t: number, midi: number, dur = 0.6, gain = 0.12) => fm(ac, out, t, midi, dur, gain, 3.5, 2.2);

/** Electric piano chord stab (soft FM, 1:1 ratio). */
function stab(ac: AudioContext, out: AudioNode, t: number, notes: number[], dur: number, gain = 0.05) {
  for (const n of notes) fm(ac, out, t, n, dur, gain, 1, 1.4);
}

/** Round plucked bass: sine plus a little triangle through a lowpass. */
function bass(ac: AudioContext, out: AudioNode, t: number, midi: number, dur: number, gain = 0.32) {
  const f = mtof(midi);
  const a = ac.createOscillator();
  const b = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  a.type = 'sine';
  b.type = 'triangle';
  a.frequency.value = f;
  b.frequency.value = f;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, t);
  filter.frequency.exponentialRampToValueAtTime(260, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const bGain = ac.createGain();
  bGain.gain.value = 0.35;
  a.connect(filter);
  b.connect(bGain).connect(filter);
  filter.connect(g).connect(out);
  for (const o of [a, b]) {
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

/** Swelling tension pad: two detuned saws per note, slow filter rise. */
function pad(ac: AudioContext, out: AudioNode, t: number, notes: number[], dur: number) {
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(500, t);
  filter.frequency.exponentialRampToValueAtTime(1800, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.035, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  filter.connect(g).connect(out);
  for (const n of notes) {
    for (const detune of [-8, 8]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(n);
      o.detune.value = detune;
      o.connect(filter);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }
}

function kick(ac: AudioContext, out: AudioNode, t: number, gain = 0.7) {
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

/** Hand clap: a few fast bursts then a short tail. */
function clap(ac: AudioContext, out: AudioNode, t: number, gain = 0.32) {
  for (const d of [0, 0.011, 0.022]) noiseHit(ac, out, t + d, 0.02, gain, 'bandpass', 1500);
  noiseHit(ac, out, t + 0.03, 0.12, gain * 0.7, 'bandpass', 1300);
}

function shaker(ac: AudioContext, out: AudioNode, t: number, gain = 0.05) {
  noiseHit(ac, out, t, 0.04, gain, 'highpass', 6500);
}

/** Woodblock tick: the countdown clock. */
function tickBlock(ac: AudioContext, out: AudioNode, t: number, gain = 0.12, high = false) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(high ? 2100 : 1600, t);
  osc.frequency.exponentialRampToValueAtTime(high ? 1700 : 1300, t + 0.04);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.06);
}

/** Chord tones voiced around middle C for stabs and pads. */
function voicing(chord: Chord): number[] {
  return chord.tones.map((iv) => {
    let n = chord.root + iv;
    while (n < 57) n += 12;
    while (n > 69) n -= 12;
    return n;
  });
}

// ---------- Player ----------

let current: TrackName | null = null;
let desired: TrackName | null = null;
let intensity: Intensity = 1;
let step = 0;
let loop = 0;
let nextTime = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let duck: GainNode | null = null;
let fileEl: HTMLAudioElement | null = null;
let fileKey: string | null = null;

function output(): { ac: AudioContext; out: GainNode } | null {
  const a = getAudio();
  if (!a) return null;
  if (!duck || duck.context !== a.ctx) {
    duck = a.ctx.createGain();
    duck.connect(a.music);
  }
  return { ac: a.ctx, out: duck };
}

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

  // Bass and offbeat piano stabs carry the bounce.
  for (const [at, iv] of song.bass) if (at === pos) bass(ac, out, t, chord.root + iv, sd * 2.2);
  if (song.stabs.includes(pos)) stab(ac, out, t, voicing(chord), sd * 1.6, song.style === 'lobby' ? 0.045 : 0.04);

  // Drums: light four-on-the-floor feel, claps on 2 and 4, shaker 16ths.
  if (pos === 0 || pos === 8 || (hot && (pos === 4 || pos === 12))) kick(ac, out, t, song.style === 'lobby' ? 0.5 : 0.7);
  if (pos === 4 || pos === 12) clap(ac, out, t, song.style === 'lobby' ? 0.22 : 0.3);
  if (lastBar && pos === 14) clap(ac, out, t, 0.2);
  shaker(ac, out, t, pos % 2 === 0 ? 0.05 : 0.03);

  if (song.style === 'battle') {
    // The clock: ticks on every beat, every eighth when the pressure's on.
    if (pos % (hot ? 2 : 4) === 0) tickBlock(ac, out, t, hot ? 0.13 : 0.1, pos % 8 === 0);
    // Tension pad swells across each bar in danger mode.
    if (hot && pos === 0) pad(ac, out, t, voicing(chord), sd * 16);
  }

  // Lead melody: marimba in the lobby, bell in battle. Every other pass
  // the battle lead jumps up an octave on the marimba for variety.
  const hit = song.rhythm.findIndex(([at]) => at === pos);
  if (hit >= 0) {
    const [, len] = song.rhythm[hit];
    const note = song.lead[bar][hit];
    if (song.style === 'lobby') marimba(ac, out, t, note, 0.22);
    else if (loop % 2 === 1) marimba(ac, out, t, note + 12, 0.14);
    else bell(ac, out, t, note, Math.max(0.25, len * sd * 1.4), hot ? 0.13 : 0.11);
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
  o.out.gain.cancelScheduledValues(o.ac.currentTime);
  o.out.gain.setValueAtTime(1, o.ac.currentTime);
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
  o.ac.createMediaElementSource(fileEl).connect(o.out);
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
    const { ac, out } = o;
    const t = ac.currentTime + 0.05;
    if (kind === 'ko') {
      // Duck the loop for a game-show "eliminated" cue: a falling bell triad and a thump.
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0.3, t, 0.03);
      out.gain.setTargetAtTime(1, t + 1.1, 0.25);
      [79, 75, 72, 67].forEach((n, i) => bell(ac, out, t + i * 0.13, n, 0.5, 0.14));
      kick(ac, out, t, 0.8);
      stab(ac, out, t + 0.52, [55, 58, 62], 0.7, 0.06);
      return;
    }
    desired = null;
    current = null;
    stopTimer();
    fileEl?.pause();
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(1, t);
    if (kind === 'win') {
      // Winner reveal: rising bell arpeggio into a bright held maj9 chord with claps.
      [60, 64, 67, 71, 72, 76, 79].forEach((n, i) => marimba(ac, out, t + i * 0.07, n, 0.2));
      stab(ac, out, t + 0.52, [60, 64, 67, 71, 74], 1.8, 0.06);
      bell(ac, out, t + 0.52, 84, 1.6, 0.12);
      bass(ac, out, t + 0.52, 36, 1.6, 0.35);
      kick(ac, out, t + 0.52);
      [0.52, 0.76, 0.88].forEach((d) => clap(ac, out, t + d, 0.25));
    } else {
      // Gentle "better luck next time": falling bells over a soft minor chord.
      [76, 72, 69, 64].forEach((n, i) => bell(ac, out, t + i * 0.26, n, 0.7, 0.11));
      stab(ac, out, t + 1.05, [57, 60, 64], 1.6, 0.05);
      bass(ac, out, t + 1.05, 33, 1.6, 0.3);
    }
  },
};

// Start whatever was requested as soon as the first click unlocks audio.
onUnlock(refresh);
