#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const CAPABILITY_ORDER = ["read", "search", "web", "edit", "execute", "agent", "todo"];
const MUTATING_CAPABILITIES = new Set(["edit", "execute"]);
const BLUEPRINT_FIELDS = ["schemaVersion", "agentType", "id", "name", "description", "purpose", "risk", "capabilities", "invocation", "instructions", "subagents", "handoffs", "azure"];
const AGENT_TYPES = new Set(["copilot", "foundry-prompt", "foundry-hosted"]);
const COMMON_OPTIONS = new Set(["project", "blueprint", "plan", "agent", "json", "accept-risk"]);
const BUILD_OPTIONS = new Set([
  "type", "id", "name", "description", "purpose", "risk", "capabilities", "user-invocable", "model-invocable",
  "constraints", "approach", "output-format", "subagents", "handoffs-file", "azure-required", "cloud", "location",
  "environment-name", "authentication-method", "subscription-id"
]);
const FORBIDDEN_CREDENTIAL_OPTIONS = /^(?:password|client-secret|secret|token|api-key|access-key|connection-string)$/i;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*["']?[A-Za-z0-9_+/.=-]{12,}/i,
  /\b(?:AccountKey|SharedAccessKey|SharedAccessSignature)\s*=\s*[^;\s]{8,}/i,
  /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/
];

function fail(message) {
  console.error(`Agent Builder stopped: ${message}`);
  process.exitCode = 1;
}

function parseArgs(values) {
  const result = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (["accept-risk", "json"].includes(key)) {
      result[key] = true;
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    result[key] = next;
    index += 1;
  }
  return result;
}

function validateOptions(options, command) {
  const allowed = new Set(COMMON_OPTIONS);
  if (command === "build") for (const option of BUILD_OPTIONS) allowed.add(option);
  for (const key of Object.keys(options).filter((item) => item !== "_")) {
    if (FORBIDDEN_CREDENTIAL_OPTIONS.test(key)) throw new Error(`Credential parameter --${key} is prohibited; authenticate directly through the Azure CLI session`);
    if (!allowed.has(key)) throw new Error(`Unknown Agent Builder parameter: --${key}`);
  }
}

function parseList(value, separator = /[|,]/) {
  if (value === undefined) return undefined;
  if (String(value).trim().toLowerCase() === "none") return [];
  return String(value).split(separator).map((item) => item.trim()).filter(Boolean);
}

function parseBoolean(value, location) {
  if (typeof value === "boolean") return value;
  if (/^(?:true|yes|y)$/i.test(String(value))) return true;
  if (/^(?:false|no|n)$/i.test(String(value))) return false;
  throw new Error(`${location} must be true or false`);
}

