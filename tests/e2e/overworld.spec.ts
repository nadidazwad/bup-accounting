import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const proof = "reference/_proof";
async function openWorld(page: Page) {
  await page.goto("/?level=1");
  await expect(page.locator("canvas")).toHaveAttribute("data-player", "9,24");
  for (let i = 0; i < 30 && await page.locator('.sr-only[role="status"]').textContent(); i++) await page.getByRole("button", { name: "A: confirm or talk" }).click();
  await expect(page.locator('.sr-only[role="status"]')).toHaveText("");
  await expect(page.locator("canvas")).toHaveAttribute("data-locked", "false");
}
async function step(page: Page, key: string, tile: string) {
  await page.locator("canvas").focus(); await page.keyboard.press(key);
  await expect(page.locator("canvas")).toHaveAttribute("data-player", tile);
  await expect(page.locator("canvas")).toHaveAttribute("data-moving", "false");
}
async function clickTile(page: Page, x: number, y: number) {
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  const data = await canvas.evaluate(e => ({ x: Number((e as HTMLElement).dataset.cameraX), y: Number((e as HTMLElement).dataset.cameraY) }));
  const factor = box.width / 240;
  await page.mouse.click(box.x + (x * 16 + 8 - data.x) * factor, box.y + (y * 16 + 8 - data.y) * factor);
}
test("grass covers feet without hiding the body or following it onto the path, and flowers animate cleanly", async ({ page }, info) => {
  await openWorld(page);
  const canvas = page.locator("canvas");
  const moveTo = async (x: number, y: number) => {
    await clickTile(page, x, y);
    await expect(canvas).toHaveAttribute("data-player", `${x},${y}`);
    await expect(canvas).toHaveAttribute("data-moving", "false");
  };
  const saveNative = async (name: string) => {
    const png = await canvas.evaluate(e => (e as HTMLCanvasElement).toDataURL().split(",")[1]);
    await writeFile(`${proof}/m2-foliage-${name}-${info.project.name}.png`, Buffer.from(png, "base64"));
  };
  await mkdir(proof, { recursive: true });
  await moveTo(9, 20);
  const flowers = [];
  for (let i = 0; i < 12 && new Set(flowers.map(f => JSON.stringify(f.plant))).size < 5; i++) {
    flowers.push(await canvas.evaluate(async e => {
      const c = e as HTMLCanvasElement, view = document.createElement("canvas"); view.width = 240; view.height = 160;
      const ctx = view.getContext("2d")!; ctx.drawImage(c, 0, 0);
      const image = new Image(); image.src = "/assets/frlg/town-tiles.png"; await image.decode();
      const ground = document.createElement("canvas"); ground.width = ground.height = 16;
      const g = ground.getContext("2d")!; g.drawImage(image, 662 % 16 * 16, Math.floor(662 / 16) * 16, 16, 16, 0, 0, 16, 16);
      const x = 10 * 16 - Number(c.dataset.cameraX), y = 21 * 16 - Number(c.dataset.cameraY);
      const plant = Array.from(ctx.getImageData(x, y, 16, 16).data), dirt = g.getImageData(0, 0, 16, 16).data;
      const background = [[2, 10], [3, 11], [6, 12], [5, 13], [7, 13], [13, 13], [6, 14], [12, 14]];
      return { plant, correctGround: background.every(([px, py]) => {
        const p = (py * 16 + px) * 4;
        return plant.slice(p, p + 4).every((v, i) => v === dirt[p + i]);
      }) };
    }));
    await page.waitForTimeout(280);
  }
  expect(flowers.every(f => f.correctGround)).toBe(true);
  expect(new Set(flowers.map(f => JSON.stringify(f.plant))).size).toBe(5);
  await saveNative("flowers");
  await moveTo(9, 16);
  await step(page, "ArrowUp", "9,15"); await step(page, "ArrowUp", "9,14");
  await expect(canvas).toHaveAttribute("data-follower", "9,15");
  await page.waitForTimeout(950);
  const inspectBody = async (x: number, y: number, frame: number, inGrass: boolean) => canvas.evaluate(async (e, args) => {
    const c = e as HTMLCanvasElement, view = document.createElement("canvas"); view.width = 240; view.height = 160;
    const ctx = view.getContext("2d")!; ctx.drawImage(c, 0, 0);
    const player = new Image(), blades = new Image();
    player.src = "/assets/frlg/player.png"; blades.src = "/assets/frlg/grass-effect.png";
    await Promise.all([player.decode(), blades.decode()]);
    const p = document.createElement("canvas"); p.width = 16; p.height = 32;
    const pc = p.getContext("2d")!; pc.drawImage(player, args.frame * 16, 0, 16, 32, 0, 0, 16, 32);
    const b = document.createElement("canvas"); b.width = b.height = 16;
    const bc = b.getContext("2d")!; bc.drawImage(blades, 0, 0, 16, 16, 0, 0, 16, 16);
    const actor = pc.getImageData(0, 0, 16, 32).data, grass = bc.getImageData(0, 0, 16, 16).data;
    const rendered = ctx.getImageData(args.x * 16 - Number(c.dataset.cameraX), (args.y - 1) * 16 - Number(c.dataset.cameraY), 16, 32).data;
    let visibleBodyPixels = 0, coveredFootPixels = 0, wrongPixels = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
      const p = (y * 16 + x) * 4, g = ((y - 16) * 16 + x) * 4;
      if (actor[p + 3] !== 255) continue;
      const covered = args.inGrass && y >= 16 && grass[g + 3] === 255;
      const expected = covered ? grass.slice(g, g + 4) : actor.slice(p, p + 4);
      if (covered) coveredFootPixels++; else visibleBodyPixels++;
      if (expected.some((v, i) => v !== rendered[p + i])) wrongPixels++;
    }
    return { visibleBodyPixels, coveredFootPixels, wrongPixels };
  }, { x, y, frame, inGrass });
  const inside = await inspectBody(9, 14, 1, true);
  expect(inside.visibleBodyPixels).toBeGreaterThan(100);
  expect(inside.coveredFootPixels).toBeGreaterThan(5);
  expect(inside.wrongPixels).toBe(0);
  await saveNative("grass");
  await step(page, "ArrowLeft", "8,14");
  await step(page, "Shift+ArrowLeft", "7,14");
  await step(page, "ArrowDown", "7,15"); await step(page, "ArrowDown", "7,16");
  await page.waitForTimeout(950);
  const outside = await inspectBody(7, 16, 0, false);
  expect(outside.coveredFootPixels).toBe(0); expect(outside.wrongPixels).toBe(0);
  await saveNative("grass-exit");
  await writeFile(`${proof}/m2-foliage-${info.project.name}.json`, JSON.stringify({ inside, outside, flowerFrames: new Set(flowers.map(f => JSON.stringify(f.plant))).size, flowerGroundPreserved: flowers.every(f => f.correctGround) }, null, 2));
});
test("tall trees overlap in depth order, scenery inherits the path, and the pond bank stays fixed", async ({ page }, info) => {
  await openWorld(page);
  const canvas = page.locator("canvas");
  const moveTo = async (x: number, y: number) => {
    await clickTile(page, x, y);
    await expect(canvas).toHaveAttribute("data-player", `${x},${y}`);
    await expect(canvas).toHaveAttribute("data-moving", "false");
  };
  const saveNative = async (name: string) => {
    const png = await canvas.evaluate(e => (e as HTMLCanvasElement).toDataURL().split(",")[1]);
    await writeFile(`${proof}/m2-scenery-${name}-${info.project.name}.png`, Buffer.from(png, "base64"));
  };
  await mkdir(proof, { recursive: true });
  await moveTo(9, 20);
  const scenery = await canvas.evaluate(async e => {
    const c = e as HTMLCanvasElement;
    const view = document.createElement("canvas"); view.width = 240; view.height = 160;
    const ctx = view.getContext("2d")!; ctx.drawImage(c, 0, 0);
    const pixels = ctx.getImageData(0, 0, 240, 160).data;
    const cameraX = Number(c.dataset.cameraX), cameraY = Number(c.dataset.cameraY);
    const at = (x: number, y: number) => {
      const p = ((y - cameraY) * 240 + x - cameraX) * 4;
      return Array.from(pixels.slice(p, p + 4));
    };
    const tree = new Image(); tree.src = "/assets/frlg/tree.png"; await tree.decode();
    const sprite = document.createElement("canvas"); sprite.width = tree.width; sprite.height = tree.height;
    const s = sprite.getContext("2d")!; s.drawImage(tree, 0, 0);
    const art = s.getImageData(0, 0, tree.width, tree.height).data;
    let overlapSamples = 0, incorrectFrontPixels = 0;
    // The nearer grove tree overlaps the lower half of the tree behind it.
    // Compare only opaque pixels where the two pieces of art differ.
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const front = (y * 32 + x) * 4, back = ((y + 32) * 32 + x) * 4;
      if (art[front + 3] !== 255 || art[back + 3] !== 255) continue;
      if (art.slice(front, front + 3).every((v, i) => v === art[back + i])) continue;
      overlapSamples++;
      if (at(12 * 16 + x, 18 * 16 + y).some((v, i) => v !== art[front + i])) incorrectFrontPixels++;
    }
    return { treeSize: [tree.width, tree.height], overlapSamples, incorrectFrontPixels,
      signCorner: at(11 * 16, 24 * 16), bushCorner: at(14 * 16, 23 * 16) };
  });
  expect(scenery.treeSize).toEqual([32, 64]);
  expect(scenery.overlapSamples).toBeGreaterThan(50);
  expect(scenery.incorrectFrontPixels).toBe(0);
  expect(scenery.signCorner).toEqual([184, 232, 208, 255]);
  expect(scenery.bushCorner).toEqual([184, 232, 208, 255]);
  await writeFile(`${proof}/m2-scenery-depth-${info.project.name}.json`, JSON.stringify(scenery, null, 2));
  await saveNative("house-trees");
  await page.screenshot({ path: `${proof}/m2-scenery-preview-${info.project.name}.png`, fullPage: true });
  await canvas.press("ArrowLeft"); await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute("data-player", "9,20");
  for (const x of [14, 18, 23, 28, 29]) await moveTo(x, 24);
  await saveNative("pond");
  // Sample the actual rendered pool across its animation. Shore pixels must
  // remain fixed; only the blue surface should move, with no land fragments.
  const frames: number[][] = [];
  for (let i = 0; i < 8; i++) {
    frames.push(await canvas.evaluate(e => {
      const c = e as HTMLCanvasElement;
      const crop = document.createElement("canvas"); crop.width = 112; crop.height = 64;
      const ctx = crop.getContext("2d")!;
      ctx.drawImage(c, 26 * 16 - Number(c.dataset.cameraX), 20 * 16 - Number(c.dataset.cameraY), 112, 64, 0, 0, 112, 64);
      return Array.from(ctx.getImageData(0, 0, 112, 64).data);
    }));
    await page.waitForTimeout(280);
  }
  let changedSurface = 0, shorePixels = 0;
  for (let p = 0; p < frames[0].length; p += 4) {
    // M3's wandering lass can overlap the southwest bank with her sprite.
    // Compare the unobscured shoreline, not pixels occupied by an animated NPC.
    const pixel = p / 4;
    if (pixel % 112 < 32 && Math.floor(pixel / 112) >= 32) continue;
    const blue = frames[0][p + 2] > frames[0][p + 1] && frames[0][p + 1] > frames[0][p];
    if (blue) {
      if (frames.some(f => f.slice(p, p + 3).some((v, i) => v !== frames[0][p + i]))) changedSurface++;
      expect(frames.every(f => f[p + 2] > f[p + 1] && f[p + 1] > f[p])).toBe(true);
    } else {
      shorePixels++;
      expect(frames.every(f => f.slice(p, p + 4).every((v, i) => v === frames[0][p + i]))).toBe(true);
    }
  }
  expect(changedSurface).toBeGreaterThan(1000);
  expect(shorePixels).toBeGreaterThan(500);
  await canvas.press("ArrowUp"); await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute("data-player", "29,24");
});
test("movement keys activate the game from page focus and console controls", async ({ page }, info) => {
  await openWorld(page);
  const canvas = page.locator("canvas");
  // No canvas.focus(): reproduce loading the game then using a keyboard directly.
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
  await page.keyboard.press("ArrowUp");
  await expect(canvas).toHaveAttribute("data-player", "9,23");
  await expect(canvas).toBeFocused();
  await mkdir(proof, { recursive: true });
  await page.screenshot({ path: `${proof}/m2-keyboard-focus-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "CRT off", exact: true }).focus();
  await page.keyboard.press("w");
  await expect(canvas).toHaveAttribute("data-player", "9,22");
  await expect(canvas).toHaveAttribute("data-moving", "false");
  await page.getByRole("button", { name: "CRT off", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "CRT on", exact: true })).toBeFocused();
  await expect(canvas).toHaveAttribute("data-player", "9,22");
  // Header links keep their own keyboard behaviour, outside the console.
  await page.getByRole("link", { name: "Skip to registration" }).focus();
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(350);
  await expect(canvas).toHaveAttribute("data-player", "9,22");
  await page.keyboard.press("Enter");
  await page.getByLabel("Name", { exact: true }).fill("Walk tester");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Walk tester");
  await expect(page.locator("canvas")).toHaveCount(0);
});
test("keyboard walking, reversals, follower interaction and wall collision", async ({ page }) => {
  await openWorld(page);
  await page.locator("canvas").press("z");
  await expect(page.locator('.sr-only[role="status"]')).toContainText("CHARIZARD is looking");
  for (let i = 0; i < 12 && await page.locator('.sr-only[role="status"]').textContent(); i++) await page.getByRole("button", { name: "A: confirm or talk" }).click();
  await step(page, "ArrowUp", "9,23"); await expect(page.locator("canvas")).toHaveAttribute("data-follower", "9,24");
  await step(page, "ArrowDown", "9,24"); await expect(page.locator("canvas")).toHaveAttribute("data-follower", "9,23");
  await step(page, "ArrowRight", "10,24");
  await page.locator("canvas").press("ArrowRight"); await page.waitForTimeout(400);
  await expect(page.locator("canvas")).toHaveAttribute("data-player", "10,24");
  await page.locator("canvas").press("z");
  await expect(page.locator('.sr-only[role="status"]')).toContainText("BUP ACCOUNTING HQ");
});
test("mouse paths, touch steps and registration focus", async ({ page }, info) => {
  await openWorld(page);
  await clickTile(page, 9, 20);
  await expect(page.locator("canvas")).toHaveAttribute("data-player", "9,20");
  await expect(page.locator("canvas")).toHaveAttribute("data-follower", "9,21");
  const down = page.getByRole("button", { name: "Move right", exact: true });
  if (info.project.name === "mobile") await down.tap(); else await down.click();
  await expect(page.locator("canvas")).toHaveAttribute("data-player", "10,20");
  await page.getByRole("link", { name: "Skip to registration" }).click();
  await expect(page.getByRole("heading", { name: "Register for BUPAF." })).toBeFocused();
  await page.getByLabel("Name", { exact: true }).fill("Arrow User"); await page.keyboard.press("ArrowLeft");
  await expect(page.locator("canvas")).toHaveCount(0);
});
test("native fullscreen actually enters, resizes at integer scale and exits with focus restoration", async ({ page }, info) => {
  await openWorld(page);
  const button = page.getByRole("button", { name: "Fullscreen", exact: true });
  await button.focus(); await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains("game-console"))).toBe(true);
  await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move up" })).toBeVisible();
  await mkdir(proof, { recursive: true });
  await page.screenshot({ path: `${proof}/m2-${info.project.name}-fullscreen.png` });
  const details = await page.evaluate(() => {
    const c = document.querySelector("canvas")!; const rect = c.getBoundingClientRect();
    return { nativeFullscreen: !!document.fullscreenElement, nativeWidth: c.width, nativeHeight: c.height, scale: rect.width / c.width, deviceScale: rect.width / c.width * devicePixelRatio, viewport: [innerWidth, innerHeight], documentWidth: document.documentElement.scrollWidth };
  });
  expect(Math.abs(details.deviceScale - Math.round(details.deviceScale))).toBeLessThan(0.001); expect(details.documentWidth).toBeLessThanOrEqual(details.viewport[0]);
  await writeFile(`${proof}/m2-${info.project.name}-fullscreen.json`, JSON.stringify(details, null, 2));
  await page.locator(".game-console").getByRole("button", { name: "Sound on", exact: true }).click();
  await expect(page.locator(".game-console").getByRole("button", { name: "Sound off", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await expect(button).toBeFocused();
  await button.click(); await expect(page.getByRole("button", { name: "Exit fullscreen" })).toBeVisible();
  await page.getByRole("button", { name: "Exit fullscreen" }).click(); await expect(button).toBeFocused();
});
test("full viewport fallback, orientation resize, Escape and skip from expanded mode", async ({ page }, info) => {
  await page.addInitScript(() => Object.defineProperty(document, "fullscreenEnabled", { get: () => false }));
  await openWorld(page);
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.locator(".game-console")).toHaveAttribute("data-fullscreen", "viewport");
  await expect(page.getByRole("status").filter({ hasText: "Full viewport mode" })).toBeVisible();
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const canvas = page.locator("canvas");
    await expect.poll(() => canvas.evaluate(c => Math.abs(c.getBoundingClientRect().width / (c as HTMLCanvasElement).width * devicePixelRatio - Math.round(c.getBoundingClientRect().width / (c as HTMLCanvasElement).width * devicePixelRatio)) < 0.001)).toBe(true);
    for (const name of ["Exit full viewport", "Move up", "Move down", "B: cancel, or hold to run", "A: confirm or talk"]) {
      const box = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: `${proof}/m2-${info.project.name}-fallback.png` });
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "Fullscreen", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.locator('.game-console .skip-link').click();
  await expect(page.getByRole("heading", { name: "Register for BUPAF." })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});
test("fullscreen errors recover into usable viewport mode", async ({ page }) => {
  await page.addInitScript(() => { HTMLElement.prototype.requestFullscreen = () => Promise.reject(new Error("Test denied")); });
  await openWorld(page); await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Exit full viewport" })).toBeVisible();
  await page.getByRole("button", { name: "Exit full viewport" }).click();
  await expect(page.getByRole("button", { name: "Fullscreen", exact: true })).toBeFocused();
});

test("native timing captures, grass, canopy overlap and one-way ledge traversal", async ({ page }, info) => {
  test.setTimeout(90000);
  test.skip(info.project.name !== "chromium", "The native evidence capture uses desktop keyboard; touch is checked separately.");
  await openWorld(page);
  const canvas = page.locator("canvas");
  const saveNative = async (name: string) => {
    const data = await canvas.evaluate(e => (e as HTMLCanvasElement).toDataURL().split(",")[1]);
    await writeFile(`${proof}/m2-${name}-native.png`, Buffer.from(data, "base64"));
  };
  await saveNative("idle");
  await page.screenshot({ path: `${proof}/m2-final-preview.png`, fullPage: true });
  // Read native canvas frames at rAF times while ordinary input runs.
  const record = (duration: number) => page.evaluate(ms => new Promise<{ time: number; png: string; x: string | undefined; y: string | undefined; hop: string | undefined }[]>(resolve => {
    const frames: { time: number; png: string; x: string | undefined; y: string | undefined; hop: string | undefined }[] = [];
    const canvas = document.querySelector("canvas")!; const start = performance.now();
    const frame = (time: number) => {
      frames.push({ time: time - start, png: canvas.toDataURL().split(",")[1], x: canvas.dataset.worldX, y: canvas.dataset.worldY, hop: canvas.dataset.hop });
      if (time - start < ms) requestAnimationFrame(frame); else resolve(frames);
    };
    requestAnimationFrame(frame);
  }), duration);
  const saveFrames = async (name: string, frames: Awaited<ReturnType<typeof record>>) => {
    await mkdir(`${proof}/m2-${name}-frames`, { recursive: true });
    for (let i = 0; i < frames.length; i++) await writeFile(`${proof}/m2-${name}-frames/${String(i).padStart(4, "0")}.png`, Buffer.from(frames[i].png, "base64"));
    await writeFile(`${proof}/m2-${name}-timing.json`, JSON.stringify(frames.map(({ time, x, y, hop }) => ({ time, x, y, hop })), null, 2));
  };
  const capture = record(1600);
  await canvas.focus(); await page.keyboard.down("ArrowUp"); await page.waitForTimeout(1100); await page.keyboard.up("ArrowUp");
  await expect(canvas).toHaveAttribute("data-moving", "false");
  await saveFrames("walk", await capture);
  const running = record(900);
  await page.keyboard.down("Shift"); await page.keyboard.down("ArrowUp"); await page.waitForTimeout(300); await page.keyboard.up("ArrowUp"); await page.keyboard.up("Shift");
  await expect(canvas).toHaveAttribute("data-moving", "false"); await saveFrames("run", await running);
  const moveTo = async (x: number, y: number) => {
    // Real clicks in the camera's current visible area, progressively walk north.
    if (await canvas.getAttribute("data-player") === `${x},${y}`) return;
    await clickTile(page, x, y); await expect(canvas).toHaveAttribute("data-player", `${x},${y}`); await expect(canvas).toHaveAttribute("data-moving", "false");
  };
  // After four/five tiles walking north, every target stays in view.
  await moveTo(9, 17); await moveTo(9, 13); await moveTo(6, 13); await saveNative("grass");
  await moveTo(11, 13); await moveTo(15, 13); await moveTo(17, 13); await moveTo(17, 9); await moveTo(13, 9); await moveTo(9, 9); await moveTo(6, 9);
  const hopping = record(850);
  await canvas.press("ArrowDown"); await expect(canvas).toHaveAttribute("data-player", "6,11"); await expect(canvas).toHaveAttribute("data-moving", "false");
  await saveFrames("hop", await hopping);
  await canvas.press("ArrowUp"); await page.waitForTimeout(350); await expect(canvas).toHaveAttribute("data-player", "6,11");
  await saveNative("ledge");
  // A tree canopy occupies x12..13,y17..19; stand just above its solid trunk row.
  await moveTo(11, 11); await moveTo(11, 15); await moveTo(12, 16); await moveTo(12, 17); await saveNative("tree-overlap");
  await moveTo(17, 17); await moveTo(17, 14); await moveTo(22, 14); await moveTo(27, 14); await moveTo(28, 14); await saveNative("grass-match");
  const grassWalking = record(1800); await moveTo(25, 14);
  const grassFrames = await grassWalking; await saveFrames("grass-walk", grassFrames);
  const walkingFrame = grassFrames.findIndex(f => Number(f.x) < 448);
  await writeFile(`${proof}/m2-grass-match-native.png`, Buffer.from(grassFrames[Math.max(0, walkingFrame)].png, "base64"));
});

test("touch can hold B and a direction together to run", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Multitouch device exercise.");
  await openWorld(page);
  const b = (await page.getByRole("button", { name: "B: cancel, or hold to run" }).boundingBox())!;
  const up = (await page.getByRole("button", { name: "Move up" }).boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const points = [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1 }, { x: up.x + up.width / 2, y: up.y + up.height / 2, id: 2 }];
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [points[0]] });
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points });
  await page.waitForTimeout(450);
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("canvas")).toHaveAttribute("data-moving", "false");
  const tile = (await page.locator("canvas").getAttribute("data-player"))!.split(",").map(Number);
  expect(tile[0]).toBe(9); expect(tile[1]).toBeLessThanOrEqual(21);
  await session.detach();
});
