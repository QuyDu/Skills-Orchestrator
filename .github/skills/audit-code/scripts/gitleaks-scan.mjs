#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertSafeRelativePath } from "./safe-path.mjs";

const VERSION = "8.30.1";
const CHECKSUMS_SHA256 = "061476c21adaf5441516f96f185c1a4706a83cd6329b9b38762271b3d4a52fae";
const RELEASE = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}`;
const ASSETS = {
  "darwin-arm64": ["darwin_arm64.tar.gz", "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"],
  "darwin-x64": ["darwin_x64.tar.gz", "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709"],
  "linux-arm64": ["linux_arm64.tar.gz", "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080"],
  "linux-x64": ["linux_x64.tar.gz", "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"],
  "win32-arm64": ["windows_arm64.zip", "b95f5e4f5c425cedca7ee203d9afd29597e692c4924a12ed42f970537c72cc0f"],
  "win32-x64": ["windows_x64.zip", "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e"]
};
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptRoot, "..");
const frameworkRoot = path.resolve(skillRoot, "..", "..", "..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function platformKey() {
  const key = `${process.platform}-${process.arch}`;
  if (!ASSETS[key]) throw new Error(`Unsupported Gitleaks platform: ${key}`);
  return key;
}

function metadata() {
  const key = platformKey();
  return {
    name: "gitleaks",
    version: VERSION,
    releaseUrl: `${RELEASE}/`,
    platform: key,
    archiveSha256: ASSETS[key][1],
    checksumsSha256: CHECKSUMS_SHA256
  };
}

function toolPaths(root) {
  const key = platformKey();
  const directory = path.join(root, ".skills-orchestrator", "tools", "audit-code", "gitleaks", VERSION, key);
  return { directory, binary: path.join(directory, process.platform === "win32" ? "gitleaks.exe" : "gitleaks") };
}

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: options.cwd, encoding: "utf8", windowsHide: true, shell: false });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(binary)} failed: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
  }
  return result.stdout.trim();
}

async function verifiedDownload(url, destination, expectedSha256) {
  let bytes = existsSync(destination) ? await readFile(destination) : null;
  if (!bytes || sha256(bytes) !== expectedSha256) {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Gitleaks download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    const actual = sha256(bytes);
    if (actual !== expectedSha256) throw new Error(`Gitleaks download digest mismatch: ${actual}`);
    await writeFile(destination, bytes, { flag: "w" });
  }
  return bytes;
}

async function install(root) {
  const key = platformKey();
  const [suffix, expectedArchiveSha256] = ASSETS[key];
  const archiveName = `gitleaks_${VERSION}_${suffix}`;
  const checksumsName = `gitleaks_${VERSION}_checksums.txt`;
  const { directory, binary } = toolPaths(root);
  await mkdir(directory, { recursive: true });
  const checksumsPath = path.join(directory, checksumsName);
  const checksums = await verifiedDownload(`${RELEASE}/${checksumsName}`, checksumsPath, CHECKSUMS_SHA256);
  const escapedName = archiveName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const manifestEntry = new RegExp(`^([a-f0-9]{64})\\s+\\*?${escapedName}$`, "mi").exec(checksums.toString("utf8"));
  if (!manifestEntry || manifestEntry[1].toLowerCase() !== expectedArchiveSha256) {
    throw new Error(`Gitleaks checksum manifest does not authenticate ${archiveName}`);
  }
  const archive = path.join(directory, archiveName);
  await verifiedDownload(`${RELEASE}/${archiveName}`, archive, expectedArchiveSha256);
  if (process.platform === "win32") {
    run("pwsh", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${directory.replaceAll("'", "''")}' -Force`], { cwd: root });
  } else {
    run("tar", ["-xzf", archive, "-C", directory], { cwd: root });
  }
  const actualVersion = run(binary, ["version"], { cwd: root });
  if (actualVersion !== VERSION) throw new Error(`Expected Gitleaks ${VERSION}, found ${actualVersion}`);
  return { binary, key, archiveSha256: expectedArchiveSha256 };
}

function sanitized(findings, root) {
  return findings.map((finding) => ({
    ruleId: finding.RuleID,
    path: (() => {
      const candidate = String(finding.File ?? "");
      const resolved = path.resolve(root, candidate);
      const relative = path.relative(root, resolved);
      return relative.startsWith("..") || path.isAbsolute(relative) ? "<outside-root>" : relative.replaceAll("\\", "/");
    })(),
    commit: finding.Commit || null,
    startLine: finding.StartLine ?? null
  }));
}

