import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { runCli } from "../src/cli.js";
import { createDefaultConfig } from "../src/config.js";
import { parseGraphMeta } from "../src/graph.js";
import { commitAll, createGitRepo } from "./helpers/git.js";

const execFileAsync = promisify(execFile);

async function withTempRepo(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-graph-test-"));
  try {
    await createGitRepo(directory);
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function graphConfig(overrides = {}) {
  const config = createDefaultConfig();
  return {
    ...config,
    setupState: "configured",
    paths: { ...config.paths, graph: "graph" },
    features: {
      graph: {
        enabled: true,
        staleCommitThreshold: 1,
        generator: { name: "graphify", version: "1.2.3" },
        ...overrides
      }
    }
  };
}

async function writeConfig(directory, config) {
  await mkdir(path.join(directory, ".ai"), { recursive: true });
  await writeFile(path.join(directory, ".ai/config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

async function headSha(directory) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: directory });
  return stdout.trim();
}

async function writeGraph(directory, meta) {
  await mkdir(path.join(directory, ".ai/graph"), { recursive: true });
  await writeFile(path.join(directory, ".ai/graph/graph.json"), "{}\n");
  await writeFile(path.join(directory, ".ai/graph/graph.meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
}

function meta(buildSha, overrides = {}) {
  return {
    generator: { name: "graphify", version: "1.2.3" },
    buildSha,
    scope: "code",
    provenance: "extracted",
    ...overrides
  };
}

test("graph meta parser accepts the sidecar contract", () => {
  const parsed = parseGraphMeta(JSON.stringify(meta("0123456789abcdef0123456789abcdef01234567")));

  assert.equal(parsed.ok, true);
  assert.equal(parsed.meta.generator.name, "graphify");
  assert.equal(parsed.meta.generator.version, "1.2.3");
  assert.equal(parsed.meta.scope, "code");
  assert.equal(parsed.meta.provenance, "extracted");
});

test("graph meta parser rejects malformed sidecars", () => {
  const parsed = parseGraphMeta(JSON.stringify({
    generator: { name: "graphify" },
    buildSha: "HEAD",
    scope: "docs",
    provenance: "inferred"
  }));

  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /generator\.version/);
  assert.match(parsed.error, /buildSha/);
  assert.match(parsed.error, /scope/);
  assert.match(parsed.error, /provenance/);
});

test("doctor reports symbolic graph build shas as invalid meta", async () => {
  await withTempRepo(async (directory) => {
    await writeConfig(directory, graphConfig());
    await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    await writeGraph(directory, meta("HEAD"));

    const result = await runCli(["doctor", "--json"], { cwd: directory });
    const finding = JSON.parse(result.stdout).findings.find((candidate) => candidate.code === "graph-meta-invalid");

    assert.equal(result.exitCode, 0);
    assert.equal(finding.severity, "advisory");
    assert(finding.details.some((detail) => /buildSha/.test(detail)));
  });
});

test("repos without the graph feature get no graph findings or graph scaffold", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });

    const doctor = await runCli(["doctor", "--json"], { cwd: directory });
    const payload = JSON.parse(doctor.stdout);

    assert.equal(doctor.exitCode, 0);
    assert(payload.findings.every((finding) => !finding.code.startsWith("graph-")));
    await assert.rejects(stat(path.join(directory, ".ai/skills/atlas-graph/SKILL.md")), /ENOENT/);
    await assert.rejects(stat(path.join(directory, ".ai/graph")), /ENOENT/);
  });
});

test("doctor scaffolds atlas-graph only when the graph feature is enabled", async () => {
  await withTempRepo(async (directory) => {
    await writeConfig(directory, graphConfig());

    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const skill = await readFile(path.join(directory, ".ai/skills/atlas-graph/SKILL.md"), "utf8");

    assert.equal(fix.exitCode, 0);
    assert.match(skill, /name: atlas-graph/);
    assert.match(skill, /graphify/);
    await assert.rejects(stat(path.join(directory, ".ai/graph")), /ENOENT/);
  });
});

test("minimal workspaces can enable only the graph managed skill", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init", "--minimal"], { cwd: directory });
    const configPath = path.join(directory, ".ai/config.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.paths.graph = "graph";
    config.features.graph = {
      enabled: true,
      staleCommitThreshold: 10,
      generator: { name: "graphify", version: "1.2.3" }
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const fix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });

    assert.equal(fix.exitCode, 0);
    assert.match(await readFile(path.join(directory, ".ai/skills/atlas-graph/SKILL.md"), "utf8"), /name: atlas-graph/);
    await assert.rejects(stat(path.join(directory, ".ai/skills/atlas-setup/SKILL.md")), /ENOENT/);
    await assert.rejects(stat(path.join(directory, ".ai/graph")), /ENOENT/);
  });
});

