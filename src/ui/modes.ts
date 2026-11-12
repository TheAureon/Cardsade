/**
 * Game modes as data: each builds the seats and rules for one match. The
 * engine knows nothing about modes; it only sees seats and config.
 */
import type { SeatSetup } from '../engine/engine';
import type { GameConfig } from '../engine/types';

export type ModeId = 'quick' | 'boss' | 'daily' | 'hotseat' | 'story' | 'tutorial';

export interface MatchSetup {
  mode: ModeId;
  seats: SeatSetup[];
  config: Partial<GameConfig>;
  /** Earns XP and achievements (off for pass-and-play and tutorials). */
  track: boolean;
  /** Shown on results and in history. */
  label: string;
  /** Crusade chapter index, if any. */
  chapter?: number;
}

/** Fighter indexes match the portraits: 0 Crusader, 1 Sir Clank, 2 Lady Vex, 3 Brother Mox, 4 The Pale Knight, 5 Grizzlewick. */
export const FIGHTERS = ['Crusader', 'Sir Clank', 'Lady Vex', 'Brother Mox', 'The Pale Knight', 'Grizzlewick'];

export interface Rules {
  elements: boolean;
  ultimates: boolean;
  wildEvents: boolean;
}

const seed = () => Date.now() >>> 0;
const human = (name: string, extra: Partial<SeatSetup> = {}): SeatSetup => ({ id: 'human', name, controller: 'human', fighter: 0, ...extra });
const bot = (fighter: number, extra: Partial<SeatSetup> = {}): SeatSetup => ({
  id: `bot${fighter}`,
  name: FIGHTERS[fighter],
  controller: 'bot',
  fighter,
  ...extra,
});

/** Quick battle: you against 1–5 rivals, optionally in two teams. */
export function quickMatch(name: string, opponents: number, drawCount: number, rules: Rules, teams: boolean): MatchSetup {
  const rivals = [1, 2, 3, 4, 5].slice(0, opponents);
  const total = opponents + 1;
  const useTeams = teams && total >= 4 && total % 2 === 0;
  // Alternate teams around the table so allies don't sit together.
  const seats = [human(name, { team: useTeams ? 1 : null }), ...rivals.map((f, i) => bot(f, { team: useTeams ? ((i + 1) % 2 === 0 ? 1 : 2) : null }))];
  return {
    mode: 'quick',
    seats,
    config: { drawCount, seed: seed(), ...rules },
    track: true,
    label: useTeams ? `${total / 2}v${total / 2} Teams` : 'Quick Battle',
  };
}

/** Boss battle: you and two allies against an empowered boss. */
export function bossMatch(name: string, bossFighter: number): MatchSetup {
  const allies = [1, 2, 3, 4, 5].filter((f) => f !== bossFighter).slice(0, 2);
  return {
    mode: 'boss',
    seats: [
      human(name, { team: 1 }),
      bot(allies[0], { team: 1 }),
      bot(bossFighter, { id: 'boss', name: `${FIGHTERS[bossFighter]}, the Tyrant`, team: 2, boss: true, hp: 320, handSize: 10 }),
      bot(allies[1], { team: 1 }),
    ],
    config: { seed: seed(), elements: true, ultimates: true, wildEvents: false },
    track: true,
    label: 'Boss Battle',
  };
}

/** Today's date as YYYY-MM-DD and as a seed number. */
export function today(now = Date.now()): { key: string; seed: number } {
  const d = new Date(now);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { key, seed: Number(key.replace(/-/g, '')) };
}

/** The daily challenge: the same deck, rivals and rules for everyone today. */
export function dailyMatch(name: string, now = Date.now()): MatchSetup {
  const { seed: daySeed } = today(now);
  // Pick three rivals from the date so each day has its own line-up.
  const pool = [1, 2, 3, 4, 5];
  const rivals = [0, 1, 2].map((i) => pool.splice((daySeed >> (i * 3)) % pool.length, 1)[0]);
  return {
    mode: 'daily',
    seats: [human(name), ...rivals.map((f) => bot(f))],
    config: { seed: daySeed, elements: true, ultimates: true, wildEvents: true },
    track: true,
    label: 'Daily Challenge',
  };
}

/** Score for a daily run: winning matters most, then speed, health and damage. */
export function dailyScore(won: boolean, placement: number | null, hp: number, turns: number, damage: number): number {
  const place = won ? 1000 : placement ? Math.max(0, 400 - placement * 100) : 0;
  return place + (won ? hp * 5 + Math.max(0, 30 - turns) * 20 : 0) + damage;
}

