/** The last few games, saved in this browser so they can be watched again. */
import type { PlayerId } from '../engine/types';
import type { Recording } from '../host/GameHost';

export interface SavedReplay {
  id: string;
  at: number;
  label: string;
  summary: string;
  viewer: PlayerId;
  recording: Recording;
}

const KEY = 'cardsade-replays';
const LIMIT = 10;
const listeners = new Set<() => void>();
let replays: SavedReplay[] = load();

function load(): SavedReplay[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(replays));
  } catch {
    // Storage full or blocked: keep what we have for this visit.
  }
  listeners.forEach((l) => l());
}

export function getReplays(): SavedReplay[] {
  return replays;
}

export function subscribeReplays(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveReplay(r: Omit<SavedReplay, 'id'>) {
  replays = [{ ...r, id: `${r.at}` }, ...replays].slice(0, LIMIT);
  persist();
}

export function deleteReplay(id: string) {
  replays = replays.filter((r) => r.id !== id);
  persist();
}
