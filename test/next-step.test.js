import assert from "node:assert/strict";
import test from "node:test";

import { initNextStepText } from "../src/templates.js";

test("initNextStepText leads with a self-locating pasteable agent prompt", () => {
  const text = initNextStepText();
  assert.match(text, /paste this to your coding agent/i);
  assert.match(text, /Read \.ai\/skills\/atlas-setup\/SKILL\.md and follow it/);
  assert.match(text, /finish the Atlas setup/i);
  assert.match(text, /Claude Code: run \/atlas:atlas-setup/);
  assert.match(text, /atlas doctor --fix/);
  assert.doesNotMatch(text, /Claude users can install the `atlas` plugin/);
  assert.doesNotMatch(text, /If you start from the skill first/);
});

test("initNextStepText derives every workspace path from the given root", () => {
  const text = initNextStepText(".workspace");
  assert.match(text, /Read \.workspace\/skills\/atlas-setup\/SKILL\.md and follow it/);
  assert.doesNotMatch(text, /\.ai\//);
  assert.match(text, /Claude Code: run \/atlas:atlas-setup/);
  assert.match(text, /atlas doctor --fix/);
});
