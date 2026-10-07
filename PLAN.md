# BUP: "GRAND THEFT POKÉMON" prank-marketing game

## REVISION 2 (7 Oct 2026): these decisions override everything below

The sections after this one are the original spec. Where they conflict with this revision, **this revision wins**.

**Purpose.** This is prank/meme marketing, not a signup app. It gets posted on a BUP meme page. Last year's BUP event was Pokémon-themed, this year's is GTA-themed, so the game plays as a transition from one to the other. Players who finish are **redirected to the official BUP event registration page** (URL supplied later; one constant, `REGISTRATION_URL`). We build **no form, no server action and no sink**.

**Site / UI**
- No "BUP ACCOUNTING" branding in the page chrome or the title screen. In-game dialogue may keep light accounting jokes.
- No registration page, no skip-to-registration link.
- Modern, minimal page: a dark, near-empty stage with the game canvas centred at pixel-exact scale. No handheld console shell and **no on-screen physical buttons**.
- The page picks up a subtle theme from the current level: Pokémon accents (red/white, ball motif) in Level 1, GTA accents (neon/gold on asphalt) in Level 2.
- A small **notch** at the top centre of the stage. Hovering it (or tapping it, or focusing it with the keyboard) drops down a controls sheet.
- Modern keybinds instead of A/B: **WASD/arrows** move, **Shift** run, **E / Space / Enter** interact and confirm, **Esc / Backspace / Q** back, **Tab / M** menu. Touch: tap to walk or interact, tap the text box to advance, tap your character for the menu.

**Level 1 changes**
- **Starter choice** in the professor's intro: **Charizard, Infernape or Blaziken**. The starter follows you, HGSS-style, at native 32×32 size.
- The two catchable Pokémon (**Pikachu, Venusaur**) hide **in tall-grass patches**, not behind bushes or trees. Walking within 2 tiles makes them **pop out automatically**, the "!" plays and a **wild battle** starts. You must weaken them, then throw a POKé BALL. Wild Pokémon can't be knocked out: they hang on at 1 HP. No CUT/STRENGTH, no decoy bushes.
- The villain is **THE BROKER** (formerly "THE AUDITOR"). Same 3v3 team: Caterpie, Bayleef, Blastoise.
- Music: the **original Pokémon Red/Blue opening (title) theme**, converted from pret/pokered's note data into our chip synth. Route A asset rules apply (§12).

**Ending.** After Level 2 (GTA) is beaten, THE BROKER returns and offers "the next level". Accepting redirects to `REGISTRATION_URL`. Level 3 (briefing + form) and §8 are removed.

---

Build plan for the executing agent (GPT 6.1 sol, reasoning effort: extra high).

This document is the spec. Read all of it before writing code. Sections marked **GATE** are hard checkpoints: do not move past one until its checklist passes and you have saved proof (a screenshot or recording) to `reference/_proof/`.

---

## 0. The pitch

A browser game that ends in an event registration form.

1. **Level 1: Pallet-style town (Pokémon FireRed/LeafGreen look, GBA 240×160).** The player spawns with a starter **Charizard** following behind them. Two more Pokémon, **Pikachu** and **Venusaur**, are hidden behind bushes and trees. Clicking an obstacle moves it and reveals what's behind it. Once all three are in the party, a gate opens and the player fights the **Boss**, a 3v3 trainer battle against **Blastoise, Bayleef and Caterpie**.
2. **Level 2: the twist (GTA 2 look).** The screen glitches, the GBA palette breaks, and you drop into a top-down GTA 2 city. Steal a car, run over **at least 20 pedestrians** while **5 police officers** chase you.
3. **Level 3: "THE HARDEST LEVEL STARTS NOW."** A GTA 2 mission-briefing style screen, then the **Register for BUPAF** form. This form is the real signup.

Tone: affectionate parody. Every detail should look like it came out of the original games, and the writing should have accounting jokes all over it.

Spelling of the Pokémon (the brief had typos): Charizard, Pikachu, **Venusaur**, **Blastoise**, **Bayleef**, **Caterpie**.

---

## 1. Reference-image protocol (this matters most)

The goal is accurate replication. You cannot match a look from memory, so you collect references first and keep checking against them.

### 1.1 Collect the reference library before writing any game code

Create `reference/` at the repo root (git-ignored, never shipped). Download **at least 40 images**, sorted into folders:

