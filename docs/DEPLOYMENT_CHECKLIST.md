# Deployment checklist

VerbalCode is deployed to the Cloudflare Pages project `verbal-code` (https://verbal-code.pages.dev) by **direct upload with Wrangler**. The project is not linked to Git, so pushing to GitHub does **not** deploy anything.

## 1. Before deploying

```bash
npm ci                         # clean install from package-lock.json
npm run check                  # lint + strict typecheck + unit tests + production build
npx playwright install chromium   # once per machine
npm run test:e2e               # desktop and mobile Chromium against the production build
```

All four must pass. Last run on 19 October 2026 (Windows 11, Node 24.22):

| Check | Result |
| --- | --- |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | Passes (strict) |
| `npm test` | 176 tests passed in 11 files |
| `npm run build` | Passes. App chunk 117 KB gzip, questions chunk 418 KB gzip, CSS 4 KB gzip |
| `npm run test:e2e` | 12/12 passed (6 scenarios × desktop and mobile Chromium) |
| Same E2E suite on installed Google Chrome and Microsoft Edge | 12/12 passed |
| Local Pages emulation (`wrangler pages dev dist`) | Headers, SPA fallback, `/api/evaluate` status, 400/413/503 error paths verified |

E2E tests replace the Web Speech API with a fake, so they cannot test a real microphone or real recognition. Use the manual checklist in the README for that.

## 2. Deploy

```bash
npm run build
npx wrangler@4 pages deploy dist --project-name verbal-code --branch main --commit-dirty=true
```

- `--branch main` publishes to production. Any other branch name creates a preview URL.
- The `functions/` folder is bundled automatically and served at `/api/evaluate`.
- Wrangler is already logged in on the development machine. Check with `npx wrangler@4 whoami`.

## 3. Configuration

| Setting | Where | Notes |
| --- | --- | --- |
| `AI_API_KEY`, `AI2_API_KEY` | Pages secrets: `npx wrangler@4 pages secret put AI_API_KEY --project-name verbal-code` | Never in `wrangler.toml`, `.env.example` or Git |
| `AI_BASE_URL`, `AI_MODEL`, `AI_PROVIDER_LABEL`, `AI_DATA_NOTICE`, limits | Pages secrets or variables | `AI_DATA_NOTICE` is shown in the consent dialog, so keep it accurate |
| Fallback models, Workers AI model, `AI_TOTAL_TIMEOUT_MS` | `[vars]` in `wrangler.toml` | Deployed with the code |
| Workers AI binding `AI` | `[ai]` in `wrangler.toml` | No key needed |

Secret changes take effect only after the next deploy.

## 4. Verify the live site after deploying

```bash
B=https://verbal-code.pages.dev
curl -sI $B/ | grep -iE "content-security-policy|permissions-policy"   # security headers present
curl -s  $B/api/evaluate                                              # {"configured":true,...}
curl -s -o /dev/null -w "%{http_code}\n" $B/any/path                  # 200 (SPA fallback)
JS=$(curl -s $B/ | grep -o '/assets/index-[^"]*\.js')
curl -sI $B$JS | grep -i cache-control                                # max-age=31536000, immutable
```

Then in desktop Chrome:

- [ ] The footer shows the expected number of questions (1,445 for this release). A lower number means stale assets or a deploy of the wrong `dist/`.
- [ ] Pick DSA, start speaking, say a few sentences, finish: feedback appears.
- [ ] With AI feedback on, a report names the model that answered.
- [ ] DevTools Console shows no errors; the Network tab shows no failed requests.
- [ ] Reload the page: it loads normally.

## 5. Status of the live deployment (checked 19 October 2026, before this release)

| Check | Result |
| --- | --- |
| Security headers (CSP, Permissions-Policy, X-Frame-Options, nosniff, Referrer-Policy) | Present |
| `/api/evaluate` status | `configured: true`, "Groq (GPT-OSS 120B) + 5 backups", data notice present |
| Deep path reload | 200 |
| Cross-origin preflight to `/api/evaluate` | 405, so other websites cannot call the API from a browser |
| Question data | **Stale:** about 179 questions; none of the new questions are deployed |
| Hashed asset caching | `max-age=0, must-revalidate` (fixed in this release by a `/assets/*` rule in `public/_headers`) |

## Findings from the repository

**Confirmed and fixed**

- Hashed JS and CSS were revalidated on every visit. `public/_headers` now marks `/assets/*` as immutable for a year. Filenames change whenever content changes, so this is safe.
- The whole app was one 1.8 MB (535 KB gzip) JavaScript file that went past the chunk-size warning. Questions are now a separate chunk, preloaded in parallel, so changing questions does not invalidate the cached app code and vice versa.
- The API's 64 KB body limit could be bypassed with chunked transfer encoding. The body is now measured after reading.

**Risks, not confirmed defects**

- The JavaScript downloaded on first load (~535 KB gzip in total) has doubled with the larger question bank. It is fine on broadband but slow on poor mobile networks. Loading one category at a time would need the bank to load asynchronously.
- `/api/evaluate` is public, and its rate limiter is in-memory per instance. Add a Cloudflare WAF rate-limiting rule for `/api/*` to protect free AI quotas.
- `wrangler.toml` pins `compatibility_date = "2025-09-01"`. That is fine, but review it occasionally.
- Without a Git-linked Pages project, deploys depend on someone remembering to run the deploy command. Optional: connect the GitHub repo in the Cloudflare dashboard (build command `npm run build`, output `dist`, `NODE_VERSION=22`), or add a GitHub Action that runs `wrangler pages deploy`.

**Checked and fine**

- No secrets in the repository, its Git history or `dist/` (searched for Groq, Google and OpenAI key patterns). `.dev.vars` and `.env*` are ignored.
- No source maps are shipped.
- The base path is `/`, matching a root-domain Pages deployment.
- With no client-side router, refreshing any path serves `index.html` (Pages SPA fallback).
- Without an API (for example `vite preview`), the AI status probe returns 404 and the app correctly shows "not configured".
