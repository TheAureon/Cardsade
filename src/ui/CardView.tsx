import type { CSSProperties, PointerEvent } from 'react';
import { CARD_INFO } from '../engine/cards';
import type { Card } from '../engine/types';

interface Props {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  dim?: boolean;
  /** Card width in px; everything inside scales with it. */
  width?: number;
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
}

/** Tilt and glare follow the pointer: a flat card that reads as if it were picked up. */
function tilt(e: PointerEvent<HTMLButtonElement>) {
  if (e.pointerType !== 'mouse' || e.currentTarget.disabled) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.setProperty('--skx', `${(-x * 7).toFixed(2)}deg`);
  el.style.setProperty('--sky', `${(y * 4).toFixed(2)}deg`);
  el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`);
  el.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(0)}%`);
}

function untilt(e: PointerEvent<HTMLButtonElement>) {
  const el = e.currentTarget;
  ['--skx', '--sky', '--gx', '--gy'].forEach((v) => el.style.removeProperty(v));
}

const GLYPHS: Partial<Record<Card['kind'], string>> = {
  block: '⛨',
  reverse: '⇄',
  skip: '⦸',
  discard: '✕',
  discardAction: '✕',
  discardAttack: '✕',
  discardMultipliers: '✕',
  fire: '♨',
  ice: '❄',
  lightning: 'ϟ',
};

const SUB: Partial<Record<Card['kind'], string>> = {
  discardAction: 'ACT',
  discardAttack: '#',
  discardMultipliers: '×',
};

/** Number cards get a color by value, purely for looks. */
function tint(card: Card): string {
  if (card.kind !== 'number') return card.kind;
  return card.value <= 3 ? 'num-green' : card.value <= 6 ? 'num-blue' : 'num-yellow';
}

export function CardView({ card, selected, disabled, dim, width, onClick, style, className }: Props) {
  const info = CARD_INFO[card.kind];
  const isNum = card.kind === 'number';
  const isMult = card.kind === 'multiplier';
  const corner = isNum ? String(card.value) : isMult ? `×${card.value}` : GLYPHS[card.kind];
  const flags = [info.blockable && 'can be blocked', info.reversible && 'can be reversed'].filter(Boolean).join(', ');
  return (
    <button
      type="button"
      className={`card t-${tint(card)}${selected ? ' selected' : ''}${dim ? ' dim' : ''}${className ? ` ${className}` : ''}`}
      disabled={disabled}
      onClick={onClick}
      onPointerMove={tilt}
      onPointerLeave={untilt}
      style={{ ...(width ? ({ '--cw': `${width}px` } as CSSProperties) : null), ...style }}
      title={`${info.name}: ${info.description}${flags ? ` (${flags})` : ''}`}
      aria-label={isNum ? `Number ${card.value}` : isMult ? `Multiplier ×${card.value}` : info.name}
    >
      <span className="card-inner">
        <span className="card-oval" />
        <span className="card-corner tl">{corner}</span>
        <span className="card-corner br">{corner}</span>
        <span className="card-glyph">
          {isNum ? card.value : isMult ? `×${card.value}` : GLYPHS[card.kind]}
          {SUB[card.kind] && <small>{SUB[card.kind]}</small>}
        </span>
        {!isNum && !isMult && <span className="card-label">{info.name}</span>}
      </span>
    </button>
  );
}

export function CardBack({ width, style }: { width?: number; style?: CSSProperties }) {
  return (
    <span
      className="card card-back"
      style={{ ...(width ? ({ '--cw': `${width}px` } as CSSProperties) : null), ...style }}
      aria-hidden="true"
    >
      <span className="card-inner">
        <span className="card-oval" />
        <span className="back-logo">
          CARD<br />SADE
        </span>
      </span>
    </span>
  );
}

const KIND_ORDER: Card['kind'][] = [
  'number',
  'multiplier',
  'fire',
  'ice',
  'lightning',
  'block',
  'reverse',
  'skip',
  'discard',
  'discardAction',
  'discardAttack',
  'discardMultipliers',
];

export function sortHand(hand: Card[]): Card[] {
  return hand.slice().sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.value - b.value);
}
