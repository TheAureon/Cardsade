import { describe, expect, it } from 'vitest';
import { decideBot } from './bot';
import { applyAction, createGame, getPending, getPlayer, getPlayerView, packetDamage, triggerEvent, type SeatSetup } from './engine';
import type { Action, Card, CardKind, GameConfig, GameState } from './types';

let uid = 0;
const card = (kind: CardKind, value = 0): Card => ({ id: `f${uid++}`, kind, value });
const seat = (i: number, extra: Partial<SeatSetup> = {}): SeatSetup => ({ id: `p${i}`, name: `P${i}`, controller: 'bot', ...extra });

function setup(hands: Card[][], config: Partial<GameConfig> = {}, seats?: SeatSetup[]): GameState {
  const s = createGame(seats ?? hands.map((_, i) => seat(i)), { seed: 3, ...config });
  s.players.forEach((p, i) => (p.hand = hands[i] ?? []));
  return s;
}

function act(s: GameState, a: Action): GameState {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const fxTypes = (s: GameState) => s.log.map((e) => e.fx?.type).filter(Boolean);

describe('elements', () => {
  it('fire burns the target for 3 at the start of their next turns', () => {
    const fire = card('fire');
    let s = setup([[fire], []], { elements: true });
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [fire.id] });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').burn).toBe(3);
    expect(getPlayer(s, 'p1').hp).toBe(99);
    s = act(s, { type: 'endTurn', player: 'p0' });
    expect(getPlayer(s, 'p1').hp).toBe(96);
    expect(getPlayer(s, 'p1').burn).toBe(2);
  });

  it('ice costs the target their next attack', () => {
    const ice = card('ice');
    let s = setup([[ice], []], { elements: true });
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [ice.id] });
    s = act(s, { type: 'pass', player: 'p1' });
    s = act(s, { type: 'endTurn', player: 'p0' });
    expect(getPending(s)).toEqual({ kind: 'post', player: 'p1' });
    expect(fxTypes(s)).toContain('frozen');
  });

  it('lightning chains half the damage to another enemy', () => {
    const bolt = card('lightning'), n9 = card('number', 9);
    let s = setup([[bolt, n9], [], []], { elements: true });
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [bolt.id, n9.id] });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p1').hp).toBe(90);
    expect(getPlayer(s, 'p2').hp).toBe(95);
  });

  it('a blocked attack lands no elements', () => {
    const fire = card('fire'), b = card('block');
    let s = setup([[fire], [b]], { elements: true });
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [fire.id] });
    s = act(s, { type: 'respond', player: 'p1', cardId: b.id });
    expect(getPlayer(s, 'p1').burn).toBe(0);
  });
});

describe('ultimates', () => {
  it('charge from dealing and taking damage, capped at 100', () => {
    const n9 = card('number', 9), x3 = card('multiplier', 3);
    let s = setup([[n9, x3], []], { ultimates: true });
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [n9.id, x3.id] });
    s = act(s, { type: 'pass', player: 'p1' });
    expect(getPlayer(s, 'p0').charge).toBe(30);
    expect(getPlayer(s, 'p1').charge).toBe(18);
  });

  it('need a full meter', () => {
    const s = setup([[], []], { ultimates: true });
    expect(applyAction(s, { type: 'ultimate', player: 'p0', target: 'p1' }).ok).toBe(false);
  });

  it('Holy Crusade deals 25 that skips the chain', () => {
    let s = setup([[], [card('block')]], { ultimates: true });
    getPlayer(s, 'p0').charge = 100;
    s = act(s, { type: 'ultimate', player: 'p0', target: 'p1' });
    expect(getPlayer(s, 'p1').hp).toBe(75);
    expect(getPlayer(s, 'p0').charge).toBe(0);
    expect(getPending(s)).toEqual({ kind: 'main', player: 'p0' });
  });

  it('Bulwark blocks the next two attacks automatically', () => {
    let s = setup([[], []], { ultimates: true }, [seat(0), seat(1, { fighter: 1 })]);
    s = act(s, { type: 'endTurn', player: 'p0' });
    getPlayer(s, 'p1').charge = 100;
    s = act(s, { type: 'ultimate', player: 'p1' });
    expect(getPlayer(s, 'p1').shield).toBe(2);
    s = act(s, { type: 'endTurn', player: 'p1' });
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] });
    expect(s.stack).toHaveLength(0);
    expect(getPlayer(s, 'p1').shield).toBe(1);
    expect(getPlayer(s, 'p1').hp).toBe(100);
  });

  it('Royal Decree heals up to max HP and Ambush steals cards', () => {
    let s = setup([[], [card('number', 1), card('number', 2)], []], { ultimates: true }, [seat(0, { fighter: 3 }), seat(1), seat(2)]);
    getPlayer(s, 'p0').hp = 50;
    getPlayer(s, 'p0').charge = 100;
    s = act(s, { type: 'ultimate', player: 'p0' });
    expect(getPlayer(s, 'p0').hp).toBe(80);

    s = setup([[], [card('number', 1), card('number', 2)]], { ultimates: true }, [seat(0, { fighter: 5 }), seat(1)]);
    getPlayer(s, 'p0').charge = 100;
    s = act(s, { type: 'ultimate', player: 'p0', target: 'p1' });
    expect(getPlayer(s, 'p0').hand).toHaveLength(2);
    expect(getPlayer(s, 'p1').hand).toHaveLength(0);
  });
});

