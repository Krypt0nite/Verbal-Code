import { z } from 'zod';
import { RubricIdSchema } from '../domain/types';

/**
 * How trustworthy a criterion score is.
 * - heuristic:    computed from transcript text with documented rules (local evaluator)
 * - model:        judged by an AI model (may be wrong; always shown with evidence)
 * - not-assessed: no evidence available; no score is shown
 */
export const ConfidenceSchema = z.enum(['heuristic', 'model', 'not-assessed']);

export const CriterionResultSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(80),
  score: z.number().min(0).max(100).nullable(),
  confidence: ConfidenceSchema,
  /** Short transcript excerpts or measurements that support the score. */
  evidence: z.array(z.string().max(300)).max(6),
  note: z.string().max(400),
});
export type CriterionResult = z.infer<typeof CriterionResultSchema>;

export const CorrectionSchema = z.object({
  kind: z.enum(['grammar', 'phrasing', 'vocabulary']),
  before: z.string().min(1).max(300),
  after: z.string().min(1).max(300),
  explanation: z.string().min(1).max(300),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const FactualConcernSchema = z.object({
  excerpt: z.string().min(1).max(300),
  concern: z.string().min(1).max(400),
  certainty: z.enum(['likely', 'possible']),
});
export type FactualConcern = z.infer<typeof FactualConcernSchema>;

export const TranscriptMetricsSchema = z.object({
  wordCount: z.number().int().min(0),
  durationSec: z.number().min(0),
  wordsPerMinute: z.number().min(0).nullable(),
  sentenceCount: z.number().int().min(0).nullable(),
  averageSentenceLength: z.number().min(0).nullable(),
  fillers: z.array(z.object({ term: z.string(), count: z.number().int().min(1) })),
  fillerCount: z.number().int().min(0),
  repeatedPhrases: z.array(z.object({ phrase: z.string(), count: z.number().int().min(2) })),
  lexicalVariety: z.number().min(0).max(1).nullable(),
});
export type TranscriptMetrics = z.infer<typeof TranscriptMetricsSchema>;

export const FeedbackReportSchema = z.object({
  evaluator: z.enum(['local', 'ai']),
  evaluatorLabel: z.string().max(120),
  rubricId: RubricIdSchema,
  overallScore: z.number().min(0).max(100).nullable(),
  summary: z.string().max(600),
  criteria: z.array(CriterionResultSchema).min(1).max(12),
  metrics: TranscriptMetricsSchema,
  corrections: z.array(CorrectionSchema).max(12),
  concisenessNotes: z.array(z.string().max(300)).max(6),
  structureNotes: z.array(z.string().max(300)).max(6),
  conceptsCovered: z.array(z.object({ label: z.string(), evidence: z.string().max(300) })).max(20),
  conceptsMissing: z.array(z.string().max(160)).max(20),
  factualConcerns: z.array(FactualConcernSchema).max(8),
  improvedAnswer: z.string().max(3000),
  nextSteps: z.array(z.string().max(300)).min(1).max(3),
  limitations: z.array(z.string().max(300)).max(8),
});
export type FeedbackReport = z.infer<typeof FeedbackReportSchema>;
