import { createHash } from "node:crypto";

export function publicKeyFingerprint(publicKeyPem) {
  if (typeof publicKeyPem !== "string" || !publicKeyPem.includes("PUBLIC KEY")) throw new Error("Invalid public key material");
  return createHash("sha256").update(publicKeyPem.trim()).digest("hex");
}

export function requireTrustedPublicKey(publicKeyPem, expectedFingerprint, purpose) {
  if (!/^[a-f0-9]{64}$/.test(expectedFingerprint ?? "")) {
    throw new Error(`Production release blocked: trusted ${purpose} key fingerprint is not configured`);
  }
  const actual = publicKeyFingerprint(publicKeyPem);
  if (actual !== expectedFingerprint) throw new Error(`Production release ${purpose} key is not trusted`);
  return actual;
}

export function canonicalReviewPayload(review) {
  return `${JSON.stringify({
    schemaVersion: review.schemaVersion,
    algorithm: review.algorithm,
    status: review.status,
    reviewer: review.reviewer,
    reviewedSha256: review.reviewedSha256,
    approvedAt: review.approvedAt,
    scope: review.scope,
    findings: review.findings,
    reviewerPublicKeyPem: review.reviewerPublicKeyPem
  })}\n`;
}
