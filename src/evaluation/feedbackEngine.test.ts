import { describe, expect, it } from 'vitest';
import { questionBank } from '../domain/questions/bank';
import type { Question } from '../domain/types';
import { alignTranscript, applyAliases, conceptEvidence, detectMisconceptions } from './evidence';
import { coverageTarget, evaluateLocally } from './localEvaluator';
import { RUBRICS } from './rubrics';
import { PROFILES, getTopicProfile, resolveRubric, selectTopic, type TopicId } from './topics';
import { FeedbackReportSchema } from './types';

const byId = (id: string): Question => {
  const q = questionBank.questions.find((x) => x.id === id);
  if (!q) throw new Error(`missing ${id}`);
  return q;
};
const evaluate = (id: string, transcript: string, spokenMs = 60_000) => evaluateLocally({ question: byId(id), transcript, spokenMs });

describe('topic selection', () => {
  it.each<[string, TopicId]>([
    ['cpp-raii-smart-pointers', 'cpp'],
    ['go-goroutines-channels', 'go'],
    ['py-asyncio', 'programming-language'],
    ['dsa-binary-search-complexity', 'dsa'],
    ['sd-url-shortener', 'system-design'],
    ['db-indexes', 'databases'],
    ['net-tcp-vs-udp', 'networking'],
    ['os-virtual-memory', 'operating-systems'],
    ['ds-cap-theorem', 'distributed-backend'],
    ['be-idempotency', 'distributed-backend'],
    ['api-rest-design', 'api-design'],
    ['fe-react-rendering', 'frontend'],
    ['genai-hallucinations', 'ai-ml'],
    ['sec-xss-csrf-sqli', 'security'],
    ['compiler-pipeline', 'general-technical'],
    ['gk-inflation', 'general'],
  ])('%s uses the %s profile', (id, topic) => {
    expect(selectTopic(byId(id)).id).toBe(topic);
  });

  it('falls back by rubric when a subcategory has no profile', () => {
    expect(selectTopic({ subcategoryId: 'brand-new', rubricId: 'dsa' }).id).toBe('dsa');
    expect(selectTopic({ subcategoryId: 'brand-new', rubricId: 'technical-concept' }).id).toBe('general-technical');
    expect(selectTopic({ subcategoryId: 'brand-new', rubricId: 'communication' }).id).toBe('general');
  });

  it('every question in the bank gets a profile', () => {
    for (const q of questionBank.questions) expect(selectTopic(q), q.id).toBeDefined();
  });
});

describe('topic rubrics', () => {
  it('keep the base rubric ids and weights, so question concepts still map to criteria', () => {
    for (const profile of PROFILES) {
      for (const rubricId of Object.keys(RUBRICS) as Array<keyof typeof RUBRICS>) {
        const resolved = resolveRubric(rubricId, profile.id);
        expect(resolved.criteria.map((c) => [c.id, c.weight])).toEqual(RUBRICS[rubricId].criteria.map((c) => [c.id, c.weight]));
      }
    }
  });

  it('specialise wording per topic instead of one generic checklist', () => {
    const cpp = resolveRubric('programming-language', 'cpp');
    const go = resolveRubric('programming-language', 'go');
    expect(cpp.criteria.find((c) => c.id === 'correctness')?.label).toBe('Language semantics');
    expect(cpp.criteria.find((c) => c.id === 'pitfalls')?.label).toMatch(/undefined behaviour/i);
    expect(go.criteria.find((c) => c.id === 'practical-implications')?.label).toMatch(/concurrency/i);
    expect(resolveRubric('technical-concept', 'databases').criteria.find((c) => c.id === 'mechanism')?.label).toMatch(/query execution/i);
    expect(resolveRubric('technical-concept', 'networking').criteria.find((c) => c.id === 'mechanism')?.label).toMatch(/protocol/i);
  });

  it('only override criterion ids that exist in some rubric', () => {
    const allIds = new Set(Object.values(RUBRICS).flatMap((r) => r.criteria.map((c) => c.id)));
    for (const p of PROFILES) for (const id of Object.keys(p.criteria)) expect(allIds.has(id), `${p.id}.${id}`).toBe(true);
  });

  it('every profile describes a strong answer and a one-minute frame', () => {
    for (const p of PROFILES) {
      expect(p.strongAnswer.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.oneMinuteFrame, p.id).toMatch(/→/);
    }
  });
});