function tomlLiteral(value) {
  if (value.includes("'''")) throw new Error("Gitleaks allowlist values cannot contain triple quotes");
  return `'''${value}'''`;
}

function configurationPath(root, projectPath, fallbackPath) {
  const projectConfig = path.join(root, projectPath);
  return existsSync(projectConfig) ? projectConfig : path.join(skillRoot, "config", fallbackPath);
}

async function scanInputDigest(root) {
  const digest = createHash("sha256");
  const excludedDirectories = new Set([".git", ".skills-orchestrator", "node_modules"]);
  async function walk(directory, relative = "") {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const childRelative = path.join(relative, entry.name).replaceAll("\\", "/");
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      if (childRelative === "reports/gitleaks-scan.json") continue;
      const child = path.join(directory, entry.name);
      const details = await lstat(child);
      if (details.isSymbolicLink()) {
        throw new Error(`Gitleaks scan input cannot contain symbolic links: ${childRelative}`);
      } else if (details.isDirectory()) {
        await walk(child, childRelative);
      } else if (details.isFile()) {
        digest.update(childRelative).update("\0");
        digest.update("file\0").update(await readFile(child)).update("\0");
      } else {
        digest.update(childRelative).update("\0");
        digest.update(`other:${details.mode}\0`);
      }
    }
  }
  await walk(root);
  return digest.digest("hex");
}

async function scannerConfig(root, directory) {
  const base = await readFile(configurationPath(root, ".gitleaks.toml", "gitleaks.toml"), "utf8");
  const policyPath = configurationPath(root, path.join("config", "gitleaks-allowlist.json"), "gitleaks-allowlist.json");
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  if (policy.schemaVersion !== "1.0.0" || !Array.isArray(policy.entries)) throw new Error("Invalid Gitleaks allowlist policy");
  const sections = [];
  const ids = new Set();
  const broadPatterns = new Set([".*", "^.*$", "^.+$", "(?:^|/).*$"]);
  for (const entry of policy.entries) {
    const expiry = Date.parse(entry.expiresAt ?? "");
    const reviewedAt = Date.parse(entry.reviewedAt ?? "");
    if (!entry.id || !entry.description || !entry.owner || !entry.reviewedBy || !Number.isFinite(reviewedAt) || !Number.isFinite(expiry)) {
      throw new Error("Every Gitleaks allowlist requires ID, description, owner, reviewer, review date, and valid expiry");
    }
    if (ids.has(entry.id)) throw new Error(`Duplicate Gitleaks allowlist ID: ${entry.id}`);
    ids.add(entry.id);
    if (reviewedAt > Date.now() || expiry <= reviewedAt || expiry - reviewedAt > 366 * 24 * 60 * 60 * 1000) {
      throw new Error(`Gitleaks allowlist '${entry.id}' has an invalid review window`);
    }
    if (expiry <= Date.now()) throw new Error(`Gitleaks allowlist '${entry.id}' expired`);
    if (!entry.targetRules?.length || !entry.paths?.length || !entry.regexes?.length || !["match", "line"].includes(entry.regexTarget)) {
      throw new Error(`Gitleaks allowlist '${entry.id}' is not narrowly scoped`);
    }
    if (entry.paths.some((value) => broadPatterns.has(value) || !value.endsWith("$")) || entry.regexes.some((value) => broadPatterns.has(value) || !value.startsWith("^") || !value.endsWith("$"))) {
      throw new Error(`Gitleaks allowlist '${entry.id}' must use bounded path and regex patterns`);
    }
    sections.push([
      "[[allowlists]]",
      `description = ${tomlLiteral(`${entry.description}; owner=${entry.owner}; reviewedBy=${entry.reviewedBy}; reviewedAt=${entry.reviewedAt}; expires=${entry.expiresAt}`)}`,
      `targetRules = [${entry.targetRules.map(tomlLiteral).join(", ")}]`,
      'condition = "AND"',
      `regexTarget = ${tomlLiteral(entry.regexTarget)}`,
      `paths = [${entry.paths.map(tomlLiteral).join(", ")}]`,
      `regexes = [${entry.regexes.map(tomlLiteral).join(", ")}]`
    ].join("\n"));
  }
  const content = `${base.trimEnd()}\n\n${sections.join("\n\n")}\n`;
  const config = path.join(directory, "generated.gitleaks.toml");
  await writeFile(config, content, "utf8");
  return { config, sha256: sha256(Buffer.from(content)), allowlistCount: policy.entries.length };
}

