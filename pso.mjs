#!/usr/bin/env node
import { appendFile, cp, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const VERSION = "1.0.0";
const FRAMEWORK_VERSION = "9.0.0";
const RISK_ACCEPTANCE_VERSION = "1.0.0";
const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SUPPORTED_NODE_MAJORS = new Set([22, 24, 26]);
const PROFILES = new Set(["core", "durable", "distributed", "advanced"]);
const CONFIGURATION_PATH = path.join("config", "skills-orchestrator.json");
const TEMPLATE_ROOT_RELATIVE = "templates/project";
const SCAFFOLD_MANIFEST_RELATIVE = "templates/scaffold-manifest.json";
const STACK_TAGS = new Set([
  "typescript", "javascript", "csharp", "python", "powershell", "bicep",
  "terraform", "java", "ruby", "php", "go", "rust", "swift", "tests"
]);
const STACK_FILE_MARKERS = new Map([
  ["package.json", ["javascript"]],
  ["tsconfig.json", ["typescript"]],
  ["pyproject.toml", ["python"]],
  ["requirements.txt", ["python"]],
  ["setup.py", ["python"]],
  ["cargo.toml", ["rust"]],
  ["go.mod", ["go"]],
  ["go.work", ["go"]],
  ["pom.xml", ["java"]],
  ["build.gradle", ["java"]],
  ["build.gradle.kts", ["java"]],
  ["settings.gradle", ["java"]],
  ["settings.gradle.kts", ["java"]],
  ["gemfile", ["ruby"]],
  ["composer.json", ["php"]],
  ["package.swift", ["swift"]]
]);
const STACK_EXTENSION_MARKERS = new Map([
  [".ts", ["typescript"]], [".tsx", ["typescript"]],
  [".js", ["javascript"]], [".mjs", ["javascript"]], [".cjs", ["javascript"]],
  [".cs", ["csharp"]], [".csproj", ["csharp"]], [".fsproj", ["csharp"]], [".vbproj", ["csharp"]], [".sln", ["csharp"]],
  [".py", ["python"]],
  [".ps1", ["powershell"]], [".psm1", ["powershell"]], [".psd1", ["powershell"]],
  [".bicep", ["bicep"]], [".bicepparam", ["bicep"]],
  [".tf", ["terraform"]], [".tfvars", ["terraform"]],
  [".java", ["java"]], [".kt", ["java"]],
  [".rb", ["ruby"]],
  [".php", ["php"]],
  [".go", ["go"]],
  [".rs", ["rust"]],
  [".swift", ["swift"]]
]);
const PROJECT_MARKER_FILES = new Set([
  ".git", "project-orchestrator.json", "package.json", "pyproject.toml", "requirements.txt",
  "setup.py", "cargo.toml", "go.mod", "go.work", "pom.xml", "build.gradle", "build.gradle.kts",
  "settings.gradle", "settings.gradle.kts", "gemfile", "composer.json", "package.swift",
  "cmakelists.txt", "makefile", "dockerfile"
]);
const PROJECT_MARKER_SUFFIXES = [".sln", ".csproj", ".fsproj", ".vbproj", ".tf", ".bicep", ".ps1", ".ipynb"];
const SCAN_EXCLUDED_DIRECTORIES = new Set([
  "node_modules", "dist", "bin", "obj", "out", "build", "target", "vendor",
  "venv", "__pycache__", "packages", "coverage", "reports"
]);
const SCAN_MAX_DEPTH = 5;
const SCAN_MAX_ENTRIES = 20000;
const EQUIVALENCE_STOP_WORDS = new Set(["and", "the", "for", "with", "github", "copilot", "file", "files"]);
// Adoption never imports a CI workflow, docs index, or repository instruction file into a project that already has its own.
const ADOPTION_TEMPLATE_EXCLUSIONS = new Set([".github/copilot-instructions.md", "docs/README.md"]);
const DEFAULT_CONFIGURATION = Object.freeze({
  schemaVersion: "1.0.0",
  profile: "core",
  platforms: { agent: "github-copilot", ci: "auto" },
  packs: ["core"],
  routing: { precedence: ["project-domain", "framework"] },
  clarification: {
    enabled: true,
    maxQuestionsPerRound: 3,
    blockOnMaterialAmbiguity: true,
    askEveryPrompt: true,
    questionsPerPrompt: 3,
    confirmPlanBeforeExecution: true
  },
  policy: {
    requireApprovalFor: ["external", "privileged", "destructive", "irreversible", "production-data-mutation", "commit", "push"]
  }
});
const APPROVAL_CLASSES = new Set(["external", "privileged", "destructive", "irreversible", "production-data-mutation", "commit", "push"]);
const MUTATING_ADOPTION_ACTIONS = new Set(["create", "update-skill", "update-skill-references", "update-framework-file", "update-wiring-file", "replace-duplicate"]);
const ADOPTION_REPORT_PATHS = [
  "reports/adoption-plan.json",
  "reports/adoption-plan.md",
  "reports/adoption-verification.json",
  "reports/artifact-ownership.json",
  "reports/skill-details.json",
  "reports/skill-details.md",
  "reports/skill-inventory.json",
  "reports/skill-inventory.md"
];
const LEGACY_SKILL_IDS = new Map([
  ["create-skill", "skill-create"],
  ["plan-audit-remediation", "audit-plan-remediation"],
  ["review-audit-findings", "audit-review-findings"]
]);
const COPILOT_INSTRUCTION = "Use `.github/skills/project-skills-orchestrator/SKILL.md` for project orchestration. Audit existing project state, inventory available skills, plan before execution, preserve repository-owned skills, and stop at approval gates.";
const ORCHESTRATION_ROUTE = ".github/skills/project-skills-orchestrator/SKILL.md";
const CLARIFICATION_PROTOCOL_HEADING = "## Engagement protocol (mandatory, highest precedence)";
const CLARIFICATION_PROTOCOL = `${CLARIFICATION_PROTOCOL_HEADING}

Apply this to every new user prompt, without exception, before any analysis, tool use, file change, or answer.

1. Run \`clarify-the-ask\`.
2. Ask exactly three clarifying questions.
3. Wait for the user's answers. Do not begin work while any question is unanswered.
4. After the third answer, state back the objective, the concrete steps, the files or systems that will be touched, and any risk or irreversible action.
5. Ask the user to confirm, and wait for an explicit instruction to proceed.

- This repeats for every new prompt, including follow-ups later in the same session.
- Ground the three questions in repository evidence; ask about intent, scope, constraints, and acceptance criteria rather than facts the repository already answers.
- Never treat your own plan description as approval.
- Never proceed merely because three questions were asked; unresolved material ambiguity still blocks.
- The only exception is an explicit instruction in the current prompt to skip clarification.`;
const COPILOT_ORCHESTRATION_INSTRUCTION = `## Orchestration

${COPILOT_INSTRUCTION}`;
const AGENT_INSTRUCTION = `## Project Skills Orchestrator

- Read \`${ORCHESTRATION_ROUTE}\` before multi-skill work.
- Treat machine-readable artifacts under \`reports/\` as authoritative.
- Plan and validate before modifying files.
- Require approval for destructive, external, privileged, or irreversible actions.`;
const CLARIFICATION_ANCHOR = "Ask exactly three clarifying questions.";
const COPILOT_INSTRUCTION_BLOCKS = [
  { id: "clarification-protocol", version: 1, content: CLARIFICATION_PROTOCOL, anchor: CLARIFICATION_ANCHOR },
  { id: "orchestration-routing", version: 1, content: COPILOT_ORCHESTRATION_INSTRUCTION, anchor: ORCHESTRATION_ROUTE }
];
const AGENT_INSTRUCTION_BLOCKS = [
  { id: "clarification-protocol", version: 1, content: CLARIFICATION_PROTOCOL, anchor: CLARIFICATION_ANCHOR },
  { id: "agent-orchestration-routing", version: 1, content: AGENT_INSTRUCTION, anchor: ORCHESTRATION_ROUTE }
];
const RISK_ACCEPTANCE_NOTICE = `SECURITY AND RISK ACKNOWLEDGMENT

Skills Orchestrator is designed and tested with the intent to reduce defects, security weaknesses, data loss, and unintended changes. Reasonable efforts and secure engineering practices are used to avoid introducing problems into new or existing projects. However, no software or automated modification process can identify, prevent, or eliminate every possible bug, vulnerability, compatibility issue, configuration error, or other adverse outcome.

Before proceeding, verify the proposed changes, maintain an independent backup, and test the result in a non-production environment. Do not use unverified changes with production code, systems, data, credentials, or deployments.

By proceeding, you acknowledge these limitations, accept the risks associated with running Skills Orchestrator against the selected project, and accept responsibility for reviewing, testing, approving, and operating the resulting changes.`;
let testInterruptionTriggered = false;

function fail(message, code = 1) {
  console.error(`Error: ${message}`);
  process.exitCode = code;
}

function assertSupportedRuntime() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (!SUPPORTED_NODE_MAJORS.has(major)) {
    throw new Error(`Unsupported Node.js ${process.versions.node}. Use a maintained Node.js 22, 24, or 26 release.`);
  }
}

function interruptAfterFirstWriteForTest() {
  if (!testInterruptionTriggered && process.env.NODE_ENV === "test" && process.env.PSO_TEST_INTERRUPT_AFTER_FIRST_WRITE === "1") {
    testInterruptionTriggered = true;
    process.exit(86);
  }
}

function acknowledgeRisk(accepted, method) {
  console.log(`\n${RISK_ACCEPTANCE_NOTICE}\n`);
  if (!accepted) {
    throw new Error("Installation stopped. You must explicitly acknowledge and accept these risks before any project files are changed. Review the notice and rerun with --accept-risk.");
  }
  console.log("Risk acknowledgment accepted. Proceeding with the requested installation.\n");
  return { noticeVersion: RISK_ACCEPTANCE_VERSION, acceptedAt: new Date().toISOString(), method };
}

async function promptRiskAcceptance(terminal) {
  console.log(`\n${RISK_ACCEPTANCE_NOTICE}\n`);
  const response = (await terminal.question('Type "I ACCEPT" to acknowledge the risks and continue: ')).trim();
  if (response !== "I ACCEPT") throw new Error("Installation stopped because risk acceptance was not provided");
  console.log("Risk acknowledgment accepted. Proceeding with the requested installation.\n");
  return { noticeVersion: RISK_ACCEPTANCE_VERSION, acceptedAt: new Date().toISOString(), method: "interactive" };
}

function normalizeName(value) {
  const normalized = value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || normalized.length > 64) {
    throw new Error("Project name must contain 1-64 letters, numbers, spaces, or hyphens");
  }
  return normalized;
}

// Appends only the framework blocks that are absent so project-authored instruction text survives every rerun.
function managedRegionPattern(id) {
  return new RegExp(`<!-- pso:begin id=${id} version=\\d+ -->[\\s\\S]*?<!-- pso:end id=${id} -->`, "g");
}

function wrapManagedRegion(block) {
  return `<!-- pso:begin id=${block.id} version=${block.version} -->\n${block.content}\n<!-- pso:end id=${block.id} -->`;
}

// Replaces the whole markdown section that contains the anchor, so a renamed heading still migrates instead of duplicating.
function replaceSectionContaining(source, anchor, replacement) {
  const index = source.indexOf(anchor);
  if (index === -1) return null;
  const headingIndex = source.lastIndexOf("\n## ", index);
  if (headingIndex === -1 && !source.startsWith("## ")) return null;
  const start = headingIndex === -1 ? 0 : headingIndex + 1;
  const nextIndex = source.indexOf("\n## ", index);
  const end = nextIndex === -1 ? source.length : nextIndex + 1;
  const tail = source.slice(end).trimStart();
  return `${source.slice(0, start)}${replacement}${tail ? `\n\n${tail}` : ""}`;
}

// Idempotence is keyed on the region identifier, so editing the surrounding prose or the block heading never duplicates it.
function mergeInstructionBlocks(current, blocks) {
  let merged = current.trimEnd();
  const conflicts = [];
  const migrations = [];
  for (const block of blocks) {
    const region = wrapManagedRegion(block);
    const existing = merged.match(managedRegionPattern(block.id));
    if (existing) {
      if (existing.length > 1) conflicts.push(`${block.id} appears ${existing.length} times`);
      if (existing[0] !== region) merged = merged.replace(managedRegionPattern(block.id), () => region);
      continue;
    }
    if (merged.includes(block.content)) {
      merged = merged.replace(block.content, () => region);
      migrations.push(block.id);
      continue;
    }
    if (merged.includes(block.anchor)) {
      const replaced = replaceSectionContaining(merged, block.anchor, region);
      if (replaced === null) {
        conflicts.push(`${block.id} exists in a modified form that could not be located for migration`);
        continue;
      }
      merged = replaced.trimEnd();
      migrations.push(block.id);
      continue;
    }
    merged = merged ? `${merged}\n\n${region}` : region;
  }
  return { content: `${merged}\n`, conflicts, migrations };
}

function mergedInstructionContent(current, blocks) {
  return mergeInstructionBlocks(current, blocks).content;
}


