import type { Card, PlayerId, PlayerView } from '../engine/types';
import { Avatar } from './Avatar';

/**
 * The tutorial coach: reads the live game and points at the next thing to
 * do, so the lesson follows whatever actually happens on the table.
 */
export function Coach({ view, target, selected }: { view: PlayerView; target: PlayerId | null; selected: Card[] }) {
  const tip = coachTip(view, target, selected);
  if (!tip) return null;
  return (
    <div className="coach" role="status" aria-live="polite">
      <div className="coach-face">
        <Avatar seed={0} mood="win" crop="face" />
      </div>
      <div className="coach-bubble">
        <b>{tip.title}</b>
        <span>{tip.text}</span>
      </div>
    </div>
  );
}

function coachTip(view: PlayerView, target: PlayerId | null, selected: Card[]): { title: string; text: string } | null {
  const me = view.viewer;
  const p = view.pending;
  if (p.kind === 'gameOver') return null;
  const hand = view.hand;
  if (p.kind === 'response' && p.player === me) {
    if (hand.some((c) => c.kind === 'reverse'))
      return { title: 'Incoming attack!', text: 'Tap Reverse to send it straight back. Select your ×2 first to make it hurt even more.' };
    if (hand.some((c) => c.kind === 'block')) return { title: 'Incoming attack!', text: 'Tap Block to stop it completely.' };
    return { title: 'Incoming attack!', text: 'No defence in hand. Tap Take it and save your cards for next time.' };
  }
  if (p.player !== me) return { title: 'Their turn', text: 'Watch Sir Clank. When he attacks you, you get to respond.' };
  if (p.kind === 'post') return { title: 'Nice hit!', text: 'Tap the glowing deck or Draw to refill your hand. Drawing ends your turn.' };
  if (p.kind === 'choose') return { title: 'Discard', text: "Pick the card you'd least like them to keep." };
  if (!target) return { title: 'Pick a target', text: 'Tap Sir Clank to aim at him.' };
  const attackCards = selected.filter((c) => c.kind === 'number' || c.kind === 'multiplier' || c.kind === 'fire');
  if (!attackCards.length && hand.some((c) => c.kind === 'number'))
    return { title: 'Build your attack', text: 'Tap number cards to add damage, then the ×2 to double it. Add Fire to burn him over his next turns.' };
  return { title: 'Attack!', text: 'Damage is (1 + numbers) × multipliers. Hit the big Attack button.' };
}
