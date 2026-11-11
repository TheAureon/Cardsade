import { useSyncExternalStore, type CSSProperties } from 'react';
import { ACHIEVEMENTS, BACKS, levelInfo, TABLES, TITLES, type Unlock } from '../progress/progression';
import { Avatar } from './Avatar';
import { CardBack } from './CardView';
import { choose, COSMETIC_SWATCH, getProfile, subscribeProfile, titleName } from './profileStore';
import { Badge, LevelShield, XpBar } from './Progress';
import { sfx } from './sound';

/** Your level, stats, achievement gallery and unlockable cosmetics. */
export function ProfileScreen({ name, onBack }: { name: string; onBack: () => void }) {
  const profile = useSyncExternalStore(subscribeProfile, getProfile);
  const { level } = levelInfo(profile.xp);
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
    if (u.level > level) return sfx.deselect();
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
        <h3>Title</h3>
        <div className="cosmetic-row">
          {TITLES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cosmetic-chip${profile.title === t.id ? ' on' : ''}${t.level > level ? ' locked' : ''}`}
              onClick={() => pick('title', t)}
              aria-pressed={profile.title === t.id}
            >
              {t.name}
              {t.level > level && <small>Lv {t.level}</small>}
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
                className={`cosmetic-swatch${profile.table === t.id ? ' on' : ''}${t.level > level ? ' locked' : ''}`}
                onClick={() => pick('table', t)}
                aria-pressed={profile.table === t.id}
              >
                <span className="swatch-felt" style={{ background: `radial-gradient(circle at 40% 35%, ${hi}, ${base} 55%, ${lo})` }} />
                <span>{t.name}</span>
                {t.level > level && <small>Lv {t.level}</small>}
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
                className={`cosmetic-swatch${profile.back === b.id ? ' on' : ''}${b.level > level ? ' locked' : ''}`}
                onClick={() => pick('back', b)}
                aria-pressed={profile.back === b.id}
              >
                <CardBack width={46} style={{ '--back-a': a, '--back-b': c, '--back-logo': logo } as CSSProperties} />
                <span>{b.name}</span>
                {b.level > level && <small>Lv {b.level}</small>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
