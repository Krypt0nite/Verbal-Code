import { useEffect, useRef } from 'react';
import type { CriterionResult, FeedbackReport as Report } from '../evaluation/types';

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return <span className="score-na">Not assessed</span>;
  return (
    <span className="score-bar" aria-hidden="true">
      <span style={{ width: `${score}%` }} />
    </span>
  );
}

function Criterion({ c }: { c: CriterionResult }) {
  return (
    <li className="criterion">
      <div className="criterion-head">
        <span className="criterion-label">{c.label}</span>
        <span className="criterion-score">{c.score === null ? '—' : c.score}</span>
      </div>
      <ScoreBar score={c.score} />
      {c.note && <p className="criterion-note">{c.note}</p>}
      {c.evidence.length > 0 && (
        <ul className="evidence">
          {c.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export function FeedbackReport({ report }: { report: Report }) {
  const m = report.metrics;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Move focus to the new feedback so keyboard and screen-reader users land on it.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.closest('article')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [report]);
  return (
    <article className="report" aria-labelledby="report-title">
      <header className="report-head">
        <div>
          <h2 id="report-title" tabIndex={-1} ref={headingRef}>
            Feedback
          </h2>
          <p className="report-source">{report.evaluatorLabel}</p>
        </div>
        <p className="overall" aria-label={report.overallScore === null ? 'Overall score not available' : `Overall score ${report.overallScore} out of 100`}>
          <span className="overall-number">{report.overallScore ?? '—'}</span>
          <span className="overall-out">/100</span>
        </p>
      </header>
      <p className="report-summary">{report.summary}</p>

      {report.strengths.length > 0 && (
        <section className="report-section">
          <h3>What went well</h3>
          <ul className="notes strengths">
            {report.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="report-section">
        <h3>Rubric</h3>
        {report.rubricLabel && <p className="fineprint">Topic rubric: {report.rubricLabel}</p>}
        <ul className="criteria">
          {report.criteria.map((c) => (
            <Criterion key={c.id} c={c} />
          ))}
        </ul>
      </section>

      <section className="report-section">
        <h3>Measured from your transcript</h3>
        <dl className="metrics">
          <div>
            <dt>Words</dt>
            <dd>{m.wordCount}</dd>
          </div>
          <div>
            <dt>Speaking time</dt>
            <dd>{Math.round(m.durationSec)} s</dd>
          </div>
          <div>
            <dt>Words per minute</dt>
            <dd>{m.wordsPerMinute ?? '—'}</dd>
          </div>
          <div>
            <dt>Fillers detected</dt>
            <dd>{m.fillerCount}</dd>
          </div>
          <div>
            <dt>Lexical variety</dt>
            <dd>{pct(m.lexicalVariety)}</dd>
          </div>
          <div>
            <dt>Average sentence</dt>
            <dd>{m.averageSentenceLength === null ? 'No punctuation' : `${m.averageSentenceLength} words`}</dd>
          </div>
        </dl>
        <p className="fineprint">Text-based estimates. Pace is words in the transcript divided by speaking time; pauses and tone are not measured.</p>
      </section>

      {report.corrections.length > 0 && (
        <section className="report-section">
          <h3>Wording to improve</h3>
          <ul className="corrections">
            {report.corrections.map((c, i) => (
              <li key={i} className={`correction correction-${c.kind}`}>
                <p className="before">
                  <span className="visually-hidden">You said: </span>
                  {c.before}
                </p>
                <p className="after">
                  <span className="visually-hidden">Better: </span>
                  {c.after}
                </p>
                <p className="why">{c.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(report.conceptsCovered.length > 0 || report.conceptsMissing.length > 0) && (
        <section className="report-section concepts">
          <h3>Concepts</h3>
          {report.conceptsCovered.length > 0 && (
            <>
              <h4>Mentioned</h4>
              <ul className="concept-list covered">
                {report.conceptsCovered.map((c) => (
                  <li key={c.label}>
                    {c.label}
                    {c.depth === 'named' && <span className="concept-depth"> (named, not explained)</span>}
                    <span className="concept-evidence">“{c.evidence}”</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {report.conceptsMissing.length > 0 && (
            <>
              <h4>Not detected</h4>
              <ul className="concept-list missing">
                {report.conceptsMissing.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {report.factualConcerns.length > 0 && (
        <section className="report-section">
          <h3>Possible factual issues</h3>
          {report.evaluator === 'local' && (
            <p className="fineprint">Found by matching common misconceptions for this topic. If you said something different, or were describing the mistake, ignore it.</p>
          )}
          <ul className="corrections">
            {report.factualConcerns.map((f, i) => (
              <li key={i} className="correction">
                <p className="before">{f.excerpt}</p>
                <p className="why">
                  {f.certainty === 'possible' ? 'Possibly inaccurate: ' : 'Likely inaccurate: '}
                  {f.concern}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.recognitionNotes.length > 0 && (
        <section className="report-section">
          <h3>Possible speech recognition errors</h3>
          <ul className="notes">
            {report.recognitionNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      {(report.structureNotes.length > 0 || report.concisenessNotes.length > 0) && (
        <section className="report-section">
          <h3>Structure and conciseness</h3>
          <ul className="notes">
            {[...report.structureNotes, ...report.concisenessNotes].map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="report-section">
        <h3>Next steps</h3>
        <ol className="next-steps">
          {report.nextSteps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>

      <details className="model-answer">
        <summary>Show a model answer</summary>
        <p>{report.improvedAnswer}</p>
      </details>

      <details className="limitations">
        <summary>How this was scored</summary>
        <ul>
          {report.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
