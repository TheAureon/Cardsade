import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { unlockAudio } from './audio';
import { AudioToggles } from './AudioToggles';
import { Avatar } from './Avatar';
import { music } from './music';
import { getProfile, subscribeProfile } from './profileStore';
import { Rules } from './Rules';
import { cutscenesOn, setCutscenes, subscribeSettings } from './settings';
import { sfx } from './sound';
import {
  bossMatch,
  CHAPTERS,
  dailyMatch,
  FIGHTERS,
  hotseatMatch,
  quickMatch,
  today,
  tutorialMatch,
  type MatchSetup,
  type Rules as RuleSet,
} from './modes';

type Tab = 'quick' | 'story' | 'daily' | 'boss' | 'hotseat' | 'tutorial';

const TABS: { id: Tab; name: string; blurb: string }[] = [
  { id: 'quick', name: 'Quick Battle', blurb: 'You against 1–5 rivals, free-for-all or in teams.' },
  { id: 'story', name: 'Crusade', blurb: 'Six story battles against the whole cast.' },
  { id: 'daily', name: 'Daily', blurb: 'Same deck and rivals for everyone today. Beat your best score.' },
  { id: 'boss', name: 'Boss Battle', blurb: 'You and two allies against an empowered tyrant.' },
  { id: 'hotseat', name: 'Pass & Play', blurb: 'Friends share this device, turn by turn.' },
  { id: 'tutorial', name: 'Tutorial', blurb: 'A guided first match that teaches every move.' },
];

export interface SetupState {
  name: string;
  opponents: number;
  drawCount: number;
  rules: RuleSet;
  teams: boolean;
  boss: number;
  hotseatNames: string[];
  hotseatBots: number;
}

export function defaultSetup(): SetupState {
  return {
    name: 'Crusader',
    opponents: 2,
    drawCount: 2,
    rules: { elements: true, ultimates: true, wildEvents: true },
    teams: false,
    boss: 4,
    hotseatNames: ['Player 1', 'Player 2'],
    hotseatBots: 1,
  };
}

