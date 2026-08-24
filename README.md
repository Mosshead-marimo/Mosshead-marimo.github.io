# Kaushik Aadhithya AI Portfolio

A lead-focused personal portfolio for Generative AI Engineer Kaushik Aadhithya Chiratanagandla, based on the supplied Superdesign cinematic direction, resume, and public GitHub work.

Live site: https://mosshead-marimo.github.io/

## Run Locally

Open `index.html` directly, or serve this directory with a static file server.

```powershell
cd portfolio
npx serve .
```

## Platform Architecture

- GitHub Pages keeps serving the public portfolio at `/` and the authenticated admin application at `/kaush1k/`.
- Supabase provides Auth, PostgreSQL, RLS, private document storage, analytics events, vector search, and leased job records.
- `services/vercel-api/` provides authenticated server APIs for Gemini RAG, proposals, Gmail drafts, and publishing integrations.
- `services/railway-jobs/` is a terminating cron worker for scans, embeddings, analytics aggregation, reminders, and approved draft preparation.
- Operational features are disabled by default in `site_settings` and must be enabled individually after credentials and production smoke tests pass.

## Files

- `index.html` - semantic portfolio and service-request flow.
- `styles.css` - design system, responsive layouts, and form states.
- `script.js` - navigation, reveal effects, multi-step validation, live summary, session draft, secure Supabase submission, and email fallback.
- `chat.js` - feature-flagged streaming RAG chat with citations and visitor-reviewed request-form prefilling.
- `services/vercel-api/` - Vercel Functions, shared security utilities, pricing logic, PDF generation, OAuth, and API tests.
- `services/railway-jobs/` - leased/idempotent scheduled work and worker tests.
- `supabase/migrations/` - forward-only operational schema, RLS, indexes, vector retrieval, queues, and factual seeds.
- `superdesign-kaushik.html` - exported Superdesign version 2 reference.
- `IMPLEMENTATION_PLAN.md` - scope, evidence rules, funnel design, and launch checklist.

## Request Handling

After four validated steps, the visitor reviews the complete request and explicitly submits it to the `submit-lead` Supabase Edge Function. The function validates fields, rejects unapproved browser origins, uses a honeypot, rate-limits by a one-way IP hash, and writes with a server-only secret to the RLS-protected `lead_requests` table. No privileged Supabase key is shipped to the browser. A prefilled email remains available as a fallback.

Supabase project: `kaushik-ai-portfolio` (`hjdaprualapvzcsakbcd`, Mumbai).

## Private Admin

The local admin panel is available at `/kaush1k/`. It includes service pricing, lead follow-ups, contact history, project dates, milestones, tasks, visitor analytics, and Excel/CSV exports. Supabase Auth and RLS protect every administrative table.

The login seed is `scripts/seed-admin.mjs`. It reads `SUPABASE_SECRET_KEY` and `ADMIN_PASSWORD` from the environment; credentials are never stored in the script. Copy `.env.admin.local.example` only as a reference and keep populated environment files local.

## Verify

```powershell
cd services/vercel-api
npm ci
npm run typecheck
npm test
npm audit --omit=dev

cd ../railway-jobs
npm ci
npm run typecheck
npm test
npm audit --omit=dev
```

Before enabling a production feature, configure the relevant server-only environment variables from each service's `.env.example`, verify its OAuth connection where applicable, and run the corresponding admin flow. Never place the Supabase service role, AI, OAuth, or publishing secrets in the static site.
