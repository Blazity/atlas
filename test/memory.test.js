import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { promisify } from "node:util";

import { runCli } from "../src/cli.js";
import { createDefaultConfig } from "../src/config.js";
import { collectMemoryFindings, parseMemoryEntries, pullSharedMemory } from "../src/memory.js";
import { commitAll, createGitRepo } from "./helpers/git.js";

const execFileAsync = promisify(execFile);

async function withTempRepo(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-memory-"));
  try {
    await createGitRepo(directory);
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function initConfiguredWorkspace(directory) {
  const init = await runCli(["init"], { cwd: directory });
  assert.equal(init.exitCode, 0);
  const config = JSON.parse(await readFile(path.join(directory, ".ai/config.json"), "utf8"));
  config.setupState = "configured";
  await writeFile(path.join(directory, ".ai/config.json"), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

async function writeConfig(directory, config) {
  await writeFile(path.join(directory, ".ai/config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

async function gitCommitSha(directory) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: directory });
  return stdout.trim();
}

async function createOrgMemoryRepo() {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-org-memory-"));
  await createGitRepo(directory);
  await mkdir(path.join(directory, "memory"), { recursive: true });
  await writeFile(path.join(directory, "memory/lessons.md"), [
    "# Lessons",
    "",
    "## Shared release checks",
    "<!-- atlas: id=shared-release-checks verified=2026-07-07 scope=org -->",
    "",
    "Release checks run from the consumer repository before publishing.",
    ""
  ].join("\n"));
  await commitAll(directory, "seed org memory");
  return directory;
}

test("parseMemoryEntries reads opt-in metadata without treating plain markdown as managed memory", async () => {
  await withTempRepo(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai/memory"), { recursive: true });
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), [
      "# Lessons",
      "",
      "## Managed entry",
      "<!-- atlas: id=managed-entry verified=2026-07-07 cites=src/doctor.js,src/config.js scope=repo source=atlas superseded-by=new-entry -->",
      "",
      "A durable lesson with citations.",
      "",
      "## Plain entry",
      "",
      "Plain markdown remains readable memory, but it is outside lifecycle checks.",
      ""
    ].join("\n"));

    const entries = await parseMemoryEntries(directory, config);

    assert.equal(entries.length, 2);
    assert.equal(entries[0].heading, "Managed entry");
    assert.equal(entries[0].metadataPresent, true);
    assert.deepEqual(entries[0].cites, ["src/doctor.js", "src/config.js"]);
    assert.equal(entries[0].scope, "repo");
    assert.equal(entries[0].source, "atlas");
    assert.equal(entries[0].supersededBy, "new-entry");
    assert.equal(entries[1].metadataPresent, false);
    assert.equal(entries[1].id, null);
  });
});

test("plain markdown memory stays healthy because metadata lifecycle checks are opt-in", async () => {
  await withTempRepo(async (directory) => {
    await initConfiguredWorkspace(directory);
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), [
      "# Lessons",
      "",
      "## Repeated lesson",
      "",
      "The same plain lesson appears twice.",
      "",
      "## Repeated lesson again",
      "",
      "The same plain lesson appears twice.",
      ""
    ].join("\n"));

    const result = await runCli(["doctor", "--json"], { cwd: directory });
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert(!payload.findings.some((finding) => finding.code.includes("memory-entry")));
    assert(!payload.findings.some((finding) => finding.code === "stale-memory"));
    assert(!payload.findings.some((finding) => finding.code === "broken-citation"));
    assert(!payload.findings.some((finding) => finding.code === "dangling-supersede"));
  });
});

test("doctor reports memory lifecycle problems as advisories in JSON output", async () => {
  await withTempRepo(async (directory) => {
    await initConfiguredWorkspace(directory);
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), [
      "# Lessons",
      "",
      "## Release check",
      "<!-- atlas: id=release-check verified=2000-01-01 cites=src/doctor.js scope=repo superseded-by=missing-entry -->",
      "",
      "Release checks run from the repository before publishing.",
      "",
      "## Release check duplicate",
      "<!-- atlas: id=release-check-copy verified=2026-07-07 cites=missing.md scope=repo -->",
      "",
      "Release checks should run from the repository before publishing.",
      ""
    ].join("\n"));

    const result = await runCli(["doctor", "--json"], { cwd: directory });
    const payload = JSON.parse(result.stdout);
    const byCode = new Map(payload.findings.map((finding) => [finding.code, finding]));

    assert.equal(result.exitCode, 0);
    for (const code of ["duplicate-memory-entry", "stale-memory", "broken-citation", "dangling-supersede"]) {
      assert.equal(byCode.get(code)?.severity, "advisory");
      assert.equal(byCode.get(code)?.fixable, false);
      assert.match(byCode.get(code)?.message ?? "", /memory/i);
    }
  });
});

