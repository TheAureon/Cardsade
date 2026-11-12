import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { CARD_INFO, cardLabel, INITIATOR_KINDS, isAttackCard } from '../engine/cards';
import { ultimateFor, WILD_EVENT_BY_KIND } from '../engine/abilities';
import { describePacket, packetDamage } from '../engine/engine';
import type { Action, Card, FxEvent, Packet, PlayerId, PlayerView, PublicPlayer } from '../engine/types';
import type { GameClient } from '../host/GameHost';
import { Avatar } from './Avatar';
import { CardBack, CardView, sortHand } from './CardView';
import { burstPieces, FxLayer, makeConfetti, PALETTES, useFx, type StampVariant } from './Fx';
import { isMuted, unlockAudio } from './audio';
import { AudioToggles } from './AudioToggles';
import { music } from './music';
import { CUTSCENE_MS, Cutscene, moveName, type CutsceneSpec, type Fighter } from './Cutscene';
import { cutscenesOn, setCutscenes, subscribeSettings } from './settings';
import { sfx } from './sound';
import { award as scoreMatch, grantDuring, levelInfo, newlyEarned, newMatch, track, type Achievement, type Award, type MatchStats } from '../progress/progression';
import { getProfile, saveProfile, subscribeProfile, titleName } from './profileStore';
import { AchievementToast, Results } from './Progress';

