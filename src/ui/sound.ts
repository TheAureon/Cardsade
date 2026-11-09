/**
 * Sound effects, played on the same instruments as the soundtrack (see
 * instruments.ts) so the game sounds like one score: marimba and bells for
 * interface feedback, brass, timpani and war drums for the hits, strings and
 * cymbal swells for motion, the woodblock clock for warnings. They run
 * through their own room reverb and compressor on the effects bus.
 *
 * Every call is a no-op when effects are muted or before the first user
 * gesture.
 */
import { getAudio, isMuted } from './audio';
import {
  bell,
  brass,
  braaam,
  crash,
  fm,
  hallImpulse,
  horn,
  marimba,
  noiseHit,
  shaker,
  spiccato,
  strings,
  swell,
  tickBlock,
  timpani,
  warDrum,
} from './instruments';

let mix: { ac: AudioContext; out: GainNode } | null = null;

/** Effects bus: a shorter, drier room than the music, then a compressor. */
function ready(): { ac: AudioContext; out: GainNode; t: number } | null {
  const a = getAudio();
  if (!a || isMuted('sfx')) return null;
  if (!mix || mix.ac !== a.ctx) {
    const ac = a.ctx;
    const out = ac.createGain();
    const verb = ac.createConvolver();
    const wet = ac.createGain();
    const comp = ac.createDynamicsCompressor();
    verb.buffer = hallImpulse(ac, 1.6);
    wet.gain.value = 0.2;
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    out.gain.value = 1.6;
    out.connect(comp);
    out.connect(verb).connect(wet).connect(comp);
    comp.connect(a.sfx);
    mix = { ac, out };
  }
  return { ...mix, t: mix.ac.currentTime + 0.01 };
}

/** A minor pentatonic, climbing: each selected card rings one step higher. */
const COMBO = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];

/** An inharmonic metal ping for shields (FM at a non-integer ratio). */
const clang = (ac: AudioContext, out: AudioNode, t: number, midi: number, gain = 0.12) => fm(ac, out, t, midi, 0.9, gain, 2.76, 3.2);

