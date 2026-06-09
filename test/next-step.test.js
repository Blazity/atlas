import assert from "node:assert/strict";
import test from "node:test";

import { initNextStepText } from "../src/templates.js";

test("initNextStepText leads with a single pasteable agent prompt", () => {
  const text = initNextStepText();
  assert.match(text, /paste this to your coding agent/i);
  assert.match(text, /Finish the Atlas setup on this repository/);
  assert.match(text, /`setup` skill/);
  assert.match(text, /Claude Code: run \/atlas:setup/);
  assert.match(text, /atlas doctor --fix/);
  assert.doesNotMatch(text, /Claude users can install the `atlas` plugin/);
  assert.doesNotMatch(text, /If you start from the skill first/);
});