describe('misconception detection', () => {
  const goQ = byId('go-goroutines-channels');
  const go = getTopicProfile('go');
  const ids = (transcript: string, q = goQ, topic = go) => detectMisconceptions(q, transcript, topic).map((m) => m.misconception.id);

  it('flags a wrong claim with an exact quote from the transcript', () => {
    const transcript = 'In Go, goroutines are OS threads, so creating a million of them is expensive.';
    const [found] = detectMisconceptions(goQ, transcript, go);
    expect(found?.misconception.id).toBe('goroutine-os-thread');
    expect(transcript).toContain(found!.excerpt);
  });

  it('does not flag the correct statement, a refutation, or a reported belief', () => {
    expect(ids('Goroutines are not OS threads; the runtime multiplexes them onto a few threads.')).toEqual([]);
    expect(ids('A common myth is that goroutines are OS threads, but they are scheduled by the runtime.')).toEqual([]);
    expect(ids('Many people think goroutines are OS threads. In fact they are much lighter.')).toEqual([]);
  });

  it('still flags the claim when the speaker asserts it as their own view', () => {
    expect(ids('I think goroutines are OS threads managed by the kernel.')).toEqual(['goroutine-os-thread']);
  });

  it('handles patterns that contain a negation themselves', () => {
    expect(ids('An unbuffered channel does not block the sender at all.')).toEqual(['unbuffered-never-blocks']);
    expect(ids('A send on an unbuffered channel blocks until a receiver is ready.')).toEqual([]);
  });

  it('respects question context: a pattern only applies to questions it was written for', () => {
    const dsa = getTopicProfile('dsa');
    const claim = 'Binary search works on unsorted arrays too.';
    expect(ids(claim, byId('dsa-binary-search-complexity'), dsa)).toEqual(['binary-search-unsorted']);
    expect(ids(claim, byId('dsa-union-find'), dsa)).toEqual([]);
  });

  it('respects "unless": describing the valid variant is not a misconception', () => {
    const cpp = getTopicProfile('cpp');
    const q = byId('cpp-shared-ptr-internals');
    expect(ids('shared_ptr is thread safe, so share it freely.', q, cpp)).toEqual(['shared-ptr-thread-safe']);
    expect(ids('shared_ptr is thread safe only for its reference count, not the object.', q, cpp)).toEqual([]);
  });

  it('never flags its own correction text (saying the right thing is never a misconception)', () => {
    for (const p of PROFILES) {
      for (const m of p.misconceptions) {
        const q = { title: (m.when ?? ['topic'])[0]!, prompt: (m.when ?? ['general question'])[0]! };
        const hits = detectMisconceptions(q, m.correction, { ...p, misconceptions: [m] });
        expect(hits, `${p.id}/${m.id}`).toEqual([]);
      }
    }
  });
});

