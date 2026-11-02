import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createGame, type SeatSetup } from '../engine/engine';
import type { Card } from '../engine/types';
import { CardView } from './CardView';
import { unlockAudio } from './audio';
import { AudioToggles } from './AudioToggles';
import { music } from './music';
import { GameHost, type GameClient } from '../host/GameHost';
import { GameScreen } from './GameScreen';
import { Rules } from './Rules';
import { sfx } from './sound';
import { TitleScreen } from './TitleScreen';

const HERO_CARDS: Card[] = [
  { id: 'h1', kind: 'reverse', value: 0 },
  { id: 'h2', kind: 'number', value: 7 },
  { id: 'h3', kind: 'multiplier', value: 3 },
  { id: 'h4', kind: 'number', value: 4 },
  { id: 'h5', kind: 'block', value: 0 },
];

const BOT_NAMES = ['Sir Clank', 'Lady Vex', 'Brother Mox', 'The Pale Knight', 'Grizzlewick'];

interface Settings {
  name: string;
  opponents: number;
  drawCount: number;
}

type Screen = 'title' | 'setup' | 'game';

export function App() {
  const [settings, setSettings] = useState<Settings>({ name: 'Crusader', opponents: 2, drawCount: 2 });
  const [game, setGame] = useState<{ host: GameHost; client: GameClient } | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  // Count screen changes so the wipe plays on every change but not on first load.
  const changes = useRef(0);
  const go = (next: Screen) => {
    changes.current++;
    setScreen(next);
  };

  const start = () => {
    unlockAudio();
    const seats: SeatSetup[] = [
      { id: 'human', name: settings.name.trim() || 'Crusader', controller: 'human' },
      ...BOT_NAMES.slice(0, settings.opponents).map((name, i) => ({ id: `bot${i + 1}`, name, controller: 'bot' as const })),
    ];
    const state = createGame(seats, { drawCount: settings.drawCount, seed: Date.now() >>> 0 });
    const host = new GameHost(state, { botDelayMs: 900 });
    setGame({ host, client: host.client('human') });
    go('game');
  };

  const exit = () => {
    game?.host.dispose();
    setGame(null);
    go('setup');
  };

  const cast = [settings.name.trim() || 'Crusader', ...BOT_NAMES];

  return (
    <>
      {screen === 'title' && <TitleScreen cast={cast} onPlay={() => go('setup')} />}
      {screen === 'setup' && (
        <Setup
          settings={settings}
          onChange={setSettings}
          onStart={start}
          onBack={() => {
            sfx.click();
            go('title');
          }}
        />
      )}
      {screen === 'game' && game && <GameScreen client={game.client} onExit={exit} />}
      {changes.current > 0 && <div className="wipe" key={changes.current} aria-hidden="true" />}
    </>
  );
}

function Setup({
  settings,
  onChange,
  onStart,
  onBack,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  // The menu theme starts with the first tap anywhere (browsers block audio before that).
  useEffect(() => {
    music.setIntensity(1);
    music.play('menu');
  }, []);
  return (
    <div className="arena setup" onPointerDown={unlockAudio}>
      <div className="setup-top">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← Title
        </button>
      </div>
      <div className="hero">
        <div className="hero-fan" aria-hidden="true">
          {HERO_CARDS.map((c, i) => (
            <CardView key={c.id} card={c} width={92} disabled style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <h2 className="setup-heading">Choose your battle</h2>
      </div>
      <div className="comic-panel setup-panel">
        <label>
          Your name
          <input id="player-name" value={settings.name} maxLength={20} onChange={(e) => onChange({ ...settings, name: e.target.value })} />
        </label>
        <div className="field">
          <span>Opponents</span>
          <div className="segmented">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={settings.opponents === n ? 'on' : ''}
                onClick={() => onChange({ ...settings, opponents: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Cards per draw</span>
          <div className="segmented">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                className={settings.drawCount === n ? 'on' : ''}
                onClick={() => onChange({ ...settings, drawCount: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="audio-row">
          <AudioToggles className="btn" />
        </div>
        <button type="button" className="btn primary big" onClick={onStart}>
          Begin the crusade
        </button>
      </div>

      <details className="comic-panel rules">
        <summary>How to play</summary>
        <Rules />
      </details>
    </div>
  );
}
