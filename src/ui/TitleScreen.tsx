import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { unlockAudio } from './audio';
import { Avatar, BACKDROPS } from './Avatar';
import { Embers } from './MenuScreen';
import { music } from './music';
import { sfx } from './sound';

type Phase = 'intro' | 'idle' | 'leaving';

/** When each beat of the intro lands, in ms. The CSS uses the same timings. */
const PANEL_START = 250;
const PANEL_GAP = 280;
const LOGO_AT = 2450;
const INTRO_END = 3600;

/**
 * The attract screen: the roster slams in panel by panel, the logo drops
 * with a flash and a shake, then it waits on PRESS START. Any key or tap
 * skips the intro; the next one starts the game.
 */
export function TitleScreen({ cast, onStart }: { cast: string[]; onStart: () => void }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [touch] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);

  // Sound cues for the intro (silent until the browser allows audio).
  useEffect(() => {
    if (phase !== 'intro') return;
    const timers = cast.map((_, i) => setTimeout(() => sfx.slam(i), PANEL_START + i * PANEL_GAP + 150));
    timers.push(setTimeout(sfx.logo, LOGO_AT + 120));
    timers.push(setTimeout(() => setPhase('idle'), INTRO_END));
    return () => timers.forEach(clearTimeout);
  }, [phase, cast]);

  useEffect(() => {
    if (phase === 'idle') music.play('menu');
  }, [phase]);

  const advance = useCallback(() => {
    unlockAudio();
    if (phase === 'intro') return setPhase('idle');
    if (phase === 'idle') {
      setPhase('leaving');
      sfx.start();
      setTimeout(onStart, 650);
    }
  }, [phase, onStart]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance]);

  return (
    <div
      className={`arena cine ${phase}`}
      onPointerDown={advance}
      role="button"
      tabIndex={0}
      aria-label={phase === 'intro' ? 'Skip intro' : 'Start'}
    >
      <div className="roster-drift" aria-hidden="true">
        <div className="roster intro-anim">
          {cast.map((name, i) => (
            <div
              key={name}
              className="strip"
              style={{ '--i': i, '--bg': BACKDROPS[i % BACKDROPS.length] } as CSSProperties}
            >
              <div className="strip-inner intro-anim">
                <div className="strip-art">
                  <Avatar seed={i} />
                </div>
                <span className="strip-name">{name}</span>
                <span className="strip-flash intro-anim" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="cine-vignette intro-anim" aria-hidden="true" />
      <div className="cine-burst intro-anim" aria-hidden="true">
        <div className="sunburst" />
      </div>
      <Embers />

      <div className="cine-center intro-anim">
        <div className="cine-logo-wrap intro-anim">
          <h1 className="cine-logo">
            <span className="l-card">CARD</span>
            <span className="l-sade">SADE</span>
          </h1>
          <span className="cine-logo cine-shine" aria-hidden="true">
            CARDSADE
          </span>
        </div>
        <p className="cine-tagline intro-anim">Card + Crusade</p>
      </div>

      <div className="press-start intro-anim">
        <span>{touch ? 'Tap to start' : 'Press start'}</span>
      </div>
      <p className="cine-foot intro-anim">© 2026 Cardsade · v0.1</p>

      <div className="cine-flash intro-anim" aria-hidden="true" />
      <div className="cine-exit" aria-hidden="true" />
    </div>
  );
}
