# BUP ACCOUNTING

The signup adventure specified in `PLAN.md`. The M3 exploration loop is playable, including captures, optional rewards, party management and the northern gate. Visual gate progress and later milestones are in `docs/STATUS.md`.

## Run locally

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Press A through the title and professor intro, then choose or enter a name to enter the town. A saved game adds CONTINUE to the title menu. Move with arrows/WASD, hold X/Shift or B to run, and use Z/Space/A to talk. Enter or START opens the menu; X/B backs out. Click a path to walk there, or use the touch D-pad. Click a sign to walk up to it. B closes dialogue. The Fullscreen control expands the canvas and game controls; Escape exits. Unsupported browsers use a clearly labelled full viewport mode.

Movement keys activate the game when the page or game controls have focus. You do not need to click the canvas first. X or B closes an open dialogue box before moving. Form fields and header links keep their normal keyboard behaviour.

Development shortcuts: `?level=1`, `?level=battle`, `?level=2`, `?level=3`. F1 on the focused game shows collision tiles. The Auditor challenge ends at an explicit M4 boundary with a return to town. City and briefing remain development previews. Confirm in the town interacts with its contents and does not advance into those scenes.

The always-available skip link and direct `/#registration` open the form. The development sink discards personal data and returns a test receipt. It does not register anyone for BUPAF. Production submission stays disabled until a real destination is connected in M8.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Playwright requires Chromium installed with `pnpm exec playwright install chromium`. It checks desktop and mobile touch viewports, including the real browser Fullscreen API. Evidence is saved under `reference/_proof/`.

In the current execution environment Turbopack's CSS worker cannot bind its IPC port. `pnpm build --webpack` produces the verified production build without that worker. The normal `pnpm build` command remains available for environments where Turbopack works.

For the production guard check, start `pnpm start --hostname 127.0.0.1 --port 3001`, then run `node scripts/check_production.mjs`.

## Assets and references

M3 uses the plan's native asset route for this private local preview. [docs/ASSETS.md](docs/ASSETS.md) records the decision, sources, transformations and limitations. All runtime paths live in `src/game/assets.manifest.ts`. The ignored reference library stays outside `public/` and Phaser never loads it.

```sh
python -I scripts/build_overworld_assets.py
python -I scripts/build_m3_assets.py
python -I scripts/review_m2_evidence.py
```

The first two scripts rebuild prepared assets and the Tiled map from local native sources. The third encodes M2 browser recordings and produces 4× comparisons. M3 screenshots and its review are under `reference/_proof/m3-*`. The strict visual comparison gate remains open; the battle engine and later milestones are not implemented.

## M3 controls and progress

Inspect a small tree or bush with A, or click/tap it to walk over. YES cuts or pushes it; NO leaves it alone. Two spots reveal Pikachu and Venusaur. In their encounter, choose BAG to throw a Poké Ball and recruit them. Six optional spots contain accounting jokes and items.

START opens POKéDEX, POKéMON, BAG, trainer card, SAVE and OPTION. In POKéMON, choose SWITCH and a destination to change party order and the follower. SAVE stores progress in this browser. CONTINUE restores party order, bag, opened obstacles and the guard. The guard admits a party of three; the actual boss battle belongs to M4.
