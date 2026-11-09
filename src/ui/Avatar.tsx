/** Comic-style portraits drawn in SVG. Each seat gets a look from its seat index. */
import { useId } from 'react';

/** Expressions: the board uses `normal`; cutscenes use the anime ones. */
export type Mood = 'normal' | 'intense' | 'shock' | 'ko' | 'win';

/** How much of the portrait to show: the whole bust, the face, or a cut-in strip across the eyes. */
export type Crop = 'full' | 'face' | 'eyes';

const VIEWBOX: Record<Crop, string> = {
  full: '0 0 100 100',
  face: '16 14 68 68',
  eyes: '20 40 60 24',
};

export const BACKDROPS = ['#2bb24c', '#1f7ae0', '#ff8a00', '#e0263a', '#8a4fe0', '#14b3c4'];
const SKINS = ['#f2c29a', '#c98a5e', '#8d5a3b', '#f6d6b8', '#6b4027', '#e0a878'];

export function Avatar({ seed, mood = 'normal', crop = 'full' }: { seed: number; mood?: Mood; crop?: Crop }) {
  const bg = BACKDROPS[seed % BACKDROPS.length];
  const skin = SKINS[(seed * 7 + 2) % SKINS.length];
  const look = seed % 6;
  const id = useId().replace(/:/g, '');
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
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={bg} stopOpacity="0.9" />
          <stop offset="1" stopColor={bg} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={bg} />
      {/* speed burst behind the head */}
      <g opacity="0.28" fill="#fff">
        {Array.from({ length: 10 }, (_, i) => (
          <polygon key={i} points="50,55 47,-10 53,-10" transform={`rotate(${i * 36} 50 55)`} />
        ))}
      </g>
      {/* shoulders */}
      <path d="M8 104 Q12 80 50 78 Q88 80 92 104 Z" fill={look === 2 ? '#4a2a7a' : '#2a2f3a'} stroke="#111" strokeWidth="3" />
      {/* head */}
      <ellipse cx="50" cy="52" rx="22" ry="25" fill={skin} stroke="#111" strokeWidth="3" />
      {(mood === 'intense' || mood === 'shock') && <ellipse cx="50" cy="52" rx="20.5" ry="23.5" fill={`url(#${id}-shade)`} />}
      {look !== 1 && <Face mood={mood} iris={bg} glow={`url(#${id}-glow)`} />}
      {look === 0 && (
        <path
          d="M27 46 L24 30 L33 36 L34 20 L42 31 L48 16 L54 30 L62 18 L64 33 L73 26 L72 44 Q62 34 50 34 Q36 34 27 46 Z"
          fill="#3a2414"
          stroke="#111"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      )}
      {look === 1 && (
        <>
          <path d="M50 10 Q60 0 70 8 Q60 10 56 20 Z" fill="#e0263a" stroke="#111" strokeWidth="2.5" />
          <path d="M26 58 Q26 22 50 22 Q74 22 74 58 L74 76 Q50 86 26 76 Z" fill="#b9c3cd" stroke="#111" strokeWidth="3" />
          <rect x="31" y="47" width="38" height="8" rx="3" fill="#1b1f26" />
          <VisorEyes mood={mood} glow={`url(#${id}-glow)`} />
          <path d="M50 24 L50 46 M38 62 L38 74 M44 63 L44 76 M50 63 L50 77 M56 63 L56 76 M62 62 L62 74" stroke="#111" strokeWidth="2" />
        </>
      )}
      {look === 2 && (
        <path
          d="M22 70 Q18 24 50 18 Q82 24 78 70 L70 74 Q72 40 50 36 Q28 40 30 74 Z"
          fill="#6a3db8"
          stroke="#111"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      )}
      {look === 3 && (
        <>
          <path d="M28 44 Q30 28 50 28 Q70 28 72 44 Q60 36 50 38 Q40 36 28 44 Z" fill="#e8e2d0" stroke="#111" strokeWidth="2.5" />
          <path d="M30 32 L32 14 L41 24 L50 10 L59 24 L68 14 L70 32 Z" fill="#ffd21f" stroke="#111" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="50" cy="24" r="3" fill="#e0263a" stroke="#111" strokeWidth="1.5" />
        </>
      )}
      {look === 4 && (
        <>
          <path d="M28 20 Q14 14 12 2 Q24 10 34 14 Z" fill="#f4ecd8" stroke="#111" strokeWidth="2.5" />
          <path d="M72 20 Q86 14 88 2 Q76 10 66 14 Z" fill="#f4ecd8" stroke="#111" strokeWidth="2.5" />
          <path d="M26 44 Q26 16 50 16 Q74 16 74 44 Z" fill="#8a96a3" stroke="#111" strokeWidth="3" />
          <path d="M47 44 L47 58 L53 58 L53 44 Z" fill="#8a96a3" stroke="#111" strokeWidth="2.5" />
        </>
      )}
      {look === 5 && (
        <>
          <path d="M28 42 Q28 26 50 26 Q72 26 72 42 Z" fill="#111" />
          <path d="M27 40 Q50 30 73 40 L73 47 Q50 38 27 47 Z" fill="#e0263a" stroke="#111" strokeWidth="2.5" />
          <path d="M73 42 L86 36 L84 48 Z" fill="#e0263a" stroke="#111" strokeWidth="2.5" />
        </>
      )}
    </svg>
  );
}

