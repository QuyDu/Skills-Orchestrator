import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(root, "pso.mjs");
const expectedSkillCount = (await readdir(path.join(root, ".github", "skills"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).length;

function runAdoption(project, mode, options = ["--profile", "core"]) {
  const mutationOptions = mode === "--apply" ? ["--accept-risk"] : [];
  const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, ...options, mode, ...mutationOptions], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, `${mode} failed:\n${result.stdout}\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

test("clone-setup clones a GitHub repository and publishes only after verified adoption", async (context) => {
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (git.status !== 0) return context.skip("Git is required for clone-setup validation");
  const source = await mkdtemp(path.join(os.tmpdir(), "pso-clone-source-"));
  const destinationParent = await mkdtemp(path.join(os.tmpdir(), "pso-clone-target-"));
  const destination = path.join(destinationParent, "cloned-fixture");
  const repository = "https://github.com/example/cloned-fixture.git";
  try {
    assert.equal(spawnSync("git", ["init", "--initial-branch=main"], { cwd: source }).status, 0);
    await writeFile(path.join(source, "package.json"), "{\"name\":\"cloned-fixture\"}\n", "utf8");
    assert.equal(spawnSync("git", ["add", "package.json"], { cwd: source }).status, 0);
    assert.equal(spawnSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture"], { cwd: source }).status, 0);
    const sourceUrl = pathToFileURL(source).href;
    const result = spawnSync(process.execPath, [runtime, "clone-setup", "--repository", repository, "--destination", destination, "--profile", "core", "--accept-risk"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: `url.${sourceUrl}.insteadOf`,
        GIT_CONFIG_VALUE_0: repository
      }
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(existsSync(path.join(destination, ".git")));
    assert.ok(existsSync(path.join(destination, ".github", "skills", "project-skills-orchestrator", "SKILL.md")));
    const manifest = JSON.parse(await readFile(path.join(destination, "project-orchestrator.json"), "utf8"));
    assert.equal(manifest.projectName, "cloned-fixture");
    const verification = JSON.parse(await readFile(path.join(destination, "reports", "adoption-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
    assert.equal(verification.checks.frameworkSkills, expectedSkillCount);
    assert.deepEqual((await readdir(destinationParent)).filter((entry) => entry.startsWith(".pso-clone-")), []);
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(destinationParent, { recursive: true, force: true });
  }
});

test("clone-setup rejects unsafe repository locations before creating a destination", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-clone-reject-"));
  try {
    const repositories = [
      "https://user:token@github.com/owner/project.git",
      "https://gitlab.com/owner/project.git",
      "https://github.com/owner/project.git?ref=main",
      "file:///tmp/project"
    ];
    for (const [index, repository] of repositories.entries()) {
      const destination = path.join(parent, `target-${index}`);
      const result = spawnSync(process.execPath, [runtime, "clone-setup", "--repository", repository, "--destination", destination, "--accept-risk"], {
        cwd: root,
        encoding: "utf8"
      });
      assert.notEqual(result.status, 0, repository);
      assert.ok(!existsSync(destination), repository);
    }
    const existingDestination = path.join(parent, "existing");
    await mkdir(existingDestination);
    const existing = spawnSync(process.execPath, [runtime, "clone-setup", "--repository", "https://github.com/owner/project.git", "--destination", existingDestination, "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(existing.status, 0);
    assert.match(`${existing.stdout}${existing.stderr}`, /must not already exist/);
    assert.deepEqual(await readdir(existingDestination), []);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("clone-setup derives the local folder from the repository name", async () => {
  const result = spawnSync(process.execPath, [runtime, "clone-setup", "--repository", "https://github.com/owner/derived-project.git"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /Use --repository with a GitHub URL and --destination/);
  assert.match(`${result.stdout}${result.stderr}`, /acknowledge and accept these risks/);
});

test("rerun adoption synchronizes updates, wiring, and legacy skill IDs", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-rerun-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"adoption-rerun-fixture\"}\n", "utf8");
    await writeFile(path.join(project, "AGENTS.md"), "Keep this project-specific agent instruction.\n", "utf8");
    runAdoption(project, "--apply");

    const auditPath = path.join(project, ".github", "skills", "audit-code", "SKILL.md");
    await writeFile(auditPath, `${await readFile(auditPath, "utf8")}\nStale installed content.\n`, "utf8");
    const obsoletePackageFile = path.join(project, ".github", "skills", "policy-engine", "obsolete-installed-file.txt");
    await writeFile(obsoletePackageFile, "This file is not part of the current framework skill package.\n", "utf8");

    const currentReview = path.join(project, ".github", "skills", "audit-review-findings");
    const legacyReview = path.join(project, ".github", "skills", "review-audit-findings");
    await rename(currentReview, legacyReview);
    const legacySkillPath = path.join(legacyReview, "SKILL.md");
    const legacySkill = (await readFile(legacySkillPath, "utf8")).replaceAll("audit-review-findings", "review-audit-findings");
    await writeFile(legacySkillPath, legacySkill, "utf8");

    const schemaPath = path.join(project, "schemas", "code-audit-findings.schema.json");
    await writeFile(schemaPath, `${await readFile(schemaPath, "utf8")}\n`, "utf8");
    const profilesPath = path.join(project, "config", "profiles.yaml");
    await writeFile(profilesPath, `${await readFile(profilesPath, "utf8")}\n# stale profile copy\n`, "utf8");
    await writeFile(path.join(project, "config", "orchestrator.yaml"), "frameworkVersion: stale\nprofile: wrong\n", "utf8");
    await writeFile(path.join(project, ".github", "copilot-instructions.md"), "Keep this project-specific instruction.\n", "utf8");
    const customSkillDirectory = path.join(project, ".github", "skills", "custom-consumer");
    await mkdir(customSkillDirectory, { recursive: true });
    const customSkillPath = path.join(customSkillDirectory, "SKILL.md");
    await writeFile(customSkillPath, `---
name: custom-consumer
description: Exercise migration of a project-owned skill dependency.
lifecycle: draft
confidence: low
---

# custom-consumer

## Purpose

Consume reviewed audit findings.

## Preconditions

- Read project instructions.

## Inputs

- Reviewed audit findings.

## Approved Tools and Resources

- Use read-only tools.

## Read and Write Boundaries

- Do not mutate unrelated files.

## Procedure

1. Read the reviewed findings.

## Validation

- Confirm the input is valid.

## Outputs

- No dedicated report.

## Failure Behavior

- Fail when input is missing.

## Approval Gates

No approval is required for read-only work.

## Composition and Dependencies

- review-audit-findings

## Examples

- Consume a reviewed audit report.
`, "utf8");

    const dryRun = runAdoption(project, "--dry-run");
    assert.match(dryRun, /Existing skills to update: [1-9]/);
    assert.match(dryRun, /Project skill references to migrate: 1/);
    assert.match(dryRun, /Framework files to update: [1-9]/);
    assert.match(dryRun, /Wiring files to update: [1-9]/);
    assert.match(dryRun, /Duplicate skills to replace: 1/);

    runAdoption(project, "--apply");

    assert.equal(await readFile(auditPath, "utf8"), await readFile(path.join(root, ".github", "skills", "audit-code", "SKILL.md"), "utf8"));
    assert.ok(!existsSync(obsoletePackageFile));
    const migratedCustomSkill = await readFile(customSkillPath, "utf8");
    assert.match(migratedCustomSkill, /audit-review-findings/);
    assert.doesNotMatch(migratedCustomSkill, /review-audit-findings/);
    assert.ok(existsSync(currentReview));
    assert.ok(!existsSync(legacyReview));
    assert.equal(await readFile(schemaPath, "utf8"), await readFile(path.join(root, "schemas", "code-audit-findings.schema.json"), "utf8"));
    assert.equal(await readFile(profilesPath, "utf8"), await readFile(path.join(root, "config", "profiles.yaml"), "utf8"));

    const instructions = await readFile(path.join(project, ".github", "copilot-instructions.md"), "utf8");
    assert.match(instructions, /Keep this project-specific instruction\./);
    assert.match(instructions, /\.github\/skills\/project-skills-orchestrator\/SKILL\.md/);
    const agentInstructions = await readFile(path.join(project, "AGENTS.md"), "utf8");
    assert.match(agentInstructions, /Keep this project-specific agent instruction\./);
    assert.match(agentInstructions, /\.github\/skills\/project-skills-orchestrator\/SKILL\.md/);
    assert.ok(existsSync(path.join(project, ".vscode", "extensions.json")));
    assert.ok(existsSync(path.join(project, ".vscode", "settings.json")));

    const manifest = JSON.parse(await readFile(path.join(project, "project-orchestrator.json"), "utf8"));
    assert.equal(manifest.frameworkVersion, "9.0.0");
    assert.equal(manifest.runtimeVersion, "1.0.0");
    assert.equal(manifest.conformanceProfile, "core");
    assert.equal(manifest.riskAcceptance.noticeVersion, "1.0.0");
    assert.equal(manifest.riskAcceptance.method, "cli-flag");

    const verification = JSON.parse(await readFile(path.join(project, "reports", "adoption-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
    assert.equal(verification.mode, "existing-project-adoption");
    assert.equal(verification.checks.frameworkSkills, expectedSkillCount);
    assert.equal(verification.checks.clarificationConfigured, true);
    assert.equal(verification.checks.profilesCurrent, true);
    assert.equal(verification.checks.inventoryCurrent, true);
    assert.equal(verification.checks.orchestratorConfigured, true);
    assert.equal(verification.checks.copilotRouted, true);
    assert.equal(verification.checks.agentInstructionsRouted, true);
    assert.equal(verification.checks.workspaceSupportPresent, true);
    assert.equal(verification.checks.legacySkillsRemoved, true);

    const persistedPlan = JSON.parse(await readFile(path.join(project, "reports", "adoption-plan.json"), "utf8"));
    assert.ok(!Object.hasOwn(persistedPlan, "projectRoot"));
    assert.equal(persistedPlan.project.name, path.basename(project));

    const backupsRoot = path.join(project, ".skills-orchestrator", "transactions");
    assert.ok(existsSync(backupsRoot));
    const transactionDirectories = await readdir(backupsRoot);
    const journal = JSON.parse(await readFile(path.join(backupsRoot, transactionDirectories[0], "journal.json"), "utf8"));
    assert.equal(journal.status, "completed");
    assert.equal(journal.riskAcceptance.noticeVersion, "1.0.0");
    assert.equal(journal.riskAcceptance.method, "cli-flag");
    const secondDryRun = runAdoption(project, "--dry-run");
    assert.match(secondDryRun, /Existing skills to update: 0/);
    assert.match(secondDryRun, /Project skill references to migrate: 0/);
    assert.match(secondDryRun, /Framework files to update: 0/);
    assert.match(secondDryRun, /Wiring files to update: 0/);
    assert.match(secondDryRun, /Duplicate skills to replace: 0/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption resolves project configuration with CLI precedence", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-config-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"adoption-config-fixture\"}\n", "utf8");
    await mkdir(path.join(project, "config"), { recursive: true });
    await writeFile(path.join(project, "config", "skills-orchestrator.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      profile: "durable",
      platforms: { agent: "github-copilot", ci: "manual" },
      packs: ["core"],
      routing: { precedence: ["project-domain", "framework"] },
      clarification: { enabled: true, maxQuestionsPerRound: 5, blockOnMaterialAmbiguity: true },
      policy: { requireApprovalFor: ["external", "privileged", "destructive", "irreversible"] }
    }, null, 2)}\n`, "utf8");

    const configured = runAdoption(project, "--dry-run", []);
    assert.match(configured, /Profile: durable/);

    const overridden = runAdoption(project, "--dry-run", ["--profile", "advanced"]);
    assert.match(overridden, /Profile: advanced/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption rejects unknown project configuration fields", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-invalid-config-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"invalid-config-fixture\"}\n", "utf8");
    await mkdir(path.join(project, "config"), { recursive: true });
    await writeFile(path.join(project, "config", "skills-orchestrator.json"), "{\"schemaVersion\":\"1.0.0\",\"unexpected\":true}\n", "utf8");
    const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--dry-run"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Unknown configuration field: unexpected/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption rejects managed paths that escape through symbolic links", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-symlink-project-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-symlink-outside-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"symlink-fixture\"}\n", "utf8");
    await symlink(outside, path.join(project, ".github"), process.platform === "win32" ? "junction" : "dir");
    const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--dry-run"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Unsafe symbolic link in managed path: \.github/);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("adoption lock prevents concurrent project mutation", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-locked-project-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"locked-fixture\"}\n", "utf8");
    await mkdir(path.join(project, ".skills-orchestrator"), { recursive: true });
    await writeFile(path.join(project, ".skills-orchestrator", "adoption.lock"), "existing transaction\n", "utf8");
    const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--apply", "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Another adoption transaction holds/);
    assert.ok(!existsSync(path.join(project, "project-orchestrator.json")));
    assert.ok(!existsSync(path.join(project, ".github")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("failed validation rolls back every adoption mutation", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-rollback-project-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"rollback-fixture\"}\n", "utf8");
    const projectSkill = path.join(project, ".github", "skills", "project-owned", "SKILL.md");
    await mkdir(path.dirname(projectSkill), { recursive: true });
    const original = "---\nname: project-owned\ndescription: Deliberately incomplete project fixture.\nlifecycle: draft\nconfidence: low\n---\n\n# project-owned\n";
    await writeFile(projectSkill, original, "utf8");

    const result = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--apply", "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Adoption failed and was rolled back/);
    assert.equal(await readFile(projectSkill, "utf8"), original);
    assert.ok(!existsSync(path.join(project, ".github", "skills", "project-skills-orchestrator")));
    assert.ok(!existsSync(path.join(project, "project-orchestrator.json")));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("recover restores an interrupted transaction from its persistent journal", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-recover-project-"));
  try {
    const canonicalProject = await realpath(project);
    await writeFile(path.join(project, "package.json"), "{\"name\":\"recover-fixture\"}\n", "utf8");
    await writeFile(path.join(project, "project-orchestrator.json"), "modified\n", "utf8");
    const transactionId = "interrupted-fixture";
    const transaction = path.join(project, ".skills-orchestrator", "transactions", transactionId);
    await mkdir(path.join(transaction, "backup"), { recursive: true });
    const original = "original\n";
    await writeFile(path.join(transaction, "backup", "project-orchestrator.json"), original, "utf8");
    await writeFile(path.join(transaction, "journal.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      transactionId,
      status: "applying",
      projectRoot: canonicalProject,
      riskAcceptance: { noticeVersion: "1.0.0", acceptedAt: new Date().toISOString(), method: "cli-flag" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      entries: [{ path: "project-orchestrator.json", originalState: `file:sha256:${createHash("sha256").update(original).digest("hex")}`, backup: "backup/project-orchestrator.json" }]
    }, null, 2)}\n`, "utf8");
    await writeFile(path.join(project, ".skills-orchestrator", "adoption.lock"), `${JSON.stringify({
      transactionId,
      processId: 2147483647,
      startedAt: new Date().toISOString()
    })}\n`, "utf8");

    const result = spawnSync(process.execPath, [runtime, "recover", "--project", project, "--transaction", transactionId], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(await readFile(path.join(project, "project-orchestrator.json"), "utf8"), "original\n");
    assert.ok(!existsSync(path.join(project, ".skills-orchestrator", "adoption.lock")));
    const journal = JSON.parse(await readFile(path.join(transaction, "journal.json"), "utf8"));
    assert.equal(journal.status, "rolled-back");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("recover removes partial writes after forced process termination", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-forced-interruption-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"forced-interruption-fixture\"}\n", "utf8");
    const interrupted = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--apply", "--accept-risk"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test", PSO_TEST_INTERRUPT_AFTER_FIRST_WRITE: "1" }
    });
    assert.equal(interrupted.status, 86, `${interrupted.stdout}\n${interrupted.stderr}`);
    const lockPath = path.join(project, ".skills-orchestrator", "adoption.lock");
    assert.ok(existsSync(lockPath));
    const lock = JSON.parse(await readFile(lockPath, "utf8"));

    const recovered = spawnSync(process.execPath, [runtime, "recover", "--project", project, "--transaction", lock.transactionId], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(recovered.status, 0, `${recovered.stdout}\n${recovered.stderr}`);
    assert.ok(!existsSync(path.join(project, ".github", "skills", "project-skills-orchestrator")));
    assert.ok(!existsSync(path.join(project, "project-orchestrator.json")));
    assert.ok(!existsSync(lockPath));
    const journal = JSON.parse(await readFile(path.join(project, ".skills-orchestrator", "transactions", lock.transactionId, "journal.json"), "utf8"));
    assert.equal(journal.status, "rolled-back");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("create-project rejects a symbolic-link destination", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-create-parent-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-create-outside-"));
  try {
    await symlink(outside, path.join(parent, "linked-project"), process.platform === "win32" ? "junction" : "dir");
    const result = spawnSync(process.execPath, [runtime, "create-project", "--name", "Linked Project", "--destination", parent, "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Target cannot be a symbolic link/);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(parent, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("mutating installation requires explicit risk acceptance", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-risk-project-"));
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-risk-create-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"risk-fixture\"}\n", "utf8");
    const adoption = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--apply"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(adoption.status, 0);
    assert.match(`${adoption.stdout}${adoption.stderr}`, /explicitly acknowledge and accept these risks/);
    assert.ok(!existsSync(path.join(project, ".github")));

    const creation = spawnSync(process.execPath, [runtime, "create-project", "--name", "Risk Fixture", "--destination", parent], {
      cwd: root,
      encoding: "utf8"
    });
    assert.notEqual(creation.status, 0);
    assert.match(`${creation.stdout}${creation.stderr}`, /--accept-risk/);
    assert.ok(!existsSync(path.join(parent, "risk-fixture")));
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  }
});

