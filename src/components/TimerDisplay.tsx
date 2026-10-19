import { announcementMilestoneSec as milestone, describeRemaining, formatClock } from '../session/timer';

interface Props {
  remainingMs: number;
  totalMs: number;
  label: string;
  running: boolean;
  tone?: 'speech' | 'prep';
}

/**
 * Large serif countdown. The visible digits update every tick; the screen-reader announcement only at
 * meaningful moments (each minute, 30s, 10s, 0) so assistive tech is not flooded.
 */
export function TimerDisplay({ remainingMs, totalMs, label, running, tone = 'speech' }: Props) {
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const announcement = running ? describeRemaining(milestone(remainingMs) * 1000) : '';

  const low = running && tone === 'speech' && remainingMs <= 10_000;
  return (
    <div className={`timer timer-${tone}${low ? ' timer-low' : ''}${running ? ' is-running' : ''}`}>
      <span className="timer-label">{label}</span>
      <span className="timer-digits" role="timer" aria-label={`${label}: ${describeRemaining(remainingMs)}`}>
        {formatClock(remainingMs)}
      </span>
      <span className="timer-rule" aria-hidden="true">
        <span style={{ transform: `scaleX(${fraction})` }} />
      </span>
      <span className="visually-hidden" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

