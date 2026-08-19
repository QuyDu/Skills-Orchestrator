import { open, rm } from "node:fs/promises";
import { rmSync } from "node:fs";
import path from "node:path";

export async function acquireReleaseLock(root, operation) {
  const lockPath = path.join(root, ".pso-release.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Release operation blocked: another release or report writer holds .pso-release.lock");
    throw error;
  }
  await handle.writeFile(`${JSON.stringify({ schemaVersion: "1.0.0", pid: process.pid, operation, startedAt: new Date().toISOString() })}\n`, "utf8");
  const cleanupOnExit = () => {
    try { rmSync(lockPath, { force: true }); } catch {}
  };
  process.once("exit", cleanupOnExit);
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    process.removeListener("exit", cleanupOnExit);
    await handle.close();
    await rm(lockPath, { force: true });
  };
}
