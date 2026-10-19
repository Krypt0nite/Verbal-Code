import {
  QuestionFileSchema,
  TaxonomySchema,
  type Category,
  type Question,
  type Taxonomy,
} from '../types';
import { RUBRICS } from '../../evaluation/rubrics';

export interface QuestionBankIssue {
  source: string;
  message: string;
}

export interface QuestionBank {
  taxonomy: Taxonomy;
  questions: readonly Question[];
  /** Problems found while loading. Invalid questions are excluded, never silently "fixed". */
  issues: readonly QuestionBankIssue[];
}

/**
 * Validates the taxonomy and every question file, and cross-checks references:
 * category/subcategory must exist, ids must be unique, and every expected concept must point at a
 * concept-type criterion of the question's rubric.
 */
export function buildQuestionBank(
  rawTaxonomy: unknown,
  rawFiles: ReadonlyArray<{ source: string; data: unknown }>,
): QuestionBank {
  const tax = TaxonomySchema.safeParse(rawTaxonomy);
  if (!tax.success) {
    throw new Error(`Invalid taxonomy: ${tax.error.issues.map((i) => i.message).join('; ')}`);
  }
  const taxonomy = tax.data;
  const issues: QuestionBankIssue[] = [];
  const questions: Question[] = [];
  const seen = new Set<string>();

  for (const { source, data } of rawFiles) {
    const parsed = QuestionFileSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ source, message: `${issue.path.join('.')}: ${issue.message}` });
      }
      continue;
    }
    for (const q of parsed.data.questions) {
      const problem = checkQuestion(q, taxonomy, parsed.data.categoryId, seen);
      if (problem) {
        issues.push({ source, message: `${q.id}: ${problem}` });
        continue;
      }
      seen.add(q.id);
      questions.push(q);
    }
  }
  return { taxonomy, questions, issues };
}

function checkQuestion(q: Question, taxonomy: Taxonomy, fileCategory: string, seen: Set<string>): string | null {
  if (seen.has(q.id)) return 'duplicate question id';
  if (q.categoryId !== fileCategory) return `categoryId ${q.categoryId} does not match file category ${fileCategory}`;
  const cat = taxonomy.categories.find((c) => c.id === q.categoryId);
  if (!cat) return `unknown category ${q.categoryId}`;
  if (!cat.subcategories.some((s) => s.id === q.subcategoryId)) {
    return `unknown subcategory ${q.subcategoryId} for ${q.categoryId}`;
  }
  const rubric = RUBRICS[q.rubricId];
  const conceptCriteria = new Set(rubric.criteria.filter((c) => c.localSignal === 'concepts').map((c) => c.id));
  const conceptIds = new Set<string>();
  for (const concept of q.expectedConcepts) {
    if (conceptIds.has(concept.id)) return `duplicate concept id ${concept.id}`;
    conceptIds.add(concept.id);
    if (!conceptCriteria.has(concept.criterion)) {
      return `concept ${concept.id} references criterion ${concept.criterion}, which is not a concept criterion of rubric ${q.rubricId}`;
    }
  }
  return null;
}

export function findCategory(taxonomy: Taxonomy, categoryId: string | null): Category | undefined {
  return categoryId ? taxonomy.categories.find((c) => c.id === categoryId) : undefined;
}

export function subcategoryLabel(taxonomy: Taxonomy, categoryId: string, subcategoryId: string): string {
  return (
    findCategory(taxonomy, categoryId)?.subcategories.find((s) => s.id === subcategoryId)?.label ?? subcategoryId
  );
}
