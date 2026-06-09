import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { planTreeLines } from "../src/ui/flow.js";
import { buildPlan } from "../src/plan.js";
import { createGitRepo } from "./helpers/git.js";

test("planTreeLines renders one '<verb>  <target>' line per action", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "atlas-flow-"));
  try {
    await createGitRepo(dir);
    const plan = await buildPlan(dir, { templateName: "standard" });
    const lines = planTreeLines(plan, { color: false });

    assert.equal(lines.length, plan.actions.length);
    assert.ok(lines.some((line) => /^Created\s+\.ai\/config\.json$/.test(line)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