test("doctor reports duplicate memory ids with both source locations", async () => {
  await withTempRepo(async (directory) => {
    await initConfiguredWorkspace(directory);
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), [
      "# Lessons",
      "",
      "## First entry",
      "<!-- atlas: id=same-id verified=2999-01-01 scope=repo -->",
      "",
      "The first entry records one repository decision.",
      "",
      "## Second entry",
      "<!-- atlas: id=same-id verified=2999-01-01 scope=repo -->",
      "",
      "The second entry records unrelated deployment guidance.",
      ""
    ].join("\n"));

    const result = await runCli(["doctor", "--json"], { cwd: directory });
    const payload = JSON.parse(result.stdout);
    const finding = payload.findings.find((candidate) => candidate.code === "duplicate-memory-id");

    assert.equal(result.exitCode, 0);
    assert.equal(finding?.severity, "advisory");
    assert.match(finding?.message ?? "", /same-id/);
    assert.deepEqual(finding?.details, [".ai/memory/lessons.md:3", ".ai/memory/lessons.md:8"]);
  });
});

test("doctor reports malformed atlas metadata comments instead of ignoring them", async () => {
  await withTempRepo(async (directory) => {
    await initConfiguredWorkspace(directory);
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), [
      "# Lessons",
      "",
      "## Broken metadata",
      "<!-- atlas: id=broken-metadata verified=2999-01-01 scope=repo",
      "",
      "The unclosed metadata line should not silently disable lifecycle checks.",
      ""
    ].join("\n"));

    const result = await runCli(["doctor", "--json"], { cwd: directory });
    const payload = JSON.parse(result.stdout);
    const finding = payload.findings.find((candidate) => candidate.code === "malformed-memory-metadata");

    assert.equal(result.exitCode, 0);
    assert.equal(finding?.severity, "advisory");
    assert.match(finding?.message ?? "", /Broken metadata/);
    assert.deepEqual(finding?.details, [".ai/memory/lessons.md:4"]);
  });
});

test("doctor reports malformed verified dates as memory metadata advisories", async () => {
  await withTempRepo(async (directory) => {
    await initConfiguredWorkspace(directory);
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), [
      "# Lessons",
      "",
      "## Broken verified date",
      "<!-- atlas: id=broken-verified-date verified=notadate scope=repo -->",
      "",
      "Malformed verified dates should not silently bypass stale-memory checks.",
      ""
    ].join("\n"));

    const result = await runCli(["doctor", "--json"], { cwd: directory });
    const payload = JSON.parse(result.stdout);
    const finding = payload.findings.find((candidate) => candidate.code === "malformed-memory-metadata");

    assert.equal(result.exitCode, 0);
    assert.equal(finding?.severity, "advisory");
    assert.match(finding?.message ?? "", /verified date notadate/);
    assert.deepEqual(finding?.details, [".ai/memory/lessons.md:3"]);
  });
});

test("near-duplicate detection stays bounded for a few hundred memory entries", async () => {
  await withTempRepo(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai/memory"), { recursive: true });
    const sections = ["# Lessons", ""];
    for (let index = 0; index < 500; index += 1) {
      sections.push(
        `## Entry ${index}`,
        `<!-- atlas: id=entry-${index} verified=2999-01-01 scope=repo -->`,
        "",
        [
          `topic-${index}`,
          `decision-${index}`,
          `repository-${index}`,
          `workflow-${index}`,
          `constraint-${index}`,
          `evidence-${index}`,
          `review-${index}`,
          `release-${index}`
        ].join(" "),
        ""
      );
    }
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), sections.join("\n"));

    const startedAt = performance.now();
    const findings = await collectMemoryFindings(directory, config, { exists: false, files: {}, memory: {}, error: null });
    const elapsedMs = performance.now() - startedAt;

    assert.equal(findings.filter((finding) => finding.code === "duplicate-memory-entry").length, 0);
    assert(elapsedMs < 1500, `near-duplicate scan took ${elapsedMs.toFixed(1)}ms`);
  });
});

