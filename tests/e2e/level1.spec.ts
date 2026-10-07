import { expect, test, type Page } from "@playwright/test";

// Level 1 (PLAN.md Revision 2): minimal page, starter choice, grass encounters and catching.
const canvas = (page: Page) => page.locator("canvas");
const dialogue = (page: Page) => page.locator('.sr-only[role="status"]');
const scene = (page: Page) => page.locator("main.stage");

async function clearText(page: Page) {
  await canvas(page).focus();
  // Q advances text and does nothing while roaming, so it never starts a conversation.
  for (let i = 0; i < 40 && await dialogue(page).textContent(); i++) { await page.keyboard.press("q"); await page.waitForTimeout(60); }
  await expect(canvas(page)).toHaveAttribute("data-locked", "false");
}

async function walkTo(page: Page, x: number, y: number) {
  const box = (await canvas(page).boundingBox())!;
  const camera = await canvas(page).evaluate((e) => [Number((e as HTMLElement).dataset.cameraX), Number((e as HTMLElement).dataset.cameraY)]);
  const factor = box.width / 240;
  await page.mouse.click(box.x + (x * 16 + 8 - camera[0]) * factor, box.y + (y * 16 + 8 - camera[1]) * factor);
}

test("the page is minimal: a notch with controls, no registration form and no branding", async ({ page }) => {
  await page.goto("/");
  await expect(canvas(page)).toHaveAttribute("data-ready", "true");
  await expect(page.getByText(/BUP ACCOUNTING/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /registration/i })).toHaveCount(0);
  await expect(page.locator(".gba, .dpad, .face-button")).toHaveCount(0);
  const sheet = page.locator("#controls-sheet");
  await expect(sheet).toBeHidden();
  await page.locator(".notch-tab").click();
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(/Menu/);
  await expect(sheet).toContainText("Rafid was here");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "pokemon");
  // Every game pixel covers a whole number of device pixels.
  const scale = await page.locator(".game-display").evaluate((e) => Number((e as HTMLElement).dataset.deviceScale));
  const width = await page.locator(".game-display").evaluate((e) => e.getBoundingClientRect().width * devicePixelRatio);
  expect(Math.round(width)).toBe(240 * scale);
});

test("a new game names the player, offers three starters and starts the town with that partner", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  await expect(canvas(page)).toHaveAttribute("data-ready", "true");
  await canvas(page).focus();
  let chosen = false;
  for (let i = 0; i < 400 && await scene(page).getAttribute("data-scene") !== "Overworld"; i++) {
    const text = (await dialogue(page).textContent()) ?? "";
    if (text.startsWith("NEW NAME")) { await page.keyboard.press("ArrowDown"); await page.keyboard.press("e"); }
    else if (text.startsWith("CHARIZARD, the FLAME")) await page.keyboard.press("ArrowRight");
    else if (text.startsWith("INFERNAPE, the FLAME") && !chosen) { chosen = true; await page.keyboard.press("e"); }
    else await page.keyboard.press("e");
    await page.waitForTimeout(120);
  }
  await expect(scene(page)).toHaveAttribute("data-scene", "Overworld");
  await expect(canvas(page)).toHaveAttribute("data-party", "Infernape");
});

test("WASD walks, walls block, and the follower never shares the player's tile", async ({ page }) => {
  await page.goto("/?level=1");
  await expect(canvas(page)).toHaveAttribute("data-player", "9,24");
  await clearText(page);
  await page.keyboard.press("d");
  await expect(canvas(page)).toHaveAttribute("data-player", "10,24");
  await expect(canvas(page)).toHaveAttribute("data-follower", "9,24");
  await page.keyboard.press("d"); // the sign at 11,24 is solid
  await expect(canvas(page)).toHaveAttribute("data-moving", "false");
  await expect(canvas(page)).toHaveAttribute("data-player", "10,24");
  for (const key of ["w", "a", "s", "a"]) {
    await page.keyboard.press(key);
    await expect(canvas(page)).toHaveAttribute("data-moving", "false");
    const [player, follower] = await canvas(page).evaluate((e) => [(e as HTMLElement).dataset.player, (e as HTMLElement).dataset.follower]);
    expect(player).not.toBe(follower);
  }
});

test("walking near PIKACHU in the tall grass starts a wild battle that ends in a catch", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/?level=1");
  await expect(canvas(page)).toHaveAttribute("data-player", "9,24");
  await clearText(page);
  for (const [x, y] of [[15, 24], [22, 24], [26, 19], [27, 17]]) {
    await walkTo(page, x, y);
    await page.waitForTimeout(400);
    await expect(canvas(page)).toHaveAttribute("data-moving", "false", { timeout: 8000 });
    if (await scene(page).getAttribute("data-scene") === "Battle") break;
  }
  await expect(scene(page)).toHaveAttribute("data-scene", "Battle", { timeout: 15000 });
  // Throw balls until it is caught: the third ball always works.
  for (let i = 0; i < 600 && await scene(page).getAttribute("data-scene") === "Battle"; i++) {
    const text = (await dialogue(page).textContent()) ?? "";
    if (text.startsWith("What will")) { await page.keyboard.press("ArrowRight"); await page.keyboard.press("e"); }
    else if (text.startsWith("POTION")) { await page.keyboard.press("ArrowDown"); await page.keyboard.press("e"); }
    else if (text.startsWith("Choose a POKéMON") || /options\.$/.test(text)) await page.keyboard.press("e");
    else await page.keyboard.press("q");
    await page.waitForTimeout(150);
  }
  await expect(scene(page)).toHaveAttribute("data-scene", "Overworld", { timeout: 20000 });
  await expect(canvas(page)).toHaveAttribute("data-party", "Charizard,Pikachu");
});
