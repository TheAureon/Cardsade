/**
 * Anime-style portraits drawn in SVG (viewBox 0–100). Each seat index is a
 * character with its own hair, eyes, palette and accessories; moods change
 * the eyes, brows and mouth using standard anime shorthand (glowing narrowed
 * eyes, pinprick shock eyes with gloom lines, spiral K.O. eyes, ^^ joy).
 *
 * Shared geometry: face from y≈27 to the chin at y=80, eyes centred at
 * (41, 56) and (59, 56), mouth at y≈71. The crops below rely on it.
 */
import { useId, type ReactNode } from 'react';

/** Expressions: the board uses `normal`; cutscenes use the others. */
export type Mood = 'normal' | 'intense' | 'shock' | 'ko' | 'win';

/** How much of the portrait to show: the whole bust, the face, or a cut-in strip across the eyes. */
export type Crop = 'full' | 'face' | 'eyes';

const VIEWBOX: Record<Crop, string> = {
  full: '0 0 100 100',
  face: '14 12 72 72',
  eyes: '18 44 64 22',
};

export const BACKDROPS = ['#2bb24c', '#1f7ae0', '#ff8a00', '#e0263a', '#8a4fe0', '#14b3c4'];

const LINE = '#2a1414';
/** Anime proportions: eyes drawn larger than life. */
const EYE_SCALE = 1.28;

interface Palette {
  skin: string;
  shade: string;
  hair: string;
  hairHi: string;
  iris: string;
  outfit: string;
}

const PALETTES: Palette[] = [
  // 0 Crusader: shonen hero
  { skin: '#a8714a', shade: '#82522f', hair: '#3b2416', hairHi: '#7a5236', iris: '#2bd45a', outfit: '#2a3a5a' },
  // 1 Sir Clank: full helm (skin unused)
  { skin: '#b9c3cd', shade: '#8794a1', hair: '#e0263a', hairHi: '#ff7a86', iris: '#ffd21f', outfit: '#4a5563' },
  // 2 Lady Vex: hooded sorceress
  { skin: '#8a5634', shade: '#673c22', hair: '#1e1430', hairHi: '#5a4690', iris: '#c48cff', outfit: '#3a1f63' },
  // 3 Brother Mox: blond royal
  { skin: '#f0c7a0', shade: '#d39d78', hair: '#f2c84b', hairHi: '#fff3b0', iris: '#e0263a', outfit: '#7a1020' },
  // 4 The Pale Knight: white hair, red eyes
  { skin: '#f4e4dc', shade: '#d8c2b8', hair: '#e8eef5', hairHi: '#ffffff', iris: '#ff3b4e', outfit: '#3a4350' },
  // 5 Grizzlewick: wild rogue
  { skin: '#c98a5e', shade: '#a2683f', hair: '#16161c', hairHi: '#4c4c5c', iris: '#18d0e0', outfit: '#2a2f3a' },
];

export function Avatar({ seed, mood = 'normal', crop = 'full' }: { seed: number; mood?: Mood; crop?: Crop }) {
  const look = seed % 6;
  const bg = BACKDROPS[look];
  const p = PALETTES[look];
  const id = useId().replace(/:/g, '');
  const glow = `url(#${id}-glow)`;
  return (
    <svg
      className="avatar"
      viewBox={VIEWBOX[crop]}
      preserveAspectRatio={crop === 'full' ? 'xMidYMid meet' : 'xMidYMid slice'}
      aria-hidden="true"
    >
      <defs>
        {/* Anime "shadow over the eyes": darkens the brow while the eyes stay lit. */}
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.25" stopColor="#1a0010" stopOpacity="0.6" />
          <stop offset="0.6" stopColor="#1a0010" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={p.iris} stopOpacity="0.95" />
          <stop offset="1" stopColor={p.iris} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9eef3" />
          <stop offset="0.55" stopColor="#a9b5c1" />
          <stop offset="1" stopColor="#6c7884" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={bg} />
      {/* speed burst behind the head */}
      <g opacity="0.28" fill="#fff">
        {Array.from({ length: 12 }, (_, i) => (
          <polygon key={i} points="50,52 48,-10 52,-10" transform={`rotate(${i * 30} 50 52)`} />
        ))}
      </g>
      {look === 1 ? (
        <Knight mood={mood} p={p} glow={glow} steel={`url(#${id}-steel)`} />
      ) : (
        <Person look={look} mood={mood} p={p} glow={glow} shade={`url(#${id}-shade)`} />
      )}
    </svg>
  );
}

