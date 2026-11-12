import { CHARGE_DEALT, CHARGE_TAKEN, ultimateFor, WILD_EVENT_BY_KIND, WILD_EVENTS } from './abilities';
import { buildDeck, cardLabel, CARD_INFO, INITIATOR_KINDS, isActionCard, isAttackCard } from './cards';
import { nextRandom, shuffle } from './rng';
import type {
  Action,
  ActionResult,
  Card,
  CardKind,
  ControllerKind,
  ElementKind,
  FxEvent,
  GameConfig,
  GameState,
  LogTone,
  Packet,
  Pending,
  PlayerId,
  PlayerState,
  PlayerView,
  WildEventKind,
} from './types';

export const DEFAULT_CONFIG: GameConfig = {
  startingHp: 100,
  handSize: 7,
  drawCount: 2,
  baseDamage: 1,
  seed: 1,
  elements: false,
  ultimates: false,
  wildEvents: false,
};

export interface SeatSetup {
  id: PlayerId;
  name: string;
  controller: ControllerKind;
  /** Character (portrait and ultimate); defaults to the seat index. */
  fighter?: number;
  /** Seats with the same team number play together. */
  team?: number | null;
  /** Starting (and maximum) HP for this seat; defaults to the config. */
  hp?: number;
  handSize?: number;
  /** Boss seats draw an extra card and unleash a rage attack every third turn. */
  boss?: boolean;
  /** Specific cards dealt first (tutorials and challenges). */
  startCards?: { kind: CardKind; value: number }[];
}

/** Damage every enemy takes from a boss's rage. */
export const BOSS_RAGE = 12;
/** A wild event rolls on every turn number divisible by this. */
export const EVENT_EVERY = 5;

