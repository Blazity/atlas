import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { createDefaultConfig } from "../src/config.js";
import { collectDoctorFindings } from "../src/doctor.js";
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

test("doctor reports missing config and managed files as fixable", async () => {
  await withTempRepo(async (directory) => {
    const findings = await collectDoctorFindings(directory);

    assert(findings.some((finding) => finding.code === "missing-config" && finding.fixable));
    assert(findings.some((finding) => finding.code === "missing-managed-block" && finding.fixable));
  });
});

test("init creates a clean harness and is idempotent", async () => {
  await withTempRepo(async (directory) => {
    const first = await runCli(["init"], { cwd: directory });
    const configAfterFirstRun = await readFile(path.join(directory, ".ai/config.json"), "utf8");
    const agentsAfterFirstRun = await readFile(path.join(directory, "AGENTS.md"), "utf8");
    const skillAfterFirstRun = await readFile(path.join(directory, ".ai/skills/setup/SKILL.md"), "utf8");
    const customizationAfterFirstRun = await readFile(path.join(directory, ".ai/skills/setup/customization.md"), "utf8");
    const second = await runCli(["init"], { cwd: directory });
    const doctor = await runCli(["doctor"], { cwd: directory });

    assert.equal(first.exitCode, 0);
    assert.equal(second.exitCode, 0);
    assert.equal(doctor.exitCode, 0);
    assert.match(first.stdout, /^Applied changes:$/m);
    assert.doesNotMatch(first.stdout, /^Fixable:$/m);
    assert.match(first.stdout, /setup/);
    assert.match(first.stdout, /Claude users can install the `atlas` plugin/);
    assert.match(first.stdout, /\/atlas:setup/);
    assert.match(configAfterFirstRun, /"schemaVersion": 1/);
    assert.match(skillAfterFirstRun, /name: setup/);
    assert.match(skillAfterFirstRun, /Bootstrap \/ Update Harness/);
    assert.match(skillAfterFirstRun, /npx --yes @blazity-atlas\/core@latest init/);
    assert.match(skillAfterFirstRun, /npx --yes @blazity-atlas\/core@latest doctor/);
    assert.match(skillAfterFirstRun, /npx --yes @blazity-atlas\/core@latest doctor --fix/);
    assert.match(skillAfterFirstRun, /dirty worktree/);
    assert.match(skillAfterFirstRun, /manual conflicts/);
    assert.match(skillAfterFirstRun, /Refresh/);
    assert.match(skillAfterFirstRun, /customization\.md/);
    assert.match(customizationAfterFirstRun, /Atlas Customization/);
    assert.match(customizationAfterFirstRun, /artifact layout preferences/);
    assert.equal(await readFile(path.join(directory, ".ai/config.json"), "utf8"), configAfterFirstRun);
    assert.equal(await readFile(path.join(directory, "AGENTS.md"), "utf8"), agentsAfterFirstRun);
    assert.equal(await readFile(path.join(directory, ".ai/skills/setup/SKILL.md"), "utf8"), skillAfterFirstRun);
    assert.equal(await readFile(path.join(directory, ".ai/skills/setup/customization.md"), "utf8"), customizationAfterFirstRun);
  });
});

test("init supports explicit templates when writing the initial config", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["init", "--template", "app"], { cwd: directory });
    const config = JSON.parse(await readFile(path.join(directory, ".ai/config.json"), "utf8"));
    const doctor = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.equal(config.template, "app");
    assert.equal(config.pathAliases["docs/qa"], "results");
    assert.equal(config.pathAliases["docs/runbooks"], "decisions");
    assert.match(result.stdout, /Template: app/);
    assert.equal(doctor.exitCode, 0);
  });
});

test("init keeps the existing config template when rerun with a different template", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const result = await runCli(["init", "--template", "app"], { cwd: directory });
    const config = JSON.parse(await readFile(path.join(directory, ".ai/config.json"), "utf8"));

    assert.equal(result.exitCode, 0);
    assert.equal(config.template, "standard");
    assert.match(result.stdout, /Template: standard/);
    assert.doesNotMatch(result.stdout, /Template: app/);
  });
});

test("init rejects unknown templates", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["init", "--template", "unknown"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Unknown Atlas template: unknown/);
    await assert.rejects(stat(path.join(directory, ".ai/config.json")), /ENOENT/);
  });
});

test("doctor --fix restores the managed setup skill", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/skills/setup/SKILL.md"), "local edit\n");

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const skill = await readFile(path.join(directory, ".ai/skills/setup/SKILL.md"), "utf8");

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /setup\/SKILL\.md/);
    assert.equal(fix.exitCode, 0);
    assert.match(fix.stdout, /^Applied fixes:$/m);
    assert.doesNotMatch(fix.stdout, /^Fixable:$/m);
    assert.match(skill, /name: setup/);
    assert.doesNotMatch(skill, /local edit/);
  });
});

