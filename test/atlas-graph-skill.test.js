import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("../skills/atlas-graph/SKILL.md", import.meta.url);

test("graph skill is gated by config and resolves every output path", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /name: atlas-graph/);
  assert.match(skill, /features\.graph\.enabled/);
  assert.match(skill, /paths\.graph/);
  assert.match(skill, /never hardcode `\.ai\/`/);
});

test("graph skill detects graphify without installing it", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /command -v graphify/);
  assert.match(skill, /do not install it automatically/i);
  assert.match(skill, /code-only/i);
  assert.match(skill, /offline/i);
});

test("graph skill writes the sidecar and shows the diff", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /graph\.meta\.json/);
  assert.match(skill, /buildSha/);
  assert.match(skill, /generator/);
  assert.match(skill, /provenance/);
  assert.match(skill, /git diff --/);
  assert.match(skill, /atlas doctor/);
});
