/**
 * Synthesized orchestra + game-show kit shared by the soundtrack and the
 * sound effects, so both sound like the same score: FM marimba and bells,
 * electric piano, strings, brass, timpani, drums, cymbals and the woodblock
 * clock. Every instrument schedules itself at time `t` into `out`.
 */
import { getNoise } from './audio';

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------- Instruments ----------

export function env(g: GainNode, t: number, attack: number, peak: number, hold: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return t + attack + hold + release;
}

/** FM pluck: marimba (low ratio, short) through bell (higher ratio, longer). */
export function fm(ac: AudioContext, out: AudioNode, t: number, midi: number, dur: number, gain: number, ratio: number, index: number) {
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

export const marimba = (ac: AudioContext, out: AudioNode, t: number, midi: number, gain = 0.2) => fm(ac, out, t, midi, 0.4, gain, 4, 1.3);
export const bell = (ac: AudioContext, out: AudioNode, t: number, midi: number, dur = 0.7, gain = 0.12) => fm(ac, out, t, midi, dur, gain, 3.5, 2.2);

/** Electric piano chord stab (soft FM, 1:1 ratio). */
export function epStab(ac: AudioContext, out: AudioNode, t: number, notes: number[], dur: number, gain = 0.045) {
  for (const n of notes) fm(ac, out, t, n, dur, gain, 1, 1.4);
}

/** A bank of detuned saws through a lowpass: the raw material for strings and brass. */
export function saws(ac: AudioContext, dest: AudioNode, t: number, end: number, midi: number, detunes: number[], vibrato = 0) {
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
export function strings(ac: AudioContext, out: AudioNode, t: number, notes: number[], dur: number, gain = 0.03, bright = 1500) {
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
export function spiccato(ac: AudioContext, out: AudioNode, t: number, midi: number, gain = 0.06) {
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
export function brass(ac: AudioContext, out: AudioNode, t: number, notes: number[], dur: number, gain = 0.05, peak = 2600) {
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
export function horn(ac: AudioContext, out: AudioNode, t: number, midi: number, dur: number, gain = 0.06) {
  brass(ac, out, t, [midi], dur, gain, 1300);
}

/** Trailer "BRAAAM": low brass cluster with a slow filter bloom and a sub drop. */
export function braaam(ac: AudioContext, out: AudioNode, t: number, root: number, dur: number, gain = 0.07) {
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(150, t);
  filter.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
  filter.frequency.exponentialRampToValueAtTime(400, t + dur);
  const end = env(g, t, 0.05, gain, dur * 0.5, dur * 0.5);
  filter.connect(g).connect(out);
  for (const n of [root, root + 7, root + 12]) saws(ac, filter, t, end, n, [-14, 0, 14], 2);
  const sub = ac.createOscillator();
  const sg = ac.createGain();
  sub.frequency.setValueAtTime(mtof(root) * 2, t);
  sub.frequency.exponentialRampToValueAtTime(mtof(root), t + 0.3);
  env(sg, t, 0.01, 0.4, dur * 0.3, dur * 0.6);
  sub.connect(sg).connect(out);
  sub.start(t);
  sub.stop(end + 0.05);
}

/** Round plucked bass: sine plus a little triangle through a lowpass. */
export function bass(ac: AudioContext, out: AudioNode, t: number, midi: number, dur: number, gain = 0.3) {
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

export function noiseHit(ac: AudioContext, out: AudioNode, t: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
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
export function timpani(ac: AudioContext, out: AudioNode, t: number, midi: number, gain = 0.45) {
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
export function warDrum(ac: AudioContext, out: AudioNode, t: number, gain = 0.55, pitch = 70) {
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

export function kick(ac: AudioContext, out: AudioNode, t: number, gain = 0.55) {
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
export function clap(ac: AudioContext, out: AudioNode, t: number, gain = 0.25) {
  for (const d of [0, 0.011, 0.022]) noiseHit(ac, out, t + d, 0.02, gain, 'bandpass', 1500);
  noiseHit(ac, out, t + 0.03, 0.12, gain * 0.7, 'bandpass', 1300);
}

export function shaker(ac: AudioContext, out: AudioNode, t: number, gain = 0.04) {
  noiseHit(ac, out, t, 0.04, gain, 'highpass', 6500);
}

/** Woodblock tick: the quiz countdown clock. */
export function tickBlock(ac: AudioContext, out: AudioNode, t: number, gain = 0.1, high = false) {
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
export function crash(ac: AudioContext, out: AudioNode, t: number, gain = 0.18) {
  noiseHit(ac, out, t, 2.2, gain, 'highpass', 4500);
}

/** Reverse-cymbal swell that peaks exactly at `end`. */
export function swell(ac: AudioContext, out: AudioNode, t: number, end: number, gain = 0.14) {
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

/** Two seconds-plus of decaying stereo noise: a cheap but convincing hall. */
export function hallImpulse(ac: AudioContext, seconds = 2.8): AudioBuffer {
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

