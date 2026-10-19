import { vi } from 'vitest';
import { RecognitionError, type SpeechCapabilities, type SpeechRecognizer, type TranscriptionCallbacks, type TranscriptionSession } from '../speech/types';
import type { StatusResponse } from '../ai/contract';

/** Controllable fake recognizer for UI tests. Nothing touches a real microphone. */
export class FakeRecognizer implements SpeechRecognizer {
  capabilities: SpeechCapabilities = { supported: true, localApi: true, local: 'available' };
  startError: RecognitionError | null = null;
  /** When set, start() waits until `grant()` is called (simulates the permission prompt). */
  holdPermission = false;
  private pendingGrant: (() => void) | null = null;
  callbacks: TranscriptionCallbacks | null = null;
  lastOptions: { lang: string; location: string } | null = null;
  text = '';
  session: (TranscriptionSession & { aborted: boolean; paused: boolean }) | null = null;
  installLocal = vi.fn(async () => true);

  detect = vi.fn(async () => this.capabilities);

  start = vi.fn(async (opts: { lang: string; location: 'local' | 'cloud' } & TranscriptionCallbacks) => {
    this.lastOptions = { lang: opts.lang, location: opts.location };
    if (this.startError) throw this.startError;
    if (this.holdPermission) await new Promise<void>((r) => (this.pendingGrant = r));
    this.callbacks = opts;
    this.text = '';
    const getText = () => this.text;
    const session = {
      aborted: false,
      paused: false,
      pause() {
        this.paused = true;
      },
      resume() {
        this.paused = false;
      },
      async finish() {
        return this.aborted ? '' : getText();
      },
      abort() {
        this.aborted = true;
      },
    };
    this.session = session;
    return session;
  });

  grant() {
    this.pendingGrant?.();
  }

  say(text: string) {
    this.text = [this.text, text].filter(Boolean).join(' ');
    this.callbacks?.onUpdate({ finalText: this.text, interimText: '' });
  }
}

export const aiNotConfigured = async (): Promise<StatusResponse> => ({ configured: false, providerLabel: null, dataNotice: null });
export const aiConfigured = async (): Promise<StatusResponse> => ({ configured: true, providerLabel: 'Test AI', dataNotice: null });

export const GOOD_ANSWER =
  'Binary search finds a target in a sorted array. First we look at the middle element. Because we halve the search space every step, ' +
  'the time complexity is O(log n). The iterative version uses constant space. However, watch for edge cases like an empty array, ' +
  'duplicates and overflow. For example, compute mid as low plus high minus low over two. In summary it is fast but needs sorted input.';
