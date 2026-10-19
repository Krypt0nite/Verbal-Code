# VerbalCode — notes for AI coding assistants

Privacy-first speaking practice app. React 19 + TypeScript (strict) + Vite, Zod, Vitest/RTL, Playwright. Optional Cloudflare Pages Function for AI feedback.

## Commands
- `npm run check` — lint, typecheck, unit tests, build (run before finishing any change)
- `npm test` / `npm run test:e2e` (`npx playwright install chromium` first)
- `npm run validate:questions` — after editing `src/data/questions/*.json`

## Non-negotiables
- Never persist transcripts or audio (no localStorage/IndexedDB/logs/URLs). Only `settings/preferences.ts` writes storage, through strict schemas.
- Never fall back from local to cloud recognition without the consent flow.
- Never fabricate feedback: unassessable criteria are `score: null`; too-short transcripts go to `insufficient`.
- The API key stays server-side (`functions/`). Don't log request bodies.
- Keep domain logic (domain/, session/, speech/, evaluation/) free of React and covered by unit tests.
- All UI copy is English, sentence case, active voice.

## Where things are
See ARCHITECTURE.md. The state machine is `src/session/machine.ts` (pure reducer); orchestration is `src/hooks/usePracticeSession.ts`; rubrics are `src/evaluation/rubrics/index.ts`.

## Roadmap ideas
Mock-interview follow-up questions; typed-answer fallback for unsupported browsers; more questions (Go, Rust, Kubernetes, HFT/low-latency); progress history stored as scores only (opt-in).
