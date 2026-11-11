import { buildDeck, cardLabel, CARD_INFO, INITIATOR_KINDS, isActionCard } from './cards';
import { shuffle } from './rng';
import type {
  Action,
  ActionResult,
  Card,
  ControllerKind,
  FxEvent,
  GameConfig,
  GameState,
  LogTone,
  Packet,
  Pending,
  PlayerId,
  PlayerState,
  PlayerView,
} from './types';

export const DEFAULT_CONFIG: GameConfig = {
  startingHp: 100,
  handSize: 7,
  drawCount: 2,
  baseDamage: 1,
  seed: 1,
};

export interface SeatSetup {
  id: PlayerId;
  name: string;
  controller: ControllerKind;
}

export function createGame(seats: SeatSetup[], config: Partial<GameConfig> = {}): GameState {
  if (seats.length < 2 || seats.length > 6) throw new Error('Cardsade needs 2 to 6 players');
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const [deck, rng] = shuffle(buildDeck(), cfg.seed);
  const state: GameState = {
    config: cfg,
    players: seats.map((s) => ({
      ...s,
      hp: cfg.startingHp,
      hand: [],
      eliminated: false,
      skipped: false,
    })),
    deck,
    discard: [],
    turn: { player: seats[0].id, number: 1, attacked: false },
    stack: [],
    choice: null,
    winner: null,
    log: [],
    rng,
    nextId: 1,
  };
  for (const p of state.players) drawCards(state, p, cfg.handSize);
  log(state, `Turn 1: ${seats[0].name}`, 'info', { type: 'turn', who: seats[0].id });
  return state;
}

export function packetDamage(state: Pick<GameState, 'config'>, packet: Packet): number {
  return (state.config.baseDamage + packet.numbers) * packet.multiplier;
}

export function getPending(state: GameState): Pending {
  if (state.winner) return { kind: 'gameOver', winner: state.winner };
  if (state.choice) return { kind: 'choose', player: state.choice.chooser, target: state.choice.target };
  const top = state.stack[state.stack.length - 1];
  if (top) return { kind: 'response', player: top.to, packet: top };
  return { kind: state.turn.attacked ? 'post' : 'main', player: state.turn.player };
}

export function getPlayer(state: { players: PlayerState[] }, id: PlayerId): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

export function getPlayerView(state: GameState, viewer: PlayerId): PlayerView {
  const pending = getPending(state);
  const me = getPlayer(state, viewer);
  return {
    viewer,
    config: state.config,
    players: state.players.map(({ hand, ...rest }) => ({ ...rest, handCount: hand.length })),
    hand: me.hand.slice(),
    deckCount: state.deck.length,
    discardTop: state.discard[state.discard.length - 1] ?? null,
    discardRecent: state.discard.slice(-4),
    discardCount: state.discard.length,
    turn: { ...state.turn },
    stack: state.stack.map((p) => ({ ...p, cards: p.cards.slice() })),
    pending,
    revealedHand:
      pending.kind === 'choose' && pending.player === viewer ? getPlayer(state, pending.target).hand.slice() : null,
    winner: state.winner,
    log: state.log.slice(-60),
  };
}

