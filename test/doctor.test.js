import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, mkdir, readFile, readlink, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { runCli } from "../src/cli.js";
import { createDefaultConfig } from "../src/config.js";
import { applyFixes, collectDoctorFindings } from "../src/doctor.js";
import { managedSkillFiles } from "../src/templates.js";
import { commitAll, createGitRepo } from "./helpers/git.js";

const execFileAsync = promisify(execFile);

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
    const skillAfterFirstRun = await readFile(path.join(directory, ".ai/skills/atlas-setup/SKILL.md"), "utf8");
    const customizationAfterFirstRun = await readFile(path.join(directory, ".ai/skills/atlas-setup/customization.md"), "utf8");
    const second = await runCli(["init"], { cwd: directory });
    const doctor = await runCli(["doctor"], { cwd: directory });

    assert.equal(first.exitCode, 0);
    assert.equal(second.exitCode, 0);
    assert.equal(doctor.exitCode, 0);
    assert.match(first.stdout, /^Created\s+\.ai\/config\.json$/m);
    assert.match(first.stdout, /changes applied/);
    assert.match(second.stdout, /Already up to date/);
    assert.doesNotMatch(first.stdout, /^Fixable:$/m);
    assert.match(first.stdout, /setup/);
    assert.match(first.stdout, /Claude Code: run \/atlas-setup \(or \/atlas:atlas-setup with the Atlas plugin\)/);
    assert.match(configAfterFirstRun, /"schemaVersion": 1/);
    assert.match(skillAfterFirstRun, /name: atlas-setup/);
    assert.match(skillAfterFirstRun, /Deterministic Bootstrap/);
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
    assert.equal(await readFile(path.join(directory, ".ai/skills/atlas-setup/SKILL.md"), "utf8"), skillAfterFirstRun);
    assert.equal(await readFile(path.join(directory, ".ai/skills/atlas-setup/customization.md"), "utf8"), customizationAfterFirstRun);
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
    await writeFile(path.join(directory, ".ai/skills/atlas-setup/SKILL.md"), "local edit\n");

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const skill = await readFile(path.join(directory, ".ai/skills/atlas-setup/SKILL.md"), "utf8");

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /atlas-setup\/SKILL\.md/);
    assert.equal(fix.exitCode, 0);
    assert.match(fix.stdout, /^Applied fixes:$/m);
    assert.doesNotMatch(fix.stdout, /^Fixable:$/m);
    assert.match(skill, /name: atlas-setup/);
    assert.doesNotMatch(skill, /local edit/);
  });
});

test("doctor --fix restores the managed customization instructions", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/skills/atlas-setup/customization.md"), "local edit\n");

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const customization = await readFile(path.join(directory, ".ai/skills/atlas-setup/customization.md"), "utf8");

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /atlas-setup\/customization\.md/);
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
    assert.match(await readFile(path.join(directory, ".ai/skills/atlas-setup/SKILL.md"), "utf8"), /name: atlas-setup/);
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
    await mkdir(path.join(directory, "docs/plans"), { recursive: true });
    await writeFile(path.join(directory, "docs/plans/example.md"), "# Plan\n");
    await commitAll(directory, "add legacy plan");

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix"], { cwd: directory });

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /docs\/plans\/example.md/);
    assert.equal(fix.exitCode, 0);
    assert.equal(await readFile(path.join(directory, ".ai/plans/example.md"), "utf8"), "# Plan\n");
    await assert.rejects(stat(path.join(directory, "docs/plans/example.md")), /ENOENT/);
  });
});

test("doctor --fix reports alias target collisions as manual", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await mkdir(path.join(directory, "docs/plans"), { recursive: true });
    await writeFile(path.join(directory, "docs/plans/example.md"), "legacy\n");
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
    await mkdir(path.join(directory, "docs/plans"), { recursive: true });
    await writeFile(path.join(directory, "docs/plans/example.md"), "# Plan\n");

    const refused = await runCli(["doctor", "--fix"], { cwd: directory });

    assert.equal(refused.exitCode, 2);
    assert.match(refused.stderr, /dirty git worktree/);
    assert.equal(await readFile(path.join(directory, "docs/plans/example.md"), "utf8"), "# Plan\n");

    const forced = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(forced.exitCode, 0);
    assert.equal(await readFile(path.join(directory, ".ai/plans/example.md"), "utf8"), "# Plan\n");
  });
});

