import { spawnSync } from "node:child_process";

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Release metadata requires Git: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

export function resolveReleaseMetadata(root, environment = process.env) {
  const sourceRevision = git(root, "rev-parse", "HEAD");
  const epoch = environment.SOURCE_DATE_EPOCH ?? git(root, "show", "-s", "--format=%ct", "HEAD");
  if (!/^\d+$/.test(epoch)) throw new Error("SOURCE_DATE_EPOCH must be whole epoch seconds");
  const generatedAt = new Date(Number(epoch) * 1000).toISOString();
  return { sourceRevision, generatedAt };
}