#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_ROOT, "..", "..", "..", "..");
const RENDERER_PACKAGE = "ffmpeg-static";
const RENDERER_VERSION = "5.3.0";
const AZURE_NARRATION_PROVIDER = "azure-neural";
const BROWSER_NARRATION_PROVIDER = "browser-preview";
const BROWSER_VOICE_NAME = "default-English";
const AZURE_DISCOVERY_MAX_AGE_DAYS = 14;
const AZURE_DISCOVERY_PATH = "reports/azure-discovery.json";
const LOCAL_NARRATION_PROVIDER = "local-piper";
const LOCAL_VOICE_NAME = "en_US-ljspeech-high";
const PIPER_PACKAGE = "piper-tts";
const PIPER_VERSION = "1.7.0";
const ONNX_RUNTIME_VERSION = "1.23.2";
const PATHVALIDATE_VERSION = "3.3.1";
const LOCAL_VOICE_DEPENDENCIES = {
  coloredlogs: "15.0.1",
  flatbuffers: "25.9.23",
  humanfriendly: "10.0",
  mpmath: "1.3.0",
  numpy: "2.2.6",
  onnxruntime: ONNX_RUNTIME_VERSION,
  packaging: "25.0",
  pathvalidate: PATHVALIDATE_VERSION,
  protobuf: "6.33.5",
  sympy: "1.14.0"
};
const WINDOWS_LOCAL_VOICE_DEPENDENCIES = { pyreadline3: "3.5.4" };
const PIPER_RELEASE_URL = `https://github.com/OHF-Voice/piper1-gpl/releases/tag/v${PIPER_VERSION}`;
const PIPER_WHEELS = {
  "darwin-arm64": { file: "piper_tts-1.7.0-cp39-abi3-macosx_11_0_arm64.whl", sha256: "b01504ae404631005a88d72d2a5792adff29ccea6c84f20601f7fefcfc5574de" },
  "darwin-x64": { file: "piper_tts-1.7.0-cp39-abi3-macosx_10_9_x86_64.whl", sha256: "68f8e052fe09b4532edd2e2b32de7080c20e477cb8c31118043922023dbbe377" },
  "linux-arm64": { file: "piper_tts-1.7.0-cp39-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.manylinux_2_28_aarch64.whl", sha256: "b43b2d299556bd6e87bcb6932fe853f8f89d65d7ad85cc372c89777ad2035d8f" },
  "linux-x64": { file: "piper_tts-1.7.0-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.manylinux_2_28_x86_64.whl", sha256: "72adc623b977bdbbdf3d6f6bf88d66eda7cfe2ee8e7919a74a5952acb77a339e" },
  "win32-x64": { file: "piper_tts-1.7.0-cp39-abi3-win_amd64.whl", sha256: "a2af3dae98e1835a3b1da37e4aa290e6adf41165c7d768e1ce73d9246f867d2c" }
};
const LOCAL_VOICE_MODEL = {
  id: LOCAL_VOICE_NAME,
  locale: "en-US",
  quality: "high",
  sourceRevision: "v1.0.0",
  source: "https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/en/en_US/ljspeech/high",
  dataset: "LJSpeech",
  datasetLicense: "public-domain",
  datasetLicenseUrl: "https://keithito.com/LJ-Speech-Dataset/",
  files: [
    {
      name: `${LOCAL_VOICE_NAME}.onnx`,
      url: `https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/high/${LOCAL_VOICE_NAME}.onnx?download=true`,
      bytes: 114199011,
      sha256: "5d4f08ba6a2a48c44592eed3ce56bf85e9de3dd4e20df90541ae68a8310c029a",
      md5: "dad093b5d2cff6a5fda99883ceda09d1"
    },
    {
      name: `${LOCAL_VOICE_NAME}.onnx.json`,
      url: `https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/high/${LOCAL_VOICE_NAME}.onnx.json?download=true`,
      bytes: 4970,
      md5: "de98fc398ddead60fb82d93bfafb3ad1"
    },
    {
      name: "MODEL_CARD",
      url: "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/high/MODEL_CARD?download=true",
      bytes: 515,
      md5: "59322a9a8d2c0e556f0be1171cd54ea7"
    }
  ]
};
const IGNORED_DIRECTORIES = new Set([".git", ".skills-orchestrator", "dist", "node_modules"]);
const MAX_SPEECH_BYTES = 20 * 1024 * 1024;
const VOICE_AUDITION_PROFILES = [
  {
    id: "ava-hd-warm",
    slot: "A",
    label: "A - Ava Dragon HD - warm conversational",
    voice: { provider: AZURE_NARRATION_PROVIDER, name: "en-US-Ava:DragonHDLatestNeural", locale: "en-US", style: "friendly", styleDegree: 0.65, ratePercent: -2, sentencePauseMs: 180 }
  },
  {
    id: "aria-hd-warm",
    slot: "B",
    label: "B - Aria Dragon HD - warm presenter",
    voice: { provider: AZURE_NARRATION_PROVIDER, name: "en-US-Aria:DragonHDLatestNeural", locale: "en-US", style: "friendly", styleDegree: 0.65, ratePercent: -2, sentencePauseMs: 180 }
  },
  {
    id: "aria-professional",
    slot: "C",
    label: "C - Aria Neural - professional narration",
    voice: { provider: AZURE_NARRATION_PROVIDER, name: "en-US-AriaNeural", locale: "en-US", style: "narration-professional", styleDegree: 0.75, ratePercent: -3, sentencePauseMs: 200 }
  }
];

function parseArguments(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
    const key = item.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return { command, options };
}

function projectRoot(options) {
  return path.resolve(String(options.root || DEFAULT_PROJECT_ROOT));
}

function resolveInside(root, relative, label = "path") {
  if (typeof relative !== "string" || !relative.trim() || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a nonempty repository-relative path`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the project root: ${relative}`);
  }
  return resolved;
}

async function resolveSafeTarget(root, relative, label = "path") {
  const target = resolveInside(root, relative, label);
  const segments = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = path.join(current, segment);
    if (!existsSync(current)) break;
    const details = await lstat(current);
    if (details.isSymbolicLink()) throw new Error(`${label} cannot traverse a symbolic link: ${relative}`);
    if (index < segments.length - 1 && !details.isDirectory()) throw new Error(`${label} parent is not a directory: ${relative}`);
  }
  return target;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.partial`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rm(file, { force: true });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeBrowserPreviewArtifacts(output, manifestFile, html, manifest, force) {
  if ((existsSync(output) || existsSync(manifestFile)) && force !== true) {
    throw new Error("Browser preview output already exists; use --force only after replacement approval");
  }
  await Promise.all([mkdir(path.dirname(output), { recursive: true }), mkdir(path.dirname(manifestFile), { recursive: true })]);
  const transaction = randomUUID();
  const outputPartial = `${output}.${transaction}.partial`;
  const manifestPartial = `${manifestFile}.${transaction}.partial`;
  const outputBackup = `${output}.${transaction}.backup`;
  const manifestBackup = `${manifestFile}.${transaction}.backup`;
  let outputBackedUp = false;
  let manifestBackedUp = false;
  let outputPublished = false;
  let manifestPublished = false;
  try {
    await writeFile(outputPartial, html, { encoding: "utf8", flag: "wx" });
    await writeFile(manifestPartial, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (existsSync(output)) {
      await rename(output, outputBackup);
      outputBackedUp = true;
    }
    if (existsSync(manifestFile)) {
      await rename(manifestFile, manifestBackup);
      manifestBackedUp = true;
    }
    await rename(outputPartial, output);
    outputPublished = true;
    await rename(manifestPartial, manifestFile);
    manifestPublished = true;
    await Promise.all([rm(outputBackup, { force: true }), rm(manifestBackup, { force: true })]);
  } catch (error) {
    if (outputPublished) await rm(output, { force: true });
    if (manifestPublished) await rm(manifestFile, { force: true });
    if (outputBackedUp && existsSync(outputBackup)) await rename(outputBackup, output);
    if (manifestBackedUp && existsSync(manifestBackup)) await rename(manifestBackup, manifestFile);
    throw error;
  } finally {
    await Promise.all([
      rm(outputPartial, { force: true }),
      rm(manifestPartial, { force: true }),
      rm(outputBackup, { force: true }),
      rm(manifestBackup, { force: true })
    ]);
  }
}

function rejectUnknownFields(value, allowed, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) errors.push(`${label} contains unsupported fields: ${unknown.join(", ")}`);
}

function validateEvidenceList(value, label, errors) {
  if (!Array.isArray(value) || value.length < 1) {
    errors.push(`${label} must contain at least one path`);
    return;
  }
  if (new Set(value).size !== value.length) errors.push(`${label} must not contain duplicate paths`);
  for (const evidence of value) {
    if (!isPortableEvidencePath(evidence) || evidence.length > 500) errors.push(`${label} contains an unsafe path: ${evidence}`);
  }
}

function voiceProvider(voice) {
  return voice?.provider || AZURE_NARRATION_PROVIDER;
}

function normalizedAzureVoice(voice) {
  return voiceProvider(voice) === AZURE_NARRATION_PROVIDER ? { provider: AZURE_NARRATION_PROVIDER, ...voice } : voice;
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right)));
}

function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return ["plan must be an object"];
  rejectUnknownFields(plan, ["schemaVersion", "project", "audience", "targetDurationSeconds", "video", "voice", "output", "scenes"], "plan", errors);
  if (plan.schemaVersion !== "1.0.0") errors.push("schemaVersion must be 1.0.0");
  if (!plan.project || typeof plan.project !== "object") errors.push("project is required");
  else {
    rejectUnknownFields(plan.project, ["name", "purpose", "evidence"], "project", errors);
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(plan.project.name || "")) errors.push("project.name must be lowercase kebab-case");
    if (typeof plan.project.purpose !== "string" || !plan.project.purpose.trim() || plan.project.purpose.length > 2000) errors.push("project.purpose must contain 1 through 2000 characters");
    validateEvidenceList(plan.project.evidence, "project.evidence", errors);
  }
  if (typeof plan.audience !== "string" || !plan.audience.trim() || plan.audience.length > 300) errors.push("audience must contain 1 through 300 characters");
  if (!Number.isInteger(plan.targetDurationSeconds) || plan.targetDurationSeconds < 60 || plan.targetDurationSeconds > 600) {
    errors.push("targetDurationSeconds must be an integer from 60 through 600");
  }
  if (!plan.video || typeof plan.video !== "object") errors.push("video is required");
  else {
    rejectUnknownFields(plan.video, ["width", "height", "fps", "backgroundColor", "primaryColor", "accentColor"], "video", errors);
    const dimensions = `${plan.video.width}x${plan.video.height}`;
    if (!new Set(["854x480", "1280x720", "1920x1080"]).has(dimensions)) errors.push("video dimensions must be 854x480, 1280x720, or 1920x1080");
    if (![24, 30].includes(plan.video.fps)) errors.push("video.fps must be 24 or 30");
    for (const color of ["backgroundColor", "primaryColor", "accentColor"]) {
      if (!/^#[0-9a-fA-F]{6}$/.test(plan.video[color] || "")) errors.push(`video.${color} must use #RRGGBB`);
    }
  }
  if (!plan.voice || typeof plan.voice !== "object") errors.push("voice is required");
  else {
    const provider = voiceProvider(plan.voice);
    if (provider === AZURE_NARRATION_PROVIDER) {
      rejectUnknownFields(plan.voice, ["provider", "name", "locale", "style", "styleDegree", "ratePercent", "sentencePauseMs"], "voice", errors);
      if (plan.voice.provider !== undefined && plan.voice.provider !== AZURE_NARRATION_PROVIDER) errors.push(`voice.provider must be ${AZURE_NARRATION_PROVIDER}`);
      if (!/^[A-Za-z0-9-]+(?::[A-Za-z0-9-]+)?Neural$/.test(plan.voice.name || "")) errors.push("voice.name must be an Azure neural or Dragon HD voice identifier");
      if (!/^[a-z]{2}-[A-Z]{2}$/.test(plan.voice.locale || "")) errors.push("voice.locale must use language-region form");
      if (!/^(auto|[a-z][a-z0-9-]{0,39})$/.test(plan.voice.style || "")) errors.push("voice.style must be auto or a lowercase Azure speaking style");
      if (typeof plan.voice.styleDegree !== "number" || plan.voice.styleDegree < 0.01 || plan.voice.styleDegree > 2) errors.push("voice.styleDegree must be from 0.01 through 2");
      if (!Number.isInteger(plan.voice.ratePercent) || plan.voice.ratePercent < -20 || plan.voice.ratePercent > 20) errors.push("voice.ratePercent must be an integer from -20 through 20");
      if (!Number.isInteger(plan.voice.sentencePauseMs) || plan.voice.sentencePauseMs < 0 || plan.voice.sentencePauseMs > 1000) errors.push("voice.sentencePauseMs must be an integer from 0 through 1000");
    } else if (provider === LOCAL_NARRATION_PROVIDER) {
      rejectUnknownFields(plan.voice, ["provider", "name", "locale", "lengthScale", "sentenceSilenceSeconds"], "voice", errors);
      if (plan.voice.name !== LOCAL_VOICE_NAME) errors.push(`voice.name must be ${LOCAL_VOICE_NAME} for the pinned local fallback`);
      if (plan.voice.locale !== "en-US") errors.push("voice.locale must be en-US for the pinned local fallback");
      if (typeof plan.voice.lengthScale !== "number" || plan.voice.lengthScale < 0.5 || plan.voice.lengthScale > 2) errors.push("voice.lengthScale must be from 0.5 through 2");
      if (typeof plan.voice.sentenceSilenceSeconds !== "number" || plan.voice.sentenceSilenceSeconds < 0 || plan.voice.sentenceSilenceSeconds > 1) errors.push("voice.sentenceSilenceSeconds must be from 0 through 1");
    } else if (provider === BROWSER_NARRATION_PROVIDER) {
      rejectUnknownFields(plan.voice, ["provider", "name", "locale"], "voice", errors);
      if (plan.voice.name !== BROWSER_VOICE_NAME) errors.push(`voice.name must be ${BROWSER_VOICE_NAME} for browser preview`);
      if (plan.voice.locale !== "en-US") errors.push("voice.locale must be en-US for browser preview");
    } else {
      errors.push(`voice.provider must be ${AZURE_NARRATION_PROVIDER}, ${LOCAL_NARRATION_PROVIDER}, or ${BROWSER_NARRATION_PROVIDER}`);
    }
  }
  if (!plan.output || typeof plan.output !== "object") errors.push("output is required");
  else {
    rejectUnknownFields(plan.output, ["file"], "output", errors);
    const browserPreview = voiceProvider(plan.voice) === BROWSER_NARRATION_PROVIDER;
    const outputPattern = browserPreview ? /^dist\/project-video\/[a-z0-9-]+\.html$/ : /^dist\/project-video\/[a-z0-9-]+\.mp4$/;
    if (!outputPattern.test(plan.output.file || "")) errors.push(`output.file must match dist/project-video/<name>.${browserPreview ? "html" : "mp4"}`);
  }
  if (!Array.isArray(plan.scenes) || plan.scenes.length < 6 || plan.scenes.length > 10) {
    errors.push("scenes must contain 6 through 10 items");
  } else {
    const ids = new Set();
    for (const [index, scene] of plan.scenes.entries()) {
      const prefix = `scenes[${index}]`;
      rejectUnknownFields(scene, ["id", "title", "subtitle", "narration", "evidence"], prefix, errors);
      if (!/^scene-[0-9]{2}$/.test(scene.id || "")) errors.push(`${prefix}.id must match scene-NN`);
      if (ids.has(scene.id)) errors.push(`${prefix}.id must be unique`);
      ids.add(scene.id);
      if (typeof scene.title !== "string" || scene.title.length < 1 || scene.title.length > 80) errors.push(`${prefix}.title must contain 1 through 80 characters`);
      if (typeof scene.subtitle !== "string" || scene.subtitle.length < 1 || scene.subtitle.length > 180) errors.push(`${prefix}.subtitle must contain 1 through 180 characters`);
      if (typeof scene.narration !== "string" || scene.narration.length < 20 || scene.narration.length > 1600) errors.push(`${prefix}.narration must contain 20 through 1600 characters`);
      else {
        if (/(?:^|\n)\s*(?:[-*]|\d+[.)])\s+/m.test(scene.narration)) errors.push(`${prefix}.narration must use spoken prose rather than a bullet list`);
        const longSentence = narrationSentences(scene.narration).find((sentence) => sentence.split(/\s+/).filter(Boolean).length > 36);
        if (longSentence) errors.push(`${prefix}.narration sentences must not exceed 36 words`);
      }
      validateEvidenceList(scene.evidence, `${prefix}.evidence`, errors);
    }
  }
  return errors;
}