describe('wild events', () => {
  it('Double Damage and Frenzy change attack damage', () => {
    const s = setup([[], []]);
    const packet = { id: 1, kind: 'attack' as const, from: 'p0', to: 'p1', origin: 'p0', cards: [], numbers: 4, multiplier: 2, elements: [] };
    triggerEvent(s, 'double');
    expect(packetDamage(s, packet)).toBe(20);
    s.event = { kind: 'frenzy', untilTurn: 9 };
    expect(packetDamage(s, packet)).toBe(20);
  });

  it('Mirror Ban stops Reverse and Silence stops action cards', () => {
    const r = card('reverse'), sk = card('skip');
    let s = setup([[sk], [r]]);
    triggerEvent(s, 'silence');
    expect(applyAction(s, { type: 'playAction', player: 'p0', cardId: sk.id, target: 'p1' }).ok).toBe(false);
    s = setup([[], [r]]);
    triggerEvent(s, 'noReverse');
    s = act(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] });
    expect(applyAction(s, { type: 'respond', player: 'p1', cardId: r.id }).ok).toBe(false);
  });

  it('instant events heal, deal cards and rotate hands', () => {
    const a = card('number', 1), b = card('number', 2);
    const s = setup([[a], [b]]);
    getPlayer(s, 'p0').hp = 50;
    triggerEvent(s, 'spring');
    expect(getPlayer(s, 'p0').hp).toBe(60);
    triggerEvent(s, 'chaos');
    expect(getPlayer(s, 'p0').hand).toEqual([b]);
    expect(getPlayer(s, 'p1').hand).toEqual([a]);
    triggerEvent(s, 'cardRain');
    expect(getPlayer(s, 'p0').hand).toHaveLength(3);
  });

  it('lasting events end after a lap', () => {
    let s = setup([[], []]);
    triggerEvent(s, 'double');
    s = act(s, { type: 'endTurn', player: 'p0' });
    s = act(s, { type: 'endTurn', player: 'p1' });
    expect(s.event).toBeNull();
  });
});

describe('teams and bosses', () => {
  const teams = [seat(0, { team: 1 }), seat(1, { team: 1 }), seat(2, { team: 2 })];

  it("can't target a teammate", () => {
    const s = setup([[], [], []], {}, teams);
    expect(applyAction(s, { type: 'attack', player: 'p0', target: 'p1', cardIds: [] }).ok).toBe(false);
  });

  it('a team wins together when only teammates remain', () => {
    let s = setup([[], [], []], {}, teams);
    getPlayer(s, 'p2').hp = 1;
    s = act(s, { type: 'attack', player: 'p0', target: 'p2', cardIds: [] });
    s = act(s, { type: 'pass', player: 'p2' });
    expect(s.winner).toBe('p0');
    expect(s.log.at(-1)?.fx).toEqual({ type: 'win', who: 'p0', team: 1 });
  });

  it('bosses get their own HP and rage every third turn', () => {
    let s = setup([[], [], []], {}, [seat(0, { team: 1 }), seat(1, { team: 1 }), seat(2, { boss: true, hp: 300, team: 2 })]);
    expect(getPlayer(s, 'p2').hp).toBe(300);
    for (let round = 0; round < 3; round++) {
      s = act(s, { type: 'endTurn', player: 'p0' });
      s = act(s, { type: 'endTurn', player: 'p1' });
      s = act(s, { type: 'endTurn', player: 'p2' });
    }
    expect(getPlayer(s, 'p0').hp).toBe(88);
    expect(fxTypes(s)).toContain('rage');
  });
});

describe('everything on: bot simulations', () => {
  const run = (seats: SeatSetup[], config: Partial<GameConfig>, games: number) => {
    for (let seed = 1; seed <= games; seed++) {
      let s = createGame(seats, { seed, elements: true, ultimates: true, wildEvents: true, ...config });
      let r = seed;
      const random = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      let steps = 0;
      while (!s.winner) {
        const pending = getPending(s);
        if (pending.kind === 'gameOver') break;
        const action = decideBot(getPlayerView(s, pending.player), random);
        const res = applyAction(s, action);
        if (!res.ok) throw new Error(`seed ${seed}: ${res.error} for ${JSON.stringify(action)}`);
        s = res.state;
        if (++steps > 30000) throw new Error(`seed ${seed}: game did not finish`);
      }
      expect(s.winner).not.toBeNull();
    }
  };

  it('free-for-all with elements, ultimates and wild events', () => run([0, 1, 2, 3, 4].map((i) => seat(i)), {}, 20));
  it('2v2 teams', () => run([seat(0, { team: 1 }), seat(1, { team: 2 }), seat(2, { team: 1 }), seat(3, { team: 2 })], {}, 15));
  it('boss battle, three against one', () =>
    run([seat(0, { team: 1 }), seat(1, { team: 1 }), seat(2, { team: 1 }), seat(3, { team: 2, boss: true, hp: 300, handSize: 10 })], {}, 15));
});

describe('replays', () => {
  it('replaying the recorded actions from the same setup reproduces the game exactly', () => {
    const seats = [0, 1, 2].map((i) => seat(i));
    const config = { seed: 42, elements: true, ultimates: true, wildEvents: true };
    let s = createGame(seats, config);
    const actions: Action[] = [];
    while (!s.winner) {
      const pending = getPending(s);
      if (pending.kind === 'gameOver') break;
      const a = decideBot(getPlayerView(s, pending.player));
      const res = applyAction(s, a);
      if (!res.ok) throw new Error(res.error);
      actions.push(a);
      s = res.state;
    }
    const replayed = actions.reduce((st, a) => act(st, a), createGame(seats, config));
    expect(replayed).toEqual(s);
  });
});
