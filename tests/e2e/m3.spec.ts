import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const live = (p: Page) => p.locator('.sr-only[role="status"]');
async function a(p: Page) {
  const button = p.getByRole('button', { name: 'A: confirm or talk' });
  if ((p.viewportSize()?.width ?? 1000) < 500) await button.tap(); else await button.click();
}
async function until(p: Page, predicate: () => Promise<boolean>, limit = 150) {
  for (let i = 0; i < limit; i++) {
    if (await predicate()) return;
    await a(p); await p.waitForTimeout(100);
  }
  throw new Error(`Progress stalled: ${await live(p).textContent()}`);
}
async function continueSave(p: Page) {
  await a(p);
  await expect(live(p)).toContainText('Press Start');
  await a(p);
  await expect(live(p)).toContainText('Continue. Player');
  await a(p);
  await expect(p.locator('canvas')).toHaveAttribute('data-player', /\d+,\d+/);
}
async function seed(p: Page, x: number, y: number, facing = 'up', party = ['Charizard']) {
  await p.addInitScript(({ x, y, facing, party }) => {
    localStorage.setItem('bup-accounting-settings-v1', JSON.stringify({ muted: true, textSpeed: 'fast' }));
    if (!localStorage.getItem('bup-accounting-save-v1')) localStorage.setItem('bup-accounting-save-v1', JSON.stringify({
      playerName: 'RED', party, seen: party, bag: { POKE_BALL: 5 }, money: 3000,
      position: { x, y, facing }, flags: { bushesCut: [], fieldHintSeen: true }, playMs: 0, savedAt: 1,
    }));
  }, { x, y, facing, party });
  await p.goto('/');
  await expect(p.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await continueSave(p);
  await expect(p.locator('canvas')).toHaveAttribute('data-locked', 'false');
}
async function native(p: Page, name: string) {
  await mkdir('reference/_proof', { recursive: true });
  const png = await p.locator('canvas').evaluate(e => (e as HTMLCanvasElement).toDataURL().split(',')[1]);
  await writeFile(`reference/_proof/m3-${name}.png`, Buffer.from(png, 'base64'));
}

test('capture, party switch, save and continue restore the opened tree', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await seed(page, 31, 19);
  await a(page);
  await until(page, async () => (await live(page).textContent())?.includes('YES.') ?? false);
  await native(page, `cut-prompt-${info.project.name}`);
  await a(page);
  await until(page, async () => (await live(page).textContent())?.includes('What will') ?? false);
  await native(page, `catch-menu-${info.project.name}`);
  await page.locator('canvas').press('ArrowRight'); await a(page);
  await until(page, async () => (await page.locator('canvas').getAttribute('data-party')) === 'Charizard,Pikachu');
  await expect(page.locator('canvas')).toHaveAttribute('data-locked', 'false');
  await page.getByRole('button', { name: 'Start: open the menu' }).click();
  await page.locator('canvas').press('ArrowDown'); await a(page);
  await expect(page.locator('canvas')).toHaveAttribute('data-overlay', 'Party');
  await native(page, `party-${info.project.name}`);
  await a(page); await page.locator('canvas').press('ArrowDown'); await a(page);
  await page.locator('canvas').press('ArrowDown'); await a(page);
  await page.getByRole('button', { name: 'B: cancel, or hold to run' }).click();
  await expect(page.locator('canvas')).toHaveAttribute('data-party', 'Pikachu,Charizard');
  // Start menu remembers POKéMON. Move to SAVE.
  for (let i = 0; i < 3; i++) await page.locator('canvas').press('ArrowDown');
  await a(page);
  await until(page, async () => (await live(page).textContent())?.includes('YES.') ?? false);
  await a(page);
  await until(page, async () => (await live(page).textContent())?.includes('saved the game.') ?? false);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('bup-accounting-save-v1')!));
  expect(save.party).toEqual(['Pikachu', 'Charizard']);
  expect(save.flags.bushesCut).toContain('pikachu');
  expect(save.bag.POKE_BALL).toBe(4);
  await page.reload();
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await continueSave(page);
  await expect(page.locator('canvas')).toHaveAttribute('data-party', 'Pikachu,Charizard');
  await page.locator('canvas').press('ArrowUp');
  await expect(page.locator('canvas')).toHaveAttribute('data-player', '31,18');
  await native(page, `restored-${info.project.name}`);
  expect(errors).toEqual([]);
});

async function tapNative(p: Page, x: number, y: number) {
  const box = (await p.locator('canvas').boundingBox())!;
  const px = box.x + x * box.width / 240, py = box.y + y * box.height / 160;
  if ((p.viewportSize()?.width ?? 1000) < 500) await p.touchscreen.tap(px, py);
  else await p.mouse.click(px, py);
}
async function tapTile(p: Page, x: number, y: number) {
  const camera = await p.locator('canvas').evaluate(e => ({ x: Number((e as HTMLElement).dataset.cameraX), y: Number((e as HTMLElement).dataset.cameraY) }));
  await tapNative(p, x * 16 + 8 - camera.x, y * 16 + 8 - camera.y);
}
async function moveTo(p: Page, x: number, y: number) {
  await tapTile(p, x, y);
  await expect(p.locator('canvas')).toHaveAttribute('data-player', `${x},${y}`);
  await expect(p.locator('canvas')).toHaveAttribute('data-moving', 'false');
}
async function clearDialogue(p: Page) {
  await expect(p.locator('canvas')).toHaveAttribute('data-locked', 'true');
  await until(p, async () => await p.locator('canvas').getAttribute('data-locked') === 'false');
}

