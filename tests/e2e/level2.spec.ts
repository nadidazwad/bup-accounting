import { expect, test, type Page } from "@playwright/test";
import { REGISTRATION_URL } from "../../src/game/links";

// Level 2 (PLAN.md §6–§7, Revision 2): the glitch, BROKER CITY and the finale.
const canvas = (page: Page) => page.locator("canvas");
const stage = (page: Page) => page.locator("main.stage");
type CityHooks = { win(): void; toGoal(): void };

async function cityReady(page: Page) {
  await page.goto("/?level=2");
  await expect(canvas(page)).toHaveAttribute("data-city-briefing", "true");
  await canvas(page).focus();
  for (let i = 0; i < 12 && await canvas(page).getAttribute("data-city-briefing") === "true"; i++) {
    await page.keyboard.press("e");
    await page.waitForTimeout(100);
  }
  await expect(canvas(page)).toHaveAttribute("data-city-locked", "false", { timeout: 30000 });
  await canvas(page).focus();
}

test("?level=2 loads BROKER CITY on a 640×480 GTA screen", async ({ page }) => {
  await cityReady(page);
  await expect(stage(page)).toHaveAttribute("data-scene", "City");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "gta");
  const display = page.locator(".game-display");
  await expect(display).toHaveAttribute("data-screen", "gta");
  // 640×480 logical, rendered into a 2× backing store, fitted at 4:3.
  expect(await canvas(page).evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([1280, 960]);
  const box = (await display.boundingBox())!;
  expect(Math.abs(box.width / box.height - 4 / 3)).toBeLessThan(0.01);
  await expect(page.locator(".notch-tab")).toContainText("Level 2");
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "foot");
});

test("E gets into the car, it drives, and E gets out again", async ({ page }) => {
  await cityReady(page);
  await expect(canvas(page)).toHaveAttribute("data-city-near-car", "true");
  await page.keyboard.press("e");
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "car");
  await page.keyboard.down("KeyW");
  await expect.poll(async () => Number(await canvas(page).getAttribute("data-city-speed")), { timeout: 5000 }).toBeGreaterThan(80);
  await page.keyboard.up("KeyW");
  // Space is the handbrake in a car, not the door.
  await page.keyboard.down("Space");
  await expect.poll(async () => Number(await canvas(page).getAttribute("data-city-speed")), { timeout: 8000 }).toBeLessThan(40);
  await page.keyboard.up("Space");
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "car");
  await page.keyboard.press("e");
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "foot");
});

test("winning the city leads to THE BROKER's offer, and YES opens the registration page", async ({ page }) => {
  test.setTimeout(90000);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>Registration</title>Registration" }));
  await cityReady(page);
  await page.evaluate(() => (window as unknown as { __bupCity: CityHooks }).__bupCity.win());
  await expect(canvas(page)).toHaveAttribute("data-city-won", "true");
  await page.evaluate(() => (window as unknown as { __bupCity: CityHooks }).__bupCity.toGoal());
  await expect(stage(page)).toHaveAttribute("data-scene", "Finale", { timeout: 15000 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "gta");
  await canvas(page).focus();
  await page.keyboard.press("e"); // skip the typewriter
  await expect(canvas(page)).toHaveAttribute("data-finale", "asking", { timeout: 20000 });
  // NO gets a joke and the question again.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("e");
  await expect(page.locator('.sr-only[role="status"]')).toContainText(/Ready for the next level/i);
  await expect(canvas(page)).toHaveAttribute("data-finale", "asking");
  await page.keyboard.press("e"); // the cursor is back on YES
  await page.waitForURL(REGISTRATION_URL, { timeout: 10000 });
});

test("the cartridge glitches into the GRAND THEFT AUDIT 2 front end, then drops into the city", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/?level=glitch");
  await expect(stage(page)).toHaveAttribute("data-scene", "Glitch");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "glitch");
  await expect(page.locator(".game-display")).toHaveAttribute("data-screen", "gba");
  await expect(canvas(page)).toHaveAttribute("data-glitch", "menu", { timeout: 30000 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "gta");
  await expect(page.locator(".game-display")).toHaveAttribute("data-screen", "gta");
  await canvas(page).focus();
  await page.waitForTimeout(1600); // let the district select finish
  await page.keyboard.press("e");
  await expect(stage(page)).toHaveAttribute("data-scene", "City", { timeout: 10000 });
  await expect(canvas(page)).toHaveAttribute("data-city-briefing", "true");
  for (let i = 0; i < 12 && await canvas(page).getAttribute("data-city-briefing") === "true"; i++) {
    await page.keyboard.press("e");
    await page.waitForTimeout(100);
  }
  await expect(canvas(page)).toHaveAttribute("data-city-locked", "false", { timeout: 15000 });
});

test("running a pedestrian down scores a victim with points", async ({ page }) => {
  await cityReady(page);
  await page.keyboard.press("e");
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "car");
  await page.keyboard.down("KeyW");
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __bupCity: { ram(): boolean } }).__bupCity.ram()), { timeout: 15000 }).toBe(true);
  await expect.poll(async () => Number(await canvas(page).getAttribute("data-city-victims")), { timeout: 5000 }).toBeGreaterThan(0);
  await page.keyboard.up("KeyW");
});
