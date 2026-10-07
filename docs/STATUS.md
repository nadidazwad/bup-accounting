# Implementation status

Updated 7 October 2026. `PLAN.md` Revision 2 is the current spec.

## Done: Level 1

**Site.** Minimal dark stage with the canvas centred at device-pixel-exact scale (4× on a 1280×800 laptop). There's no console shell, no on-screen buttons, no registration page and no BUP branding. A notch at the top shows the level and drops down the controls on hover, tap or keyboard focus, with sound, fullscreen and restart. The page theme follows the level (`data-theme="pokemon"` now, `"gta"` for Level 2). Bindings: WASD/arrows, Shift run, E/Space/Enter interact, Q/Esc/Backspace back, M/Esc menu. Z/X still work as aliases.

**Title and intro.** A GAME FREAK-ISH splash with a shooting star, then the FireRed title: native box-art Charizard, rising native flames, a POKéMON wordmark built from native glyphs at integer scale, "BrokerRed Version", and CONTINUE/NEW GAME when a save exists. PROF. LEDGER's speech follows the Oak beats on the native Oak-speech background: Pikachu send-out, FRLG preset names or the naming keyboard, then the **starter choice: Charizard, Infernape or Blaziken**, and the shrink-into-the-world ending.

**Town.** The M2 map, movement and follower, plus:
- The starter follows at native 32×32 HGSS size. Astra's 16×16 squash is removed. When the sprites overlap, the follower sorts behind the player.
- Pikachu (east grass) and Venusaur (north-west grass, past the ledge) hide in tall grass. The grass over them twitches as a hint. Walking within 2 tiles makes them pop out with "!", flashes, the slice wipe and a wild battle. Running away or losing leaves them hiding.
- A guard NPC holds the fence gap until you have 3 Pokémon, then steps aside. THE BROKER spots you by line of sight, walks up, and starts his 3v3 battle after the clock-wipe transition.
- NPCs (lass, youngster) wander. A sign counts the Pokémon you've found.
- FRLG start menu: POKéDEX, POKéMON (native party screen, summary, switching changes the follower), BAG, TRAINER CARD, SAVE (localStorage, with CONTINUE on the title), OPTION (text speed, sound).

