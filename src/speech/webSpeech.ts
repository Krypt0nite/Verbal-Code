import {
  RecognitionError,
  type LocalAvailability,
  type ProcessingLocation,
  type RecognitionErrorKind,
  type SpeechCapabilities,
  type SpeechRecognizer,
  type TranscriptionCallbacks,
  type TranscriptionSession,
} from './types';

/* Minimal structural types for the Web Speech API (not in TypeScript's DOM lib). */
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SRAlternative | undefined;
}
interface SRResultEvent {
  readonly results: { readonly length: number; [index: number]: SRResult | undefined };
}
interface SRErrorEvent {
  readonly error: string;
}
export interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  /** Current spec (Chrome 139+): require on-device processing. */
  processLocally?: boolean;
  /** Older Chrome draft: 'ondevice-only'. */
  mode?: string;
  onresult: ((e: SRResultEvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type LocalOptions = { langs: string[]; processLocally: boolean };
export interface SRConstructor {
  new (): SRInstance;
  available?(opts: LocalOptions): Promise<string>;
  install?(opts: LocalOptions): Promise<boolean>;
  availableOnDevice?(lang: string): Promise<string>;
  installOnDevice?(lang: string): Promise<boolean>;
}

export function getRecognitionConstructor(win: unknown = globalThis): SRConstructor | null {
  const w = win as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function hasLocalApi(ctor: SRConstructor): boolean {
  return typeof ctor.available === 'function' || typeof ctor.availableOnDevice === 'function';
}

function toAvailability(value: string): LocalAvailability {
  switch (value) {
    case 'available':
    case 'downloadable':
    case 'downloading':
    case 'unavailable':
      return value;
    case 'readily':
      return 'available';
    case 'after-download':
      return 'downloadable';
    default:
      return 'unknown';
  }
}

/** Maps Web Speech error codes to our kinds and user-facing messages (no transcript content). */
export function mapRecognitionError(code: string, location: ProcessingLocation): { kind: RecognitionErrorKind; message: string } {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        kind: 'not-allowed',
        message: 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.',
      };
    case 'audio-capture':
      return { kind: 'audio-capture', message: 'No microphone was found, or another app is using it.' };
    case 'network':
      return {
        kind: 'network',
        message: 'The speech service could not be reached. Check your connection and try again.',
      };
    case 'language-not-supported':
      return location === 'local'
        ? {
            kind: 'local-unavailable',
            message: 'On-device recognition is not available for this language. Install the language pack or choose another language.',
          }
        : { kind: 'unsupported', message: 'This browser does not support speech recognition for the selected language.' };
    case 'aborted':
      return { kind: 'aborted', message: 'Listening was stopped.' };
    default:
      return { kind: 'unknown', message: 'Speech recognition stopped unexpectedly. Please try again.' };
  }
}

const MAX_RAPID_RESTARTS = 5;
const RAPID_WINDOW_MS = 3000;
const FINISH_FLUSH_TIMEOUT_MS = 2500;

type Phase = 'starting' | 'listening' | 'paused' | 'finishing' | 'done';

class WebSpeechSession implements TranscriptionSession {
  private phase: Phase = 'starting';
  private rec: SRInstance | null = null;
  private committed: string[] = [];
  private instanceFinal = '';
  private restarts: number[] = [];
  private finishResolvers: Array<(t: string) => void> = [];
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctor: SRConstructor,
    private readonly lang: string,
    private readonly location: ProcessingLocation,
    private readonly cb: TranscriptionCallbacks,
  ) {}

  /** Resolves when the first recognition instance starts; rejects with RecognitionError. */
  begin(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      this.spawn(
        () => {
          if (!settled) {
            settled = true;
            this.phase = 'listening';
            resolve();
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            this.phase = 'done';
            reject(err);
          }
        },
      );
    });
  }

  private spawn(onStarted?: () => void, onStartFailed?: (e: RecognitionError) => void): void {
    const rec = new this.ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    if (this.location === 'local') {
      // Require on-device processing. Never silently fall back to a cloud service.
      if (typeof this.ctor.available === 'function') rec.processLocally = true;
      else if (typeof this.ctor.availableOnDevice === 'function') rec.mode = 'ondevice-only';
      else {
        onStartFailed?.(new RecognitionError('local-unavailable', 'This browser does not offer on-device speech recognition.'));
        return;
      }
    }
    this.rec = rec;
    this.instanceFinal = '';
    let started = false;
    // A restarted instance that fails before starting must not leave the session silently deaf.
    const failBeforeStart = (err: RecognitionError) => {
      if (onStartFailed) onStartFailed(err);
      else {
        this.cb.onError(err.kind, err.message);
        this.abort();
      }
    };

    rec.onstart = () => {
      if (this.rec !== rec) return;
      started = true;
      onStarted?.();
    };
    rec.onresult = (e) => {
      if (this.rec !== rec || this.phase === 'done') return;
      let finalPart = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r?.[0]?.transcript ?? '';
        if (r?.isFinal) finalPart += ` ${text}`;
        else interim += ` ${text}`;
      }
      this.instanceFinal = normalise(finalPart);
      this.cb.onUpdate({ finalText: this.fullText(), interimText: normalise(interim) });
    };
    rec.onerror = (e) => {
      if (this.rec !== rec) return;
      if (e.error === 'no-speech') return; // silence: the end handler restarts if appropriate
      if (e.error === 'aborted' && this.phase !== 'listening') return; // we stopped it
      const { kind, message } = mapRecognitionError(e.error, this.location);
      if (!started) {
        this.teardown();
        failBeforeStart(new RecognitionError(kind, message));
        return;
      }
      this.cb.onError(kind, message);
      this.abort();
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.commitInstance();
      if (!started) {
        if (this.phase === 'listening' || this.phase === 'starting') {
          failBeforeStart(new RecognitionError('unknown', 'Speech recognition could not start.'));
        } else if (this.phase === 'finishing') this.resolveFinish();
        return;
      }
      if (this.phase === 'listening') {
        // Browsers end continuous recognition after silence; restart, but detect restart loops.
        const now = Date.now();
        this.restarts = this.restarts.filter((t) => now - t < RAPID_WINDOW_MS);
        this.restarts.push(now);
        if (this.restarts.length > MAX_RAPID_RESTARTS) {
          this.cb.onError('unknown', 'Speech recognition keeps stopping. Please check your microphone and try again.');
          this.abort();
          return;
        }
        this.spawn();
      } else if (this.phase === 'finishing') {
        this.resolveFinish();
      }
    };

    try {
      rec.start();
    } catch {
      failBeforeStart(new RecognitionError('unknown', 'Speech recognition could not start.'));
    }
  }

  private commitInstance(): void {
    if (this.instanceFinal) this.committed.push(this.instanceFinal);
    this.instanceFinal = '';
    this.cb.onUpdate({ finalText: this.fullText(), interimText: '' });
  }

  private fullText(): string {
    return normalise([...this.committed, this.instanceFinal].join(' '));
  }

  pause(): void {
    if (this.phase !== 'listening') return;
    this.phase = 'paused';
    this.rec?.stop(); // flushes pending results; onend commits them without restarting
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'listening';
    this.restarts = [];
    this.spawn();
  }

  finish(): Promise<string> {
    if (this.phase === 'done') return Promise.resolve(this.fullText());
    const wasActive = this.phase === 'listening';
    this.phase = 'finishing';
    const p = new Promise<string>((resolve) => this.finishResolvers.push(resolve));
    if (wasActive && this.rec) {
      this.rec.stop();
      this.finishTimer = setTimeout(() => this.resolveFinish(), FINISH_FLUSH_TIMEOUT_MS);
    } else {
      this.resolveFinish();
    }
    return p;
  }

  private resolveFinish(): void {
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.finishTimer = null;
    const text = this.fullText();
    this.teardown();
    this.phase = 'done';
    const resolvers = this.finishResolvers;
    this.finishResolvers = [];
    resolvers.forEach((r) => r(text));
  }

  abort(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.committed = [];
    this.instanceFinal = '';
    const resolvers = this.finishResolvers;
    this.finishResolvers = [];
    resolvers.forEach((r) => r(''));
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.teardown();
  }

  private teardown(): void {
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    rec.onresult = rec.onerror = rec.onend = rec.onstart = null;
    try {
      rec.abort(); // releases the microphone
    } catch {
      /* already stopped */
    }
  }
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function createWebSpeechRecognizer(win: unknown = globalThis): SpeechRecognizer {
  return {
    async detect(lang) {
      const ctor = getRecognitionConstructor(win);
      if (!ctor) return { supported: false, localApi: false, local: 'unavailable' } satisfies SpeechCapabilities;
      if (!hasLocalApi(ctor)) return { supported: true, localApi: false, local: 'unavailable' };
      try {
        const raw = ctor.available
          ? await ctor.available({ langs: [lang], processLocally: true })
          : await ctor.availableOnDevice!(lang);
        return { supported: true, localApi: true, local: toAvailability(raw) };
      } catch {
        return { supported: true, localApi: true, local: 'unknown' };
      }
    },

    async installLocal(lang) {
      const ctor = getRecognitionConstructor(win);
      if (!ctor) return false;
      try {
        if (ctor.install) return await ctor.install({ langs: [lang], processLocally: true });
        if (ctor.installOnDevice) return await ctor.installOnDevice(lang);
      } catch {
        return false;
      }
      return false;
    },

    async start({ lang, location, onUpdate, onError }) {
      const ctor = getRecognitionConstructor(win);
      if (!ctor) throw new RecognitionError('unsupported', 'This browser does not support speech recognition.');
      if (location === 'local' && !hasLocalApi(ctor)) {
        throw new RecognitionError('local-unavailable', 'This browser does not offer on-device speech recognition.');
      }
      const session = new WebSpeechSession(ctor, lang, location, { onUpdate, onError });
      await session.begin();
      return session;
    },
  };
}
