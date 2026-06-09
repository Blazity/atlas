import assert from "node:assert/strict";
import test from "node:test";

import { detectMode } from "../src/ui/runtime.js";

test("interactive only on a real TTY without --yes/--ci/CI", () => {
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: {} }).interactive, true);
  assert.equal(detectMode({ stdoutIsTTY: false, stdinIsTTY: true, env: {} }).interactive, false);
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: {}, yes: true }).interactive, false);
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: {}, ci: true }).interactive, false);
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: { CI: "1" } }).interactive, false);
});

test("color follows TTY/FORCE_COLOR and is killed by NO_COLOR", () => {
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: {} }).color, true);
  assert.equal(detectMode({ stdoutIsTTY: false, stdinIsTTY: false, env: { FORCE_COLOR: "1" } }).color, true);
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: { NO_COLOR: "1" } }).color, false);
});
