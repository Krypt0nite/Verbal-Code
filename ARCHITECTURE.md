# Architecture

VerbalCode is a static React + TypeScript single-page app with one optional serverless function. Domain logic is plain TypeScript with no React, so it is unit-tested directly; React components only render state and forward events.

```
src/
  domain/            types + Zod schemas, question repository, selector
  data/              taxonomy.json and questions/*.json (version-controlled)
  session/           state machine (pure reducer), monotonic Countdown, sound cues
  speech/            SpeechRecognizer interface + Web Speech adapter
  privacy/           SessionPurger (explicit cleanup), disclosures, storage audit helper
  evaluation/        rubrics, transcript analysis, grammar rules, local evaluator, report schema
  ai/                request/response contract (shared with server), AI evaluator client
  settings/          preferences schema + storage (the only persisted data)
  hooks/             usePracticeSession: orchestrates machine + timers + speech + evaluation
  components/        UI
functions/
  _lib/evaluate.ts   platform-independent AI evaluation handler
  api/evaluate.ts    Cloudflare Pages Function wrapper (GET status, POST evaluate)
e2e/                 Playwright tests with a fake SpeechRecognition
```

## Session state machine

`src/session/machine.ts` is a pure reducer:

```
idle ─SELECT→ ready ─START_PREP→ preparing ─PREP_DONE→ ready
ready|preparing ─REQUEST_MIC→ requesting-mic ─MIC_READY→ speaking ⇄ paused
speaking|paused ─FINISH→ processing ─TRANSCRIPT_OK→ evaluating ─EVALUATED→ completed
                                    └TRANSCRIPT_INSUFFICIENT→ insufficient
requesting-mic ─MIC_FAILED→ error      speaking|paused ─RECOGNITION_ERROR→ error
evaluating ─EVALUATION_FAILED→ error ─RETRY_EVALUATION→ evaluating (local)
CANCEL → ready (keeps question)   RETRY → ready   DISCARD → idle (clears everything)
```

Design rules:
- **Invalid events are ignored.** A second `FINISH` (timer end + button + recogniser end) cannot advance the machine twice.
- **Attempt numbers.** Each speaking attempt increments `attempt`; async results (`TRANSCRIPT_OK`, `EVALUATED`, …) carry the attempt and are dropped if stale. The hook also keeps an `attemptRef` that cancel/discard bump, so callbacks from a recogniser whose permission prompt resolved after the user cancelled are discarded and the recogniser is aborted.
- Distinct UI states exist for ready, preparing, requesting permission, listening, paused, processing, evaluating, completed, permission denied / no mic / unsupported / local unavailable / network (`error.kind`), and AI failure.

## Timer

`Countdown` (`src/session/timer.ts`) never decrements a counter. It stores accumulated elapsed time plus the start of the current running segment, read from `performance.now()`. Ticks (every 200 ms) only recompute `duration − elapsed`. Consequences:
- Background-tab throttling and device sleep cannot cause drift; the hook also calls `tick()` on `visibilitychange`, so an expired timer completes as soon as the tab is visible.
- Pause stores elapsed time and clears the interval; resume starts a new segment.
- `start`/`resume` are no-ops in the wrong state, so duplicate intervals are impossible. `onComplete` fires exactly once; `cancel` never fires it.
- Clock and scheduler are injectable for deterministic tests.

## Speech recognition

`SpeechRecognizer` is a small interface (`detect`, `installLocal`, `start` → `TranscriptionSession` with `pause/resume/finish/abort`). `createWebSpeechRecognizer` adapts the Web Speech API:
- Detects the unprefixed or `webkit` constructor and the on-device API (`SpeechRecognition.available/install` with `processLocally`, or the older `availableOnDevice/installOnDevice` + `mode: 'ondevice-only'`).
- **Local mode sets `processLocally = true` and refuses to start if the API is missing.** There is no code path that silently switches to cloud; cloud is a separate `location: 'cloud'` that the UI only passes after consent.
- Browsers end "continuous" recognition after silence. The adapter restarts automatically, accumulates final text across instances, and reports an error if restarts loop or a restarted instance fails before starting (so the session never goes silently deaf).
- **Pause/resume:** the API cannot pause, so pause = `stop()` (flushing results) and resume = a new instance appending to the same transcript. The UI states this.
- `finish()` waits for the final flush (bounded by a 2.5 s timeout). `abort()` drops text, nulls handlers and releases the microphone.

## Evaluation

`Evaluator` has one method: `evaluate(input, signal) → FeedbackReport`. Two implementations:
- `localEvaluator` — deterministic, rule-based, on-device. See EVALUATION.md.
- `createAiEvaluator` — calls `/api/evaluate`, validates the response with Zod, and merges model judgements with locally measured metrics.

`FeedbackReportSchema` (Zod) is the single report shape for both; tests validate local reports against it.

## AI endpoint

`functions/_lib/evaluate.ts` takes `(body, clientKey, env, {fetch, limiter})` and returns `{status, body}`, so it is fully testable without Cloudflare. It validates input, applies a per-client limiter, calls the provider with a timeout, parses/strips fenced JSON, validates against `AiAssessmentSchema`, and **grounds** the result: corrections, factual concerns and evidence quotes that are not substrings of the transcript are removed and counted. It never logs bodies.

## Key decisions

| Decision | Why |
| --- | --- |
| `useReducer` + one orchestration hook, no state library | One screen, one session. A pure reducer is easy to test and needs no dependency. |
| Zod for questions, preferences and AI I/O | Same schemas validate data at load, at storage boundaries and across the network. |
| Question bank as JSON validated at startup | Data-driven taxonomy; authoring errors (bad subcategory, rubric mismatch) fail tests instead of silently breaking the UI. |
| Keyword-based concept detection, labelled as such | Honest, deterministic and offline. Better than inventing a score. |
| OpenAI-compatible provider adapter | Works with several free tiers without vendor lock-in. |
| Cloudflare Pages | Free static hosting plus serverless functions in one place. |
| System font stacks | No third-party font requests, so a privacy-first app makes no hidden network calls. |
| Custom modal instead of `<dialog>` | Consistent focus trapping and Escape behaviour, testable in jsdom. |

## Extending

- **Mock interview follow-ups:** `buildSequence` already produces ordered sequences. Add a `followUps` field to questions and a `NEXT` event.
- **Typed-answer fallback** for browsers without speech recognition: feed text into the same `TRANSCRIPT_OK → evaluating` path.
- **Live research:** would need a new server function; the Deep research UI already separates "notes" from the question.
