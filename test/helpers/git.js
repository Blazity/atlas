import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function createGitRepo(cwd) {
  await execFileAsync("git", ["init"], { cwd });
  await execFileAsync("git", ["config", "user.name", "Atlas Test"], { cwd });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd });
}

export async function commitAll(cwd, message = "test setup") {
  await execFileAsync("git", ["add", "."], { cwd });
  await execFileAsync("git", ["commit", "-m", message], { cwd });
}
