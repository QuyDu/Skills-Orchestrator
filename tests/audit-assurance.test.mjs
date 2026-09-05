import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const validator = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs");
const requiredStandards = [
  "microsoft-sdl",
  "microsoft-cloud-security-benchmark",
  "azure-well-architected-security",
  "owasp-asvs",
  "owasp-top-10",
  "nist-ssdf",
  "cis-controls",
  "slsa",
  "openssf-scorecard"
];

function control(status = "conformant") {
  return { id: "CONTROL-1", title: "Control", status, evidence: ["verified"], limitations: [] };
}

function findingsReport() {
  return {
    schemaVersion: "2.0.0",
    repositoryEvidence: {
      localGit: { status: "completed" },
      secretScanning: {
        status: "completed",
        scanner: "gitleaks",
        version: "1.2.3",
        configurationDigest: "a".repeat(64),
        scopes: ["worktree", "tracked-reports", "all-local-refs", "reachable-history"],
        findingCount: 0,
        limitations: []
      },
      hostedRepository: { provider: "github", status: "completed", checkedAt: "2026-09-04T00:00:00.000Z", controls: [control()], limitations: [] }
    },
    standards: requiredStandards.map((id) => ({ id, applicability: "applicable", controls: [control()] })),
    assurance: { conclusion: "conformant", rationale: "All required evidence passed.", blockingEvidence: [], exceptionCount: 0, expiredExceptionCount: 0 }
  };
}

function run(...args) {
  return spawnSync(process.execPath, [validator, ...args], { cwd: root, encoding: "utf8" });
}

async function withJson(value, action) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pso-audit-assurance-"));
  const file = path.join(directory, "artifact.json");
  try {
    await writeFile(file, `${JSON.stringify(value)}\n`, "utf8");
    await action(file, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("audit assurance accepts complete conformant evidence", async () => {
  await withJson(findingsReport(), async (file) => {
    const result = run("findings", file);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("audit assurance rejects conformant with blocked or incomplete evidence", async () => {
  for (const [name, mutate] of [
    ["blocked secret scan", (report) => { report.repositoryEvidence.secretScanning.status = "blocked"; }],
    ["blocked hosted repository", (report) => { report.repositoryEvidence.hostedRepository.status = "blocked"; }],
    ["empty standards", (report) => { report.standards = []; }],
    ["missing required standard", (report) => { report.standards.pop(); }],
    ["duplicate standard ID", (report) => { report.standards.push(structuredClone(report.standards[0])); }],
    ["empty applicable controls", (report) => { report.standards[0].controls = []; }],
    ["null scanner version", (report) => { report.repositoryEvidence.secretScanning.version = null; }],
    ["invalid scanner digest", (report) => { report.repositoryEvidence.secretScanning.configurationDigest = "invalid"; }],
    ["missing secret scan scope", (report) => { report.repositoryEvidence.secretScanning.scopes.pop(); }],
    ["empty GitHub controls", (report) => { report.repositoryEvidence.hostedRepository.controls = []; }],
    ["blocked control", (report) => { report.standards[0].controls[0].status = "blocked"; }],
    ["non-conformant control", (report) => { report.standards[0].controls[0].status = "non-conformant"; }],
    ["empty partially applicable controls", (report) => {
      report.standards[0].applicability = "partially-applicable";
      report.standards[0].controls = [];
    }],
    ["declared blocker", (report) => { report.assurance.blockingEvidence = ["blocked"]; }]
  ]) {
    const report = findingsReport();
    mutate(report);
    await withJson(report, async (file) => {
      const result = run("findings", file);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, /Audit validation failed/);
    });
  }
});

test("audit assurance rejects expired or malformed exceptions", async () => {
  for (const [name, exception, expiredExceptionCount, expected] of [
    ["expired exception", { exceptionOwner: "security-owner", exceptionExpiresAt: "2020-01-01T00:00:00.000Z" }, 1, /expired/i],
    ["missing exception owner", { exceptionExpiresAt: "2999-01-01T00:00:00.000Z" }, 0, /no owner/i],
    ["missing exception expiry", { exceptionOwner: "security-owner" }, 0, /valid expiry/i],
    ["invalid exception expiry", { exceptionOwner: "security-owner", exceptionExpiresAt: "invalid" }, 0, /valid expiry/i]
  ]) {
    const report = findingsReport();
    report.standards[0].controls = [{ ...control("exception"), ...exception }];
    report.assurance.conclusion = "conformant-with-exceptions";
    report.assurance.exceptionCount = 1;
    report.assurance.expiredExceptionCount = expiredExceptionCount;
    await withJson(report, async (file) => {
      const result = run("findings", file);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, expected);
    });
  }
});

test("review validation requires exact v2 assurance preservation", async () => {
  const source = findingsReport();
  await withJson(source, async (sourcePath, directory) => {
    const review = {
      schemaVersion: "2.0.0",
      reviewId: "REVIEW-0001",
      generatedAt: "2026-09-04T00:00:00.000Z",
      sourceReport: "reports/code-audit-findings.json",
      sourceAuditId: "AUDIT-0001",
      summary: { total: 0, confirmed: 0, needsMoreEvidence: 0, disputed: 0, falsePositive: 0 },
      repositoryEvidence: structuredClone(source.repositoryEvidence),
      standards: structuredClone(source.standards),
      assurance: structuredClone(source.assurance),
      findings: [],
      limitations: []
    };
    const reviewPath = path.join(directory, "review.json");
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    assert.equal(run("review", sourcePath, reviewPath).status, 0);
    review.assurance.conclusion = "conformant-with-exceptions";
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    const softened = run("review", sourcePath, reviewPath);
    assert.notEqual(softened.status, 0);
    assert.match(softened.stderr, /preserve source assurance/i);
    review.assurance = structuredClone(source.assurance);
    review.assurance.blockingEvidence = ["new blocker"];
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    assert.notEqual(run("review", sourcePath, reviewPath).status, 0);
  });
});

test("plan validation requires complexity in v2 prioritization", async () => {
  const plan = {
    schemaVersion: "2.0.0",
    prioritization: ["prerequisite", "security-severity", "complexity"],
    items: [{ id: "REM-0001", complexity: "low", complexityRationale: "Small change." }]
  };
  await withJson(plan, async (file) => {
    assert.equal(run("plan", file).status, 0);
    plan.prioritization = plan.prioritization.filter((value) => value !== "complexity");
    await writeFile(file, `${JSON.stringify(plan)}\n`, "utf8");
    assert.notEqual(run("plan", file).status, 0);
    plan.prioritization.push("complexity");
    delete plan.items[0].complexity;
    await writeFile(file, `${JSON.stringify(plan)}\n`, "utf8");
    assert.notEqual(run("plan", file).status, 0);
    plan.items[0].complexity = "low";
    delete plan.items[0].complexityRationale;
    await writeFile(file, `${JSON.stringify(plan)}\n`, "utf8");
    assert.notEqual(run("plan", file).status, 0);
  });
});