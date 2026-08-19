#!/usr/bin/env node
import { createHash, verify as verifySignature } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeRelativePath } from "./safe-path.mjs";
import { canonicalReviewPayload, requireTrustedPublicKey } from "./trust.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const candidateOnly = process.argv.includes("--candidate");
const artifactRoot = path.join(root, "dist", `${packageManifest.name}-${packageManifest.version}`);
await assertSafeRelativePath(root, "dist");
await assertSafeRelativePath(root, path.relative(root, artifactRoot));
if (!existsSync(artifactRoot)) throw new Error(`Release artifact does not exist: ${artifactRoot}`);

async function walk(directory, relative = "") {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release verification rejected symbolic link: ${child}`);
    if (entry.isDirectory()) files.push(...await walk(directory, child));
    else if (entry.isFile()) files.push(child.replaceAll("\\", "/"));
  }
  return files;
}

const checksumPath = path.join(artifactRoot, "SHA256SUMS");
const checksumContent = await readFile(checksumPath, "utf8");
const expected = new Map();
for (const line of checksumContent.split(/\r?\n/).filter(Boolean)) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) throw new Error(`Invalid SHA256SUMS entry: ${line}`);
  if (expected.has(match[2])) throw new Error(`Duplicate SHA256SUMS entry: ${match[2]}`);
  expected.set(match[2], match[1]);
}
const allowedUnlisted = new Set(["SHA256SUMS", "release-signature.json", "independent-review.json"]);
for (const relative of await walk(artifactRoot)) {
  if (allowedUnlisted.has(relative)) continue;
  if (!expected.has(relative)) throw new Error(`Release file is not checksum-covered: ${relative}`);
}
for (const [relative, digest] of expected) {
  const target = path.join(artifactRoot, relative);
  if (!existsSync(target)) throw new Error(`Checksummed release file is missing: ${relative}`);
  const actual = createHash("sha256").update(await readFile(target)).digest("hex");
  if (actual !== digest) throw new Error(`Checksum mismatch: ${relative}`);
}

const payloadManifest = await readFile(path.join(artifactRoot, "PAYLOAD-SHA256SUMS"), "utf8");
const payloadDigest = createHash("sha256").update(payloadManifest).digest("hex");
const payloadEntries = new Map();
for (const line of payloadManifest.split(/\r?\n/).filter(Boolean)) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) throw new Error(`Invalid PAYLOAD-SHA256SUMS entry: ${line}`);
  payloadEntries.set(match[2], match[1]);
}
const provenance = JSON.parse(await readFile(path.join(artifactRoot, "provenance.intoto.json"), "utf8"));
const subject = provenance.subject?.find((item) => item.name === "PAYLOAD-SHA256SUMS");
if (subject?.digest?.sha256 !== payloadDigest) throw new Error("Provenance subject does not match PAYLOAD-SHA256SUMS");
const sbom = JSON.parse(await readFile(path.join(artifactRoot, "sbom.cdx.json"), "utf8"));
if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.6") throw new Error("Unsupported or invalid SBOM");

if (candidateOnly) {
  for (const [relative, digest] of payloadEntries) {
    const source = path.join(root, relative);
    if (!existsSync(source)) continue;
    const sourceDigest = createHash("sha256").update(await readFile(source)).digest("hex");
    if (sourceDigest !== digest) throw new Error(`Release candidate is stale relative to source: ${relative}`);
  }
  console.log(`Verified unsigned release candidate: ${expected.size} checksum-covered files`);
  process.exit(0);
}

const signaturePath = path.join(artifactRoot, "release-signature.json");
if (!existsSync(signaturePath)) throw new Error("Production release blocked: release-signature.json is missing");
const signature = JSON.parse(await readFile(signaturePath, "utf8"));
if (signature.schemaVersion !== "1.0.0" || signature.algorithm !== "RSA-SHA256" || signature.signedArtifact !== "SHA256SUMS") {
  throw new Error("Production release signature contract is invalid");
}
requireTrustedPublicKey(signature.publicKeyPem, process.env.PSO_TRUSTED_SIGNING_KEY_SHA256, "signing");
const verified = verifySignature("RSA-SHA256", Buffer.from(checksumContent), signature.publicKeyPem, Buffer.from(signature.signature, "base64"));
if (!verified) throw new Error("Production release signature is invalid");

const reviewPath = path.join(artifactRoot, "independent-review.json");
if (!existsSync(reviewPath)) throw new Error("Production release blocked: independent-review.json is missing");
const review = JSON.parse(await readFile(reviewPath, "utf8"));
const checksumDigest = createHash("sha256").update(checksumContent).digest("hex");
const requiredReviewScope = ["source", "security-scan", "codeql", "threat-model", "recovery", "package-installation"];
if (review.schemaVersion !== "1.0.0" || review.algorithm !== "RSA-SHA256" || review.status !== "approved" || !review.reviewer
  || review.reviewedSha256 !== checksumDigest || !review.approvedAt || !Array.isArray(review.scope) || !Array.isArray(review.findings)
  || review.findings.length !== 0 || requiredReviewScope.some((item) => !review.scope.includes(item))) {
  throw new Error("Independent security review evidence is invalid or does not cover this release");
}
requireTrustedPublicKey(review.reviewerPublicKeyPem, process.env.PSO_TRUSTED_REVIEW_KEY_SHA256, "reviewer");
const reviewVerified = verifySignature("RSA-SHA256", Buffer.from(canonicalReviewPayload(review)), review.reviewerPublicKeyPem, Buffer.from(review.signature, "base64"));
if (!reviewVerified) throw new Error("Independent security review signature is invalid");
console.log(`Verified production release: ${expected.size} files, signature valid, independent review approved by ${review.reviewer}`);
