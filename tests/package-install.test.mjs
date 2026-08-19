import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const candidateRoot = path.join(root, "dist", `${packageManifest.name}-${packageManifest.version}`);
const expectedSkillCount = (await readdir(path.join(root, ".github", "skills"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).length;

test("private package installs offline and resolves bundled project assets", async () => {
  const packageFiles = (await readdir(candidateRoot)).filter((item) => item.endsWith(".tgz"));
  assert.equal(packageFiles.length, 1, "release candidate must contain exactly one private package");
  const installation = await mkdtemp(path.join(os.tmpdir(), "pso-package-install-"));
  const projects = await mkdtemp(path.join(os.tmpdir(), "pso-package-projects-"));
  try {
    const npmCli = [
      process.env.npm_execpath,
      path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
    ].find((candidate) => candidate && existsSync(candidate));
    assert.ok(npmCli && existsSync(npmCli), "npm CLI path is required for package installation test");
    const install = spawnSync(process.execPath, [npmCli, "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", path.join(candidateRoot, packageFiles[0])], {
      cwd: installation,
      encoding: "utf8"
    });
    assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

    const installedRuntime = path.join(installation, "node_modules", packageManifest.name, "pso.mjs");
    const verify = spawnSync(process.execPath, [installedRuntime, "verify"], { cwd: installation, encoding: "utf8" });
    assert.equal(verify.status, 0, `${verify.stdout}\n${verify.stderr}`);
    assert.match(verify.stdout, /Verified registry-free distribution/);

    const create = spawnSync(process.execPath, [installedRuntime, "create-project", "--name", "Packaged Fixture", "--destination", projects, "--accept-risk"], {
      cwd: installation,
      encoding: "utf8"
    });
    assert.equal(create.status, 0, `${create.stdout}\n${create.stderr}`);
    const createdProject = path.join(projects, "packaged-fixture");
    assert.ok(existsSync(path.join(createdProject, ".github", "skills", "project-skills-orchestrator", "SKILL.md")));
    const verification = JSON.parse(await readFile(path.join(createdProject, "reports", "installation-verification.json"), "utf8"));
    assert.equal(verification.status, "passed");
    assert.equal(verification.checks.frameworkSkills, expectedSkillCount);
  } finally {
    await rm(installation, { recursive: true, force: true });
    await rm(projects, { recursive: true, force: true });
  }
});
