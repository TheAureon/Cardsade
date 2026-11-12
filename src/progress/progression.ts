/**
 * Meta-progression: XP, levels, achievements and unlocks. Pure functions only;
 * storage lives in the UI (profileStore). A match is tracked by feeding it the
 * engine's FxEvents from the local player's point of view, then scored once
 * at the end with `award`.
 */
import type { FxEvent, PlayerId } from '../engine/types';

// ---------- Levels ----------

export const MAX_LEVEL = 50;

/** XP needed to go from `level` to the next one. */
export function xpToNext(level: number): number {
  return 100 + 50 * (level - 1);
}

/** Total XP needed to reach `level` (level 1 starts at 0). */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level needs in total (0 at max level). */
  needed: number;
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  let rest = xp;
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: level === MAX_LEVEL ? 0 : rest, needed: level === MAX_LEVEL ? 0 : xpToNext(level) };
}

// ---------- Unlocks ----------

export interface Unlock {
  id: string;
  name: string;
  level: number;
}

export const TITLES: Unlock[] = [
  { id: 'squire', name: 'Squire', level: 1 },
  { id: 'duelist', name: 'Duelist', level: 3 },
  { id: 'knight', name: 'Knight', level: 5 },
  { id: 'champion', name: 'Champion', level: 8 },
  { id: 'warlord', name: 'Warlord', level: 12 },
  { id: 'paladin', name: 'Paladin', level: 16 },
  { id: 'legend', name: 'Legend', level: 20 },
  { id: 'mythic', name: 'Mythic', level: 30 },
];

export const TABLES: Unlock[] = [
  { id: 'crimson', name: 'Crimson', level: 1 },
  { id: 'emerald', name: 'Emerald', level: 4 },
  { id: 'midnight', name: 'Midnight', level: 7 },
  { id: 'royal', name: 'Royal', level: 10 },
  { id: 'gold', name: 'Gold', level: 15 },
];

export const BACKS: Unlock[] = [
  { id: 'classic', name: 'Classic', level: 1 },
  { id: 'shadow', name: 'Shadow', level: 6 },
  { id: 'gilded', name: 'Gilded', level: 9 },
  { id: 'ocean', name: 'Ocean', level: 14 },
];

/** Everything that unlocks when going from level `from` to level `to`. */
export function unlocksBetween(from: number, to: number): { kind: 'Title' | 'Table' | 'Card back'; item: Unlock }[] {
  const pick = (kind: 'Title' | 'Table' | 'Card back', list: Unlock[]) =>
    list.filter((u) => u.level > from && u.level <= to).map((item) => ({ kind, item }));
  return [...pick('Title', TITLES), ...pick('Table', TABLES), ...pick('Card back', BACKS)];
}

// ---------- Profile ----------

export interface Profile {
  xp: number;
  games: number;
  wins: number;
  kos: number;
  damage: number;
  biggestHit: number;
  /** Achievement id → unlock time (ms since epoch). */
  achievements: Record<string, number>;
  title: string;
  table: string;
  back: string;
}

export function newProfile(): Profile {
  return {
    xp: 0,
    games: 0,
    wins: 0,
    kos: 0,
    damage: 0,
    biggestHit: 0,
    achievements: {},
    title: 'squire',
    table: 'crimson',
    back: 'classic',
  };
}

// ---------- Match tracking ----------

export interface MatchStats {
  me: PlayerId;
  /** Your team, if any: a teammate's win is your win. */
  team: number | null;
  opponents: number;
  damageDealt: number;
  damageTaken: number;
  biggestHit: number;
  kos: number;
  reverses: number;
  blocks: number;
  specials: number;
  maxCardsInAttack: number;
  maxMultiplier: number;
  /** Most cards an opponent lost to one of your Discard cards. */
  maxDiscardForced: number;
  /** Most reverses in one chain you were part of. */
  longestChain: number;
  myTurns: number;
  lowestHp: number;
  finalHp: number;
  /** 1 = winner; null while you're still in. */
  placement: number | null;
  won: boolean;
  /** Achievements already unlocked mid-match (and their XP already paid). */
  unlockedDuring: string[];
  // Internal bookkeeping for chains and discards.
  chainReverses: number;
  chainHasMe: boolean;
  discardTarget: PlayerId | null;
}

