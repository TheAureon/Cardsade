import { CARD_INFO } from '../engine/cards';
import type { Card } from '../engine/types';

interface Props {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  small?: boolean;
  onClick?: () => void;
}

export function CardView({ card, selected, disabled, small, onClick }: Props) {
  const info = CARD_INFO[card.kind];
  const face = card.kind === 'number' ? card.value : card.kind === 'multiplier' ? `×${card.value}` : info.symbol;
  const flags = card.kind === 'number' || card.kind === 'multiplier' ? null : (
    <span className="card-flags">
      {info.blockable ? '⛨' : ''}
      {info.reversible ? '⇄' : ''}
    </span>
  );
  return (
    <button
      type="button"
      className={`card card-${card.kind}${selected ? ' selected' : ''}${small ? ' small' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={`${info.name}: ${info.description}${info.blockable ? ' Can be blocked.' : ''}${info.reversible ? ' Can be reversed.' : ''}`}
    >
      <span className="card-face">{face}</span>
      {!small && <span className="card-name">{info.name}</span>}
      {!small && flags}
    </button>
  );
}

const KIND_ORDER: Card['kind'][] = [
  'number',
  'multiplier',
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
