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
 * faster, doubled sixteenth-note strings, offbeat drum hits and rolls,
 * a sixteenth-note clock and a cymbal swell into every bar. Used when you're low on HP, something
 * is coming at you, or it's the final duel.
 */
import { getAudio, isMuted, onUnlock } from './audio';
import {
  bass,
  bell,
  braaam,
  brass,
  clap,
  crash,
  epStab,
  hallImpulse,
  horn,
  kick,
  marimba,
  shaker,
  spiccato,
  strings,
  swell,
  tickBlock,
  timpani,
  warDrum,
} from './instruments';

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
    bpm: 126,
    dangerBpm: 126,
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
    bpm: 136,
    dangerBpm: 152,
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
      [2, 12],
      [4, 0],
      [6, 12],
      [8, 0],
      [10, 12],
      [12, 0],
      [14, 12],
    ],
    stabs: [3, 11],
  },
};

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
    wet.gain.value = 0.24;
    comp.threshold.value = -20;
    comp.ratio.value = 4.5;
    comp.attack.value = 0.005;
    comp.release.value = 0.18;
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
    if (pos === 0) strings(ac, out, t, voicing(chord, 55, 67), sd * 16, 0.026, 1700);
    // Four on the floor and a pulsing string eighth keep the lobby moving.
    if (pos % 4 === 0) kick(ac, out, t, 0.5);
    if (pos % 2 === 0) spiccato(ac, out, t, chord.root + 24 + (pos % 4 === 2 ? 7 : 0), 0.035);
    if (pos === 0) timpani(ac, out, t, chord.root + 12, firstBar ? 0.38 : 0.22);
    if (lastBar && pos >= 12) timpani(ac, out, t, chord.root + 12, 0.18 + (pos - 12) * 0.05);
    if (lastBar && pos === 0) swell(ac, out, t, t + sd * 16, 0.12);
    if (firstBar && pos === 0 && loop > 0) crash(ac, out, t, 0.12);
  } else {
    // Cinematic engine room: spiccato ostinato, brass, timpani, war drums.
    const low = chord.root + 12;
    // Relentless sixteenth-note strings, accented on the beat, doubled an octave up when hot.
    const pattern = [0, 0, 12, 0, 7, 0, 12, 7, 0, 0, 12, 0, 7, 12, 7, 0];
    const accent = pos % 4 === 0 ? 1.3 : 1;
    spiccato(ac, out, t, low + pattern[pos], (hot ? 0.07 : 0.06) * accent);
    if (hot && pos % 2 === 0) spiccato(ac, out, t, low + 12 + pattern[pos], 0.04);
    if (pos === 0) {
      strings(ac, out, t, voicing(chord, 52, 64), sd * 16, hot ? 0.034 : 0.026, hot ? 2800 : 2000);
      timpani(ac, out, t, chord.root + 12, 0.48);
    }
    // Brass punches on beats 1 and 3, a BRAAAM to open every four bars.
    if (pos === 0 || pos === 8) brass(ac, out, t, voicing(chord, 48, 60), sd * (pos === 0 ? 3 : 2), pos === 0 ? 0.06 : 0.045);
    if (pos === 0 && bar % 4 === 0) braaam(ac, out, t, chord.root + 12, sd * 10, hot ? 0.08 : 0.065);
    if (pos === 8) timpani(ac, out, t, chord.root + 19, 0.3);
    // Drums on every beat, extra hits on the offbeats when hot.
    if (pos % 4 === 0) warDrum(ac, out, t, hot ? 0.6 : 0.5);
    if (pos % 4 === 0) kick(ac, out, t, 0.45);
    if (hot && (pos === 6 || pos === 14)) warDrum(ac, out, t, 0.35, 95);
    if (pos === 4 || pos === 12) clap(ac, out, t, 0.28);
    // Drum fill and brass pickup into the top of the loop; a roll every other bar when hot.
    if ((lastBar || (hot && bar % 2 === 1)) && pos >= 12) warDrum(ac, out, t, 0.32 + (pos - 12) * 0.08, 90 - (pos - 12) * 6);
    if (lastBar && (pos === 12 || pos === 14)) brass(ac, out, t, voicing(chord, 52, 64), sd * 1.5, 0.05);
    if (pos === 0 && (bar % 4 === 0 || hot) && (loop > 0 || bar > 0)) crash(ac, out, t, bar % 4 === 0 ? 0.15 : 0.09);
    // Swell into the next bar every other bar, every bar when hot.
    if (pos === 0 && (hot || bar % 2 === 1)) swell(ac, out, t, t + sd * 16, hot ? 0.14 : 0.1);
    // The quiz clock keeps ticking over the orchestra.
    if (pos % (hot ? 1 : 2) === 0) tickBlock(ac, out, t, (hot ? 0.1 : 0.085) * (pos % 4 === 0 ? 1.2 : 0.8), pos % 8 === 0);
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
      bell(ac, out, t, note, Math.max(0.3, len * sd * 1.5), hot ? 0.14 : 0.12);
    } else {
      horn(ac, out, t, note - 12, Math.max(0.18, len * sd * 0.95), hot ? 0.075 : 0.065);
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
  /** Pull the music down under a cutscene for `ms`, then bring it back. */
  duck(ms: number, level = 0.35) {
    const o = output();
    if (!o) return;
    const t = o.ac.currentTime;
    o.duck.gain.cancelScheduledValues(t);
    o.duck.gain.setTargetAtTime(level, t, 0.05);
    o.duck.gain.setTargetAtTime(1, t + ms / 1000, 0.25);
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
