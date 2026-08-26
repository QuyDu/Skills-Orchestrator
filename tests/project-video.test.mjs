import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const helper = path.join(root, ".github", "skills", "project-video", "scripts", "project-video.mjs");
const avaHdVoice = { provider: "azure-neural", name: "en-US-Ava:DragonHDLatestNeural", locale: "en-US", style: "friendly", styleDegree: 0.65, ratePercent: -2, sentencePauseMs: 180 };
const localPiperVoice = { provider: "local-piper", name: "en_US-ljspeech-high", locale: "en-US", lengthScale: 1, sentenceSilenceSeconds: 0.18 };
const browserPreviewVoice = { provider: "browser-preview", name: "default-English", locale: "en-US" };

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(project, command, args = [], environment = {}) {
  return spawnSync(process.execPath, [helper, command, "--root", project, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, AZURE_SPEECH_KEY: "", SPEECH_KEY: "", AZURE_SPEECH_REGION: "", SPEECH_REGION: "", AZURE_SPEECH_CLOUD: "", ...environment }
  });
}

async function seedAzureDiscovery(project, overrides = {}) {
  const { speech: speechOverrides = {}, ...reportOverrides } = overrides;
  const report = {
    schemaVersion: "1.0.0",
    discoveredAt: new Date().toISOString(),
    cloud: "AzureCloud",
    location: "eastus",
    cognitiveAvailable: true,
    cognitiveRegions: ["eastus"],
    openAIAvailable: false,
    openAIModelName: "",
    openAIModelVersion: "",
    openAIModelSku: "Standard",
    openAIApiVersion: "2024-10-01",
    speech: {
      serviceAvailable: true,
      serviceRegions: ["eastus"],
      existingResourceQuerySucceeded: true,
      existingResourceAvailable: true,
      existingResourceCount: 1,
      existingResourceRegions: ["eastus"],
      existingResourceKinds: ["SpeechServices"],
      ...speechOverrides
    },
    ...reportOverrides
  };
  await mkdir(path.join(project, "reports"), { recursive: true });
  await writeFile(path.join(project, "reports", "azure-discovery.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function validPlan(name, voice = avaHdVoice) {
  return {
    schemaVersion: "1.0.0",
    project: {
      name,
      purpose: "Explain the verified fixture project and how a developer uses its primary workflow.",
      evidence: ["README.md", "src/app.mjs"]
    },
    audience: "Developers joining the project",
    targetDurationSeconds: 120,
    video: {
      width: 1280,
      height: 720,
      fps: 30,
      backgroundColor: "#132129",
      primaryColor: "#1261A0",
      accentColor: "#F05D3D"
    },
    voice,
    output: { file: `dist/project-video/${name}.mp4` },
    scenes: Array.from({ length: 6 }, (_, index) => ({
      id: `scene-${String(index + 1).padStart(2, "0")}`,
      title: `Verified scene ${index + 1}`,
      subtitle: "A factual explanation grounded in repository evidence",
      narration: index === 0
        ? "U.S. projects can use Node.js safely. This narration explains only behavior supported by the fixture repository."
        : `This is verified narration for scene ${index + 1}. It explains only behavior supported by the fixture repository.`,
      evidence: index % 2 === 0 ? ["README.md"] : ["src/app.mjs"]
    }))
  };
}

async function seedApprovedVoiceSelection(project) {
  const sampleDirectory = path.join(project, "reports", "project-video", "voice-samples");
  await mkdir(sampleDirectory, { recursive: true });
  const sampleText = "This is a shared audition passage for selecting the approved project narration voice.";
  const profiles = [
    { id: "ava-hd-warm", slot: "A", label: "A - Ava Dragon HD - warm conversational", voice: avaHdVoice },
    { id: "aria-hd-warm", slot: "B", label: "B - Aria Dragon HD - warm presenter", voice: { ...avaHdVoice, name: "en-US-Aria:DragonHDLatestNeural" } },
    { id: "aria-professional", slot: "C", label: "C - Aria Neural - professional narration", voice: { provider: "azure-neural", name: "en-US-AriaNeural", locale: "en-US", style: "narration-professional", styleDegree: 0.75, ratePercent: -3, sentencePauseMs: 200 } }
  ];
  const samples = [];
  for (const [index, profile] of profiles.entries()) {
    const bytes = Buffer.alloc(2048, index + 2);
    const file = `${profile.id}.mp3`;
    await writeFile(path.join(sampleDirectory, file), bytes);
    samples.push({ ...profile, file, sha256: sha256(bytes) });
  }
  const auditionPage = "<!doctype html><title>Voice audition</title><p>Listen to A, B, and C.</p>\n";
  await writeFile(path.join(sampleDirectory, "index.html"), auditionPage, "utf8");
  await writeFile(path.join(sampleDirectory, "voice-samples.json"), `${JSON.stringify({
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    planSha256: "0".repeat(64),
    scene: "scene-01",
    sampleText,
    sampleTextSha256: sha256(sampleText),
    auditionPageSha256: sha256(auditionPage),
    cloud: "AzureCloud",
    region: "eastus",
    recommended: "ava-hd-warm",
    samples
  }, null, 2)}\n`, "utf8");
  const selected = run(project, "select-voice", ["--profile", "ava-hd-warm", "--approve-selection"]);
  assert.equal(selected.status, 0, `${selected.stdout}\n${selected.stderr}`);
  assert.match(selected.stdout, /Selected voice profile A/);
  const updatedPlan = JSON.parse(await readFile(path.join(project, "reports", "project-video", "project-video-plan.json"), "utf8"));
  assert.deepEqual(updatedPlan.voice, avaHdVoice);
}

async function seedLegacyVoiceSelection(project) {
  const currentVoice = { ...avaHdVoice };
  delete currentVoice.provider;
  const sampleDirectory = path.join(project, "reports", "project-video", "voice-samples");
  await mkdir(sampleDirectory, { recursive: true });
  const sampleText = "This is a shared audition passage for selecting the approved project narration voice.";
  const profiles = [
    { id: "ava-hd-warm", slot: "A", label: "A - Ava Dragon HD - warm conversational", voice: currentVoice },
    { id: "aria-hd-warm", slot: "B", label: "B - Aria Dragon HD - warm presenter", voice: { ...currentVoice, name: "en-US-Aria:DragonHDLatestNeural" } },
    { id: "aria-professional", slot: "C", label: "C - Aria Neural - professional narration", voice: { name: "en-US-AriaNeural", locale: "en-US", style: "narration-professional", styleDegree: 0.75, ratePercent: -3, sentencePauseMs: 200 } }
  ];
  const samples = [];
  for (const [index, profile] of profiles.entries()) {
    const bytes = Buffer.alloc(2048, index + 2);
    const file = `${profile.id}.mp3`;
    await writeFile(path.join(sampleDirectory, file), bytes);
    samples.push({ ...profile, file, sha256: sha256(bytes) });
  }
  const auditionPage = "<!doctype html><title>Voice audition</title><p>Listen to A, B, and C.</p>\n";
  await writeFile(path.join(sampleDirectory, "index.html"), auditionPage, "utf8");
  await writeFile(path.join(sampleDirectory, "voice-samples.json"), `${JSON.stringify({
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    planSha256: "0".repeat(64),
    scene: "scene-01",
    sampleText,
    sampleTextSha256: sha256(sampleText),
    auditionPageSha256: sha256(auditionPage),
    cloud: "AzureCloud",
    region: "eastus",
    recommended: "ava-hd-warm",
    samples
  }, null, 2)}\n`, "utf8");
}

test("project-video inspection distinguishes an empty baseline from an implemented project", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-video-inspect-"));
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, "src", ".gitkeep"), "", "utf8");
    await writeFile(path.join(project, "README.md"), "# Empty governed baseline\n", "utf8");

    const blocked = run(project, "inspect");
    assert.equal(blocked.status, 2, `${blocked.stdout}\n${blocked.stderr}`);
    let evidence = JSON.parse(await readFile(path.join(project, "reports", "project-video", "project-evidence.json"), "utf8"));
    assert.equal(evidence.readiness, "blocked");
    assert.equal(evidence.sourceFileCount, 0);

    await writeFile(path.join(project, "main.py"), "ready = True\n", "utf8");
    const ready = run(project, "inspect");
    assert.equal(ready.status, 0, `${ready.stdout}\n${ready.stderr}`);
    evidence = JSON.parse(await readFile(path.join(project, "reports", "project-video", "project-evidence.json"), "utf8"));
    assert.equal(evidence.readiness, "ready");
    assert.equal(evidence.sourceFileCount, 1);
    assert.equal(evidence.languageExtensions[".py"], 1);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("project-video validates grounded plans and rejects escaping evidence", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-video-plan-"));
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Video fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    const planPath = path.join(project, "reports", "project-video", "project-video-plan.json");
    const plan = validPlan("video-fixture");
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    const valid = run(project, "validate");
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
    assert.match(valid.stdout, /Valid project video plan/);

    const ssml = run(project, "ssml", ["--scene", "scene-01"]);
    assert.equal(ssml.status, 0, `${ssml.stdout}\n${ssml.stderr}`);
    assert.match(ssml.stdout, /en-US-Ava:DragonHDLatestNeural/);
    assert.match(ssml.stdout, /xmlns:mstts="https:\/\/www\.w3\.org\/2001\/mstts"/);
    assert.match(ssml.stdout, /style="friendly" styledegree="0\.65"/);
    assert.match(ssml.stdout, /rate="-2%"/);
    assert.match(ssml.stdout, /<s>U\.S\. projects can use Node\.js safely\.<\/s><break time="180ms"\/>/);
    assert.match(ssml.stdout, /<break time="180ms"\/>/);
    assert.doesNotMatch(ssml.stdout, /pitch=/);

    const legacyPlan = validPlan("legacy-video-fixture", { ...avaHdVoice });
    delete legacyPlan.voice.provider;
    await writeFile(planPath, `${JSON.stringify(legacyPlan, null, 2)}\n`, "utf8");
    await seedLegacyVoiceSelection(project);
    const legacySelection = run(project, "select-voice", ["--profile", "ava-hd-warm", "--approve-selection"]);
    assert.equal(legacySelection.status, 0, `${legacySelection.stdout}\n${legacySelection.stderr}`);
    const migratedPlan = JSON.parse(await readFile(planPath, "utf8"));
    assert.equal(migratedPlan.voice.provider, "azure-neural");
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    const localPlan = validPlan("local-video-fixture", localPiperVoice);
    await writeFile(planPath, `${JSON.stringify(localPlan, null, 2)}\n`, "utf8");
    const localValid = run(project, "validate");
    assert.equal(localValid.status, 0, `${localValid.stdout}\n${localValid.stderr}`);
    const localSsml = run(project, "ssml");
    assert.notEqual(localSsml.status, 0);
    assert.match(`${localSsml.stdout}${localSsml.stderr}`, /available only for the azure-neural provider/);
    const browserPlan = validPlan("browser-video-fixture", browserPreviewVoice);
    browserPlan.output.file = "dist/project-video/browser-video-fixture.html";
    await writeFile(planPath, `${JSON.stringify(browserPlan, null, 2)}\n`, "utf8");
    const browserValid = run(project, "validate");
    assert.equal(browserValid.status, 0, `${browserValid.stdout}\n${browserValid.stderr}`);
    browserPlan.output.file = "dist/project-video/browser-video-fixture.mp4";
    await writeFile(planPath, `${JSON.stringify(browserPlan, null, 2)}\n`, "utf8");
    const browserMp4 = run(project, "validate");
    assert.notEqual(browserMp4.status, 0);
    assert.match(`${browserMp4.stdout}${browserMp4.stderr}`, /must match dist\/project-video\/<name>\.html/);
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    plan.unexpected = true;
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const unknown = run(project, "validate");
    assert.notEqual(unknown.status, 0);
    assert.match(`${unknown.stdout}${unknown.stderr}`, /unsupported fields: unexpected/);

    delete plan.unexpected;
    const originalNarration = plan.scenes[0].narration;
    plan.scenes[0].narration = `${Array.from({ length: 37 }, () => "word").join(" ")}.`;
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const denseNarration = run(project, "validate");
    assert.notEqual(denseNarration.status, 0);
    assert.match(`${denseNarration.stdout}${denseNarration.stderr}`, /must not exceed 36 words/);

    plan.scenes[0].narration = originalNarration;
    plan.scenes[0].evidence = ["../outside.md"];
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    const invalid = run(project, "validate");
    assert.notEqual(invalid.status, 0);
    assert.match(`${invalid.stdout}${invalid.stderr}`, /unsafe path/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("project-video generates a browser voice and visual fallback without Azure discovery", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-video-browser-"));
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Browser preview fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    const plan = validPlan("browser-preview-fixture", browserPreviewVoice);
    plan.output.file = "dist/project-video/browser-preview-fixture.html";
    plan.scenes[0].narration = "This verified browser preview safely displays script-like text such as </script> without executing it.";
    const planPath = path.join(project, "reports", "project-video", "project-video-plan.json");
    await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

    const discovery = run(project, "discovery-status");
    assert.equal(discovery.status, 0, `${discovery.stdout}\n${discovery.stderr}`);
    const discoveryResult = JSON.parse(discovery.stdout);
    assert.equal(discoveryResult.status, "missing");
    assert.equal(discoveryResult.nextAction, "ask-user-to-run-azure-discovery");
    assert.equal(discoveryResult.declinedAction, "generate-browser-preview");

    const generated = run(project, "browser-preview");
    assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
    const output = path.join(project, "dist", "project-video", "browser-preview-fixture.html");
    const manifestFile = path.join(project, "reports", "project-video", "browser-preview-manifest.json");
    assert.ok(existsSync(output));
    assert.ok(existsSync(manifestFile));
    const html = await readFile(output, "utf8");
    assert.match(html, /SpeechSynthesisUtterance/);
    assert.match(html, /voice\.localService&&voice\.lang==="en-US"/);
    assert.match(html, /utterance\.onend=function\(\)/);
    assert.match(html, /Browser default English voice/);
    assert.doesNotMatch(html, /<\/script> without executing it/);
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    assert.equal(manifest.provider, "browser-preview");
    assert.equal(manifest.capabilities.renderedAudio, false);
    assert.equal(manifest.capabilities.portableMedia, false);
    assert.equal(manifest.sha256, sha256(html));
    assert.equal(manifest.scenes.length, 6);

    const narration = run(project, "narrate");
    assert.notEqual(narration.status, 0);
    assert.match(`${narration.stdout}${narration.stderr}`, /run browser-preview instead of narrate/);
    const duplicate = run(project, "browser-preview");
    assert.notEqual(duplicate.status, 0);
    assert.match(`${duplicate.stdout}${duplicate.stderr}`, /already exists/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("project-video fails before external work without credentials or approval", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-video-gates-"));
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Gated fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    await writeFile(path.join(project, "reports", "project-video", "project-video-plan.json"), `${JSON.stringify(validPlan("gated-fixture"), null, 2)}\n`, "utf8");

    const missingDiscovery = run(project, "azure-preflight");
    assert.notEqual(missingDiscovery.status, 0);
    assert.match(`${missingDiscovery.stdout}${missingDiscovery.stderr}`, /run the azure-discovery skill first/);
    await seedAzureDiscovery(project, { resourceName: "must-not-be-persisted" });
    const incompatibleDiscovery = run(project, "azure-preflight");
    assert.notEqual(incompatibleDiscovery.status, 0);
    assert.match(`${incompatibleDiscovery.stdout}${incompatibleDiscovery.stderr}`, /unsupported fields: resourceName/);
    await seedAzureDiscovery(project, { discoveredAt: new Date(Date.now() - 15 * 86_400_000).toISOString() });
    const staleDiscovery = run(project, "azure-preflight");
    assert.notEqual(staleDiscovery.status, 0);
    assert.match(`${staleDiscovery.stdout}${staleDiscovery.stderr}`, /discovery evidence is stale/);
    await seedAzureDiscovery(project, { speech: { existingResourceQuerySucceeded: false, existingResourceAvailable: false, existingResourceCount: 0, existingResourceRegions: [], existingResourceKinds: [] } });
    const uncertainDiscovery = run(project, "azure-preflight");
    assert.notEqual(uncertainDiscovery.status, 0);
    assert.match(`${uncertainDiscovery.stdout}${uncertainDiscovery.stderr}`, /resource discovery is uncertain/);
    await seedAzureDiscovery(project, { speech: { existingResourceAvailable: false, existingResourceCount: 0, existingResourceRegions: [], existingResourceKinds: [] } });
    const unavailableDiscovery = run(project, "azure-preflight");
    assert.notEqual(unavailableDiscovery.status, 0);
    assert.match(`${unavailableDiscovery.stdout}${unavailableDiscovery.stderr}`, /No existing Azure Speech-capable resource was discovered/);
    await seedAzureDiscovery(project);
    const readyDiscovery = run(project, "discovery-status");
    assert.equal(readyDiscovery.status, 0, `${readyDiscovery.stdout}\n${readyDiscovery.stderr}`);
    const readyDiscoveryResult = JSON.parse(readyDiscovery.stdout);
    assert.equal(readyDiscoveryResult.status, "ready");
    assert.equal(readyDiscoveryResult.nextAction, "continue-azure-preflight");
    const mismatchedRegion = run(project, "azure-preflight", [], { AZURE_SPEECH_REGION: "westus" });
    assert.notEqual(mismatchedRegion.status, 0);
    assert.match(`${mismatchedRegion.stdout}${mismatchedRegion.stderr}`, /is not an existing discovered Speech resource region/);
    const preflight = run(project, "azure-preflight");
    assert.equal(preflight.status, 0, `${preflight.stdout}\n${preflight.stderr}`);
    assert.match(preflight.stdout, /"status": "ready"/);
    assert.match(preflight.stdout, /"videoRenderer": "local-ffmpeg"/);
    assert.match(preflight.stdout, /never paste or persist it/);

    const narration = run(project, "narrate", ["--approve-external"]);
    assert.notEqual(narration.status, 0);
    assert.match(`${narration.stdout}${narration.stderr}`, /Explicit voice selection is missing/);
    assert.ok(!existsSync(path.join(project, "reports", "project-video", "audio")));

    const audition = run(project, "audition", ["--approve-external"]);
    assert.notEqual(audition.status, 0);
    assert.match(`${audition.stdout}${audition.stderr}`, /Set AZURE_SPEECH_KEY/);
    assert.ok(!existsSync(path.join(project, "reports", "project-video", "voice-samples")));

    const selection = run(project, "select-voice", ["--profile", "ava-hd-warm", "--approve-selection"]);
    assert.notEqual(selection.status, 0);
    assert.match(`${selection.stdout}${selection.stderr}`, /Voice audition evidence is missing/);

    const renderer = run(project, "install-renderer");
    assert.notEqual(renderer.status, 0);
    assert.match(`${renderer.stdout}${renderer.stderr}`, /requires --accept-download/);
    assert.ok(!existsSync(path.join(project, ".skills-orchestrator", "tools", "project-video")));

    const localVoice = run(project, "install-local-voice");
    assert.notEqual(localVoice.status, 0);
    assert.match(`${localVoice.stdout}${localVoice.stderr}`, /requires --accept-download/);
    assert.ok(!existsSync(path.join(project, ".skills-orchestrator", "tools", "project-video", "local-voice")));
    const localLicense = run(project, "install-local-voice", ["--accept-download"]);
    assert.notEqual(localLicense.status, 0);
    assert.match(`${localLicense.stdout}${localLicense.stderr}`, /requires --accept-gpl/);
    const localProvenance = run(project, "install-local-voice", ["--accept-download", "--accept-gpl"]);
    assert.notEqual(localProvenance.status, 0);
    assert.match(`${localProvenance.stdout}${localProvenance.stderr}`, /requires --accept-model-provenance/);
    const unavailablePython = run(project, "install-local-voice", [
      "--accept-download", "--accept-gpl", "--accept-model-provenance", "--python", path.join(project, "missing-python.exe")
    ]);
    assert.notEqual(unavailablePython.status, 0);
    assert.match(`${unavailablePython.stdout}${unavailablePython.stderr}`, /requires an approved Python/);
    assert.ok(!existsSync(path.join(project, ".skills-orchestrator", "tools", "project-video", "local-voice")));

    const planPath = path.join(project, "reports", "project-video", "project-video-plan.json");
    await writeFile(planPath, `${JSON.stringify(validPlan("local-gated-fixture", localPiperVoice), null, 2)}\n`, "utf8");
    const unapprovedLocalNarration = run(project, "narrate");
    assert.notEqual(unapprovedLocalNarration.status, 0);
    assert.match(`${unapprovedLocalNarration.stdout}${unapprovedLocalNarration.stderr}`, /requires --approve-local/);
    const missingLocalVoice = run(project, "narrate", ["--approve-local"]);
    assert.notEqual(missingLocalVoice.status, 0);
    assert.match(`${missingLocalVoice.stdout}${missingLocalVoice.stderr}`, /local Piper voice is not installed/);
    assert.ok(!existsSync(path.join(project, "reports", "project-video", "audio")));
    await writeFile(planPath, `${JSON.stringify(validPlan("gated-fixture"), null, 2)}\n`, "utf8");

    const render = run(project, "render", ["--approve-render"]);
    assert.notEqual(render.status, 0);
    assert.match(`${render.stdout}${render.stderr}`, /narration-manifest\.json is missing/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("project-video refuses to relabel existing audio for changed narration", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-video-stale-audio-"));
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video", "audio"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Stale audio fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    await writeFile(path.join(project, "reports", "project-video", "project-video-plan.json"), `${JSON.stringify(validPlan("stale-audio-fixture"), null, 2)}\n`, "utf8");
    await seedAzureDiscovery(project);
    await seedApprovedVoiceSelection(project);
    await writeFile(path.join(project, "reports", "project-video", "audio", "scene-01.mp3"), Buffer.alloc(2048, 1));

    const result = run(project, "narrate", ["--approve-external"], { AZURE_SPEECH_KEY: "test-key-not-sent", AZURE_SPEECH_REGION: "eastus" });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /stale or unverified/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("project-video refuses to render Azure narration without current discovery evidence", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-project-video-discovery-render-"));
  try {
    await mkdir(path.join(project, "src"), { recursive: true });
    await mkdir(path.join(project, "reports", "project-video", "audio"), { recursive: true });
    await writeFile(path.join(project, "README.md"), "# Discovery render fixture\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
    const planPath = path.join(project, "reports", "project-video", "project-video-plan.json");
    await writeFile(planPath, `${JSON.stringify(validPlan("discovery-render-fixture"), null, 2)}\n`, "utf8");
    await seedAzureDiscovery(project);
    await seedApprovedVoiceSelection(project);
    const planText = await readFile(planPath, "utf8");
    const plan = JSON.parse(planText);
    const selectionFile = path.join(project, "reports", "project-video", "voice-selection.json");
    const scenes = [];
    for (const [index, scene] of plan.scenes.entries()) {
      const audio = Buffer.alloc(2048, index + 1);
      const relative = `reports/project-video/audio/${scene.id}.mp3`;
      await writeFile(path.join(project, ...relative.split("/")), audio);
      scenes.push({
        id: scene.id,
        file: relative,
        narrationSha256: sha256(scene.narration),
        audioSha256: sha256(audio)
      });
    }
    await writeFile(path.join(project, "reports", "project-video", "audio", "narration-manifest.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      provider: "azure-neural",
      planSha256: sha256(planText),
      voice: plan.voice.name,
      voiceSettings: plan.voice,
      voiceSettingsSha256: sha256(JSON.stringify(plan.voice)),
      voiceSelectionProfile: "ava-hd-warm",
      voiceSelectionSha256: sha256(await readFile(selectionFile)),
      cloud: "AzureCloud",
      region: "eastus",
      scenes
    }, null, 2)}\n`, "utf8");

    const render = run(project, "render", ["--approve-render"]);
    assert.notEqual(render.status, 0);
    assert.match(`${render.stdout}${render.stderr}`, /does not match the current discovery evidence/);
    assert.ok(!existsSync(path.join(project, "dist", "project-video", "discovery-render-fixture.mp4")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});