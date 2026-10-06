# Implementation status

Updated 7 October 2026. PLAN.md remains the specification. The M3 section below supersedes the historical M0–M2 notes.


## M3 implementation

The interrupted implementation had capture, menu, title, naming, audio and asset code, but the capture and five menu scenes were absent from the Phaser scene registry. It also had two TypeScript errors and no M3 regression tests. Those integration gaps are repaired.

- All eight obstacles have prompts and cancellation. Cut trees disappear; pushed bushes become collision tiles at their saved destinations. Six decoys give jokes, a fleeing spreadsheet or one-time bag rewards.
- Pikachu and Venusaur reveal, enter a capture vignette and join the party after the ball throw, three wobbles and catch messages. The counter sign reflects party size.
- POKéDEX, POKéMON with summary and SWITCH, BAG, trainer card, SAVE and OPTION open and return to the field. Reordering changes the follower. Browser saves restore party, items, position, opened scenery and guard state; unavailable storage reports failure.
- The guard refuses incomplete parties, steps out of the gap for three Pokémon, and restores correctly after saving. The Auditor notices the player, approaches and introduces the challenge. M4 is explicitly unfinished: its boundary screen returns to town without marking a battle won or entering later levels. The return faces the exit so the follower cannot block it.
- Claude's title, professor speech and naming grid are retained and exercised as entry paths. Title timers now stop when leaving the title. Fullscreen fallback notices remain visible in expanded mode.
- The follower retains the established 16×16 display size using the new directional sheets. Prepared assets total 337,017 bytes; sources and adaptations are in ASSETS.md.

Verification results and visual limitations are recorded in `reference/_proof/m3-review.md`. M3 gameplay implementation is present. **GATE L1 remains open** because exact source animation timing and three clean visual comparison passes have not been established. Do not start M4 on the strength of gameplay tests alone.

## M0 and M1 (historical)

The ignored reference library contains 159 initial screenshots plus native asset sources, measured clips and M2 proof. Sources and limits are recorded in `reference/SOURCES.md` and `reference/STYLE_NOTES.md`. Compressed recording frames are useful for composition; they cannot certify exact native pixel colours or timing on their own.

The browser-only Phaser scaffold, integer scaling, shared state, input routing, settings, registration handoff and development registration stub remain in place. Title and professor intro are still M1 previews. Their finished art, name-entry grid and transitions remain outstanding. Later battle, glitch and city scenes are development-only previews. Confirm in the real overworld now interacts with its contents and never cycles into later scenes.

## M2 gameplay implemented

- A 40×30 Tiled map with native 16×16 FRLG metatiles, an office and sign, connected forest trails, solid scenery, grass, one-way ledges, flowers and a pond. Collision, grass, spawn and talk targets come from the map.
- Whole-pixel player movement at 16 frames per walking tile and 8 per running tile. Native walking and running sprite sequences, explicit integer camera scroll and 240×160 output at integer display scale.
- Keyboard/WASD, mouse pathfinding, touch D-pad and combined B/direction running. Canvas input stays scoped away from registration fields and clears on blur, visibility changes and scene shutdown. Controls wait for the scene to be ready; replay remounts the cartridge and immediately releases the old scene's listeners.
- Directed ledge traversal with a two-tile hop and shadow; transparent native grass blades cover the feet and rustle at fixed tile positions for the player and follower. Trees use foot-based depth so canopies cover actors correctly.
- Native field dialogue frame and bitmap font, two-line paging, fast-forward/advance/close controls, a blinking arrow and mirrored accessible text. Signs can be approached automatically by clicking them.
- Charizard follows into the player's previous tile, avoids walls and occupied tiles, idles, and answers with dialogue, a small happy hop and cry. Reversal detours keep tiles distinct. A reversal without room to detour is refused. The native 32×32 HGSS source is deliberately reduced to 16×16 with nearest-neighbour sampling for this one-tile GBA follower.
- Asset route A is selected for this private local preview. `docs/ASSETS.md` records provenance and transformations; every runtime URL is in the manifest. Only prepared runtime files are public, 146,642 bytes total. Original reference material stays private and ignored.

Eight future hiding spots and the northern gate remain scenery/talk targets. There are no reveals, captures, rewards, party controls, guard movement or boss battles. M3 and M4 have not begun.

## Fullscreen implemented

The accessible Fullscreen button requests native fullscreen for the canvas, toolbar and controls together. Browser events synchronize its state. The exit control and Escape restore focus, resizing preserves integer scaling, and expanded mode retains mute and registration access. Unsupported or denied requests recover into a distinctly labelled full viewport mode with a notice that browser bars may remain visible.

The desktop and mobile Chromium tests verify actual `document.fullscreenElement`, native resolution, integer scale, exit and focus restoration. Unsupported/denied simulations exercise the fallback, rotation-sized viewports, Escape and skip-to-registration. These mobile checks are Chromium emulation; real iOS Safari remains M9 work.

## Verification

Final checks passed:

