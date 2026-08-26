---
name: project-video
description: Analyze a new or existing project and produce a project-specific animated walkthrough as an interactive browser preview or a validated MP4 with approved Azure neural or pinned local narration. Use after a project has meaningful verified content; do not use for generic documentation, live screen recording, or publication.
lifecycle: draft
confidence: low
---

# project-video

## Purpose

Create a factual, project-specific animated walkthrough from the repository being built or adopted, using browser-default voice and visuals when Azure discovery is declined or a validated MP4 when approved Azure or local narration is selected.

## Preconditions

- Read repository instructions, the confirmed project blueprint when present, and authoritative project documentation before drafting narration.
- Require enough verified project content to explain purpose, architecture or stack, setup, primary workflows, and safety or operational constraints.
- Run from the target project root using the packaged helper at `.github/skills/project-video/scripts/project-video.mjs`.
- Before selecting `azure-neural`, require a compatible `reports/azure-discovery.json` no older than 14 days with a successful existing Speech-resource query; run `azure-discovery` when it is missing or stale.
- Keep Azure Speech credentials in process environment variables only; never request, print, persist, or copy a key into project artifacts.
- Treat browser-default speech and visuals as a zero-install interactive HTML preview only; they never constitute rendered audio or a narrated MP4.

## Inputs

- Verified repository evidence such as `README.md`, `docs/PROJECT-BLUEPRINT.json`, manifests, source boundaries, configuration, tests, and current project reports.
- Fresh Azure discovery evidence containing the selected cloud and nonsecret existing Speech resource kinds and regions when `azure-neural` is selected.
- An explicit answer to the discovery question when discovery evidence is missing or unusable. Declining discovery selects `browser-preview` without another provider prompt.
- Audience, target duration, aspect ratio, visual direction, narration provider and voice profile, and output name confirmed through clarification.
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and optional `AZURE_SPEECH_CLOUD` configured locally only when approved neural narration is generated.
- An approved Python 3.10 through 3.13 runtime when the pinned local Piper fallback is selected.
- A supported local Piper host: Windows x64, Linux x64 or arm64, or macOS x64 or arm64.
- An existing FFmpeg executable or approval to install the pinned isolated renderer dependency.
- The npm CLI bundled with the approved Node.js runtime, or its absolute `NPM_CLI_JS` path, when renderer installation is approved.

## Approved Tools and Resources

- Use read-only repository inspection to derive project facts and reject unsupported claims.
- Use the packaged Node.js helper to validate plans, generate Azure neural or local Piper narration, install isolated dependencies, render MP4 output, and verify media integrity.
- Use `discovery-status` at the start of every invocation. Use `browser-preview` to generate project-specific HTML with browser speech and completion-driven visual scenes when discovery is declined.
- Use `azure-preflight` to verify discovery freshness, cloud, region, and existing resource readiness before contacting Azure Speech. Azure provides narration only; final video rendering remains local FFmpeg work.
- Contact only the configured Azure Speech regional endpoint after the user approves the narration text, external processing, and expected cost.
- Download only the complete pinned Piper runtime set after the separate download, GPL, and model-provenance approvals: Piper `1.7.0`, ONNX Runtime `1.23.2`, pathvalidate `3.3.1`, coloredlogs `15.0.1`, humanfriendly `10.0`, flatbuffers `25.9.23`, NumPy `2.2.6`, packaging `25.0`, protobuf `6.33.5`, SymPy `1.14.0`, mpmath `1.3.0`, Windows-only pyreadline3 `3.5.4`, and the `en_US-ljspeech-high` model.
- Install only the renderer version pinned by the packaged helper, only after explicit approval, and only under `.skills-orchestrator/tools/project-video/`.

## Read and Write Boundaries

- Read project source, manifests, configuration, documentation, tests, and reports needed to establish verifiable facts.
- Write planning and evidence only under `reports/project-video/`.
- Write final media only under `dist/project-video/`.
- Write disposable renderer and local voice dependencies only under `.skills-orchestrator/tools/project-video/` after approval and temporary render data only under `.skills-orchestrator/cache/project-video/`.
- Do not modify application source, project manifests, lockfiles, CI workflows, infrastructure, instruction files, or existing media outside these owned paths.

## Procedure

1. Run `node .github/skills/project-video/scripts/project-video.mjs discovery-status`. This check is local and read-only.
2. When status is `missing` or `unusable`, ask: `Azure Discovery is not ready. Would you like to run /azure-discovery now?` If yes, run the discovery skill for the confirmed cloud and check status again. If no, record `browser-preview` as the explicit provider choice and continue without Azure, Piper, FFmpeg, or package installation.
3. Inspect the target repository and classify every proposed statement as verified, inferred, or unsupported; omit unsupported claims from the walkthrough.
4. Stop as `blocked` when a newly provisioned project still contains only the empty governed baseline; explain which blueprint or implementation evidence is missing.
5. Confirm audience, duration, aspect ratio, visual direction, output name, and whether existing owned output may be replaced.
6. Create `reports/project-video/project-video-plan.json` with six to ten concise scenes grounded in repository evidence, plus matching `project-video-plan.md` for review. For a declined discovery, use voice provider `browser-preview`, name `default-English`, locale `en-US`, and an HTML output under `dist/project-video/`.
7. Validate the plan with `node .github/skills/project-video/scripts/project-video.mjs validate --plan reports/project-video/project-video-plan.json` and resolve every reported defect.
8. For `browser-preview`, state that voice processing is controlled by the browser or operating system and may use an online service. Run `browser-preview`, preserve `reports/project-video/browser-preview-manifest.json`, and report the interactive HTML path. Scene advancement must wait for each utterance `onend`; do not create or claim MP3, WAV, or MP4 output.
9. For `azure-neural`, run `azure-preflight`. Use Azure only when discovery confirms an existing Speech-capable resource in the configured region. Show the discovered cloud and resource regions, state that `AZURE_SPEECH_KEY` remains environment-only, and distinguish Azure narration from local FFmpeg video rendering. Present the common audition passage, external data boundary, and cost warning; wait for approval, run `audition`, and require explicit A/B/C selection with `select-voice`.
10. For an explicitly requested offline MP4 fallback, offer `local-piper`; present the Python requirement, approximately 115 MB model, package and model sources, GPL-3.0-or-later engine license, public-domain LJSpeech provenance, and isolated install path. Wait for the three separate approvals before installation.
11. For MP4 providers, present the exact full narration and delivery settings, then wait for explicit synthesis approval. Generate one audio file per scene and bind provider evidence, narration text, file paths, and audio digests to `reports/project-video/audio/narration-manifest.json`.
12. For MP4 providers, detect FFmpeg. If unavailable, present the pinned package, install location, network and lifecycle-script implications, then wait for explicit approval before installation.
13. Present the final MP4 path and selected FFmpeg source, wait for render approval, render, and verify audio/video decoding, scene count, duration, resolution, provider label, and SHA-256 digest.
14. Preserve the plan, provider evidence, verification evidence, and editable generated source; report the HTML or MP4 path without publishing or uploading it.

