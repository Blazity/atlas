import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { normalizePath, resolveArtifactPath } from "./config.js";
import { repoPath } from "./repo.js";

export const contextSizeThresholds = {
  rootInstruction: { warn: 8000, overflow: 16000 },
  language: { warn: 12000, overflow: 24000 },
  memory: { warn: 12000, overflow: 24000 },
  decision: { warn: 32000, overflow: 64000 },
  managedSkill: { warn: 32000, overflow: 64000 },
  promptLoadedAggregate: { warn: 40000, overflow: 80000 }
};

const managedSkillFiles = [
  ["atlas-setup", "SKILL.md"],
  ["atlas-setup", "customization.md"],
  ["atlas-review", "SKILL.md"]
];

export async function analyzeContextSizes(repoRoot, config) {
  const candidates = await collectContextFileCandidates(repoRoot, config);
  const entries = [];

  for (const candidate of candidates) {
    const stats = await fileStat(repoRoot, candidate.relativePath);
    if (!stats?.isFile()) {
      continue;
    }

    const content = await readFile(repoPath(repoRoot, candidate.relativePath), "utf8");
    entries.push(classifySize({
      ...candidate,
      characterCount: content.length,
      ...contextSizeThresholds[candidate.thresholdKey]
    }));
  }

  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const promptLoadedEntries = entries.filter((entry) => entry.promptLoaded);
  const aggregate = classifySize({
    relativePath: "prompt-loaded context",
    label: "AGGREGATE prompt-loaded context",
    category: "aggregate",
    thresholdKey: "promptLoadedAggregate",
    promptLoaded: false,
    characterCount: promptLoadedEntries.reduce((sum, entry) => sum + entry.characterCount, 0),
    ...contextSizeThresholds.promptLoadedAggregate
  });

  const riskEntries = entries.filter((entry) => entry.status !== "ok");
  const hasRisk = riskEntries.length > 0 || aggregate.status !== "ok";

  return {
    configPath: normalizePath(path.join(config.artifactRoot, "config.json")),
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
  const lines = report.entries.map(formatEntryLine);
  lines.push(formatEntryLine(report.aggregate));
  lines.push("Remediation: keep root instructions to commands, invariants, and safety rules; move durable detail into configured memory or decisions.");
  lines.push("Thresholds are Atlas heuristics, not model limits.");
  lines.push("Agent handoff: atlas doctor --handoff context-size");
  return lines;
}

export function buildContextSizeHandoffPrompt(report) {
  const riskyEntries = report.entries.filter((entry) => entry.status !== "ok");
  const entries = riskyEntries.length > 0 ? riskyEntries : report.entries;
  const reportLines = [...entries, report.aggregate]
    .filter((entry) => entry.status !== "ok" || entry.category === "aggregate")
    .map((entry) => `- ${formatEntryLine(entry)}`);

  return [
    "Atlas context-size cleanup handoff",
    "",
    "Goal: reduce oversized AI-facing context files while preserving useful repository guidance.",
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
    "- Treat thresholds as Atlas heuristics, not objective model limits.",
    "",
    "After changes, run atlas doctor again and include the before/after context-size output."
  ].join("\n");
}

async function collectContextFileCandidates(repoRoot, config) {
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
  }));

  candidates.push(...await markdownFiles(repoRoot, resolveArtifactPath(config, "decisions"), {
    category: "decision",
    thresholdKey: "decision",
    promptLoaded: false
  }));

  candidates.push(...await markdownFiles(repoRoot, resolveArtifactPath(config, "adrs"), {
    category: "decision",
    thresholdKey: "decision",
    promptLoaded: false
  }));

  const skillsRoot = resolveArtifactPath(config, "skills");
  for (const [skillName, fileName] of managedSkillFiles) {
    candidates.push({
      relativePath: normalizePath(path.join(skillsRoot, skillName, fileName)),
      category: "managed-skill",
      thresholdKey: "managedSkill",
      promptLoaded: false
    });
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

async function markdownFiles(repoRoot, relativeRoot, options) {
  const stats = await fileStat(repoRoot, relativeRoot);
  if (!stats?.isDirectory()) {
    return [];
  }

  const entries = await readdir(repoPath(repoRoot, relativeRoot), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = normalizePath(path.join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      files.push(...await markdownFiles(repoRoot, relativePath, options));
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

function isMarkdownFile(fileName) {
  return /\.md$/iu.test(fileName);
}

function classifySize(entry) {
  const status = entry.characterCount > entry.overflow
    ? "overflow"
    : entry.characterCount > entry.warn
      ? "warn"
      : "ok";
  const threshold = status === "overflow" ? entry.overflow : entry.warn;
  const overBy = status === "ok" ? 0 : entry.characterCount - threshold;

  return {
    ...entry,
    status,
    threshold,
    overBy,
    approximateTokens: Math.ceil(entry.characterCount / 4)
  };
}

function formatEntryLine(entry) {
  const status = entry.status.toUpperCase();
  return `${status} ${entry.label ?? entry.relativePath} - ${formatCharacterSummary(entry)}, threshold ${formatNumber(entry.threshold)}${entry.overBy > 0 ? `, over by ${formatNumber(entry.overBy)}` : ""}`;
}

function formatCharacterSummary(entry) {
  return `${formatNumber(entry.characterCount)} chars (~${formatNumber(entry.approximateTokens)} tokens)`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function pluralize(count, singular, plural) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