function validateGitHubRepository(value) {
  const repository = value?.trim();
  if (!repository) throw new Error("Use --repository with a GitHub repository URL");
  let owner;
  let name;
  const scpMatch = repository.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (scpMatch) {
    [, owner, name] = scpMatch;
  } else {
    let parsed;
    try {
      parsed = new URL(repository);
    } catch {
      throw new Error("Repository must be a GitHub HTTPS or SSH URL");
    }
    if (!["https:", "ssh:"].includes(parsed.protocol) || parsed.hostname.toLowerCase() !== "github.com"
      || parsed.port || parsed.search || parsed.hash || parsed.password
      || (parsed.protocol === "https:" && parsed.username)
      || (parsed.protocol === "ssh:" && parsed.username !== "git")) {
      throw new Error("Repository must be a credential-free GitHub HTTPS or SSH URL");
    }
    const match = parsed.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/);
    if (!match) throw new Error("Repository URL must identify exactly one GitHub owner and repository");
    [, owner, name] = match;
  }
  name = name.replace(/\.git$/i, "");
  if ([owner, name].some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Repository URL contains an invalid owner or repository name");
  }
  return { repository, name };
}

function validateRelativePath(relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Unsafe managed path: ${relative || "empty"}`);
  const segments = relative.replaceAll("\\", "/").split("/");
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.endsWith(".")
    || segment.endsWith(" ") || segment.includes(":") || reserved.test(segment))) {
    throw new Error(`Unsafe managed path: ${relative}`);
  }
  return segments;
}

async function assertSafeManagedPath(root, relative) {
  const segments = validateRelativePath(relative);
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let details;
    try {
      details = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (details.isSymbolicLink()) {
      throw new Error(`Unsafe symbolic link in managed path: ${segments.slice(0, index + 1).join("/")}`);
    }
    if (index < segments.length - 1 && !details.isDirectory()) {
      throw new Error(`Managed path parent is not a directory: ${segments.slice(0, index + 1).join("/")}`);
    }
  }
}

async function assertSafeAdoptionPaths(root, actions = []) {
  const managedRoots = [".github", ".github/skills", ".skills-orchestrator", "config", "schemas", "reports", "project-orchestrator.json"];
  for (const relative of new Set([...managedRoots, ...actions.map((item) => item.path)])) {
    await assertSafeManagedPath(root, relative);
  }
}

async function managedPathState(root, relative) {
  await assertSafeManagedPath(root, relative);
  const target = path.join(root, relative);
  let handle;
  try {
    handle = await open(target, "r");
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
  try {
    const openedDetails = await handle.stat();
    const pathDetails = await lstat(target);
    if (pathDetails.isSymbolicLink() || openedDetails.dev !== pathDetails.dev || openedDetails.ino !== pathDetails.ino) {
      throw new Error(`Managed path changed while opening: ${relative}`);
    }
    if (openedDetails.isFile()) {
      return `file:sha256:${createHash("sha256").update(await handle.readFile()).digest("hex")}`;
    }
    if (openedDetails.isDirectory()) return `directory:sha256:${await directoryHash(target)}`;
    throw new Error(`Unsupported managed path type: ${relative}`);
  } finally {
    await handle.close();
  }
}

function assertManagedTransactionPath(relative) {
  const normalized = relative.replaceAll("\\", "/");
  const allowed = normalized === "project-orchestrator.json"
    || normalized === "AGENTS.md"
    || normalized === ".github/copilot-instructions.md"
    || normalized === ".editorconfig"
    || normalized === ".gitattributes"
    || normalized === ".vscode/extensions.json"
    || normalized === ".vscode/settings.json"
    || normalized === ".vscode/mcp.json"
    || normalized === ".vscode/tasks.json"
    || normalized === ".vscode/launch.json"
    || normalized.startsWith(".github/agents/")
    || normalized.startsWith(".github/instructions/")
    || normalized.startsWith(".github/prompts/")
    || normalized.startsWith(".github/skills/")
    || normalized.startsWith("docs/adr/")
    || normalized.startsWith("config/")
    || normalized.startsWith("schemas/")
    || ADOPTION_REPORT_PATHS.includes(normalized);
  if (!allowed) throw new Error(`Recovery journal targets an unmanaged path: ${relative}`);
}

async function preflightAdoptionRollback(plan, transaction) {
  const seen = new Set();
  for (const entry of transaction.journal.entries) {
    validateRelativePath(entry.path);
    assertManagedTransactionPath(entry.path);
    if (seen.has(entry.path)) throw new Error(`Duplicate recovery journal path: ${entry.path}`);
    seen.add(entry.path);
    await assertSafeManagedPath(plan.projectRoot, entry.path);
    if (entry.originalState === "missing") {
      if (entry.backup !== null) throw new Error(`Unexpected backup for originally missing path: ${entry.path}`);
      continue;
    }
    if (!/^(file|directory):sha256:[a-f0-9]{64}$/.test(entry.originalState) || !entry.backup) {
      throw new Error(`Invalid original state for recovery path: ${entry.path}`);
    }
    validateRelativePath(entry.backup);
    if (!entry.backup.replaceAll("\\", "/").startsWith("backup/")) throw new Error(`Unsafe transaction backup path: ${entry.backup}`);
    await assertSafeManagedPath(transaction.directory, entry.backup);
    const backupState = await managedPathState(transaction.directory, entry.backup);
    if (backupState !== entry.originalState) throw new Error(`Recovery backup integrity check failed: ${entry.path}`);
  }
}

async function writeJsonAtomic(target, value) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function writeTextAtomic(target, content) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function prepareAdoptionTransaction(plan, transactionId, riskAcceptance) {
  const directory = path.join(plan.projectRoot, ".skills-orchestrator", "transactions", transactionId);
  const backupRoot = path.join(directory, "backup");
  await mkdir(backupRoot, { recursive: true });
  const paths = [...new Set([
    ...plan.actions.filter((item) => MUTATING_ADOPTION_ACTIONS.has(item.action)).map((item) => item.path),
    ...ADOPTION_REPORT_PATHS
  ])];
  const entries = [];
  for (const relative of paths) {
    await assertSafeManagedPath(plan.projectRoot, relative);
    const state = await managedPathState(plan.projectRoot, relative);
    const backup = path.join(backupRoot, relative);
    if (state !== "missing") {
      await mkdir(path.dirname(backup), { recursive: true });
      await cp(path.join(plan.projectRoot, relative), backup, { recursive: state.startsWith("directory:") });
    }
    entries.push({ path: relative, originalState: state, backup: state === "missing" ? null : path.relative(directory, backup).replaceAll("\\", "/") });
  }
  const journal = {
    schemaVersion: "1.0.0",
    transactionId,
    status: "prepared",
    projectRoot: plan.projectRoot,
    riskAcceptance,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries
  };
  const journalPath = path.join(directory, "journal.json");
  await writeJsonAtomic(journalPath, journal);
  return { directory, journalPath, journal };
}

async function updateTransaction(transaction, status, details = {}) {
  transaction.journal = { ...transaction.journal, ...details, status, updatedAt: new Date().toISOString() };
  await writeJsonAtomic(transaction.journalPath, transaction.journal);
}

async function removeEmptyParents(root, relative) {
  let current = path.dirname(path.join(root, relative));
  while (current !== root && current.startsWith(`${root}${path.sep}`)) {
    if (path.basename(current) === ".skills-orchestrator") return;
    try {
      await rmdir(current);
    } catch (error) {
      if (["ENOTEMPTY", "EEXIST", "ENOENT"].includes(error.code)) return;
      throw error;
    }
    current = path.dirname(current);
  }
}

async function rollbackAdoptionTransaction(plan, transaction, cause) {
  try {
    await preflightAdoptionRollback(plan, transaction);
    for (const entry of [...transaction.journal.entries].reverse()) {
      const destination = path.join(plan.projectRoot, entry.path);
      await rm(destination, { recursive: true, force: true });
      if (entry.backup) {
        const backup = path.join(transaction.directory, entry.backup);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(backup, destination, { recursive: entry.originalState.startsWith("directory:") });
      } else {
        await removeEmptyParents(plan.projectRoot, entry.path);
      }
    }
    await updateTransaction(transaction, "rolled-back", { failure: cause.message, rolledBackAt: new Date().toISOString() });
  } catch (rollbackError) {
    await updateTransaction(transaction, "recovery-required", { failure: cause.message, rollbackFailure: rollbackError.message });
    throw new Error(`Adoption failed and automatic rollback was incomplete. Preserve ${path.relative(plan.projectRoot, transaction.journalPath)} for recovery. Cause: ${cause.message}; rollback: ${rollbackError.message}`);
  }
}

function processIsAlive(processId) {
  if (!Number.isSafeInteger(processId) || processId <= 0) return true;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function recoverAdoption(projectRoot, requestedTransactionId) {
  const requestedRoot = path.resolve(projectRoot);
  if (!existsSync(requestedRoot)) throw new Error(`Repository path does not exist: ${requestedRoot}`);
  const root = await realpath(requestedRoot);
  await assertSafeAdoptionPaths(root);
  const transactionsRoot = path.join(root, ".skills-orchestrator", "transactions");
  if (!existsSync(transactionsRoot)) throw new Error("No adoption transactions are available for recovery");

  const candidates = [];
  for (const entry of await readdir(transactionsRoot, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unsafe symbolic link in transaction directory: ${entry.name}`);
    if (!entry.isDirectory() || (requestedTransactionId && entry.name !== requestedTransactionId)) continue;
    const journalPath = path.join(transactionsRoot, entry.name, "journal.json");
    if (!existsSync(journalPath)) continue;
    await assertSafeManagedPath(root, path.relative(root, journalPath));
    let journal;
    try {
      journal = JSON.parse(await readFile(journalPath, "utf8"));
    } catch (error) {
      throw new Error(`Invalid recovery journal ${entry.name}: ${error.message}`);
    }
    if (journal.schemaVersion !== "1.0.0" || journal.transactionId !== entry.name || journal.projectRoot !== root
      || !Array.isArray(journal.entries)) {
      throw new Error(`Invalid recovery journal contract: ${entry.name}`);
    }
    for (const item of journal.entries) {
      if (!item || typeof item.path !== "string" || typeof item.originalState !== "string"
        || (item.backup !== null && typeof item.backup !== "string")) {
        throw new Error(`Invalid recovery journal entry: ${entry.name}`);
      }
      validateRelativePath(item.path);
    }
    if (["prepared", "applying", "recovery-required"].includes(journal.status)) {
      candidates.push({ directory: path.dirname(journalPath), journalPath, journal });
    }
  }
  if (!candidates.length) throw new Error(requestedTransactionId
    ? `Transaction is not recoverable: ${requestedTransactionId}`
    : "No interrupted adoption transaction requires recovery");
  candidates.sort((left, right) => right.journal.updatedAt.localeCompare(left.journal.updatedAt));
  const transaction = candidates[0];

  const lockPath = path.join(root, ".skills-orchestrator", "adoption.lock");
  let staleLockPath;
  const claimedLockPath = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, claimedLockPath);
    staleLockPath = claimedLockPath;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (staleLockPath) {
    let lock;
    try {
      lock = JSON.parse(await readFile(staleLockPath, "utf8"));
    } catch (error) {
      await rename(staleLockPath, lockPath);
      throw new Error(`Adoption lock is invalid; inspect it manually before recovery: ${error.message}`);
    }
    if (processIsAlive(lock.processId)) {
      await rename(staleLockPath, lockPath);
      throw new Error(`Adoption process ${lock.processId} may still be active; recovery refused`);
    }
  }
  try {
    await writeFile(lockPath, `${JSON.stringify({ transactionId: transaction.journal.transactionId, processId: process.pid, recovery: true, startedAt: new Date().toISOString() }, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (staleLockPath && existsSync(staleLockPath) && !existsSync(lockPath)) await rename(staleLockPath, lockPath);
    throw error;
  }
  try {
    await rollbackAdoptionTransaction({ projectRoot: root }, transaction, new Error("Interrupted adoption recovered by explicit request"));
  } finally {
    await rm(lockPath, { force: true });
    if (staleLockPath) await rm(staleLockPath, { force: true });
  }
  console.log(`Recovered adoption transaction: ${transaction.journal.transactionId}`);
}

function parseArgs(args) {
  const result = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (["help", "version", "dry-run", "apply", "accept-risk", "force-templates", "force-adopt", "open"].includes(key)) {
      result[key] = true;
      continue;
    }
    const next = args[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    result[key] = next;
    index += 1;
  }
  return result;
}

function rejectUnknownFields(value, allowed, location) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unknown ${location} field: ${unknown.join(", ")}`);
}

