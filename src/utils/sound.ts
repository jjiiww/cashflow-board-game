class SoundEffects {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public muted = false;

  private getCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.15);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.08, delay = 0) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0.001, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(gainVal, ctx.currentTime + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration);
  }

  private playRealDiceHit(delay: number, intensity: number, pitchScale = 1): void {
    const ctx = this.getCtx();
    if (!ctx) return;

    const startAt = ctx.currentTime + delay;
    const buffer = this.getNoiseBuffer(ctx);
    const amp = Math.min(0.65, Math.max(0.03, intensity));

    // 1. Dominant woody/resin knock body (500 - 2000 Hz, matching measured peak)
    const bodySrc = ctx.createBufferSource();
    bodySrc.buffer = buffer;
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.setValueAtTime((920 + Math.random() * 520) * pitchScale, startAt);
    bodyFilter.Q.setValueAtTime(1.7 + Math.random() * 0.7, startAt);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0008, startAt);
    bodyGain.gain.linearRampToValueAtTime(amp * 0.85, startAt + 0.0012);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, startAt + 0.022 + Math.random() * 0.008);

    bodySrc.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodySrc.start(startAt, Math.random() * 0.06, 0.036);

    // 2. Crisp dice corner/surface click (2200 - 4200 Hz)
    const edgeSrc = ctx.createBufferSource();
    edgeSrc.buffer = buffer;
    const edgeFilter = ctx.createBiquadFilter();
    edgeFilter.type = 'bandpass';
    edgeFilter.frequency.setValueAtTime((2400 + Math.random() * 1400) * pitchScale, startAt);
    edgeFilter.Q.setValueAtTime(2.1 + Math.random() * 0.8, startAt);

    const edgeGain = ctx.createGain();
    edgeGain.gain.setValueAtTime(0.0008, startAt);
    edgeGain.gain.linearRampToValueAtTime(amp * 0.45, startAt + 0.0008);
    edgeGain.gain.exponentialRampToValueAtTime(0.0008, startAt + 0.012 + Math.random() * 0.005);

    edgeSrc.connect(edgeFilter);
    edgeFilter.connect(edgeGain);
    edgeGain.connect(ctx.destination);
    edgeSrc.start(startAt, Math.random() * 0.06, 0.024);

    // 3. Light surface contact weight (300 - 460 Hz, subtle, no boom)
    const thudSrc = ctx.createBufferSource();
    thudSrc.buffer = buffer;
    const thudFilter = ctx.createBiquadFilter();
    thudFilter.type = 'bandpass';
    thudFilter.frequency.setValueAtTime((330 + Math.random() * 110) * pitchScale, startAt);
    thudFilter.Q.setValueAtTime(1.4, startAt);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0008, startAt);
    thudGain.gain.linearRampToValueAtTime(amp * 0.16, startAt + 0.0015);
    thudGain.gain.exponentialRampToValueAtTime(0.0008, startAt + 0.016);

    thudSrc.connect(thudFilter);
    thudFilter.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudSrc.start(startAt, Math.random() * 0.06, 0.022);
  }

  public diceRoll(diceCount = 1): void {
    const count = Math.max(1, Math.min(3, diceCount));
    // Natural multi-bounce dice roll envelope modeled after real dice on a board
    const pattern: [number, number][] = [
      [0.03, 0.42],
      [0.06, 0.28],
      [0.16, 0.48],
      [0.25, 0.46],
      [0.32, 0.36],
      [0.39, 0.42],
      [0.46, 0.28],
      [0.54, 0.23],
      [0.64, 0.24],
      [0.74, 0.17],
      [0.86, 0.13],
      [0.98, 0.09],
    ];

    pattern.forEach(([time, level]) => {
      const jitter = (Math.random() - 0.5) * 0.012;
      const pitch = 0.92 + Math.random() * 0.16;
      this.playRealDiceHit(Math.max(0, time + jitter), level, pitch);
    });

    if (count >= 2) {
      const secondPattern: [number, number][] = [
        [0.09, 0.34],
        [0.21, 0.38],
        [0.35, 0.31],
        [0.49, 0.24],
        [0.69, 0.16],
        [0.91, 0.1],
      ];
      secondPattern.forEach(([time, level]) => {
        const jitter = (Math.random() - 0.5) * 0.014;
        this.playRealDiceHit(Math.max(0, time + jitter), level, 1.04 + Math.random() * 0.14);
      });
    }

    if (count >= 3) {
      const thirdPattern: [number, number][] = [
        [0.13, 0.3],
        [0.29, 0.33],
        [0.43, 0.25],
        [0.61, 0.18],
        [0.81, 0.12],
      ];
      thirdPattern.forEach(([time, level]) => {
        const jitter = (Math.random() - 0.5) * 0.014;
        this.playRealDiceHit(Math.max(0, time + jitter), level, 0.86 + Math.random() * 0.14);
      });
    }
  }

  public dice(diceCount = 1): void {
    const count = Math.max(1, Math.min(3, diceCount));
    // Soft final settle tap when dice faces come to rest
    this.playRealDiceHit(0, 0.18, 0.95 + Math.random() * 0.1);
    if (count >= 2) {
      this.playRealDiceHit(0.025, 0.12, 1.05 + Math.random() * 0.1);
    }
  }

  public step(): void {
    this.playTone(520, 0.045, 'sine', 0.045, 0);
  }

  public diceTick(progress = 0.5, diceCount = 1): void {
    const clamped = Math.max(0, Math.min(1, progress));
    const energy = 0.42 * (1 - clamped * 0.55);
    this.playRealDiceHit(0, energy, 0.92 + Math.random() * 0.16);
    if (diceCount >= 2 && Math.random() > 0.35) {
      this.playRealDiceHit(0.022 + Math.random() * 0.015, energy * 0.72, 1.02 + Math.random() * 0.12);
    }
  }

  public payday(): void {
    this.playTone(523.25, 0.12, 'sine', 0.09, 0);
    this.playTone(659.25, 0.12, 'sine', 0.09, 0.08);
    this.playTone(783.99, 0.22, 'sine', 0.1, 0.16);
  }

  public card(): void {
    this.playTone(440, 0.07, 'sine', 0.06, 0);
    this.playTone(554.37, 0.1, 'sine', 0.06, 0.05);
  }

  public expense(): void {
    this.playTone(300, 0.12, 'sawtooth', 0.05, 0);
    this.playTone(220, 0.18, 'sawtooth', 0.05, 0.1);
  }

  public bankrupt(): void {
    const notes: [number, number, number][] = [
      [293.66, 0.18, 0],
      [261.63, 0.18, 0.14],
      [220.0, 0.22, 0.28],
      [164.81, 0.48, 0.44],
    ];
    notes.forEach(([freq, dur, delay]) => {
      this.playTone(freq, dur, 'sawtooth', 0.075, delay);
      this.playTone(freq * 0.5, dur, 'triangle', 0.08, delay);
    });
  }

  public escapeFanfare(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 0.28, 'triangle', 0.11, idx * 0.085);
      this.playTone(freq * 0.5, 0.25, 'sine', 0.06, idx * 0.085);
    });
  }

  public victory(): void {
    const fanfare: [number, number, number][] = [
      [523.25, 0.16, 0],
      [659.25, 0.16, 0.09],
      [783.99, 0.16, 0.18],
      [1046.5, 0.35, 0.28],
      [783.99, 0.14, 0.44],
      [1046.5, 0.55, 0.56],
      [1318.51, 0.55, 0.56],
      [1567.98, 0.55, 0.56],
    ];
    fanfare.forEach(([freq, dur, delay]) => {
      this.playTone(freq, dur, 'triangle', 0.11, delay);
      this.playTone(freq * 0.5, dur, 'sine', 0.05, delay);
    });
  }
}

export const soundFX = new SoundEffects();
