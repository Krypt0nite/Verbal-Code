import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebSpeechRecognizer, mapRecognitionError, type SRInstance } from './webSpeech';
import { RecognitionError } from './types';

/** A controllable fake of the browser SpeechRecognition object. */
class FakeRecognition implements SRInstance {
  static instances: FakeRecognition[] = [];
  static autoStart = true;
  static startError: string | null = null;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  processLocally?: boolean;
  mode?: string;
  onresult: SRInstance['onresult'] = null;
  onerror: SRInstance['onerror'] = null;
  onend: SRInstance['onend'] = null;
  onstart: SRInstance['onstart'] = null;
  started = false;
  aborted = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.started = true;
    queueMicrotask(() => {
      if (FakeRecognition.startError) {
        this.onerror?.({ error: FakeRecognition.startError });
        this.onend?.();
      } else if (FakeRecognition.autoStart) this.onstart?.();
    });
  }
  stop() {
    queueMicrotask(() => this.onend?.());
  }
  abort() {
    this.aborted = true;
  }
  emit(results: Array<[string, boolean]>) {
    this.onresult?.({
      results: Object.assign(
        results.map(([t, isFinal]) => Object.assign([{ transcript: t }], { isFinal })),
        { length: results.length },
      ),
    } as never);
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeWindow(extra: Record<string, unknown> = {}) {
  const ctor = Object.assign(FakeRecognition, extra);
  return { webkitSpeechRecognition: ctor };
}

beforeEach(() => {
  FakeRecognition.instances = [];
  FakeRecognition.autoStart = true;
  FakeRecognition.startError = null;
});
afterEach(() => {
  delete (FakeRecognition as unknown as Record<string, unknown>).available;
  delete (FakeRecognition as unknown as Record<string, unknown>).install;
});

describe('detect', () => {
  it('reports unsupported browsers', async () => {
    const r = createWebSpeechRecognizer({});
    expect(await r.detect('en-US')).toEqual({ supported: false, localApi: false, local: 'unavailable' });
  });
  it('reports no local API when the browser lacks it', async () => {
    const r = createWebSpeechRecognizer(makeWindow());
    expect(await r.detect('en-US')).toEqual({ supported: true, localApi: false, local: 'unavailable' });
  });
  it('reports local availability via the on-device API', async () => {
    const available = vi.fn().mockResolvedValue('downloadable');
    const r = createWebSpeechRecognizer(makeWindow({ available }));
    expect(await r.detect('en-GB')).toEqual({ supported: true, localApi: true, local: 'downloadable' });
    expect(available).toHaveBeenCalledWith({ langs: ['en-GB'], processLocally: true });
  });
});

describe('start', () => {
  it('refuses local mode without an on-device API instead of falling back to cloud', async () => {
    const r = createWebSpeechRecognizer(makeWindow());
    await expect(r.start({ lang: 'en-US', location: 'local', onUpdate: vi.fn(), onError: vi.fn() })).rejects.toMatchObject({
      kind: 'local-unavailable',
    });
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it('sets processLocally in local mode', async () => {
    const r = createWebSpeechRecognizer(makeWindow({ available: vi.fn() }));
    await r.start({ lang: 'en-US', location: 'local', onUpdate: vi.fn(), onError: vi.fn() });
    expect(FakeRecognition.instances[0]?.processLocally).toBe(true);
  });

  it('maps permission denial to a typed error', async () => {
    FakeRecognition.startError = 'not-allowed';
    const r = createWebSpeechRecognizer(makeWindow());
    const p = r.start({ lang: 'en-US', location: 'cloud', onUpdate: vi.fn(), onError: vi.fn() });
    await expect(p).rejects.toBeInstanceOf(RecognitionError);
    await expect(p).rejects.toMatchObject({ kind: 'not-allowed' });
  });

  it('accumulates text across automatic restarts, pause and resume', async () => {
    const onUpdate = vi.fn();
    const r = createWebSpeechRecognizer(makeWindow());
    const session = await r.start({ lang: 'en-US', location: 'cloud', onUpdate, onError: vi.fn() });
    FakeRecognition.instances[0]!.emit([['hello there', true], [' gen', false]]);
    expect(onUpdate).toHaveBeenLastCalledWith({ finalText: 'hello there', interimText: 'gen' });

    // Browser ends after silence → adapter restarts and keeps text.
    FakeRecognition.instances[0]!.onend?.();
    expect(FakeRecognition.instances).toHaveLength(2);
    FakeRecognition.instances[1]!.emit([['general kenobi', true]]);
    expect(onUpdate).toHaveBeenLastCalledWith({ finalText: 'hello there general kenobi', interimText: '' });

    session.pause();
    await flush();
    expect(FakeRecognition.instances).toHaveLength(2); // no restart while paused
    session.resume();
    expect(FakeRecognition.instances).toHaveLength(3);
    FakeRecognition.instances[2]!.emit([['again', true]]);
    const text = await session.finish();
    expect(text).toBe('hello there general kenobi again');
    expect(FakeRecognition.instances[2]!.aborted).toBe(true); // microphone released
  });

  it('finishing right after pause waits for the browser to flush the last words', async () => {
    const r = createWebSpeechRecognizer(makeWindow());
    const session = await r.start({ lang: 'en-US', location: 'cloud', onUpdate: vi.fn(), onError: vi.fn() });
    const rec = FakeRecognition.instances[0]!;
    rec.stop = () => {}; // the browser ends the instance later, after flushing results
    rec.emit([['hello', true], ['world', false]]);
    session.pause();
    const finished = session.finish();
    rec.emit([['hello', true], ['world', true]]); // flushed final result arrives after Finish
    rec.onend?.();
    expect(await finished).toBe('hello world');
    expect(rec.aborted).toBe(true);
  });

  it('keeps unconfirmed words if the browser never flushes before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const r = createWebSpeechRecognizer(makeWindow());
      const session = await r.start({ lang: 'en-US', location: 'cloud', onUpdate: vi.fn(), onError: vi.fn() });
      const rec = FakeRecognition.instances[0]!;
      rec.stop = () => {}; // never ends
      rec.emit([['hello', true], ['world', false]]);
      const finished = session.finish();
      await vi.advanceTimersByTimeAsync(3000);
      expect(await finished).toBe('hello world');
      expect(rec.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('abort drops text, ignores late events and releases the microphone', async () => {
    const onUpdate = vi.fn();
    const r = createWebSpeechRecognizer(makeWindow());
    const session = await r.start({ lang: 'en-US', location: 'cloud', onUpdate, onError: vi.fn() });
    const rec = FakeRecognition.instances[0]!;
    rec.emit([['private words', true]]);
    session.abort();
    expect(rec.aborted).toBe(true);
    expect(rec.onresult).toBeNull();
    session.abort(); // idempotent
    expect(await session.finish()).toBe('');
  });

  it('reports an error if a restarted instance fails to start instead of going silent', async () => {
    const onError = vi.fn();
    const r = createWebSpeechRecognizer(makeWindow());
    await r.start({ lang: 'en-US', location: 'cloud', onUpdate: vi.fn(), onError });
    FakeRecognition.autoStart = false;
    FakeRecognition.instances[0]!.onend?.(); // restart
    FakeRecognition.instances[1]!.onend?.(); // restarted instance dies before starting
    expect(onError).toHaveBeenCalledWith('unknown', expect.any(String));
  });

  it('reports mid-session errors once and stops', async () => {
    const onError = vi.fn();
    const r = createWebSpeechRecognizer(makeWindow());
    await r.start({ lang: 'en-US', location: 'cloud', onUpdate: vi.fn(), onError });
    FakeRecognition.instances[0]!.onerror?.({ error: 'network' });
    expect(onError).toHaveBeenCalledWith('network', expect.any(String));
    expect(FakeRecognition.instances[0]!.aborted).toBe(true);
  });

  it('ignores no-speech errors and detects restart loops', async () => {
    const onError = vi.fn();
    const r = createWebSpeechRecognizer(makeWindow());
    await r.start({ lang: 'en-US', location: 'cloud', onUpdate: vi.fn(), onError });
    FakeRecognition.instances[0]!.onerror?.({ error: 'no-speech' });
    expect(onError).not.toHaveBeenCalled();
    for (let i = 0; i < 7; i++) {
      FakeRecognition.instances.at(-1)!.onend?.();
      await flush(); // let the restarted instance start, as a browser would
    }
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('mapRecognitionError', () => {
  it('never includes transcript text and distinguishes local language-pack errors', () => {
    expect(mapRecognitionError('language-not-supported', 'local').kind).toBe('local-unavailable');
    expect(mapRecognitionError('language-not-supported', 'cloud').kind).toBe('unsupported');
    expect(mapRecognitionError('service-not-allowed', 'cloud').kind).toBe('not-allowed');
    expect(mapRecognitionError('weird', 'cloud').kind).toBe('unknown');
  });
});
