# Project Handoff

## Current Status

Version 1.1.2 is committed locally at `1444180` and dated September 12, 2026. The prior source hardening is merged to default `main` at `99b9ce6`; protected publication of the 1.1.2 source and report evidence remains pending. P4 release assurance remains blocked, and no GitHub Release or package is authorized.

## Planned Initiative: Live Chat Interaction

`LIVE-CHAT-001` is ready for workflow planning, not implementation.

Objective: let users ask what the application can do, receive guided feature walkthroughs, and continue asking grounded questions by text or voice.

The first version should provide:

- A visible assistant entry point with text input, microphone control, transcript review, and optional spoken responses.
- Deterministic capability cards and guided walkthroughs.
- Model-backed freeform Q&A grounded in approved product documentation, with source links and explicit unknowns.
- Read-only behavior by default and explicit confirmation before any future action.
- Text-only and guided-only fallback when model or Speech services are unavailable.

## Architecture And Safety Constraints

- Prototype in `C:\repos\skills-orchestrator-demo`, then generalize the capability into the product.
- Use only discovery-approved Azure Government model and Speech services.
- Run Azure discovery before selecting region, model, quota, Speech resource, or deployment topology.
- Keep credentials out of the browser and use a server-side managed-identity boundary for deployed access.
- Treat retrieval and model output as untrusted; address prompt injection, unsupported claims, data leakage, and excessive agency.
- Require clear microphone and transcript privacy notice before cloud processing.
- This record authorizes no implementation, Azure mutation, cost, deployment, publication, commit, or push.

## Acceptance Direction

- Users can discover capabilities without knowing commands.
- A user can complete a guided walkthrough and ask contextual follow-up questions.
- Voice UX covers listening, transcript correction, cancellation, denied permission, and unavailable-service states.
- Answers cite authoritative product sources, distinguish unknowns, and do not invent capabilities.
- Keyboard, screen-reader, reduced-motion, responsive, and text-only use remain functional.
- Security, privacy, quality, latency, cost, and failure-mode evidence pass before deployment approval.

## Open Decisions

- Available Azure Government model and Speech options by subscription and region.
- Authoritative grounding corpus and refresh/version policy.
- Spoken-response default and transcript retention policy.
- Demo and production thresholds for latency, quality, accessibility, and cost.
- Whether the first prototype is informational only or can propose separately confirmed actions.

## Existing Blockers

P4 still lacks trusted signing, a distinct independent reviewer, restricted artifact distribution, installation-health evidence, tested revocation, and production verification. Live Chat also lacks an approved implementation plan and current Azure Government availability, privacy, quota, cost, and data-boundary evidence.

## Resume Point

Run `workflow-planner` to create a non-executing plan for `LIVE-CHAT-001`, covering the demo prototype, reusable architecture, Azure Government discovery, threat model, grounding, voice and text UX, accessibility, evaluation, cost, rollout, rollback, and approval gates. Do not implement, provision, deploy, publish, commit, or push during planning.