// ---------- People ----------

const FACE = 'M30.5 46 Q30 30 50 28 Q70 30 69.5 46 L69 58 Q67 68 58 76 Q53 80.5 50 80.5 Q47 80.5 42 76 Q33 68 31 58 Z';

function Person({ look, mood, p, glow, shade }: { look: number; mood: Mood; p: Palette; glow: string; shade: string }) {
  return (
    <>
      <BackHair look={look} p={p} />
      {/* shoulders and neck */}
      <path d="M8 104 Q12 86 36 82 L50 90 L64 82 Q88 86 92 104 Z" fill={p.outfit} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M43 70 L43 84 Q50 89 57 84 L57 70 Z" fill={p.skin} stroke={LINE} strokeWidth="1.6" />
      <path d="M43 76 Q50 83 57 76 L57 80 Q50 85 43 80 Z" fill={p.shade} />
      {/* ears */}
      <ellipse cx="30.5" cy="58" rx="2.6" ry="4.2" fill={p.skin} stroke={LINE} strokeWidth="1.4" />
      <ellipse cx="69.5" cy="58" rx="2.6" ry="4.2" fill={p.skin} stroke={LINE} strokeWidth="1.4" />
      {/* face: anime proportions with a pointed chin */}
      <path d={FACE} fill={p.skin} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
      {/* cel shading: under the bangs, along the jaw */}
      <path d="M31 47 Q50 40 69 47 L69 52 Q50 45.5 31 52 Z" fill={p.shade} opacity="0.85" />
      <path d="M63 60 Q67 56 69.2 50 L69 58 Q67 68 58 76 Q61.5 70 63 60 Z" fill={p.shade} opacity="0.8" />
      {(mood === 'intense' || mood === 'shock') && <path d={FACE} fill={shade} />}
      <Expression mood={mood} p={p} glow={glow} />
      <FrontHair look={look} p={p} />
    </>
  );
}

/** Hair and headwear behind the face. */
function BackHair({ look, p }: { look: number; p: Palette }) {
  const hair = { fill: p.hair, stroke: LINE, strokeWidth: 1.8, strokeLinejoin: 'round' as const };
  switch (look) {
    case 0:
      return <path d="M27 52 L17 40 L27 37 L18 23 L33 26 L31 9 L44 19 L50 3 L57 19 L69 9 L67 26 L82 23 L73 37 L83 40 L73 52 Z" {...hair} />;
    case 2:
      return (
        <>
          <path d="M18 100 Q13 30 50 16 Q87 30 82 100 Z" fill="#6a3db8" stroke={LINE} strokeWidth="1.8" />
          <path d="M27 44 Q24 72 29 96 L71 96 Q76 72 73 44 Z" {...hair} />
        </>
      );
    case 3:
      return <path d="M28.5 54 Q27 27 50 25 Q73 27 71.5 54 Z" {...hair} />;
    case 4:
      return (
        <>
          <path d="M29 46 L23 86 L31 80 L33 50 Z" {...hair} />
          <path d="M71 46 L77 86 L69 80 L67 50 Z" {...hair} />
        </>
      );
    case 5:
      return (
        <path d="M26 56 L16 46 L25 42 L15 30 L29 32 L24 16 L38 24 L42 10 L51 22 L60 9 L63 24 L77 15 L73 31 L86 29 L76 42 L85 47 L74 56 Z" {...hair} />
      );
    default:
      return null;
  }
}

