// Original chiptune compositions in a GBA style (PLAN.md §9: no ripped music).
// Notes are "pitch/length" in sixteenth notes, "r" is a rest. Drum voices:
// k = kick, s = snare, h = hat.
export type Voice = "pulse50" | "pulse25" | "pulse12" | "triangle" | "noise";
export type Channel = { voice: Voice; volume: number; notes: string };
export type Track = { bpm: number; loop: boolean; channels: Channel[] };

const bars = (...parts: string[]) => parts.join(" ");
const times = (pattern: string, n: number) => Array.from({ length: n }, () => pattern).join(" ");
const beat = times("k/2 h/2 s/2 h/2", 2);
const bass = (a: string, b: string) => times(`${a}/2 ${b}/2`, 4);
const halfBass = (a: string, b: string, c: string, d: string) => `${times(`${a}/2 ${b}/2`, 2)} ${times(`${c}/2 ${d}/2`, 2)}`;

export const tracks = {
  title: {
    bpm: 140, loop: true, channels: [
      { voice: "pulse50", volume: 0.16, notes: bars(
        "c5/4 g4/2 c5/2 e5/4 g5/4", "f5/2 e5/2 d5/2 c5/2 d5/8", "e5/4 c5/2 e5/2 g5/4 c6/4", "b5/2 a5/2 g5/2 f5/2 g5/8",
        "a5/4 f5/2 a5/2 c6/4 a5/4", "g5/4 e5/2 g5/2 c6/8", "f5/2 g5/2 a5/2 b5/2 c6/4 b5/4", "c6/12 r/4") },
      { voice: "pulse25", volume: 0.07, notes: bars("e4/16", "b3/16", "e4/16", "d4/16", "f4/16", "e4/16", "a4/8 b4/8", "e4/12 r/4") },
      { voice: "triangle", volume: 0.22, notes: bars(bass("c3", "g3"), bass("g2", "d3"), bass("c3", "g3"), bass("g2", "d3"),
        bass("f2", "c3"), bass("c3", "g3"), halfBass("f2", "c3", "g2", "d3"), bass("c3", "g3")) },
      { voice: "noise", volume: 0.05, notes: times(beat, 8) },
    ],
  },
  route: {
    bpm: 118, loop: true, channels: [
      { voice: "pulse50", volume: 0.13, notes: bars(
        "d5/4 b4/2 g4/2 a4/2 b4/2 c5/2 d5/2", "e5/4 d5/4 b4/4 g4/4", "c5/4 e5/2 g5/2 f#5/2 e5/2 d5/4", "b4/6 a4/2 g4/8",
        "d5/4 b4/2 g4/2 a4/2 b4/2 c5/2 d5/2", "e5/2 f#5/2 g5/4 a5/4 g5/4", "f#5/2 e5/2 d5/4 c5/2 b4/2 a4/4", "g4/12 r/4") },
      { voice: "pulse25", volume: 0.06, notes: bars("b4/8 g4/8", "g4/8 e4/8", "e4/8 a4/8", "d4/8 f#4/8", "b4/8 g4/8", "c5/8 e5/8", "a4/8 f#4/8", "b4/8 r/8") },
      { voice: "triangle", volume: 0.2, notes: bars(bass("g2", "d3"), bass("e2", "b2"), halfBass("c3", "g3", "d3", "a3"), halfBass("g2", "d3", "d3", "a3"),
        bass("g2", "d3"), bass("c3", "g3"), bass("d3", "a3"), bass("g2", "d3")) },
      { voice: "noise", volume: 0.035, notes: times(beat, 8) },
    ],
  },
  wild: {
    bpm: 168, loop: true, channels: [
      { voice: "pulse50", volume: 0.13, notes: bars("a5/2 e5/2 a5/2 e5/2 c6/2 b5/2 a5/2 g5/2", "f5/2 c5/2 f5/2 c5/2 a5/2 g5/2 f5/2 e5/2",
        "d5/2 a4/2 d5/2 a4/2 f5/2 e5/2 d5/2 c5/2", "e5/4 g#5/4 b5/4 e6/4") },
      { voice: "pulse25", volume: 0.06, notes: bars("c5/16", "a4/16", "f4/16", "g#4/16") },
      { voice: "triangle", volume: 0.22, notes: bars(bass("a2", "a3"), bass("f2", "f3"), bass("d2", "d3"), bass("e2", "e3")) },
      { voice: "noise", volume: 0.05, notes: times(beat, 4) },
    ],
  },
  auditor: {
    bpm: 150, loop: true, channels: [
      { voice: "pulse50", volume: 0.13, notes: bars("e5/2 e5/2 g5/2 e5/2 a5/2 e5/2 b5/4", "c6/2 b5/2 a5/2 g5/2 f#5/4 d5/4",
        "e5/2 e5/2 g5/2 e5/2 a5/2 e5/2 b5/4", "d6/4 c6/2 b5/2 a5/4 b5/4") },
      { voice: "pulse12", volume: 0.07, notes: bars("b4/16", "a4/8 f#4/8", "b4/16", "a4/8 d#5/8") },
      { voice: "triangle", volume: 0.22, notes: bars(bass("e2", "b2"), halfBass("c3", "g3", "d3", "a3"), bass("e2", "b2"), halfBass("c3", "g2", "b2", "f#2")) },
      { voice: "noise", volume: 0.05, notes: times(beat, 4) },
    ],
  },
  itemGet: {
    bpm: 132, loop: false, channels: [
      { voice: "pulse50", volume: 0.16, notes: "c5/2 e5/2 g5/2 c6/4 g5/2 c6/8 r/4" },
      { voice: "pulse25", volume: 0.08, notes: "e4/2 g4/2 c5/2 e5/4 e5/2 e5/8 r/4" },
      { voice: "triangle", volume: 0.22, notes: "c3/6 g2/4 c3/10 r/4" },
    ],
  },
  caught: {
    bpm: 140, loop: false, channels: [
      { voice: "pulse50", volume: 0.16, notes: "g4/2 c5/2 e5/2 g5/4 e5/2 g5/4 a5/2 g5/2 f5/2 e5/2 d5/2 c5/8 r/4" },
      { voice: "pulse25", volume: 0.07, notes: "e4/8 g4/8 f4/8 b4/4 e4/6 r/4" },
      { voice: "triangle", volume: 0.22, notes: "c3/8 c3/8 f3/8 g3/4 c3/6 r/4" },
    ],
  },
  save: {
    bpm: 150, loop: false, channels: [
      { voice: "pulse50", volume: 0.14, notes: "e5/2 g5/2 c6/6 r/2" },
      { voice: "triangle", volume: 0.2, notes: "c3/4 g3/2 c4/4 r/2" },
    ],
  },
  spotted: {
    bpm: 180, loop: false, channels: [
      { voice: "pulse50", volume: 0.15, notes: "e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 d#6/4 e6/4" },
      { voice: "triangle", volume: 0.22, notes: "e3/2 e3/2 e3/2 e3/2 b2/4 e3/4" },
    ],
  },
  // ——— Level 2: original radio parodies and GTA-ish front-end cues ———
  bupfm: {
    // BUP FM: synthwave. Am F C G, two bars each.
    bpm: 108, loop: true, channels: [
      { voice: "pulse50", volume: 0.1, notes: bars(
        "e5/4 a5/4 g5/2 e5/2 c5/4", "d5/2 e5/2 r/2 c5/2 b4/4 a4/4", "f5/4 a5/4 c6/4 a5/4", "g5/2 f5/2 e5/4 c5/8",
        "e5/4 g5/4 c6/2 b5/2 g5/4", "e5/6 d5/2 c5/8", "d5/4 g5/4 b5/4 d6/4", "c6/2 b5/2 a5/4 g5/4 e5/4") },
      { voice: "pulse12", volume: 0.045, notes: bars(
        times("a4/1 c5/1 e5/1 a5/1 e5/1 c5/1 a4/1 c5/1", 4), times("f4/1 a4/1 c5/1 f5/1 c5/1 a4/1 f4/1 a4/1", 4),
        times("c5/1 e5/1 g5/1 c6/1 g5/1 e5/1 c5/1 e5/1", 4), times("g4/1 b4/1 d5/1 g5/1 d5/1 b4/1 g4/1 b4/1", 4)) },
      { voice: "triangle", volume: 0.22, notes: bars(
        times("a2/2 a2/2 a3/2 a2/2 a2/2 a3/2 a2/2 e3/2", 2), times("f2/2 f2/2 f3/2 f2/2 f2/2 f3/2 f2/2 c3/2", 2),
        times("c3/2 c3/2 c4/2 c3/2 c3/2 c4/2 c3/2 g3/2", 2), times("g2/2 g2/2 g3/2 g2/2 g2/2 g3/2 g2/2 d3/2", 2)) },
      { voice: "noise", volume: 0.05, notes: times("k/2 h/2 s/2 h/2 k/2 k/2 s/2 h/2", 8) },
    ],
  },
  krud: {
    // KRUD 99.9, talk radio for auditors: hold music between the ads.
    bpm: 92, loop: true, channels: [
      { voice: "pulse50", volume: 0.07, notes: times(bars("a4/6 g4/2 f4/4 e4/4", "d4/8 r/8", "e4/4 g4/4 b4/4 d5/4", "c#5/12 r/4"), 2) },
      { voice: "pulse25", volume: 0.04, notes: times(bars("r/2 f4/2 r/4 c5/2 r/6", "r/2 f4/2 r/4 b4/2 r/6", "r/2 e4/2 r/4 b4/2 r/6", "r/2 e4/2 r/4 g4/2 r/6"), 2) },
      { voice: "triangle", volume: 0.2, notes: times(bars("d3/4 f3/4 a3/4 c4/4", "g2/4 b2/4 d3/4 f3/4", "c3/4 e3/4 g3/4 b3/4", "a2/4 c#3/4 e3/4 g3/4"), 2) },
      { voice: "noise", volume: 0.03, notes: times("h/4 h/2 h/2 h/4 h/2 h/2", 8) },
    ],
  },
  frontend: {
    bpm: 124, loop: true, channels: [
      { voice: "pulse50", volume: 0.1, notes: bars("c5/2 r/2 c5/2 r/2 eb5/2 r/2 g5/4", "f5/2 r/2 eb5/2 r/2 d5/4 c5/4", "ab4/4 c5/4 eb5/4 ab5/4", "bb5/4 g5/4 f5/4 d5/4") },
      { voice: "pulse12", volume: 0.04, notes: bars(times("c4/1 g4/1", 8), times("c4/1 g4/1", 8), times("ab3/1 eb4/1", 8), times("bb3/1 f4/1", 8)) },
      { voice: "triangle", volume: 0.24, notes: bars(times("c2/2 c3/2", 4), times("c2/2 c3/2", 4), times("ab1/2 ab2/2", 4), times("bb1/2 bb2/2", 4)) },
      { voice: "noise", volume: 0.055, notes: times(beat, 4) },
    ],
  },
  briefing: {
    bpm: 84, loop: true, channels: [
      { voice: "pulse25", volume: 0.07, notes: bars("d4/4 f4/4 a4/8", "g4/4 f4/4 e4/8", "f4/4 d4/4 bb3/8", "a3/8 c#4/8") },
      { voice: "triangle", volume: 0.24, notes: bars("d2/16", "d2/16", "bb1/16", "a1/16") },
      { voice: "noise", volume: 0.04, notes: times("k/4 r/4 k/2 r/2 s/4", 4) },
    ],
  },
  jobDone: {
    bpm: 150, loop: false, channels: [
      { voice: "pulse50", volume: 0.15, notes: "g4/2 c5/2 e5/2 g5/4 e5/2 g5/8 r/4" },
      { voice: "pulse25", volume: 0.07, notes: "e4/2 g4/2 c5/2 e5/4 c5/2 e5/8 r/4" },
      { voice: "triangle", volume: 0.22, notes: "c3/6 g2/4 c3/10 r/4" },
    ],
  },
  frenzy: {
    bpm: 150, loop: false, channels: [
      { voice: "pulse50", volume: 0.14, notes: "c5/1 e5/1 g5/1 c6/1 e5/1 g5/1 c6/1 e6/1 g6/8" },
      { voice: "triangle", volume: 0.22, notes: "c3/8 c4/8" },
    ],
  },
  busted: {
    bpm: 120, loop: false, channels: [
      { voice: "pulse50", volume: 0.14, notes: "g4/4 f#4/4 f4/4 e4/12" },
      { voice: "triangle", volume: 0.22, notes: "c3/4 b2/4 bb2/4 a2/12" },
    ],
  },
} satisfies Record<string, Track>;

export type TrackName = keyof typeof tracks;

const semis: Record<string, number> = { c: 0, "c#": 1, db: 1, d: 2, "d#": 3, eb: 3, e: 4, f: 5, "f#": 6, gb: 6, g: 7, "g#": 8, ab: 8, a: 9, "a#": 10, bb: 10, b: 11 };
export type Note = { pitch: string; frequency: number | null; sixteenths: number };
export function parseNotes(notes: string): Note[] {
  return notes.trim().split(/\s+/).map((token) => {
    const [pitch, length] = token.split("/");
    const sixteenths = Number(length);
    if (!Number.isInteger(sixteenths) || sixteenths <= 0) throw new Error(`Bad note length: ${token}`);
    const match = /^([a-g][#b]?)(\d)$/.exec(pitch);
    const frequency = match ? 440 * 2 ** ((semis[match[1]] + 12 * (Number(match[2]) + 1) - 69) / 12) : null;
    if (!match && !["r", "k", "s", "h"].includes(pitch)) throw new Error(`Bad pitch: ${token}`);
    return { pitch, frequency, sixteenths };
  });
}
export const trackLength = (channel: Channel) => parseNotes(channel.notes).reduce((sum, n) => sum + n.sixteenths, 0);
