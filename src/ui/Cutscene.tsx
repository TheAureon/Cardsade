import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { PlayerId } from '../engine/types';
import { Avatar, BACKDROPS, type Crop, type Mood } from './Avatar';
import { music } from './music';
import { sfx } from './sound';

export interface Fighter {
  id: PlayerId;
  name: string;
  /** Seat index: picks the portrait and the signature colour. */
  seed: number;
}

export type CutsceneSpec =
  | { kind: 'start'; hero: Fighter; rivals: Fighter[] }
  | { kind: 'special'; attacker: Fighter; target: Fighter; move: string; amount: number }
  | { kind: 'counter'; who: Fighter; against: Fighter; amount: number | null }
  | { kind: 'guard'; who: Fighter }
  | { kind: 'ko'; who: Fighter }
  | { kind: 'showdown'; a: Fighter; b: Fighter }
  | { kind: 'victory'; winner: Fighter; mine: boolean };

/** How long each scene runs. The game holds bots and effects for this long. */
export const CUTSCENE_MS: Record<CutsceneSpec['kind'], number> = {
  start: 2700,
  special: 2200,
  counter: 1450,
  guard: 1350,
  ko: 2300,
  showdown: 2600,
  victory: 3000,
};

const ELEMENTS = ['RADIANT', 'IRONCLAD', 'SHADOW', 'ROYAL', 'GLACIAL', 'TEMPEST'];
const PREFIX: Record<number, string> = { 2: 'DOUBLE', 3: 'TRIPLE', 4: 'QUAD', 6: 'HEXA', 9: 'NONA' };

/** Names a special move from who threw it, its multiplier and how hard it hits. */
export function moveName(seed: number, amount: number, multiplier: number): string {
  const noun = amount >= 100 ? 'APOCALYPSE' : amount >= 60 ? 'CATACLYSM' : amount >= 40 ? 'BREAKER' : 'STRIKE';
  const prefix = multiplier >= 12 ? 'OMEGA' : PREFIX[multiplier] ?? (multiplier > 1 ? `${multiplier}×` : '');
  return [prefix, ELEMENTS[seed % ELEMENTS.length], noun].filter(Boolean).join(' ');
}

const colour = (f: Fighter) => BACKDROPS[f.seed % BACKDROPS.length];

/**
 * Plays one scene, then calls onDone. Tap, click, Enter, Space or Escape
 * skips. Sound cues are scheduled to land on the scene's beats.
 */
export function Cutscene({ spec, onDone }: { spec: CutsceneSpec; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const ms = CUTSCENE_MS[spec.kind];
    music.duck(ms);
    const cues: [number, () => void][] = {
      start: [
        [0, () => sfx.cutIn()],
        [700, () => sfx.reaction()],
        [1500, () => sfx.impact()],
      ],
      special: [
        [0, () => sfx.cutIn()],
        [850, () => sfx.reaction(true)],
        [1400, () => sfx.impact()],
      ],
      counter: [[0, () => sfx.reverse()], [120, () => sfx.cutIn()]],
      guard: [[0, () => sfx.cutIn()], [350, () => sfx.block()]],
      ko: [[0, () => sfx.impact()], [500, () => sfx.ko()]],
      showdown: [[0, () => sfx.cutIn()], [600, () => sfx.thunder()], [1300, () => sfx.impact()]],
      victory: [[0, () => sfx.impact()], [300, () => (spec.kind === 'victory' && !spec.mine ? sfx.lose() : sfx.yourTurn())]],
    }[spec.kind] as [number, () => void][];
    const timers = cues.map(([at, fn]) => setTimeout(fn, at));
    timers.push(setTimeout(() => done.current(), ms));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        done.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
    };
  }, [spec]);

  return (
    <div
      className={`cs cs-${spec.kind}`}
      style={{ '--dur': `${CUTSCENE_MS[spec.kind]}ms` } as CSSProperties}
      onPointerDown={() => done.current()}
      role="dialog"
      aria-label={label(spec)}
    >
      <div className="cs-dim" />
      <Scene spec={spec} />
      <div className="cs-bar top" />
      <div className="cs-bar bottom" />
      <span className="cs-skip">Tap to skip</span>
    </div>
  );
}

