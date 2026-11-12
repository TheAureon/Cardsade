/** Progression UI: achievement medallions, the level shield, the XP bar and the results panel. */
import { useEffect, useState, type CSSProperties } from 'react';
import { CARD_INFO } from '../engine/cards';
import { levelInfo, ordinal, type Achievement, type Award } from '../progress/progression';

const TIER_FILL: Record<Achievement['tier'], [string, string, string]> = {
  bronze: ['#f0b37a', '#b5651d', '#5e2f08'],
  silver: ['#ffffff', '#aab6c2', '#4d5966'],
  gold: ['#fff1a8', '#f2b705', '#7a5200'],
};

/** A medallion: ribbon tails, a rimmed disc in the tier's metal, and the achievement's glyph. */
export function Badge({ achievement, locked = false, size = 72 }: { achievement: Achievement; locked?: boolean; size?: number }) {
  const [hi, mid, lo] = TIER_FILL[achievement.tier];
  const gid = `badge-${achievement.id}`;
  return (
    <svg className={`badge-medal${locked ? ' locked' : ''}`} width={size} height={size * 1.1} viewBox="0 0 100 110" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
      </defs>
      <path d="M30 60 L18 106 L34 96 L44 108 L50 66 Z" fill="#c4182c" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
      <path d="M70 60 L82 106 L66 96 L56 108 L50 66 Z" fill="#1f7ae0" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="50" cy="46" r="40" fill={`url(#${gid})`} stroke="#111" strokeWidth="4" />
      <circle cx="50" cy="46" r="30" fill={lo} stroke={hi} strokeWidth="3" opacity="0.92" />
      <path d="M24 30 Q34 14 54 10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
      <text
        x="50"
        y="47"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Bangers, Impact, sans-serif"
        fontSize={achievement.icon.length > 3 ? 20 : achievement.icon.length > 2 ? 24 : 30}
        fill="#fff"
        stroke="#111"
        strokeWidth="1.2"
        paintOrder="stroke"
      >
        {achievement.icon}
      </text>
      {locked && (
        <g transform="translate(66 64)">
          <rect x="-11" y="-2" width="22" height="18" rx="3" fill="#2a2f3a" stroke="#111" strokeWidth="2.5" />
          <path d="M-6 -2 V-7 A6 6 0 0 1 6 -7 V-2" fill="none" stroke="#111" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
}

/** Level number on a shield. */
export function LevelShield({ level, size = 64 }: { level: number; size?: number }) {
  return (
    <svg className="level-shield" width={size} height={size * 1.15} viewBox="0 0 100 115" aria-label={`Level ${level}`}>
      <path d="M50 4 L92 18 L88 64 Q80 96 50 111 Q20 96 12 64 L8 18 Z" fill="#ffd21f" stroke="#111" strokeWidth="5" strokeLinejoin="round" />
      <path d="M50 14 L82 25 L79 62 Q72 88 50 100 Q28 88 21 62 L18 25 Z" fill="#c4182c" />
      <text x="50" y="30" textAnchor="middle" fontFamily="Bangers, Impact, sans-serif" fontSize="16" fill="#ffd21f">
        LV
      </text>
      <text
        x="50"
        y="66"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Bangers, Impact, sans-serif"
        fontSize={level >= 10 ? 44 : 52}
        fill="#fff"
        stroke="#111"
        strokeWidth="2"
        paintOrder="stroke"
      >
        {level}
      </text>
    </svg>
  );
}

export function XpBar({ xp, animateFrom }: { xp: number; animateFrom?: number }) {
  const info = levelInfo(xp);
  const start = animateFrom === undefined ? null : levelInfo(animateFrom);
  // Animate from the old fill when staying on the same level, from empty after a level-up.
  const [pct, setPct] = useState(() =>
    start ? (start.level === info.level && start.needed ? (start.into / start.needed) * 100 : 0) : info.needed ? (info.into / info.needed) * 100 : 100,
  );
  useEffect(() => {
    const t = setTimeout(() => setPct(info.needed ? (info.into / info.needed) * 100 : 100), 250);
    return () => clearTimeout(t);
  }, [info.into, info.needed]);
  return (
    <div className="xp-bar" role="meter" aria-valuenow={info.into} aria-valuemin={0} aria-valuemax={info.needed} aria-label="Experience">
      <div className="xp-fill" style={{ width: `${pct}%` }} />
      <span className="xp-text">{info.needed ? `${info.into} / ${info.needed} XP` : 'MAX LEVEL'}</span>
    </div>
  );
}

/** Counts up from 0 to `to` for a satisfying tally. */
function useCountUp(to: number, ms = 1200, delay = 0) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / ms));
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, delay]);
  return n;
}

