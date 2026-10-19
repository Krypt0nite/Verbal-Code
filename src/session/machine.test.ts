import { describe, expect, it } from 'vitest';
import { initialSession, sessionReducer, type SessionEvent, type SessionState } from './machine';
import { questionBank } from '../domain/questions/bank';
import { evaluateLocally } from '../evaluation/localEvaluator';

const question = questionBank.questions[0]!;
const run = (events: SessionEvent[], from: SessionState = initialSession) => events.reduce(sessionReducer, from);

const toSpeaking: SessionEvent[] = [
  { type: 'SELECT', question },
  { type: 'REQUEST_MIC' },
  { type: 'MIC_READY', processing: 'local' },
];

describe('sessionReducer', () => {
  it('walks the happy path to completed', () => {
    let s = run([{ type: 'SELECT', question }, { type: 'START_PREP' }]);
    expect(s.status).toBe('preparing');
    s = run([{ type: 'PREP_DONE' }, { type: 'REQUEST_MIC' }], s);
    expect(s.status).toBe('requesting-mic');
    expect(s.attempt).toBe(1);
    s = run([{ type: 'MIC_READY', processing: 'local' }, { type: 'TRANSCRIPT', finalText: 'hello world', interimText: 'again' }], s);
    expect(s.status).toBe('speaking');
    expect(s.processing).toBe('local');
    s = run([{ type: 'FINISH', spokenMs: 30_000 }], s);
    expect(s.status).toBe('processing');
    expect(s.finalTranscript).toBe('hello world again');
    s = run([{ type: 'TRANSCRIPT_OK', attempt: 1, transcript: 'hello world again' }], s);
    expect(s.status).toBe('evaluating');
    const report = evaluateLocally({ question, transcript: 'x '.repeat(30), spokenMs: 30_000 });
    s = run([{ type: 'EVALUATED', attempt: 1, report }], s);
    expect(s.status).toBe('completed');
    expect(s.report).toBe(report);
  });

  it('ignores duplicate FINISH events (timer end + button + recognition end)', () => {
    let s = run([...toSpeaking, { type: 'FINISH', spokenMs: 60_000 }]);
    const after = s;
    s = run([{ type: 'FINISH', spokenMs: 61_000 }, { type: 'FINISH', spokenMs: 62_000 }], s);
    expect(s).toBe(after);
  });

  it('ignores stale async results from an earlier attempt', () => {
    let s = run([...toSpeaking, { type: 'FINISH', spokenMs: 1000 }, { type: 'TRANSCRIPT_OK', attempt: 1, transcript: 'hello world again' }]);
    s = run([{ type: 'CANCEL' }, { type: 'REQUEST_MIC' }, { type: 'MIC_READY', processing: 'cloud' }, { type: 'FINISH', spokenMs: 1000 }], s);
    expect(s.attempt).toBe(2);
    const report = evaluateLocally({ question, transcript: 'x '.repeat(30), spokenMs: 30_000 });
    const stale = run([{ type: 'TRANSCRIPT_OK', attempt: 1, transcript: 'hello world again' }, { type: 'EVALUATED', attempt: 1, report }], s);
    expect(stale.status).toBe('processing');
    expect(stale.report).toBeNull();
  });

  it('pause/resume only from valid states', () => {
    let s = run([{ type: 'SELECT', question }, { type: 'PAUSE' }]);
    expect(s.status).toBe('ready');
    s = run([{ type: 'REQUEST_MIC' }, { type: 'MIC_READY', processing: 'local' }, { type: 'PAUSE' }], s);
    expect(s.status).toBe('paused');
    s = run([{ type: 'PAUSE' }, { type: 'RESUME' }], s);
    expect(s.status).toBe('speaking');
  });

  it('cancel clears transcript but keeps the question', () => {
    const s = run([...toSpeaking, { type: 'TRANSCRIPT', finalText: 'secret words', interimText: '' }, { type: 'CANCEL' }]);
    expect(s.status).toBe('ready');
    expect(s.question).toBe(question);
    expect(s.finalTranscript).toBe('');
    expect(s.interimTranscript).toBe('');
  });

  it('discard clears everything', () => {
    const s = run([...toSpeaking, { type: 'TRANSCRIPT', finalText: 'secret words', interimText: 'x' }, { type: 'DISCARD' }]);
    expect(s).toEqual({ ...initialSession, attempt: 1 });
  });

  it('maps microphone failures to error states and clears speech', () => {
    const s = run([{ type: 'SELECT', question }, { type: 'REQUEST_MIC' }, { type: 'MIC_FAILED', kind: 'not-allowed', message: 'blocked' }]);
    expect(s.status).toBe('error');
    expect(s.error?.kind).toBe('mic-denied');
    const u = run([{ type: 'SELECT', question }, { type: 'REQUEST_MIC' }, { type: 'MIC_FAILED', kind: 'unsupported', message: 'x' }]);
    expect(u.error?.kind).toBe('unsupported');
  });

  it('recognition errors mid-speech move to error and drop the transcript', () => {
    const s = run([...toSpeaking, { type: 'TRANSCRIPT', finalText: 'abc', interimText: '' }, { type: 'RECOGNITION_ERROR', kind: 'network', message: 'offline' }]);
    expect(s.status).toBe('error');
    expect(s.error?.kind).toBe('network');
    expect(s.finalTranscript).toBe('');
  });

  it('insufficient transcripts go to a retry state without a report', () => {
    const s = run([...toSpeaking, { type: 'FINISH', spokenMs: 3000 }, { type: 'TRANSCRIPT_INSUFFICIENT', attempt: 1, reason: 'too short' }]);
    expect(s.status).toBe('insufficient');
    expect(s.report).toBeNull();
    expect(s.finalTranscript).toBe('');
    expect(run([{ type: 'RETRY' }], s).status).toBe('ready');
  });

  it('evaluation failure keeps the transcript in memory so a local retry is possible', () => {
    const s = run([...toSpeaking, { type: 'TRANSCRIPT', finalText: 'some words', interimText: '' }, { type: 'FINISH', spokenMs: 5000 }, { type: 'TRANSCRIPT_OK', attempt: 1, transcript: 'hello world again' }, { type: 'EVALUATION_FAILED', attempt: 1, message: 'provider down' }]);
    expect(s.status).toBe('error');
    expect(s.error?.kind).toBe('evaluation-error');
    expect(s.finalTranscript).toBe('hello world again');
    expect(run([{ type: 'RETRY_EVALUATION' }], s).status).toBe('evaluating');
  });

  it('does not allow selecting a new question mid-attempt', () => {
    const other = questionBank.questions[1]!;
    const s = run([...toSpeaking, { type: 'SELECT', question: other }]);
    expect(s.question).toBe(question);
  });
});
