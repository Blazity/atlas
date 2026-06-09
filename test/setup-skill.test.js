import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("setup skill instructs the agent to choose a template after inspection", async () => {
  const skill = await readFile(new URL("../skills/setup/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /## Template Selection/);
  assert.match(skill, /standard, app, library, monorepo, agency/);
  assert.match(skill, /\.ai\/config\.json/);
  assert.match(skill, /pathAliases/);
  // existing contract preserved
  assert.match(skill, /npx --yes @blazity-atlas\/core@latest init/);
  assert.match(skill, /customization\.md/);
});