type NameOf = (id: PlayerId) => string;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Center of an element in viewport coordinates, or the screen center if it isn't on screen. */
function pointOf(selector: string) {
  const el = document.querySelector(selector);
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
const seatSelector = (id: PlayerId) => `[data-seat="${CSS.escape(id)}"]`;
const seatPoint = (id: PlayerId) => pointOf(seatSelector(id));

export function GameScreen({ client, onExit }: { client: GameClient; onExit: () => void }) {
  const view = useSyncExternalStore(client.subscribe, client.getView);
  const me = view.viewer;
  const pending = view.pending;
  const myTurnToAct = pending.kind !== 'gameOver' && pending.player === me;
  /** Portrait/character for a seat. */
  const fighterOf = useCallback((id: PlayerId) => view.players.find((p) => p.id === id)?.fighter ?? 0, [view.players]);
  const opponents = view.players.filter((p) => p.id !== me);
  const self = view.players.find((p) => p.id === me)!;
  const myTeam = self.team;
  const nameOf: NameOf = (id) => (id === me ? 'You' : view.players.find((p) => p.id === id)!.name);

  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<PlayerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const arenaRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const fx = useFx();

  // Clear the selection whenever the decision we're making changes.
  const decisionKey = `${pending.kind}:${'player' in pending ? pending.player : ''}:${view.stack.length}:${view.turn.number}`;
  useEffect(() => {
    setSelected([]);
    setError(null);
  }, [decisionKey]);

  // Keep the target valid; auto-pick when there's only one choice.
  const isAlly = (p: PublicPlayer) => p.team !== null && p.team === self.team;
  const alive = opponents.filter((p) => !p.eliminated && !isAlly(p));
  useEffect(() => {
    if (target && !alive.some((p) => p.id === target)) setTarget(null);
    if (!target && alive.length === 1) setTarget(alive[0].id);
  }, [target, alive]);

  const send = (action: Action) => {
    const r = client.send(action);
    setError(r.ok ? null : r.error);
    if (!r.ok) sfx.deselect();
  };

  const hand = useMemo(() => sortHand(view.hand), [view.hand]);
  const selectedCards = hand.filter((c) => selected.includes(c.id));
  const toggle = (id: string) => {
    const on = selected.includes(id);
    if (on) sfx.deselect();
    else sfx.select(selected.length);
    setSelected((s) => (on ? s.filter((x) => x !== id) : [...s, id]));
  };

  const selectable = (c: Card): boolean => {
    if (!myTurnToAct) return false;
    if (pending.kind === 'main') return isAttackCard(c) || INITIATOR_KINDS.includes(c.kind);
    if (pending.kind === 'response') return pending.packet.kind === 'attack' && c.kind === 'multiplier';
    return false;
  };

  // Cards that just arrived in the hand get a deal-in animation.
  const known = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const prev = known.current;
    known.current = new Set(view.hand.map((c) => c.id));
    return prev ? new Set(view.hand.filter((c) => !prev.has(c.id)).map((c) => c.id)) : new Set<string>();
  }, [view.hand]);

  // ---------- Juice: turn engine events into effects ----------
  const shake = useCallback((amp: number) => {
    if (reducedMotion() || !boardRef.current) return;
    const a = Math.min(amp, 22);
    boardRef.current.animate(
      [
        { translate: '0 0' },
        { translate: `${a}px ${-a * 0.5}px`, rotate: `${a * 0.04}deg` },
        { translate: `${-a * 0.8}px ${a * 0.4}px`, rotate: `${-a * 0.03}deg` },
        { translate: `${a * 0.5}px ${a * 0.3}px` },
        { translate: `${-a * 0.25}px ${-a * 0.15}px` },
        { translate: '0 0', rotate: '0deg' },
      ],
      { duration: 380 + a * 10, easing: 'ease-out' },
    );
  }, []);

  const jolt = useCallback((id: PlayerId) => {
    if (reducedMotion()) return;
    document.querySelector(seatSelector(id))?.animate(
      [{ translate: '0 0' }, { translate: '-7px 2px' }, { translate: '6px -2px' }, { translate: '-4px 0' }, { translate: '0 0' }],
      { duration: 320, easing: 'ease-out' },
    );
  }, []);

  const playFx = useCallback(
    (e: FxEvent, d: number, scene = false) => {
      const { add, later } = fx;
      const reduced = reducedMotion();
      const stamp = (id: PlayerId, text: string, variant: StampVariant, big = false) => {
        const p = seatPoint(id);
        const x = Math.min(Math.max(p.x, 110), window.innerWidth - 110);
        add({ kind: 'stamp', x, y: p.y - 30, text, variant, big }, big ? 1400 : 1000, d);
      };
      const fly = (from: PlayerId | 'deck', to: PlayerId, variant: 'attack' | 'reverse' | 'action' | 'skip' | 'draw', label?: string, delay = d) => {
        if (reduced) return;
        const a = from === 'deck' ? pointOf('[data-pile="deck"]') : seatPoint(from);
        const b = seatPoint(to);
        add({ kind: 'projectile', x1: a.x, y1: a.y, x2: b.x, y2: b.y, variant, label }, 560, delay);
      };
      const burst = (id: PlayerId, count: number, spread: number, palette: string[], delay = d) => {
        const p = seatPoint(id);
        add({ kind: 'particles', x: p.x, y: p.y, pieces: burstPieces(reduced ? 0 : count, spread, palette) }, 900, delay);
      };
      const incoming = (delay: number) => {
        add({ kind: 'banner', text: 'INCOMING!', variant: 'incoming' }, 1000, delay);
        later(sfx.incoming, delay);
      };

      switch (e.type) {
        case 'turn':
          if (e.who === me) {
            add({ kind: 'banner', text: 'YOUR TURN!', variant: 'turn' }, 1250, d + 150);
            later(sfx.yourTurn, d + 150);
          }
          break;
        case 'attack':
          fly(e.from, e.to, 'attack', String(e.amount));
          later(sfx.whoosh, d);
          if (e.to === me) incoming(d + 380);
          break;
        case 'action':
          fly(e.from, e.to, 'action', CARD_INFO[e.card].symbol);
          later(sfx.zap, d);
          if (e.to === me) incoming(d + 380);
          break;
        case 'reverse':
          stamp(e.from, 'REVERSE!', 'reverse');
          fly(e.from, e.to, 'reverse', e.amount === null ? '⇄' : String(e.amount), d + 120);
          if (!scene) later(sfx.reverse, d);
          if (e.to === me) incoming(d + 480);
          break;
        case 'block':
          stamp(e.by, 'BLOCKED!', 'block');
          burst(e.by, 18, 90, PALETTES.block);
          later(() => jolt(e.by), d);
          if (!scene) later(sfx.block, d);
          break;
        case 'skipCounter':
          stamp(e.from, 'SKIP!', 'skip');
          fly(e.from, e.to, 'skip', '⦸', d + 100);
          later(sfx.skip, d);
          if (e.to === me) incoming(d + 460);
          break;
        case 'cancelled':
          stamp(e.who, 'CANCELLED!', 'skip');
          later(sfx.skip, d);
          break;
        case 'skipped':
          stamp(e.who, 'SKIPPED!', 'skip');
          burst(e.who, 10, 70, PALETTES.hit);
          later(sfx.skip, d);
          break;
        case 'wasted':
          stamp(e.who, 'WASTED!', 'skip');
          later(sfx.deselect, d);
          break;
        case 'damage': {
          const p = seatPoint(e.to);
          burst(e.to, 14 + Math.min(e.amount, 40), 70 + Math.min(e.amount, 60) * 1.6, PALETTES.hit);
          add({ kind: 'float', x: p.x, y: p.y - 20, text: `-${e.amount}`, variant: 'damage' }, 1100, d);
          if (e.amount >= 25) stamp(e.to, e.amount >= 50 ? 'DEVASTATING!' : 'CRITICAL!', 'hit');
          later(() => {
            shake((3 + e.amount / 3) * (e.to === me ? 1.3 : 0.6));
            jolt(e.to);
          }, d);
          if (e.to === me) add({ kind: 'flash' }, 450, d);
          later(() => sfx.hit(e.amount), d);
          break;
        }
        case 'discard': {
          const p = seatPoint(e.who);
          burst(e.who, 16, 80, PALETTES.magic);
          add({ kind: 'float', x: p.x, y: p.y - 20, text: `-${e.count} card${e.count === 1 ? '' : 's'}`, variant: 'info' }, 1100, d);
          later(sfx.zap, d);
          break;
        }
        case 'draw':
          for (let k = 0; k < Math.min(e.count, 3); k++) fly('deck', e.who, 'draw', undefined, d + k * 110);
          later(sfx.draw, d);
          break;
        case 'ko':
          stamp(e.who, 'K.O.!', 'ko', true);
          burst(e.who, 46, 170, PALETTES.party);
          later(() => shake(22), d);
          if (!scene) {
            later(sfx.ko, d);
            later(() => music.sting('ko'), d);
          }
          break;
        case 'win': {
          const mine = e.who === me || (e.team !== null && e.team === myTeam);
          if (mine && !reduced) add(makeConfetti(), 4200, d + 200);
          later(() => {
            // The music sting is the fanfare; fall back to the effect version when music is off.
            if (isMuted('music')) (mine ? sfx.win : sfx.lose)();
            music.sting(mine ? 'win' : 'lose');
          }, d + 200);
          break;
        }
        case 'burn':
          stamp(e.who, 'BURN!', 'hit');
          burst(e.who, 20, 80, PALETTES.fire);
          later(sfx.zap, d);
          break;
        case 'freeze':
          stamp(e.who, 'FROZEN!', 'block');
          burst(e.who, 20, 80, PALETTES.ice);
          later(sfx.block, d);
          break;
        case 'frozen':
          stamp(e.who, 'FROZEN!', 'block');
          later(sfx.skip, d);
          break;
        case 'chain':
          fly(e.from, e.to, 'skip', 'ϟ', d);
          later(sfx.zap, d);
          break;
        case 'ultimate':
          if (!scene) stamp(e.who, ultimateFor(fighterOf(e.who)).name.toUpperCase() + '!', 'ko', true);
          burst(e.who, 30, 140, PALETTES.party);
          later(() => shake(10), d);
          if (!scene) later(sfx.start, d);
          break;
        case 'heal': {
          const p = seatPoint(e.who);
          add({ kind: 'float', x: p.x, y: p.y - 20, text: `+${e.amount}`, variant: 'heal' }, 1100, d);
          burst(e.who, 14, 70, PALETTES.heal);
          later(sfx.draw, d);
          break;
        }
        case 'steal':
          for (let k = 0; k < Math.min(e.count, 3); k++) fly(e.from, e.to, 'draw', undefined, d + k * 110);
          later(sfx.zap, d);
          break;
        case 'shielded':
          stamp(e.who, 'BULWARK!', 'block');
          burst(e.who, 18, 90, PALETTES.block);
          later(sfx.block, d);
          break;
        case 'rage':
          stamp(e.who, 'RAGE!', 'ko', true);
          later(() => shake(20), d);
          later(sfx.ko, d);
          break;
        case 'event':
          if (e.active) {
            add({ kind: 'banner', text: WILD_EVENT_BY_KIND[e.kind].name.toUpperCase() + '!', variant: 'event' }, 1600, d);
            later(sfx.incoming, d);
          }
          break;
      }
    },
    [fx, me, myTeam, shake, jolt, fighterOf],
  );

  // ---------- Soundtrack: battle theme, hotter when things get dangerous ----------
  useEffect(() => {
    if (view.pending.kind !== 'gameOver') music.play('battle');
  }, [view.pending.kind]);
  const standing = view.players.filter((p) => !p.eliminated).length;
  const danger =
    pending.kind !== 'gameOver' &&
    !self.eliminated &&
    (self.hp <= 25 || standing === 2 || (pending.kind === 'response' && pending.player === me));
  useEffect(() => {
    music.setIntensity(danger ? 2 : 1);
  }, [danger]);

  // ---------- Cutscenes: anime cut-ins for the biggest moments ----------
  const [scenes, setScenes] = useState<{ id: number; spec: CutsceneSpec }[]>([]);
  const sceneId = useRef(0);
  const scenesOn = useSyncExternalStore(subscribeSettings, cutscenesOn);
  /** When the queued scenes will have finished, so effects and bots wait for them. */
  const busyUntil = useRef(0);
  const shown = useRef({ start: false, showdown: false });
  const lastSpecial = useRef<{ target: PlayerId; turn: number } | null>(null);
  const fighter = useCallback(
    (id: PlayerId): Fighter => {
      const i = view.players.findIndex((p) => p.id === id);
      return { id, name: view.players[i].name, seed: view.players[i].fighter };
    },
    [view.players],
  );

  /** Decides whether an engine event deserves a cutscene. */
  const sceneFor = (e: FxEvent): CutsceneSpec | null => {
    switch (e.type) {
      case 'attack': {
        const packet = view.stack.find((p) => p.kind === 'attack' && p.from === e.from && p.to === e.to);
        const mult = packet?.multiplier ?? 1;
        if (e.amount < 30 && mult < 3) return null;
        lastSpecial.current = { target: e.to, turn: view.turn.number };
        const a = fighter(e.from);
        return { kind: 'special', attacker: a, target: fighter(e.to), move: moveName(a.seed, e.amount, mult), amount: e.amount };
      }
      case 'reverse':
        return e.amount !== null && e.amount >= 20 ? { kind: 'counter', who: fighter(e.from), against: fighter(e.to), amount: e.amount } : null;
      case 'block': {
        const big = lastSpecial.current;
        return big && big.target === e.by && big.turn === view.turn.number ? { kind: 'guard', who: fighter(e.by) } : null;
      }
      case 'ko':
        return { kind: 'ko', who: fighter(e.who) };
      case 'win':
        return { kind: 'victory', winner: fighter(e.who), mine: e.who === me || (e.team !== null && e.team === self.team) };
      case 'ultimate':
        return { kind: 'ultimate', who: fighter(e.who), name: ultimateFor(fighterOf(e.who)).name, target: e.target ? fighter(e.target) : null };
      default:
        return null;
    }
  };

  // ---------- Progression: track this match, pay out achievements and XP ----------
  const profile = useSyncExternalStore(subscribeProfile, getProfile);
  const match = useRef<MatchStats>(
    newMatch(me, view.players.filter((p) => !(p.team !== null && p.team === self.team)).length - 1, self.maxHp, self.team),
  );
  const xpAtStart = useRef(getProfile().xp);
  const finalized = useRef(false);
  const [result, setResult] = useState<Award | null>(null);
  const [toasts, setToasts] = useState<{ id: number; achievement: Achievement }[]>([]);
  const toastId = useRef(0);

  const finalize = useCallback(() => {
    if (finalized.current) return null;
    finalized.current = true;
    const hp = view.players.find((p) => p.id === me)?.hp ?? 0;
    const scored = scoreMatch({ ...match.current, finalHp: hp }, getProfile(), xpAtStart.current, Date.now());
    saveProfile(scored.profile);
    return scored;
  }, [view.players, me]);

  /** Leaving mid-game counts only once you're already knocked out (your placement is final). */
  const leave = () => {
    if (!finalized.current && match.current.placement !== null) finalize();
    onExit();
  };

  const lastLog = useRef(0);
  useEffect(() => {
    const entries = view.log.filter((e) => e.id > lastLog.current && e.fx);
    const alive = view.players.filter((p) => !p.eliminated).length;
    for (const e of entries) {
      const fxEvent = e.fx!;
      const packet = fxEvent.type === 'attack' ? view.stack.find((p) => p.kind === 'attack' && p.from === fxEvent.from) : undefined;
      match.current = track(match.current, fxEvent, { attackCards: packet?.cards.length, attackMultiplier: packet?.multiplier, alive });
      for (const a of newlyEarned(match.current, getProfile())) {
        const granted = grantDuring(match.current, getProfile(), a, Date.now());
        match.current = granted.match;
        saveProfile(granted.profile);
        const id = ++toastId.current;
        setToasts((list) => [...list, { id, achievement: a }]);
        fx.later(() => setToasts((list) => list.filter((t) => t.id !== id)), 4200);
        fx.later(sfx.yourTurn, 200);
      }
      if (fxEvent.type === 'win') {
        const scored = finalize();
        if (scored) setResult(scored);
      }
    }
    if (view.log.length) lastLog.current = view.log[view.log.length - 1].id;
    const queue: CutsceneSpec[] = [];
    const enqueue = (spec: CutsceneSpec) => {
      const now = Date.now();
      busyUntil.current = Math.max(now, busyUntil.current) + CUTSCENE_MS[spec.kind];
      queue.push(spec);
    };
    const on = scenesOn && !reducedMotion();
    if (on && !shown.current.start && view.turn.number === 1) {
      shown.current.start = true;
      enqueue({ kind: 'start', hero: fighter(me), rivals: view.players.filter((p) => p.id !== me).map((p) => fighter(p.id)) });
    }
    entries.forEach((e, i) => {
      const spec = on ? sceneFor(e.fx!) : null;
      if (spec) enqueue(spec);
      // Effects wait for any scene in front of them.
      playFx(e.fx!, Math.max(i * 160, busyUntil.current - Date.now()), Boolean(spec));
    });
    // Down to two after a knock-out: the final showdown.
    const left = view.players.filter((p) => !p.eliminated);
    if (on && !shown.current.showdown && left.length === 2 && view.players.length > 2 && !view.winner) {
      shown.current.showdown = true;
      enqueue({ kind: 'showdown', a: fighter(left[0].id), b: fighter(left[1].id) });
    }
    if (queue.length) {
      setScenes((list) => [...list, ...queue.map((spec) => ({ id: ++sceneId.current, spec }))]);
      client.hold?.(busyUntil.current - Date.now() + 400);
    }
  }, [view.log, playFx]);

  // ---------- Parallax: layers drift with the mouse to sell depth ----------
  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'mouse' || !arenaRef.current || reducedMotion()) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    arenaRef.current.style.setProperty('--px', x.toFixed(3));
    arenaRef.current.style.setProperty('--py', y.toFixed(3));
  };

  const latest = view.log[view.log.length - 1];
  const canDraw = myTurnToAct && (pending.kind === 'main' || pending.kind === 'post');

  return (
    <div className="arena game" ref={arenaRef} onPointerMove={onPointerMove} onPointerDown={unlockAudio}>
      <header className="hud">
        <span className="logo small">Cardsade</span>
        <span className={`turn-ribbon${view.turn.player === me ? ' mine' : ''}`} key={view.turn.number}>
          Turn {view.turn.number} · {view.turn.player === me ? 'Your turn!' : `${nameOf(view.turn.player)}'s turn`}
        </span>
        <span className="hud-actions">
          <AudioToggles />
          <button
            type="button"
            className="btn ghost"
            aria-pressed={scenesOn}
            onClick={() => {
              setCutscenes(!scenesOn);
              if (scenesOn) setScenes([]);
            }}
          >
            Scenes {scenesOn ? 'on' : 'off'}
          </button>
          <button type="button" className="btn ghost" onClick={() => setLogOpen((o) => !o)} aria-expanded={logOpen}>
            Log
          </button>
          <button type="button" className="btn ghost" onClick={leave}>
            Quit
          </button>
        </span>
      </header>

      {latest && (
        <div className={`ticker tone-${latest.tone}`} key={latest.id}>
          {latest.text}
        </div>
      )}

      {view.event && (
        <div className="event-pill" key={view.event.kind} title={WILD_EVENT_BY_KIND[view.event.kind].description}>
          <b>Wild event: {WILD_EVENT_BY_KIND[view.event.kind].name}</b>
          <span>{WILD_EVENT_BY_KIND[view.event.kind].description}</span>
        </div>
      )}

      <div className="board" ref={boardRef}>
        <section className="stage" style={{ '--n': view.players.length } as CSSProperties}>
          <div className="table">
            <div className="table-felt" />
            <Swirl />
          </div>

          {opponents.map((p, i) => {
            // Everyone sits evenly around the oval, you at the front; turn order runs clockwise.
            const angle = 90 + ((i + 1) * 360) / view.players.length;
            return (
              <Seat
                key={p.id}
                player={p}
                seed={p.fighter}
                view={view}
                angle={angle}
                index={i}
                isTarget={target === p.id}
                targetable={myTurnToAct && pending.kind === 'main' && !p.eliminated && !isAlly(p)}
                ally={isAlly(p)}
                onClick={() => {
                  setTarget(p.id);
                  sfx.click();
                }}
              />
            );
          })}

          <div className="piles">
            <button
              type="button"
              className={`deck${canDraw ? ' can-draw' : ''}`}
              data-pile="deck"
              disabled={!canDraw}
              onClick={() => send({ type: 'draw', player: me })}
              title={canDraw ? `Draw ${view.config.drawCount} and end your turn` : `${view.deckCount} cards left`}
              aria-label={canDraw ? `Draw ${view.config.drawCount} cards and end your turn` : `${view.deckCount} cards left in the deck`}
            >
              {view.deckCount === 0 && <span className="slot" />}
              {Array.from({ length: Math.min(5, Math.ceil(view.deckCount / 10)) }, (_, k) => (
                <span key={k} className="deck-layer" style={{ '--k': k } as CSSProperties}>
                  <CardBack width={70} />
                </span>
              ))}
              <span className="pile-count">{view.deckCount}</span>
            </button>
            <div className="discard" title={`${view.discardCount} cards in the discard pile`}>
              {view.discardRecent.length === 0 && <span className="slot" />}
              {view.discardRecent.map((c, i) => (
                <CardView
                  key={c.id}
                  card={c}
                  width={72}
                  disabled
                  className={i === view.discardRecent.length - 1 ? 'landed' : ''}
                  style={{ '--toss': `${SCATTER[(parseInt(c.id.replace(/\D/g, ''), 10) || i) % SCATTER.length]}deg` } as CSSProperties}
                />
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
            <div className={`portrait-wrap${view.turn.player === me ? ' active' : ''}`} data-seat={me}>
              <Avatar seed={self.fighter} />
              <HitBurst hp={self.hp} />
              <span className="count-badge">{view.hand.length}</span>
              {myTurnToAct && <span className="splat">!</span>}
            </div>
            <div className="me-info">
              <span className="nameplate">{self.name}</span>
              <span className="level-chip">
                Lv {levelInfo(profile.xp).level} · {titleName(profile)}
              </span>
              <HpBar hp={self.hp} max={self.maxHp} />
              {view.config.ultimates && !self.eliminated && <ChargeBar charge={self.charge} />}
              <StatusBadges player={self} />
            </div>
            <div className="controls">
              {myTurnToAct && (
                <Controls view={view} selectedCards={selectedCards} target={target} nameOf={nameOf} send={send} />
              )}
              {self.eliminated && pending.kind !== 'gameOver' && (
                <>
                  <span className="muted">You're out. Watching the rest of the crusade…</span>
                  <button type="button" className="btn" onClick={leave}>
                    New game
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="hand" style={{ '--n': Math.max(hand.length, 1) } as CSSProperties}>
            {hand.length === 0 && !self.eliminated && <span className="muted">No cards in hand</span>}
            {hand.map((c, i) => (
              <div
                key={c.id}
                className={`hand-slot${fresh.has(c.id) ? ' fresh' : ''}`}
                style={{ '--i': i, '--deal': `${(i % 4) * 70}ms` } as CSSProperties}
              >
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
      </div>

      <FxLayer items={fx.items} />

      {scenes[0] && (
        <Cutscene
          key={scenes[0].id}
          spec={scenes[0].spec}
          onDone={() => {
            setScenes((list) => list.slice(1));
            if (scenes.length <= 1) busyUntil.current = 0;
          }}
        />
      )}

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

      {toasts.length > 0 && (
        <div className="ach-toasts">
          {toasts.map((t) => (
            <AchievementToast key={t.id} achievement={t.achievement} />
          ))}
        </div>
      )}

      {pending.kind === 'gameOver' && result && (
        <Results
          award={result}
          placement={match.current.placement ?? view.players.length}
          players={view.players.length}
          winnerName={nameOf(pending.winner)}
          onContinue={onExit}
        />
      )}
      {pending.kind === 'gameOver' && !result && (
        <div className={`overlay${pending.winner === me ? ' won' : ' lost'}`}>
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

const SCATTER = [-16, 9, -5, 14, -11];

function Seat(props: {
  player: PublicPlayer;
  seed: number;
  view: PlayerView;
  angle: number;
  index: number;
  isTarget: boolean;
  targetable: boolean;
  ally: boolean;
  onClick: () => void;
}) {
  const { player, seed, view, angle, index, isTarget, targetable, ally, onClick } = props;
  const active = view.turn.player === player.id;
  const deciding = view.pending.kind !== 'gameOver' && view.pending.player === player.id;
  const fan = Math.min(player.handCount, 9);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // 0 at the far side of the table, 1 at the near side: nearer seats are bigger and drift more.
  const depth = (sin + 1) / 2;
  const geo = {
    '--cos': cos.toFixed(3),
    '--sin': sin.toFixed(3),
    '--depth': depth.toFixed(3),
    '--face': `${(angle - 90).toFixed(1)}deg`,
    zIndex: 10 + Math.round(depth * 10),
  } as CSSProperties;
  return (
    <>
      <span className="fan" style={{ ...geo, zIndex: 5, '--m': fan } as CSSProperties} aria-hidden="true">
        {Array.from({ length: fan }, (_, j) => (
          <CardBack key={j} style={{ '--j': j } as CSSProperties} />
        ))}
      </span>
      <button
        type="button"
        className={`seat${isTarget ? ' targeted' : ''}${player.eliminated ? ' out' : ''}${active ? ' active' : ''}${ally ? ' ally' : ''}${player.boss ? ' boss' : ''}`}
        style={geo}
        disabled={!targetable}
        onClick={onClick}
        aria-label={`${player.name}, ${player.hp} HP, ${player.handCount} cards${isTarget ? ', targeted' : ''}`}
      >
        <span className="seat-shadow" style={{ animationDelay: `${index * -0.7}s` }} />
        <span className="seat-body" style={{ animationDelay: `${index * -0.7}s` }}>
          <span className={`portrait-wrap${active ? ' active' : ''}`} data-seat={player.id}>
            <Avatar seed={seed} />
            <HitBurst hp={player.hp} />
            <span className="count-badge">{player.handCount}</span>
            {deciding && <span className="splat">!</span>}
            {isTarget && <span className="crosshair" />}
          </span>
          <span className="nameplate">{player.name}</span>
          <HpBar hp={player.hp} max={player.maxHp} />
          {view.config.ultimates && !player.eliminated && <ChargeBar charge={player.charge} />}
          <StatusBadges player={player} ally={ally} />
        </span>
      </button>
    </>
  );
}

/** Ultimate meter: fills from damage dealt and taken; glows when ready. */
function ChargeBar({ charge }: { charge: number }) {
  return (
    <span className={`charge${charge >= 100 ? ' full' : ''}`} role="meter" aria-valuenow={charge} aria-valuemin={0} aria-valuemax={100} aria-label="Ultimate">
      <span className="charge-fill" style={{ width: `${charge}%` }} />
      <span className="charge-text">{charge >= 100 ? 'ULT READY' : 'ULT'}</span>
    </span>
  );
}

/** Small chips for every status a player can have. */
function StatusBadges({ player, ally = false }: { player: PublicPlayer; ally?: boolean }) {
  return (
    <span className="badges">
      {player.boss && <span className="badge boss">Boss</span>}
      {ally && <span className="badge ally">Ally</span>}
      {player.skipped && <span className="badge skipped">Skipped</span>}
      {player.burn > 0 && <span className="badge burn">♨ {player.burn}</span>}
      {player.frozen && <span className="badge frozen">❄ Frozen</span>}
      {player.shield > 0 && <span className="badge shield">⛨ {player.shield}</span>}
      {player.eliminated && <span className="badge out">K.O.</span>}
    </span>
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
    <>
      <span className="hit-flash" key={`f${hit.key}`} />
      <span className="burst" key={hit.key}>
        <span>{word}</span>
      </span>
    </>
  );
}

/** HP bar with a trailing "ghost" chunk that drains after the hit, fighting-game style. */
function HpBar({ hp, max }: { hp: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const level = pct > 50 ? 'high' : pct > 20 ? 'mid' : 'low';
  return (
    <span className="hp" role="meter" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={max} aria-label="Health">
      <span className="hp-ghost" style={{ width: `${pct}%` }} />
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
        <li key={`${p.id}-${p.from}`} className={`comic-panel chain-link${i === view.stack.length - 1 ? ' top' : ''}`}>
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
                <CardView key={c.id} card={c} width={36} disabled />
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
        ? `Targeting ${nameOf(target)}. Stack number and multiplier cards and attack, or play an action card at them.`
        : 'Tap an opponent to target them.';
    case 'post':
      return p.player === me ? 'Attack done. Tap the deck to draw, or end your turn.' : `${nameOf(p.player)} is finishing their turn…`;
    case 'response': {
      const what = describePacket(view, p.packet);
      if (p.player === me) return `${nameOf(p.packet.from)}'s ${what} is coming at you! Respond or take it.`;
      return `Waiting for ${nameOf(p.player)} to respond to the ${what}…`;
    }
    case 'choose':
      return p.player === me ? '' : `${nameOf(p.player)} is picking a card for ${nameOf(p.target)} to discard…`;
  }
}

/** How hyped the attack button gets as the damage climbs. */
function hype(dmg: number): { tier: string; label: string } {
  if (dmg >= 80) return { tier: 'ultra', label: 'ULTRA COMBO!' };
  if (dmg >= 40) return { tier: 'mega', label: 'MEGA HIT!' };
  if (dmg >= 20) return { tier: 'big', label: 'BIG HIT!' };
  return { tier: '', label: '' };
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
    <button type="button" className={`btn${p.kind === 'post' ? ' primary pulse' : ''}`} onClick={() => send({ type: 'draw', player: me })}>
      Draw {view.config.drawCount}
    </button>
  );
  const end = (
    <button type="button" className="btn ghost" onClick={() => send({ type: 'endTurn', player: me })}>
      End turn
    </button>
  );

  if (p.kind === 'main') {
    const attackCards = selectedCards.filter(isAttackCard);
    const actionCards = selectedCards.filter((c) => !isAttackCard(c));
    const numbers = attackCards.filter((c) => c.kind === 'number').reduce((s, c) => s + c.value, 0);
    const mult = attackCards.filter((c) => c.kind === 'multiplier').reduce((m, c) => m * c.value, 1);
    // Same formula as the engine, including any wild event in force.
    const dmg = packetDamage(view, { id: 0, kind: 'attack', from: me, to: me, origin: me, cards: [], numbers, multiplier: mult, elements: [] });
    const t = target ? nameOf(target) : null;
    const h = hype(dmg);
    const self = view.players.find((x) => x.id === me)!;
    const ult = ultimateFor(self.fighter);
    const ultReady = view.config.ultimates && self.charge >= 100;
    return (
      <>
        {ultReady && (
          <button
            type="button"
            className="btn ult-btn"
            disabled={ult.targeted && !target}
            title={ult.description}
            onClick={() => send({ type: 'ultimate', player: me, target: ult.targeted ? target! : undefined })}
          >
            ★ {ult.name}
            {ult.targeted && t ? ` → ${t}` : ''}
          </button>
        )}
        {actionCards.length === 1 && attackCards.length === 0 ? (
          <button
            type="button"
            className="btn primary ready"
            disabled={!target}
            onClick={() => send({ type: 'playAction', player: me, cardId: actionCards[0].id, target: target! })}
          >
            Play {cardLabel(actionCards[0])}
            {t ? ` on ${t}` : ''}
          </button>
        ) : (
          <button
            type="button"
            className={`btn attack${target && actionCards.length === 0 ? ' ready' : ''}${h.tier ? ` hype-${h.tier}` : ''}`}
            disabled={!target || actionCards.length > 0}
            onClick={() => send({ type: 'attack', player: me, target: target!, cardIds: attackCards.map((c) => c.id) })}
          >
            {actionCards.length > 0 ? (
              'One action card at a time'
            ) : (
              <>
                {h.label && (
                  <span className="hype-label" key={h.tier}>
                    {h.label}
                  </span>
                )}
                Attack{t ? ` ${t}` : ''} ·{' '}
                <span className="dmg-pop" key={dmg}>
                  {dmg}
                </span>
              </>
            )}
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
          ⇄ Reverse
          {isAttack && mults.length ? (
            <>
              {' '}
              ·{' '}
              <span className="dmg-pop" key={boosted}>
                {boosted}
              </span>
            </>
          ) : null}
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
