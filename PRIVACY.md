# Privacy

Privacy is a product requirement in VerbalCode, not a setting. This document describes exactly what happens to your speech, and what VerbalCode cannot guarantee.

## What VerbalCode never does

- Never records, stores or uploads audio. There is no `MediaRecorder`, no audio buffer and no upload path. Microphone access is used only by the browser's speech-recognition engine.
- Never writes transcripts to `localStorage`, `sessionStorage`, IndexedDB, cookies, analytics or logs. There is no analytics code at all.
- Never puts transcript text in URLs or error messages.
- Never sends a transcript to an AI provider unless you turned on AI feedback through the consent dialog.
- Never switches from on-device recognition to a cloud service on its own.
- Never loads third-party scripts or fonts (CSP: `default-src 'self'`).

## Data flows

```
Microphone ─► Browser speech engine ─► text ─► React state (this tab only)
                  │                                 │
                  ├─ on-device (default)            ├─► local evaluator (in the tab)
                  └─ vendor cloud (only after       └─► /api/evaluate ─► AI provider
                     your consent)                       (only with AI feedback on;
                                                          prompt, category, difficulty,
                                                          rubric id, transcript)
```

### Speech recognition
- **On-device (default):** VerbalCode asks Chrome to process speech locally (`processLocally`). If the browser cannot, VerbalCode tells you and does nothing until you choose.
- **Cloud (opt-in):** your browser sends audio to its vendor's speech service (for example Google for Chrome). VerbalCode never receives that audio and cannot control the vendor's processing. While speaking, a badge always shows which mode is active.
- **What we cannot guarantee:** on-device recognition is implemented by the browser vendor. VerbalCode can request it and detect its availability, but it cannot independently audit the browser.

### What is stored in your browser
Only these two `localStorage` keys, both validated by strict schemas that reject unexpected fields:
- `verbalcode:prefs:v1` — timings, language, recognition choice, consents, sound, last filters.
- `verbalcode:recent:v1` — up to 50 question IDs (e.g. `dsa-heap-priority-queue`), used to avoid repeating questions.

Privacy → **Clear stored settings and question history** removes both.

### Cleanup
`SessionPurger` (`src/privacy/privacy.ts`) runs an explicit cleanup — abort recognition and release the microphone, cancel timers, abort in-flight AI requests — at every lifecycle boundary: **cancel**, **discard**, **new question**, **closing feedback / retry**, **page hide** and **unmount**. The reducer clears transcript state on the same transitions. Unit, component and E2E tests check that transcripts never reach web storage.

### AI feedback (optional)
- Off by default; only available if the deployment has a server-side key.
- Enabling it shows what will be sent and to whom. The deployment can add a provider-specific notice (`AI_DATA_NOTICE`).
- The API key stays on the server. The function does not log request or response bodies; it logs only error categories (e.g. "provider status 503").
- The rate limiter keys on the client IP in memory only, for at most a minute, and never logs it.
- **Free AI tiers may use submitted text to improve their products.** Read the provider's terms. Do not say anything during practice that you wouldn't want to share.

## Reporting
If you find a privacy issue, open an issue describing it without including any personal data.