async function askMissing(terminal, value, prompt, fallback) {
  if (value !== undefined && value !== "") return value;
  if (!process.stdin.isTTY) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing ${prompt}; provide it as a parameter`);
  }
  const suffix = fallback === undefined ? "" : ` [${fallback}]`;
  const answer = (await terminal.question(`${prompt}${suffix}: `)).trim();
  return answer || fallback;
}

function findPowerShell() {
  for (const command of ["pwsh", "powershell"]) {
    const result = spawnSync(command, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], { encoding: "utf8", windowsHide: true });
    if (!result.error && result.status === 0) return command;
  }
  throw new Error("PowerShell is required to initialize an Azure environment");
}

async function resolveAzureContext(root, options, terminal) {
  const profilePath = await safeRelativeTarget(root, ".azure/environment.json");
  await safeRelativeTarget(root, ".vscode/settings.json");
  let profile = null;
  if (existsSync(profilePath)) {
    profile = await readJson(profilePath, "Azure environment profile");
    if (!["AzureCloud", "AzureUSGovernment"].includes(profile.cloud)) throw new Error("Saved Azure cloud is invalid");
  }
  const cloudInput = await askMissing(terminal, options.cloud ?? profile?.cloud, "Azure cloud (AzureCloud or AzureUSGovernment)", "AzureCloud");
  const cloud = /^(?:gov|government|azureusgovernment)$/i.test(cloudInput) ? "AzureUSGovernment"
    : /^(?:commercial|azurecloud)$/i.test(cloudInput) ? "AzureCloud" : cloudInput;
  if (!["AzureCloud", "AzureUSGovernment"].includes(cloud)) throw new Error("Azure cloud must be AzureCloud or AzureUSGovernment");
  const savedCloudMatches = !profile || profile.cloud === cloud;
  const defaultLocation = cloud === "AzureUSGovernment" ? "usgovvirginia" : "eastus";
  const location = await askMissing(terminal, options.location ?? (savedCloudMatches ? profile?.location : undefined), "Azure location", defaultLocation);
  const environmentName = await askMissing(terminal, options["environment-name"] ?? profile?.environmentName, "Azure environment name", "development");
  const authenticationMethod = await askMissing(terminal, options["authentication-method"] ?? profile?.authentication?.method, "Authentication method (interactive or managed-identity)", "interactive");
  let subscriptionId = options["subscription-id"] ?? (savedCloudMatches ? profile?.subscription?.subscriptionId : "") ?? "";
  if (!subscriptionId && process.stdin.isTTY) {
    subscriptionId = await askMissing(terminal, undefined, "Azure subscription ID (leave blank to use the login default)", "");
  }
  const shell = findPowerShell();
  const bridge = path.join(path.dirname(fileURLToPath(import.meta.url)), "azure-context.ps1");
  const args = ["-NoProfile", "-File", bridge, "-ProjectRoot", root, "-Cloud", cloud, "-Location", location,
    "-EnvironmentName", environmentName, "-AuthenticationMethod", authenticationMethod];
  if (subscriptionId) args.push("-SubscriptionId", subscriptionId);
  const result = spawnSync(shell, args, { cwd: root, windowsHide: true, stdio: "inherit" });
  if (result.error) throw new Error(`Azure authentication could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Azure authentication failed with exit code ${result.status}`);
  const updated = await readJson(profilePath, "Azure environment profile");
  return {
    cloud: updated.cloud,
    location: updated.location,
    environmentName: updated.environmentName,
    authenticationMethod: updated.authentication.method,
    subscriptionConfigured: Boolean(updated.subscription?.subscriptionId)
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknown(value, allowed, location) {
  if (!isRecord(value)) throw new Error(`${location} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unknown ${location} field: ${unknown.join(", ")}`);
}

function requireString(value, location, minimum, maximum) {
  if (typeof value !== "string" || value.trim().length < minimum || value.length > maximum) {
    throw new Error(`${location} must contain ${minimum}-${maximum} characters`);
  }
}

function requireStringArray(value, location, {
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
  itemMinimum = 1,
  itemMaximum = 1000,
  pattern
} = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${location} must contain ${minimum}-${maximum} items`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${location} must not contain duplicates`);
  for (const [index, item] of value.entries()) {
    requireString(item, `${location}[${index}]`, itemMinimum, itemMaximum);
    if (pattern && !pattern.test(item)) throw new Error(`${location}[${index}] is invalid: ${item}`);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeAtomic(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function safeProjectRoot(requestedRoot) {
  if (!requestedRoot) throw new Error("Use --project with the target repository root");
  const root = await realpath(path.resolve(requestedRoot));
  const details = await lstat(root);
  if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Project root must be a real directory");
  return root;
}

async function safeRelativeTarget(root, relative) {
  if (!relative || path.isAbsolute(relative) || relative.includes("\\")) throw new Error(`Unsafe managed path: ${relative || "empty"}`);
  const segments = relative.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    throw new Error(`Unsafe managed path: ${relative}`);
  }
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in managed paths: ${relative}`);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
  return path.join(root, ...segments);
}

async function safeTarget(root, relative) {
  if (!/^\.github\/agents\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.agent\.md$/.test(relative)) {
    throw new Error(`Unsafe agent target: ${relative}`);
  }
  return safeRelativeTarget(root, relative);
}

async function readJson(file, location) {
  if (!file) throw new Error(`Use --${location} with a JSON file`);
  try {
    return JSON.parse(await readFile(path.resolve(file), "utf8"));
  } catch (error) {
    throw new Error(`Invalid ${location} JSON: ${error.message}`);
  }
}

