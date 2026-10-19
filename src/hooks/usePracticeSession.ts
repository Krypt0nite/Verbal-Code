import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { initialSession, sessionReducer, type SessionState } from '../session/machine';
import { Countdown } from '../session/timer';
import type { Question } from '../domain/types';
import type { SpeechRecognizer, TranscriptionSession, ProcessingLocation } from '../speech/types';
import { RecognitionError } from '../speech/types';
import type { Evaluator } from '../evaluation/localEvaluator';
import { assessTranscriptQuality } from '../evaluation/analysis';
import { SessionPurger, type CleanupReason } from '../privacy/privacy';
import type { Cue } from '../session/sounds';

export interface PracticeDeps {
  recognizer: SpeechRecognizer;
  localEvaluator: Evaluator;
  aiEvaluator: Evaluator | null;
  playCue?: (cue: Cue) => void;
}

export interface PracticeConfig {
  speechMs: number;
  prepMs: number;
  language: string;
  location: ProcessingLocation;
  useAi: boolean;
}

export interface PracticeSession {
  state: SessionState;
  speechRemainingMs: number;
  prepRemainingMs: number;
  /** True once a "prep time is up" signal was given for the current question. */
  prepFinished: boolean;
  usedAi: boolean;
  select(question: Question): void;
  startPrep(): void;
  skipPrep(): void;
  startSpeaking(): Promise<void>;
  pause(): void;
  resume(): void;
  finish(): void;
  cancel(): void;
  retry(): void;
  discard(): void;
  evaluateLocallyInstead(): void;
}