- `pnpm typecheck`, `pnpm lint` and 30 unit tests.
- Full browser suite: 22 passed, 2 intentionally skipped duplicate device/evidence cases across desktop and mobile Chromium projects. A scoped evidence refresh and separate held-key check supplement the full run.
- `pnpm build --webpack` produces the production build. The normal `pnpm build` Turbopack CSS worker fails in this environment while binding its IPC port; the build script remains unchanged.
- The production browser check follows Title → Intro → Overworld, confirms development scene jumps are ignored, and verifies that the test sink cannot report a successful registration. Production registration remains disabled pending M8's real destination.
- The local preview is running at http://127.0.0.1:3000/?level=1. The temporary production-check server was stopped after verification.

Unit coverage includes directed paths, map connectivity, timing, collision, large frame deltas and follower separation. Browser coverage includes signs, grass, canopy overlap, ledges, mouse paths, touch, multitouch running, keyboard, replay, fullscreen, settings and registration focus/validation.

## Evidence and open visual gate

`reference/_proof/` contains native screenshots; town, grass and dialogue comparisons at 4× nearest-neighbour scale; native and 4× walk/run/hop/grass recordings; raw PNG frames and rAF timestamps; native asset measurements; and fullscreen screenshots with actual browser API state. `m2-review.md` lists fixes, observed differences and limits. `scripts/review_m2_evidence.py` reproduces the comparisons, measured palettes and variable-duration video encodes from the saved captures.

The four browser recordings have approximately 16.7 ms median frame intervals. They prove captured browser behaviour, not physical device performance or frame-for-frame parity with the original game. Encoding preserves capture gaps and adds a final hold frame.

At least three comparison rounds found corrections, including the border, font spacing, camera footpoint, ledge art, water palette, 5-bit display palette and native player animation sequence. Three consecutive clean passes have **not** occurred. Follower proportions, exact movement phase, ledge/shadow geometry and text/arrow timing still need stronger reference comparisons. The source capture is compressed and the map composition is original.

- [ ] GATE L1 — M3 gameplay implemented; strict visual comparison checklist remains open.
- [ ] GATE BATTLE
- [ ] GATE L2

Keep later milestones behind their gates. M8 still requires the registration destination and event date, time, venue and URL. M9 still requires Firefox, Safari, real devices, performance and complete gameplay runs.

## Keyboard focus follow-up

Fixed a reproduced browser bug where the page body had focus and keyboard events never reached the canvas. Recognized game keys now claim canvas focus from the page or game controls. Editable fields, header links, browser shortcuts and Enter/Space button activation keep their normal behaviour. Input listeners detach with the cartridge.

Verified movement in the existing in-app browser without clicking the canvas: the player moved from 9,24 to 9,23 and focus changed from BODY to CANVAS. Typecheck, lint, 30 unit tests and 10 relevant desktop/mobile browser cases passed, including the new focus regression, replay, native fullscreen and form handoff. Proof is saved as `reference/_proof/m2-keyboard-focus-*.png`. These checks supplement the earlier full M2 suite.

## Scenery rendering follow-up

The user's pond, tree and house screenshots exposed M2 tile-assembly errors. The tree used connected-forest fragments without a crown; it now uses a complete 32×48 tree with transparent grass behind it. The house now includes both missing roof rows and the original door/window order. Two nearby trees were removed to give its roof room, and its talk target follows the door.

The pond now has proper corners, sides and a bottom bank. Its water animation reconstructs the packed native 8×8 tile bank instead of cropping shore/current fragments into 16×16 sprites. Eight complete pond frames animate only the blue surface, at the native 60/16 fps cadence; the shore stays fixed. This is an adaptation of native ocean animation to the native still-water pond, recorded in `docs/ASSETS.md`.

Typecheck, lint, 30 unit tests, eight focused desktop/mobile browser cases and `pnpm build --webpack` passed. The scenery regression walks to the house and pond using real input, checks collision and compares all eight rendered animation samples for a fixed shoreline and changing blue water. The existing in-app preview was refreshed and verified using its real keyboard controls. Fresh native screenshots are `reference/_proof/m2-scenery-*.png`. These fixes belong to M2; M3 has not begun and the wider visual gate remains open.

## Tree proportions, overlap and path scenery follow-up

The first scenery repair still used a second tree tip in place of the lower canopy. The tree now uses one complete native crown and extends its canopy to meet the user's taller proportions, giving a 32×64 image with an unchanged trunk. Its bottom anchor retains the original collision footprint. Forest rows and paired groves overlap at 32 px intervals; foot-based depth places nearer foliage in front of the row behind it.

Signs and bushes now use transparent scenery tiles over the existing Ground layer. Grass fill and grass dots no longer replace pale path pixels, and translucent ground shadows inherit the surface beneath them. Small cuttable trees now use the native intact sprite rather than a fragment from a large tree. All hiding spots remain static scenery.

Typecheck, lint, 30 unit tests, six focused desktop/mobile browser cases and `pnpm build --webpack` passed. Actual rendered pixel checks found 361 differing overlap pixels with the correct nearer tree on top, and both sign and bush corners match the path colour #b8e8d0. Collision, mouse/keyboard movement, form handoff and the pond's fixed-bank animation still pass. Proof is saved in `reference/_proof/m2-scenery-depth-*.json` and `m2-trees-path-fix.png`.
