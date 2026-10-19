import { describe, expect, it, vi } from 'vitest';
import { Countdown, describeRemaining, formatClock, type Scheduler } from './timer';

/** Manual clock + scheduler: time only moves when the test says so. */
function harness() {
  let now = 1000;
  const intervals = new Map<number, () => void>();
  let nextId = 1;
  const scheduler: Scheduler = {
    setInterval: (fn) => {
      const id = nextId++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (h) => intervals.delete(h as number),
  };
  return {
    clock: () => now,
    scheduler,
    advance(ms: number, fire = true) {
      now += ms;
      if (fire) [...intervals.values()].forEach((fn) => fn());
    },
    activeIntervals: () => intervals.size,
  };
}

describe('Countdown', () => {
  it('counts down using elapsed time and completes exactly at zero', () => {
    const h = harness();
    const onComplete = vi.fn();
    const t = new Countdown({ durationMs: 60_000, clock: h.clock, scheduler: h.scheduler, onComplete });
    t.start();
    expect(t.remainingMs).toBe(60_000);
    h.advance(59_999);
    expect(t.remainingMs).toBe(1);
    expect(onComplete).not.toHaveBeenCalled();
    h.advance(1);
    expect(t.remainingMs).toBe(0);
    expect(t.status).toBe('completed');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('handles a suspended tab: one late tick completes immediately without drift', () => {
    const h = harness();
    const onComplete = vi.fn();
    const t = new Countdown({ durationMs: 60_000, clock: h.clock, scheduler: h.scheduler, onComplete });
    t.start();
    h.advance(10 * 60_000, false); // tab asleep — no ticks fire
    expect(onComplete).not.toHaveBeenCalled();
    t.tick(); // e.g. visibilitychange
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(t.elapsedMs).toBe(60_000);
  });

  it('fires completion once even with many ticks and finishNow calls', () => {
    const h = harness();
    const onComplete = vi.fn();
    const t = new Countdown({ durationMs: 1000, clock: h.clock, scheduler: h.scheduler, onComplete });
    t.start();
    h.advance(2000);
    t.tick();
    t.finishNow();
    h.advance(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('pauses and resumes without counting paused time', () => {
    const h = harness();
    const t = new Countdown({ durationMs: 60_000, clock: h.clock, scheduler: h.scheduler });
    t.start();
    h.advance(20_000);
    t.pause();
    h.advance(100_000);
    expect(t.remainingMs).toBe(40_000);
    expect(h.activeIntervals()).toBe(0);
    t.resume();
    h.advance(10_000);
    expect(t.remainingMs).toBe(30_000);
  });

  it('does not create duplicate intervals on repeated start/resume', () => {
    const h = harness();
    const t = new Countdown({ durationMs: 60_000, clock: h.clock, scheduler: h.scheduler });
    t.start();
    t.start();
    t.resume();
    expect(h.activeIntervals()).toBe(1);
  });

  it('cancel cleans up and never fires completion', () => {
    const h = harness();
    const onComplete = vi.fn();
    const t = new Countdown({ durationMs: 1000, clock: h.clock, scheduler: h.scheduler, onComplete });
    t.start();
    t.cancel();
    expect(h.activeIntervals()).toBe(0);
    h.advance(5000);
    t.tick();
    t.finishNow();
    expect(onComplete).not.toHaveBeenCalled();
    expect(t.status).toBe('cancelled');
  });

  it('finishNow completes early and freezes elapsed time', () => {
    const h = harness();
    const onComplete = vi.fn();
    const t = new Countdown({ durationMs: 60_000, clock: h.clock, scheduler: h.scheduler, onComplete });
    t.start();
    h.advance(12_345);
    t.finishNow();
    h.advance(5000);
    expect(t.elapsedMs).toBe(12_345);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(h.activeIntervals()).toBe(0);
  });

  it('supports a zero-length countdown and rejects invalid durations', () => {
    const h = harness();
    const onComplete = vi.fn();
    new Countdown({ durationMs: 0, clock: h.clock, scheduler: h.scheduler, onComplete }).start();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(() => new Countdown({ durationMs: -1 })).toThrow(RangeError);
    expect(() => new Countdown({ durationMs: Number.NaN })).toThrow(RangeError);
  });
});

describe('formatting', () => {
  it('formats mm:ss rounding up', () => {
    expect(formatClock(60_000)).toBe('1:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(59_000)).toBe('0:59');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(600_000)).toBe('10:00');
  });
  it('describes remaining time for screen readers', () => {
    expect(describeRemaining(61_000)).toBe('1 minute 1 second remaining');
    expect(describeRemaining(120_000)).toBe('2 minutes remaining');
    expect(describeRemaining(0)).toBe('0 seconds remaining');
  });
});

describe('announcementMilestoneSec', async () => {
  const { announcementMilestoneSec } = await import('./timer');
  it('only changes value when a milestone is crossed', () => {
    expect([60_000, 45_000, 30_000, 29_000, 10_000, 9_000, 0].map(announcementMilestoneSec)).toEqual([60, 60, 30, 30, 10, 10, 0]);
    expect(announcementMilestoneSec(119_000)).toBe(120);
  });
});