test("doctor rejects unknown flags instead of ignoring a dry-run typo", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await mkdir(path.join(directory, "docs/plans"), { recursive: true });
    await writeFile(path.join(directory, "docs/plans/example.md"), "# Plan\n");

    const result = await runCli(["doctor", "--fix", "--dry-run"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /Unknown option: --dry-run/);
    assert.equal(await readFile(path.join(directory, "docs/plans/example.md"), "utf8"), "# Plan\n");
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
    assert.match(before.stdout, /stale-managed-block/);
    assert.equal(fix.exitCode, 0);
    assert.equal((agents.match(/BEGIN ATLAS: artifact-paths/g) ?? []).length, 1);
    assert.equal((agents.match(/BEGIN AI-HARNESS/g) ?? []).length, 0);
    assert.match(agents, /Human-authored guidance stays put/);
  });
});

// Reclassified manual → advisory by ADR-0003: placeholders no longer block exit codes or --fix.
test("doctor reports placeholders at the configured language path as an advisory", async () => {
  await withTempRepo(async (directory) => {
    const config = createDefaultConfig();
    config.paths.language = "VOCAB.md";
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify(config));
    await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/VOCAB.md"), "# {{TODO}}\n");

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Advisory:$/m);
    assert.match(result.stdout, /\[unresolved-placeholder\] \.ai\/VOCAB\.md still contains scaffold placeholders/);
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

test("init accepts the --ci flag and stays non-interactive", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["init", "--ci"], { cwd: directory });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Created\s+\.ai\/config\.json$/m);
  });
});

test("doctor reports setup-pending as an advisory without affecting the exit code", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /No issues found\./);
    assert.match(result.stdout, /^Advisory:$/m);
    assert.match(result.stdout, /\[setup-pending\].*\.ai\/skills\/atlas-setup\/SKILL\.md/);
  });
});

test("doctor clears setup-pending once setupState flips to configured", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const config = JSON.parse(await readFile(path.join(directory, ".ai/config.json"), "utf8"));
    config.setupState = "configured";
    await writeFile(path.join(directory, ".ai/config.json"), `${JSON.stringify(config, null, 2)}\n`);

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(result.stdout, /setup-pending/);
  });
});

test("doctor --fix is never blocked by advisories and never touches them", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    // worktree is dirty and only advisories remain — --fix must still succeed untouched
    const fix = await runCli(["doctor", "--fix"], { cwd: directory });
    const config = JSON.parse(await readFile(path.join(directory, ".ai/config.json"), "utf8"));

    assert.equal(fix.exitCode, 0);
    assert.match(fix.stdout, /No issues found\./);
    assert.match(fix.stdout, /^Advisory:$/m);
    assert.equal(config.setupState, "scaffolded");
  });
});

test("doctor reports placeholder vocabulary and empty memory as advisories until they gain content", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const before = await runCli(["doctor"], { cwd: directory });

    assert.equal(before.exitCode, 0);
    assert.match(before.stdout, /\[unresolved-placeholder\] \.ai\/LANGUAGE\.md/);
    assert.match(before.stdout, /\[empty-memory\]/);

    const language = await readFile(path.join(directory, ".ai/LANGUAGE.md"), "utf8");
    const filled = language
      .split("\n")
      .filter((line) => !line.includes("<!-- TODO"))
      .concat("| Atlas | The standard | framework |")
      .join("\n");
    await writeFile(path.join(directory, ".ai/LANGUAGE.md"), `${filled}\n`);
    await writeFile(path.join(directory, ".ai/memory/product.md"), "# Product\n");

    const after = await runCli(["doctor"], { cwd: directory });

    assert.equal(after.exitCode, 0);
    assert.doesNotMatch(after.stdout, /unresolved-placeholder/);
    assert.doesNotMatch(after.stdout, /empty-language/);
    assert.doesNotMatch(after.stdout, /empty-memory/);
  });
});