function isPortableEvidencePath(value) {
  return typeof value === "string"
    && value.length > 0
    && !path.isAbsolute(value)
    && !value.includes("\\")
    && !value.split("/").includes("..");
}

async function loadPlan(root, options) {
  const relative = String(options.plan || "reports/project-video/project-video-plan.json");
  const file = resolveInside(root, relative, "plan path");
  if (!existsSync(file) || (await lstat(file)).isSymbolicLink()) throw new Error(`Plan must be a regular project file: ${relative}`);
  const plan = await readJson(file);
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(`Project video plan is invalid:\n- ${errors.join("\n- ")}`);
  const evidence = new Set([...(plan.project.evidence || []), ...plan.scenes.flatMap((scene) => scene.evidence || [])]);
  for (const item of evidence) {
    const evidenceFile = resolveInside(root, item, "evidence path");
    if (!existsSync(evidenceFile)) throw new Error(`Project video evidence does not exist: ${item}`);
    const details = await lstat(evidenceFile);
    if (details.isSymbolicLink() || !details.isFile()) throw new Error(`Project video evidence must be a regular file: ${item}`);
    const canonical = await realpath(evidenceFile);
    if (canonical !== root && !canonical.startsWith(`${root}${path.sep}`)) throw new Error(`Project video evidence escapes the project root: ${item}`);
  }
  return { plan, file, relative, sha256: await fileDigest(file) };
}

async function walk(root, relative = "", files = []) {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name) && files.length < 10000) await walk(root, child, files);
    } else if (entry.isFile()) files.push(child.replaceAll("\\", "/"));
  }
  return files;
}