test("near-duplicate detection buckets 4000 distinct memory entries before comparing", async () => {
  await withTempRepo(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai/memory"), { recursive: true });
    const sections = ["# Lessons", ""];
    for (let index = 0; index < 4000; index += 1) {
      const body = index < 2
        ? [
          index === 0 ? "leftone lefttwo leftthree" : "rightone righttwo rightthree",
          "sharedalpha sharedbeta sharedgamma shareddelta sharedepsilon sharedzeta sharedeta sharedtheta sharediota sharedkappa"
        ].join(" ")
        : [
          `topic-${index}`,
          `decision-${index}`,
          `repository-${index}`,
          `workflow-${index}`,
          `constraint-${index}`,
          `evidence-${index}`,
          `review-${index}`,
          `release-${index}`
        ].join(" ");

      sections.push(
        `## Entry ${index}`,
        `<!-- atlas: id=entry-${index} verified=2999-01-01 scope=repo -->`,
        "",
        body,
        ""
      );
    }
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), sections.join("\n"));

    let comparisonCount = 0;
    const findings = await collectMemoryFindings(
      directory,
      config,
      { exists: false, files: {}, memory: {}, error: null },
      { onDuplicateComparison: () => { comparisonCount += 1; } }
    );
    const fullPairCount = (4000 * 3999) / 2;

    assert.equal(findings.filter((finding) => finding.code === "duplicate-memory-entry").length, 0);
    assert(comparisonCount > 0, "duplicate comparison counter was not called");
    assert(
      comparisonCount < fullPairCount / 100,
      `near-duplicate scan compared ${comparisonCount} pairs; full pairwise would compare ${fullPairCount}`
    );
  });
});

test("init scaffolds the memory gitignore, managed atlas-memory skill, and session protocol", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const agents = await readFile(path.join(directory, "AGENTS.md"), "utf8");
    const gitignore = await readFile(path.join(directory, ".ai/memory/.gitignore"), "utf8");
    const skill = await readFile(path.join(directory, ".ai/skills/atlas-memory/SKILL.md"), "utf8");
    const lock = JSON.parse(await readFile(path.join(directory, ".ai/atlas.lock.json"), "utf8"));

    assert.match(gitignore, /^local\/$/m);
    await assert.rejects(stat(path.join(directory, ".ai/memory/local")), /ENOENT/);
    assert.match(skill, /name: atlas-memory/);
    assert.match(skill, /mkdir -p/);
    assert.match(skill, /ADD \/ UPDATE \/ DELETE \/ NOOP/);
    assert.match(skill, /Resolve every destination through/);
    assert.match(agents, /Session start: read the configured memory index/);
    assert.match(agents, /Session end: capture durable lessons with the atlas-memory skill/);
    assert(Object.keys(lock.files).includes(".ai/skills/atlas-memory/SKILL.md"));
  });
});

test("doctor heals a missing memory gitignore after init", async () => {
  await withTempRepo(async (directory) => {
    await initConfiguredWorkspace(directory);
    await rm(path.join(directory, ".ai/memory/.gitignore"), { force: true });

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /\[missing-memory-gitignore\] \.ai\/memory\/\.gitignore is missing/);
    assert.equal(fix.exitCode, 0);
    assert.match(await readFile(path.join(directory, ".ai/memory/.gitignore"), "utf8"), /^local\/$/m);
  });
});

test("doctor treats an absent memory local directory as clean", async () => {
  await withTempRepo(async (directory) => {
    await initConfiguredWorkspace(directory);
    await rm(path.join(directory, ".ai/memory/local"), { recursive: true, force: true });

    const doctor = await runCli(["doctor"], { cwd: directory });

    assert.equal(doctor.exitCode, 0);
    assert.doesNotMatch(doctor.stdout, /missing-memory-local/);
  });
});