test('mouse and touch reveal Venusaur, open the gate, and return safely from the M4 boundary', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await seed(page, 9, 7, 'left', ['Charizard', 'Pikachu']);
  await tapTile(page, 7, 6);
  await until(page, async () => (await live(page).textContent())?.includes('YES.') ?? false);
  // NO keeps the cover and party unchanged.
  await tapNative(page, 207, 96);
  await expect(page.locator('canvas')).toHaveAttribute('data-locked', 'false');
  await expect(page.locator('canvas')).toHaveAttribute('data-party', 'Charizard,Pikachu');
  await tapTile(page, 7, 6);
  await until(page, async () => (await live(page).textContent())?.includes('YES.') ?? false);
  await tapNative(page, 207, 80);
  await until(page, async () => (await live(page).textContent())?.includes('What will') ?? false);
  await native(page, `venusaur-${info.project.name}`);
  await tapNative(page, 205, 125);
  await until(page, async () => (await page.locator('canvas').getAttribute('data-party')) === 'Charizard,Pikachu,Venusaur');
  await clearDialogue(page);
  for (const [x, y] of [[11,7],[16,7],[21,7],[22,6]]) await moveTo(page, x, y);
  await tapTile(page, 22, 5);
  await clearDialogue(page);
  await native(page, `gate-${info.project.name}`);
  await moveTo(page, 22, 5);
  await tapTile(page, 22, 4);
  await until(page, async () => await page.locator('.game-stage').getAttribute('data-scene') === 'Battle');
  await native(page, `auditor-${info.project.name}`);
  await until(page, async () => await page.locator('.game-stage').getAttribute('data-scene') === 'Overworld');
  await expect(page.locator('canvas')).toHaveAttribute('data-party', 'Charizard,Pikachu,Venusaur');
  await moveTo(page, 22, 5);
  expect(errors).toEqual([]);
});

test('guard refuses an incomplete party and all start-menu pages close cleanly', async ({ page }, info) => {
  await seed(page, 22, 6);
  await a(page);
  await expect(live(page)).toContainText('Only trainers');
  await clearDialogue(page);
  await page.locator('canvas').press('ArrowUp');
  await expect(page.locator('canvas')).toHaveAttribute('data-player', '22,6');
  const names = ['Dex', 'Party', 'Bag', 'Card', 'Option'];
  for (const [i, name] of names.entries()) {
    await page.getByRole('button', { name: 'Start: open the menu' }).click();
    // Pointer selects an absolute start-menu row regardless of remembered cursor.
    await tapNative(page, 192, 16 + (i === 4 ? 5 : i) * 16);
    await expect(page.locator('canvas')).toHaveAttribute('data-overlay', name);
    await native(page, `${name.toLowerCase()}-page-${info.project.name}`);
    await page.getByRole('button', { name: 'B: cancel, or hold to run' }).click();
    await page.getByRole('button', { name: 'B: cancel, or hold to run' }).click();
    await expect(page.locator('canvas')).toHaveAttribute('data-locked', 'false');
  }
});

for (const [id, x, y, item] of [
  ['receipt', 14, 24, 'RECEIPT'], ['calculator', 20, 14, 'CALCULATOR'],
  ['invoice', 24, 21, 'OLD_INVOICE'], ['tax-form', 12, 9, null],
  ['potion', 29, 26, 'POTION'], ['spreadsheet', 25, 16, null],
] as const) {
  test(`optional ${id} reward is saved once and its cleared tile remains walkable`, async ({ page }, info) => {
    test.setTimeout(60000);
    await seed(page, x, y);
    await a(page);
    await until(page, async () => (await live(page).textContent())?.includes('YES.') ?? false);
    await a(page);
    await clearDialogue(page);
    await native(page, `${id}-${info.project.name}`);
    await page.locator('canvas').press('ArrowUp');
    await expect(page.locator('canvas')).toHaveAttribute('data-player', `${x},${y - 1}`);
    await expect(page.locator('canvas')).toHaveAttribute('data-moving', 'false');
    await page.getByRole('button', { name: 'Start: open the menu' }).click();
    await tapNative(page, 192, 80);
    await until(page, async () => (await live(page).textContent())?.includes('YES.') ?? false);
    await a(page);
    await until(page, async () => (await live(page).textContent())?.includes('saved the game.') ?? false);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bup-accounting-save-v1')!));
    expect(saved.flags.bushesCut.filter((s: string) => s.split(':')[0] === id)).toHaveLength(1);
    expect(saved.party).toEqual(['Charizard']);
    if (item) expect(saved.bag[item]).toBe(1);
    else expect(saved.bag).toEqual({ POKE_BALL: 5 });
    await page.reload();
    await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
    await continueSave(page);
    await expect(page.locator('canvas')).toHaveAttribute('data-player', `${x},${y - 1}`);
  });
}

test('the naming grid accepts a custom name and hands it to registration', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveAttribute('data-ready', 'true');
  await until(page, async () => await page.locator('canvas').getAttribute('data-overlay') === 'Naming', 220);
  await tapNative(page, 31, 92); await tapNative(page, 50, 92); await tapNative(page, 69, 92);
  await expect(live(page)).toContainText('A B C');
  await native(page, `naming-${info.project.name}`);
  await tapNative(page, 212, 139);
  await expect(live(page)).toContainText('ABC');
  await page.getByRole('link', { name: 'Skip to registration' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('ABC');
});
