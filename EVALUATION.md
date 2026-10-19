# Evaluation

VerbalCode gives feedback from **transcript text only**. It never claims to measure pronunciation, tone, confidence or pauses.

## When feedback is refused

Before any scoring, `assessTranscriptQuality` checks the transcript. It asks you to retry, instead of producing a report, if:
- no words were captured;
- fewer than 20 words were captured;
- you spoke for 45 s or more but the transcript has fewer than 30 words per minute (recognition probably failed).

## Rubrics

Every question names a rubric (`src/evaluation/rubrics/index.ts`). Each criterion has a weight and a *local signal* — the evidence the local evaluator uses.

| Rubric | Criteria |
| --- | --- |
| `dsa` | correctness, step-by-step reasoning, time complexity, space complexity, edge cases, alternative approaches |
| `system-design` | requirements, high-level architecture, data flow, scaling, reliability, bottlenecks, consistency & failure handling, trade-offs |
| `programming-language` | correctness, terminology, examples, practical implications, common pitfalls |
| `technical-concept` | correctness, how it works, concrete example, trade-offs & failure modes, structure (backend, frontend, AI/ML, infra…) |
| `communication` | directness, logical organisation, grammar, vocabulary, conciseness, answer relevance |
| `behavioral` | context, responsibility, actions, results, reflection, story structure |
| `general-explanation` | key ideas, organisation, examples, vocabulary, conciseness (general-knowledge topics) |

## Local evaluator (default)

| Signal | Method | Score |
| --- | --- | --- |
| concepts | Each question lists expected concepts with keyword variants, mapped to criteria. Text is normalised ("big O of n" → "o n"); keywords of four characters or fewer must match whole words. | covered ÷ expected for that criterion; evidence = transcript excerpt |
| structure | Signpost words in 4 groups: sequence, cause, contrast, summary | 25 + 20 per group used |
| examples | "for example", "imagine", "let's say", … | 2+ → 100, 1 → 80, none → 30 (labelled "not detected") |
| grammar | ~15 conservative rules (articles incl. acronyms, *he don't*, *didn't went*, *more faster*, *less errors*, *can able to*, *discuss about*, repeated words…) | 95 − 12 × issues per 100 words |
| vocabulary | Moving-average type-token ratio of content words; vague words (thing, stuff, very, good…) | not assessed if < 15 content words |
| conciseness | Fillers (um, you know, basically, …) and repeated 2–4-word phrases | 100 − 8 × rate per 100 words |
| directness | Warm-up opener ("so basically", "good question") and question terms in the first words | 40–100 |
| relevance | Share of question key terms used, averaged with concept coverage | 20 + ratio × 100 |

- A criterion with no evidence (no reference concepts, too few words) gets **score `null` / "Not assessed"**, never a guess.
- The overall score is the weighted mean of assessed criteria only.
- **Factual errors:** the local evaluator lists none and says plainly that it cannot check facts.
- Every report includes before/after corrections, metrics (word count, speaking time, words per minute, fillers, repeated phrases, lexical variety, sentence length only if the recogniser added punctuation), covered/missing concepts, a model answer, 2–3 next steps and a "How this was scored" section.

## AI evaluator (optional)

Request (validated by `EvaluateRequestSchema`): `{ prompt, category, difficulty, rubricId, transcript }` — max 12,000 characters.

The server builds the rubric from `rubricId` itself (the client cannot inject criteria), fences the transcript as untrusted data, and instructs the model to:
- quote evidence exactly from the transcript;
- not invent mistakes (empty arrays are fine);
- flag factual concerns only when the transcript says something wrong, with `likely`/`possible` certainty;
- never comment on audio properties;
- use `null` for unassessable criteria.

The response must match `AiAssessmentSchema`. Then **grounding**: any evidence quote, correction or factual concern whose excerpt is not in the transcript is removed, and the report shows how many were dropped. Missing criteria become "Not assessed". Metrics are always computed locally.

Errors map to typed codes: `not-configured`, `bad-request`, `too-large`, `rate-limited` (with Retry-After), `timeout`, `upstream-error`, `invalid-response` (malformed JSON, schema mismatch, or token-limit truncation). The UI always offers **Use local feedback instead**.

## Tests

`npm test` runs 111 tests:

| Area | File |
| --- | --- |
| Question bank validity, coverage of every Tech & AI subcategory, schema/cross-reference errors | `src/domain/questions/questionBank.test.ts` |
| Filtering, invalid combinations, deterministic seeded selection, recent-question avoidance, LRU fallback, sequences | `src/domain/questions/selector.test.ts` |
| Timer boundaries, tab suspension, pause/resume, duplicate completion, cancel, cleanup | `src/session/timer.test.ts` |
| Every state transition, duplicate FINISH, stale attempts, cancel/discard clearing | `src/session/machine.test.ts` |
| Web Speech adapter: detection, no cloud fallback, permission errors, restarts, pause/resume, abort cleanup, error mapping | `src/speech/webSpeech.test.ts` |
| Analysis helpers, grammar rules (positives and negatives), rubric-specific reports, determinism, "not assessed" | `src/evaluation/evaluation.test.ts` |
| AI handler: config, validation, malformed/fenced/truncated JSON, 429/401/5xx/timeouts, limiter, no-logging, grounding | `functions/_lib/evaluate.test.ts` |
| AI client: minimal payload, schema-valid merge, typed errors, timeout/abort, no transcript in errors | `src/ai/aiEvaluator.test.ts` |
| Purger, strict preference storage, history validation, honest disclosures | `src/privacy/privacy.test.ts` |
| Full UI flows: session, insufficient speech, permission denied, cloud consent, cancel during permission, pause/resume, AI failure fallback, keyboard and Escape, deep research prep, mock interview, timer-driven auto-finish | `src/App.test.tsx` |

`npm run test:e2e` (Playwright, desktop + Pixel 7 viewports) covers a full session in a real browser with a fake recogniser, checking that the timer really runs, `processLocally` was requested, and storage and URL contain no transcript. It also covers cloud opt-in gating, permission denial, keyboard operation and horizontal-overflow checks.
