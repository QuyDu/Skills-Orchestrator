import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export async function assertSafeRelativePath(root, relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Unsafe output path: ${relative || "empty"}`);
  const canonicalRoot = await realpath(root);
  const segments = relative.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":"))) {
    throw new Error(`Unsafe output path: ${relative}`);
  }
  let current = canonicalRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    let details;
    try {
      details = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") return path.join(canonicalRoot, ...segments);
      throw error;
    }
    if (details.isSymbolicLink()) throw new Error(`Unsafe symbolic link in output path: ${path.relative(canonicalRoot, current).replaceAll("\\", "/")}`);
  }
  const resolved = await realpath(current);
  if (resolved !== canonicalRoot && !resolved.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`Output path escapes repository root: ${relative}`);
  }
  return path.join(canonicalRoot, ...segments);
}