import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { detectAgents, launchAgent, launchableAgents } from "../src/ui/launcher.js";

test("the launcher table lists claude, codex, and cursor-agent with prompt-positional argv builders", () => {
  assert.deepEqual(launchableAgents.map((agent) => agent.name), ["claude", "codex", "cursor-agent"]);
  for (const agent of launchableAgents) {
    assert.equal(typeof agent.bin, "string");
    assert.ok(agent.bin.length > 0);
    assert.deepEqual(agent.buildArgs("finish the Atlas setup"), ["finish the Atlas setup"]);
  }
});

test("detectAgents finds nothing on an empty PATH", () => {
  assert.deepEqual(detectAgents({ env: { PATH: "" } }), []);
  assert.deepEqual(detectAgents({ env: {} }), []);
});

test("detectAgents returns only the table entries executable on PATH", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "atlas-launcher-"));
  try {
    const executable = path.join(dir, "codex");
    await writeFile(executable, "#!/bin/sh\n");
    await chmod(executable, 0o755);
    await writeFile(path.join(dir, "claude"), "not executable\n");
    await mkdir(path.join(dir, "cursor-agent"));

    const found = detectAgents({ env: { PATH: dir } });

    assert.deepEqual(found.map((agent) => agent.name), ["codex"]);
    assert.equal(found[0], launchableAgents[1]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("launchAgent reports a spawn failure instead of throwing", async () => {
  const ghost = { name: "ghost", bin: path.join(tmpdir(), "atlas-no-such-agent"), buildArgs: (prompt) => [prompt] };

  const result = await launchAgent(ghost, "prompt");

  assert.ok(result.error);
  assert.match(result.error.message, /ENOENT/);
});
