import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { CARD_INFO, cardLabel, INITIATOR_KINDS } from '../engine/cards';
import { describePacket, packetDamage } from '../engine/engine';
import type { Action, Card, Packet, PlayerId, PlayerView, PublicPlayer } from '../engine/types';
import type { GameClient } from '../host/GameHost';
import { Avatar } from './Avatar';
import { CardBack, CardView, sortHand } from './CardView';

type NameOf = (id: PlayerId) => string;

export function GameScreen({ client, onExit }: { client: GameClient; onExit: () => void }) {
  const view = useSyncExternalStore(client.subscribe, client.getView);
  const me = view.viewer;
  const pending = view.pending;
  const myTurnToAct = pending.kind !== 'gameOver' && pending.player === me;
  const seatIndex = (id: PlayerId) => view.players.findIndex((p) => p.id === id);
  const opponents = view.players.filter((p) => p.id !== me);
  const self = view.players.find((p) => p.id === me)!;
  const nameOf: NameOf = (id) => (id === me ? 'You' : view.players.find((p) => p.id === id)!.name);

  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<PlayerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

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

  const latest = view.log[view.log.length - 1];

  return (
    <div className="arena">
      <header className="hud">
        <span className="logo small">Cardsade</span>
        <span className={`turn-ribbon${view.turn.player === me ? ' mine' : ''}`}>
          Turn {view.turn.number} · {view.turn.player === me ? 'Your turn!' : `${nameOf(view.turn.player)}'s turn`}
        </span>
        <span className="hud-actions">
          <button type="button" className="btn ghost" onClick={() => setLogOpen((o) => !o)} aria-expanded={logOpen}>
            Log
          </button>
          <button type="button" className="btn ghost" onClick={onExit}>
            Quit
          </button>
        </span>
      </header>

      {latest && (
        <div className={`ticker tone-${latest.tone}`} key={latest.id}>
          {latest.text}
        </div>
      )}

      <section className="opponents" style={{ '--n': opponents.length } as CSSProperties}>
        {opponents.map((p, i) => {
          const x = opponents.length === 1 ? 0 : (2 * i) / (opponents.length - 1) - 1;
          return (
            <Seat
              key={p.id}
              player={p}
              seed={seatIndex(p.id)}
              view={view}
              arc={x * x}
              isTarget={target === p.id}
              targetable={myTurnToAct && pending.kind === 'main' && !p.eliminated}
              onClick={() => setTarget(p.id)}
            />
          );
        })}
      </section>

      <section className="center">
        <Swirl />
        <div className="piles">
          <div className="deck" title={`${view.deckCount} cards left in the deck`}>
            {view.deckCount > 0 ? <CardBack width={74} /> : <span className="slot" />}
            <span className="pile-count">{view.deckCount}</span>
          </div>
          <div className="discard" title={`${view.discardCount} cards in the discard pile`}>
            {view.discardRecent.length === 0 && <span className="slot" />}
            {view.discardRecent.map((c, i) => (
              <CardView key={c.id} card={c} width={80} disabled style={SCATTER[(parseInt(c.id.replace(/\D/g, ""), 10) || i) % SCATTER.length]} />
            ))}
          </div>
        </div>
        {view.stack.length > 0 && <Chain view={view} nameOf={nameOf} />}
      </section>

      <div className="caption" role="status">
        {error ? <span className="error">{error}</span> : promptText(view, nameOf, target)}
      </div>

      <section className="player">
        <div className="me">
          <div className={`portrait-wrap${view.turn.player === me ? ' active' : ''}`}>
            <Avatar seed={seatIndex(me)} />
            <HitBurst hp={self.hp} />
            <span className="count-badge">{view.hand.length}</span>
            {myTurnToAct && <span className="splat">!</span>}
          </div>
          <div className="me-info">
            <span className="nameplate">{self.name}</span>
            <HpBar hp={self.hp} max={view.config.startingHp} />
            <span className="badges">
              {self.skipped && <span className="badge skipped">Skipped</span>}
              {self.eliminated && <span className="badge out">K.O.</span>}
            </span>
          </div>
          <div className="controls">
            {myTurnToAct && (
              <Controls view={view} selectedCards={selectedCards} target={target} nameOf={nameOf} send={send} />
            )}
            {self.eliminated && pending.kind !== 'gameOver' && (
              <>
                <span className="muted">You're out. Watching the rest of the crusade…</span>
                <button type="button" className="btn" onClick={onExit}>
                  New game
                </button>
              </>
            )}
          </div>
        </div>

        <div className="hand" style={{ '--n': Math.max(hand.length, 1) } as CSSProperties}>
          {hand.length === 0 && !self.eliminated && <span className="muted">No cards in hand</span>}
          {hand.map((c, i) => (
            <div key={c.id} className="hand-slot" style={{ '--i': i } as CSSProperties}>
              <CardView
                card={c}
                selected={selected.includes(c.id)}
                disabled={!selectable(c)}
                dim={myTurnToAct && !selectable(c)}
                onClick={() => toggle(c.id)}
              />
            </div>
          ))}
        </div>
      </section>

      {logOpen && (
        <aside className="log-drawer">
          <div className="log-head">
            <h3>Battle log</h3>
            <button type="button" className="btn ghost" onClick={() => setLogOpen(false)}>
              Close
            </button>
          </div>
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
      )}

      {pending.kind === 'choose' && pending.player === me && view.revealedHand && (
        <div className="overlay">
          <div className="comic-panel">
            <h2>Pick a card for {nameOf(pending.target)} to discard</h2>
            <div className="reveal">
              {sortHand(view.revealedHand).map((c) => (
                <CardView key={c.id} card={c} width={78} onClick={() => send({ type: 'chooseDiscard', player: me, cardId: c.id })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {pending.kind === 'gameOver' && (
        <div className="overlay">
          <div className="comic-panel">
            <h2 className="big">{pending.winner === me ? 'Victory!' : `${nameOf(pending.winner)} wins!`}</h2>
            <p>{pending.winner === me ? 'Your crusade is complete.' : 'Your crusade ends here.'}</p>
            <button type="button" className="btn primary" onClick={onExit}>
              Play again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SCATTER: CSSProperties[] = [
  { transform: 'translate(-10px, 4px) rotate(-16deg)' },
  { transform: 'translate(8px, -6px) rotate(9deg)' },
  { transform: 'translate(-4px, -2px) rotate(-5deg)' },
  { transform: 'translate(6px, 6px) rotate(14deg)' },
  { transform: 'translate(0px, -8px) rotate(-11deg)' },
];

function Seat(props: {
  player: PublicPlayer;
  seed: number;
  view: PlayerView;
  arc: number;
  isTarget: boolean;
  targetable: boolean;
  onClick: () => void;
}) {
  const { player, seed, view, arc, isTarget, targetable, onClick } = props;
  const active = view.turn.player === player.id;
  const deciding = view.pending.kind !== 'gameOver' && view.pending.player === player.id;
  const fan = Math.min(player.handCount, 9);
  return (
    <button
      type="button"
      className={`seat${isTarget ? ' targeted' : ''}${player.eliminated ? ' out' : ''}`}
      style={{ '--arc': arc } as CSSProperties}
      disabled={!targetable}
      onClick={onClick}
      aria-label={`${player.name}, ${player.hp} HP, ${player.handCount} cards${isTarget ? ', targeted' : ''}`}
    >
      <span className="nameplate">{player.name}</span>
      <span className={`portrait-wrap${active ? ' active' : ''}`}>
        <Avatar seed={seed} />
        <HitBurst hp={player.hp} />
        <span className="count-badge">{player.handCount}</span>
        {deciding && <span className="splat">!</span>}
        {isTarget && <span className="crosshair" />}
      </span>
      <HpBar hp={player.hp} max={view.config.startingHp} />
      <span className="badges">
        {player.skipped && <span className="badge skipped">Skipped</span>}
        {player.eliminated && <span className="badge out">K.O.</span>}
      </span>
      <span className="fan" style={{ '--m': fan } as CSSProperties}>
        {Array.from({ length: fan }, (_, j) => (
          <CardBack key={j} style={{ '--j': j } as CSSProperties} />
        ))}
      </span>
    </button>
  );
}

/** Pops a comic "POW!" with the damage whenever this player's HP drops. */
function HitBurst({ hp }: { hp: number }) {
  const prev = useRef(hp);
  const [hit, setHit] = useState<{ amount: number; ko: boolean; key: number } | null>(null);
  useEffect(() => {
    if (hp < prev.current) {
      setHit({ amount: prev.current - hp, ko: hp <= 0, key: Date.now() });
      const t = setTimeout(() => setHit(null), 1400);
      prev.current = hp;
      return () => clearTimeout(t);
    }
    prev.current = hp;
  }, [hp]);
  if (!hit) return null;
  const word = hit.ko ? 'K.O.!' : hit.amount >= 30 ? 'KA-BOOM!' : hit.amount >= 10 ? 'POW!' : 'BAM!';
  return (
    <span className="burst" key={hit.key}>
      <span>{word}</span>
      <small>-{hit.amount}</small>
    </span>
  );
}

function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const level = pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low';
  return (
    <span className="hp" role="meter" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={max} aria-label="Health">
      <span className={`hp-fill ${level}`} style={{ width: `${pct}%` }} />
      <span className="hp-text">{hp} HP</span>
    </span>
  );
}

function Swirl() {
  return (
    <svg className="swirl" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="swirl-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe14d" />
          <stop offset="1" stopColor="#ff7a1a" />
        </linearGradient>
      </defs>
      {[0, 180].map((r) => (
        <g key={r} transform={`rotate(${r} 100 100)`}>
          <path d="M40 70 A66 66 0 0 1 150 52" fill="none" stroke="#1a0004" strokeWidth="13" strokeLinecap="round" transform="translate(3 4)" />
          <path d="M40 70 A66 66 0 0 1 150 52" fill="none" stroke="url(#swirl-grad)" strokeWidth="10" strokeLinecap="round" />
          <polygon points="141,34 171,62 136,70" fill="#1a0004" transform="translate(3 4)" />
          <polygon points="141,34 171,62 136,70" fill="#ff8a1a" />
        </g>
      ))}
    </svg>
  );
}

function Chain({ view, nameOf }: { view: PlayerView; nameOf: NameOf }) {
  return (
    <ol className="chain">
      {view.stack.map((p, i) => (
        <li key={p.id} className={`comic-panel chain-link${i === view.stack.length - 1 ? ' top' : ''}`}>
          <div className="chain-who">
            {nameOf(p.from)} <span className="arrow">➜</span> {nameOf(p.to)}
          </div>
          <div className="chain-what">{packetTitle(view, p)}</div>
          {p.kind === 'attack' && (
            <div className="chain-math">
              ({view.config.baseDamage} + {p.numbers}) × {p.multiplier}
            </div>
          )}
          {p.cards.length > 0 && (
            <div className="chain-cards">
              {p.cards.map((c) => (
                <CardView key={c.id} card={c} width={38} disabled />
              ))}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function packetTitle(view: PlayerView, p: Packet): string {
  if (p.kind === 'attack') return `${packetDamage(view, p)} DMG!`;
  return `${CARD_INFO[p.kind].name}!`;
}

function promptText(view: PlayerView, nameOf: NameOf, target: PlayerId | null): string {
  const p = view.pending;
  const me = view.viewer;
  switch (p.kind) {
    case 'gameOver':
      return '';
    case 'main':
      if (p.player !== me) return `${nameOf(p.player)} is planning their move…`;
      return target
        ? `Targeting ${nameOf(target)}. Add number and multiplier cards and attack, or play an action card at them.`
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
  nameOf: NameOf;
  send: (a: Action) => void;
}) {
  const { view, selectedCards, target, nameOf, send } = props;
  const me = view.viewer;
  const p = view.pending;
  const draw = (
    <button type="button" className="btn" onClick={() => send({ type: 'draw', player: me })}>
      Draw {view.config.drawCount}
    </button>
  );
  const end = (
    <button type="button" className="btn ghost" onClick={() => send({ type: 'endTurn', player: me })}>
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
      <>
        {actionCards.length === 1 && attackCards.length === 0 ? (
          <button
            type="button"
            className="btn primary"
            disabled={!target}
            onClick={() => send({ type: 'playAction', player: me, cardId: actionCards[0].id, target: target! })}
          >
            Play {cardLabel(actionCards[0])}
            {t ? ` on ${t}` : ''}
          </button>
        ) : (
          <button
            type="button"
            className="btn attack"
            disabled={!target || actionCards.length > 0}
            onClick={() => send({ type: 'attack', player: me, target: target!, cardIds: attackCards.map((c) => c.id) })}
          >
            {actionCards.length > 0 ? 'One action card at a time' : `Attack${t ? ` ${t}` : ''} · ${dmg}`}
          </button>
        )}
        {draw}
        {end}
      </>
    );
  }

  if (p.kind === 'post') {
    return (
      <>
        {draw}
        {end}
      </>
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
      <>
        <button type="button" className="btn defend" disabled={!block} onClick={() => respond(block)}>
          ⛨ Block
        </button>
        <button type="button" className="btn defend" disabled={!reverse} onClick={() => respond(reverse, mults.map((c) => c.id))}>
          ⇄ Reverse{isAttack && mults.length ? ` · ${boosted}` : ''}
        </button>
        <button type="button" className="btn defend" disabled={!skip} onClick={() => respond(skip)}>
          ⦸ Skip
        </button>
        <button type="button" className="btn ghost" onClick={() => send({ type: 'pass', player: me })}>
          Take it
        </button>
        {isAttack && reverse && <span className="hint">Select multipliers first to boost your Reverse.</span>}
      </>
    );
  }

  return null;
}
