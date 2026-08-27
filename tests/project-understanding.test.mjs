import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const helper = path.join(root, ".github", "skills", "project-understanding", "scripts", "project-understanding.mjs");

function run(project, command) {
  return spawnSync(process.execPath, [helper, command, "--root", project], { cwd: root, encoding: "utf8" });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seedProject(project) {
  await mkdir(path.join(project, "src"), { recursive: true });
  await mkdir(path.join(project, "tests"), { recursive: true });
  await mkdir(path.join(project, "schemas"), { recursive: true });
  await mkdir(path.join(project, ".github", "skills", "fixture-skill"), { recursive: true });
  await mkdir(path.join(project, ".github", "prompts"), { recursive: true });
  await mkdir(path.join(project, ".github", "agents"), { recursive: true });
  await writeFile(path.join(project, "README.md"), "# Understanding Fixture\n\nA fixture project that validates complete evidence-grounded repository understanding.\n", "utf8");
  await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "understanding-fixture", scripts: { start: "node src/app.mjs", check: "node --test" } }), "utf8");
  await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\n", "utf8");
  await writeFile(path.join(project, "tests", "app.test.mjs"), "export const tested = true;\n", "utf8");
  await writeFile(path.join(project, "schemas", "fixture.schema.json"), "{\"type\":\"object\"}\n", "utf8");
  await writeFile(path.join(project, ".github", "skills", "fixture-skill", "SKILL.md"), "---\nname: fixture-skill\ndescription: Exercise fixture behavior.\nlifecycle: draft\nconfidence: low\n---\n", "utf8");
  await writeFile(path.join(project, ".github", "prompts", "fixture.prompt.md"), "---\nname: fixture\ndescription: Run the fixture.\n---\n", "utf8");
  await writeFile(path.join(project, ".github", "agents", "fixture.agent.md"), "---\nname: fixture-agent\ndescription: Review the fixture.\n---\n", "utf8");
  await writeFile(path.join(project, ".env"), "SECRET_VALUE=must-not-appear\n", "utf8");
  await writeFile(path.join(project, "credentials.json"), "{\"password\":\"must-not-appear\"}\n", "utf8");
}

test("project-understanding performs a complete atomic rebuild with safe inventories", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-understanding-"));
  try {
    await seedProject(project);
    const first = run(project, "scan");
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    const jsonFile = path.join(project, "reports", "project-understanding.json");
    const markdownFile = path.join(project, "reports", "project-understanding.md");
    assert.ok(existsSync(jsonFile));
    assert.ok(existsSync(markdownFile));
    const report = JSON.parse(await readFile(jsonFile, "utf8"));
    const markdown = await readFile(markdownFile, "utf8");
    assert.equal(report.status, "complete");
    assert.equal(report.scan.mode, "full-rebuild");
    assert.equal(report.scan.files.length, report.scan.fileCount);
    assert.ok(report.scan.files.some((item) => item.path === "src/app.mjs"));
    assert.ok(!report.scan.files.some((item) => item.path === ".env" || item.path === "credentials.json"));
    assert.ok(report.customizations.skills.some((item) => item.name === "fixture-skill" && item.invocation === "/fixture-skill"));
    assert.ok(report.customizations.prompts.some((item) => item.name === "fixture" && item.invocation === "/fixture"));
    assert.ok(report.customizations.agents.some((item) => item.name === "fixture-agent"));
    assert.ok(report.customizations.schemas.some((item) => item.name === "fixture.schema.json"));
    assert.equal(report.markdownSha256, sha256(markdown));
    assert.doesNotMatch(`${JSON.stringify(report)}${markdown}`, /must-not-appear/);

    const priorDigest = report.scan.repositoryDigestSha256;
    await writeFile(markdownFile, "stale content\n", "utf8");
    await writeFile(path.join(project, "src", "app.mjs"), "export const ready = true;\nexport const version = 2;\n", "utf8");
    const second = run(project, "scan");
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    const rebuilt = JSON.parse(await readFile(jsonFile, "utf8"));
    const rebuiltMarkdown = await readFile(markdownFile, "utf8");
    assert.notEqual(rebuilt.scan.repositoryDigestSha256, priorDigest);
    assert.doesNotMatch(rebuiltMarkdown, /stale content/);
    assert.equal(rebuilt.markdownSha256, sha256(rebuiltMarkdown));

    const valid = run(project, "validate");
    assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("project-understanding schema is strict and versioned", async () => {
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "project-understanding.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "1.0.0");
  assert.equal(schema.properties.scan.additionalProperties, false);
  assert.equal(schema.properties.customizations.additionalProperties, false);
  assert.ok(schema.properties.customizations.required.includes("schemas"));
  assert.equal(schema.$defs.item.additionalProperties, false);
  assert.deepEqual(schema.$defs.item.properties.status.enum, ["verified", "inferred", "planned", "unknown"]);
});
