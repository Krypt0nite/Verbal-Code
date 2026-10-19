/**
 * Privacy module.
 *
 * VerbalCode keeps transcripts in memory only (React state) and never records audio. This module owns
 * the explicit cleanup operation that runs at lifecycle boundaries: cancel, discard, finishing the
 * feedback workflow, page hide/unload, and component unmount.
 */

export type CleanupReason = 'cancel' | 'discard' | 'new-question' | 'feedback-closed' | 'page-hide' | 'unmount' | 'error';

type Cleanup = (reason: CleanupReason) => void;

export class SessionPurger {
  private handlers = new Set<Cleanup>();

  register(fn: Cleanup): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  /** Runs every registered cleanup. One failing handler never prevents the others. */
  purge(reason: CleanupReason): void {
    for (const fn of [...this.handlers]) {
      try {
        fn(reason);
      } catch {
        /* cleanup must not throw; errors here must not leak data into logs */
      }
    }
  }
}

/** Test/diagnostic helper: true if any web storage value contains `text`. */
export function storageContains(text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return false;
  for (const store of [globalThis.localStorage, globalThis.sessionStorage]) {
    if (!store) continue;
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && (store.getItem(key) ?? '').toLowerCase().includes(needle)) return true;
    }
  }
  return false;
}

export interface ProcessingDisclosure {
  title: string;
  detail: string;
}

/** Plain-language description of where speech is processed. Honest about what we can't guarantee. */
export function describeProcessing(location: 'local' | 'cloud'): ProcessingDisclosure {
  return location === 'local'
    ? {
        title: 'On-device recognition',
        detail:
          'Your browser was asked to transcribe on this device only. VerbalCode does not record audio. The browser vendor controls this feature, so we cannot independently verify what it does internally.',
      }
    : {
        title: 'Cloud recognition (browser vendor)',
        detail:
          "Your browser sends audio to its vendor's speech service (for example Google for Chrome, Apple for Safari) to produce text. VerbalCode never receives or stores the audio.",
      };
}
