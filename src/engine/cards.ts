import type { Card, CardKind } from './types';

export interface CardInfo {
  name: string;
  symbol: string;
  description: string;
  /** Can be bounced with Reverse while it's on the chain. */
  reversible: boolean;
  /** Can be stopped with Block while it's on the chain. */
  blockable: boolean;
}

export const CARD_INFO: Record<CardKind, CardInfo> = {
  number: {
    name: 'Number',
    symbol: '#',
    description: 'Add-on: adds its value to your attack damage.',
    reversible: false,
    blockable: false,
  },
  multiplier: {
    name: 'Multiplier',
    symbol: '×',
    description: 'Multiplies attack damage, add-ons included. Can be added when you attack or when you reverse an attack.',
    reversible: false,
    blockable: true,
  },
  block: {
    name: 'Block',
    symbol: '⛨',
    description: 'Response: completely stops whatever is coming at you, including reverses. Nothing can answer a Block.',
    reversible: false,
    blockable: false,
  },
  reverse: {
    name: 'Reverse',
    symbol: '⇄',
    description: 'Response: sends the attack or effect back where it came from.',
    reversible: true,
    blockable: true,
  },
  skip: {
    name: 'Skip',
    symbol: '⦸',
    description:
      "Makes the target's next card useless. As a response, it cancels the card coming at you, but it can be reversed or blocked.",
    reversible: true,
    blockable: true,
  },
  discard: {
    name: 'Discard',
    symbol: '✕',
    description: "Look at the target's hand and discard any one card from it.",
    reversible: true,
    blockable: true,
  },
  discardAction: {
    name: 'Discard Action',
    symbol: '✕A',
    description: 'The target discards every action card (Block, Reverse, Skip, Discards).',
    reversible: true,
    blockable: true,
  },
  discardAttack: {
    name: 'Discard Attack',
    symbol: '✕#',
    description: 'The target discards every number card.',
    reversible: true,
    blockable: true,
  },
  discardMultipliers: {
    name: 'Discard Multipliers',
    symbol: '✕×',
    description: 'The target discards every multiplier card.',
    reversible: true,
    blockable: true,
  },
  fire: {
    name: 'Fire',
    symbol: '♨',
    description: 'Add-on: if the attack lands, the target burns for 3 damage at the start of each of their next 3 turns.',
    reversible: false,
    blockable: true,
  },
  ice: {
    name: 'Ice',
    symbol: '❄',
    description: 'Add-on: if the attack lands, the target is frozen and loses their attack next turn.',
    reversible: false,
    blockable: true,
  },
  lightning: {
    name: 'Lightning',
    symbol: 'ϟ',
    description: 'Add-on: if the attack lands, half its damage chains to another enemy.',
    reversible: false,
    blockable: true,
  },
};

export const ELEMENT_KINDS: CardKind[] = ['fire', 'ice', 'lightning'];

/** Cards that ride on an attack: numbers, multipliers and elements. */
export function isAttackCard(card: Card): boolean {
  return card.kind === 'number' || card.kind === 'multiplier' || ELEMENT_KINDS.includes(card.kind);
}

/** Cards you can play on your own turn to start a chain against someone. */
export const INITIATOR_KINDS: CardKind[] = ['skip', 'discard', 'discardAction', 'discardAttack', 'discardMultipliers'];

/** Cards you can play when something is coming at you. */
export const RESPONSE_KINDS: CardKind[] = ['block', 'reverse', 'skip'];

export function isActionCard(card: Card): boolean {
  return !isAttackCard(card);
}

export function cardLabel(card: Card): string {
  if (card.kind === 'number') return String(card.value);
  if (card.kind === 'multiplier') return `×${card.value}`;
  return CARD_INFO[card.kind].name;
}

/** The shared deck. Big enough to deal 7 cards to 6 players with plenty left to draw. */
export function buildDeck(options: { elements?: boolean } = {}): Card[] {
  const cards: Card[] = [];
  let n = 0;
  const add = (kind: CardKind, value: number, copies: number) => {
    for (let i = 0; i < copies; i++) cards.push({ id: `c${n++}`, kind, value });
  };
  for (let v = 1; v <= 9; v++) add('number', v, 4);
  add('multiplier', 2, 8);
  add('multiplier', 3, 3);
  add('block', 0, 6);
  add('reverse', 0, 8);
  add('skip', 0, 6);
  add('discard', 0, 4);
  add('discardAction', 0, 2);
  add('discardAttack', 0, 2);
  add('discardMultipliers', 0, 2);
  if (options.elements) {
    add('fire', 0, 3);
    add('ice', 0, 3);
    add('lightning', 0, 3);
  }
  return cards;
}
