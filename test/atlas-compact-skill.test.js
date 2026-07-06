import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("../skills/atlas-compact/SKILL.md", import.meta.url);

test("compact skill splits measurement from judgment and runs the CLI local-first", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /name: atlas-compact/);
  assert.match(skill, /CLI owns deterministic measurement/);
  assert.match(skill, /skill owns semantic judgment/);
  assert.match(skill, /Never reimplement measurement/);
  assert.match(skill, /npx --no-install @blazity-atlas\/core/);
  assert.match(skill, /fallback spelling of that rule/);
  assert.match(skill, /doctor --handoff context-size/);
});

test("compact skill resolves paths through the workspace config", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /config\.json/);
  assert.match(skill, /\.atlas/);
  assert.match(skill, /never hardcode `\.ai\/`/);
});

test("compact skill proposes before editing and re-verifies with doctor", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /per-file plan before touching anything/);
  assert.match(skill, /Never rewrite silently/);
  assert.match(skill, /explicit approval/);
  assert.match(skill, /Rerun `npx --no-install @blazity-atlas\/core doctor`/);
  assert.match(skill, /before\/after context-size lines/);
  assert.match(skill, /do not chase zero warnings/);
});

test("compact skill never edits managed skills and depersonalizes relocated content", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /never hand-edit them/);
  assert.match(skill, /byte-equality drift check/);
  assert.match(skill, /package-maintenance work/);
  assert.match(skill, /needs, decisions, and reasons — never individuals or internal process/);
  assert.match(skill, /Preserve the AGENTS\.md managed block/);
  assert.match(skill, /Do not create new documentation roots/);
});

test("compact skill routes out-of-scope work to its siblings", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /`atlas-setup` skill/);
  assert.match(skill, /`atlas-review` skill/);
  assert.match(skill, /the CLI's job|the Atlas CLI/);
});