function label(spec: CutsceneSpec): string {
  switch (spec.kind) {
    case 'start':
      return 'Battle start';
    case 'special':
      return `${spec.attacker.name} uses ${spec.move} on ${spec.target.name}`;
    case 'counter':
      return `${spec.who.name} counters`;
    case 'guard':
      return `${spec.who.name} guards`;
    case 'ko':
      return `${spec.who.name} is knocked out`;
    case 'showdown':
      return `Final showdown: ${spec.a.name} versus ${spec.b.name}`;
    case 'victory':
      return spec.mine ? 'Victory' : `Defeat: ${spec.winner.name} wins`;
  }
}

function Scene({ spec }: { spec: CutsceneSpec }) {
  switch (spec.kind) {
    case 'start':
      return (
        <>
          <div className="cs-focus" />
          <div className="cs-split left" style={{ '--c': colour(spec.hero) } as CSSProperties}>
            <Portrait fighter={spec.hero} mood="intense" crop="face" />
            <span className="cs-plate">{spec.hero.name}</span>
          </div>
          <div className="cs-split right">
            {spec.rivals.map((r, i) => (
              <div key={r.id} className="cs-rival" style={{ '--c': colour(r), '--i': i } as CSSProperties}>
                <Portrait fighter={r} mood="intense" crop="face" />
                <span className="cs-plate small">{r.name}</span>
              </div>
            ))}
          </div>
          <div className="cs-vs">VS</div>
          <Title delay={1450} kanji="ファイト!">
            Battle start!
          </Title>
          <Impact at={1450} />
        </>
      );

    case 'special':
      return (
        <>
          <div className="cs-focus" />
          <Band fighter={spec.attacker} mood="intense" from="right" slot="upper">
            <span className="cs-tag">必殺技</span>
            <span className="cs-move">{spec.move}</span>
          </Band>
          <Band fighter={spec.target} mood="shock" from="left" slot="lower" delay={820}>
            <span className="cs-shout">!?</span>
          </Band>
          <Impact at={1380}>
            <span className="cs-damage">{spec.amount}</span>
          </Impact>
        </>
      );

    case 'counter':
      return (
        <>
          <div className="cs-focus red" />
          <Band fighter={spec.who} mood="intense" from="left" slot="middle" tint="counter">
            <span className="cs-tag">反撃</span>
            <span className="cs-move">Counter!</span>
            {spec.amount !== null && <span className="cs-sub">⇄ {spec.amount} back at {spec.against.name}</span>}
          </Band>
        </>
      );

    case 'guard':
      return (
        <>
          <div className="cs-focus steel" />
          <Band fighter={spec.who} mood="intense" from="right" slot="middle" tint="guard">
            <span className="cs-tag">防御</span>
            <span className="cs-move">Guard!</span>
          </Band>
          <div className="cs-shield" />
        </>
      );

    case 'ko':
      return (
        <>
          <Impact at={0} />
          <div className="cs-ko-wrap" style={{ '--c': colour(spec.who) } as CSSProperties}>
            <div className="cs-ko-face">
              <Portrait fighter={spec.who} mood="ko" crop="face" />
              <Cracks />
            </div>
            <span className="cs-plate">{spec.who.name}</span>
          </div>
          <div className="cs-ko-text">
            <span className="cs-ko-kanji">撃破</span>
            <span className="cs-ko-big">K.O.</span>
          </div>
        </>
      );

    case 'showdown':
      return (
        <>
          <div className="cs-diag a" style={{ '--c': colour(spec.a) } as CSSProperties}>
            <Portrait fighter={spec.a} mood="intense" crop="face" />
            <span className="cs-plate">{spec.a.name}</span>
          </div>
          <div className="cs-diag b" style={{ '--c': colour(spec.b) } as CSSProperties}>
            <Portrait fighter={spec.b} mood="intense" crop="face" />
            <span className="cs-plate">{spec.b.name}</span>
          </div>
          <Lightning />
          <div className="cs-vs late">VS</div>
          <Title delay={1300} kanji="決戦">
            Final showdown
          </Title>
          <Impact at={1300} />
        </>
      );

    case 'victory':
      return (
        <>
          <div className={`cs-rays${spec.mine ? '' : ' dark'}`} />
          <Sparkles />
          <div className="cs-winner" style={{ '--c': colour(spec.winner) } as CSSProperties}>
            <Portrait fighter={spec.winner} mood={spec.mine ? 'win' : 'intense'} crop="face" />
          </div>
          <Title delay={350} kanji={spec.mine ? '勝利' : '敗北'} variant={spec.mine ? 'gold' : 'red'}>
            {spec.mine ? 'Victory!' : 'Defeat'}
          </Title>
          <p className="cs-caption">{spec.mine ? 'Your crusade is complete.' : `${spec.winner.name} wins the crusade.`}</p>
        </>
      );
  }
}

