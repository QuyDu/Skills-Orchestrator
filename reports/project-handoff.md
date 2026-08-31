# Project Handoff

Generated: 2026-08-28T17:00:00.000Z
Project: project-skills-orchestrator 1.1.1
Branch: `main` at `9c73c3d`
Status: **Product review documented**

## Milestone

The 1.1.1 change set is locally validated. This handoff records the product review, the canonical project-guide direction, skill-create routing, and the next end-to-end demo milestone.

## Last Completed Work

- Added `project-understanding` as the exclusive full-repository rescan owner, separate from durable knowledge capture.
- Added a strict schema, sensitive-file exclusions, complete inventories, atomic report-pair publication, and stale-view validation.
- Added Project Video schema 1.2 with understanding JSON, Markdown, repository, and content digest bindings while retaining 1.0 and 1.1 compatibility.
- Added an eight-page, understanding-driven presentation baseline and generic evidence-driven browser and FFmpeg visuals.
- Preferred Azure Speech in the configured region, approval-gated cross-region use, identical browser fallback pages and dialogue, and optional Piper for offline MP4 requirements.
- Updated profiles, setup routing, generated instructions, adoption coverage, README guidance, demo instructions, and regression tests.
- Updated runtime versioning to 1.1.1 and improved Project Video rendering, audio, and self-contained preview playback.
- Reviewed product value and readiness. The strongest demo story is the before-and-after journey from governed project creation to a documented working application.
- Confirmed `documentation-builder` as the canonical project-guide producer and `skill-create` as the mandatory entry point for direct or indirect skill-authoring requests.
- Added a fresh project-specific handoff to new-project creation. New projects do not inherit this repository's handoff, commit, milestones, blockers, or Azure decisions; adoption preserves the existing project's handoff.
- Completed a bounded no-findings change review and refreshed release-readiness evidence.

## Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Focused contract, adoption, and project-video tests | Passed | 68 tests, zero failures |
| `npm run check` | Incomplete | Security, release build, and candidate verification passed; the long integration suite exceeded the execution timeout |
| Security scan | Passed | 173 files scanned; zero package dependencies |
| Release candidate | Passed | 134 checksum-covered files verified |
| Skill verification | Passed | 41/41 skills |
| Project Understanding | Passed | Full rebuild, secret exclusion, schema, digest, and presentation-binding regressions |
| Command ownership | Passed | Prompt/skill basename collisions are rejected |
| Adoption migration | Passed | Framework duplicates are removed safely; unknown collisions block |
| Executive path | Passed | Exact capability preflight, FFmpeg assembly, Avatar asset mapping, and portable MP4 regression coverage |

## Key Decisions

- Cloud precedence is explicit `-Gov` or `-Commercial`, then saved profile, then Azure Commercial.
- Valid saved cloud, subscription, authentication, and MCP choices are not asked again.
- The portable automation supports interactive device-code and managed-identity login; it does not construct secret-based service-principal commands.
- Azure MCP is opt-in, and `foundryextensions` remains disabled without a stored client ID.
- Skills own skill-named slash actions; prompt files provide only distinct prompt workflows and generated help.
- Existing schema 1.0 and 1.1 plans remain valid; new understanding-bound plans use schema 1.2.
- Azure Speech is preferred only after discovery and approval; browser fallback preserves content but remains interactive HTML rather than rendered media.
- Availability never authorizes Azure activity; every external or billable stage keeps a separate approval.
- Avatar files remain presenter clips until local FFmpeg assembly produces an independently verified MP4.
- The 41 skills are optional building blocks and reference material. Users do not need to learn every skill; they select or adapt one when a project situation calls for it.
- `skill-create` is the mandatory entry point for direct or indirect skill-authoring requests. It compares existing skills, reports similarity, and maximizes reuse before authoring.
- `documentation-builder` is the canonical project-guide producer. Project Video, LinkedIn Post, and future management presentations consume that shared evidence-bound narrative.
- Small teams can begin with the `core` profile. Additional continuity, recovery, distributed coordination, and Azure audit controls should be adopted when their operational risk justifies the extra governance.
- Project Video should demonstrate the before-and-after journey from governed baseline to working project, using real project evidence and available screenshots or live workflow views rather than only generic animation.
- Azure Speech is an optional quality upgrade. The standard path must remain no-cost and locally reproducible with a built-in voice fallback, even when the voice sounds more robotic.

## Worktree

The latest committed baseline is `9c73c3d`. Current continuity and generated report updates remain uncommitted. No unmerged paths are present.

## Limitations

- No Azure OpenAI, Speech, Speech Avatar, FFmpeg rendering, installation, Azure mutation, deployment, or push occurred.
- The ignored local environment profile will be created only when Azure work first needs it.
- Live cloud behavior remains intentionally untested in this local validation pass.
- Production distribution remains blocked on current-commit cross-platform CI, trusted signature, and independent-review evidence.

## Pending Approvals

- Separate approval for push, merge, publication, upload, deployment, or Azure mutation.

## Next Action

Implement the actual `documentation-builder` generator, then create a test project, build a small application inside it, generate the canonical guide, and invoke `/project-video` to verify that the resulting demo describes the new project's actual implementation. Retain all external production-release gates.
