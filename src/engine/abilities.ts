import type { UltimateKind, WildEventKind } from './types';

export interface UltimateInfo {
  kind: UltimateKind;
  name: string;
  description: string;
  /** Whether it's aimed at an opponent. */
  targeted: boolean;
}

/** One ultimate per fighter, indexed by the seat's `fighter` (portrait) number. */
export const ULTIMATES: UltimateInfo[] = [
  { kind: 'crusade', name: 'Holy Crusade', description: '25 damage that cannot be blocked or reversed.', targeted: true },
  { kind: 'bulwark', name: 'Bulwark', description: 'Your next 2 incoming attacks are blocked automatically.', targeted: false },
  { kind: 'hexstorm', name: 'Hex Storm', description: 'Every enemy discards 2 random cards.', targeted: false },
  { kind: 'decree', name: 'Royal Decree', description: 'Heal 30 HP.', targeted: false },
  { kind: 'souldrain', name: 'Soul Drain', description: 'Deal 20 damage and heal that much.', targeted: true },
  { kind: 'ambush', name: 'Ambush', description: 'Steal 2 random cards from a rival.', targeted: true },
];

export function ultimateFor(fighter: number): UltimateInfo {
  return ULTIMATES[((fighter % ULTIMATES.length) + ULTIMATES.length) % ULTIMATES.length];
}

export interface WildEventInfo {
  kind: WildEventKind;
  name: string;
  description: string;
  /** Instant events happen once; the rest last one lap of the table. */
  instant: boolean;
}

export const WILD_EVENTS: WildEventInfo[] = [
  { kind: 'double', name: 'Double Damage', description: 'All attacks deal double damage this round.', instant: false },
  { kind: 'noReverse', name: 'Mirror Ban', description: 'Reverse cards cannot be played this round.', instant: false },
  { kind: 'silence', name: 'Silence', description: 'Skip and Discard cards cannot be played this round.', instant: false },
  { kind: 'frenzy', name: 'Frenzy', description: 'Every attack deals +5 base damage this round.', instant: false },
  { kind: 'cardRain', name: 'Card Rain', description: 'Everyone draws 2 cards.', instant: true },
  { kind: 'spring', name: 'Healing Spring', description: 'Everyone heals 10 HP.', instant: true },
  { kind: 'chaos', name: 'Chaos Shuffle', description: 'Every hand passes to the next player.', instant: true },
];

export const WILD_EVENT_BY_KIND = Object.fromEntries(WILD_EVENTS.map((e) => [e.kind, e])) as Record<WildEventKind, WildEventInfo>;

/** Meter gained per point of damage dealt and taken. */
export const CHARGE_DEALT = 1;
export const CHARGE_TAKEN = 0.6;