test("atlas memory pull passes hostile git values after option separators", async () => {
  await withTempRepo(async (directory) => {
    const calls = [];
    const config = createDefaultConfig();
    config.memory = {
      shared: {
        source: "--not-a-real-remote",
        ref: "--upload-pack=/tmp/atlas-memory-evil.sh",
        pin: "a".repeat(40)
      }
    };

    const result = await pullSharedMemory(directory, config, ".ai", {
      execFile: async (command, args) => {
        calls.push({ command, args: [...args] });
        return { stdout: "", stderr: "" };
      }
    });

    assert.equal(result.ok, false);
    assertGitArgumentGuard(calls.find((call) => call.args[0] === "remote")?.args, config.memory.shared.source);
    assertGitArgumentGuard(calls.find((call) => call.args[0] === "fetch")?.args, config.memory.shared.ref);
    assertGitArgumentGuard(calls.find((call) => call.args[0] === "switch")?.args, config.memory.shared.pin);
  });
});

test("atlas memory pull passes the default timeout to every git call", async () => {
  await withTempRepo(async (directory) => {
    const calls = [];
    const config = createDefaultConfig();
    config.memory = {
      shared: {
        source: "file:///tmp/atlas-memory",
        ref: "main",
        pin: "a".repeat(40)
      }
    };

    const result = await pullSharedMemory(directory, config, ".ai", {
      execFile: async (command, args, execOptions) => {
        calls.push({ command, args: [...args], execOptions });
        return { stdout: "", stderr: "" };
      }
    });

    assert.equal(result.ok, false);
    assert.deepEqual(
      calls.map((call) => [call.args[0], call.execOptions.timeout]),
      [
        ["init", 30000],
        ["remote", 30000],
        ["fetch", 30000],
        ["switch", 30000]
      ]
    );
  });
});

