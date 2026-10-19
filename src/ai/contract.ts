import { z } from 'zod';
import { DifficultySchema, RubricIdSchema } from '../domain/types';
import { CorrectionSchema, FactualConcernSchema } from '../evaluation/types';

/**
 * Contract between the browser and the optional /api/evaluate endpoint.
 * The browser sends only what evaluation needs — never audio, never identifiers about the user.
 */
export const MAX_TRANSCRIPT_CHARS = 12_000;

export const EvaluateRequestSchema = z.object({
  prompt: z.string().min(10).max(1000),
  category: z.string().min(2).max(80),
  difficulty: DifficultySchema,
  rubricId: RubricIdSchema,
  transcript: z.string().trim().min(1, 'Transcript is empty.').max(MAX_TRANSCRIPT_CHARS, 'Transcript is too long.'),
});
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;

/** What the model must return. Measured metrics (word count, WPM, fillers) are computed locally instead. */
export const AiAssessmentSchema = z.object({
  summary: z.string().min(1).max(600),
  criteria: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        score: z.number().min(0).max(100).nullable(),
        evidence: z.array(z.string().max(300)).max(4).default([]),
        note: z.string().max(400).default(''),
      }),
    )
    .min(1)
    .max(12),
  corrections: z.array(CorrectionSchema).max(8).default([]),
  conceptsMissing: z.array(z.string().max(160)).max(10).default([]),
  factualConcerns: z.array(FactualConcernSchema).max(6).default([]),
  structureNotes: z.array(z.string().max(300)).max(5).default([]),
  improvedAnswer: z.string().min(1).max(3000),
  nextSteps: z.array(z.string().max(300)).min(1).max(3),
});
export type AiAssessment = z.infer<typeof AiAssessmentSchema>;

export const ErrorCodeSchema = z.enum([
  'not-configured',
  'bad-request',
  'too-large',
  'rate-limited',
  'timeout',
  'upstream-error',
  'invalid-response',
]);
export type AiErrorCode = z.infer<typeof ErrorCodeSchema>;

export const EvaluateResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    providerLabel: z.string().max(120),
    assessment: AiAssessmentSchema,
    /** Number of model claims dropped because their quoted excerpt was not in the transcript. */
    ungroundedDropped: z.number().int().min(0),
  }),
  z.object({ ok: z.literal(false), code: ErrorCodeSchema, message: z.string().max(300), retryAfterSec: z.number().optional() }),
]);
export type EvaluateResponse = z.infer<typeof EvaluateResponseSchema>;

export const StatusResponseSchema = z.object({
  configured: z.boolean(),
  providerLabel: z.string().max(120).nullable(),
  dataNotice: z.string().max(400).nullable(),
});
export type StatusResponse = z.infer<typeof StatusResponseSchema>;
