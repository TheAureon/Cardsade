import { useState, type CSSProperties } from 'react';
import { CARD_INFO } from '../engine/cards';
import { createGame, type SeatSetup } from '../engine/engine';
import type { Card, CardKind } from '../engine/types';
import { CardView } from './CardView';
import { unlockAudio } from './sound';
import { GameHost, type GameClient } from '../host/GameHost';
import { GameScreen } from './GameScreen';

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

export function App() {
  const [settings, setSettings] = useState<Settings>({ name: 'Crusader', opponents: 2, drawCount: 2 });
  const [game, setGame] = useState<{ host: GameHost; client: GameClient } | null>(null);

  const start = () => {
    unlockAudio();
    const seats: SeatSetup[] = [
      { id: 'human', name: settings.name.trim() || 'Crusader', controller: 'human' },
      ...BOT_NAMES.slice(0, settings.opponents).map((name, i) => ({ id: `bot${i + 1}`, name, controller: 'bot' as const })),
    ];
    const state = createGame(seats, { drawCount: settings.drawCount, seed: Date.now() >>> 0 });
    const host = new GameHost(state, { botDelayMs: 900 });
    setGame({ host, client: host.client('human') });
  };

  const exit = () => {
    game?.host.dispose();
    setGame(null);
  };

  if (game) return <GameScreen client={game.client} onExit={exit} />;
  return <Setup settings={settings} onChange={setSettings} onStart={start} />;
}

function Setup({ settings, onChange, onStart }: { settings: Settings; onChange: (s: Settings) => void; onStart: () => void }) {
  return (
    <div className="arena setup">
      <div className="hero">
        <div className="hero-fan" aria-hidden="true">
          {HERO_CARDS.map((c, i) => (
            <CardView key={c.id} card={c} width={92} disabled style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <h1 className="logo">Cardsade</h1>
        <p className="tagline">Card + Crusade</p>
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
        <button type="button" className="btn primary big" onClick={onStart}>
          Begin the crusade
        </button>
      </div>

      <details className="comic-panel rules">
        <summary>How to play</summary>
        <ul>
          <li>Everyone starts with 100 HP and 7 cards. The last player standing wins.</li>
          <li>
            On your turn, play any action cards you like, then make <b>one attack</b> on a player. An attack does 1 damage, plus
            your number cards, times your multipliers: <code>(1 + numbers) × multipliers</code>.
          </li>
          <li>You can draw at any point in your turn, but drawing ends it.</li>
          <li>
            When something comes at you, you can Block it, Reverse it, Skip it, or take it. The chain bounces back and forth
            until someone takes it or blocks it.
          </li>
        </ul>
        <table>
          <tbody>
            {(Object.keys(CARD_INFO) as CardKind[]).map((k) => (
              <tr key={k}>
                <th>{CARD_INFO[k].name}</th>
                <td>
                  {CARD_INFO[k].description}{' '}
                  <span className="muted">
                    ({CARD_INFO[k].blockable ? 'can be blocked' : "can't be blocked"},{' '}
                    {CARD_INFO[k].reversible ? 'can be reversed' : "can't be reversed"})
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
