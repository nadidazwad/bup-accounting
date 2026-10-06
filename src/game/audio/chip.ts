import { parseNotes, tracks, type TrackName, type Voice } from "./tracks";

// A tiny GBA-flavoured synthesiser: pulse waves at 12.5/25/50 % duty, a
// triangle bass and a noise channel. Everything is generated at runtime, so no
// music or sound effects are ripped from the original games.
export type Sfx = "select" | "cursor" | "bump" | "exclaim" | "cut" | "push" | "rustle" | "throw" | "ballOpen" | "wobble"
  | "click" | "sparkle" | "encounter" | "buzz" | "menu" | "hop" | "slide" | "flash" | "door" | "shrink" | "type";

type Scheduled = { name: TrackName; channels: { notes: ReturnType<typeof parseNotes>; index: number; time: number; voice: Voice; volume: number }[]; loop: boolean };

class Chip {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private waves = new Map<Voice, PeriodicWave>();
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.5;
  private music: Scheduled | null = null;
  private jingle: Scheduled | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private resumeTrack: TrackName | null = null;
  current: TrackName | null = null;

  configure(muted: boolean, volume: number) {
    this.muted = muted; this.volume = volume;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : volume, this.ctx.currentTime, 0.02);
  }

  /** Call from a user gesture to satisfy browser autoplay policies. */
  unlock() {
    const ctx = this.context();
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
  }

  private context() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try { this.ctx = new Ctor(); } catch { return null; }
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
      for (const [voice, duty] of [["pulse50", 0.5], ["pulse25", 0.25], ["pulse12", 0.125]] as const) {
        const real = new Float32Array(48), imag = new Float32Array(48);
        for (let n = 1; n < 48; n++) { real[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n); imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n); }
        this.waves.set(voice, this.ctx.createPeriodicWave(real, imag));
      }
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // 15-bit LFSR noise, like the GBA's noise channel.
      let lfsr = 0x7fff;
      for (let i = 0; i < data.length; i++) {
        if (i % 4 === 0) { const bit = (lfsr ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (bit << 14); }
        data[i] = lfsr & 1 ? 0.8 : -0.8;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  private tone(bus: GainNode, voice: Voice, frequency: number, start: number, duration: number, volume: number, slideTo?: number) {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.004);
    gain.gain.setValueAtTime(volume, Math.max(start + 0.005, start + duration - 0.03));
    gain.gain.linearRampToValueAtTime(0, start + duration);
    gain.connect(bus);
    if (voice === "noise") {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer; src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = "bandpass"; filter.frequency.setValueAtTime(frequency, start);
      if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
      filter.Q.value = 0.8; src.connect(filter).connect(gain);
      src.start(start, Math.random() * 0.5); src.stop(start + duration + 0.02);
      return;
    }
    const osc = ctx.createOscillator();
    if (voice === "triangle") osc.type = "triangle"; else osc.setPeriodicWave(this.waves.get(voice)!);
    osc.frequency.setValueAtTime(frequency, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    osc.connect(gain); osc.start(start); osc.stop(start + duration + 0.02);
  }

  sfx(name: Sfx) {
    const ctx = this.context();
    if (!ctx || !this.sfxBus || this.muted) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const t = ctx.currentTime + 0.01, bus = this.sfxBus;
    const tone = (voice: Voice, f: number, at: number, d: number, v: number, to?: number) => this.tone(bus, voice, f, t + at, d, v, to);
    switch (name) {
      case "select": tone("pulse50", 1047, 0, 0.035, 0.12); tone("pulse50", 1568, 0.035, 0.05, 0.12); break;
      case "cursor": tone("pulse25", 1319, 0, 0.03, 0.08); break;
      case "menu": tone("pulse50", 784, 0, 0.04, 0.1); tone("pulse50", 1175, 0.04, 0.06, 0.1); break;
      case "bump": tone("triangle", 130, 0, 0.09, 0.35, 70); tone("noise", 300, 0, 0.06, 0.12); break;
      case "exclaim": tone("pulse50", 1568, 0, 0.05, 0.12); tone("pulse50", 2093, 0.06, 0.09, 0.12); break;
      case "cut": tone("noise", 1500, 0, 0.16, 0.3, 7000); tone("pulse12", 2400, 0, 0.12, 0.08, 600); tone("noise", 5000, 0.17, 0.12, 0.2, 1200); break;
      case "push": for (let i = 0; i < 4; i++) tone("noise", 350, i * 0.09, 0.08, 0.28, 180); tone("triangle", 90, 0, 0.36, 0.25, 60); break;
      case "rustle": tone("noise", 3200, 0, 0.05, 0.14); tone("noise", 2600, 0.07, 0.05, 0.12); break;
      case "throw": tone("pulse25", 420, 0, 0.32, 0.09, 1400); break;
      case "ballOpen": tone("noise", 6000, 0, 0.12, 0.2, 800); tone("pulse50", 1760, 0, 0.18, 0.08, 440); break;
      case "wobble": tone("triangle", 330, 0, 0.05, 0.3); tone("noise", 2000, 0, 0.03, 0.12); break;
      case "click": tone("pulse50", 2093, 0, 0.03, 0.12); tone("noise", 4000, 0.04, 0.04, 0.18); tone("pulse50", 2637, 0.09, 0.05, 0.1); break;
      case "sparkle": [2093, 2637, 3136, 4186].forEach((f, i) => tone("triangle", f, i * 0.05, 0.08, 0.12)); break;
      case "encounter": [1568, 1319, 1047, 880, 1047, 1319, 1568, 2093].forEach((f, i) => tone("pulse50", f, i * 0.035, 0.035, 0.1)); break;
      case "buzz": tone("pulse50", 147, 0, 0.14, 0.12); break;
      case "hop": tone("triangle", 330, 0, 0.12, 0.25, 660); break;
      case "slide": tone("noise", 900, 0, 0.25, 0.2, 300); break;
      case "flash": tone("pulse12", 3000, 0, 0.08, 0.06, 1500); break;
      case "door": tone("noise", 700, 0, 0.12, 0.2, 250); break;
      case "shrink": tone("pulse25", 1500, 0, 0.6, 0.08, 200); break;
      case "type": tone("pulse25", 1760, 0, 0.02, 0.05); break;
    }
  }

  /** Play a looping track. Jingles interrupt the music and resume it afterwards. */
  play(name: TrackName) {
    const track = tracks[name];
    if (!track.loop) { this.playJingle(name); return; }
    if (this.current === name && this.music) return;
    this.stopMusic();
    const ctx = this.context();
    this.current = name;
    if (!ctx) return;
    this.music = this.schedule(name, ctx.currentTime + 0.05);
    this.startTimer();
  }

  private playJingle(name: TrackName) {
    const ctx = this.context();
    if (!ctx) return;
    if (this.music) { this.resumeTrack = this.current; this.silence(); this.music = null; }
    this.jingle = this.schedule(name, ctx.currentTime + 0.05);
    this.startTimer();
  }

  /** Seconds a non-looping track lasts (used to wait for jingles). */
  duration(name: TrackName) {
    const track = tracks[name];
    const sixteenths = parseNotes(track.channels[0].notes).reduce((s, n) => s + n.sixteenths, 0);
    return sixteenths * 15 / track.bpm;
  }

  private schedule(name: TrackName, at: number): Scheduled {
    const track = tracks[name];
    return { name, loop: track.loop, channels: track.channels.map((c) => ({ notes: parseNotes(c.notes), index: 0, time: at, voice: c.voice, volume: c.volume })) };
  }

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.pump(), 40);
    this.pump();
  }

  private pump() {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const horizon = ctx.currentTime + 0.25;
    for (const s of [this.music, this.jingle]) {
      if (!s) continue;
      const step = 15 / tracks[s.name].bpm;
      let finished = true;
      for (const c of s.channels) {
        while (c.time < horizon && (c.index < c.notes.length || s.loop)) {
          if (c.index >= c.notes.length) c.index = 0;
          const note = c.notes[c.index++], duration = note.sixteenths * step;
          if (!this.muted && ctx.state === "running") {
            if (c.voice === "noise" && note.pitch !== "r") {
              const drum = { k: [180, 0.07, 0.6, 60], s: [1800, 0.09, 0.4, 900], h: [7000, 0.03, 0.2, 7000] }[note.pitch as "k" | "s" | "h"];
              if (drum) this.tone(this.musicBus, "noise", drum[0], c.time, drum[1], c.volume * drum[2] * 2, drum[3]);
            } else if (note.frequency) this.tone(this.musicBus, c.voice, note.frequency, c.time, duration * 0.92, c.volume);
          }
          c.time += duration;
        }
        if (c.index < c.notes.length || s.loop || c.time > ctx.currentTime) finished = false;
      }
      if (finished && s === this.jingle) {
        this.jingle = null;
        if (this.resumeTrack) { const resume = this.resumeTrack; this.resumeTrack = null; this.current = null; this.play(resume); }
      }
    }
    if (!this.music && !this.jingle && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private silence() {
    if (!this.musicBus || !this.ctx || !this.master) return;
    // Disconnect the bus so already-scheduled notes stop immediately.
    this.musicBus.disconnect();
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(this.master);
  }

  stopMusic() {
    this.music = null; this.jingle = null; this.resumeTrack = null; this.current = null;
    this.silence();
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}

export const chip = new Chip();