/** The mode hub: pick a mode, tweak it, start a match. */
export function ModeSelect({
  settings,
  onChange,
  onStart,
  onBack,
}: {
  settings: SetupState;
  onChange: (s: SetupState) => void;
  onStart: (setup: MatchSetup) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('quick');
  const [chapter, setChapter] = useState<number | null>(null);
  const profile = useSyncExternalStore(subscribeProfile, getProfile);
  const name = settings.name.trim() || 'Crusader';
  const set = (patch: Partial<SetupState>) => onChange({ ...settings, ...patch });
  const go = (setup: MatchSetup) => {
    unlockAudio();
    sfx.start();
    onStart(setup);
  };

  useEffect(() => {
    music.setIntensity(1);
    music.play('menu');
  }, []);

  const total = settings.opponents + 1;
  const teamsPossible = total >= 4 && total % 2 === 0;
  const { key: dayKey } = today();
  const daily = dailyMatch(name);
  const best = profile.daily[dayKey];

  return (
    <div className="arena setup mode-select" onPointerDown={unlockAudio}>
      <div className="setup-top">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← Menu
        </button>
      </div>
      <h2 className="setup-heading">Choose your battle</h2>

      <div className="mode-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`mode-tab${tab === t.id ? ' on' : ''}`}
            onClick={() => {
              sfx.click();
              setTab(t.id);
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="comic-panel setup-panel">
        <p className="mode-blurb">{TABS.find((t) => t.id === tab)!.blurb}</p>
        {tab !== 'hotseat' && (
          <label>
            Your name
            <input id="player-name" value={settings.name} maxLength={20} onChange={(e) => set({ name: e.target.value })} />
          </label>
        )}

        {tab === 'quick' && (
          <>
            <Segmented label="Opponents" values={[1, 2, 3, 4, 5]} value={settings.opponents} onPick={(n) => set({ opponents: n })} />
            <Segmented label="Cards per draw" values={[1, 2, 3]} value={settings.drawCount} onPick={(n) => set({ drawCount: n })} />
            <RuleToggles rules={settings.rules} onChange={(rules) => set({ rules })} />
            <button
              type="button"
              className="btn rule-toggle"
              aria-pressed={settings.teams && teamsPossible}
              disabled={!teamsPossible}
              onClick={() => set({ teams: !settings.teams })}
            >
              Teams {teamsPossible ? (settings.teams ? `on (${total / 2}v${total / 2})` : 'off') : '(needs 3 or 5 opponents)'}
            </button>
            <button type="button" className="btn primary big" onClick={() => go(quickMatch(name, settings.opponents, settings.drawCount, settings.rules, settings.teams))}>
              Begin the crusade
            </button>
          </>
        )}

        {tab === 'story' && (
          <div className="chapters">
            {CHAPTERS.map((c, i) => {
              const cleared = profile.story > i;
              const locked = profile.story < i;
              return (
                <button
                  key={c.title}
                  type="button"
                  className={`chapter${cleared ? ' cleared' : ''}${locked ? ' locked' : ''}`}
                  disabled={locked}
                  onClick={() => {
                    sfx.click();
                    setChapter(i);
                  }}
                >
                  <span className="chapter-face">
                    <Avatar seed={c.rival} mood={locked ? 'normal' : 'intense'} crop="face" />
                  </span>
                  <span className="chapter-text">
                    <small>Chapter {i + 1}</small>
                    <b>{c.title}</b>
                    <span>{c.rules}</span>
                  </span>
                  <span className="chapter-state">{cleared ? '✓ Cleared' : locked ? 'Locked' : `+${c.bonusXp} XP`}</span>
                </button>
              );
            })}
          </div>
        )}

        {tab === 'daily' && (
          <div className="daily">
            <div className="daily-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            <div className="daily-rivals">
              {daily.seats.slice(1).map((s) => (
                <span key={s.id} className="daily-rival">
                  <Avatar seed={s.fighter ?? 0} crop="face" />
                  <small>{s.name}</small>
                </span>
              ))}
            </div>
            <p className="muted">Elements, ultimates and wild events. Same shuffle for everyone today. Score: win first, then speed, health and damage.</p>
            <div className="daily-best">
              Today's best: <b>{best ?? '—'}</b>
            </div>
            <button type="button" className="btn primary big" onClick={() => go(daily)}>
              {best === undefined ? "Play today's challenge" : 'Try again'}
            </button>
          </div>
        )}

        {tab === 'boss' && (
          <>
            <div className="field">
              <span>Boss</span>
              <div className="boss-pick">
                {[1, 2, 3, 4, 5].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`boss-option${settings.boss === f ? ' on' : ''}`}
                    aria-pressed={settings.boss === f}
                    onClick={() => set({ boss: f })}
                  >
                    <Avatar seed={f} mood="intense" crop="face" />
                    <small>{FIGHTERS[f]}</small>
                  </button>
                ))}
              </div>
            </div>
            <p className="muted">The tyrant has 320 HP, a 10-card hand, an extra draw, and a rage attack every third turn.</p>
            <button type="button" className="btn primary big" onClick={() => go(bossMatch(name, settings.boss))}>
              Face the tyrant
            </button>
          </>
        )}

        {tab === 'hotseat' && (
          <>
            <Segmented
              label="Players on this device"
              values={[2, 3, 4]}
              value={settings.hotseatNames.length}
              onPick={(n) =>
                set({
                  hotseatNames: Array.from({ length: n }, (_, i) => settings.hotseatNames[i] ?? `Player ${i + 1}`),
                  hotseatBots: Math.min(settings.hotseatBots, 6 - n),
                })
              }
            />
            <div className="hotseat-names">
              {settings.hotseatNames.map((n, i) => (
                <input
                  key={i}
                  id={`hotseat-${i}`}
                  aria-label={`Player ${i + 1} name`}
                  value={n}
                  maxLength={16}
                  onChange={(e) => set({ hotseatNames: settings.hotseatNames.map((x, j) => (j === i ? e.target.value : x)) })}
                />
              ))}
            </div>
            <Segmented
              label="Bots"
              values={[0, 1, 2, 3].filter((b) => b + settings.hotseatNames.length <= 6)}
              value={settings.hotseatBots}
              onPick={(n) => set({ hotseatBots: n })}
            />
            <RuleToggles rules={settings.rules} onChange={(rules) => set({ rules })} />
            <p className="muted">The screen hides your hand between turns. Pass the device when it says so. Pass & Play games don't earn XP.</p>
            <button type="button" className="btn primary big" onClick={() => go(hotseatMatch(settings.hotseatNames, settings.hotseatBots, settings.rules))}>
              Start
            </button>
          </>
        )}

        {tab === 'tutorial' && (
          <>
            <p>A short match against Sir Clank with a coach beside you: targeting, building an attack, elements, reversing an attack and drawing.</p>
            <button type="button" className="btn primary big" onClick={() => go(tutorialMatch(name))}>
              Start the tutorial
            </button>
          </>
        )}

        <div className="audio-row">
          <AudioToggles className="btn" />
          <ScenesToggle />
        </div>
      </div>

      <details className="comic-panel rules">
        <summary>How to play</summary>
        <Rules />
      </details>

      {chapter !== null && (
        <div className="overlay" onClick={() => setChapter(null)}>
          <div className="comic-panel chapter-intro" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={CHAPTERS[chapter].title}>
            <small>Chapter {chapter + 1}</small>
            <h2>{CHAPTERS[chapter].title}</h2>
            <div className="intro-scene">
              <span className="intro-face">
                <Avatar seed={CHAPTERS[chapter].rival} mood="intense" crop="face" />
              </span>
              <p className="speech" style={{ '--c': '#fff' } as CSSProperties}>
                <b>{FIGHTERS[CHAPTERS[chapter].rival]}:</b> “{CHAPTERS[chapter].line}”
              </p>
            </div>
            <p className="muted">{CHAPTERS[chapter].rules}</p>
            <div className="intro-actions">
              <button type="button" className="btn ghost dark" onClick={() => setChapter(null)}>
                Back
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  const c = chapter;
                  setChapter(null);
                  go(CHAPTERS[c].build(name));
                }}
              >
                Fight!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Segmented({ label, values, value, onPick }: { label: string; values: number[]; value: number; onPick: (n: number) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="segmented">
        {values.map((n) => (
          <button key={n} type="button" className={value === n ? 'on' : ''} aria-pressed={value === n} onClick={() => onPick(n)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function RuleToggles({ rules, onChange }: { rules: RuleSet; onChange: (r: RuleSet) => void }) {
  const items: [keyof RuleSet, string][] = [
    ['elements', 'Elements'],
    ['ultimates', 'Ultimates'],
    ['wildEvents', 'Wild events'],
  ];
  return (
    <div className="field">
      <span>Rules</span>
      <div className="rule-row">
        {items.map(([k, label]) => (
          <button key={k} type="button" className="btn rule-toggle" aria-pressed={rules[k]} onClick={() => onChange({ ...rules, [k]: !rules[k] })}>
            {label} {rules[k] ? 'on' : 'off'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ScenesToggle() {
  const on = useSyncExternalStore(subscribeSettings, cutscenesOn);
  return (
    <button type="button" className="btn" aria-pressed={on} onClick={() => setCutscenes(!on)}>
      Scenes {on ? 'on' : 'off'}
    </button>
  );
}
