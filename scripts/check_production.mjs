import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3001/?level=2");
  await expect(page.locator(".game-stage")).toHaveAttribute("data-scene", "Title");
  await expect(page.locator("canvas")).toHaveAttribute("width", "240");
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true");
  const live = page.locator('.sr-only[role="status"]');
  const confirm = () => page.getByRole("button", { name: "A: confirm or talk" }).click();
  await confirm();
  await expect(live).toContainText("Press Start");
  await confirm();
  await expect(page.locator(".game-stage")).toHaveAttribute("data-scene", "Intro");
  for (let i = 0; i < 300 && await page.locator(".game-stage").getAttribute("data-scene") === "Intro"; i++) {
    if ((await live.textContent())?.includes("NEW NAME")) await page.locator("canvas").press("ArrowDown");
    await confirm(); await page.waitForTimeout(100);
  }
  await expect(page.locator(".game-stage")).toHaveAttribute("data-scene", "Overworld");
  await expect(page.locator("canvas")).toHaveAttribute("width", "240");
  await page.getByRole("link", { name: "Skip to registration" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test Trainer");
  await page.getByLabel("Email", { exact: true }).fill("trainer@example.com");
  await page.getByLabel("Company / organisation").fill("BUP");
  await page.getByLabel("Role", { exact: true }).fill("Student");
  await page.getByLabel("I agree to the BUPAF").check();
  await page.getByRole("button", { name: "Save the game? YES" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Registration is not open yet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Test save complete." })).toHaveCount(0);
  console.log("Production checks passed: debug scene jumps ignored; stub submissions disabled.");
} finally {
  await browser.close();
}
