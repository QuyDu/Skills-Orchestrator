import assert from "node:assert/strict";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const builder = path.join(root, ".github", "skills", "agent-builder", "scripts", "agent-builder.mjs");
const runtime = path.join(root, "pso.mjs");

function run(project, command, blueprint, extra = []) {
  return spawnSync(process.execPath, [builder, command, "--project", project, "--blueprint", blueprint, ...extra], {
    cwd: root,
    encoding: "utf8"
  });
}

function runRuntime(project, command, blueprint, extra = []) {
  return spawnSync(process.execPath, [runtime, "agent", command, "--project", project, "--blueprint", blueprint, ...extra], {
    cwd: root,
    encoding: "utf8"
  });
}

function runRuntimeBuild(project, extra = [], environment = {}) {
  return spawnSync(process.execPath, [runtime, "agent", "build", "--project", project, ...extra], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment }
  });
}

function buildParameters(overrides = []) {
  return [
    "--type", "copilot",
    "--id", "accessibility-reviewer",
    "--name", "Accessibility Reviewer",
    "--description", "Use when reviewing interfaces for accessibility defects and actionable WCAG improvements.",
    "--purpose", "Review repository evidence and report accessibility defects without changing project files.",
    "--risk", "read-only",
    "--capabilities", "read,search",
    "--user-invocable", "true",
    "--model-invocable", "true",
    "--constraints", "Do not modify files or execute commands during accessibility review.",
    "--approach", "Inspect interface source and existing accessibility test evidence.|Report concrete findings with locations, impact, and suggested remediation.",
    "--output-format", "Return severity-ordered findings followed by unassessed scope and validation gaps.",
    "--subagents", "none",
    "--handoffs-file", "none",
    ...overrides
  ];
}

function blueprint(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    id: "accessibility-reviewer",
    name: "Accessibility Reviewer",
    description: "Use when reviewing interfaces for accessibility defects and actionable WCAG improvements.",
    purpose: "Review repository evidence and report accessibility defects without changing project files.",
    risk: "read-only",
    capabilities: ["search", "read"],
    invocation: { userInvocable: true, modelInvocable: true },
    instructions: {
      constraints: ["Do not modify files or execute commands during accessibility review."],
      approach: [
        "Inspect interface source and existing accessibility test evidence.",
        "Report concrete findings with locations, impact, and suggested remediation."
      ],
      outputFormat: "Return severity-ordered findings followed by unassessed scope and validation gaps."
    },
    subagents: [],
    handoffs: [],
    ...overrides
  };
}

async function fixture() {
  const project = await mkdtemp(path.join(os.tmpdir(), "pso-agent-builder-"));
  await mkdir(path.join(project, ".github", "agents"), { recursive: true });
  await mkdir(path.join(project, "reports"));
  const blueprintPath = path.join(project, "accessibility-reviewer.blueprint.json");
  await writeFile(blueprintPath, `${JSON.stringify(blueprint(), null, 2)}\n`, "utf8");
  return { project, blueprintPath };
}

