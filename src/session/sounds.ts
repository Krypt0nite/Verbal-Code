/** Tiny synthesised cues (no audio files, nothing recorded). Silently does nothing if unsupported. */
let ctx: AudioContext | null = null;

export type Cue = 'start' | 'warning' | 'end';

const TONES: Record<Cue, Array<[freq: number, at: number, len: number]>> = {
  start: [[660, 0, 0.12]],
  warning: [[520, 0, 0.1], [520, 0.16, 0.1]],
  end: [[784, 0, 0.14], [523, 0.18, 0.22]],
};

export function playCue(cue: Cue): void {
  try {
    const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    const now = ctx.currentTime;
    for (const [freq, at, len] of TONES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.12, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + len + 0.05);
    }
  } catch {
    /* sound is optional */
  }
}
