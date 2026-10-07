# Asset decision and provenance

Route A from PLAN.md §12 is used for this private local build. The task requests native FRLG art and a Charizard follower, with no deployment. This is a reversible local implementation. A public release still needs an explicit asset decision. Nintendo/Game Freak/The Pokémon Company retain their character and game-art rights. The source repositories do not grant permission to market these assets publicly.

The loader resolves every runtime path through `src/game/assets.manifest.ts`. The private `reference/` library is not served. Prepared runtime files are under `public/assets/`.

| Runtime files | Source and preparation |
| --- | --- |
| town-tiles.png | [pret/pokefirered](https://github.com/pret/pokefirered), data/tilesets/primary/general and secondary/pallet_town. Reassembles 8×8 indexed tiles into 729 native 16×16 metatiles, respecting flips and palette banks. Three appended transparent variants contain the sign, bush and native cuttable tree. Grass fill/dots are removed from signs and bushes, and grass-shadow shades become translucent black so their shadows inherit the ground colour. Cuttable-tree frame 0 comes from graphics/object_events/pics/misc/cut_tree.png with npc_green.pal. Channels return to 5-bit precision with a left-shift display expansion, matching the reference capture. |
| player.png | graphics/object_events/pics/people/red_normal.png and palettes/player.pal from that repository. Eighteen 16×32 frames: nine walking frames and nine running frames extracted from red_surf_run.png using the original RedNormal frame table. Right-facing frames mirror left. |
| tree.png | One complete crown uses native metatiles 14/15/30/31/38/39. The prior 22/23 section was a second tree tip. To meet the requested taller proportions, extend the 32 px canopy to 48 px with nearest-neighbour sampling, preserving the 16 px trunk section. The resulting image is 32×64. Grass fill/dots are transparent and ground shadows adapt to the surface beneath them. Anchor the image at its original footprint's feet and sort by that footpoint. Forest and paired grove rows overlap at 32 px intervals. |
| flower.png | Five native 16×16 flower animation frames, palette 00, at 60/16 fps. Remove the stray palette13 grass pixels while preserving green leaves. Transparent pixels show the existing ground beneath every frame. Flowers sort by their roots, consistently with actors. |
| grass-effect.png | Five native 16×16 tall-grass field-effect poses from graphics/field_effects/pics/tall_grass.png, with general_1.pal. Index0 and backdrop indices12–15 are transparent. The source animation plays 1/2/3/4/0 at ten display frames per pose. Effects remain anchored to grass tiles while the player or follower crosses them, retain idle fringe0 under standing feet, and finish their rustle after departure. |
| water.png | Eight 112×64 pond frames. The pond uses native corners/sides/bottom metatiles 421–423, 429–431 and 548–550. Native water banks contain 48 packed 8×8 tiles; reassemble them at slots 416–463 using the original animation routine, then render water metatile 299 with palette 04. Adapt this moving ocean surface to the still pond's blue surface mask. Native grass, rock and submerged bank pixels remain fixed. Playback is 60/16 fps. |
| text.png, text.xml | Native latin_normal.png, charmap.txt and glyph widths from src/text.c. Bitmap text has native 14 px height, 1 px spacing and 15 px lines. |
| textbox.png | Native menu_message.png and stdpal_0.pal. Assembled with the rounded field-dialogue border algorithm in src/new_menu_helpers.c. |
| charizard.png | [overworld-spawn-mod source sheet](https://github.com/YoDrehDenSwagAuf/overworld-spawn-mod/blob/main/assets/enhanced_overworld/followsprites/006-b-n.png), HGSS-derived 32×32 directional frames, reduced to 16×16 with nearest-neighbour sampling for the one-tile GBA follower. Original art remains owned by its rights holders. |
| charizard.ogg | [PokeAPI legacy cry](https://github.com/PokeAPI/cries/blob/main/cries/pokemon/legacy/6.ogg). |
| town.tmj | Original 40×30 Tiled JSON authored for this map. The office reconstructs the full five-row Pallet house, including both roof rows and its correct door/window order. Collision, grass, spawn, tree footprints, ledges and talk targets live in the map. Objects identify the two hidden Pokémon, the guard, THE BROKER and two wandering NPCs. Props reuse native Pallet metatiles: path verges (654/655/663/670/671/678/686/694 and inner corners 702/703/710/711), Oak's lab (680–728), the plaza (357–359, 373–375), the mailbox (685), posts (361), a sign (360) and boulders (159). |

Exact source URLs for every downloaded image and palette are saved in `reference/SOURCES.md` and `reference/native-sources/sources.json`. `scripts/build_overworld_assets.py` rebuilds prepared images and the map from those local sources. Run it with `python -I scripts/build_overworld_assets.py`.

The field frame geometry comes from the original tile assembly. Default neutral/follower text is gray. The blue and red NPC fonts are different native source variants and remain for the NPC milestone. Camera target is x120, feet y88. Walking and running durations are 16/60 and 8/60 seconds. The native animation tables specify alternating foot/idle spans of 8 frames when walking and base/foot spans of 5/3 frames when running; these sequences are now used. Text prints at 30 glyph/s, supported by the source's fast setting, but the longplay's text setting remains unknown.

The follower takes turn detours to preserve distinct occupied tiles. A reversal in an enclosed one-tile corridor is refused rather than crossing through the player. The authored trails have room to turn. The follower is reduced to one native tile so its idle body and happy hop do not cover the player. Their feet and occupied tiles never coincide. Ledge traversal follows the directed map graph. These adaptations are recorded in the open visual gate.

## M3 additions

`build_m3_assets.py` prepares the native window, colored and small bitmap fonts, party background/slot variants, bag, naming screen, field emotes, ball, stars, encounter background and trainer throw frames from the same private `pret/pokefirered` source library. Front/back Pokémon art and cries use the six species recorded in the manifest. Directional follower sheets come from the library's HGSS-derived `follow/` files; the overworld displays the lead at 16×16 with nearest-neighbour scaling, while the reveal uses the 32×32 sheet.

The title uses native Charizard artwork with an original text wordmark. Professor Ledger currently uses Oak's sprite; the Auditor uses Giovanni's field sprite and the Gentleman front portrait. These are route-A substitutions, not newly authored character art. Receipt, calculator, invoice and fleeing-spreadsheet art are original. The card, summary and Pokédex layouts are adaptations rather than pixel-exact native screens.

Battle music, jingles and UI/field sound effects in `src/game/audio/` use the local synthesizer. The Pokémon theme and GTA radio use the user-provided MP3s listed below. Species cries remain native. This records provenance, not a passed visual or audio fidelity gate.

## Revision 2 additions (7 Oct 2026)

| Runtime files | Source and preparation |
| --- | --- |
| front/back/icon/follow-*.png, cry-*.ogg | `scripts/build_m3_assets.py`. FRLG front/back pictures, party icons (native icon palettes) and HGSS-style 32×32 follower sheets for every species. Followers render at native size. |
| *-blaziken.png | pret/pokefirered `graphics/pokemon/blaziken`; follower from the overworld-spawn-mod sheet `257-b-n.png`; PokeAPI legacy cry 257. |
| *-infernape.png | Gen 4 Pokémon, not in FRLG: PokeAPI Platinum front/back sprites cropped to their pixels (never resampled), the Gen 7 icon centred in a 32×32 two-frame sheet, follower `392-b-n.png`, PokeAPI legacy cry 392. |
| npc-broker.png, broker-front.png | THE BROKER: native Giovanni object-event sheet and `leader_giovanni_front_pic` with its palette. |
| battle-bg, battle-box, healthbox, party-*, bag-*, naming-bg, oak-*, title-mon, flames, emotes, ball, stars, types | Native tilemaps and sprites assembled with their palette banks. Title flames recolour their last four fade shades into embers for our dark sky. |
| text-*.png, text-small*.png | The native font recoloured with stdpal_0 pairs (blue, red), white for battles, and gold/navy for the title wordmark. Glyph cell backgrounds are transparent. Also the native small font (`latin_small`, 8×16 cells). |
| src/game/audio/pokered-title.ts | Retained conversion of pret/pokered `audio/music/titlescreen.asm` by `scripts/convert_pokered_music.py`. Runtime theme playback now uses the user-provided MP3 below. |

Route A remains a takedown risk for a public page (PLAN.md §12). Every runtime path is still listed in `src/game/assets.manifest.ts`.

## Level 2 additions (7 Oct 2026)

Level 2's city art is procedural and original. Its radio now plays the user-provided MP3s listed below.

| Runtime content | Source |
| --- | --- |
| City tiles (asphalt, lane dashes, zebra crossings, kerbs, car parks, grass, plaza, water), cars (sedan, sport, van, taxi and police, with dented and wrecked variants and light-bar frames), office-worker, cop and player peds, splats, receipts, smoke, fire, glow, scorch, trees, the objective arrow, cop heads, heart, shield | Original procedural art, drawn as pixel art into canvases at runtime by `src/game/city/textures.ts` (one texel per world pixel). This includes the roof textures and the pixel-art pager, cop heads, heart and shield. |
| Buildings, roofs, windows, billboards, tower sign | Drawn every frame by `src/game/city/Buildings.ts` (pseudo-3D projection). The billboard slogans are original jokes. |
| "GRAND THEFT AUDIT 2" logo and front end | Original wordmark and layout in `GlitchScene.ts`, set in block-scaled Jersey 10 pixel type. It is not the GTA logo. |
| Glitch transition | Effects applied to a runtime capture of the player's own Level 1 frame, plus tiles from the existing route-A town tileset. |
| Finale portrait | Reuses the route-A `broker-front.png` (see above), tinted at runtime. |
| HUD, menu and message fonts | [Jersey 10](https://fonts.google.com/specimen/Jersey+10) (`--font-gta`) and [Silkscreen](https://fonts.google.com/specimen/Silkscreen) (`--font-gta-small`), both under the SIL Open Font License 1.1 and loaded with `next/font/google`. They're rendered to the native pixel grid by `src/game/ui/pixelText.ts`. |
| Front-end, briefing, frenzy, job-done and busted music; engine, siren, horn, crash, thud, explosion, car-door, static, pager and boot sounds | Original compositions and patches in `src/game/audio/tracks.ts` and `chip.ts`, synthesised with Web Audio. |

## Downloaded music (7 Oct 2026)

The user supplied these four MP3s in the project root. Runtime copies preserve their original bytes under `public/assets/audio/`; the supplied originals remain in place. Paths are recorded in `src/game/assets.manifest.ts`. Songs stream on demand and use the shared Web Audio music bus for mute, volume and the cartridge slowdown. The Pokémon theme loops. Radio songs advance through a shuffled round when finished. Jingles pause a song and resume at the same position.

| Runtime file | Supplied file and playback |
| --- | --- |
| pokemon-theme.mp3 | `Pokemon Theme Music.mp3`, played on the title, intro and Level 1 overworld. |
| gta-radio-1.mp3 | `GTA Radio Track 1.mp3`, BUP FM. |
| gta-radio-2.mp3 | `GTA Radio Track 2.mp3`, KRUD 99.9. |
| gta-radio-3.mp3 | `GTA Radio Track 3.mp3`, BROKER FM. |

Entering a different car selects the next shuffled station. Each round plays all three songs, with no consecutive repeats between rounds. A song resumes at its saved position when selected again; a finished song starts fresh on its next play. Re-entering the same car keeps its station. R steps through the shuffled songs, offers RADIO OFF at the end of a round, then starts a fresh shuffle. A cartridge restart clears saved playback positions. Download URLs and recording attribution were not supplied.
| npc-*.png | Native FRLG object-event sheets (embedded palettes), first 9 frames: lass, youngster, policeman (guard), giovanni (THE BROKER), scientist, gentleman, black_belt, rocker, old_man_1, worker_m, cooltrainer_m, bug_catcher, beauty, old_woman, fisher, gba_kid (3 idle frames, so it stays put) and poke_maniac. |
