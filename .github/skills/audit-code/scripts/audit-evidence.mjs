#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const SECRET_EVIDENCE_MAX_AGE_HOURS = 24;
function argument(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

const unknownArguments = args.filter((value, index) => !["--root", "--audit-run-id"].includes(value) && !["--root", "--audit-run-id"].includes(args[index - 1]));
if (unknownArguments.length) throw new Error("Use --root PATH and optional --audit-run-id UUID");
const auditRunId = argument("--audit-run-id", randomUUID());
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(auditRunId)) throw new Error("--audit-run-id must be a UUID");
const requestedRoot = path.resolve(argument("--root", process.cwd()));
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
    remote.search = "";
    remote.hash = "";
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

function successfulJson(result) {
  if (!result.available || result.status !== 0) return { valid: false, value: null };
  try {
    return { valid: true, value: JSON.parse(result.stdout) };
  } catch {
    return { valid: false, value: null };
  }
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
const metadataState = successfulJson(metadataResult);
const scannerMetadata = metadataState.value;
const metadataValid = metadataState.valid;
const pinnedGitleaks = scannerMetadata
  ? path.join(root, ".skills-orchestrator", "tools", "audit-code", "gitleaks", scannerMetadata.version, scannerMetadata.platform, process.platform === "win32" ? "gitleaks.exe" : "gitleaks")
  : "";
const specialistScanners = ["gitleaks", "trufflehog"].map((name) => inspectTool(name));
const pinnedBinaryInstalled = Boolean(pinnedGitleaks && existsSync(pinnedGitleaks));
specialistScanners.push(pinnedBinaryInstalled
  ? inspectTool("gitleaks-pinned", pinnedGitleaks)
  : { name: "gitleaks-pinned", status: "unavailable", version: null });
const supplementalScannerAvailable = specialistScanners.some((scanner) => scanner.name !== "gitleaks-pinned" && scanner.status === "available");
const pinnedScannerReady = Boolean(
  existsSync(scannerRunner)
  && metadataValid
  && scannerMetadata?.name === "gitleaks"
  && scannerMetadata.version
  && scannerMetadata.platform
  && scannerMetadata.releaseUrl
  && /^[a-fA-F0-9]{64}$/.test(scannerMetadata.archiveSha256 ?? "")
  && /^[a-fA-F0-9]{64}$/.test(scannerMetadata.checksumsSha256 ?? "")
);
const requiredScopes = ["worktree", "staged", "untracked-distributable", "tracked-reports", "all-local-refs", "reachable-history"];
const scanReportPath = path.join(root, "reports", "gitleaks-scan.json");
let scanReport = null;
try { scanReport = JSON.parse(readFileSync(scanReportPath, "utf8")); } catch { scanReport = null; }
const checkpointScript = path.join(root, ".github", "skills", "audit-code", "scripts", "audit-validate.mjs");
const checkpointResult = run(process.execPath, [checkpointScript, "checkpoint", root], { allowFailure: true });
const checkpointState = successfulJson(checkpointResult);
const checkpoint = checkpointState.value;
const checkpointValid = checkpointState.valid;
const scanDigestResult = run(process.execPath, [scannerRunner, "digest", "--root", root], { allowFailure: true });
const scanDigestState = successfulJson(scanDigestResult);
const scanDigest = scanDigestState.value;
const scanDigestValid = scanDigestState.valid;
const requiredCommandScopes = ["worktree", "staged", "history"];
const requiredFindingBuckets = ["worktree", "staged", "history"];
const noSecretFindings = requiredFindingBuckets.every((scope) => Array.isArray(scanReport?.findings?.[scope]) && scanReport.findings[scope].length === 0);
const scanGeneratedAt = Date.parse(scanReport?.generatedAt ?? "");
const scanAgeHours = Number.isFinite(scanGeneratedAt) ? (Date.now() - scanGeneratedAt) / 3_600_000 : null;
const scanFresh = scanAgeHours !== null && scanAgeHours >= 0 && scanAgeHours <= SECRET_EVIDENCE_MAX_AGE_HOURS;
const specialistCompleted = Boolean(
  metadataValid
  && checkpointValid
  && scanDigestValid
  && scanFresh
  && scanReport?.status === "passed"
  && scanReport.auditRunId === auditRunId
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
  && noSecretFindings
);

const generatedAt = new Date().toISOString();
const standardsProfileGeneratedAt = generatedAt;
const standardsProfiles = [
  { id: "microsoft-sdl", title: "Microsoft Security Development Lifecycle Practices", publisher: "microsoft", version: "access-dated living guidance", stability: "current", resolutionRequired: true, url: "https://www.microsoft.com/securityengineering/sdl/practices" },
  { id: "microsoft-cloud-security-benchmark", title: "Microsoft Cloud Security Benchmark", publisher: "microsoft", version: "resolve-at-audit-time", stability: "resolve-at-audit-time", resolutionRequired: true, url: "https://learn.microsoft.com/security/benchmark/azure/overview", note: "Resolve the current stable and preview releases before selecting a normative baseline." },
  { id: "azure-well-architected-security", title: "Azure Well-Architected Framework Security", publisher: "microsoft", version: "access-dated living guidance", stability: "current", resolutionRequired: true, url: "https://learn.microsoft.com/azure/well-architected/security/" },
  { id: "owasp-asvs", title: "OWASP Application Security Verification Standard", publisher: "industry", version: "5.0.0", stability: "stable", url: "https://owasp.github.io/www-project-application-security-verification-standard" },
  { id: "owasp-top-10", title: "OWASP Top 10", publisher: "industry", version: "2025", stability: "stable", url: "https://top10.owasp.org/2025/" },
  { id: "nist-ssdf", title: "NIST Secure Software Development Framework", publisher: "standard", version: "1.1", stability: "final", url: "https://csrc.nist.gov/pubs/sp/800/218/final" },
  { id: "cis-controls", title: "CIS Critical Security Controls", publisher: "industry", version: "8.1", stability: "stable", url: "https://www.cisecurity.org/controls/v8-1" },
  { id: "slsa", title: "Supply-chain Levels for Software Artifacts", publisher: "industry", version: "1.2", stability: "approved", url: "https://slsa.dev/spec/v1.2/" },
  { id: "openssf-scorecard", title: "OpenSSF Scorecard", publisher: "industry", version: "access-dated current checks", stability: "current", resolutionRequired: true, url: "https://scorecard.dev/" },
  { id: "owasp-genai-llm-top-10", title: "OWASP GenAI LLM Top 10", publisher: "industry", version: "2026", stability: "current", conditional: true, resolutionRequired: true, url: "https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/" },
  { id: "owasp-agentic-top-10", title: "OWASP Top 10 for Agentic Applications", publisher: "industry", version: "2026", stability: "current", conditional: true, resolutionRequired: true, url: "https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/" },
  { id: "nist-ai-rmf", title: "NIST AI Risk Management Framework", publisher: "standard", version: "1.0", stability: "final", conditional: true, url: "https://www.nist.gov/itl/ai-risk-management-framework" },
  { id: "nist-ai-600-1", title: "NIST AI 600-1 Generative AI Profile", publisher: "standard", version: "1.0", stability: "final", conditional: true, url: "https://doi.org/10.6028/NIST.AI.600-1" }
].map((profile) => ({
  ...profile,
  resolutionRequired: profile.resolutionRequired ?? false,
  currencyVerificationRequired: true,
  applicabilityAssessmentRequired: true,
  profileDeclaredAt: standardsProfileGeneratedAt,
  lastVerifiedAt: null,
  status: "requires-applicability-assessment"
}));

const evidence = {
  schemaVersion: "1.0.0",
  auditRunId,
  generatedAt,
  repository: {
    root: ".",
    rootResolved: true,
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
    status: specialistCompleted ? "completed" : pinnedScannerReady ? "ready" : "blocked",
    pinnedScannerReady,
    pinnedBinaryInstalled,
    supplementalScannerAvailable,
    helperValidity: { metadata: metadataValid, checkpoint: checkpointValid, scanDigest: scanDigestValid },
    evidenceMaxAgeHours: SECRET_EVIDENCE_MAX_AGE_HOURS,
    scanAgeHours,
    scanFresh,
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

const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
const evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
const evidenceDirectory = path.join(root, "reports", "audit-evidence");
mkdirSync(evidenceDirectory, { recursive: true });
const canonicalEvidenceDirectory = realpathSync(evidenceDirectory);
if (canonicalEvidenceDirectory !== evidenceDirectory) throw new Error("Audit evidence directory must not redirect through a symbolic link");
const evidencePath = path.join(evidenceDirectory, `${evidenceSha256}.json`);
try {
  writeFileSync(evidencePath, evidenceBytes, { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  if (!readFileSync(evidencePath).equals(evidenceBytes)) throw new Error("Existing audit evidence snapshot does not match its content digest");
}
console.log(JSON.stringify({
  ...evidence,
  artifact: { path: `reports/audit-evidence/${evidenceSha256}.json`, sha256: evidenceSha256 }
}, null, 2));