export const sfx = {
  /** Selecting cards climbs a scale, so building a combo sounds like it. */
  select(step: number) {
    const r = ready();
    if (!r) return;
    const n = COMBO[Math.min(step, COMBO.length - 1)];
    marimba(r.ac, r.out, r.t, n, 0.24);
    if (step >= 3) bell(r.ac, r.out, r.t, n + 12, 0.4, 0.05 + Math.min(step, 8) * 0.008);
  },
  deselect() {
    const r = ready();
    if (!r) return;
    marimba(r.ac, r.out, r.t, 67, 0.16);
    marimba(r.ac, r.out, r.t + 0.07, 62, 0.13);
  },
  /** An attack is thrown: a quick swell and a rising string flick. */
  whoosh() {
    const r = ready();
    if (!r) return;
    swell(r.ac, r.out, r.t, r.t + 0.28, 0.2);
    [45, 52, 57, 64].forEach((n, i) => spiccato(r.ac, r.out, r.t + i * 0.045, n, 0.07));
  },
  /** Damage lands: war drum and timpani, brass and a crash as it gets bigger. */
  hit(amount: number) {
    const r = ready();
    if (!r) return;
    const big = Math.min(1, amount / 40);
    warDrum(r.ac, r.out, r.t, 0.55 + big * 0.25, 80 - big * 25);
    timpani(r.ac, r.out, r.t, 40 - Math.round(big * 7), 0.4 + big * 0.25);
    noiseHit(r.ac, r.out, r.t, 0.12, 0.3 + big * 0.2, 'bandpass', 1800);
    if (amount >= 15) brass(r.ac, r.out, r.t, [40, 47, 52], 0.35 + big * 0.4, 0.05 + big * 0.03, 2200);
    if (amount >= 25) crash(r.ac, r.out, r.t, 0.12 + big * 0.08);
  },
  /** A shield ring: metal clang, a bright bell and a muted timpani. */
  block() {
    const r = ready();
    if (!r) return;
    clang(r.ac, r.out, r.t, 84, 0.14);
    clang(r.ac, r.out, r.t + 0.01, 91, 0.08);
    bell(r.ac, r.out, r.t + 0.02, 96, 0.8, 0.06);
    timpani(r.ac, r.out, r.t, 45, 0.25);
    noiseHit(r.ac, r.out, r.t, 0.06, 0.25, 'highpass', 5000);
  },
  /** Reverse: strings run up and snap back down, with a brass punch. */
  reverse() {
    const r = ready();
    if (!r) return;
    [57, 60, 64, 69, 72].forEach((n, i) => spiccato(r.ac, r.out, r.t + i * 0.035, n, 0.07));
    [72, 67, 64].forEach((n, i) => marimba(r.ac, r.out, r.t + 0.19 + i * 0.05, n, 0.18));
    brass(r.ac, r.out, r.t + 0.18, [52, 59, 64], 0.3, 0.06, 2600);
  },
  /** Skip: two falling marimba notes cut off by the clock. */
  skip() {
    const r = ready();
    if (!r) return;
    marimba(r.ac, r.out, r.t, 76, 0.2);
    marimba(r.ac, r.out, r.t + 0.08, 70, 0.2);
    tickBlock(r.ac, r.out, r.t + 0.17, 0.16, true);
    tickBlock(r.ac, r.out, r.t + 0.23, 0.12);
  },
  /** Action cards: a quick magical bell figure over a shimmer. */
  zap() {
    const r = ready();
    if (!r) return;
    [76, 80, 83, 88].forEach((n, i) => bell(r.ac, r.out, r.t + i * 0.04, n, 0.5, 0.07));
    shaker(r.ac, r.out, r.t, 0.08);
    swell(r.ac, r.out, r.t, r.t + 0.15, 0.08);
  },
  /** Drawing: two soft marimba notes and a card flick. */
  draw() {
    const r = ready();
    if (!r) return;
    marimba(r.ac, r.out, r.t, 72, 0.16);
    marimba(r.ac, r.out, r.t + 0.07, 79, 0.16);
    noiseHit(r.ac, r.out, r.t, 0.05, 0.1, 'highpass', 3500);
  },
  /** Your turn: a short brass fanfare over timpani. */
  yourTurn() {
    const r = ready();
    if (!r) return;
    [60, 64, 67].forEach((n, i) => horn(r.ac, r.out, r.t + i * 0.09, n, 0.14, 0.06));
    brass(r.ac, r.out, r.t + 0.27, [60, 64, 67, 72], 0.55, 0.055, 2800);
    timpani(r.ac, r.out, r.t + 0.27, 36, 0.35);
    bell(r.ac, r.out, r.t + 0.27, 84, 0.7, 0.07);
  },
  /** Incoming: a low brass warning and the clock double-ticking. */
  incoming() {
    const r = ready();
    if (!r) return;
    brass(r.ac, r.out, r.t, [40, 46], 0.18, 0.06, 1600);
    brass(r.ac, r.out, r.t + 0.2, [40, 46], 0.3, 0.07, 1800);
    warDrum(r.ac, r.out, r.t, 0.45);
    warDrum(r.ac, r.out, r.t + 0.2, 0.5);
    tickBlock(r.ac, r.out, r.t, 0.15, true);
    tickBlock(r.ac, r.out, r.t + 0.1, 0.15, true);
  },
  /** Knock-out: a trailer BRAAAM with timpani and a crash. */
  ko() {
    const r = ready();
    if (!r) return;
    braaam(r.ac, r.out, r.t, 33, 1.1, 0.08);
    timpani(r.ac, r.out, r.t, 33, 0.6);
    crash(r.ac, r.out, r.t, 0.18);
  },
  /** Victory (used when music is off): brass fanfare, strings and bells. */
  win() {
    const r = ready();
    if (!r) return;
    for (let i = 0; i < 6; i++) timpani(r.ac, r.out, r.t + i * 0.06, 36, 0.12 + i * 0.04);
    const hit = r.t + 0.4;
    brass(r.ac, r.out, hit, [48, 55, 60, 64, 67], 1.8, 0.06, 3000);
    strings(r.ac, r.out, hit, [72, 76, 79], 2.2, 0.03, 3000);
    [72, 76, 79, 84].forEach((n, i) => bell(r.ac, r.out, hit + i * 0.08, n, 1, 0.08));
    crash(r.ac, r.out, hit, 0.18);
  },
  /** Defeat (used when music is off): a falling horn over low strings. */
  lose() {
    const r = ready();
    if (!r) return;
    strings(r.ac, r.out, r.t, [45, 52, 57], 2.4, 0.03, 900);
    [57, 55, 52, 48].forEach((n, i) => horn(r.ac, r.out, r.t + i * 0.36, n, 0.45, 0.05));
    timpani(r.ac, r.out, r.t + 1.4, 28, 0.35);
  },
  /** A fighter panel crashing onto the title screen: drum, brass stab, cymbal tick. */
  slam(step: number) {
    const r = ready();
    if (!r) return;
    warDrum(r.ac, r.out, r.t, 0.55, 70 + step * 6);
    brass(r.ac, r.out, r.t, [40 + step * 2, 47 + step * 2], 0.22, 0.05, 2000 + step * 200);
    noiseHit(r.ac, r.out, r.t, 0.25, 0.1, 'highpass', 6000);
  },
  /** The logo landing: BRAAAM, timpani, crash and a bright bell chord. */
  logo() {
    const r = ready();
    if (!r) return;
    braaam(r.ac, r.out, r.t, 33, 1.4, 0.09);
    timpani(r.ac, r.out, r.t, 33, 0.65);
    crash(r.ac, r.out, r.t, 0.22);
    [76, 81, 84, 88].forEach((n) => bell(r.ac, r.out, r.t + 0.05, n, 1.4, 0.06));
  },
  /** Press start: a cymbal swell into a brass chord and timpani. */
  start() {
    const r = ready();
    if (!r) return;
    swell(r.ac, r.out, r.t, r.t + 0.3, 0.2);
    [57, 64, 69, 76].forEach((n, i) => spiccato(r.ac, r.out, r.t + i * 0.06, n, 0.06));
    brass(r.ac, r.out, r.t + 0.3, [45, 52, 57, 61, 64], 0.8, 0.06, 3000);
    timpani(r.ac, r.out, r.t + 0.3, 33, 0.55);
    crash(r.ac, r.out, r.t + 0.3, 0.16);
  },
  /** Cutscene: a cut-in band slashing across the screen. */
  cutIn() {
    const r = ready();
    if (!r) return;
    swell(r.ac, r.out, r.t, r.t + 0.16, 0.22);
    noiseHit(r.ac, r.out, r.t + 0.16, 0.18, 0.3, 'highpass', 2500);
    brass(r.ac, r.out, r.t + 0.16, [45, 52, 57, 64], 0.5, 0.06, 3200);
    timpani(r.ac, r.out, r.t + 0.16, 33, 0.45);
  },
  /** Cutscene: a reaction shot (shock, guard, counter). */
  reaction(high = false) {
    const r = ready();
    if (!r) return;
    noiseHit(r.ac, r.out, r.t, 0.14, 0.25, 'highpass', 3000);
    [high ? 81 : 76, high ? 88 : 83].forEach((n, i) => bell(r.ac, r.out, r.t + i * 0.05, n, 0.6, 0.07));
    warDrum(r.ac, r.out, r.t, 0.45, 85);
  },
  /** Cutscene: the impact frame, the screen inverting on the hit. */
  impact() {
    const r = ready();
    if (!r) return;
    braaam(r.ac, r.out, r.t, 28, 1.2, 0.09);
    timpani(r.ac, r.out, r.t, 28, 0.7);
    warDrum(r.ac, r.out, r.t, 0.7, 50);
    crash(r.ac, r.out, r.t, 0.22);
  },
  /** Cutscene: lightning crack for the final showdown. */
  thunder() {
    const r = ready();
    if (!r) return;
    noiseHit(r.ac, r.out, r.t, 0.08, 0.6, 'highpass', 1500);
    noiseHit(r.ac, r.out, r.t + 0.05, 1.6, 0.35, 'lowpass', 500);
    timpani(r.ac, r.out, r.t, 28, 0.6);
  },
  /** Interface click: the woodblock clock. */
  click() {
    const r = ready();
    if (!r) return;
    tickBlock(r.ac, r.out, r.t, 0.16, true);
  },
};
