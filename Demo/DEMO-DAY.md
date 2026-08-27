# Demo Day Runbook

## Before the audience arrives

1. Confirm Azure CLI is signed in to Azure Commercial and an existing Speech-capable resource is available in the intended region.
2. Configure `AZURE_SPEECH_KEY` in a private terminal using the organization's secret-handling process. Never paste the key into Copilot, a prompt, a report, source control, or the projected terminal.
3. Pre-generate the existing project's MP4 with `/project-video`, then confirm `reports/project-video/project-video-manifest.json` is complete and its recorded output under `dist/project-video/` opens with audio and video.
4. Keep the existing animated guide open at `Demo/project-skills-orchestrator-animation.html` as a no-network fallback.
5. Confirm FFmpeg is available, or be ready to review and approve the skill's isolated pinned renderer installation.

## Act 1: show the existing video

Play the pre-generated, manifest-verified MP4 first. This demonstrates the current orchestrator without depending on live Azure availability. Use the browser guide only if the local media player cannot present the MP4.

## Act 2: build a new project

Create the demo project with the normal approved `create-project` flow, enter the new project directory, and run the webapp-building skill. Do not invoke project video while the project is still an empty governed baseline.

When the webapp has meaningful source, tests, and documentation, ask:

```text
/project-video --proceed
```

The installed project-video workflow must then:

1. Run `/project-understanding --proceed` as a complete rescan and rebuild the authoritative JSON and Markdown project guide.
2. Build the presentation pages and dialogue from that guide, then reject unsupported narration claims.
3. Run `discovery-status`. When discovery is missing or unusable, ask whether to invoke `/azure-discovery -Commercial`.
4. Confirm the read-only discovery query found an existing Speech-capable resource and recorded only its kind and region, never its name, identifier, or key.
5. Run the packaged `azure-preflight` command. Prefer the configured region; require approval before using another compatible region in the same Azure cloud.
6. Explain that Azure Speech supplies the neural narration and local FFmpeg renders the MP4. There is no Azure video API or Azure resource deployment in this workflow.
7. Create the digest-bound project-video plan, present the external-processing and cost boundary, and wait for approval before auditioning voices.
8. Generate the A/B/C audition, let the presenter choose a voice, present the full narration, and wait for synthesis approval.
9. Wait for render approval, generate the MP4 under `dist/project-video/`, and verify its audio, video, dimensions, duration, and digest.

The direct preflight command is:

```powershell
node .\.github\skills\project-video\scripts\project-video.mjs azure-preflight
```

If discovery or cross-region processing is declined, generate the same pages and dialogue as a browser-default-voice presentation and report its HTML output. Offer Piper only when the presenter explicitly requires a narrated offline MP4. Never create an Azure resource or silently relabel browser speech.