test("accepted project creation records the risk acknowledgment", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-risk-record-"));
  try {
    const result = spawnSync(process.execPath, [runtime, "create-project", "--name", "Accepted Fixture", "--destination", parent, "--accept-risk"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const manifest = JSON.parse(await readFile(path.join(parent, "accepted-fixture", "project-orchestrator.json"), "utf8"));
    assert.equal(manifest.riskAcceptance.noticeVersion, "1.0.0");
    assert.equal(manifest.riskAcceptance.method, "cli-flag");
    assert.match(manifest.riskAcceptance.acceptedAt, /^\d{4}-\d{2}-\d{2}T/);
    const created = path.join(parent, "accepted-fixture");
    const inventory = JSON.parse(await readFile(path.join(created, "reports", "skill-inventory.json"), "utf8"));
    assert.equal(inventory.skills.length, expectedSkillCount);
    const verification = JSON.parse(await readFile(path.join(created, "reports", "installation-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
    assert.equal(verification.mode, "new-project-creation");
    assert.equal(verification.checks.frameworkSkills, expectedSkillCount);
    assert.equal(verification.checks.clarificationConfigured, true);
    const configuration = JSON.parse(await readFile(path.join(created, "config", "skills-orchestrator.json"), "utf8"));
    assert.deepEqual(configuration.clarification, {
      enabled: true,
      maxQuestionsPerRound: 3,
      blockOnMaterialAmbiguity: true,
      askEveryPrompt: true,
      questionsPerPrompt: 3,
      confirmPlanBeforeExecution: true
    });
    assert.equal(verification.checks.inventoryCurrent, true);
    assert.equal(verification.checks.copilotRouted, true);
    assert.equal(verification.checks.agentInstructionsRouted, true);
    assert.equal(verification.checks.workspaceSupportPresent, true);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("adoption installs only the scoped instructions the detected stack needs", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-stack-python-"));
  try {
    await writeFile(path.join(project, "pyproject.toml"), "[project]\nname = \"fixture\"\n", "utf8");
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, "src", "app.py"), "value = 1\n", "utf8");

    const dryRun = runAdoption(project, "--dry-run");
    assert.match(dryRun, /Detected stack: python/);
    assert.match(dryRun, /Templates skipped as not applicable: [1-9]/);

    runAdoption(project, "--apply");
    const instructions = await readdir(path.join(project, ".github", "instructions"));
    assert.ok(instructions.includes("clarification.instructions.md"));
    assert.ok(instructions.includes("security.instructions.md"));
    for (const absent of ["bicep.instructions.md", "powershell.instructions.md", "csharp.instructions.md", "typescript.instructions.md"]) {
      assert.ok(!instructions.includes(absent), `${absent} must not be installed into a Python-only repository`);
    }

    const plan = JSON.parse(await readFile(path.join(project, "reports", "adoption-plan.json"), "utf8"));
    const skipped = plan.actions.filter((action) => action.action === "skipped");
    assert.ok(skipped.length > 0);
    for (const action of skipped) assert.match(action.reason, /No detected stack matches/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption reports existing coverage instead of installing a duplicate", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-equivalence-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"equivalence-fixture\"}\n", "utf8");
    await mkdir(path.join(project, ".github", "instructions"), { recursive: true });
    await writeFile(path.join(project, ".github", "instructions", "appsec.instructions.md"), `---
applyTo: "**"
description: Application security rules
---

# AppSec
`, "utf8");

    const dryRun = runAdoption(project, "--dry-run");
    assert.match(dryRun, /Templates covered by existing files: 1/);
    assert.match(dryRun, /covered: \.github\/instructions\/security\.instructions\.md by \.github\/instructions\/appsec\.instructions\.md/);

    runAdoption(project, "--apply");
    const instructions = await readdir(path.join(project, ".github", "instructions"));
    assert.ok(!instructions.includes("security.instructions.md"), "an equivalent project-owned instruction must not be duplicated");
    assert.ok(instructions.includes("clarification.instructions.md"), "the mandatory protocol is never suppressed by equivalence");

    const forced = spawnSync(process.execPath, [runtime, "adopt", "--project", project, "--profile", "core", "--force-templates", "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(`${forced.stdout}`, /Templates covered by existing files: 0/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption recognizes additional ecosystems and refuses unknown directories without an override", async () => {
  const cases = [
    ["pom.xml", "<project></project>\n"],
    ["build.gradle.kts", "plugins { }\n"],
    ["Gemfile", "source 'https://rubygems.org'\n"],
    ["main.tf", "terraform {}\n"],
    ["composer.json", "{\"name\":\"fixture/app\"}\n"]
  ];
  for (const [marker, content] of cases) {
    const project = await mkdtemp(path.join(os.tmpdir(), "pso-ecosystem-"));
    try {
      await writeFile(path.join(project, marker), content, "utf8");
      const dryRun = runAdoption(project, "--dry-run");
      assert.match(dryRun, /Existing project:/, `${marker} must be recognized as an adoptable project`);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }

  const unknown = await mkdtemp(path.join(os.tmpdir(), "pso-unknown-"));
  try {
    await writeFile(path.join(unknown, "notes.txt"), "not a project\n", "utf8");
    const refused = spawnSync(process.execPath, [runtime, "adopt", "--project", unknown, "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.notEqual(refused.status, 0);
    assert.match(`${refused.stdout}${refused.stderr}`, /rerun with --force-adopt/);
    assert.doesNotMatch(`${refused.stdout}${refused.stderr}`, /Use new-project setup instead/);

    const forced = spawnSync(process.execPath, [runtime, "adopt", "--project", unknown, "--force-adopt", "--dry-run"], { cwd: root, encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stderr);
  } finally {
    await rm(unknown, { recursive: true, force: true });
  }
});

test("managed instruction regions survive heading edits without duplicating", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-region-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"region-fixture\"}\n", "utf8");
    runAdoption(project, "--apply");

    const instructionPath = path.join(project, ".github", "copilot-instructions.md");
    const migrated = (await readFile(instructionPath, "utf8"))
      .replaceAll(/<!-- pso:(begin|end) id=[a-z-]+( version=\d+)? -->\r?\n?/g, "")
      .replace("Engagement protocol (mandatory, highest precedence)", "Engagement protocol (our house rules)");
    await writeFile(instructionPath, `${migrated}\nProject-authored trailing note.\n`, "utf8");

    runAdoption(project, "--apply");
    const result = await readFile(instructionPath, "utf8");
    assert.equal([...result.matchAll(/<!-- pso:begin id=clarification-protocol version=1 -->/g)].length, 1);
    assert.equal([...result.matchAll(/Ask exactly three clarifying questions\./g)].length, 1);
    assert.equal([...result.matchAll(/Engagement protocol/g)].length, 1);
    assert.match(result, /Project-authored trailing note\./);

    const verification = JSON.parse(await readFile(path.join(project, "reports", "adoption-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("created projects preinstall dependencies for Copilot cloud agent", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-agent-env-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Agent Env", "--destination", parent, "--stack", "python,bicep", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    const workflow = await readFile(path.join(parent, "agent-env", ".github", "workflows", "copilot-setup-steps.yml"), "utf8");

    assert.match(workflow, /^ {2}copilot-setup-steps:$/m, "the job name must match what Copilot looks for");
    assert.match(workflow, /^ {4}runs-on: ubuntu-latest$/m);
    assert.match(workflow, /^ {6}contents: read$/m);
    assert.match(workflow, /timeout-minutes: 30/);
    assert.match(workflow, /pip install -r requirements\.txt/);
    assert.match(workflow, /az bicep install/);
    assert.doesNotMatch(workflow, /dotnet restore/, "an unrelated stack must not appear");
    for (const match of workflow.matchAll(/^\s*uses:\s*(\S+)\s*$/gm)) {
      assert.match(match[1], /@[a-f0-9]{40}$/, `${match[1]} must be pinned to a full commit SHA`);
    }

    const readme = await readFile(path.join(parent, "agent-env", "README.md"), "utf8");
    assert.match(readme, /Copilot cloud agent/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a project with no declared stack gets no Copilot setup steps to guess with", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-agent-env-bare-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Bare Env", "--destination", parent, "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    assert.ok(!existsSync(path.join(parent, "bare-env", ".github", "workflows", "copilot-setup-steps.yml")));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("the workspace is configured so VS Code discovers every customization without extra setup", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-discovery-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Discovery Demo", "--destination", parent, "--stack", "python", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /Rerun with --open to launch Visual Studio Code automatically\./);
    const project = path.join(parent, "discovery-demo");

    const settings = JSON.parse(await readFile(path.join(project, ".vscode", "settings.json"), "utf8"));
    assert.equal(settings["chat.useAgentsMdFile"], true);
    assert.equal(settings["chat.includeApplyingInstructions"], true);
    assert.equal(settings["chat.includeReferencedInstructions"], true);
    assert.equal(settings["chat.promptFilesRecommendations"], true);
    assert.ok(!Object.hasOwn(settings, "chat.promptFiles"), "the superseded prompt file toggle is not written");
    assert.ok(!Object.hasOwn(settings, "github.copilot.chat.codeGeneration.useInstructionFiles"), "the deprecated instruction setting is not written");

    for (const relative of [
      ".github/copilot-instructions.md",
      "AGENTS.md",
      ".github/instructions/clarification.instructions.md",
      ".github/prompts/create-adr.prompt.md",
      ".github/agents/security-reviewer.agent.md",
      ".github/skills/clarify-the-ask/SKILL.md"
    ]) {
      assert.ok(existsSync(path.join(project, relative)), `${relative} must exist in a default discovery location`);
    }

    const readme = await readFile(path.join(project, "README.md"), "utf8");
    assert.match(readme, /workspace trust/i);
    assert.match(readme, /recommended extensions/i);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("--open reports its outcome and never fails project creation", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-open-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Open Demo", "--destination", parent, "--accept-risk", "--open"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PSO_SUPPRESS_EDITOR_LAUNCH: "1" }
    });
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /Could not open Visual Studio Code automatically/);
    assert.doesNotMatch(created.stdout, /Rerun with --open/);
    const verification = JSON.parse(await readFile(path.join(parent, "open-demo", "reports", "installation-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");

    const help = spawnSync(process.execPath, [runtime, "--help"], { cwd: root, encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--open launches Visual Studio Code/);
    assert.match(help.stdout, /--stack is optional/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("created projects wire a usable VS Code workspace for the declared stack", async () => {  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-workspace-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Workspace Demo", "--destination", parent, "--stack", "csharp,bicep", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "workspace-demo");

    const extensions = JSON.parse(await readFile(path.join(project, ".vscode", "extensions.json"), "utf8"));
    assert.ok(extensions.recommendations.includes("github.copilot"));
    assert.ok(extensions.recommendations.includes("editorconfig.editorconfig"));
    assert.ok(extensions.recommendations.includes("ms-dotnettools.csdevkit"), "a C# project recommends the C# Dev Kit");
    assert.ok(extensions.recommendations.includes("ms-azuretools.vscode-bicep"), "a Bicep project recommends the Bicep extension");
    assert.ok(!extensions.recommendations.includes("ms-python.python"), "an unrelated language extension is not recommended");
    assert.equal(new Set(extensions.recommendations).size, extensions.recommendations.length, "recommendations are unique");

    const tasks = JSON.parse(await readFile(path.join(project, ".vscode", "tasks.json"), "utf8"));
    assert.equal(tasks.version, "2.0.0");
    const build = tasks.tasks.find((task) => task.label === "build");
    const test = tasks.tasks.find((task) => task.label === "test");
    assert.equal(build.command, "dotnet build");
    assert.equal(build.group.isDefault, true);
    assert.equal(test.command, "dotnet test");
    assert.equal(test.group.kind, "test");
    assert.ok(tasks.tasks.some((task) => task.label === "validate: bicep"));

    const launch = JSON.parse(await readFile(path.join(project, ".vscode", "launch.json"), "utf8"));
    assert.equal(launch.version, "0.2.0");
    assert.equal(launch.configurations.length, 1);
    assert.equal(launch.configurations[0].type, "coreclr");
    assert.equal(launch.configurations[0].preLaunchTask, "build");

    const attributes = await readFile(path.join(project, ".gitattributes"), "utf8");
    assert.match(attributes, /^\* text=auto eol=lf$/m);
    assert.match(attributes, /^\*\.ps1 text eol=crlf$/m);

    const readme = await readFile(path.join(project, "README.md"), "utf8");
    assert.match(readme, /Ctrl\+Shift\+B/);
    assert.match(readme, /REPLACE_WITH_/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("a project with no declared stack gets no misleading build or debug configuration", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-workspace-bare-"));
  try {
    const created = spawnSync(process.execPath, [runtime, "create-project", "--name", "Bare Workspace", "--destination", parent, "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    const project = path.join(parent, "bare-workspace");

    assert.ok(!existsSync(path.join(project, ".vscode", "tasks.json")), "no build task is invented without a stack");
    assert.ok(!existsSync(path.join(project, ".vscode", "launch.json")), "no debug configuration is invented without a stack");
    assert.ok(existsSync(path.join(project, ".gitattributes")), "line ending normalization always applies");

    const extensions = JSON.parse(await readFile(path.join(project, ".vscode", "extensions.json"), "utf8"));
    assert.deepEqual(extensions.recommendations, ["github.copilot", "github.copilot-chat", "editorconfig.editorconfig"]);

    const readme = await readFile(path.join(project, "README.md"), "utf8");
    assert.match(readme, /Rerun setup with `--stack`/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("adoption adds workspace tasks and debug configuration from the detected stack", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-workspace-adopt-"));
  try {
    await writeFile(path.join(project, "pyproject.toml"), "[project]\nname = \"fixture\"\n", "utf8");
    await mkdir(path.join(project, "src"), { recursive: true });
    await writeFile(path.join(project, "src", "app.py"), "value = 1\n", "utf8");
    runAdoption(project, "--apply");

    const tasks = JSON.parse(await readFile(path.join(project, ".vscode", "tasks.json"), "utf8"));
    assert.equal(tasks.tasks.find((task) => task.label === "test").command, "python -m pytest");

    const launch = JSON.parse(await readFile(path.join(project, ".vscode", "launch.json"), "utf8"));
    assert.equal(launch.configurations[0].type, "debugpy");
    assert.equal(launch.configurations[0].program, "${file}");

    const extensions = JSON.parse(await readFile(path.join(project, ".vscode", "extensions.json"), "utf8"));
    assert.ok(extensions.recommendations.includes("ms-python.python"));
    assert.ok(!extensions.recommendations.includes("ms-dotnettools.csdevkit"));

    assert.ok(existsSync(path.join(project, ".gitattributes")));
    runAdoption(project, "--dry-run");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("adoption never overwrites a project's own workspace configuration", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-workspace-preserve-"));
  try {
    await writeFile(path.join(project, "package.json"), "{\"name\":\"preserve-fixture\"}\n", "utf8");
    await mkdir(path.join(project, ".vscode"), { recursive: true });
    const ownTasks = "{\n  \"version\": \"2.0.0\",\n  \"tasks\": [{ \"label\": \"my own build\", \"type\": \"shell\", \"command\": \"make\" }]\n}\n";
    await writeFile(path.join(project, ".vscode", "tasks.json"), ownTasks, "utf8");
    await writeFile(path.join(project, ".gitattributes"), "# project owned\n", "utf8");

    runAdoption(project, "--apply");
    assert.equal(await readFile(path.join(project, ".vscode", "tasks.json"), "utf8"), ownTasks);
    assert.equal(await readFile(path.join(project, ".gitattributes"), "utf8"), "# project owned\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("created projects wire real continuous integration for a declared stack", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "pso-ci-"));
  try {
    const declared = spawnSync(process.execPath, [runtime, "create-project", "--name", "Ci Declared", "--destination", parent, "--stack", "typescript", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(declared.status, 0, declared.stderr);
    const declaredWorkflow = await readFile(path.join(parent, "ci-declared", ".github", "workflows", "ci.yml"), "utf8");
    assert.match(declaredWorkflow, /run: npm ci/);
    assert.match(declaredWorkflow, /run: npm test/);
    assert.doesNotMatch(declaredWorkflow, /exit 1/);
    for (const match of declaredWorkflow.matchAll(/^\s*uses:\s*(\S+)\s*$/gm)) {
      assert.match(match[1], /@[a-f0-9]{40}$/, `${match[1]} must be pinned to a full commit SHA`);
    }
    const manifest = JSON.parse(await readFile(path.join(parent, "ci-declared", "project-orchestrator.json"), "utf8"));
    assert.deepEqual(manifest.declaredStack, ["javascript", "typescript"]);

    const bare = spawnSync(process.execPath, [runtime, "create-project", "--name", "Ci Bare", "--destination", parent, "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.equal(bare.status, 0, bare.stderr);
    const bareWorkflow = await readFile(path.join(parent, "ci-bare", ".github", "workflows", "ci.yml"), "utf8");
    assert.match(bareWorkflow, /exit 1/);
    assert.doesNotMatch(bareWorkflow, /echo "Configure the build command/);
    const bareReadme = await readFile(path.join(parent, "ci-bare", "README.md"), "utf8");
    assert.match(bareReadme, /does not yet contain application code/);

    const rejected = spawnSync(process.execPath, [runtime, "create-project", "--name", "Ci Bad", "--destination", parent, "--stack", "cobol", "--accept-risk"], { cwd: root, encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(`${rejected.stdout}${rejected.stderr}`, /Unknown --stack value: cobol/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

