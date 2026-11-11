import { describe, expect, it } from 'vitest';
import type { FxEvent } from '../engine/types';
import {
  award,
  grantDuring,
  levelInfo,
  newlyEarned,
  newMatch,
  newProfile,
  ordinal,
  track,
  unlocksBetween,
  xpForLevel,
  xpToNext,
} from './progression';

const play = (events: [FxEvent, object?][], opponents = 2) =>
  events.reduce((m, [e, ctx]) => track(m, e, ctx), newMatch('me', opponents, 100));

describe('levels', () => {
  it('follows the curve', () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(2)).toBe(150);
    expect(xpForLevel(3)).toBe(250);
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, needed: 100 });
    expect(levelInfo(260)).toEqual({ level: 3, into: 10, needed: 200 });
  });

  it('caps at the max level', () => {
    expect(levelInfo(10_000_000).level).toBe(50);
  });

  it('lists unlocks between levels', () => {
    const names = unlocksBetween(2, 5).map((u) => u.item.name);
    expect(names).toEqual(['Duelist', 'Knight', 'Emerald']);
  });
});

describe('match tracking', () => {
  it('credits damage, hits and K.O.s to the local player only', () => {
    const m = play([
      [{ type: 'attack', from: 'me', to: 'b1', amount: 60 }, { attackCards: 5, attackMultiplier: 6 }],
      [{ type: 'damage', from: 'me', to: 'b1', amount: 60, hp: 40 }],
      [{ type: 'damage', from: 'b2', to: 'b1', amount: 40, hp: 0 }],
      [{ type: 'ko', who: 'b1', by: 'b2' }, { alive: 2 }],
      [{ type: 'damage', from: 'b2', to: 'me', amount: 30, hp: 70 }],
    ]);
    expect(m.damageDealt).toBe(60);
    expect(m.biggestHit).toBe(60);
    expect(m.kos).toBe(0);
    expect(m.specials).toBe(1);
    expect(m.maxCardsInAttack).toBe(5);
    expect(m.maxMultiplier).toBe(6);
    expect(m.damageTaken).toBe(30);
    expect(m.lowestHp).toBe(70);
  });

  it('counts reverse chains the player is part of', () => {
    const m = play([
      [{ type: 'attack', from: 'b1', to: 'me', amount: 10 }],
      [{ type: 'reverse', from: 'me', to: 'b1', amount: 10 }],
      [{ type: 'reverse', from: 'b1', to: 'me', amount: 10 }],
      [{ type: 'reverse', from: 'me', to: 'b1', amount: 10 }],
    ]);
    expect(m.reverses).toBe(2);
    expect(m.longestChain).toBe(3);
  });

  it('credits forced discards from your own Discard cards', () => {
    const m = play([
      [{ type: 'action', from: 'me', to: 'b1', card: 'discardAttack' }],
      [{ type: 'discard', who: 'b1', count: 4 }],
    ]);
    expect(m.maxDiscardForced).toBe(4);
  });

  it('records placement when knocked out and when winning', () => {
    expect(play([[{ type: 'ko', who: 'me', by: 'b1' }, { alive: 2 }]]).placement).toBe(3);
    expect(play([[{ type: 'win', who: 'me' }]]).placement).toBe(1);
  });
});

describe('achievements and awards', () => {
  it('unlocks mid-match achievements once and pays their XP immediately', () => {
    let m = play([[{ type: 'damage', from: 'me', to: 'b1', amount: 55, hp: 45 }]]);
    let p = newProfile();
    const earned = newlyEarned(m, p);
    expect(earned.map((a) => a.id)).toEqual(['overkill']);
    ({ match: m, profile: p } = grantDuring(m, p, earned[0], 1));
    expect(p.xp).toBe(100);
    expect(newlyEarned(m, p)).toEqual([]);
  });

  it('scores a win with lines, end achievements and level-ups', () => {
    const m = play(
      [
        [{ type: 'turn', who: 'me' }],
        [{ type: 'damage', from: 'me', to: 'b1', amount: 100, hp: 0 }],
        [{ type: 'ko', who: 'b1', by: 'me' }, { alive: 1 }],
        [{ type: 'win', who: 'me' }],
      ],
      1,
    );
    const result = award(m, newProfile(), 0, 5);
    const ids = result.achievements.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['victor', 'untouchable', 'blitz', 'first_ko']));
    expect(result.lines[0]).toEqual({ label: 'Battle fought', xp: 25 });
    expect(result.lines.some((l) => l.label === 'Victory' && l.xp === 200)).toBe(true);
    expect(result.profile.wins).toBe(1);
    expect(result.profile.games).toBe(1);
    expect(result.total).toBe(result.xpAfter - result.xpBefore);
    expect(result.levelAfter).toBeGreaterThan(result.levelBefore);
    expect(result.unlocks.length).toBeGreaterThan(0);
  });

  it('pays a rival bonus for bigger tables', () => {
    const lose = (opps: number) => award(play([[{ type: 'ko', who: 'me', by: 'b1' }, { alive: opps }]], opps), newProfile(), 0, 1);
    expect(lose(1).lines.some((l) => l.label.startsWith('Rival bonus'))).toBe(false);
    expect(lose(5).lines.some((l) => l.label.startsWith('Rival bonus'))).toBe(true);
  });

  it('formats ordinals', () => {
    expect([1, 2, 3, 4, 11, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '22nd']);
  });
});