/** Pass-and-play: several people share one device, bots fill the rest. */
export function hotseatMatch(names: string[], bots: number, rules: Rules): MatchSetup {
  const humans = names.map((n, i) => ({ id: `human${i}`, name: n.trim() || `Player ${i + 1}`, controller: 'human' as const, fighter: i % 6 }));
  const extra = [1, 2, 3, 4, 5].filter((f) => f >= names.length).slice(0, bots).map((f) => bot(f));
  return {
    mode: 'hotseat',
    seats: [...humans, ...extra],
    config: { seed: seed(), ...rules },
    track: false,
    label: 'Pass & Play',
  };
}

/** The tutorial: a gentle 1v1 with a hand that teaches every move. */
export function tutorialMatch(name: string): MatchSetup {
  return {
    mode: 'tutorial',
    seats: [
      human(name, {
        startCards: [
          { kind: 'number', value: 6 },
          { kind: 'number', value: 4 },
          { kind: 'multiplier', value: 2 },
          { kind: 'reverse', value: 0 },
          { kind: 'reverse', value: 0 },
          { kind: 'block', value: 0 },
          { kind: 'fire', value: 0 },
        ],
      }),
      bot(1, { name: 'Sir Clank (trainer)', hp: 45, startCards: [{ kind: 'number', value: 3 }, { kind: 'number', value: 2 }] }),
    ],
    config: { seed: 7, elements: true, ultimates: false, wildEvents: false },
    track: false,
    label: 'Tutorial',
  };
}

// ---------- The Crusade (story mode) ----------

export interface Chapter {
  title: string;
  /** Who you face (portrait for the chapter card). */
  rival: number;
  line: string;
  rules: string;
  bonusXp: number;
  build: (name: string) => MatchSetup;
}

const story = (chapter: number, seats: SeatSetup[], config: Partial<GameConfig>): MatchSetup => ({
  mode: 'story',
  seats,
  config: { seed: seed(), ...config },
  track: true,
  label: `Crusade ${chapter + 1}: ${CHAPTERS[chapter].title}`,
  chapter,
});

export const CHAPTERS: Chapter[] = [
  {
    title: "The Rogue's Alley",
    rival: 5,
    line: 'Fresh blood at my table? Ante up, rookie. Loser buys the next round.',
    rules: '1 vs 1 · classic rules',
    bonusXp: 150,
    build: (n) => story(0, [human(n), bot(5)], {}),
  },
  {
    title: 'The Hooded Hex',
    rival: 2,
    line: 'The cards whisper your defeat, crusader. Can you hear them laughing?',
    rules: '1 vs 1 · wild events',
    bonusXp: 200,
    build: (n) => story(1, [human(n), bot(2)], { wildEvents: true }),
  },
  {
    title: 'The Iron Gate',
    rival: 1,
    line: 'NONE SHALL PASS. ...Grizzlewick, stop laughing, this is serious.',
    rules: '1 vs 2 · ultimates',
    bonusXp: 250,
    build: (n) => story(2, [human(n), bot(1), bot(5)], { ultimates: true }),
  },
  {
    title: 'The Royal Court',
    rival: 3,
    line: 'Kneel, and I may let you keep a card. Grizzlewick, traitor, you too.',
    rules: '2 vs 2 · Grizzlewick fights with you · all rules',
    bonusXp: 300,
    build: (n) =>
      story(3, [human(n, { team: 1 }), bot(3, { team: 2 }), bot(5, { team: 1 }), bot(1, { team: 2 })], {
        elements: true,
        ultimates: true,
        wildEvents: true,
      }),
  },
  {
    title: 'The Pale Duel',
    rival: 4,
    line: '...Your warmth will not last. Nothing does.',
    rules: '1 vs 1 · elements · the Pale Knight has 150 HP',
    bonusXp: 350,
    build: (n) => story(4, [human(n), bot(4, { hp: 150 })], { elements: true, ultimates: true }),
  },
  {
    title: 'The Usurper King',
    rival: 3,
    line: 'I AM the crusade! Every card at this table answers to ME!',
    rules: 'Boss battle · you, Lady Vex and Sir Clank against Brother Mox',
    bonusXp: 600,
    build: (n) =>
      story(5, [
        human(n, { team: 1 }),
        bot(2, { team: 1 }),
        bot(3, { id: 'boss', name: 'Brother Mox, the Usurper', team: 2, boss: true, hp: 360, handSize: 10 }),
        bot(1, { team: 1 }),
      ], { elements: true, ultimates: true }),
  },
];