function isRecord(value) {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

async function resolveConfiguration(projectRoot, profileOverride) {
  const configurationPath = path.join(projectRoot, CONFIGURATION_PATH);
  let projectConfiguration = {};
  if (existsSync(configurationPath)) {
    try {
      projectConfiguration = JSON.parse(await readFile(configurationPath, "utf8"));
    } catch (error) {
      throw new Error(`Invalid ${CONFIGURATION_PATH}: ${error.message}`);
    }
    if (!isRecord(projectConfiguration)) {
      throw new Error(`Invalid ${CONFIGURATION_PATH}: expected a JSON object`);
    }
    rejectUnknownFields(projectConfiguration, ["schemaVersion", "profile", "platforms", "packs", "routing", "clarification", "policy"], "configuration");
    if (projectConfiguration.schemaVersion !== "1.0.0") {
      throw new Error(`Unsupported configuration schemaVersion: ${projectConfiguration.schemaVersion ?? "missing"}`);
    }
    for (const [key, allowed] of [
      ["platforms", ["agent", "ci"]],
      ["routing", ["precedence"]],
      ["clarification", ["enabled", "maxQuestionsPerRound", "blockOnMaterialAmbiguity", "askEveryPrompt", "questionsPerPrompt", "confirmPlanBeforeExecution"]],
      ["policy", ["requireApprovalFor"]]
    ]) {
      if (projectConfiguration[key] !== undefined) {
        if (!isRecord(projectConfiguration[key])) throw new Error(`Invalid configuration field ${key}: expected an object`);
        rejectUnknownFields(projectConfiguration[key], allowed, key);
      }
    }
  }

  const resolved = {
    ...DEFAULT_CONFIGURATION,
    ...projectConfiguration,
    platforms: { ...DEFAULT_CONFIGURATION.platforms, ...projectConfiguration.platforms },
    routing: { ...DEFAULT_CONFIGURATION.routing, ...projectConfiguration.routing },
    clarification: { ...DEFAULT_CONFIGURATION.clarification, ...projectConfiguration.clarification },
    policy: { ...DEFAULT_CONFIGURATION.policy, ...projectConfiguration.policy },
    profile: profileOverride ?? projectConfiguration.profile ?? DEFAULT_CONFIGURATION.profile
  };
  if (!PROFILES.has(resolved.profile)) throw new Error(`Unsupported profile: ${resolved.profile}`);
  if (!resolved.platforms || !["github-copilot", "agents-md"].includes(resolved.platforms.agent)) {
    throw new Error(`Unsupported agent platform: ${resolved.platforms?.agent ?? "missing"}`);
  }
  if (!["auto", "manual", "github-actions", "azure-devops", "gitlab-ci"].includes(resolved.platforms.ci)) {
    throw new Error(`Unsupported CI platform: ${resolved.platforms.ci ?? "missing"}`);
  }
  if (!Array.isArray(resolved.packs) || resolved.packs.length === 0 || new Set(resolved.packs).size !== resolved.packs.length
    || resolved.packs.some((pack) => !PROFILES.has(pack))) {
    throw new Error("Packs must be an array containing core, durable, distributed, or advanced");
  }
  const precedence = resolved.routing?.precedence;
  if (!Array.isArray(precedence) || precedence.length !== 2 || new Set(precedence).size !== 2
    || precedence.some((route) => !["project-domain", "framework"].includes(route))) {
    throw new Error("Routing precedence must contain project-domain and framework exactly once");
  }
  const clarification = resolved.clarification;
  if (!clarification || typeof clarification.enabled !== "boolean"
    || !Number.isInteger(clarification.maxQuestionsPerRound)
    || clarification.maxQuestionsPerRound < 1 || clarification.maxQuestionsPerRound > 10
    || typeof clarification.blockOnMaterialAmbiguity !== "boolean") {
    throw new Error("clarification must define enabled, maxQuestionsPerRound from 1 to 10, and blockOnMaterialAmbiguity");
  }
  const approvalClasses = resolved.policy?.requireApprovalFor;
  if (!Array.isArray(approvalClasses) || new Set(approvalClasses).size !== approvalClasses.length
    || approvalClasses.some((approvalClass) => !APPROVAL_CLASSES.has(approvalClass))) {
    throw new Error("policy.requireApprovalFor contains an unsupported or duplicate approval class");
  }
  return resolved;
}

async function isMeaningfulProject(root) {
  if (await hasProjectMarker(root)) return true;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const name = entry.name.toLowerCase();
    if (name.startsWith(".") || SCAN_EXCLUDED_DIRECTORIES.has(name)) continue;
    if (await hasProjectMarker(path.join(root, entry.name))) return true;
  }
  return false;
}

async function hasProjectMarker(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries.some((entry) => {
    const name = entry.name.toLowerCase();
    if (PROJECT_MARKER_FILES.has(name)) return true;
    return entry.isFile() && PROJECT_MARKER_SUFFIXES.some((suffix) => name.endsWith(suffix));
  });
}

// Bounded breadth-first scan; large repositories stop at the entry cap rather than walking every file.
async function detectProjectStack(root) {
  const tags = new Set();
  let visited = 0;
  async function scan(directory, depth) {
    if (depth > SCAN_MAX_DEPTH || visited >= SCAN_MAX_ENTRIES) return;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (visited >= SCAN_MAX_ENTRIES) return;
      visited += 1;
      if (entry.isSymbolicLink()) continue;
      const name = entry.name.toLowerCase();
      if (entry.isDirectory()) {
        if (SCAN_EXCLUDED_DIRECTORIES.has(name) || (name.startsWith(".") && name !== ".github")) continue;
        if (name === "test" || name === "tests" || name === "spec") tags.add("tests");
        await scan(path.join(directory, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      for (const tag of STACK_FILE_MARKERS.get(name) ?? []) tags.add(tag);
      for (const tag of STACK_EXTENSION_MARKERS.get(path.extname(name)) ?? []) tags.add(tag);
      if (/\.(test|spec)\./.test(name) || /tests?\.cs$/.test(name)) tags.add("tests");
    }
  }
  await scan(root, 0);
  if (tags.has("typescript")) tags.add("javascript");
  return tags;
}

function parseStackOption(value) {
  const tags = new Set(String(value).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
  const unknown = [...tags].filter((tag) => !STACK_TAGS.has(tag));
  if (unknown.length) throw new Error(`Unknown --stack value: ${unknown.join(", ")}. Supported: ${[...STACK_TAGS].sort().join(", ")}`);
  if (tags.has("typescript")) tags.add("javascript");
  return tags;
}

async function loadScaffoldManifest() {
  await assertSafeManagedPath(SCRIPT_ROOT, SCAFFOLD_MANIFEST_RELATIVE);
  const manifest = JSON.parse(await readFile(path.join(SCRIPT_ROOT, SCAFFOLD_MANIFEST_RELATIVE), "utf8"));
  if (manifest.schemaVersion !== "1.0.0") throw new Error(`Unsupported scaffold manifest version: ${manifest.schemaVersion}`);
  const shipped = new Set(await walkFiles(path.join(SCRIPT_ROOT, TEMPLATE_ROOT_RELATIVE)));
  for (const template of manifest.templates) {
    if (!shipped.has(template.path)) throw new Error(`Scaffold manifest references a missing template: ${template.path}`);
  }
  for (const relative of shipped) {
    if (!manifest.templates.some((template) => template.path === relative)) {
      throw new Error(`Shipped template is not declared in the scaffold manifest: ${relative}`);
    }
  }
  return manifest.templates;
}

function templateApplies(template, stack) {
  return template.requires === "always" || template.requires.some((tag) => stack.has(tag));
}

// Only actions with a verified commit SHA are emitted; every other stack uses tooling preinstalled on GitHub-hosted runners.
const CHECKOUT_ACTION = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const SETUP_NODE_ACTION = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020";
const CI_STACK_STEPS = new Map([
  ["javascript", `      - name: Set up Node.js
        uses: ${SETUP_NODE_ACTION}
        with:
          node-version: 22
      - name: Install dependencies
        run: npm ci
      - name: Test
        run: npm test`],
  ["python", `      - name: Install Python dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
          if [ -f pyproject.toml ]; then pip install .; fi
      - name: Test
        run: python -m pytest`],
  ["csharp", `      - name: Restore
        run: dotnet restore
      - name: Build
        run: dotnet build --no-restore --configuration Release
      - name: Test
        run: dotnet test --no-build --configuration Release`],
  ["java", `      - name: Build and test
        run: |
          if [ -f pom.xml ]; then mvn -B --no-transfer-progress verify; else ./gradlew build; fi`],
  ["go", `      - name: Build
        run: go build ./...
      - name: Test
        run: go test ./...`],
  ["rust", `      - name: Build
        run: cargo build --locked
      - name: Test
        run: cargo test --locked`],
  ["ruby", `      - name: Install dependencies
        run: bundle install
      - name: Test
        run: bundle exec rake`],
  ["php", `      - name: Install dependencies
        run: composer install --no-interaction --prefer-dist
      - name: Test
        run: vendor/bin/phpunit`],
  ["powershell", `      - name: Analyze PowerShell
        shell: pwsh
        run: |
          Install-Module PSScriptAnalyzer -Force -Scope CurrentUser -ErrorAction Stop
          Invoke-ScriptAnalyzer -Path . -Recurse -EnableExit`],
  ["bicep", `      - name: Build Bicep
        run: |
          find . -name '*.bicep' -print0 | xargs -0 -r -n1 az bicep build --file`],
  ["terraform", `      - name: Validate Terraform
        run: |
          terraform fmt -check -recursive
          terraform init -backend=false
          terraform validate`]
]);

// An unconfigured pipeline fails rather than reporting a green check that verified nothing.
const CI_UNCONFIGURED_STEP = `      - name: Configure build and test
        run: |
          echo "No build or test command is configured for this project."
          echo "Edit .github/workflows/ci.yml and replace this step, or rerun setup with --stack."
          exit 1`;

function continuousIntegrationWorkflow(stack) {
  const steps = [...CI_STACK_STEPS.keys()].filter((tag) => stack.has(tag)).map((tag) => CI_STACK_STEPS.get(tag));
  const body = steps.length ? steps.join("\n") : CI_UNCONFIGURED_STEP;
  return `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false
${body}
`;
}

// Dependency installation only. Copilot cloud agent and Copilot code review run these before the agent starts.
// Every step is guarded on its manifest so a governance-only repository does not fail the setup job.
const COPILOT_SETUP_STEPS = new Map([
  ["javascript", `      - name: Set up Node.js
        uses: ${SETUP_NODE_ACTION}
        with:
          node-version: 22
      - name: Install JavaScript dependencies
        run: |
          if [ -f package-lock.json ]; then npm ci; elif [ -f package.json ]; then npm install; fi`],
  ["python", `      - name: Install Python dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
          if [ -f pyproject.toml ]; then pip install -e .; fi`],
  ["csharp", `      - name: Restore .NET dependencies
        run: |
          if find . -name '*.sln' -o -name '*.csproj' | grep -q .; then dotnet restore; fi`],
  ["java", `      - name: Resolve Java dependencies
        run: |
          if [ -f pom.xml ]; then mvn -B --no-transfer-progress dependency:go-offline; elif [ -f gradlew ]; then ./gradlew dependencies; fi`],
  ["go", `      - name: Download Go modules
        run: |
          if [ -f go.mod ]; then go mod download; fi`],
  ["rust", `      - name: Fetch Rust crates
        run: |
          if [ -f Cargo.toml ]; then cargo fetch; fi`],
  ["ruby", `      - name: Install Ruby gems
        run: |
          if [ -f Gemfile ]; then bundle install; fi`],
  ["php", `      - name: Install PHP packages
        run: |
          if [ -f composer.json ]; then composer install --no-interaction --prefer-dist; fi`],
  ["powershell", `      - name: Install PowerShell analyzer
        shell: pwsh
        run: Install-Module PSScriptAnalyzer -Force -Scope CurrentUser -ErrorAction Stop`],
  ["bicep", `      - name: Install the Bicep CLI
        run: az bicep install`],
  ["terraform", `      - name: Initialize Terraform
        run: |
          if ls *.tf >/dev/null 2>&1; then terraform init -backend=false; fi`]
]);

// https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment
function copilotSetupStepsWorkflow(stack) {
  const steps = [...COPILOT_SETUP_STEPS.keys()].filter((tag) => stack.has(tag)).map((tag) => COPILOT_SETUP_STEPS.get(tag));
  if (!steps.length) return null;
  return `name: "Copilot Setup Steps"

# Preinstalls dependencies in the ephemeral environment used by Copilot cloud agent
# and Copilot code review, so the agent does not have to discover them by trial and error.

on:
  workflow_dispatch:
  push:
    paths:
      - .github/workflows/copilot-setup-steps.yml
  pull_request:
    paths:
      - .github/workflows/copilot-setup-steps.yml

jobs:
  # The job name must stay copilot-setup-steps or Copilot will not pick it up.
  copilot-setup-steps:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: ${CHECKOUT_ACTION}
        with:
          persist-credentials: false
${steps.join("\n")}
`;
}

const BASE_EXTENSIONS = ["github.copilot", "github.copilot-chat", "editorconfig.editorconfig"];
const STACK_EXTENSIONS = new Map([
  ["javascript", ["dbaeumer.vscode-eslint"]],
  ["typescript", ["dbaeumer.vscode-eslint"]],
  ["csharp", ["ms-dotnettools.csdevkit", "ms-dotnettools.csharp"]],
  ["python", ["ms-python.python", "ms-python.vscode-pylance"]],
  ["powershell", ["ms-vscode.powershell"]],
  ["bicep", ["ms-azuretools.vscode-bicep"]],
  ["terraform", ["hashicorp.terraform"]],
  ["java", ["vscjava.vscode-java-pack"]],
  ["go", ["golang.go"]],
  ["rust", ["rust-lang.rust-analyzer"]],
  ["ruby", ["shopify.ruby-lsp"]],
  ["php", ["bmewburn.vscode-intelephense-client"]],
  ["swift", ["swiftlang.swift-vscode"]]
]);

function workspaceExtensions(stack) {
  const recommendations = new Set(BASE_EXTENSIONS);
  for (const tag of [...STACK_EXTENSIONS.keys()].filter((item) => stack.has(item))) {
    for (const id of STACK_EXTENSIONS.get(tag)) recommendations.add(id);
  }
  return `${JSON.stringify({ recommendations: [...recommendations] }, null, 2)}\n`;
}

// The first matching language decides the default build and test tasks; infrastructure tags only add validation.
const PRIMARY_LANGUAGE_ORDER = ["csharp", "java", "go", "rust", "python", "typescript", "javascript", "ruby", "php", "swift"];
const STACK_TASKS = new Map([
  ["csharp", { build: "dotnet build", test: "dotnet test" }],
  ["java", { build: "mvn -B --no-transfer-progress compile", test: "mvn -B --no-transfer-progress test" }],
  ["go", { build: "go build ./...", test: "go test ./..." }],
  ["rust", { build: "cargo build", test: "cargo test" }],
  ["python", { build: "python -m compileall -q src", test: "python -m pytest" }],
  ["typescript", { build: "npm run build --if-present", test: "npm test" }],
  ["javascript", { build: "npm run build --if-present", test: "npm test" }],
  ["ruby", { build: "bundle install", test: "bundle exec rake" }],
  ["php", { build: "composer install --no-interaction", test: "vendor/bin/phpunit" }],
  ["swift", { build: "swift build", test: "swift test" }]
]);
const VALIDATION_TASKS = new Map([
  ["bicep", { label: "validate: bicep", command: "az bicep build --file main.bicep" }],
  ["terraform", { label: "validate: terraform", command: "terraform fmt -check -recursive && terraform validate" }],
  ["powershell", { label: "analyze: powershell", command: "Invoke-ScriptAnalyzer -Path . -Recurse -EnableExit" }]
]);

function primaryLanguage(stack) {
  return PRIMARY_LANGUAGE_ORDER.find((tag) => stack.has(tag)) ?? null;
}

function workspaceTasks(stack) {
  const tasks = [];
  const language = primaryLanguage(stack);
  if (language) {
    const commands = STACK_TASKS.get(language);
    tasks.push({
      label: "build",
      type: "shell",
      command: commands.build,
      group: { kind: "build", isDefault: true },
      problemMatcher: []
    });
    tasks.push({
      label: "test",
      type: "shell",
      command: commands.test,
      group: { kind: "test", isDefault: true },
      problemMatcher: []
    });
  }
  for (const tag of [...VALIDATION_TASKS.keys()].filter((item) => stack.has(item))) {
    const validation = VALIDATION_TASKS.get(tag);
    tasks.push({
      label: validation.label,
      type: "shell",
      command: validation.command,
      ...(tag === "powershell" ? { options: { shell: { executable: "pwsh", args: ["-NoProfile", "-Command"] } } } : {}),
      problemMatcher: []
    });
  }
  return tasks.length ? `${JSON.stringify({ version: "2.0.0", tasks }, null, 2)}\n` : null;
}

// Configurations that need an entry point carry an obvious placeholder rather than a guess.
const STACK_LAUNCH = new Map([
  ["python", () => ({ name: "Debug current Python file", type: "debugpy", request: "launch", program: "${file}", console: "integratedTerminal" })],
  ["go", () => ({ name: "Debug Go package", type: "go", request: "launch", mode: "auto", program: "${workspaceFolder}" })],
  ["powershell", () => ({ name: "Debug current PowerShell file", type: "PowerShell", request: "launch", script: "${file}" })],
  ["php", () => ({ name: "Listen for Xdebug", type: "php", request: "launch", port: 9003 })],
  ["csharp", () => ({ name: "Debug .NET app", type: "coreclr", request: "launch", preLaunchTask: "build", program: "${workspaceFolder}/src/REPLACE_WITH_PROJECT/bin/Debug/REPLACE_WITH_TARGET_FRAMEWORK/REPLACE_WITH_ASSEMBLY.dll", cwd: "${workspaceFolder}", console: "integratedTerminal" })],
  ["typescript", () => ({ name: "Debug Node entry point", type: "node", request: "launch", program: "${workspaceFolder}/src/REPLACE_WITH_ENTRY_POINT", skipFiles: ["<node_internals>/**"] })],
  ["javascript", () => ({ name: "Debug Node entry point", type: "node", request: "launch", program: "${workspaceFolder}/src/REPLACE_WITH_ENTRY_POINT", skipFiles: ["<node_internals>/**"] })],
  ["java", () => ({ name: "Debug Java main class", type: "java", request: "launch", mainClass: "REPLACE_WITH_MAIN_CLASS" })],
  ["rust", () => ({ name: "Debug Rust binary", type: "lldb", request: "launch", preLaunchTask: "build", program: "${workspaceFolder}/target/debug/REPLACE_WITH_BINARY", args: [], cwd: "${workspaceFolder}" })]
]);

function workspaceLaunch(stack) {
  const configurations = [...STACK_LAUNCH.keys()]
    .filter((tag) => stack.has(tag))
    .map((tag) => STACK_LAUNCH.get(tag)());
  const unique = configurations.filter((item, index) => configurations.findIndex((candidate) => candidate.name === item.name) === index);
  return unique.length ? `${JSON.stringify({ version: "0.2.0", configurations: unique }, null, 2)}\n` : null;
}

// Only settings that current VS Code documents as gating customization discovery are written.
const WORKSPACE_SETTINGS = Object.freeze({
  "files.trimTrailingWhitespace": true,
  "editor.formatOnSave": true,
  "chat.useAgentsMdFile": true,
  "chat.includeApplyingInstructions": true,
  "chat.includeReferencedInstructions": true,
  "chat.promptFilesRecommendations": true
});

function workspaceSettings() {
  return `${JSON.stringify(WORKSPACE_SETTINGS, null, 2)}\n`;
}

// VS Code ships a .cmd launcher on Windows, which Node refuses to spawn without a shell, so the real executable is resolved instead.
async function resolveEditorExecutable() {
  const directories = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const candidates = process.platform === "win32"
    ? [["code.cmd", "Code.exe"], ["code-insiders.cmd", "Code - Insiders.exe"]]
    : [["code", null], ["code-insiders", null]];
  for (const [launcher, windowsExecutable] of candidates) {
    for (const directory of directories) {
      const launcherPath = path.join(directory, launcher);
      if (!existsSync(launcherPath)) continue;
      if (!windowsExecutable) {
        const details = await lstat(launcherPath).catch(() => null);
        if (details?.isFile()) return launcherPath;
        continue;
      }
      const executable = path.normalize(path.join(path.dirname(launcherPath), "..", windowsExecutable));
      if (existsSync(executable)) return executable;
    }
  }
  return null;
}

async function openInEditor(targets) {
  if (process.env.PSO_SUPPRESS_EDITOR_LAUNCH === "1") {
    return { opened: false, reason: "Editor launch suppressed by PSO_SUPPRESS_EDITOR_LAUNCH" };
  }
  const executable = await resolveEditorExecutable();
  if (!executable) return { opened: false, reason: "The Visual Studio Code command line was not found on PATH" };
  try {
    const child = spawn(executable, targets, { detached: true, stdio: "ignore" });
    child.unref();
    return { opened: true, executable };
  } catch (error) {
    return { opened: false, reason: error.message };
  }
}

function significantTokens(value) {
  return new Set(String(value).toLowerCase().split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !EQUIVALENCE_STOP_WORDS.has(token)));
}

function globSet(value) {
  return new Set(String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean));
}

// Reads project-authored customization assets so adoption can report existing coverage instead of installing a second copy.
async function discoverCustomizationAssets(root) {
  const assets = [];
  const sources = [
    ["scoped-instructions", path.join(root, ".github", "instructions"), /\.instructions\.md$/],
    ["prompt", path.join(root, ".github", "prompts"), /\.prompt\.md$/],
    ["agent", path.join(root, ".github", "agents"), /\.agent\.md$/]
  ];
  for (const [kind, directory, pattern] of sources) {
    if (!existsSync(directory)) continue;
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !pattern.test(entry.name)) continue;
      const relative = path.relative(root, path.join(directory, entry.name)).replaceAll("\\", "/");
      await assertSafeManagedPath(root, relative);
      const source = await readFile(path.join(directory, entry.name), "utf8").catch(() => "");
      const details = metadata(source);
      assets.push({
        kind,
        path: relative,
        applyTo: globSet(details.applyTo),
        tokens: new Set([...significantTokens(entry.name.replace(pattern, "")), ...significantTokens(details.description ?? "")])
      });
    }
  }
  return assets;
}

