import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { validateConfig } from "../src/config.js";
import { compareVersions, packageVersion, parseVersion } from "../src/version.js";
import { commitAll, createGitRepo } from "./helpers/git.js";

async function withTempRepo(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-test-"));
  try {
    await createGitRepo(directory);
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function initWorkspace(directory) {
  const result = await runCli(["init"], { cwd: directory });
  assert.equal(result.exitCode, 0);
  await commitAll(directory);
}

async function readConfig(directory) {
  return JSON.parse(await readFile(path.join(directory, ".ai/config.json"), "utf8"));
}

async function writeConfig(directory, config) {
  await writeFile(path.join(directory, ".ai/config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function readLock(directory) {
  return JSON.parse(await readFile(path.join(directory, ".ai/atlas.lock.json"), "utf8"));
}

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

const setupSkillPath = ".ai/skills/atlas-setup/SKILL.md";

test("version parsing and comparison", () => {
  assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3, prerelease: null });
  assert.equal(parseVersion("1.2.3").prerelease, null);
  assert.equal(parseVersion("not a version"), null);
  assert.equal(parseVersion("1.2"), null);
  assert.equal(compareVersions("0.4.0", "0.4.0"), 0);
  assert.equal(compareVersions("0.5.0", "0.4.9"), 1);
  assert.equal(compareVersions("0.9.0", "0.10.0"), -1);
  assert.equal(compareVersions("1.0.0-beta", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta"), 1);
  assert(parseVersion(packageVersion));
});

test("config validation accepts a missing stamp and rejects a malformed one", () => {
  const base = {
    schemaVersion: 1,
    artifactRoot: ".ai",
    paths: {
      language: "LANGUAGE.md",
      memory: "memory",
      plans: "plans",
      research: "research",
      decisions: "decisions",
      adrs: "decisions/adrs",
      results: "results",
      skills: "skills"
    },
    pathAliases: {}
  };

  assert.equal(validateConfig(base).valid, true);
  assert.equal(validateConfig({ ...base, atlasVersion: "0.4.0" }).valid, true);
  assert.equal(validateConfig({ ...base, atlasVersion: "latest" }).valid, false);
  assert.equal(validateConfig({ ...base, atlasVersion: 4 }).valid, false);
});

test("init stamps the workspace with the running package version", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const config = await readConfig(directory);

    assert.equal(config.atlasVersion, packageVersion);
  });
});

test("doctor stays quiet when the stamp is missing and advises when it is behind", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    const config = await readConfig(directory);

    delete config.atlasVersion;
    await writeConfig(directory, config);
    const withoutStamp = await runCli(["doctor"], { cwd: directory });
    assert.equal(withoutStamp.exitCode, 0);
    assert.doesNotMatch(withoutStamp.stdout, /atlas-version/);

    await writeConfig(directory, { ...config, atlasVersion: "0.1.0" });
    const behind = await runCli(["doctor"], { cwd: directory });
    assert.equal(behind.exitCode, 0);
    assert.match(behind.stdout, /\[atlas-version-behind\]/);
    assert.match(behind.stdout, /0\.1\.0/);
  });
});

test("doctor --fix refreshes a stale version stamp", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    const config = await readConfig(directory);
    await writeConfig(directory, { ...config, atlasVersion: "0.1.0" });
    await commitAll(directory);

    const fix = await runCli(["doctor", "--fix"], { cwd: directory });
    assert.equal(fix.exitCode, 0);
    assert.equal((await readConfig(directory)).atlasVersion, packageVersion);

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 0);
    assert.doesNotMatch(doctor.stdout, /atlas-version-behind/);
  });
});

test("a workspace stamped by a newer Atlas blocks doctor and --fix unless forced", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    const config = await readConfig(directory);
    await writeConfig(directory, { ...config, atlasVersion: "99.0.0" });
    await commitAll(directory);

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 2);
    assert.match(doctor.stdout, /\[atlas-version-ahead\]/);
    assert.match(doctor.stdout, /99\.0\.0/);

    const fix = await runCli(["doctor", "--fix"], { cwd: directory });
    assert.equal(fix.exitCode, 2);
    assert.equal((await readConfig(directory)).atlasVersion, "99.0.0");

    const forced = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    assert.equal(forced.exitCode, 0);
    assert.equal((await readConfig(directory)).atlasVersion, packageVersion);
  });
});

