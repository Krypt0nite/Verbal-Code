import { describe, expect, it } from 'vitest';
import {
  assessTranscriptQuality,
  countFillers,
  findKeyword,
  keywordRegex,
  lexicalVariety,
  normaliseForMatching,
  repeatedPhrases,
  sentenceStats,
} from './analysis';
import { articleFor, findGrammarIssues, findVagueWords } from './grammar';
import { evaluateLocally } from './localEvaluator';
import { FeedbackReportSchema } from './types';
import { RUBRICS } from './rubrics';
import { questionBank } from '../domain/questions/bank';

const byId = (id: string) => {
  const q = questionBank.questions.find((x) => x.id === id);
  if (!q) throw new Error(`missing ${id}`);
  return q;
};

const GOOD_BINARY_SEARCH =
  'Binary search finds a target in a sorted array. First, we look at the middle element. If the target is smaller, ' +
  'we discard the right half; otherwise we discard the left half. Because we halve the search space every step, ' +
  'the time complexity is O(log n). The iterative version uses constant space, while the recursive version uses the call stack, ' +
  'so it is O(log n) space. However, there are edge cases: an empty array, duplicates, and integer overflow when computing mid. ' +
  'For example, use low plus high minus low divided by two. In summary, binary search is fast but needs sorted input.';

const WEAK_BINARY_SEARCH =
  'Um so basically binary search is like a thing that you use to find stuff, you know, it is very very good and it is really fast and stuff, ' +
  'you know it is basically good, it is basically good for things.';

describe('analysis helpers', () => {
  it('normalises big-O phrasing so keywords match', () => {
    expect(normaliseForMatching('Big O of N log N')).toBe(' o n log n ');
    expect(findKeyword(normaliseForMatching('it runs in O(log n)'), ['log n'])).toBe('log n');
  });
  it('short keywords require whole words; long keywords allow suffixes', () => {
    expect(keywordRegex('inp').test(' the input is large ')).toBe(false);
    expect(keywordRegex('cas').test(' the base case ')).toBe(false);
    expect(keywordRegex('heap').test(' two heaps ')).toBe(true);
    expect(keywordRegex('replica').test(' replication lag ')).toBe(true);
  });
  it('counts fillers and repeated phrases', () => {
    expect(countFillers('um you know it is, you know, basically fine')).toEqual([
      { term: 'you know', count: 2 },
      { term: 'um', count: 1 },
      { term: 'basically', count: 1 },
    ]);
    const reps = repeatedPhrases('the load balancer sends traffic. the load balancer checks health. the load balancer retries.');
    expect(reps[0]).toEqual({ phrase: 'the load balancer', count: 3 });
  });
  it('only reports sentence stats when punctuation exists', () => {
    expect(sentenceStats('no punctuation here at all')).toBeNull();
    expect(sentenceStats('One two three. Four five six seven.')).toEqual({ count: 2, average: 3.5 });
  });
  it('lexical variety needs enough words', () => {
    expect(lexicalVariety('short text')).toBeNull();
    expect(lexicalVariety(GOOD_BINARY_SEARCH)).toBeGreaterThan(0.6);
  });
  it('rejects empty, too-short and implausibly sparse transcripts', () => {
    expect(assessTranscriptQuality('', 60_000).ok).toBe(false);
    expect(assessTranscriptQuality('just a few words here', 60_000).ok).toBe(false);
    const sparse = Array.from({ length: 25 }, (_, i) => `word${i}`).join(' ');
    expect(assessTranscriptQuality(sparse, 120_000).ok).toBe(false);
    expect(assessTranscriptQuality(GOOD_BINARY_SEARCH, 60_000).ok).toBe(true);
  });
});

describe('grammar rules', () => {
  it('handles articles including acronyms', () => {
    expect(articleFor('array')).toBe('an');
    expect(articleFor('user')).toBe('a');
    expect(articleFor('hour')).toBe('an');
    expect(articleFor('HTTP')).toBe('an');
    expect(articleFor('URL')).toBe('a');
    expect(articleFor('SQL')).toBe('an');
    const issues = findGrammarIssues('We store it in a array and send a HTTP request with a URL to an database.');
    expect(issues.map((i) => i.after)).toEqual([
      expect.stringContaining('an array'),
      expect.stringContaining('an HTTP'),
      expect.stringContaining('a database'),
    ]);
  });
  it('flags common errors with before/after examples', () => {
    const text = 'It dont scale. We didnt went there. This is more faster and has less errors. We can able to discuss about it.';
    const issues = findGrammarIssues(text, 10);
    const afters = issues.map((i) => i.after).join(' | ');
    expect(afters).toContain("It doesn't");
    expect(afters).toContain('didnt go');
    expect(afters).toContain('is faster');
    expect(afters).toContain('fewer errors');
    expect(afters).toContain('can discuss');
    for (const i of issues) expect(i.before).not.toBe(i.after);
  });
  it('does not flag correct sentences', () => {
    expect(findGrammarIssues('An index is a sorted structure. It has a unique key and an hour-long rebuild. There are many users.')).toEqual([]);
  });
  it('suggests replacements for vague words', () => {
    const { corrections, counts } = findVagueWords('This thing is very good and the stuff is very fast');
    expect(counts.very).toBe(2);
    expect(corrections[0]?.before).toContain('very');
  });
});

