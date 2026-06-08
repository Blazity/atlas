import assert from "node:assert/strict";
import test from "node:test";

import { formatApplied } from "../src/output.js";

const actions = [
  { verb: "Created", target: ".ai/config.json" },
  { verb: "Updated", target: "AGENTS.md (managed block)" },
  { verb: "Linked", target: ".claude/skills → ../.ai/skills" }
];

test("formatApplied lists actions and a summary, never 'is missing'", () => {
  const out = formatApplied(actions);
  assert.match(out, /^Created\s+\.ai\/config\.json$/m);
  assert.match(out, /^Updated\s+AGENTS\.md \(managed block\)$/m);
  assert.match(out, /^Linked\s+\.claude\/skills → \.\.\/\.ai\/skills$/m);
  assert.match(out, /3 changes applied/);
  assert.doesNotMatch(out, /is missing/);
});

test("formatApplied reports idempotent runs clearly", () => {
  assert.match(formatApplied([]), /Already up to date — nothing to write\./);
});

test("formatApplied dry-run uses the 'Would' tense", () => {
  const out = formatApplied(actions, { dryRun: true });
  assert.match(out, /^Would create\s+\.ai\/config\.json$/m);
  assert.match(out, /3 changes planned/);
});
