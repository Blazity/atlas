import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { planTreeLines, renderNextStepText, runInteractiveInit, summarizeDoctorPass } from "../src/ui/flow.js";
import { applyFixes } from "../src/doctor.js";
import { buildPlan } from "../src/plan.js";
import { initNextStepText, setupHandoffPrompt } from "../src/templates.js";
import { createGitRepo } from "./helpers/git.js";

// Clack's cancel symbol is module-private and its prompts need a real TTY, so the
// io seam carries isCancel and tests substitute their own sentinel for Ctrl-C.
const CANCEL = Symbol("atlas-test:cancel");

function makeIo(overrides = {}) {
  return {
    isCancel: (value) => value === CANCEL,
    text: () => {
      throw new Error("unexpected text prompt");
    },
    confirm: () => {
      throw new Error("unexpected confirm prompt");
    },
    select: () => {
      throw new Error("unexpected select prompt");
    },
    detectAgents: () => [],
    launchAgent: () => {
      throw new Error("unexpected agent launch");
    },
    ...overrides
  };
}

async function withTempRepo(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "atlas-flow-"));
  try {
    await createGitRepo(dir);
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("planTreeLines renders one '<verb>  <target>' line per action", async () => {
  await withTempRepo(async (dir) => {
    const plan = await buildPlan(dir, { templateName: "standard" });
    const lines = planTreeLines(plan, { color: false });

    assert.equal(lines.length, plan.actions.length);
    assert.ok(lines.some((line) => /^Created\s+\.ai\/config\.json$/.test(line)));
  });
});

test("summarizeDoctorPass reports a healthy workspace with the advisory count appended", () => {
  const advisory = { code: "setup-pending", message: "setup pending", severity: "advisory" };

  assert.deepEqual(summarizeDoctorPass([]), {
    healthy: true,
    summary: "doctor · 0 issues · workspace healthy",
    remaining: []
  });
  assert.equal(summarizeDoctorPass([advisory]).summary, "doctor · 0 issues · workspace healthy · 1 advisory");
  assert.equal(summarizeDoctorPass([advisory, advisory]).summary, "doctor · 0 issues · workspace healthy · 2 advisories");
});

test("summarizeDoctorPass never claims healthy while fixable or manual findings remain", () => {
  const verdict = summarizeDoctorPass([
    { code: "missing-gitkeep", message: "gitkeep gone", severity: "fixable", fixable: true },
    { code: "alias-target-collision", message: "collision", severity: "manual" },
    { code: "empty-memory", message: "no memory", severity: "advisory" }
  ]);

  assert.equal(verdict.healthy, false);
  assert.doesNotMatch(verdict.summary, /healthy/);
  assert.equal(verdict.summary, "doctor · 2 issues remaining");
  assert.deepEqual(verdict.remaining.map((finding) => finding.code), ["missing-gitkeep", "alias-target-collision"]);
});

test("renderNextStepText without color is byte-identical to the plain next-step text", () => {
  assert.equal(renderNextStepText(".ai", { color: false }), initNextStepText(".ai"));
  assert.equal(renderNextStepText(".workspace", { color: false }), initNextStepText(".workspace"));
});

test("renderNextStepText highlights the pasteable prompt in orange and dims the surrounding text", () => {
  const ORANGE = "\x1b[38;2;255;106;51m";
  const DIM = "\x1b[38;2;107;113;120m";
  const RESET = "\x1b[0m";
  const lines = renderNextStepText(".ai", { color: true }).split("\n");
  const promptLines = setupHandoffPrompt(".ai")
    .split("\n")
    .map((line) => `  ${line}`);

  for (const promptLine of promptLines) {
    assert.ok(lines.includes(`${ORANGE}${promptLine}${RESET}`), `prompt line not highlighted: ${promptLine}`);
  }
  assert.ok(lines.includes(`${DIM}Next step — paste this to your coding agent:${RESET}`));
  assert.ok(lines.includes(`${DIM}Repair drift later: atlas doctor --fix${RESET}`));
  assert.ok(lines.includes(""), "blank separator lines stay unstyled");
});

test("the root question is asked first on a fresh repo and the copy derives from the answer", async () => {
  await withTempRepo(async (dir) => {
    const prompts = [];
    let rootValidate = null;
    const io = makeIo({
      text: async (options) => {
        prompts.push({ kind: "text", message: options.message, initialValue: options.initialValue });
        rootValidate = options.validate;
        return ".workspace";
      },
      confirm: async (options) => {
        prompts.push({ kind: "confirm", message: options.message });
        return true;
      }
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, io });

    assert.equal(exitCode, 0);
    assert.equal(prompts[0].kind, "text");
    assert.match(prompts[0].message, /where should the atlas workspace live/i);
    assert.equal(prompts[0].initialValue, ".ai");
    assert.match(rootValidate("/absolute/path"), /absolute/);
    assert.match(rootValidate("../outside"), /escape/);
    assert.match(rootValidate("  "), /empty/);
    assert.equal(rootValidate(".ai"), undefined);
    assert.ok(prompts.some((prompt) => prompt.kind === "confirm" && /^Write \d+ files to \.workspace\/\?$/.test(prompt.message)));

    const config = JSON.parse(await readFile(path.join(dir, ".workspace/config.json"), "utf8"));
    assert.equal(config.artifactRoot, ".workspace");
    assert.equal(await readFile(path.join(dir, ".atlas"), "utf8"), ".workspace\n");
    await assert.rejects(stat(path.join(dir, ".ai")), /ENOENT/);
  });
});

test("--root skips the root question and roots the workspace at the given directory", async () => {
  await withTempRepo(async (dir) => {
    const confirms = [];
    const io = makeIo({
      confirm: async ({ message }) => {
        confirms.push(message);
        return true;
      }
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, root: ".workspace", io });

    assert.equal(exitCode, 0);
    assert.ok(confirms.some((message) => /^Write \d+ files to \.workspace\/\?$/.test(message)));
    await stat(path.join(dir, ".workspace/config.json"));
  });
});

test("an existing workspace skips the root question and short-circuits without the launcher", async () => {
  await withTempRepo(async (dir) => {
    await applyFixes((await buildPlan(dir, { templateName: "standard" })).fixable);
    let detectCalls = 0;
    const io = makeIo({
      detectAgents: () => {
        detectCalls += 1;
        return [];
      }
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, io });

    assert.equal(exitCode, 0);
    assert.equal(detectCalls, 0);
  });
});

test("an existing workspace root wins over --root in the interactive flow", async () => {
  await withTempRepo(async (dir) => {
    await applyFixes((await buildPlan(dir, { templateName: "standard" })).fixable);

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, root: ".elsewhere", io: makeIo() });

    assert.equal(exitCode, 0);
    await assert.rejects(stat(path.join(dir, ".elsewhere")), /ENOENT/);
  });
});

