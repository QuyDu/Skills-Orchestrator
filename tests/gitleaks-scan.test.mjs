import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const runner = path.join(root, ".github", "skills", "audit-code", "scripts", "gitleaks-scan.mjs");

function run(cwd, ...args) {
  return spawnSync(process.execPath, [runner, ...args], { cwd, encoding: "utf8" });
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function secretFixture(value) {
  return `${["api", "key"].join("_")} = ${JSON.stringify(value)}\n`;
}

test("gitleaks scans reports, staged content, and reachable history without reporting values", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-gitleaks-"));
  try {
    await writeFile(path.join(project, "package.json"), "{}\n", "utf8");
    await writeFile(path.join(project, ".gitleaks.toml"), "[extend]\nuseDefault = true\n", "utf8");
    await mkdir(path.join(project, "config"));
    await writeFile(path.join(project, "config", "gitleaks-allowlist.json"), '{"schemaVersion":"1.0.0","entries":[]}\n', "utf8");
    git(project, "init", "--quiet");
    git(project, "config", "user.name", "Audit Test");
    git(project, "config", "user.email", "audit@example.invalid");
    await writeFile(path.join(project, "baseline.txt"), "clean\n", "utf8");
    git(project, "add", ".");
    git(project, "commit", "--quiet", "-m", "baseline");
    const synthetic = ["aB3dE5fG7hJ9kL2m", "N4pQ6rS8tV1xY3zC"].join("");
    await writeFile(path.join(project, "history.txt"), secretFixture(synthetic), "utf8");
    git(project, "add", "history.txt");
    git(project, "commit", "--quiet", "-m", "seed history");
    await rm(path.join(project, "history.txt"));
    git(project, "add", "-A");
    git(project, "commit", "--quiet", "-m", "remove history seed");
    await writeFile(path.join(project, "staged-only.txt"), secretFixture(synthetic), "utf8");
    git(project, "add", "staged-only.txt");
    await writeFile(path.join(project, "staged-only.txt"), "clean working tree version\n", "utf8");
    await mkdir(path.join(project, "reports"));
    await writeFile(path.join(project, "reports", "current.txt"), secretFixture(synthetic), "utf8");
    const result = run(project, "scan", "--root", project, "--tool-root", root);
    assert.equal(result.status, 1);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(synthetic));
    const report = JSON.parse(await readFile(path.join(project, "reports", "gitleaks-scan.json"), "utf8"));
    assert.equal(report.status, "failed");
    assert.ok(report.findings.worktree.length > 0);
    assert.ok(report.findings.worktree.some((finding) => finding.path === "reports/current.txt"));
    assert.ok(report.findings.staged.some((finding) => finding.path === "staged-only.txt"));
    assert.ok(report.findings.history.length > 0);
    assert.match(report.scanInputDigest, /^[a-f0-9]{64}$/);
    assert.deepEqual(report.commands.map((command) => command.scope), ["worktree", "staged", "history"]);
    assert.ok(report.commands.every((command) => command.exitCode === 0 && command.command.includes("--redact=100")));
    assert.doesNotMatch(JSON.stringify(report), new RegExp(synthetic));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("gitleaks rejects expired allowlists before scanning", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-gitleaks-expired-"));
  try {
    await mkdir(path.join(project, "config"));
    await writeFile(path.join(project, ".gitleaks.toml"), "[extend]\nuseDefault = true\n", "utf8");
    const policy = {
      schemaVersion: "1.0.0",
      entries: [{
        id: "expired",
        description: "Expired fixture",
        owner: "test",
        reviewedBy: "test reviewer",
        reviewedAt: "2019-01-01T00:00:00.000Z",
        expiresAt: "2020-01-01T00:00:00.000Z",
        targetRules: ["generic-api-key"],
        paths: ["^fixture$"],
        regexTarget: "line",
        regexes: ["^fixture$"]
      }]
    };
    await writeFile(path.join(project, "config", "gitleaks-allowlist.json"), `${JSON.stringify(policy)}\n`, "utf8");
    const result = run(project, "scan", "--root", project, "--tool-root", root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /allowlist 'expired' expired/i);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("gitleaks scan digest covers ignored distributable files but excludes its own report", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-gitleaks-digest-"));
  try {
    await mkdir(path.join(project, "dist"));
    await writeFile(path.join(project, "dist", "artifact.txt"), "first\n", "utf8");
    const first = run(project, "digest", "--root", project);
    assert.equal(first.status, 0, first.stderr);
    const firstDigest = JSON.parse(first.stdout).scanInputDigest;
    await writeFile(path.join(project, "dist", "artifact.txt"), "second\n", "utf8");
    const secondDigest = JSON.parse(run(project, "digest", "--root", project).stdout).scanInputDigest;
    assert.notEqual(secondDigest, firstDigest);
    await mkdir(path.join(project, "reports"));
    await writeFile(path.join(project, "reports", "gitleaks-scan.json"), "self\n", "utf8");
    const afterReport = JSON.parse(run(project, "digest", "--root", project).stdout).scanInputDigest;
    assert.equal(afterReport, secondDigest);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("gitleaks rejects universal allowlist patterns", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-gitleaks-broad-"));
  try {
    await mkdir(path.join(project, "config"));
    await writeFile(path.join(project, ".gitleaks.toml"), "[extend]\nuseDefault = true\n", "utf8");
    const policy = {
      schemaVersion: "1.0.0",
      entries: [{
        id: "broad",
        description: "Broad fixture",
        owner: "test",
        reviewedBy: "test reviewer",
        reviewedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        targetRules: ["generic-api-key"],
        paths: ["^.*$"],
        regexTarget: "line",
        regexes: ["^.*$"]
      }]
    };
    await writeFile(path.join(project, "config", "gitleaks-allowlist.json"), `${JSON.stringify(policy)}\n`, "utf8");
    const result = run(project, "scan", "--root", project, "--tool-root", root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /allowlist 'broad' must use bounded path and regex patterns/i);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("gitleaks scan digest fails closed on symbolic links", async (context) => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-gitleaks-link-"));
  try {
    await writeFile(path.join(project, "target.txt"), "clean\n", "utf8");
    try {
      await symlink(path.join(project, "target.txt"), path.join(project, "link.txt"), "file");
    } catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) return context.skip("Symbolic links are unavailable in this environment");
      throw error;
    }
    const result = run(project, "digest", "--root", project);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /scan input cannot contain symbolic links: link\.txt/i);
    assert.doesNotMatch(result.stderr, /target\.txt/i);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});