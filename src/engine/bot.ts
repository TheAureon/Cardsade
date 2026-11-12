import { ultimateFor } from './abilities';
import { allies, packetDamage } from './engine';
import { ELEMENT_KINDS, isActionCard } from './cards';
import type { Action, Card, Packet, PlayerView, PublicPlayer } from './types';

/**
 * A simple heuristic bot. It decides only from its own PlayerView, so it sees
 * exactly what a human in that seat would. `random` is injectable for tests.
 */
export function decideBot(view: PlayerView, random: () => number = Math.random): Action {
  const me = view.viewer;
  const pending = view.pending;
  const hand = view.hand;
  const find = (kind: Card['kind']) => hand.find((c) => c.kind === kind);

  switch (pending.kind) {
    case 'choose': {
      const cards = view.revealedHand ?? [];
      const order = (c: Card) =>
        c.kind === 'reverse' || c.kind === 'block' ? 100 : c.kind === 'multiplier' ? 50 + c.value : isActionCard(c) ? 40 : c.value;
      const best = cards.slice().sort((a, b) => order(b) - order(a))[0];
      return { type: 'chooseDiscard', player: me, cardId: best.id };
    }

    case 'response':
      return respond(view, pending.packet, random);

    case 'post':
      return hand.length <= 10 ? { type: 'draw', player: me } : { type: 'endTurn', player: me };

    case 'main': {
      const self = view.players.find((p) => p.id === me)!;
      const opponents = view.players.filter((p) => p.id !== me && !p.eliminated && !allies(p, self));
      const target = pickTarget(opponents, random);
      const silenced = view.event?.kind === 'silence';

      // A charged ultimate goes off straight away.
      if (view.config.ultimates && self.charge >= 100) {
        const ult = ultimateFor(self.fighter);
        const weakest = opponents.slice().sort((a, b) => a.hp - b.hp)[0];
        const richestFoe = opponents.slice().sort((a, b) => b.handCount - a.handCount)[0];
        const aim = ult.kind === 'ambush' ? richestFoe : weakest;
        return { type: 'ultimate', player: me, target: ult.targeted ? aim.id : undefined };
      }

      // Strip a card-rich opponent first, sometimes.
      const discards = hand.filter((c) => c.kind.startsWith('discard'));
      const richest = opponents.slice().sort((a, b) => b.handCount - a.handCount)[0];
      if (!silenced && discards.length && richest.handCount >= 5 && random() < 0.6) {
        return { type: 'playAction', player: me, cardId: discards[0].id, target: richest.id };
      }

      const numbers = hand.filter((c) => c.kind === 'number').sort((a, b) => b.value - a.value);
      const mults = hand.filter((c) => c.kind === 'multiplier').sort((a, b) => b.value - a.value);
      const chosen = numbers.slice(0, 3);
      const sum = view.config.baseDamage + chosen.reduce((s, c) => s + c.value, 0);
      const useMults = mults.length && (sum >= 8 || sum * mults[0].value >= target.hp) ? mults.slice(0, 2) : [];
      const total = sum * useMults.reduce((m, c) => m * c.value, 1);
      // Elements ride along on anything worth landing.
      const elements = total >= 6 ? hand.filter((c) => ELEMENT_KINDS.includes(c.kind)).slice(0, 2) : [];

      // Skip the target before a big hit so their Reverse is wasted.
      const skip = find('skip');
      if (!silenced && skip && !target.skipped && total >= 15 && random() < 0.7) {
        return { type: 'playAction', player: me, cardId: skip.id, target: target.id };
      }

      return { type: 'attack', player: me, target: target.id, cardIds: [...chosen, ...useMults, ...elements].map((c) => c.id) };
    }

    case 'gameOver':
      throw new Error('Game is over');
  }
}

function pickTarget(opponents: PublicPlayer[], random: () => number): PublicPlayer {
  if (random() < 0.3) return opponents[Math.floor(random() * opponents.length)];
  return opponents.slice().sort((a, b) => a.hp - b.hp)[0];
}

function respond(view: PlayerView, packet: Packet, random: () => number): Action {
  const me = view.viewer;
  const hand = view.hand;
  const reverse = view.event?.kind === 'noReverse' ? undefined : hand.find((c) => c.kind === 'reverse');
  const block = hand.find((c) => c.kind === 'block');
  const skip = hand.find((c) => c.kind === 'skip');
  const pass: Action = { type: 'pass', player: me };
  const use = (card: Card, multiplierIds?: string[]): Action => ({ type: 'respond', player: me, cardId: card.id, multiplierIds });

  // How much it hurts to let this through.
  let threat: number;
  const below = view.stack[view.stack.length - 2];
  switch (packet.kind) {
    case 'attack':
      threat = packetDamage(view, packet);
      break;
    case 'skip':
      // A Skip answering our own card cancels it; otherwise it's a mild nuisance.
      threat = below && below.from === me ? (below.kind === 'attack' ? packetDamage(view, below) : 6) : 2;
      break;
    case 'discard':
      threat = 4;
      break;
    case 'discardAction':
      threat = hand.filter(isActionCard).length * 4;
      break;
    case 'discardAttack':
      threat = hand.filter((c) => c.kind === 'number').length * 2;
      break;
    case 'discardMultipliers':
      threat = hand.filter((c) => c.kind === 'multiplier').length * 5;
      break;
  }

  const me_ = view.players.find((p) => p.id === me)!;
  const lethal = packet.kind === 'attack' && threat >= me_.hp;
  if (threat < 3 && !lethal) return pass;

  if (reverse && (lethal || random() < 0.85)) {
    const mults =
      packet.kind === 'attack' && threat >= 8
        ? hand.filter((c) => c.kind === 'multiplier').slice(0, 1).map((c) => c.id)
        : [];
    return use(reverse, mults);
  }
  if (block && (lethal || threat >= 8 || random() < 0.4)) return use(block);
  if (skip && (lethal || threat >= 6)) return use(skip);
  return pass;
}
