import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const validator = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs");
const evidenceCollector = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-evidence.mjs");
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
const standardVersions = {
  "microsoft-sdl": "access-dated living guidance",
  "microsoft-cloud-security-benchmark": "v1",
  "azure-well-architected-security": "access-dated living guidance",
  "owasp-asvs": "5.0.0",
  "owasp-top-10": "2025",
  "nist-ssdf": "1.1",
  "cis-controls": "8.1",
  "slsa": "1.2",
  "openssf-scorecard": "access-dated current checks"
};

function control(status = "conformant") {
  return { id: "CONTROL-1", title: "Control", status, evidence: ["verified"], limitations: [] };
}

function findingsReport() {
  return {
    schemaVersion: "2.0.0",
    generatedAt: "2026-09-11T12:00:00.000Z",
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
    standards: requiredStandards.map((id) => ({
      id,
      version: standardVersions[id],
      reference: `https://example.test/${id}`,
      accessedAt: "2026-09-11",
      applicability: "applicable",
      controls: [control()]
    })),
    assurance: { conclusion: "conformant", rationale: "All required evidence passed.", blockingEvidence: [], exceptionCount: 0, expiredExceptionCount: 0 }
  };
}

function strictFindingsReport() {
  const report = findingsReport();
  report.schemaVersion = "2.1.0";
  report.standards = report.standards.map((standard) => ({
    ...standard,
    stability: standard.id === "microsoft-sdl" || standard.id === "azure-well-architected-security" || standard.id === "openssf-scorecard" ? "current" : "stable",
    baselineRole: "normative"
  }));
  report.verificationEvidence = {
    secretExposure: {
      status: "completed",
      scopes: ["worktree", "tracked-reports", "all-local-refs", "reachable-history"],
      evidence: ["Pinned specialist scan passed."],
      limitations: []
    },
    analyzers: {
      status: "completed",
      detectedLanguages: ["javascript"],
      tools: [{ language: "javascript", tool: "node-test", version: "1.0.0", status: "passed", configurationDigest: "b".repeat(64) }],
      evidence: ["Native checks passed."],
      limitations: []
    },
    resourceOwnership: {
      status: "completed",
      ownershipModels: ["locally-owned", "framework-owned"],
      checks: ["ownership-classification", "normal-exit", "early-return", "exception", "cancellation"],
      pathsChecked: ["src/runtime.mjs"],
      evidence: ["Resource paths reviewed."],
      limitations: []
    },
    aiQuality: {
      status: "not-applicable",
      aiComponentsDetected: false,
      checks: ["ai-slop-indicators", "ai-authorship-non-inference", "agentic-security-applicability"],
      evidence: [],
      limitations: ["No AI or agentic runtime component was detected; general quality checks still ran."]
    },
    assuranceGates: {
      status: "completed",
      gates: ["critical-high-findings", "secret-evidence", "analyzer-evidence", "standards-evidence", "hosted-evidence"],
      evidence: ["All required gates evaluated."],
      limitations: []
    }
  };
  return report;
}

function run(...args) {
  return spawnSync(process.execPath, [validator, ...args], { cwd: root, encoding: "utf8" });
}

