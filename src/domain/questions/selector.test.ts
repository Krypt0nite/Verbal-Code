import { describe, expect, it } from 'vitest';
import { questionBank } from './bank';
import {
  buildSequence,
  filterQuestions,
  pushRecent,
  seededRandom,
  selectQuestion,
  validateFilter,
} from './selector';
import type { QuestionFilter } from '../types';

const { taxonomy, questions } = questionBank;
const all: QuestionFilter = { categoryId: null, subcategoryId: null, difficulty: null, mode: 'interview' };

describe('validateFilter', () => {
  it('accepts all-topics and valid pairs', () => {
    expect(validateFilter(taxonomy, all).ok).toBe(true);
    expect(validateFilter(taxonomy, { ...all, categoryId: 'tech-ai', subcategoryId: 'dsa' }).ok).toBe(true);
  });
  it('rejects mismatched category/subcategory', () => {
    const r = validateFilter(taxonomy, { ...all, categoryId: 'business', subcategoryId: 'dsa' });
    expect(r.ok).toBe(false);
  });
  it('rejects a subcategory without a category and unknown categories', () => {
    expect(validateFilter(taxonomy, { ...all, subcategoryId: 'dsa' }).ok).toBe(false);
    expect(validateFilter(taxonomy, { ...all, categoryId: 'nope' }).ok).toBe(false);
  });
});

describe('filterQuestions', () => {
  it('respects category, subcategory, difficulty and mode', () => {
    const f: QuestionFilter = { categoryId: 'tech-ai', subcategoryId: 'dsa', difficulty: 'beginner', mode: 'interview' };
    const pool = filterQuestions(questions, f);
    expect(pool.length).toBeGreaterThan(0);
    for (const q of pool) {
      expect(q.subcategoryId).toBe('dsa');
      expect(q.difficulty).toBe('beginner');
      expect(q.modes).toContain('interview');
    }
  });
});

describe('selectQuestion', () => {
  it('is deterministic with a seeded random source', () => {
    const a = selectQuestion(taxonomy, questions, all, { random: seededRandom(42) });
    const b = selectQuestion(taxonomy, questions, all, { random: seededRandom(42) });
    expect(a).toEqual(b);
  });

  it('returns invalid-filter for impossible combinations', () => {
    const r = selectQuestion(taxonomy, questions, { ...all, categoryId: 'business', subcategoryId: 'dsa' });
    expect(r.kind).toBe('invalid-filter');
  });

  it('returns empty for an overly restrictive filter', () => {
    const r = selectQuestion(taxonomy, questions, {
      categoryId: 'fitness-nutrition',
      subcategoryId: 'sports-science',
      difficulty: 'advanced',
      mode: 'interview',
    });
    expect(r.kind).toBe('empty');
  });

  it('never repeats a recent question while fresh ones exist', () => {
    const f: QuestionFilter = { ...all, categoryId: 'tech-ai', subcategoryId: 'dsa' };
    const pool = filterQuestions(questions, f);
    const recent = pool.slice(0, pool.length - 1).map((q) => q.id);
    for (let seed = 0; seed < 25; seed++) {
      const r = selectQuestion(taxonomy, questions, f, { recentIds: recent, random: seededRandom(seed) });
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok') {
        expect(r.question.id).toBe(pool[pool.length - 1]!.id);
        expect(r.repeated).toBe(false);
      }
    }
  });

  it('falls back to least-recently-used and never the most recent when all are used', () => {
    const f: QuestionFilter = { ...all, categoryId: 'tech-ai', subcategoryId: 'dsa' };
    const pool = filterQuestions(questions, f).map((q) => q.id);
    const recent = [...pool]; // pool[0] is most recent, last is least recent
    const r = selectQuestion(taxonomy, questions, f, { recentIds: recent });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.repeated).toBe(true);
      expect(r.question.id).toBe(pool[pool.length - 1]);
    }
  });

  it('does not return the same question twice in a row when a single alternative exists', () => {
    const f: QuestionFilter = { ...all, categoryId: 'tech-ai', subcategoryId: 'networking' };
    // Exactly two candidates, independent of how many networking questions the bank ships.
    const two = filterQuestions(questions, f).slice(0, 2);
    expect(two.length).toBe(2);
    let recent: string[] = [];
    let last = '';
    for (let i = 0; i < 10; i++) {
      const r = selectQuestion(taxonomy, two, f, { recentIds: recent, random: seededRandom(i) });
      if (r.kind !== 'ok') throw new Error('expected ok');
      expect(r.question.id).not.toBe(last);
      last = r.question.id;
      recent = pushRecent(recent, last);
    }
  });

  it('produces varied picks over many draws', () => {
    const rnd = seededRandom(7);
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const r = selectQuestion(taxonomy, questions, all, { random: rnd });
      if (r.kind === 'ok') seen.add(r.question.id);
    }
    expect(seen.size).toBeGreaterThan(15);
  });
});

describe('buildSequence and pushRecent', () => {
  it('builds a sequence of distinct questions', () => {
    const seq = buildSequence(taxonomy, questions, { ...all, mode: 'mock-interview' }, 5, seededRandom(1));
    expect(seq).toHaveLength(5);
    expect(new Set(seq.map((q) => q.id)).size).toBe(5);
  });
  it('stops early rather than repeating', () => {
    const f: QuestionFilter = { categoryId: 'tech-ai', subcategoryId: 'security', difficulty: null, mode: 'mock-interview' };
    const pool = filterQuestions(questions, f).length;
    expect(buildSequence(taxonomy, questions, f, pool + 5)).toHaveLength(pool);
  });
  it('keeps history bounded, unique and most-recent-first', () => {
    let r: string[] = [];
    for (let i = 0; i < 30; i++) r = pushRecent(r, `q${i % 25}`, 20);
    expect(r).toHaveLength(20);
    expect(r[0]).toBe('q4');
    expect(new Set(r).size).toBe(20);
  });
});
