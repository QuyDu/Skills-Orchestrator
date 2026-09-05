#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";

const REQUIRED_STANDARDS = new Set([
  "microsoft-sdl",
  "microsoft-cloud-security-benchmark",
  "azure-well-architected-security",
  "owasp-asvs",
  "owasp-top-10",
  "nist-ssdf",
  "cis-controls",
  "slsa",
  "openssf-scorecard"
]);
const REQUIRED_SECRET_SCOPES = new Set(["worktree", "tracked-reports", "all-local-refs", "reachable-history"]);
const WORKFLOW_STATE_PATHS = new Set([
  "reports/audit-remediation-execution.json",
  "reports/audit-remediation-execution.md",
  "reports/current-execution-state.json",
  "reports/current-execution-state.md",
  "reports/execution-log.jsonl",
  "reports/project-handoff.json",
  "reports/project-handoff.md",
  "reports/current-work-state.json",
  "reports/change-review.json",
  "reports/change-review.md",
  "reports/policy-evaluation.json",
  "reports/policy-evaluation.md",
  "reports/policy-decision-log.jsonl",
  "reports/gitleaks-scan.json"
]);

function fail(messages) {
  const details = [...new Set(messages)].map((message) => `- ${message}`).join("\n");
  throw new Error(`Audit validation failed:\n${details}`);
}

async function loadJson(file) {
  const resolved = path.resolve(file);
  try {
    return JSON.parse(await readFile(resolved, "utf8"));
  } catch (error) {
    throw new Error(`Audit validation failed: could not read JSON artifact '${resolved}': ${error.message}`);
  }
}

