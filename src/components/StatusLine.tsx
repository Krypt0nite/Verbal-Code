import type { SessionState } from '../session/machine';
import { describeProcessing } from '../privacy/privacy';

const TEXT: Record<SessionState['status'], string> = {
  idle: 'Choose a topic to begin.',
  ready: 'Ready. Start when you are.',
  preparing: 'Preparing. Make notes in your head; nothing is being recorded.',
  'requesting-mic': 'Waiting for microphone permission…',
  speaking: 'Listening.',
  paused: 'Paused. Listening has stopped; the timer is frozen.',
  processing: 'Finishing the transcript…',
  evaluating: 'Preparing your feedback…',
  completed: 'Feedback ready.',
  insufficient: 'Not enough speech to evaluate.',
  error: 'Something needs your attention.',
};

export function StatusLine({ state, evaluatingWithAi }: { state: SessionState; evaluatingWithAi: boolean }) {
  const text = state.status === 'evaluating' && evaluatingWithAi ? 'Sending your transcript for AI feedback…' : TEXT[state.status];
  const live = state.status === 'speaking' || state.status === 'paused';
  return (
    <div className={`status status-${state.status}`}>
      <p role="status" aria-live="polite" className="status-text">
        <span className="status-dot" aria-hidden="true" />
        {text}
      </p>
      {live && state.processing && (
        <p className={`processing processing-${state.processing}`} title={describeProcessing(state.processing).detail}>
          {describeProcessing(state.processing).title}
        </p>
      )}
    </div>
  );
}
