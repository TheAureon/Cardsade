import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CardBack } from './CardView';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type ProjectileVariant = 'attack' | 'reverse' | 'action' | 'skip' | 'draw';
export type StampVariant = 'reverse' | 'block' | 'skip' | 'ko' | 'hit';

interface Piece {
  dx: number;
  dy: number;
  rot: number;
  size: number;
  color: string;
  delay: number;
  star: boolean;
}

export type FxItem = { id: number } & (
  | { kind: 'projectile'; x1: number; y1: number; x2: number; y2: number; variant: ProjectileVariant; label?: string }
  | { kind: 'stamp'; x: number; y: number; text: string; variant: StampVariant; big?: boolean }
  | { kind: 'particles'; x: number; y: number; pieces: Piece[] }
  | { kind: 'float'; x: number; y: number; text: string; variant: 'damage' | 'info' }
  | { kind: 'banner'; text: string; variant: 'turn' | 'incoming' }
  | { kind: 'flash' }
  | { kind: 'confetti'; pieces: Piece[] }
);

export type FxSpec = DistributiveOmit<FxItem, 'id'>;

export const PALETTES = {
  hit: ['#ffd21f', '#ff8a00', '#ffffff', '#e0263a'],
  block: ['#ffffff', '#c9d3dd', '#9fb0c0', '#ffd21f'],
  magic: ['#b98aff', '#7a3fd0', '#ffffff', '#29b6e8'],
  party: ['#ffd21f', '#e0263a', '#1f7ae0', '#2bb24c', '#ff8a00', '#ffffff'],
};

/** Random burst geometry, made once when the effect is created. */
export function burstPieces(count: number, spread: number, palette: string[]): Piece[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.45 + Math.random() * 0.75);
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - spread * 0.25,
      rot: (Math.random() - 0.5) * 720,
      size: 6 + Math.random() * 10,
      color: palette[Math.floor(Math.random() * palette.length)],
      delay: Math.random() * 60,
      star: Math.random() < 0.55,
    };
  });
}

function confettiPieces(count: number): Piece[] {
  return Array.from({ length: count }, () => ({
    dx: Math.random() * 100,
    dy: 0,
    rot: (Math.random() - 0.5) * 1080,
    size: 7 + Math.random() * 8,
    color: PALETTES.party[Math.floor(Math.random() * PALETTES.party.length)],
    delay: Math.random() * 900,
    star: Math.random() < 0.3,
  }));
}

export function makeConfetti(): FxSpec {
  return { kind: 'confetti', pieces: confettiPieces(110) };
}

/** Holds short-lived effects and the timers that add and remove them. */
export function useFx() {
  const [items, setItems] = useState<FxItem[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const later = useCallback((fn: () => void, ms: number) => {
    if (ms <= 0) return fn();
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);

  const add = useCallback(
    (spec: FxSpec, ttl: number, delay = 0) => {
      later(() => {
        const id = nextId.current++;
        setItems((list) => [...list, { ...spec, id } as FxItem]);
        later(() => setItems((list) => list.filter((x) => x.id !== id)), ttl);
      }, delay);
    },
    [later],
  );

  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearTimeout);
  }, []);

  return { items, add, later };
}

const px = (n: number) => `${Math.round(n)}px`;

export function FxLayer({ items }: { items: FxItem[] }) {
  return (
    <div className="fx-layer" aria-hidden="true">
      {items.map((item) => {
        switch (item.kind) {
          case 'projectile': {
            const lift = Math.max(70, Math.abs(item.x2 - item.x1) * 0.25);
            const style = {
              '--x1': px(item.x1),
              '--y1': px(item.y1),
              '--x2': px(item.x2),
              '--y2': px(item.y2),
              '--xm': px((item.x1 + item.x2) / 2),
              '--ym': px(Math.min(item.y1, item.y2) - lift),
            } as CSSProperties;
            // Trailing glows run the same flight a few ms behind, so they read as motion blur.
            return [3, 2, 1].map((t) => (
              <div
                key={`${item.id}-t${t}`}
                className={`fx-proj fx-trail v-${item.variant}`}
                style={{ ...style, animationDelay: `${t * 32}ms`, '--trail': 1 - t * 0.22 } as CSSProperties}
              >
                <span className="fx-orb" />
              </div>
            )).concat(
              <div key={item.id} className={`fx-proj v-${item.variant}`} style={style}>
                <span className="fx-proj-core">
                  {item.variant === 'draw' || item.variant === 'attack' ? <CardBack width={34} /> : <span className="fx-orb" />}
                </span>
                {item.label && <span className="fx-proj-label">{item.label}</span>}
              </div>,
            );
          }
          case 'stamp':
            return (
              <div
                key={item.id}
                className={`fx-stamp v-${item.variant}${item.big ? ' big' : ''}`}
                style={{ left: px(item.x), top: px(item.y) }}
              >
                <span>{item.text}</span>
              </div>
            );
          case 'particles':
            return (
              <div key={item.id} className="fx-particles" style={{ left: px(item.x), top: px(item.y) }}>
                {item.pieces.map((p, i) => (
                  <span
                    key={i}
                    className={p.star ? 'star' : ''}
                    style={
                      {
                        '--dx': px(p.dx),
                        '--dy': px(p.dy),
                        '--rot': `${p.rot}deg`,
                        width: px(p.size),
                        height: px(p.size),
                        background: p.color,
                        animationDelay: `${p.delay}ms`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            );
          case 'float':
            return (
              <div key={item.id} className={`fx-float v-${item.variant}`} style={{ left: px(item.x), top: px(item.y) }}>
                {item.text}
              </div>
            );
          case 'banner':
            return (
              <div key={item.id} className={`fx-banner v-${item.variant}`}>
                <span>{item.text}</span>
              </div>
            );
          case 'flash':
            return <div key={item.id} className="fx-flash" />;
          case 'confetti':
            return (
              <div key={item.id} className="fx-confetti">
                {item.pieces.map((p, i) => (
                  <span
                    key={i}
                    className={p.star ? 'star' : ''}
                    style={
                      {
                        left: `${p.dx}%`,
                        '--rot': `${p.rot}deg`,
                        width: px(p.size),
                        height: px(p.size * (p.star ? 1 : 0.5)),
                        background: p.color,
                        animationDelay: `${p.delay}ms`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}
