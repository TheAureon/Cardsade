import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Card } from '../engine/types';
import { unlockAudio } from './audio';
import { AudioToggles } from './AudioToggles';
import { Avatar } from './Avatar';
import { CardView } from './CardView';
import { music } from './music';
import { Rules } from './Rules';
import { sfx } from './sound';

const ORBIT: Card[] = [
  { id: 'o1', kind: 'reverse', value: 0 },
  { id: 'o2', kind: 'multiplier', value: 3 },
  { id: 'o3', kind: 'number', value: 9 },
  { id: 'o4', kind: 'block', value: 0 },
  { id: 'o5', kind: 'skip', value: 0 },
  { id: 'o6', kind: 'number', value: 4 },
  { id: 'o7', kind: 'multiplier', value: 2 },
  { id: 'o8', kind: 'discard', value: 0 },
];

const LETTERS = 'CARDSADE'.split('');

export function TitleScreen({ cast, onPlay }: { cast: string[]; onPlay: () => void }) {
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    music.setIntensity(1);
    music.play('menu');
  }, []);

  const play = () => {
    unlockAudio();
    sfx.yourTurn();
    onPlay();
  };

  // Enter or Space starts, like an arcade cabinet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rulesOpen) {
        if (e.key === 'Escape') setRulesOpen(false);
        return;
      }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) play();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="arena title-screen" onPointerDown={unlockAudio}>
      <div className="sunburst" aria-hidden="true" />
      <Embers />

      <div className="title-stage">
        <OrbitCards />
        <div className="title-impact" aria-hidden="true" />
        <h1 className="title-logo" aria-label="Cardsade">
          {LETTERS.map((ch, i) => (
            <span key={i} className={i < 4 ? 'l-card' : 'l-sade'} style={{ '--i': i } as CSSProperties} aria-hidden="true">
              {ch}
            </span>
          ))}
        </h1>
        <p className="title-tagline">Card + Crusade</p>
      </div>

      <div className="title-menu">
        <button type="button" className="btn primary play-btn" onClick={play} autoFocus>
          Play
        </button>
        <div className="title-row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              unlockAudio();
              sfx.click();
              setRulesOpen(true);
            }}
          >
            How to play
          </button>
          <AudioToggles className="btn" />
        </div>
        <p className="title-blurb">Fight 1–5 rivals · 100 HP each · Last one standing wins</p>
      </div>

      <div className="title-cast" aria-hidden="true">
        {cast.map((name, i) => (
          <div key={name} className={`cast-card${i === 0 ? ' hero-card' : ''}`} style={{ '--i': i } as CSSProperties}>
            <div className="cast-frame">
              <Avatar seed={i} />
            </div>
            <span className="nameplate">{name}</span>
          </div>
        ))}
      </div>

      {rulesOpen && (
        <div className="overlay" onClick={() => setRulesOpen(false)}>
          <div className="comic-panel rules rules-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="How to play">
            <h2>How to play</h2>
            <Rules />
            <button type="button" className="btn primary" onClick={() => setRulesOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Cards circling the logo on a tilted ring: positions come from an ellipse,
 * cards on the far side shrink, darken and pass behind the logo.
 */
function OrbitCards() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = still ? 0.6 : (now - start) / 1000;
      refs.current.forEach((el, i) => {
        if (!el) return;
        const a = t * 0.35 + (i / ORBIT.length) * Math.PI * 2;
        const x = Math.cos(a);
        const y = Math.sin(a);
        const depth = (y + 1) / 2;
        el.style.setProperty('--x', x.toFixed(4));
        el.style.setProperty('--y', y.toFixed(4));
        el.style.setProperty('--d', depth.toFixed(4));
        el.style.setProperty('--spin', `${(x * 14 + Math.sin(t * 1.3 + i) * 6).toFixed(2)}deg`);
        el.style.zIndex = depth > 0.5 ? '4' : '1';
      });
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="orbit" aria-hidden="true">
      {ORBIT.map((c, i) => (
        <div key={c.id} className="orbit-card" ref={(el) => void (refs.current[i] = el)}>
          <CardView card={c} disabled width={84} />
        </div>
      ))}
    </div>
  );
}

function Embers() {
  const [embers] = useState(() =>
    Array.from({ length: 22 }, () => ({
      left: Math.random() * 100,
      size: 3 + Math.random() * 6,
      delay: -Math.random() * 8,
      dur: 6 + Math.random() * 6,
      drift: (Math.random() - 0.5) * 120,
    })),
  );
  return (
    <div className="embers" aria-hidden="true">
      {embers.map((e, i) => (
        <span
          key={i}
          style={
            {
              left: `${e.left}%`,
              width: e.size,
              height: e.size,
              animationDelay: `${e.delay}s`,
              animationDuration: `${e.dur}s`,
              '--drift': `${e.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
