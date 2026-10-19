import type { Question } from '../domain/types';
import type { FeedbackReport } from '../evaluation/types';
import type { RecognitionErrorKind, ProcessingLocation } from '../speech/types';

/**
 * Practice-session lifecycle.
 *
 *   idle ─SELECT→ ready ─START_PREP→ preparing ─PREP_DONE→ ready
 *   ready ─REQUEST_MIC→ requesting-mic ─MIC_READY→ speaking ⇄ paused
 *   speaking|paused ─FINISH→ processing ─TRANSCRIPT_OK→ evaluating ─EVALUATED→ completed
 *                                       └TRANSCRIPT_INSUFFICIENT→ insufficient
 *   any non-terminal ─CANCEL→ ready (question kept) ; DISCARD → idle (everything cleared)
 *   errors: mic-denied | unsupported | recognition-error | evaluation-error
 *
 * The reducer is pure. Events that are not valid in the current state are ignored, which makes
 * duplicate completion events (timer end + user click + recognition end) harmless.
 */

export type SessionStatus =
  | 'idle'
  | 'ready'
  | 'preparing'
  | 'requesting-mic'
  | 'speaking'
  | 'paused'
  | 'processing'
  | 'evaluating'
  | 'completed'
  | 'insufficient'
  | 'error';

export type SessionErrorKind =
  | 'mic-denied'
  | 'no-microphone'
  | 'unsupported'
  | 'local-unavailable'
  | 'recognition-error'
  | 'network'
  | 'evaluation-error';

export interface SessionError {
  kind: SessionErrorKind;
  /** User-facing message. Must never contain transcript content. */
  message: string;
}

export interface SessionState {
  status: SessionStatus;
  question: Question | null;
  /** Incremented for each new speaking attempt; async results for older attempts are ignored. */
  attempt: number;
  finalTranscript: string;
  interimTranscript: string;
  /** Actual speaking time in ms (excludes paused time). */
  spokenMs: number;
  processing: ProcessingLocation | null;
  report: FeedbackReport | null;
  error: SessionError | null;
  insufficientReason: string | null;
}

export type SessionEvent =
  | { type: 'SELECT'; question: Question }
  | { type: 'START_PREP' }
  | { type: 'PREP_DONE' }
  | { type: 'REQUEST_MIC' }
  | { type: 'MIC_READY'; processing: ProcessingLocation }
  | { type: 'MIC_FAILED'; kind: RecognitionErrorKind; message: string }
  | { type: 'TRANSCRIPT'; finalText: string; interimText: string }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'FINISH'; spokenMs: number }
  | { type: 'TRANSCRIPT_OK'; attempt: number; transcript: string }
  | { type: 'RETRY_EVALUATION' }
  | { type: 'TRANSCRIPT_INSUFFICIENT'; attempt: number; reason: string }
  | { type: 'EVALUATED'; attempt: number; report: FeedbackReport }
  | { type: 'EVALUATION_FAILED'; attempt: number; message: string }
  | { type: 'RECOGNITION_ERROR'; kind: RecognitionErrorKind; message: string }
  | { type: 'CANCEL' }
  | { type: 'RETRY' }
  | { type: 'DISCARD' };

export const initialSession: SessionState = {
  status: 'idle',
  question: null,
  attempt: 0,
  finalTranscript: '',
  interimTranscript: '',
  spokenMs: 0,
  processing: null,
  report: null,
  error: null,
  insufficientReason: null,
};

/** Clears everything derived from the user's speech while keeping the question. */
function clearSpeech(state: SessionState): SessionState {
  return {
    ...state,
    finalTranscript: '',
    interimTranscript: '',
    spokenMs: 0,
    processing: null,
    report: null,
    error: null,
    insufficientReason: null,
  };
}

const ACTIVE: readonly SessionStatus[] = ['requesting-mic', 'speaking', 'paused'];