test("doctor reports oversized AI context as advisory-only and --fix does not mutate it", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const agentsPath = path.join(directory, "AGENTS.md");
    const agents = await readFile(agentsPath, "utf8");
    await writeFile(agentsPath, `${agents}\n${"a".repeat(16000)}\n`);
    const beforeDoctor = await readFile(agentsPath, "utf8");

    const report = await runCli(["doctor"], { cwd: directory });
    const afterDoctor = await readFile(agentsPath, "utf8");
    const fix = await runCli(["doctor", "--fix"], { cwd: directory });
    const afterFix = await readFile(agentsPath, "utf8");

    assert.equal(report.exitCode, 0);
    assert.match(report.stdout, /No issues found\./);
    assert.match(report.stdout, /^Advisory:$/m);
    assert.match(report.stdout, /\[context-size\] AI context size risk:/);
    assert.match(report.stdout, /WARN {5}AGENTS\.md +\[##### {5}\]\s+52%/);
    assert.match(report.stdout, /files within budget/);
    assert.doesNotMatch(report.stdout, /warn 8,000|overflow 32,768|Basis:/);
    assert.match(report.stdout, /Agent handoff: atlas doctor --handoff context-size/);
    assert.equal(fix.exitCode, 0);
    assert.equal(afterDoctor, beforeDoctor);
    assert.equal(afterFix, beforeDoctor);
  });
});

test("collectDoctorFindings exposes context-size diagnostics for CLI handoff reuse", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const agentsPath = path.join(directory, "AGENTS.md");
    const agents = await readFile(agentsPath, "utf8");
    await writeFile(agentsPath, `${agents}\n${"a".repeat(16000)}\n`);
    const diagnostics = {};

    const findings = await collectDoctorFindings(directory, { diagnostics });

    assert(findings.some((finding) => finding.code === "context-size"));
    assert.equal(diagnostics.contextSizeReport.hasRisk, true);
    assert(diagnostics.contextSizeReport.entries.some((entry) => entry.relativePath === "AGENTS.md"));
  });
});

test("doctor leaves clean AI context without a context-size advisory", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const report = await runCli(["doctor"], { cwd: directory });

    assert.equal(report.exitCode, 0);
    assert.doesNotMatch(report.stdout, /\[context-size\]/);
  });
});

test("doctor --handoff context-size prints a safe prompt without mutating files", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const agentsPath = path.join(directory, "AGENTS.md");
    const agents = await readFile(agentsPath, "utf8");
    await writeFile(agentsPath, `${agents}\n${"a".repeat(16000)}\n`);
    const before = await readFile(agentsPath, "utf8");

    const handoff = await runCli(["doctor", "--handoff", "context-size"], { cwd: directory });
    const after = await readFile(agentsPath, "utf8");

    assert.equal(handoff.exitCode, 0);
    assert.match(handoff.stdout, /^Atlas doctor handoff$/m);
    assert.match(handoff.stdout, /Do not rewrite files silently/);
    assert.match(handoff.stdout, /AGENTS\.md/);
    assert.equal(after, before);
  });
});

test("doctor --handoff points agents at the atlas-compact skill", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const agentsPath = path.join(directory, "AGENTS.md");
    const agents = await readFile(agentsPath, "utf8");
    await writeFile(agentsPath, `${agents}\n${"a".repeat(16000)}\n`);

    const handoff = await runCli(["doctor", "--handoff", "context-size"], { cwd: directory });

    assert.match(handoff.stdout, /If the atlas-compact skill is available \(\.ai\/skills\/atlas-compact\/SKILL\.md/);
  });
});

test("doctor --handoff exits 0 with the prompt even when fixable drift exists elsewhere", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const agentsPath = path.join(directory, "AGENTS.md");
    const agents = await readFile(agentsPath, "utf8");
    await writeFile(agentsPath, `${agents}\n${"a".repeat(16000)}\n`);
    await rm(path.join(directory, ".ai/skills/atlas-review/SKILL.md"));

    const doctorRun = await runCli(["doctor"], { cwd: directory });
    const handoff = await runCli(["doctor", "--handoff", "context-size"], { cwd: directory });

    assert.equal(doctorRun.exitCode, 1);
    assert.equal(handoff.exitCode, 0);
    assert.match(handoff.stdout, /Do not rewrite files silently/);
  });
});

test("doctor --handoff without a context-size advisory reports no-op and exits 0", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const handoff = await runCli(["doctor", "--handoff", "context-size"], { cwd: directory });

    assert.equal(handoff.exitCode, 0);
    assert.match(handoff.stdout, /No context-size advisory found\. No handoff needed\./);
  });
});