async function loadJsonArtifact(file) {
  const resolved = path.resolve(file);
  try {
    const bytes = await readFile(resolved);
    return {
      value: JSON.parse(bytes.toString("utf8")),
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  } catch (error) {
    throw new Error(`Audit validation failed: could not read JSON artifact '${resolved}': ${error.message}`);
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function sameMembers(left, right) {
  return equal([...(left ?? [])].sort(), [...(right ?? [])].sort());
}

function containedPath(root, candidate, label) {
  const requestedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(requestedRoot, resolvedCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail([`${label} must be contained within repository root`]);
  const resolvedRoot = realpathSync(requestedRoot);
  const canonicalCandidate = realpathSync(resolvedCandidate);
  const canonicalRelative = path.relative(resolvedRoot, canonicalCandidate);
  if (!canonicalRelative || canonicalRelative.startsWith("..") || path.isAbsolute(canonicalRelative)) fail([`${label} must be contained within repository root`]);
  return {
    resolvedRoot,
    resolvedCandidate,
    expectedCandidate: path.join(resolvedRoot, relative),
    relative: relative.replaceAll("\\", "/")
  };
}

function sameFilesystemPath(left, right) {
  const normalize = (value) => {
    const normalized = path.normalize(value).replace(/[\\/]+$/, "");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  return normalize(left) === normalize(right);
}

async function snapshotPlan(planPath, root) {
  const { resolvedRoot, resolvedCandidate, expectedCandidate, relative } = containedPath(root, planPath, "canonical plan");
  if (relative !== "reports/audit-remediation-plan.json") fail(["snapshot source must be reports/audit-remediation-plan.json"]);
  const realRoot = realpathSync(resolvedRoot);
  const reportsDirectory = path.join(realRoot, "reports");
  if (!sameFilesystemPath(realpathSync(reportsDirectory), reportsDirectory)) fail(["reports directory must not redirect through a symbolic link"]);
  const sourceStat = lstatSync(resolvedCandidate);
  if (!sourceStat.isFile() || sourceStat.nlink !== 1 || !sameFilesystemPath(realpathSync(resolvedCandidate), expectedCandidate)) {
    fail(["canonical plan must be a regular file inside the repository"]);
  }
  const plan = await loadJson(resolvedCandidate);
  validatePlan(plan);
  const bytes = await readFile(resolvedCandidate);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const snapshotPath = `reports/audit-remediation-plans/${sha256}.json`;
  const target = path.join(realRoot, ...snapshotPath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  if (!sameFilesystemPath(realpathSync(path.dirname(target)), path.dirname(target))) fail(["snapshot directory must not redirect through a symbolic link"]);
  try {
    await writeFile(target, bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") fail([`could not publish immutable plan snapshot: ${error.message}`]);
    if (!(await readFile(target)).equals(bytes)) fail(["existing immutable plan snapshot content does not match canonical plan"]);
  }
  const stored = await readFile(target);
  const targetStat = lstatSync(target);
  if (!targetStat.isFile() || targetStat.nlink !== 1 || !sameFilesystemPath(realpathSync(target), target)) {
    fail(["immutable plan snapshot must be one regular file without links"]);
  }
  if (!stored.equals(bytes) || createHash("sha256").update(stored).digest("hex") !== sha256) {
    fail(["immutable plan snapshot failed post-write verification"]);
  }
  return { status: "valid", command: "snapshot", path: snapshotPath, planId: plan.planId, sha256, sourceReview: plan.sourceReview };
}

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: path.resolve(root), encoding: "utf8", windowsHide: true, shell: false });
  if (result.status !== 0) fail([`could not inspect resume repository: ${result.stderr.trim() || result.stdout.trim()}`]);
  return result.stdout.trim();
}

function gitBuffer(root, ...args) {
  const result = spawnSync("git", args, { cwd: path.resolve(root), encoding: null, windowsHide: true, shell: false });
  if (result.status !== 0) fail([`could not inspect resume repository: ${result.stderr?.toString().trim() || result.stdout?.toString().trim()}`]);
  return result.stdout;
}

function worktreeDigest(root) {
  const repositoryRoot = path.resolve(root);
  const revision = git(repositoryRoot, "rev-parse", "HEAD");
  const excludedPathspecs = [...WORKFLOW_STATE_PATHS].map((file) => `:(exclude)${file}`);
  const diff = gitBuffer(repositoryRoot, "diff", "--binary", "--no-ext-diff", "HEAD", "--", ".", ...excludedPathspecs);
  const untrackedFiles = gitBuffer(repositoryRoot, "ls-files", "--others", "--exclude-standard", "-z")
    .toString("utf8").split("\0").filter((file) => file && !WORKFLOW_STATE_PATHS.has(file)).sort();
  const untracked = Buffer.from(`${untrackedFiles.join("\0")}${untrackedFiles.length ? "\0" : ""}`);
  const digest = createHash("sha256").update(revision).update("\0").update(diff).update("\0").update(untracked);
  for (const relative of untrackedFiles) {
    const file = path.resolve(repositoryRoot, relative);
    const boundary = path.relative(repositoryRoot, file);
    if (boundary.startsWith("..") || path.isAbsolute(boundary)) fail([`untracked path escapes resume repository: '${relative}'`]);
    try {
      const stat = lstatSync(file);
      digest.update("\0").update(relative).update("\0");
      digest.update(stat.isSymbolicLink() ? readlinkSync(file) : readFileSync(file));
    } catch (error) {
      fail([`untracked path changed during resume validation: '${relative}': ${error.message}`]);
    }
  }
  return digest.digest("hex");
}

function validateFindings(report) {
  if (report.schemaVersion === "1.0.0") return;
  const errors = [];
  if (report.schemaVersion !== "2.0.0") errors.push("findings schemaVersion must be 1.0.0 or 2.0.0");

  const repository = report.repositoryEvidence ?? {};
  const secret = repository.secretScanning ?? {};
  const hosted = repository.hostedRepository ?? {};
  const standards = Array.isArray(report.standards) ? report.standards : [];
  const assurance = report.assurance ?? {};
  const standardIds = standards.map((standard) => standard.id);

  for (const id of REQUIRED_STANDARDS) {
    if (!standardIds.includes(id)) errors.push(`required standard '${id}' is missing`);
  }
  if (new Set(standardIds).size !== standardIds.length) errors.push("standards contain duplicate IDs");

  const incompleteEvidence = [];
  if (repository.localGit?.status !== "completed") incompleteEvidence.push("local Git evidence is not completed");
  if (secret.status !== "completed") incompleteEvidence.push("specialist secret scanning is not completed");
  if (!secret.version) incompleteEvidence.push("specialist secret scanner version is missing");
  if (!/^[a-fA-F0-9]{64}$/.test(secret.configurationDigest ?? "")) incompleteEvidence.push("secret scanner configuration digest is missing or invalid");
  for (const scope of REQUIRED_SECRET_SCOPES) {
    if (!secret.scopes?.includes(scope)) incompleteEvidence.push(`secret scan scope '${scope}' is missing`);
  }
  if (hosted.provider === "github" && hosted.status !== "completed") incompleteEvidence.push("hosted GitHub evidence is not completed");
  if (hosted.provider === "github" && !(hosted.controls?.length > 0)) incompleteEvidence.push("hosted GitHub controls are empty");

  let exceptions = 0;
  let expiredExceptions = 0;
  let nonConformant = false;
  const now = Date.now();
  for (const standard of standards) {
    if (standard.applicability !== "not-applicable" && !(standard.controls?.length > 0)) {
      incompleteEvidence.push(`applicable standard '${standard.id}' has no controls`);
    }
    for (const control of standard.controls ?? []) {
      if (control.status === "blocked") incompleteEvidence.push(`control '${standard.id}/${control.id}' is blocked`);
      if (control.status === "non-conformant") nonConformant = true;
      if (control.status === "exception") {
        exceptions++;
        const expiry = Date.parse(control.exceptionExpiresAt ?? "");
        if (!control.exceptionOwner) errors.push(`exception '${standard.id}/${control.id}' has no owner`);
        if (!Number.isFinite(expiry)) errors.push(`exception '${standard.id}/${control.id}' has no valid expiry`);
        else if (expiry <= now) expiredExceptions++;
      }
    }
  }

  if (expiredExceptions > 0) errors.push(`${expiredExceptions} exception(s) expired`);
  if (assurance.exceptionCount !== exceptions) errors.push("assurance exceptionCount does not match controls");
  if (assurance.expiredExceptionCount !== expiredExceptions) errors.push("assurance expiredExceptionCount does not match controls");

  const blocking = Array.isArray(assurance.blockingEvidence) ? assurance.blockingEvidence : [];
  let expected;
  if (incompleteEvidence.length > 0 || blocking.length > 0) expected = "insufficient-evidence";
  else if (nonConformant) expected = "non-conformant";
  else if (exceptions > 0) expected = "conformant-with-exceptions";
  else expected = "conformant";
  if (assurance.conclusion !== expected) {
    errors.push(`assurance conclusion must be '${expected}' for the recorded evidence, not '${assurance.conclusion}'`);
  }
  if (expected === "insufficient-evidence" && blocking.length === 0) {
    errors.push(`blockingEvidence must identify incomplete evidence: ${incompleteEvidence.join("; ")}`);
  }

  if (errors.length) fail(errors);
}

function validateReview(source, review) {
  if (source.schemaVersion !== "2.0.0") return;
  const errors = [];
  if (review.schemaVersion !== "2.0.0") errors.push("reviews of schema 2.0 findings must use review schema 2.0.0");
  if (!equal(review.repositoryEvidence, source.repositoryEvidence)) errors.push("review must preserve source repository evidence exactly");
  if (!equal(review.standards, source.standards)) errors.push("review must preserve source standards exactly");
  if (!equal(review.assurance, source.assurance)) errors.push("review must preserve source assurance exactly");
  if (errors.length) fail(errors);
}

function validatePlan(plan) {
  if (plan.schemaVersion === "1.0.0") return;
  const errors = [];
  if (plan.schemaVersion !== "2.0.0") errors.push("plan schemaVersion must be 1.0.0 or 2.0.0");
  if (!plan.prioritization?.includes("complexity")) errors.push("schema 2.0 remediation prioritization must include complexity");
  for (const item of plan.items ?? []) {
    if (!item.complexity) errors.push(`item '${item.id ?? "unknown"}' has no complexity`);
    if (!item.complexityRationale) errors.push(`item '${item.id ?? "unknown"}' has no complexity rationale`);
  }
  if (errors.length) fail(errors);
}

async function validateExecution(plan, execution, planPath, planSha256, repositoryRoot, resumeRoot) {
  const errors = [];
  if (execution.schemaVersion !== "3.0.0") errors.push("new execution artifacts must use schemaVersion 3.0.0");
  const snapshotPattern = /^reports\/audit-remediation-plans\/([a-fA-F0-9]{64})\.json$/;
  const snapshotMatch = snapshotPattern.exec(execution.sourcePlan?.path ?? "");
  if (!snapshotMatch) errors.push("execution source plan path must be a content-addressed immutable snapshot");
  else {
    if (snapshotMatch[1].toLowerCase() !== execution.sourcePlan.sha256?.toLowerCase()) errors.push("execution source plan filename does not match digest");
    if (!repositoryRoot) errors.push("schema 3.0 execution validation requires --root");
    else {
      const supplied = containedPath(repositoryRoot, planPath, "execution source plan");
      if (supplied.relative !== execution.sourcePlan.path) errors.push("supplied plan path does not match execution source plan path");
    }
    try {
      const stat = lstatSync(path.resolve(planPath));
      const supplied = containedPath(repositoryRoot, planPath, "execution source plan");
      if (!stat.isFile() || stat.nlink !== 1 || !sameFilesystemPath(realpathSync(path.resolve(planPath)), supplied.expectedCandidate)) {
        errors.push("execution source plan snapshot must be one regular file without links");
      }
    } catch (error) {
      errors.push(`execution source plan snapshot is unavailable: ${error.message}`);
    }
  }
  if (execution.sourcePlan?.planId !== plan.planId) errors.push("execution source plan ID does not match plan");
  if (execution.sourcePlan?.sourceReview !== plan.sourceReview) errors.push("execution source review does not match plan");
  if (execution.sourcePlan?.sha256 !== planSha256) errors.push("execution source plan digest does not match plan");

  const planItems = new Map((plan.items ?? []).map((item) => [item.id, item]));
  const milestones = new Map((plan.milestones ?? []).map((milestone) => [milestone.id, milestone]));
  const selection = execution.selection ?? {};
  let directIds = [];
  if (selection.mode === "all") directIds = [...planItems.keys()];
  else if (selection.mode === "phase") {
    const milestone = milestones.get(selection.value);
    if (!milestone) errors.push(`selected phase '${selection.value}' does not exist`);
    else directIds = milestone.itemIds ?? [];
  } else if (selection.mode === "finding") {
    if (!/^AUD-[0-9]{4,}$/.test(selection.value ?? "")) errors.push("finding selection must be an AUD ID");
    directIds = [...planItems.values()].filter((item) => item.findingIds?.includes(selection.value)).map((item) => item.id);
    if (directIds.length === 0) errors.push(`selected finding '${selection.value}' does not exist in plan`);
  } else if (selection.mode === "resume") {
    directIds = (execution.items ?? []).map((item) => item.id);
    if (!resumeRoot) errors.push("resume validation requires --resume-root");
  } else errors.push(`unsupported execution selection mode '${selection.mode}'`);

  const selected = new Set(directIds);
  const prerequisites = new Set();
  function includePrerequisites(itemId, visiting = new Set()) {
    if (visiting.has(itemId)) {
      errors.push(`execution dependency cycle includes '${itemId}'`);
      return;
    }
    const item = planItems.get(itemId);
    if (!item) {
      errors.push(`selected item '${itemId}' does not exist in plan`);
      return;
    }
    const nextVisiting = new Set(visiting).add(itemId);
    for (const dependencyId of item.dependsOn ?? []) {
      if (!selected.has(dependencyId)) prerequisites.add(dependencyId);
      selected.add(dependencyId);
      includePrerequisites(dependencyId, nextVisiting);
    }
  }
  for (const itemId of directIds) includePrerequisites(itemId);
  if (selection.mode !== "resume" && !sameMembers(selection.includedPrerequisites, prerequisites)) {
    errors.push("included prerequisites do not match selected plan dependencies");
  }

  const executionItems = new Map();
  for (const item of execution.items ?? []) {
    if (executionItems.has(item.id)) errors.push(`execution item '${item.id}' is duplicated`);
    executionItems.set(item.id, item);
  }
  if (!sameMembers(executionItems.keys(), selected)) errors.push("execution items do not match selected scope and prerequisites");

  const checkpoints = new Map();
  for (const checkpoint of execution.checkpoints ?? []) {
    if (checkpoints.has(checkpoint.id)) errors.push(`checkpoint '${checkpoint.id}' is duplicated`);
    checkpoints.set(checkpoint.id, checkpoint);
  }
  const completed = new Set();
  for (const [itemId, item] of executionItems) {
    const planned = planItems.get(itemId);
    if (!planned) continue;
    if (!sameMembers(item.findingIds, planned.findingIds)) errors.push(`item '${itemId}' finding IDs do not match plan`);
    const expectedPhases = (plan.milestones ?? []).filter((milestone) => milestone.itemIds?.includes(itemId)).map((milestone) => milestone.id);
    if (!sameMembers(item.phaseIds, expectedPhases)) errors.push(`item '${itemId}' phase IDs do not match plan`);
    if (item.status === "completed") {
      completed.add(itemId);
      if (!(item.validation?.length > 0) || item.validation.some((check) => check.status !== "passed" || check.exitCode !== 0)) {
        errors.push(`completed item '${itemId}' must have only passing validation with exit code 0`);
      }
      if (!item.checkpointId) errors.push(`completed item '${itemId}' must reference a checkpoint`);
      else if (!checkpoints.get(item.checkpointId)?.completedItemIds?.includes(itemId)) errors.push(`completed item '${itemId}' is absent from its checkpoint`);
    }
  }
  for (const itemId of completed) {
    for (const dependencyId of planItems.get(itemId)?.dependsOn ?? []) {
      if (!completed.has(dependencyId)) errors.push(`completed item '${itemId}' depends on incomplete item '${dependencyId}'`);
    }
  }

  if (execution.status === "completed" && [...selected].some((itemId) => !completed.has(itemId))) {
    errors.push("completed execution contains unresolved selected items");
  }
  const remainingIds = [...planItems.keys()].filter((itemId) => !completed.has(itemId));
  const remainingFindings = [...new Set(remainingIds.flatMap((itemId) => planItems.get(itemId)?.findingIds ?? []))];
  const remainingPhases = (plan.milestones ?? []).filter((milestone) => milestone.itemIds?.some((itemId) => remainingIds.includes(itemId))).map((milestone) => milestone.id);
  if (!sameMembers(execution.remaining?.itemIds, remainingIds)) errors.push("remaining item IDs do not match incomplete plan items");
  if (!sameMembers(execution.remaining?.findingIds, remainingFindings)) errors.push("remaining finding IDs do not match incomplete plan items");
  if (!sameMembers(execution.remaining?.phaseIds, remainingPhases)) errors.push("remaining phase IDs do not match incomplete plan items");

  const finalCheckpoint = execution.checkpoints?.at(-1);
  if (execution.status === "completed") {
    if (finalCheckpoint?.status !== "terminal") errors.push("completed execution must end with a terminal checkpoint");
    if (!sameMembers(finalCheckpoint?.completedItemIds, completed)) errors.push("terminal checkpoint completed items do not match execution");
    if (!sameMembers(finalCheckpoint?.remainingItemIds, remainingIds)) errors.push("terminal checkpoint remaining items do not match plan");
  }
  if (selection.mode === "all" && execution.status === "completed" && execution.pendingApprovals?.length > 0) {
    errors.push("completed all-scope execution cannot have pending approvals");
  }
  if (selection.mode === "resume" && resumeRoot && finalCheckpoint) {
    const currentRevision = git(resumeRoot, "rev-parse", "HEAD");
    if (finalCheckpoint.repositoryRevision !== currentRevision) errors.push("resume repository revision does not match checkpoint");
    if (finalCheckpoint.worktreeDigest !== worktreeDigest(resumeRoot)) errors.push("resume worktree digest does not match checkpoint");
  }
  if (errors.length) fail(errors);
}

const [command, ...args] = process.argv.slice(2);
let result = { status: "valid", command };
if (command === "findings" && args.length === 1) validateFindings(await loadJson(args[0]));
else if (command === "review" && args.length === 2) validateReview(await loadJson(args[0]), await loadJson(args[1]));
else if (command === "plan" && args.length === 1) validatePlan(await loadJson(args[0]));
else if (command === "execution" && (args.length === 4 || args.length === 6) && args[2] === "--root" && (args.length === 4 || args[4] === "--resume-root")) {
  const planArtifact = await loadJsonArtifact(args[0]);
  await validateExecution(planArtifact.value, await loadJson(args[1]), args[0], planArtifact.sha256, args[3], args[5]);
} else if (command === "checkpoint" && args.length === 1) {
  result = { status: "valid", command, repositoryRevision: git(args[0], "rev-parse", "HEAD"), worktreeDigest: worktreeDigest(args[0]) };
} else if (command === "snapshot" && args.length === 2) {
  result = await snapshotPlan(args[0], args[1]);
} else throw new Error("Use findings <report.json>, review <source.json> <review.json>, plan <plan.json>, execution <plan-snapshot.json> <execution.json> --root PATH [--resume-root PATH], checkpoint <repository-root>, or snapshot <canonical-plan.json> <repository-root>");

console.log(JSON.stringify(result));