function findEquivalentAsset(template, assets) {
  const templateTokens = significantTokens(template.purpose);
  const templateGlobs = globSet(template.applyTo);
  for (const asset of assets) {
    if (asset.kind !== template.kind) continue;
    if (asset.path === template.path) continue;
    const sharedTokens = [...templateTokens].filter((token) => asset.tokens.has(token)).length;
    if (template.kind === "scoped-instructions") {
      const sharedGlobs = [...templateGlobs].some((glob) => asset.applyTo.has(glob));
      if (sharedGlobs && sharedTokens >= 1) return asset;
      continue;
    }
    if (sharedTokens >= 2) return asset;
  }
  return null;
}

async function ensureEmptyTarget(root) {
  if (!existsSync(root)) return;
  const details = await lstat(root);
  if (details.isSymbolicLink()) throw new Error(`Target cannot be a symbolic link: ${root}`);
  if (details.isFile()) throw new Error(`Target is a file: ${root}`);
  if (!details.isDirectory()) throw new Error(`Target is not a directory: ${root}`);
  if ((await readdir(root)).length > 0) throw new Error(`Target exists and is not empty: ${root}`);
}

async function createProject({ name: enteredName, destination, profile = "core", stack = "", open = false, riskAcceptance }) {
  if (!riskAcceptance) throw new Error("Risk acceptance is required before project creation");
  if (!PROFILES.has(profile)) throw new Error(`Unsupported profile: ${profile}`);
  const declaredStack = stack ? parseStackOption(stack) : new Set();
  const displayName = enteredName.trim();
  const name = normalizeName(displayName);
  const parent = await realpath(path.resolve(destination));
  const root = path.join(parent, name);
  await ensureEmptyTarget(root);
  for (const relative of [".github/skills", "schemas", "config/profiles.yaml", TEMPLATE_ROOT_RELATIVE]) {
    await assertSafeManagedPath(SCRIPT_ROOT, relative);
  }
  await walkFiles(path.join(SCRIPT_ROOT, ".github", "skills"));
  await walkFiles(path.join(SCRIPT_ROOT, "schemas"));
  const scaffoldTemplates = await loadScaffoldManifest();

  const staging = path.join(parent, `.pso-${name}-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  try {
    const directories = [".github", ".vscode", "config", "schemas", "reports", "src", "tests", "docs"];
    await Promise.all(directories.map((directory) => mkdir(path.join(staging, directory), { recursive: true })));
    await cp(path.join(SCRIPT_ROOT, ".github", "skills"), path.join(staging, ".github", "skills"), { recursive: true });
    await cp(path.join(SCRIPT_ROOT, "schemas"), path.join(staging, "schemas"), { recursive: true });
    await cp(path.join(SCRIPT_ROOT, "config", "profiles.yaml"), path.join(staging, "config", "profiles.yaml"));
    const installedTemplates = scaffoldTemplates.filter((template) => templateApplies(template, declaredStack));
    for (const template of installedTemplates) {
      const target = path.join(staging, template.path);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(SCRIPT_ROOT, TEMPLATE_ROOT_RELATIVE, template.path), target, { errorOnExist: true });
    }

    const workspace = {
      folders: [{ path: "." }],
      settings: { "editor.formatOnSave": true, "files.exclude": { "**/dist": true } }
    };
    const manifest = {
      schemaVersion: "1.0.0",
      projectName: name,
      displayName,
      frameworkVersion: FRAMEWORK_VERSION,
      runtimeVersion: VERSION,
      conformanceProfile: profile,
      declaredStack: [...declaredStack].sort(),
      riskAcceptance,
      createdAt: new Date().toISOString(),
      status: "initialized",
      nextAction: "Run development-environment-readiness before the first implementation objective"
    };
    const files = new Map([
      ["README.md", `# ${displayName}\n\nProvisioned with Project Skills Orchestrator ${VERSION} using the ${profile} profile${declaredStack.size ? ` for the ${[...declaredStack].sort().join(", ")} stack` : ""}.\n\n## What this repository currently contains\n\nThis is a governed development baseline: agent instructions, scoped standards, reusable prompts, specialist agents, the skill catalog, editor configuration, and a continuous-integration workflow. **It does not yet contain application code.** Add your application under \`src/\` and its tests under \`tests/\`.\n\n## First steps\n\n1. Open \`${name}.code-workspace\` in Visual Studio Code.\n2. Select **Yes, I trust the authors** when Visual Studio Code asks about workspace trust. Tasks, debugging, and MCP servers stay disabled until you do.\n3. Select **Install** when Visual Studio Code offers the recommended extensions.\n4. Read \`.github/copilot-instructions.md\`. Every agent prompt in this project begins with the mandatory clarification protocol defined there.\n5. Open GitHub Copilot Chat in Agent mode and run \`/development-environment-readiness\` to validate tools, runtimes, authentication, debugging, and security gates.\n\nThe agent customization layer needs no configuration. Visual Studio Code discovers it automatically:\n\n| Location | What it provides |\n| --- | --- |\n| \`.github/copilot-instructions.md\` and \`AGENTS.md\` | Always-on project instructions |\n| \`.github/instructions/\` | Standards applied by file pattern |\n| \`.github/prompts/\` | Slash commands such as \`/create-adr\` and \`/security-review\` |\n| \`.github/agents/\` | Specialist agents in the agent picker |\n| \`.github/skills/\` | The governed skill catalog |\n\n${declaredStack.size ? "## Build, test, and debug\n\n`Ctrl+Shift+B` runs the build task and the Test Explorer runs the test task, both defined in `.vscode/tasks.json`. Debug configurations are in `.vscode/launch.json`; any value containing `REPLACE_WITH_` is a placeholder that needs your entry point before `F5` will work.\n\nThe continuous-integration workflow runs real build and test commands for the declared stack. Confirm they match this project before relying on the result.\n\n## Copilot cloud agent\n\n`.github/workflows/copilot-setup-steps.yml` preinstalls this project's dependencies in the ephemeral environment used by Copilot cloud agent and Copilot code review, so the agent can build and test instead of guessing at dependencies. It only takes effect once it is on the default branch." : "## Build, test, and debug\n\nNo stack was declared, so no build task, debug configuration, Copilot setup steps, or continuous-integration command was generated. The pipeline in `.github/workflows/ci.yml` fails until you configure one. That is deliberate: a pipeline that passes without testing anything is worse than no pipeline.\n\nRerun setup with `--stack` to generate tasks, debug configurations, Copilot cloud agent setup steps, and real CI commands."}\n`],
      ["AGENTS.md", mergedInstructionContent("# Project Agent Instructions", AGENT_INSTRUCTION_BLOCKS)],
      [".gitignore", "dist/\nnode_modules/\n.env\n.skills-orchestrator/\n"],
      [".github/workflows/ci.yml", continuousIntegrationWorkflow(declaredStack)],
      [".vscode/extensions.json", workspaceExtensions(declaredStack)],
      [".vscode/settings.json", workspaceSettings()],
      [`${name}.code-workspace`, `${JSON.stringify(workspace, null, 2)}\n`],
      ["project-orchestrator.json", `${JSON.stringify(manifest, null, 2)}\n`],
      [CONFIGURATION_PATH, `${JSON.stringify({ ...DEFAULT_CONFIGURATION, profile }, null, 2)}\n`],
      ["config/orchestrator.yaml", `frameworkVersion: ${FRAMEWORK_VERSION}\nruntimeVersion: ${VERSION}\nprofile: ${profile}\npaths:\n  skills: .github/skills\n  reports: reports\n  schemas: schemas\nruntime:\n  eventStream: reports/execution-log.jsonl\n  stateSnapshot: reports/current-execution-state.json\n  appendOnly: true\nproject:\n  name: ${name}\n  initialized: true\n`],
      ["reports/.gitkeep", ""],
      ["src/.gitkeep", ""],
      ["tests/.gitkeep", ""]
    ]);
    const workspaceTaskContent = workspaceTasks(declaredStack);
    if (workspaceTaskContent) files.set(".vscode/tasks.json", workspaceTaskContent);
    const workspaceLaunchContent = workspaceLaunch(declaredStack);
    if (workspaceLaunchContent) files.set(".vscode/launch.json", workspaceLaunchContent);
    const copilotSetupContent = copilotSetupStepsWorkflow(declaredStack);
    if (copilotSetupContent) files.set(".github/workflows/copilot-setup-steps.yml", copilotSetupContent);
    for (const [relative, content] of files) {
      const target = path.join(staging, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, { encoding: "utf8", flag: "wx" });
    }
    await inventory(staging);
    await verifyInstallation({ projectRoot: staging, profile }, "installation-verification.json");
    await publishStagedProject(staging, root);
  } catch (error) {
    throw new Error(`Project creation stopped. Staging path preserved for recovery: ${staging}\n${error.message}`);
  }
  const workspace = path.join(root, `${name}.code-workspace`);
  const launch = open ? await openInEditor([workspace, path.join(root, "README.md")]) : null;
  return { name, root, workspace, profile, launch };
}