test("init writes a lockfile with baselines for every managed skill file", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const lock = await readLock(directory);
    const skill = await readFile(path.join(directory, setupSkillPath), "utf8");

    assert.equal(lock.schemaVersion, 1);
    assert.equal(lock.atlasVersion, packageVersion);
    assert.deepEqual(Object.keys(lock.files).sort(), [
      ".ai/skills/atlas-compact/SKILL.md",
      ".ai/skills/atlas-review/SKILL.md",
      ".ai/skills/atlas-setup/SKILL.md",
      ".ai/skills/atlas-setup/customization.md"
    ]);
    assert.equal(lock.files[setupSkillPath].sha256, sha256(skill));
  });
});

test("a missing lockfile on an initialized workspace is fixable", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    await rm(path.join(directory, ".ai/atlas.lock.json"));
    await commitAll(directory);

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 1);
    assert.match(doctor.stdout, /\[missing-lockfile\]/);

    const fix = await runCli(["doctor", "--fix"], { cwd: directory });
    assert.equal(fix.exitCode, 0);
    const lock = await readLock(directory);
    assert.equal(Object.keys(lock.files).length, 4);
  });
});

test("a corrupt lockfile is a manual conflict", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    await writeFile(path.join(directory, ".ai/atlas.lock.json"), "not json\n", "utf8");

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 2);
    assert.match(doctor.stdout, /\[invalid-lockfile\]/);
  });
});

test("an edited managed skill is a customized-skill advisory that --fix leaves alone", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    await writeFile(path.join(directory, setupSkillPath), "local edit\n", "utf8");
    await commitAll(directory);

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 0);
    assert.match(doctor.stdout, /\[customized-skill\]/);
    assert.match(doctor.stdout, /--adopt-skills/);
    assert.match(doctor.stdout, /--reset-skills/);
    assert.doesNotMatch(doctor.stdout, /\[stale-setup-skill\]/);

    const fix = await runCli(["doctor", "--fix"], { cwd: directory });
    assert.equal(fix.exitCode, 0);
    assert.equal(await readFile(path.join(directory, setupSkillPath), "utf8"), "local edit\n");
  });
});

test("a managed skill matching its baseline but not the package is stale and fixable", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    const previousRelease = "previous release content\n";
    await writeFile(path.join(directory, setupSkillPath), previousRelease, "utf8");
    const lock = await readLock(directory);
    lock.files[setupSkillPath] = { sha256: sha256(previousRelease), packaged: sha256(previousRelease) };
    await writeFile(path.join(directory, ".ai/atlas.lock.json"), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
    await commitAll(directory);

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 1);
    assert.match(doctor.stdout, /\[stale-setup-skill\]/);

    const fix = await runCli(["doctor", "--fix"], { cwd: directory });
    assert.equal(fix.exitCode, 0);
    const skill = await readFile(path.join(directory, setupSkillPath), "utf8");
    assert.doesNotMatch(skill, /previous release content/);
    assert.equal((await readLock(directory)).files[setupSkillPath].sha256, sha256(skill));
  });
});

test("doctor --fix --reset-skills overwrites customized skills", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    await writeFile(path.join(directory, setupSkillPath), "local edit\n", "utf8");
    await commitAll(directory);

    const fix = await runCli(["doctor", "--fix", "--reset-skills"], { cwd: directory });
    assert.equal(fix.exitCode, 0);
    const skill = await readFile(path.join(directory, setupSkillPath), "utf8");
    assert.doesNotMatch(skill, /local edit/);
    assert.equal((await readLock(directory)).files[setupSkillPath].sha256, sha256(skill));
  });
});

test("doctor --adopt-skills re-baselines customized skills", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    await writeFile(path.join(directory, setupSkillPath), "deliberate customization\n", "utf8");
    await commitAll(directory);

    const adopt = await runCli(["doctor", "--adopt-skills"], { cwd: directory });
    assert.equal(adopt.exitCode, 0);
    assert.match(adopt.stdout, /atlas-setup\/SKILL\.md/);
    assert.equal((await readLock(directory)).files[setupSkillPath].sha256, sha256("deliberate customization\n"));

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 0);
    assert.doesNotMatch(doctor.stdout, /\[customized-skill\]/);

    const fix = await runCli(["doctor", "--fix"], { cwd: directory });
    assert.equal(fix.exitCode, 0);
    assert.equal(await readFile(path.join(directory, setupSkillPath), "utf8"), "deliberate customization\n");
  });
});

test("an adopted skill reports again when the packaged copy changes after adoption", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    await writeFile(path.join(directory, setupSkillPath), "deliberate customization\n", "utf8");
    await commitAll(directory);
    await runCli(["doctor", "--adopt-skills"], { cwd: directory });

    // Simulate an adoption recorded under an older release: the packaged hash
    // in the lockfile no longer matches the running package's skill content.
    const lock = await readLock(directory);
    lock.files[setupSkillPath].packaged = sha256("older packaged content\n");
    await writeFile(path.join(directory, ".ai/atlas.lock.json"), `${JSON.stringify(lock, null, 2)}\n`, "utf8");

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 0);
    assert.match(doctor.stdout, /\[customized-skill\]/);
    assert.match(doctor.stdout, /changed since adoption/);

    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    assert.equal(fix.exitCode, 0);
    assert.equal(await readFile(path.join(directory, setupSkillPath), "utf8"), "deliberate customization\n");
  });
});

