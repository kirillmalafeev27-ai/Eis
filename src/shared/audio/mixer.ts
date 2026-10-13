import { ZZFX_RATE, type ZzfxParams, zzfxGenerate } from './zzfx';

/**
 * Звуковой микшер серии (10): шины эффектов и эмбиента, общий выключатель, панорама,
 * разброс высоты. AudioContext создаётся по первому жесту — до этого тишина без ошибок.
 */
export interface MixerVolumes {
  sfx: number;
  ambient: number;
  muted: boolean;
}

export interface PlayOptions {
  /** −1 … 1 */
  pan?: number;
  /** Разброс высоты, доля (0.05 = ±5%). */
  jitter?: number;
  volume?: number;
  delay?: number;
  /** Множитель высоты (подсчёт рыбы — с растущей высотой). */
  rate?: number;
}

type AnyAudioContext = typeof AudioContext;

export class Mixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambBus: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private ambient: AmbientBed | null = null;
  private vol: MixerVolumes;

  constructor(vol: MixerVolumes) {
    this.vol = { ...vol };
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Запуск по жесту пользователя (кнопка «Играть»). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = (window.AudioContext ||
          (window as unknown as { webkitAudioContext?: AnyAudioContext }).webkitAudioContext) as
          AnyAudioContext | undefined;
        if (!Ctor) return;
        const ctx = new Ctor();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);
        this.sfxBus = ctx.createGain();
        this.sfxBus.connect(this.master);
        this.duckGain = ctx.createGain();
        this.duckGain.connect(this.master);
        this.ambBus = ctx.createGain();
        this.ambBus.connect(this.duckGain);
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(v: Partial<MixerVolumes>): void {
    this.vol = { ...this.vol, ...v };
    this.applyVolumes();
  }

  get volumes(): MixerVolumes {
    return { ...this.vol };
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.ambBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.muted ? 0 : 1, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
    this.ambBus.gain.setTargetAtTime(this.vol.ambient, t, 0.05);
  }

  /** Сыграть синтезированный звук; буфер кэшируется по имени. */
  play(name: string, params: ZzfxParams, opts: PlayOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || ctx.state !== 'running' || this.vol.muted) return;
    let buf = this.buffers.get(name);
    if (!buf) {
      const data = zzfxGenerate(params, () => 0.5);
      buf = ctx.createBuffer(1, data.length, ZZFX_RATE);
      buf.getChannelData(0).set(data);
      this.buffers.set(name, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const j = opts.jitter ?? 0.05;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j);
    let node: AudioNode = src;
    if (opts.volume !== undefined && opts.volume !== 1) {
      const g = ctx.createGain();
      g.gain.value = opts.volume;
      node.connect(g);
      node = g;
    }
    if (opts.pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    src.start(ctx.currentTime + (opts.delay ?? 0));
  }

  /** Эмбиент: ветер и течение; громкость и порывы растут с силой ледохода (10.3). */
  ambientStart(): void {
    if (!this.ctx || !this.ambBus || this.ambient) return;
    this.ambient = new AmbientBed(this.ctx, this.ambBus);
  }

  ambientStop(): void {
    this.ambient?.stop();
    this.ambient = null;
  }

  ambientLevel(strength: number): void {
    this.ambient?.setStrength(strength);
  }

  /** Приглушить эмбиент на 30%, когда трещины дошли до 3-й стадии (10.4). */
  duck(on: boolean, amount = 0.7): void {
    if (!this.ctx || !this.duckGain) return;
    this.duckGain.gain.setTargetAtTime(on ? amount : 1, this.ctx.currentTime, 0.12);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  destroy(): void {
    this.ambientStop();
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
  }
}

/** Фон реки и ветра из шума: течение — низкий гул, ветер — порывы в полосе, ледоход — далёкий бас. */
class AmbientBed {
  private readonly nodes: AudioNode[] = [];
  private readonly river: GainNode;
  private readonly wind: GainNode;
  private readonly rumble: GainNode;
  private readonly gust: OscillatorNode;
  private readonly gustDepth: GainNode;
  private readonly sources: AudioBufferSourceNode[] = [];

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
  ) {
    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    // «Коричневый» шум для реки и белый для ветра — из одного буфера с разной фильтрацией.
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5 + w * 0.15;
    }
    const src = (rate = 1) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start();
      this.sources.push(s);
      return s;
    };
    // течение
    const rLow = ctx.createBiquadFilter();
    rLow.type = 'lowpass';
    rLow.frequency.value = 420;
    this.river = ctx.createGain();
    this.river.gain.value = 0;
    src(1).connect(rLow).connect(this.river).connect(out);
    // ветер — полосовой шум с порывами
    const wBand = ctx.createBiquadFilter();
    wBand.type = 'bandpass';
    wBand.frequency.value = 900;
    wBand.Q.value = 0.6;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.gust = ctx.createOscillator();
    this.gust.frequency.value = 0.09;
    this.gustDepth = ctx.createGain();
    this.gustDepth.gain.value = 0.04;
    this.gust.connect(this.gustDepth).connect(this.wind.gain);
    this.gust.start();
    src(1.7).connect(wBand).connect(this.wind).connect(out);
    // далёкий ледоход
    const deep = ctx.createBiquadFilter();
    deep.type = 'lowpass';
    deep.frequency.value = 85;
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    src(0.6).connect(deep).connect(this.rumble).connect(out);
    this.nodes.push(rLow, wBand, deep, this.river, this.wind, this.rumble, this.gustDepth);
    this.setStrength(0);
  }

  setStrength(k: number): void {
    const t = this.ctx.currentTime;
    this.river.gain.setTargetAtTime(0.16 + 0.22 * k, t, 0.8);
    this.wind.gain.setTargetAtTime(0.05 + 0.12 * k, t, 0.8);
    this.gustDepth.gain.setTargetAtTime(0.03 + 0.08 * k, t, 0.8);
    this.gust.frequency.setTargetAtTime(0.08 + 0.18 * k, t, 1);
    this.rumble.gain.setTargetAtTime(Math.max(0, k - 0.4) * 0.5, t, 1.2);
  }

  stop(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* уже остановлен */
      }
    }
    try {
      this.gust.stop();
    } catch {
      /* уже остановлен */
    }
    for (const n of this.nodes) n.disconnect();
  }
}
