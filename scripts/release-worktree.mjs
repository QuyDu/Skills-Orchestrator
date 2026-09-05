import { spawnSync } from "node:child_process";

export function releaseSourceStatus(root) {
  return spawnSync("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ".",
    ":(exclude)reports",
    ":(exclude)reports/**"
  ], { cwd: root, encoding: "utf8", windowsHide: true });
}