/** The end-of-game panel: placement, XP tally, level progress, new badges and unlocks. */
export function Results({
  award,
  placement,
  players,
  winnerName,
  onContinue,
}: {
  award: Award;
  placement: number;
  players: number;
  winnerName: string;
  onContinue: () => void;
}) {
  const total = useCountUp(award.total, 1300, 300 + award.lines.length * 120);
  const leveled = award.levelAfter > award.levelBefore;
  const won = placement === 1;
  return (
    <div className={`overlay results-overlay${won ? ' won' : ' lost'}`}>
      <div className="comic-panel results">
        <div className="results-head">
          <span className="results-place">{won ? 'Victory!' : `${ordinal(placement)} of ${players}`}</span>
          {!won && <span className="results-sub">{winnerName} wins the crusade</span>}
        </div>

        <ol className="xp-lines">
          {award.lines.map((l, i) => (
            <li key={l.label} style={{ '--i': i } as CSSProperties}>
              <span>{l.label}</span>
              <b>+{l.xp}</b>
            </li>
          ))}
        </ol>
        <div className="xp-total">
          <span>Total</span>
          <b>+{total} XP</b>
        </div>

        <div className="results-level">
          <LevelShield level={award.levelAfter} size={58} />
          <div className="results-level-bar">
            {leveled && (
              <span className="level-up">
                Level up! {award.levelBefore} → {award.levelAfter}
              </span>
            )}
            <XpBar xp={award.xpAfter} animateFrom={award.xpBefore} />
          </div>
        </div>

        {award.achievements.length > 0 && (
          <div className="results-section">
            <h3>New achievements</h3>
            <div className="results-badges">
              {award.achievements.map((a, i) => (
                <div key={a.id} className="results-badge" style={{ '--i': i } as CSSProperties}>
                  <Badge achievement={a} size={60} />
                  <span>{a.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="results-season">
          Season tier {award.seasonBefore} → <b>{award.seasonAfter}</b> / 30
        </div>

        {(award.seasonRewards.length > 0 || award.newFoils.length > 0) && (
          <div className="results-section">
            <h3>Rewards</h3>
            <div className="unlock-chips">
              {award.seasonRewards.map((u) => (
                <span key={u.id} className="unlock-chip got">
                  Season reward: <b>{u.name}</b>
                </span>
              ))}
              {award.newFoils.map((k) => (
                <span key={k} className="unlock-chip got">
                  New foil: <b>{CARD_INFO[k].name}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        {award.unlocks.length > 0 && (
          <div className="results-section">
            <h3>Unlocked</h3>
            <div className="unlock-chips">
              {award.unlocks.map((u) => (
                <span key={u.kind + u.item.id} className="unlock-chip">
                  {u.kind}: <b>{u.item.name}</b>
                </span>
              ))}
            </div>
          </div>
        )}

        <button type="button" className="btn primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}

/** Pop-up when an achievement unlocks mid-game. */
export function AchievementToast({ achievement }: { achievement: Achievement }) {
  return (
    <div className="ach-toast" role="status">
      <Badge achievement={achievement} size={52} />
      <div>
        <span className="ach-toast-label">Achievement unlocked</span>
        <b>{achievement.name}</b>
        <small>
          {achievement.description}
          {achievement.xp ? ` +${achievement.xp} XP` : ''}
        </small>
      </div>
    </div>
  );
}
