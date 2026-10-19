import { EvaluateResponseSchema, StatusResponseSchema, type AiErrorCode, type EvaluateRequest, type StatusResponse } from './contract';
import { computeMetrics, type EvaluationInput, type Evaluator } from '../evaluation/localEvaluator';
import { getRubric } from '../evaluation/rubrics';
import type { FeedbackReport } from '../evaluation/types';
import { questionBank } from '../domain/questions/bank';

export class AiEvaluationError extends Error {
  readonly code: AiErrorCode | 'network' | 'aborted';
  readonly retryAfterSec?: number;
  constructor(code: AiEvaluationError['code'], message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'AiEvaluationError';
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Builds the minimal payload: prompt, category, difficulty, rubric id and transcript. Nothing else. */
export function buildRequest({ question, transcript }: EvaluationInput): EvaluateRequest {
  const category = questionBank.taxonomy.categories.find((c) => c.id === question.categoryId);
  const sub = category?.subcategories.find((s) => s.id === question.subcategoryId);
  return {
    prompt: question.prompt,
    category: sub?.label ?? category?.label ?? question.categoryId,
    difficulty: question.difficulty,
    rubricId: question.rubricId,
    transcript,
  };
}

export async function fetchAiStatus(fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<StatusResponse> {
  try {
    const res = await fetchImpl('/api/evaluate', { method: 'GET', signal });
    if (!res.ok) return { configured: false, providerLabel: null, dataNotice: null };
    const parsed = StatusResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : { configured: false, providerLabel: null, dataNotice: null };
  } catch {
    return { configured: false, providerLabel: null, dataNotice: null };
  }
}

export function createAiEvaluator(fetchImpl: typeof fetch = (...a) => fetch(...a), timeoutMs = 90_000): Evaluator {
  // Longer than the server's whole fallback chain (AI_TOTAL_TIMEOUT_MS, 80 s by default).
  return {
    id: 'ai',
    async evaluate(input, signal) {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetchImpl('/api/evaluate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildRequest(input)),
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
        });
      } catch {
        if (signal?.aborted) throw new AiEvaluationError('aborted', 'Evaluation was cancelled.');
        if (controller.signal.aborted) throw new AiEvaluationError('timeout', 'AI evaluation timed out.');
        throw new AiEvaluationError('network', 'Could not reach the evaluation service. Check your connection.');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }

      let raw: unknown;
      try {
        raw = await res.json();
      } catch {
        throw new AiEvaluationError(res.status === 404 ? 'not-configured' : 'invalid-response', res.status === 404 ? 'No AI evaluation endpoint is deployed.' : 'The evaluation service returned an unreadable response.');
      }
      const parsed = EvaluateResponseSchema.safeParse(raw);
      if (!parsed.success) throw new AiEvaluationError('invalid-response', 'The evaluation service returned an unexpected response.');
      const body = parsed.data;
      if (!body.ok) throw new AiEvaluationError(body.code, body.message, body.retryAfterSec);
      return mergeAssessment(input, body.providerLabel, body.assessment, body.ungroundedDropped);
    },
  };
}

/** Combines model judgement with metrics measured locally (the model never supplies measurements). */
export function mergeAssessment(
  { question, transcript, spokenMs }: EvaluationInput,
  providerLabel: string,
  a: Extract<import('./contract').EvaluateResponse, { ok: true }>['assessment'],
  dropped: number,
): FeedbackReport {
  const rubric = getRubric(question.rubricId);
  const criteria = rubric.criteria.map((rc) => {
    const c = a.criteria.find((x) => x.id === rc.id);
    const score = c?.score ?? null;
    return {
      id: rc.id,
      label: rc.label,
      score,
      confidence: score === null ? ('not-assessed' as const) : ('model' as const),
      evidence: (c?.evidence ?? []).slice(0, 4).map((e) => `“${e}”`),
      note: c?.note || (score === null ? 'Not assessed.' : ''),
    };
  });
  let w = 0;
  let total = 0;
  rubric.criteria.forEach((rc, i) => {
    const s = criteria[i]?.score;
    if (s !== null && s !== undefined) {
      w += rc.weight;
      total += s * rc.weight;
    }
  });
  const metrics = computeMetrics(transcript, spokenMs);
  const limitations = [
    `Scored by ${providerLabel}. AI judgements can be wrong — check them against the evidence quotes.`,
    'The AI only saw the transcript text, not audio. Pronunciation, tone and pauses are not assessed.',
    'Word count, pace and filler counts are measured on this device from the transcript.',
  ];
  if (dropped > 0) {
    limitations.push(`${dropped} AI claim${dropped === 1 ? ' was' : 's were'} removed because the quoted text did not appear in your transcript.`);
  }
  const concisenessNotes = [
    ...(metrics.fillerCount > 0 ? [`Detected ${metrics.fillerCount} filler words: ${metrics.fillers.map((f) => `“${f.term}” ×${f.count}`).join(', ')}.`] : []),
    ...metrics.repeatedPhrases.slice(0, 3).map((r) => `“${r.phrase}” repeated ${r.count} times.`),
  ];
  return {
    evaluator: 'ai',
    evaluatorLabel: `AI evaluation — ${providerLabel}`,
    rubricId: question.rubricId,
    overallScore: w > 0 ? Math.round(total / w) : null,
    summary: a.summary,
    criteria,
    metrics,
    corrections: a.corrections,
    concisenessNotes,
    structureNotes: a.structureNotes,
    conceptsCovered: [],
    conceptsMissing: a.conceptsMissing,
    factualConcerns: a.factualConcerns,
    improvedAnswer: a.improvedAnswer,
    nextSteps: a.nextSteps,
    limitations,
  };
}