test("Agent Builder plans, applies, and validates a least-privilege agent", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const validate = run(project, "validate", blueprintPath);
    assert.equal(validate.status, 0, validate.stderr);
    const plan = run(project, "plan", blueprintPath);
    assert.equal(plan.status, 0, plan.stderr);
    const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
    assert.equal(existsSync(target), false, "planning must not create the agent");

    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const planArtifact = JSON.parse(await readFile(planPath, "utf8"));
    assert.equal(planArtifact.action, "create");
    assert.equal(planArtifact.targetPath, ".github/agents/accessibility-reviewer.agent.md");
    assert.deepEqual(JSON.parse(planArtifact.renderedAgent.match(/^tools: (.+)$/m)[1]), ["read", "search"]);

    const apply = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.equal(apply.status, 0, apply.stderr);
    const installed = await readFile(target, "utf8");
    assert.equal(installed, planArtifact.renderedAgent);
    const installedValidation = run(project, "validate", blueprintPath, ["--agent", target]);
    assert.equal(installedValidation.status, 0, installedValidation.stderr);
    const result = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-result.json"), "utf8"));
    assert.equal(result.status, "applied");
    assert.equal(result.action, "create");
    assert.match(result.transactionId, /^AGT-[a-f0-9-]{36}$/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder requires approval and rejects stale plans", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    assert.equal(run(project, "plan", blueprintPath).status, 0);
    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const withoutApproval = run(project, "apply", blueprintPath, ["--plan", planPath]);
    assert.notEqual(withoutApproval.status, 0);
    assert.match(withoutApproval.stderr, /--accept-risk/);

    const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
    await writeFile(target, "project-owned agent\n", "utf8");
    const staleDestination = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.notEqual(staleDestination.status, 0);
    assert.match(staleDestination.stderr, /destination changed/);
    assert.equal(await readFile(target, "utf8"), "project-owned agent\n");

    await rm(target);
    const changed = blueprint({ purpose: "Review current accessibility evidence and report defects without changing any project files." });
    await writeFile(blueprintPath, `${JSON.stringify(changed, null, 2)}\n`, "utf8");
    const staleBlueprint = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.notEqual(staleBlueprint.status, 0);
    assert.match(staleBlueprint.stderr, /Blueprint changed/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder rechecks destination state while holding its apply lock", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    assert.equal(run(project, "plan", blueprintPath).status, 0);
    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
    await writeFile(target, "changed before lock\n", "utf8");
    const result = run(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /destination changed/);
    assert.equal(await readFile(target, "utf8"), "changed before lock\n");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("pso agent updates an existing agent with a transaction backup", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const target = path.join(project, ".github", "agents", "accessibility-reviewer.agent.md");
    const original = "---\nname: Accessibility Reviewer\ndescription: Existing project agent that requires a governed update.\n---\n";
    await writeFile(target, original, "utf8");

    const plan = runRuntime(project, "plan", blueprintPath);
    assert.equal(plan.status, 0, plan.stderr);
    const planPath = path.join(project, "reports", "agent-builder-plan.json");
    const artifact = JSON.parse(await readFile(planPath, "utf8"));
    assert.equal(artifact.action, "update");

    const apply = runRuntime(project, "apply", blueprintPath, ["--plan", planPath, "--accept-risk"]);
    assert.equal(apply.status, 0, apply.stderr);
    const result = JSON.parse(await readFile(path.join(project, "reports", "agent-builder-result.json"), "utf8"));
    assert.equal(result.action, "update");
    const backup = path.join(project, ".skills-orchestrator", "agent-builder", result.transactionId, "agent.backup.md");
    assert.equal(await readFile(backup, "utf8"), original);
    assert.equal(runRuntime(project, "validate", blueprintPath, ["--agent", target]).status, 0);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder fails closed on unsafe or unresolved capabilities", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    const syntheticConnectionString = [
      "DefaultEndpointsProtocol=https",
      `${"Account"}${"Key"}=${["synthetic", "fixture", "value"].join("-")}`,
      "EndpointSuffix=core.windows.net"
    ].join(";");
    const cases = [
      [blueprint({ capabilities: ["read", "execute"] }), /read-only agents cannot use/],
      [blueprint({ capabilities: ["read", "githubRepo"] }), /Unsupported portable capability/],
      [blueprint({ capabilities: ["read", "agent"], subagents: ["missing-reviewer"] }), /Referenced agents do not exist/],
      [blueprint({ handoffs: [{ label: "Review next", agent: "missing-reviewer", prompt: "Review these findings independently.", send: false }] }), /Referenced agents do not exist/],
      [blueprint({ instructions: { ...blueprint().instructions, constraints: ["Do not expose api_key=abcdefghijklmnop in any output."] } }), /suspected secret material/],
      [blueprint({ instructions: { ...blueprint().instructions, constraints: ["Too short"] } }), /must contain 10-500 characters/],
      [blueprint({ schemaVersion: "1.0.0", agentType: "foundry-hosted" }), /requires an Azure environment binding/],
      [blueprint({
        instructions: {
          ...blueprint().instructions,
          outputFormat: `Use ${syntheticConnectionString}`
        }
      }), /suspected secret material/]
    ];
    for (const [candidate, expected] of cases) {
      await writeFile(blueprintPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
      const result = run(project, "plan", blueprintPath);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, expected);
    }
    assert.equal(existsSync(path.join(project, "reports", "agent-builder-plan.json")), false);
    await writeFile(blueprintPath, `${JSON.stringify(blueprint(), null, 2)}\n`, "utf8");
    const outside = path.join(project, "outside.agent.md");
    await writeFile(outside, "outside\n", "utf8");
    const outsideValidation = run(project, "validate", blueprintPath, ["--agent", outside]);
    assert.notEqual(outsideValidation.status, 0);
    assert.match(outsideValidation.stderr, /must match the blueprint target/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder rejects linked report and agent directories", async (context) => {
  const { project, blueprintPath } = await fixture();
  const outside = await mkdtemp(path.join(os.tmpdir(), "pso-agent-builder-outside-"));
  try {
    await rm(path.join(project, "reports"), { recursive: true, force: true });
    try {
      await symlink(outside, path.join(project, "reports"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "UNKNOWN"].includes(error.code)) return context.skip("Creating links requires additional permission");
      throw error;
    }
    const linkedReports = run(project, "plan", blueprintPath);
    assert.notEqual(linkedReports.status, 0);
    assert.match(linkedReports.stderr, /Symbolic links are not allowed/);
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("Agent Builder rejects invocation cycles across workspace agents", async () => {
  const { project, blueprintPath } = await fixture();
  try {
    await writeFile(path.join(project, ".github", "agents", "second-reviewer.agent.md"), `---
name: Second Reviewer
description: Existing reviewer that hands work back to the accessibility reviewer.
tools: ["read", "agent"]
handoffs:
  - label: Return review
    agent: accessibility-reviewer
    prompt: Return the independent findings for reconciliation.
    send: false
---
`, "utf8");
    const candidate = blueprint({
      capabilities: ["read", "agent"],
      handoffs: [{ label: "Independent review", agent: "second-reviewer", prompt: "Review the findings independently before completion.", send: false }]
    });
    await writeFile(blueprintPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    const result = run(project, "validate", blueprintPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Agent invocation cycle/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("pso agent build accepts complete parameters and asks only for missing values", async () => {
  const { project } = await fixture();
  try {
    const built = runRuntimeBuild(project, buildParameters());
    assert.equal(built.status, 0, built.stderr);
    const blueprintPath = path.join(project, "reports", "agent-blueprints", "accessibility-reviewer.json");
    const generated = JSON.parse(await readFile(blueprintPath, "utf8"));
    assert.equal(generated.schemaVersion, "2.0.0");
    assert.equal(generated.agentType, "copilot");
    assert.equal(generated.instructions.approach.length, 2);
    assert.match(generated.instructions.approach[1], /locations, impact, and suggested remediation/);
    assert.equal(Object.hasOwn(generated, "azure"), false);
    assert.equal(existsSync(path.join(project, ".azure", "environment.json")), false);
    assert.equal(existsSync(path.join(project, "reports", "agent-builder-plan.json")), true);

    const missing = runRuntimeBuild(project, buildParameters().filter((value, index, values) => value !== "--purpose" && values[index - 1] !== "--purpose"));
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Missing Agent purpose/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

async function installFakeAzureCli(project) {
  const bin = path.join(project, "fake-az-bin");
  await mkdir(bin);
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PSO_FAKE_AZ_LOG, args.join(" ") + "\\n");
if (process.env.PSO_FAKE_AZ_FAIL === "1" && args[0] === "account" && args[1] === "show") process.exit(9);
if (args[0] === "cloud" && args[1] === "show" && args.includes("--query")) process.stdout.write("AzureUSGovernment\\n");
else if (args[0] === "cloud" && args[1] === "show") process.stdout.write(JSON.stringify({ name: "AzureUSGovernment", endpoints: { resourceManager: "https://management.usgovcloudapi.net/", activeDirectory: "https://login.microsoftonline.us/", portal: "https://portal.azure.us/" }, suffixes: { storageEndpoint: "core.usgovcloudapi.net", keyvaultDns: ".vault.usgovcloudapi.net" } }));
else if (args[0] === "account" && args[1] === "show") process.stdout.write(JSON.stringify({ tenantId: "00000000-0000-0000-0000-000000000001", id: "00000000-0000-0000-0000-000000000002", name: "Fixture Subscription" }));
`;
  if (process.platform === "win32") {
    const nodeScript = path.join(bin, "fake-az.cjs");
    await writeFile(nodeScript, script.replace("#!/usr/bin/env node\n", ""), "utf8");
    await writeFile(path.join(bin, "az.cmd"), `@echo off\r\n"${process.execPath}" "${nodeScript}" %*\r\n`, "utf8");
  } else {
    const executable = path.join(bin, "az");
    await writeFile(executable, script, "utf8");
    await chmod(executable, 0o755);
  }
  return bin;
}

test("Foundry-aware build selects Azure Government and persists only sanitized blueprint context", async () => {
  const { project } = await fixture();
  try {
    const moduleDirectory = path.join(project, ".github", "skills", "azure-discovery", "scripts");
    await mkdir(moduleDirectory, { recursive: true });
    await copyFile(path.join(root, ".github", "skills", "azure-discovery", "scripts", "azure-environment.ps1"), path.join(moduleDirectory, "azure-environment.ps1"));
    const fakeBin = await installFakeAzureCli(project);
    const log = path.join(project, "fake-az.log");
    const parameters = buildParameters([
      "--type", "foundry-prompt",
      "--cloud", "AzureUSGovernment",
      "--location", "usgovarizona",
      "--environment-name", "demo",
      "--authentication-method", "interactive",
      "--subscription-id", "00000000-0000-0000-0000-000000000002"
    ]);
    const built = runRuntimeBuild(project, parameters, {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      PSO_FAKE_AZ_LOG: log
    });
    assert.equal(built.status, 0, built.stderr);
    const generated = JSON.parse(await readFile(path.join(project, "reports", "agent-blueprints", "accessibility-reviewer.json"), "utf8"));
    assert.equal(generated.agentType, "foundry-prompt");
    assert.deepEqual(generated.azure, {
      required: true,
      cloud: "AzureUSGovernment",
      location: "usgovarizona",
      environmentName: "demo",
      authenticationMethod: "interactive",
      subscriptionConfigured: true
    });
    const serialized = JSON.stringify(generated);
    assert.doesNotMatch(serialized, /00000000-0000-0000-0000-00000000000[12]/);
    assert.doesNotMatch(serialized, /token|password|clientSecret|client-secret/i);
    const calls = await readFile(log, "utf8");
    assert.match(calls, /cloud set --name AzureUSGovernment/);
    assert.match(calls, /account set --subscription/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Azure-aware build preserves MCP preferences and resets cloud-specific defaults on override", async () => {
  const { project } = await fixture();
  try {
    const moduleDirectory = path.join(project, ".github", "skills", "azure-discovery", "scripts");
    await mkdir(moduleDirectory, { recursive: true });
    await copyFile(path.join(root, ".github", "skills", "azure-discovery", "scripts", "azure-environment.ps1"), path.join(moduleDirectory, "azure-environment.ps1"));
    const fakeBin = await installFakeAzureCli(project);
    const log = path.join(project, "fake-az.log");
    await mkdir(path.join(project, ".azure"));
    await writeFile(path.join(project, ".azure", "environment.json"), `${JSON.stringify({
      schemaVersion: "1.0.0",
      updatedAt: "2026-01-01T00:00:00.000Z",
      cloud: "AzureCloud",
      location: "eastus2",
      environmentName: "development",
      deploymentTool: "azure-cli",
      authentication: { method: "interactive" },
      subscription: { tenantId: "", subscriptionId: "commercial-subscription", subscriptionName: "Commercial" },
      cloudEndpoints: null,
      mcp: { enabled: true, services: ["documentation", "foundry"], foundryExtensions: { requested: false, enabled: false, clientId: "" } },
      mutationPolicy: "approval-required"
    }, null, 2)}\n`, "utf8");
    const parameters = buildParameters([
      "--type", "foundry-prompt",
      "--cloud", "AzureUSGovernment",
      "--authentication-method", "interactive"
    ]);
    const built = runRuntimeBuild(project, parameters, {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      PSO_FAKE_AZ_LOG: log
    });
    assert.equal(built.status, 0, built.stderr);
    const profile = JSON.parse(await readFile(path.join(project, ".azure", "environment.json"), "utf8"));
    assert.equal(profile.cloud, "AzureUSGovernment");
    assert.equal(profile.location, "usgovvirginia");
    assert.notEqual(profile.subscription.subscriptionId, "commercial-subscription");
    assert.equal(profile.mcp.enabled, true);
    assert.deepEqual(profile.mcp.services.sort(), ["documentation", "foundry"]);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("failed Azure authentication preserves the existing profile and workspace settings", async () => {
  const { project } = await fixture();
  try {
    const moduleDirectory = path.join(project, ".github", "skills", "azure-discovery", "scripts");
    await mkdir(moduleDirectory, { recursive: true });
    await copyFile(path.join(root, ".github", "skills", "azure-discovery", "scripts", "azure-environment.ps1"), path.join(moduleDirectory, "azure-environment.ps1"));
    const fakeBin = await installFakeAzureCli(project);
    const log = path.join(project, "fake-az.log");
    const profilePath = path.join(project, ".azure", "environment.json");
    const settingsPath = path.join(project, ".vscode", "settings.json");
    await mkdir(path.dirname(profilePath));
    await mkdir(path.dirname(settingsPath));
    const originalProfile = `${JSON.stringify({
      schemaVersion: "1.0.0", updatedAt: "2026-01-01T00:00:00.000Z", cloud: "AzureCloud", location: "eastus",
      environmentName: "development", deploymentTool: "azure-cli", authentication: { method: "interactive" },
      subscription: { tenantId: "", subscriptionId: "", subscriptionName: "" }, cloudEndpoints: null,
      mcp: { enabled: false, services: [], foundryExtensions: { requested: false, enabled: false, clientId: "" } },
      mutationPolicy: "approval-required"
    }, null, 2)}\n`;
    const originalSettings = "{\n  \"editor.formatOnSave\": true\n}\n";
    await writeFile(profilePath, originalProfile, "utf8");
    await writeFile(settingsPath, originalSettings, "utf8");
    const result = runRuntimeBuild(project, buildParameters([
      "--type", "foundry-prompt", "--cloud", "AzureUSGovernment", "--location", "usgovarizona"
    ]), {
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      PSO_FAKE_AZ_LOG: log,
      PSO_FAKE_AZ_FAIL: "1"
    });
    assert.notEqual(result.status, 0);
    assert.equal(await readFile(profilePath, "utf8"), originalProfile);
    assert.equal(await readFile(settingsPath, "utf8"), originalSettings);
    assert.equal(existsSync(path.join(project, "reports", "agent-blueprints", "accessibility-reviewer.json")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Agent Builder rejects credential parameters", async () => {
  const { project } = await fixture();
  try {
    const result = runRuntimeBuild(project, [...buildParameters(), "--client-secret", "must-not-be-accepted"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Credential parameter --client-secret is prohibited/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});