async function sameFile(left, right) {
  if (!existsSync(left) || !existsSync(right)) return false;
  return (await readFile(left)).equals(await readFile(right));
}

async function walkFiles(root, relative = "") {
  const current = path.join(root, relative);
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in managed package assets: ${child.replaceAll("\\", "/")}`);
    if (entry.isDirectory()) files.push(...await walkFiles(root, child));
    else if (entry.isFile()) files.push(child.replaceAll("\\", "/"));
    else throw new Error(`Unsupported managed package asset: ${child.replaceAll("\\", "/")}`);
  }
  return files;
}

async function directoryHash(root) {
  const hash = createHash("sha256");
  const files = (await walkFiles(root)).sort();
  for (const relative of files) {
    hash.update(relative);
    hash.update("\0");
    hash.update(await readFile(path.join(root, relative)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function metadata(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data = {};
  if (!match) return data;
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const separator = lines[index].indexOf(":");
    if (separator <= 0) continue;
    const key = lines[index].slice(0, separator).trim();
    const value = lines[index].slice(separator + 1).trim();
    if (value === ">" || value === ">-" || value === "|" || value === "|-") {
      const continuation = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        continuation.push(lines[index + 1].trim());
        index += 1;
      }
      data[key] = continuation.join(value.startsWith(">") ? " " : "\n");
    } else {
      data[key] = value.replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return data;
}

function sectionItems(source, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingMatch = new RegExp(`^## ${escaped}\\s*$`, "m").exec(source);
  if (!headingMatch) return [];
  const contentStart = headingMatch.index + headingMatch[0].length;
  const remainder = source.slice(contentStart);
  const nextHeading = /^## /m.exec(remainder);
  const content = nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
  return [...content.matchAll(/^\s*-\s+`?([^`\r\n]+?)`?\s*$/gm)]
    .map((item) => item[1].trim())
    .filter((item) => item.toLowerCase() !== "none" && !item.toLowerCase().startsWith("no dedicated"));
}

async function discoverSkills(root) {
  const skillsRoot = path.join(root, ".github", "skills");
  if (!existsSync(skillsRoot)) return [];
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const directoryPath = path.join(skillsRoot, entry.name);
    const skillFile = path.join(directoryPath, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    await assertSafeManagedPath(root, path.relative(root, skillFile));
    const source = await readFile(skillFile, "utf8");
    const details = metadata(source);
    skills.push({
      directory: entry.name,
      directoryPath,
      file: skillFile,
      name: details.name || entry.name,
      description: details.description || "",
      source,
      hash: await directoryHash(directoryPath)
    });
  }
  return skills;
}

async function buildAdoptionPlan(projectRoot, profileOverride, projectNameOverride, { forceTemplates = false, forceAdopt = false } = {}) {
  const requestedRoot = path.resolve(projectRoot);
  if (!existsSync(requestedRoot)) throw new Error(`Repository path does not exist: ${requestedRoot}`);
  const root = await realpath(requestedRoot);
  if (!(await stat(root)).isDirectory()) throw new Error(`Repository path is not a directory: ${root}`);
  if (!forceAdopt && !(await isMeaningfulProject(root))) {
    throw new Error(`No recognizable project marker was found at ${root}. Confirm this is the intended repository and rerun with --force-adopt to proceed anyway.`);
  }
  await assertSafeAdoptionPaths(root);
  const resolvedConfiguration = await resolveConfiguration(root, profileOverride);
  const profile = resolvedConfiguration.profile;
  const projectName = projectNameOverride ?? path.basename(root);

  const actions = [];
  const frameworkSkills = await discoverSkills(SCRIPT_ROOT);
  const projectSkills = await discoverSkills(root);
  const projectSkillsByName = new Map();
  for (const skill of projectSkills) {
    const matches = projectSkillsByName.get(skill.name) ?? [];
    matches.push(skill);
    projectSkillsByName.set(skill.name, matches);
  }
  for (const frameworkSkill of frameworkSkills) {
    const destination = path.join(root, ".github", "skills", frameworkSkill.directory);
    const projectRelative = path.relative(root, destination).replaceAll("\\", "/");
    const legacyNames = [...LEGACY_SKILL_IDS.entries()]
      .filter(([, replacement]) => replacement === frameworkSkill.name)
      .map(([legacy]) => legacy);
    const matches = [
      ...(projectSkillsByName.get(frameworkSkill.name) ?? []),
      ...legacyNames.flatMap((legacy) => projectSkillsByName.get(legacy) ?? [])
    ];
    const canonical = matches.find((skill) => path.resolve(skill.directoryPath) === path.resolve(destination));
    if (canonical?.hash === frameworkSkill.hash) {
      actions.push({ action: "already-current", kind: "skill", path: projectRelative });
    } else if (canonical || matches.length > 0 || existsSync(destination)) {
      actions.push({
        action: "update-skill",
        kind: "skill",
        path: projectRelative,
        source: frameworkSkill.directoryPath,
        reason: `Replace the existing ${frameworkSkill.name} contract with the current framework contract`
      });
    } else {
      actions.push({ action: "create", kind: "skill", path: projectRelative, source: frameworkSkill.directoryPath });
    }
    for (const duplicate of matches.filter((skill) => skill !== canonical && path.resolve(skill.directoryPath) !== path.resolve(destination))) {
      actions.push({
        action: "replace-duplicate",
        kind: "skill",
        path: path.relative(root, path.dirname(duplicate.file)).replaceAll("\\", "/"),
        canonicalPath: projectRelative,
        reason: LEGACY_SKILL_IDS.get(duplicate.name) === frameworkSkill.name
          ? `Migrate legacy skill ID ${duplicate.name} to ${frameworkSkill.name}`
          : `Duplicate skill identity: ${frameworkSkill.name}`
      });
    }
  }
  const frameworkNames = new Set(frameworkSkills.map((skill) => skill.name));
  for (const projectSkill of projectSkills) {
    if (frameworkNames.has(projectSkill.name) || LEGACY_SKILL_IDS.has(projectSkill.name)) continue;
    let migratedSource = projectSkill.source;
    const migrations = [];
    for (const [legacyName, replacement] of LEGACY_SKILL_IDS) {
      if (!migratedSource.includes(legacyName)) continue;
      migratedSource = migratedSource.replaceAll(legacyName, replacement);
      migrations.push({ from: legacyName, to: replacement });
    }
    if (migrations.length) {
      actions.push({
        action: "update-skill-references",
        kind: "skill-reference",
        path: path.relative(root, projectSkill.file).replaceAll("\\", "/"),
        migrations,
        reason: `Migrate framework skill references: ${migrations.map((migration) => `${migration.from} -> ${migration.to}`).join(", ")}`
      });
    }
  }

  for (const relative of await walkFiles(path.join(SCRIPT_ROOT, "schemas"))) {
    const source = path.join(SCRIPT_ROOT, "schemas", relative);
    const destination = path.join(root, "schemas", relative);
    const projectRelative = path.relative(root, destination).replaceAll("\\", "/");
    if (!existsSync(destination)) actions.push({ action: "create", kind: "schema", path: projectRelative, source });
    else if (await sameFile(source, destination)) actions.push({ action: "already-current", kind: "schema", path: projectRelative });
    else actions.push({ action: "update-framework-file", kind: "schema", path: projectRelative, source, reason: "Synchronize the installed framework schema" });
  }

  const standaloneFiles = [
    {
      path: "config/profiles.yaml",
      source: path.join(SCRIPT_ROOT, "config", "profiles.yaml"),
      kind: "configuration"
    }
  ];
  for (const item of standaloneFiles) {
    const destination = path.join(root, item.path);
    if (!existsSync(destination)) actions.push({ action: "create", ...item });
    else if (await sameFile(item.source, destination)) actions.push({ action: "already-current", ...item });
    else actions.push({ action: "update-framework-file", ...item, reason: "Synchronize the installed framework configuration" });
  }

  const scaffoldTemplates = await loadScaffoldManifest();
  const detectedStack = await detectProjectStack(root);
  const customizationAssets = await discoverCustomizationAssets(root);
  for (const template of scaffoldTemplates) {
    if (template.createOnly || ADOPTION_TEMPLATE_EXCLUSIONS.has(template.path)) continue;
    const destination = path.join(root, template.path);
    const projectRelative = path.relative(root, destination).replaceAll("\\", "/");
    if (existsSync(destination)) {
      actions.push({ action: "already-current", kind: "scaffold", path: projectRelative });
      continue;
    }
    if (!templateApplies(template, detectedStack)) {
      actions.push({
        action: "skipped",
        kind: "scaffold",
        path: projectRelative,
        reason: `No detected stack matches ${template.requires.join(", ")}`
      });
      continue;
    }
    const equivalent = template.mandatory || forceTemplates ? null : findEquivalentAsset(template, customizationAssets);
    if (equivalent) {
      actions.push({
        action: "covered",
        kind: "scaffold",
        path: projectRelative,
        coveredBy: equivalent.path,
        reason: `Existing ${template.kind} already covers ${template.purpose}; use --force-templates to install anyway`
      });
      continue;
    }
    actions.push({
      action: "create",
      kind: "scaffold",
      path: projectRelative,
      source: path.join(SCRIPT_ROOT, TEMPLATE_ROOT_RELATIVE, template.path)
    });
  }

  const manifestPath = path.join(root, "project-orchestrator.json");
  let existingManifest = {};
  const now = new Date().toISOString();
  if (existsSync(manifestPath)) {
    try {
      existingManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
      actions.push({ action: "conflict", kind: "manifest", path: "project-orchestrator.json", reason: `Existing manifest is invalid JSON: ${error.message}` });
    }
  }
  const manifestFields = {
    ...existingManifest,
    schemaVersion: "1.0.0",
    projectName: existingManifest.projectName || projectName,
    frameworkVersion: FRAMEWORK_VERSION,
    runtimeVersion: VERSION,
    conformanceProfile: profile,
    resolvedConfiguration,
    adoptedAt: existingManifest.adoptedAt || now,
    status: "adopted",
    nextAction: "Run development-environment-readiness before the next implementation objective"
  };
  const manifestChanged = Object.entries(manifestFields)
    .some(([key, value]) => key !== "updatedAt" && JSON.stringify(existingManifest[key]) !== JSON.stringify(value));
  const manifest = {
    ...manifestFields,
    updatedAt: manifestChanged ? now : existingManifest.updatedAt || existingManifest.adoptedAt || now
  };
  const orchestratorContent = `frameworkVersion: ${FRAMEWORK_VERSION}\nruntimeVersion: ${VERSION}\nprofile: ${profile}\npaths:\n  skills: .github/skills\n  reports: reports\n  schemas: schemas\nruntime:\n  eventStream: reports/execution-log.jsonl\n  stateSnapshot: reports/current-execution-state.json\n  appendOnly: true\nproject:\n  name: ${projectName}\n  adopted: true\n`;
  const instructionPath = path.join(root, ".github", "copilot-instructions.md");
  const currentInstructions = existsSync(instructionPath) ? await readFile(instructionPath, "utf8") : "";
  const mergedInstructions = mergeInstructionBlocks(currentInstructions, COPILOT_INSTRUCTION_BLOCKS);
  const instructionContent = mergedInstructions.content;
  const agentPath = path.join(root, "AGENTS.md");
  const currentAgentInstructions = existsSync(agentPath) ? await readFile(agentPath, "utf8") : "";
  const mergedAgentInstructions = mergeInstructionBlocks(currentAgentInstructions, AGENT_INSTRUCTION_BLOCKS);
  const agentContent = mergedAgentInstructions.content;
  for (const [relative, merge] of [[".github/copilot-instructions.md", mergedInstructions], ["AGENTS.md", mergedAgentInstructions]]) {
    for (const reason of merge.conflicts) {
      actions.push({ action: "conflict", kind: "instructions", path: relative, reason });
    }
  }
  const generated = [
    {
      path: "project-orchestrator.json",
      kind: "manifest",
      content: `${JSON.stringify(manifest, null, 2)}\n`
    },
    {
      path: "config/orchestrator.yaml",
      kind: "configuration",
      content: orchestratorContent
    },
    {
      path: CONFIGURATION_PATH.replaceAll("\\", "/"),
      kind: "configuration",
      content: `${JSON.stringify(resolvedConfiguration, null, 2)}\n`,
      preserveExisting: true
    },
    {
      path: ".github/copilot-instructions.md",
      kind: "instructions",
      content: instructionContent
    },
    {
      path: "AGENTS.md",
      kind: "instructions",
      content: agentContent
    },
    {
      path: ".vscode/extensions.json",
      kind: "workspace-support",
      content: workspaceExtensions(detectedStack),
      preserveExisting: true
    },
    {
      path: ".vscode/settings.json",
      kind: "workspace-support",
      content: workspaceSettings(),
      preserveExisting: true
    }
  ];
  const detectedTaskContent = workspaceTasks(detectedStack);
  if (detectedTaskContent) {
    generated.push({ path: ".vscode/tasks.json", kind: "workspace-support", content: detectedTaskContent, preserveExisting: true });
  }
  const detectedLaunchContent = workspaceLaunch(detectedStack);
  if (detectedLaunchContent) {
    generated.push({ path: ".vscode/launch.json", kind: "workspace-support", content: detectedLaunchContent, preserveExisting: true });
  }
  for (const item of generated) {
    const destination = path.join(root, item.path);
    if (!existsSync(destination)) actions.push({ action: "create", ...item });
    else if (item.preserveExisting) {
      actions.push({ action: "already-current", ...item });
    } else {
      const current = await readFile(destination, "utf8");
      actions.push(current === item.content
        ? { action: "already-current", ...item }
        : { action: "update-wiring-file", ...item, reason: "Synchronize required project orchestration wiring while preserving a backup" });
    }
  }

  const counts = Object.fromEntries(
    ["create", "update-skill", "update-skill-references", "update-framework-file", "update-wiring-file", "replace-duplicate", "already-current", "skipped", "covered", "conflict"]
      .map((action) => [action, actions.filter((item) => item.action === action).length])
  );
  await assertSafeAdoptionPaths(root, actions);
  for (const action of actions.filter((item) => MUTATING_ADOPTION_ACTIONS.has(item.action))) {
    action.expectedDestinationState = await managedPathState(root, action.path);
  }
  return {
    schemaVersion: "1.0.0",
    runtimeVersion: VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot: root,
    projectName,
    profile,
    resolvedConfiguration,
    mode: "existing-project-adoption",
    detectedStack: [...detectedStack].sort(),
    actions,
    counts,
    canApply: counts.conflict === 0
  };
}

function printAdoptionPlan(plan) {
  console.log(`\nExisting project: ${plan.projectRoot}`);
  console.log(`Profile: ${plan.profile}`);
  console.log(`Detected stack: ${plan.detectedStack.length ? plan.detectedStack.join(", ") : "none detected"}`);
  console.log(`Files to create: ${plan.counts.create}`);
  console.log(`Existing skills to update: ${plan.counts["update-skill"]}`);
  console.log(`Project skill references to migrate: ${plan.counts["update-skill-references"]}`);
  console.log(`Framework files to update: ${plan.counts["update-framework-file"]}`);
  console.log(`Wiring files to update: ${plan.counts["update-wiring-file"]}`);
  console.log(`Duplicate skills to replace: ${plan.counts["replace-duplicate"]}`);
  console.log(`Templates skipped as not applicable: ${plan.counts.skipped}`);
  console.log(`Templates covered by existing files: ${plan.counts.covered}`);
  console.log(`Already current: ${plan.counts["already-current"]}`);
  console.log(`Blocking conflicts: ${plan.counts.conflict}`);
  for (const item of plan.actions.filter((action) => action.action === "covered")) {
    console.log(`  covered: ${item.path} by ${item.coveredBy}`);
  }
  if (plan.counts.conflict) {
    console.log("\nConflicts:");
    for (const item of plan.actions.filter((action) => action.action === "conflict")) {
      console.log(`  - ${item.path}${item.reason ? `: ${item.reason}` : ""}`);
    }
  }
}

async function verifyInstallation(plan, reportName = "adoption-verification.json") {
  const failures = [];
  const frameworkSkills = await discoverSkills(SCRIPT_ROOT);
  const installedSkills = await discoverSkills(plan.projectRoot);
  const installedByName = new Map(installedSkills.map((skill) => [skill.name, skill]));
  for (const frameworkSkill of frameworkSkills) {
    const installed = installedByName.get(frameworkSkill.name);
    if (!installed) failures.push(`Missing framework skill: ${frameworkSkill.name}`);
    else if (installed.hash !== frameworkSkill.hash) failures.push(`Outdated framework skill: ${frameworkSkill.name}`);
  }
  for (const legacyName of LEGACY_SKILL_IDS.keys()) {
    if (installedByName.has(legacyName)) failures.push(`Legacy skill ID remains installed: ${legacyName}`);
    for (const installed of installedSkills) {
      if (installed.source.includes(legacyName)) failures.push(`${installed.name} still references legacy skill ID: ${legacyName}`);
    }
  }

  for (const relative of await walkFiles(path.join(SCRIPT_ROOT, "schemas"))) {
    const source = path.join(SCRIPT_ROOT, "schemas", relative);
    const installed = path.join(plan.projectRoot, "schemas", relative);
    if (!(await sameFile(source, installed))) failures.push(`Missing or outdated schema: ${relative}`);
  }
  if (!(await sameFile(path.join(SCRIPT_ROOT, "config", "profiles.yaml"), path.join(plan.projectRoot, "config", "profiles.yaml")))) {
    failures.push("Installed profiles configuration is not current");
  }
  try {
    const installedConfiguration = await resolveConfiguration(plan.projectRoot);
    const expectedConfiguration = plan.resolvedConfiguration ?? { ...DEFAULT_CONFIGURATION, profile: plan.profile };
    if (JSON.stringify(installedConfiguration.clarification) !== JSON.stringify(expectedConfiguration.clarification)) {
      failures.push("Installed clarification configuration does not match the resolved project configuration");
    }
  } catch (error) {
    failures.push(`Project configuration validation failed: ${error.message}`);
  }

  const inventoryPath = path.join(plan.projectRoot, "reports", "skill-inventory.json");
  try {
    const installedInventory = JSON.parse(await readFile(inventoryPath, "utf8"));
    const inventoriedNames = new Set(installedInventory.skills.map((skill) => skill.name));
    for (const frameworkSkill of frameworkSkills) {
      if (!inventoriedNames.has(frameworkSkill.name)) failures.push(`Inventory omits framework skill: ${frameworkSkill.name}`);
    }
  } catch (error) {
    failures.push(`Skill inventory validation failed: ${error.message}`);
  }

  const manifestPath = path.join(plan.projectRoot, "project-orchestrator.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.frameworkVersion !== FRAMEWORK_VERSION) failures.push("Manifest frameworkVersion is not current");
    if (manifest.runtimeVersion !== VERSION) failures.push("Manifest runtimeVersion is not current");
    if (manifest.conformanceProfile !== plan.profile) failures.push("Manifest conformance profile does not match the adoption plan");
  } catch (error) {
    failures.push(`Manifest validation failed: ${error.message}`);
  }

  const orchestratorPath = path.join(plan.projectRoot, "config", "orchestrator.yaml");
  const orchestrator = existsSync(orchestratorPath) ? await readFile(orchestratorPath, "utf8") : "";
  const requiredConfiguration = [
    `frameworkVersion: ${FRAMEWORK_VERSION}`,
    `runtimeVersion: ${VERSION}`,
    `profile: ${plan.profile}`,
    "skills: .github/skills",
    "reports: reports",
    "schemas: schemas"
  ];
  for (const required of requiredConfiguration) {
    if (!orchestrator.includes(required)) failures.push(`Orchestrator configuration is missing '${required}'`);
  }

  const instructionPath = path.join(plan.projectRoot, ".github", "copilot-instructions.md");
  const instructions = existsSync(instructionPath) ? await readFile(instructionPath, "utf8") : "";
  const agentsPath = path.join(plan.projectRoot, "AGENTS.md");
  const agentInstructions = existsSync(agentsPath) ? await readFile(agentsPath, "utf8") : "";
  if (!instructions.includes(".github/skills/project-skills-orchestrator/SKILL.md")) {
    failures.push("Copilot instructions do not route multi-skill work through project-skills-orchestrator");
  }
  if (!agentInstructions.includes(".github/skills/project-skills-orchestrator/SKILL.md")) {
    failures.push("AGENTS.md does not route multi-skill work through project-skills-orchestrator");
  }
  for (const [relative, source, blocks] of [
    [".github/copilot-instructions.md", instructions, COPILOT_INSTRUCTION_BLOCKS],
    ["AGENTS.md", agentInstructions, AGENT_INSTRUCTION_BLOCKS]
  ]) {
    for (const block of blocks) {
      const found = source.match(managedRegionPattern(block.id)) ?? [];
      if (found.length === 0) failures.push(`${relative} is missing the managed ${block.id} region`);
      if (found.length > 1) failures.push(`${relative} contains ${found.length} copies of the managed ${block.id} region`);
    }
  }
  for (const relative of [".vscode/extensions.json", ".vscode/settings.json"]) {
    if (!existsSync(path.join(plan.projectRoot, relative))) failures.push(`Missing workspace support file: ${relative}`);
  }
  for (const relative of [".github/instructions/clarification.instructions.md", ".github/prompts", ".github/agents", ".vscode/mcp.json"]) {
    if (!existsSync(path.join(plan.projectRoot, relative))) failures.push(`Missing customization asset: ${relative}`);
  }
  if (failures.length) throw new Error(`Installation verification failed: ${failures.join("; ")}`);

  const report = {
    schemaVersion: "1.0.0",
    verifiedAt: new Date().toISOString(),
    frameworkVersion: FRAMEWORK_VERSION,
    runtimeVersion: VERSION,
    profile: plan.profile,
    mode: reportName === "installation-verification.json" ? "new-project-creation" : "existing-project-adoption",
    status: "passed",
    checks: {
      frameworkSkills: frameworkSkills.length,
      schemas: (await walkFiles(path.join(SCRIPT_ROOT, "schemas"))).length,
      profilesCurrent: true,
      inventoryCurrent: true,
      manifestCurrent: true,
      orchestratorConfigured: true,
      clarificationConfigured: true,
      clarificationProtocolPresent: true,
      customizationAssetsPresent: true,
      copilotRouted: true,
      agentInstructionsRouted: true,
      workspaceSupportPresent: true,
      legacySkillsRemoved: true
    }
  };
  await writeFile(path.join(plan.projectRoot, "reports", reportName), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function applyAdoption(plan, riskAcceptance) {
  if (!riskAcceptance) throw new Error("Risk acceptance is required before adoption");
  if (!plan.canApply) throw new Error("Adoption cannot be applied until blocking conflicts are resolved");
  await assertSafeAdoptionPaths(plan.projectRoot, plan.actions);
  const transactionRoot = path.join(plan.projectRoot, ".skills-orchestrator");
  const lockPath = path.join(transactionRoot, "adoption.lock");
  const transactionId = `${plan.generatedAt.replaceAll(":", "-")}-${randomUUID()}`;
  await mkdir(transactionRoot, { recursive: true });
  try {
    await writeFile(lockPath, `${JSON.stringify({ transactionId, processId: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another adoption transaction holds ${path.relative(plan.projectRoot, lockPath)}; verify the owner before recovery`);
    throw error;
  }
  let transaction;
  try {
    for (const action of plan.actions.filter((item) => MUTATING_ADOPTION_ACTIONS.has(item.action))) {
      const actualState = await managedPathState(plan.projectRoot, action.path);
      if (actualState !== action.expectedDestinationState) {
        throw new Error(`Adoption plan is stale for ${action.path}; run a new dry-run before apply`);
      }
    }
    const manifestAction = plan.actions.find((item) => item.path === "project-orchestrator.json" && typeof item.content === "string");
    if (manifestAction) {
      const manifest = JSON.parse(manifestAction.content);
      manifest.riskAcceptance = riskAcceptance;
      manifestAction.content = `${JSON.stringify(manifest, null, 2)}\n`;
    }
    transaction = await prepareAdoptionTransaction(plan, transactionId, riskAcceptance);
    await updateTransaction(transaction, "applying");
    try {
      const result = await applyAdoptionLocked(plan);
      await updateTransaction(transaction, "completed", { completedAt: new Date().toISOString() });
      return result;
    } catch (error) {
      await rollbackAdoptionTransaction(plan, transaction, error);
      throw new Error(`Adoption failed and was rolled back: ${error.message}`);
    }
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function applyAdoptionLocked(plan) {
  for (const item of plan.actions.filter((action) => action.action === "replace-duplicate")) {
    await rm(path.join(plan.projectRoot, item.path), { recursive: true, force: true });
  }
  for (const item of plan.actions.filter((action) => action.action === "update-skill")) {
    const destination = path.join(plan.projectRoot, item.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await rm(destination, { recursive: true, force: true });
    await cp(item.source, destination, { recursive: true });
  }
  for (const item of plan.actions.filter((action) => action.action === "update-skill-references")) {
    const target = path.join(plan.projectRoot, item.path);
    let source = await readFile(target, "utf8");
    for (const migration of item.migrations) source = source.replaceAll(migration.from, migration.to);
    await writeFile(target, source, "utf8");
  }
  for (const item of plan.actions.filter((action) => ["update-framework-file", "update-wiring-file"].includes(action.action))) {
    const destination = path.join(plan.projectRoot, item.path);
    await mkdir(path.dirname(destination), { recursive: true });
    if (item.source) await cp(item.source, destination, { force: true });
    else await writeFile(destination, item.content, "utf8");
  }
  for (const item of plan.actions.filter((action) => action.action === "create")) {
    const destination = path.join(plan.projectRoot, item.path);
    await mkdir(path.dirname(destination), { recursive: true });
    if (item.source) await cp(item.source, destination, { recursive: item.kind === "skill", errorOnExist: true });
    else await writeFile(destination, item.content, { encoding: "utf8", flag: "wx" });
    interruptAfterFirstWriteForTest();
  }
  const reports = path.join(plan.projectRoot, "reports");
  await mkdir(reports, { recursive: true });
  const { projectRoot, ...portablePlan } = plan;
  const reportPlan = {
    ...portablePlan,
    project: { name: plan.projectName ?? path.basename(projectRoot) },
    actions: plan.actions.map(({ source, content, ...action }) => action)
  };
  await writeFile(path.join(reports, "adoption-plan.json"), `${JSON.stringify(reportPlan, null, 2)}\n`, "utf8");
  const markdown = `# Project Skills Orchestrator Adoption

- Project: \`${plan.projectName ?? path.basename(plan.projectRoot)}\`
- Profile: \`${plan.profile}\`
- Runtime: \`${VERSION}\`
- Created: ${plan.counts.create}
- Existing skills updated: ${plan.counts["update-skill"]}
- Project skill references migrated: ${plan.counts["update-skill-references"]}
- Framework files updated: ${plan.counts["update-framework-file"]}
- Wiring files updated: ${plan.counts["update-wiring-file"]}
- Duplicate skills replaced: ${plan.counts["replace-duplicate"]}
- Conflicts: ${plan.counts.conflict}

Updated framework assets, generated reports, and duplicate skills were journaled and backed up under \`.skills-orchestrator/transactions/\` before replacement. Unrelated project skills and custom Copilot instruction text were preserved.
`;
  await writeFile(path.join(reports, "adoption-plan.md"), markdown, "utf8");
  await inventory(plan.projectRoot);
  const verification = await verifyInstallation(plan);
  console.log(`Adoption completed and verified: ${plan.projectRoot} (${verification.checks.frameworkSkills} framework skills)`);
}

async function inventory(requestedRoot) {
  const root = await realpath(path.resolve(requestedRoot));
  await assertSafeManagedPath(root, "reports");
  const discovered = await discoverSkills(root);
  const names = new Set(discovered.map((skill) => skill.name));
  const lifecycles = new Set(["draft", "tested", "validated", "production", "deprecated", "retired"]);
  const confidenceLevels = new Set(["low", "medium", "high"]);
  const requiredSections = ["Purpose", "Preconditions", "Inputs", "Approved Tools and Resources", "Read and Write Boundaries", "Procedure", "Validation", "Outputs", "Failure Behavior", "Approval Gates", "Composition and Dependencies", "Examples"];
  const details = discovered.map((skill) => {
    const frontmatter = metadata(skill.source);
    const lifecycle = frontmatter.lifecycle || "draft";
    const confidence = frontmatter.confidence || "low";
    if (!lifecycles.has(lifecycle)) throw new Error(`Invalid lifecycle '${lifecycle}' in ${skill.name}`);
    if (!confidenceLevels.has(confidence)) throw new Error(`Invalid confidence '${confidence}' in ${skill.name}`);
    const dependencies = sectionItems(skill.source, "Composition and Dependencies");
    const reports = sectionItems(skill.source, "Outputs").filter((item) => /^(reports|artifacts)\//.test(item));
    const missingSections = requiredSections.filter((heading) => !new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(skill.source));
    const findings = [];
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(skill.name)) findings.push(`Name '${skill.name}' is not lowercase kebab-case`);
    if (skill.directory !== skill.name) findings.push(`Directory '${skill.directory}' does not match skill name '${skill.name}'`);
    if (!skill.description) findings.push("Frontmatter description is missing");
    if (missingSections.length) findings.push(`Missing required sections: ${missingSections.join(", ")}`);
    const missingDependencies = dependencies.filter((dependency) => !names.has(dependency));
    if (missingDependencies.length) findings.push(`Unknown dependencies: ${missingDependencies.join(", ")}`);
    return {
      name: skill.name,
      path: path.relative(root, skill.file).replaceAll("\\", "/"),
      description: skill.description,
      lifecycle,
      confidence,
      dependencies,
      reports,
      sha256: skill.hash,
      audit: {
        status: findings.length ? "findings" : "passed",
        checkedAt: new Date().toISOString(),
        findings
      }
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const duplicates = details.filter((skill, index) => details.findIndex((candidate) => candidate.name === skill.name) !== index);
  if (duplicates.length) throw new Error(`Duplicate skill names found: ${[...new Set(duplicates.map((skill) => skill.name))].join(", ")}`);
  const contractFindings = details.filter((skill) => skill.audit.status === "findings");
  if (contractFindings.length) {
    throw new Error(`Skill contract findings: ${contractFindings.map((skill) => `${skill.name}: ${skill.audit.findings.join("; ")}`).join(" | ")}`);
  }

  const visiting = new Set();
  const visited = new Set();
  const graph = new Map(details.map((skill) => [skill.name, skill.dependencies]));
  function visit(name, trail = []) {
    if (visiting.has(name)) throw new Error(`Dependency cycle: ${[...trail, name].join(" -> ")}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of graph.get(name) ?? []) visit(dependency, [...trail, name]);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of graph.keys()) visit(name);

  const schemaRoot = path.join(root, "schemas");
  const schemaFiles = existsSync(schemaRoot)
    ? (await walkFiles(schemaRoot)).filter((file) => file.endsWith(".schema.json"))
    : [];
  for (const relative of schemaFiles) {
    const schemaPath = path.join(schemaRoot, relative);
    let schema;
    try {
      schema = JSON.parse(await readFile(schemaPath, "utf8"));
    } catch (error) {
      throw new Error(`Invalid JSON schema ${relative}: ${error.message}`);
    }
    const serialized = JSON.stringify(schema);
    for (const match of serialized.matchAll(/"\$ref":"([^"#]+\.schema\.json)(?:#[^"]*)?"/g)) {
      if (!existsSync(path.resolve(path.dirname(schemaPath), match[1]))) {
        throw new Error(`Schema ${relative} references missing schema ${match[1]}`);
      }
    }
  }
  for (const skill of discovered) {
    for (const match of skill.source.matchAll(/`(schemas\/[a-z0-9.-]+\.schema\.json)`/g)) {
      if (!existsSync(path.join(root, match[1]))) throw new Error(`${skill.name} references missing ${match[1]}`);
    }
  }

  const profilesPath = path.join(root, "config", "profiles.yaml");
  if (existsSync(profilesPath)) {
    const profileSource = await readFile(profilesPath, "utf8");
    const requiredSkills = [...profileSource.matchAll(/^\s{6}-\s+([a-z0-9-]+)\s*$/gm)].map((match) => match[1]);
    const missingProfileSkills = requiredSkills.filter((name) => !names.has(name));
    if (missingProfileSkills.length) throw new Error(`Profiles reference missing skills: ${[...new Set(missingProfileSkills)].join(", ")}`);
  }

  const pipeline = new Map(details.map((skill) => [skill.name, skill]));
  const pipelineRequirements = [
    ["audit-code", "reports/code-audit-findings.json", "schemas/code-audit-findings.schema.json"],
    ["audit-review-findings", "reports/code-audit-review.json", "schemas/audit-findings-review.schema.json"],
    ["audit-plan-remediation", "reports/audit-remediation-plan.json", "schemas/audit-remediation-plan.schema.json"]
  ];
  for (const [skillName, report, schema] of pipelineRequirements) {
    const skill = pipeline.get(skillName);
    if (!skill?.reports.includes(report)) throw new Error(`${skillName} must own ${report}`);
    if (!existsSync(path.join(root, schema))) throw new Error(`${skillName} requires missing ${schema}`);
  }
  if (!pipeline.get("audit-review-findings")?.dependencies.includes("audit-code")) throw new Error("audit-review-findings must depend on audit-code");
  if (!pipeline.get("audit-plan-remediation")?.dependencies.includes("audit-review-findings")) throw new Error("audit-plan-remediation must depend on audit-review-findings");
  const reports = path.join(root, "reports");
  await assertSafeManagedPath(root, "reports");
  await mkdir(reports, { recursive: true });
  const generatedAt = new Date().toISOString();
  const skills = details.map(({ sha256, audit, ...skill }) => skill);
  const output = { schemaVersion: "1.0.0", runtimeVersion: VERSION, generatedAt, skills };
  await writeTextAtomic(path.join(reports, "skill-inventory.json"), `${JSON.stringify(output, null, 2)}\n`);
  const inventoryMarkdown = [
    "# Skill Inventory",
    "",
    `Generated: ${generatedAt}`,
    "",
    "| Skill | Description |",
    "| --- | --- |",
    ...skills.map((skill) => `| ${skill.name} | ${skill.description.replaceAll("|", "\\|")} |`),
    ""
  ].join("\n");
  await writeTextAtomic(path.join(reports, "skill-inventory.md"), inventoryMarkdown);
  await writeTextAtomic(path.join(reports, "skill-details.json"), `${JSON.stringify({ schemaVersion: "1.0.0", runtimeVersion: VERSION, generatedAt, skills: details }, null, 2)}\n`);
  const ownership = details.flatMap((skill) => skill.reports.map((report) => ({ report, producer: skill.name })));
  const duplicateReports = ownership.filter((item, index) => ownership.findIndex((candidate) => candidate.report === item.report) !== index);
  if (duplicateReports.length) throw new Error(`Reports have multiple producers: ${[...new Set(duplicateReports.map((item) => item.report))].join(", ")}`);
  await writeTextAtomic(path.join(reports, "artifact-ownership.json"), `${JSON.stringify({ schemaVersion: "1.0.0", generatedAt, artifacts: ownership }, null, 2)}\n`);
  const markdown = [
    "# Skill Details",
    "",
    `Generated: ${generatedAt}`,
    "",
    "| Skill | Lifecycle | Confidence | Audit | Dependencies |",
    "| --- | --- | --- | --- | --- |",
    ...details.map((skill) => `| ${skill.name} | ${skill.lifecycle} | ${skill.confidence} | ${skill.audit.status} | ${skill.dependencies.join(", ") || "None"} |`),
    ""
  ].join("\n");
  await writeTextAtomic(path.join(reports, "skill-details.md"), markdown);
  console.log(`Inventoried ${skills.length} skills`);
  console.log(`Audited ${details.length} skills (${details.filter((skill) => skill.audit.status === "passed").length} passed)`);
}

async function plan(requestedRoot, intent) {
  if (!intent) throw new Error("Use --intent to describe the requested outcome");
  const root = await realpath(path.resolve(requestedRoot));
  await assertSafeManagedPath(root, "reports");
  const reports = path.join(root, "reports");
  await mkdir(reports, { recursive: true });
  const lockPath = path.join(reports, "workflow-plan.lock");
  try {
    await writeFile(lockPath, `${JSON.stringify({ processId: process.pid, startedAt: new Date().toISOString() })}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Another workflow planner holds reports/workflow-plan.lock");
    throw error;
  }
  try {
    const workflowId = `WF-${randomUUID()}`;
    const runId = `RUN-${randomUUID()}`;
    const now = new Date().toISOString();
    const workflow = {
      schemaVersion: "1.0.0", workflowId, runId, intent,
      status: "planned", createdAt: now,
      steps: [{ id: "STEP-001", skill: "project-skills-orchestrator", action: "Route intent", status: "planned" }]
    };
    const eventFile = path.join(reports, "execution-log.jsonl");
    await assertSafeManagedPath(root, "reports/execution-log.jsonl");
    let sequence = 1;
    try {
      const content = await readFile(eventFile, "utf8");
      sequence = content.split(/\r?\n/).filter(Boolean).length + 1;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const event = {
      eventId: randomUUID(), eventType: "workflow.planned", occurredAt: now, sequence,
      workflowId, runId, actor: "pso-standalone", payload: { intent, totalSteps: 1 }
    };
    await appendFile(eventFile, `${JSON.stringify(event)}\n`, "utf8");
    await writeTextAtomic(path.join(reports, "workflow-plan.json"), `${JSON.stringify(workflow, null, 2)}\n`);
    console.log(`Created workflow ${workflowId}`);
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function guidedCreate() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const name = await terminal.question("Project name: ");
    const destination = await terminal.question(`Destination folder [${process.cwd()}]: `);
    const stack = await terminal.question(`Stack, comma separated, blank for none [${[...STACK_TAGS].sort().join(", ")}]: `);
    const openAnswer = await terminal.question("Open in Visual Studio Code when finished? [Y/n]: ");
    const riskAcceptance = await promptRiskAcceptance(terminal);
    const result = await createProject({
      name,
      destination: destination.trim() || process.cwd(),
      stack: stack.trim(),
      open: !openAnswer.trim().toLowerCase().startsWith("n"),
      riskAcceptance
    });
    console.log(`Created project: ${result.root}`);
    console.log(`Open workspace: ${result.workspace}`);
    reportLaunch(result.launch);
  } finally {
    terminal.close();
  }
}

function reportLaunch(launch) {
  if (!launch) return console.log("Rerun with --open to launch Visual Studio Code automatically.");
  if (launch.opened) return console.log("Opening Visual Studio Code. Accept the workspace trust prompt and the recommended extensions to enable tasks, debugging, and MCP servers.");
  return console.log(`Could not open Visual Studio Code automatically: ${launch.reason}. Open the workspace file listed above manually.`);
}

// Windows can refuse a directory rename while an indexer or scanner still holds a handle in the staging tree.
async function publishStagedProject(staging, destination) {
  const transientCodes = new Set(["EACCES", "EBUSY", "EPERM"]);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(staging, destination);
      return;
    } catch (error) {
      if (!transientCodes.has(error.code) || existsSync(destination)) throw error;
      if (attempt === 7) {
        await cp(staging, destination, { recursive: true });
        await rm(staging, { recursive: true, force: true });
        return;
      }
      await delay(Math.min(50 * (2 ** attempt), 500));
    }
  }
}

async function cloneAndSetup({ repository: enteredRepository, destination, profile = "core", riskAcceptance }) {
  if (!riskAcceptance) throw new Error("Risk acceptance is required before cloning and provisioning a repository");
  if (!PROFILES.has(profile)) throw new Error(`Unsupported profile: ${profile}`);
  const { repository, name } = validateGitHubRepository(enteredRepository);
  const requestedRoot = path.resolve(destination || path.join(process.cwd(), name));
  if (existsSync(requestedRoot)) throw new Error(`Clone destination must not already exist: ${requestedRoot}`);
  const parent = await realpath(path.dirname(requestedRoot));
  const projectName = path.basename(requestedRoot);
  validateRelativePath(projectName);
  if (!/^[A-Za-z0-9._ -]{1,128}$/.test(projectName)) {
    throw new Error("Clone destination folder name must contain only letters, numbers, spaces, dots, underscores, or hyphens");
  }
  const root = path.join(parent, projectName);
  const staging = path.join(parent, `.pso-clone-${normalizeName(projectName)}-${randomUUID()}`);
  const clone = spawnSync("git", ["clone", "--", repository, staging], {
    cwd: parent,
    stdio: "inherit",
    windowsHide: true
  });
  if (clone.error) {
    await rm(staging, { recursive: true, force: true });
    throw new Error(`Git clone could not start: ${clone.error.message}`);
  }
  if (clone.status !== 0) {
    await rm(staging, { recursive: true, force: true });
    throw new Error(`Git clone failed with exit code ${clone.status}`);
  }
  try {
    const plan = await buildAdoptionPlan(staging, profile, projectName);
    if (!plan.canApply) throw new Error("Cloned repository has blocking adoption conflicts");
    const verification = await applyAdoption(plan, riskAcceptance);
    await publishStagedProject(staging, root);
    return { root, repository, verification };
  } catch (error) {
    throw new Error(`Repository provisioning failed. Staging path preserved for recovery: ${staging}\n${error.message}`);
  }
}

async function guidedSetup() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("Project Skills Orchestrator Setup\n");
    const projectType = (await terminal.question("Is this a (N)ew project, (E)xisting local project, or (R)emote GitHub repository? [N/E/R]: ")).trim().toLowerCase();
    if (projectType === "n" || projectType === "new") {
      const name = await terminal.question("Project name: ");
      const destination = await terminal.question(`Parent destination folder [${process.cwd()}]: `);
      const enteredProfile = await terminal.question("Conformance profile [core]: ");
      const riskAcceptance = await promptRiskAcceptance(terminal);
      const result = await createProject({
        name,
        destination: destination.trim() || process.cwd(),
        profile: enteredProfile.trim().toLowerCase() || "core",
        riskAcceptance
      });
      console.log(`\nCreated project: ${result.root}`);
      console.log(`Open workspace: ${result.workspace}`);
      return;
    }
    if (projectType === "e" || projectType === "existing") {
      const project = await terminal.question("Where is the existing repository saved? ");
      const enteredProfile = await terminal.question("Conformance profile [core]: ");
      const plan = await buildAdoptionPlan(project, enteredProfile.trim().toLowerCase() || "core");
      printAdoptionPlan(plan);
      if (!plan.canApply) {
        console.log("\nNo files were changed. Resolve the listed conflicts and run setup again.");
        return;
      }
      const confirmation = (await terminal.question("\nApply this adoption plan? [y/N]: ")).trim().toLowerCase();
      if (confirmation !== "y" && confirmation !== "yes") {
        console.log("No files were changed.");
        return;
      }
      const riskAcceptance = await promptRiskAcceptance(terminal);
      await applyAdoption(plan, riskAcceptance);
      return;
    }
    if (projectType === "r" || projectType === "remote") {
      const repository = await terminal.question("GitHub repository URL: ");
      const repositoryDetails = validateGitHubRepository(repository);
      const defaultDestination = path.join(process.cwd(), repositoryDetails.name);
      const destination = await terminal.question(`Local destination path [${defaultDestination}]: `);
      const enteredProfile = await terminal.question("Conformance profile [core]: ");
      const riskAcceptance = await promptRiskAcceptance(terminal);
      const result = await cloneAndSetup({
        repository,
        destination: destination.trim() || defaultDestination,
        profile: enteredProfile.trim().toLowerCase() || "core",
        riskAcceptance
      });
      console.log(`\nCloned and provisioned project: ${result.root}`);
      return;
    }
    throw new Error("Choose N for a new project, E for an existing local project, or R for a remote GitHub repository");
  } finally {
    terminal.close();
  }
}

function help() {
  console.log(`Project Skills Orchestrator ${VERSION}

Usage:
  node .\\pso.mjs
  node .\\pso.mjs create-project --name "My Project" --destination "C:\\repos" --profile core --stack typescript --open --accept-risk
  node .\\pso.mjs clone-setup --repository "https://github.com/owner/project.git" [--destination "C:\\repos\\project"] --profile core --accept-risk
  node .\\pso.mjs adopt --project "C:\\repos\\existing" --profile core --dry-run
  node .\\pso.mjs adopt --project "C:\\repos\\existing" --profile core --apply --accept-risk
  node .\\pso.mjs recover --project "C:\\repos\\existing" [--transaction ID]
  node .\\pso.mjs inventory [--root "C:\\repos\\my-project"]
  node .\\pso.mjs plan --intent "Build a customer portal" [--root PATH]
  node .\\pso.mjs verify
  node .\\pso.mjs --version

New project:
  --stack is optional and accepts a comma-separated list. It selects the scoped
  instruction files, the build and test tasks, the debug configurations, and the
  continuous-integration commands. Without it none of those are generated.
  Supported values: ${[...STACK_TAGS].sort().join(", ")}
  --open launches Visual Studio Code on the generated workspace when the editor
  is installed. Accept the workspace trust prompt to enable tasks, debugging,
  and MCP servers.

Adoption:
  --force-templates installs framework templates even where an equivalent exists.
  --force-adopt proceeds against a directory with no recognized project marker.

Clone setup:
  --destination is optional; the default is .\\<repository-name>
  Use a credential-free GitHub HTTPS URL or git@github.com SSH location.
  The destination must not already exist.
`);
}

async function main() {
  assertSupportedRuntime();
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  if (options.version) return console.log(VERSION);
  if (options.help || command === "help") return help();
  if (command === "verify") {
    const required = [".github/skills", "schemas", "config/profiles.yaml", TEMPLATE_ROOT_RELATIVE, SCAFFOLD_MANIFEST_RELATIVE];
    const missing = required.filter((item) => !existsSync(path.join(SCRIPT_ROOT, item)));
    if (missing.length) throw new Error(`Distribution is incomplete: ${missing.join(", ")}`);
    const entries = await readdir(path.join(SCRIPT_ROOT, ".github", "skills"), { withFileTypes: true });
    const incomplete = entries.filter((entry) => entry.isDirectory() && !existsSync(path.join(SCRIPT_ROOT, ".github", "skills", entry.name, "SKILL.md")));
    if (incomplete.length) throw new Error(`Skill packages are missing SKILL.md: ${incomplete.map((entry) => entry.name).join(", ")}`);
    const count = entries.filter((entry) => entry.isDirectory()).length;
    if (!count) throw new Error("Distribution contains no skill packages");
    await loadScaffoldManifest();
    await inventory(SCRIPT_ROOT);
    return console.log(`Verified registry-free distribution: ${count} skills, schemas, profiles, dependencies, ownership, and audit pipeline`);
  }
  if (command === "create-project") {
    if (!options.name || !options.destination) return guidedCreate();
    const riskAcceptance = acknowledgeRisk(options["accept-risk"] === true, "cli-flag");
    const result = await createProject({
      name: options.name,
      destination: options.destination,
      profile: options.profile ?? "core",
      stack: options.stack ?? "",
      open: options.open === true,
      riskAcceptance
    });
    console.log(`Created project: ${result.root}`);
    console.log(`Open workspace: ${result.workspace}`);
    return reportLaunch(result.launch);
  }
  if (command === "clone-setup") {
    if (!options.repository) throw new Error("Use --repository with a GitHub URL");
    const riskAcceptance = acknowledgeRisk(options["accept-risk"] === true, "cli-flag");
    const result = await cloneAndSetup({
      repository: options.repository,
      destination: options.destination,
      profile: options.profile ?? "core",
      riskAcceptance
    });
    return console.log(`Cloned and provisioned project: ${result.root}`);
  }
  if (command === "adopt") {
    if (!options.project) throw new Error("Use --project with the existing repository path");
    const plan = await buildAdoptionPlan(options.project, options.profile, undefined, {
      forceTemplates: options["force-templates"] === true,
      forceAdopt: options["force-adopt"] === true
    });
    printAdoptionPlan(plan);
    if (options.apply) {
      const riskAcceptance = acknowledgeRisk(options["accept-risk"] === true, "cli-flag");
      return applyAdoption(plan, riskAcceptance);
    }
    console.log("\nDry run only. No project files were changed.");
    return;
  }
  if (command === "recover") {
    if (!options.project) throw new Error("Use --project with the repository path to recover");
    return recoverAdoption(options.project, options.transaction);
  }
  if (command === "inventory") return inventory(path.resolve(options.root ?? process.cwd()));
  if (command === "plan") return plan(path.resolve(options.root ?? process.cwd()), options.intent);
  if (!command) return guidedSetup();
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => fail(error.message));
