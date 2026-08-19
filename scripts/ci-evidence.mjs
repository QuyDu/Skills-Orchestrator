#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing --${name}`);
  return process.argv[index + 1];
}

const command = process.argv[2];
if (command === "record") {
  const os = option("os").toLowerCase();
  const node = Number.parseInt(option("node"), 10);
  const commit = option("commit");
  const output = path.resolve(option("output"));
  if (!["windows", "linux", "macos"].includes(os) || ![22, 24, 26].includes(node) || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error("Invalid CI evidence values");
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ schemaVersion: "1.0.0", os, node, commit, status: "passed", completedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  console.log(`Recorded ${os}-${node} evidence for ${commit}`);
} else if (command === "aggregate") {
  const input = path.resolve(option("input"));
  const output = path.resolve(option("output"));
  const commit = option("commit");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid aggregate commit");
  const runs = [];
  for (const entry of await readdir(input, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const run = JSON.parse(await readFile(path.join(input, entry.name), "utf8"));
    if (run.schemaVersion !== "1.0.0" || run.commit !== commit || run.status !== "passed"
      || !["windows", "linux", "macos"].includes(run.os) || ![22, 24, 26].includes(run.node)) {
      throw new Error(`Invalid CI run evidence: ${entry.name}`);
    }
    runs.push(run);
  }
  const identities = new Set(runs.map((run) => `${run.os}-${run.node}`));
  const required = ["windows-22", "windows-24", "windows-26", "linux-22", "linux-24", "linux-26", "macos-22", "macos-24", "macos-26"];
  if (runs.length !== required.length || !required.every((identity) => identities.has(identity))) {
    throw new Error(`Incomplete CI evidence: expected ${required.length} unique runs, found ${identities.size}`);
  }
  runs.sort((left, right) => `${left.os}-${left.node}`.localeCompare(`${right.os}-${right.node}`));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ schemaVersion: "1.0.0", commit, generatedAt: new Date().toISOString(), runs }, null, 2)}\n`, "utf8");
  console.log(`Aggregated ${runs.length} CI runs for ${commit}`);
} else {
  throw new Error("Use record or aggregate");
}