```
reference/
  pokemon-frlg/
    overworld/      ≥10 screenshots: Pallet Town, Route 1, Viridian Forest, tall grass, cuttable trees, ledges, signs, fences, flowers (animated), water edge
    battle/         ≥10 screenshots: trainer battle intro, "send out" animation, FIGHT/BAG/POKéMON/RUN menu, move menu with PP/TYPE box, HP bars (green/yellow/red), EXP bar, faint, switch screen, "It's super effective!"
    dialogue/       ≥5: text box border, the ▼ continue arrow, YES/NO box, name tags
    transitions/    ≥3: trainer battle swirl/wipe, screen flash, fade to black
    ui/             party screen, "POKéMON joined your team" style text, item get
  pokemon-hgss/
    followers/      ≥3 screenshots of HeartGold/SoulSilver walking Pokémon (for the Charizard follower behaviour)
  gta2/
    city/           ≥10 screenshots: Downtown district streets, rooftops at different zoom levels, car parks, pavement edges, zebra crossings, traffic lights, alleys
    hud/            ≥5: score/multiplier top-right, wanted-level cop heads, lives, the pager/mission text, "FRENZY" bonus text, "WASTED"/"BUSTED"
    vehicles/       ≥5: the car sprites (top-down), police car with light bar, damage/fire states, explosion
    peds/           ≥3: pedestrians walking, running/panicking, blood decals (we will tone these down, see §8.6)
    menus/          ≥3: GTA 2 front-end menu, mission briefing screen, district select
```

**Where to get them:**

