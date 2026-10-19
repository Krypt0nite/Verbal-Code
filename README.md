# VerbalCode

**Think aloud. Code clearly.** A privacy-first web app for practising spoken technical explanations: DSA, system design, backend, frontend, C++, Go, AI/ML, behavioral interviews and impromptu English speaking.

Pick a category → get a random question → (optionally) prepare → speak against a timer (default **1 minute**) → get structured, evidence-based feedback.

- Runs entirely in the browser. No database, no account, no paid service required.
- No audio is ever recorded. Transcripts live only in the tab's memory.
- On-device speech recognition by default; cloud recognition only with explicit consent.
- Feedback is computed locally with topic-specific rubrics. Optional AI feedback runs through a serverless endpoint that keeps the API key on the server.

## Quick start

Requirements: Node.js 20.19+ (22 recommended), a Chromium-based browser (Chrome or Edge) for speech recognition.

```bash
npm install
npm run dev          # http://localhost:5173
```

Open the app in **desktop Chrome or Edge**. Speech recognition does not work in Firefox, and on-device recognition requires a recent Chrome (see [Known limitations](#known-limitations)).

### Daily use

1. Choose a mode: **Off the cuff**, **Interview**, **Deep research** or **Mock interview**.
2. Choose a category, an optional subcategory and a difficulty, then press **Give me a question**.
3. Optionally press **Prepare** (Deep research gives you curated notes and 5 minutes by default).
4. Press **Start speaking**, explain out loud, press **Finish** (or let the timer end).
5. Read the feedback, open **Show a model answer**, and **Try this question again**.
6. Press **Discard transcript and feedback** when done.

Settings (top right) control speaking time (1–10 min), preparation time (0–60 min), language/accent model (en-US, en-GB, en-IN), recognition location, AI feedback, sound cues and the live transcript.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | ESLint (incl. React hooks rules) |
| `npm run typecheck` | `tsc` in strict mode |
| `npm test` | Vitest unit + component tests |
| `npm run test:e2e` | Playwright end-to-end tests (desktop + mobile Chromium) |
| `npm run check` | lint + typecheck + tests + build |
| `npm run dev:api` | Build and serve `dist/` + the `/api` function with Wrangler on :8788 |

For E2E tests, install the browser once: `npx playwright install chromium`.

## Test results (actually run)

Run on 19 Oct 2026 in a Linux sandbox, Node 22.22:

| Check | Result |
| --- | --- |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | passes (strict, `noUncheckedIndexedAccess`) |
| `npm test` | **111 tests passed** in 10 files |
| `npm run build` | passes, ~159 kB gzipped JS |
| `npm run test:e2e` | **10/10 passed** (5 scenarios × desktop + mobile) |

The E2E suite ran in one go with Playwright's bundled Chromium (`PW_CHROMIUM_PATH` pointed at the preinstalled build). On your machine, run `npx playwright install chromium` once, then `npm run test:e2e`.

What the tests cover is listed in [EVALUATION.md](EVALUATION.md#tests) and [ARCHITECTURE.md](ARCHITECTURE.md).

## Free deployment (Cloudflare Pages)

The app is a static site plus one optional function, which fits Cloudflare Pages' free plan. At the time of writing, static asset requests are free and unlimited, and Functions share the Workers free quota of 100,000 requests per day. Check the current [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/) before relying on it.

1. Push the repository to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
3. Build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION=22`.
4. Deploy. The `functions/` folder is picked up automatically and served at `/api/evaluate`.
5. (Optional) Configure AI feedback — see below. Without it, the app shows "AI feedback: not configured" and uses local feedback.

`public/_headers` sets a strict Content-Security-Policy, `Permissions-Policy: microphone=(self)` and other security headers.

**Other hosts:** any static host works for the core app (Netlify, Vercel, GitHub Pages). The AI endpoint is written as a Cloudflare Pages Function; its logic lives in `functions/_lib/evaluate.ts` (platform-independent), so porting it is a ~20-line wrapper.

## Optional AI feedback

The AI evaluator is **off by default** and needs a server-side key.

- The endpoint talks to any **OpenAI-compatible** Chat Completions API, for example Groq or Google Gemini's OpenAI-compatible endpoint.
- Copy `.env.example` → `.dev.vars` for local use (`npm run dev:api` plus `npm run dev`), or set the variables in Cloudflare (mark `AI_API_KEY` as a secret).
- The browser sends only: question prompt, category, difficulty, rubric id and transcript. Never audio.
- The model must return JSON. It is validated with Zod, and any quoted excerpt that does not appear in your transcript is dropped. Word count, pace and fillers are always measured locally.
- Rate limits, timeouts, malformed JSON, truncated output, provider outages and missing configuration all produce a clear message, plus a **Use local feedback instead** button.

**Free tiers are not unlimited, and their data terms differ.** Third-party summaries reported in Oct 2026 that Groq publishes per-model free limits (e.g. Llama 3.3 70B: about 30 requests/minute and 1,000 requests/day) and does not retain inference data by default. They also reported that Gemini's free tier allows Google to use prompts and responses to improve its products. Confirm on the providers' own pages before enabling, and put an honest summary in `AI_DATA_NOTICE`, which is shown in the consent dialog. Don't expose a personal key on a public URL without a platform rate-limit rule. The built-in limiter is per-instance and best-effort only.

## Known limitations

- **Browser support.** Speech recognition needs Chrome/Edge (desktop is the most reliable). Safari support is partial; Firefox has none. The app detects this and explains it.
- **On-device recognition** uses Chrome's on-device Web Speech API (`processLocally`, Chrome 139+ style; an older `mode: 'ondevice-only'` draft is also detected). Availability depends on the browser version, OS and downloaded language pack. VerbalCode never silently falls back to cloud recognition, but it cannot independently verify what the browser does internally.
- **Pause** is implemented by stopping recognition and starting a new one on resume (the Web Speech API has no pause). The text so far is kept and the timer freezes.
- **Transcript-only feedback.** Nothing is measured from audio: no pronunciation, tone, confidence or pause analysis. Recognisers often drop "um"/"uh", so filler counts are a lower bound.
- **Local evaluator is heuristic.** Concept coverage is keyword-based. Mentioning a term doesn't prove it was explained correctly, and correct paraphrases may be missed. It cannot check facts; use the model answer or AI feedback for that.
- **Mock interview** is a basic sequence of 2–6 questions with a score summary; there are no follow-up questions yet.
- **Deep research** uses curated notes stored with each question. It does not search the web.
- The question bank (77 questions) is deliberately small and reviewed rather than large. Every Tech & AI subcategory has at least one question; non-technical categories have a few starter questions.

## Manual verification checklist

Use desktop Chrome with a real microphone.

**Microphone permission**
- [ ] First **Start speaking** shows the browser permission prompt (never before clicking).
- [ ] Blocking it shows "Microphone access was blocked…" and **Try again**.
- [ ] Unplugging/disabling the mic shows the "No microphone was found" message.

**Timer**
- [ ] Timer shows 1:00 by default and counts down once per second.
- [ ] Pause freezes the timer; Resume continues from the same value.
- [ ] Switch to another tab for 2 minutes during a 1-minute attempt, come back: feedback appears immediately (the timer did not drift or freeze).
- [ ] Pressing **Finish** repeatedly produces one report only.
- [ ] Changing speaking time in Settings to 2.5 min shows 2:30.

**Local transcription**
- [ ] With on-device recognition available, the badge reads "On-device recognition".
- [ ] If the language pack is downloadable, the download button appears; no cloud processing happens before you opt in.
- [ ] In a browser without on-device support, **Start speaking** is disabled until you accept cloud recognition, and the badge then reads "Cloud recognition (browser vendor)".
- [ ] Withdrawing consent in Settings switches back to on-device only.

**Privacy cleanup**
- [ ] DevTools → Application → Local Storage: only `verbalcode:prefs:v1` and `verbalcode:recent:v1` exist, and neither contains your words.
- [ ] Session Storage and IndexedDB are empty.
- [ ] **Cancel attempt** and **Discard transcript and feedback** remove the transcript from the screen; the mic indicator in the tab disappears.
- [ ] Closing the tab while speaking releases the microphone.
- [ ] The URL never contains transcript text.

**AI failure handling** (with `npm run dev:api`)
- [ ] With no key configured, the AI checkbox is disabled with "Not configured on this deployment".
- [ ] With an invalid key, finishing an attempt shows an error and **Use local feedback instead** works.
- [ ] Setting `AI_MAX_REQUESTS_PER_MINUTE=1` and finishing twice quickly shows the rate-limit message.
- [ ] Turning AI on requires accepting the disclosure dialog.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): modules, state machine, key decisions
- [PRIVACY.md](PRIVACY.md): data flows and guarantees (and their limits)
- [EVALUATION.md](EVALUATION.md): rubrics, scoring, AI contract, tests
- [docs/QUESTION_AUTHORING.md](docs/QUESTION_AUTHORING.md): taxonomy and how to add questions
- [CLAUDE.md](CLAUDE.md): project context for AI coding assistants
