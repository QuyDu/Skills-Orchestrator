#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--root" || !args[1])) {
  throw new Error("Use --root PATH or no arguments");
}

const requestedRoot = path.resolve(args.length === 2 ? args[1] : process.cwd());
if (!existsSync(requestedRoot)) throw new Error(`Audit root does not exist: ${requestedRoot}`);
const root = realpathSync(requestedRoot);

function run(command, commandArgs, { allowFailure = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    shell: false
  });
  if (result.error && !allowFailure) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const message = result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`;
    throw new Error(`${command} ${commandArgs.join(" ")} failed: ${message}`);
  }
  return {
    status: result.status,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    available: !result.error
  };
}

function git(...commandArgs) {
  return run("git", commandArgs).stdout;
}

function lines(value) {
  return value ? value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

function sanitizeRemote(value) {
  if (/^git@github\.com:/i.test(value)) return value;
  try {
    const remote = new URL(value);
    remote.username = "";
    remote.password = "";
    return remote.toString();
  } catch {
    return "unparseable-remote";
  }
}

function inspectTool(name, command = name) {
  const result = run(command, ["--version"], { allowFailure: true });
  if (!result.available) return { name, status: "unavailable", version: null };
  const version = lines(result.stdout || result.stderr)[0] ?? "unknown";
  return { name, status: result.status === 0 ? "available" : "unusable", version };
}

const insideWorkTree = git("rev-parse", "--is-inside-work-tree") === "true";
if (!insideWorkTree) throw new Error(`Audit root is not a Git worktree: ${root}`);

const remoteEntries = lines(git("remote", "-v")).map((entry) => {
  const match = entry.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
  if (!match) return { name: "unknown", url: "unparseable-remote", direction: "unknown", host: "unknown" };
  const sanitized = sanitizeRemote(match[2]);
  let host = "unknown";
  if (/^git@github\.com:/i.test(sanitized)) host = "github.com";
  else {
    try { host = new URL(sanitized).hostname.toLowerCase(); } catch { host = "unknown"; }
  }
  return { name: match[1], url: sanitized, direction: match[3], host };
});
const hasGitHubRemote = remoteEntries.some((remote) => remote.host === "github.com");
const trackedFiles = lines(git("ls-files"));
const trackedReports = trackedFiles.filter((file) => file === "reports" || file.startsWith("reports/"));
const scannerRunner = path.join(path.dirname(fileURLToPath(import.meta.url)), "gitleaks-scan.mjs");
const metadataResult = run(process.execPath, [scannerRunner, "metadata"], { allowFailure: true });
let scannerMetadata = null;
try { scannerMetadata = JSON.parse(metadataResult.stdout); } catch { scannerMetadata = null; }
const pinnedGitleaks = scannerMetadata
  ? path.join(root, ".skills-orchestrator", "tools", "audit-code", "gitleaks", scannerMetadata.version, scannerMetadata.platform, process.platform === "win32" ? "gitleaks.exe" : "gitleaks")
  : "";
const specialistScanners = ["gitleaks", "trufflehog"].map((name) => inspectTool(name));
specialistScanners.push(pinnedGitleaks && existsSync(pinnedGitleaks)
  ? inspectTool("gitleaks-pinned", pinnedGitleaks)
  : { name: "gitleaks-pinned", status: "unavailable", version: null });
const specialistReady = specialistScanners.some((scanner) => scanner.status === "available");
const requiredScopes = ["worktree", "staged", "untracked-distributable", "tracked-reports", "all-local-refs", "reachable-history"];
const scanReportPath = path.join(root, "reports", "gitleaks-scan.json");
let scanReport = null;
try { scanReport = JSON.parse(readFileSync(scanReportPath, "utf8")); } catch { scanReport = null; }
const checkpointScript = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs");
const checkpointResult = run(process.execPath, [checkpointScript, "checkpoint", root], { allowFailure: true });
let checkpoint = null;
try { checkpoint = JSON.parse(checkpointResult.stdout); } catch { checkpoint = null; }
const scanDigestResult = run(process.execPath, [scannerRunner, "digest", "--root", root], { allowFailure: true });
let scanDigest = null;
try { scanDigest = JSON.parse(scanDigestResult.stdout); } catch { scanDigest = null; }
const requiredCommandScopes = ["worktree", "staged", "history"];
const specialistCompleted = Boolean(
  scanReport?.status === "passed"
  && scanReport.scanner?.name === scannerMetadata?.name
  && scanReport.scanner?.version === scannerMetadata?.version
  && scanReport.scanner?.releaseUrl === scannerMetadata?.releaseUrl
  && scanReport.scanner?.platform === scannerMetadata?.platform
  && scanReport.scanner?.archiveSha256 === scannerMetadata?.archiveSha256
  && scanReport.scanner?.checksumsSha256 === scannerMetadata?.checksumsSha256
  && /^[a-fA-F0-9]{64}$/.test(scanReport.configurationSha256 ?? "")
  && requiredScopes.every((scope) => scanReport.scopes?.includes(scope))
  && requiredCommandScopes.every((scope) => scanReport.commands?.some((command) => command.scope === scope && command.exitCode === 0 && command.command?.includes("--redact=100")))
  && scanReport.repositoryRevision === git("rev-parse", "HEAD")
  && scanReport.worktreeDigest === checkpoint?.worktreeDigest
  && scanReport.scanInputDigest === scanDigest?.scanInputDigest
  && scanReport.findings?.worktree?.length === 0
  && scanReport.findings?.staged?.length === 0
  && scanReport.findings?.history?.length === 0
);

const standardsProfiles = [
  ["microsoft-sdl", "Microsoft Security Development Lifecycle", "microsoft", "https://www.microsoft.com/securityengineering/sdl/practices"],
  ["microsoft-cloud-security-benchmark", "Microsoft Cloud Security Benchmark", "microsoft", "https://learn.microsoft.com/security/benchmark/azure/overview"],
  ["azure-well-architected-security", "Azure Well-Architected Framework Security", "microsoft", "https://learn.microsoft.com/azure/well-architected/security/"],
  ["owasp-asvs", "OWASP Application Security Verification Standard", "industry", "https://owasp.org/www-project-application-security-verification-standard/"],
  ["owasp-top-10", "OWASP Top 10", "industry", "https://owasp.org/www-project-top-ten/"],
  ["nist-ssdf", "NIST Secure Software Development Framework", "standard", "https://csrc.nist.gov/pubs/sp/800/218/final"],
  ["cis-controls", "CIS Controls", "industry", "https://www.cisecurity.org/controls"],
  ["slsa", "Supply-chain Levels for Software Artifacts", "industry", "https://slsa.dev/spec/"],
  ["openssf-scorecard", "OpenSSF Scorecard", "industry", "https://scorecard.dev/" ]
].map(([id, title, publisher, url]) => ({ id, title, publisher, url, status: "requires-applicability-assessment" }));

const evidence = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  repository: {
    root,
    head: git("rev-parse", "HEAD"),
    worktreeDirty: Boolean(git("status", "--porcelain")),
    shallow: git("rev-parse", "--is-shallow-repository") === "true",
    reachableCommitCount: Number(git("rev-list", "--all", "--count")),
    localBranchCount: lines(git("for-each-ref", "--format=%(refname)", "refs/heads")).length,
    remoteTrackingRefCount: lines(git("for-each-ref", "--format=%(refname)", "refs/remotes")).length,
    tagCount: lines(git("tag", "--list")).length,
    remotes: remoteEntries,
    trackedFileCount: trackedFiles.length,
    trackedReportCount: trackedReports.length
  },
  secretHistory: {
    status: specialistCompleted ? "completed" : specialistReady ? "ready" : "blocked",
    requiredScope: requiredScopes,
    scanners: specialistScanners,
    scanEvidence: specialistCompleted ? {
      path: "reports/gitleaks-scan.json",
      generatedAt: scanReport.generatedAt,
      version: scanReport.scanner.version,
      configurationSha256: scanReport.configurationSha256,
      worktreeDigest: scanReport.worktreeDigest,
      scanInputDigest: scanReport.scanInputDigest
    } : null,
    limitations: ["Remote-only refs require approved hosted access or fetch.", "Unreachable and pruned objects require an explicit forensic scope."]
  },
  hostedGitHub: {
    required: hasGitHubRemote,
    status: hasGitHubRemote ? "blocked" : "not-applicable",
    reason: hasGitHubRemote
      ? "Current read-only GitHub evidence must be collected after explicit external-access approval."
      : "No github.com remote was detected."
  },
  standardsProfiles,
  assurance: {
    status: !specialistCompleted || hasGitHubRemote ? "insufficient-evidence" : "assessment-required",
    allowedConclusions: ["conformant", "conformant-with-exceptions", "non-conformant", "insufficient-evidence"],
    prohibitedClaim: "The repository is secure or meets all best practices."
  }
};

console.log(JSON.stringify(evidence, null, 2));