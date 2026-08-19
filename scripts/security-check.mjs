#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireReleaseLock } from "./release-lock.mjs";
import { assertSafeRelativePath } from "./safe-path.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseLock = await acquireReleaseLock(root, "security-check");
const excludedDirectories = new Set([".git", ".skills-orchestrator", "dist", "node_modules", "reports"]);
const maximumScannedFileBytes = 10 * 1024 * 1024;
const findings = [];

async function walk(directory, relative = "") {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      findings.push({ ruleId: "SEC-PATH-001", severity: "high", path: child.replaceAll("\\", "/"), message: "Symbolic links are not allowed in the release source tree" });
    } else if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) files.push(...await walk(directory, child));
    } else if (entry.isFile()) {
      files.push(child.replaceAll("\\", "/"));
    }
  }
  return files;
}

const secretRules = [
  ["SEC-SECRET-001", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g, "Private key material"],
  ["SEC-SECRET-002", /\bAKIA[0-9A-Z]{16}\b/g, "AWS access key"],
  ["SEC-SECRET-003", /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/g, "GitHub token"],
  ["SEC-SECRET-004", /\b(?:password|passwd|pwd|client_secret|api_key|access_token)\s*[:=]\s*["'][^"'\r\n]{8,}["']/gi, "Hard-coded credential-like value"]
];
const unsafeCodeRules = [
  ["SEC-CODE-001", /\beval\s*\(/g, "Dynamic eval is prohibited"],
  ["SEC-CODE-002", /\bnew\s+Function\s*\(/g, "Dynamic Function construction is prohibited"],
  ["SEC-CODE-003", /\bshell\s*:\s*true\b/g, "Shell execution must not be enabled"],
  ["SEC-CODE-004", /\bexecSync?\s*\(/g, "Shell command execution requires security review"]
];

const files = (await walk(root)).sort();
const sourceHash = createHash("sha256");
for (const relative of files) {
  const content = await readFile(path.join(root, relative));
  sourceHash.update(relative);
  sourceHash.update("\0");
  sourceHash.update(content);
  sourceHash.update("\0");
  if (content.length > maximumScannedFileBytes) {
    findings.push({ ruleId: "SEC-SCAN-001", severity: "high", path: relative, message: `File exceeds the ${maximumScannedFileBytes}-byte security scan limit` });
    continue;
  }
  const byteNormalizedSource = content.toString("latin1").replaceAll("\0", "");
  for (const [ruleId, pattern, message] of secretRules) {
    pattern.lastIndex = 0;
    if (pattern.test(byteNormalizedSource)) findings.push({ ruleId, severity: "critical", path: relative, message });
  }
  if (content.subarray(0, Math.min(content.length, 8192)).includes(0)) continue;
  const source = content.toString("utf8");
  if (relative.endsWith(".mjs") && !relative.startsWith("tests/")) {
    for (const [ruleId, pattern, message] of unsafeCodeRules) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) findings.push({ ruleId, severity: "high", path: relative, message });
    }
  }
}

const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const dependencyCount = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
  .flatMap((field) => Object.keys(packageManifest[field] ?? {})).length;
const packageLockPath = path.join(root, "package-lock.json");
if (!existsSync(packageLockPath)) {
  findings.push({ ruleId: "SEC-SUPPLY-001", severity: "high", path: "package.json", message: "A committed lock file is required" });
} else {
  const packageLock = JSON.parse(await readFile(packageLockPath, "utf8"));
  const lockRoot = packageLock.packages?.[""];
  if (packageLock.lockfileVersion !== 3 || lockRoot?.name !== packageManifest.name || lockRoot?.version !== packageManifest.version || lockRoot?.engines?.node !== packageManifest.engines?.node) {
    findings.push({ ruleId: "SEC-SUPPLY-003", severity: "high", path: "package-lock.json", message: "Lock file root metadata does not match package.json" });
  }
}
if (!/^npm@\d+\.\d+\.\d+$/.test(packageManifest.packageManager ?? "")) {
  findings.push({ ruleId: "SEC-SUPPLY-004", severity: "high", path: "package.json", message: "An exact npm packageManager version is required" });
}

const npmConfigPath = path.join(root, ".npmrc");
if (!existsSync(npmConfigPath)) {
  findings.push({ ruleId: "SEC-SUPPLY-005", severity: "high", path: ".npmrc", message: "Repository npm security defaults are required" });
} else {
  const npmSettings = new Set((await readFile(npmConfigPath, "utf8")).split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  for (const setting of ["audit=true", "engine-strict=true", "ignore-scripts=true", "package-lock=true", "save-exact=true"]) {
    if (!npmSettings.has(setting)) findings.push({ ruleId: "SEC-SUPPLY-005", severity: "high", path: ".npmrc", message: `Required npm setting is missing: ${setting}` });
  }
}

const workflowsRoot = path.join(root, ".github", "workflows");
if (existsSync(workflowsRoot)) {
  for (const relative of (await walk(workflowsRoot)).filter((item) => /\.ya?ml$/i.test(item))) {
    const source = await readFile(path.join(workflowsRoot, relative), "utf8");
    for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+)\s*$/gm)) {
      if (!/@[a-f0-9]{40}$/.test(match[1])) {
        findings.push({ ruleId: "SEC-SUPPLY-002", severity: "high", path: `.github/workflows/${relative}`, message: `GitHub Action is not pinned to a full commit SHA: ${match[1]}` });
      }
    }
  }
}

// Shipped project templates must meet the same pinning standard the scanner enforces for GitHub Actions.
const templatesRoot = path.join(root, "templates");
if (existsSync(templatesRoot)) {
  for (const relative of await walk(templatesRoot)) {
    const source = await readFile(path.join(templatesRoot, relative), "utf8");
    const active = source.split(/\r?\n/).filter((line) => !line.trimStart().startsWith("//")).join("\n");
    if (/@latest\b/.test(active)) {
      findings.push({ ruleId: "SEC-SUPPLY-006", severity: "high", path: `templates/${relative}`, message: "Shipped template references a floating @latest version" });
    }
    if (/"command"\s*:\s*"(npx|npm|pnpm|yarn|uvx|pipx)"/.test(active)) {
      findings.push({ ruleId: "SEC-SUPPLY-006", severity: "high", path: `templates/${relative}`, message: "Shipped template resolves an executable from a package registry at runtime" });
    }
    for (const match of active.matchAll(/^\s*uses:\s*([^\s#]+)\s*$/gm)) {
      if (!/@[a-f0-9]{40}$/.test(match[1])) {
        findings.push({ ruleId: "SEC-SUPPLY-006", severity: "high", path: `templates/${relative}`, message: `Shipped template references an unpinned GitHub Action: ${match[1]}` });
      }
    }
  }
}

const report = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  scanner: { name: "skills-orchestrator-security-check", version: packageManifest.version },
  sourceDigest: sourceHash.digest("hex"),
  filesScanned: files.length,
  dependencyCount,
  status: findings.length ? "failed" : "passed",
  findings
};
const reportsRoot = await assertSafeRelativePath(root, "reports");
await mkdir(reportsRoot, { recursive: true });
await assertSafeRelativePath(root, "reports/security-check.json");
await writeFile(path.join(reportsRoot, "security-check.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await releaseLock();
if (findings.length) {
  for (const finding of findings) console.error(`${finding.severity.toUpperCase()} ${finding.ruleId} ${finding.path}: ${finding.message}`);
  process.exitCode = 1;
} else {
  console.log(`Security checks passed: ${files.length} files scanned, ${dependencyCount} package dependencies`);
}
