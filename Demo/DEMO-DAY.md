# Demo Day Runbook

## Before the audience arrives

1. Open the pre-created `dist/project-video/skills-orchestrator-1-1-0.mp4` locally and confirm its audio is available through the presentation device. The associated `reports/project-video/project-video-manifest.json` records its media checksum, duration, and Azure Speech narration provenance.
2. Keep `Demo/project-skills-orchestrator-animation.html` open as a no-network fallback for Act 1.
3. Confirm Node.js and Visual Studio Code are available for the local project-creation flow. Use `/demo-create-project --Test` during rehearsal so the test workspace remains available for inspection.
4. Before Act 2's deployment decision, confirm Azure CLI is already signed in to the intended Azure US Government subscription. Do not project credentials, device codes, tokens, keys, tenant identifiers, or subscription identifiers.
5. Confirm the audience can see the terminal, editor, and browser. Keep the generated-app browser tab ready to show the `?mode=test` view and the three `?at=` phase overrides.

## Act 1: show the existing video

Play the pre-created, manifest-verified MP4 first. It gives the audience the product story before the live workflow begins and does not depend on live Azure availability. If the media player fails, use the animated browser guide and say that it is the local visual fallback rather than a rendered video.

## Act 2: build a new project

Run `/demo-create-project` from this repository. It creates a separate governed TypeScript project, verifies its installed skills and Azure Government scaffold, copies the bounded build prompt into that new project, and opens its own VS Code workspace. The Project Skills Orchestrator source repository is immutable after the handoff. Do not invoke project video while the project is still an empty governed baseline.

In the new workspace, switch Chat to Agent mode and run `/demo-web-app`. Its first stage runs `/azure-discovery -Gov` for `usgovarizona`, initializes or reuses the generated project's ignored Azure environment profile, requires current evidence for an existing Speech-capable resource, binds the nonsecret Speech cloud and region environment values, and runs the packaged Project Video `azure-preflight`. Let the generated project build and test its own application only after the preflight reports `credentialConfigured: true`.

### Deployment checkpoint

The generated-app prompt confirms Azure CLI availability, an authenticated `AzureUSGovernment` context, the selected subscription, reusable Speech capability, matching region, and a configured Speech credential during its initial read-only discovery stage. If any prerequisite is missing, it stops before application implementation. Complete authentication and set `AZURE_SPEECH_KEY` directly in the terminal before the live presentation whenever possible; never paste or project the key. The recorded interactive login flow may start during discovery when the session is stale.

When the prompt explains the billable resource group and public endpoint, pause for explicit approval. Only after approval may it create `rg-skillsdemo`, run the deployment preview, inspect the preview, and deploy. A preview with unexpected changes is a stop condition.

When the webapp has meaningful source, tests, and documentation, ask:

```text
/project-video --proceed
```

Use the following sequence only when a project-specific follow-up video is part of the presentation. It is not required for the pre-created Act 1 video or for the generated application's Azure deployment:

1. Run `/project-understanding --proceed` as a complete rescan and rebuild the authoritative JSON and Markdown project guide.
2. Build the presentation pages and dialogue from that guide, then reject unsupported narration claims.
3. Run `discovery-status`. When discovery is missing or unusable, ask whether to invoke `/azure-discovery -Gov`.
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

If discovery or cross-region processing is declined, generate the same pages and dialogue as a browser-default-voice presentation and report its HTML output. Offer Piper only when the presenter explicitly requires a narrated offline MP4. Never create an Azure resource for video narration or silently relabel browser speech.