/** Validates and applies an action. Never mutates the input state. */
export function applyAction(input: GameState, action: Action): ActionResult {
  const state = structuredClone(input);
  const pending = getPending(state);
  if (pending.kind === 'gameOver') return fail('The game is over');
  if (pending.player !== action.player) return fail("It's not your decision right now");
  const player = getPlayer(state, action.player);

  switch (action.type) {
    case 'playAction': {
      if (pending.kind !== 'main') return fail('Action cards are played on your turn, before you attack');
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return fail("That card isn't in your hand");
      if (!INITIATOR_KINDS.includes(card.kind)) return fail(`${CARD_INFO[card.kind].name} can't be played on your turn`);
      const err = checkTarget(state, player, action.target);
      if (err) return fail(err);
      takeCards(player, [card.id]);
      if (consumeSkip(state, player, [card])) break;
      const target = getPlayer(state, action.target);
      pushPacket(state, card.kind as Packet['kind'], player.id, target.id, [card]);
      log(state, `${player.name} plays ${cardLabel(card)} on ${target.name}`, 'action', {
        type: 'action',
        from: player.id,
        to: target.id,
        card: card.kind,
      });
      break;
    }

    case 'attack': {
      if (pending.kind !== 'main') return fail("You can't attack right now");
      const err = checkTarget(state, player, action.target);
      if (err) return fail(err);
      if (new Set(action.cardIds).size !== action.cardIds.length) return fail('Duplicate cards');
      const cards: Card[] = [];
      for (const id of action.cardIds) {
        const c = player.hand.find((x) => x.id === id);
        if (!c) return fail("That card isn't in your hand");
        if (c.kind !== 'number' && c.kind !== 'multiplier') return fail('Only number and multiplier cards go on an attack');
        cards.push(c);
      }
      takeCards(player, action.cardIds);
      state.turn.attacked = true;
      if (consumeSkip(state, player, cards)) break;
      const target = getPlayer(state, action.target);
      const packet = pushPacket(state, 'attack', player.id, target.id, cards);
      for (const c of cards) {
        if (c.kind === 'number') packet.numbers += c.value;
        else packet.multiplier *= c.value;
      }
      const extra = cards.length ? ` (${cards.map(cardLabel).join(' ')})` : '';
      log(state, `${player.name} attacks ${target.name} for ${packetDamage(state, packet)}${extra}`, 'attack', {
        type: 'attack',
        from: player.id,
        to: target.id,
        amount: packetDamage(state, packet),
      });
      break;
    }

    case 'respond': {
      if (pending.kind !== 'response') return fail('Nothing is coming at you');
      const packet = state.stack[state.stack.length - 1];
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return fail("That card isn't in your hand");
      const multIds = action.multiplierIds ?? [];
      if (multIds.length && (card.kind !== 'reverse' || packet.kind !== 'attack'))
        return fail('Multipliers can only be added when you reverse an attack');
      if (new Set(multIds).size !== multIds.length || multIds.includes(card.id)) return fail('Duplicate cards');
      const mults: Card[] = [];
      for (const id of multIds) {
        const c = player.hand.find((x) => x.id === id);
        if (!c || c.kind !== 'multiplier') return fail("That multiplier isn't in your hand");
        mults.push(c);
      }
      if (card.kind !== 'block' && card.kind !== 'reverse' && card.kind !== 'skip')
        return fail(`${CARD_INFO[card.kind].name} can't be used as a response`);
      takeCards(player, [card.id, ...multIds]);
      if (consumeSkip(state, player, [card, ...mults])) break;
      const from = getPlayer(state, packet.from);

      if (card.kind === 'block') {
        state.stack.pop();
        state.discard.push(card, ...packet.cards);
        log(state, `${player.name} blocks ${from.name}'s ${describePacket(state, packet)}`, 'defend', {
          type: 'block',
          by: player.id,
          against: from.id,
        });
      } else if (card.kind === 'reverse') {
        packet.from = player.id;
        packet.to = from.id;
        packet.cards.push(card, ...mults);
        for (const m of mults) packet.multiplier *= m.value;
        const boost = mults.length ? ` and boosts it with ${mults.map(cardLabel).join(' ')}` : '';
        log(state, `${player.name} reverses the ${describePacket(state, packet)} back at ${from.name}${boost}`, 'defend', {
          type: 'reverse',
          from: player.id,
          to: from.id,
          amount: packet.kind === 'attack' ? packetDamage(state, packet) : null,
        });
      } else {
        pushPacket(state, 'skip', player.id, from.id, [card]);
        log(state, `${player.name} answers with Skip against ${from.name}`, 'defend', {
          type: 'skipCounter',
          from: player.id,
          to: from.id,
        });
      }
      break;
    }

    case 'pass': {
      if (pending.kind !== 'response') return fail('Nothing to pass on');
      resolveTop(state);
      break;
    }

    case 'chooseDiscard': {
      if (pending.kind !== 'choose') return fail('No card to choose');
      const target = getPlayer(state, pending.target);
      const card = target.hand.find((c) => c.id === action.cardId);
      if (!card) return fail("That card isn't in their hand");
      takeCards(target, [card.id]);
      state.discard.push(card);
      state.choice = null;
      log(state, `${player.name} makes ${target.name} discard ${cardLabel(card)}`, 'action', {
        type: 'discard',
        who: target.id,
        count: 1,
      });
      break;
    }

    case 'draw': {
      if (pending.kind !== 'main' && pending.kind !== 'post') return fail("You can't draw right now");
      const got = drawCards(state, player, state.config.drawCount);
      log(state, `${player.name} draws ${got} card${got === 1 ? '' : 's'} and ends their turn`, 'info', {
        type: 'draw',
        who: player.id,
        count: got,
      });
      advanceTurn(state);
      break;
    }

    case 'endTurn': {
      if (pending.kind !== 'main' && pending.kind !== 'post') return fail("You can't end your turn right now");
      log(state, `${player.name} ends their turn`, 'info');
      advanceTurn(state);
      break;
    }
  }

  settle(state);
  return { ok: true, state };
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function checkTarget(state: GameState, player: PlayerState, targetId: PlayerId): string | null {
  const target = state.players.find((p) => p.id === targetId);
  if (!target) return 'Unknown target';
  if (target.id === player.id) return "You can't target yourself";
  if (target.eliminated) return 'That player is out';
  return null;
}

function takeCards(player: PlayerState, ids: string[]) {
  player.hand = player.hand.filter((c) => !ids.includes(c.id));
}

/** If the player is under Skip, their play is wasted: cards go to discard and nothing happens. */
function consumeSkip(state: GameState, player: PlayerState, cards: Card[]): boolean {
  if (!player.skipped) return false;
  player.skipped = false;
  state.discard.push(...cards);
  const what = cards.length ? cards.map(cardLabel).join(' ') : 'attack';
  log(state, `${player.name} was skipped: their ${what} does nothing`, 'action', { type: 'wasted', who: player.id });
  return true;
}

function pushPacket(state: GameState, kind: Packet['kind'], from: PlayerId, to: PlayerId, cards: Card[]): Packet {
  const packet: Packet = { id: state.nextId++, kind, from, to, origin: from, cards, numbers: 0, multiplier: 1 };
  state.stack.push(packet);
  return packet;
}

export function describePacket(state: Pick<GameState, 'config'>, packet: Packet): string {
  if (packet.kind === 'attack') return `attack (${packetDamage(state, packet)} dmg)`;
  return CARD_INFO[packet.kind].name;
}

/** The current target let the top packet through: apply its effect to them. */
function resolveTop(state: GameState) {
  const packet = state.stack.pop()!;
  state.discard.push(...packet.cards);
  const target = getPlayer(state, packet.to);
  const from = getPlayer(state, packet.from);

  switch (packet.kind) {
    case 'attack': {
      const dmg = packetDamage(state, packet);
      target.hp = Math.max(0, target.hp - dmg);
      log(state, `${target.name} takes ${dmg} damage (${target.hp} HP left)`, 'damage', {
        type: 'damage',
        to: target.id,
        from: from.id,
        amount: dmg,
        hp: target.hp,
      });
      if (target.hp <= 0) eliminate(state, target, from.id);
      break;
    }
    case 'skip': {
      const below = state.stack[state.stack.length - 1];
      if (below && below.from === target.id) {
        // Played as a response: it cancels the card the target sent.
        state.stack.pop();
        state.discard.push(...below.cards);
        log(state, `${target.name}'s ${describePacket(state, below)} is skipped and does nothing`, 'defend', {
          type: 'cancelled',
          who: target.id,
        });
      } else {
        target.skipped = true;
        log(state, `${target.name} is skipped: their next card will be useless`, 'action', { type: 'skipped', who: target.id });
      }
      break;
    }
    case 'discard': {
      if (target.hand.length === 0) {
        log(state, `${target.name} has no cards to discard`, 'info');
      } else {
        state.choice = { chooser: from.id, target: target.id };
      }
      break;
    }
    case 'discardAction':
    case 'discardAttack':
    case 'discardMultipliers': {
      const matches = {
        discardAction: isActionCard,
        discardAttack: (c: Card) => c.kind === 'number',
        discardMultipliers: (c: Card) => c.kind === 'multiplier',
      }[packet.kind];
      const lost = target.hand.filter(matches);
      target.hand = target.hand.filter((c) => !matches(c));
      state.discard.push(...lost);
      log(state, `${target.name} discards ${lost.length} card${lost.length === 1 ? '' : 's'}`, 'action', {
        type: 'discard',
        who: target.id,
        count: lost.length,
      });
      break;
    }
  }
}

/** `by` is whoever sent the hit that finished them (credited with the K.O.). */
function eliminate(state: GameState, player: PlayerState, by: PlayerId) {
  player.eliminated = true;
  player.skipped = false;
  state.discard.push(...player.hand);
  player.hand = [];
  log(state, `${player.name} is knocked out!`, 'ko', { type: 'ko', who: player.id, by });
}

function drawCards(state: GameState, player: PlayerState, count: number): number {
  let got = 0;
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break;
      [state.deck, state.rng] = shuffle(state.discard, state.rng);
      state.discard = [];
      log(state, 'The discard pile is shuffled into a new deck', 'info');
    }
    player.hand.push(state.deck.pop()!);
    got++;
  }
  return got;
}

