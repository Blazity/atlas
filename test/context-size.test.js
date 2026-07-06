import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDefaultConfig } from "../src/config.js";
import { analyzeContextSizes, buildContextSizeHandoffPrompt, contextSizeDetailLines } from "../src/context-size.js";

async function withTempWorkspace(fn) {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-context-size-"));
  try {
    await fn(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("analyzeContextSizes classifies AI context files by heuristic thresholds", async () => {
  await withTempWorkspace(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai/memory"), { recursive: true });
    await mkdir(path.join(directory, ".ai/decisions/adrs"), { recursive: true });
    await mkdir(path.join(directory, ".ai/skills/atlas-setup"), { recursive: true });
    await mkdir(path.join(directory, ".ai/skills/atlas-review"), { recursive: true });
    await writeFile(path.join(directory, "AGENTS.md"), "a".repeat(16001));
    await writeFile(path.join(directory, "CLAUDE.md"), "@AGENTS.md\n");
    await writeFile(path.join(directory, ".ai/LANGUAGE.md"), "l".repeat(12001));
    await writeFile(path.join(directory, ".ai/memory/product.md"), "# Product\n");
    await writeFile(path.join(directory, ".ai/decisions/adrs/0001-test.md"), "# ADR\n");
    await writeFile(path.join(directory, ".ai/skills/atlas-setup/SKILL.md"), "# Setup\n");
    await writeFile(path.join(directory, ".ai/skills/atlas-setup/customization.md"), "# Customization\n");
    await writeFile(path.join(directory, ".ai/skills/atlas-review/SKILL.md"), "# Review\n");

    const report = await analyzeContextSizes(directory, config);
    const byPath = new Map(report.entries.map((entry) => [entry.relativePath, entry]));

    assert.equal(byPath.get("AGENTS.md").status, "warn");
    assert.equal(byPath.get("AGENTS.md").threshold, 8000);
    assert.equal(byPath.get("AGENTS.md").overBy, 8001);
    assert.equal(byPath.get("AGENTS.md").usagePercent, 49);
    assert.equal(byPath.get("AGENTS.md").usageBar, "[#####     ]  49%");
    assert.equal(byPath.get(".ai/LANGUAGE.md").status, "warn");
    assert.equal(byPath.get(".ai/LANGUAGE.md").threshold, 12000);
    assert.equal(byPath.get(".ai/LANGUAGE.md").overBy, 1);
    assert.equal(byPath.get(".ai/decisions/adrs/0001-test.md").status, "ok");
    assert.equal(report.aggregate.status, "ok");
    assert.equal(report.hasRisk, true);
  });
});

test("context-size details render aligned usage bars for at-risk files only", async () => {
  await withTempWorkspace(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai/memory"), { recursive: true });
    await writeFile(path.join(directory, "AGENTS.md"), "a".repeat(16001));
    await writeFile(path.join(directory, ".ai/LANGUAGE.md"), "# Vocabulary\n");
    await writeFile(path.join(directory, ".ai/memory/product.md"), "# Product\n");

    const lines = contextSizeDetailLines(await analyzeContextSizes(directory, config));

    assert(lines.some((line) => /^WARN {5}AGENTS\.md {11}\[##### {5}\]  49% {2}16,001 chars, 1 line$/.test(line)));
    assert(lines.some((line) => /^OK {7}prompt-loaded total \[### {7}\]  25%/.test(line)));
    assert(lines.includes("2 files within budget"));
    assert(lines.includes("Agent handoff: atlas doctor --handoff context-size"));
    assert(!lines.some((line) => /warn 8,000|overflow 32,768|Basis:/.test(line)));
  });
});

test("analyzeContextSizes resolves configured artifact paths and deduplicates ADRs inside decisions", async () => {
  await withTempWorkspace(async (directory) => {
    const config = {
      ...createDefaultConfig(),
      paths: {
        ...createDefaultConfig().paths,
        language: "VOCAB.md",
        memory: "knowledge",
        decisions: "records",
        adrs: "records/adrs",
        skills: "tools"
      }
    };
    await mkdir(path.join(directory, ".ai/knowledge"), { recursive: true });
    await mkdir(path.join(directory, ".ai/records/adrs"), { recursive: true });
    await mkdir(path.join(directory, ".ai/tools/atlas-setup"), { recursive: true });
    await mkdir(path.join(directory, ".ai/tools/atlas-review"), { recursive: true });
    await writeFile(path.join(directory, "AGENTS.md"), "# Agents\n");
    await writeFile(path.join(directory, ".ai/VOCAB.md"), "# Vocabulary\n");
    await writeFile(path.join(directory, ".ai/knowledge/architecture.md"), "# Architecture\n");
    await writeFile(path.join(directory, ".ai/records/adrs/0001-test.md"), "# ADR\n");
    await writeFile(path.join(directory, ".ai/tools/atlas-setup/SKILL.md"), "# Setup\n");
    await writeFile(path.join(directory, ".ai/tools/atlas-setup/customization.md"), "# Customization\n");
    await writeFile(path.join(directory, ".ai/tools/atlas-review/SKILL.md"), "# Review\n");

    const report = await analyzeContextSizes(directory, config);
    const paths = report.entries.map((entry) => entry.relativePath);

    assert(paths.includes(".ai/VOCAB.md"));
    assert(paths.includes(".ai/knowledge/architecture.md"));
    assert.equal(paths.filter((entry) => entry === ".ai/records/adrs/0001-test.md").length, 1);
  });
});

test("analyzeContextSizes skips files that disappear before read", async () => {
  await withTempWorkspace(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai"), { recursive: true });
    await writeFile(path.join(directory, "AGENTS.md"), "# Agents\n");
    await writeFile(path.join(directory, ".ai/LANGUAGE.md"), "# Vocabulary\n");

    const report = await analyzeContextSizes(directory, config, {
      readContextFile: async (repoRoot, relativePath) => {
        if (relativePath === "AGENTS.md") {
          throw new Error("simulated stat-to-read race");
        }
        return readFile(path.join(repoRoot, relativePath), "utf8");
      }
    });

    assert(!report.entries.some((entry) => entry.relativePath === "AGENTS.md"));
  });
});

test("analyzeContextSizes skips directories that disappear before scan", async () => {
  await withTempWorkspace(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai/memory"), { recursive: true });
    await writeFile(path.join(directory, "AGENTS.md"), "# Agents\n");
    await writeFile(path.join(directory, ".ai/LANGUAGE.md"), "# Vocabulary\n");
    await writeFile(path.join(directory, ".ai/memory/product.md"), "# Product\n");

    const report = await analyzeContextSizes(directory, config, {
      readDirectory: async (absolutePath, options) => {
        if (absolutePath.endsWith(path.join(".ai", "memory"))) {
          throw new Error("simulated stat-to-readdir race");
        }
        return readdir(absolutePath, options);
      }
    });

    assert(report.entries.some((entry) => entry.relativePath === "AGENTS.md"));
    assert(!report.entries.some((entry) => entry.relativePath === ".ai/memory/product.md"));
  });
});

test("buildContextSizeHandoffPrompt preserves safety boundaries", async () => {
  await withTempWorkspace(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai/memory"), { recursive: true });
    await writeFile(path.join(directory, "AGENTS.md"), "a".repeat(16001));
    await writeFile(path.join(directory, ".ai/LANGUAGE.md"), "# Vocabulary\n");
    await writeFile(path.join(directory, ".ai/memory/product.md"), "# Product\n");

    const report = await analyzeContextSizes(directory, config);
    const prompt = buildContextSizeHandoffPrompt(report);

    assert.match(prompt, /AGENTS\.md/);
    assert.match(prompt, /Do not rewrite files silently/);
    assert.match(prompt, /Preserve managed Atlas blocks/);
    assert.match(prompt, /\.ai\/config\.json/);
    assert.match(prompt, /If the atlas-compact skill is available \(\.ai\/skills\/atlas-compact\/SKILL\.md, surfaced to agents as \/atlas-compact\), invoke it with this report/);
  });
});

test("analyzeContextSizes measures the managed compact skill through the shared manifest", async () => {
  await withTempWorkspace(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai/skills/atlas-compact"), { recursive: true });
    await writeFile(path.join(directory, "AGENTS.md"), "# Agents\n");
    await writeFile(path.join(directory, ".ai/skills/atlas-compact/SKILL.md"), "# Compact\n");

    const report = await analyzeContextSizes(directory, config);

    assert(report.entries.some((entry) => entry.relativePath === ".ai/skills/atlas-compact/SKILL.md"));
  });
});

test("line-count guidance warns memory files that stay under the character budget", async () => {
  await withTempWorkspace(async (directory) => {
    const config = createDefaultConfig();
    await mkdir(path.join(directory, ".ai/memory"), { recursive: true });
    await writeFile(path.join(directory, "AGENTS.md"), "# Agents\n");
    await writeFile(path.join(directory, ".ai/memory/lessons.md"), "x\n".repeat(201));

    const report = await analyzeContextSizes(directory, config);
    const lessons = report.entries.find((entry) => entry.relativePath === ".ai/memory/lessons.md");

    assert.equal(lessons.status, "warn");
    assert.equal(lessons.lineOverBy, 1);
    assert(contextSizeDetailLines(report).some((line) => /^WARN {5}\.ai\/memory\/lessons\.md/.test(line)));
  });
});

test("countLines ignores the conventional trailing newline", async () => {
  await withTempWorkspace(async (directory) => {
    const config = createDefaultConfig();
    await writeFile(path.join(directory, "AGENTS.md"), "one\ntwo\nthree\n");

    const report = await analyzeContextSizes(directory, config);
    const agents = report.entries.find((entry) => entry.relativePath === "AGENTS.md");

    assert.equal(agents.lineCount, 3);
  });
});
