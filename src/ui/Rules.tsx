import { CARD_INFO } from '../engine/cards';
import type { CardKind } from '../engine/types';

/** The rules summary, shared by the title screen overlay and the setup screen. */
export function Rules() {
  return (
    <>
      <ul>
        <li>Everyone starts with 100 HP and 7 cards. The last player standing wins.</li>
        <li>
          On your turn, play any action cards you like, then make <b>one attack</b> on a player. An attack does 1 damage, plus
          your number cards, times your multipliers: <code>(1 + numbers) × multipliers</code>.
        </li>
        <li>You can draw at any point in your turn, but drawing ends it.</li>
        <li>
          When something comes at you, you can Block it, Reverse it, Skip it, or take it. The chain bounces back and forth until
          someone takes it or blocks it.
        </li>
      </ul>
      <table>
        <tbody>
          {(Object.keys(CARD_INFO) as CardKind[]).map((k) => (
            <tr key={k}>
              <th>{CARD_INFO[k].name}</th>
              <td>
                {CARD_INFO[k].description}{' '}
                <span className="muted">
                  ({CARD_INFO[k].blockable ? 'can be blocked' : "can't be blocked"},{' '}
                  {CARD_INFO[k].reversible ? 'can be reversed' : "can't be reversed"})
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
