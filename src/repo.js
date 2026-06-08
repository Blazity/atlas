import { execFile } from "node:child_process";
import { access, lstat, readFile, writeFile } from "node:fs/promises";
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
