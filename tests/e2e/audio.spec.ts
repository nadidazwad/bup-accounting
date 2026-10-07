import { expect, test, type Page } from "@playwright/test";

type MusicState = {
  file: string; src: string; time: number; duration: number; paused: boolean;
  loop: boolean; rate: number; preservesPitch: boolean; context: string;
  volume: number | null; musicGain: number | null;
};
type MusicWindow = { __musicProbe(): MusicState[]; __seekMusic(seconds: number): void };

// Observe actual browser media and its output gains without replacing playback.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const links = new WeakMap<AudioNode, AudioNode>();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      if (args[0] instanceof AudioNode) links.set(this, args[0]);
      return Reflect.apply(connect, this, args);
    } as typeof connect;
    const streams: { file: string; audio: HTMLMediaElement; source: MediaElementAudioSourceNode }[] = [];
    const create = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (audio) {
      const source = create.call(this, audio);
      streams.push({ file: new URL(audio.src).pathname, audio, source });
      return source;
    };
    (window as unknown as MusicWindow).__musicProbe = () => streams.map(({ file, audio, source }) => {
      const bus = links.get(source), master = bus && links.get(bus);
      return {
        file, src: audio.getAttribute("src") ?? "", time: audio.currentTime, duration: audio.duration,
        paused: audio.paused, loop: audio.loop, rate: audio.playbackRate,
        preservesPitch: audio.preservesPitch, context: source.context.state,
        musicGain: bus instanceof GainNode ? bus.gain.value : null,
        volume: master instanceof GainNode ? master.gain.value : null,
      };
    });
    (window as unknown as MusicWindow).__seekMusic = (seconds) => { streams.at(-1)!.audio.currentTime = seconds; };
  });
});

const music = (page: Page) => page.evaluate(() => (window as unknown as MusicWindow).__musicProbe());
const latest = async (page: Page) => (await music(page)).at(-1);
const canvas = (page: Page) => page.locator("canvas");

async function playing(page: Page, file: string, loop = true) {
  await expect.poll(async () => {
    const state = await latest(page);
    return !!state && state.file === `/assets/audio/${file}` && !state.paused && state.time > 0 && state.context === "running";
  }).toBe(true);
  expect((await latest(page))?.loop).toBe(loop);
}

async function cityReady(page: Page) {
  await page.goto("/?level=2");
  await expect(canvas(page)).toHaveAttribute("data-city-briefing", "true");
  await canvas(page).focus();
  for (let i = 0; i < 12 && await canvas(page).getAttribute("data-city-briefing") === "true"; i++) {
    await page.keyboard.press("e");
    await page.waitForTimeout(100);
  }
  await expect(canvas(page)).toHaveAttribute("data-city-locked", "false");
}

async function radioPlaying(page: Page, previous?: string) {
  await expect.poll(async () => {
    const state = await latest(page);
    return !!state && /^\/assets\/audio\/gta-radio-[123]\.mp3$/.test(state.file)
      && state.file !== previous && state.src !== "" && !state.paused && state.time > 0 && state.context === "running";
  }).toBe(true);
  expect((await latest(page))?.loop).toBe(false);
  return (await latest(page))!;
}

test("the downloaded Pokémon title music plays through the sound controls", async ({ page }) => {
  await page.goto("/");
  await expect(canvas(page)).toHaveAttribute("data-ready", "true");
  await canvas(page).focus();
  await page.keyboard.press("Shift");
  await playing(page, "pokemon-theme.mp3");
  expect((await latest(page))?.duration).toBeGreaterThan(110);
  expect((await latest(page))?.duration).toBeLessThan(115);
  await page.getByRole("button", { name: /Level 1 Controls/ }).click();
  await page.getByRole("button", { name: "Sound on", exact: true }).click();
  await expect.poll(async () => (await latest(page))?.volume).toBeLessThan(0.001);
  await page.getByRole("button", { name: "Sound off", exact: true }).click();
  await expect.poll(async () => (await latest(page))?.volume).toBeGreaterThan(0.49);
  await playing(page, "pokemon-theme.mp3");
});

test("the car radio cycles through all three downloads, off, and back on", async ({ page }) => {
  await cityReady(page);
  await page.keyboard.press("e");
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "car");
  const heard = [(await radioPlaying(page)).file];
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("r");
    heard.push((await radioPlaying(page, heard.at(-1))).file);
    expect((await music(page)).slice(0, -1).every((state) => state.paused && state.src === "")).toBe(true);
  }
  expect([...heard].sort()).toEqual([1, 2, 3].map((i) => `/assets/audio/gta-radio-${i}.mp3`));
  await page.keyboard.press("r");
  await expect.poll(async () => (await music(page)).every((state) => state.paused && state.src === "")).toBe(true);
  await page.keyboard.press("r");
  await radioPlaying(page, heard.at(-1));
  await page.keyboard.press("e");
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "foot");
  await expect.poll(async () => (await latest(page))?.paused).toBe(true);
});

