/**
 * Small per-viewer display settings, remembered in this browser when storage
 * is available. Cutscenes default to off when the viewer prefers reduced motion.
 */
const KEY = 'cardsade-cutscenes';
const listeners = new Set<() => void>();

let cutscenes = read();

function read(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return v === '1';
  } catch {
    // Storage blocked: fall through to the default.
  }
  return !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

export function cutscenesOn() {
  return cutscenes;
}

export function setCutscenes(on: boolean) {
  cutscenes = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // The choice still holds for this visit.
  }
  listeners.forEach((l) => l());
}

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
