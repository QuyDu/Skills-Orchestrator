#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireReleaseLock } from "./release-lock.mjs";
import { assertSafeRelativePath } from "./safe-path.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseLock = await acquireReleaseLock(root, "release-status");
const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const artifactRoot = path.join(root, "dist", `${packageManifest.name}-${packageManifest.version}`);
await assertSafeRelativePath(root, "dist");
await assertSafeRelativePath(root, "reports");
const checks = [];

function add(id, passed, evidence, blocking = true) {
  checks.push({ id, status: passed ? "passed" : "blocked", blocking, evidence });
}

function run(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true });
}

const revision = run("git", ["rev-parse", "HEAD"]);
const commit = revision.status === 0 ? revision.stdout.trim() : null;
add("source-revision", Boolean(commit), commit ?? "No committed Git revision exists");
const worktree = run("git", ["status", "--porcelain"]);
add("clean-worktree", worktree.status === 0 && worktree.stdout.trim() === "", worktree.status === 0 ? (worktree.stdout.trim() || "Worktree clean") : worktree.stderr.trim());

const securityReportPath = path.join(root, "reports", "security-check.json");
let securityReport;
if (existsSync(securityReportPath)) securityReport = JSON.parse(await readFile(securityReportPath, "utf8"));
add("security-scan", securityReport?.status === "passed", securityReport?.status === "passed" ? `${securityReport.filesScanned} files; digest ${securityReport.sourceDigest}` : "Current passing security report is missing");

const candidate = run(process.execPath, [path.join(root, "scripts", "verify-release.mjs"), "--candidate"]);
add("release-candidate-integrity", candidate.status === 0, candidate.status === 0 ? candidate.stdout.trim() : (candidate.stderr || candidate.stdout).trim());

const ciEvidencePath = path.join(root, "reports", "cross-platform-ci-evidence.json");
let ciEvidence;
if (existsSync(ciEvidencePath)) ciEvidence = JSON.parse(await readFile(ciEvidencePath, "utf8"));
const requiredRuns = new Set(["windows-22", "windows-24", "windows-26", "linux-22", "linux-24", "linux-26", "macos-22", "macos-24", "macos-26"]);
const passedRuns = new Set((ciEvidence?.runs ?? []).filter((item) => item.status === "passed").map((item) => `${item.os}-${item.node}`));
const ciPassed = Boolean(commit) && ciEvidence?.commit === commit && [...requiredRuns].every((item) => passedRuns.has(item));
add("cross-platform-ci", ciPassed, ciPassed ? `9 required runs passed for ${commit}` : "Current-commit Windows, Linux, and macOS evidence for Node 22, 24, and 26 is missing");

const signaturePath = path.join(artifactRoot, "release-signature.json");
const signingTrustConfigured = /^[a-f0-9]{64}$/.test(process.env.PSO_TRUSTED_SIGNING_KEY_SHA256 ?? "");
add("trusted-signature", existsSync(signaturePath) && signingTrustConfigured, existsSync(signaturePath) && signingTrustConfigured ? "Signature evidence and external signing trust anchor are present" : "Trusted release signature or external signing key fingerprint is not provisioned");
const reviewPath = path.join(artifactRoot, "independent-review.json");
const reviewTrustConfigured = /^[a-f0-9]{64}$/.test(process.env.PSO_TRUSTED_REVIEW_KEY_SHA256 ?? "");
add("independent-review", existsSync(reviewPath) && reviewTrustConfigured, existsSync(reviewPath) && reviewTrustConfigured ? "Signed independent review and external reviewer trust anchor are present" : "Trusted independent reviewer evidence is not provisioned");

const productionVerification = run(process.execPath, [path.join(root, "scripts", "verify-release.mjs")]);
add("production-verification", productionVerification.status === 0, productionVerification.status === 0 ? productionVerification.stdout.trim() : (productionVerification.stderr || productionVerification.stdout).trim());

const blocked = checks.filter((item) => item.blocking && item.status !== "passed");
const report = {
  schemaVersion: "1.0.0",
  product: packageManifest.name,
  version: packageManifest.version,
  evaluatedAt: new Date().toISOString(),
  commit,
  candidateSha256: existsSync(path.join(artifactRoot, "SHA256SUMS"))
    ? createHash("sha256").update(await readFile(path.join(artifactRoot, "SHA256SUMS"))).digest("hex")
    : null,
  status: blocked.length ? "blocked" : "production-ready",
  checks
};
await mkdir(path.join(root, "reports"), { recursive: true });
await assertSafeRelativePath(root, "reports/release-readiness.json");
await writeFile(path.join(root, "reports", "release-readiness.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await releaseLock();
for (const check of checks) console.log(`${check.status.toUpperCase()} ${check.id}: ${check.evidence}`);
console.log(`Release readiness: ${report.status}`);
if (blocked.length) process.exitCode = 1;