test("doctor --fix restores the managed customization instructions", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/skills/setup/customization.md"), "local edit\n");

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const customization = await readFile(path.join(directory, ".ai/skills/setup/customization.md"), "utf8");

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /setup\/customization\.md/);
    assert.equal(fix.exitCode, 0);
    assert.match(fix.stdout, /^Applied fixes:$/m);
    assert.match(customization, /Atlas Customization/);
    assert.doesNotMatch(customization, /local edit/);
  });
});

test("init leaves legacy maintain-ai-harness skill folders untouched", async () => {
  await withTempRepo(async (directory) => {
    await mkdir(path.join(directory, ".ai/skills/maintain-ai-harness"), { recursive: true });
    await writeFile(path.join(directory, ".ai/skills/maintain-ai-harness/SKILL.md"), "legacy local skill\n");

    const result = await runCli(["init", "--force"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.equal(await readFile(path.join(directory, ".ai/skills/maintain-ai-harness/SKILL.md"), "utf8"), "legacy local skill\n");
    assert.match(await readFile(path.join(directory, ".ai/skills/setup/SKILL.md"), "utf8"), /name: setup/);
  });
});

test("init --dry-run does not write files", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["init", "--dry-run"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    await assert.rejects(stat(path.join(directory, ".ai/config.json")), /ENOENT/);
  });
});

test("doctor --fix moves files from explicit alias roots", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await commitAll(directory, "initialize harness");
    await mkdir(path.join(directory, "docs/superpowers/plans"), { recursive: true });
    await writeFile(path.join(directory, "docs/superpowers/plans/example.md"), "# Plan\n");
    await commitAll(directory, "add legacy plan");

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix"], { cwd: directory });

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /docs\/superpowers\/plans\/example.md/);
    assert.equal(fix.exitCode, 0);
    assert.equal(await readFile(path.join(directory, ".ai/plans/example.md"), "utf8"), "# Plan\n");
    await assert.rejects(stat(path.join(directory, "docs/superpowers/plans/example.md")), /ENOENT/);
  });
});

test("doctor --fix reports alias target collisions as manual", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await mkdir(path.join(directory, "docs/superpowers/plans"), { recursive: true });
    await writeFile(path.join(directory, "docs/superpowers/plans/example.md"), "legacy\n");
    await writeFile(path.join(directory, ".ai/plans/example.md"), "canonical\n");

    const result = await runCli(["doctor", "--fix"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /manual/i);
    assert.equal(await readFile(path.join(directory, ".ai/plans/example.md"), "utf8"), "canonical\n");
  });
});

test("doctor --fix repairs broken skill symlinks", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await commitAll(directory, "initialize harness");
    await rm(path.join(directory, ".claude/skills"));
    await symlink("../missing-skills", path.join(directory, ".claude/skills"));

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const after = await runCli(["doctor"], { cwd: directory });

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /missing-skill-link|broken-skill-link/);
    assert.equal(fix.exitCode, 0);
    assert.equal(after.exitCode, 0);
  });
});

test("doctor --fix refuses to mutate a dirty worktree unless forced", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await commitAll(directory, "initialize harness");
    await writeFile(path.join(directory, "unrelated.txt"), "dirty\n");
    await mkdir(path.join(directory, "docs/superpowers/plans"), { recursive: true });
    await writeFile(path.join(directory, "docs/superpowers/plans/example.md"), "# Plan\n");

    const refused = await runCli(["doctor", "--fix"], { cwd: directory });

    assert.equal(refused.exitCode, 2);
    assert.match(refused.stderr, /dirty git worktree/);
    assert.equal(await readFile(path.join(directory, "docs/superpowers/plans/example.md"), "utf8"), "# Plan\n");

    const forced = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(forced.exitCode, 0);
    assert.equal(await readFile(path.join(directory, ".ai/plans/example.md"), "utf8"), "# Plan\n");
  });
});

test("doctor rejects unknown flags instead of ignoring a dry-run typo", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await mkdir(path.join(directory, "docs/superpowers/plans"), { recursive: true });
    await writeFile(path.join(directory, "docs/superpowers/plans/example.md"), "# Plan\n");

    const result = await runCli(["doctor", "--fix", "--dry-run"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Unknown option: --dry-run/);
    assert.equal(await readFile(path.join(directory, "docs/superpowers/plans/example.md"), "utf8"), "# Plan\n");
  });
});

test("init reports invalid config instead of hiding manual findings", async () => {
  await withTempRepo(async (directory) => {
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify({ ...createDefaultConfig(), schemaVersion: 99 }));

    const result = await runCli(["init"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /schemaVersion/);
  });
});

test("init reports malformed config JSON instead of crashing", async () => {
  await withTempRepo(async (directory) => {
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), "{invalid json\n");

    const result = await runCli(["init"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /config is not valid JSON/);
  });
});