describe('local evaluator', () => {
  it('produces a schema-valid report for every rubric', () => {
    for (const rubricId of Object.keys(RUBRICS)) {
      const q = questionBank.questions.find((x) => x.rubricId === rubricId);
      expect(q, rubricId).toBeDefined();
      const report = evaluateLocally({ question: q!, transcript: GOOD_BINARY_SEARCH, spokenMs: 60_000 });
      expect(FeedbackReportSchema.safeParse(report).success).toBe(true);
      expect(report.criteria.map((c) => c.id)).toEqual(RUBRICS[q!.rubricId].criteria.map((c) => c.id));
    }
  });

  it('uses the DSA rubric with complexity criteria for DSA questions', () => {
    const report = evaluateLocally({ question: byId('dsa-binary-search-complexity'), transcript: GOOD_BINARY_SEARCH, spokenMs: 60_000 });
    const ids = report.criteria.map((c) => c.id);
    expect(ids).toEqual(['correctness', 'reasoning', 'time-complexity', 'space-complexity', 'edge-cases', 'alternatives']);
  });

  it('rewards a strong answer over a weak one, with evidence', () => {
    const q = byId('dsa-binary-search-complexity');
    const good = evaluateLocally({ question: q, transcript: GOOD_BINARY_SEARCH, spokenMs: 60_000 });
    const weak = evaluateLocally({ question: q, transcript: WEAK_BINARY_SEARCH, spokenMs: 60_000 });
    expect(good.overallScore!).toBeGreaterThan(weak.overallScore! + 30);
    expect(good.conceptsMissing).toEqual([]);
    expect(weak.conceptsMissing.length).toBeGreaterThan(2);
    const time = good.criteria.find((c) => c.id === 'time-complexity')!;
    expect(time.evidence.join(' ')).toMatch(/log n/i);
    expect(weak.metrics.fillerCount).toBeGreaterThan(3);
    expect(weak.corrections.some((c) => c.kind === 'vocabulary')).toBe(true);
  });

  it('marks criteria without evidence as not assessed rather than inventing a score', () => {
    const q = byId('ce-impromptu-remote-work');
    const report = evaluateLocally({ question: q, transcript: 'it is what it is and so on '.repeat(4), spokenMs: 30_000 });
    const vocab = report.criteria.find((c) => c.id === 'vocabulary')!;
    expect(vocab.score).toBeNull();
    expect(vocab.confidence).toBe('not-assessed');
  });

  it('never claims to check facts locally and states its limitations', () => {
    const report = evaluateLocally({ question: byId('sd-load-balancer'), transcript: GOOD_BINARY_SEARCH, spokenMs: 60_000 });
    expect(report.factualConcerns).toEqual([]);
    expect(report.limitations.join(' ')).toMatch(/cannot check facts/);
    expect(report.limitations.join(' ')).toMatch(/not from audio/);
    expect(report.nextSteps.length).toBeGreaterThanOrEqual(2);
    expect(report.nextSteps.length).toBeLessThanOrEqual(3);
  });

  it('is deterministic', () => {
    const q = byId('sd-url-shortener');
    expect(evaluateLocally({ question: q, transcript: GOOD_BINARY_SEARCH, spokenMs: 90_000 })).toEqual(
      evaluateLocally({ question: q, transcript: GOOD_BINARY_SEARCH, spokenMs: 90_000 }),
    );
  });

  it('behavioral rubric detects STAR elements', () => {
    const story =
      'At my previous company our checkout service was timing out during sales. My role was to own the fix. ' +
      'I decided to profile the service and I implemented connection pooling. As a result, p99 latency reduced by forty percent. ' +
      'I learned to load test before every sale.';
    const report = evaluateLocally({ question: byId('is-failure'), transcript: story, spokenMs: 50_000 });
    for (const id of ['context', 'responsibility', 'actions', 'results', 'reflection']) {
      expect(report.criteria.find((c) => c.id === id)?.score, id).toBe(100);
    }
  });
});