test("doctor --handoff on an uninitialized repo points at init and exits 1", async () => {
  await withTempRepo(async (directory) => {
    await writeFile(path.join(directory, "AGENTS.md"), "a".repeat(40000));

    const handoff = await runCli(["doctor", "--handoff", "context-size"], { cwd: directory });

    assert.equal(handoff.exitCode, 1);
    assert.match(handoff.stdout, /Atlas is not set up in this repository\./);
    assert.doesNotMatch(handoff.stdout, /config\.json/);
  });
});

test("doctor --handoff refuses when doctor finds manual conflicts", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await rm(path.join(directory, ".claude/skills"), { recursive: true });
    await mkdir(path.join(directory, ".claude/skills"), { recursive: true });
    await writeFile(path.join(directory, ".claude/skills/README.md"), "not a symlink\n");

    const doctorRun = await runCli(["doctor"], { cwd: directory });
    const handoff = await runCli(["doctor", "--handoff", "context-size"], { cwd: directory });

    assert.equal(doctorRun.exitCode, 2);
    assert.equal(handoff.exitCode, 2);
    assert.match(handoff.stderr, /Cannot hand off: doctor found manual conflicts\. Run atlas doctor first\./);
  });
});

test("doctor rejects --handoff combined with --fix, --json, or an unknown topic", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const withFix = await runCli(["doctor", "--handoff", "context-size", "--fix"], { cwd: directory });
    const withJson = await runCli(["doctor", "--handoff", "context-size", "--json"], { cwd: directory });
    const badTopic = await runCli(["doctor", "--handoff", "memory"], { cwd: directory });

    assert.equal(withFix.exitCode, 2);
    assert.match(withFix.stderr, /Cannot combine --handoff with --fix/);
    assert.equal(withJson.exitCode, 2);
    assert.match(withJson.stderr, /Cannot combine --handoff with --json/);
    assert.equal(badTopic.exitCode, 2);
    assert.match(badTopic.stderr, /Unsupported handoff topic: use --handoff context-size/);
  });
});

test("doctor --json carries context-size details for agent consumption", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const agentsPath = path.join(directory, "AGENTS.md");
    const agents = await readFile(agentsPath, "utf8");
    await writeFile(agentsPath, `${agents}\n${"a".repeat(16000)}\n`);

    const report = await runCli(["doctor", "--json"], { cwd: directory });
    const payload = JSON.parse(report.stdout);
    const contextSize = payload.findings.find((finding) => finding.code === "context-size");

    assert.equal(report.exitCode, 0);
    assert(contextSize);
    assert(Array.isArray(contextSize.details));
    assert(contextSize.details.some((line) => /WARN\s+AGENTS\.md/.test(line)));
    assert(payload.findings.filter((finding) => finding.code !== "context-size").every((finding) => !("details" in finding)));
  });
});

test("init scaffolds every file in the managed-skill manifest", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    for (const [skillName, fileName] of managedSkillFiles) {
      const skillPath = path.join(directory, ".ai/skills", skillName, fileName);
      await stat(skillPath);
    }
  });
});

test("doctor --fix restores the managed compact skill", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/skills/atlas-compact/SKILL.md"), "local edit\n");

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const skill = await readFile(path.join(directory, ".ai/skills/atlas-compact/SKILL.md"), "utf8");

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /\[stale-compact-skill\] \.ai\/skills\/atlas-compact\/SKILL\.md/);
    assert.equal(fix.exitCode, 0);
    assert.match(skill, /name: atlas-compact/);
    assert.doesNotMatch(skill, /local edit/);
  });
});

test("fresh init survives commit and clone with doctor exit 0", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await commitAll(directory, "initialize atlas");

    const cloneParent = await mkdtemp(path.join(tmpdir(), "atlas-clone-"));
    try {
      const clonePath = path.join(cloneParent, "repo");
      await execFileAsync("git", ["clone", directory, clonePath]);

      const doctor = await runCli(["doctor"], { cwd: clonePath });

      assert.equal(doctor.exitCode, 0);
      await stat(path.join(clonePath, ".ai/plans/.gitkeep"));
      await stat(path.join(clonePath, ".ai/research/.gitkeep"));
      await stat(path.join(clonePath, ".ai/results/.gitkeep"));
      await stat(path.join(clonePath, ".ai/decisions/adrs/.gitkeep"));
    } finally {
      await rm(cloneParent, { recursive: true, force: true });
    }
  });
});