test("doctor reports graph artifacts without a parseable sidecar as advisories", async () => {
  await withTempRepo(async (directory) => {
    await writeConfig(directory, graphConfig());
    await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    await mkdir(path.join(directory, ".ai/graph"), { recursive: true });
    await writeFile(path.join(directory, ".ai/graph/graph.json"), "{}\n");

    const missing = await runCli(["doctor", "--json"], { cwd: directory });
    const missingPayload = JSON.parse(missing.stdout);
    await writeFile(path.join(directory, ".ai/graph/graph.meta.json"), "{invalid\n");
    const invalid = await runCli(["doctor", "--json"], { cwd: directory });
    const invalidPayload = JSON.parse(invalid.stdout);

    assert.equal(missing.exitCode, 0);
    assert(missingPayload.findings.some((finding) => finding.code === "graph-meta-missing" && finding.severity === "advisory"));
    assert.equal(invalid.exitCode, 0);
    assert(invalidPayload.findings.some((finding) => finding.code === "graph-meta-invalid" && finding.severity === "advisory"));
  });
});

test("doctor reports unreadable graph directories as advisories", async () => {
  await withTempRepo(async (directory) => {
    await writeConfig(directory, graphConfig());
    await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const graphDirectory = path.join(directory, ".ai/graph");
    await mkdir(graphDirectory, { recursive: true });

    await chmod(graphDirectory, 0o000);
    try {
      const result = await runCli(["doctor", "--json"], { cwd: directory });
      const payload = JSON.parse(result.stdout);
      const finding = payload.findings.find((candidate) => candidate.code === "graph-inspection-failed");

      assert.equal(result.exitCode, 0);
      assert.equal(payload.classification, "clean");
      assert.equal(finding.severity, "advisory");
      assert.match(finding.message, /\.ai\/graph could not be inspected/);
      assert(finding.details.some((detail) => /EACCES|permission denied/u.test(detail)));
    } finally {
      await chmod(graphDirectory, 0o700);
    }
  });
});

test("doctor reports fresh, stale, unknown-sha, and generator-drift graph states", async () => {
  await withTempRepo(async (directory) => {
    await writeConfig(directory, graphConfig());
    await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    await commitAll(directory, "initialize atlas graph");
    const builtAt = await headSha(directory);
    await writeGraph(directory, meta(builtAt));
    await commitAll(directory, "add repo graph");

    const fresh = await runCli(["doctor", "--json"], { cwd: directory });
    assert.equal(fresh.exitCode, 0);
    assert(JSON.parse(fresh.stdout).findings.every((finding) => !["graph-stale", "graph-generator-drift"].includes(finding.code)));

    await writeFile(path.join(directory, "one.txt"), "one\n");
    await commitAll(directory, "one unrelated commit");
    await writeFile(path.join(directory, "two.txt"), "two\n");
    await commitAll(directory, "two unrelated commits");

    const stale = await runCli(["doctor", "--json"], { cwd: directory });
    const staleFinding = JSON.parse(stale.stdout).findings.find((finding) => finding.code === "graph-stale");
    assert.equal(stale.exitCode, 0);
    assert.equal(staleFinding.severity, "advisory");
    assert(staleFinding.details.some((detail) => /3 commits behind HEAD/.test(detail)));

    await writeGraph(directory, meta("0000000000000000000000000000000000000000"));
    const unknown = await runCli(["doctor", "--json"], { cwd: directory });
    const unknownFinding = JSON.parse(unknown.stdout).findings.find((finding) => finding.code === "graph-stale");
    assert(unknownFinding.details.some((detail) => /unknown to git/.test(detail)));

    const current = await headSha(directory);
    await writeGraph(directory, meta(current, { generator: { name: "graphify", version: "9.9.9" } }));
    const drift = await runCli(["doctor", "--json"], { cwd: directory });
    const driftFinding = JSON.parse(drift.stdout).findings.find((finding) => finding.code === "graph-generator-drift");
    const status = await runCli(["status", "--json"], { cwd: directory });
    const statusPayload = JSON.parse(status.stdout);
    const statusFinding = statusPayload.health.findings.find((finding) => finding.code === "graph-generator-drift");
    assert.equal(drift.exitCode, 0);
    assert.equal(driftFinding.severity, "advisory");
    assert.match(driftFinding.message, /expected graphify 1\.2\.3/);
    assert.equal(status.exitCode, 0);
    assert.equal(statusPayload.health.classification, "clean");
    assert.equal(statusFinding.severity, "advisory");
  });
});

