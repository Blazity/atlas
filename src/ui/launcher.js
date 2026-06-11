import { spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

// Each buildArgs opens an interactive session with the handoff prompt as the
// initial positional message — never a headless/print mode.
export const launchableAgents = [
  { name: "claude", bin: "claude", buildArgs: (prompt) => [prompt] },
  { name: "codex", bin: "codex", buildArgs: (prompt) => [prompt] },
  { name: "cursor-agent", bin: "cursor-agent", buildArgs: (prompt) => [prompt] }
];

export function detectAgents({ env = process.env } = {}) {
  const directories = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  return launchableAgents.filter((agent) => directories.some((directory) => isExecutableFile(path.join(directory, agent.bin))));
}

export function launchAgent(agent, prompt) {
  return new Promise((resolve) => {
    const child = spawn(agent.bin, agent.buildArgs(prompt), { stdio: "inherit" });
    child.on("error", (error) => resolve({ error }));
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
}

function isExecutableFile(filePath) {
  try {
    accessSync(filePath, constants.X_OK);
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}
