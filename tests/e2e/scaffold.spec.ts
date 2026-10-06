import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const proof = "reference/_proof";
async function enterIntro(page: Page) {
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true");
  for (let i = 0; i < 12 && await page.locator(".game-stage").getAttribute("data-scene") === "Title"; i++) {
    await page.getByRole("button", { name: "A: confirm or talk" }).click();
    await page.waitForTimeout(100);
  }
  await expect(page.locator(".game-stage")).toHaveAttribute("data-scene", "Intro");
}
async function finishIntro(page: Page) {
  for (let i = 0; i < 240 && await page.locator("canvas").getAttribute("data-player") === null; i++) {
    if ((await page.locator('.sr-only[role="status"]').textContent())?.includes("NEW NAME")) await page.locator("canvas").press("ArrowDown");
    await page.getByRole("button", { name: "A: confirm or talk" }).click();
    await page.waitForTimeout(100);
  }
  await expect(page.locator("canvas")).toHaveAttribute("data-player", "9,24");
}

test("title leads to the real overworld and confirm no longer cycles into later scenes", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("tabindex", "0");
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await enterIntro(page);
  await finishIntro(page);
  await expect(canvas).toHaveAttribute("data-player", "9,24");
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "A: confirm or talk" }).click();
  await expect(page.locator(".game-stage")).toHaveAttribute("data-scene", "Overworld");
  await expect(canvas).toHaveAttribute("width", "240");
  await mkdir(proof, { recursive: true });
  await page.screenshot({ path: `${proof}/m2-${testInfo.project.name}-overworld.png`, fullPage: true });
  const native = await canvas.evaluate(element => (element as HTMLCanvasElement).toDataURL().split(",")[1]);
  await writeFile(`${proof}/m2-${testInfo.project.name}-native.png`, Buffer.from(native, "base64"));
  expect(errors).toEqual([]);
});

test("keyboard input, skip path, repeated unmounts, and form focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveAttribute("tabindex", "0");
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true");
  await enterIntro(page);
  for (let repeat = 0; repeat < 3; repeat++) {
    await page.getByRole("link", { name: "Skip to registration" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Register for BUPAF." })).toBeFocused();
    await page.getByLabel("Name", { exact: true }).fill("Red Ledger");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to the game" }).click();
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(page.locator(".game-stage")).toHaveAttribute("data-scene", "Title");
  }
  await page.getByRole("link", { name: "BUP ACCOUNTING BUPAF ’26", exact: true }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("canvas")).toHaveCount(1);
  await enterIntro(page);
});

test("skip form validates and submits to the honest development stub", async ({ page }, testInfo) => {
  await page.goto("/#registration");
  await expect(page.getByRole("heading", { name: "Register for BUPAF." })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Test Trainer");
  await page.getByLabel("Email", { exact: true }).fill("trainer@example.com");
  await page.getByLabel("Company / organisation").fill("BUP");
  await page.getByLabel("Role", { exact: true }).fill("Student");
  await page.getByLabel("I agree to the BUPAF").check();
  await page.screenshot({ path: `${proof}/m1-${testInfo.project.name}-form.png`, fullPage: true });
  await page.waitForTimeout(1600); // Exercise the actual server-side minimum submit time.
  await page.getByRole("button", { name: "Save the game? YES" }).click();
  await expect(page.getByRole("heading", { name: "Test save complete." })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "has not registered you" })).toBeVisible();
  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("mute persists, debug city is native, and the document does not overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Sound on" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sound off" })).toHaveAttribute("aria-pressed", "false");
  await page.goto("/?level=2");
  await expect(page.locator(".game-stage")).toHaveAttribute("data-scene", "City");
  await expect(page.locator("canvas")).toHaveAttribute("width", "640");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("server validation focuses the invalid field and retains the entered details", async ({ page }) => {
  await page.goto("/#registration");
  await page.getByLabel("Name", { exact: true }).fill("Test Trainer");
  await page.getByLabel("Email", { exact: true }).fill("invalid-email");
  await page.getByLabel("Company / organisation").fill("BUP");
  await page.getByLabel("Role", { exact: true }).fill("Student");
  await page.getByLabel("I agree to the BUPAF").check();
  await page.locator("form").evaluate((element) => { (element as HTMLFormElement).noValidate = true; });
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Save the game? YES" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Test Trainer");
  await expect(page.getByLabel("Company / organisation")).toHaveValue("BUP");
  await expect(page.getByLabel("I agree to the BUPAF")).toBeChecked();
});
