/**
 * Shared Web Audio setup: one context, separate buses for music and sound
 * effects so each can be muted on its own. Mute choices persist per viewer.
 */
export type Channel = 'sfx' | 'music';

const LEVEL: Record<Channel, number> = { sfx: 0.35, music: 0.32 };

let ctx: AudioContext | null = null;
const buses: Partial<Record<Channel, GainNode>> = {};
const muted: Record<Channel, boolean> = { sfx: readMuted('sfx'), music: readMuted('music') };
const listeners = new Set<() => void>();
const unlockListeners = new Set<() => void>();

function readMuted(ch: Channel): boolean {
  try {
    return localStorage.getItem(`cardsade-${ch}-muted`) === '1';
  } catch {
    return false;
  }
}

export function isMuted(ch: Channel) {
  return muted[ch];
}

export function setMuted(ch: Channel, value: boolean) {
  muted[ch] = value;
  try {
    localStorage.setItem(`cardsade-${ch}-muted`, value ? '1' : '0');
  } catch {
    // Storage can be blocked; the choice still holds for this visit.
  }
  const bus = buses[ch];
  if (ctx && bus) bus.gain.setTargetAtTime(value ? 0 : LEVEL[ch], ctx.currentTime, 0.08);
  listeners.forEach((l) => l());
}

/** For React: re-render toggles when a mute setting changes. */
export function subscribeAudio(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Runs once audio is actually playing (after the first user gesture). */
export function onUnlock(listener: () => void) {
  unlockListeners.add(listener);
  if (getAudio()) listener();
  return () => unlockListeners.delete(listener);
}

/** Call from any user gesture; browsers only allow audio after one. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    for (const ch of ['sfx', 'music'] as Channel[]) {
      const g = ctx.createGain();
      g.gain.value = muted[ch] ? 0 : LEVEL[ch];
      g.connect(ctx.destination);
      buses[ch] = g;
    }
    ctx.addEventListener('statechange', () => {
      if (ctx?.state === 'running') unlockListeners.forEach((l) => l());
    });
  }
  if (ctx.state === 'suspended') void ctx.resume();
  else if (ctx.state === 'running') unlockListeners.forEach((l) => l());
}

export function getAudio(): { ctx: AudioContext; sfx: GainNode; music: GainNode } | null {
  if (!ctx || ctx.state !== 'running' || !buses.sfx || !buses.music) return null;
  return { ctx, sfx: buses.sfx, music: buses.music };
}

let noiseBuffer: AudioBuffer | null = null;
/** Two seconds of white noise, reused for drums and impacts. */
export function getNoise(ac: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ac.sampleRate) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}