test("doctor flags an emptied artifact directory with a fixable gitkeep finding", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await rm(path.join(directory, ".ai/plans/.gitkeep"));

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /\[missing-gitkeep\] \.ai\/plans\/\.gitkeep is missing/);
    assert.equal(fix.exitCode, 0);
    await stat(path.join(directory, ".ai/plans/.gitkeep"));
  });
});

test("doctor never flags a populated directory for gitkeep", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await rm(path.join(directory, ".ai/plans/.gitkeep"));
    await writeFile(path.join(directory, ".ai/plans/roadmap.md"), "# Plan\n");

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(result.stdout, /missing-gitkeep/);
  });
});

test("doctor only manages skill links for configured agent surfaces", async () => {
  await withTempRepo(async (directory) => {
    const config = { ...createDefaultConfig(), agentSurfaces: ["claude"] };
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify(config));

    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const after = await runCli(["doctor"], { cwd: directory });

    assert.equal(fix.exitCode, 0);
    assert.equal(await readlink(path.join(directory, ".claude/skills")), "../.ai/skills");
    await assert.rejects(lstat(path.join(directory, ".agents/skills")), /ENOENT/);
    await assert.rejects(lstat(path.join(directory, ".cursor/skills")), /ENOENT/);
    assert.equal(after.exitCode, 0);
  });
});

test("doctor leaves an existing symlink for an unlisted surface alone", async () => {
  await withTempRepo(async (directory) => {
    const config = { ...createDefaultConfig(), agentSurfaces: ["claude"] };
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify(config));
    await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    await mkdir(path.join(directory, ".cursor"), { recursive: true });
    await symlink("../somewhere-else", path.join(directory, ".cursor/skills"));

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(result.stdout, /\.cursor\/skills/);
    assert.equal(await readlink(path.join(directory, ".cursor/skills")), "../somewhere-else");
  });
});

test("doctor treats legacy configs without setupState or agentSurfaces as valid", async () => {
  await withTempRepo(async (directory) => {
    const { setupState, agentSurfaces, ...legacy } = createDefaultConfig();
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify(legacy));
    await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(result.stdout, /setup-pending/);
    assert.equal(await readlink(path.join(directory, ".claude/skills")), "../.ai/skills");
    assert.equal(await readlink(path.join(directory, ".agents/skills")), "../.ai/skills");
    assert.equal(await readlink(path.join(directory, ".cursor/skills")), "../.ai/skills");
  });
});

test("doctor rejects unknown agent surfaces in config", async () => {
  await withTempRepo(async (directory) => {
    const config = { ...createDefaultConfig(), agentSurfaces: ["claude", "vscode"] };
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, ".ai/config.json"), JSON.stringify(config));

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /agentSurfaces/);
  });
});

test("an explicit custom root scaffolds the workspace, writes the pointer, and doctor discovers it", async () => {
  await withTempRepo(async (directory) => {
    const findings = await collectDoctorFindings(directory, { root: ".workspace" });
    await applyFixes(findings);

    assert.equal(await readFile(path.join(directory, ".atlas"), "utf8"), ".workspace\n");
    const config = JSON.parse(await readFile(path.join(directory, ".workspace/config.json"), "utf8"));
    assert.equal(config.artifactRoot, ".workspace");

    const agents = await readFile(path.join(directory, "AGENTS.md"), "utf8");
    assert.match(agents, /`\.workspace\/config\.json` is the source of truth/);
    assert.doesNotMatch(agents, /\.ai\/config\.json/);
    assert.equal(await readlink(path.join(directory, ".claude/skills")), "../.workspace/skills");

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 0);
    await assert.rejects(stat(path.join(directory, ".ai")), /ENOENT/);
  });
});

test("doctor rewrites a wrong .atlas pointer for an explicit root", async () => {
  await withTempRepo(async (directory) => {
    await writeFile(path.join(directory, ".atlas"), ".elsewhere\n");

    const findings = await collectDoctorFindings(directory, { root: ".workspace" });
    const pointerFinding = findings.find((finding) => finding.code === "wrong-root-pointer");

    assert.ok(pointerFinding);
    assert.equal(pointerFinding.fixable, true);
    await applyFixes(findings);
    assert.equal(await readFile(path.join(directory, ".atlas"), "utf8"), ".workspace\n");
  });
});

