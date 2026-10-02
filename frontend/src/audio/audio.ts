// All sound is synthesized with WebAudio (no third-party audio, rule 2.1.4).
// Buses: master -> music / sfx. Starts after the first user gesture.
import type { ColorId } from '../core/gameConfig';

type Sfx = 'jump' | 'land' | 'capture' | 'tick' | 'auraOn' | 'auraOff' | 'death' | 'bell' | 'click' | 'unlock';

interface MusicStyle {
  bpm: number;
  /** Chord roots as MIDI notes, one per bar. */
  roots: number[];
  minor: boolean;
  drums: boolean;
  arp: boolean;
  pad: OscillatorType;
}

/** One style per group of tiers; tempo rises slightly with the tier. */
function styleFor(tier: number): MusicStyle {
  if (tier >= 12) return { bpm: 84, roots: [45, 41, 43, 40], minor: false, drums: false, arp: true, pad: 'sine' };
  if (tier >= 11) return { bpm: 100, roots: [48, 45, 41, 43], minor: false, drums: true, arp: true, pad: 'triangle' };
  if (tier >= 8) return { bpm: 104 + (tier - 8) * 2, roots: [50, 46, 43, 45], minor: false, drums: true, arp: true, pad: 'sawtooth' };
  if (tier >= 5) return { bpm: 98 + (tier - 5) * 2, roots: [45, 41, 48, 43], minor: false, drums: true, arp: tier >= 6, pad: 'triangle' };
  if (tier >= 2) return { bpm: 92 + (tier - 2) * 2, roots: [45, 41, 43, 40], minor: true, drums: true, arp: false, pad: 'triangle' };
  return { bpm: 86 + tier * 2, roots: [45, 43, 41, 40], minor: true, drums: true, arp: false, pad: 'triangle' };
}

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private style = styleFor(0);
  private pendingStyle: MusicStyle | null = null;
  private lastTick = 0;
  private external: AudioBufferSourceNode | null = null;

  musicOn = true;
  musicVol = 0.6;
  sfxVol = 0.8;
  tier = 0;

  /** Must be called from a user gesture (first tap or key). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startMusic();
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(this.musicOn ? this.musicVol * 0.35 : 0, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.sfxVol * 0.8, t, 0.02);
  }

  /** Silence everything (app hidden, ads). */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setTier(tier: number): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.pendingStyle = styleFor(tier); // switches at the next bar
  }

  /** Optional licensed track added later by the owner: replaces procedural music. */
  async playExternal(url: string): Promise<void> {
    if (!this.ctx) return;
    const buf = await this.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    this.external?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.music);
    src.start();
    this.external = src;
    window.clearInterval(this.timer);
  }

  play(name: Sfx, opts: { tier?: number; color?: ColorId } = {}): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'jump': {
        const tier = opts.tier ?? 0;
        if (tier < 4) this.tone(t, 'sine', 140, 70, 0.12, 0.35); // dull thud
        else if (tier < 8) this.tone(t, 'triangle', 220, 520, 0.14, 0.22); // spring
        else {
          this.tone(t, 'square', 988, 988, 0.06, 0.1); // clean coin
          this.tone(t + 0.06, 'square', 1319, 1319, 0.12, 0.1);
        }
        break;
      }
      case 'land':
        this.noiseHit(t, 0.06, 900, 0.12);
        break;
      case 'capture': {
        const base = opts.color === 'blue' ? 659 : opts.color === 'green' ? 784 : 523;
        this.tone(t, 'triangle', base, base, 0.12, 0.28);
        this.tone(t + 0.07, 'triangle', base * 1.5, base * 1.5, 0.16, 0.22);
        break;
      }
      case 'tick':
        if (t - this.lastTick < 0.2) return; // many warnings must not turn into noise
        this.lastTick = t;
        this.tone(t, 'square', 1800, 1800, 0.025, 0.06);
        break;
      case 'auraOn':
        this.tone(t, 'sawtooth', 200, 420, 0.22, 0.12);
        break;
      case 'auraOff':
        this.tone(t, 'sawtooth', 380, 180, 0.16, 0.08);
        break;
      case 'death':
        this.tone(t, 'sawtooth', 440, 80, 0.7, 0.25);
        this.noiseHit(t, 0.3, 400, 0.18);
        break;
      case 'bell':
        for (const [f, d] of [
          [1046, 0],
          [1318, 0.12],
        ])
          this.tone(t + d, 'sine', f, f, 1.2, 0.22);
        break;
      case 'unlock':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.07, 'triangle', f, f, 0.18, 0.2));
        break;
      case 'click':
        this.tone(t, 'square', 600, 500, 0.03, 0.08);
        break;
    }
  }

  // ---------- Synthesis helpers ----------

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, bus?: GainNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(t: number, dur: number, cutoff: number, vol: number, bus?: GainNode, highpass = false): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = highpass ? 'highpass' : 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus ?? this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---------- Procedural music (lookahead scheduler) ----------

  private startMusic(): void {
    if (!this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.nextTime < ctx.currentTime + 0.3) {
      this.playStep(this.nextTime, this.step);
      const sixteenth = 60 / this.style.bpm / 4;
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
      if (this.step % 16 === 0 && this.pendingStyle) {
        this.style = this.pendingStyle;
        this.pendingStyle = null;
      }
    }
  }

  private playStep(t: number, step: number): void {
    const st = this.style;
    const bar = Math.floor(step / 16) % st.roots.length;
    const s = step % 16;
    const root = st.roots[bar];
    const third = st.minor ? 3 : 4;
    const bus = this.music;
    const beat = 60 / st.bpm;

    if (s === 0) {
      // Pad chord for the whole bar.
      for (const iv of [0, third, 7]) this.tone(t, st.pad, mtof(root + 12 + iv), mtof(root + 12 + iv), beat * 4, 0.05, bus);
    }
    if (s % 4 === 0) this.tone(t, 'triangle', mtof(root - 12 + (s === 8 ? 7 : 0)), mtof(root - 12 + (s === 8 ? 7 : 0)), beat * 0.9, 0.16, bus);
    if (st.drums) {
      if (s === 0 || s === 8) this.tone(t, 'sine', 120, 45, 0.18, 0.4, bus);
      if (s === 4 || s === 12) this.noiseHit(t, 0.12, 1800, 0.12, bus);
      if (s % 2 === 0) this.noiseHit(t, 0.03, 7000, 0.04, bus, true);
    }
    if (st.arp && s % 2 === 0) {
      const notes = [0, third, 7, 12, 7, third, 0, 7];
      const n = root + 24 + notes[(s / 2) % notes.length];
      this.tone(t, 'square', mtof(n), mtof(n), beat * 0.35, 0.025, bus);
    }
  }
}

export const audio = new AudioEngine();
