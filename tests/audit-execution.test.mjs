import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const validator = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs");

function run(...args) {
  return spawnSync(process.execPath, [validator, ...args], { cwd: root, encoding: "utf8" });
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function plan() {
  return {
    schemaVersion: "2.0.0",
    planId: "PLAN-TEST",
    sourceReview: "reports/code-audit-review.json",
    prioritization: ["prerequisite", "complexity"],
    milestones: [
      { id: "P2", itemIds: ["REM-0203"] },
      { id: "P3", itemIds: ["REM-0204"] }
    ],
    items: [
      { id: "REM-0203", findingIds: ["AUD-0203"], dependsOn: [], complexity: "medium", complexityRationale: "Test fixture." },
      { id: "REM-0204", findingIds: ["AUD-0204"], dependsOn: ["REM-0203"], complexity: "high", complexityRationale: "Test fixture." }
    ]
  };
}

function execution(planSnapshot) {
  return {
    schemaVersion: "3.0.0",
    executionId: "EXEC-TEST",
    sourcePlan: {
      path: planSnapshot.path,
      planId: "PLAN-TEST",
      sha256: planSnapshot.sha256,
      sourceReview: "reports/code-audit-review.json"
    },
    selection: { mode: "phase", value: "P2", includedPrerequisites: [] },
    status: "completed",
    items: [{
      id: "REM-0203",
      findingIds: ["AUD-0203"],
      phaseIds: ["P2"],
      status: "completed",
      changedPaths: ["schemas/audit-remediation-execution.schema.json"],
      validation: [{ command: "node --test", status: "passed", exitCode: 0, evidence: "passed" }],
      approvals: ["P2 approved"],
      residualRisk: "Re-audit required.",
      rollbackStatus: "not-required",
      checkpointId: "CP-P2"
    }],
    checkpoints: [{
      id: "CP-P2",
      status: "terminal",
      completedItemIds: ["REM-0203"],
      remainingItemIds: ["REM-0204"],
      repositoryRevision: "a".repeat(40),
      worktreeDigest: "b".repeat(64)
    }],
    remaining: { itemIds: ["REM-0204"], findingIds: ["AUD-0204"], phaseIds: ["P3"] },
    pendingApprovals: ["P3 requires external approval."],
    limitations: [],
    nextAction: { status: "approval-required", action: "Approve P3." }
  };
}

async function withArtifacts(action) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pso-audit-execution-"));
  const repository = path.join(directory, "repository");
  const reports = path.join(repository, "reports");
  const canonicalPlanPath = path.join(reports, "audit-remediation-plan.json");
  const executionPath = path.join(directory, "execution.json");
  try {
    await mkdir(reports, { recursive: true });
    const planText = `${JSON.stringify(plan())}\n`;
    await writeFile(canonicalPlanPath, planText, "utf8");
    const snapshotResult = run("snapshot", canonicalPlanPath, repository);
    assert.equal(snapshotResult.status, 0, snapshotResult.stderr);
    const snapshot = JSON.parse(snapshotResult.stdout);
    const repeatedSnapshot = run("snapshot", canonicalPlanPath, repository);
    assert.equal(repeatedSnapshot.status, 0, repeatedSnapshot.stderr);
    assert.deepEqual(JSON.parse(repeatedSnapshot.stdout), snapshot);
    const planPath = path.join(repository, ...snapshot.path.split("/"));
    const validate = (...extra) => run("execution", planPath, executionPath, "--root", repository, ...extra);
    await action({ repository, canonicalPlanPath, planPath, executionPath, validate, value: execution(snapshot) });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("execution validation accepts completed selected scope with unselected work remaining", async () => {
  await withArtifacts(async ({ executionPath, validate, value }) => {
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    const result = validate();
    assert.equal(result.status, 0, result.stderr);
  });
});

test("immutable plan snapshot survives canonical replacement", async () => {
  await withArtifacts(async ({ canonicalPlanPath, executionPath, validate, value }) => {
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.equal(validate().status, 0);
    await writeFile(canonicalPlanPath, `${JSON.stringify({ ...plan(), planId: "PLAN-NEXT" })}\n`, "utf8");
    assert.equal(validate().status, 0);
  });
});

test("immutable plan snapshot rejects tampering and escaping paths", async () => {
  await withArtifacts(async ({ planPath, executionPath, validate, value }) => {
    value.sourcePlan.path = "../outside.json";
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.notEqual(validate().status, 0);
    value.sourcePlan.path = `reports/audit-remediation-plans/${value.sourcePlan.sha256}.json`;
    await writeFile(planPath, "{}\n", "utf8");
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.notEqual(validate().status, 0);
  });
});

test("execution validation rejects illegal terminal states", async () => {
  const mutations = [
    ["plan digest mismatch", (value) => { value.sourcePlan.sha256 = "0".repeat(64); }],
    ["invalid phase selector", (value) => { value.selection.value = "missing"; }],
    ["invalid finding selector", (value) => { value.selection.mode = "finding"; value.selection.value = "not-an-audit-id"; }],
    ["unvalidated completion", (value) => { value.items[0].validation = []; }],
    ["failed validation", (value) => { value.items[0].validation[0].status = "failed"; value.items[0].validation[0].exitCode = 1; }],
    ["missing checkpoint", (value) => { value.items[0].checkpointId = null; }],
    ["missing checkpoint membership", (value) => { value.checkpoints[0].completedItemIds = []; }],
    ["duplicate checkpoint IDs", (value) => { value.checkpoints.push(structuredClone(value.checkpoints[0])); }],
    ["unresolved selected item", (value) => { value.items[0].status = "running"; }],
    ["remaining set mismatch", (value) => { value.remaining.itemIds = []; }]
  ];
  for (const [name, mutate] of mutations) {
    await withArtifacts(async ({ executionPath, validate, value }) => {
      mutate(value);
      await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
      const result = validate();
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, /Audit validation failed/);
    });
  }
});

test("execution validation rejects completed dependents when prerequisites did not complete", async () => {
  await withArtifacts(async ({ executionPath, validate, value }) => {
    value.selection = { mode: "phase", value: "P3", includedPrerequisites: ["REM-0203"] };
    value.items[0].status = "failed";
    value.items[0].checkpointId = null;
    value.items.push({
      ...structuredClone(value.items[0]),
      id: "REM-0204",
      findingIds: ["AUD-0204"],
      phaseIds: ["P3"],
      status: "completed",
      checkpointId: "CP-P2"
    });
    value.checkpoints[0].completedItemIds = ["REM-0204"];
    value.checkpoints[0].remainingItemIds = ["REM-0203"];
    value.remaining = { itemIds: ["REM-0203"], findingIds: ["AUD-0203"], phaseIds: ["P2"] };
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.notEqual(validate().status, 0);
  });
});

test("all-scope completion rejects pending approvals", async () => {
  await withArtifacts(async ({ executionPath, validate, value }) => {
    value.selection = { mode: "all", value: null, includedPrerequisites: [] };
    value.items.push({
      ...structuredClone(value.items[0]),
      id: "REM-0204",
      findingIds: ["AUD-0204"],
      phaseIds: ["P3"]
    });
    value.checkpoints[0].completedItemIds = ["REM-0203", "REM-0204"];
    value.checkpoints[0].remainingItemIds = [];
    value.remaining = { itemIds: [], findingIds: [], phaseIds: [] };
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.notEqual(validate().status, 0);
    value.pendingApprovals = [];
    value.nextAction = { status: "complete", action: "No work remains." };
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.equal(validate().status, 0);
  });
});

test("resume validation rejects repository and same-status content drift", async () => {
  await withArtifacts(async ({ executionPath, validate, value }) => {
    const resumeRepository = path.join(path.dirname(executionPath), "resume-repository");
    await mkdir(resumeRepository);
    git(resumeRepository, "init", "--quiet");
    git(resumeRepository, "config", "user.name", "Audit Test");
    git(resumeRepository, "config", "user.email", "audit@example.invalid");
    await writeFile(path.join(resumeRepository, "tracked.txt"), "baseline\n", "utf8");
    git(resumeRepository, "add", "tracked.txt");
    git(resumeRepository, "commit", "--quiet", "-m", "baseline");
    value.selection = { mode: "resume", value: null, includedPrerequisites: [] };
    await writeFile(path.join(resumeRepository, "tracked.txt"), "first change\n", "utf8");
    const checkpoint = JSON.parse(run("checkpoint", resumeRepository).stdout);
    value.checkpoints[0].repositoryRevision = checkpoint.repositoryRevision;
    value.checkpoints[0].worktreeDigest = checkpoint.worktreeDigest;
    await writeFile(executionPath, `${JSON.stringify(value)}\n`, "utf8");
    assert.equal(validate("--resume-root", resumeRepository).status, 0);
    await mkdir(path.join(resumeRepository, "reports"));
    await writeFile(path.join(resumeRepository, "reports", "audit-remediation-execution.json"), "state update\n", "utf8");
    assert.equal(validate("--resume-root", resumeRepository).status, 0);
    await writeFile(path.join(resumeRepository, "tracked.txt"), "second change\n", "utf8");
    const result = validate("--resume-root", resumeRepository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /worktree digest/i);
  });
});