type CityCar = { kind: string; x: number; y: number };
type CityForAudio = { car: CityCar; player: { x: number; y: number }; vehicles: { cars: CityCar[] } };
type CityGameWindow = { __bupGame: { scene: { getScene(key: string): CityForAudio } } };

test("changing cars shuffles the music and revisiting a song keeps its playback position", async ({ page }) => {
  await cityReady(page);
  await page.keyboard.press("e");
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "car");
  const positions = new Map<string, number>();
  const heard: string[] = [];
  for (let hop = 0; hop < 6; hop++) {
    const state = await radioPlaying(page, heard.at(-1));
    heard.push(state.file);
    if (positions.has(state.file)) expect(state.time).toBeGreaterThanOrEqual(positions.get(state.file)!);
    const position = 25 + hop * 5;
    await page.evaluate((seconds) => (window as unknown as MusicWindow).__seekMusic(seconds), position);
    await expect.poll(async () => (await latest(page))?.time).toBeGreaterThanOrEqual(position);
    positions.set(state.file, position);
    const previousCar = await page.evaluate(() => {
      const city = (window as unknown as CityGameWindow).__bupGame.scene.getScene("City");
      return city.vehicles.cars.indexOf(city.car);
    });
    await page.keyboard.press("e");
    await expect(canvas(page)).toHaveAttribute("data-city-mode", "foot");
    // Move next to another real parked car, then use the normal enter-car input.
    await page.evaluate((previous) => {
      const city = (window as unknown as CityGameWindow).__bupGame.scene.getScene("City");
      const target = city.vehicles.cars.find((car, index) => car.kind === "parked" && index !== previous)!;
      city.player.x = target.x; city.player.y = target.y;
    }, previousCar);
    await page.keyboard.press("e");
    await expect(canvas(page)).toHaveAttribute("data-city-mode", "car");
  }
  expect(new Set(heard.slice(0, 3)).size).toBe(3);
  expect(new Set(heard.slice(3, 6)).size).toBe(3);
  const resumed = await radioPlaying(page, heard.at(-1));
  expect(resumed.time).toBeGreaterThanOrEqual(positions.get(resumed.file)!);
  await page.keyboard.press("e");
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "foot");
  await page.keyboard.press("e"); // Re-entering this same car keeps its chosen song.
  await playing(page, resumed.file.split("/").at(-1)!, false);
  expect((await latest(page))!.time).toBeGreaterThanOrEqual(resumed.time);
});

test("a finished radio song automatically advances through a shuffled round", async ({ page }) => {
  await cityReady(page);
  await page.keyboard.press("e");
  const heard = [(await radioPlaying(page)).file];
  for (let i = 0; i < 3; i++) {
    const state = (await latest(page))!;
    await page.evaluate((seconds) => (window as unknown as MusicWindow).__seekMusic(seconds), state.duration - 0.25);
    heard.push((await radioPlaying(page, state.file)).file);
  }
  expect(new Set(heard.slice(0, 3)).size).toBe(3);
  expect(heard[3]).not.toBe(heard[2]);
  expect((await latest(page))!.time).toBeLessThan(3); // A completed song starts a fresh play.
  await expect(canvas(page)).toHaveAttribute("data-city-mode", "car");
});

test("a save jingle resumes the MP3, then the cartridge transition slows and stops it", async ({ page }) => {
  await page.goto("/?level=1");
  await expect(canvas(page)).toHaveAttribute("data-ready", "true");
  await canvas(page).focus();
  const dialogue = page.locator('.sr-only[role="status"]');
  for (let i = 0; i < 40 && await dialogue.textContent(); i++) {
    await page.keyboard.press("q");
    await page.waitForTimeout(60);
  }
  await expect(canvas(page)).toHaveAttribute("data-locked", "false");
  await playing(page, "pokemon-theme.mp3");
  await page.keyboard.press("m");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("e");
  await expect(dialogue).toContainText("Would you like to save");
  await page.keyboard.press("q"); // Finish printing the question.
  await expect(dialogue).toContainText("YES. 2 options.");
  await page.keyboard.press("e"); // YES.
  await expect.poll(async () => (await latest(page))?.paused, { timeout: 5000 }).toBe(true);
  const pausedAt = (await latest(page))!.time;
  await playing(page, "pokemon-theme.mp3");
  expect((await music(page)).length).toBe(1);
  expect((await latest(page))!.time).toBeGreaterThanOrEqual(pausedAt);

  // Use the existing development scene handle to start the real transition.
  await page.evaluate(() => {
    const game = (window as unknown as { __bupGame: { scene: { start(key: string): void } } }).__bupGame;
    game.scene.start("Glitch");
  });
  await expect.poll(async () => (await latest(page))?.rate).toBeLessThan(0.9);
  expect((await latest(page))?.preservesPitch).toBe(false);
  await expect.poll(async () => (await latest(page))?.src, { timeout: 5000 }).toBe("");
  expect((await latest(page))?.paused).toBe(true);
});