**Battles** (`src/game/battle/`, pure and unit-tested): Gen 3 damage formula, full Gen 3 type chart, STAB, 1/16 crits (1/8 for high-crit moves), 85–100 % rolls, priority then speed, paralysis, stat stages, Reflect, Rain Dance, Skull Bash charging, Synthesis, Bulk Up, Close Combat drops, flinch, Potions, the Gen 3 catch formula (×3 friendlier, third ball guaranteed) and the trainer AI from §5.3. Wild Pokémon hang on at 1 HP and deal half damage (they're auditioning to join). The FRLG battle UI uses native backgrounds and text frames: healthboxes with HP drain at native speed, an EXP bar, FIGHT/BAG/POKéMON/RUN, the move menu with PP/TYPE, per-type move animations, send-out and faint animations, ball shakes and stars, Shift-mode switching before THE BROKER's next Pokémon, a whiteout that leads to PROF. LEDGER, rematches at −25 % foe HP per loss, and the "let PIKACHU handle it" crit assist after two losses.

**Music.** The user-provided `Pokemon Theme Music.mp3` plays on the title, intro and Level 1 overworld. Battle themes and jingles are original chiptunes in `tracks.ts`. Jingles pause the MP3 and resume it at the same position; sound controls apply to both playback formats.

## Done: the transition (PLAN.md §6)

Beating THE BROKER no longer dead-ends. He gets two more lines in the field, the frame is captured, and `GlitchScene` takes over:
- The Pokémon theme MP3 sags in pitch and tempo to a stop (`chip.slowStop`).
- The captured FRLG frame corrupts: wrong tiles pulled from the real tileset (some smeared into columns), scanline tearing, an RGB channel split, a hue/saturation drift and a pixelated collapse.
- A fake GBA error box: "An error has occurred. POKéMON has encountered a TWIST." Its text glitches, and "Please do not turn off the power" becomes "Too late."
- Hard cut to black, the 640×480 GTA screen and a boot sound. Then the **GRAND THEFT AUDIT 2** front end: an original red/yellow wordmark over BROKER CITY seen from high above. The district select strikes out DOWNTOWN and types BROKER CITY. E, Space or a tap starts play.
- The city opens with the camera dropping from max zoom-out onto the player, and a pager beep.

The page follows along: `data-theme="glitch"` (a chromatic frame jitter, motion only) while the cartridge breaks, then `"gta"`. There are no white strobes in the transition. Explosion flashes go through `FlashLimiter` (at most 2 per second; WCAG 2.3.1 allows 3). Reduced motion keeps the corruption but drops tearing, shaking, flashes and pop-in scaling. The transition saves a checkpoint, so CONTINUE on the title resumes in the city.

## Done: Level 2, BROKER CITY (PLAN.md §7)

Code lives in `src/game/city/`. The pure logic is unit-tested: `layout`, `car`, `collide`, `chase`, `pool`, `projection`, `rules` and `flash`. The Phaser systems are `Buildings`, `Vehicles`, `Peds`, `Cops` and `Effects`, plus `scenes/CityScene` and `scenes/CityHudScene`.
- **Look:** a generated 7×7-block downtown (116×116 cells of 32 px) on a tilemap of procedurally drawn tiles: roads with lane dashes, zebra crossings at every block corner, pavements with kerbs, car parks, a park with a fountain, sodium lamp pools and manholes. **Pseudo-3D buildings** use a true camera-height projection (`eye / (eye − h)`). Roofs shift outward *and* grow, the walls facing the camera are filled with per-floor windows or glass ribbons, rooftop boxes stand proud, and billboards on stilts and tree canopies lean too. The camera looks ahead and zooms out with speed, and the eye height rises with it. Joke billboards include "TAXES. DO THEM." and "BUPAF: BE THERE OR BE AUDITED". All art is original and drawn at 2× at runtime.
- **Rendering:** the GTA screen is 640×480 logical, drawn into a 1280×960 backing store, and fitted smoothly by the shell. This keeps HUD text and vectors crisp at any page size.
- **Player:** starts on foot with a GTA arrow over the getaway car. E/F gets in and out, including carjacking traffic and cop cars. The car physics splits forward and lateral velocity and uses lateral grip, a Space/Shift handbrake, reverse and bounces. Damage goes dents → smoke → fire → explosion 5 s later. Exploding with you inside is WASTED, and you can always get out. Skid marks are left on slides.
- **Peds:** a 60-object pool of office workers (briefcases, ties) walks a pavement graph and takes zebra crossings. They dodge fast cars, scatter after hits and explosions, and drivers you drag out run off. A hit gives knock-back, a flattened sprite, a small cartoon splat, fluttering receipts and points at the multiplier. `Effects` has an `"invoices"` theme (ink splat) for the softer PLAN.md §13 variant.
- **Cops:** the wanted level shows as six heads: the first at 3 victims, full at 13. `CopDirector` keeps up to 5 cops, cars and officers on foot. Cars aim at a predicted intercept, and two of them aim ahead of or beside you to box you in. They use whisker raycasts, route via visible intersections when they can't see you, back off when stuck, and respawn off screen when stuck or more than 1,500 px away. Officers drag you out if you sit still for more than 2 s, and touching you on foot is an arrest. "COPS ON YOUR TAIL: 5" appears and sets `flags.fiveCopsSeen`. BUSTED and WASTED keep your victims, cost 25 % of the score and respawn you nearby with a car at the kerb.
- **Win:** 20 victims (FRENZY COMPLETE!, +$5,000) and 5 cops seen at once. The pager then says "GOOD WORK. NOW GET TO THE BROKER'S TOWER." A big yellow arrow (on screen, or at the screen edge) leads to the goal on the tower plaza: JOB COMPLETE! → Finale.
- **HUD:** a scrolling pager LCD (top left), cop heads (top centre), score, multiplier and victims (top right), lives and armour (bottom left), big centre messages in Anton, the radio station name, and a pause screen (Esc/M).
- **Audio:** BUP FM, KRUD 99.9 and BROKER FM play the user-provided `GTA Radio Track 1.mp3`, `2.mp3` and `3.mp3`, respectively. Car changes and song endings select music from a shuffled round that visits all three songs before repeating and avoids consecutive repeats between rounds. Each song retains its playback position across car and station changes. R steps through the shuffle and radio off; re-entering the same car keeps its station. The front-end theme, briefing theme and jingles for frenzy, job done and busted remain synthesised. Engine pitch follows speed, plus a two-tone siren that fades with distance, horn (H), crash, thud, explosion, car door, static and the pager beep.
- **Touch:** tap a car to get in, hold where you want to drive (behind you reverses), tap your car to get out. There are still no on-screen buttons. Portrait phones get a small "turn your phone sideways" hint.
- **Performance:** everything is pooled. The city update takes ≈0.5–0.7 ms per frame with 60 peds, ~30 cars and 5 cops. Headless Chromium on SwiftShader (CPU rendering) holds 52–58 fps; a real GPU has plenty of headroom.

## Done: the finale

`FinaleScene` is a GTA 2 mission briefing: an INCOMING CALL header, THE BROKER's portrait tinted like a video phone with scanlines, your stats, and a typewriter briefing with pager beeps (any key skips). Then "READY FOR THE NEXT LEVEL?" slams in. YES → `window.location.assign(REGISTRATION_URL)`. NO → one of four jokes, and he asks again.

## Verification

Typecheck and lint are clean. All 57 unit tests and 28 Playwright cases pass on desktop and mobile Chromium. Browser coverage includes both levels, the glitch transition, the finale's exact accession URL, MP3 playback and sound controls, shuffled radio on car changes, retained song positions, automatic song advancement, save jingles and the notch easter egg. `pnpm build` succeeds with Turbopack. A production smoke test verifies the generated favicon, “Rafid was here” at the bottom of the notch, Pokémon and GTA MP3 playback, and seeded save → CONTINUE → city, with development scene jumps and hooks disabled.

Dev hooks (development only): `window.__bupCity.win()`, `.toGoal(dy?)`, `.victims(n)`, `.ram()` and `.stats()`. City telemetry on the canvas: `data-city-mode`, `-speed`, `-victims`, `-cops`, `-wanted`, `-won`, `-near-car`, `-player` and `-locked`.

## Next

- Real-device testing (iOS Safari, Firefox, a mid-range Android phone in landscape).
- Optional: traffic lights, pedestrians with dropped receipts you can collect, and an "invoices" toggle if the audience needs the softer variant.

## Removed in Revision 2

The registration form, server action, sink and rate limiter; the GBA console shell and touch buttons; CUT/STRENGTH hiding spots and decoy items; and the M2 pixel-regression and M3 e2e suites that encoded those designs. `tests/e2e/level1.spec.ts` replaces them.
