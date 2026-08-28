---
name: linkedin-post
description: Analyze the current project and prepare a reviewable LinkedIn post draft for Microsoft employees and the technical community, including update posts based on project history.
lifecycle: draft
confidence: low
---

# linkedin-post

## Purpose

Analyze the current project and prepare a concise, accurate LinkedIn post draft that explains what the project is, why it matters, and what has changed. The default audience is Microsoft employees and the broader Microsoft technical community.

## Preconditions

- Read repository instructions and the current project handoff first.
- Read the current `docs/PROJECT-GUIDE.md` and `reports/project-guide.json` before drafting. They are the canonical shared project narrative; refresh them through `documentation-builder` when missing or stale.
- Inspect the project README, architecture documentation, current status, recent changes, and relevant validation evidence.
- Read `reports/linkedin-post-history.md` when present.
- Confirm that the output is a draft; never publish directly to LinkedIn.

## Inputs

- Current project files and authoritative reports.
- Optional `--update` parameter.
- Optional tone: `--technical`, `--executive`, or `--community`.
- Optional audience or length direction from the user.

## Approved Tools and Resources

- Read-only repository inspection.
- Git history and diffs when available.
- Existing project documentation, handoff, audit, test, and release reports.
- `reports/linkedin-post-history.md` as the previous-post history source for updates.

## Read and Write Boundaries

- Read project files and reports needed to ground the draft.
- Write only `reports/linkedin-post-draft.md`.
- Do not publish, schedule, send, or submit content to LinkedIn or any other external service.
- Do not include secrets, private credentials, private URLs, personal data, unsupported claims, or confidential project details.

## Procedure

1. Read the project handoff and canonical project guide, identifying the current objective, status, audience, and notable evidence.
2. Verify the guide's material claims against current README, architecture, recent changes, tests, and release evidence; do not treat a stale guide as authoritative.
3. Without `--update`, describe the project, its problem, approach, current capabilities, and next step.
4. With `--update`, read `reports/linkedin-post-history.md` and describe only verified new features, improvements, milestones, or lessons since the latest recorded post.
5. Select the requested tone; default to community-focused and technically accessible.
6. Draft a factual post with a clear opening, useful project detail, concrete evidence, and a modest call to discussion.
7. List claims that require user review, such as internal names, metrics, links, screenshots, or publication wording.
8. Save the draft to `reports/linkedin-post-draft.md` and present it to the user for approval or revision.
9. After the user publishes a post outside this skill, record its date, summary, and approved public link in `reports/linkedin-post-history.md` only when the user requests that record update.

## Validation

- Every material claim is supported by current project evidence.
- An update draft distinguishes new changes from the previous history entry.
- The draft contains no secrets, confidential details, or invented metrics.
- The selected tone and audience are stated in the draft metadata.
- The output exists at `reports/linkedin-post-draft.md`.
- No external publication action was performed.

## Outputs

- `reports/linkedin-post-draft.md`

## Failure Behavior

- Stop and identify missing evidence when the project cannot support a factual post.
- Do not infer unpublished outcomes, adoption, customer impact, performance, or security assurance.
- If `--update` is requested but no history file exists, state that comparison is unavailable and prepare a clearly labeled first-post draft only with user approval.
- Preserve existing history; never overwrite it as part of draft generation.

## Approval Gates

The skill produces a draft only. The user must review and explicitly approve any content before copying or publishing it. LinkedIn publication, external sharing, and public disclosure are outside this skill and require separate approval.

## Composition and Dependencies

- project-handoff
- documentation-builder

## Examples

- `/linkedin-post`
- `/linkedin-post --technical`
- `/linkedin-post --update --community`
- `/linkedin-post --update --executive`
