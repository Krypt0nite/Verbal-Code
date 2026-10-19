import type { Question, QuestionFilter, Taxonomy } from '../types';

export type RandomSource = () => number;

export type FilterValidation = { ok: true } | { ok: false; message: string };

/** Rejects impossible category/subcategory combinations (e.g. a subcategory without its category). */
export function validateFilter(taxonomy: Taxonomy, filter: QuestionFilter): FilterValidation {
  if (filter.subcategoryId && !filter.categoryId) {
    return { ok: false, message: 'Choose a category before choosing a subcategory.' };
  }
  if (filter.categoryId) {
    const cat = taxonomy.categories.find((c) => c.id === filter.categoryId);
    if (!cat) return { ok: false, message: 'That category does not exist.' };
    if (filter.subcategoryId && !cat.subcategories.some((s) => s.id === filter.subcategoryId)) {
      return { ok: false, message: `"${filter.subcategoryId}" is not a subcategory of ${cat.label}.` };
    }
  }
  return { ok: true };
}

export function filterQuestions(questions: readonly Question[], filter: QuestionFilter): Question[] {
  return questions.filter(
    (q) =>
      (filter.categoryId === null || q.categoryId === filter.categoryId) &&
      (filter.subcategoryId === null || q.subcategoryId === filter.subcategoryId) &&
      (filter.difficulty === null || q.difficulty === filter.difficulty) &&
      q.modes.includes(filter.mode),
  );
}

export type SelectionResult =
  | { kind: 'ok'; question: Question; poolSize: number; repeated: boolean }
  | { kind: 'empty'; message: string }
  | { kind: 'invalid-filter'; message: string };

export interface SelectOptions {
  /** Most recent first. */
  recentIds?: readonly string[];
  random?: RandomSource;
}

/**
 * Picks a random question matching the filter.
 * - Never returns a recently used question while an unused one exists.
 * - If every candidate was used recently, returns the least recently used one (but never the most
 *   recent one when there is any alternative) and flags `repeated: true`.
 */
export function selectQuestion(
  taxonomy: Taxonomy,
  questions: readonly Question[],
  filter: QuestionFilter,
  { recentIds = [], random = Math.random }: SelectOptions = {},
): SelectionResult {
  const validation = validateFilter(taxonomy, filter);
  if (!validation.ok) return { kind: 'invalid-filter', message: validation.message };

  const pool = filterQuestions(questions, filter);
  if (pool.length === 0) {
    return {
      kind: 'empty',
      message: 'No questions match these filters yet. Try another difficulty, mode or "All subcategories".',
    };
  }

  const recent = new Set(recentIds);
  const fresh = pool.filter((q) => !recent.has(q.id));
  if (fresh.length > 0) {
    return { kind: 'ok', question: pick(fresh, random), poolSize: pool.length, repeated: false };
  }

  // Everything has been seen recently: choose the least recently used, avoiding the very last one.
  const lastId = recentIds[0];
  const ranked = [...pool].sort((a, b) => recentIds.indexOf(b.id) - recentIds.indexOf(a.id));
  const choice = ranked.find((q) => q.id !== lastId) ?? ranked[0];
  if (!choice) return { kind: 'empty', message: 'No questions available.' };
  return { kind: 'ok', question: choice, poolSize: pool.length, repeated: true };
}

function pick<T>(items: readonly T[], random: RandomSource): T {
  const r = random();
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(r * items.length)));
  const item = items[index];
  if (item === undefined) throw new Error('pick() called with empty list');
  return item;
}

/** Deterministic PRNG (mulberry32) for tests and reproducible mock-interview sequences. */
export function seededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a mock-interview sequence of distinct questions. */
export function buildSequence(
  taxonomy: Taxonomy,
  questions: readonly Question[],
  filter: QuestionFilter,
  length: number,
  random: RandomSource = Math.random,
): Question[] {
  const out: Question[] = [];
  const used: string[] = [];
  for (let i = 0; i < length; i++) {
    const r = selectQuestion(taxonomy, questions, filter, { recentIds: used, random });
    if (r.kind !== 'ok' || r.repeated) break;
    out.push(r.question);
    used.unshift(r.question.id);
  }
  return out;
}

/** Keeps a bounded most-recent-first history. */
export function pushRecent(recentIds: readonly string[], id: string, limit = 20): string[] {
  return [id, ...recentIds.filter((x) => x !== id)].slice(0, limit);
}
