export type PlayerId = string;

export type CardKind =
  | 'number'
  | 'multiplier'
  | 'block'
  | 'reverse'
  | 'skip'
  | 'discard'
  | 'discardAction'
  | 'discardAttack'
  | 'discardMultipliers';

export interface Card {
  id: string;
  kind: CardKind;
  /** Face value for number cards, factor for multipliers, 0 otherwise. */
  value: number;
}

/** Who makes decisions for a seat. `remote` is reserved for networked players. */
export type ControllerKind = 'human' | 'bot' | 'remote';

export interface PlayerState {
  id: PlayerId;
  name: string;
  controller: ControllerKind;
  hp: number;
  hand: Card[];
  eliminated: boolean;
  /** Hit by Skip: the next play this player makes is nullified. */
  skipped: boolean;
}

export type PacketKind = 'attack' | 'skip' | 'discard' | 'discardAction' | 'discardAttack' | 'discardMultipliers';

/**
 * Something in flight on the chain. Its current target (`to`) may respond with
 * Block, Reverse or Skip, or pass to let it resolve.
 */
export interface Packet {
  id: number;
  kind: PacketKind;
  from: PlayerId;
  to: PlayerId;
  /** The player who started it, before any reverses. */
  origin: PlayerId;
  /** Every card attached so far; they go to the discard pile when it resolves. */
  cards: Card[];
  /** Sum of number cards (attacks only). */
  numbers: number;
  /** Product of multiplier cards (attacks only). */
  multiplier: number;
}

export interface GameConfig {
  startingHp: number;
  handSize: number;
  drawCount: number;
  baseDamage: number;
  seed: number;
}

export interface TurnState {
  player: PlayerId;
  number: number;
  attacked: boolean;
}

export type LogTone = 'info' | 'attack' | 'damage' | 'defend' | 'action' | 'ko' | 'win';

export interface LogEntry {
  id: number;
  text: string;
  tone: LogTone;
}

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  deck: Card[];
  discard: Card[];
  turn: TurnState;
  stack: Packet[];
  /** Set while a resolved Discard waits for its caster to pick a card. */
  choice: { chooser: PlayerId; target: PlayerId } | null;
  winner: PlayerId | null;
  log: LogEntry[];
  rng: number;
  nextId: number;
}

export type Action =
  | { type: 'playAction'; player: PlayerId; cardId: string; target: PlayerId }
  | { type: 'attack'; player: PlayerId; target: PlayerId; cardIds: string[] }
  | { type: 'respond'; player: PlayerId; cardId: string; multiplierIds?: string[] }
  | { type: 'pass'; player: PlayerId }
  | { type: 'chooseDiscard'; player: PlayerId; cardId: string }
  | { type: 'draw'; player: PlayerId }
  | { type: 'endTurn'; player: PlayerId };

/** Whose decision the game is waiting on, and what kind. */
export type Pending =
  | { kind: 'main'; player: PlayerId }
  | { kind: 'post'; player: PlayerId }
  | { kind: 'response'; player: PlayerId; packet: Packet }
  | { kind: 'choose'; player: PlayerId; target: PlayerId }
  | { kind: 'gameOver'; winner: PlayerId };

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

/** A player as another seat sees them: hand contents are hidden. */
export interface PublicPlayer extends Omit<PlayerState, 'hand'> {
  handCount: number;
}

/**
 * Everything one seat is allowed to know. This is what a server would send to
 * a client, and what bots decide from, so they can't peek at hidden hands.
 */
export interface PlayerView {
  viewer: PlayerId;
  config: GameConfig;
  players: PublicPlayer[];
  hand: Card[];
  deckCount: number;
  discardTop: Card | null;
  discardCount: number;
  turn: TurnState;
  stack: Packet[];
  pending: Pending;
  /** The target's hand, revealed only to the player choosing a card to discard. */
  revealedHand: Card[] | null;
  winner: PlayerId | null;
  log: LogEntry[];
}
