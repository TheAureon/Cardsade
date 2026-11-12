/**
 * The local player's progression profile, saved in this browser. Reads and
 * writes are wrapped so blocked storage only means progress isn't kept
 * between visits. Also applies the chosen table theme and card back as CSS
 * variables on the page.
 */
import { BACKS, isUnlocked, newProfile, TABLES, TITLES, type Profile } from '../progress/progression';

const KEY = 'cardsade-profile';
const listeners = new Set<() => void>();

let profile: Profile = load();

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const base = newProfile();
      return { ...base, ...saved, season: { ...base.season, ...saved.season } };
    }
  } catch {
    // Blocked or corrupt storage: start fresh.
  }
  return newProfile();
}

export function getProfile(): Profile {
  return profile;
}

export function saveProfile(next: Profile) {
  profile = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Progress still counts for this visit.
  }
  applyCosmetics();
  listeners.forEach((l) => l());
}

export function subscribeProfile(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pick a cosmetic, if the profile's level has unlocked it. */
export function choose(kind: 'title' | 'table' | 'back', id: string) {
  const list = kind === 'title' ? TITLES : kind === 'table' ? TABLES : BACKS;
  const item = list.find((u) => u.id === id);
  if (!item || !isUnlocked(profile, item)) return;
  saveProfile({ ...profile, [kind]: id });
}

export function titleName(p: Profile = profile): string {
  return TITLES.find((t) => t.id === p.title)?.name ?? 'Squire';
}

/** Felt colours: highlight, base, mid, edge, and the arena backdrop. */
const TABLE_VARS: Record<string, [string, string, string, string, string]> = {
  crimson: ['#ff3d3d', '#d4101b', '#a00a14', '#6a0209', '#b30a14'],
  emerald: ['#4fe08a', '#159a52', '#0d7040', '#06401f', '#0f6a3a'],
  midnight: ['#5a8dff', '#1d3fa8', '#142d7a', '#0a1840', '#162a6e'],
  royal: ['#c08aff', '#6a2dbb', '#4d1f8a', '#2a1050', '#4a1d80'],
  gold: ['#ffe27a', '#d9a514', '#a87a08', '#5e4304', '#8a6406'],
  aurora: ['#7affd8', '#1aa89a', '#4a3aa8', '#1a1050', '#2a6a8a'],
  obsidian: ['#ff4d5e', '#2a2a32', '#16161c', '#050508', '#3a0a14'],
};

/** Card-back stripes and logo colour. */
const BACK_VARS: Record<string, [string, string, string]> = {
  classic: ['#c4101a', '#8a0010', '#ffd21f'],
  shadow: ['#3a1f63', '#160a2a', '#c48cff'],
  gilded: ['#e0a812', '#9a6c02', '#fff6c0'],
  ocean: ['#1f7ae0', '#0b3c80', '#8ff0ff'],
  neon: ['#ff3dc8', '#1a0a3a', '#3dfff0'],
  prism: ['#ff5a5a', '#5a7aff', '#ffffff'],
};

/** Merge-and-save helper for small profile updates. */
export function updateProfile(change: (p: Profile) => Profile) {
  saveProfile(change(profile));
}

export function applyCosmetics(p: Profile = profile) {
  const root = document.documentElement.style;
  const t = TABLE_VARS[p.table] ?? TABLE_VARS.crimson;
  root.setProperty('--felt-hi', t[0]);
  root.setProperty('--felt', t[1]);
  root.setProperty('--felt-mid', t[2]);
  root.setProperty('--felt-lo', t[3]);
  root.setProperty('--arena-glow', t[4]);
  const b = BACK_VARS[p.back] ?? BACK_VARS.classic;
  root.setProperty('--back-a', b[0]);
  root.setProperty('--back-b', b[1]);
  root.setProperty('--back-logo', b[2]);
}

export const COSMETIC_SWATCH = { table: TABLE_VARS, back: BACK_VARS };
