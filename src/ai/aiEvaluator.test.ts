import { describe, expect, it, vi } from 'vitest';
import { AiEvaluationError, buildRequest, createAiEvaluator, fetchAiStatus } from './aiEvaluator';
import { questionBank } from '../domain/questions/bank';
import { FeedbackReportSchema } from '../evaluation/types';

const question = questionBank.questions.find((q) => q.id === 'dsa-binary-search-complexity')!;
const transcript = 'Binary search halves a sorted array each step so it takes log n time and constant space when iterative';
const input = { question, transcript, spokenMs: 40_000 };

const okBody = {
  ok: true,
  providerLabel: 'Test Provider',
  ungroundedDropped: 1,
  assessment: {
    summary: 'Good.',
    criteria: [{ id: 'time-complexity', score: 90, evidence: ['log n time'], note: 'Correct.' }],
    corrections: [],
    conceptsMissing: ['Edge cases'],
    factualConcerns: [],
    structureNotes: [],
    improvedAnswer: 'Better answer',
    nextSteps: ['Mention overflow.'],
  },
};

const respond = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('AI evaluator client', () => {
  it('sends only the minimal payload', () => {
    const req = buildRequest(input);
    expect(Object.keys(req).sort()).toEqual(['category', 'difficulty', 'prompt', 'rubricId', 'transcript']);
    expect(req.category).toBe('Data Structures & Algorithms');
  });

  it('builds a schema-valid report with locally measured metrics', async () => {
    const f = respond(okBody);
    const report = await createAiEvaluator(f).evaluate(input);
    expect(FeedbackReportSchema.safeParse(report).success).toBe(true);
    expect(report.evaluator).toBe('ai');
    expect(report.metrics.wordCount).toBe(transcript.split(' ').length);
    expect(report.criteria.find((c) => c.id === 'time-complexity')).toMatchObject({ score: 90, confidence: 'model' });
    expect(report.criteria.find((c) => c.id === 'reasoning')).toMatchObject({ score: null, confidence: 'not-assessed' });
    expect(report.limitations.join(' ')).toMatch(/removed because the quoted text/);
    const init = f.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe('omit');
  });

  it('surfaces typed errors for provider failures', async () => {
    await expect(createAiEvaluator(respond({ ok: false, code: 'rate-limited', message: 'slow down', retryAfterSec: 20 }, 429)).evaluate(input)).rejects.toMatchObject({
      code: 'rate-limited',
      retryAfterSec: 20,
    });
    await expect(createAiEvaluator(respond({ weird: true })).evaluate(input)).rejects.toMatchObject({ code: 'invalid-response' });
    await expect(createAiEvaluator(vi.fn().mockRejectedValue(new TypeError('offline'))).evaluate(input)).rejects.toMatchObject({ code: 'network' });
    const notJson = vi.fn().mockResolvedValue(new Response('<html>', { status: 404 }));
    await expect(createAiEvaluator(notJson).evaluate(input)).rejects.toMatchObject({ code: 'not-configured' });
  });

  it('times out and supports cancellation', async () => {
    const hang: typeof fetch = (_u, init) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    await expect(createAiEvaluator(hang, 20).evaluate(input)).rejects.toMatchObject({ code: 'timeout' });
    const c = new AbortController();
    const p = createAiEvaluator(hang, 10_000).evaluate(input, c.signal);
    c.abort();
    await expect(p).rejects.toBeInstanceOf(AiEvaluationError);
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
  });

  it('error messages never contain transcript text', async () => {
    const fails = [respond({ ok: false, code: 'upstream-error', message: 'down' }, 502), respond({ junk: 1 }), vi.fn().mockRejectedValue(new Error(transcript))];
    for (const f of fails) {
      const err = await createAiEvaluator(f).evaluate(input).catch((e: Error) => e);
      expect(String(err)).not.toContain('Binary search');
    }
  });

  it('status check degrades to not configured', async () => {
    expect(await fetchAiStatus(vi.fn().mockRejectedValue(new Error('x')))).toMatchObject({ configured: false });
    expect(await fetchAiStatus(respond({ configured: true, providerLabel: 'P', dataNotice: null }))).toMatchObject({ configured: true });
    expect(await fetchAiStatus(respond({ configured: 'yes' }))).toMatchObject({ configured: false });
  });
});
