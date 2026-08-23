#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.join(root, "pso.mjs");
const profile = "core";
const mutatingActions = new Set([
  "create",
  "update-skill",
  "update-skill-references",
  "update-framework-file",
  "update-wiring-file",
  "replace-duplicate"
]);

function outputDirectory() {
  const args = process.argv.slice(2);
  if (args.length === 0) return path.join(root, "reports");
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: node scripts/adoption-evidence.mjs [--output-dir PATH]");
    process.exit(0);
  }
  if (args.length !== 2 || args[0] !== "--output-dir" || !args[1]) {
    throw new Error("Use --output-dir with a destination directory");
  }
  return path.resolve(args[1]);
}

function runRuntime(args) {
  const result = spawnSync(process.execPath, [runtime, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`Runtime command failed: node pso.mjs ${args.join(" ")}\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

function dryRun(project) {
  const source = runRuntime(["adopt", "--project", project, "--profile", profile, "--dry-run", "--json"]);
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Adoption dry run did not return valid JSON: ${error.message}`);
  }
}

function compactAction(action) {
  return Object.fromEntries(
    ["action", "kind", "path", "coveredBy", "reason"]
      .filter((key) => action[key] !== undefined)
      .map((key) => [key, action[key]])
  );
}

function summarize(plan) {
  const plannedWrites = plan.actions.filter((action) => mutatingActions.has(action.action)).map(compactAction);
  const coveredAssets = plan.actions.filter((action) => action.action === "covered").map(compactAction);
  const conflicts = plan.actions.filter((action) => action.action === "conflict").map(compactAction);
  return {
    summary: {
      plannedWrites: plannedWrites.length,
      coveredAssets: coveredAssets.length,
      conflicts: conflicts.length,
      alreadyCurrent: plan.counts["already-current"],
      skipped: plan.counts.skipped
    },
    counts: plan.counts,
    plannedWrites,
    coveredAssets,
    conflicts
  };
}

function planSignature(plan) {
  return JSON.stringify({ counts: plan.counts, actions: plan.actions });
}

function groupedWrites(actions) {
  const grouped = new Map();
  for (const action of actions) {
    const paths = grouped.get(action.action) ?? [];
    paths.push(action.path);
    grouped.set(action.action, paths);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function markdownFor(evidence) {
  const coveredRows = evidence.before.coveredAssets.length
    ? evidence.before.coveredAssets.map((action) => `| \`${action.path}\` | \`${action.coveredBy}\` |`).join("\n")
    : "| None | None |";
  const writeRows = groupedWrites(evidence.before.plannedWrites)
    .map(([action, paths]) => `| \`${action}\` | ${paths.length} | ${paths.slice(0, 3).map((item) => `\`${item}\``).join(", ")} |`)
    .join("\n");
  const conflictText = evidence.before.conflicts.length
    ? evidence.before.conflicts.map((action) => `- \`${action.path}\`: ${action.reason}`).join("\n")
    : "No blocking conflicts were present in the applied plan.";
  return `# Adoption Rerun Evidence

- Generated: ${evidence.generatedAt}
- Profile: \`${evidence.profile}\`
- Fixture: \`${evidence.fixture.name}\`
- Runtime: \`${evidence.runtimeVersion}\`

The evidence was generated from a disposable local project. The initial dry run was compared with the persisted applied plan, and a second dry run verified the no-op state.

| Stage | Planned writes | Covered assets | Conflicts | Already current |
| --- | ---: | ---: | ---: | ---: |
| Before apply | ${evidence.before.summary.plannedWrites} | ${evidence.before.summary.coveredAssets} | ${evidence.before.summary.conflicts} | ${evidence.before.summary.alreadyCurrent} |
| No-op rerun | ${evidence.after.summary.plannedWrites} | ${evidence.after.summary.coveredAssets} | ${evidence.after.summary.conflicts} | ${evidence.after.summary.alreadyCurrent} |

## Before Apply

### Covered Assets

| Planned framework asset | Covered by project asset |
| --- | --- |
${coveredRows}

### Planned Writes

| Action | Count | Example paths |
| --- | ---: | --- |
${writeRows}

### Conflicts

${conflictText}

## No-Op Rerun

The rerun is a verified no-op: **${evidence.after.noOp ? "yes" : "no"}**. It planned ${evidence.after.summary.plannedWrites} writes and found ${evidence.after.summary.conflicts} blocking conflicts.
`;
}

async function generate() {
  const output = outputDirectory();
  const fixtureParent = await mkdtemp(path.join(os.tmpdir(), "pso-adoption-evidence-"));
  const project = path.join(fixtureParent, "adoption-evidence-fixture");
  try {
    await mkdir(path.join(project, ".github", "instructions"), { recursive: true });
    await writeFile(path.join(project, "package.json"), "{\"name\":\"adoption-evidence-fixture\"}\n", "utf8");
    await writeFile(path.join(project, ".github", "instructions", "appsec.instructions.md"), `---
applyTo: "**"
description: Application security rules
---

# AppSec
`, "utf8");

    const initialPlan = dryRun(project);
    const dryRunDidNotMutate = !existsSync(path.join(project, "reports"))
      && !existsSync(path.join(project, "project-orchestrator.json"));
    if (!dryRunDidNotMutate) throw new Error("Initial adoption dry run mutated the fixture");
    if (!initialPlan.canApply) throw new Error("Initial adoption plan contains blocking conflicts");

    runRuntime(["adopt", "--project", project, "--profile", profile, "--apply", "--accept-risk"]);
    const appliedPlan = JSON.parse(await readFile(path.join(project, "reports", "adoption-plan.json"), "utf8"));
    const appliedPlanMatchesDryRun = planSignature(initialPlan) === planSignature(appliedPlan);
    if (!appliedPlanMatchesDryRun) throw new Error("Applied adoption plan does not match the reviewed dry run");

    const rerunPlan = dryRun(project);
    const before = summarize(initialPlan);
    const after = summarize(rerunPlan);
    const noOp = after.summary.plannedWrites === 0 && after.summary.conflicts === 0;
    if (!noOp) throw new Error("Second adoption dry run is not a no-op");

    const evidence = {
      schemaVersion: "1.0.0",
      generatedAt: new Date().toISOString(),
      runtimeVersion: initialPlan.runtimeVersion,
      profile,
      fixture: {
        name: "adoption-evidence-fixture",
        stackSignals: ["package.json"],
        projectOwnedAssets: [".github/instructions/appsec.instructions.md"]
      },
      verification: {
        dryRunDidNotMutate,
        appliedPlanMatchesDryRun
      },
      before,
      after: { ...after, noOp }
    };

    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "adoption-rerun-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    await writeFile(path.join(output, "adoption-rerun-evidence.md"), markdownFor(evidence), "utf8");
    console.log(`Wrote adoption rerun evidence to ${output}`);
  } finally {
    await rm(fixtureParent, { recursive: true, force: true });
  }
}

generate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});