async function inspectProject(root, options) {
  const files = await walk(root);
  const knownEvidence = [
    "README.md",
    "docs/PROJECT-BLUEPRINT.json",
    "docs/PROJECT-BLUEPRINT.md",
    "docs/PROJECT-BRIEF.md",
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "pom.xml"
  ].filter((relative) => files.includes(relative));
  const extensions = new Map();
  let initializedBaseline = false;
  if (files.includes("project-orchestrator.json")) {
    try {
      initializedBaseline = (await readJson(path.join(root, "project-orchestrator.json"))).status === "initialized";
    } catch {
      knownEvidence.push("project-orchestrator.json (invalid JSON)");
    }
  }
  const sourceExtensions = new Set([".bicep", ".c", ".cc", ".cpp", ".cs", ".fs", ".go", ".h", ".java", ".js", ".jsx", ".kt", ".mjs", ".php", ".ps1", ".py", ".rb", ".rs", ".scala", ".swift", ".tf", ".ts", ".tsx"]);
  const testFiles = files.filter((relative) => /(^|\/)(tests?|specs?)\//.test(relative) && !relative.endsWith("/.gitkeep"));
  const sourceFiles = files.filter((relative) => {
    if (!sourceExtensions.has(path.extname(relative).toLowerCase())) return false;
    if (/^(\.github|docs|reports|schemas|templates|tests?|specs?)\//.test(relative)) return false;
    if (initializedBaseline && /^infra\//.test(relative)) return false;
    return !/(^|\/)\.gitkeep$/.test(relative);
  });
  for (const relative of [...sourceFiles, ...testFiles]) {
    const extension = path.extname(relative).toLowerCase() || "none";
    extensions.set(extension, (extensions.get(extension) || 0) + 1);
  }
  let projectName = path.basename(root);
  let blueprintPurpose = "";
  if (files.includes("docs/PROJECT-BLUEPRINT.json")) {
    try {
      const blueprint = await readJson(path.join(root, "docs", "PROJECT-BLUEPRINT.json"));
      projectName = blueprint.project?.name || projectName;
      blueprintPurpose = blueprint.project?.purpose || "";
    } catch {
      knownEvidence.push("docs/PROJECT-BLUEPRINT.json (invalid JSON)");
    }
  } else if (files.includes("package.json")) {
    try {
      projectName = (await readJson(path.join(root, "package.json"))).name || projectName;
    } catch {
      knownEvidence.push("package.json (invalid JSON)");
    }
  }
  const readiness = sourceFiles.length > 0 || testFiles.length > 0 || blueprintPurpose.length >= 40 ? "ready" : "blocked";
  const evidence = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    project: { name: projectName, blueprintPurpose },
    readiness,
    blockers: readiness === "blocked" ? ["The repository does not yet contain enough blueprint or implementation evidence for a factual project video."] : [],
    knownEvidence: [...new Set(knownEvidence)].sort(),
    sourceFileCount: sourceFiles.length,
    testFileCount: testFiles.length,
    languageExtensions: Object.fromEntries([...extensions.entries()].sort()),
    candidateEvidence: files.filter((relative) => /^(README\.md|docs\/|src\/|app\/|lib\/|tests?\/|infra\/|\.github\/workflows\/)/.test(relative)).slice(0, 250)
  };
  const output = await resolveSafeTarget(root, String(options.output || "reports/project-video/project-evidence.json"), "inspection output");
  await writeJsonAtomic(output, evidence);
  console.log(`Project video evidence: ${path.relative(root, output)}`);
  console.log(`Readiness: ${readiness}`);
  return readiness === "ready" ? 0 : 2;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function narrationSentences(text) {
  const protectedText = String(text)
    .replace(/\b(?:[A-Za-z]\.){2,}/g, (value) => value.replaceAll(".", "\u2024"))
    .replace(/\b(?:e\.g|i\.e|etc|Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs)\./gi, (value) => value.replaceAll(".", "\u2024"))
    .replace(/(?<=[\p{L}\p{N}])\.(?=[\p{L}\p{N}])/gu, "\u2024");
  return protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((sentence) => sentence.replaceAll("\u2024", ".").trim())
    .filter(Boolean) || [];
}

function buildSpeechSsml(voice, text) {
  if (voiceProvider(voice) !== AZURE_NARRATION_PROVIDER) throw new Error("SSML preview is available only for the azure-neural provider");
  const sentences = narrationSentences(text);
  if (!sentences.length) throw new Error("Narration must contain spoken text");
  const pause = voice.sentencePauseMs ? `<break time="${voice.sentencePauseMs}ms"/>` : "";
  const sentenceMarkup = sentences.map((sentence) => `<s>${escapeXml(sentence)}</s>`).join(pause);
  const rate = voice.ratePercent === 0 ? sentenceMarkup : `<prosody rate="${voice.ratePercent > 0 ? "+" : ""}${voice.ratePercent}%">${sentenceMarkup}</prosody>`;
  const delivery = voice.style === "auto"
    ? rate
    : `<mstts:express-as style="${escapeXml(voice.style)}" styledegree="${voice.styleDegree}">${rate}</mstts:express-as>`;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${escapeXml(voice.locale)}"><voice name="${escapeXml(voice.name)}">${delivery}</voice></speak>`;
}

function requestedSpeechContext() {
  const region = process.env.AZURE_SPEECH_REGION || process.env.SPEECH_REGION;
  const cloud = process.env.AZURE_SPEECH_CLOUD || "AzureCloud";
  const speechDomains = new Map([["AzureCloud", "tts.speech.microsoft.com"], ["AzureUSGovernment", "tts.speech.azure.us"]]);
  if (!speechDomains.has(cloud)) throw new Error("AZURE_SPEECH_CLOUD must be AzureCloud or AzureUSGovernment");
  if (region && !/^[a-z0-9-]+$/.test(region)) throw new Error("AZURE_SPEECH_REGION must be a lowercase Azure region");
  return { region, cloud, speechDomains };
}

function validateAzureDiscovery(discovery) {
  const errors = [];
  if (!discovery || typeof discovery !== "object" || Array.isArray(discovery)) return ["report must be an object"];
  rejectUnknownFields(discovery, ["schemaVersion", "discoveredAt", "cloud", "location", "cognitiveAvailable", "cognitiveRegions", "openAIAvailable", "openAIModelName", "openAIModelVersion", "openAIModelSku", "openAIApiVersion", "speech"], "Azure discovery", errors);
  if (discovery.schemaVersion !== "1.0.0") errors.push("schemaVersion must be 1.0.0");
  if (!Number.isFinite(Date.parse(discovery.discoveredAt || ""))) errors.push("discoveredAt must be an ISO date-time");
  if (!new Set(["AzureCloud", "AzureUSGovernment"]).has(discovery.cloud)) errors.push("cloud is unsupported");
  if (!/^[a-z0-9-]+$/.test(discovery.location || "")) errors.push("location is invalid");
  if (typeof discovery.cognitiveAvailable !== "boolean" || typeof discovery.openAIAvailable !== "boolean") errors.push("service availability fields must be boolean");
  const validateRegions = (regions, label) => {
    if (!Array.isArray(regions) || new Set(regions).size !== regions.length || regions.some((region) => !/^[a-z0-9-]+$/.test(region))) errors.push(`${label} must contain unique lowercase Azure regions`);
  };
  validateRegions(discovery.cognitiveRegions, "cognitiveRegions");
  for (const field of ["openAIModelName", "openAIModelVersion", "openAIModelSku", "openAIApiVersion"]) {
    if (typeof discovery[field] !== "string") errors.push(`${field} must be a string`);
  }
  const speech = discovery.speech;
  if (!speech || typeof speech !== "object" || Array.isArray(speech)) {
    errors.push("speech is required");
    return errors;
  }
  rejectUnknownFields(speech, ["serviceAvailable", "serviceRegions", "existingResourceQuerySucceeded", "existingResourceAvailable", "existingResourceCount", "existingResourceRegions", "existingResourceKinds"], "Azure discovery speech", errors);
  for (const field of ["serviceAvailable", "existingResourceQuerySucceeded", "existingResourceAvailable"]) {
    if (typeof speech[field] !== "boolean") errors.push(`speech.${field} must be boolean`);
  }
  const existingResourceRegions = Array.isArray(speech.existingResourceRegions) ? speech.existingResourceRegions : [];
  const existingResourceKinds = Array.isArray(speech.existingResourceKinds) ? speech.existingResourceKinds : [];
  validateRegions(speech.serviceRegions, "speech.serviceRegions");
  validateRegions(speech.existingResourceRegions, "speech.existingResourceRegions");
  if (!Number.isInteger(speech.existingResourceCount) || speech.existingResourceCount < 0) errors.push("speech.existingResourceCount must be a nonnegative integer");
  const allowedKinds = new Set(["SpeechServices", "AIServices", "CognitiveServices"]);
  if (!Array.isArray(speech.existingResourceKinds) || new Set(existingResourceKinds).size !== existingResourceKinds.length || existingResourceKinds.some((kind) => !allowedKinds.has(kind))) {
    errors.push("speech.existingResourceKinds contains unsupported values");
  }
  if (speech.existingResourceAvailable === true && (speech.existingResourceCount < 1 || existingResourceRegions.length < 1 || existingResourceKinds.length < 1)) {
    errors.push("available Speech resources require a positive count, region, and kind");
  }
  if (speech.existingResourceAvailable === false && speech.existingResourceCount !== 0) errors.push("unavailable Speech resources require a zero count");
  if (speech.existingResourceQuerySucceeded === false && (speech.existingResourceAvailable !== false || speech.existingResourceCount !== 0 || existingResourceRegions.length || existingResourceKinds.length)) {
    errors.push("failed Speech resource queries cannot claim resource evidence");
  }
  return errors;
}

async function loadAzureSpeechDiscovery(root, expected = {}) {
  const file = resolveInside(root, AZURE_DISCOVERY_PATH, "Azure discovery report");
  if (!existsSync(file) || (await lstat(file)).isSymbolicLink()) {
    throw new Error("Azure Speech requires reports/azure-discovery.json; run the azure-discovery skill first");
  }
  const discovery = await readJson(file);
  const validationErrors = validateAzureDiscovery(discovery);
  if (validationErrors.length) throw new Error(`Azure discovery evidence is incompatible; rerun the azure-discovery skill:\n- ${validationErrors.join("\n- ")}`);
  const discoveredAt = Date.parse(discovery.discoveredAt || "");
  const age = Date.now() - discoveredAt;
  if (!Number.isFinite(discoveredAt) || age < -300_000 || age > AZURE_DISCOVERY_MAX_AGE_DAYS * 86_400_000) {
    throw new Error(`Azure discovery evidence is stale; rerun azure-discovery within ${AZURE_DISCOVERY_MAX_AGE_DAYS} days of video creation`);
  }
  if (expected.cloud && discovery.cloud !== expected.cloud) throw new Error(`Azure discovery cloud ${discovery.cloud} does not match AZURE_SPEECH_CLOUD ${expected.cloud}`);
  const speech = discovery.speech;
  if (!speech || speech.existingResourceQuerySucceeded !== true) throw new Error("Azure Speech resource discovery is uncertain; rerun azure-discovery with account-list access");
  if (speech.existingResourceAvailable !== true || !Number.isInteger(speech.existingResourceCount) || speech.existingResourceCount < 1) {
    throw new Error("No existing Azure Speech-capable resource was discovered; Azure provisioning is outside project-video");
  }
  const regions = Array.isArray(speech.existingResourceRegions) ? speech.existingResourceRegions : [];
  if (!regions.length || regions.some((region) => !/^[a-z0-9-]+$/.test(region))) throw new Error("Azure Speech discovery has invalid resource regions");
  if (expected.region && !regions.includes(expected.region)) {
    throw new Error(`AZURE_SPEECH_REGION ${expected.region} is not an existing discovered Speech resource region: ${regions.join(", ")}`);
  }
  return { discovery, file, sha256: await fileDigest(file), regions };
}

async function speechServiceSettings(root, options) {
  const { region, cloud, speechDomains } = requestedSpeechContext();
  const discovery = await loadAzureSpeechDiscovery(root, { cloud, region });
  const key = process.env.AZURE_SPEECH_KEY || process.env.SPEECH_KEY;
  if (!key) throw new Error("Set AZURE_SPEECH_KEY in the current process; never place the key in project files or command arguments");
  if (!region) throw new Error(`Set AZURE_SPEECH_REGION to one of the discovered resource regions: ${discovery.regions.join(", ")}`);
  if (options["approve-external"] !== true) throw new Error("Speech generation requires --approve-external after explicit user approval of Azure processing and cost");
  return {
    key,
    region,
    cloud,
    endpoint: `https://${region}.${speechDomains.get(cloud)}/cognitiveservices/v1`,
    discoveryAt: discovery.discovery.discoveredAt,
    discoverySha256: discovery.sha256
  };
}

async function azurePreflight(root) {
  const { region, cloud } = requestedSpeechContext();
  const result = await loadAzureSpeechDiscovery(root, { cloud, region });
  const readiness = {
    schemaVersion: "1.0.0",
    status: "ready",
    provider: AZURE_NARRATION_PROVIDER,
    cloud: result.discovery.cloud,
    discoveredAt: result.discovery.discoveredAt,
    discoverySha256: result.sha256,
    existingResourceCount: result.discovery.speech.existingResourceCount,
    existingResourceRegions: result.regions,
    selectedRegion: region || null,
    credentialConfigured: Boolean(process.env.AZURE_SPEECH_KEY || process.env.SPEECH_KEY),
    requiredEnvironment: ["AZURE_SPEECH_KEY", "AZURE_SPEECH_REGION", "AZURE_SPEECH_CLOUD"],
    videoRenderer: "local-ffmpeg"
  };
  console.log(JSON.stringify(readiness, null, 2));
  if (!readiness.credentialConfigured) console.log("Set AZURE_SPEECH_KEY securely in the execution environment; never paste or persist it in project files.");
  if (!readiness.selectedRegion) console.log(`Set AZURE_SPEECH_REGION to one of: ${readiness.existingResourceRegions.join(", ")}`);
  return 0;
}

async function discoveryStatus(root) {
  const { region, cloud } = requestedSpeechContext();
  try {
    const result = await loadAzureSpeechDiscovery(root, { cloud, region });
    console.log(JSON.stringify({
      schemaVersion: "1.0.0",
      status: "ready",
      discoveryFile: AZURE_DISCOVERY_PATH,
      cloud: result.discovery.cloud,
      regions: result.regions,
      selectedRegion: region || null,
      nextAction: "continue-azure-preflight",
      fallbackProvider: BROWSER_NARRATION_PROVIDER
    }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      schemaVersion: "1.0.0",
      status: existsSync(resolveInside(root, AZURE_DISCOVERY_PATH, "Azure discovery report")) ? "unusable" : "missing",
      discoveryFile: AZURE_DISCOVERY_PATH,
      reason: error.message,
      nextAction: "ask-user-to-run-azure-discovery",
      discoveryCommand: "/azure-discovery",
      declinedAction: "generate-browser-preview",
      fallbackProvider: BROWSER_NARRATION_PROVIDER
    }, null, 2));
  }
  return 0;
}

function jsonForHtml(value) {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function browserPreviewHtml(plan) {
  const preview = {
    project: plan.project,
    audience: plan.audience,
    voice: plan.voice,
    video: plan.video,
    scenes: plan.scenes
  };
  return `<!doctype html>
<html lang="${escapeXml(plan.voice.locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeXml(plan.project.name)} - Browser Preview</title>
  <style>
    :root{--background:${plan.video.backgroundColor};--primary:${plan.video.primaryColor};--accent:${plan.video.accentColor};--paper:#f5f7f4;--ink:#142129;--muted:#b9c7ca;--line:rgba(255,255,255,.18);color-scheme:dark}
    *{box-sizing:border-box}html,body{min-height:100%;margin:0}body{background:var(--background);color:var(--paper);font-family:Bahnschrift,"Arial Narrow",sans-serif;letter-spacing:0;overflow:hidden}
    button{font:inherit;letter-spacing:0}.player{height:100dvh;min-height:640px;display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;background-color:var(--background);background-image:repeating-linear-gradient(90deg,transparent 0,transparent 79px,rgba(255,255,255,.035) 80px)}
    header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:24px clamp(20px,5vw,72px);border-bottom:1px solid var(--line)}.brand{font-size:clamp(16px,2vw,22px);font-weight:700;text-transform:uppercase}.provider{font:700 12px/1.2 "Segoe UI",sans-serif;text-transform:uppercase;padding:8px 10px;border:1px solid var(--accent);color:var(--accent)}
    main{display:grid;grid-template-columns:minmax(0,1fr) minmax(250px,31vw);min-height:0;overflow:hidden}.copy{align-self:center;padding:clamp(32px,7vw,96px)}.eyebrow{color:var(--accent);font:700 14px/1.2 "Segoe UI",sans-serif;text-transform:uppercase;margin-bottom:22px}.title{font-size:clamp(42px,7vw,92px);line-height:.96;margin:0;max-width:12ch}.subtitle{font:400 clamp(18px,2.1vw,28px)/1.35 Georgia,serif;color:var(--muted);max-width:46ch;margin:28px 0 0}.evidence{display:flex;flex-wrap:wrap;gap:8px;margin-top:34px}.evidence span{font:600 12px/1.2 "Segoe UI",sans-serif;padding:7px 9px;border:1px solid var(--line);color:var(--muted)}
    .visual{position:relative;display:grid;place-items:center;background:var(--primary);overflow:hidden;min-height:420px}.visual:before,.visual:after{content:"";position:absolute;border:1px solid var(--line);inset:10%}.visual:after{inset:20%}.number{position:relative;font-size:clamp(96px,15vw,220px);font-weight:700;color:var(--accent)}.bars{position:absolute;inset:auto 12% 12%;display:grid;grid-template-columns:repeat(6,1fr);gap:8px;align-items:end;height:74px}.bars i{display:block;background:var(--paper);opacity:.68;height:var(--height)}
    .scene.entering .copy>*{animation:reveal .55s both}.scene.entering .copy>*:nth-child(2){animation-delay:.08s}.scene.entering .copy>*:nth-child(3){animation-delay:.16s}.scene.entering .visual{animation:wipe .55s both}@keyframes reveal{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}@keyframes wipe{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0)}}
    footer{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:20px;padding:18px clamp(20px,5vw,72px);border-top:1px solid var(--line)}.caption{font:400 15px/1.45 "Segoe UI",sans-serif;color:var(--muted);min-height:44px;max-width:90ch}.controls{display:flex;align-items:center;gap:8px}.controls button{width:44px;height:44px;border:1px solid var(--line);background:transparent;color:var(--paper);cursor:pointer}.controls button:hover,.controls button:focus-visible{border-color:var(--accent);color:var(--accent)}.controls .play{width:52px;background:var(--accent);border-color:var(--accent);color:var(--ink)}.progress{height:3px;background:rgba(255,255,255,.12);grid-column:1/-1}.progress span{display:block;height:100%;width:0;background:var(--accent);transition:width .35s ease}
    @media(max-width:760px){.player{min-height:0}header{padding:14px 20px}main{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) 160px}.copy{padding:28px 24px;overflow:hidden}.eyebrow{margin-bottom:14px}.title{font-size:clamp(36px,11vw,58px)}.subtitle{font-size:17px;margin-top:18px}.evidence{margin-top:18px}.visual{min-height:0}.number{font-size:104px}.bars{height:40px}footer{grid-template-columns:1fr;padding:10px 14px;gap:8px}.caption{font-size:13px;line-height:1.3;min-height:34px;max-height:51px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;text-align:center}.controls{justify-content:center}.controls button{width:40px;height:40px}.controls .play{width:48px}}
    @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
  </style>
</head>
<body>
  <div class="player">
    <header><div class="brand" id="brand"></div><div class="provider" id="provider">Browser preview</div></header>
    <main class="scene" id="scene"><section class="copy"><div class="eyebrow" id="counter"></div><h1 class="title" id="title"></h1><p class="subtitle" id="subtitle"></p><div class="evidence" id="evidence"></div></section><aside class="visual" aria-hidden="true"><div class="number" id="number"></div><div class="bars"><i style="--height:32%"></i><i style="--height:58%"></i><i style="--height:84%"></i><i style="--height:48%"></i><i style="--height:72%"></i><i style="--height:42%"></i></div></aside></main>
    <footer><div class="caption" id="caption" aria-live="polite"></div><div class="controls"><button id="previous" title="Previous scene" aria-label="Previous scene">&larr;</button><button id="restart" title="Restart" aria-label="Restart">&#8634;</button><button id="play" class="play" title="Play browser narration" aria-label="Play browser narration">&#9654;</button><button id="next" title="Next scene" aria-label="Next scene">&rarr;</button></div><div class="progress"><span id="progress"></span></div></footer>
  </div>
  <script type="application/json" id="preview-data">${jsonForHtml(preview)}</script>
  <script>
    const preview=JSON.parse(document.getElementById("preview-data").textContent);const scenes=preview.scenes;let current=0;let playing=false;let speechToken=0;
    const elements={brand:document.getElementById("brand"),provider:document.getElementById("provider"),scene:document.getElementById("scene"),counter:document.getElementById("counter"),title:document.getElementById("title"),subtitle:document.getElementById("subtitle"),evidence:document.getElementById("evidence"),number:document.getElementById("number"),caption:document.getElementById("caption"),previous:document.getElementById("previous"),restart:document.getElementById("restart"),play:document.getElementById("play"),next:document.getElementById("next"),progress:document.getElementById("progress")};
    function defaultEnglishVoice(){const voices=window.speechSynthesis&&window.speechSynthesis.getVoices?window.speechSynthesis.getVoices():[];return voices.find(function(voice){return voice.localService&&voice.lang==="en-US"})||voices.find(function(voice){return voice.lang==="en-US"})||voices.find(function(voice){return /^en(?:-|$)/i.test(voice.lang)})||null}
    function setPlaying(value){playing=value;elements.play.innerHTML=value?"&#10074;&#10074;":"&#9654;";elements.play.title=value?"Pause browser narration":"Play browser narration";elements.play.setAttribute("aria-label",elements.play.title)}
    function stopSpeech(){speechToken+=1;if(window.speechSynthesis)window.speechSynthesis.cancel()}
    function renderScene(index){current=Math.max(0,Math.min(index,scenes.length-1));const item=scenes[current];elements.brand.textContent=preview.project.name;elements.counter.textContent="Scene "+String(current+1).padStart(2,"0")+" of "+String(scenes.length).padStart(2,"0");elements.title.textContent=item.title;elements.subtitle.textContent=item.subtitle;elements.number.textContent=String(current+1).padStart(2,"0");elements.caption.textContent="Browser default English voice - "+item.narration;elements.evidence.replaceChildren.apply(elements.evidence,item.evidence.map(function(value){const tag=document.createElement("span");tag.textContent=value;return tag}));elements.progress.style.width=((current+1)/scenes.length*100)+"%";elements.previous.disabled=current===0;elements.next.disabled=current===scenes.length-1;elements.scene.classList.remove("entering");requestAnimationFrame(function(){elements.scene.classList.add("entering")})}
    function speakCurrent(){if(!playing)return;if(!window.speechSynthesis||typeof window.SpeechSynthesisUtterance!=="function"){setPlaying(false);elements.provider.textContent="Browser voice unavailable";return}const token=++speechToken;const utterance=new SpeechSynthesisUtterance(scenes[current].narration);const voice=defaultEnglishVoice();utterance.lang=preview.voice.locale;if(voice)utterance.voice=voice;utterance.rate=1;utterance.onend=function(){if(token!==speechToken||!playing)return;if(current<scenes.length-1){renderScene(current+1);speakCurrent()}else{setPlaying(false);elements.provider.textContent="Preview complete"}};utterance.onerror=function(){if(token!==speechToken)return;setPlaying(false);elements.provider.textContent="Browser voice unavailable"};elements.provider.textContent=voice?voice.name:"Browser default English voice";window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance)}
    function moveTo(index){const resume=playing;stopSpeech();renderScene(index);if(resume){setPlaying(true);speakCurrent()}}
    elements.play.addEventListener("click",function(){if(playing){stopSpeech();setPlaying(false)}else{setPlaying(true);speakCurrent()}});elements.previous.addEventListener("click",function(){moveTo(current-1)});elements.next.addEventListener("click",function(){moveTo(current+1)});elements.restart.addEventListener("click",function(){stopSpeech();renderScene(0);setPlaying(true);speakCurrent()});window.addEventListener("beforeunload",stopSpeech);renderScene(0);
  </script>
</body>
</html>\n`;
}

async function generateBrowserPreview(root, options) {
  const { plan, relative: planRelative, sha256: planSha256 } = await loadPlan(root, options);
  if (voiceProvider(plan.voice) !== BROWSER_NARRATION_PROVIDER) throw new Error("Browser preview generation requires a browser-preview plan provider");
  const output = await resolveSafeTarget(root, plan.output.file, "browser preview output");
  const manifestFile = await resolveSafeTarget(root, "reports/project-video/browser-preview-manifest.json", "browser preview manifest");
  const html = browserPreviewHtml(plan);
  const manifest = {
    schemaVersion: "1.0.0",
    status: "complete",
    generatedAt: new Date().toISOString(),
    provider: BROWSER_NARRATION_PROVIDER,
    plan: planRelative.replaceAll("\\", "/"),
    planSha256,
    output: plan.output.file,
    sha256: digest(Buffer.from(html, "utf8")),
    bytes: Buffer.byteLength(html, "utf8"),
    voice: { name: BROWSER_VOICE_NAME, locale: plan.voice.locale, processing: "browser-or-operating-system-controlled" },
    capabilities: { browserSpeech: true, browserVisuals: true, completionDrivenScenes: true, renderedAudio: false, portableMedia: false },
    scenes: plan.scenes.map((scene) => ({ id: scene.id, narrationSha256: digest(Buffer.from(scene.narration, "utf8")), evidence: scene.evidence }))
  };
  await writeBrowserPreviewArtifacts(output, manifestFile, html, manifest, options.force);
  console.log(`Browser preview: ${plan.output.file}`);
  console.log("Provider: browser-preview (interactive HTML; not a narrated MP4)");
  return 0;
}

async function requestSpeechAudio(settings, ssml, label) {
  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml; charset=utf-8",
      "Ocp-Apim-Subscription-Key": settings.key,
      "X-Microsoft-OutputFormat": "audio-48khz-192kbitrate-mono-mp3",
      "User-Agent": "Project-Skills-Orchestrator-Project-Video"
    },
    body: ssml,
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`Azure Speech failed for ${label}: HTTP ${response.status}`);
  if (!/^audio\//i.test(response.headers.get("content-type") || "")) throw new Error(`Azure Speech returned a non-audio response for ${label}`);
  const declaredBytes = Number(response.headers.get("content-length") || 0);
  if (declaredBytes > MAX_SPEECH_BYTES) throw new Error(`Azure Speech response is too large for ${label}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mp3Header = bytes.subarray(0, 3).toString("ascii") === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (bytes.length < 1024 || bytes.length > MAX_SPEECH_BYTES || !mp3Header) throw new Error(`Azure Speech returned incomplete MP3 audio for ${label}`);
  return bytes;
}

function auditionText(narration) {
  const sentences = narrationSentences(narration);
  let sample = "";
  for (const sentence of sentences) {
    if (!sample && sentence.length > 420) {
      const clipped = sentence.slice(0, 417);
      const boundary = clipped.lastIndexOf(" ");
      return `${clipped.slice(0, boundary >= 300 ? boundary : 417).trim()}...`;
    }
    if (sample && `${sample} ${sentence}`.length > 420) break;
    sample = sample ? `${sample} ${sentence}` : sentence;
  }
  return sample || String(narration).slice(0, 420);
}

function voiceAuditionHtml(samples, sampleText) {
  const players = samples.map((sample) => `<section><div class="slot">${escapeXml(sample.slot)}</div><div><h2>${escapeXml(sample.label)}</h2><p>${escapeXml(sample.voice.name)} | ${escapeXml(sample.voice.style)} | ${sample.voice.ratePercent}%</p><audio controls preload="metadata" src="${escapeXml(sample.file)}"></audio></div></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Video Voice Audition</title><style>:root{color-scheme:light;--ink:#132129;--paper:#f5f2ea;--cyan:#00a4b4;--coral:#f05d3d}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 "Segoe UI",sans-serif}main{width:min(900px,calc(100% - 32px));margin:48px auto}h1,h2{font-family:Bahnschrift,"Arial Narrow",sans-serif;letter-spacing:0}h1{font-size:clamp(36px,7vw,72px);line-height:1;margin:0 0 20px}.passage{padding:20px;border-left:6px solid var(--coral);background:#fffdf8;margin:28px 0}section{display:grid;grid-template-columns:64px 1fr;gap:18px;align-items:center;padding:22px 0;border-top:1px solid #c7ceca}.slot{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--ink);color:white;font:700 28px Bahnschrift,sans-serif}h2{margin:0;font-size:22px}section p{margin:4px 0 12px;color:#53636a}audio{width:100%}.note{margin-top:26px;color:#53636a}</style></head><body><main><h1>Choose the human voice.</h1><p>Listen to the same passage in all three profiles. Compare warmth, pacing, clarity, and how naturally the voice handles technical language.</p><div class="passage"><strong>Shared passage</strong><br>${escapeXml(sampleText)}</div>${players}<p class="note">Return to Copilot and identify A, B, or C. Selection is not automatic.</p></main></body></html>\n`;
}

async function previewSsml(root, options) {
  const { plan } = await loadPlan(root, options);
  const sceneId = String(options.scene || plan.scenes[0].id);
  const scene = plan.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new Error(`Unknown scene for SSML preview: ${sceneId}`);
  console.log(buildSpeechSsml(plan.voice, scene.narration));
  return 0;
}

async function auditionVoices(root, options) {
  const { plan, sha256: planSha256 } = await loadPlan(root, options);
  const settings = await speechServiceSettings(root, options);
  const sceneId = String(options.scene || plan.scenes[0].id);
  const scene = plan.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new Error(`Unknown audition scene: ${sceneId}`);
  const sampleText = auditionText(scene.narration);
  const outputDirectory = await resolveSafeTarget(root, "reports/project-video/voice-samples", "voice sample output");
  if (existsSync(outputDirectory) && options.force !== true) throw new Error("Voice samples already exist; use --force only after replacement approval");
  const staging = await resolveSafeTarget(root, `.skills-orchestrator/cache/project-video/voice-audition-${randomUUID()}`, "voice sample staging");
  await mkdir(staging, { recursive: true });
  try {
    const samples = [];
    for (const profile of VOICE_AUDITION_PROFILES) {
      const bytes = await requestSpeechAudio(settings, buildSpeechSsml(profile.voice, sampleText), profile.id);
      const file = `${profile.id}.mp3`;
      await writeFile(path.join(staging, file), bytes, { flag: "wx" });
      samples.push({ id: profile.id, slot: profile.slot, label: profile.label, file, voice: profile.voice, sha256: digest(bytes) });
    }
    const auditionPage = voiceAuditionHtml(samples, sampleText);
    await writeFile(path.join(staging, "index.html"), auditionPage, "utf8");
    await writeJsonAtomic(path.join(staging, "voice-samples.json"), {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      planSha256,
      scene: scene.id,
      sampleText,
      sampleTextSha256: digest(Buffer.from(sampleText, "utf8")),
      auditionPageSha256: digest(Buffer.from(auditionPage, "utf8")),
      cloud: settings.cloud,
      region: settings.region,
      azureDiscoverySha256: settings.discoverySha256,
      azureDiscoveryAt: settings.discoveryAt,
      recommended: "ava-hd-warm",
      samples
    });
    await mkdir(path.dirname(outputDirectory), { recursive: true });
    await rm(outputDirectory, { recursive: true, force: true });
    await rename(staging, outputDirectory);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log(`Voice samples: ${path.relative(root, outputDirectory)}`);
  console.log(`Listen: ${path.relative(root, path.join(outputDirectory, "index.html"))}`);
  console.log("Recommended starting profile: ava-hd-warm");
  return 0;
}

async function selectVoice(root, options) {
  if (options["approve-selection"] !== true) throw new Error("Voice selection requires --approve-selection after the user listens to the audition samples");
  const profileId = String(options.profile || "");
  if (!profileId) throw new Error("Use --profile with an audition profile ID");
  const { plan, file: planFile } = await loadPlan(root, options);
  const sampleDirectory = await resolveSafeTarget(root, "reports/project-video/voice-samples", "voice sample input");
  const sampleManifestFile = path.join(sampleDirectory, "voice-samples.json");
  if (!existsSync(sampleManifestFile)) throw new Error("Voice audition evidence is missing; run audition first");
  const sampleManifest = await readJson(sampleManifestFile);
  if (sampleManifest.sampleTextSha256 !== digest(Buffer.from(sampleManifest.sampleText || "", "utf8"))) throw new Error("Voice audition passage integrity failed");
  const auditionPage = path.join(sampleDirectory, "index.html");
  if (!existsSync(auditionPage) || sampleManifest.auditionPageSha256 !== await fileDigest(auditionPage)) throw new Error("Voice audition page integrity failed");
  if (!Array.isArray(sampleManifest.samples) || sampleManifest.samples.length !== VOICE_AUDITION_PROFILES.length) throw new Error("Voice audition must contain the complete A/B/C profile set");
  for (const expected of VOICE_AUDITION_PROFILES) {
    const actual = sampleManifest.samples.find((item) => item.id === expected.id);
    const file = actual ? path.join(sampleDirectory, actual.file) : "";
    if (!actual || actual.slot !== expected.slot || actual.label !== expected.label || JSON.stringify(normalizedAzureVoice(actual.voice)) !== JSON.stringify(expected.voice) || !existsSync(file) || actual.sha256 !== await fileDigest(file)) {
      throw new Error(`Voice audition profile integrity failed: ${expected.id}`);
    }
  }
  const profile = sampleManifest.samples?.find((item) => item.id === profileId);
  if (!profile) throw new Error(`Voice audition profile is unavailable: ${profileId}`);
  const canonicalProfile = VOICE_AUDITION_PROFILES.find((item) => item.id === profileId);
  if (!canonicalProfile || profile.slot !== canonicalProfile.slot || profile.label !== canonicalProfile.label || JSON.stringify(normalizedAzureVoice(profile.voice)) !== JSON.stringify(canonicalProfile.voice)) {
    throw new Error(`Voice audition profile metadata is invalid: ${profileId}`);
  }
  const sampleFile = await resolveSafeTarget(root, `reports/project-video/voice-samples/${profile.file}`, "voice sample file");
  if (!existsSync(sampleFile) || await fileDigest(sampleFile) !== profile.sha256) throw new Error(`Voice audition sample integrity failed: ${profileId}`);
  plan.voice = canonicalProfile.voice;
  const planErrors = validatePlan(plan);
  if (planErrors.length) throw new Error(`Selected voice produced an invalid plan:\n- ${planErrors.join("\n- ")}`);
  await writeJsonAtomic(planFile, plan);
  const selectionFile = await resolveSafeTarget(root, "reports/project-video/voice-selection.json", "voice selection output");
  await writeJsonAtomic(selectionFile, {
    schemaVersion: "1.0.0",
    selectedAt: new Date().toISOString(),
    auditionManifestSha256: await fileDigest(sampleManifestFile),
    profile: profile.id,
    slot: profile.slot,
    label: profile.label,
    voice: canonicalProfile.voice,
    sampleFile: `reports/project-video/voice-samples/${profile.file}`,
    sampleSha256: profile.sha256
  });
  console.log(`Selected voice profile ${profile.slot}: ${profile.label}`);
  console.log(`Updated plan voice settings: ${path.relative(root, planFile)}`);
  return 0;
}

async function verifyVoiceSelection(root, plan) {
  const selectionFile = await resolveSafeTarget(root, "reports/project-video/voice-selection.json", "voice selection input");
  if (!existsSync(selectionFile)) throw new Error("Explicit voice selection is missing; audition, listen, and run select-voice first");
  const selection = await readJson(selectionFile);
  const auditionManifestFile = await resolveSafeTarget(root, "reports/project-video/voice-samples/voice-samples.json", "voice audition manifest");
  const sampleFile = await resolveSafeTarget(root, selection.sampleFile, "voice sample file");
  if (!existsSync(auditionManifestFile) || selection.auditionManifestSha256 !== await fileDigest(auditionManifestFile)) throw new Error("Voice selection does not match the current audition evidence");
  if (!existsSync(sampleFile) || selection.sampleSha256 !== await fileDigest(sampleFile)) throw new Error("Selected voice sample integrity verification failed");
  const canonicalProfile = VOICE_AUDITION_PROFILES.find((item) => item.id === selection.profile);
  if (!canonicalProfile || selection.slot !== canonicalProfile.slot || selection.label !== canonicalProfile.label || JSON.stringify(normalizedAzureVoice(selection.voice)) !== JSON.stringify(canonicalProfile.voice)) {
    throw new Error("Selected voice profile metadata is invalid");
  }
  if (JSON.stringify(normalizedAzureVoice(selection.voice)) !== JSON.stringify(normalizedAzureVoice(plan.voice))) throw new Error("Project video plan voice does not match the explicitly selected audition profile");
  return selection;
}

async function synthesizeAzureNarration(root, options, { plan, sha256: planSha256 }) {
  if (voiceProvider(plan.voice) !== AZURE_NARRATION_PROVIDER) throw new Error("Azure narration requires an azure-neural plan");
  const selection = await verifyVoiceSelection(root, plan);
  const settings = await speechServiceSettings(root, options);
  const voiceSettingsSha256 = digest(Buffer.from(JSON.stringify(plan.voice), "utf8"));
  const outputDirectory = await resolveSafeTarget(root, "reports/project-video/audio", "audio output");
  await mkdir(outputDirectory, { recursive: true });
  const sceneEvidence = [];
  const previousManifestFile = path.join(outputDirectory, "narration-manifest.json");
  const previousManifest = existsSync(previousManifestFile) ? await readJson(previousManifestFile) : null;
  for (const scene of plan.scenes) {
    const target = path.join(outputDirectory, `${scene.id}.mp3`);
    if (existsSync(target) && options.force !== true) {
      const previous = previousManifest?.scenes?.find((item) => item.id === scene.id);
      const narrationSha256 = digest(Buffer.from(scene.narration, "utf8"));
      const audioSha256 = await fileDigest(target);
      if ((previousManifest?.provider || AZURE_NARRATION_PROVIDER) !== AZURE_NARRATION_PROVIDER || previousManifest?.voice !== plan.voice.name || previousManifest?.voiceSettingsSha256 !== voiceSettingsSha256 || previousManifest?.azureDiscoverySha256 !== settings.discoverySha256 || previous?.narrationSha256 !== narrationSha256 || previous?.audioSha256 !== audioSha256) {
        throw new Error(`Existing narration is stale or unverified for ${scene.id}; use --force only after replacement approval`);
      }
      console.log(`Already present: ${path.relative(root, target)}`);
    } else {
      const bytes = await requestSpeechAudio(settings, buildSpeechSsml(plan.voice, scene.narration), scene.id);
      const temporary = `${target}.${randomUUID()}.partial`;
      try {
        await writeFile(temporary, bytes, { flag: "wx" });
        await rm(target, { force: true });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
      console.log(`Generated ${path.relative(root, target)} sha256:${digest(bytes)}`);
    }
    sceneEvidence.push({
      id: scene.id,
      file: `reports/project-video/audio/${scene.id}.mp3`,
      narrationSha256: digest(Buffer.from(scene.narration, "utf8")),
      audioSha256: await fileDigest(target)
    });
  }
  await writeJsonAtomic(path.join(outputDirectory, "narration-manifest.json"), {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    provider: AZURE_NARRATION_PROVIDER,
    planSha256,
    voice: plan.voice.name,
    voiceSettings: plan.voice,
    voiceSettingsSha256,
    voiceSelectionProfile: selection.profile,
    voiceSelectionSha256: await fileDigest(resolveInside(root, "reports/project-video/voice-selection.json", "voice selection input")),
    cloud: settings.cloud,
    region: settings.region,
    azureDiscoverySha256: settings.discoverySha256,
    azureDiscoveryAt: settings.discoveryAt,
    scenes: sceneEvidence
  });
  return 0;
}

async function assertCompleteWav(file, label) {
  if (!existsSync(file) || (await stat(file)).size < 1024) throw new Error(`Piper produced incomplete WAV audio for ${label}`);
  const handle = await open(file, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || header.subarray(0, 4).toString("ascii") !== "RIFF" || header.subarray(8, 12).toString("ascii") !== "WAVE") {
      throw new Error(`Piper produced invalid WAV audio for ${label}`);
    }
  } finally {
    await handle.close();
  }
}

async function synthesizeLocalNarration(root, options, { plan, sha256: planSha256 }) {
  if (options["approve-local"] !== true) throw new Error("Local narration requires --approve-local after explicit approval of the narration text and fallback voice");
  const installation = await verifyLocalVoiceInstallation(root);
  const voiceSettingsSha256 = digest(Buffer.from(JSON.stringify(plan.voice), "utf8"));
  const outputDirectory = await resolveSafeTarget(root, "reports/project-video/audio", "audio output");
  await mkdir(outputDirectory, { recursive: true });
  const sceneEvidence = [];
  const previousManifestFile = path.join(outputDirectory, "narration-manifest.json");
  const previousManifest = existsSync(previousManifestFile) ? await readJson(previousManifestFile) : null;
  for (const scene of plan.scenes) {
    const target = path.join(outputDirectory, `${scene.id}.wav`);
    if (existsSync(target) && options.force !== true) {
      const previous = previousManifest?.scenes?.find((item) => item.id === scene.id);
      const narrationSha256 = digest(Buffer.from(scene.narration, "utf8"));
      const audioSha256 = await fileDigest(target);
      if (previousManifest?.provider !== LOCAL_NARRATION_PROVIDER || previousManifest?.voice !== plan.voice.name || previousManifest?.voiceSettingsSha256 !== voiceSettingsSha256 || previousManifest?.localVoiceInstallSha256 !== installation.manifestSha256 || previous?.narrationSha256 !== narrationSha256 || previous?.audioSha256 !== audioSha256) {
        throw new Error(`Existing narration is stale or unverified for ${scene.id}; use --force only after replacement approval`);
      }
      await assertCompleteWav(target, scene.id);
      console.log(`Already present: ${path.relative(root, target)}`);
    } else {
      const temporary = `${target}.${randomUUID()}.partial.wav`;
      try {
        const input = `${scene.narration.replace(/\s+/g, " ").trim()}\n`;
        runChecked(installation.python, [
          "-m", "piper",
          "--model", installation.model,
          "--config", installation.config,
          "--output-file", temporary,
          "--length-scale", String(plan.voice.lengthScale),
          "--sentence-silence", String(plan.voice.sentenceSilenceSeconds)
        ], { input, timeout: 300_000 });
        await assertCompleteWav(temporary, scene.id);
        await rm(target, { force: true });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
      console.log(`Generated ${path.relative(root, target)} sha256:${await fileDigest(target)}`);
    }
    sceneEvidence.push({
      id: scene.id,
      file: `reports/project-video/audio/${scene.id}.wav`,
      narrationSha256: digest(Buffer.from(scene.narration, "utf8")),
      audioSha256: await fileDigest(target)
    });
  }
  await writeJsonAtomic(path.join(outputDirectory, "narration-manifest.json"), {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    provider: LOCAL_NARRATION_PROVIDER,
    planSha256,
    voice: plan.voice.name,
    voiceSettings: plan.voice,
    voiceSettingsSha256,
    localVoiceInstallSha256: installation.manifestSha256,
    engine: { package: PIPER_PACKAGE, version: PIPER_VERSION, license: "GPL-3.0-or-later" },
    model: {
      id: LOCAL_VOICE_MODEL.id,
      quality: LOCAL_VOICE_MODEL.quality,
      sourceRevision: LOCAL_VOICE_MODEL.sourceRevision,
      dataset: LOCAL_VOICE_MODEL.dataset,
      datasetLicense: LOCAL_VOICE_MODEL.datasetLicense,
      onnxSha256: LOCAL_VOICE_MODEL.files[0].sha256
    },
    scenes: sceneEvidence
  });
  return 0;
}

async function synthesizeNarration(root, options) {
  const planDetails = await loadPlan(root, options);
  if (voiceProvider(planDetails.plan.voice) === BROWSER_NARRATION_PROVIDER) throw new Error("Browser preview uses runtime browser speech; run browser-preview instead of narrate");
  if (voiceProvider(planDetails.plan.voice) === LOCAL_NARRATION_PROVIDER) return synthesizeLocalNarration(root, options, planDetails);
  return synthesizeAzureNarration(root, options, planDetails);
}

async function verifyNarrationSet(root, plan, planSha256) {
  const audioDirectory = await resolveSafeTarget(root, "reports/project-video/audio", "audio input");
  const manifestFile = path.join(audioDirectory, "narration-manifest.json");
  if (!existsSync(manifestFile)) throw new Error("Narration is incomplete or stale: narration-manifest.json is missing");
  const manifest = await readJson(manifestFile);
  const provider = voiceProvider(plan.voice);
  const manifestProvider = manifest.provider || AZURE_NARRATION_PROVIDER;
  const voiceSettingsSha256 = digest(Buffer.from(JSON.stringify(plan.voice), "utf8"));
  if (manifestProvider !== provider || manifest.planSha256 !== planSha256 || manifest.voice !== plan.voice.name || manifest.voiceSettingsSha256 !== voiceSettingsSha256) throw new Error("Narration does not match the current project video plan");
  manifest.provider = manifestProvider;
  if (provider === AZURE_NARRATION_PROVIDER) {
    const selectionFile = resolveInside(root, "reports/project-video/voice-selection.json", "voice selection input");
    if (!existsSync(selectionFile) || manifest.voiceSelectionSha256 !== await fileDigest(selectionFile)) throw new Error("Azure narration does not match the approved voice selection");
    const discovery = await loadAzureSpeechDiscovery(root, { cloud: manifest.cloud, region: manifest.region });
    if (manifest.azureDiscoverySha256 !== discovery.sha256 || manifest.azureDiscoveryAt !== discovery.discovery.discoveredAt) {
      throw new Error("Azure narration does not match the current discovery evidence; regenerate narration after approving replacement");
    }
  } else {
    const installation = await verifyLocalVoiceInstallation(root);
    if (manifest.localVoiceInstallSha256 !== installation.manifestSha256 || manifest.engine?.package !== PIPER_PACKAGE || manifest.engine?.version !== PIPER_VERSION || manifest.model?.id !== LOCAL_VOICE_MODEL.id || manifest.model?.onnxSha256 !== LOCAL_VOICE_MODEL.files[0].sha256) {
      throw new Error("Local narration does not match the verified Piper installation");
    }
  }
  if (!Array.isArray(manifest.scenes) || manifest.scenes.length !== plan.scenes.length) throw new Error("Narration manifest has the wrong scene count");
  for (const scene of plan.scenes) {
    const record = manifest.scenes.find((item) => item.id === scene.id);
    const extension = provider === LOCAL_NARRATION_PROVIDER ? "wav" : "mp3";
    const expectedFile = `reports/project-video/audio/${scene.id}.${extension}`;
    if (!record || (record.file !== undefined && record.file !== expectedFile)) throw new Error(`Narration manifest has an invalid scene file: ${scene.id}`);
    record.file = expectedFile;
    const audio = resolveInside(root, record.file, "narration audio");
    if (!existsSync(audio) || (await stat(audio)).size < 1024 || (await lstat(audio)).isSymbolicLink()) throw new Error(`Missing complete narration: ${path.relative(root, audio)}`);
    if (provider === LOCAL_NARRATION_PROVIDER) await assertCompleteWav(audio, scene.id);
    if (record.narrationSha256 !== digest(Buffer.from(scene.narration, "utf8")) || record.audioSha256 !== await fileDigest(audio)) {
      throw new Error(`Narration integrity check failed: ${scene.id}`);
    }
  }
  return { audioDirectory, narrationManifest: manifest };
}

function rendererRoot(root) {
  return resolveInside(root, ".skills-orchestrator/tools/project-video", "renderer root");
}

function bundledFfmpeg(root) {
  const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(rendererRoot(root), "node_modules", RENDERER_PACKAGE, executable);
}

function testExecutable(executable) {
  const result = spawnSync(executable, ["-version"], { encoding: "utf8", windowsHide: true });
  return result.status === 0;
}

async function locateFfmpeg(root, requested) {
  const bundled = bundledFfmpeg(root);
  const pathCandidates = [];
  const executableNames = process.platform === "win32" ? ["ffmpeg.exe"] : ["ffmpeg"];
  for (const directory of String(process.env.PATH || "").split(path.delimiter)) {
    if (!path.isAbsolute(directory)) continue;
    for (const name of executableNames) {
      const executable = path.join(directory, name);
      if (existsSync(executable)) pathCandidates.push({ executable, source: "system-path" });
    }
  }
  const candidates = [
    requested ? { executable: requested, source: "explicit" } : null,
    process.env.FFMPEG_PATH ? { executable: process.env.FFMPEG_PATH, source: "environment" } : null,
    { executable: bundled, source: "isolated-pinned" },
    ...pathCandidates
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate.executable)) throw new Error(`${candidate.source} FFmpeg path must be absolute`);
    if (!existsSync(candidate.executable)) continue;
    const details = await lstat(candidate.executable);
    if (details.isSymbolicLink() || !details.isFile()) throw new Error(`FFmpeg must be a regular executable file: ${candidate.executable}`);
    if (!testExecutable(candidate.executable)) continue;
    if (candidate.source === "isolated-pinned") {
      const manifestFile = path.join(rendererRoot(root), "renderer-manifest.json");
      if (!existsSync(manifestFile)) throw new Error("Pinned renderer manifest is missing; reinstall the renderer after approval");
      const manifest = await readJson(manifestFile);
      if (manifest.package !== RENDERER_PACKAGE || manifest.packageVersion !== RENDERER_VERSION || manifest.binarySha256 !== await fileDigest(candidate.executable)) {
        throw new Error("Pinned renderer integrity verification failed; reinstall it after review and approval");
      }
      return { ...candidate, name: RENDERER_PACKAGE, packageVersion: RENDERER_VERSION, binarySha256: manifest.binarySha256 };
    }
    candidate.binarySha256 = await fileDigest(candidate.executable);
    return { ...candidate, name: "ffmpeg", packageVersion: null };
  }
  throw new Error("FFmpeg is unavailable. After approval, run install-renderer --accept-download, or set FFMPEG_PATH to an approved executable");
}

function runChecked(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.status !== 0) {
    const details = `${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(-6000);
    throw new Error(`${path.basename(executable)} failed with exit code ${result.status}${details ? `:\n${details}` : ""}`);
  }
  return result;
}

function localVoiceRoot(root) {
  return resolveInside(root, ".skills-orchestrator/tools/project-video/local-voice", "local voice root");
}

function isolatedPythonAt(target) {
  return path.join(target, "venv", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");
}

function isolatedPython(root) {
  return isolatedPythonAt(localVoiceRoot(root));
}

function expectedPiperWheel() {
  const wheel = PIPER_WHEELS[`${process.platform}-${process.arch}`];
  if (!wheel) throw new Error(`The pinned Piper fallback does not support ${process.platform}-${process.arch}`);
  return wheel;
}

function inspectPython(executable) {
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 10_000 });
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  const match = text.match(/Python\s+(3)\.(\d+)\.(\d+)/);
  if (result.status !== 0 || !match) return null;
  const minor = Number(match[2]);
  if (minor < 10 || minor > 13) return null;
  return { version: `${match[1]}.${match[2]}.${match[3]}`, major: 3, minor };
}

async function locatePython(options) {
  const requested = options.python || process.env.PYTHON_PATH;
  if (requested && !path.isAbsolute(String(requested))) throw new Error("The approved Python path must be absolute");
  const names = process.platform === "win32" ? ["python.exe", "python3.exe"] : ["python3", "python"];
  const candidates = requested ? [String(requested)] : [];
  if (!requested) {
    for (const directory of String(process.env.PATH || "").split(path.delimiter)) {
      if (!path.isAbsolute(directory)) continue;
      for (const name of names) candidates.push(path.join(directory, name));
    }
  }
  const seen = new Set();
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const canonical = await realpath(candidate);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const details = await lstat(canonical);
    if (!details.isFile()) continue;
    const version = inspectPython(canonical);
    if (version) return { executable: canonical, ...version };
  }
  throw new Error("Piper requires an approved Python 3.10 through 3.13 runtime; pass its absolute path with --python or PYTHON_PATH");
}

async function downloadPinnedFile(target, specification) {
  const response = await fetch(specification.url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok || !response.body) throw new Error(`Local voice download failed for ${specification.name}: HTTP ${response.status}`);
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== "https:" || !(finalUrl.hostname === "huggingface.co" || finalUrl.hostname.endsWith(".huggingface.co") || finalUrl.hostname.endsWith(".hf.co"))) {
    throw new Error(`Local voice download redirected to an unapproved host for ${specification.name}`);
  }
  const declaredBytes = Number(response.headers.get("content-length") || 0);
  if (declaredBytes > specification.bytes) throw new Error(`Local voice download is larger than expected for ${specification.name}`);
  const temporary = `${target}.${randomUUID()}.partial`;
  const sha256 = createHash("sha256");
  const md5 = createHash("md5");
  let bytes = 0;
  try {
    const handle = await open(temporary, "wx");
    try {
      for await (const chunkValue of response.body) {
        const chunk = Buffer.from(chunkValue);
        bytes += chunk.length;
        if (bytes > specification.bytes) throw new Error(`Local voice download exceeded the expected size for ${specification.name}`);
        sha256.update(chunk);
        md5.update(chunk);
        await handle.write(chunk);
      }
    } finally {
      await handle.close();
    }
    const hashes = { sha256: sha256.digest("hex"), md5: md5.digest("hex") };
    if (bytes !== specification.bytes || (specification.sha256 && hashes.sha256 !== specification.sha256) || hashes.md5 !== specification.md5) {
      throw new Error(`Local voice integrity verification failed for ${specification.name}`);
    }
    await rename(temporary, target);
    return { file: specification.name, bytes, ...hashes };
  } finally {
    await rm(temporary, { force: true });
  }
}

function localVoiceRequirements() {
  const packages = { [PIPER_PACKAGE]: PIPER_VERSION, ...LOCAL_VOICE_DEPENDENCIES };
  if (process.platform === "win32") Object.assign(packages, WINDOWS_LOCAL_VOICE_DEPENDENCIES);
  return packages;
}

function localVoiceRequirementsText() {
  return `${Object.entries(localVoiceRequirements()).map(([name, version]) => `${name}==${version}`).join("\n")}\n`;
}

async function installedVoiceVersions(python) {
  const code = "import importlib.metadata as m, json; print(json.dumps({d.metadata['Name'].lower():d.version for d in m.distributions() if d.metadata['Name']}))";
  return JSON.parse(runChecked(python, ["-c", code]).stdout.trim());
}

async function verifyLocalVoiceInstallation(root, target = localVoiceRoot(root)) {
  const manifestFile = path.join(target, "local-voice-manifest.json");
  if (!existsSync(manifestFile)) throw new Error("The local Piper voice is not installed; after approval, run install-local-voice");
  const manifest = await readJson(manifestFile);
  if (manifest.schemaVersion !== "1.0.0" || manifest.status !== "complete" || manifest.platform !== process.platform || manifest.arch !== process.arch) {
    throw new Error("The local Piper installation manifest does not match this platform");
  }
  if (manifest.engine?.package !== PIPER_PACKAGE || manifest.engine?.version !== PIPER_VERSION || manifest.engine?.license !== "GPL-3.0-or-later" || manifest.engine?.release !== PIPER_RELEASE_URL) {
    throw new Error("The local Piper engine manifest is invalid");
  }
  const expectedPackages = localVoiceRequirements();
  const expectedDependencies = Object.fromEntries(Object.entries(expectedPackages).filter(([name]) => name !== PIPER_PACKAGE));
  if (JSON.stringify(sortedObject(manifest.dependencies)) !== JSON.stringify(sortedObject(expectedDependencies))) {
    throw new Error("The local Piper dependency pins do not match this helper");
  }
  const requirementsFile = path.join(target, "requirements.txt");
  const requirementsText = localVoiceRequirementsText();
  if (!existsSync(requirementsFile) || await readFile(requirementsFile, "utf8") !== requirementsText || manifest.requirementsSha256 !== digest(Buffer.from(requirementsText, "utf8"))) {
    throw new Error("The local Piper requirements lock failed integrity verification");
  }
  if (manifest.model?.id !== LOCAL_VOICE_MODEL.id || manifest.model?.locale !== LOCAL_VOICE_MODEL.locale || manifest.model?.quality !== LOCAL_VOICE_MODEL.quality || manifest.model?.source !== LOCAL_VOICE_MODEL.source || manifest.model?.sourceRevision !== LOCAL_VOICE_MODEL.sourceRevision || manifest.model?.dataset !== LOCAL_VOICE_MODEL.dataset || manifest.model?.datasetLicense !== LOCAL_VOICE_MODEL.datasetLicense || manifest.model?.datasetLicenseUrl !== LOCAL_VOICE_MODEL.datasetLicenseUrl) {
    throw new Error("The local Piper model provenance does not match this helper");
  }
  if (manifest.approvals?.download !== true || manifest.approvals?.gpl !== true || manifest.approvals?.modelProvenance !== true) throw new Error("The local Piper approval evidence is incomplete");
  const wheel = expectedPiperWheel();
  if (!Array.isArray(manifest.wheels) || manifest.wheels.length !== Object.keys(expectedPackages).length || new Set(manifest.wheels.map((item) => item.file)).size !== manifest.wheels.length) {
    throw new Error("The local Piper wheel manifest does not match the complete lock");
  }
  const wheelRecord = manifest.wheels?.find((item) => item.file === `wheels/${wheel.file}`);
  const wheelFile = path.join(target, "wheels", wheel.file);
  if (!wheelRecord || !existsSync(wheelFile) || wheelRecord.sha256 !== wheel.sha256 || await fileDigest(wheelFile) !== wheel.sha256) {
    throw new Error("The pinned Piper wheel integrity verification failed");
  }
  for (const record of manifest.wheels || []) {
    if (!/^wheels\/[A-Za-z0-9_.+-]+\.whl$/.test(record.file || "")) throw new Error("The local voice wheel manifest contains an unsafe path");
    const file = resolveInside(target, record.file, "local voice wheel");
    if (!existsSync(file) || record.sha256 !== await fileDigest(file) || record.bytes !== (await stat(file)).size) throw new Error(`Local voice wheel integrity failed: ${record.file}`);
  }
  const modelDirectory = path.join(target, "models", LOCAL_VOICE_MODEL.id);
  for (const specification of LOCAL_VOICE_MODEL.files) {
    const file = path.join(modelDirectory, specification.name);
    const record = manifest.model.files?.find((item) => item.file === `models/${LOCAL_VOICE_MODEL.id}/${specification.name}`);
    if (!record || !existsSync(file) || record.bytes !== specification.bytes || record.sha256 !== await fileDigest(file) || (specification.sha256 && record.sha256 !== specification.sha256) || await fileHash(file, "md5") !== specification.md5) {
      throw new Error(`Local voice model integrity failed: ${specification.name}`);
    }
  }
  const python = isolatedPythonAt(target);
  if (!existsSync(python)) throw new Error("The isolated Piper Python runtime is missing");
  if (manifest.python?.isolatedExecutableSha256 !== await fileDigest(python)) throw new Error("The isolated Piper Python executable failed integrity verification");
  const pythonVersion = inspectPython(python);
  if (!pythonVersion || manifest.python?.version !== pythonVersion.version) throw new Error("The isolated Piper Python version failed verification");
  const versions = await installedVoiceVersions(python);
  const ignoredPackages = new Set(["pip", "setuptools"]);
  const installedPackages = Object.fromEntries(Object.entries(versions).filter(([name]) => !ignoredPackages.has(name)));
  if (JSON.stringify(sortedObject(installedPackages)) !== JSON.stringify(sortedObject(expectedPackages))) {
    throw new Error("The isolated Piper package versions failed verification");
  }
  return {
    root: target,
    python,
    manifest,
    manifestFile,
    manifestSha256: await fileDigest(manifestFile),
    model: path.join(modelDirectory, `${LOCAL_VOICE_MODEL.id}.onnx`),
    config: path.join(modelDirectory, `${LOCAL_VOICE_MODEL.id}.onnx.json`)
  };
}

async function installLocalVoice(root, options) {
  const target = await resolveSafeTarget(root, ".skills-orchestrator/tools/project-video/local-voice", "local voice root");
  if (existsSync(target) && options.force !== true) {
    await verifyLocalVoiceInstallation(root);
    console.log(`Verified ${PIPER_PACKAGE}@${PIPER_VERSION} under ${path.relative(root, target)}`);
    return 0;
  }
  if (options["accept-download"] !== true) throw new Error("Local voice installation requires --accept-download after explicit network approval");
  if (options["accept-gpl"] !== true) throw new Error("Local voice installation requires --accept-gpl after explicit acceptance of Piper's GPL-3.0-or-later license");
  if (options["accept-model-provenance"] !== true) throw new Error("Local voice installation requires --accept-model-provenance after review of the public-domain LJSpeech provenance");
  expectedPiperWheel();
  const python = await locatePython(options);
  const installationId = randomUUID();
  const staging = await resolveSafeTarget(root, `.skills-orchestrator/tools/project-video/local-voice-${installationId}.staging`, "local voice staging");
  const backup = await resolveSafeTarget(root, `.skills-orchestrator/tools/project-video/local-voice-${installationId}.backup`, "local voice backup");
  let backupCreated = false;
  let published = false;
  try {
    const wheelDirectory = path.join(staging, "wheels");
    const modelDirectory = path.join(staging, "models", LOCAL_VOICE_MODEL.id);
    const requirementsFile = path.join(staging, "requirements.txt");
    await Promise.all([mkdir(wheelDirectory, { recursive: true }), mkdir(modelDirectory, { recursive: true })]);
    const requirementsText = localVoiceRequirementsText();
    await writeFile(requirementsFile, requirementsText, "utf8");
    runChecked(python.executable, ["-m", "venv", path.join(staging, "venv")]);
    const isolated = isolatedPythonAt(staging);
    runChecked(isolated, ["-m", "pip", "download", "--disable-pip-version-check", "--no-input", "--only-binary=:all:", "--dest", wheelDirectory, "-r", requirementsFile]);
    const wheelFiles = (await readdir(wheelDirectory)).filter((file) => file.endsWith(".whl")).sort();
    if (wheelFiles.length !== Object.keys(localVoiceRequirements()).length) throw new Error("The resolved Piper wheel set contains missing or unexpected packages");
    const expectedWheel = expectedPiperWheel();
    if (!wheelFiles.includes(expectedWheel.file) || await fileDigest(path.join(wheelDirectory, expectedWheel.file)) !== expectedWheel.sha256) {
      throw new Error("The downloaded Piper wheel does not match the official release digest for this platform");
    }
    const wheels = [];
    for (const file of wheelFiles) {
      const absolute = path.join(wheelDirectory, file);
      wheels.push({ file: `wheels/${file}`, bytes: (await stat(absolute)).size, sha256: await fileDigest(absolute) });
    }
    runChecked(isolated, ["-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--no-index", "--only-binary=:all:", "--find-links", wheelDirectory, "-r", requirementsFile]);
    const modelFiles = [];
    for (const specification of LOCAL_VOICE_MODEL.files) {
      const record = await downloadPinnedFile(path.join(modelDirectory, specification.name), specification);
      modelFiles.push({ ...record, file: `models/${LOCAL_VOICE_MODEL.id}/${specification.name}` });
    }
    const versions = await installedVoiceVersions(isolated);
    const expectedPackages = localVoiceRequirements();
    const installedPackages = Object.fromEntries(Object.entries(versions).filter(([name]) => !new Set(["pip", "setuptools"]).has(name)));
    if (JSON.stringify(sortedObject(installedPackages)) !== JSON.stringify(sortedObject(expectedPackages))) throw new Error("The installed Piper package set does not match the complete lock");
    await writeJsonAtomic(path.join(staging, "local-voice-manifest.json"), {
      schemaVersion: "1.0.0",
      status: "complete",
      installedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      python: { source: python.executable, version: python.version, isolatedExecutableSha256: await fileDigest(isolated) },
      engine: { package: PIPER_PACKAGE, version: PIPER_VERSION, license: "GPL-3.0-or-later", source: "https://github.com/OHF-Voice/piper1-gpl", release: PIPER_RELEASE_URL },
      dependencies: Object.fromEntries(Object.entries(expectedPackages).filter(([name]) => name !== PIPER_PACKAGE)),
      requirementsSha256: digest(Buffer.from(requirementsText, "utf8")),
      wheels,
      model: {
        id: LOCAL_VOICE_MODEL.id,
        locale: LOCAL_VOICE_MODEL.locale,
        quality: LOCAL_VOICE_MODEL.quality,
        source: LOCAL_VOICE_MODEL.source,
        sourceRevision: LOCAL_VOICE_MODEL.sourceRevision,
        dataset: LOCAL_VOICE_MODEL.dataset,
        datasetLicense: LOCAL_VOICE_MODEL.datasetLicense,
        datasetLicenseUrl: LOCAL_VOICE_MODEL.datasetLicenseUrl,
        files: modelFiles
      },
      approvals: { download: true, gpl: true, modelProvenance: true }
    });
    await verifyLocalVoiceInstallation(root, staging);
    if (existsSync(target)) {
      await rename(target, backup);
      backupCreated = true;
    }
    await rename(staging, target);
    published = true;
    await verifyLocalVoiceInstallation(root);
    if (backupCreated) {
      await rm(backup, { recursive: true, force: true });
      backupCreated = false;
    }
    console.log(`Installed ${PIPER_PACKAGE}@${PIPER_VERSION} and ${LOCAL_VOICE_MODEL.id} under ${path.relative(root, target)}`);
    return 0;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (published) await rm(target, { recursive: true, force: true });
    if (backupCreated && existsSync(backup)) await rename(backup, target);
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
    if (!backupCreated) await rm(backup, { recursive: true, force: true });
  }
}

async function installRenderer(root, options) {
  if (options["accept-download"] !== true) throw new Error("Renderer installation requires --accept-download after explicit user approval");
  const target = await resolveSafeTarget(root, ".skills-orchestrator/tools/project-video", "renderer root");
  await mkdir(target, { recursive: true });
  await writeJsonAtomic(path.join(target, "package.json"), {
    name: "project-video-renderer",
    private: true,
    version: "1.0.0",
    dependencies: { [RENDERER_PACKAGE]: RENDERER_VERSION }
  });
  const npmCliCandidates = [
    process.env.NPM_CLI_JS,
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")
  ].filter((candidate) => candidate && path.isAbsolute(candidate) && existsSync(candidate));
  let npmCli = null;
  for (const candidate of npmCliCandidates) {
    const canonical = await realpath(candidate);
    if ((await lstat(canonical)).isFile()) {
      npmCli = canonical;
      break;
    }
  }
  if (!npmCli) throw new Error("The npm CLI module was not found beside Node.js; set NPM_CLI_JS to its approved absolute npm-cli.js path");
  const npmArgs = ["install", "--prefix", target, "--no-audit", "--no-fund", "--foreground-scripts", "--ignore-scripts=false"];
  runChecked(process.execPath, [npmCli, ...npmArgs]);
  const executable = bundledFfmpeg(root);
  if (!testExecutable(executable)) throw new Error(`Pinned renderer installation did not produce a working FFmpeg executable: ${executable}`);
  const lock = await readJson(path.join(target, "package-lock.json"));
  const lockedPackage = lock.packages?.[`node_modules/${RENDERER_PACKAGE}`];
  if (lockedPackage?.version !== RENDERER_VERSION || !/^sha512-/.test(lockedPackage.integrity || "")) {
    throw new Error("Pinned renderer lock integrity is missing or does not match the approved version");
  }
  const packageMetadata = await readJson(path.join(target, "node_modules", RENDERER_PACKAGE, "package.json"));
  const versionLine = runChecked(executable, ["-version"]).stdout.split(/\r?\n/, 1)[0];
  await writeJsonAtomic(path.join(target, "renderer-manifest.json"), {
    schemaVersion: "1.0.0",
    installedAt: new Date().toISOString(),
    package: RENDERER_PACKAGE,
    packageVersion: RENDERER_VERSION,
    packageIntegrity: lockedPackage.integrity,
    packageLicense: packageMetadata.license || "unknown",
    binarySha256: await fileDigest(executable),
    ffmpeg: versionLine
  });
  console.log(`Installed ${RENDERER_PACKAGE}@${RENDERER_VERSION} under ${path.relative(root, target)}`);
  return 0;
}

const GLYPHS = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
  ",": ["00000", "00000", "00000", "00000", "00110", "00110", "00100"],
  ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  "J": ["00001", "00001", "00001", "00001", "10001", "10001", "01110"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"]
};

function color(value) {
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];
}

function fillRectangle(buffer, width, height, x, y, boxWidth, boxHeight, rgb) {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + boxWidth));
  const endY = Math.min(height, Math.ceil(y + boxHeight));
  for (let row = startY; row < endY; row += 1) {
    for (let column = startX; column < endX; column += 1) {
      const offset = (row * width + column) * 3;
      buffer[offset] = rgb[0];
      buffer[offset + 1] = rgb[1];
      buffer[offset + 2] = rgb[2];
    }
  }
}

function wrapText(value, maximum) {
  const rawWords = String(value).toUpperCase().replace(/[^A-Z0-9 .,\-/:&!?]/g, " ").split(/\s+/).filter(Boolean);
  const words = rawWords.flatMap((word) => {
    const chunks = [];
    for (let offset = 0; offset < word.length; offset += maximum) chunks.push(word.slice(offset, offset + maximum));
    return chunks;
  });
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maximum) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(buffer, width, height, x, y, value, scale, rgb) {
  let cursor = x;
  for (const character of String(value).toUpperCase()) {
    const glyph = GLYPHS[character] || GLYPHS["?"];
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        if (glyph[row][column] === "1") fillRectangle(buffer, width, height, cursor + column * scale, y + row * scale, scale, scale, rgb);
      }
    }
    cursor += 6 * scale;
  }
}

async function writeScenePpm(file, plan, scene, index) {
  const { width, height, backgroundColor, primaryColor, accentColor } = plan.video;
  const background = color(backgroundColor);
  const primary = color(primaryColor);
  const accent = color(accentColor);
  const white = [248, 250, 250];
  const muted = [190, 205, 209];
  const pixels = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    const blend = row / height * 0.16;
    const mixed = background.map((channel, offset) => Math.round(channel * (1 - blend) + primary[offset] * blend));
    fillRectangle(pixels, width, height, 0, row, width, 1, mixed);
  }
  const unit = width / 1280;
  fillRectangle(pixels, width, height, 0, 0, Math.round(18 * unit), height, accent);
  fillRectangle(pixels, width, height, Math.round(width * 0.69), 0, Math.round(width * 0.31), height, primary);
  fillRectangle(pixels, width, height, Math.round(width * 0.72), Math.round(height * 0.12), Math.round(width * 0.22), Math.round(height * 0.76), background);
  const small = Math.max(2, Math.round(2 * unit));
  const medium = Math.max(3, Math.round(3 * unit));
  const large = Math.max(4, Math.round(5 * unit));
  drawText(pixels, width, height, Math.round(72 * unit), Math.round(58 * unit), plan.project.name, small, accent);
  const titleLines = wrapText(scene.title, 30).slice(0, 3);
  titleLines.forEach((line, lineIndex) => drawText(pixels, width, height, Math.round(72 * unit), Math.round((180 + lineIndex * 58) * unit), line, large, white));
  const subtitleLines = wrapText(scene.subtitle, 48).slice(0, 4);
  subtitleLines.forEach((line, lineIndex) => drawText(pixels, width, height, Math.round(76 * unit), Math.round((410 + lineIndex * 36) * unit), line, medium, muted));
  drawText(pixels, width, height, Math.round(width * 0.765), Math.round(height * 0.39), String(index + 1).padStart(2, "0"), large, accent);
  drawText(pixels, width, height, Math.round(width * 0.735), Math.round(height * 0.68), `SCENE ${index + 1} OF ${plan.scenes.length}`, small, white);
  await writeFile(file, Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii"), pixels]));
}

async function writeSceneSvg(file, plan, scene, index) {
  const title = wrapText(scene.title, 30).slice(0, 3);
  const subtitle = wrapText(scene.subtitle, 52).slice(0, 4);
  const titleText = title.map((line, offset) => `<text x="72" y="${210 + offset * 70}" class="title">${escapeXml(line)}</text>`).join("");
  const subtitleText = subtitle.map((line, offset) => `<text x="76" y="${455 + offset * 40}" class="subtitle">${escapeXml(line)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${plan.video.width}" height="${plan.video.height}" viewBox="0 0 1280 720"><style>.label{font:700 18px 'Segoe UI',sans-serif;fill:${plan.video.accentColor}}.title{font:700 56px 'Segoe UI',sans-serif;fill:#f8fafa}.subtitle{font:400 25px 'Segoe UI',sans-serif;fill:#becdd1}.number{font:700 96px 'Segoe UI',sans-serif;fill:${plan.video.accentColor}}</style><rect width="1280" height="720" fill="${plan.video.backgroundColor}"/><rect width="18" height="720" fill="${plan.video.accentColor}"/><rect x="883" width="397" height="720" fill="${plan.video.primaryColor}"/><rect x="922" y="86" width="282" height="548" fill="${plan.video.backgroundColor}"/><text x="72" y="76" class="label">${escapeXml(plan.project.name.toUpperCase())}</text>${titleText}${subtitleText}<text x="979" y="360" class="number">${String(index + 1).padStart(2, "0")}</text><text x="956" y="510" class="label">SCENE ${index + 1} OF ${plan.scenes.length}</text></svg>`;
  await writeFile(file, svg, "utf8");
}

function probeDuration(ffmpeg, file) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const match = String(result.stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Unable to determine audio duration: ${file}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileHash(file, algorithm) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function fileDigest(file) {
  return fileHash(file, "sha256");
}

async function renderVideo(root, options) {
  if (options["approve-render"] !== true) throw new Error("Rendering requires --approve-render after explicit user approval of output creation and executable use");
  const { plan, relative: planRelative, sha256: planSha256 } = await loadPlan(root, options);
  if (voiceProvider(plan.voice) === BROWSER_NARRATION_PROVIDER) throw new Error("Browser preview plans generate interactive HTML; run browser-preview instead of render");
  const { audioDirectory, narrationManifest } = await verifyNarrationSet(root, plan, planSha256);
  await resolveSafeTarget(root, ".skills-orchestrator/tools/project-video", "renderer root");
  const renderer = await locateFfmpeg(root, options.ffmpeg);
  const ffmpeg = renderer.executable;
  const output = await resolveSafeTarget(root, plan.output.file, "video output");
  const sourceDirectory = await resolveSafeTarget(root, "reports/project-video/source", "source output");
  const videoManifest = await resolveSafeTarget(root, "reports/project-video/project-video-manifest.json", "video manifest");
  if ((existsSync(output) || existsSync(sourceDirectory) || existsSync(videoManifest)) && options.force !== true) {
    throw new Error(`Project video output already exists. Use --force only after replacement approval`);
  }
  const cache = await resolveSafeTarget(root, `.skills-orchestrator/cache/project-video/${randomUUID()}`, "render cache");
  const stagedSourceDirectory = path.join(cache, "source");
  const partial = `${output}.${randomUUID()}.partial.mp4`;
  await Promise.all([mkdir(path.dirname(output), { recursive: true }), mkdir(stagedSourceDirectory, { recursive: true }), mkdir(cache, { recursive: true })]);
  const clips = [];
  const audioEvidence = [];
  try {
    for (const [index, scene] of plan.scenes.entries()) {
      const narrationRecord = narrationManifest.scenes.find((item) => item.id === scene.id);
      const audio = narrationRecord ? resolveInside(root, narrationRecord.file, "narration audio") : "";
      if (!narrationRecord || !existsSync(audio) || (await stat(audio)).size < 1024) throw new Error(`Missing complete narration for ${scene.id}`);
      const duration = probeDuration(ffmpeg, audio);
      const ppm = path.join(cache, `${scene.id}.ppm`);
      const svg = path.join(stagedSourceDirectory, `${scene.id}.svg`);
      const clip = path.join(cache, `${scene.id}.mp4`);
      await Promise.all([writeScenePpm(ppm, plan, scene, index), writeSceneSvg(svg, plan, scene, index)]);
      const frames = Math.ceil((duration + 1) * plan.video.fps);
      const filter = `scale=${plan.video.width}:${plan.video.height},zoompan=z='min(zoom+0.00035,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${plan.video.width}x${plan.video.height}:fps=${plan.video.fps},fade=t=in:st=0:d=0.4,format=yuv420p`;
      runChecked(ffmpeg, ["-y", "-loop", "1", "-framerate", String(plan.video.fps), "-i", ppm, "-i", audio, "-vf", filter, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-tune", "stillimage", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", clip]);
      clips.push(clip);
      audioEvidence.push({ id: scene.id, file: narrationRecord.file, durationSeconds: duration, sha256: await fileDigest(audio) });
    }
    const concat = path.join(cache, "clips.txt");
    const concatSource = clips.map((clip) => `file '${clip.replaceAll("'", "'\\''").replaceAll("\\", "/")}'`).join("\n");
    await writeFile(concat, `${concatSource}\n`, "utf8");
    runChecked(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", "-movflags", "+faststart", partial]);
    runChecked(ffmpeg, ["-v", "error", "-i", partial, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"]);
    runChecked(ffmpeg, ["-v", "error", "-i", partial, "-map", "0:a:0", "-t", "0.1", "-f", "null", "-"]);
    if ((await stat(partial)).size < 50 * 1024) throw new Error("Rendered MP4 is unexpectedly small");
    await rm(output, { force: true });
    await rename(partial, output);
    await rm(sourceDirectory, { recursive: true, force: true });
    await rename(stagedSourceDirectory, sourceDirectory);
    const version = runChecked(ffmpeg, ["-version"]).stdout.split(/\r?\n/, 1)[0];
    const audioManifest = {
      codec: "aac",
      provider: narrationManifest.provider,
      voice: plan.voice.name,
      voiceSettingsSha256: narrationManifest.voiceSettingsSha256,
      scenes: audioEvidence
    };
    if (narrationManifest.provider === AZURE_NARRATION_PROVIDER) {
      Object.assign(audioManifest, {
        profile: narrationManifest.voiceSelectionProfile,
        selectionSha256: narrationManifest.voiceSelectionSha256,
        azureDiscoverySha256: narrationManifest.azureDiscoverySha256,
        azureDiscoveryAt: narrationManifest.azureDiscoveryAt,
        style: plan.voice.style,
        styleDegree: plan.voice.styleDegree,
        ratePercent: plan.voice.ratePercent,
        sentencePauseMs: plan.voice.sentencePauseMs
      });
    } else {
      Object.assign(audioManifest, {
        localVoiceInstallSha256: narrationManifest.localVoiceInstallSha256,
        lengthScale: plan.voice.lengthScale,
        sentenceSilenceSeconds: plan.voice.sentenceSilenceSeconds,
        engine: narrationManifest.engine,
        model: narrationManifest.model
      });
    }
    const manifest = {
      schemaVersion: "1.0.0",
      status: "complete",
      renderedAt: new Date().toISOString(),
      projectName: plan.project.name,
      plan: planRelative.replaceAll("\\", "/"),
      planSha256,
      output: plan.output.file,
      sha256: await fileDigest(output),
      bytes: (await stat(output)).size,
      durationSeconds: audioEvidence.reduce((total, item) => total + item.durationSeconds, 0),
      video: { width: plan.video.width, height: plan.video.height, fps: plan.video.fps, codec: "h264" },
      audio: audioManifest,
      renderer: {
        source: renderer.source,
        name: renderer.name,
        packageVersion: renderer.packageVersion,
        ffmpeg: version,
        binarySha256: renderer.binarySha256
      }
    };
    await writeJsonAtomic(videoManifest, manifest);
    console.log(`Rendered ${plan.output.file}`);
    console.log(`sha256:${manifest.sha256}`);
    return 0;
  } finally {
    await rm(partial, { force: true });
    await rm(cache, { recursive: true, force: true });
  }
}

function printHelp() {
  console.log(`Project video helper

Commands:
  inspect [--root PATH] [--output reports/project-video/project-evidence.json]
  discovery-status [--root PATH]
  azure-preflight [--root PATH]
  validate [--root PATH] [--plan reports/project-video/project-video-plan.json]
  ssml [--root PATH] [--plan PATH] [--scene scene-01]
  audition [--root PATH] [--plan PATH] [--scene scene-01] --approve-external [--force]
  select-voice [--root PATH] --profile ava-hd-warm --approve-selection
  narrate [--root PATH] [--plan PATH] (--approve-external | --approve-local) [--force]
  browser-preview [--root PATH] [--plan PATH] [--force]
  install-local-voice [--root PATH] [--python PATH] --accept-download --accept-gpl --accept-model-provenance [--force]
  install-renderer [--root PATH] --accept-download
  render [--root PATH] [--plan PATH] [--ffmpeg PATH] --approve-render [--force]

Pinned local voice: ${PIPER_PACKAGE}@${PIPER_VERSION}, complete dependency lock, ${LOCAL_VOICE_MODEL.id}
Pinned renderer: ${RENDERER_PACKAGE}@${RENDERER_VERSION}`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const requestedRoot = projectRoot(options);
  if (!existsSync(requestedRoot)) throw new Error(`Project root does not exist: ${requestedRoot}`);
  const root = await realpath(requestedRoot);
  if (command === "inspect") return inspectProject(root, options);
  if (command === "discovery-status") return discoveryStatus(root);
  if (command === "azure-preflight") return azurePreflight(root);
  if (command === "validate") {
    const { relative } = await loadPlan(root, options);
    console.log(`Valid project video plan: ${relative}`);
    return 0;
  }
  if (command === "ssml") return previewSsml(root, options);
  if (command === "audition") return auditionVoices(root, options);
  if (command === "select-voice") return selectVoice(root, options);
  if (command === "narrate") return synthesizeNarration(root, options);
  if (command === "browser-preview") return generateBrowserPreview(root, options);
  if (command === "install-local-voice") return installLocalVoice(root, options);
  if (command === "install-renderer") return installRenderer(root, options);
  if (command === "render") return renderVideo(root, options);
  if (command === "help" || command === "--help") {
    printHelp();
    return 0;
  }
  throw new Error(`Unknown command: ${command}`);
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}