import { describe, expect, it } from 'vitest';
import { decideBot } from './bot';
import { applyAction, createGame, getPending, getPlayer, getPlayerView } from './engine';
import type { Action, Card, CardKind, GameState } from './types';

const seats = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, controller: 'bot' as const }));

let uid = 0;
const card = (kind: CardKind, value = 0): Card => ({ id: `t${uid++}`, kind, value });

/** A 2+ player game with hands replaced by the given cards. */
function setup(hands: Card[][]): GameState {
  const s = createGame(seats(hands.length), { seed: 7 });
  s.players.forEach((p, i) => (p.hand = hands[i]));
  return s;
}

function act(s: GameState, a: Action): GameState {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('setup', () => {
  it('deals 7 cards and 100 HP to everyone', () => {
    const s = createGame(seats(6));
    for (const p of s.players) {
      expect(p.hand).toHaveLength(7);
      expect(p.hp).toBe(100);
    }
    expect(getPending(s)).toEqual({ kind: 'main', player: 'p0' });
  });
});

describe('attacks', () => {
  it('bare attack does 1 damage', () => {
    let s = setup([[], []]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] });
    expect(getPending(s).kind).toBe('response');
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').hp).toBe(99);
    expect(getPending(s)).toEqual({ kind: 'post', player: 'p0' });
  });

  it('damage is (base + numbers) × multipliers', () => {
    const n3 = card('number', 3), n4 = card('number', 4), x2 = card('multiplier', 2), x3 = card('multiplier', 3);
    let s = setup([[n3, n4, x2, x3], []]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [n3.id, n4.id, x2.id, x3.id] });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').hp).toBe(100 - 48);
  });

  it('only one attack per turn', () => {
    let s = setup([[], []]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(applyAction(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] }).ok).toBe(false);
  });

  it('action cards cannot ride on an attack', () => {
    const b = card('block');
    const s = setup([[b], []]);
    expect(applyAction(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [b.id] }).ok).toBe(false);
  });
});

describe('responses', () => {
  it('Block stops the attack and ends the chain', () => {
    const n9 = card('number', 9), b = card('block');
    let s = setup([[n9], [b]]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [n9.id] });
    s = act(s, { type: 'respond', player: 'p1', cardId: b.id });
    expect(s.stack).toHaveLength(0);
    expect(getPlayer(s, 'p1').hp).toBe(100);
    expect(getPending(s).kind).toBe('post');
  });

  it('Reverse sends damage back, and can add multipliers', () => {
    const n4 = card('number', 4), r = card('reverse'), x2 = card('multiplier', 2);
    let s = setup([[n4], [r, x2]]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [n4.id] });
    s = act(s, { type: 'respond', player: 'p1', cardId: r.id, multiplierIds: [x2.id] });
    expect(getPending(s)).toMatchObject({ kind: 'response', player: 'p0' });
    s = act(s, { type: 'pass', player: 'p0' });
    expect(getPlayer(s, 'p0').hp).toBe(90);
    expect(getPlayer(s, 'p1').hp).toBe(100);
  });

  it('Reverse can be reversed back, then blocked', () => {
    const r1 = card('reverse'), r2 = card('reverse'), b = card('block');
    let s = setup([[r2], [r1, b]]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] });
    s = act(s, { type: 'respond', player: 'p1', cardId: r1.id });
    s = act(s, { type: 'respond', player: 'p0', cardId: r2.id });
    expect(getPending(s)).toMatchObject({ kind: 'response', player: 'p1' });
    s = act(s, { type: 'respond', player: 'p1', cardId: b.id });
    expect(s.stack).toHaveLength(0);
    expect(getPlayer(s, 'p0').hp).toBe(100);
    expect(getPlayer(s, 'p1').hp).toBe(100);
  });

  it('Skip as a response cancels the incoming attack if it resolves', () => {
    const n9 = card('number', 9), sk = card('skip');
    let s = setup([[n9], [sk]]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [n9.id] });
    s = act(s, { type: 'respond', player: 'p1', cardId: sk.id });
    expect(getPending(s)).toMatchObject({ kind: 'response', player: 'p0' });
    s = act(s, { type: 'pass', player: 'p0' });
    expect(s.stack).toHaveLength(0);
    expect(getPlayer(s, 'p1').hp).toBe(100);
  });

  it('a blocked Skip lets the attack continue, and the defender may respond again', () => {
    const n9 = card('number', 9), b = card('block'), sk = card('skip');
    let s = setup([[n9, b], [sk]]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [n9.id] });
    s = act(s, { type: 'respond', player: 'p1', cardId: sk.id });
    s = act(s, { type: 'respond', player: 'p0', cardId: b.id });
    expect(getPending(s)).toMatchObject({ kind: 'response', player: 'p1' });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').hp).toBe(90);
  });

  it('a reversed Skip wastes the defender\'s next card', () => {
    const r = card('reverse'), sk = card('skip'), b = card('block');
    let s = setup([[r], [sk, b]]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] });
    s = act(s, { type: 'respond', player: 'p1', cardId: sk.id });
    s = act(s, { type: 'respond', player: 'p0', cardId: r.id });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').skipped).toBe(true);
    // The Block is wasted; the attack is still pending at p1.
    s = act(s, { type: 'respond', player: 'p1', cardId: b.id });
    expect(getPlayer(s, 'p1').skipped).toBe(false);
    expect(getPending(s)).toMatchObject({ kind: 'response', player: 'p1' });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').hp).toBe(99);
  });

  it('Block and Reverse cannot be played on your own turn', () => {
    const b = card('block');
    const s = setup([[b], []]);
    expect(applyAction(s, { type: 'playAction', player: 'p0', cardId: b.id, target: 'p1' }).ok).toBe(false);
  });

  it('only the targeted player can respond', () => {
    let s = setup([[], [], [card('block')]]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] });
    expect(applyAction(s, { type: 'pass', player: 'p2' }).ok).toBe(false);
  });
});

