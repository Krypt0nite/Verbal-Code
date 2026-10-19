import { useCallback, useEffect, useMemo, useState } from 'react';
import { questionBank } from './domain/questions/bank';
import { buildSequence, pushRecent, selectQuestion } from './domain/questions/selector';
import { subcategoryLabel } from './domain/questions/repository';
import type { Difficulty, PracticeMode, Question, QuestionFilter } from './domain/types';
import { usePracticeSession } from './hooks/usePracticeSession';
import { createWebSpeechRecognizer } from './speech/webSpeech';
import type { SpeechCapabilities, SpeechRecognizer } from './speech/types';
import { localEvaluator, type Evaluator } from './evaluation/localEvaluator';
import { createAiEvaluator, fetchAiStatus } from './ai/aiEvaluator';
import type { StatusResponse } from './ai/contract';
import { clearStoredData, DEFAULT_PREFERENCES, loadPreferences, loadRecent, savePreferences, saveRecent, type Preferences } from './settings/preferences';
import { playCue } from './session/sounds';
import { PracticeControls } from './components/PracticeControls';
import { MODE_INFO } from './components/modes';
import { TimerDisplay } from './components/TimerDisplay';
import { StatusLine } from './components/StatusLine';
import { FeedbackReport } from './components/FeedbackReport';
import { SettingsDialog } from './components/SettingsDialog';
import { AiConsentDialog, CloudConsentDialog, PrivacyDialog } from './components/PrivacyDialogs';

export interface AppProps {
  recognizer?: SpeechRecognizer;
  aiEvaluator?: Evaluator;
  fetchStatus?: () => Promise<StatusResponse>;
}

const fmtMinutes = (sec: number) => `${Math.round((sec / 60) * 10) / 10} min`;

const DIFFICULTY_TEXT: Record<Difficulty, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

interface MockRun {
  questions: Question[];
  index: number;
  scores: Array<number | null>;
}

