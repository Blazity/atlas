import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildPlan } from "../src/plan.js";
import { createConfigForTemplate } from "../src/config.js";
import { createGitRepo } from "./helpers/git.js";

async function withTempRepo(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "atlas-plan-"));
  try {
    await createGitRepo(dir);
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("buildPlan describes fresh actions with create/link verbs", async () => {
  await withTempRepo(async (dir) => {
    const plan = await buildPlan(dir, { templateName: "standard" });

    assert.equal(plan.templateName, "standard");
    assert.equal(plan.conflicts.length, 0);
    assert.ok(plan.fixable.length > 0);

    const configAction = plan.actions.find((a) => a.target.startsWith(".ai/config.json"));
    assert.equal(configAction.verb, "Created");

    const linkAction = plan.actions.find((a) => a.target.startsWith(".claude/skills"));
    assert.equal(linkAction.verb, "Linked");
    assert.match(linkAction.target, /\.claude\/skills → /);
  });
});

test("buildPlan marks existing managed files as Updated", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(path.join(dir, "AGENTS.md"), "# Project AI Instructions\n");
    const plan = await buildPlan(dir, { templateName: "standard" });

    const agents = plan.actions.find((a) => a.target.startsWith("AGENTS.md"));
    assert.equal(agents.verb, "Updated");
    assert.match(agents.target, /managed block/);
  });
});

test("buildPlan keeps the effective template of an existing config", async () => {
  await withTempRepo(async (dir) => {
    await mkdir(path.join(dir, ".ai"), { recursive: true });
    await writeFile(path.join(dir, ".ai/config.json"), JSON.stringify(createConfigForTemplate("app")));

    const plan = await buildPlan(dir, { templateName: "standard" });
    assert.equal(plan.templateName, "app");
  });
});

test("buildPlan surfaces invalid config as a conflict, not a fixable action", async () => {
  await withTempRepo(async (dir) => {
    await mkdir(path.join(dir, ".ai"), { recursive: true });
    await writeFile(path.join(dir, ".ai/config.json"), JSON.stringify({ ...createConfigForTemplate("standard"), schemaVersion: 99 }));

    const plan = await buildPlan(dir, { templateName: "standard" });
    assert.ok(plan.conflicts.length > 0);
    assert.ok(plan.conflicts.some((finding) => /schemaVersion/.test(finding.message)));
  });
});
