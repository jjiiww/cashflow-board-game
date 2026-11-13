class SoundEffects {
  private ctx: AudioContext | null = null;
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

  public dice(): void {
    this.playTone(220, 0.05, 'triangle', 0.08, 0);
    this.playTone(360, 0.06, 'triangle', 0.08, 0.04);
    this.playTone(480, 0.09, 'sine', 0.09, 0.09);
  }

  public step(): void {
    this.playTone(520, 0.045, 'sine', 0.045, 0);
  }

  public diceTick(): void {
    this.playTone(460, 0.028, 'square', 0.028, 0);
    this.playTone(280, 0.032, 'triangle', 0.035, 0.01);
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

  public victory(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      this.playTone(freq, 0.25, 'triangle', 0.1, idx * 0.1);
    });
  }
}

export const soundFX = new SoundEffects();
