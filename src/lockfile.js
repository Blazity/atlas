import { createHash } from "node:crypto";
import path from "node:path";

import { normalizePath, resolveArtifactPath } from "./config.js";
import { readTextIfExists, repoPath } from "./repo.js";
import { managedSkillFiles, packagedSkillContent } from "./templates.js";

const lockfileName = "atlas.lock.json";

export function lockfileRelativePath(root) {
  return normalizePath(path.join(root, lockfileName));
}

export function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function managedFileRelativePath(config, skillName, fileName) {
  return normalizePath(path.join(resolveArtifactPath(config, "skills"), skillName, fileName));
}

export async function readLockfile(repoRoot, root) {
  const content = await readTextIfExists(repoPath(repoRoot, lockfileRelativePath(root)));
  if (content === null) {
    return { exists: false, files: {}, error: null };
  }
  try {
    const parsed = JSON.parse(content);
    const files = parsed && typeof parsed === "object" && parsed.files && typeof parsed.files === "object" && !Array.isArray(parsed.files)
      ? parsed.files
      : {};
    return { exists: true, files, error: null };
  } catch (error) {
    return { exists: true, files: {}, error: error.message };
  }
}

// Entry shape: { sha256: <installed content>, packaged: <packaged content at
// write time> }. Equal hashes mean the file was pristine when recorded;
// unequal hashes mean the baseline was adopted as a deliberate customization.
export function baselineEntry(lockfile, relativePath) {
  const entry = lockfile.files[relativePath];
  if (typeof entry?.sha256 !== "string") {
    return null;
  }
  return { sha256: entry.sha256, packaged: typeof entry.packaged === "string" ? entry.packaged : entry.sha256 };
}

export function lockfileContent(atlasVersion, files) {
  const sorted = Object.fromEntries(Object.keys(files).sort().map((key) => [key, files[key]]));
  return `${JSON.stringify({ schemaVersion: 1, atlasVersion, files: sorted }, null, 2)}\n`;
}

// Baselines for the current disk state: the packaged hash for files that match
// the packaged content; the previously recorded baseline for everything else,
// so adopted or still-customized files keep their baseline across rewrites.
export async function computeLockfileFiles(repoRoot, config, previous) {
  const files = {};
  for (const [skillName, fileName] of managedSkillFiles) {
    const relativePath = managedFileRelativePath(config, skillName, fileName);
    const current = await readTextIfExists(repoPath(repoRoot, relativePath));
    if (current === null) {
      continue;
    }
    if (current === `${packagedSkillContent(skillName, fileName)}\n`) {
      const hash = sha256(current);
      files[relativePath] = { sha256: hash, packaged: hash };
    } else {
      const existing = baselineEntry(previous, relativePath);
      if (existing) {
        files[relativePath] = existing;
      }
    }
  }
  return files;
}