function checkpoint(root) {
  const validator = path.join(scriptRoot, "audit-validate.mjs");
  const value = JSON.parse(run(process.execPath, [validator, "checkpoint", root], { cwd: root }));
  if (!/^[a-f0-9]{40,64}$/.test(value?.repositoryRevision ?? "") || !/^[a-f0-9]{64}$/.test(value?.worktreeDigest ?? "")) {
    throw new Error("Audit checkpoint output is missing a valid revision or worktree digest");
  }
  return value;
}

async function readFindings(reportPath) {
  return existsSync(reportPath) ? JSON.parse(await readFile(reportPath, "utf8")) : [];
}

async function scan(root, toolRoot) {
  const { binary, key, archiveSha256 } = await install(toolRoot);
  const { directory } = toolPaths(toolRoot);
  const generated = await scannerConfig(root, directory);
  const worktreeReport = path.join(directory, "worktree.json");
  const stagedReport = path.join(directory, "staged.json");
  const historyReport = path.join(directory, "history.json");
  const common = ["--config", generated.config, "--report-format", "json", "--redact=100", "--exit-code", "0", "--no-banner", "--no-color", "--timeout", "300"];
  const before = checkpoint(root);
  const beforeScanInputDigest = await scanInputDigest(root);
  try {
    run(binary, ["dir", root, ...common, "--report-path", worktreeReport], { cwd: root });
    run(binary, ["git", "--staged", root, ...common, "--report-path", stagedReport], { cwd: root });
    run(binary, ["git", root, "--log-opts=--all --full-history", ...common, "--report-path", historyReport], { cwd: root });
    const worktree = await readFindings(worktreeReport);
    const staged = await readFindings(stagedReport);
    const history = await readFindings(historyReport);
    const after = checkpoint(root);
    const afterScanInputDigest = await scanInputDigest(root);
    if (before.repositoryRevision !== after.repositoryRevision || before.worktreeDigest !== after.worktreeDigest || beforeScanInputDigest !== afterScanInputDigest) {
      throw new Error("Repository changed during Gitleaks scan; discard stale evidence and retry");
    }
    const report = {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      scanner: { name: "gitleaks", version: VERSION, releaseUrl: `${RELEASE}/`, platform: key, archiveSha256, checksumsSha256: CHECKSUMS_SHA256 },
      configurationSha256: generated.sha256,
      allowlistCount: generated.allowlistCount,
      repositoryRevision: after.repositoryRevision,
      worktreeDigest: after.worktreeDigest,
      scanInputDigest: afterScanInputDigest,
      scopes: ["worktree", "staged", "untracked-distributable", "tracked-reports", "all-local-refs", "reachable-history"],
      commands: [
        { scope: "worktree", command: "gitleaks dir <repository> --redact=100 --report-format=json", exitCode: 0 },
        { scope: "staged", command: "gitleaks git --staged <repository> --redact=100 --report-format=json", exitCode: 0 },
        { scope: "history", command: "gitleaks git <repository> --log-opts='--all --full-history' --redact=100 --report-format=json", exitCode: 0 }
      ],
      status: worktree.length || staged.length || history.length ? "failed" : "passed",
      findings: {
        worktree: sanitized(worktree, root),
        staged: sanitized(staged, root),
        history: sanitized(history, root)
      },
      limitations: ["Remote-only refs and unreachable or pruned objects were not scanned."]
    };
    const output = await assertSafeRelativePath(root, "reports/gitleaks-scan.json");
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (report.status === "failed") {
      console.error(`Gitleaks found ${worktree.length} worktree, ${staged.length} staged, and ${history.length} reachable-history finding(s); values are fully redacted.`);
      process.exitCode = 1;
    } else {
      console.log(`Gitleaks ${VERSION} passed: worktree, staged index, reports, all local refs, and reachable history scanned.`);
    }
  } finally {
    await rm(worktreeReport, { force: true });
    await rm(stagedReport, { force: true });
    await rm(historyReport, { force: true });
    await rm(generated.config, { force: true });
  }
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`${name} requires a path`);
  return path.resolve(args[index + 1]);
}

const [command, ...args] = process.argv.slice(2);
if (command === "metadata") {
  console.log(JSON.stringify(metadata()));
} else if (command === "digest") {
  const root = option(args, "--root", frameworkRoot);
  console.log(JSON.stringify({ scanInputDigest: await scanInputDigest(root) }));
} else if (command === "install" || command === "scan") {
  const root = option(args, "--root", frameworkRoot);
  const toolRoot = option(args, "--tool-root", frameworkRoot);
  if (command === "install") console.log(JSON.stringify(await install(toolRoot)));
  else await scan(root, toolRoot);
} else {
  throw new Error("Use metadata|digest|install|scan [--root PATH] [--tool-root PATH]");
}