test("doctor --adopt-skills refuses an invalid config instead of guessing paths", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    await writeFile(path.join(directory, ".ai/config.json"), "not json\n", "utf8");
    await commitAll(directory);
    const lockBefore = await readFile(path.join(directory, ".ai/atlas.lock.json"), "utf8");

    const result = await runCli(["doctor", "--adopt-skills"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /config is missing or invalid/);
    assert.equal(await readFile(path.join(directory, ".ai/atlas.lock.json"), "utf8"), lockBefore);
  });
});

test("doctor --adopt-skills refuses a dirty worktree unless forced", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    await writeFile(path.join(directory, setupSkillPath), "uncommitted edit\n", "utf8");

    const refused = await runCli(["doctor", "--adopt-skills"], { cwd: directory });
    assert.equal(refused.exitCode, 2);
    assert.match(refused.stderr, /dirty git worktree/);

    const forced = await runCli(["doctor", "--adopt-skills", "--force"], { cwd: directory });
    assert.equal(forced.exitCode, 0);
  });
});

test("doctor flag combinations for the update system are validated", async () => {
  await withTempRepo(async (directory) => {
    const resetWithoutFix = await runCli(["doctor", "--reset-skills"], { cwd: directory });
    assert.equal(resetWithoutFix.exitCode, 2);
    assert.match(resetWithoutFix.stderr, /--reset-skills requires --fix/);

    const adoptWithFix = await runCli(["doctor", "--adopt-skills", "--fix"], { cwd: directory });
    assert.equal(adoptWithFix.exitCode, 2);
    assert.match(adoptWithFix.stderr, /Cannot combine --adopt-skills/);

    const checkWithFix = await runCli(["doctor", "--check-updates", "--fix"], { cwd: directory });
    assert.equal(checkWithFix.exitCode, 2);
    assert.match(checkWithFix.stderr, /Cannot combine --check-updates with --fix/);
  });
});

function fakeRegistry(latest) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ "dist-tags": { latest } })
  });
}

test("atlas update reports an available update with a pinned upgrade command", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);
    const result = await runCli(["update"], { cwd: directory, fetchImpl: fakeRegistry("99.0.0") });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Current CLI: \d+\.\d+\.\d+/);
    assert.match(result.stdout, /Latest: {6}99\.0\.0/);
    assert.match(result.stdout, new RegExp(`Workspace: {3}${packageVersion.replaceAll(".", "\\.")}`));
    assert.match(result.stdout, /npx --yes @blazity-atlas\/core@99\.0\.0 doctor --fix/);
  });
});

test("atlas update reports up to date and survives registry failures", async () => {
  await withTempRepo(async (directory) => {
    const upToDate = await runCli(["update"], { cwd: directory, fetchImpl: fakeRegistry(packageVersion) });
    assert.equal(upToDate.exitCode, 0);
    assert.match(upToDate.stdout, /Already up to date\./);

    const failing = await runCli(["update"], {
      cwd: directory,
      fetchImpl: async () => {
        throw new Error("network down");
      }
    });
    assert.equal(failing.exitCode, 0);
    assert.match(failing.stdout, /Update check skipped/);
    assert.match(failing.stdout, /network down/);
  });
});

test("atlas update rejects unknown flags", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["update", "--fix"], { cwd: directory });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Unknown option: --fix/);
  });
});

test("doctor --check-updates adds an advisory without touching the exit code", async () => {
  await withTempRepo(async (directory) => {
    await initWorkspace(directory);

    const available = await runCli(["doctor", "--check-updates"], { cwd: directory, fetchImpl: fakeRegistry("99.0.0") });
    assert.equal(available.exitCode, 0);
    assert.match(available.stdout, /\[update-available\]/);
    assert.match(available.stdout, /99\.0\.0/);

    const current = await runCli(["doctor", "--check-updates"], { cwd: directory, fetchImpl: fakeRegistry(packageVersion) });
    assert.equal(current.exitCode, 0);
    assert.doesNotMatch(current.stdout, /\[update-available\]/);

    const failing = await runCli(["doctor", "--check-updates"], {
      cwd: directory,
      fetchImpl: async () => {
        throw new Error("network down");
      }
    });
    assert.equal(failing.exitCode, 0);
    assert.match(failing.stdout, /\[update-check-failed\]/);
  });
});