export function createGame(seats: SeatSetup[], config: Partial<GameConfig> = {}): GameState {
  if (seats.length < 2 || seats.length > 6) throw new Error('Cardsade needs 2 to 6 players');
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const [deck, rng] = shuffle(buildDeck({ elements: cfg.elements }), cfg.seed);
  const state: GameState = {
    config: cfg,
    players: seats.map((s, i) => ({
      id: s.id,
      name: s.name,
      controller: s.controller,
      hp: s.hp ?? cfg.startingHp,
      maxHp: s.hp ?? cfg.startingHp,
      hand: [],
      eliminated: false,
      skipped: false,
      fighter: s.fighter ?? i,
      team: s.team ?? null,
      charge: 0,
      burn: 0,
      burnBy: null,
      frozen: false,
      shield: 0,
      boss: s.boss ?? false,
      turns: 0,
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
    event: null,
  };
  seats.forEach((s, i) => {
    const p = state.players[i];
    (s.startCards ?? []).forEach((c, k) => p.hand.push({ id: `s${i}-${k}`, kind: c.kind, value: c.value }));
    drawCards(state, p, Math.max(0, (s.handSize ?? cfg.handSize) - p.hand.length));
  });
  log(state, `Turn 1: ${seats[0].name}`, 'info', { type: 'turn', who: seats[0].id });
  state.players[0].turns = 1;
  return state;
}

/** Attack damage including any wild event in force. */
export function packetDamage(state: { config: GameConfig; event?: GameState['event'] }, packet: Packet): number {
  const frenzy = state.event?.kind === 'frenzy' ? 5 : 0;
  const double = state.event?.kind === 'double' ? 2 : 1;
  return (state.config.baseDamage + frenzy + packet.numbers) * packet.multiplier * double;
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

/** True when two seats are on the same (non-null) team. */
export function allies(a: { team: number | null }, b: { team: number | null }): boolean {
  return a.team !== null && a.team === b.team;
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
    stack: state.stack.map((p) => ({ ...p, cards: p.cards.slice(), elements: p.elements.slice() })),
    pending,
    revealedHand:
      pending.kind === 'choose' && pending.player === viewer ? getPlayer(state, pending.target).hand.slice() : null,
    winner: state.winner,
    log: state.log.slice(-60),
    event: state.event ? { ...state.event } : null,
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
      if (state.event?.kind === 'silence') return fail('Silence: action cards cannot be played this round');
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
        if (!isAttackCard(c)) return fail('Only number, multiplier and element cards go on an attack');
        cards.push(c);
      }
      takeCards(player, action.cardIds);
      state.turn.attacked = true;
      if (consumeSkip(state, player, cards)) break;
      const target = getPlayer(state, action.target);
      const packet = pushPacket(state, 'attack', player.id, target.id, cards);
      for (const c of cards) {
        if (c.kind === 'number') packet.numbers += c.value;
        else if (c.kind === 'multiplier') packet.multiplier *= c.value;
        else if (!packet.elements.includes(c.kind as ElementKind)) packet.elements.push(c.kind as ElementKind);
      }
      const extra = cards.length ? ` (${cards.map(cardLabel).join(' ')})` : '';
      log(state, `${player.name} attacks ${target.name} for ${packetDamage(state, packet)}${extra}`, 'attack', {
        type: 'attack',
        from: player.id,
        to: target.id,
        amount: packetDamage(state, packet),
      });
      shieldCheck(state);
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
      if (card.kind === 'reverse' && state.event?.kind === 'noReverse') return fail('Mirror Ban: Reverse cannot be played this round');
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
        shieldCheck(state);
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
      const got = drawCards(state, player, state.config.drawCount + (player.boss ? 1 : 0));
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

    case 'ultimate': {
      if (!state.config.ultimates) return fail('Ultimates are off in this game');
      if (pending.kind !== 'main') return fail('Ultimates are used on your turn, before you attack');
      if (player.charge < 100) return fail('Your ultimate is not charged yet');
      const ult = ultimateFor(player.fighter);
      let target: PlayerState | null = null;
      if (ult.targeted) {
        if (!action.target) return fail('Pick a target for your ultimate');
        const err = checkTarget(state, player, action.target);
        if (err) return fail(err);
        target = getPlayer(state, action.target);
      }
      player.charge = 0;
      log(state, `${player.name} unleashes ${ult.name}${target ? ` on ${target.name}` : ''}!`, 'attack', {
        type: 'ultimate',
        who: player.id,
        kind: ult.kind,
        target: target?.id ?? null,
      });
      useUltimate(state, player, ult.kind, target);
      // An ultimate's own damage doesn't refill the meter it just spent.
      player.charge = 0;
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
  if (allies(player, target)) return "You can't target a teammate";
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
  const packet: Packet = { id: state.nextId++, kind, from, to, origin: from, cards, numbers: 0, multiplier: 1, elements: [] };
  state.stack.push(packet);
  return packet;
}

/** A shielded player's Bulwark eats an attack aimed at them before they need to respond. */
function shieldCheck(state: GameState) {
  const top = state.stack[state.stack.length - 1];
  if (!top || top.kind !== 'attack') return;
  const target = getPlayer(state, top.to);
  if (target.shield <= 0) return;
  target.shield--;
  state.stack.pop();
  state.discard.push(...top.cards);
  log(state, `${target.name}'s Bulwark blocks the attack`, 'defend', { type: 'shielded', who: target.id, against: top.from });
}

export function describePacket(state: { config: GameConfig; event?: GameState['event'] }, packet: Packet): string {
  if (packet.kind === 'attack') return `attack (${packetDamage(state, packet)} dmg)`;
  return CARD_INFO[packet.kind].name;
}

function rand(state: GameState): number {
  const [v, next] = nextRandom(state.rng);
  state.rng = next;
  return v;
}

/** Applies damage, charges both ultimate meters, and knocks out at 0 HP. */
function dealDamage(state: GameState, target: PlayerState, amount: number, by: PlayerId, text?: string) {
  if (target.eliminated || amount <= 0) return;
  target.hp = Math.max(0, target.hp - amount);
  log(state, text ?? `${target.name} takes ${amount} damage (${target.hp} HP left)`, 'damage', {
    type: 'damage',
    to: target.id,
    from: by,
    amount,
    hp: target.hp,
  });
  if (state.config.ultimates) {
    const source = state.players.find((p) => p.id === by);
    if (source && source.id !== target.id && !source.eliminated) {
      source.charge = Math.min(100, source.charge + Math.ceil(amount * CHARGE_DEALT * (source.boss ? 0.5 : 1)));
    }
    target.charge = Math.min(100, target.charge + Math.ceil(amount * CHARGE_TAKEN * (target.boss ? 0.5 : 1)));
  }
  if (target.hp <= 0) eliminate(state, target, by);
}

function heal(state: GameState, player: PlayerState, amount: number) {
  if (player.eliminated) return;
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + amount);
  const gained = player.hp - before;
  if (gained > 0) log(state, `${player.name} heals ${gained} (${player.hp} HP)`, 'action', { type: 'heal', who: player.id, amount: gained, hp: player.hp });
}

function enemiesOf(state: GameState, player: PlayerState): PlayerState[] {
  return state.players.filter((p) => p.id !== player.id && !p.eliminated && !allies(p, player));
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
      dealDamage(state, target, dmg, from.id);
      landElements(state, packet, from, target, dmg);
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

/** Fire, Ice and Lightning trigger when an attack lands. */
function landElements(state: GameState, packet: Packet, from: PlayerState, target: PlayerState, dmg: number) {
  for (const el of packet.elements) {
    if (el === 'fire' && !target.eliminated) {
      target.burn = 3;
      target.burnBy = from.id;
      log(state, `${target.name} is set on fire`, 'action', { type: 'burn', who: target.id, by: from.id });
    } else if (el === 'ice' && !target.eliminated) {
      target.frozen = true;
      log(state, `${target.name} is frozen solid`, 'action', { type: 'freeze', who: target.id });
    } else if (el === 'lightning') {
      const others = enemiesOf(state, from).filter((p) => p.id !== target.id);
      if (!others.length) continue;
      const victim = others[Math.floor(rand(state) * others.length)];
      const amount = Math.floor(dmg / 2);
      log(state, `Lightning arcs from ${target.name} to ${victim.name}`, 'attack', { type: 'chain', from: target.id, to: victim.id, amount });
      if (victim.shield > 0) {
        victim.shield--;
        log(state, `${victim.name}'s Bulwark absorbs the lightning`, 'defend', { type: 'shielded', who: victim.id, against: from.id });
      } else {
        dealDamage(state, victim, amount, from.id);
      }
    }
  }
}

function useUltimate(state: GameState, player: PlayerState, kind: ReturnType<typeof ultimateFor>['kind'], target: PlayerState | null) {
  switch (kind) {
    case 'crusade':
      dealDamage(state, target!, 25, player.id);
      break;
    case 'bulwark':
      player.shield += 2;
      break;
    case 'hexstorm':
      for (const enemy of enemiesOf(state, player)) {
        const lost: Card[] = [];
        for (let i = 0; i < 2 && enemy.hand.length; i++) {
          lost.push(...enemy.hand.splice(Math.floor(rand(state) * enemy.hand.length), 1));
        }
        state.discard.push(...lost);
        if (lost.length) log(state, `${enemy.name} discards ${lost.length} cards`, 'action', { type: 'discard', who: enemy.id, count: lost.length });
      }
      break;
    case 'decree':
      heal(state, player, 30);
      break;
    case 'souldrain':
      dealDamage(state, target!, 20, player.id);
      heal(state, player, 20);
      break;
    case 'ambush': {
      const taken: Card[] = [];
      for (let i = 0; i < 2 && target!.hand.length; i++) {
        taken.push(...target!.hand.splice(Math.floor(rand(state) * target!.hand.length), 1));
      }
      player.hand.push(...taken);
      log(state, `${player.name} steals ${taken.length} card${taken.length === 1 ? '' : 's'} from ${target!.name}`, 'action', {
        type: 'steal',
        from: target!.id,
        to: player.id,
        count: taken.length,
      });
      break;
    }
  }
}

/** `by` is whoever sent the hit that finished them (credited with the K.O.). */
function eliminate(state: GameState, player: PlayerState, by: PlayerId) {
  player.eliminated = true;
  player.skipped = false;
  player.burn = 0;
  player.frozen = false;
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
      startTurn(state, next);
      return;
    }
  }
}

/** Start-of-turn effects: wild events, burn, boss rage, freeze. */
function startTurn(state: GameState, player: PlayerState) {
  player.turns++;
  rollEvents(state);
  if (player.burn > 0) {
    player.burn--;
    dealDamage(state, player, 3, player.burnBy ?? player.id, `${player.name} burns for 3 (${Math.max(0, player.hp - 3)} HP left)`);
    if (player.eliminated) return;
  }
  if (player.boss && player.turns % 3 === 0) {
    log(state, `${player.name} unleashes a rage attack!`, 'attack', { type: 'rage', who: player.id });
    for (const enemy of enemiesOf(state, player)) dealDamage(state, enemy, BOSS_RAGE, player.id);
  }
  if (player.frozen) {
    player.frozen = false;
    state.turn.attacked = true;
    log(state, `${player.name} is frozen and loses their attack`, 'action', { type: 'frozen', who: player.id });
  }
}

function rollEvents(state: GameState) {
  if (state.event && state.turn.number >= state.event.untilTurn) {
    log(state, `${WILD_EVENT_BY_KIND[state.event.kind].name} ends`, 'info', { type: 'event', kind: state.event.kind, active: false });
    state.event = null;
  }
  if (!state.config.wildEvents || state.event || state.turn.number % EVENT_EVERY !== 0) return;
  const info = WILD_EVENTS[Math.floor(rand(state) * WILD_EVENTS.length)];
  triggerEvent(state, info.kind);
}

/** Starts a wild event now (exported for challenges and tests). */
export function triggerEvent(state: GameState, kind: WildEventKind) {
  const info = WILD_EVENT_BY_KIND[kind];
  const alive = state.players.filter((p) => !p.eliminated);
  log(state, `Wild event: ${info.name}! ${info.description}`, 'action', { type: 'event', kind, active: true });
  switch (kind) {
    case 'cardRain':
      for (const p of alive) drawCards(state, p, 2);
      break;
    case 'spring':
      for (const p of alive) heal(state, p, 10);
      break;
    case 'chaos': {
      const hands = alive.map((p) => p.hand);
      alive.forEach((p, i) => (p.hand = hands[(i - 1 + alive.length) % alive.length]));
      break;
    }
    default:
      state.event = { kind, untilTurn: state.turn.number + alive.length };
  }
}

/** Housekeeping after every action: drop dead players' packets, check for a winner, skip dead turns. */
function settle(state: GameState) {
  for (let guard = 0; guard < state.players.length * 3; guard++) {
    const alive = state.players.filter((p) => !p.eliminated);
    state.stack = state.stack.filter((p) => {
      const ok = !getPlayer(state, p.from).eliminated && !getPlayer(state, p.to).eliminated;
      if (!ok) state.discard.push(...p.cards);
      return ok;
    });
    const oneSide = alive.length > 1 && alive.every((p) => allies(p, alive[0]));
    if (alive.length <= 1 || oneSide) {
      state.stack = [];
      state.choice = null;
      const winner = alive[0] ?? getPlayer(state, state.turn.player);
      state.winner = winner.id;
      const label = oneSide ? `Team ${alive.map((p) => p.name).join(' & ')}` : winner.name;
      log(state, `${label} win${oneSide ? '' : 's'} Cardsade!`, 'win', { type: 'win', who: winner.id, team: oneSide ? winner.team : null });
      return;
    }
    if (state.stack.length === 0 && !state.choice && getPlayer(state, state.turn.player).eliminated) {
      advanceTurn(state);
      continue;
    }
    return;
  }
}

function log(state: GameState, text: string, tone: LogTone, fx?: FxEvent) {
  state.log.push({ id: state.nextId++, text, tone, fx });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}