test("doctor reports a pointer to a missing workspace as a manual finding", async () => {
  await withTempRepo(async (directory) => {
    await writeFile(path.join(directory, ".atlas"), ".workspace\n");

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /\[broken-root-pointer\]/);
    assert.match(result.stdout, /\.workspace\/config\.json/);
  });
});

test("doctor reports a pointer escaping the repository as a manual finding", async () => {
  await withTempRepo(async (directory) => {
    await writeFile(path.join(directory, ".atlas"), "../outside\n");

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 2);
    assert.match(result.stdout, /\[broken-root-pointer\]/);
    await assert.rejects(stat(path.join(directory, "..", "outside")), /ENOENT/);
  });
});

test("doctor prefers .ai/config.json over the .atlas pointer", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, ".atlas"), ".workspace\n");

    const result = await runCli(["doctor"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(result.stdout, /broken-root-pointer/);
  });
});

test("init --yes no longer implies --force on a dirty worktree", async () => {
  await withTempRepo(async (directory) => {
    await writeFile(path.join(directory, "untracked.txt"), "dirty\n");

    const refused = await runCli(["init", "--yes"], { cwd: directory });

    assert.equal(refused.exitCode, 2);
    assert.match(refused.stderr, /dirty git worktree/);
    await assert.rejects(stat(path.join(directory, ".ai/config.json")), /ENOENT/);

    const forced = await runCli(["init", "--yes", "--force"], { cwd: directory });

    assert.equal(forced.exitCode, 0);
    await stat(path.join(directory, ".ai/config.json"));
  });
});

test("init rejects --root values that are absolute, escaping, empty, or missing", async () => {
  await withTempRepo(async (directory) => {
    const absolute = await runCli(["init", "--root", "/tmp/workspace"], { cwd: directory });
    assert.equal(absolute.exitCode, 2);
    assert.match(absolute.stderr, /--root.*absolute/);

    const escaping = await runCli(["init", "--root", "../outside"], { cwd: directory });
    assert.equal(escaping.exitCode, 2);
    assert.match(escaping.stderr, /--root.*escape/);

    const blank = await runCli(["init", "--root", " "], { cwd: directory });
    assert.equal(blank.exitCode, 2);
    assert.match(blank.stderr, /--root.*empty/);

    const missing = await runCli(["init", "--root"], { cwd: directory });
    assert.equal(missing.exitCode, 2);
    assert.match(missing.stderr, /Missing value for --root/);

    await assert.rejects(stat(path.join(directory, ".ai")), /ENOENT/);
  });
});

test("init --root roots a fresh workspace and the next step derives from it", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["init", "--root", ".workspace"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Root: \.workspace$/m);
    assert.match(result.stdout, /Read \.workspace\/skills\/atlas-setup\/SKILL\.md and follow it/);
    const config = JSON.parse(await readFile(path.join(directory, ".workspace/config.json"), "utf8"));
    assert.equal(config.artifactRoot, ".workspace");
    assert.equal(await readFile(path.join(directory, ".atlas"), "utf8"), ".workspace\n");

    const doctor = await runCli(["doctor"], { cwd: directory });
    assert.equal(doctor.exitCode, 0);
  });
});

test("init keeps the existing workspace root when rerun with a different --root", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const result = await runCli(["init", "--root", ".workspace"], { cwd: directory });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Root: \.ai$/m);
    assert.doesNotMatch(result.stdout, /Root: \.workspace/);
    await assert.rejects(stat(path.join(directory, ".workspace")), /ENOENT/);
  });
});

test("rerunning init on a custom-rooted workspace derives the next step from the pointer", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init", "--root", ".workspace"], { cwd: directory });

    const rerun = await runCli(["init"], { cwd: directory });

    assert.equal(rerun.exitCode, 0);
    assert.match(rerun.stdout, /Already up to date/);
    assert.match(rerun.stdout, /^Root: \.workspace$/m);
    assert.match(rerun.stdout, /Read \.workspace\/skills\/atlas-setup\/SKILL\.md and follow it/);
    assert.doesNotMatch(rerun.stdout, /\.ai\/skills/);
  });
});

