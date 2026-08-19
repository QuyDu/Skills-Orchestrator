import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(root, "pso.mjs");

function run(...args) {
  return spawnSync(process.execPath, [runtime, ...args], { cwd: root, encoding: "utf8" });
}

test("configuration parser fails closed for adversarial structured inputs", async () => {
  const invalidConfigurations = [
    null,
    [],
    { schemaVersion: "0.0.0" },
    { schemaVersion: "1.0.0", profile: "../../advanced" },
    { schemaVersion: "1.0.0", platforms: "github-copilot" },
    { schemaVersion: "1.0.0", platforms: { agent: "unknown", ci: "auto" } },
    { schemaVersion: "1.0.0", platforms: { agent: "github-copilot", ci: "unknown" } },
    { schemaVersion: "1.0.0", packs: ["core", "core"] },
    { schemaVersion: "1.0.0", routing: { precedence: ["framework", "framework"] } },
    { schemaVersion: "1.0.0", clarification: true },
    { schemaVersion: "1.0.0", clarification: { enabled: true, maxQuestionsPerRound: 0, blockOnMaterialAmbiguity: true } },
    { schemaVersion: "1.0.0", clarification: { enabled: true, maxQuestionsPerRound: 11, blockOnMaterialAmbiguity: true } },
    { schemaVersion: "1.0.0", clarification: { enabled: true, maxQuestionsPerRound: 3, blockOnMaterialAmbiguity: true, bypassSafety: true } },
    { schemaVersion: "1.0.0", policy: { requireApprovalFor: ["bypass-security"] } },
    { schemaVersion: "1.0.0", __proto__: { polluted: true }, unexpected: true }
  ];
  for (const configuration of invalidConfigurations) {
    const project = await mkdtemp(path.join(os.tmpdir(), "pso-config-fuzz-"));
    try {
      await writeFile(path.join(project, "package.json"), "{\"name\":\"config-fuzz\"}\n", "utf8");
      await mkdir(path.join(project, "config"), { recursive: true });
      await writeFile(path.join(project, "config", "skills-orchestrator.json"), `${JSON.stringify(configuration)}\n`, "utf8");
      const result = run("adopt", "--project", project, "--dry-run");
      assert.notEqual(result.status, 0, `configuration unexpectedly accepted: ${JSON.stringify(configuration)}`);
      assert.match(`${result.stdout}${result.stderr}`, /Error:/);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }
});

test("recovery rejects traversal, absolute, and device-style journal paths", async () => {
  const unsafePaths = ["../outside.txt", "/tmp/outside.txt", "C:/outside.txt", "backup/../../outside.txt", "CON", "config/NUL.txt"];
  for (const unsafePath of unsafePaths) {
    const project = await mkdtemp(path.join(os.tmpdir(), "pso-journal-fuzz-"));
    try {
      await writeFile(path.join(project, "package.json"), "{\"name\":\"journal-fuzz\"}\n", "utf8");
      const transactionId = "unsafe-journal";
      const transactionRoot = path.join(project, ".skills-orchestrator", "transactions", transactionId);
      await mkdir(transactionRoot, { recursive: true });
      const now = new Date().toISOString();
      await writeFile(path.join(transactionRoot, "journal.json"), `${JSON.stringify({
        schemaVersion: "1.0.0",
        transactionId,
        status: "recovery-required",
        projectRoot: project,
        riskAcceptance: { noticeVersion: "1.0.0", acceptedAt: now, method: "cli-flag" },
        createdAt: now,
        updatedAt: now,
        entries: [{ path: unsafePath, originalState: "missing", backup: null }]
      })}\n`, "utf8");
      const result = run("recover", "--project", project, "--transaction", transactionId);
      assert.notEqual(result.status, 0, `unsafe recovery path unexpectedly accepted: ${unsafePath}`);
      assert.match(`${result.stdout}${result.stderr}`, /Unsafe managed path|Invalid recovery journal/);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }
});

test("recovery rejects a tampered journal targeting repository metadata", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-journal-metadata-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"journal-metadata\"}\n", "utf8");
    await mkdir(path.join(project, ".git"), { recursive: true });
    await writeFile(path.join(project, ".git", "sentinel"), "preserve\n", "utf8");
    const transactionId = "tampered-journal";
    const transactionRoot = path.join(project, ".skills-orchestrator", "transactions", transactionId);
    await mkdir(transactionRoot, { recursive: true });
    const now = new Date().toISOString();
    await writeFile(path.join(transactionRoot, "journal.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      transactionId,
      status: "recovery-required",
      projectRoot: project,
      riskAcceptance: { noticeVersion: "1.0.0", acceptedAt: now, method: "cli-flag" },
      createdAt: now,
      updatedAt: now,
      entries: [{ path: ".git", originalState: "missing", backup: null }]
    })}\n`, "utf8");
    const result = run("recover", "--project", project, "--transaction", transactionId);
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(path.join(project, ".git", "sentinel"), "utf8"), "preserve\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("planning rejects a reports directory link outside the project", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-report-link-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-report-outside-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"report-link\"}\n", "utf8");
    await symlink(outside, path.join(project, "reports"), process.platform === "win32" ? "junction" : "dir");
    const result = run("plan", "--root", project, "--intent", "test report confinement");
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Unsafe symbolic link in managed path: reports/);
    assert.equal(existsSync(path.join(outside, "workflow-plan.json")), false);
    assert.equal(existsSync(path.join(outside, "execution-log.jsonl")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("workflow planning refuses a concurrent writer lock", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-plan-lock-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"plan-lock\"}\n", "utf8");
    await mkdir(path.join(project, "reports"), { recursive: true });
    await writeFile(path.join(project, "reports", "workflow-plan.lock"), "existing planner\n", "utf8");
    const result = run("plan", "--root", project, "--intent", "must not race");
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Another workflow planner holds/);
    assert.equal(existsSync(path.join(project, "reports", "workflow-plan.json")), false);
    assert.equal(existsSync(path.join(project, "reports", "execution-log.jsonl")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
