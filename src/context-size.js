import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { normalizePath, resolveArtifactPath } from "./config.js";
import { isFeatureEnabled } from "./features.js";
import { repoPath } from "./repo.js";
import { managedSkillFiles } from "./templates.js";

export const contextSizeThresholds = {
  rootInstruction: { warn: 8000, warnLines: 200, overflow: 32768 },
  language: { warn: 12000, warnLines: 200, overflow: 25000 },
  memory: { warn: 12000, warnLines: 200, overflow: 25000 },
  decision: { warn: 32000, overflow: 64000 },
  managedSkill: { warn: 32000, overflow: 64000 },
  promptLoadedAggregate: { warn: 32768, overflow: 64000 }
};

const usageBarWidth = 10;
const thresholdBasis = "Basis: Codex reads project docs up to a 32 KiB byte cap by default, and Claude Code auto memory loads at most the first 200 lines or 25KB of its memory file at startup; sizes here are character counts, slightly below byte counts for non-ASCII text.";

export async function analyzeContextSizes(repoRoot, config, options = {}) {
  const readContextFile = options.readContextFile ?? defaultReadContextFile;
  const readDirectory = options.readDirectory ?? defaultReadDirectory;
  const candidates = await collectContextFileCandidates(repoRoot, config, { readDirectory });
  const entries = [];

  for (const candidate of candidates) {
    const stats = await fileStat(repoRoot, candidate.relativePath);
    if (!stats?.isFile()) {
      continue;
    }

    let content;
    try {
      content = await readContextFile(repoRoot, candidate.relativePath);
    } catch {
      continue;
    }
    if (typeof content !== "string") {
      continue;
    }

    entries.push(classifySize({
      ...candidate,
      characterCount: content.length,
      lineCount: countLines(content),
      ...contextSizeThresholds[candidate.thresholdKey]
    }));
  }

  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const promptLoadedEntries = entries.filter((entry) => entry.promptLoaded);
  const aggregate = classifySize({
    relativePath: "prompt-loaded context",
    label: "prompt-loaded total",
    category: "aggregate",
    thresholdKey: "promptLoadedAggregate",
    promptLoaded: false,
    characterCount: promptLoadedEntries.reduce((sum, entry) => sum + entry.characterCount, 0),
    lineCount: promptLoadedEntries.reduce((sum, entry) => sum + entry.lineCount, 0),
    ...contextSizeThresholds.promptLoadedAggregate
  });

  const riskEntries = entries.filter((entry) => entry.status !== "ok");
  const hasRisk = riskEntries.length > 0 || aggregate.status !== "ok";

  return {
    configPath: normalizePath(path.join(config.artifactRoot, "config.json")),
    compactSkillPath: normalizePath(path.join(resolveArtifactPath(config, "skills"), "atlas-compact", "SKILL.md")),
    entries,
    aggregate,
    hasRisk,
    riskEntries,
    overflowCount: riskEntries.filter((entry) => entry.status === "overflow").length + (aggregate.status === "overflow" ? 1 : 0),
    warningCount: riskEntries.filter((entry) => entry.status === "warn").length + (aggregate.status === "warn" ? 1 : 0)
  };
}

export function contextSizeFinding(report) {
  if (!report.hasRisk) {
    return null;
  }

  return {
    code: "context-size",
    message: `AI context size risk: ${pluralize(report.overflowCount, "overflow", "overflows")}, ${pluralize(report.warningCount, "warning", "warnings")}; prompt-loaded ${formatCharacterSummary(report.aggregate)}`,
    severity: "advisory",
    fixable: false,
    details: contextSizeDetailLines(report)
  };
}

export function contextSizeDetailLines(report) {
  const displayed = [...report.riskEntries, report.aggregate];
  const lines = formatEntryTable(displayed);
  const okCount = report.entries.length - report.riskEntries.length;
  if (okCount > 0) {
    lines.push(`${pluralize(okCount, "file", "files")} within budget`);
  }
  lines.push("Remediation: keep root instructions lean; move durable detail into configured memory or decisions.");
  lines.push("Agent handoff: atlas doctor --handoff context-size");
  return lines;
}

export function buildContextSizeHandoffPrompt(report) {
  const riskyEntries = report.entries.filter((entry) => entry.status !== "ok");
  const entries = riskyEntries.length > 0 ? riskyEntries : report.entries;
  const displayed = [...entries, report.aggregate]
    .filter((entry) => entry.status !== "ok" || entry.category === "aggregate");
  const reportLines = formatEntryTable(displayed).map((line) => `- ${line}`);

  return [
    "Atlas context-size cleanup handoff",
    "",
    "Goal: reduce oversized AI-facing context files while preserving useful repository guidance.",
    "",
    `If the atlas-compact skill is available (${report.compactSkillPath}, surfaced to agents as /atlas-compact), invoke it with this report instead of following the inline guidance below.`,
    "",
    `Read ${report.configPath} first and resolve artifact paths through it.`,
    "Do not rewrite files silently. Propose a compaction plan before editing.",
    "Preserve managed Atlas blocks, user rules, commands, and safety boundaries.",
    "Do not hand-edit managed Atlas skill files; if a managed skill is oversized, report it as package-maintenance work.",
    "",
    "Current context-size report:",
    ...reportLines,
    "",
    "Remediation guidance:",
    "- Keep root instructions focused on commands, invariants, and safety rules.",
    "- Move durable product, architecture, stack, and lesson detail into configured memory files.",
    "- Move decisions and rationale into configured decisions or ADR paths.",
    `- ${thresholdBasis}`,
    "- Treat thresholds as Atlas heuristics that combine documented agent caps with conservative adherence guidance.",
    "",
    "After changes, run atlas doctor again and include the before/after context-size output."
  ].join("\n");
}

