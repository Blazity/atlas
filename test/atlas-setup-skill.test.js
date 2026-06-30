import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { createGitRepo } from "./helpers/git.js";

const skillUrl = new URL("../skills/atlas-setup/SKILL.md", import.meta.url);
const customizationUrl = new URL("../skills/atlas-setup/customization.md", import.meta.url);

async function withTempRepo(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "atlas-context-setup-"));
  try {
    await createGitRepo(dir);
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

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

test("setup skill requires depersonalized durable documentation", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /Depersonalize everything durable/);
  assert.match(skill, /not "<name> wanted memory"/);
  assert.match(skill, /personal names, private schedules, internal-only references, and absolute local paths/);
});

test("setup skill budgets the interview and offers a defaults fast path", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /accept all recommended defaults/);
  assert.match(skill, /[Hh]ard budget[^.]*6 questions/);
  assert.match(skill, /recommended default/);
});

test("setup skill has a concrete context gap interview after grounding", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /## Phase 4 — Context Gap Interview/);
  assert.match(skill, /Build a missing-context list before asking anything/);
  assert.match(skill, /code, README, package metadata, existing docs, AGENTS\.md, memory, vocabulary, decisions/);
  assert.match(skill, /Ask only when the answer affects future agent behavior/);
  assert.match(skill, /one focused question at a time/);
  assert.match(skill, /recommended default/);
  assert.match(skill, /Hard budget[^.]*6 questions/);
  assert.match(skill, /record lower-priority unknowns/);
});

test("setup skill enumerates high-leverage missing context topics", async () => {
  const skill = await readFile(skillUrl, "utf8");
  for (const topic of [
    "Product purpose",
    "Target users",
    "Current direction",
    "Deploy/runtime expectations",
    "Architectural invariants",
    "Recurring pitfalls",
    "Safe commands",
    "Branch/release workflow",
    "Domain vocabulary",
    "External systems"
  ]) {
    assert.match(skill, new RegExp(topic, "i"), `missing context topic: ${topic}`);
  }
});

test("setup skill routes context answers to config-resolved artifacts", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /Persist answers only after deciding they are stable repository context/);
  assert.match(skill, /Resolve every destination through the config/);
  assert.match(skill, /product purpose, target users, current direction[\s\S]*memory\/product\.md/);
  assert.match(skill, /deploy\/runtime expectations, safe commands[\s\S]*(AGENTS\.md|memory\/stack\.md)/);
  assert.match(skill, /architectural invariants[\s\S]*memory\/architecture\.md/);
  assert.match(skill, /domain vocabulary[\s\S]*configured language path/);
  assert.match(skill, /recurring pitfalls[\s\S]*memory\/lessons\.md/);
  assert.match(skill, /branch\/release workflow[\s\S]*(AGENTS\.md|memory\/stack\.md)/);
  assert.match(skill, /external systems[\s\S]*memory\/architecture\.md/);
  assert.match(skill, /decisions\/adrs/);
});

test("setup skill prevents private or task-only context from leaking into durable artifacts", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /Do not persist/i);
  assert.match(skill, /personal names/);
  assert.match(skill, /private schedules/);
  assert.match(skill, /internal-only references/);
  assert.match(skill, /absolute local paths/);
  assert.match(skill, /secrets/);
  assert.match(skill, /PII/);
  assert.match(skill, /task-only assumptions/);
});

test("init installs the concrete context gap setup guidance into default and custom roots", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init", "--ci"], { cwd: directory });
    const installed = await readFile(path.join(directory, ".ai/skills/atlas-setup/SKILL.md"), "utf8");

    assert.match(installed, /Context Gap Interview/);
    assert.match(installed, /Build a missing-context list before asking anything/);
    assert.match(installed, /Product purpose/);
    assert.match(installed, /Persist answers only after deciding they are stable repository context/);

    const customRepo = path.join(directory, "custom-root-repo");
    await mkdir(customRepo);
    await createGitRepo(customRepo);
    await runCli(["init", "--ci", "--root", ".workspace"], { cwd: customRepo });
    await stat(path.join(customRepo, ".workspace/skills/atlas-setup/SKILL.md"));
    const customInstalled = await readFile(path.join(customRepo, ".workspace/skills/atlas-setup/SKILL.md"), "utf8");
    assert.match(customInstalled, /Resolve every destination through the config/);
    assert.doesNotMatch(customInstalled, /custom-root-repo/);
  });
});

test("setup skill flips setupState as the final act and offers a first-value proof", async () => {
  const skill = await readFile(skillUrl, "utf8");
  assert.match(skill, /setupState/);
  assert.match(skill, /"scaffolded"/);
  assert.match(skill, /"configured"/);
  assert.match(skill, /final act/);
  assert.match(skill, /first-value proof/);
  assert.match(skill, /`atlas-review` skill/);
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
