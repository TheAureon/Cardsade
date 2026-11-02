/**
 * Procedural chiptune soundtrack (Web Audio, no files).
 *
 * A song is a chord progression plus a lead melody; bass, arpeggio and drums
 * are generated from the chords. A lookahead scheduler queues notes ~120 ms
 * ahead so timing stays tight even when the page is busy animating.
 *
 * Intensity 2 ("danger") speeds the battle theme up, doubles the hats and
 * drives the kick: used when you're low on HP, something is coming at you,
 * or it's down to the final duel.
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
  /** Chord tones as semitones above the root. */
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
  style: 'battle' | 'menu';
}

const MINOR = [0, 3, 7];
const MAJOR = [0, 4, 7];

const SONGS: Record<TrackName, Song> = {
  battle: {
    bpm: 138,
    dangerBpm: 158,
    style: 'battle',
    // Am F C G | Am F G E
    chords: [
      { root: 45, tones: MINOR },
      { root: 41, tones: MAJOR },
      { root: 48, tones: MAJOR },
      { root: 43, tones: MAJOR },
      { root: 45, tones: MINOR },
      { root: 41, tones: MAJOR },
      { root: 43, tones: MAJOR },
      { root: 40, tones: MAJOR },
    ],
    rhythm: [
      [0, 3],
      [3, 3],
      [6, 2],
      [8, 4],
      [12, 2],
      [14, 2],
    ],
    lead: [
      [69, 72, 76, 74, 72, 71],
      [72, 69, 65, 69, 72, 74],
      [76, 74, 72, 67, 72, 76],
      [74, 71, 67, 71, 74, 79],
      [81, 79, 76, 72, 76, 79],
      [77, 76, 72, 69, 72, 77],
      [79, 77, 74, 71, 74, 79],
      [76, 80, 83, 80, 76, 71],
    ],
  },
  menu: {
    bpm: 96,
    dangerBpm: 96,
    style: 'menu',
    // C Am F G
    chords: [
      { root: 48, tones: MAJOR },
      { root: 45, tones: MINOR },
      { root: 41, tones: MAJOR },
      { root: 43, tones: MAJOR },
    ],
    rhythm: [
      [0, 4],
      [4, 4],
      [8, 6],
      [14, 2],
    ],
    lead: [
      [72, 76, 79, 77],
      [76, 72, 69, 71],
      [72, 77, 81, 79],
      [79, 74, 71, 74],
    ],
  },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- Instruments ----------

function voice(
  ac: AudioContext,
  out: AudioNode,
  t: number,
  midi: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  cutoff = 4000,
) {
  const osc = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(mtof(midi), t);
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.setValueAtTime(gain, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(filter).connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function kick(ac: AudioContext, out: AudioNode, t: number, gain = 0.9) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.25);
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

function snare(ac: AudioContext, out: AudioNode, t: number, gain = 0.5) {
  noiseHit(ac, out, t, 0.14, gain, 'bandpass', 1900);
  voice(ac, out, t, 55, 0.08, 'triangle', gain * 0.5, 2000);
}

function hat(ac: AudioContext, out: AudioNode, t: number, gain = 0.16) {
  noiseHit(ac, out, t, 0.035, gain, 'highpass', 7500);
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

  if (song.style === 'battle') {
    // Bass: driving eighths with octave jumps.
    if (pos % 2 === 0) {
      const off = [0, 0, 12, 0, 0, 12, 7, 12][pos / 2];
      voice(ac, out, t, chord.root + off, sd * 1.7, 'square', 0.16, hot ? 900 : 650);
    }
    // Arpeggio: sixteenths through the chord, brighter when hot.
    const arp = chord.tones[[0, 1, 2, 1][pos % 4]] + chord.root + 24;
    voice(ac, out, t, arp, sd * 0.9, 'square', hot ? 0.06 : 0.04, hot ? 3200 : 1800);
    // Drums, with a snare roll into the loop.
    if (pos === 0 || pos === 8 || (hot && (pos === 3 || pos === 11))) kick(ac, out, t);
    if (pos === 4 || pos === 12) snare(ac, out, t);
    else if (lastBar && pos >= 13) snare(ac, out, t, 0.25 + (pos - 13) * 0.08);
    if (hot || pos % 2 === 0) hat(ac, out, t, pos % 4 === 2 ? 0.2 : 0.12);
  } else {
    if (pos === 0 || pos === 8) voice(ac, out, t, chord.root, sd * 7, 'triangle', 0.22, 900);
    if (pos % 2 === 0) {
      const arp = chord.tones[[0, 1, 2, 1, 2, 0, 1, 2][pos / 2]] + chord.root + 24;
      voice(ac, out, t, arp, sd * 1.8, 'triangle', 0.07, 2500);
    }
    if (pos % 4 === 2) hat(ac, out, t, 0.06);
  }

  // Lead melody; every other time round it drops an octave for variety.
  const hit = song.rhythm.findIndex(([at]) => at === pos);
  if (hit >= 0) {
    const [, len] = song.rhythm[hit];
    const note = song.lead[bar][hit] - (loop % 2 === 1 ? 12 : 0);
    if (song.style === 'battle') voice(ac, out, t, note, len * sd * 0.92, loop % 2 ? 'sawtooth' : 'square', 0.09, hot ? 4200 : 2800);
    else voice(ac, out, t, note, len * sd * 0.95, 'triangle', 0.13, 3000);
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
      // Duck the loop and hit three falling power chords: dun, dun, DUN.
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0.3, t, 0.03);
      out.gain.setTargetAtTime(1, t + 1.1, 0.25);
      [43, 41, 40].forEach((root, i) => {
        const at = t + i * 0.22;
        const len = i === 2 ? 0.9 : 0.18;
        for (const iv of [0, 7, 12]) voice(ac, out, at, root + iv, len, 'sawtooth', 0.12, 1400);
        kick(ac, out, at, 0.8);
      });
      return;
    }
    desired = null;
    current = null;
    stopTimer();
    fileEl?.pause();
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(1, t);
    if (kind === 'win') {
      // Fast rising arpeggio into a held major chord.
      [60, 64, 67, 72, 76, 79].forEach((n, i) => voice(ac, out, t + i * 0.09, n, 0.16, 'square', 0.12, 3500));
      for (const n of [72, 76, 79, 84]) voice(ac, out, t + 0.6, n, 1.6, 'square', 0.08, 3000);
      voice(ac, out, t + 0.6, 48, 1.6, 'triangle', 0.25, 900);
      kick(ac, out, t + 0.6);
      snare(ac, out, t + 0.6, 0.4);
    } else {
      // Slow falling minor line over a low drone.
      [67, 63, 60, 55].forEach((n, i) => voice(ac, out, t + i * 0.32, n, 0.5, 'triangle', 0.16, 2000));
      voice(ac, out, t, 36, 1.8, 'sawtooth', 0.08, 300);
    }
  },
};

// Start whatever was requested as soon as the first click unlocks audio.
onUnlock(refresh);