function Portrait({ fighter, mood, crop }: { fighter: Fighter; mood: Mood; crop: Crop }) {
  return (
    <div className="cs-portrait">
      <Avatar seed={fighter.seed} mood={mood} crop={crop} />
    </div>
  );
}

/** The anime cut-in: a slanted band of speed lines with a close-up across the eyes. */
function Band(props: {
  fighter: Fighter;
  mood: Mood;
  from: 'left' | 'right';
  slot: 'upper' | 'lower' | 'middle';
  delay?: number;
  tint?: 'counter' | 'guard';
  children?: ReactNode;
}) {
  const { fighter, mood, from, slot, delay = 0, tint, children } = props;
  return (
    <div
      className={`cs-band from-${from} slot-${slot}${tint ? ` tint-${tint}` : ''}`}
      style={{ '--c': colour(fighter), '--delay': `${delay}ms` } as CSSProperties}
    >
      <div className="cs-band-lines" />
      <div className="cs-band-eyes">
        <Avatar seed={fighter.seed} mood={mood} crop="eyes" />
      </div>
      <div className="cs-band-text">{children}</div>
    </div>
  );
}

function Title({ children, kanji, delay = 0, variant = 'gold' }: { children: ReactNode; kanji: string; delay?: number; variant?: 'gold' | 'red' }) {
  return (
    <div className={`cs-title ${variant}`} style={{ '--delay': `${delay}ms` } as CSSProperties}>
      <span className="cs-kanji">{kanji}</span>
      <span className="cs-title-text">{children}</span>
    </div>
  );
}

/** The impact frame: a white flash, an inverted beat, then black with white focus lines. */
function Impact({ at, children }: { at: number; children?: ReactNode }) {
  return (
    <div className="cs-impact" style={{ '--delay': `${at}ms` } as CSSProperties}>
      <div className="cs-impact-lines" />
      {children}
    </div>
  );
}

function Cracks() {
  return (
    <svg className="cs-cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="52,0 48,18 56,30 44,46 54,60 46,78 52,100" />
      <polyline points="48,18 30,22 18,10" />
      <polyline points="56,30 74,34 92,22" />
      <polyline points="44,46 22,52 4,48" />
      <polyline points="54,60 72,66 96,74" />
      <polyline points="46,78 28,86 14,100" />
    </svg>
  );
}

function Lightning() {
  return (
    <svg className="cs-lightning" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline className="glow" points="58,0 46,30 60,34 40,66 56,70 38,100" />
      <polyline className="core" points="58,0 46,30 60,34 40,66 56,70 38,100" />
    </svg>
  );
}

function Sparkles() {
  return (
    <div className="cs-sparkles" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          style={
            {
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              '--i': i,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
