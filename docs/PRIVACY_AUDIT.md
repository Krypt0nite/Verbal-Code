# Privacy and functional audit

What the code does with speech, transcripts and stored data, checked against the source on 19 October 2026. Every claim below points to the code or test that supports it. [PRIVACY.md](../PRIVACY.md) is the user-facing summary; this document is the evidence behind it.

## Summary

| Requirement | Status | Evidence |
| --- | --- | --- |
| One-minute default speaking timer | Verified | `DEFAULT_PREFERENCES.speechSec = 60` in `src/settings/preferences.ts`; App and E2E tests assert `1:00` |
| Timer start, finish, cancel and retry | Verified | `src/session/timer.ts` (monotonic clock, `onComplete` fires exactly once); `timer.test.ts`, `machine.test.ts` |
| Microphone permission only on a user action | Verified | `recognizer.start()` is called only from `startSpeaking()` (the **Start speaking** button) |
| Permission and recognition errors explained | Verified | `mapRecognitionError` in `src/speech/webSpeech.ts`; E2E "permission denial is explained" |
| Recognition stopped and microphone released when a session ends | Verified | `SessionPurger` runs `releaseResources()` on cancel, discard, new question, retry, page hide and unmount; `abort()` calls `rec.abort()` |
| No raw audio recorded | Verified | No `MediaRecorder` or `getUserMedia` in `src/` or `functions/`; the only `AudioContext` (`session/sounds.ts`) plays start and end beeps. Only the browser's speech engine uses the microphone |
| No transcript persistence | Verified | The only `localStorage` writes are in `settings/preferences.ts`, through strict Zod schemas; App and E2E tests check storage after a session |
| Honest disclosure of local versus cloud recognition | Verified, improved | See "Speech recognition" below |
| Category-specific feedback with evidence | Verified | Rubric per question (`rubricId`); local evaluator quotes transcript excerpts; AI excerpts not found in the transcript are dropped server-side |
| Graceful behaviour without browser APIs or AI | Verified | Unsupported browsers get an explanation and a disabled **Start speaking**; AI status failures fall back to "not configured"; evaluation errors offer **Use local feedback instead** |

## Speech recognition

- **Local mode** sets `processLocally = true` (or the older `mode = 'ondevice-only'`) and refuses to start if the browser has no on-device API (`webSpeech.ts`, tests "refuses local mode without an on-device API").
- **There is no automatic cloud fallback.** Cloud recognition is a separate setting that the UI only enables after the cloud consent dialog.
- **What VerbalCode cannot prove:** on-device recognition is implemented by the browser vendor. VerbalCode asks for it and checks that the API exists, but it cannot audit what Chrome or Edge does internally. Before this audit, that caveat appeared only in a hover tooltip on the "On-device recognition" badge, which touch devices and many screen-reader users never see. **Fixed:** the Privacy dialog now states it in plain text.
- The app never describes cloud recognition as local. The badge reads "Cloud recognition (browser vendor)" and its description says audio goes to the browser vendor.

## Data that leaves the device

| Data | Destination | When |
| --- | --- | --- |
| Audio | Browser vendor's speech service | Only in cloud mode, after consent; VerbalCode never receives it |
| Question prompt, category label, difficulty, rubric id, transcript | `/api/evaluate`, then the configured AI providers | Only when AI feedback is turned on through its consent dialog |
| Nothing | – | Local recognition with local feedback |

The live deployment's status endpoint names the providers (Groq, then Google Gemini or Cloudflare Workers AI as fallbacks) and warns that free-tier Gemini data may be used to improve Google's products. That notice comes from the `AI_DATA_NOTICE` secret and is shown in the consent dialog.

Server-side (`functions/_lib/evaluate.ts`, `functions/api/evaluate.ts`):

- The API key comes only from environment variables and secrets; it never reaches the browser bundle. Checked by searching `dist/`.
- Logs contain only provider labels and error categories (`console.error` calls in `evaluate.ts`), never request or response bodies.
- The rate limiter keeps client IPs in memory for at most a minute and does not log them.
- Request bodies are capped at 64,000 characters. **Fixed:** the cap used to rely only on the `Content-Length` header, so a chunked request could bypass it. The body is now measured after reading (verified locally: a chunked 70 KB body returns 413).

## Defects found

| # | Defect | Impact | Fix |
| --- | --- | --- | --- |
| 1 | Pressing **Finish** just after **Pause**: the paused recogniser had been stopped but had not yet delivered its last results, and the session was torn down immediately | The last words could be lost from the transcript and feedback | `finish()` now waits for the paused instance to end (bounded by the 2.5 s flush timeout). Regression test added. |
| 2 | If the browser never finished flushing within 2.5 s, unconfirmed (interim) words were dropped, although the UI had shown them | Transcript shorter than what the user saw | On timeout, the unconfirmed words are kept. Regression test added. Still memory-only. |
| 3 | On-device caveat visible only in a tooltip | Users could over-trust "on-device" | Caveat added to the Privacy dialog |
| 4 | Body-size guard bypassable with chunked encoding | Larger requests reached the JSON parser (Zod still rejected transcripts over 12,000 characters) | Measure the body after reading |

## Remaining risks

- **Back/forward cache.** On `pagehide` with `persisted = true` (page kept in the bfcache) the app does not purge state, so a transcript could survive in memory if the user navigates away and back. Browsers normally refuse to cache pages with an active microphone, and memory is never written to disk by the app, but this was not tested.
- **The AI endpoint is public.** Anyone can call `/api/evaluate` from a script (browsers on other sites are blocked because the CORS preflight fails). The only abuse protection is the best-effort, per-instance in-memory limiter. Add a Cloudflare rate-limiting rule to protect the free-tier quotas.
- **Speech engine behaviour is outside VerbalCode's control.** Chrome's cloud recognition sends audio to Google, and its retention is governed by Google's terms.
- **Free AI tiers.** Their data policies change. Re-check them and update `AI_DATA_NOTICE` whenever the provider chain changes.

## Tests that guard these properties

- `src/privacy/privacy.test.ts`: purger behaviour and the storage audit helper
- `src/speech/webSpeech.test.ts`: no cloud fallback, abort releases the microphone and drops text, flush after pause, timeout keeps words
- `src/session/machine.test.ts`, `src/session/timer.test.ts`: state transitions, duplicate finish, cancel and retry, timer drift
- `src/App.test.tsx`: full session with storage checks, permission errors, AI consent and fallback
- `e2e/practice.spec.ts`: on-device flag set, cloud opt-in required, permission denial, storage and URL clean after a session, no runtime errors
