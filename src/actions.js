import { mkdir, rename, rm, symlink, lstat } from "node:fs/promises";
import path from "node:path";

import { fileExists, writeText } from "./repo.js";
import { pathExists } from "./repo.js";

export async function applyAction(action) {
  if (action.type === "mkdir") {
    await mkdir(action.absolutePath, { recursive: true });
    return;
  }

  if (action.type === "write") {
    await mkdir(path.dirname(action.absolutePath), { recursive: true });
    await writeText(action.absolutePath, action.content);
    return;
  }

  if (action.type === "move") {
    if (await fileExists(action.toAbsolutePath)) {
      throw new Error(`Refusing to overwrite ${action.to}`);
    }
    await mkdir(path.dirname(action.toAbsolutePath), { recursive: true });
    await rename(action.fromAbsolutePath, action.toAbsolutePath);
    return;
  }

  if (action.type === "symlink") {
    await mkdir(path.dirname(action.absolutePath), { recursive: true });
    if (await pathExists(action.absolutePath)) {
      const stats = await lstat(action.absolutePath);
      if (stats.isSymbolicLink()) {
        await rm(action.absolutePath);
      } else {
        throw new Error(`Refusing to replace non-symlink ${action.relativePath}`);
      }
    }
    await symlink(action.target, action.absolutePath);
    return;
  }

  throw new Error(`Unknown action type: ${action.type}`);
}
