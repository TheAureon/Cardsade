import { applyAction, createGame, getPlayerView } from '../engine/engine';
import type { Action, GameState, PlayerId, PlayerView } from '../engine/types';
import type { GameClient, Recording } from './GameHost';

/**
 * Plays a recorded game back. Because the engine is deterministic, applying
 * the recorded actions to the recorded setup rebuilds every moment exactly.
 * Acts as a read-only GameClient (sending actions does nothing).
 */
export class ReplayHost {
  private state: GameState;
  private index = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private views = new Map<PlayerId, PlayerView>();
  private holdUntil = 0;
  playing = true;
  /** Milliseconds between moves. */
  speed = 900;

  constructor(private recording: Recording) {
    this.state = createGame(recording.seats, recording.config);
    this.schedule();
  }

  get progress() {
    return { step: this.index, total: this.recording.actions.length };
  }

  setPlaying(on: boolean) {
    this.playing = on;
    this.schedule();
    this.notify(false);
  }

  setSpeed(ms: number) {
    this.speed = ms;
    this.schedule();
    this.notify(false);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }

  client(viewer: PlayerId): GameClient {
    return {
      playerId: viewer,
      getView: () => {
        let v = this.views.get(viewer);
        if (!v) {
          v = getPlayerView(this.state, viewer);
          this.views.set(viewer, v);
        }
        return v;
      },
      send: () => ({ ok: false, error: 'This is a replay' }),
      subscribe: (l) => {
        this.listeners.add(l);
        return () => this.listeners.delete(l);
      },
      hold: (ms) => {
        this.holdUntil = Math.max(this.holdUntil, Date.now() + ms);
        this.schedule();
      },
    };
  }

  private step() {
    const action: Action | undefined = this.recording.actions[this.index];
    if (!action) return;
    const r = applyAction(this.state, action);
    this.index++;
    if (r.ok) this.state = r.state;
    this.notify(true);
    this.schedule();
  }

  private notify(changed: boolean) {
    if (changed) this.views.clear();
    this.listeners.forEach((l) => l());
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.playing || this.index >= this.recording.actions.length) return;
    this.timer = setTimeout(() => this.step(), Math.max(this.speed, this.holdUntil - Date.now()));
  }
}
