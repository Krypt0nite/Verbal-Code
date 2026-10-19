# Evaluation

VerbalCode gives feedback from **transcript text only**. It never claims to measure pronunciation, tone, confidence or pauses.

## Pipeline

```
transcript ─► assessTranscriptQuality ──(too short / sparse)──► "try again", no report
                    │
                    ▼
        selectTopic(question)  ─► topic profile (C++, Go, databases, …)
        resolveRubric(rubricId, topic) ─► criteria with topic-specific wording
                    │
        ┌───────────┴─────────────────────────────┐
        ▼                                         ▼
  local evaluator (default, on device)     AI evaluator (optional, consented)
  evidence.ts + localEvaluator.ts          /api/evaluate → provider → grounding
        └───────────────┬─────────────────────────┘
                        ▼
                FeedbackReport (Zod-validated, same shape for both)
```

| Module | Responsibility |
| --- | --- |
| `src/evaluation/rubrics/index.ts` | The 7 base rubrics: criterion ids, weights and local signals. Questions' expected concepts point at these ids. |
| `src/evaluation/topics/` | Topic profiles: which subcategories they cover, criterion wording, what a strong one-minute answer contains, a speaking frame, and common misconceptions. |
| `src/evaluation/evidence.ts` | Transcript alignment, concept evidence ("explained" or "named"), speech-recognition aliases, misconception detection. |
| `src/evaluation/localEvaluator.ts` | Scores criteria, builds strengths, notes and next steps. |
| `src/ai/aiEvaluator.ts`, `functions/_lib/evaluate.ts` | Optional AI path: request building, prompt, validation, grounding, merge. |

## When feedback is refused

Before any scoring, `assessTranscriptQuality` checks the transcript. It asks you to retry, instead of producing a report, if:
- no words were captured;
- fewer than 20 words were captured;
- you spoke for 45 s or more but the transcript has fewer than 30 words per minute (recognition probably failed).

## Rubrics and topic profiles

Every question names a base rubric. Its subcategory picks a topic profile, which keeps the rubric's criterion ids and weights but changes what each criterion means for that subject.

| Base rubric | Criteria |
| --- | --- |
| `dsa` | correctness, step-by-step reasoning, time complexity, space complexity, edge cases, alternative approaches |
| `system-design` | requirements, high-level architecture, data flow, scaling, reliability, bottlenecks, consistency & failure handling, trade-offs |
| `programming-language` | correctness, terminology, examples, practical implications, common pitfalls |
| `technical-concept` | correctness, how it works, concrete example, trade-offs & failure modes, structure |
| `communication` | directness, logical organisation, grammar, vocabulary, conciseness, answer relevance |
| `behavioral` | context, responsibility, actions, results, reflection, story structure |
| `general-explanation` | key ideas, organisation, examples, vocabulary, conciseness |

| Topic profile | Subcategories | Example of specialised wording | Misconception checks |
| --- | --- | --- | ---: |
| DSA | dsa, problem-solving-explanations | "Why it works" (the invariant) | 6 |
| System design | system-design | "Components and responsibilities" | 3 |
| C++ | cpp | "Language semantics", "Undefined behaviour and pitfalls" | 7 |
| Go | go | "Concurrency and resource cleanup", "Races, leaks and pitfalls" | 6 |
| Programming language | python, rust, java, javascript-typescript, programming-languages | "Language semantics" | 0 |
| Databases & storage | databases-and-storage, data-engineering | "Query execution, indexing or transactions" | 4 |
| Networking | networking | "Protocol behaviour", "Latency, reliability and failure handling" | 4 |
| Operating systems | operating-systems | "Kernel and hardware mechanism" | 3 |
| Backend & distributed | distributed-systems, backend-engineering, cloud-and-devops, software-architecture, performance-engineering | "Failure modes and trade-offs" | 5 |
| API design | api-design | "HTTP and API semantics" | 5 |
| Frontend & browser | frontend-engineering | "Browser and rendering mechanism" | 2 |
| AI & machine learning | ai-ml, genai-llms | "Model fundamentals", "Limitations and data quality" | 4 |
| Security | security | "Attack and defence mechanism" | 2 |
| Engineering concept | testing, compilers, developer-tools | base wording | 2 |
| General | everything else (fallback) | base wording | 0 |