## Validation

- Every narration claim cites at least one repository-relative evidence path in the plan.
- Narration is written for listening with natural transitions, no spoken bullet lists, and no sentence longer than 36 words.
- The plan validates against `schemas/project-video-plan.schema.json` and contains six to ten scenes with unique IDs and nonempty narration.
- Browser preview evidence validates against `schemas/project-video-browser-preview-manifest.schema.json`, identifies `browser-preview`, records no rendered audio or portable media, and binds every scene narration digest to the plan.
- The final manifest validates against `schemas/project-video-manifest.schema.json` and identifies the actual renderer source and binary digest.
- Azure output records the auditioned, explicitly selected profile and delivery settings. Local installation evidence validates against `schemas/project-video-local-voice-manifest.schema.json` and records the verified Piper engine, complete dependency lock, model provenance, platform, architecture, and approvals.
- Azure discovery validates against `schemas/azure-discovery.schema.json`; newly generated Azure audition, narration, and final-video evidence records its timestamp and SHA-256 digest.
- Audition evidence validates against `schemas/project-video-voice-samples.schema.json`, selection against `schemas/project-video-voice-selection.schema.json`, and synthesized audio evidence against `schemas/project-video-narration-manifest.schema.json`.
- Provider-matching audio exists for every MP4 scene. Browser speech is never represented as rendered audio, and local Piper output is labeled `local-piper` rather than neural Azure output.
- The MP4 decodes without errors, includes both video and audio, matches the requested dimensions, and has a recorded SHA-256 digest.
- Creation and adoption verification confirm that the skill package, helper, schema, and `/project-video` prompt are installed independently in the target repository.

## Outputs

- `reports/project-video/project-evidence.json`
- `reports/project-video/project-video-plan.json`
- `reports/project-video/project-video-plan.md`
- `reports/project-video/project-video-manifest.json`
- `reports/project-video/browser-preview-manifest.json` when browser fallback is selected
- `reports/project-video/voice-samples/voice-samples.json`
- `reports/project-video/voice-samples/index.html`
- `reports/project-video/voice-samples/`
- `reports/project-video/voice-selection.json`
- `reports/project-video/audio/narration-manifest.json`
- `reports/project-video/audio/`
- `reports/project-video/source/`
- `.skills-orchestrator/tools/project-video/local-voice/local-voice-manifest.json` when local narration is approved and installed
- `dist/project-video/`

## Failure Behavior

- Missing or unusable Azure discovery is not itself a blocker: ask whether to run discovery and generate the browser preview when the answer is no.
- Return `blocked` when project evidence, clarification, selected provider evidence, or required MP4 approvals are missing.
- Delete incomplete `.partial` media and preserve the last valid plan and diagnostics.
- Never change narration providers silently, fabricate project facts, install tools without approval, label browser speech as final audio, or claim success from an unverified MP4.
- Never label the browser preview as a rendered video, portable media file, or narrated MP4.
- Preserve existing owned output unless replacement was explicitly approved.

## Approval Gates

- Require explicit approval before sending narration text to Azure Speech, incurring cloud cost, or using a non-default Azure region.
- Require explicit approval before generating audition samples and separate explicit selection before generating full narration.
- Require separate explicit approvals for local network downloads, Piper's GPL-3.0-or-later license, and the LJSpeech model provenance, plus narration approval before local synthesis.
- Require explicit approval before downloading or installing the pinned renderer and its lifecycle scripts.
- Require explicit approval before replacing existing project-video output.
- Browser playback is user-initiated. Before reporting the preview, disclose that its default voice may be processed by the browser, operating system, or a managed online service.
- Require explicit approval before executing FFmpeg and writing final render output.
- Publication, upload, deployment, commit, and push remain separate approval-gated actions and are never performed by this skill.

## Composition and Dependencies

- clarify-the-ask
- azure-discovery

## Examples

- Analyze a newly built API project after its blueprint and implementation exist, then create a two-minute onboarding MP4 explaining setup, architecture, and validation.
- Show a prebuilt project video, create and implement a demo webapp, then invoke `/project-video`; it refreshes Azure discovery when needed, verifies an existing Speech resource, and uses local FFmpeg for the new app's MP4.
- Analyze an adopted application from its existing README, manifests, source, tests, and operations docs, then create a factual project-specific MP4 without changing application files.
- Run `/project-video`, decline the offered Azure discovery, and receive a project-specific interactive HTML walkthrough using the browser's default English voice and completion-driven visual scenes.