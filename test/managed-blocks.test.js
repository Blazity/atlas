import assert from "node:assert/strict";
import test from "node:test";

import { applyManagedBlock, inspectManagedBlock, hasManagedBlock } from "../src/managed-blocks.js";

test("inserts a managed block without removing human content", () => {
  const existing = "# Project\n\nHuman rules stay here.\n";
  const next = applyManagedBlock(existing, "atlas", "Managed content");

  assert.match(next, /Human rules stay here/);
  assert.match(next, /BEGIN ATLAS: atlas/);
  assert.match(next, /Managed content/);
});

test("updates an existing managed block idempotently", () => {
  const first = applyManagedBlock("# Project\n", "atlas", "One");
  const second = applyManagedBlock(first, "atlas", "Two");
  const third = applyManagedBlock(second, "atlas", "Two");

  assert.match(second, /Two/);
  assert.doesNotMatch(second, /One/);
  assert.equal(third, second);
  assert.equal((second.match(/BEGIN ATLAS/g) ?? []).length, 1);
});

test("detects managed block presence", () => {
  const content = applyManagedBlock("", "agent-rules", "Rules");

  assert.equal(hasManagedBlock(content, "agent-rules"), true);
  assert.equal(hasManagedBlock(content, "missing"), false);
});

test("detects malformed managed block markers", () => {
  const content = "# Project\n\n<!-- BEGIN AI-HARNESS: agent-rules -->\nPartial body\n";

  assert.equal(inspectManagedBlock(content, "agent-rules").state, "malformed");
});

test("detects duplicate managed blocks", () => {
  const block = applyManagedBlock("# Project\n", "agent-rules", "Rules");
  const duplicated = `${block}\n${block}`;

  assert.equal(inspectManagedBlock(duplicated, "agent-rules").state, "duplicate");
});

test("recognizes and migrates a legacy AI-HARNESS block to the ATLAS namespace", () => {
  const legacy = [
    "# Project",
    "",
    "Human rules stay here.",
    "",
    "<!-- BEGIN AI-HARNESS: artifact-paths -->",
    "Old managed body",
    "<!-- END AI-HARNESS: artifact-paths -->",
    ""
  ].join("\n");

  assert.equal(hasManagedBlock(legacy, "artifact-paths"), true);
  assert.equal(inspectManagedBlock(legacy, "artifact-paths").state, "present");

  const migrated = applyManagedBlock(legacy, "artifact-paths", "New managed body");

  assert.match(migrated, /Human rules stay here/);
  assert.equal((migrated.match(/BEGIN ATLAS: artifact-paths/g) ?? []).length, 1);
  assert.equal((migrated.match(/BEGIN AI-HARNESS/g) ?? []).length, 0);
  assert.match(migrated, /New managed body/);
  assert.doesNotMatch(migrated, /Old managed body/);
});