| What | Source |
|---|---|
| FRLG tilesets, battle backgrounds, player sprites, NPCs, attack effects | [Spriters Resource: Pokémon FireRed/LeafGreen](https://www.spriters-resource.com/game_boy_advance/pokemonfireredleafgreen) (Tileset 1 `/asset/3862/`, Tileset 2 `/asset/3863/`, Battle Backgrounds `/asset/3866/`, Player Sprites `/asset/52432/`, Trainers `/asset/3706/`, Overworld NPCs `/asset/3698/`, Attack Effects `/asset/3860/`, Animated Tiles `/asset/164543/`) |
| Pokémon battle sprites (front + back, Gen 3) | [PokeAPI/sprites](https://github.com/PokeAPI/sprites). These URLs are confirmed working: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/firered-leafgreen/{id}.png` and `.../firered-leafgreen/back/{id}.png`. IDs: Venusaur 3, Charizard 6, Blastoise 9, Caterpie 10, Pikachu 25, Bayleef 153 |
| Pokémon cries | [PokeAPI/cries](https://github.com/PokeAPI/cries) `cries/pokemon/legacy/{id}.ogg` (confirmed working) |
| Overworld Pokémon sprites (for the follower and the hidden Pokémon) | Spriters Resource FRLG "Pokémon (Overworld)" `/asset/3711/`, plus HGSS overworld follower sheets on Spriters Resource (DS → HeartGold/SoulSilver) |
| Gameplay screenshots, both games | [Bulbapedia](https://bulbapedia.bulbagarden.net), [Grand Theft Wiki: Screenshots of GTA 2](https://www.grandtheftwiki.com/Category:Screenshots_of_GTA_2), MobyGames, YouTube longplays (grab frames with `yt-dlp` + `ffmpeg -vf fps=1`) |
| GTA 2 HUD, font, arrows, weapon icons | [Spriters Resource: GTA 2 (PC)](https://www.spriters-resource.com/pc_computer/grandtheftauto2/) (In-Game Font, Arrows, Weapon Icons, Dialogue Portraits) |
| GTA 2 sound effects | [The Sounds Resource: GTA 2](https://sounds.spriters-resource.com/pc_computer/grandtheftauto2/asset/395438/) (cop radio, engines, horn, explosions, voice lines) |
| GTA 2 city art (vehicles, tiles) | GTA 2 has no clean sprite rips on Spriters Resource. Extract from the freeware GTA 2 `.sty` style files with a community tool (e.g. OpenGTA2 / "GTA2 STY viewer"), or use the CC0 fallback: [Kenney RPG Urban Kit](https://kenney-assets.itch.io/rpg-urban-kit), [Kenney Roguelike Modern City](https://opengameart.org/content/roguelike-modern-city-pack), [Top-Down City by El Beshuele](https://elbeshuele.itch.io/topdowncity), then repaint to the GTA 2 palette |
| Fonts | FRLG-style pixel font: [Pokemon Fire Red Regular (fontlibrary, CC-BY-SA)](https://fontlibrary.org/en/font/pokemon) or [Pokemon Classic for GB Studio](https://santiagocrespo.itch.io/pokemon-classic-font). GTA 2: rebuild a bitmap font from the Spriters Resource "In-Game Font" sheet |

Save every downloaded file with its source URL in `reference/SOURCES.md`.

### 1.2 Study the references and write down what you measure

Before building each visual system, open the relevant reference images (actually view them, don't infer from filenames) and write a **style sheet** in `reference/STYLE_NOTES.md`. Record measured numbers, not adjectives:

- **FRLG overworld:** tile size (16×16), player sprite size (16×32 footprint), walk cycle frame count and timing (one tile per 16 frames at 60 fps when walking, 8 when running), how the tree canopy overlaps the player, how the tall-grass overlay covers the lower half of the sprite, how many colours a tile uses, the shadow under the sprite.
- **FRLG battle:** exact screen positions in the 240×160 frame for the enemy sprite, enemy platform, player back sprite, player platform, enemy HP box, player HP box (which has the HP numbers and EXP bar), the text box (bottom 48 px), the 2×2 action menu. HP bar colour thresholds (green > 50 %, yellow > 20 %, red ≤ 20 %) and the hex values sampled from screenshots. HP drain speed. Text speed in chars per frame.
- **GTA 2:** camera height and how it zooms out with car speed, the parallax "lean" of building walls away from screen centre, pavement/kerb widths relative to car length, car-to-ped size ratio (~ car 64×32 vs ped 16×16 at default zoom), HUD layout and colours, how the cop-head wanted meter fills, the gold-on-dark text style of on-screen messages.

Sample hex colours with a script (`python -I` + Pillow, run from a separate scripts dir as described in the environment rules) and paste them into `STYLE_NOTES.md`. These numbers become constants in `src/game/style/*.ts`.

### 1.3 Compare side by side at every milestone

At every **GATE**:

1. Take a screenshot of the running game at native resolution (Playwright, or the preview tool) with the same scene composition as a reference shot.
2. Make a side-by-side comparison image: `reference/_proof/<gate>-compare.png` (reference left, ours right, both upscaled 4× nearest-neighbour).
3. View the comparison and list every difference you can see (palette, positions off by N px, font weight, border thickness, timing). Fix them. Repeat until at least three passes find nothing worth fixing.
4. For animation and timing, record a short clip of ours and compare it frame by frame against a longplay clip.

"Looks close enough" doesn't pass a gate. Measured differences get fixed.

---

## 2. Tech stack and architecture

The repo is a fresh **Next.js 16.3** + React 19.2 + Tailwind 4 app (pnpm). **Next 16 has breaking changes. Read `node_modules/next/dist/docs/` before touching routing, `next/dynamic`, server actions or `next/font`** (see AGENTS.md).

| Concern | Choice | Why |
|---|---|---|
| Game engine | **Phaser 4.1** (`phaser@4`) | Mature 2D engine with tilemaps, arcade physics, cameras, tweens, pixel-art mode and a WebGL renderer with filters (needed for the glitch transition) |
| Maps | **Tiled** (`.tmj` JSON) | Phaser loads Tiled maps natively. Keep collision, object and trigger layers in the map file instead of hard-coding them |
| Game state | Small typed store (`zustand` or a hand-written event-emitter) shared by Phaser and React | React needs to know the current level (for the signup form) and Phaser needs the party/progress |
| Signup form | React + a **Next server action**, validated with `zod` | Real form, accessible, works with password managers and autofill |
| Audio | Phaser sound manager, with a mute toggle persisted in `localStorage` | |
| Tests | Vitest for pure logic (damage formula, type chart, AI, chase logic); Playwright for the e2e run-through with a debug "skip" query param | |

### 2.1 Folder layout

```
app/
  page.tsx                 server component: page shell + <GameMount/>
  game-mount.tsx           "use client": dynamically imports Phaser (no SSR), owns the <canvas> container
  register/actions.ts      "use server": registerForBupaf(formData)
  globals.css              pixel fonts, image-rendering: pixelated, CRT overlay
src/game/
  config.ts                Phaser.Types.Core.GameConfig (pixelArt: true, roundPixels: true)
  state/store.ts           party, flags (bushesCut, bossBeaten, kills, wanted), level
  style/frlg.ts            measured constants from STYLE_NOTES (positions, colours, timings)
  style/gta2.ts
  scenes/
    BootScene.ts           tiny loader bar + font readiness
    PreloadScene.ts        all atlases, maps, audio
    TitleScene.ts          FRLG-style title: "BUP ACCOUNTING presents", flame-flicker Charizard, PRESS START
    IntroScene.ts          professor speech (see §4.1)
    OverworldScene.ts      Level 1 map
    BattleScene.ts         the 3v3 boss battle
    GlitchScene.ts         Pokémon → GTA 2 transition
    CityScene.ts           Level 2
    BriefingScene.ts       "THE HARDEST LEVEL STARTS NOW"
  ui/                      TextBox, ChoiceMenu, HpBar, PartyMenu, GtaHud, GtaPager
  battle/                  types.ts, moves.ts, species.ts, damage.ts, ai.ts, BattleController.ts
  city/                    CarController.ts, Ped.ts, Cop.ts, CopDirector.ts, PseudoBuildings.ts
  input/                   keyboard + pointer + on-screen touch D-pad/A/B
public/assets/
  frlg/  gta2/  audio/  fonts/  maps/
reference/                 (git-ignored) images, STYLE_NOTES.md, SOURCES.md, _proof/
```

### 2.2 Rendering rules

- **Level 1 renders at native GBA resolution, 240×160**, scaled by an integer factor to fit the viewport (`Phaser.Scale.FIT` plus a CSS integer-scale snap, letterboxed). Never use fractional scaling for pixel art.
- **Level 2 renders at 640×480** (GTA 2's classic resolution), also integer-scaled when the viewport allows.
- `pixelArt: true`, `antialias: false`, `roundPixels: true`. All sprites sit on whole pixels.
- An optional CRT/LCD overlay (scanlines + slight vignette) can be toggled in a settings menu and is off by default on mobile.
- Mount Phaser only on the client. Destroy the game instance on unmount (React 19 strict mode mounts twice in dev, so guard against two canvases).

---

## 3. Controls

| Action | Keyboard | Mouse/touch |
|---|---|---|
| Move | Arrow keys / WASD | Click a walkable tile to walk there (A* pathfinding on the collision layer), or use the on-screen D-pad on mobile |
| A (confirm / talk / interact) | Z / Enter / Space | Tap the A button, or click the dialogue box |
| B (cancel / run when held) | X / Backspace / Shift | B button |
| Move a bush/tree | Face it and press A, **or click it** | Click it |
| Level 2: enter/exit car | Enter / F | Tap the car |
| Level 2: drive | ↑ accelerate, ↓ brake/reverse, ←/→ steer, Space handbrake | Virtual joystick + gas/brake buttons |

Show a one-time control hint at the start of each level, styled as an in-game sign (L1) or pager message (L2).

---

## 4. Level 1: the Pokémon world

### 4.1 Title and intro

- **Title screen** copies the FRLG title layout: logo area at the top ("BUP ACCOUNTING" set in a Pokémon-logo-style yellow/blue wordmark, drawn as pixel art, not the real logo), Charizard silhouette with an animated flame, "PRESS START" blinking at the FRLG rate, copyright line parody: "©2026 BUP ACCOUNTING / GAME FREAK-ISH".
- **Professor intro** follows the Prof. Oak speech beats: fade in, professor sprite (an original "PROF. LEDGER" sprite in FRLG style), then:
  - "Hello there! Welcome to the world of BUP ACCOUNTING!"
  - "This world is inhabited by creatures called POKéMON… and by people who file their taxes on time."
  - "First, what is your name?" → name entry in the FRLG keyboard grid (A–Z, max 7 chars, default "RED"). Store it; pre-fill the signup form with it later.
  - "Your very own legend is about to unfold! …Please keep your receipts."
  - The shrink-into-the-world animation, then cut to the overworld.

### 4.2 The map

A single Tiled map, about **40×30 tiles**, set in the FRLG Route 1 / Viridian Forest style:

- Spawn point in the south-west next to a small house (the player's "office"), with a signpost: "BUP ACCOUNTING HQ: Where every number has a home."
- Paths, ledges you can hop down (one-way, with the hop animation and shadow), tall grass patches (overlay covers the lower half of the sprite, rustle animation on step), fences, animated flowers, a pond with animated water tiles.
- **Two real hiding spots** and **six decoys**:
  - **Pikachu** behind a **cuttable small tree** in the middle-east area.
  - **Venusaur** behind a **large bush cluster** in the north-west, past a ledge, so the player has to take the long way around.
  - Decoys give jokes and small rewards: "Found a RECEIPT! It's from 2019.", "Found a CALCULATOR! It only does addition.", "A wild SPREADSHEET appeared! It fled.", "Found an OLD INVOICE! It's still unpaid.", "There's nothing here but a tax form… due yesterday.", "Found a POTION!" (actually usable in the boss battle).
- **Boss gate:** a guard NPC stands in a gap in a fence line to the north: "Only trainers with 3 POKéMON may challenge THE AUDITOR." The guard steps aside once the party has three.
- **Boss arena:** a small fenced clearing with the boss trainer, an original sprite called **"THE AUDITOR"** in a suit, with a rival-style theme.
- Optional NPCs: a lass ("Have you heard? BUPAF is the event of the year!"), a youngster ("My RATTATA is in the top 1% of RATTATA… for expense reports."), a sign that counts found Pokémon.

### 4.3 The follower

Charizard (the overworld sprite) follows one tile behind the player, HGSS-style. It moves into the tile the player just left, faces the same way, idles with the flame flicker, and plays a cry with a little hop when the player faces it and presses A ("CHARIZARD is looking at you happily."). Later only the lead party member follows; the player can reorder the party from the menu.

### 4.4 Moving obstacles and revealing Pokémon

When the player clicks an obstacle (or faces it and presses A):

1. If the player is more than 1 tile away, auto-walk to the nearest adjacent walkable tile and face the obstacle (A* path; cancel if the player presses a direction).
2. Dialogue: "This tree looks like it can be CUT! Would you like to use CUT?" → YES/NO. (For bushes: "The bush is rustling…" → "Push it aside?")
3. On YES: play the FRLG HM-use cut-in (the Pokémon's portrait sliding across a horizontal band. Charizard does it). Then:
   - **Tree:** the cut animation (tree splits, disappears in 4 frames).
   - **Bush:** the bush slides one tile in the push direction with a rustle (a Strength-boulder-style slide) and stays there as a new collision tile.
4. Reveal: the hidden Pokémon's overworld sprite pops out with the "!" emote bubble over the player. Then switch to a short **mini-encounter sequence**: the screen-flash + battle wipe, then a battle-screen vignette ("A wild PIKACHU appeared!"). Instead of fighting, show a one-turn choice: "PIKACHU wants to join BUP ACCOUNTING!" → the Poké Ball throw arc, 3 wobbles, the click, star particles: "Gotcha! PIKACHU was caught!" → "PIKACHU joined your team!"
5. Update the store, play the "item get" jingle, update the counter sign.

Decoy obstacles use the same interaction but end in a joke line.

Pikachu and Venusaur have to be found; the rest of the map is optional.

### 4.5 Party menu

Press Start / Enter or tap the menu button to open an FRLG-style start menu: POKéDEX (shows only the 6 relevant species with flavour text rewritten as accounting jokes), POKéMON (party screen exactly like FRLG: lead slot on the left, others stacked right, HP bars), BAG (receipts, calculator, potion), name card, SAVE (saves to `localStorage`), OPTION (text speed, sound, CRT), EXIT.

### 4.6 GATE L1

- [ ] Side-by-side of our overworld vs a Route 1 reference: tile scale, palette, sprite proportions, tree overlap and grass overlay all match.
- [ ] Walk cycle timing matches the reference clip frame for frame (16 frames per tile).
- [ ] Text box border, font, text speed and ▼ arrow match the FRLG reference.
- [ ] Click-to-reveal works for mouse, touch and keyboard.
- [ ] Follower never clips through walls and never ends up on the player's tile.

---

## 5. The boss battle (3v3)

### 5.1 Presentation

Copy the FRLG trainer battle:

1. The trainer approaches with the "!" bubble, then the dialogue: "THE AUDITOR: So you're the one who's been CUTTING corners. Let's see your books!"
2. Battle transition: the FRLG trainer-battle wipe (the black bars/swirl seen in the references) with the battle intro music sting.
3. Opening: the trainer back sprite slides in from the left, the opponent from the right, then the Poké Ball party indicators at the top. "THE AUDITOR would like to battle!" → "THE AUDITOR sent out CATERPIE!"
4. Send-out animation: the trainer throws, the ball opens with a white flash, the sprite scales up from the ball.
5. The UI copies FRLG exactly: enemy info box top-left (name, ♂/♀, Lv, HP bar), player info box bottom-right (name, Lv, HP bar, HP numbers, EXP bar), text box along the bottom, the FIGHT/BAG/POKéMON/RUN menu with the arrow cursor, the move menu with PP and TYPE in the right-hand box.
6. Battle background: the FRLG grass platform background.

Boss order is a deliberate joke: **Caterpie first** ("THE AUDITOR sent out CATERPIE! …Is that a joke?"), then **Bayleef**, then **Blastoise** as the ace, with the ace music switch to the final-Pokémon tension theme when Blastoise comes out and the line "THE AUDITOR: Time for the real audit."

### 5.2 Battle rules

A simplified **Gen 3 engine**. Each Pokémon has 4 moves.

| Side | Pokémon | Lv | Moves |
|---|---|---|---|
| Player | Charizard (Fire/Flying) | 50 | Flamethrower, Wing Attack, Slash, Dragon Claw |
| Player | Pikachu (Electric) | 48 | Thunderbolt, Quick Attack, Iron Tail, Thunder Wave |
| Player | Venusaur (Grass/Poison) | 49 | Razor Leaf, Sludge Bomb, Body Slam, Synthesis |
| Boss | Caterpie (Bug) | 12 | Tackle, String Shot |
| Boss | Bayleef (Grass) | 38 | Razor Leaf, Body Slam, Reflect, Synthesis |
| Boss | Blastoise (Water) | 50 | Surf, Bite, Skull Bash, Rain Dance |

- **Damage:** the Gen 3 formula `((2·L/5+2)·Power·A/D)/50+2`, then STAB ×1.5, type effectiveness (full Gen 3 chart for the 6 types involved), crit chance 1/16 at ×2, random factor 85–100 %. Use the species' real base stats (PokeAPI) with neutral natures, 31 IVs, 0 EVs.
- **Status:** paralysis (Thunder Wave), speed stat stages (String Shot), Reflect, Rain Dance (water ×1.5, fire ×0.5), Skull Bash two-turn charge. Nothing else.
- **Turn order:** priority (Quick Attack +1), then speed, ties broken randomly.
- **Messages** in exact FRLG wording and order: "CHARIZARD used FLAMETHROWER!", "It's super effective!", "It's not very effective…", "A critical hit!", "The foe's CATERPIE fainted!", "CHARIZARD gained 1234 EXP. Points!", level-up box with stat gains.
- **Switching:** FRLG party screen. When the boss sends the next Pokémon: "THE AUDITOR is about to use BAYLEEF. Will RED change POKéMON?" (Shift mode, as in FRLG).
- **BAG:** POTION (heal 20) and the "RECEIPT" (useless: "It's not the time to use that.").
- **RUN:** "No! There's no running from a trainer battle!"

### 5.3 Boss AI and difficulty

- Picks the highest expected-damage move 70 % of the time and a random move 30 %. Blastoise uses Rain Dance on its first turn if a Fire type is out.
- **Nobody should get stuck.** The signup comes after this fight, so:
  - If the player loses, the screen whites out ("RED is out of usable POKéMON! RED whited out!"), Prof. Ledger appears: "Don't worry, even the best accountants make mistakes." The party is fully healed and the rematch boss has −25 % HP per loss.
  - After 2 losses, offer "Let PIKACHU handle it?" which grants a one-time guaranteed critical hit sequence.
- Victory: "Player defeated THE AUDITOR!", prize money "RED got ₽5,000 for winning! (Taxable.)", the boss's defeat line: "Your books… are flawless. But this world was never the real test…" That line leads straight into §6.

### 5.4 Animations

Each move gets an animation copied from the FRLG attack-effect references (Spriters Resource "Attack Effects"): Flamethrower fire stream, Thunderbolt bolts with screen flash, Razor Leaf leaves, Surf wave sweeping across the screen, and so on. Also the hit shake/blink on the target, the HP bar drain at FRLG speed, the faint drop with the cry played at low pitch, and screen shake on crits.

### 5.5 GATE BATTLE

- [ ] Pixel-position overlay of our battle screen vs the FRLG reference: every UI element within 1 px.
- [ ] HP bar colours sampled and matched to the reference hex values.
- [ ] Unit tests: damage formula against 5 hand-calculated cases, type chart, turn order, Skull Bash charging, Rain Dance modifiers, rubber-band rematch.
- [ ] A full battle can be won by keyboard only and by touch only.

---

## 6. The transition: Pokémon → GTA 2

This is the biggest moment of the game, so give it time.

1. After the Auditor's last line, the overworld music slows down and pitch-drops to a stop (Web Audio playback-rate ramp).
2. The FRLG palette starts glitching: random tile corruption (swap tiles for wrong tile indices, the "MissingNo" look), horizontal scanline tearing, colour-channel split. Use Phaser 4 filters or a custom shader.
3. A fake GBA error box appears: "An error has occurred. BUP ACCOUNTING has encountered a TWIST." Text glitches.
4. Hard cut to black. The GTA 2 boot-up sound, then a GTA 2 front-end menu parody: "GRAND THEFT AUDIT 2", the red-and-yellow GTA 2 style logo drawn as original art, district select "DOWNTOWN → BUP CITY".
5. The camera drops from max zoom-out onto the player character standing on a pavement, with the GTA 2 opening pager beep.

---

## 7. Level 2: the GTA 2 city

### 7.1 The look (match the references)

- **Top-down camera with pseudo-3D buildings.** This is what makes GTA 2 recognisable. Buildings are blocks with a **roof tile** and **four wall faces**. The roof is drawn offset from the base, away from the screen centre, proportional to building height × distance from the camera centre. Wall faces are quads between the base outline and the offset roof outline, so as you drive past, buildings visibly lean outward. Implement this in `PseudoBuildings.ts` with a custom Phaser mesh/quad per face, or a WebGL pipeline. Do a quick prototype first and compare it against the zoom references before building the whole city.
- **Speed-based zoom:** the camera zooms out smoothly as car speed goes up (GTA 2 behaviour), measured against the reference.
- **City layout:** a ~64×64 block grid. Roads with lane markings, pavements, kerbs, zebra crossings, a park, a car park, a BUP ACCOUNTING office tower with a rooftop sign, billboards with jokes ("Taxes. Do them." / "BUPAF: Be there or be audited").
- **Palette:** the GTA 2 Downtown district palette sampled from screenshots (cool greys, neon accents, warm sodium-lamp tints).

### 7.2 Player on foot and the car

- The player starts on foot (a top-down ped sprite in a suit, with walk/run cycles).
- A parked car sits nearby with an arrow pointing at it (GTA 2 style). Press Enter / tap the car: the player walks to the driver door, the door-open frame plays, the player gets in.
- **Car handling** (`CarController.ts`): arcade top-down physics. Velocity split into forward and lateral components, lateral friction for grip, a handbrake that lowers lateral friction to allow slides, max speed, reverse, and collision bounce with damage. Tune it against GTA 2 longplay clips: it should feel slightly floaty and slidey.
- Car damage states: dents → smoke → fire → explosion after 5 s on fire. If the car explodes, the player is thrown out and has to steal another car. Spare cars are parked around the city and driven by AI traffic; the player can pull a driver out.

### 7.3 Pedestrians

- ~60 peds active, spawned just off screen around the camera, culled far away (object pool).
- They walk along pavements on a simple waypoint graph, cross at zebra crossings, and scatter in panic when a car speeds near them or after a hit nearby.
- Getting hit plays a short knock-back, a flattened sprite, a small cartoon splat, and the GTA 2 hit sound.
- Every hit gives points with the GTA 2 multiplier system; show the score top-right in GTA 2 style.
- **Kill counter:** "VICTIMS: 7/20" in GTA 2 HUD style. When it reaches 20, flash "FRENZY COMPLETE!" in large gold letters, like GTA 2's kill-frenzy messages.
- Peds are accountant/office-worker themed: carrying briefcases, some drop "receipts" that flutter away.

### 7.4 Police: 5 officers chasing

- The wanted level (cop heads at the top of the screen) rises with hits: 1 head at 3 victims, scaling to the maximum around 12. The objective needs **5 police officers actively chasing**. Show "COPS ON YOUR TAIL: 5" when they're all deployed.
- `CopDirector.ts` keeps up to 5 cops: a mix of **police cars** (siren light-bar animation, ram you, try to box you in) and **officers on foot** (run at you, try to pull you out of the car if you stop for more than 2 s).
- Chase AI: steer toward a predicted intercept point; avoid buildings with a few raycasts ("whiskers"); respawn off screen if stuck or too far away.
- **BUSTED:** if a cop pulls you out, show "BUSTED" in GTA 2 style, keep your victim count but lose 25 % of the score, and respawn at a nearby spot. No permanent fail state.
- **WASTED** if the car explodes with you in it: same respawn rule.
- Cop radio chatter samples from the GTA 2 sound pack play during the chase.

### 7.5 Win condition

The level ends when **victims ≥ 20 and 5 cops have been on your tail at the same time at least once**. Then a GTA 2 pager message: "GOOD WORK. NOW GET TO THE BUP ACCOUNTING HQ." A big yellow arrow points to the office tower. Drive into the marked spot to trigger §8. (Optional: keep it lighter by skipping the drive and ending on the frenzy message.)

### 7.6 HUD (copy the GTA 2 references)

Top-right: score with multiplier ("×4"). Top-centre: wanted-level cop heads. Top-left: pager with scrolling message text. Bottom-left: lives/armour. Centre: big gold message text for events ("FRENZY!", "BUSTED", "WASTED"). Use the GTA 2 bitmap font rebuilt from the Spriters Resource sheet.

### 7.7 GATE L2

- [ ] Side-by-side of a street scene vs the GTA 2 reference at the same zoom: building lean, kerb widths, car/ped scale and HUD placement all match.
- [ ] A recorded drive past a tall building shows the walls leaning outward like in the reference clip.
- [ ] Zoom-with-speed curve compared against a longplay clip.
- [ ] 60 fps on a mid-range laptop with 60 peds + 5 cops + traffic (check with the Phaser FPS meter and the Chrome Performance panel).
- [ ] Unit tests: chase intercept maths, ped pooling, win-condition logic.

---

## 8. Level 3: "THE HARDEST LEVEL STARTS NOW"

### 8.1 Briefing

Copy the GTA 2 mission-briefing screen: black background, a portrait on the left (the GTA 2 "Dialogue Portraits" style, drawn as an original Bup boss character), typewriter text in GTA 2 font with the pager beep per line:

> "You did good, kid. Pokémon. Cars. Cops. Child's play."
> "But now…"

Then the screen shakes, the text clears, and it slams in, centred, huge, gold:

> **THE HARDEST LEVEL STARTS NOW.**
> **REGISTER FOR BUPAF.**

### 8.2 The form

A real HTML form (React), layered over the canvas, styled as a mix of both games: a GTA 2-style frame containing an FRLG-style text-box form. It must still be fully accessible.

- Fields: **Name** (pre-filled with the in-game name if it isn't "RED"), **Email**, **Company / Organisation**, **Role**, **Dietary requirements** (optional), **"How many pedestrians did you run over?"** (pre-filled read-only with their real count, a fun stat for the event), consent checkbox.
- Labels styled like the FRLG name-entry screen; the submit button reads "SAVE THE GAME?" → YES.
- On success: the FRLG save sequence ("SAVING… DON'T TURN OFF THE POWER." → "RED saved the game."), then a final screen: "YOU'RE REGISTERED FOR BUPAF. See you there, trainer." with the event date/location, an add-to-calendar `.ics` link, and a "Play again" button.
- Validation errors show as Pokémon text: "It's not very effective… (please enter a valid email)".

### 8.3 Backend

`app/register/actions.ts` is a server action: `zod` validation, honeypot field + time-to-submit check against bots, a basic per-IP rate limit, then persistence. **Where registrations go is still open (see §13).** Write it behind a small `RegistrationSink` interface so the destination can be swapped: Postgres/Supabase, Google Sheets, Airtable, a webhook (Zapier/Make), or email via Resend.

### 8.4 Skip path (required)

Some people just want to register. Add a small, always-visible "Skip to registration →" link in the page corner (keyboard reachable) that jumps straight to §8. The game is the fun way in, but nobody should have to finish it to sign up.

---

## 9. Audio

- **Level 1:** chiptune tracks in the FRLG style: title, route theme, "wild Pokémon appeared" sting, trainer battle, final-Pokémon tension, victory fanfare, item-get jingle, catch jingle. **Don't ship ripped Nintendo music.** Commission or compose originals in the GBA style (e.g. in FamiStudio/Furnace with a GBA-like instrument set) that hit the same tempo, structure and instrumentation; use the references only for reference.
- **Level 2:** GTA 2 radio parody stations, switched by pressing R in the car: "BUP FM" (synthwave), "KRUD 99.9: Talk Radio for Auditors" (fake ads: "Tired of your books? Burn them. Legally. Consult your accountant."). Original tracks only.
- SFX: cries from PokeAPI, UI blips, bump-into-wall, ledge hop, cut, Poké Ball; GTA 2 engines, sirens, horns, hits, explosion.
- Global mute button, volume in OPTION, autoplay unlock on first user input (browser autoplay policies).

---

## 10. Accessibility, devices, performance

- Works on desktop (keyboard + mouse) and mobile (touch controls, landscape prompt in portrait mode).
- `prefers-reduced-motion`: turn off screen shake, glitch strobing and flashes. **The glitch transition has flashing and must not exceed 3 flashes per second (WCAG 2.3.1).** Add a photosensitivity notice on the title screen.
- All text in the game can also be read by screen readers through an ARIA live region mirroring the dialogue box. The registration form is regular semantic HTML.
- Asset budget: < 6 MB first load. Pack sprites into texture atlases (TexturePacker or `free-tex-packer-cli`), audio as `.ogg` + `.m4a` fallback, lazy-load Level 2 assets during Level 1 battle.
- 60 fps target; object pooling for peds/particles; avoid per-frame allocations in update loops.

---

## 11. Build order (milestones)

| # | Milestone | Done when |
|---|---|---|
| M0 | Reference library + STYLE_NOTES.md + SOURCES.md | ≥40 images, measurements written, colours sampled |
| M1 | Next + Phaser scaffold, integer scaling, input layer, store, skip link + bare form | Blank scenes switch in order; form submits to a stub sink |
| M2 | Overworld: tilemap, movement, collision, ledges, grass, text box, follower | **GATE L1** (visual parts) |
| M3 | Obstacles, reveal + catch sequence, decoys, party menu, boss gate | **GATE L1** complete |
| M4 | Battle engine (logic + tests), then battle UI, then animations | **GATE BATTLE** |
| M5 | Glitch transition + GTA 2 front-end parody | Recorded and reviewed against §6 + the flash limit |
| M6 | City: pseudo-3D buildings prototype → full map, car physics, on foot | Building-lean comparison passes |
| M7 | Peds, cops, HUD, win condition | **GATE L2** |
| M8 | Briefing, styled form, server action, real sink, success screen | Real registration lands in the chosen destination |
| M9 | Audio, polish, accessibility, mobile, performance | Playwright run-through passes on desktop Chrome, Firefox, Safari and mobile viewports |
| M10 | Final review | Complete side-by-side gallery in `reference/_proof/`; playtest with 3 people |

Debug helpers (dev only): `?level=1|battle|2|3` to jump to a level, `?god=1` for one-hit kills, `F1` to show collision layers and AI debug lines.

---

## 12. Legal / IP note (decide before launch)

Pokémon sprites, cries, fonts and GTA 2 assets belong to Nintendo/Game Freak/The Pokémon Company and Rockstar/Take-Two. Using ripped assets on a public, branded event page is a real takedown risk, and Nintendo actively enforces against fan games. Two options:

- **A: ripped assets** (fastest, most accurate). Fine for a private or internal page; risky for a public marketing page.
- **B: original "in the style of" assets** (recommended for public launch): use the references only to match proportions, palettes and animation timing, and draw original sprites. Keep species names out of it too, or use parody names (e.g. "CHARBLAZE", "PIKAVOLT").

Structure the asset loader so every sprite/sound path comes from one `assets.manifest.ts`, which makes switching from A to B a matter of swapping files.

---

## 13. Open questions for the Bup team

1. Where should registrations be stored (Sheets, Airtable, DB, CRM, email)?
2. Event details for the final screen and `.ics`: date, time, venue, URL.
3. Which form fields do you actually need?
4. Asset route A (ripped) or B (original look-alikes)? (§12)
5. Is the page public or invite-only?
6. Brand assets: Bup logo/colours to hide in the game (office tower sign, billboards, Poké Ball recolour)?
7. Is the "run over pedestrians" mechanic OK for the audience? A softer variant swaps peds for walking "tax forms" or "unpaid invoices" with the same mechanic.
