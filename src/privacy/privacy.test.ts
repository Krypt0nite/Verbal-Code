import { describe, expect, it, vi } from 'vitest';
import { describeProcessing, SessionPurger, storageContains } from './privacy';
import { DEFAULT_PREFERENCES, loadPreferences, loadRecent, savePreferences, saveRecent, clearStoredData } from '../settings/preferences';

describe('SessionPurger', () => {
  it('runs every handler even if one throws, and supports unregistering', () => {
    const p = new SessionPurger();
    const a = vi.fn(() => {
      throw new Error('boom');
    });
    const b = vi.fn();
    const off = p.register(a);
    p.register(b);
    p.purge('discard');
    expect(a).toHaveBeenCalledWith('discard');
    expect(b).toHaveBeenCalledWith('discard');
    off();
    p.purge('cancel');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
});

describe('preferences storage', () => {
  it('refuses to persist unexpected fields such as transcripts', () => {
    savePreferences({ ...DEFAULT_PREFERENCES, transcript: 'my secret answer' } as never);
    expect(storageContains('my secret answer')).toBe(false);
  });

  it('round-trips valid preferences and falls back on corrupt data', () => {
    savePreferences({ ...DEFAULT_PREFERENCES, speechSec: 120 });
    expect(loadPreferences().speechSec).toBe(120);
    localStorage.setItem('verbalcode:prefs:v1', '{not json');
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    localStorage.setItem('verbalcode:prefs:v1', JSON.stringify({ speechSec: 5 }));
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES); // out-of-range values rejected
  });

  it('stores only question ids in history and can clear everything', () => {
    saveRecent(['dsa-heap-priority-queue', 'Not An Id with spaces']);
    expect(loadRecent()).toEqual([]); // whole list rejected if anything is not an id
    saveRecent(['dsa-heap-priority-queue']);
    expect(loadRecent()).toEqual(['dsa-heap-priority-queue']);
    clearStoredData();
    expect(localStorage.length).toBe(0);
  });
});

describe('processing disclosure', () => {
  it('is honest about vendor processing', () => {
    expect(describeProcessing('cloud').detail).toMatch(/sends audio to its vendor/);
    expect(describeProcessing('local').detail).toMatch(/cannot independently verify/);
  });
});