describe('evidence and depth', () => {
  const q = byId('go-goroutines-channels');

  it('distinguishes explained concepts from named ones and scores them differently', () => {
    const explained =
      'A goroutine is lightweight because it starts with a small stack that grows. The scheduler multiplexes goroutines onto OS threads, so you can run thousands. ' +
      'An unbuffered channel blocks until the receiver is ready, which synchronises the two goroutines.';
    const listed = 'Goroutines lightweight. Scheduler. OS thread. Unbuffered. Buffered. Capacity. Select. Leak. Deadlock. Close. Context. ' + 'Channels '.repeat(8);
    const good = evaluateLocally({ question: q, transcript: explained, spokenMs: 60_000 });
    const dump = evaluateLocally({ question: q, transcript: listed, spokenMs: 60_000 });
    expect(good.conceptsCovered.find((c) => c.label.startsWith('Lightweight'))?.depth).toBe('explained');
    expect(dump.conceptsCovered.every((c) => c.depth === 'named')).toBe(true);
    const corr = (r: typeof good) => r.criteria.find((c) => c.id === 'correctness')!.score!;
    expect(corr(good)).toBeGreaterThan(corr(dump));
    expect(dump.nextSteps.join(' ')).toMatch(/Explain, don't just name/);
  });

  it('does not credit or praise a concept that only appears inside a wrong statement (regression)', () => {
    const transcript =
      'So goroutines are OS threads but lighter. You start them with the go keyword. A common bug is a leak when nobody reads ' +
      'from the channel because the sender blocks forever. For example a worker that sends after the caller timed out.';
    const report = evaluateLocally({ question: q, transcript, spokenMs: 60_000 });
    const scheduler = report.conceptsCovered.find((c) => c.label.startsWith('M:N'));
    expect(scheduler?.depth).toBe('named');
    expect(report.strengths.join(' ')).not.toMatch(/M:N|OS threads/);
    expect(report.criteria.flatMap((c) => c.evidence).join(' ')).toMatch(/in a statement that may be wrong/);
  });

  it('does not borrow an explanation from the next sentence (regression)', () => {
    const transcript = 'Channels connect goroutines. Unbuffered, buffered, select. A leak happens when nobody reads because the sender blocks.';
    const report = evaluateLocally({ question: q, transcript, spokenMs: 60_000 });
    expect(report.conceptsCovered.find((c) => c.label.startsWith('Unbuffered'))?.depth).toBe('named');
    expect(report.conceptsCovered.find((c) => c.label.startsWith('Goroutine leaks'))?.depth).toBe('explained');
  });

  it('quotes evidence verbatim, including tokens with punctuation such as O(log n)', () => {
    const transcript = 'Binary search keeps halving the sorted range, which gives O(log n) time because each step removes half.';
    const report = evaluate('dsa-binary-search-complexity', transcript);
    const time = report.conceptsCovered.find((c) => /log/i.test(c.evidence));
    expect(time?.evidence).toContain('O(log');
    for (const c of report.conceptsCovered) expect(transcript).toContain(c.evidence);
  });

  it('a missing concept is reported as missing, not as a factual error', () => {
    const report = evaluate(
      'dsa-binary-search-complexity',
      'Binary search looks at the middle of a sorted array and throws away half each time, which is why it is quick to find things.',
    );
    expect(report.conceptsMissing.length).toBeGreaterThan(0);
    expect(report.factualConcerns).toEqual([]);
  });

  it('an incorrect claim is a factual concern, lowers correctness and leads the next steps', () => {
    const transcript =
      'Binary search works on unsorted arrays too. It checks the middle element and discards half of the range each time, ' +
      'so it runs in log n time, and the iterative version uses constant space because it only keeps two indexes.';
    const report = evaluate('dsa-binary-search-complexity', transcript);
    expect(report.factualConcerns).toHaveLength(1);
    expect(report.factualConcerns[0]).toMatchObject({ certainty: 'likely' });
    expect(transcript).toContain(report.factualConcerns[0]!.excerpt);
    expect(report.criteria.find((c) => c.id === 'correctness')?.note).toMatch(/^Lowered by 20/);
    expect(report.nextSteps[0]).toMatch(/^Check this claim/);
  });

  it('accepts an alternative valid approach without flagging it', () => {
    const recursive =
      'Binary search can also be written recursively: check the middle, then recurse into one half, so the call stack uses log n space ' +
      'while the time is still logarithmic. For example, an empty array is the base case.';
    expect(evaluate('dsa-binary-search-complexity', recursive).factualConcerns).toEqual([]);
  });
});

describe('speech recognition uncertainty', () => {
  it('reads common mishearings as the intended term, says so, and does not call them grammar mistakes', () => {
    const transcript =
      'With cash aside the application reads the cash first and on a miss loads the database, because that keeps the cash small. ' +
      'Entries expire with a time to live so stale data goes away.';
    const report = evaluate('sd-cache-invalidation', transcript, 90_000);
    expect(report.conceptsCovered.map((c) => c.label)).toContain(byId('sd-cache-invalidation').expectedConcepts[0]!.label);
    expect(report.recognitionNotes.join(' ')).toMatch(/“cash” as “cache”/);
    expect(report.corrections.some((c) => c.before.toLowerCase().includes('cash'))).toBe(false);
  });

  it('does not apply technical aliases to non-technical questions', () => {
    const report = evaluate('gk-inflation', 'When people have more cash and goods are scarce, prices rise because demand exceeds supply. '.repeat(2));
    expect(report.recognitionNotes).toEqual([]);
  });

  it('treats normal pronunciations as aliases without reporting them', () => {
    const { applied } = applyAliases(' we store rows in a sequel database ');
    expect(applied.map((a) => a.meant)).toEqual(['sql']);
    expect(applied[0]?.silent).toBe(true);
  });
});

describe('scoring', () => {
  it('scales expected coverage to the time spoken, but never below half', () => {
    const q = byId('sd-cache-invalidation'); // suggested 180 s
    expect(coverageTarget(q, 180_000, true)).toBe(1);
    expect(coverageTarget(q, 120_000, true)).toBeCloseTo(2 / 3);
    expect(coverageTarget(q, 30_000, true)).toBe(0.5);
    expect(coverageTarget(q, 30_000, false)).toBe(1);
    const transcript = 'Cache aside loads on a miss, and write through updates the cache when you write, so reads stay fast. '.repeat(2);
    const short = evaluateLocally({ question: q, transcript, spokenMs: 60_000 });
    const full = evaluateLocally({ question: q, transcript, spokenMs: 180_000 });
    const arch = (r: typeof short) => r.criteria.find((c) => c.id === 'architecture')!.score!;
    expect(arch(short)).toBe(100); // 2 of 2 architecture points either way
    expect(short.limitations.join(' ')).toMatch(/suggested 180 s/);
    expect(full.limitations.join(' ')).not.toMatch(/suggested 180 s/);
  });

  it('produces schema-valid reports with bounded scores for every question in the bank', () => {
    const transcript =
      'First, the core idea is simple, because it trades memory for speed. For example, imagine a request that arrives. ' +
      'However, the trade-off is complexity. In summary, it depends on the workload.';
    for (const q of questionBank.questions) {
      const report = evaluateLocally({ question: q, transcript, spokenMs: 60_000 });
      const parsed = FeedbackReportSchema.safeParse(report);
      expect(parsed.success, q.id).toBe(true);
      for (const c of report.criteria) if (c.score !== null) expect(c.score >= 0 && c.score <= 100, `${q.id}.${c.id}`).toBe(true);
    }
  });

  it('handles an empty transcript without crashing or inventing praise', () => {
    const report = evaluate('cpp-raii-smart-pointers', '', 0);
    expect(FeedbackReportSchema.safeParse(report).success).toBe(true);
    expect(report.strengths).toEqual([]);
    expect(report.factualConcerns).toEqual([]);
    expect(report.conceptsCovered).toEqual([]);
  });

  it('works the same for questions with and without research notes', () => {
    const withNotes = byId('dsa-binary-search-complexity');
    const without = byId('dsa-union-find');
    expect(withNotes.researchContext).toBeDefined();
    expect(without.researchContext).toBeUndefined();
    for (const q of [withNotes, without]) {
      const r = evaluateLocally({ question: q, transcript: 'It finds the root and links the roots, which keeps trees shallow. '.repeat(3), spokenMs: 60_000 });
      expect(FeedbackReportSchema.safeParse(r).success).toBe(true);
    }
  });

  it('names the topic rubric and gives positive, evidence-backed feedback for a strong answer', () => {
    const transcript =
      'RAII ties a resource to an object, so the destructor releases it when the scope ends, even when an exception is thrown. ' +
      'For example, unique_ptr is a sole owner and can only be moved, which makes ownership explicit. First, prefer make_unique; ' +
      'then, use shared_ptr only for shared ownership because its reference count is atomic. In summary, RAII prevents leaks.';
    const report = evaluate('cpp-raii-smart-pointers', transcript);
    expect(report.rubricLabel).toBe('C++');
    expect(report.criteria.find((c) => c.id === 'correctness')?.label).toBe('Language semantics');
    expect(report.strengths.length).toBeGreaterThan(0);
    for (const s of report.strengths) {
      // Excerpts are copied from the transcript; a leading or trailing … only marks truncation.
      for (const [, quoted] of s.matchAll(/“([^”]+)”/g)) {
        expect(transcript.toLowerCase()).toContain(quoted!.replace(/^…|…$/g, '').toLowerCase());
      }
    }
  });

  it('flags a main point that only arrives late in a long answer', () => {
    const filler = 'Let me set some context about how systems are built and why teams care about speed and reliability in general. ';
    const transcript = `${filler.repeat(4)} Binary search needs a sorted array and halves the range each step, which gives log n time.`;
    const report = evaluate('dsa-binary-search-complexity', transcript);
    expect(report.structureNotes.join(' ')).toMatch(/main point arrived in the second half/);
  });
});

describe('alignment helpers', () => {
  it('maps normalised words back to original tokens', () => {
    const a = alignTranscript("It's O(log n), not O(n).");
    expect(a.words).toEqual(['its', 'o', 'log', 'n', 'not', 'o', 'n']);
    expect(a.tokens[a.tokenOf[2]!]).toBe('O(log');
  });

  it('concept matching falls back to aliases only when enabled', () => {
    const concepts = byId('sd-cache-invalidation').expectedConcepts;
    expect(conceptEvidence(concepts, 'we use cash aside here', { aliases: false }).results.some((r) => r.hit)).toBe(false);
    expect(conceptEvidence(concepts, 'we use cash aside here', { aliases: true }).results.some((r) => r.hit)).toBe(true);
  });
});
