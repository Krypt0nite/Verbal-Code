import { z } from 'zod';

/**
 * Topic profiles specialise a question's rubric for its subject (C++, Go, databases…). They never change
 * criterion ids, so question data and the AI contract stay compatible; they change what each criterion
 * means, describe a strong one-minute answer, and list common misconceptions the local evaluator can flag.
 */
export const TOPIC_IDS = [
  'dsa',
  'system-design',
  'cpp',
  'go',
  'programming-language',
  'databases',
  'networking',
  'operating-systems',
  'distributed-backend',
  'api-design',
  'frontend',
  'ai-ml',
  'security',
  'general-technical',
  'general',
] as const;
export const TopicIdSchema = z.enum(TOPIC_IDS);
export type TopicId = z.infer<typeof TopicIdSchema>;

/**
 * A common wrong claim, matched against the transcript. Patterns run on lowercased text where every
 * non-alphanumeric character became a space and apostrophes were dropped ("doesn't" → "doesnt").
 * Keep patterns narrow: a false alarm costs the user more than a missed one.
 */
export interface Misconception {
  id: string;
  pattern: RegExp;
  /** Shown to the user: what is actually true. */
  correction: string;
  /** "likely" only for claims that are wrong in every reasonable reading. */
  certainty: 'likely' | 'possible';
  /** Only check questions whose title or prompt contains one of these terms (lowercase). */
  when?: readonly string[];
  /** Skip if the transcript mentions any of these (the speaker is describing a valid variant). */
  unless?: readonly string[];
  /** The pattern itself expresses a negation, so do not treat "not" inside the match as a refutation. */
  negated?: boolean;
}

export interface CriterionOverride {
  label: string;
  description: string;
}

export interface TopicProfile {
  id: TopicId;
  label: string;
  /** Taxonomy subcategory ids this profile applies to. */
  subcategories: readonly string[];
  /** Per-criterion wording for this topic, keyed by rubric criterion id. Only ids in the question's rubric apply. */
  criteria: Readonly<Record<string, CriterionOverride>>;
  /** What a strong one-minute explanation in this topic contains. */
  strongAnswer: readonly string[];
  /** A speaking frame that fits about a minute. */
  oneMinuteFrame: string;
  misconceptions: readonly Misconception[];
}