test("declining the write confirm exits 0 and writes nothing", async () => {
  await withTempRepo(async (dir) => {
    const io = makeIo({
      text: async () => ".ai",
      confirm: async () => false
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, io });

    assert.equal(exitCode, 0);
    await assert.rejects(stat(path.join(dir, ".ai")), /ENOENT/);
  });
});

test("cancelling the write confirm exits 130 and writes nothing", async () => {
  await withTempRepo(async (dir) => {
    const io = makeIo({
      text: async () => ".ai",
      confirm: async () => CANCEL
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, io });

    assert.equal(exitCode, 130);
    await assert.rejects(stat(path.join(dir, ".ai")), /ENOENT/);
  });
});

test("cancelling the root question exits 130 and writes nothing", async () => {
  await withTempRepo(async (dir) => {
    const io = makeIo({ text: async () => CANCEL });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, io });

    assert.equal(exitCode, 130);
    await assert.rejects(stat(path.join(dir, ".ai")), /ENOENT/);
  });
});

test("declining the dirty-worktree confirm exits 0 before any write", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(path.join(dir, "untracked.txt"), "dirty\n");
    const confirms = [];
    const io = makeIo({
      text: async () => ".ai",
      confirm: async ({ message }) => {
        confirms.push(message);
        return false;
      }
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, io });

    assert.equal(exitCode, 0);
    assert.deepEqual(confirms, ["Write Atlas files anyway?"]);
    await assert.rejects(stat(path.join(dir, ".ai")), /ENOENT/);
  });
});

test("force skips the dirty-worktree confirm but still asks before writing", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(path.join(dir, "untracked.txt"), "dirty\n");
    const confirms = [];
    const io = makeIo({
      text: async () => ".ai",
      confirm: async ({ message }) => {
        confirms.push(message);
        return false;
      }
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, force: true, io });

    assert.equal(exitCode, 0);
    assert.equal(confirms.length, 1);
    assert.match(confirms[0], /^Write \d+ files to \.ai\/\?$/);
  });
});

test("after a successful write the launcher offers found agents with Skip as the default", async () => {
  await withTempRepo(async (dir) => {
    const fakeAgent = { name: "claude", bin: "claude", buildArgs: (prompt) => [prompt] };
    const launches = [];
    let selectOptions = null;
    const io = makeIo({
      text: async () => ".ai",
      confirm: async () => true,
      detectAgents: () => [fakeAgent],
      select: async (options) => {
        selectOptions = options;
        return "claude";
      },
      launchAgent: async (agent, prompt) => {
        launches.push({ agent, prompt });
        return { code: 3, signal: null };
      }
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, io });

    assert.equal(exitCode, 0);
    assert.equal(selectOptions.message, "Launch an agent to finish setup?");
    assert.equal(selectOptions.initialValue, "skip");
    assert.deepEqual(selectOptions.options.at(-1), { value: "skip", label: "Skip" });
    assert.deepEqual(selectOptions.options.at(0), { value: "claude", label: "claude" });
    assert.equal(launches.length, 1);
    assert.equal(launches[0].agent, fakeAgent);
    assert.match(launches[0].prompt, /Read \.ai\/skills\/atlas-setup\/SKILL\.md and follow it/);
    assert.doesNotMatch(launches[0].prompt, /paste this/i);
  });
});

test("cancelling the launcher select is a skip, not an interrupt", async () => {
  await withTempRepo(async (dir) => {
    const io = makeIo({
      text: async () => ".ai",
      confirm: async () => true,
      detectAgents: () => [{ name: "codex", bin: "codex", buildArgs: (prompt) => [prompt] }],
      select: async () => CANCEL
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, io });

    assert.equal(exitCode, 0);
    await stat(path.join(dir, ".ai/config.json"));
  });
});

test("a failed agent spawn is reported gracefully and init still exits 0", async () => {
  await withTempRepo(async (dir) => {
    const io = makeIo({
      text: async () => ".ai",
      confirm: async () => true,
      detectAgents: () => [{ name: "claude", bin: "claude", buildArgs: (prompt) => [prompt] }],
      select: async () => "claude",
      launchAgent: async () => ({ error: new Error("spawn claude ENOENT") })
    });

    const exitCode = await runInteractiveInit({ cwd: dir, color: false, io });

    assert.equal(exitCode, 0);
    await stat(path.join(dir, ".ai/config.json"));
  });
});
