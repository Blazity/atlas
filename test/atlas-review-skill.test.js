import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("../skills/atlas-review/SKILL.md", import.meta.url);

test("review skill is one skill with five modes, preset overlays, and a mandatory security gate", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /### Intake/);
  assert.match(skill, /### Plan/);
  assert.match(skill, /### Review/);
  assert.match(skill, /### Gate/);
  assert.match(skill, /### Postmortem/);
  assert.match(skill, /Security Gate/);
  assert.match(skill, /mandatory in every mode/);
  assert.match(skill, /overlays/);
  assert.match(skill, /Agents[\s\S]*Platform[\s\S]*Workflow[\s\S]*migration/);
});

test("review skill resolves the results directory through the workspace config", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /config\.json/);
  assert.match(skill, /\.atlas/);
  assert.match(skill, /artifactRoot/);
  assert.match(skill, /paths\.results/);
  assert.match(skill, /[Nn]ever hardcode/);
});

test("review skill pins the verdict line, evidence standard, and artifact format fields", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /pass \/ conditional pass \/ fail/);
  assert.match(skill, /it worked once/);
  assert.match(skill, /not a completed review/);
  assert.match(skill, /personal attributions, confidential or internal-only context/);
  for (const field of [
    "status",
    "preset",
    "risk level",
    "required changes",
    "open questions",
    "evidence",
    "approval boundaries",
    "monitoring plan",
    "owner",
    "next review date"
  ]) {
    assert.match(skill, new RegExp(field, "i"), `artifact field missing: ${field}`);
  }
});

test("review skill refuses to guess missing setup context", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /Context Dependency Rule/);
  assert.match(skill, /If product, architecture, runtime, workflow, vocabulary, or external-system context is missing/);
  assert.match(skill, /do not invent it/);
  assert.match(skill, /route the user back through `atlas-setup`/);
  assert.match(skill, /open questions/);
});
