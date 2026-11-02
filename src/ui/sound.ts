/**
 * Tiny synthesized sound-effect kit (Web Audio, no files). Every call is a
 * no-op when effects are muted or before the first user gesture.
 */
import { getAudio, isMuted } from './audio';

function ready(): [AudioContext, GainNode] | null {
  const a = getAudio();
  if (!a || isMuted('sfx')) return null;
  return [a.ctx, a.sfx];
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.5, slideTo?: number, delay = 0) {
  const r = ready();
  if (!r) return;
  const [ac, out] = r;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.4, filterFreq = 1200, delay = 0) {
  const r = ready();
  if (!r) return;
  const [ac, out] = r;
  const t = ac.currentTime + delay;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(out);
  src.start(t);
}

export const sfx = {
  /** Selecting cards climbs in pitch, so building a combo sounds like it. */
  select(step: number) {
    tone(440 * Math.pow(2, Math.min(step, 12) / 12), 0.09, 'square', 0.18);
  },
  deselect() {
    tone(330, 0.07, 'square', 0.12, 260);
  },
  whoosh() {
    noise(0.25, 0.35, 2400);
    tone(300, 0.25, 'sawtooth', 0.08, 900);
  },
  hit(amount: number) {
    const big = Math.min(1, amount / 40);
    noise(0.18 + big * 0.25, 0.5 + big * 0.3, 900 + big * 600);
    tone(160 - big * 80, 0.25 + big * 0.2, 'sine', 0.7, 40);
  },
  block() {
    tone(1200, 0.25, 'triangle', 0.35, 1100);
    tone(1800, 0.2, 'triangle', 0.2, 1700, 0.02);
    noise(0.08, 0.3, 4000);
  },
  reverse() {
    tone(300, 0.28, 'square', 0.2, 1200);
    tone(1200, 0.2, 'square', 0.12, 300, 0.12);
  },
  skip() {
    tone(900, 0.12, 'square', 0.2, 200);
    tone(700, 0.12, 'square', 0.15, 150, 0.1);
  },
  zap() {
    tone(1400, 0.2, 'sawtooth', 0.15, 200);
  },
  draw() {
    tone(660, 0.06, 'triangle', 0.2);
    tone(880, 0.06, 'triangle', 0.2, undefined, 0.07);
  },
  yourTurn() {
    [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'square', 0.16, undefined, i * 0.08));
  },
  incoming() {
    tone(880, 0.12, 'square', 0.18);
    tone(660, 0.16, 'square', 0.18, undefined, 0.13);
  },
  ko() {
    noise(0.7, 0.7, 600);
    tone(220, 0.8, 'sawtooth', 0.3, 30);
  },
  win() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.2, 'square', 0.18, undefined, i * 0.11));
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.22, undefined, i * 0.18));
  },
  /** A fighter panel crashing onto the title screen. */
  slam(step: number) {
    noise(0.16, 0.45, 1400);
    tone(110 + step * 18, 0.18, 'square', 0.25, 55);
  },
  /** The logo landing: big boom plus a bright chord. */
  logo() {
    noise(0.6, 0.7, 900);
    tone(90, 0.6, 'sine', 0.8, 35);
    [523, 659, 784].forEach((f) => tone(f, 0.5, 'square', 0.1, f * 1.01, 0.05));
  },
  /** Press start: a rising zap into a power chord. */
  start() {
    tone(220, 0.25, 'sawtooth', 0.2, 1760);
    [392, 523, 784].forEach((f) => tone(f, 0.45, 'square', 0.14, undefined, 0.2));
    noise(0.3, 0.3, 3000, 0.2);
  },
  click() {
    tone(520, 0.04, 'square', 0.12);
  },
};