describe('action cards', () => {
  it('Skip makes the next attack useless', () => {
    const sk = card('skip'), n9 = card('number', 9);
    let s = setup([[sk], [n9]]);
    s = act(s, { type: 'playAction', player: 'p0', cardId: sk.id, target: 'p1' });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').skipped).toBe(true);
    s = act(s, { type: 'endTurn', player: 'p0' });
    s = act(s, { type: 'attack', player: 'p1', target: 'p0', cardIds: [n9.id] });
    expect(s.stack).toHaveLength(0);
    expect(getPlayer(s, 'p0').hp).toBe(100);
    expect(getPlayer(s, 'p1').skipped).toBe(false);
  });

  it('Discard lets the caster pick a card from the target hand', () => {
    const d = card('discard'), keep = card('number', 1), lose = card('reverse');
    let s = setup([[d], [keep, lose]]);
    s = act(s, { type: 'playAction', player: 'p0', cardId: d.id, target: 'p1' });
    s = act(s, { type: 'pass', player: 'p1' });
    const view = getPlayerView(s, 'p0');
    expect(view.revealedHand?.map((c) => c.id)).toEqual([keep.id, lose.id]);
    expect(getPlayerView(s, 'p1').revealedHand).toBeNull();
    s = act(s, { type: 'chooseDiscard', player: 'p0', cardId: lose.id });
    expect(getPlayer(s, 'p1').hand).toEqual([keep]);
    expect(getPending(s).kind).toBe('main');
  });

  it('a reversed Discard Attack hits the caster', () => {
    const da = card('discardAttack'), n1 = card('number', 1), n2 = card('number', 2), r = card('reverse');
    let s = setup([[da, n1, n2], [r, card('number', 5)]]);
    s = act(s, { type: 'playAction', player: 'p0', cardId: da.id, target: 'p1' });
    s = act(s, { type: 'respond', player: 'p1', cardId: r.id });
    s = act(s, { type: 'pass', player: 'p0' });
    expect(getPlayer(s, 'p0').hand).toHaveLength(0);
    expect(getPlayer(s, 'p1').hand).toHaveLength(1);
  });

  it('Discard Action / Multipliers remove the right cards', () => {
    const dact = card('discardAction'), dm = card('discardMultipliers');
    let s = setup([[dact, dm], [card('block'), card('skip'), card('multiplier', 2), card('number', 3)]]);
    s = act(s, { type: 'playAction', player: 'p0', cardId: dact.id, target: 'p1' });
    // p1 could block with its Block, but passes.
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').hand.map((c) => c.kind)).toEqual(['multiplier', 'number']);
    s = act(s, { type: 'playAction', player: 'p0', cardId: dm.id, target: 'p1' });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').hand.map((c) => c.kind)).toEqual(['number']);
  });
});

