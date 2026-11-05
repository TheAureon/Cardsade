# Cardsade

**Card + Crusade.** A digital tabletop card battler that mixes DnD-style combat, Pokémon-style cards and duels, and Uno-style chaos. Fight 1–5 bot opponents. The last player standing wins.

**To play:** open `index.html` in any browser, by double-clicking it or serving it from anywhere (for example GitHub Pages). It's a single self-contained file with no install or server needed. It needs an internet connection only for the comic fonts and falls back to system fonts without one.

**To develop:**

```bash
npm install
npm run dev      # opens http://localhost:5173/dev.html with live reload
npm test         # engine rules + bot-vs-bot simulations
npm run build    # typecheck, bundle, and regenerate index.html
```

`index.html` is generated, so edit `src/` (or `dev.html`, the development entry) and run `npm run build` to update it.

## Rules

- Everyone starts with **100 HP** and **7 cards** from a shared deck. When the deck runs out, the discard pile is shuffled back in.
- **Your turn:**
  1. Play any number of action cards (Skip, Discard, Discard Action/Attack/Multipliers) at any player.
  2. Make **one attack** on a player you choose. Damage is `(1 + number cards) × multiplier cards`. With 3 and 4 plus ×2, that's `(1+3+4)×2 = 16`. Multipliers stack: ×2 and ×3 together give ×6.
  3. Then **draw** (2 cards by default, set on the setup screen) or end your turn. You can draw at any point in your turn, but drawing ends it.
- **The chain:** when an attack or effect comes at you, you can respond. It bounces between the two players involved, one card at a time, until someone takes it or blocks it.
  - **Block** stops it completely, reverses included. Nothing can answer a Block.
  - **Reverse** sends it back. When you reverse an attack, you can add your own multipliers to boost it.
  - **Skip** cancels the card coming at you, but it can be blocked or reversed. If your Skip gets reversed, *your* next card is wasted.
  - **Pass / Take it** lets it resolve on you.
- Players who hit 0 HP are knocked out, and their hand is discarded.

| Card | Effect | Blockable | Reversible |
| --- | --- | --- | --- |
| Number (1–9) | Add-on: adds to attack damage | – | – |
| Multiplier (×2, ×3) | Multiplies attack damage and add-ons | ✓ | – |
| Block | Stops everything coming at you | – | – |
| Reverse | Sends the attack or effect back | ✓ | ✓ |
| Skip | Target's next card is useless | ✓ | ✓ |
| Discard | Look at the target's hand and discard any one card | ✓ | ✓ |
| Discard Action | Target discards all action cards | ✓ | ✓ |
| Discard Attack | Target discards all number cards | ✓ | ✓ |
| Discard Multipliers | Target discards all multipliers | ✓ | ✓ |

"Can't be blocked" and "can't be reversed" mean you can't aim Block or Reverse at that card by itself. Number cards and multipliers ride along with their attack, so blocking or reversing the attack moves them too.

Deck (79 cards): numbers 1–9 ×4 each, ×2 ×8, ×3 ×3, Block ×6, Reverse ×8, Skip ×6, Discard ×4, and each Discard X card ×2. You can change this in `buildDeck` in `src/engine/cards.ts`.

## Music and sound

Everything you hear is synthesized live with Web Audio, so there are no audio files to download or license. Music and sound effects have separate on/off toggles, on the setup screen and in the top bar.

The soundtrack is an original score that crosses a quiz show with a film trailer. The game-show side has marimba and bell melodies, offbeat electric piano, claps and a woodblock "clock". The cinematic side has a string section, driving spiccato strings, brass stabs and a horn line, timpani, war drums and cymbal swells. Everything plays through a generated concert-hall reverb and a compressor.

- **Lobby theme** (title and menu): a jazzy, bouncy loop over Cmaj7–Am7–Dm7–G7 at 116 BPM, with a warm string bed, timpani and a cymbal swell at the loop point.
- **Battle theme**: an A minor countdown at 124 BPM. Spiccato strings, brass and timpani hit on every chord, war drums keep the pulse, and the clock keeps ticking. The bell plays the tune, then the horns take it an octave down on the repeat.
- **Danger mode**: speeds up to 140 BPM. The strings move to sixteenths, the drums hit every beat, the clock ticks twice as fast and a cymbal swells into every other bar. It kicks in when you're at 25 HP or less, something is coming at you, or only two players are left.
- **Stings**: a trailer hit on every K.O. (timpani, low brass, crash), a brass fanfare with strings and claps when you win, and low strings with a falling horn when you lose.

To use recorded music instead, list file URLs in `TRACK_FILES` in `src/ui/music.ts` (`menu`, `battle`, and optionally `danger`). A listed track replaces the synth version.

## Architecture (built for multiplayer)

```
src/engine/   pure TypeScript game rules, no React, no DOM
  types.ts    GameState, Action, PlayerView, Pending
  engine.ts   createGame, applyAction (validates, never mutates), getPending, getPlayerView
  cards.ts    card definitions and the deck
  bot.ts      decideBot(view): decides from the bot's own PlayerView only
  rng.ts      seeded RNG stored in the state (games are reproducible)
src/host/
  GameHost.ts authoritative state + bot driver; GameClient interface
src/ui/       React UI; it only sees a PlayerView and sends Actions
```

- **The engine is a reducer:** `applyAction(state, action) → { ok, state } | { ok: false, error }`. Every action names its player, and the engine checks that it's that player's decision (`getPending`).
- **Hidden information:** `getPlayerView(state, playerId)` strips other players' hands. Both the UI and the bots only ever see views.
- **Adding online multiplayer:** run `GameHost` on a Node server, send each socket `host.getView(itsPlayerId)` after each change, and forward incoming actions to `host.dispatch`. On the client, write a `GameClient` that talks to that socket. `GameScreen` already takes any `GameClient`. Seats with `controller: 'remote'` are left for the network to drive.