export function micErrorToSession(kind: RecognitionErrorKind, message: string): SessionError {
  switch (kind) {
    case 'not-allowed':
      return { kind: 'mic-denied', message };
    case 'audio-capture':
      return { kind: 'no-microphone', message };
    case 'unsupported':
      return { kind: 'unsupported', message };
    case 'local-unavailable':
      return { kind: 'local-unavailable', message };
    case 'network':
      return { kind: 'network', message };
    default:
      return { kind: 'recognition-error', message };
  }
}

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'SELECT':
      if (ACTIVE.includes(state.status) || state.status === 'processing' || state.status === 'evaluating') return state;
      return { ...clearSpeech(state), status: 'ready', question: event.question };

    case 'START_PREP':
      return state.status === 'ready' ? { ...state, status: 'preparing' } : state;

    case 'PREP_DONE':
      return state.status === 'preparing' ? { ...state, status: 'ready' } : state;

    case 'REQUEST_MIC':
      if (state.status !== 'ready' && state.status !== 'preparing') return state;
      return { ...clearSpeech(state), status: 'requesting-mic', attempt: state.attempt + 1 };

    case 'MIC_READY':
      return state.status === 'requesting-mic' ? { ...state, status: 'speaking', processing: event.processing } : state;

    case 'MIC_FAILED':
      if (state.status !== 'requesting-mic') return state;
      return { ...clearSpeech(state), status: 'error', error: micErrorToSession(event.kind, event.message) };

    case 'TRANSCRIPT':
      if (state.status !== 'speaking' && state.status !== 'paused') return state;
      return { ...state, finalTranscript: event.finalText, interimTranscript: event.interimText };

    case 'PAUSE':
      return state.status === 'speaking' ? { ...state, status: 'paused' } : state;

    case 'RESUME':
      return state.status === 'paused' ? { ...state, status: 'speaking' } : state;

    case 'FINISH':
      if (state.status !== 'speaking' && state.status !== 'paused') return state;
      return {
        ...state,
        status: 'processing',
        spokenMs: Math.max(0, event.spokenMs),
        // Provisional text; the recogniser's flushed final transcript replaces it in TRANSCRIPT_OK.
        finalTranscript: joinTranscript(state.finalTranscript, state.interimTranscript),
        interimTranscript: '',
      };

    case 'TRANSCRIPT_OK':
      if (state.status !== 'processing' || event.attempt !== state.attempt) return state;
      return { ...state, status: 'evaluating', finalTranscript: event.transcript };

    case 'RETRY_EVALUATION':
      if (state.status !== 'error' || state.error?.kind !== 'evaluation-error' || !state.finalTranscript) return state;
      return { ...state, status: 'evaluating', error: null };

    case 'TRANSCRIPT_INSUFFICIENT':
      if (state.status !== 'processing' || event.attempt !== state.attempt) return state;
      return { ...clearSpeech(state), status: 'insufficient', insufficientReason: event.reason };

    case 'EVALUATED':
      if (state.status !== 'evaluating' || event.attempt !== state.attempt) return state;
      return { ...state, status: 'completed', report: event.report };

    case 'EVALUATION_FAILED':
      if (state.status !== 'evaluating' || event.attempt !== state.attempt) return state;
      // Keep the transcript so the user can retry evaluation locally; it is still memory-only.
      return { ...state, status: 'error', error: { kind: 'evaluation-error', message: event.message } };

    case 'RECOGNITION_ERROR':
      if (!ACTIVE.includes(state.status)) return state;
      return { ...clearSpeech(state), status: 'error', error: micErrorToSession(event.kind, event.message) };

    case 'CANCEL':
      if (state.status === 'idle') return state;
      return { ...clearSpeech(state), status: state.question ? 'ready' : 'idle' };

    case 'RETRY':
      if (!['completed', 'insufficient', 'error'].includes(state.status)) return state;
      return { ...clearSpeech(state), status: state.question ? 'ready' : 'idle' };

    case 'DISCARD':
      return { ...initialSession, attempt: state.attempt };
  }
}

function joinTranscript(finalText: string, interim: string): string {
  return [finalText.trim(), interim.trim()].filter(Boolean).join(' ');
}

export function isBusy(status: SessionStatus): boolean {
  return ['requesting-mic', 'speaking', 'paused', 'processing', 'evaluating'].includes(status);
}