A subcategory without a profile falls back by rubric (`dsa` → DSA, `technical-concept` → Engineering concept, …), then to General. The report names the topic ("Topic rubric: Go").

Question-specific evidence lives in each question's `expectedConcepts` (labels, criterion ids and spoken keyword variants) and `modelAnswer`. Topic-level knowledge — wording, strong-answer outline, misconceptions — lives once per topic, so nothing is duplicated across 1,325 questions. Misconception patterns can be limited to questions whose text contains certain words (`when`), so a binary-search check never fires on a union-find question.

## Local evaluator (default)

### Evidence

- **Concepts.** A reference point counts as mentioned when one of its keywords appears (short keywords must match whole words). Its evidence is the surrounding transcript text, copied verbatim.
- **Explained or named.** For technical rubrics, a mention counts as *explained* if an explaining word (because, which, so, when, by, if, means, …) appears within 8 words in the same sentence. Otherwise it is *named, not explained*.
- **Mentioned inside a wrong claim.** If the matching words are part of a flagged misconception ("goroutines are OS threads" mentions OS threads), the concept is treated as named, labelled "in a statement that may be wrong", and never praised.
- **Misconceptions.** Each topic lists narrow patterns for common wrong claims. A match becomes a "possible factual issue" with the exact transcript excerpt and the correct fact. It is skipped when the speaker is refuting the claim: "a common myth is that…", "it is not true that…", "many people think…". "I think…" is still flagged, because the speaker is asserting it. Patterns with `unless` are skipped when the speaker describes the valid variant (for example "thread safe only for its reference count").
- **Speech recognition.** Technical questions read common mishearings as the intended term ("cash" → cache, "go routine" → goroutine, "n log in" → n log n). The report says so under "Possible speech recognition errors", and grammar rules do not "correct" those words. Normal pronunciations such as "sequel" for SQL are matched silently.

### Scores

| Signal | Method | Score |
| --- | --- | --- |
| concepts | Credit per reference point: 1 if explained, 0.6 if only named (technical rubrics), 0 if missing. The criterion expects ⌈points × target⌉ well-explained points, where target = time spoken ÷ suggested time, between 0.5 and 1. | min(1, credit ÷ expected) × 100 |
| misconceptions | Each flagged statement lowers the main concept criterion (correctness, requirements or key ideas): −20 if `likely`, −10 if `possible`, at most −40. The note says so. | – |
| structure | Signpost words in 4 groups: sequence, cause, contrast, summary | 25 + 20 per group used |
| examples | "for example", "imagine", "let's say", … | 2+ → 100, 1 → 80, none → 30 (labelled "not detected") |
| grammar | ~15 conservative rules | 95 − 12 × issues per 100 words |
| vocabulary | Moving-average type-token ratio of content words; vague words | not assessed if < 15 content words |
| conciseness | Fillers and repeated 2–4-word phrases | 100 − 8 × rate per 100 words |
| directness | Warm-up opener and question terms in the first words | 40–100 |
| relevance | Share of question key terms used, averaged with concept coverage | 20 + ratio × 100 |

- The overall score is the weighted mean of assessed criteria. A criterion with no evidence is **"Not assessed"** (`null`), never a guess.
- Scores are heuristics labelled as such (`confidence: heuristic`). A score is a rough signal for practice, not a measurement of skill: 80+ means the reference points were covered and explained; 50–80 means partial coverage, named-only points or a possible misconception; below 50 means most points are missing.

### Report contents

- **What went well:** explained points, examples and structure, each with a transcript excerpt. Nothing is praised without evidence, and an empty transcript gets no praise.
- **Concepts:** covered (marked "named, not explained" where relevant) and not detected. A missing concept is never reported as a factual error.
- **Possible factual issues:** misconception matches, labelled as pattern matches that may be false alarms.
- **Structure and conciseness:** a late main point (first key concept after half the answer), missing sequencing or summary, the topic's one-minute frame, fillers and repeats.
- **Next steps (2–3):** fix a flagged claim first, then explain named points, then cover missing points, then delivery.
- **Model answer** and **How this was scored**, which states which misconceptions were checked and that everything else was not fact-checked.

