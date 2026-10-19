import type { RubricId } from '../../domain/types';

/**
 * How the *local* evaluator gathers evidence for a criterion. Every signal is computed from transcript
 * text only — never from audio. See EVALUATION.md.
 *
 * - concepts:    share of the question's expected concepts (mapped to this criterion) that were mentioned
 * - structure:   signposting / sequencing language and sentence organisation
 * - examples:    explicit example markers ("for example", "imagine", "let's say" ...)
 * - grammar:     detectable grammar patterns (a small, conservative rule set)
 * - vocabulary:  lexical variety and vague-word usage
 * - conciseness: filler words, repeated phrases, hedging
 * - directness:  whether the first sentence engages the question rather than warming up
 * - relevance:   overall concept coverage across the whole question
 */
export type LocalSignal =
  | 'concepts'
  | 'structure'
  | 'examples'
  | 'grammar'
  | 'vocabulary'
  | 'conciseness'
  | 'directness'
  | 'relevance';

export interface RubricCriterion {
  id: string;
  label: string;
  description: string;
  weight: number;
  localSignal: LocalSignal;
}

export interface Rubric {
  id: RubricId;
  label: string;
  criteria: readonly RubricCriterion[];
}

const c = (
  id: string,
  label: string,
  description: string,
  localSignal: LocalSignal,
  weight = 1,
): RubricCriterion => ({ id, label, description, localSignal, weight });

export const RUBRICS: Readonly<Record<RubricId, Rubric>> = {
  dsa: {
    id: 'dsa',
    label: 'Data structures & algorithms',
    criteria: [
      c('correctness', 'Correctness of explanation', 'The algorithm or data structure is described accurately.', 'concepts', 2),
      c('reasoning', 'Step-by-step reasoning', 'The explanation proceeds in a clear order: idea, steps, why it works.', 'structure', 1.5),
      c('time-complexity', 'Time complexity', 'States and justifies the running time.', 'concepts', 1.5),
      c('space-complexity', 'Space complexity', 'States and justifies the extra memory used.', 'concepts'),
      c('edge-cases', 'Edge cases', 'Mentions empty input, duplicates, overflow, boundaries, etc.', 'concepts'),
      c('alternatives', 'Alternative approaches', 'Compares with at least one other approach.', 'concepts'),
    ],
  },
  'system-design': {
    id: 'system-design',
    label: 'System design',
    criteria: [
      c('requirements', 'Requirements', 'Clarifies functional and non-functional requirements and scale.', 'concepts', 1.5),
      c('architecture', 'High-level architecture', 'Names the main components and how they connect.', 'concepts', 1.5),
      c('data-flow', 'Data flow', 'Walks through how a request or event moves through the system.', 'structure'),
      c('scaling', 'Scaling strategy', 'Explains how the design handles growth.', 'concepts'),
      c('reliability', 'Reliability', 'Covers replication, redundancy, retries or recovery.', 'concepts'),
      c('bottlenecks', 'Bottlenecks', 'Identifies the likely bottlenecks or hot spots.', 'concepts'),
      c('consistency-failure', 'Consistency & failure handling', 'Discusses consistency model and partial failures.', 'concepts'),
      c('trade-offs', 'Trade-offs', 'Names what is given up for what is gained.', 'concepts', 1.5),
    ],
  },
  'programming-language': {
    id: 'programming-language',
    label: 'Programming language concept',
    criteria: [
      c('correctness', 'Correctness of the concept', 'The concept is described accurately.', 'concepts', 2),
      c('terminology', 'Terminology', 'Uses the precise technical terms.', 'concepts'),
      c('examples', 'Examples', 'Grounds the idea in a concrete code-level example.', 'examples'),
      c('practical-implications', 'Practical implications', 'Explains why it matters in real code.', 'concepts'),
      c('pitfalls', 'Common pitfalls', 'Names mistakes people make with it.', 'concepts'),
    ],
  },
  'technical-concept': {
    id: 'technical-concept',
    label: 'Engineering concept',
    criteria: [
      c('correctness', 'Correctness', 'The core idea is explained accurately.', 'concepts', 2),
      c('mechanism', 'How it works', 'Explains the mechanism, not just the definition.', 'concepts', 1.5),
      c('examples', 'Concrete example', 'Uses a realistic scenario or example.', 'examples'),
      c('trade-offs', 'Trade-offs & failure modes', 'Covers costs, limitations or failure modes.', 'concepts'),
      c('structure', 'Structure', 'Answer is organised: definition, mechanism, example, trade-off.', 'structure'),
    ],
  },
  communication: {
    id: 'communication',
    label: 'Communication',
    criteria: [
      c('directness', 'Directness', 'Gets to the point in the first sentence.', 'directness'),
      c('organization', 'Logical organisation', 'Ideas follow a clear order with signposting.', 'structure'),
      c('grammar', 'Grammar', 'Sentences are grammatical.', 'grammar'),
      c('vocabulary', 'Vocabulary', 'Word choice is precise and varied.', 'vocabulary'),
      c('conciseness', 'Conciseness', 'Few fillers, repetitions or hedges.', 'conciseness'),
      c('relevance', 'Answer relevance', 'The answer addresses the question asked.', 'relevance'),
    ],
  },
  behavioral: {
    id: 'behavioral',
    label: 'Behavioral interview (STAR+R)',
    criteria: [
      c('context', 'Context', 'Sets up the situation briefly.', 'concepts'),
      c('responsibility', 'Responsibility', 'Makes your own role and task clear.', 'concepts'),
      c('actions', 'Actions', 'Describes what *you* did, specifically.', 'concepts', 1.5),
      c('results', 'Results', 'States the outcome, ideally measurable.', 'concepts', 1.5),
      c('reflection', 'Reflection', 'Says what you learned or would change.', 'concepts'),
      c('organization', 'Story structure', 'The story follows a clear sequence.', 'structure'),
    ],
  },
  'general-explanation': {
    id: 'general-explanation',
    label: 'General explanation',
    criteria: [
      c('accuracy', 'Key ideas covered', 'Mentions the central ideas of the topic.', 'concepts', 1.5),
      c('organization', 'Organisation', 'Has a clear beginning, middle and conclusion.', 'structure'),
      c('examples', 'Examples', 'Uses an example or analogy.', 'examples'),
      c('vocabulary', 'Vocabulary', 'Word choice is precise and varied.', 'vocabulary'),
      c('conciseness', 'Conciseness', 'Few fillers, repetitions or hedges.', 'conciseness'),
    ],
  },
};

export function getRubric(id: RubricId): Rubric {
  return RUBRICS[id];
}

/** Criterion ids that expected concepts may reference (signal === 'concepts'). */
export function conceptCriteria(id: RubricId): string[] {
  return RUBRICS[id].criteria.filter((cr) => cr.localSignal === 'concepts').map((cr) => cr.id);
}
