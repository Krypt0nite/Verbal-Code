import { z } from 'zod';

/** Difficulty levels, ordered from easiest to hardest. */
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export const DifficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof DifficultySchema>;

/** Rubric identifiers. Each maps to a category-specific rubric in src/evaluation/rubrics. */
export const RUBRIC_IDS = [
  'dsa',
  'system-design',
  'programming-language',
  'technical-concept',
  'communication',
  'behavioral',
  'general-explanation',
] as const;
export const RubricIdSchema = z.enum(RUBRIC_IDS);
export type RubricId = z.infer<typeof RubricIdSchema>;

/** Practice modes. */
export const PRACTICE_MODES = ['off-the-cuff', 'interview', 'deep-research', 'mock-interview'] as const;
export const PracticeModeSchema = z.enum(PRACTICE_MODES);
export type PracticeMode = z.infer<typeof PracticeModeSchema>;

const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase kebab-case slug');

export const SubcategorySchema = z.object({
  id: slug,
  label: z.string().min(2),
});
export type Subcategory = z.infer<typeof SubcategorySchema>;

export const CategorySchema = z.object({
  id: slug,
  label: z.string().min(2),
  description: z.string().min(5),
  subcategories: z.array(SubcategorySchema).min(1),
});
export type Category = z.infer<typeof CategorySchema>;

export const TaxonomySchema = z
  .object({
    version: z.number().int().positive(),
    categories: z.array(CategorySchema).min(1),
  })
  .superRefine((tax, ctx) => {
    const catIds = new Set<string>();
    for (const cat of tax.categories) {
      if (catIds.has(cat.id)) ctx.addIssue({ code: 'custom', message: `Duplicate category id: ${cat.id}` });
      catIds.add(cat.id);
      const subIds = new Set<string>();
      for (const sub of cat.subcategories) {
        if (subIds.has(sub.id))
          ctx.addIssue({ code: 'custom', message: `Duplicate subcategory id ${sub.id} in ${cat.id}` });
        subIds.add(sub.id);
      }
    }
  });
export type Taxonomy = z.infer<typeof TaxonomySchema>;

/**
 * A concept the speaker is expected to cover. `keywords` are lowercase phrases; a concept counts as
 * "mentioned" when any keyword appears in the transcript. This is deliberately simple and is labelled
 * as keyword-based evidence in the feedback report.
 */
export const ExpectedConceptSchema = z.object({
  id: slug,
  label: z.string().min(2),
  keywords: z.array(z.string().min(2)).min(1),
  /** Rubric criterion this concept supports (must exist in the question's rubric). */
  criterion: slug,
});
export type ExpectedConcept = z.infer<typeof ExpectedConceptSchema>;

export const QuestionSchema = z.object({
  id: slug,
  title: z.string().min(5).max(120),
  prompt: z.string().min(20).max(800),
  categoryId: slug,
  subcategoryId: slug,
  difficulty: DifficultySchema,
  suggestedDurationSec: z.number().int().min(60).max(600),
  tags: z.array(z.string().min(1)).min(1),
  rubricId: RubricIdSchema,
  modes: z.array(PracticeModeSchema).min(1),
  expectedConcepts: z.array(ExpectedConceptSchema).default([]),
  /** Curated preparation notes for Deep Research mode. Not live research. */
  researchContext: z.array(z.string().min(5)).optional(),
  /** Outline of a strong answer, shown after the attempt. */
  modelAnswer: z.string().min(20),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuestionFileSchema = z.object({
  categoryId: slug,
  questions: z.array(QuestionSchema).min(1),
});
export type QuestionFile = z.infer<typeof QuestionFileSchema>;

/** User-selected filter. `categoryId`/`subcategoryId` of null mean "all". */
export interface QuestionFilter {
  categoryId: string | null;
  subcategoryId: string | null;
  difficulty: Difficulty | null;
  mode: PracticeMode;
}
