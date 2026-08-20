import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const skillsRoot = path.join(root, ".github", "skills");
const expectedSkillIds = [
  "architecture-review",
  "artifact-upgrade",
  "audit-azure-environment",
  "audit-code",
  "audit-plan-remediation",
  "audit-review-findings",
  "change-review",
  "ci-failure-triage",
  "clarify-the-ask",
  "dependency-maintenance",
  "deployment-review",
  "development-environment-readiness",
  "documentation-builder",
  "framework-health-check",
  "multi-agent-coordinator",
  "policy-engine",
  "prepare-commit",
  "project-handoff",
  "project-knowledge-capture",
  "project-memory",
  "project-setup",
  "project-skills-orchestrator",
  "regression-test-development",
  "security-review",
  "skill-create",
  "skill-dependency-manager",
  "skill-inventory",
  "skill-registry",
  "systematic-debugging",
  "workflow-planner",
  "workflow-recovery",
  "workflow-scheduler",
  "workflow-simulator",
  "workflow-state-manager",
  "workflow-telemetry"
];

function frontmatter(source) {
  const block = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(block, "skill must have frontmatter");
  return Object.fromEntries(block[1].split(/\r?\n/).map((line) => {
    const separator = line.indexOf(":");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
  }));
}

function sectionItems(source, heading) {
  const start = source.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `missing ${heading} section`);
  const remainder = source.slice(start + heading.length + 3);
  const next = remainder.search(/^## /m);
  const section = next === -1 ? remainder : remainder.slice(0, next);
  return [...section.matchAll(/^\s*-\s+`?([^`\r\n]+?)`?\s*$/gm)].map((match) => match[1].trim());
}

async function loadSkills() {
  const directories = (await readdir(skillsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  return Promise.all(directories.map(async (entry) => {
    const source = await readFile(path.join(skillsRoot, entry.name, "SKILL.md"), "utf8");
    return { directory: entry.name, source, metadata: frontmatter(source) };
  }));
}

async function loadProfiles() {
  const source = await readFile(path.join(root, "config", "profiles.yaml"), "utf8");
  // The block terminator must be the next profile header or end of input; a bare `$` ends every block at its first newline.
  const blocks = [...source.matchAll(/^ {2}([a-z]+):\r?\n([\s\S]*?)(?=^ {2}[a-z]+:|(?![\s\S]))/gm)];
  assert.ok(blocks.length, "profiles.yaml declares no profiles");
  return new Map(blocks.map(([, name, block]) => [name, {
    parent: block.match(/^ {4}extends: ([a-z]+)\r?$/m)?.[1],
    required: [...block.matchAll(/^ {6}- ([a-z0-9-]+)\r?$/gm)].map((match) => match[1])
  }]));
}

test("all skill IDs and metadata are uniform", async () => {
  const skills = await loadSkills();
  const lifecycles = new Set(["draft", "tested", "validated", "production", "deprecated", "retired"]);
  const confidenceLevels = new Set(["low", "medium", "high"]);
  assert.equal(skills.length, expectedSkillIds.length);
  assert.deepEqual(skills.map((skill) => skill.metadata.name).sort(), expectedSkillIds);
  for (const skill of skills) {
    assert.match(skill.metadata.name, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.equal(skill.metadata.name, skill.directory);
    assert.ok(lifecycles.has(skill.metadata.lifecycle), `${skill.metadata.name} has an invalid lifecycle`);
    assert.ok(confidenceLevels.has(skill.metadata.confidence), `${skill.metadata.name} has an invalid confidence`);
    assert.doesNotMatch(skill.source, /Perform the bounded capability|Current user intent and constraints|Validate required dependencies and input schemas/);
  }
  const promoted = skills.filter((skill) => skill.metadata.lifecycle !== "draft");
  assert.ok(promoted.length > 0, "at least one skill must be promoted beyond draft");
  assert.ok(promoted.every((skill) => skill.metadata.confidence !== "low"), "a promoted skill must not remain low confidence");
});

test("development environment readiness has a strict evidence contract", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const readiness = skills.get("development-environment-readiness");
  assert.ok(sectionItems(readiness.source, "Outputs").includes("reports/development-environment-readiness.json"));
  assert.match(readiness.metadata.description, /onboarding|preparing a new project/);
  assert.match(readiness.source, /must be entered by the user/);
  assert.match(readiness.source, /repository, user, machine, and remote/);

  const schema = JSON.parse(await readFile(path.join(root, "schemas", "development-environment-readiness.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "1.0.0");
  assert.deepEqual(schema.properties.status.enum, ["ready", "degraded", "blocked"]);
  assert.equal(schema.properties.scope.additionalProperties, false);
  assert.equal(schema.properties.requirements.items.additionalProperties, false);
  assert.equal(schema.properties.plannedActions.items.additionalProperties, false);
  assert.deepEqual(schema.properties.plannedActions.items.properties.scope.enum, ["repository", "user", "machine", "remote"]);
  assert.equal(schema.properties.plannedActions.items.allOf[0].then.properties.requiresApproval.const, true);
});

test("clarification has a bounded portable evidence contract", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const clarification = skills.get("clarify-the-ask");
  assert.match(clarification.metadata.description, /ambiguous|conflicting/);
  assert.match(clarification.source, /do not require a specific extension or vendor tool/);
  assert.match(clarification.source, /zero questions is valid/i);
  assert.match(clarification.source, /Never proceed merely because the question limit was reached/);
  assert.ok(sectionItems(clarification.source, "Outputs").includes("reports/clarification-result.json"));

  const planner = skills.get("workflow-planner");
  assert.ok(sectionItems(planner.source, "Composition and Dependencies").includes("clarify-the-ask"));
  assert.match(planner.source, /does not proceed while the clarification result is blocked/);

  const schema = JSON.parse(await readFile(path.join(root, "schemas", "clarification-result.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.status.enum, ["ready", "blocked"]);
  assert.equal(schema.properties.rounds.items.additionalProperties, false);
  assert.equal(schema.properties.rounds.items.properties.questions.items.additionalProperties, false);
  assert.equal(schema.allOf[0].then.properties.openQuestions.minItems, 1);
  assert.equal(schema.allOf[0].then.properties.decision.const, "wait-for-answers");
});

test("every generated and adopted project carries the mandatory clarification protocol", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const clarification = skills.get("clarify-the-ask");
  assert.match(clarification.source, /askEveryPrompt/);
  assert.match(clarification.source, /questionsPerPrompt/);
  assert.match(clarification.source, /confirmPlanBeforeExecution/);
  assert.match(clarification.source, /Never treat the agent's own plan statement as the user's confirmation to proceed\./);

  const orchestrator = skills.get("project-skills-orchestrator");
  assert.match(orchestrator.source, /Route every new user prompt through `clarify-the-ask` first/);

  const runtime = await readFile(path.join(root, "pso.mjs"), "utf8");
  assert.match(runtime, /const CLARIFICATION_PROTOCOL_HEADING = "## Engagement protocol \(mandatory, highest precedence\)"/);
  assert.match(runtime, /Ask exactly three clarifying questions\./);
  assert.match(runtime, /is missing the managed \$\{block\.id\} region/);
  assert.match(runtime, /copies of the managed \$\{block\.id\} region/);

  const templateRoot = path.join(root, "templates", "project");
  const repositoryInstructions = await readFile(path.join(templateRoot, ".github", "copilot-instructions.md"), "utf8");
  assert.match(repositoryInstructions, /<!-- pso:begin id=clarification-protocol version=1 -->/);
  assert.match(repositoryInstructions, /<!-- pso:end id=clarification-protocol -->/);
  assert.match(repositoryInstructions, /<!-- pso:begin id=orchestration-routing version=1 -->/);
  assert.match(repositoryInstructions, /## Engagement protocol \(mandatory, highest precedence\)/);
  assert.match(repositoryInstructions, /Ask exactly three clarifying questions\./);

  const scoped = await readFile(path.join(templateRoot, ".github", "instructions", "clarification.instructions.md"), "utf8");
  assert.match(scoped, /^applyTo: "\*\*"$/m);
  assert.match(scoped, /Ask exactly \*\*three\*\* clarifying questions\./);

  for (const relative of [
    ".editorconfig",
    ".vscode/mcp.json",
    "docs/adr/0000-template.md",
    ".github/agents/azure-architect.agent.md",
    ".github/agents/security-reviewer.agent.md",
    ".github/agents/documentation-writer.agent.md",
    ".github/prompts/create-adr.prompt.md",
    ".github/prompts/security-review.prompt.md",
    ".github/instructions/security.instructions.md"
  ]) {
    assert.ok(existsSync(path.join(templateRoot, relative)), `missing template asset ${relative}`);
  }

  const verification = JSON.parse(await readFile(path.join(root, "schemas", "project-installation-verification.schema.json"), "utf8"));
  assert.equal(verification.properties.checks.properties.clarificationProtocolPresent.const, true);
  assert.equal(verification.properties.checks.properties.customizationAssetsPresent.const, true);

  const configuration = JSON.parse(await readFile(path.join(root, "schemas", "resolved-configuration.schema.json"), "utf8"));
  assert.equal(configuration.properties.clarification.properties.askEveryPrompt.type, "boolean");
  assert.equal(configuration.properties.clarification.properties.questionsPerPrompt.minimum, 1);
  assert.equal(configuration.properties.clarification.properties.confirmPlanBeforeExecution.type, "boolean");
  assert.ok(configuration.properties.clarification.required.includes("askEveryPrompt"));
});

test("profiles are dependency-closed", async () => {
  const skills = await loadSkills();
  const graph = new Map(skills.map((skill) => [
    skill.metadata.name,
    sectionItems(skill.source, "Composition and Dependencies").filter((dependency) => dependency !== "None")
  ]));
  const profiles = await loadProfiles();

  function effective(name) {
    const profile = profiles.get(name);
    assert.ok(profile, `unknown profile ${name}`);
    return new Set([...(profile.parent ? effective(profile.parent) : []), ...profile.required]);
  }

  for (const name of profiles.keys()) {
    const selected = effective(name);
    assert.ok(selected.size, `${name} profile parsed no required skills`);
    for (const skill of selected) {
      for (const dependency of graph.get(skill)) {
        assert.ok(selected.has(dependency), `${name} profile omits ${skill} dependency ${dependency}`);
      }
    }
  }
});

test("the default new-project profile requires the deployed-environment Azure audit", async () => {
  const runtimeSource = await readFile(path.join(root, "pso.mjs"), "utf8");
  const defaultProfile = runtimeSource.match(/^const DEFAULT_PROJECT_PROFILE = "([a-z]+)";$/m)?.[1];
  assert.ok(defaultProfile, "pso.mjs must declare DEFAULT_PROJECT_PROFILE");

  const profiles = await loadProfiles();
  const selected = new Set();
  for (let name = defaultProfile; name; name = profiles.get(name).parent) {
    assert.ok(profiles.has(name), `unknown profile ${name}`);
    for (const skill of profiles.get(name).required) selected.add(skill);
  }
  assert.ok(selected.has("audit-azure-environment"), `${defaultProfile} profile omits audit-azure-environment`);
});

test("all dependencies resolve and the graph is acyclic", async () => {
  const skills = await loadSkills();
  const graph = new Map(skills.map((skill) => [
    skill.metadata.name,
    sectionItems(skill.source, "Composition and Dependencies").filter((dependency) => dependency !== "None")
  ]));
  const visited = new Set();
  const visiting = new Set();
  function visit(name) {
    assert.ok(graph.has(name), `unknown dependency ${name}`);
    assert.ok(!visiting.has(name), `dependency cycle through ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of graph.get(name)) visit(dependency);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of graph.keys()) visit(name);
});

