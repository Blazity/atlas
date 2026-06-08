import assert from "node:assert/strict";
import { mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { applyAction } from "../src/actions.js";

test("move refuses to overwrite a dangling symlink at the destination", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-actions-"));
  try {
    const fromAbsolutePath = path.join(directory, "source.md");
    const toAbsolutePath = path.join(directory, "dest.md");
    await writeFile(fromAbsolutePath, "payload\n");
    // A dangling symlink: the link entry exists, but its target does not.
    // access()-based existence checks follow the link and report it missing,
    // which would let a move clobber it; lstat()-based checks catch the link.
    await symlink(path.join(directory, "missing-target"), toAbsolutePath);

    await assert.rejects(
      applyAction({ type: "move", to: "dest.md", fromAbsolutePath, toAbsolutePath }),
      /Refusing to overwrite/
    );

    // The source must remain untouched (not renamed over the symlink).
    await stat(fromAbsolutePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