describe('turns and drawing', () => {
  it('drawing ends your turn', () => {
    let s = setup([[], []]);
    const before = s.deck.length;
    s = act(s, { type: 'draw', player: 'p0' });
    expect(getPlayer(s, 'p0').hand).toHaveLength(2);
    expect(s.deck.length).toBe(before - 2);
    expect(getPending(s)).toEqual({ kind: 'main', player: 'p1' });
  });

  it('knocked-out players are skipped and the last one standing wins', () => {
    const x3 = card('multiplier', 3), n9 = card('number', 9);
    let s = setup([[x3, n9], [], []]);
    getPlayer(s, 'p1').hp = 30;
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [x3.id, n9.id] });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').eliminated).toBe(true);
    s = act(s, { type: 'endTurn', player: 'p0' });
    expect(s.turn.player).toBe('p2');
    getPlayer(s, 'p0').hp = 1;
    s = act(s, { type: 'attack', player: 'p2', target: 'p0', cardIds: [] });
    s = act(s, { type: 'pass', player: 'p0' });
    expect(s.winner).toBe('p2');
    expect(getPending(s)).toEqual({ kind: 'gameOver', winner: 'p2' });
  });

  it('cannot target knocked-out players', () => {
    const s = setup([[], [], []]);
    s.players[1].eliminated = true;
    expect(applyAction(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] }).ok).toBe(false);
  });
});

describe('fx events', () => {
  it('records structured events for attacks, reverses and damage', () => {
    const n4 = card('number', 4), r = card('reverse');
    let s = setup([[n4], [r]]);
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [n4.id] });
    s = act(s, { type: 'respond', player: 'p1', cardId: r.id });
    s = act(s, { type: 'pass', player: 'p0' });
    const fx = s.log.map((e) => e.fx).filter(Boolean);
    expect(fx).toContainEqual({ type: 'attack', from: 'p0', to: 'p1', amount: 5 });
    expect(fx).toContainEqual({ type: 'reverse', from: 'p1', to: 'p0', amount: 5 });
    expect(fx).toContainEqual({ type: 'damage', to: 'p0', from: 'p1', amount: 5, hp: 95 });
  });
});

describe('player view', () => {
  it('hides other hands', () => {
    const s = createGame(seats(3));
    const v = getPlayerView(s, 'p0');
    expect(v.hand).toHaveLength(7);
    expect(v.players[1]).not.toHaveProperty('hand');
    expect(v.players[1].handCount).toBe(7);
  });
});

describe('bot simulation', () => {
  it.each([2, 3, 4, 6])('%i bots finish games without illegal moves', (n) => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = createGame(seats(n), { seed });
      let rng = seed;
      const random = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
      let steps = 0;
      while (!s.winner) {
        const pending = getPending(s);
        if (pending.kind === 'gameOver') break;
        const action = decideBot(getPlayerView(s, pending.player), random);
        const r = applyAction(s, action);
        if (!r.ok) throw new Error(`seed ${seed}: ${r.error} for ${JSON.stringify(action)}`);
        s = r.state;
        if (++steps > 20000) throw new Error(`seed ${seed}: game did not finish`);
      }
      expect(s.players.filter((p) => !p.eliminated)).toHaveLength(1);
    }
  });
});
