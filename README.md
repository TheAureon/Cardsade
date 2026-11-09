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

- **Lobby theme** (title and menu): a jazzy, driving loop over Cmaj7–Am7–Dm7–G7 at 126 BPM, with a four-on-the-floor kick, pulsing strings, timpani and a cymbal swell at the loop point.
- **Battle theme**: an A minor countdown at 136 BPM. Relentless sixteenth-note strings, brass punches on beats 1 and 3, a trailer "BRAAAM" every four bars, and war drums on every beat, with the clock ticking in eighths. The bell plays the tune, then the horns take it an octave down on the repeat.
- **Danger mode**: speeds up to 152 BPM with doubled strings, offbeat drum hits and rolls, a sixteenth-note clock, and a crash and cymbal swell into every bar. It kicks in when you're at 25 HP or less, something is coming at you, or only two players are left.
- **Stings**: a trailer hit on every K.O. (timpani, low brass, crash), a brass fanfare with strings and claps when you win, and low strings with a falling horn when you lose.

**Sound effects** use the same instruments as the score (`src/ui/instruments.ts`), so the game sounds like one piece:
- **Interface:** marimba notes, and selecting cards climbs a pentatonic scale as your combo grows. The woodblock clock is the click.
- **Attacks and hits:** attacks fly with a cymbal swell and a string flick. Hits land with war drums and timpani, adding brass and a crash as the damage grows.
- **Responses:** Block rings like metal on a shield, Reverse is a string run that snaps back with brass, and Skip is falling marimba cut off by the clock.
- **Big moments:** your turn gets a horn fanfare, incoming attacks a low brass warning with the clock double-ticking, and K.O.s and the title logo a trailer BRAAAM.

To use recorded music instead, list file URLs in `TRACK_FILES` in `src/ui/music.ts` (`menu`, `battle`, and optionally `danger`). A listed track replaces the synth version.

## Anime cutscenes

The biggest moments cut away to short anime-style scenes. Each runs 1.3–3 seconds, and a tap or Enter/Space/Escape skips it. Bots wait while a scene plays, and the board's effects pick up right after, so nothing is missed. Turn them off with **Scenes on/off** on the setup screen or in the top bar. They're off by default if your device asks for reduced motion.

| Scene | When |
| --- | --- |
| **Battle start / ファイト!** | Every new game: you against the field on split panels, a VS slam, then BATTLE START over an impact frame |
| **Special move / 必殺技** | Attacks of 30+ damage or ×3 and up. The attacker's eyes in a slashing cut-in band, a generated move name (e.g. TRIPLE SHADOW BREAKER), the target's shocked reaction, then a white flash, an inverted frame and the damage on black focus lines |
| **Counter! / 反撃** | Reversing an attack of 20+ |
| **Guard! / 防御** | Blocking a special move |
| **K.O. / 撃破** | Every knock-out: the loser's dazed face cracks apart |
| **Final showdown / 決戦** | When a 3+ player game is down to two: diagonal face-off split by lightning |
| **Victory / 勝利, Defeat / 敗北** | Game over |

Scenes are built from the same SVG portraits, which have cutscene expressions (`intense`, `shock`, `ko`, `win`) and crops (`face`, and `eyes` for cut-in bands). The code is in `src/ui/Cutscene.tsx`, and the triggers are in `sceneFor` in `GameScreen.tsx`.

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
