import { parseNotes, tracks, type TrackName, type Voice } from "./tracks";
import { assetManifest } from "../assets.manifest";

export type MusicName = TrackName | keyof typeof assetManifest.music;
type MusicOptions = { resume?: boolean; onEnded?: () => void };
type TimedNote = { pitch: string; frequency: number | null; seconds: number; volume?: number; decay?: number; voice?: Voice };

// A tiny GBA-flavoured synthesiser: pulse waves at 12.5/25/50 % duty, a
// triangle bass and a noise channel for cues and effects. The downloaded theme
// and radio songs stream through the same music bus and volume controls.
export type Sfx = "select" | "cursor" | "bump" | "exclaim" | "cut" | "push" | "rustle" | "throw" | "ballOpen" | "wobble"
  | "click" | "sparkle" | "encounter" | "buzz" | "menu" | "hop" | "slide" | "flash" | "door" | "shrink" | "type"
  | "horn" | "crash" | "thud" | "explosion" | "pager" | "boot" | "glitch" | "cash" | "static" | "carDoor";

type Scheduled = { name: TrackName; channels: { notes: TimedNote[]; index: number; time: number; voice: Voice; volume: number; loopAt: number }[]; loop: boolean };

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
  private recording: { name: MusicName; audio: HTMLAudioElement; source: MediaElementAudioSourceNode; resume: boolean; positionReady: boolean } | null = null;
  private recordingPositions = new Map<MusicName, number>();
  private jingle: Scheduled | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private resumeTrack: MusicName | null = null;
  /** slowStop(): new notes fall in pitch and stretch until the music stops. */
  private slowing: { start: number; seconds: number } | null = null;
  private engineVoice: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private sirenVoice: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  current: MusicName | null = null;

  configure(muted: boolean, volume: number) {
    this.muted = muted; this.volume = volume;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : volume, this.ctx.currentTime, 0.02);
  }

  /** Call from a user gesture to satisfy browser autoplay policies. */
  unlock() {
    const ctx = this.context();
    if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
    if (this.recording?.audio.paused && !this.jingle) this.startRecording();
  }

  private startRecording() {
    // Autoplay may be blocked until unlock() runs on the next key or tap.
    if (this.recording) void this.recording.audio.play().catch(() => {});
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

  private tone(bus: GainNode, voice: Voice, frequency: number, start: number, duration: number, volume: number, slideTo?: number, decay?: number) {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.004);
    if (decay) gain.gain.linearRampToValueAtTime(0.0001, start + Math.min(duration, decay));
    else {
      gain.gain.setValueAtTime(volume, Math.max(start + 0.005, start + duration - 0.03));
      gain.gain.linearRampToValueAtTime(0, start + duration);
    }
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
      case "horn": tone("pulse50", 370, 0, 0.32, 0.08); tone("pulse50", 466, 0, 0.32, 0.07); break;
      case "crash": tone("noise", 900, 0, 0.22, 0.4, 200); tone("triangle", 110, 0, 0.18, 0.35, 40); break;
      case "thud": tone("triangle", 180, 0, 0.12, 0.4, 60); tone("noise", 1400, 0, 0.06, 0.25); tone("pulse12", 1500, 0.02, 0.09, 0.05, 600); break;
      case "explosion": tone("noise", 1400, 0, 1.1, 0.6, 60); tone("triangle", 80, 0, 0.9, 0.5, 28); tone("noise", 300, 0.05, 0.7, 0.35, 50); break;
      case "pager": for (let i = 0; i < 3; i++) tone("pulse50", 2093, i * 0.11, 0.06, 0.09); break;
      case "boot": tone("triangle", 40, 0, 1.4, 0.5, 120); tone("noise", 200, 0, 1.2, 0.18, 6000); tone("pulse25", 220, 0.9, 0.5, 0.08, 880); break;
      case "glitch": for (let i = 0; i < 5; i++) tone(i % 2 ? "pulse12" : "noise", 200 + Math.random() * 3000, i * 0.035, 0.03, 0.08); break;
      case "cash": tone("pulse50", 988, 0, 0.06, 0.1); tone("pulse50", 1319, 0.06, 0.18, 0.1); break;
      case "static": tone("noise", 4000, 0, 0.18, 0.2, 1500); break;
      case "carDoor": tone("noise", 500, 0, 0.08, 0.3, 200); tone("triangle", 140, 0.06, 0.07, 0.3, 90); break;
    }
  }

  /** Jingles interrupt music and resume it. Radio can retain positions and advance on end. */
  play(name: MusicName, options: MusicOptions = {}) {
    const file = assetManifest.music[name as keyof typeof assetManifest.music];
    const looping = !!file || tracks[name as TrackName].loop;
    if (!looping) { this.playJingle(name as TrackName); return; }
    if (this.current === name && (this.music || this.recording)) return;
    this.stopMusic();
    const ctx = this.context();
    this.current = name;
    if (!ctx) return;
    if (file) {
      const audio = new Audio(file);
      audio.loop = !options.onEnded;
      audio.preload = "auto";
      audio.preservesPitch = false;
      const position = options.resume ? this.recordingPositions.get(name) ?? 0 : 0;
      if (position > 0) audio.addEventListener("loadedmetadata", () => {
        if (this.recording?.audio === audio) {
          audio.currentTime = position < audio.duration ? position : 0;
          this.recording.positionReady = true;
        }
      }, { once: true });
      if (options.onEnded) audio.addEventListener("ended", () => {
        if (this.recording?.audio === audio) options.onEnded!();
      });
      const source = ctx.createMediaElementSource(audio);
      source.connect(this.musicBus!);
      this.recording = { name, audio, source, resume: !!options.resume, positionReady: position === 0 };
      this.startRecording();
    } else {
      this.music = this.schedule(name as TrackName, ctx.currentTime + 0.05);
      this.startTimer();
    }
  }

  private playJingle(name: TrackName) {
    const ctx = this.context();
    if (!ctx) return;
    if (this.music || this.recording) this.resumeTrack = this.current;
    if (this.recording) this.recording.audio.pause();
    if (this.music || this.recording || this.jingle) { this.silence(); this.music = null; }
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
    const step = 15 / track.bpm;
    return { name, loop: track.loop, channels: track.channels.map((c) => ({
      notes: parseNotes(c.notes).map((n) => ({ pitch: n.pitch, frequency: n.frequency, seconds: n.sixteenths * step })),
      index: 0, time: at, voice: c.voice, volume: c.volume, loopAt: 0,
    })) };
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
      let finished = true;
      for (const c of s.channels) {
        while (c.time < horizon && (c.index < c.notes.length || s.loop)) {
          if (c.index >= c.notes.length) c.index = c.loopAt;
          const note = c.notes[c.index++];
          // While slowing to a stop, each note is lower and longer than the last.
          const slow = this.slowing && s === this.music ? Math.min(1, Math.max(0, (c.time - this.slowing.start) / this.slowing.seconds)) : 0;
          const rate = 1 - 0.72 * slow;
          const duration = note.seconds / rate;
          if (!this.muted && ctx.state === "running") {
            const voice = note.voice ?? c.voice, volume = note.volume ?? c.volume;
            if (voice === "noise" && note.pitch !== "r") {
              const drum = { k: [180, 0.07, 0.6, 60], s: [1800, 0.09, 0.4, 900], h: [7000, 0.03, 0.2, 7000] }[note.pitch as "k" | "s" | "h"];
              if (drum) this.tone(this.musicBus, "noise", drum[0], c.time, drum[1], volume * drum[2] * 2, drum[3]);
            } else if (note.frequency) this.tone(this.musicBus, voice, note.frequency * rate, c.time, duration * 0.95, volume, slow > 0 ? note.frequency * rate * 0.94 : undefined, note.decay);
          }
          c.time += duration;
        }
        if (c.index < c.notes.length || s.loop || c.time > ctx.currentTime) finished = false;
      }
      if (finished && s === this.jingle) {
        this.jingle = null;
        if (this.resumeTrack) {
          const resume = this.resumeTrack; this.resumeTrack = null;
          if (this.recording) { this.silence(); this.startRecording(); }
          else { this.current = null; this.play(resume); }
        }
      }
    }
    if (this.slowing && this.recording) {
      const slow = Math.min(1, Math.max(0, (ctx.currentTime - this.slowing.start) / this.slowing.seconds));
      this.recording.audio.playbackRate = 1 - 0.72 * slow;
    }
    if (this.slowing && ctx.currentTime > this.slowing.start + this.slowing.seconds) { this.slowing = null; this.stopMusic(); return; }
    if (!this.music && !this.jingle && !this.slowing && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Winds the music down like a console losing power: pitch and tempo sag, then silence. */
  slowStop(ms: number) {
    const ctx = this.ctx;
    if (!ctx || (!this.music && !this.recording) || !this.musicBus) { this.stopMusic(); return; }
    const seconds = ms / 1000;
    this.slowing = { start: ctx.currentTime + 0.05, seconds };
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    this.startTimer();
  }

  /** A continuous engine note; level 0–1 follows the car's speed. null switches it off. */
  engine(level: number | null) {
    const ctx = this.context();
    if (!ctx || !this.sfxBus) return;
    if (level === null || this.muted) {
      if (this.engineVoice) {
        const v = this.engineVoice; this.engineVoice = null;
        v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        v.osc.stop(ctx.currentTime + 0.3); v.sub.stop(ctx.currentTime + 0.3);
      }
      return;
    }
    if (!this.engineVoice) {
      const osc = ctx.createOscillator(), sub = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      osc.type = "sawtooth"; sub.setPeriodicWave(this.waves.get("pulse25")!);
      filter.type = "lowpass"; filter.frequency.value = 500; filter.Q.value = 3;
      gain.gain.value = 0;
      osc.connect(filter); sub.connect(filter); filter.connect(gain).connect(this.sfxBus);
      osc.start(); sub.start();
      this.engineVoice = { osc, sub, filter, gain };
    }
    const v = this.engineVoice, t = ctx.currentTime;
    const l = Math.max(0, Math.min(1, level));
    v.osc.frequency.setTargetAtTime(38 + l * 95, t, 0.08);
    v.sub.frequency.setTargetAtTime(19 + l * 47, t, 0.08);
    v.filter.frequency.setTargetAtTime(380 + l * 1100, t, 0.1);
    v.gain.gain.setTargetAtTime(0.05 + l * 0.05, t, 0.1);
  }

  /** The wailing two-tone siren; volume 0 (or null) turns it off. */
  siren(volume: number | null) {
    const ctx = this.context();
    if (!ctx || !this.sfxBus) return;
    if (!volume || this.muted) {
      if (this.sirenVoice) {
        const v = this.sirenVoice; this.sirenVoice = null;
        v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        v.osc.stop(ctx.currentTime + 0.6); v.lfo.stop(ctx.currentTime + 0.6);
      }
      return;
    }
    if (!this.sirenVoice) {
      const osc = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), gain = ctx.createGain();
      osc.setPeriodicWave(this.waves.get("pulse50")!); osc.frequency.value = 820;
      lfo.type = "square"; lfo.frequency.value = 1.6; depth.gain.value = 140;
      lfo.connect(depth).connect(osc.frequency);
      gain.gain.value = 0; osc.connect(gain).connect(this.sfxBus);
      osc.start(); lfo.start();
      this.sirenVoice = { osc, lfo, gain };
    }
    this.sirenVoice.gain.gain.setTargetAtTime(Math.min(0.06, volume * 0.06), ctx.currentTime, 0.15);
  }

  private silence() {
    if (!this.musicBus || !this.ctx || !this.master) return;
    // Disconnect the bus so already-scheduled notes stop immediately.
    this.musicBus.disconnect();
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(this.master);
    if (this.recording) { this.recording.source.disconnect(); this.recording.source.connect(this.musicBus); }
  }

  stopMusic() {
    if (this.recording) {
      this.recording.audio.pause();
      if (this.recording.resume && this.recording.positionReady) this.recordingPositions.set(this.recording.name,
        this.recording.audio.ended ? 0 : this.recording.audio.currentTime);
      this.recording.source.disconnect();
      this.recording.audio.removeAttribute("src");
      this.recording.audio.load();
      this.recording = null;
    }
    this.music = null; this.jingle = null; this.resumeTrack = null; this.current = null; this.slowing = null;
    this.silence();
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** A replacement cartridge starts with fresh radio playback positions. */
  resetMusic() {
    this.stopMusic();
    this.recordingPositions.clear();
  }
}

export const chip = new Chip();