/** Bangs, hats and helmets in front of the face. */
function FrontHair({ look, p }: { look: number; p: Palette }) {
  const hair = { fill: p.hair, stroke: LINE, strokeWidth: 1.8, strokeLinejoin: 'round' as const };
  const shine = { fill: p.hairHi, opacity: 0.85 };
  switch (look) {
    case 0:
      return (
        <>
          <path d="M30 47 L32.5 32 Q50 22 67.5 32 L70 47 L64.5 38 L62.5 48 L56.5 37 L52.5 49 L47.5 37 L42.5 48 L39 38.5 L35 46.5 Z" {...hair} />
          <path d="M37 31 Q50 25.5 63 31 Q50 28.5 37 34.5 Z" {...shine} />
          {/* red scarf */}
          <path d="M34 83 Q50 92 66 83 L68 89 Q50 99 32 89 Z" fill="#e0263a" stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
        </>
      );
    case 2:
      return (
        <>
          <path d="M30.5 52 Q29.5 30 50 28 Q67 29 70 45 L65.5 39.5 Q60 47 52 39.5 Q45 50 37.5 43.5 L34 58 Z" {...hair} />
          <path d="M36 35 Q46 29 58 31 Q46 31.5 38 38 Z" {...shine} />
          {/* hood rim */}
          <path d="M23 74 Q20 25 50 20.5 Q80 25 77 74 L71 75 Q73 33 50 30.5 Q27 33 29 75 Z" fill="#7d4fd0" stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M27 60 Q25 31 50 24.5 Q34 32 31 60 Z" fill="#a27ae6" opacity="0.7" />
          {/* beauty mark */}
          <circle cx="61.5" cy="67" r="0.9" fill={LINE} />
        </>
      );
    case 3:
      return (
        <>
          <path d="M29.5 49 Q30 30 50 28 Q70 30 70.5 49 L66 40 L63.5 47 L58.5 37.5 L52.5 45 L46.5 36.5 L40.5 44.5 L36.5 38.5 L33 47 Z" {...hair} />
          <path d="M36 33 Q48 27.5 62 32 Q48 30.5 38 36.5 Z" {...shine} />
          {/* crown */}
          <path d="M33 31 L34.5 13 L42.5 21.5 L50 8.5 L57.5 21.5 L65.5 13 L67 31 Q50 26 33 31 Z" fill="#ffd21f" stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M35 28 L65 28" stroke="#c99a00" strokeWidth="1.2" />
          <circle cx="50" cy="22.5" r="2.4" fill="#e0263a" stroke={LINE} strokeWidth="1" />
          <circle cx="40.5" cy="25" r="1.4" fill="#1f7ae0" stroke={LINE} strokeWidth="0.8" />
          <circle cx="59.5" cy="25" r="1.4" fill="#2bb24c" stroke={LINE} strokeWidth="0.8" />
          <path d="M37 15.5 L38.5 22" stroke="#fff6c0" strokeWidth="1" opacity="0.8" />
          {/* gold collar */}
          <path d="M36 82 L50 90 L64 82 L66 86 L50 95 L34 86 Z" fill="#ffd21f" stroke={LINE} strokeWidth="1.4" strokeLinejoin="round" />
        </>
      );
    case 4:
      return (
        <>
          {/* horned helm */}
          <path d="M30 22 Q15 16 12 3 Q24 12 34 15 Z" fill="#f4ecd8" stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M70 22 Q85 16 88 3 Q76 12 66 15 Z" fill="#f4ecd8" stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M27 47 Q27 17 50 16 Q73 17 73 47 L67 45 Q50 39 33 45 Z" fill="#8a96a3" stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M33 37 Q36 22 48 19.5 Q39 25 36.5 39 Z" fill="#dfe6ee" opacity="0.75" />
          <path d="M48.2 43 L48.2 61 L51.8 61 L51.8 43 Z" fill="#8a96a3" stroke={LINE} strokeWidth="1.4" />
          <path d="M28 45 Q50 37.5 72 45" fill="none" stroke="#5d6873" strokeWidth="1.4" />
        </>
      );
    case 5:
      return (
        <>
          <path d="M30 46 L28 40 L33 41 L31 34 L37 38 L38 31 L43 37 L46 30 L50 37 L54 30 L57 37 L62 31 L63 38 L69 34 L67 41 L72 40 L70 46 Q50 40 30 46 Z" {...hair} />
          {/* bandana */}
          <path d="M29 42 Q50 33 71 42 L71 48.5 Q50 40 29 48.5 Z" fill="#e0263a" stroke={LINE} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M70.5 43 L84 37 L81.5 46 L86 52 L71 48 Z" fill="#c4182c" stroke={LINE} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M35 41.5 Q50 36 65 41" fill="none" stroke="#ff7a86" strokeWidth="1" opacity="0.8" />
          {/* scar across the left eye */}
          <path d="M35.5 49.5 L45 63.5" stroke="#d96a6a" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M37 53 L39.5 52 M40 57.5 L42.5 56.5" stroke="#d96a6a" strokeWidth="0.9" strokeLinecap="round" />
        </>
      );
    default:
      return null;
  }
}