test("doctor reports generator drift when the pinned generator name changes", async () => {
  await withTempRepo(async (directory) => {
    await writeConfig(directory, graphConfig());
    await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    await commitAll(directory, "initialize atlas graph");
    const current = await headSha(directory);
    await writeGraph(directory, meta(current, { generator: { name: "other-graphify", version: "1.2.3" } }));

    const result = await runCli(["doctor", "--json"], { cwd: directory });
    const finding = JSON.parse(result.stdout).findings.find((candidate) => candidate.code === "graph-generator-drift");

    assert.equal(result.exitCode, 0);
    assert.equal(finding.severity, "advisory");
    assert(finding.details.some((detail) => /other-graphify 1\.2\.3/.test(detail) && /graphify 1\.2\.3/.test(detail)));
  });
});

test("doctor reports an orphaned atlas-graph skill when the graph feature is disabled", async () => {
  await withTempRepo(async (directory) => {
    const enabledConfig = graphConfig();
    await writeConfig(directory, enabledConfig);

    const enabledFix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    const skillPath = path.join(directory, ".ai/skills/atlas-graph/SKILL.md");
    await stat(skillPath);

    await writeConfig(directory, {
      ...enabledConfig,
      features: {
        graph: {
          ...enabledConfig.features.graph,
          enabled: false
        }
      }
    });
    const disabledFix = await runCli(["doctor", "--fix", "--force"], { cwd: directory });
    await stat(skillPath);

    await writeFile(path.join(directory, ".ai/LANGUAGE.md"), [
      "# Project Vocabulary",
      "",
      "## Terms",
      "",
      "| Term | Meaning | Avoid |",
      "| --- | --- | --- |",
      "| Atlas | The repository standard | framework |",
      ""
    ].join("\n"));
    await writeFile(path.join(directory, ".ai/memory/product.md"), "# Product\n\nAtlas test memory.\n");

    const plain = await runCli(["doctor"], { cwd: directory });
    const json = await runCli(["doctor", "--json"], { cwd: directory });
    const payload = JSON.parse(json.stdout);
    const orphan = payload.findings.find((finding) => finding.code === "graph-skill-orphaned");
    const lockfile = JSON.parse(await readFile(path.join(directory, ".ai/atlas.lock.json"), "utf8"));

    assert.equal(enabledFix.exitCode, 0);
    assert.equal(disabledFix.exitCode, 0);
    assert.equal(plain.exitCode, 0);
    assert.match(plain.stdout, /^Advisory:$/m);
    assert.match(plain.stdout, /\[graph-skill-orphaned\]/);
    assert.match(plain.stdout, /enable features\.graph or remove \.ai\/skills\/atlas-graph/);
    assert.doesNotMatch(plain.stdout, /customized-skill|stale-graph-skill|missing-graph-skill/);
    assert.equal(json.exitCode, 0);
    assert.equal(payload.classification, "clean");
    assert.equal(orphan.severity, "advisory");
    assert.equal(orphan.fixable, false);
    assert.equal(lockfile.files[".ai/skills/atlas-graph/SKILL.md"], undefined);
  });
});

test("doctor leaves foreign AGENTS.md sections outside the Atlas block untouched", async () => {
  await withTempRepo(async (directory) => {
    await runCli(["init"], { cwd: directory });
    const agentsPath = path.join(directory, "AGENTS.md");
    const withForeignSection = `${await readFile(agentsPath, "utf8")}\n## OpenWiki\n\nOpenWiki-generated guidance.\n`;
    await writeFile(agentsPath, withForeignSection);

    const doctor = await runCli(["doctor"], { cwd: directory });
    const fix = await runCli(["doctor", "--fix"], { cwd: directory });

    assert.equal(doctor.exitCode, 0);
    assert.doesNotMatch(doctor.stdout, /managed-block/);
    assert.equal(fix.exitCode, 0);
    assert.equal(await readFile(agentsPath, "utf8"), withForeignSection);
  });
});
