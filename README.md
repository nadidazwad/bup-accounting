# Grand Theft Pokémon

A prank-marketing browser game for a BUP meme page. Level 1 plays like Pokémon FireRed (last year's event theme); Level 2 turns into GTA 2 (this year's theme). Finishing the game redirects to the real event registration page. `PLAN.md` is the spec; its **Revision 2** section at the top overrides the rest.

## Run locally

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Hover the notch at the top of the page for controls (the list follows the level).

**Level 1 (Pokémon)**

| Action | Keys | Touch |
| --- | --- | --- |
| Move | WASD / arrows | Tap where to go |
| Run | Hold Shift | |
| Interact, confirm | E / Space / Enter | Tap a person, sign or the text box |
| Back | Q / Esc / Backspace | |
| Menu | M / Esc | Tap your character |

**Level 2 (GTA)**

| Action | Keys | Touch |
| --- | --- | --- |
| Drive / walk | WASD / arrows (S brakes, then reverses) | Hold where you want to go (behind you reverses) |
| Get in / out | E / F / Enter | Tap a car / tap your car |
| Handbrake | Space or Shift (in a car) | |
| Run | Hold Shift (on foot) | |
| Radio station | R | |
| Horn | H | |
| Pause | Esc / M | |

Development shortcuts: `?level=1` (town), `?level=battle` (THE BROKER's battle), `?level=glitch` (the Pokémon → GTA transition), `?level=2` (BROKER CITY), `?level=finale` (THE BROKER's offer). F1 shows collision tiles in the town. In the city, `window.__bupCity` offers `win()`, `toGoal()`, `victims(n)`, `ram()` and `stats()`.

## Where finishing sends players

Finishing the game and choosing YES opens BUP Accounting Forum's official page, `https://www.facebook.com/bupafofficial/` (`src/game/links.ts`). Set `NEXT_PUBLIC_REGISTRATION_URL` at build time to send players to a dedicated registration page instead. Don't use `bupaf.com`: the forum's old domain lapsed and now serves a gambling site. There is no form or backend here: the official event site handles registration.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test          # unit tests: battle engine, store, music, movement, city (car physics, chase, pool, rules)
pnpm test:e2e      # Playwright: desktop and mobile Chromium, Level 1 and Level 2
pnpm build --webpack
```

In this environment Turbopack's CSS worker can't bind its IPC port, so use `pnpm build --webpack`.

## Assets

Runtime assets are rebuilt from the private, git-ignored `reference/native-sources` library:

```sh
python -I scripts/build_overworld_assets.py   # tiles, map, player, fonts
python -I scripts/build_m3_assets.py          # Pokémon, NPCs, battle and menu art
python -I scripts/convert_pokered_music.py    # Retained Red/Blue note-data conversion, unused by MP3 playback
```

Level 2's tiles, cars, peds, effects and HUD icons are drawn at runtime (`src/game/city/textures.ts`). Its three radio stations stream the user-provided GTA MP3s from `public/assets/audio/`. Changing cars selects the next song in a shuffled round; songs retain their playback positions and advance automatically when finished. R steps through the shuffled stations and radio off. The Pokémon title, intro and Level 1 overworld use the downloaded theme MP3. Battle music, other cues and sound effects use the synth. See `docs/ASSETS.md` for the file mapping.

Provenance and the route-A (ripped assets) caveat are in [docs/ASSETS.md](docs/ASSETS.md).