## AI evaluator (optional)

Request (validated by `EvaluateRequestSchema`): `{ prompt, category, difficulty, rubricId, transcript, topicId?, referencePoints?, modelAnswer? }`. The transcript is limited to 12,000 characters, the reference answer to 2,000 and reference points to 12. Only the transcript is user data; the rest describes the question.

The server looks the topic rubric up by `topicId` from its own tables, so a client cannot inject criteria; an unknown topic id is rejected. Reference points and the reference answer are fenced in `<reference>` as data. The model is told to:

- quote evidence exactly from the transcript;
- keep missing concepts and factual errors separate, and accept other valid approaches;
- give less credit to terms that are only named;
- not penalise what would not fit in one minute;
- report likely recognition errors instead of correcting them as grammar;
- write an improved answer of at most 150 words, plus 2–3 specific next steps.

The response must match `AiAssessmentSchema`. `strengths` and `recognitionNotes` are optional, so older servers still work. **Grounding** then removes any evidence quote, correction, factual concern, strength or recognition note whose excerpt is not in the transcript, and the report says how many were removed. Missing criteria become "Not assessed", and metrics are always computed locally.

Errors map to typed codes: `not-configured`, `bad-request`, `too-large`, `rate-limited` (with Retry-After), `timeout`, `upstream-error`, `invalid-response`. The UI always offers **Use local feedback instead**, and the transcript is kept in memory so nothing is lost.

## Known limitations

- Concept detection is keyword-based. Correct paraphrases without any listed keyword are missed, and the explained/named check only looks for explaining words, not whether the explanation is right.
- The local factual check covers only the listed misconceptions (49 distinct patterns across topics). Any other wrong claim goes unnoticed, and a flagged pattern can be a false alarm. The report says both.
- Recognition aliases can occasionally credit a word the speaker really meant literally; the report always names the alias it applied.
- No word-level confidence comes from the Web Speech API in this adapter, so recognition uncertainty is inferred only from known mishearings.
- AI feedback can be wrong, even after grounding; quotes are guaranteed to be in the transcript, judgements are not guaranteed to be correct.

## Adding a topic or a misconception

1. Add or edit a profile in `src/evaluation/topics/profiles.ts`: subcategories, criterion overrides (only ids that exist in the base rubrics), `strongAnswer`, `oneMinuteFrame` and `misconceptions`.
2. Write misconception patterns against normalised text (lowercase; punctuation becomes spaces; "doesn't" → "doesnt"). Keep them narrow, use `when` to limit them to relevant questions, `unless` for valid variants, and `negated: true` if the pattern itself contains "not".
3. Add tests to `src/evaluation/feedbackEngine.test.ts`: the topic selection table, a wrong sentence that is flagged, and a correct or refuting sentence that is not. The suite already checks that no pattern fires on its own correction text, that overrides use real criterion ids, and that every question still produces a schema-valid report.
4. Run `npm test` and `npm run check`.

## Tests

`npm test` runs 176 tests in 11 files. The feedback engine is covered by:

| Area | File |
| --- | --- |
| Topic selection for every topic, fallback, rubric compatibility, misconception true/false positives, refutations, `when`/`unless`, explained vs named, contradicted concepts, verbatim evidence, missing vs incorrect, alternative approaches, recognition aliases, time-scaled coverage, bank-wide schema and score bounds, empty transcripts, research notes, late main point | `src/evaluation/feedbackEngine.test.ts` |
| Analysis helpers, grammar rules, rubric-specific reports, determinism, "not assessed" | `src/evaluation/evaluation.test.ts` |
| AI handler: topic guidance, reference fencing, unknown topic ids, oversized fields, grounding of strengths, malformed JSON, provider failures, no logging | `functions/_lib/evaluate.test.ts` |
| AI client: payload, strengths and notes merge, older-server compatibility, malformed reports | `src/ai/aiEvaluator.test.ts` |
| UI: topic rubric and "What went well" in the full session | `src/App.test.tsx` |

`npm run test:e2e` (Playwright, desktop and Pixel 7 viewports) covers a full session with a fake recogniser, cloud opt-in gating, permission denial, keyboard operation, layout and runtime errors.