export default function App({ recognizer: injectedRecognizer, aiEvaluator: injectedAi, fetchStatus = fetchAiStatus }: AppProps) {
  const recognizer = useMemo(() => injectedRecognizer ?? createWebSpeechRecognizer(), [injectedRecognizer]);
  const aiEvaluator = useMemo(() => injectedAi ?? createAiEvaluator(), [injectedAi]);
  const { taxonomy, questions } = questionBank;

  const [prefs, setPrefs] = useState<Preferences>(() => loadPreferences());
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [capabilities, setCapabilities] = useState<SpeechCapabilities | null>(null);
  const [aiStatus, setAiStatus] = useState<StatusResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'settings' | 'privacy' | 'cloud-consent' | 'ai-consent'>(null);
  const [installing, setInstalling] = useState(false);
  const [mock, setMock] = useState<MockRun | null>(null);

  useEffect(() => savePreferences(prefs), [prefs]);

  useEffect(() => {
    let alive = true;
    recognizer.detect(prefs.language).then((c) => alive && setCapabilities(c));
    return () => {
      alive = false;
    };
  }, [recognizer, prefs.language]);

  useEffect(() => {
    let alive = true;
    fetchStatus().then((s) => alive && setAiStatus(s));
    return () => {
      alive = false;
    };
  }, [fetchStatus]);

  const mode = prefs.filter.mode;
  const location = prefs.recognition === 'cloud' && prefs.cloudConsent ? 'cloud' : 'local';
  const useAi = prefs.aiEvaluation && !!aiStatus?.configured;
  const prepSec = mode === 'off-the-cuff' ? 0 : mode === 'deep-research' ? prefs.researchPrepSec : prefs.prepSec;

  const session = usePracticeSession(
    { recognizer, localEvaluator, aiEvaluator: useAi ? aiEvaluator : null, playCue: prefs.soundEffects ? playCue : undefined },
    { speechMs: prefs.speechSec * 1000, prepMs: prepSec * 1000, language: prefs.language, location, useAi },
  );
  const { state } = session;
  const busy = ['requesting-mic', 'speaking', 'paused', 'processing', 'evaluating'].includes(state.status);

  const updateFilter = (patch: Partial<Preferences['filter']>) => setPrefs((p) => ({ ...p, filter: { ...p.filter, ...patch } }));

  const filter: QuestionFilter = {
    categoryId: prefs.filter.categoryId,
    subcategoryId: prefs.filter.subcategoryId,
    difficulty: prefs.filter.difficulty,
    mode,
  };

  const remember = useCallback((id: string) => {
    setRecent((r) => {
      const next = pushRecent(r, id);
      saveRecent(next);
      return next;
    });
  }, []);

  const generate = () => {
    setNotice(null);
    if (mode === 'mock-interview') {
      const seq = buildSequence(taxonomy, questions, filter, prefs.mockLength);
      if (seq.length === 0) {
        setNotice('No mock-interview questions match these filters. Try "All topics" or another difficulty.');
        return;
      }
      if (seq.length < prefs.mockLength) setNotice(`Only ${seq.length} matching question${seq.length === 1 ? '' : 's'} available for this mock interview.`);
      setMock({ questions: seq, index: 0, scores: [] });
      seq.forEach((q) => remember(q.id));
      session.select(seq[0]!);
      return;
    }
    setMock(null);
    const result = selectQuestion(taxonomy, questions, filter, { recentIds: recent });
    if (result.kind !== 'ok') {
      setNotice(result.message);
      return;
    }
    if (result.repeated) setNotice('You have practised every question in this selection recently, so this one is a repeat.');
    remember(result.question.id);
    session.select(result.question);
  };

  const nextMockQuestion = () => {
    if (!mock) return;
    const scores = [...mock.scores, state.report?.overallScore ?? null];
    const index = mock.index + 1;
    setMock({ ...mock, index, scores });
    const q = mock.questions[index];
    if (q) session.select(q);
  };

  const q = state.question;
  const canUseLocal = capabilities?.localApi && (capabilities.local === 'available' || capabilities.local === 'unknown');
  const needsTranscriptionChoice = !!capabilities && location === 'local' && !canUseLocal;

  const installLocal = async () => {
    setInstalling(true);
    const ok = await recognizer.installLocal(prefs.language);
    setInstalling(false);
    setCapabilities(await recognizer.detect(prefs.language));
    if (!ok) setNotice('The language pack could not be downloaded. You can try again or use cloud recognition.');
  };

  const mockDone = mock && state.status === 'completed' && mock.index === mock.questions.length - 1;

  return (
    <div className="app">
      <a className="skip-link" href="#stage">
        Skip to practice
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            V<span>c</span>
          </span>
          <div>
            <p className="brand-name">VerbalCode</p>
            <p className="brand-tag">Think aloud. Code clearly.</p>
          </div>
        </div>
        <nav className="topbar-actions" aria-label="App">
          <button type="button" className="button ghost" onClick={() => setDialog('privacy')}>
            Privacy
          </button>
          <button type="button" className="button ghost" onClick={() => setDialog('settings')} disabled={busy}>
            Settings
          </button>
        </nav>
      </header>

      <main className="main">
        <PracticeControls
          taxonomy={taxonomy}
          mode={mode}
          categoryId={prefs.filter.categoryId}
          subcategoryId={prefs.filter.subcategoryId}
          difficulty={prefs.filter.difficulty}
          disabled={busy}
          onModeChange={(m: PracticeMode) => updateFilter({ mode: m })}
          onCategoryChange={(categoryId) => updateFilter({ categoryId, subcategoryId: null })}
          onSubcategoryChange={(subcategoryId) => updateFilter({ subcategoryId })}
          onDifficultyChange={(difficulty) => updateFilter({ difficulty })}
          onGenerate={generate}
          generateLabel={mode === 'mock-interview' ? 'Start mock interview' : q ? 'New question' : 'Give me a question'}
        />

        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        <section id="stage" className="stage" aria-label="Current question" tabIndex={-1}>
          {!q ? (
            <div className="stage-empty">
              <h1 className="topic-title">Pick a topic and explain it out loud.</h1>
              <p className="topic-prompt">
                You'll get one question, a timer, and feedback on how clearly you explained it. Speak as if an interviewer is listening. Default speaking time is one minute.
              </p>
            </div>
          ) : (
            <>
              <p className="topic-meta">
                {mock && (
                  <span className="meta-mock">
                    Question {mock.index + 1} of {mock.questions.length}
                  </span>
                )}
                <span>{subcategoryLabel(taxonomy, q.categoryId, q.subcategoryId)}</span>
                <span>{DIFFICULTY_TEXT[q.difficulty]}</span>
                <span>Suggested {fmtMinutes(q.suggestedDurationSec)}</span>
              </p>
              <h1 className="topic-title">{q.title}</h1>
              <p className="topic-prompt">{q.prompt}</p>
              {q.suggestedDurationSec !== prefs.speechSec && state.status === 'ready' && (
                <button type="button" className="link-button" onClick={() => setPrefs((p) => ({ ...p, speechSec: q.suggestedDurationSec }))}>
                  Speak for the suggested {fmtMinutes(q.suggestedDurationSec)} instead of {fmtMinutes(prefs.speechSec)}
                </button>
              )}

              {mode === 'deep-research' && q.researchContext && ['ready', 'preparing'].includes(state.status) && (
                <aside className="research" aria-label="Preparation notes">
                  <h2>Preparation notes</h2>
                  <p className="fineprint">Curated notes for this question. VerbalCode does not search the web.</p>
                  <ul>
                    {q.researchContext.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </aside>
              )}

              {state.status === 'preparing' ? (
                <TimerDisplay remainingMs={session.prepRemainingMs} totalMs={prepSec * 1000} label="Preparation" running tone="prep" />
              ) : (
                <TimerDisplay
                  remainingMs={session.speechRemainingMs}
                  totalMs={prefs.speechSec * 1000}
                  label="Speaking time"
                  running={state.status === 'speaking'}
                />
              )}

              <StatusLine state={state} evaluatingWithAi={session.usedAi} />

              {needsTranscriptionChoice && state.status === 'ready' && (
                <div className="callout" role="note">
                  <p>
                    {!capabilities.supported
                      ? 'This browser has no speech recognition. Try a recent version of Chrome or Edge on desktop.'
                      : capabilities.local === 'downloadable'
                        ? "On-device recognition needs a one-time language pack download. It's processed on this device afterwards."
                        : "On-device recognition isn't available in this browser, so nothing will be sent anywhere unless you choose cloud recognition."}
                  </p>
                  <div className="actions">
                    {capabilities.local === 'downloadable' && (
                      <button type="button" className="button" onClick={installLocal} disabled={installing}>
                        {installing ? 'Downloading…' : 'Download language pack'}
                      </button>
                    )}
                    {capabilities.supported && (
                      <button type="button" className="button" onClick={() => setDialog('cloud-consent')}>
                        Use cloud recognition…
                      </button>
                    )}
                  </div>
                </div>
              )}

              {prefs.showLiveTranscript && (state.status === 'speaking' || state.status === 'paused') && (
                <p className="live-transcript" aria-live="off" ref={(el) => {
                    if (el) el.scrollTop = el.scrollHeight;
                  }}>
                  {state.finalTranscript} <span className="interim">{state.interimTranscript}</span>
                  {!state.finalTranscript && !state.interimTranscript && <span className="interim">Your words will appear here.</span>}
                </p>
              )}

              {state.status === 'paused' && (
                <p className="fineprint">Browsers can't pause recognition, so VerbalCode stops listening and starts again when you resume. Your text so far is kept.</p>
              )}

              {state.status === 'insufficient' && <p className="callout">{state.insufficientReason}</p>}
              {state.status === 'error' && state.error && (
                <div className="callout callout-error" role="alert">
                  <p>{state.error.message}</p>
                </div>
              )}

              <div className="actions session-actions">
                {state.status === 'ready' && (
                  <>
                    <button type="button" className="button primary large" onClick={() => void session.startSpeaking()} disabled={needsTranscriptionChoice}>
                      Start speaking
                    </button>
                    {prepSec > 0 && !session.prepFinished && (
                      <button type="button" className="button" onClick={session.startPrep}>
                        Prepare for {fmtMinutes(prepSec)}
                      </button>
                    )}
                  </>
                )}
                {state.status === 'preparing' && (
                  <>
                    <button type="button" className="button primary large" onClick={() => void session.startSpeaking()} disabled={needsTranscriptionChoice}>
                      Start speaking now
                    </button>
                    <button type="button" className="button" onClick={session.skipPrep}>
                      End preparation
                    </button>
                  </>
                )}
                {state.status === 'speaking' && (
                  <>
                    <button type="button" className="button primary large" onClick={session.finish}>
                      Finish
                    </button>
                    <button type="button" className="button" onClick={session.pause}>
                      Pause
                    </button>
                  </>
                )}
                {state.status === 'paused' && (
                  <>
                    <button type="button" className="button primary large" onClick={session.resume}>
                      Resume
                    </button>
                    <button type="button" className="button" onClick={session.finish}>
                      Finish
                    </button>
                  </>
                )}
                {['requesting-mic', 'speaking', 'paused', 'processing', 'evaluating', 'preparing'].includes(state.status) && (
                  <button type="button" className="button ghost" onClick={session.cancel}>
                    Cancel attempt
                  </button>
                )}
                {(state.status === 'insufficient' || state.status === 'error') && (
                  <button type="button" className="button primary" onClick={session.retry}>
                    Try again
                  </button>
                )}
                {state.status === 'error' && state.error?.kind === 'evaluation-error' && (
                  <button type="button" className="button" onClick={session.evaluateLocallyInstead}>
                    Use local feedback instead
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        {state.status === 'completed' && state.report && (
          <>
            <FeedbackReport report={state.report} />
            <div className="actions report-actions">
              {mock && !mockDone ? (
                <button type="button" className="button primary" onClick={nextMockQuestion}>
                  Next question ({mock.index + 2} of {mock.questions.length})
                </button>
              ) : (
                <button type="button" className="button primary" onClick={generate}>
                  New question
                </button>
              )}
              <button type="button" className="button" onClick={session.retry}>
                Try this question again
              </button>
              <button type="button" className="button ghost" onClick={session.discard}>
                Discard transcript and feedback
              </button>
            </div>
            {mockDone && (
              <section className="mock-summary" aria-label="Mock interview summary">
                <h2>Mock interview complete</h2>
                <ol>
                  {mock.questions.map((mq, i) => {
                    const score = i === mock.index ? (state.report?.overallScore ?? null) : (mock.scores[i] ?? null);
                    return (
                      <li key={mq.id}>
                        {mq.title} — {score === null ? 'not scored' : `${score}/100`}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <p>
          No audio is recorded. Transcripts stay in this tab's memory and are cleared when you discard, cancel, or leave.{' '}
          <button type="button" className="link-button" onClick={() => setDialog('privacy')}>
            How privacy works
          </button>
        </p>
        <p className="fineprint">{MODE_INFO[mode].label} mode. {questions.length} questions in the bank.</p>
      </footer>

      <SettingsDialog
        open={dialog === 'settings'}
        prefs={prefs}
        capabilities={capabilities}
        aiStatus={aiStatus}
        installing={installing}
        onInstallLocal={installLocal}
        onChange={setPrefs}
        onClose={() => setDialog(null)}
        onRequestAiConsent={() => setDialog('ai-consent')}
        onRequestCloudConsent={() => setDialog('cloud-consent')}
      />
      <PrivacyDialog
        open={dialog === 'privacy'}
        onClose={() => setDialog(null)}
        onClearData={() => {
          clearStoredData();
          setPrefs(DEFAULT_PREFERENCES);
          setRecent([]);
          setDialog(null);
          setNotice('Stored settings and question history were cleared.');
        }}
      />
      <CloudConsentDialog
        open={dialog === 'cloud-consent'}
        onAccept={() => {
          setPrefs((p) => ({ ...p, cloudConsent: true, recognition: 'cloud' }));
          setDialog(null);
        }}
        onDecline={() => setDialog(null)}
      />
      <AiConsentDialog
        open={dialog === 'ai-consent'}
        providerLabel={aiStatus?.providerLabel ?? null}
        dataNotice={aiStatus?.dataNotice ?? null}
        onAccept={() => {
          setPrefs((p) => ({ ...p, aiEvaluation: true }));
          setDialog('settings');
        }}
        onDecline={() => setDialog('settings')}
      />
    </div>
  );
}
