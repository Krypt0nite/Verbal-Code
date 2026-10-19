/**
 * Cloudflare Pages Function: POST /api/evaluate and GET /api/evaluate (status).
 * Configure secrets with `wrangler pages secret put AI_API_KEY` or in the dashboard. See README.
 */
import { handleEvaluate, MemoryRateLimiter, readConfig, statusFor, type AiEnv } from '../_lib/evaluate';

interface PagesContext {
  request: Request;
  env: AiEnv;
}

let limiter: MemoryRateLimiter | null = null;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });

export const onRequestGet = ({ env }: PagesContext) => json(statusFor(env));

export const onRequestPost = async ({ request, env }: PagesContext) => {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
    return json({ ok: false, code: 'bad-request', message: 'Expected JSON.' }, 415);
  }
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > 64_000) return json({ ok: false, code: 'too-large', message: 'Request too large.' }, 413);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, code: 'bad-request', message: 'Malformed JSON.' }, 400);
  }
  limiter ??= new MemoryRateLimiter(readConfig(env)?.maxPerMinute ?? 6);
  const clientKey = request.headers.get('cf-connecting-ip') ?? 'anonymous';
  // Wrap fetch: Workers throws "Illegal invocation" if it is called as a method of another object.
  const result = await handleEvaluate(body, clientKey, env, { fetch: (input, init) => fetch(input, init), limiter });
  const retry = !result.body.ok && result.body.retryAfterSec ? { 'retry-after': String(result.body.retryAfterSec) } : undefined;
  return json(result.body, result.status, retry);
};
