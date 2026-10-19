/**
 * Countdown timer based on monotonic elapsed time.
 *
 * Remaining time is always recomputed as `duration - elapsed`, where elapsed is measured with a
 * monotonic clock (performance.now). Ticks only trigger a recomputation, so delayed callbacks,
 * throttled background tabs and suspended devices cannot make the timer drift — when the tab wakes up
 * the next tick sees the true elapsed time and completes immediately if time ran out.
 */

export type Clock = () => number;

export interface Scheduler {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const browserScheduler: Scheduler = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
};

export const monotonicClock: Clock = () => performance.now();

export type CountdownStatus = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface CountdownOptions {
  durationMs: number;
  onTick?: (remainingMs: number) => void;
  onComplete?: () => void;
  clock?: Clock;
  scheduler?: Scheduler;
  tickMs?: number;
}

export class Countdown {
  readonly durationMs: number;
  private readonly clock: Clock;
  private readonly scheduler: Scheduler;
  private readonly tickMs: number;
  private readonly onTick: (remainingMs: number) => void;
  private readonly onComplete: () => void;

  private accumulatedMs = 0;
  private segmentStart: number | null = null;
  private handle: unknown = null;
  private _status: CountdownStatus = 'idle';

  constructor(opts: CountdownOptions) {
    if (!Number.isFinite(opts.durationMs) || opts.durationMs < 0) {
      throw new RangeError('durationMs must be a non-negative finite number');
    }
    this.durationMs = opts.durationMs;
    this.clock = opts.clock ?? monotonicClock;
    this.scheduler = opts.scheduler ?? browserScheduler;
    this.tickMs = opts.tickMs ?? 200;
    this.onTick = opts.onTick ?? (() => {});
    this.onComplete = opts.onComplete ?? (() => {});
  }

  get status(): CountdownStatus {
    return this._status;
  }

  get elapsedMs(): number {
    const live = this.segmentStart === null ? 0 : Math.max(0, this.clock() - this.segmentStart);
    return Math.min(this.durationMs, this.accumulatedMs + live);
  }

  get remainingMs(): number {
    return Math.max(0, this.durationMs - this.elapsedMs);
  }

  start(): void {
    if (this._status !== 'idle') return; // prevents duplicate timers
    this._status = 'running';
    this.segmentStart = this.clock();
    this.arm();
    this.tick();
  }

  pause(): void {
    if (this._status !== 'running') return;
    this.accumulatedMs = this.elapsedMs;
    this.segmentStart = null;
    this.disarm();
    this._status = 'paused';
    this.onTick(this.remainingMs);
  }

  resume(): void {
    if (this._status !== 'paused') return;
    this._status = 'running';
    this.segmentStart = this.clock();
    this.arm();
    this.tick();
  }

  /** Stops without firing onComplete. Idempotent. */
  cancel(): void {
    if (this._status === 'completed' || this._status === 'cancelled') return;
    this.freeze();
    this._status = 'cancelled';
  }

  /** Finish early (e.g. the user pressed "Finish"). Fires onComplete exactly once. */
  finishNow(): void {
    if (this._status !== 'running' && this._status !== 'paused') return;
    this.complete();
  }

  /** Re-evaluates the clock immediately, e.g. after `visibilitychange`. */
  tick(): void {
    if (this._status !== 'running') return;
    const remaining = this.remainingMs;
    this.onTick(remaining);
    if (remaining <= 0) this.complete();
  }

  private complete(): void {
    if (this._status === 'completed' || this._status === 'cancelled') return; // exactly once
    this.freeze();
    this._status = 'completed';
    this.onComplete();
  }

  private freeze(): void {
    this.accumulatedMs = this.elapsedMs;
    this.segmentStart = null;
    this.disarm();
  }

  private arm(): void {
    this.disarm();
    this.handle = this.scheduler.setInterval(() => this.tick(), this.tickMs);
  }

  private disarm(): void {
    if (this.handle !== null) {
      this.scheduler.clearInterval(this.handle);
      this.handle = null;
    }
  }
}

/** mm:ss, rounding *up* so the display shows 1:00 at the very start and 0:00 only at the end. */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Spoken-friendly countdown text for screen readers. */
export function describeRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s > 0 || m === 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return `${parts.join(' ')} remaining`;
}

/** Announced points: every whole minute, 30 s, 10 s and 0. Text only changes when a point is crossed. */
export function announcementMilestoneSec(remainingMs: number): number {
  const sec = Math.ceil(remainingMs / 1000);
  if (sec > 60) return Math.ceil(sec / 60) * 60;
  if (sec > 30) return 60;
  if (sec > 10) return 30;
  if (sec > 0) return 10;
  return 0;
}
