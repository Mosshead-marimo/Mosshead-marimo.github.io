# Kaushik Aadhithya AI Portfolio

A lead-focused personal portfolio for Generative AI Engineer Kaushik Aadhithya Chiratanagandla, based on the supplied Superdesign cinematic direction, resume, and public GitHub work.

## Run Locally

Open `index.html` directly, or serve this directory with a static file server.

```powershell
cd portfolio
npx serve .
```

## Files

- `index.html` - semantic portfolio and service-request flow.
- `styles.css` - design system, responsive layouts, and form states.
- `script.js` - navigation, reveal effects, multi-step validation, live summary, session draft, secure Supabase submission, and email fallback.
- `superdesign-kaushik.html` - exported Superdesign version 2 reference.
- `IMPLEMENTATION_PLAN.md` - scope, evidence rules, funnel design, and launch checklist.

## Request Handling

After four validated steps, the visitor reviews the complete request and explicitly submits it to the `submit-lead` Supabase Edge Function. The function validates fields, rejects unapproved browser origins, uses a honeypot, rate-limits by a one-way IP hash, and writes with a server-only secret to the RLS-protected `lead_requests` table. No privileged Supabase key is shipped to the browser. A prefilled email remains available as a fallback.

Supabase project: `kaushik-ai-portfolio` (`hjdaprualapvzcsakbcd`, Mumbai).
