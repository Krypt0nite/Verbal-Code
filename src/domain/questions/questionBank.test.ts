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

  it.each(['tech-ai', 'programming-languages'])('covers every %s subcategory', (categoryId) => {
    const category = questionBank.taxonomy.categories.find((c) => c.id === categoryId);
    expect(category).toBeDefined();
    for (const sub of category!.subcategories) {
      const count = questionBank.questions.filter((q) => q.categoryId === categoryId && q.subcategoryId === sub.id).length;
      expect(count, `no questions for ${categoryId}/${sub.id}`).toBeGreaterThan(0);
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

  it('avoids generic keywords that would credit a concept without explaining it', () => {
    // Short keywords match whole words anywhere in the transcript, so everyday words inflate coverage.
    const generic = new Set(
      'a an the and or is it in on of to new any try get ok fix hot due odd first like top wait short slow post set list sea code data cost risk time memory test start use way one two good bad well fast more less big small high low flag pin lock map key log sum max min tie gap box api cpu work'.split(' '),
    );
    // The word is the technical term itself in these questions.
    const allowed = new Set([
      'phys-energy-work:work', 'math-integrals:sum', 'math-integrals:work', 'fe-react-rendering:key', 'ml-attention-transformers:key',
      'py-collections-complexity:set', 'py-collections-complexity:list', 'py-mutability-references:list', 'cpp-iterator-invalidation:map',
      'cpp-iterator-invalidation:list', 'rust-traits-generics:box', 'rust-smart-pointers:box', 'go-interface-internals:box',
      'ds-mapreduce-spark:map', 'db-redis-internals:list', 'db-redis-internals:set',
    ]);
    const offenders = questionBank.questions.flatMap((q) =>
      q.expectedConcepts.flatMap((c) =>
        c.keywords.map((k) => `${q.id}:${k.toLowerCase().trim()}`).filter((key) => generic.has(key.split(':')[1]!) && !allowed.has(key)),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps advanced questions out of off-the-cuff mode for new questions', () => {
    // Off-the-cuff gives no preparation time. Older advanced questions predate this rule and are listed explicitly.
    const legacy = new Set([
      'cpp-undefined-behavior', 'cpp-templates-constexpr', 'cpp-exceptions-safety', 'cpp-memory-order', 'go-context-cancellation',
      'go-gc-escape-analysis', 'py-asyncio', 'py-memory-gc', 'rust-send-sync', 'rust-lifetimes', 'rust-async', 'rust-unsafe',
      'java-concurrency-basics', 'java-generics-type-erasure', 'ts-generics-utility-types', 'semi-photolithography-moores-law',
      'qm-entanglement-tunneling', 'mat-crystal-defects', 'phys-special-relativity', 'math-eigenvectors', 'nano-carbon-materials',
    ]);
    const offenders = questionBank.questions
      .filter((q) => q.difficulty === 'advanced' && q.modes.includes('off-the-cuff') && !legacy.has(q.id))
      .map((q) => q.id);
    expect(offenders).toEqual([]);
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

  it('drops only the invalid question, not the rest of its file', () => {
    const bad = { ...base, id: 'bad-question', expectedConcepts: [{ ...base.expectedConcepts[0], id: 'x' }] };
    const bank = buildQuestionBank(taxonomy, [
      { source: 'f.json', data: { categoryId: 'tech-ai', questions: [base, bad, { ...base, id: 'another-question' }] } },
    ]);
    expect(bank.questions.map((q) => q.id)).toEqual(['sample-question', 'another-question']);
    expect(bank.issues).toHaveLength(1);
    expect(bank.issues[0]?.message).toMatch(/questions\.1 \(bad-question\)/);
  });

  it('throws on an invalid taxonomy', () => {
    expect(() => buildQuestionBank({ version: 1, categories: [] }, [])).toThrow(/Invalid taxonomy/);
  });
});