test("audit pipeline has stable handoffs and schemas", async () => {
  const skills = new Map((await loadSkills()).map((skill) => [skill.metadata.name, skill]));
  const audit = skills.get("audit-code");
  const review = skills.get("audit-review-findings");
  const remediation = skills.get("audit-plan-remediation");

  assert.ok(sectionItems(audit.source, "Outputs").includes("reports/code-audit-findings.json"));
  assert.match(audit.source, /memory retention and leaks/);
  assert.match(audit.source, /C# `using`/);
  assert.match(audit.source, /unused, duplicate, wildcard, misplaced, or missing imports/);
  assert.match(audit.source, /oversized or multi-responsibility methods\/classes/);
  assert.ok(sectionItems(review.source, "Composition and Dependencies").includes("audit-code"));
  assert.ok(sectionItems(review.source, "Outputs").includes("reports/code-audit-review.json"));
  assert.ok(sectionItems(remediation.source, "Composition and Dependencies").includes("audit-review-findings"));
  assert.ok(sectionItems(remediation.source, "Outputs").includes("reports/audit-remediation-plan.json"));

  const schemas = [
    "code-audit-findings.schema.json",
    "audit-findings-review.schema.json",
    "audit-remediation-plan.schema.json"
  ];
  for (const schemaName of schemas) {
    const schemaPath = path.join(root, "schemas", schemaName);
    assert.ok(existsSync(schemaPath), `missing ${schemaName}`);
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
  }

  const findingsSchema = JSON.parse(await readFile(path.join(root, "schemas", schemas[0]), "utf8"));
  assert.ok(findingsSchema.required.includes("coverage"));
  assert.equal(findingsSchema.properties.coverage.minItems, 8);
  assert.equal(findingsSchema.properties.coverage.maxItems, 8);
  assert.equal(findingsSchema.properties.coverage.allOf.length, 8);
  assert.ok(findingsSchema.properties.coverage.items.properties.area.enum.includes("resource-management"));
  assert.ok(findingsSchema.properties.coverage.items.properties.area.enum.includes("code-hygiene"));
  assert.ok(findingsSchema.properties.coverage.items.properties.area.enum.includes("design-maintainability"));
  assert.deepEqual(findingsSchema.$defs.finding.required.includes("bugType"), true);
  assert.deepEqual(findingsSchema.$defs.finding.required.includes("securitySeverity"), true);
  assert.deepEqual(findingsSchema.$defs.finding.required.includes("resolution"), true);
  assert.deepEqual(findingsSchema.$defs.finding.required.includes("references"), true);
  assert.ok(findingsSchema.$defs.finding.properties.category.enum.includes("architecture"));
  assert.ok(findingsSchema.$defs.finding.properties.category.enum.includes("concurrency"));

  const planSchema = JSON.parse(await readFile(path.join(root, "schemas", schemas[2]), "utf8"));
  const item = planSchema.properties.items.items;
  assert.ok(item.required.includes("dependsOn"));
  assert.ok(item.required.includes("securitySeverity"));
  assert.ok(item.required.includes("acceptanceCriteria"));
  assert.ok(item.required.includes("rollback"));
});

test("resolved product configuration has a strict versioned schema", async () => {
  const schema = JSON.parse(await readFile(path.join(root, "schemas", "resolved-configuration.schema.json"), "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schemaVersion.const, "1.0.0");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.platforms.additionalProperties, false);
  assert.equal(schema.properties.routing.additionalProperties, false);
  assert.equal(schema.properties.clarification.additionalProperties, false);
  assert.equal(schema.properties.clarification.properties.maxQuestionsPerRound.minimum, 1);
  assert.equal(schema.properties.clarification.properties.maxQuestionsPerRound.maximum, 10);
  assert.equal(schema.properties.policy.additionalProperties, false);

  const transactionSchema = JSON.parse(await readFile(path.join(root, "schemas", "adoption-transaction.schema.json"), "utf8"));
  assert.equal(transactionSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(transactionSchema.properties.schemaVersion.const, "1.0.0");
  assert.equal(transactionSchema.additionalProperties, false);
  assert.equal(transactionSchema.properties.entries.items.additionalProperties, false);
  assert.ok(transactionSchema.properties.status.enum.includes("recovery-required"));
  assert.ok(transactionSchema.required.includes("riskAcceptance"));
  assert.deepEqual(transactionSchema.properties.riskAcceptance.properties.method.enum, ["interactive", "cli-flag"]);

  const verificationSchema = JSON.parse(await readFile(path.join(root, "schemas", "project-installation-verification.schema.json"), "utf8"));
  assert.equal(verificationSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(verificationSchema.additionalProperties, false);
  assert.equal(verificationSchema.properties.schemaVersion.const, "1.0.0");
  assert.deepEqual(verificationSchema.properties.mode.enum, ["new-project-creation", "existing-project-adoption"]);
  assert.equal(verificationSchema.properties.checks.additionalProperties, false);
  assert.equal(verificationSchema.properties.checks.properties.inventoryCurrent.const, true);
  assert.equal(verificationSchema.properties.checks.properties.clarificationConfigured.const, true);
  assert.equal(verificationSchema.properties.checks.properties.agentInstructionsRouted.const, true);
  assert.equal(verificationSchema.properties.checks.properties.workspaceSupportPresent.const, true);
});

test("distribution requires maintained Node release lines and SDL artifacts", async () => {
  const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(packageManifest.engines.node, "^22.0.0 || ^24.0.0 || ^26.0.0");
  for (const relative of ["SECURITY.md", "docs/THREAT-MODEL.md"]) {
    assert.ok(existsSync(path.join(root, relative)), `missing ${relative}`);
  }
  const securityPolicy = await readFile(path.join(root, "SECURITY.md"), "utf8");
  assert.match(securityPolicy, /Microsoft Security Development Lifecycle/);
  assert.match(securityPolicy, /independent security review/i);
  assert.match(securityPolicy, /SBOM/);

  const workflow = await readFile(path.join(root, ".github", "workflows", "security-validation.yml"), "utf8");
  assert.match(workflow, /permissions:\r?\n\s+contents: read/);
  assert.match(workflow, /os: \[windows-latest, ubuntu-latest, macos-latest\]/);
  assert.match(workflow, /node: \[22, 24, 26\]/);
  assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
  assert.match(workflow, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/);
  assert.match(workflow, /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/);
  assert.match(workflow, /cross-platform-ci-evidence\.json/);
  assert.doesNotMatch(workflow, /uses:\s+[^\r\n]+@(v\d+|main|master)\s*$/m);
});
