import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { defaultLanguageMd, defaultMemoryReadme, initNextStepText } from "../src/templates.js";
import { commitAll, createGitRepo } from "./helpers/git.js";

const packageVersion = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;

async function withTempRepo(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-adoption-"));
  try {
    await createGitRepo(directory);
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("--version and -v print the package version and exit 0", async () => {
  for (const flag of ["--version", "-v"]) {
    const result = await runCli([flag]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, `${packageVersion}\n`);
    assert.equal(result.stderr, "");
  }
});

test("bare atlas prints help and exits 0", async () => {
  const result = await runCli([]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, "");
});

test("unknown commands and options fail with the error first, not a usage dump", async () => {
  const command = await runCli(["frobnicate"]);
  assert.equal(command.exitCode, 2);
  assert.match(command.stderr, /^Unknown command: frobnicate/);
  assert.match(command.stderr, /--help/);
  assert.equal(command.stdout, "");

  await withTempRepo(async (directory) => {
    const option = await runCli(["init", "--bogus"], { cwd: directory });
    assert.equal(option.exitCode, 2);
    assert.match(option.stderr, /^Unknown option: --bogus/);
    assert.equal(option.stdout, "");
  });
});

test("help documents the exit-code contract and the doctor/init flags", async () => {
  const result = await runCli(["--help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Exit codes/);
  assert.match(result.stdout, /0 {2}clean/);
  assert.match(result.stdout, /--dry-run/);
  assert.match(result.stdout, /--ci/);
  assert.match(result.stdout, /--here/);
  assert.match(result.stdout, /--json/);
  assert.match(result.stdout, /--version/);
});

test("doctor in an uninitialized repo points at init instead of dumping a finding wall", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /not set up/i);
    assert.match(result.stdout, /@blazity-atlas\/core@latest init/);
    assert.doesNotMatch(result.stdout, /missing-config/);
    assert.doesNotMatch(result.stdout, /Fixable:/);
  });
});

test("doctor --json emits machine-readable findings with the frozen classification", async () => {
  await withTempRepo(async (directory) => {
    const before = await runCli(["doctor", "--json"], { cwd: directory });
    const parsedBefore = JSON.parse(before.stdout);

    assert.equal(before.exitCode, 1);
    assert.equal(parsedBefore.classification, "fixable");
    assert.equal(parsedBefore.exitCode, 1);
    assert.ok(parsedBefore.findings.some((finding) => finding.code === "missing-config" && finding.fixable));

    await runCli(["init"], { cwd: directory });
    const after = await runCli(["doctor", "--json"], { cwd: directory });
    const parsedAfter = JSON.parse(after.stdout);

    assert.equal(after.exitCode, 0);
    assert.equal(parsedAfter.classification, "clean");
    assert.ok(parsedAfter.findings.every((finding) => finding.severity === "advisory"));
  });
});

test("doctor --json cannot be combined with --fix", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["doctor", "--fix", "--json"], { cwd: directory });
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /--json/);
  });
});

test("init refuses repository subdirectories unless --here is passed", async () => {
  await withTempRepo(async (directory) => {
    const nested = path.join(directory, "packages", "app");
    await mkdir(nested, { recursive: true });

    const refused = await runCli(["init"], { cwd: nested });
    assert.equal(refused.exitCode, 2);
    assert.match(refused.stderr, /subdirectory/);
    assert.match(refused.stderr, /--here/);
    await assert.rejects(stat(path.join(nested, ".ai")), /ENOENT/);

    const allowed = await runCli(["init", "--here"], { cwd: nested });
    assert.equal(allowed.exitCode, 0);
    await stat(path.join(nested, ".ai/config.json"));
  });
});

test("dirty-worktree refusal names the offending paths and flags untracked-only trees", async () => {
  await withTempRepo(async (directory) => {
    await writeFile(path.join(directory, "scratch.txt"), "wip\n");

    const result = await runCli(["init"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /dirty git worktree/);
    assert.match(result.stderr, /scratch\.txt/);
    assert.match(result.stderr, /untracked/i);
  });
});

test("skill-link collisions carry a remediation hint", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await commitAll(directory, "initialize atlas");
    await rm(path.join(directory, ".claude/skills"));
    await mkdir(path.join(directory, ".claude/skills/my-skill"), { recursive: true });
    await writeFile(path.join(directory, ".claude/skills/my-skill/SKILL.md"), "mine\n");

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /\[skill-link-collision\]/);
    assert.match(result.stdout, /move .*\.ai\/skills/);
    assert.match(result.stdout, /doctor --fix/);
  });
});

test("an edited managed block reports as stale, a missing one as missing", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const agents = await readFile(path.join(directory, "AGENTS.md"), "utf8");
    await writeFile(path.join(directory, "AGENTS.md"), agents.replace("source of truth", "edited words"));

    const edited = await runCli(["doctor"], { cwd: directory });
    assert.equal(edited.exitCode, 1);
    assert.match(edited.stdout, /\[stale-managed-block\]/);
    assert.match(edited.stdout, /differs/);

    await rm(path.join(directory, "AGENTS.md"));
    const missing = await runCli(["doctor"], { cwd: directory });
    assert.equal(missing.exitCode, 1);
    assert.match(missing.stdout, /\[missing-managed-block\]/);
  });
});

test("init next-step text offers both Claude Code invocations and a commit nudge", () => {
  const text = initNextStepText();
  assert.match(text, /Claude Code: run \/atlas-setup/);
  assert.match(text, /\/atlas:atlas-setup/);
  assert.match(text, /git add \.ai \.claude \.agents \.cursor AGENTS\.md CLAUDE\.md/);

  const custom = initNextStepText(".workspace");
  assert.match(custom, /git add \.workspace \.claude \.agents \.cursor AGENTS\.md CLAUDE\.md \.atlas/);
});

test("language scaffold ships one marked example row; memory scaffold shows the quality bar", () => {
  const language = defaultLanguageMd();
  assert.match(language, /\| Atlas workspace \|/);
  assert.match(language, /<!-- TODO/);

  const memory = defaultMemoryReadme();
  assert.match(memory, /Good entry/);
  assert.match(memory, /Weak entry/);
});

test("fresh scaffold nudges via the placeholder advisory instead of an empty-language wall", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /\[unresolved-placeholder\] \.ai\/LANGUAGE\.md/);
    assert.doesNotMatch(result.stdout, /empty-language/);
  });
});
