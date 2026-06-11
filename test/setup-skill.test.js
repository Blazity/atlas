import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("../skills/setup/SKILL.md", import.meta.url);
const customizationUrl = new URL("../skills/setup/customization.md", import.meta.url);

test("setup skill keeps the deterministic bootstrap contract", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /npx --yes @blazity-atlas\/core@latest init/);
  assert.match(skill, /npx --yes @blazity-atlas\/core@latest doctor/);
  assert.match(skill, /doctor --fix/);
  assert.match(skill, /dirty worktree/);
  assert.match(skill, /Do not use `--force` automatically/);
  assert.match(skill, /manual conflicts/);
});

test("setup skill blocks on fixable or manual findings but not advisories", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /[Aa]dvisory findings[^.]*do not count as unclean/);
  assert.match(skill, /[Oo]nly fixable or manual findings block/);
});

test("setup skill resolves artifact locations through config discovery", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /config\.json/);
  assert.match(skill, /\.atlas/);
  assert.match(skill, /workspace root may not be `\.ai`/);
});

test("setup skill bounds the brownfield backfill", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /git log --oneline -50/);
  assert.match(skill, /PR titles/);
  assert.match(skill, /legacy docs/);
  assert.match(skill, /[Nn]ote explicitly what was skipped/);
});

test("setup skill detects and confirms template moves instead of offering a name list", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /Detect-and-Confirm/);
  assert.match(skill, /Do not ask the user to pick a template name from a list/);
  assert.match(skill, /concrete file moves/);
  assert.match(skill, /standard, app, library, monorepo, agency/);
  assert.match(skill, /pathAliases/);
});

test("setup skill budgets the interview and offers a defaults fast path", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /accept all recommended defaults/);
  assert.match(skill, /[Hh]ard budget[^.]*6 questions/);
  assert.match(skill, /recommended default/);
});

test("setup skill flips setupState as the final act and offers a first-value proof", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /setupState/);
  assert.match(skill, /"scaffolded"/);
  assert.match(skill, /"configured"/);
  assert.match(skill, /final act/);
  assert.match(skill, /first-value proof/);
  assert.match(skill, /`review` skill/);
});

test("setup skill keeps Refresh mode and lazy end-of-flow customization", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /### Refresh/);
  assert.match(skill, /customization\.md/);
  assert.match(skill, /[Oo]therwise, do not read `customization\.md`/);
});

test("customization workflow ties its knobs to the config", async () => {
  const customization = await readFile(customizationUrl, "utf8");
  assert.match(customization, /Atlas Customization/);
  assert.match(customization, /artifact layout preferences/);
  assert.match(customization, /artifactRoot/);
  assert.match(customization, /agentSurfaces/);
  assert.doesNotMatch(customization, /enabled workflow areas/);
});
