/** Where speech is converted to text. */
export type ProcessingLocation = 'local' | 'cloud';

/** Availability of on-device recognition for a language, as reported by the browser. */
export type LocalAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unknown';

export interface SpeechCapabilities {
  /** A Web Speech recognition constructor exists. */
  supported: boolean;
  /** The browser exposes the on-device recognition API (Chrome 139+ style). */
  localApi: boolean;
  local: LocalAvailability;
}

export type RecognitionErrorKind =
  | 'not-allowed'
  | 'audio-capture'
  | 'unsupported'
  | 'local-unavailable'
  | 'network'
  | 'aborted'
  | 'unknown';

export interface TranscriptUpdate {
  /** All confirmed text so far, across pauses and automatic restarts. */
  finalText: string;
  /** Unconfirmed text for the current utterance. */
  interimText: string;
}

export interface TranscriptionCallbacks {
  onUpdate(update: TranscriptUpdate): void;
  onError(kind: RecognitionErrorKind, message: string): void;
}

/** A single speaking attempt. Audio is never recorded or stored by this interface. */
export interface TranscriptionSession {
  /** Stops listening but keeps text. Web Speech cannot pause, so this ends the current recognition. */
  pause(): void;
  /** Starts a new recognition and keeps appending to the same transcript. */
  resume(): void;
  /** Stops listening and resolves with the final transcript (after the browser flushes results). */
  finish(): Promise<string>;
  /** Stops immediately, drops text and releases the microphone. Idempotent. */
  abort(): void;
}

export interface SpeechRecognizer {
  detect(lang: string): Promise<SpeechCapabilities>;
  /** Asks the browser to download the on-device language pack. Resolves true on success. */
  installLocal(lang: string): Promise<boolean>;
  /**
   * Starts listening. Requests microphone permission (via the browser) on first use, so it must only be
   * called from an explicit user action. Resolves once recognition has actually started.
   */
  start(opts: { lang: string; location: ProcessingLocation } & TranscriptionCallbacks): Promise<TranscriptionSession>;
}

export class RecognitionError extends Error {
  readonly kind: RecognitionErrorKind;
  constructor(kind: RecognitionErrorKind, message: string) {
    super(message);
    this.name = 'RecognitionError';
    this.kind = kind;
  }
}