test("help documents --root, the --yes/--force split, and the doctor advisory section", async () => {
  const result = await runCli(["--help"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /--root <dir>/);
  assert.match(result.stdout, /--yes[^\n]*\n[^\n]*dirty-worktree/);
  assert.match(result.stdout, /--force[^\n]*dirty/);
  assert.match(result.stdout, /Advisory/);
});

test("init installs the managed review skill", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const skill = await readFile(path.join(directory, ".ai/skills/atlas-review/SKILL.md"), "utf8");

    assert.match(skill, /name: atlas-review/);
    assert.match(skill, /process gate/i);
  });
});

test("doctor --fix restores the managed review skill", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await writeFile(path.join(directory, ".ai/skills/atlas-review/SKILL.md"), "local edit\n");

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const skill = await readFile(path.join(directory, ".ai/skills/atlas-review/SKILL.md"), "utf8");

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /\[stale-review-skill\] \.ai\/skills\/atlas-review\/SKILL\.md/);
    assert.equal(fix.exitCode, 0);
    assert.match(skill, /name: atlas-review/);
    assert.doesNotMatch(skill, /local edit/);
  });
});

test("doctor --fix migrates an old-layout workspace to the prefixed skill directories", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    // Simulate a workspace installed before the rename: managed files live under
    // skills/setup and skills/review, the prefixed directories do not exist yet.
    await mkdir(path.join(directory, ".ai/skills/setup"), { recursive: true });
    await mkdir(path.join(directory, ".ai/skills/review"), { recursive: true });
    await rename(path.join(directory, ".ai/skills/atlas-setup/SKILL.md"), path.join(directory, ".ai/skills/setup/SKILL.md"));
    await rename(
      path.join(directory, ".ai/skills/atlas-setup/customization.md"),
      path.join(directory, ".ai/skills/setup/customization.md")
    );
    await rename(path.join(directory, ".ai/skills/atlas-review/SKILL.md"), path.join(directory, ".ai/skills/review/SKILL.md"));
    await rm(path.join(directory, ".ai/skills/atlas-setup"), { recursive: true });
    await rm(path.join(directory, ".ai/skills/atlas-review"), { recursive: true });

    const before = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const after = await runCli(["doctor"], { cwd: directory });

    assert.equal(before.exitCode, 1);
    assert.match(before.stdout, /\.ai\/skills\/setup\/SKILL\.md should move to \.ai\/skills\/atlas-setup\/SKILL\.md/);
    assert.match(before.stdout, /\.ai\/skills\/setup\/customization\.md should move to \.ai\/skills\/atlas-setup\/customization\.md/);
    assert.match(before.stdout, /\.ai\/skills\/review\/SKILL\.md should move to \.ai\/skills\/atlas-review\/SKILL\.md/);
    assert.equal(fix.exitCode, 0);
    assert.equal(after.exitCode, 0);
    assert.match(await readFile(path.join(directory, ".ai/skills/atlas-setup/SKILL.md"), "utf8"), /name: atlas-setup/);
    assert.match(await readFile(path.join(directory, ".ai/skills/atlas-review/SKILL.md"), "utf8"), /name: atlas-review/);
    await assert.rejects(stat(path.join(directory, ".ai/skills/setup/SKILL.md")), /ENOENT/);
    await assert.rejects(stat(path.join(directory, ".ai/skills/review/SKILL.md")), /ENOENT/);
  });
});

test("doctor reports a legacy skill directory alongside the new one as an advisory and never deletes it", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    await mkdir(path.join(directory, ".ai/skills/setup"), { recursive: true });
    await writeFile(path.join(directory, ".ai/skills/setup/SKILL.md"), "legacy copy\n");

    const report = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(report.exitCode, 0);
    assert.match(report.stdout, /^Advisory:$/m);
    assert.match(report.stdout, /\[legacy-skill-directory\] \.ai\/skills\/setup is superseded by \.ai\/skills\/atlas-setup/);
    assert.match(report.stdout, /delete the legacy directory manually/);
    assert.equal(fix.exitCode, 0);
    assert.equal(await readFile(path.join(directory, ".ai/skills/setup/SKILL.md"), "utf8"), "legacy copy\n");
  });
});
