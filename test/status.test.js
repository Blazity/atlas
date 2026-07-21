import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { runCli } from "../src/cli.js";
import { runStatus } from "../src/status.js";
import { commitAll, createGitRepo } from "./helpers/git.js";

const packageVersion = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const execFileAsync = promisify(execFile);
const atlasBin = new URL("../bin/atlas.js", import.meta.url);

async function withTempRepo(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-status-"));
  try {
    await createGitRepo(directory);
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("status --json reports stable identity, health, artifact, memory, budget, and review data", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/memory/product.md"), "# Product\n");
    await writeFile(path.join(directory, ".ai/plans/status-plan.md"), "# Plan\n");
    await writeFile(path.join(directory, ".ai/research/status-research.md"), "# Research\n");
    await writeFile(path.join(directory, ".ai/decisions/adrs/0001-status.md"), "# ADR\n");
    await writeFile(path.join(directory, ".ai/results/status-review.md"), "# Review\n\n- **status**: pass\n");
    await commitAll(directory, "add atlas artifacts");

    const first = await runCli(["status", "--json"], { cwd: directory });
    const second = await runCli(["status", "--json"], { cwd: directory });
    const payload = JSON.parse(first.stdout);

    assert.equal(first.exitCode, 0);
    assert.equal(first.stderr, "");
    assert.equal(second.exitCode, 0);
    assert.equal(second.stdout, first.stdout);
    assert.equal(payload.initialized, true);
    assert.deepEqual(payload.identity, {
      template: "standard",
      workspaceRoot: ".ai",
      atlasVersion: packageVersion,
      cliVersion: packageVersion,
      versionStatus: "current",
      setupState: "scaffolded"
    });
    assert.equal(payload.health.classification, "clean");
    assert.equal(payload.health.counts.manual, 0);
    assert.equal(payload.health.counts.fixable, 0);
    assert(payload.health.counts.advisory > 0);
    assert.equal(Object.hasOwn(payload.health, "suppressedCount"), false);
    assert.equal(payload.artifacts.plans.fileCount, 1);
    assert.equal(payload.artifacts.research.fileCount, 1);
    assert.equal(payload.artifacts.decisionsAdrs.fileCount, 1);
    assert.equal(payload.artifacts.memory.fileCount, 1);
    assert.equal(payload.artifacts.language.fileCount, 1);
    assert.equal(payload.memoryFreshness.fileCount, 1);
    assert.match(payload.memoryFreshness.lastCommitDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(payload.memoryFreshness.entryMetadata.provider, "counts-only");
    assert(Array.isArray(payload.contextBudgets.entries));
    assert.equal(payload.lastReviewVerdict.path, ".ai/results/status-review.md");
    assert.equal(payload.lastReviewVerdict.verdict, "pass");
    assert.match(payload.lastReviewVerdict.date, /^\d{4}-\d{2}-\d{2}$/);
  });
});

test("status in an uninitialized repo points at init and exits 0", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["status"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Atlas status$/m);
    assert.match(result.stdout, /Atlas is not set up in this repository\./);
    assert.match(result.stdout, /@blazity-atlas\/core@latest init/);
    assert.doesNotMatch(result.stdout, /missing-config/);
  });
});

test("status --json reports the uninitialized discriminator shape", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["status", "--json"], { cwd: directory });
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.initialized, false);
    assert.equal(payload.message, "Atlas is not set up in this repository.");
    assert.equal(payload.initCommand, "npx --yes @blazity-atlas/core@latest init");
    assert.equal(payload.health.classification, "not-initialized");
    assert.equal(Object.hasOwn(payload.health, "suppressedCount"), false);
  });
});

test("status reports manual health without changing its exit code", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const config = JSON.parse(await readFile(path.join(directory, ".ai/config.json"), "utf8"));
    await writeFile(path.join(directory, ".ai/config.json"), `${JSON.stringify({ ...config, schemaVersion: 99 }, null, 2)}\n`);

    const result = await runCli(["status", "--json"], { cwd: directory });
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(payload.health.classification, "manual");
    assert.equal(payload.health.counts.manual, 1);
  });
});

test("status marks identity fields unknown when config JSON is invalid", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/config.json"), "{ not json\n");

    const jsonResult = await runCli(["status", "--json"], { cwd: directory });
    const payload = JSON.parse(jsonResult.stdout);

    assert.equal(payload.identity.template, null);
    assert.equal(payload.identity.atlasVersion, null);
    assert.equal(payload.identity.setupState, null);
    assert.equal(payload.identity.note, "Identity fields are unknown because .ai/config.json is invalid.");

    const proseResult = await runCli(["status"], { cwd: directory });

    assert.match(proseResult.stdout, /Template: unknown \(invalid config\)/);
    assert.match(proseResult.stdout, /Atlas version: unknown \(invalid config\) \(CLI /);
    assert.match(proseResult.stdout, /Setup state: unknown \(invalid config\)/);
  });
});

test("status artifact date collection keeps git calls bounded", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await mkdir(path.join(directory, ".ai/plans/many"), { recursive: true });
    for (let index = 0; index < 12; index += 1) {
      await writeFile(path.join(directory, `.ai/plans/many/status-${index}.md`), `# Plan ${index}\n`);
    }
    await commitAll(directory, "add many status artifacts");

    let gitLogCalls = 0;
    const io = {
      execFile: async (command, args, options) => {
        if (command === "git" && args[0] === "log") {
          gitLogCalls += 1;
        }
        return execFileAsync(command, args, options);
      }
    };

    const result = await runStatus({ cwd: directory, json: true, io });

    assert.equal(result.exitCode, 0);
    assert(gitLogCalls <= 6, `expected at most one git log call per artifact section, got ${gitLogCalls}`);
  });
});

test("status excludes bookkeeping files from artifact counts", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/memory/.gitignore"), "local/\n");

    const result = await runStatus({ cwd: directory, json: true });
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.artifacts.memory.fileCount, 0);
    assert.equal(payload.memoryFreshness.fileCount, 0);
  });
});

test("status uses mtime dates for untracked artifact files", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await commitAll(directory, "commit atlas scaffold");
    const untrackedPlan = path.join(directory, ".ai/plans/untracked.md");
    await writeFile(untrackedPlan, "# Untracked\n");
    await utimes(untrackedPlan, new Date("2020-01-02T00:00:00Z"), new Date("2020-01-02T00:00:00Z"));

    const result = await runStatus({ cwd: directory, json: true });
    const payload = JSON.parse(result.stdout);
    const file = payload.artifacts.plans.files.find((entry) => entry.path === ".ai/plans/untracked.md");

    assert.equal(file.date, "2020-01-02");
  });
});

test("status honors FORCE_COLOR even when stdout is not a TTY", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const env = { ...process.env, FORCE_COLOR: "1" };
    delete env.NO_COLOR;

    const { stdout } = await execFileAsync(process.execPath, [atlasBin.pathname, "status"], {
      cwd: directory,
      env
    });

    assert.match(stdout, /\u001B\[/u);
  });
});

test("runStatus never calls write-capable io methods", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const writes = [];
    const io = {
      mkdir: async (...args) => writes.push(["mkdir", ...args]),
      writeFile: async (...args) => writes.push(["writeFile", ...args]),
      rename: async (...args) => writes.push(["rename", ...args]),
      symlink: async (...args) => writes.push(["symlink", ...args])
    };

    const result = await runStatus({ cwd: directory, io });

    assert.equal(result.exitCode, 0);
    assert.equal(writes.length, 0);
  });
});
