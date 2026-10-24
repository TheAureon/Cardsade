import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CARD_INFO, cardLabel, INITIATOR_KINDS } from '../engine/cards';
import { describePacket, packetDamage } from '../engine/engine';
import type { Action, Card, Packet, PlayerId, PlayerView, PublicPlayer } from '../engine/types';
import type { GameClient } from '../host/GameHost';
import { CardView, sortHand } from './CardView';

export function GameScreen({ client, onExit }: { client: GameClient; onExit: () => void }) {
  const view = useSyncExternalStore(client.subscribe, client.getView);
  const me = view.viewer;
  const pending = view.pending;
  const myTurnToAct = pending.kind !== 'gameOver' && pending.player === me;
  const opponents = view.players.filter((p) => p.id !== me);
  const self = view.players.find((p) => p.id === me)!;
  const nameOf = (id: PlayerId) => (id === me ? 'You' : view.players.find((p) => p.id === id)!.name);

  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<PlayerId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear the selection whenever the decision we're making changes.
  const decisionKey = `${pending.kind}:${'player' in pending ? pending.player : ''}:${view.stack.length}:${view.turn.number}`;
  useEffect(() => {
    setSelected([]);
    setError(null);
  }, [decisionKey]);

  // Keep the target valid; auto-pick when there's only one choice.
  const alive = opponents.filter((p) => !p.eliminated);
  useEffect(() => {
    if (target && !alive.some((p) => p.id === target)) setTarget(null);
    if (!target && alive.length === 1) setTarget(alive[0].id);
  }, [target, alive]);

  const send = (action: Action) => {
    const r = client.send(action);
    setError(r.ok ? null : r.error);
  };

  const hand = useMemo(() => sortHand(view.hand), [view.hand]);
  const selectedCards = hand.filter((c) => selected.includes(c.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const selectable = (c: Card): boolean => {
    if (!myTurnToAct) return false;
    if (pending.kind === 'main') return c.kind === 'number' || c.kind === 'multiplier' || INITIATOR_KINDS.includes(c.kind);
    if (pending.kind === 'response') return pending.packet.kind === 'attack' && c.kind === 'multiplier';
    return false;
  };

  return (
    <div className="game">
      <header className="topbar">
        <span className="brand">Cardsade</span>
        <span className="turn-info">
          Turn {view.turn.number} · {view.turn.player === me ? 'Your turn' : `${nameOf(view.turn.player)}'s turn`}
        </span>
        <button type="button" className="ghost" onClick={onExit}>
          Quit
        </button>
      </header>

      <section className="opponents">
        {opponents.map((p) => (
          <Seat
            key={p.id}
            player={p}
            view={view}
            isTarget={target === p.id}
            targetable={myTurnToAct && pending.kind === 'main' && !p.eliminated}
            onClick={() => setTarget(p.id)}
          />
        ))}
      </section>

      <section className="table">
        <div className="piles">
          <div className="pile">
            <div className="card card-back">{view.deckCount}</div>
            <span>Deck</span>
          </div>
          <div className="pile">
            {view.discardTop ? <CardView card={view.discardTop} small disabled /> : <div className="card card-empty" />}
            <span>Discard</span>
          </div>
        </div>
        <Chain view={view} nameOf={nameOf} />
        <div className="prompt">{promptText(view, nameOf, target)}</div>
        {error && <div className="error">{error}</div>}
      </section>

      <section className="me">
        <div className="me-stats">
          <strong>{self.name} (you)</strong>
          <HpBar hp={self.hp} max={view.config.startingHp} />
          {self.skipped && <span className="badge skipped">Skipped</span>}
          {self.eliminated && <span className="badge out">KO</span>}
        </div>
        {self.eliminated && pending.kind !== 'gameOver' && (
          <div className="controls">
            <span className="muted">You've been knocked out. Watching the rest of the crusade…</span>
            <button type="button" onClick={onExit}>
              New game
            </button>
          </div>
        )}

        {myTurnToAct && (
          <Controls
            view={view}
            selectedCards={selectedCards}
            target={target}
            nameOf={nameOf}
            send={send}
          />
        )}

        <div className="hand">
          {hand.length === 0 && !self.eliminated && <span className="muted">No cards in hand</span>}
          {hand.map((c) => (
            <CardView
              key={c.id}
              card={c}
              selected={selected.includes(c.id)}
              disabled={!selectable(c)}
              onClick={() => toggle(c.id)}
            />
          ))}
        </div>
      </section>

      <aside className="log">
        <h3>Battle log</h3>
        <ol>
          {view.log
            .slice()
            .reverse()
            .map((e) => (
              <li key={e.id} className={`tone-${e.tone}`}>
                {e.text}
              </li>
            ))}
        </ol>
      </aside>

      {pending.kind === 'choose' && pending.player === me && view.revealedHand && (
        <div className="overlay">
          <div className="modal">
            <h2>Pick a card for {nameOf(pending.target)} to discard</h2>
            <div className="hand">
              {sortHand(view.revealedHand).map((c) => (
                <CardView key={c.id} card={c} onClick={() => send({ type: 'chooseDiscard', player: me, cardId: c.id })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {pending.kind === 'gameOver' && (
        <div className="overlay">
          <div className="modal">
            <h2>{pending.winner === me ? 'Victory! 🏆' : `${nameOf(pending.winner)} wins`}</h2>
            <p>{pending.winner === me ? 'Your crusade is complete.' : 'Your crusade ends here.'}</p>
            <button type="button" className="primary" onClick={onExit}>
              Play again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Seat(props: {
  player: PublicPlayer;
  view: PlayerView;
  isTarget: boolean;
  targetable: boolean;
  onClick: () => void;
}) {
  const { player, view, isTarget, targetable, onClick } = props;
  const active = view.turn.player === player.id;
  const deciding = view.pending.kind !== 'gameOver' && view.pending.player === player.id;
  return (
    <button
      type="button"
      className={`seat${isTarget ? ' targeted' : ''}${active ? ' active' : ''}${player.eliminated ? ' out' : ''}`}
      disabled={!targetable}
      onClick={onClick}
    >
      <div className="seat-head">
        <strong>{player.name}</strong>
        {deciding && <span className="thinking">thinking…</span>}
      </div>
      <HpBar hp={player.hp} max={view.config.startingHp} />
      <div className="seat-foot">
        <span className="mini-hand">🂠 × {player.handCount}</span>
        {player.skipped && <span className="badge skipped">Skipped</span>}
        {player.eliminated && <span className="badge out">KO</span>}
        {isTarget && <span className="badge target">Target</span>}
      </div>
    </button>
  );
}

function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const level = pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low';
  return (
    <div className="hp">
      <div className={`hp-fill ${level}`} style={{ width: `${pct}%` }} />
      <span className="hp-text">{hp} HP</span>
    </div>
  );
}

function Chain({ view, nameOf }: { view: PlayerView; nameOf: (id: PlayerId) => string }) {
  if (view.stack.length === 0) return <div className="chain empty">The table is clear</div>;
  return (
    <ol className="chain">
      {view.stack.map((p, i) => (
        <li key={p.id} className={i === view.stack.length - 1 ? 'top' : ''}>
          <div className="chain-line">
            <strong>{nameOf(p.from)}</strong> → <strong>{nameOf(p.to)}</strong>: {packetTitle(view, p)}
          </div>
          <div className="chain-cards">
            {p.cards.map((c) => (
              <CardView key={c.id} card={c} small disabled />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

function packetTitle(view: PlayerView, p: Packet): string {
  if (p.kind === 'attack') {
    const base = view.config.baseDamage;
    return `Attack ${packetDamage(view, p)} dmg = (${base} + ${p.numbers}) × ${p.multiplier}`;
  }
  return p.kind === 'skip' ? 'Skip' : CARD_INFO[p.kind].name;
}

function promptText(view: PlayerView, nameOf: (id: PlayerId) => string, target: PlayerId | null): string {
  const p = view.pending;
  const me = view.viewer;
  switch (p.kind) {
    case 'gameOver':
      return '';
    case 'main':
      if (p.player !== me) return `${nameOf(p.player)} is planning their move…`;
      return target
        ? `Targeting ${nameOf(target)}. Add number and multiplier cards, then attack, or play an action card at them.`
        : 'Tap an opponent to target them.';
    case 'post':
      return p.player === me ? 'Attack done. Draw cards or end your turn.' : `${nameOf(p.player)} is finishing their turn…`;
    case 'response': {
      const what = describePacket(view, p.packet);
      if (p.player === me) return `${nameOf(p.packet.from)}'s ${what} is coming at you! Respond or take it.`;
      return `Waiting for ${nameOf(p.player)} to respond to the ${what}…`;
    }
    case 'choose':
      return p.player === me ? '' : `${nameOf(p.player)} is picking a card for ${nameOf(p.target)} to discard…`;
  }
}

function Controls(props: {
  view: PlayerView;
  selectedCards: Card[];
  target: PlayerId | null;
  nameOf: (id: PlayerId) => string;
  send: (a: Action) => void;
}) {
  const { view, selectedCards, target, nameOf, send } = props;
  const me = view.viewer;
  const p = view.pending;
  const draw = (
    <button type="button" onClick={() => send({ type: 'draw', player: me })}>
      Draw {view.config.drawCount} &amp; end turn
    </button>
  );
  const end = (
    <button type="button" className="ghost" onClick={() => send({ type: 'endTurn', player: me })}>
      End turn
    </button>
  );

  if (p.kind === 'main') {
    const attackCards = selectedCards.filter((c) => c.kind === 'number' || c.kind === 'multiplier');
    const actionCards = selectedCards.filter((c) => c.kind !== 'number' && c.kind !== 'multiplier');
    const numbers = attackCards.filter((c) => c.kind === 'number').reduce((s, c) => s + c.value, 0);
    const mult = attackCards.filter((c) => c.kind === 'multiplier').reduce((m, c) => m * c.value, 1);
    const dmg = (view.config.baseDamage + numbers) * mult;
    const t = target ? nameOf(target) : null;
    return (
      <div className="controls">
        {actionCards.length === 1 && attackCards.length === 0 ? (
          <button
            type="button"
            className="primary"
            disabled={!target}
            onClick={() => send({ type: 'playAction', player: me, cardId: actionCards[0].id, target: target! })}
          >
            Play {cardLabel(actionCards[0])}
            {t ? ` on ${t}` : ' (pick a target)'}
          </button>
        ) : (
          <button
            type="button"
            className="primary attack"
            disabled={!target || actionCards.length > 0}
            onClick={() => send({ type: 'attack', player: me, target: target!, cardIds: attackCards.map((c) => c.id) })}
          >
            {actionCards.length > 0
              ? 'Play one action card at a time'
              : `⚔ Attack${t ? ` ${t}` : ''} for ${dmg}`}
          </button>
        )}
        {draw}
        {end}
      </div>
    );
  }

  if (p.kind === 'post') {
    return (
      <div className="controls">
        {draw}
        {end}
      </div>
    );
  }

  if (p.kind === 'response') {
    const find = (kind: Card['kind']) => view.hand.find((c) => c.kind === kind);
    const block = find('block');
    const reverse = find('reverse');
    const skip = find('skip');
    const mults = selectedCards.filter((c) => c.kind === 'multiplier');
    const isAttack = p.packet.kind === 'attack';
    const respond = (card: Card | undefined, multiplierIds?: string[]) =>
      card && send({ type: 'respond', player: me, cardId: card.id, multiplierIds });
    const boosted = isAttack ? packetDamage(view, p.packet) * mults.reduce((m, c) => m * c.value, 1) : 0;
    return (
      <div className="controls">
        <button type="button" className="defend" disabled={!block} onClick={() => respond(block)}>
          ⛨ Block
        </button>
        <button
          type="button"
          className="defend"
          disabled={!reverse}
          onClick={() => respond(reverse, mults.map((c) => c.id))}
        >
          ⇄ Reverse{isAttack && mults.length ? ` for ${boosted}` : ''}
        </button>
        <button type="button" className="defend" disabled={!skip} onClick={() => respond(skip)}>
          ⦸ Skip
        </button>
        <button type="button" className="ghost" onClick={() => send({ type: 'pass', player: me })}>
          Take it
        </button>
        {isAttack && reverse && <span className="hint">Tip: select multipliers to boost a Reverse.</span>}
      </div>
    );
  }

  return null;
}