export function newMatch(me: PlayerId, opponents: number, startHp: number, team: number | null = null): MatchStats {
  return {
    me,
    team,
    opponents,
    damageDealt: 0,
    damageTaken: 0,
    biggestHit: 0,
    kos: 0,
    reverses: 0,
    blocks: 0,
    specials: 0,
    maxCardsInAttack: 0,
    maxMultiplier: 1,
    maxDiscardForced: 0,
    longestChain: 0,
    myTurns: 0,
    lowestHp: startHp,
    finalHp: startHp,
    placement: null,
    won: false,
    unlockedDuring: [],
    chainReverses: 0,
    chainHasMe: false,
    discardTarget: null,
  };
}

/** Extra facts the event alone doesn't carry, read from the view when it arrives. */
export interface TrackContext {
  /** For an attack: how many cards rode on it and its total multiplier. */
  attackCards?: number;
  attackMultiplier?: number;
  /** Players still standing after this event. */
  alive?: number;
}

const DISCARD_CARDS = new Set(['discard', 'discardAction', 'discardAttack', 'discardMultipliers']);

/** Folds one engine event into the match stats (returns a new object). */
export function track(stats: MatchStats, e: FxEvent, ctx: TrackContext = {}): MatchStats {
  const s = { ...stats, unlockedDuring: [...stats.unlockedDuring] };
  const me = s.me;
  switch (e.type) {
    case 'attack':
      s.chainReverses = 0;
      s.chainHasMe = e.from === me || e.to === me;
      if (e.from === me) {
        const mult = ctx.attackMultiplier ?? 1;
        if (e.amount >= 30 || mult >= 3) s.specials++;
        s.maxCardsInAttack = Math.max(s.maxCardsInAttack, ctx.attackCards ?? 0);
        s.maxMultiplier = Math.max(s.maxMultiplier, mult);
      }
      break;
    case 'action':
      s.chainReverses = 0;
      s.chainHasMe = e.from === me || e.to === me;
      if (e.from === me && DISCARD_CARDS.has(e.card)) s.discardTarget = e.to;
      break;
    case 'reverse':
      s.chainReverses++;
      if (e.from === me) {
        s.reverses++;
        s.chainHasMe = true;
      }
      if (s.chainHasMe) s.longestChain = Math.max(s.longestChain, s.chainReverses);
      break;
    case 'block':
      if (e.by === me) s.blocks++;
      break;
    case 'damage':
      if (e.from === me && e.to !== me) {
        s.damageDealt += e.amount;
        s.biggestHit = Math.max(s.biggestHit, e.amount);
      }
      if (e.to === me) {
        s.damageTaken += e.amount;
        s.lowestHp = Math.min(s.lowestHp, e.hp);
        s.finalHp = e.hp;
      }
      break;
    case 'discard':
      if (s.discardTarget && e.who === s.discardTarget) {
        s.maxDiscardForced = Math.max(s.maxDiscardForced, e.count);
        s.discardTarget = null;
      }
      break;
    case 'ko':
      if (e.by === me && e.who !== me) s.kos++;
      if (e.who === me) s.placement = (ctx.alive ?? 1) + 1;
      break;
    case 'turn':
      if (e.who === me) s.myTurns++;
      break;
    case 'win':
      s.won = e.who === me || (s.team !== null && e.team === s.team);
      if (s.won) s.placement = 1;
      break;
  }
  return s;
}

// ---------- Achievements ----------