function advanceTurn(state: GameState) {
  const seats = state.players;
  const start = seats.findIndex((p) => p.id === state.turn.player);
  for (let i = 1; i <= seats.length; i++) {
    const next = seats[(start + i) % seats.length];
    if (!next.eliminated) {
      state.turn = { player: next.id, number: state.turn.number + 1, attacked: false };
      log(state, `Turn ${state.turn.number}: ${next.name}`, 'info', { type: 'turn', who: next.id });
      return;
    }
  }
}

/** Housekeeping after every action: drop dead players' packets, check for a winner, skip dead turns. */
function settle(state: GameState) {
  const alive = state.players.filter((p) => !p.eliminated);
  state.stack = state.stack.filter((p) => {
    const ok = !getPlayer(state, p.from).eliminated && !getPlayer(state, p.to).eliminated;
    if (!ok) state.discard.push(...p.cards);
    return ok;
  });
  if (alive.length <= 1) {
    state.stack = [];
    state.choice = null;
    state.winner = alive[0]?.id ?? state.turn.player;
    log(state, `${getPlayer(state, state.winner).name} wins Cardsade!`, 'win', { type: 'win', who: state.winner });
    return;
  }
  if (state.stack.length === 0 && !state.choice && getPlayer(state, state.turn.player).eliminated) {
    advanceTurn(state);
  }
}

function log(state: GameState, text: string, tone: LogTone, fx?: FxEvent) {
  state.log.push({ id: state.nextId++, text, tone, fx });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}