function Face({ mood, iris, glow }: { mood: Mood; iris: string; glow: string }) {
  switch (mood) {
    case 'intense':
      // Sharp almond eyes with lit irises and highlights, brows driven down, teeth gritted.
      return (
        <>
          <circle cx="42.5" cy="54" r="6" fill={glow} />
          <circle cx="57.5" cy="54" r="6" fill={glow} />
          <path d="M33 46 L47 51.5" stroke="#111" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M67 46 L53 51.5" stroke="#111" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M35.5 55 Q42 49 48.5 54 Q42 58.5 35.5 55 Z" fill="#fff" stroke="#111" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M64.5 55 Q58 49 51.5 54 Q58 58.5 64.5 55 Z" fill="#fff" stroke="#111" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="43.2" cy="54.4" r="2.7" fill={iris} stroke="#111" strokeWidth="0.8" />
          <circle cx="56.8" cy="54.4" r="2.7" fill={iris} stroke="#111" strokeWidth="0.8" />
          <circle cx="43.2" cy="54.6" r="1.2" fill="#111" />
          <circle cx="56.8" cy="54.6" r="1.2" fill="#111" />
          <circle cx="44.1" cy="53.4" r="0.8" fill="#fff" />
          <circle cx="57.7" cy="53.4" r="0.8" fill="#fff" />
          <path d="M43 66.5 L57 66.5 L56 71 L44 71 Z" fill="#fff" stroke="#111" strokeWidth="2" strokeLinejoin="round" />
          <path d="M43.5 68.8 L56.5 68.8 M47.5 66.5 L47.5 71 M52.5 66.5 L52.5 71" stroke="#111" strokeWidth="1" />
        </>
      );
    case 'shock':
      // Wide eyes, pinprick pupils, open mouth, a sweat drop.
      return (
        <>
          <path d="M36 45 Q41 41 46 44.5" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M64 45 Q59 41 54 44.5" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="42" cy="54" rx="5.5" ry="6.5" fill="#fff" stroke="#111" strokeWidth="2" />
          <ellipse cx="58" cy="54" rx="5.5" ry="6.5" fill="#fff" stroke="#111" strokeWidth="2" />
          <circle cx="42" cy="54.5" r="1.1" fill="#111" />
          <circle cx="58" cy="54.5" r="1.1" fill="#111" />
          <ellipse cx="50" cy="69" rx="4" ry="4.5" fill="#3a0008" stroke="#111" strokeWidth="2" />
          <path d="M71 40 Q75 47 71 50 Q67 47 71 40 Z" fill="#8fd3ff" stroke="#111" strokeWidth="1.5" />
        </>
      );
    case 'ko':
      // X eyes and a wobbly mouth.
      return (
        <>
          <path d="M38 51 L46 59 M46 51 L38 59" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M54 51 L62 59 M62 51 L54 59" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M42 69 Q45 66 48 69 Q51 72 54 69 Q57 66 58 68" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
    case 'win':
      // Happy closed eyes and a big grin.
      return (
        <>
          <path d="M36 47 Q41 44 46 47" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M64 47 Q59 44 54 47" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M37 56 Q42 50 47 56" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M53 56 Q58 50 63 56" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M41 65 Q50 76 59 65 Z" fill="#7a0010" stroke="#111" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M43 65.6 L57 65.6 L56 67.5 L44 67.5 Z" fill="#fff" />
        </>
      );
    default:
      return (
        <>
          <path d="M36 46 L46 50" stroke="#111" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M64 46 L54 50" stroke="#111" strokeWidth="3.5" strokeLinecap="round" />
          <ellipse cx="42" cy="55" rx="4.5" ry="5" fill="#fff" stroke="#111" strokeWidth="2" />
          <ellipse cx="58" cy="55" rx="4.5" ry="5" fill="#fff" stroke="#111" strokeWidth="2" />
          <circle cx="43" cy="56" r="2.2" fill="#111" />
          <circle cx="57" cy="56" r="2.2" fill="#111" />
          <path d="M42 68 Q50 64 58 68" fill="none" stroke="#111" strokeWidth="3" strokeLinecap="round" />
        </>
      );
  }
}

/** The knight's face is a visor slit, so his expressions live in the glowing eyes. */
function VisorEyes({ mood, glow }: { mood: Mood; glow: string }) {
  switch (mood) {
    case 'intense':
      return (
        <>
          <circle cx="42" cy="51" r="7" fill={glow} />
          <circle cx="58" cy="51" r="7" fill={glow} />
          <path d="M37 49 L46 52 L37 53 Z" fill="#ffd21f" />
          <path d="M63 49 L54 52 L63 53 Z" fill="#ffd21f" />
        </>
      );
    case 'shock':
      return (
        <>
          <circle cx="42" cy="51" r="3.2" fill="#fff" />
          <circle cx="58" cy="51" r="3.2" fill="#fff" />
        </>
      );
    case 'ko':
      return <path d="M39 48.5 L45 53.5 M45 48.5 L39 53.5 M55 48.5 L61 53.5 M61 48.5 L55 53.5" stroke="#ff4d5e" strokeWidth="2" strokeLinecap="round" />;
    case 'win':
      return <path d="M38 53 Q42 48 46 53 M54 53 Q58 48 62 53" fill="none" stroke="#ffd21f" strokeWidth="2.2" strokeLinecap="round" />;
    default:
      return (
        <>
          <circle cx="42" cy="51" r="2.5" fill="#ffd21f" />
          <circle cx="58" cy="51" r="2.5" fill="#ffd21f" />
        </>
      );
  }
}