export type Tier = 'bronze' | 'silver' | 'gold';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Short glyph for the badge face. */
  icon: string;
  tier: Tier;
  xp: number;
  /** `match` achievements can unlock mid-game; `end` ones are checked when it's scored. */
  when: 'match' | 'end';
  check: (m: MatchStats, p: Profile, level: number) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_ko', name: 'First Blood', description: 'Knock out a rival.', icon: 'K.O.', tier: 'bronze', xp: 50, when: 'match', check: (m) => m.kos >= 1 },
  { id: 'overkill', name: 'Overkill', description: 'Land a single hit of 50+ damage.', icon: '50', tier: 'silver', xp: 100, when: 'match', check: (m) => m.biggestHit >= 50 },
  { id: 'apocalypse', name: 'Apocalypse', description: 'Land a single hit of 100+ damage.', icon: '100', tier: 'gold', xp: 250, when: 'match', check: (m) => m.biggestHit >= 100 },
  { id: 'combo', name: 'Combo Artist', description: 'Put 5 or more cards on one attack.', icon: '5+', tier: 'silver', xp: 100, when: 'match', check: (m) => m.maxCardsInAttack >= 5 },
  { id: 'multiplied', name: 'Multiplied', description: 'Attack with a ×6 total multiplier or more.', icon: '×6', tier: 'silver', xp: 120, when: 'match', check: (m) => m.maxMultiplier >= 6 },
  { id: 'mirror', name: 'Mirror Master', description: 'Reverse 3 attacks or effects in one game.', icon: '⇄', tier: 'silver', xp: 100, when: 'match', check: (m) => m.reverses >= 3 },
  { id: 'ironwall', name: 'Iron Wall', description: 'Block 3 times in one game.', icon: '⛨', tier: 'silver', xp: 100, when: 'match', check: (m) => m.blocks >= 3 },
  { id: 'pingpong', name: 'Ping Pong', description: 'Be part of a chain with 3 or more reverses.', icon: '⇆', tier: 'gold', xp: 150, when: 'match', check: (m) => m.longestChain >= 3 },
  { id: 'cleaner', name: 'Spring Cleaning', description: 'Make a rival discard 4+ cards with one card.', icon: '✕', tier: 'silver', xp: 100, when: 'match', check: (m) => m.maxDiscardForced >= 4 },
  { id: 'victor', name: 'Victor', description: 'Win a game.', icon: '★', tier: 'bronze', xp: 100, when: 'end', check: (m) => m.won },
  { id: 'untouchable', name: 'Untouchable', description: 'Win without taking any damage.', icon: '0', tier: 'gold', xp: 300, when: 'end', check: (m) => m.won && m.damageTaken === 0 },
  { id: 'last_stand', name: 'Last Stand', description: 'Win with 10 HP or less.', icon: '10', tier: 'gold', xp: 200, when: 'end', check: (m) => m.won && m.finalHp <= 10 },
  { id: 'phoenix', name: 'Phoenix', description: 'Win after dropping to 20 HP or less.', icon: '♨', tier: 'silver', xp: 150, when: 'end', check: (m) => m.won && m.lowestHp <= 20 },
  { id: 'full_house', name: 'Full House', description: 'Win against 5 rivals.', icon: '5v1', tier: 'gold', xp: 250, when: 'end', check: (m) => m.won && m.opponents >= 5 },
  { id: 'blitz', name: 'Blitz', description: 'Win within 8 of your own turns.', icon: '⚡', tier: 'gold', xp: 200, when: 'end', check: (m) => m.won && m.myTurns <= 8 },
  { id: 'veteran', name: 'Veteran', description: 'Play 25 games.', icon: '25', tier: 'silver', xp: 150, when: 'end', check: (_m, p) => p.games >= 25 },
  { id: 'crusader', name: 'True Crusader', description: 'Win 10 games.', icon: '10★', tier: 'silver', xp: 200, when: 'end', check: (_m, p) => p.wins >= 10 },
  { id: 'warlord', name: 'Warlord', description: 'Win 50 games.', icon: '50★', tier: 'gold', xp: 500, when: 'end', check: (_m, p) => p.wins >= 50 },
  { id: 'slayer', name: 'Slayer', description: 'Knock out 50 rivals in total.', icon: '☠', tier: 'gold', xp: 300, when: 'end', check: (_m, p) => p.kos >= 50 },
  { id: 'rising', name: 'Rising Star', description: 'Reach level 10.', icon: 'Lv10', tier: 'silver', xp: 0, when: 'end', check: (_m, _p, level) => level >= 10 },
  { id: 'legend', name: 'Living Legend', description: 'Reach level 25.', icon: 'Lv25', tier: 'gold', xp: 0, when: 'end', check: (_m, _p, level) => level >= 25 },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Mid-match achievements the stats now satisfy that the profile doesn't have yet. */
