import { expect, it } from "vitest";
import { trackLength, tracks } from "./tracks";
import { pokeredTitle } from "./pokered-title";

it("every channel of each original track has the same length", () => {
  for (const [name, track] of Object.entries(tracks)) {
    const lengths = track.channels.map(trackLength);
    expect(new Set(lengths).size, name).toBe(1);
  }
});

it("the converted Red/Blue opening loops all four channels in sync", () => {
  const loopFrames = pokeredTitle.map((c) => {
    let frames = 0;
    for (let i = c.loopAt * 5; i < c.events.length; i += 5) frames += c.events[i + 1];
    return frames;
  });
  expect(new Set(loopFrames).size).toBe(1);
  expect(loopFrames[0]).toBe(2592);
});
