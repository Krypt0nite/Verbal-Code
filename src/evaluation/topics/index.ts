import type { Question, RubricId } from '../../domain/types';
import { getRubric, type Rubric } from '../rubrics';
import { PROFILES } from './profiles';
import type { TopicId, TopicProfile } from './types';

export * from './types';
export { PROFILES } from './profiles';

const BY_ID = new Map<TopicId, TopicProfile>(PROFILES.map((p) => [p.id, p]));
const BY_SUBCATEGORY = new Map<string, TopicProfile>(PROFILES.flatMap((p) => p.subcategories.map((s) => [s, p] as const)));

/** Used when a question's subcategory has no profile of its own. */
const FALLBACK_BY_RUBRIC: Partial<Record<RubricId, TopicId>> = {
  dsa: 'dsa',
  'system-design': 'system-design',
  'programming-language': 'programming-language',
  'technical-concept': 'general-technical',
};

export function getTopicProfile(id: TopicId): TopicProfile {
  return BY_ID.get(id) ?? BY_ID.get('general')!;
}

/** Picks the topic profile from the question's subcategory, then its rubric, then the general profile. */
export function selectTopic(question: Pick<Question, 'subcategoryId' | 'rubricId'>): TopicProfile {
  return BY_SUBCATEGORY.get(question.subcategoryId) ?? getTopicProfile(FALLBACK_BY_RUBRIC[question.rubricId] ?? 'general');
}

/**
 * The rubric a question is actually scored with: the base rubric's criteria (same ids and weights), with
 * labels and descriptions specialised for the topic. Shared by the local evaluator and the AI endpoint.
 */
export function resolveRubric(rubricId: RubricId, topicId: TopicId): Rubric & { topicLabel: string } {
  const base = getRubric(rubricId);
  const topic = getTopicProfile(topicId);
  return {
    ...base,
    topicLabel: topic.label,
    criteria: base.criteria.map((c) => ({ ...c, ...(topic.criteria[c.id] ?? {}) })),
  };
}