test("atlas memory pull surfaces git timeouts clearly", async () => {
  await withTempRepo(async (directory) => {
    const config = createDefaultConfig();
    config.memory = {
      shared: {
        source: "file:///tmp/atlas-memory",
        ref: "main",
        pin: "a".repeat(40)
      }
    };

    const result = await pullSharedMemory(directory, config, ".ai", {
      gitTimeoutMs: 7,
      execFile: async () => {
        const error = new Error("Command failed: git init --quiet");
        error.killed = true;
        error.signal = "SIGTERM";
        throw error;
      }
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /timed out after 7 ms/);
  });
});

test("atlas memory pull redacts credentialed source urls from git failures", async () => {
  await withTempRepo(async (directory) => {
    const config = createDefaultConfig();
    const source = "https://user:secret-token@example.com/org/memory.git";
    config.memory = {
      shared: {
        source,
        ref: "main",
        pin: "a".repeat(40)
      }
    };

    const result = await pullSharedMemory(directory, config, ".ai", {
      execFile: async () => {
        const error = new Error(`Command failed: git remote add origin -- ${source}`);
        error.stderr = `fatal: could not read from ${source}`;
        throw error;
      }
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /fatal: could not read from \[redacted source\]/);
    assert.doesNotMatch(result.error, /secret-token/);
    assert.doesNotMatch(result.error, new RegExp(escapeRegExp(source)));
  });
});

test("atlas memory pull vendors a pinned org memory tree reproducibly and records hashes", async () => {
  const orgRepo = await createOrgMemoryRepo();
  await withTempRepo(async (directory) => {
    const config = await initConfiguredWorkspace(directory);
    const pin = await gitCommitSha(orgRepo);
    config.memory = { shared: { source: `file://${orgRepo}`, ref: "main", pin } };
    await writeConfig(directory, config);

    const first = await runCli(["memory", "pull"], { cwd: directory });
    const firstContent = await readFile(path.join(directory, ".ai/memory/shared/lessons.md"), "utf8");
    const firstLock = await readFile(path.join(directory, ".ai/atlas.lock.json"), "utf8");
    const second = await runCli(["memory", "pull"], { cwd: directory });
    const secondContent = await readFile(path.join(directory, ".ai/memory/shared/lessons.md"), "utf8");
    const secondLock = await readFile(path.join(directory, ".ai/atlas.lock.json"), "utf8");
    const doctor = await runCli(["doctor"], { cwd: directory });

    assert.equal(first.exitCode, 0);
    assert.equal(second.exitCode, 0);
    assert.match(first.stdout, /Pulled shared memory/);
    assert.equal(secondContent, firstContent);
    assert.equal(secondLock, firstLock);
    assert.match(firstLock, /"shared"/);
    assert.equal(doctor.exitCode, 0);
    assert.doesNotMatch(doctor.stdout, /shared-memory-/);
  });
  await rm(orgRepo, { recursive: true, force: true });
});

test("atlas memory pull skips non-markdown files and reports the skipped count", async () => {
  const orgRepo = await createOrgMemoryRepo();
  try {
    await writeFile(path.join(orgRepo, "memory/secrets.json"), "{\"token\":\"nope\"}\n");
    await commitAll(orgRepo, "add non-markdown memory payload");

    await withTempRepo(async (directory) => {
      const config = await initConfiguredWorkspace(directory);
      const pin = await gitCommitSha(orgRepo);
      config.memory = { shared: { source: `file://${orgRepo}`, ref: "main", pin } };
      await writeConfig(directory, config);

      const result = await runCli(["memory", "pull"], { cwd: directory });

      assert.equal(result.exitCode, 0);
      assert.match(result.stdout, /Skipped non-markdown files: 1/);
      await stat(path.join(directory, ".ai/memory/shared/lessons.md"));
      await assert.rejects(stat(path.join(directory, ".ai/memory/shared/secrets.json")), /ENOENT/);
    });
  } finally {
    await rm(orgRepo, { recursive: true, force: true });
  }
});

test("atlas memory pull rejects oversized markdown files clearly", async () => {
  const orgRepo = await createOrgMemoryRepo();
  try {
    await writeFile(path.join(orgRepo, "memory/huge.md"), `${"a".repeat(1024 * 1024 + 1)}\n`);
    await commitAll(orgRepo, "add oversized memory payload");

    await withTempRepo(async (directory) => {
      const config = await initConfiguredWorkspace(directory);
      const pin = await gitCommitSha(orgRepo);
      config.memory = { shared: { source: `file://${orgRepo}`, ref: "main", pin } };
      await writeConfig(directory, config);

      const result = await runCli(["memory", "pull"], { cwd: directory });

      assert.equal(result.exitCode, 2);
      assert.match(result.stderr, /huge\.md exceeds the 1 MiB shared memory file limit/);
    });
  } finally {
    await rm(orgRepo, { recursive: true, force: true });
  }
});

test("atlas memory pull keeps existing shared memory and lockfile after invalid later pin", async () => {
  const orgRepo = await createOrgMemoryRepo();
  try {
    await withTempRepo(async (directory) => {
      const config = await initConfiguredWorkspace(directory);
      const goodPin = await gitCommitSha(orgRepo);
      config.memory = { shared: { source: `file://${orgRepo}`, ref: "main", pin: goodPin } };
      await writeConfig(directory, config);

      const goodPull = await runCli(["memory", "pull"], { cwd: directory });
      const sharedPath = path.join(directory, ".ai/memory/shared/lessons.md");
      const lockPath = path.join(directory, ".ai/atlas.lock.json");
      const goodContent = await readFile(sharedPath, "utf8");
      const goodLock = await readFile(lockPath, "utf8");

      await writeFile(path.join(orgRepo, "memory/huge.md"), `${"a".repeat(1024 * 1024 + 1)}\n`);
      await commitAll(orgRepo, "add invalid oversized memory");
      config.memory.shared.pin = await gitCommitSha(orgRepo);
      await writeConfig(directory, config);

      const failedPull = await runCli(["memory", "pull"], { cwd: directory });
      const afterContent = await readFile(sharedPath, "utf8");
      const afterLock = await readFile(lockPath, "utf8");

      assert.equal(goodPull.exitCode, 0);
      assert.equal(failedPull.exitCode, 2);
      assert.match(failedPull.stderr, /huge\.md exceeds the 1 MiB shared memory file limit/);
      assert.equal(afterContent, goodContent);
      assert.equal(afterLock, goodLock);
      assert.equal(JSON.parse(afterLock).memory.shared.pin, goodPin);
    });
  } finally {
    await rm(orgRepo, { recursive: true, force: true });
  }
});

test("atlas memory pull skips symlinks from shared memory", async () => {
  const orgRepo = await createOrgMemoryRepo();
  try {
    await symlink("lessons.md", path.join(orgRepo, "memory/link.md"));
    await commitAll(orgRepo, "add symlinked memory");

    await withTempRepo(async (directory) => {
      const config = await initConfiguredWorkspace(directory);
      const pin = await gitCommitSha(orgRepo);
      config.memory = { shared: { source: `file://${orgRepo}`, ref: "main", pin } };
      await writeConfig(directory, config);

      const result = await runCli(["memory", "pull"], { cwd: directory });

      assert.equal(result.exitCode, 0);
      await stat(path.join(directory, ".ai/memory/shared/lessons.md"));
      await assert.rejects(stat(path.join(directory, ".ai/memory/shared/link.md")), /ENOENT/);
    });
  } finally {
    await rm(orgRepo, { recursive: true, force: true });
  }
});

test("atlas memory pull refuses a source repo without a memory tree", async () => {
  const orgRepo = await mkdtemp(path.join(tmpdir(), "atlas-empty-org-memory-"));
  await createGitRepo(orgRepo);
  await writeFile(path.join(orgRepo, "README.md"), "# Not memory\n");
  await commitAll(orgRepo, "no memory tree");

  await withTempRepo(async (directory) => {
    const config = await initConfiguredWorkspace(directory);
    const pin = await gitCommitSha(orgRepo);
    config.memory = { shared: { source: `file://${orgRepo}`, ref: "main", pin } };
    await writeConfig(directory, config);

    const result = await runCli(["memory", "pull"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /must contain \.ai\/memory or memory/);
  });
  await rm(orgRepo, { recursive: true, force: true });
});

test("doctor reports locally edited shared memory and changed pins as advisories", async () => {
  const orgRepo = await createOrgMemoryRepo();
  await withTempRepo(async (directory) => {
    const config = await initConfiguredWorkspace(directory);
    const pin = await gitCommitSha(orgRepo);
    config.memory = { shared: { source: `file://${orgRepo}`, ref: "main", pin } };
    await writeConfig(directory, config);
    await runCli(["memory", "pull"], { cwd: directory });
    const original = await readFile(path.join(directory, ".ai/memory/shared/lessons.md"), "utf8");

    await writeFile(path.join(directory, ".ai/memory/shared/lessons.md"), `${original}\nlocal edit\n`);
    const edited = await runCli(["doctor"], { cwd: directory });

    await writeFile(path.join(directory, ".ai/memory/shared/lessons.md"), original);
    await writeFile(path.join(orgRepo, "memory/decisions.md"), "# Decisions\n");
    await commitAll(orgRepo, "update org memory");
    const nextPin = await gitCommitSha(orgRepo);
    config.memory.shared.pin = nextPin;
    await writeConfig(directory, config);
    const behind = await runCli(["doctor"], { cwd: directory });

    assert.equal(edited.exitCode, 0);
    assert.match(edited.stdout, /\[shared-memory-edited\]/);
    assert.equal(behind.exitCode, 0);
    assert.match(behind.stdout, /\[shared-memory-behind\]/);
  });
  await rm(orgRepo, { recursive: true, force: true });
});

test("atlas memory propose exports only org-scoped local entries for branch-ready review", async () => {
  await withTempRepo(async (directory) => {
    await initConfiguredWorkspace(directory);
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), [
      "# Lessons",
      "",
      "## Keep local",
      "<!-- atlas: id=keep-local verified=2026-07-07 scope=repo -->",
      "",
      "This remains repository memory.",
      "",
      "## Promote org lesson",
      "<!-- atlas: id=promote-org-lesson verified=2026-07-07 scope=org -->",
      "",
      "This lesson should be proposed to shared memory.",
      ""
    ].join("\n"));

    const result = await runCli(["memory", "propose"], { cwd: directory });
    const exportPath = path.join(directory, ".ai/results/memory-proposal/memory/lessons.md");
    const exported = await readFile(exportPath, "utf8");

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Exported 1 org memory entry/);
    assert.match(exported, /Promote org lesson/);
    assert.match(exported, /scope=org/);
    assert.doesNotMatch(exported, /Keep local/);
  });
});

function assertGitArgumentGuard(args, value) {
  assert.ok(args, `missing git call for ${value}`);
  const index = args.indexOf(value);
  assert.notEqual(index, -1, `missing git argument ${value}`);
  assert.equal(args[index - 1], "--", `${value} is not guarded by -- in: ${args.join(" ")}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
