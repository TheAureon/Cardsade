import { useSyncExternalStore, type CSSProperties } from 'react';
import { CARD_INFO } from '../engine/cards';
import type { CardKind } from '../engine/types';
import {
  ACHIEVEMENTS,
  BACKS,
  FOIL_USES,
  isUnlocked,
  levelInfo,
  seasonId,
  seasonRewardItem,
  seasonTier,
  SEASON_REWARDS,
  SEASON_TIERS,
  TABLES,
  TITLES,
  XP_PER_TIER,
  type Unlock,
} from '../progress/progression';
import { Avatar } from './Avatar';
import { CardBack } from './CardView';
import { choose, COSMETIC_SWATCH, getProfile, subscribeProfile, titleName, updateProfile } from './profileStore';
import { Badge, LevelShield, XpBar } from './Progress';
import { sfx } from './sound';

/** Your level, stats, achievement gallery and unlockable cosmetics. */
export function ProfileScreen({ name, onBack }: { name: string; onBack: () => void }) {
  const profile = useSyncExternalStore(subscribeProfile, getProfile);
  const { level } = levelInfo(profile.xp);
  const currentSeason = seasonId(Date.now());
  const seasonXp = profile.season.id === currentSeason ? profile.season.xp : 0;
  const tier = seasonTier(seasonXp);
  const seasonLabel = new Date(Date.now()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const unlockedCount = ACHIEVEMENTS.filter((a) => profile.achievements[a.id]).length;
  const winRate = profile.games ? Math.round((profile.wins / profile.games) * 100) : 0;
  const stats: [string, string | number][] = [
    ['Games', profile.games],
    ['Wins', profile.wins],
    ['Win rate', `${winRate}%`],
    ['K.O.s', profile.kos],
    ['Damage dealt', profile.damage],
    ['Biggest hit', profile.biggestHit],
  ];
  const pick = (kind: 'title' | 'table' | 'back', u: Unlock) => {
    if (!isUnlocked(profile, u)) return sfx.deselect();
    sfx.click();
    choose(kind, u.id);
  };

  return (
    <div className="arena setup profile-screen">
      <div className="setup-top">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            sfx.click();
            onBack();
          }}
        >
          ← Menu
        </button>
      </div>

      <section className="comic-panel profile-card">
        <div className="profile-avatar">
          <Avatar seed={0} mood="win" />
        </div>
        <div className="profile-id">
          <h2>{name}</h2>
          <span className="profile-title">{titleName(profile)}</span>
          <XpBar xp={profile.xp} />
          <span className="muted">{profile.xp} XP total</span>
        </div>
        <LevelShield level={level} size={78} />
      </section>

      <section className="comic-panel profile-stats">
        {stats.map(([label, value]) => (
          <div key={label} className="stat-tile">
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section className="comic-panel profile-section">
        <h3>
          Achievements <span className="muted">{unlockedCount} / {ACHIEVEMENTS.length}</span>
        </h3>
        <div className="ach-grid">
          {ACHIEVEMENTS.map((a) => {
            const when = profile.achievements[a.id];
            return (
              <div key={a.id} className={`ach-card${when ? '' : ' locked'}`}>
                <Badge achievement={a} locked={!when} size={64} />
                <b>{a.name}</b>
                <span>{a.description}</span>
                <small>{when ? `Unlocked ${new Date(when).toLocaleDateString()}` : a.xp ? `+${a.xp} XP` : 'Locked'}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="comic-panel profile-section">
        <h3>Season {seasonLabel}</h3>
        <div className="season-track" role="list" aria-label={`Season tier ${tier} of ${SEASON_TIERS}`}>
          {Array.from({ length: SEASON_TIERS }, (_, i) => {
            const n = i + 1;
            const rewards = SEASON_REWARDS.filter((r) => r.tier === n);
            return (
              <span key={n} role="listitem" className={`season-tier${n <= tier ? ' done' : ''}${rewards.length ? ' reward' : ''}`} title={rewards.map((r) => `${r.kind}: ${seasonRewardItem(r).name}`).join(', ') || `Tier ${n}`}>
                {rewards.length ? '★' : n}
              </span>
            );
          })}
        </div>
        <p className="muted">
          Tier {tier} of {SEASON_TIERS} · {seasonXp % XP_PER_TIER} / {XP_PER_TIER} XP to the next tier. Every XP you earn counts. A new season starts each
          month; rewards you win are yours to keep.
        </p>
        <div className="season-rewards">
          {SEASON_REWARDS.map((r) => {
            const item = seasonRewardItem(r);
            const got = profile.owned.includes(item.id);
            return (
              <span key={r.kind + item.id} className={`unlock-chip${got ? ' got' : ''}`}>
                Tier {r.tier} · {r.kind}: <b>{item.name}</b> {got ? '✓' : ''}
              </span>
            );
          })}
        </div>
      </section>

      <section className="comic-panel profile-section">
        <h3>
          Foils <span className="muted">use a card {FOIL_USES} times to earn its holographic foil</span>
        </h3>
        <div className="foil-grid">
          {(Object.keys(CARD_INFO) as CardKind[]).map((k) => {
            const n = profile.cardUses[k] ?? 0;
            return (
              <div key={k} className={`foil-item${n >= FOIL_USES ? ' got' : ''}`}>
                <span>{CARD_INFO[k].name}</span>
                <span className="foil-track">
                  <span style={{ width: `${Math.min(100, (n / FOIL_USES) * 100)}%` }} />
                </span>
                <small>{n >= FOIL_USES ? '✦ Foil' : `${n}/${FOIL_USES}`}</small>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="btn rule-toggle"
          aria-pressed={profile.showFoils}
          onClick={() => updateProfile((p) => ({ ...p, showFoils: !p.showFoils }))}
        >
          Show foils {profile.showFoils ? 'on' : 'off'}
        </button>
      </section>

      <section className="comic-panel profile-section">
        <h3>Title</h3>
        <div className="cosmetic-row">
          {TITLES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cosmetic-chip${profile.title === t.id ? ' on' : ''}${!isUnlocked(profile, t) ? ' locked' : ''}`}
              onClick={() => pick('title', t)}
              aria-pressed={profile.title === t.id}
            >
              {t.name}
              {!isUnlocked(profile, t) && <small>{t.season ? 'Season reward' : `Lv ${t.level}`}</small>}
            </button>
          ))}
        </div>

        <h3>Table</h3>
        <div className="cosmetic-row">
          {TABLES.map((t) => {
            const [hi, base, , lo] = COSMETIC_SWATCH.table[t.id];
            return (
              <button
                key={t.id}
                type="button"
                className={`cosmetic-swatch${profile.table === t.id ? ' on' : ''}${!isUnlocked(profile, t) ? ' locked' : ''}`}
                onClick={() => pick('table', t)}
                aria-pressed={profile.table === t.id}
              >
                <span className="swatch-felt" style={{ background: `radial-gradient(circle at 40% 35%, ${hi}, ${base} 55%, ${lo})` }} />
                <span>{t.name}</span>
                {!isUnlocked(profile, t) && <small>{t.season ? 'Season reward' : `Lv ${t.level}`}</small>}
              </button>
            );
          })}
        </div>

        <h3>Card back</h3>
        <div className="cosmetic-row">
          {BACKS.map((b) => {
            const [a, c, logo] = COSMETIC_SWATCH.back[b.id];
            return (
              <button
                key={b.id}
                type="button"
                className={`cosmetic-swatch${profile.back === b.id ? ' on' : ''}${!isUnlocked(profile, b) ? ' locked' : ''}`}
                onClick={() => pick('back', b)}
                aria-pressed={profile.back === b.id}
              >
                <CardBack width={46} style={{ '--back-a': a, '--back-b': c, '--back-logo': logo } as CSSProperties} />
                <span>{b.name}</span>
                {!isUnlocked(profile, b) && <small>{b.season ? 'Season reward' : `Lv ${b.level}`}</small>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