export function newlyEarned(m: MatchStats, p: Profile): Achievement[] {
  const level = levelInfo(p.xp).level;
  return ACHIEVEMENTS.filter(
    (a) => a.when === 'match' && !p.achievements[a.id] && !m.unlockedDuring.includes(a.id) && a.check(m, p, level),
  );
}

/** Records a mid-match unlock on the profile and pays its XP right away. */
export function grantDuring(m: MatchStats, p: Profile, a: Achievement, now: number): { match: MatchStats; profile: Profile } {
  return {
    match: { ...m, unlockedDuring: [...m.unlockedDuring, a.id] },
    profile: { ...p, xp: p.xp + a.xp, achievements: { ...p.achievements, [a.id]: now } },
  };
}

// ---------- End-of-match award ----------

export interface XpLine {
  label: string;
  xp: number;
}

export interface Award {
  lines: XpLine[];
  total: number;
  /** All achievements unlocked this match, mid-match ones included. */
  achievements: Achievement[];
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  unlocks: { kind: 'Title' | 'Table' | 'Card back'; item: Unlock }[];
  profile: Profile;
}

const PLACE_XP: Record<number, number> = { 1: 200, 2: 80, 3: 40 };

/**
 * Scores a finished (or abandoned-after-elimination) match. `xpAtStart` is the
 * profile XP when the match began, so the results can show the whole climb,
 * including mid-match achievement XP that was already paid.
 */
export function award(m: MatchStats, before: Profile, xpAtStart: number, now: number): Award {
  const lines: XpLine[] = [{ label: 'Battle fought', xp: 25 }];
  const add = (label: string, xp: number) => xp > 0 && lines.push({ label, xp });
  add(`Damage dealt (${m.damageDealt})`, Math.floor(m.damageDealt / 2));
  add(`K.O.s × ${m.kos}`, m.kos * 40);
  add(`Special moves × ${m.specials}`, m.specials * 15);
  add(`Reverses × ${m.reverses}`, m.reverses * 10);
  add(`Blocks × ${m.blocks}`, m.blocks * 8);
  if (m.placement) add(m.placement === 1 ? 'Victory' : `Finished ${ordinal(m.placement)}`, PLACE_XP[m.placement] ?? 0);
  const base = lines.reduce((sum, l) => sum + l.xp, 0);
  const rivalBonus = Math.round(base * 0.15 * Math.max(0, m.opponents - 1));
  add(`Rival bonus (${m.opponents} rivals)`, rivalBonus);

  let profile: Profile = {
    ...before,
    xp: before.xp + base + rivalBonus,
    games: before.games + 1,
    wins: before.wins + (m.won ? 1 : 0),
    kos: before.kos + m.kos,
    damage: before.damage + m.damageDealt,
    biggestHit: Math.max(before.biggestHit, m.biggestHit),
    achievements: { ...before.achievements },
  };

  // End-of-match achievements; level ones are rechecked after XP lands.
  const earned: Achievement[] = m.unlockedDuring.map((id) => ACHIEVEMENT_BY_ID[id]).filter(Boolean);
  for (let pass = 0; pass < 2; pass++) {
    const level = levelInfo(profile.xp).level;
    for (const a of ACHIEVEMENTS) {
      if (profile.achievements[a.id] || !a.check(m, profile, level)) continue;
      profile = { ...profile, xp: profile.xp + a.xp, achievements: { ...profile.achievements, [a.id]: now } };
      earned.push(a);
      if (a.xp) lines.push({ label: `Achievement: ${a.name}`, xp: a.xp });
    }
  }
  for (const id of m.unlockedDuring) {
    const a = ACHIEVEMENT_BY_ID[id];
    if (a?.xp) lines.push({ label: `Achievement: ${a.name}`, xp: a.xp });
  }

  const levelBefore = levelInfo(xpAtStart).level;
  const levelAfter = levelInfo(profile.xp).level;
  return {
    lines,
    total: profile.xp - xpAtStart,
    achievements: earned,
    xpBefore: xpAtStart,
    xpAfter: profile.xp,
    levelBefore,
    levelAfter,
    unlocks: unlocksBetween(levelBefore, levelAfter),
    profile,
  };
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