function validateBlueprint(blueprint) {
  rejectUnknown(blueprint, BLUEPRINT_FIELDS, "blueprint");
  if (!["1.0.0", "2.0.0"].includes(blueprint.schemaVersion)) throw new Error("Unsupported blueprint schemaVersion");
  const agentType = blueprint.agentType ?? (blueprint.schemaVersion === "1.0.0" ? "copilot" : undefined);
  if (!AGENT_TYPES.has(agentType)) throw new Error("agentType must be copilot, foundry-prompt, or foundry-hosted");
  requireString(blueprint.id, "id", 1, 64);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(blueprint.id)) throw new Error("id must be lowercase kebab-case");
  requireString(blueprint.name, "name", 3, 80);
  requireString(blueprint.description, "description", 40, 500);
  if (!/\b(?:use|when|review|build|create|analy[sz]e|investigate|validate|design|document)\b/i.test(blueprint.description)) {
    throw new Error("description must include concrete discovery or task language");
  }
  requireString(blueprint.purpose, "purpose", 20, 1000);
  if (!new Set(["read-only", "mutating"]).has(blueprint.risk)) throw new Error("risk must be read-only or mutating");
  requireStringArray(blueprint.capabilities, "capabilities", { minimum: 1, maximum: CAPABILITY_ORDER.length });
  for (const capability of blueprint.capabilities) {
    if (!CAPABILITY_ORDER.includes(capability)) throw new Error(`Unsupported portable capability: ${capability}`);
  }
  if (blueprint.risk === "read-only" && blueprint.capabilities.some((item) => MUTATING_CAPABILITIES.has(item))) {
    throw new Error("read-only agents cannot use edit or execute");
  }
  rejectUnknown(blueprint.invocation, ["userInvocable", "modelInvocable"], "invocation");
  if (typeof blueprint.invocation.userInvocable !== "boolean" || typeof blueprint.invocation.modelInvocable !== "boolean") {
    throw new Error("invocation flags must be boolean");
  }
  if (!blueprint.invocation.userInvocable && !blueprint.invocation.modelInvocable) throw new Error("agent must have at least one invocation route");
  rejectUnknown(blueprint.instructions, ["constraints", "approach", "outputFormat"], "instructions");
  requireStringArray(blueprint.instructions.constraints, "instructions.constraints", {
    minimum: 1, maximum: 12, itemMinimum: 10, itemMaximum: 500
  });
  requireStringArray(blueprint.instructions.approach, "instructions.approach", {
    minimum: 2, maximum: 12, itemMinimum: 10, itemMaximum: 500
  });
  requireString(blueprint.instructions.outputFormat, "instructions.outputFormat", 10, 1000);
  const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  requireStringArray(blueprint.subagents, "subagents", { maximum: 16, itemMaximum: 64, pattern: idPattern });
  if (blueprint.subagents.length && !blueprint.capabilities.includes("agent")) throw new Error("subagents require the agent capability");
  if (blueprint.subagents.includes(blueprint.id)) throw new Error("self-invocation is not allowed");
  if (!Array.isArray(blueprint.handoffs) || blueprint.handoffs.length > 8) throw new Error("handoffs must contain at most 8 items");
  const handoffAgents = new Set();
  for (const [index, handoff] of blueprint.handoffs.entries()) {
    rejectUnknown(handoff, ["label", "agent", "prompt", "send"], `handoffs[${index}]`);
    requireString(handoff.label, `handoffs[${index}].label`, 3, 80);
    requireString(handoff.agent, `handoffs[${index}].agent`, 1, 64);
    if (!idPattern.test(handoff.agent)) throw new Error(`handoffs[${index}].agent is invalid`);
    if (handoff.agent === blueprint.id) throw new Error("self-handoffs are not allowed");
    if (handoffAgents.has(handoff.agent)) throw new Error(`duplicate handoff target: ${handoff.agent}`);
    handoffAgents.add(handoff.agent);
    requireString(handoff.prompt, `handoffs[${index}].prompt`, 10, 1000);
    if (handoff.send !== false) throw new Error("handoffs must require user review with send set to false");
  }
  if (blueprint.azure !== undefined) {
    rejectUnknown(blueprint.azure, ["required", "cloud", "location", "environmentName", "authenticationMethod", "subscriptionConfigured"], "azure");
    if (typeof blueprint.azure.required !== "boolean") throw new Error("azure.required must be boolean");
    if (!["AzureCloud", "AzureUSGovernment"].includes(blueprint.azure.cloud)) throw new Error("azure.cloud is invalid");
    requireString(blueprint.azure.location, "azure.location", 1, 64);
    if (!/^[a-z0-9-]+$/.test(blueprint.azure.location)) throw new Error("azure.location is invalid");
    requireString(blueprint.azure.environmentName, "azure.environmentName", 1, 40);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,39}$/.test(blueprint.azure.environmentName)) throw new Error("azure.environmentName is invalid");
    if (!["interactive", "managed-identity"].includes(blueprint.azure.authenticationMethod)) throw new Error("azure.authenticationMethod is invalid");
    if (typeof blueprint.azure.subscriptionConfigured !== "boolean") throw new Error("azure.subscriptionConfigured must be boolean");
  }
  if (agentType.startsWith("foundry-") && blueprint.azure?.required !== true) {
    throw new Error(`${agentType} requires an Azure environment binding`);
  }
  const serialized = stableJson(blueprint);
  if (SECRET_PATTERNS.some((pattern) => pattern.test(serialized))) throw new Error("blueprint contains suspected secret material");
  return blueprint;
}