export async function collectContextFileCandidates(repoRoot, config, io) {
  const candidates = [
    rootCandidate("AGENTS.md"),
    rootCandidate("CLAUDE.md"),
    {
      relativePath: resolveArtifactPath(config, "language"),
      category: "language",
      thresholdKey: "language",
      promptLoaded: true
    }
  ];

  candidates.push(...await markdownFiles(repoRoot, resolveArtifactPath(config, "memory"), {
    category: "memory",
    thresholdKey: "memory",
    promptLoaded: true
  }, io));

  if (isFeatureEnabled(config, "decisions")) {
    candidates.push(...await markdownFiles(repoRoot, resolveArtifactPath(config, "decisions"), {
      category: "decision",
      thresholdKey: "decision",
      promptLoaded: false
    }, io));

    candidates.push(...await markdownFiles(repoRoot, resolveArtifactPath(config, "adrs"), {
      category: "decision",
      thresholdKey: "decision",
      promptLoaded: false
    }, io));
  }

  if (isFeatureEnabled(config, "managedSkills")) {
    const skillsRoot = resolveArtifactPath(config, "skills");
    for (const [skillName, fileName] of managedSkillFiles) {
      candidates.push({
        relativePath: normalizePath(path.join(skillsRoot, skillName, fileName)),
        category: "managed-skill",
        thresholdKey: "managedSkill",
        promptLoaded: false
      });
    }
  }

  return dedupeCandidates(candidates);
}

function rootCandidate(relativePath) {
  return {
    relativePath,
    category: "root-instruction",
    thresholdKey: "rootInstruction",
    promptLoaded: true
  };
}

async function markdownFiles(repoRoot, relativeRoot, options, io) {
  const stats = await fileStat(repoRoot, relativeRoot);
  if (!stats?.isDirectory()) {
    return [];
  }

  let entries;
  try {
    entries = await io.readDirectory(repoPath(repoRoot, relativeRoot), { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const relativePath = normalizePath(path.join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      files.push(...await markdownFiles(repoRoot, relativePath, options, io));
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      files.push({ relativePath, ...options });
    }
  }
  return files;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];
  for (const candidate of candidates) {
    const relativePath = normalizePath(candidate.relativePath);
    if (seen.has(relativePath)) {
      continue;
    }
    seen.add(relativePath);
    deduped.push({ ...candidate, relativePath });
  }
  return deduped;
}

async function fileStat(repoRoot, relativePath) {
  try {
    return await stat(repoPath(repoRoot, relativePath));
  } catch {
    return null;
  }
}

async function defaultReadContextFile(repoRoot, relativePath) {
  return readFile(repoPath(repoRoot, relativePath), "utf8");
}

async function defaultReadDirectory(absolutePath, options) {
  return readdir(absolutePath, options);
}

function isMarkdownFile(fileName) {
  return /\.md$/iu.test(fileName);
}

function classifySize(entry) {
  const lineOverBy = entry.warnLines && entry.lineCount > entry.warnLines
    ? entry.lineCount - entry.warnLines
    : 0;
  const status = entry.characterCount > entry.overflow
    ? "overflow"
    : entry.characterCount > entry.warn || lineOverBy > 0
      ? "warn"
      : "ok";
  const threshold = status === "overflow" ? entry.overflow : entry.warn;
  const overBy = status === "ok" || entry.characterCount <= threshold ? 0 : entry.characterCount - threshold;

  return {
    ...entry,
    status,
    threshold,
    overBy,
    lineOverBy,
    usagePercent: usagePercent(entry.characterCount, entry.overflow),
    usageBar: formatUsageBar(entry.characterCount, entry.overflow),
    approximateTokens: Math.ceil(entry.characterCount / 4)
  };
}

// One aligned row per entry; padding is computed across the displayed set so
// every bar starts in the same column regardless of file-name length.
function formatEntryTable(entries) {
  const nameWidth = Math.max(...entries.map((entry) => entryName(entry).length));
  return entries.map((entry) =>
    `${entry.status.toUpperCase().padEnd(8)} ${entryName(entry).padEnd(nameWidth)} ${entry.usageBar}  ${formatNumber(entry.characterCount)} chars, ${formatLineSummary(entry.lineCount)}`);
}

function entryName(entry) {
  return entry.label ?? entry.relativePath;
}

function formatCharacterSummary(entry) {
  return `${formatNumber(entry.characterCount)} chars (~${formatNumber(entry.approximateTokens)} tokens)`;
}

function formatLineSummary(lineCount) {
  return `${formatNumber(lineCount)} ${lineCount === 1 ? "line" : "lines"}`;
}

function formatUsageBar(characterCount, overflow) {
  const filled = Math.min(usageBarWidth, Math.round((characterCount / overflow) * usageBarWidth));
  const bar = `${"#".repeat(filled)}${" ".repeat(usageBarWidth - filled)}`;
  return `[${bar}] ${String(usagePercent(characterCount, overflow)).padStart(3)}%`;
}

function usagePercent(characterCount, overflow) {
  return Math.round((characterCount / overflow) * 100);
}

function countLines(content) {
  if (!content) {
    return 0;
  }
  const lines = content.split("\n").length;
  return content.endsWith("\n") ? lines - 1 : lines;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function pluralize(count, singular, plural) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
