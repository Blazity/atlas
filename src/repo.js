import { execFile } from "node:child_process";
import { access, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function isGitRepo(cwd) {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    return true;
  } catch {
    return false;
  }
}

export async function gitStatus(cwd) {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
  return stdout.trim();
}

export async function gitInit(cwd) {
  await execFileAsync("git", ["init"], { cwd });
}

// Both sides go through realpath because macOS temp paths alias /var to /private/var.
export async function isRepoSubdirectory(cwd) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
    const toplevel = await realpath(stdout.trim());
    return { subdirectory: toplevel !== (await realpath(cwd)), toplevel };
  } catch {
    return { subdirectory: false, toplevel: null };
  }
}

export function describeDirtyStatus(status, maxPaths = 5) {
  const lines = status.split("\n").filter(Boolean);
  const untrackedOnly = lines.every((line) => line.startsWith("??"));
  const shown = lines.slice(0, maxPaths).map((line) => `  ${line}`);
  if (lines.length > maxPaths) {
    shown.push(`  … and ${lines.length - maxPaths} more`);
  }
  const heading = untrackedOnly ? "Only untracked files are present:" : "Dirty paths:";
  return `${heading}\n${shown.join("\n")}`;
}

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath) {
  if (!(await fileExists(filePath))) {
    return null;
  }
  return readFile(filePath, "utf8");
}

export async function writeText(filePath, content) {
  await writeFile(filePath, content, "utf8");
}

export function repoPath(cwd, relativePath) {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.join(cwd, relativePath);
}