test("doctor reports configured directory file collisions as manual", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await rm(path.join(directory, ".ai/plans"), { recursive: true, force: true });
    await writeFile(path.join(directory, ".ai/plans"), "not a directory\n");

    const result = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /exists but is not a directory/);
    assert.equal(await readFile(path.join(directory, ".ai/plans"), "utf8"), "not a directory\n");
  });
});

test("doctor honors absolute artifactRoot paths", async () => {
  const externalRoot = await mkdtemp(path.join(tmpdir(), "atlas-absolute-root-"));
  await withTempRepo(async (directory) => {
    const config = { ...createDefaultConfig(), artifactRoot: externalRoot };
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify(config));

    const result = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    await stat(path.join(externalRoot, "plans"));
    await assert.rejects(stat(path.join(directory, externalRoot.replace(/^\//, ""), "plans")), /ENOENT/);
  });
  await rm(externalRoot, { recursive: true, force: true });
});

test("doctor repairs skill symlinks that point to the wrong target", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await commitAll(directory, "initialize harness");
    await mkdir(path.join(directory, "other-skills"), { recursive: true });
    await rm(path.join(directory, ".claude/skills"));
    await symlink("../other-skills", path.join(directory, ".claude/skills"));

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /wrong-skill-link-target/);
    assert.equal(fix.exitCode, 0);
    assert.equal(await readlink(path.join(directory, ".claude/skills")), "../.ai/skills");
  });
});

test("doctor derives skill symlink targets from custom artifactRoot", async () => {
  await withTempRepo(async (directory) => {
    const config = { ...createDefaultConfig(), artifactRoot: ".harness" };
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify(config));

    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const after = await runCli(["doctor"], { cwd: directory });

    assert.equal(fix.exitCode, 0);
    assert.equal(await readlink(path.join(directory, ".claude/skills")), "../.harness/skills");
    assert.equal(after.exitCode, 0);
  });
});

test("doctor rejects pathAliases that escape the repository", async () => {
  await withTempRepo(async (directory) => {
    const config = { ...createDefaultConfig(), pathAliases: { "../outside-alias": "plans" } };
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify(config));

    const result = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /pathAliases\.\.\.\/outside-alias/);
  });
});

test("doctor reports alias roots that are files as manual conflicts", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await mkdir(path.join(directory, "docs"), { recursive: true });
    await writeFile(path.join(directory, "docs/specs"), "not a directory\n");

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /docs\/specs exists but is not a directory/);
  });
});

test("doctor reports malformed managed blocks as manual conflicts", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, "AGENTS.md"), "# Project\n\n<!-- BEGIN AI-HARNESS: artifact-paths -->\nPartial\n");

    const result = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /managed block is malformed/);
    assert.equal((await readFile(path.join(directory, "AGENTS.md"), "utf8")).match(/BEGIN AI-HARNESS/g)?.length, 1);
  });
});

test("doctor reports duplicate managed blocks as manual conflicts", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const agents = await readFile(path.join(directory, "AGENTS.md"), "utf8");
    await writeFile(path.join(directory, "AGENTS.md"), `${agents}\n${agents}`);

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /managed block is duplicated/);
  });
});

test("doctor migrates a legacy AI-HARNESS managed block to the ATLAS namespace", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const legacyAgents = [
      "# Project AI Instructions",
      "",
      "Human-authored guidance stays put.",
      "",
      "<!-- BEGIN AI-HARNESS: artifact-paths -->",
      "## Legacy Artifact Paths",
      "",
      "Old managed body from the AI-HARNESS era.",
      "<!-- END AI-HARNESS: artifact-paths -->",
      ""
    ].join("\n");
    await writeFile(path.join(directory, "AGENTS.md"), legacyAgents);

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const agents = await readFile(path.join(directory, "AGENTS.md"), "utf8");

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /missing-managed-block/);
    assert.equal(fix.exitCode, 0);
    assert.equal((agents.match(/BEGIN ATLAS: artifact-paths/g) ?? []).length, 1);
    assert.equal((agents.match(/BEGIN AI-HARNESS/g) ?? []).length, 0);
    assert.match(agents, /Human-authored guidance stays put/);
  });
});

test("doctor checks placeholders at the configured language path", async () => {
  await withTempRepo(async (directory) => {
    const config = createDefaultConfig();
    config.paths.language = "VOCAB.md";
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify(config));
    await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/VOCAB.md"), "# {{TODO}}\n");

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /\.ai\/VOCAB\.md still contains scaffold placeholders/);
  });
});

test("doctor validates config shape", async () => {
  await withTempRepo(async (directory) => {
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify({ ...createDefaultConfig(), schemaVersion: 99 }));

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /schemaVersion/);
  });
});
