---
mode: agent
description: Analyze this repository and create a factual browser walkthrough or animated MP4 with the selected narration provider.
---

# Project Video

Run the `project-video` skill for the current repository.

Read `.github/skills/project-video/SKILL.md` before acting. Start with the packaged `discovery-status` command, then inspect the project and use only verified evidence for narration claims. A newly provisioned but still empty baseline must be reported as blocked rather than described as a finished application.

If discovery status is `missing` or `unusable`, ask whether the user wants to run `/azure-discovery`. If the answer is yes, run it for the confirmed cloud, check again, and run `azure-preflight` before Azure narration. If the answer is no, select `browser-preview` without another provider prompt, create an HTML plan output, and run `browser-preview`. Label it interactive HTML, disclose browser/OS voice processing, and never represent it as rendered audio, portable video, or an MP4.

Create and validate `reports/project-video/project-video-plan.json` with the selected provider. Before choosing `azure-neural`, require a successfully discovered existing Speech-capable resource in the configured region. Discovery is read-only and must never create resources or retrieve keys.

When Azure Speech is ready, state that Azure supplies narration while local FFmpeg renders the video. Keep `AZURE_SPEECH_KEY` environment-only, generate the approved A/B/C audition set, have the user listen, and record an explicit voice-profile selection. Recommend Ava Dragon HD with restrained friendly styling; do not use pitch manipulation or silently select a sample.

When the user declines discovery, browser-default English speech and browser visuals are the automatic zero-install fallback. Offer `local-piper` only when the user explicitly requires an offline narrated MP4. Never switch providers silently.

Do not contact Azure Speech, incur cloud cost, generate narration, install the local voice or renderer, execute package lifecycle scripts or FFmpeg, write or replace final media, publish, upload, commit, or push without the separate approvals required by the skill.

Browser HTML and final MP4 outputs belong under `dist/project-video/`. Browser speech must never be represented as rendered audio or MP4 media. Verified Piper output is valid final fallback audio only when labeled `local-piper`; it must never be represented as Azure neural narration.