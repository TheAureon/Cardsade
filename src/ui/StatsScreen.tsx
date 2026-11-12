import { useState, useSyncExternalStore } from 'react';
import { CARD_INFO } from '../engine/cards';
import type { CardKind } from '../engine/types';
import { FOIL_USES, levelInfo, ordinal, seasonTier, SEASON_TIERS, type MatchRecord } from '../progress/progression';
import { getProfile, subscribeProfile } from './profileStore';
import { deleteReplay, getReplays, subscribeReplays, type SavedReplay } from './replays';
import { sfx } from './sound';

/** Lifetime stats, match history charts, favourite cards and saved replays. */
export function StatsScreen({ onBack, onWatch }: { onBack: () => void; onWatch: (r: SavedReplay) => void }) {
  const profile = useSyncExternalStore(subscribeProfile, getProfile);
  const replays = useSyncExternalStore(subscribeReplays, getReplays);
  const [tableView, setTableView] = useState(false);
  const history = profile.history;
  const recent = history.slice(-20);
  const placed = history.filter((h) => h.placement);
  const avgPlace = placed.length ? placed.reduce((s, h) => s + (h.placement ?? 0), 0) / placed.length : 0;

  const tiles: [string, string | number][] = [
    ['Level', levelInfo(profile.xp).level],
    ['Games', profile.games],
    ['Wins', profile.wins],
    ['Win rate', profile.games ? `${Math.round((profile.wins / profile.games) * 100)}%` : '—'],
    ['K.O.s', profile.kos],
    ['Best hit', profile.biggestHit],
    ['Avg. place', avgPlace ? avgPlace.toFixed(1) : '—'],
    ['Season tier', `${seasonTier(profile.season.xp)}/${SEASON_TIERS}`],
  ];

  const places = [1, 2, 3, 4].map((n) => ({
    label: n === 4 ? '4th+' : ordinal(n),
    value: history.filter((h) => (n === 4 ? (h.placement ?? 0) >= 4 : h.placement === n)).length,
  }));

  const cards = (Object.entries(profile.cardUses) as [CardKind, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const cardMax = Math.max(1, ...cards.map(([, n]) => n));

  return (
    <div className="arena setup stats-screen">
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
      <h2 className="setup-heading">Battle stats</h2>

      <section className="comic-panel profile-stats">
        {tiles.map(([label, value]) => (
          <div key={label} className="stat-tile">
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </section>

      <section className="comic-panel profile-section">
        <div className="section-head">
          <h3>Last {recent.length || ''} games</h3>
          <button type="button" className="btn small-btn" aria-pressed={tableView} onClick={() => setTableView((t) => !t)}>
            {tableView ? 'Show charts' : 'Show table'}
          </button>
        </div>
        {history.length === 0 ? (
          <p className="muted">Play a game to start your history. Every match you finish shows up here.</p>
        ) : tableView ? (
          <HistoryTable rows={recent} />
        ) : (
          <>
            <BarChart
              title="Damage dealt per game"
              unit="damage"
              data={recent.map((h, i) => ({ label: `${i + 1}`, value: h.damage, tip: matchTip(h) }))}
            />
            <BarChart title="XP earned per game" unit="XP" data={recent.map((h, i) => ({ label: `${i + 1}`, value: h.xp, tip: matchTip(h) }))} />
            <BarChart title="Finishing places (all games)" unit="games" data={places.map((p) => ({ ...p, tip: `${p.label}: ${p.value} games` }))} />
          </>
        )}
      </section>

      <section className="comic-panel profile-section">
        <h3>Favourite cards</h3>
        {cards.length === 0 ? (
          <p className="muted">Cards you play are counted here. Use a card {FOIL_USES} times to earn its foil.</p>
        ) : (
          <ol className="card-uses">
            {cards.map(([kind, n]) => (
              <li key={kind}>
                <span className="card-uses-name">{CARD_INFO[kind].name}</span>
                <span className="card-uses-track">
                  <span className="card-uses-bar" style={{ width: `${(n / cardMax) * 100}%` }} />
                </span>
                <span className="card-uses-n">
                  {n}
                  {n >= FOIL_USES && <small> ✦ foil</small>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="comic-panel profile-section">
        <h3>Replays</h3>
        {replays.length === 0 ? (
          <p className="muted">Your last 10 finished games are saved here to watch again.</p>
        ) : (
          <ul className="replay-list">
            {replays.map((r) => (
              <li key={r.id}>
                <span>
                  <b>{r.label}</b>
                  <small>
                    {new Date(r.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {r.summary} ·{' '}
                    {r.recording.actions.length} moves
                  </small>
                </span>
                <button type="button" className="btn primary" onClick={() => onWatch(r)}>
                  Watch
                </button>
                <button type="button" className="btn" aria-label={`Delete replay from ${new Date(r.at).toLocaleString()}`} onClick={() => deleteReplay(r.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function matchTip(h: MatchRecord): string {
  const result = h.won ? 'Won' : h.placement ? `Finished ${ordinal(h.placement)}` : 'Left';
  return `${result} · ${h.damage} damage · ${h.kos} K.O. · +${h.xp} XP · ${h.mode}`;
}

/** A single-series bar chart: one hue, rounded data ends on a shared baseline, faint grid, hover tooltip. */
function BarChart({ title, unit, data }: { title: string; unit: string; data: { label: string; value: number; tip: string }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 180;
  const pad = { l: 40, r: 8, t: 10, b: 22 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const ticks = [0, max / 2, max];
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(28, slot - 4));
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={pad.l - 6} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                {Math.round(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * slot + (slot - bw) / 2;
            const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * ih);
            const r = Math.min(4, bw / 2, h);
            const top = pad.t + ih - h;
            // Rounded top, square base on the baseline.
            const path = `M${x},${pad.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${pad.t + ih} Z`;
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
                {h > 0 && <path d={path} className={`chart-bar${hover === i ? ' hot' : ''}`} />}
                {data.length <= 8 && (
                  <text x={x + bw / 2} y={H - 6} className="chart-axis" textAnchor="middle">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="chart-baseline" />
        </svg>
        {hover !== null && (
          <div className="chart-tip" style={{ left: `${((pad.l + hover * slot + slot / 2) / W) * 100}%` }}>
            <b>
              {data[hover].value} {unit}
            </b>
            <span>{data[hover].tip}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

function HistoryTable({ rows }: { rows: MatchRecord[] }) {
  return (
    <div className="table-scroll">
      <table className="history-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Mode</th>
            <th>Result</th>
            <th>Rivals</th>
            <th>Damage</th>
            <th>Taken</th>
            <th>K.O.s</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => (
            <tr key={h.at}>
              <td>{i + 1}</td>
              <td>{h.mode}</td>
              <td>{h.won ? 'Won' : h.placement ? ordinal(h.placement) : 'Left'}</td>
              <td>{h.opponents}</td>
              <td>{h.damage}</td>
              <td>{h.taken}</td>
              <td>{h.kos}</td>
              <td>+{h.xp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