async function existingAgentIds(root) {
  const directory = path.join(root, ".github", "agents");
  if (!existsSync(directory)) return new Set();
  const entries = await readdir(directory, { withFileTypes: true });
  return new Set(entries
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".agent.md"))
    .map((entry) => entry.name.slice(0, -".agent.md".length)));
}

function frontmatterReferences(source) {
  const block = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return [];
  const references = [];
  const agents = block[1].match(/^agents:\s*\[(.*)\]\s*$/m)?.[1] ?? "";
  for (const match of agents.matchAll(/["']([a-z][a-z0-9]*(?:-[a-z0-9]+)*)["']/g)) references.push(match[1]);
  for (const match of block[1].matchAll(/^\s+agent:\s*["']?([a-z][a-z0-9]*(?:-[a-z0-9]+)*)["']?\s*$/gm)) references.push(match[1]);
  return [...new Set(references)];
}

async function assertAcyclicReferences(root, blueprint) {
  const directory = path.join(root, ".github", "agents");
  const graph = new Map();
  if (existsSync(directory)) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".agent.md")) continue;
      const id = entry.name.slice(0, -".agent.md".length);
      graph.set(id, frontmatterReferences(await readFile(path.join(directory, entry.name), "utf8")));
    }
  }
  graph.set(blueprint.id, [...new Set([...blueprint.subagents, ...blueprint.handoffs.map((item) => item.agent)])]);
  const visiting = new Set();
  const visited = new Set();
  function visit(id, trail = []) {
    if (visiting.has(id)) throw new Error(`Agent invocation cycle: ${[...trail, id].join(" -> ")}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const referenced of graph.get(id) ?? []) {
      if (graph.has(referenced)) visit(referenced, [...trail, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of graph.keys()) visit(id);
}

async function validateReferences(root, blueprint) {
  const existing = await existingAgentIds(root);
  const unresolved = [...new Set([...blueprint.subagents, ...blueprint.handoffs.map((item) => item.agent)])]
    .filter((id) => id !== blueprint.id && !existing.has(id));
  if (unresolved.length) throw new Error(`Referenced agents do not exist: ${unresolved.join(", ")}`);
  await assertAcyclicReferences(root, blueprint);
}

function renderAgent(blueprint) {
  const capabilities = [...blueprint.capabilities].sort((left, right) => CAPABILITY_ORDER.indexOf(left) - CAPABILITY_ORDER.indexOf(right));
  const lines = [
    "---",
    `name: ${JSON.stringify(blueprint.name)}`,
    `description: ${JSON.stringify(blueprint.description)}`,
    `tools: ${JSON.stringify(capabilities)}`,
    `user-invocable: ${blueprint.invocation.userInvocable}`,
    `disable-model-invocation: ${!blueprint.invocation.modelInvocable}`
  ];
  if (blueprint.subagents.length) lines.push(`agents: ${JSON.stringify([...blueprint.subagents].sort())}`);
  if (blueprint.handoffs.length) {
    lines.push("handoffs:");
    for (const handoff of blueprint.handoffs) {
      lines.push(`  - label: ${JSON.stringify(handoff.label)}`);
      lines.push(`    agent: ${handoff.agent}`);
      lines.push(`    prompt: ${JSON.stringify(handoff.prompt)}`);
      lines.push("    send: false");
    }
  }
  lines.push("---", "", `# ${blueprint.name}`, "", blueprint.purpose, "", "## Constraints", "");
  lines.push(...blueprint.instructions.constraints.map((item) => `- ${item}`));
  lines.push("", "## Approach", "");
  lines.push(...blueprint.instructions.approach.map((item, index) => `${index + 1}. ${item}`));
  lines.push("", "## Output Format", "", blueprint.instructions.outputFormat, "");
  return lines.join("\n");
}

async function fileState(file) {
  if (!existsSync(file)) return "missing";
  const details = await lstat(file);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Agent destination is not a regular file: ${file}`);
  return `file:sha256:${sha256(await readFile(file))}`;
}

async function loadBlueprint(file) {
  const blueprint = validateBlueprint(await readJson(file, "blueprint"));
  const content = `${stableJson(blueprint)}\n`;
  return { blueprint, sha256: sha256(content) };
}

async function buildBlueprint(root, options) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const agentType = await askMissing(terminal, options.type, "Agent type (copilot, foundry-prompt, or foundry-hosted)", "copilot");
    if (!AGENT_TYPES.has(agentType)) throw new Error("Agent type must be copilot, foundry-prompt, or foundry-hosted");
    const id = await askMissing(terminal, options.id, "Agent ID (lowercase kebab-case)");
    const name = await askMissing(terminal, options.name, "Agent display name");
    const description = await askMissing(terminal, options.description, "Agent discovery description");
    const purpose = await askMissing(terminal, options.purpose, "Agent purpose");
    const risk = await askMissing(terminal, options.risk, "Risk (read-only or mutating)", "read-only");
    const capabilities = parseList(await askMissing(terminal, options.capabilities, "Capabilities separated by commas", risk === "read-only" ? "read,search" : "read,search,edit"));
    const userInvocable = parseBoolean(await askMissing(terminal, options["user-invocable"], "User invocable (true or false)", "true"), "user-invocable");
    const modelInvocable = parseBoolean(await askMissing(terminal, options["model-invocable"], "Model invocable (true or false)", "true"), "model-invocable");
    const constraints = parseList(await askMissing(terminal, options.constraints, "Constraints separated by |"), /\|/);
    const approach = parseList(await askMissing(terminal, options.approach, "Approach steps separated by |"), /\|/);
    const outputFormat = await askMissing(terminal, options["output-format"], "Required output format");
    const subagents = parseList(await askMissing(terminal, options.subagents, "Permitted subagents separated by commas, or none", "none"));
    const handoffsPath = await askMissing(terminal, options["handoffs-file"], "Handoffs JSON file, or none", "none");
    const handoffs = handoffsPath === "none" ? [] : await readJson(handoffsPath, "handoffs-file");
    if (!Array.isArray(handoffs)) throw new Error("handoffs-file must contain a JSON array");

    const azureRequired = agentType.startsWith("foundry-") || parseBoolean(options["azure-required"] ?? false, "azure-required");
    const azure = azureRequired ? { required: true, ...await resolveAzureContext(root, options, terminal) } : undefined;
    const candidate = {
      schemaVersion: "2.0.0", agentType, id, name, description, purpose, risk, capabilities,
      invocation: { userInvocable, modelInvocable },
      instructions: { constraints, approach, outputFormat }, subagents, handoffs,
      ...(azure ? { azure } : {})
    };
    validateBlueprint(candidate);
    await validateReferences(root, candidate);
    const blueprintPath = await safeRelativeTarget(root, `reports/agent-blueprints/${id}.json`);
    await writeAtomic(blueprintPath, `${JSON.stringify(candidate, null, 2)}\n`);
    const plan = await createPlan(root, blueprintPath);
    return { blueprintPath: path.relative(root, blueprintPath).replaceAll("\\", "/"), plan };
  } finally {
    terminal.close();
  }
}

async function createPlan(root, blueprintFile) {
  const { blueprint, sha256: blueprintSha256 } = await loadBlueprint(blueprintFile);
  await validateReferences(root, blueprint);
  const targetPath = `.github/agents/${blueprint.id}.agent.md`;
  const target = await safeTarget(root, targetPath);
  const targetState = await fileState(target);
  const renderedAgent = renderAgent(blueprint);
  const renderedSha256 = sha256(renderedAgent);
  const action = targetState === "missing" ? "create" : targetState === `file:sha256:${renderedSha256}` ? "unchanged" : "update";
  const warnings = blueprint.risk === "mutating"
    ? ["This agent can modify files or execute commands; review its tools and instructions before applying."]
    : [];
  const relativeBlueprint = path.relative(root, path.resolve(blueprintFile)).replaceAll("\\", "/");
  const plan = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    status: "review-required",
    projectRoot: root,
    blueprintPath: relativeBlueprint.startsWith("../") ? path.resolve(blueprintFile) : relativeBlueprint,
    blueprintSha256,
    targetPath,
    targetState,
    action,
    renderedSha256,
    renderedAgent,
    warnings
  };
  const reports = await safeRelativeTarget(root, "reports");
  const markdown = [
    "# Agent Builder Plan",
    "",
    `Generated: ${plan.generatedAt}`,
    `Agent: ${blueprint.name} (${blueprint.id})`,
    `Action: **${action}**`,
    `Risk: **${blueprint.risk}**`,
    `Target: \`${targetPath}\``,
    `Blueprint SHA-256: \`${blueprintSha256}\``,
    `Rendered SHA-256: \`${renderedSha256}\``,
    "",
    "## Capabilities",
    "",
    ...[...blueprint.capabilities].sort().map((item) => `- ${item}`),
    "",
    "## Warnings",
    "",
    ...(warnings.length ? warnings.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Rendered Agent",
    "",
    "```markdown",
    renderedAgent.trimEnd(),
    "```",
    ""
  ].join("\n");
  await writeAtomic(path.join(reports, "agent-builder-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await writeAtomic(path.join(reports, "agent-builder-plan.md"), markdown);
  return plan;
}

async function applyPlan(root, blueprintFile, planFile, accepted) {
  if (!accepted) throw new Error("Use --accept-risk after reviewing the Agent Builder plan");
  const plan = await readJson(planFile, "plan");
  rejectUnknown(plan, ["schemaVersion", "generatedAt", "status", "projectRoot", "blueprintPath", "blueprintSha256", "targetPath", "targetState", "action", "renderedSha256", "renderedAgent", "warnings"], "plan");
  if (plan.schemaVersion !== "1.0.0" || plan.status !== "review-required") throw new Error("Unsupported Agent Builder plan");
  if (plan.projectRoot !== root) throw new Error("Plan project root does not match --project");
  const { blueprint, sha256: blueprintSha256 } = await loadBlueprint(blueprintFile);
  await validateReferences(root, blueprint);
  if (blueprintSha256 !== plan.blueprintSha256) throw new Error("Blueprint changed after plan review");
  const renderedAgent = renderAgent(blueprint);
  if (sha256(renderedAgent) !== plan.renderedSha256 || renderedAgent !== plan.renderedAgent) throw new Error("Plan rendered content is invalid or stale");
  const expectedTargetPath = `.github/agents/${blueprint.id}.agent.md`;
  if (plan.targetPath !== expectedTargetPath) throw new Error("Plan target does not match blueprint ID");
  const target = await safeTarget(root, plan.targetPath);
  if (await fileState(target) !== plan.targetState) throw new Error("Agent destination changed after plan review");
  const expectedAction = plan.targetState === "missing" ? "create" : plan.targetState === `file:sha256:${plan.renderedSha256}` ? "unchanged" : "update";
  if (plan.action !== expectedAction) throw new Error("Plan action does not match destination state");

  const transactionId = plan.action === "unchanged" ? null : `AGT-${randomUUID()}`;
  const transactionRoot = transactionId
    ? await safeRelativeTarget(root, `.skills-orchestrator/agent-builder/${transactionId}`)
    : null;
  const lockPath = await safeRelativeTarget(root, ".skills-orchestrator/agent-builder.lock");
  await mkdir(path.dirname(lockPath), { recursive: true });
  try {
    await writeFile(lockPath, `${JSON.stringify({ processId: process.pid, targetPath: plan.targetPath }, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Another Agent Builder apply operation holds the project lock");
    throw error;
  }

  let backup = null;
  try {
    if (await fileState(target) !== plan.targetState) throw new Error("Agent destination changed while acquiring the project lock");
    if (transactionRoot) {
      await mkdir(transactionRoot, { recursive: true });
      if (plan.targetState !== "missing") {
        backup = path.join(transactionRoot, "agent.backup.md");
        await copyFile(target, backup);
      }
      await writeAtomic(path.join(transactionRoot, "transaction.json"), `${JSON.stringify({
        schemaVersion: "1.0.0", transactionId, status: "prepared", targetPath: plan.targetPath,
        originalState: plan.targetState, blueprintSha256, renderedSha256: plan.renderedSha256
      }, null, 2)}\n`);
      await writeAtomic(target, renderedAgent);
      if (await fileState(target) !== `file:sha256:${plan.renderedSha256}`) throw new Error("Installed agent hash does not match the reviewed plan");
      await writeAtomic(path.join(transactionRoot, "transaction.json"), `${JSON.stringify({
        schemaVersion: "1.0.0", transactionId, status: "applied", targetPath: plan.targetPath,
        originalState: plan.targetState, blueprintSha256, renderedSha256: plan.renderedSha256
      }, null, 2)}\n`);
    }
  } catch (error) {
    if (transactionRoot) {
      await rm(target, { force: true });
      if (backup) await copyFile(backup, target);
    }
    throw error;
  } finally {
    await rm(lockPath, { force: true });
  }

  const result = {
    schemaVersion: "1.0.0",
    completedAt: new Date().toISOString(),
    status: "applied",
    action: plan.action,
    targetPath: plan.targetPath,
    blueprintSha256,
    renderedSha256: plan.renderedSha256,
    transactionId
  };
  const resultPath = await safeRelativeTarget(root, "reports/agent-builder-result.json");
  await writeAtomic(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

async function validateInstalled(root, blueprintFile, agentFile) {
  const { blueprint } = await loadBlueprint(blueprintFile);
  await validateReferences(root, blueprint);
  const expected = renderAgent(blueprint);
  const target = await safeTarget(root, `.github/agents/${blueprint.id}.agent.md`);
  if (agentFile && path.resolve(agentFile) !== target) throw new Error("--agent must match the blueprint target inside the project");
  const actual = await readFile(target, "utf8");
  if (actual !== expected) throw new Error(`Installed agent does not match blueprint: ${path.relative(root, target)}`);
  return { status: "valid", id: blueprint.id, sha256: sha256(actual) };
}

function usage() {
  console.log(`Governed Agent Builder

Usage:
  agent-builder.mjs build --project PATH [blueprint parameters]
  agent-builder.mjs validate --project PATH --blueprint FILE [--agent FILE]
  agent-builder.mjs plan --project PATH --blueprint FILE
  agent-builder.mjs apply --project PATH --blueprint FILE --plan FILE --accept-risk

The blueprint is authoritative. Plan before apply; application fails if the blueprint or destination changes.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  if (!command || command === "help") return usage();
  validateOptions(options, command);
  const root = await safeProjectRoot(options.project);
  if (command === "build") {
    const result = await buildBlueprint(root, options);
    return console.log(options.json ? JSON.stringify(result, null, 2) : `Agent blueprint and plan ready: ${result.blueprintPath}`);
  }
  if (command === "validate") {
    const loaded = await loadBlueprint(options.blueprint);
    await validateReferences(root, loaded.blueprint);
    const result = options.agent
      ? await validateInstalled(root, options.blueprint, options.agent)
      : { status: "valid", id: loaded.blueprint.id };
    return console.log(options.json ? JSON.stringify(result, null, 2) : `Valid agent blueprint: ${result.id}`);
  }
  if (command === "plan") {
    const result = await createPlan(root, options.blueprint);
    return console.log(options.json ? JSON.stringify(result, null, 2) : `Agent plan ready for review: ${result.action} ${result.targetPath}`);
  }
  if (command === "apply") {
    const result = await applyPlan(root, options.blueprint, options.plan, options["accept-risk"] === true);
    return console.log(options.json ? JSON.stringify(result, null, 2) : `Agent ${result.action}: ${result.targetPath}`);
  }
  throw new Error(`Unknown Agent Builder command: ${command}`);
}

main().catch((error) => fail(error.message));