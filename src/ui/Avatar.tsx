/** Comic-style portraits drawn in SVG. Each seat gets a look from its seat index. */

const BACKDROPS = ['#2bb24c', '#1f7ae0', '#ff8a00', '#e0263a', '#8a4fe0', '#14b3c4'];
const SKINS = ['#f2c29a', '#c98a5e', '#8d5a3b', '#f6d6b8', '#6b4027', '#e0a878'];

export function Avatar({ seed }: { seed: number }) {
  const bg = BACKDROPS[seed % BACKDROPS.length];
  const skin = SKINS[(seed * 7 + 2) % SKINS.length];
  const look = seed % 6;
  return (
    <svg className="avatar" viewBox="0 0 100 100" aria-hidden="true">
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
      {look !== 1 && <Face />}
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
          <circle cx="42" cy="51" r="2.5" fill="#ffd21f" />
          <circle cx="58" cy="51" r="2.5" fill="#ffd21f" />
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

function Face() {
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