// ---------- Expressions ----------

function Expression({ mood, p, glow }: { mood: Mood; p: Palette; glow: string }) {
  return (
    <>
      {mood === 'intense' && (
        <>
          <circle cx="41" cy="56" r="8" fill={glow} />
          <circle cx="59" cy="56" r="8" fill={glow} />
        </>
      )}
      <Eye cx={41} dir={-1} mood={mood} p={p} />
      <Eye cx={59} dir={1} mood={mood} p={p} />
      {/* nose */}
      <path d="M50.6 62.4 L49.3 65.6 L51 65.8" fill="none" stroke={LINE} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <Mouth mood={mood} />
      <Extras mood={mood} />
    </>
  );
}

/** One eye, drawn for the right side and mirrored with `dir` (outer corner points away from the nose). */
function Eye({ cx, dir, mood, p }: { cx: number; dir: 1 | -1; mood: Mood; p: Palette }) {
  const line = { fill: 'none', stroke: LINE, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let body: ReactNode;
  let brow: string;
  let highlights = true;
  switch (mood) {
    case 'intense':
      brow = 'M-5.5 51.6 L5.5 47.4';
      body = (
        <>
          <path d="M-5 56.4 Q0 52.4 5.6 54.8 Q0.5 60.4 -5 56.4 Z" fill="#fff" />
          <ellipse cx="0" cy="56.6" rx="3.2" ry="3.9" fill={p.iris} />
          <path d="M-3.2 56.6 A3.2 3.9 0 0 1 3.2 56.6 Z" fill="#000" opacity="0.3" />
          <ellipse cx="0" cy="56.8" rx="0.8" ry="2.3" fill="#14060a" />
          <path d="M-5.9 56.2 Q-1 52 6.1 54 L7.9 52.2" {...line} strokeWidth="2.1" />
          <path d="M-3 59.6 Q0.5 60.3 3.8 59" {...line} strokeWidth="0.9" opacity="0.6" />
        </>
      );
      break;
    case 'shock':
      brow = 'M-5.2 47.2 Q0 44.4 5.6 46.2';
      highlights = false;
      body = (
        <>
          <ellipse cx="0.2" cy="56" rx="5.2" ry="5.6" fill="#fff" stroke={LINE} strokeWidth="1" />
          <circle cx="0.2" cy="56.3" r="1.6" fill={p.iris} stroke={LINE} strokeWidth="0.8" />
          <circle cx="0.2" cy="56.3" r="0.6" fill="#14060a" />
          <path d="M-5.6 53.6 Q0 49.2 5.8 52.8" {...line} strokeWidth="1.6" />
        </>
      );
      break;
    case 'ko':
      brow = 'M-5 47.4 L5 49.6';
      highlights = false;
      body = (
        <path
          d="M0.3 56 m-0.6 0 a0.6 0.6 0 1 1 1.2 0 a1.6 1.6 0 1 1 -3.2 0 a2.6 2.6 0 1 1 5.2 0 a3.6 3.6 0 1 1 -7.2 0"
          {...line}
          strokeWidth="1.2"
        />
      );
      break;
    case 'win':
      brow = 'M-5 48.4 Q0 46.2 5.5 47.8';
      highlights = false;
      body = <path d="M-4.8 57.4 Q0 51.6 5 57.4" {...line} strokeWidth="2.4" />;
      break;
    default:
      brow = 'M-5 49.6 Q0 47.6 5.5 48.6';
      body = (
        <>
          <path d="M-5 56.4 Q-0.5 50.6 5.4 55.4 Q0.5 60.8 -5 56.4 Z" fill="#fff" />
          <ellipse cx="0" cy="56.2" rx="3.3" ry="4.2" fill={p.iris} />
          <path d="M-3.3 56.2 A3.3 4.2 0 0 1 3.3 56.2 Z" fill="#000" opacity="0.3" />
          <ellipse cx="0" cy="56.6" rx="1.3" ry="2" fill="#14060a" />
          <path d="M-5.6 55.8 Q-0.5 49.8 5.8 54.6 L7.4 52.8" {...line} strokeWidth="2.4" />
          <path d="M-2.8 60.1 Q0.5 60.9 3.6 59.4" {...line} strokeWidth="0.9" opacity="0.55" />
        </>
      );
  }
  return (
    <>
      <g transform={`translate(${cx} 56) scale(${dir * EYE_SCALE} ${EYE_SCALE}) translate(0 -56)`}>
        {body}
        {/* brows float a little above the lash line, thinner than it */}
        <path d={brow} transform="translate(0 -1.8)" {...line} strokeWidth={mood === 'intense' ? 1.9 : 1.2} />
      </g>
      {/* highlights stay on the same side for both eyes: one light source */}
      {highlights && (
        <>
          <circle cx={cx - 1.5} cy={mood === 'intense' ? 55.4 : 53.9} r={mood === 'intense' ? 1.2 : 1.7} fill="#fff" />
          <circle cx={cx + 1.7} cy="58.6" r="0.8" fill="#fff" />
        </>
      )}
    </>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  const line = { fill: 'none', stroke: LINE, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (mood) {
    case 'intense':
      return (
        <>
          <path d="M45.5 70.2 L54.5 70.2 L53.8 73.2 L46.2 73.2 Z" fill="#fff" stroke={LINE} strokeWidth="1" strokeLinejoin="round" />
          <path d="M46 71.7 L54 71.7 M48.5 70.2 L48.5 73.2 M51.5 70.2 L51.5 73.2" stroke={LINE} strokeWidth="0.5" />
        </>
      );
    case 'shock':
      return <ellipse cx="50" cy="72" rx="2" ry="2.7" fill="#5a1018" stroke={LINE} strokeWidth="1" />;
    case 'ko':
      return <path d="M45 72 q1.5 -1.6 3 0 t3 0 t3 0" {...line} strokeWidth="1.2" />;
    case 'win':
      return (
        <>
          <path d="M44.8 69.8 Q50 77 55.2 69.8 Z" fill="#8a1a2a" stroke={LINE} strokeWidth="1.2" strokeLinejoin="round" />
          <ellipse cx="50" cy="73.4" rx="2.1" ry="1.1" fill="#e86a7a" />
        </>
      );
    default:
      return <path d="M47 71.2 Q50 72.4 53 71.2" {...line} strokeWidth="1.2" />;
  }
}

function Extras({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'shock':
      return (
        <>
          {/* gloom lines and a sweat drop */}
          <path d="M40 30 L40 41 M44 29 L44 39 M48 28.5 L48 37 M52 28.5 L52 37 M56 29 L56 39 M60 30 L60 41" stroke="#4a6cd0" strokeWidth="1" opacity="0.7" />
          <path d="M70.5 44 Q74.5 51 70.5 54 Q66.5 51 70.5 44 Z" fill="#8fd3ff" stroke={LINE} strokeWidth="1" />
        </>
      );
    case 'win':
      return (
        <>
          <ellipse cx="37.5" cy="64.5" rx="3.6" ry="1.6" fill="#ff6a8a" opacity="0.55" />
          <ellipse cx="62.5" cy="64.5" rx="3.6" ry="1.6" fill="#ff6a8a" opacity="0.55" />
          <path d="M68 48 L69 51 L72 52 L69 53 L68 56 L67 53 L64 52 L67 51 Z" fill="#fff" stroke={LINE} strokeWidth="0.6" />
        </>
      );
    default:
      return null;
  }
}

// ---------- Sir Clank ----------

function Knight({ mood, p, glow, steel }: { mood: Mood; p: Palette; glow: string; steel: string }) {
  return (
    <>
      {/* plume */}
      <path d="M52 22 Q60 2 80 6 Q70 10 68 20 Q76 18 82 24 Q68 24 58 30 Z" fill={p.hair} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M60 14 Q68 7 77 8" fill="none" stroke={p.hairHi} strokeWidth="1.4" opacity="0.8" />
      {/* armour */}
      <path d="M8 104 Q12 84 36 80 L50 86 L64 80 Q88 84 92 104 Z" fill={p.outfit} stroke={LINE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M30 90 Q50 82 70 90" fill="none" stroke="#7d8996" strokeWidth="1.4" />
      {/* helm */}
      <path d="M26.5 60 Q25.5 19.5 50 18.5 Q74.5 19.5 73.5 60 L72.5 75 Q50 88 27.5 75 Z" fill={steel} stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M50 20 L50 49" stroke={LINE} strokeWidth="1.4" />
      <path d="M33 33 Q38 23 47 21.5 Q39 27.5 36.5 45 Z" fill="#fff" opacity="0.6" />
      {/* visor slit */}
      <rect x="30.5" y="50.5" width="39" height="10" rx="3" fill="#141920" stroke={LINE} strokeWidth="1.2" />
      <VisorEyes mood={mood} glow={glow} />
      {/* breaths and rivets */}
      <path d="M40 66 L40 75 M45 67 L45 77 M50 67.5 L50 78 M55 67 L55 77 M60 66 L60 75" stroke={LINE} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="30" cy="66" r="1" fill={LINE} />
      <circle cx="70" cy="66" r="1" fill={LINE} />
      {mood === 'shock' && <path d="M71 40 Q75 47 71 50 Q67 47 71 40 Z" fill="#8fd3ff" stroke={LINE} strokeWidth="1" />}
    </>
  );
}

/** The knight's face is a visor slit, so his expressions live in the glowing eyes. */
function VisorEyes({ mood, glow }: { mood: Mood; glow: string }) {
  switch (mood) {
    case 'intense':
      return (
        <>
          <circle cx="41" cy="55.5" r="7.5" fill={glow} />
          <circle cx="59" cy="55.5" r="7.5" fill={glow} />
          <path d="M35.5 53.5 L46 56.5 L35.5 57.5 Z" fill="#ffd21f" />
          <path d="M64.5 53.5 L54 56.5 L64.5 57.5 Z" fill="#ffd21f" />
        </>
      );
    case 'shock':
      return (
        <>
          <circle cx="41" cy="55.5" r="3.2" fill="#fff" />
          <circle cx="59" cy="55.5" r="3.2" fill="#fff" />
        </>
      );
    case 'ko':
      return <path d="M38 53 L44 58 M44 53 L38 58 M56 53 L62 58 M62 53 L56 58" stroke="#ff4d5e" strokeWidth="2" strokeLinecap="round" />;
    case 'win':
      return <path d="M37 57.5 Q41 52.5 45 57.5 M55 57.5 Q59 52.5 63 57.5" fill="none" stroke="#ffd21f" strokeWidth="2.2" strokeLinecap="round" />;
    default:
      return (
        <>
          <circle cx="41" cy="55.5" r="4.5" fill={glow} opacity="0.6" />
          <circle cx="59" cy="55.5" r="4.5" fill={glow} opacity="0.6" />
          <ellipse cx="41" cy="55.5" rx="3" ry="1.8" fill="#ffd21f" />
          <ellipse cx="59" cy="55.5" rx="3" ry="1.8" fill="#ffd21f" />
        </>
      );
  }
}
