import { useEffect, useMemo, useRef, useState } from 'react';
import { createGame, getPending } from '../engine/engine';
import type { PlayerId } from '../engine/types';
import { GameHost } from '../host/GameHost';
import { ReplayHost } from '../host/ReplayHost';
import { GameScreen, type ScreenOptions } from './GameScreen';
import { MenuScreen } from './MenuScreen';
import { CHAPTERS, dailyScore, today, type MatchSetup } from './modes';
import { defaultSetup, ModeSelect, type SetupState } from './ModeSelect';
import { getProfile, updateProfile } from './profileStore';
import { ProfileScreen } from './ProfileScreen';
import type { SavedReplay } from './replays';
import { sfx } from './sound';
import { StatsScreen } from './StatsScreen';
import { TitleScreen } from './TitleScreen';

type Screen = 'title' | 'menu' | 'profile' | 'stats' | 'setup' | 'game' | 'replay';

const BOT_NAMES = ['Sir Clank', 'Lady Vex', 'Brother Mox', 'The Pale Knight', 'Grizzlewick'];

interface Live {
  host: GameHost;
  setup: MatchSetup;
  humans: PlayerId[];
}

export function App() {
  const [settings, setSettings] = useState<SetupState>(defaultSetup);
  const [live, setLive] = useState<Live | null>(null);
  const [replay, setReplay] = useState<{ host: ReplayHost; saved: SavedReplay } | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  // Count screen changes so the wipe plays on every change but not on first load.
  const changes = useRef(0);
  const go = (next: Screen) => {
    changes.current++;
    setScreen(next);
  };

  const start = (setup: MatchSetup) => {
    const state = createGame(setup.seats, setup.config);
    const host = new GameHost(state, { botDelayMs: 900, seats: setup.seats });
    setLive({ host, setup, humans: setup.seats.filter((s) => s.controller === 'human').map((s) => s.id) });
    go('game');
  };

  const exitGame = () => {
    live?.host.dispose();
    setLive(null);
    go('setup');
  };

  const watch = (saved: SavedReplay) => {
    setReplay({ host: new ReplayHost(saved.recording), saved });
    go('replay');
  };

  const exitReplay = () => {
    replay?.host.dispose();
    setReplay(null);
    go('stats');
  };

  const cast = [settings.name.trim() || 'Crusader', ...BOT_NAMES];

  return (
    <>
      {screen === 'title' && <TitleScreen cast={cast} onStart={() => go('menu')} />}
      {screen === 'menu' && (
        <MenuScreen
          cast={cast}
          onPlay={() => go('setup')}
          onTitle={() => go('title')}
          onProfile={() => go('profile')}
          onStats={() => go('stats')}
        />
      )}
      {screen === 'profile' && <ProfileScreen name={cast[0]} onBack={() => go('menu')} />}
      {screen === 'stats' && <StatsScreen onBack={() => go('menu')} onWatch={watch} />}
      {screen === 'setup' && (
        <ModeSelect
          settings={settings}
          onChange={setSettings}
          onStart={start}
          onBack={() => {
            sfx.click();
            go('menu');
          }}
        />
      )}
      {screen === 'game' && live && <LiveGame live={live} onExit={exitGame} />}
      {screen === 'replay' && replay && <ReplayView replay={replay} onExit={exitReplay} />}
      {changes.current > 0 && <div className="wipe" key={changes.current} aria-hidden="true" />}
    </>
  );
}

/** Mode-specific scoring around the shared game screen, plus pass-and-play hand-offs. */
function LiveGame({ live, onExit }: { live: Live; onExit: () => void }) {
  const { host, setup, humans } = live;
  const hotseat = humans.length > 1;
  const [viewer, setViewer] = useState<PlayerId>(humans[0]);
  const [curtain, setCurtain] = useState<PlayerId | null>(hotseat ? humans[0] : null);
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;

  // Pass-and-play: when another person's decision comes up, cover the screen until they take the device.
  useEffect(() => {
    if (!hotseat) return;
    return host.subscribe(() => {
      const p = getPending(host.getState());
      if (p.kind !== 'gameOver' && humans.includes(p.player) && p.player !== viewerRef.current) setCurtain(p.player);
    });
  }, [host, humans, hotseat]);

  const client = useMemo(() => host.client(viewer), [host, viewer]);

  const options = useMemo<ScreenOptions>(() => {
    const story = setup.chapter !== undefined ? CHAPTERS[setup.chapter] : null;
    const { key } = today();
    return {
      mode: setup.mode,
      label: setup.label,
      track: setup.track,
      tutorial: setup.mode === 'tutorial',
      recording: () => host.recording(),
      extraXp: (won) => {
        if (story && won && getProfile().story <= setup.chapter!) return [{ label: `Chapter cleared: ${story.title}`, xp: story.bonusXp }];
        if (setup.mode === 'daily' && getProfile().daily[key] === undefined) return [{ label: 'First daily run today', xp: 75 }];
        return [];
      },
      onFinished: (m) => {
        if (setup.chapter !== undefined && m.won) updateProfile((p) => ({ ...p, story: Math.max(p.story, setup.chapter! + 1) }));
        if (setup.mode === 'daily') {
          const score = dailyScore(m.won, m.placement, m.finalHp, m.myTurns, m.damageDealt);
          updateProfile((p) => ({ ...p, daily: { ...p.daily, [key]: Math.max(p.daily[key] ?? 0, score) } }));
        }
      },
    };
  }, [host, setup]);

  const curtainName = curtain ? host.getState().players.find((p) => p.id === curtain)?.name : '';
  return (
    <>
      <GameScreen client={client} onExit={onExit} options={options} />
      {curtain && (
        <div
          className="overlay hotseat-curtain"
          onClick={() => {
            sfx.click();
            setViewer(curtain);
            setCurtain(null);
          }}
        >
          <div className="comic-panel">
            <small>Pass & Play</small>
            <h2 className="big">Pass to {curtainName}</h2>
            <p>Everyone else, look away. Tap when {curtainName} has the device.</p>
            <button type="button" className="btn primary">
              I'm {curtainName}, show my hand
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ReplayView({ replay, onExit }: { replay: { host: ReplayHost; saved: SavedReplay }; onExit: () => void }) {
  const { host, saved } = replay;
  const client = useMemo(() => host.client(saved.viewer), [host, saved.viewer]);
  const [, force] = useState(0);
  useEffect(() => client.subscribe(() => force((n) => n + 1)), [client]);
  const options = useMemo<ScreenOptions>(() => ({ mode: 'quick', label: saved.label, track: false, readOnly: true }), [saved.label]);
  const { step, total } = host.progress;
  return (
    <>
      <GameScreen client={client} onExit={onExit} options={options} />
      <div className="replay-bar" role="toolbar" aria-label="Replay controls">
        <b>Replay</b>
        <span className="muted">
          {saved.label} · move {step}/{total}
        </span>
        <button type="button" className="btn" onClick={() => host.setPlaying(!host.playing)}>
          {host.playing ? 'Pause' : 'Play'}
        </button>
        {[
          ['½×', 1600],
          ['1×', 900],
          ['2×', 450],
          ['4×', 200],
        ].map(([label, ms]) => (
          <button key={label} type="button" className={`btn${host.speed === ms ? ' primary' : ''}`} onClick={() => host.setSpeed(ms as number)}>
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
