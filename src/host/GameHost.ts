import { decideBot } from '../engine/bot';
import { applyAction, getPending, getPlayerView } from '../engine/engine';
import type { Action, GameState, PlayerId, PlayerView } from '../engine/types';

/**
 * What a UI talks to. A local game uses LocalClient; a networked game would
 * implement the same interface over a WebSocket (send actions up, receive
 * PlayerViews down) with a GameHost running on the server.
 */
export interface GameClient {
  readonly playerId: PlayerId;
  getView(): PlayerView;
  send(action: Action): { ok: true } | { ok: false; error: string };
  subscribe(listener: () => void): () => void;
  /**
   * Ask bots to wait at least `ms` before their next move, e.g. while a
   * cutscene plays. Presentation-only; a networked host may ignore it.
   */
  hold?(ms: number): void;
}

/**
 * Owns the authoritative GameState, validates every action through the
 * engine, and drives bot seats. Runs unchanged in a browser or on a server.
 */
export class GameHost {
  private state: GameState;
  private listeners = new Set<() => void>();
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private views = new Map<PlayerId, PlayerView>();
  private holdUntil = 0;

  constructor(
    initial: GameState,
    private options: { botDelayMs: number } = { botDelayMs: 900 },
  ) {
    this.state = initial;
    this.scheduleBot();
  }

  getState(): GameState {
    return this.state;
  }

  /** Cached per seat so React's useSyncExternalStore sees a stable snapshot. */
  getView(playerId: PlayerId): PlayerView {
    let view = this.views.get(playerId);
    if (!view) {
      view = getPlayerView(this.state, playerId);
      this.views.set(playerId, view);
    }
    return view;
  }

  dispatch(action: Action): { ok: true } | { ok: false; error: string } {
    const result = applyAction(this.state, action);
    if (!result.ok) return result;
    this.state = result.state;
    this.views.clear();
    this.listeners.forEach((l) => l());
    this.scheduleBot();
    return { ok: true };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Keep bots from moving for at least `ms` (cutscenes, big animations). */
  hold(ms: number) {
    this.holdUntil = Math.max(this.holdUntil, Date.now() + ms);
    if (this.botTimer) this.scheduleBot();
  }

  dispose() {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.listeners.clear();
  }

  client(playerId: PlayerId): GameClient {
    return {
      playerId,
      getView: () => this.getView(playerId),
      send: (action) => this.dispatch(action),
      subscribe: (l) => this.subscribe(l),
      hold: (ms) => this.hold(ms),
    };
  }

  private scheduleBot() {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    const pending = getPending(this.state);
    if (pending.kind === 'gameOver') return;
    const seat = this.state.players.find((p) => p.id === pending.player);
    if (seat?.controller !== 'bot') return;
    this.botTimer = setTimeout(() => {
      const action = decideBot(getPlayerView(this.state, seat.id));
      const result = this.dispatch(action);
      // A bad bot decision must never stall the game.
      if (!result.ok) this.dispatch(fallback(this.state, seat.id));
    }, Math.max(this.options.botDelayMs, this.holdUntil - Date.now()));
  }
}

function fallback(state: GameState, player: PlayerId): Action {
  const pending = getPending(state);
  if (pending.kind === 'response') return { type: 'pass', player };
  if (pending.kind === 'choose') {
    const target = state.players.find((p) => p.id === pending.target)!;
    return { type: 'chooseDiscard', player, cardId: target.hand[0].id };
  }
  return { type: 'endTurn', player };
}
