# Vercel deployment

The React/Vite frontend and Node.js functions in `api/` form the Vercel application. `/health` and `/analyze` are rewritten to the functions. The Python API remains available for local rehearsal and other hosts; it is not deployed to Vercel. The retired Sites adapter is not part of this build.

## Public demonstration scope

Only text analysis is public. Browser OCR supplies reviewed text; screenshots, cases, drafts, PDF files and reminders remain on the user's device. There are no public saved-case, approval, operations or community-report endpoints. The same shared engine runs Gemini tool-calling and cited retrieval. An unavailable model falls back explicitly to rules. The evidence score is not a probability and never establishes safety.

## Durable security storage

Configure an Upstash Redis store on its free plan through Vercel Storage. This requires accepting the provider integration terms; Vercel shares account ID, email and usage information with Upstash. Do not select a paid plan without an explicit budget decision. Provide `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or Vercel's `KV_REST_API_URL` and `KV_REST_API_TOKEN`) server-side. Eviction must remain disabled: deleting quota keys would reset limits, and deleting audit keys would remove the checkpoint. The free plan has capacity and command limits; storage failures reject analysis rather than bypass controls.

Lua atomically reserves all three budgets: six analyses per Vercel-observed peer per minute, 20 total per minute, and 200 total per UTC day. Instances share counters. Client-provided ordinary forwarded headers are ignored. Only the platform-managed `x-vercel-forwarded-for` is used on Vercel; missing IP information shares a conservative unknown-peer bucket.

The metadata ledger uses HMAC-SHA256 and atomic compare-and-swap to keep one chain across instances. It stores request IDs, hashed peers, route, time and status, without message text or provider secrets. Completed results are withheld if completion logging fails. Redis administrators can modify storage; independent external checkpoints and SIEM retention remain an operator responsibility. This is tamper-evident prototype logging, not a certified seven-year archive. Unit tests use a shared in-memory Redis transport and do not prove a real hosted Lua execution.

## Secrets

Set `LLM_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.5-flash-lite`, the user's `GEMINI_API_KEY` and a persistent random `SCAMSHIELD_AUDIT_KEY` of at least 32 characters in Vercel server environment variables. Never use a `VITE_` prefix for credentials. `.vercelignore` excludes local bindings, all environment files, virtual environments, scanner files, backups, local databases and output artifacts from upload. The Gemini free tier remains subject to Google's project quota and data terms.

## Release gate

1. Run `npm run security`; no scanner findings or advisory exceptions are permitted.
2. Commit and push through the supplied hooks; open a PR against protected `main`.
3. Require successful `security-gate` CI and an independent approval of the final PR revision, then merge.
4. Link the Vercel project without enabling direct Git auto-deploy. Configure the free storage and server secrets.
5. Check out the clean merged `main` revision and run `.venv/bin/python scripts/deploy-vercel.py`. It verifies exact-main review/CI and reruns security before invoking Vercel production deployment.
6. Verify the HTTPS page, `/health`, live synthetic Gemini tool-calling, citations, malicious-origin rejection, quota rejection, PDF and calendar downloads. Record the commit and deployment URL. Until these checks complete, public runtime operation is unverified.

Vercel platform documentation: https://vercel.com/docs/functions/runtimes/node-js and https://vercel.com/docs/headers/request-headers. Redis REST and transaction documentation: https://upstash.com/docs/redis/features/restapi.