function runIn(cwd, ...args) {
  return spawnSync(process.execPath, [validator, ...args], { cwd, encoding: "utf8" });
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
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
    ["missing standard version", (report) => { delete report.standards[0].version; }],
    ["missing standard reference", (report) => { delete report.standards[0].reference; }],
    ["missing standard access date", (report) => { delete report.standards[0].accessedAt; }],
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

test("audit assurance accepts complete strict schema 2.1 evidence", async () => {
  await withJson(strictFindingsReport(), async (file) => {
    const result = run("findings", file);
    assert.equal(result.status, 0, result.stderr);
  });
});

test("strict audit assurance rejects omitted or weakened verification evidence", async () => {
  const cases = [
    ["missing secret evidence", (report) => { delete report.verificationEvidence.secretExposure; }, /secretExposure is required/],
    ["missing analyzer evidence", (report) => { delete report.verificationEvidence.analyzers; }, /analyzers is required/],
    ["missing resource evidence", (report) => { delete report.verificationEvidence.resourceOwnership; }, /resourceOwnership is required/],
    ["missing AI quality evidence", (report) => { delete report.verificationEvidence.aiQuality; }, /aiQuality is required/],
    ["missing assurance gates", (report) => { delete report.verificationEvidence.assuranceGates; }, /assuranceGates is required/],
    ["missing exception path", (report) => { report.verificationEvidence.resourceOwnership.checks = report.verificationEvidence.resourceOwnership.checks.filter((item) => item !== "exception"); }, /insufficient-evidence/],
    ["missing AI non-attribution check", (report) => { report.verificationEvidence.aiQuality.checks = report.verificationEvidence.aiQuality.checks.filter((item) => item !== "ai-authorship-non-inference"); }, /insufficient-evidence/],
    ["missing analyzer tool", (report) => { report.verificationEvidence.analyzers.tools = []; }, /insufficient-evidence/],
    ["stale standards evidence", (report) => { report.standards[0].accessedAt = "2020-01-01"; }, /insufficient-evidence/],
    ["normative preview", (report) => { const standard = report.standards.find((item) => item.id === "microsoft-cloud-security-benchmark"); standard.version = "v2"; standard.stability = "preview"; }, /insufficient-evidence/]
  ];
  for (const [name, mutate, expected] of cases) {
    const report = strictFindingsReport();
    mutate(report);
    await withJson(report, async (file) => {
      const result = run("findings", file);
      assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
      assert.match(result.stderr, expected);
    });
  }
});

test("review validation preserves strict schema 2.1 verification evidence", async () => {
  const source = strictFindingsReport();
  await withJson(source, async (sourcePath, directory) => {
    const review = {
      schemaVersion: "2.1.0",
      reviewId: "REVIEW-0002",
      generatedAt: "2026-09-11T12:00:00.000Z",
      sourceReport: "reports/code-audit-findings.json",
      sourceAuditId: "AUDIT-0002",
      summary: { total: 0, confirmed: 0, needsMoreEvidence: 0, disputed: 0, falsePositive: 0 },
      repositoryEvidence: structuredClone(source.repositoryEvidence),
      standards: structuredClone(source.standards),
      assurance: structuredClone(source.assurance),
      verificationEvidence: structuredClone(source.verificationEvidence),
      findings: [],
      limitations: []
    };
    const reviewPath = path.join(directory, "review.json");
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    assert.equal(run("review", sourcePath, reviewPath).status, 0);
    delete review.verificationEvidence.resourceOwnership;
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    const omitted = run("review", sourcePath, reviewPath);
    assert.notEqual(omitted.status, 0);
    assert.match(omitted.stderr, /preserve source verification evidence exactly/);

    delete source.verificationEvidence.resourceOwnership;
    delete review.verificationEvidence;
    await writeFile(sourcePath, `${JSON.stringify(source)}\n`, "utf8");
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`, "utf8");
    const invalidSource = run("review", sourcePath, reviewPath);
    assert.notEqual(invalidSource.status, 0);
    assert.match(invalidSource.stderr, /verificationEvidence\.resourceOwnership is required/);
  });
});

test("audit evidence redacts remote query credentials and fails closed on unavailable helpers", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-audit-evidence-"));
  try {
    const fixedClock = path.join(project, "fixed-clock.mjs");
    await writeFile(fixedClock, `
const NativeDate = Date;
const instant = "2026-09-11T12:00:00.000Z";
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return NativeDate.parse(instant); }
};
`, "utf8");
    git(project, "init", "--quiet");
    git(project, "config", "user.name", "Audit Test");
    git(project, "config", "user.email", "audit@example.invalid");
    await writeFile(path.join(project, "README.md"), "fixture\n", "utf8");
    git(project, "add", "README.md", "fixed-clock.mjs");
    git(project, "commit", "--quiet", "-m", "fixture");
    await writeFile(path.join(project, "dirty-marker.txt"), "keep worktree state stable\n", "utf8");
    const sensitive = "query-secret-value";
    git(project, "remote", "add", "origin", `https://github.com/example/repository?access_token=${sensitive}#credential`);

    const auditRunId = "11111111-1111-4111-8111-111111111111";
    const collect = () => spawnSync(process.execPath, ["--import", pathToFileURL(fixedClock).href, evidenceCollector, "--root", project, "--audit-run-id", auditRunId], { cwd: root, encoding: "utf8" });
    const result = collect();
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, new RegExp(sensitive));
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.repository.root, ".");
    assert.equal(evidence.repository.rootResolved, true);
    assert.equal(evidence.repository.remotes[0].url, "https://github.com/example/repository");
    assert.equal(evidence.secretHistory.helperValidity.metadata, true);
    assert.equal(evidence.secretHistory.helperValidity.checkpoint, false);
    assert.equal(evidence.secretHistory.helperValidity.scanDigest, true);
    assert.equal(evidence.secretHistory.status, "ready");
    assert.equal(evidence.secretHistory.evidenceMaxAgeHours, 24);
    assert.equal(evidence.secretHistory.scanFresh, false);
    const repeated = collect();
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(JSON.parse(repeated.stdout).artifact.sha256, evidence.artifact.sha256);
    const evidencePath = path.join(project, evidence.artifact.path);
    await writeFile(evidencePath, "tampered\n", "utf8");
    const tampered = collect();
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /does not match its content digest/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("audit run identity and immutable evidence bind findings, review, and plan", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pso-audit-run-binding-"));
  try {
    const auditRunId = randomUUID();
    const revision = "a".repeat(40);
    const evidence = { schemaVersion: "1.0.0", auditRunId, generatedAt: "2026-09-11T12:00:00.000Z", repository: { root: ".", rootResolved: true, head: revision } };
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
    const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
    await mkdir(path.join(directory, "reports", "audit-evidence"), { recursive: true });
    const evidenceRelative = `reports/audit-evidence/${evidenceSha256}.json`;
    await writeFile(path.join(directory, evidenceRelative), evidenceBytes);

    const findings = strictFindingsReport();
    findings.schemaVersion = "2.2.0";
    findings.auditRunId = auditRunId;
    findings.auditEvidence = { path: evidenceRelative, sha256: evidenceSha256 };
    findings.repositoryEvidence.localGit.revision = revision;
    findings.verificationEvidence.records = [{
      auditRunId, tool: "fixture", toolVersion: "1.0.0", command: "fixture --check", scope: "repository",
      configurationDigest: "b".repeat(64), exitCode: 0, status: "passed", executedAt: "2026-09-11T12:00:00.000Z",
      evidenceSha256: "c".repeat(64), repositoryRevision: revision, worktreeDigest: "d".repeat(64), inputDigest: "e".repeat(64)
    }];
    const findingsPath = path.join(directory, "reports", "findings.json");
    await writeFile(findingsPath, `${JSON.stringify(findings)}\n`);
    const findingsResult = runIn(directory, "findings", findingsPath);
    assert.equal(findingsResult.status, 0, findingsResult.stderr);

    const review = {
      schemaVersion: "2.2.0", auditRunId, auditEvidence: structuredClone(findings.auditEvidence), reviewId: "REVIEW-RUN", generatedAt: findings.generatedAt,
      sourceReport: "reports/findings.json", sourceAuditId: "AUDIT-RUN", summary: { total: 0, confirmed: 0, needsMoreEvidence: 0, disputed: 0, falsePositive: 0 },
      repositoryEvidence: structuredClone(findings.repositoryEvidence), standards: structuredClone(findings.standards), assurance: structuredClone(findings.assurance),
      verificationEvidence: structuredClone(findings.verificationEvidence), findings: [], limitations: []
    };
    const reviewPath = path.join(directory, "reports", "review.json");
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`);
    assert.equal(runIn(directory, "review", findingsPath, reviewPath).status, 0);

    const reviewBytes = await import("node:fs/promises").then(({ readFile }) => readFile(reviewPath));
    const plan = { schemaVersion: "2.1.0", auditRunId, planId: "PLAN-RUN", generatedAt: findings.generatedAt, sourceReview: "reports/review.json", sourceReviewSha256: createHash("sha256").update(reviewBytes).digest("hex"), prioritization: ["complexity"], milestones: [], items: [], dispositions: [], limitations: [] };
    const planPath = path.join(directory, "reports", "plan.json");
    await writeFile(planPath, `${JSON.stringify(plan)}\n`);
    assert.equal(runIn(directory, "plan", planPath).status, 0);

    review.auditRunId = randomUUID();
    await writeFile(reviewPath, `${JSON.stringify(review)}\n`);
    assert.notEqual(runIn(directory, "review", findingsPath, reviewPath).status, 0);
    assert.notEqual(runIn(directory, "plan", planPath).status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});