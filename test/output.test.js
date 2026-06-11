import assert from "node:assert/strict";
import test from "node:test";

import { exitCodeForFindings, formatApplied, formatFindings } from "../src/output.js";

const fixableFinding = { code: "missing-gitkeep", message: ".ai/plans/.gitkeep is missing", severity: "fixable", fixable: true };
const manualFinding = { code: "file-collision", message: ".ai/plans exists but is not a directory", severity: "manual", fixable: false };
const advisoryFinding = { code: "setup-pending", message: "Atlas setup has not been completed", severity: "advisory", fixable: false };

test("formatFindings renders advisories as a separate trailing section", () => {
  const out = formatFindings([fixableFinding, manualFinding, advisoryFinding]);

  assert.match(out, /^Fixable:\n- \[missing-gitkeep\]/m);
  assert.match(out, /^Manual:\n- \[file-collision\]/m);
  assert.match(out, /^Advisory:\n- \[setup-pending\] Atlas setup has not been completed$/m);
  assert.match(out, /Fixable:[\s\S]*Manual:[\s\S]*Advisory:/);
});

test("formatFindings still reports no issues when only advisories exist", () => {
  const out = formatFindings([advisoryFinding]);

  assert.match(out, /^No issues found\./);
  assert.match(out, /^Advisory:\n- \[setup-pending\]/m);
});

test("exitCodeForFindings keeps the frozen 0/1/2 contract and ignores advisories", () => {
  assert.equal(exitCodeForFindings([]), 0);
  assert.equal(exitCodeForFindings([advisoryFinding]), 0);
  assert.equal(exitCodeForFindings([fixableFinding, advisoryFinding]), 1);
  assert.equal(exitCodeForFindings([fixableFinding, manualFinding, advisoryFinding]), 2);
});

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
