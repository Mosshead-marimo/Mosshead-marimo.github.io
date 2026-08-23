# Kaushik AI Portfolio Implementation Plan

**Status:** In progress  
**Design source:** Superdesign project `ea42d1cb-0ea5-432f-81ee-a313ca554327`  
**Draft:** `KAUSHIK.AI | Generative AI Engineer Portfolio` (`3bbe6e31-bfc4-43ed-9996-aa41ef247c8b`, version 2)  
**Owner:** Kaushik Aadhithya Chiratanagandla

## Objective

Build a cinematic personal portfolio that establishes technical credibility and converts qualified visitors into structured AI-service requests.

The experience should help a visitor answer:

1. What AI systems can Kaushik design and deliver?
2. Which public projects prove the relevant capability?
3. What engagement best fits the visitor's problem?
4. What information is needed for a useful first conversation?

## Verified Sources

- Resume: `Kaushik_Aadhithya_Chiratanagandla_Resume_AI_Developer.pdf`.
- GitHub: `github.com/Mosshead-marimo` and public repository READMEs.
- LinkedIn: `linkedin.com/in/kaush1k`.
- No invented clients, testimonials, revenue, performance, or project outcomes.

## Visual Direction

Preserve the accepted Superdesign language:

- Ultra-dark `#050505` background and oversized white editorial typography.
- Cyan-to-pink gradient, deep-purple glow, glass surfaces, and fine borders.
- Rotating 3D hero object labeled RAG, Agents, Evaluation, and Automation.
- Grayscale project media that reveals color on interaction.
- Restrained body copy supporting high-impact uppercase headings.
- Responsive motion that respects reduced-motion preferences.

## Information Architecture

1. Fixed navigation and availability state.
2. Positioning hero and direct project-request CTA.
3. Verifiable experience and research proof.
4. Selected AI and AI-security systems.
5. Service catalog with concrete outcomes and technologies.
6. AI capability matrix.
7. Delivery process.
8. Experience, education, and positioning.
9. Four-step qualified project-request funnel.
10. Direct contact and social links.

## Service Catalog

- AI Product Discovery and Architecture.
- RAG and Document Intelligence.
- Agentic AI and Workflow Automation.
- LLM Evaluation, Safety, and Guardrails.
- Machine Learning and Anomaly Detection.
- AI Backend APIs and Cloud Deployment.

## Featured Proof

- TradeSentinel / Market Intel.
- AdversaryIQ.
- RAG Website Chatbot.
- AI Decision Support System.
- LLM Evaluation Benchmark.
- Resume-described Enterprise RAG and Document Assistant.

## Lead Request Funnel

### Step 1 - Service

Select RAG / Document AI, Agentic Workflow, AI / ML System, LLM Evaluation / Safety, AI Backend / API, or Other.

### Step 2 - Project Context

Capture new/improve/audit status, project name, and a plain-language description of the problem.

### Step 3 - Constraints

Capture working budget, timeline, existing data or code, deployment needs, and ongoing support needs.

### Step 4 - Contact and Review

Capture contact details and consent, then show a complete review screen. Nothing is silently sent. The visitor explicitly submits to the secured Supabase endpoint, with a prefilled email fallback.

## Implementation Phases

### Phase 1 - Identity and Evidence

- [x] Read and visually verify the supplied resume.
- [x] Verify the GitHub account and public repository count.
- [x] Read selected repository documentation.
- [x] Remove all incorrect prior identity and project content.
- [x] Replace content with Kaushik's AI-engineering profile.

### Phase 2 - Visual System

- [x] Continue the existing Superdesign project as one revised direction.
- [x] Preserve cinematic typography, cube, colors, glass, and project interactions.
- [x] Implement the direction with semantic HTML and standalone CSS.
- [x] Retain responsive and reduced-motion behavior.

### Phase 3 - Lead Funnel

- [x] Build four interactive form steps.
- [x] Add required-field and format validation.
- [x] Add progress state and a live request summary.
- [x] Add session-only draft recovery.
- [x] Add a final review screen.
- [x] Generate an explicit prefilled email fallback without silent submission.
- [x] Connect the production Supabase lead backend in Mumbai.
- [x] Add RLS, revoked public table grants, explicit deny policies, server-side validation, origin checks, a honeypot, and rate limiting.

### Phase 4 - Quality and Launch

- [ ] Replace abstract project art with owned screenshots where available.
- [ ] Verify all external links immediately before launch.
- [ ] Test current Chrome, Firefox, Safari, and mobile viewports.
- [ ] Run accessibility, HTML, and performance audits.
- [ ] Add favicon and social-preview image.
- [ ] Deploy to the final domain and verify the production request flow.

## Acceptance Criteria

- [x] The AI engineering offer is understandable within 30 seconds.
- [x] All visible claims are supported by the resume or public GitHub evidence.
- [x] Every featured public project links to the correct repository.
- [x] The request funnel works by mouse and keyboard in the current browser build.
- [x] Invalid or incomplete steps cannot advance.
- [x] The visitor reviews the complete request before transmission.
- [x] No contact data is silently sent to a third party.
- [x] The site has no horizontal page scrolling at the tested mobile breakpoint and respects reduced-motion preferences.

## Production Decisions Remaining

- Final hosting provider and domain.
- Form receiver: own API, Formspree, Web3Forms, or another provider.
- Retention period and privacy notice for submitted lead data.
- Whether to publish a downloadable resume.
- Which projects have safe, owned screenshots for public display.