export function usePracticeSession(deps: PracticeDeps, config: PracticeConfig): PracticeSession {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  }, [deps]);

  const [speechRemainingMs, setSpeechRemaining] = useState(config.speechMs);
  const [prepRemainingMs, setPrepRemaining] = useState(config.prepMs);
  const [prepFinished, setPrepFinished] = useState(false);
  const [usedAi, setUsedAi] = useState(false);

  const speechRef = useRef<TranscriptionSession | null>(null);
  const speechTimerRef = useRef<Countdown | null>(null);
  const prepTimerRef = useRef<Countdown | null>(null);
  const evalAbortRef = useRef<AbortController | null>(null);
  const finishingAttemptRef = useRef<number>(-1);
  const attemptRef = useRef(0);
  const warnedRef = useRef(false);

  const cue = useCallback((c: Cue) => depsRef.current.playCue?.(c), []);

  // Keep idle displays in sync with settings.
  useEffect(() => {
    if (!speechTimerRef.current) setSpeechRemaining(config.speechMs);
  }, [config.speechMs]);
  useEffect(() => {
    if (!prepTimerRef.current) setPrepRemaining(config.prepMs);
  }, [config.prepMs]);

  /** Releases microphone, timers and in-flight requests. Safe to call any time, any number of times. */
  const releaseResources = useCallback(() => {
    speechRef.current?.abort();
    speechRef.current = null;
    speechTimerRef.current?.cancel();
    speechTimerRef.current = null;
    prepTimerRef.current?.cancel();
    prepTimerRef.current = null;
    evalAbortRef.current?.abort();
    evalAbortRef.current = null;
  }, []);

  const purger = useMemo(() => new SessionPurger(), []);
  useEffect(() => purger.register(releaseResources), [purger, releaseResources]);

  const purge = useCallback(
    (reason: CleanupReason) => {
      purger.purge(reason);
      setSpeechRemaining(configRef.current.speechMs);
      setPrepRemaining(configRef.current.prepMs);
      setPrepFinished(false);
    },
    [purger],
  );

  const runEvaluation = useCallback(
    async (attempt: number, question: Question, transcript: string, spokenMs: number, forceLocal = false) => {
      const { aiEvaluator, localEvaluator } = depsRef.current;
      const evaluator = !forceLocal && configRef.current.useAi && aiEvaluator ? aiEvaluator : localEvaluator;
      setUsedAi(evaluator.id === 'ai');
      const controller = new AbortController();
      evalAbortRef.current = controller;
      try {
        const report = await evaluator.evaluate({ question, transcript, spokenMs }, controller.signal);
        if (controller.signal.aborted || attemptRef.current !== attempt) return;
        dispatch({ type: 'EVALUATED', attempt, report });
      } catch (err) {
        if (controller.signal.aborted || attemptRef.current !== attempt) return;
        const message = err instanceof Error && err.name === 'AiEvaluationError' ? err.message : 'Feedback could not be generated.';
        dispatch({ type: 'EVALUATION_FAILED', attempt, message });
      } finally {
        if (evalAbortRef.current === controller) evalAbortRef.current = null;
      }
    },
    [],
  );

  /** Single completion path for timer end, the Finish button, and recognition shutdown. */
  const completeSpeaking = useCallback(async () => {
    const s = stateRef.current;
    const attempt = attemptRef.current;
    if (finishingAttemptRef.current === attempt) return; // duplicate completion event
    if (s.status !== 'speaking' && s.status !== 'paused') return;
    finishingAttemptRef.current = attempt;
    const spokenMs = speechTimerRef.current?.elapsedMs ?? 0;
    speechTimerRef.current = null;
    dispatch({ type: 'FINISH', spokenMs });
    cue('end');
    const session = speechRef.current;
    speechRef.current = null;
    const transcript = session ? await session.finish() : s.finalTranscript;
    if (attemptRef.current !== attempt) return; // cancelled while flushing
    const quality = assessTranscriptQuality(transcript, spokenMs);
    if (!quality.ok) {
      dispatch({ type: 'TRANSCRIPT_INSUFFICIENT', attempt, reason: quality.reason ?? 'Not enough speech was captured.' });
      return;
    }
    dispatch({ type: 'TRANSCRIPT_OK', attempt, transcript });
    const question = stateRef.current.question ?? s.question;
    if (question) await runEvaluation(attempt, question, transcript, spokenMs);
  }, [cue, runEvaluation]);

  const select = useCallback(
    (question: Question) => {
      const status = stateRef.current.status;
      if (['requesting-mic', 'speaking', 'paused', 'processing', 'evaluating'].includes(status)) return;
      purge('new-question');
      dispatch({ type: 'SELECT', question });
    },
    [purge],
  );

  const startPrep = useCallback(() => {
    if (stateRef.current.status !== 'ready' || prepTimerRef.current) return;
    const ms = configRef.current.prepMs;
    if (ms <= 0) return;
    setPrepFinished(false);
    const timer = new Countdown({
      durationMs: ms,
      onTick: setPrepRemaining,
      onComplete: () => {
        prepTimerRef.current = null;
        setPrepFinished(true);
        cue('warning');
        dispatch({ type: 'PREP_DONE' });
      },
    });
    prepTimerRef.current = timer;
    dispatch({ type: 'START_PREP' });
    timer.start();
  }, [cue]);

  const skipPrep = useCallback(() => {
    prepTimerRef.current?.cancel();
    prepTimerRef.current = null;
    setPrepRemaining(configRef.current.prepMs);
    dispatch({ type: 'PREP_DONE' });
  }, []);

  const startSpeaking = useCallback(async () => {
    const status = stateRef.current.status;
    if (status !== 'ready' && status !== 'preparing') return;
    prepTimerRef.current?.cancel();
    prepTimerRef.current = null;
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    warnedRef.current = false;
    dispatch({ type: 'REQUEST_MIC' });
    const { language, location, speechMs } = configRef.current;
    let session: TranscriptionSession;
    try {
      session = await depsRef.current.recognizer.start({
        lang: language,
        location,
        onUpdate: (u) => {
          if (attemptRef.current === attempt) dispatch({ type: 'TRANSCRIPT', finalText: u.finalText, interimText: u.interimText });
        },
        onError: (kind, message) => {
          if (attemptRef.current !== attempt) return;
          speechRef.current = null;
          speechTimerRef.current?.cancel();
          speechTimerRef.current = null;
          dispatch({ type: 'RECOGNITION_ERROR', kind, message });
        },
      });
    } catch (err) {
      if (attemptRef.current !== attempt) return;
      const e = err instanceof RecognitionError ? err : new RecognitionError('unknown', 'Speech recognition could not start.');
      dispatch({ type: 'MIC_FAILED', kind: e.kind, message: e.message });
      return;
    }
    if (attemptRef.current !== attempt || stateRef.current.status !== 'requesting-mic') {
      session.abort(); // user cancelled while the permission prompt was open
      return;
    }
    speechRef.current = session;
    const timer = new Countdown({
      durationMs: speechMs,
      onTick: (ms) => {
        setSpeechRemaining(ms);
        if (!warnedRef.current && speechMs >= 60_000 && ms <= 10_000 && ms > 0) {
          warnedRef.current = true;
          cue('warning');
        }
      },
      onComplete: () => void completeSpeaking(),
    });
    speechTimerRef.current = timer;
    dispatch({ type: 'MIC_READY', processing: location });
    cue('start');
    timer.start();
  }, [completeSpeaking, cue]);

  const pause = useCallback(() => {
    if (stateRef.current.status !== 'speaking') return;
    speechTimerRef.current?.pause();
    speechRef.current?.pause();
    dispatch({ type: 'PAUSE' });
  }, []);

  const resume = useCallback(() => {
    if (stateRef.current.status !== 'paused') return;
    speechRef.current?.resume();
    speechTimerRef.current?.resume();
    dispatch({ type: 'RESUME' });
  }, []);

  const finish = useCallback(() => {
    const timer = speechTimerRef.current;
    if (timer) timer.finishNow(); // fires onComplete → completeSpeaking (exactly once)
    else void completeSpeaking();
  }, [completeSpeaking]);

  const cancel = useCallback(() => {
    attemptRef.current += 1; // invalidates every in-flight callback of the current attempt
    purge('cancel');
    dispatch({ type: 'CANCEL' });
  }, [purge]);

  const retry = useCallback(() => {
    purge('feedback-closed');
    dispatch({ type: 'RETRY' });
  }, [purge]);

  const discard = useCallback(() => {
    attemptRef.current += 1;
    purge('discard');
    dispatch({ type: 'DISCARD' });
  }, [purge]);

  const evaluateLocallyInstead = useCallback(() => {
    const s = stateRef.current;
    if (s.status !== 'error' || s.error?.kind !== 'evaluation-error' || !s.question) return;
    dispatch({ type: 'RETRY_EVALUATION' });
    void runEvaluation(attemptRef.current, s.question, s.finalTranscript, s.spokenMs, true);
  }, [runEvaluation]);

  // Throttled background tabs: re-check the clock as soon as the page is visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        speechTimerRef.current?.tick();
        prepTimerRef.current?.tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Release the microphone and drop in-memory speech when the page is closed or the hook unmounts.
  useEffect(() => {
    const onHide = (e: PageTransitionEvent) => {
      if (!e.persisted) purger.purge('page-hide');
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      purger.purge('unmount');
    };
  }, [purger]);

  return {
    state,
    speechRemainingMs,
    prepRemainingMs,
    prepFinished,
    usedAi,
    select,
    startPrep,
    skipPrep,
    startSpeaking,
    pause,
    resume,
    finish,
    cancel,
    retry,
    discard,
    evaluateLocallyInstead,
  };
}
