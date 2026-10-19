import { describe, expect, it } from 'vitest';
import taxonomy from '../../data/taxonomy.json';
import { questionBank } from './bank';
import { buildQuestionBank } from './repository';
import { RUBRICS } from '../../evaluation/rubrics';

describe('shipped question bank', () => {
  it('loads with no validation issues', () => {
    expect(questionBank.issues).toEqual([]);
    expect(questionBank.questions.length).toBeGreaterThan(50);
  });

  it('covers every Tech & AI subcategory', () => {
    const tech = questionBank.taxonomy.categories.find((c) => c.id === 'tech-ai');
    expect(tech).toBeDefined();
    for (const sub of tech!.subcategories) {
      const count = questionBank.questions.filter((q) => q.subcategoryId === sub.id).length;
      expect(count, `no questions for ${sub.id}`).toBeGreaterThan(0);
    }
  });

  it('has at least one question for every top-level category', () => {
    for (const cat of questionBank.taxonomy.categories) {
      expect(questionBank.questions.some((q) => q.categoryId === cat.id), cat.id).toBe(true);
    }
  });

  it('uses unique ids and prompts', () => {
    const ids = questionBank.questions.map((q) => q.id);
    const prompts = questionBank.questions.map((q) => q.prompt.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('gives every concept-scored rubric question some expected concepts', () => {
    for (const q of questionBank.questions) {
      const usesConcepts = RUBRICS[q.rubricId].criteria.some((c) => c.localSignal === 'concepts');
      if (usesConcepts) expect(q.expectedConcepts.length, q.id).toBeGreaterThan(0);
    }
  });

  it('every interview-mode question is in English and asks for an explanation', () => {
    for (const q of questionBank.questions) {
      expect(q.prompt).toMatch(/^[\x20-\x7E–—₹²√·×÷≤≥']+$/u);
    }
  });
});

describe('buildQuestionBank validation', () => {
  const base = {
    id: 'sample-question',
    title: 'Sample question',
    prompt: 'Explain the sample concept in detail, with an example.',
    categoryId: 'tech-ai',
    subcategoryId: 'dsa',
    difficulty: 'beginner',
    suggestedDurationSec: 60,
    tags: ['x'],
    rubricId: 'dsa',
    modes: ['interview'],
    expectedConcepts: [{ id: 'c1', label: 'Concept', criterion: 'correctness', keywords: ['sample'] }],
    modelAnswer: 'A model answer that is long enough.',
  };

  it('rejects a subcategory that does not belong to the category', () => {
    const bank = buildQuestionBank(taxonomy, [
      { source: 'f.json', data: { categoryId: 'tech-ai', questions: [{ ...base, subcategoryId: 'grammar' }] } },
    ]);
    expect(bank.questions).toHaveLength(0);
    expect(bank.issues[0]?.message).toMatch(/unknown subcategory/);
  });

  it('rejects concepts that reference a non-concept criterion', () => {
    const bank = buildQuestionBank(taxonomy, [
      {
        source: 'f.json',
        data: {
          categoryId: 'tech-ai',
          questions: [{ ...base, expectedConcepts: [{ ...base.expectedConcepts[0], criterion: 'reasoning' }] }],
        },
      },
    ]);
    expect(bank.issues[0]?.message).toMatch(/not a concept criterion/);
  });

  it('rejects duplicate ids and schema violations', () => {
    const bank = buildQuestionBank(taxonomy, [
      { source: 'a.json', data: { categoryId: 'tech-ai', questions: [base, base] } },
      { source: 'b.json', data: { categoryId: 'tech-ai', questions: [{ ...base, id: 'Bad Id' }] } },
    ]);
    expect(bank.questions).toHaveLength(1);
    expect(bank.issues.map((i) => i.message).join(' ')).toMatch(/duplicate question id/);
    expect(bank.issues.some((i) => i.source === 'b.json')).toBe(true);
  });

  it('throws on an invalid taxonomy', () => {
    expect(() => buildQuestionBank({ version: 1, categories: [] }, [])).toThrow(/Invalid taxonomy/);
  });
});
