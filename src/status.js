import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { normalizePath, resolveArtifactPath, configPath } from "./config.js";
import {
  classifyFindings,
  collectDoctorFindings,
  discoverWorkspaceRoot,
  findingSeverity,
  loadConfig
} from "./doctor.js";
import { repoPath } from "./repo.js";
import { compareVersions, packageVersion, parseVersion } from "./version.js";
import { makeTheme } from "./ui/theme.js";

const execFileAsync = promisify(execFile);
const initCommand = "npx --yes @blazity-atlas/core@latest init";
const invalidConfigIdentityNote = "Identity fields are unknown because .ai/config.json is invalid.";
const gitLogDatePrefix = "ATLAS_STATUS_DATE ";
const defaultIo = { execFile: execFileAsync, readFile, readdir, stat };
const artifactDefinitions = [
  { key: "plans", label: "Plans", pathKeys: ["plans"] },
  { key: "research", label: "Research", pathKeys: ["research"] },
  { key: "decisionsAdrs", label: "Decisions/ADRs", pathKeys: ["decisions", "adrs"] },
  { key: "results", label: "Results", pathKeys: ["results"] },
  { key: "memory", label: "Memory", pathKeys: ["memory"], ignoreReadme: true },
  { key: "language", label: "Language", pathKeys: ["language"] }
];

export async function runStatus({ cwd = process.cwd(), json = false, color = false, io: injectedIo = {}, memoryEntryProvider } = {}) {
  const io = { ...defaultIo, ...injectedIo };
  const report = await collectStatus(cwd, { io, memoryEntryProvider });
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(report, null, 2)}\n` : formatStatusReport(report, { color }),
    stderr: ""
  };
}

export async function collectStatus(repoRoot, { io = defaultIo, memoryEntryProvider } = {}) {
  const discovered = await discoverWorkspaceRoot(repoRoot);
  if (await isUninitializedWorkspace(repoRoot, discovered, io)) {
    return uninitializedReport(discovered.root);
  }

  const diagnostics = {};
  const findings = await collectDoctorFindings(repoRoot, { diagnostics });
  const loaded = rootEscapesRepo(discovered.root)
    ? null
    : await loadConfig(repoRoot, { root: discovered.root });
  const configReady = loaded?.exists && loaded.errors.length === 0;
  const artifactGitDates = configReady
    ? await collectArtifactGitDates(repoRoot, loaded.config, io)
    : emptyArtifactGitDates();
  const artifacts = configReady
    ? await collectArtifactSummaries(repoRoot, loaded.config, io, artifactGitDates)
    : emptyArtifacts();
  const memoryFreshness = configReady
    ? await collectMemoryFreshness(repoRoot, loaded.config, artifacts.memory, { io, memoryEntryProvider, artifactGitDates })
    : emptyMemoryFreshness();

  return {
    initialized: true,
    identity: identityFromLoadedConfig(discovered.root, loaded),
    health: healthFromFindings(findings),
    artifacts,
    memoryFreshness,
    contextBudgets: contextBudgetsFromReport(diagnostics.contextSizeReport),
    lastReviewVerdict: configReady
      ? await collectLastReviewVerdict(repoRoot, artifacts.results, io)
      : null
  };
}

export function formatStatusReport(report, { color = false } = {}) {
  if (!report.initialized) {
    return [
      statusHeading({ color }),
      "",
      report.message,
      `Run: ${report.initCommand}`,
      ""
    ].join("\n");
  }

  return [
    statusHeading({ color }),
    "",
    sectionHeading("Identity", { color }),
    `  Template: ${formatIdentityValue(report.identity.template, report.identity)}`,
    `  Workspace root: ${formatValue(report.identity.workspaceRoot)}`,
    `  Atlas version: ${formatIdentityValue(report.identity.atlasVersion, report.identity)} (CLI ${report.identity.cliVersion}, ${report.identity.versionStatus})`,
    `  Setup state: ${formatIdentityValue(report.identity.setupState, report.identity)}`,
    "",
    sectionHeading("Health", { color }),
    `  Classification: ${report.health.classification}`,
    `  Findings: ${report.health.counts.manual} manual, ${report.health.counts.fixable} fixable, ${report.health.counts.advisory} advisory`,
    "",
    sectionHeading("Artifacts", { color }),
    ...Object.values(report.artifacts).map(formatArtifactSummary),
    "",
    sectionHeading("Memory Freshness", { color }),
    `  Files: ${formatCount(report.memoryFreshness.fileCount, "file")}`,
    `  Date range: ${formatDateRange(report.memoryFreshness)}`,
    `  Last memory commit: ${formatValue(report.memoryFreshness.lastCommitDate)}`,
    `  Entry metadata: ${report.memoryFreshness.entryMetadata.provider}`,
    "",
    sectionHeading("Context Budgets", { color }),
    ...formatContextBudgetLines(report.contextBudgets),
    "",
    sectionHeading("Last Review Verdict", { color }),
    `  ${formatLastReviewVerdict(report.lastReviewVerdict)}`,
    ""
  ].join("\n");
}

function statusHeading({ color }) {
  if (!color) {
    return "Atlas status";
  }
  const theme = makeTheme({ color });
  return `${theme.orange("▲ ATLAS")} ${theme.dim("status")}`;
}

function sectionHeading(text, { color }) {
  if (!color) {
    return `${text}:`;
  }
  return makeTheme({ color }).blue(`${text}:`);
}

async function isUninitializedWorkspace(repoRoot, discovered, io) {
  if (discovered.source === "pointer") {
    return false;
  }
  return !(await safeStat(configPath(repoRoot, discovered.root), io));
}

function uninitializedReport(workspaceRoot) {
  return {
    initialized: false,
    message: "Atlas is not set up in this repository.",
    initCommand,
    identity: {
      template: null,
      workspaceRoot,
      atlasVersion: null,
      cliVersion: packageVersion,
      versionStatus: "unknown",
      setupState: null
    },
    health: {
      classification: "not-initialized",
      counts: emptySeverityCounts(),
      findings: []
    },
    artifacts: emptyArtifacts(),
    memoryFreshness: emptyMemoryFreshness(),
    contextBudgets: emptyContextBudgets(),
    lastReviewVerdict: null
  };
}

function identityFromLoadedConfig(workspaceRoot, loaded) {
  if (loaded?.fallbackReason === "invalid-json") {
    return {
      template: null,
      workspaceRoot,
      atlasVersion: null,
      cliVersion: packageVersion,
      versionStatus: "unknown",
      setupState: null,
      note: invalidConfigIdentityNote
    };
  }

  const config = loaded?.exists ? loaded.config : null;
  const stamp = config?.atlasVersion ?? null;
  return {
    template: config?.template ?? null,
    workspaceRoot,
    atlasVersion: stamp,
    cliVersion: packageVersion,
    versionStatus: versionStatus(stamp),
    setupState: config?.setupState ?? null
  };
}

function versionStatus(stamp) {
  if (!stamp || !parseVersion(stamp)) {
    return "unknown";
  }
  const comparison = compareVersions(packageVersion, stamp);
  if (comparison === 0) {
    return "current";
  }
  return comparison > 0 ? "workspace-behind" : "workspace-ahead";
}

function healthFromFindings(findings) {
  const counts = emptySeverityCounts();
  for (const finding of findings) {
    counts[findingSeverity(finding)] += 1;
    counts.total += 1;
  }
  return {
    classification: classifyFindings(findings),
    counts,
    findings: findings.map(({ code, message, severity, fixable, details }) =>
      details ? { code, message, severity, fixable, details } : { code, message, severity, fixable })
  };
}

function emptySeverityCounts() {
  return { manual: 0, fixable: 0, advisory: 0, total: 0 };
}

async function collectArtifactSummaries(repoRoot, config, io, artifactGitDates) {
  const entries = [];
  for (const definition of artifactDefinitions) {
    entries.push([definition.key, await collectArtifactSummary(repoRoot, config, definition, io, artifactGitDates)]);
  }
  return Object.fromEntries(entries);
}

async function collectArtifactSummary(repoRoot, config, definition, io, artifactGitDates) {
  const paths = definition.pathKeys.map((key) => normalizePath(resolveArtifactPath(config, key)));
  const byPath = new Map();

  for (const artifactPath of paths) {
    for (const file of await collectFiles(repoRoot, artifactPath, io)) {
      if (shouldIgnoreArtifactFile(file.relativePath, definition)) {
        continue;
      }
      byPath.set(file.relativePath, file);
    }
  }

  const files = [];
  for (const file of [...byPath.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    files.push({
      path: file.relativePath,
      date: dateForFile(file, artifactGitDates)
    });
  }

  files.sort((left, right) => left.date.localeCompare(right.date) || left.path.localeCompare(right.path));
  const oldest = files[0] ?? null;
  const newest = files[files.length - 1] ?? null;

  return {
    label: definition.label,
    paths,
    fileCount: files.length,
    oldestDate: oldest?.date ?? null,
    newestDate: newest?.date ?? null,
    oldestPath: oldest?.path ?? null,
    newestPath: newest?.path ?? null,
    files
  };
}

async function collectFiles(repoRoot, artifactPath, io) {
  const absolutePath = repoPath(repoRoot, artifactPath);
  const stats = await safeStat(absolutePath, io);
  if (!stats) {
    return [];
  }
  if (stats.isFile()) {
    return [{ absolutePath, relativePath: displayPath(repoRoot, absolutePath), stats }];
  }
  if (!stats.isDirectory()) {
    return [];
  }
  return walkFiles(repoRoot, absolutePath, io);
}

async function walkFiles(repoRoot, absoluteRoot, io) {
  let entries;
  try {
    entries = await io.readdir(absoluteRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(absoluteRoot, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(repoRoot, absolutePath, io));
    } else if (entry.isFile()) {
      const stats = await safeStat(absolutePath, io);
      if (stats) {
        files.push({ absolutePath, relativePath: displayPath(repoRoot, absolutePath), stats });
      }
    }
  }
  return files;
}

function shouldIgnoreArtifactFile(filePath, definition) {
  const basename = path.basename(filePath);
  return basename === ".gitkeep" || basename === ".gitignore" || (definition.ignoreReadme && basename === "README.md");
}

function dateForFile(file, artifactGitDates) {
  return artifactGitDates.fileDates.get(file.relativePath) ?? dateOnly(file.stats.mtime);
}

async function collectMemoryFreshness(repoRoot, config, memoryArtifact, { io, memoryEntryProvider, artifactGitDates }) {
  const memoryPath = normalizePath(resolveArtifactPath(config, "memory"));
  const provider = memoryEntryProvider ?? countsOnlyMemoryEntryProvider;
  return {
    path: memoryPath,
    fileCount: memoryArtifact.fileCount,
    oldestDate: memoryArtifact.oldestDate,
    newestDate: memoryArtifact.newestDate,
    lastCommitDate: artifactGitDates.pathDates.get(memoryPath) ?? memoryArtifact.newestDate,
    entryMetadata: await provider({ repoRoot, config, files: memoryArtifact.files, io })
  };
}

async function countsOnlyMemoryEntryProvider() {
  return {
    provider: "counts-only",
    parsed: false,
    supported: false,
    note: "Entry-level memory metadata is not parsed yet."
  };
}

function contextBudgetsFromReport(report) {
  if (!report) {
    return emptyContextBudgets();
  }
  const entries = report.riskEntries.map(contextBudgetEntry);
  if (report.aggregate.status !== "ok") {
    entries.push(contextBudgetEntry(report.aggregate));
  }
  return {
    hasRisk: report.hasRisk,
    warningCount: report.warningCount,
    overflowCount: report.overflowCount,
    entries,
    aggregate: contextBudgetEntry(report.aggregate)
  };
}

function contextBudgetEntry(entry) {
  return {
    path: entry.label ?? entry.relativePath,
    status: entry.status,
    usageBar: entry.usageBar,
    usagePercent: entry.usagePercent,
    characterCount: entry.characterCount,
    lineCount: entry.lineCount,
    overBy: entry.overBy,
    lineOverBy: entry.lineOverBy
  };
}

async function collectLastReviewVerdict(repoRoot, resultsArtifact, io) {
  const newest = resultsArtifact.files[resultsArtifact.files.length - 1];
  if (!newest) {
    return null;
  }
  const content = await readText(repoPath(repoRoot, newest.path), io);
  return {
    path: newest.path,
    date: newest.date,
    verdict: parseVerdict(content)
  };
}

function parseVerdict(content) {
  if (!content) {
    return null;
  }
  const match = /^\s*[-*]?\s*(?:\*\*)?(?:status|verdict)(?:\*\*)?\s*:\s*(.+?)\s*$/imu.exec(content);
  return match ? stripMarkdown(match[1]) : null;
}

function stripMarkdown(value) {
  return value.replaceAll("**", "").replaceAll("`", "").trim() || null;
}

function emptyArtifacts() {
  return Object.fromEntries(artifactDefinitions.map((definition) => [definition.key, {
    label: definition.label,
    paths: [],
    fileCount: 0,
    oldestDate: null,
    newestDate: null,
    oldestPath: null,
    newestPath: null,
    files: []
  }]));
}

function emptyArtifactGitDates() {
  return {
    fileDates: new Map(),
    pathDates: new Map()
  };
}

function emptyMemoryFreshness() {
  return {
    path: null,
    fileCount: 0,
    oldestDate: null,
    newestDate: null,
    lastCommitDate: null,
    entryMetadata: {
      provider: "counts-only",
      parsed: false,
      supported: false,
      note: "Entry-level memory metadata is not parsed yet."
    }
  };
}

function emptyContextBudgets() {
  return {
    hasRisk: false,
    warningCount: 0,
    overflowCount: 0,
    entries: [],
    aggregate: null
  };
}

async function collectArtifactGitDates(repoRoot, config, io) {
  const paths = artifactDefinitions.flatMap((definition) =>
    definition.pathKeys.map((key) => normalizePath(resolveArtifactPath(config, key))));
  return gitLastCommitDates(repoRoot, paths, io);
}

async function gitLastCommitDates(repoRoot, candidatePaths, io) {
  const gitPaths = [...new Set(candidatePaths.map((candidatePath) => gitRelativePath(repoRoot, candidatePath)).filter(Boolean))];
  if (gitPaths.length === 0) {
    return emptyArtifactGitDates();
  }

  try {
    const { stdout } = await io.execFile("git", ["log", `--format=${gitLogDatePrefix}%cs`, "--name-only", "--", ...gitPaths], { cwd: repoRoot });
    return parseGitLogDates(stdout, gitPaths);
  } catch {
    return emptyArtifactGitDates();
  }
}

function parseGitLogDates(stdout, gitPaths) {
  const dates = emptyArtifactGitDates();
  let currentDate = null;

  for (const line of stdout.split("\n")) {
    if (line.startsWith(gitLogDatePrefix)) {
      const date = line.slice(gitLogDatePrefix.length).trim();
      currentDate = /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : null;
      continue;
    }

    const filePath = normalizePath(line.trim());
    if (!currentDate || !filePath) {
      continue;
    }

    if (!dates.fileDates.has(filePath)) {
      dates.fileDates.set(filePath, currentDate);
    }
    for (const gitPath of gitPaths) {
      if (!dates.pathDates.has(gitPath) && pathMatchesGitPath(filePath, gitPath)) {
        dates.pathDates.set(gitPath, currentDate);
      }
    }
  }

  return dates;
}

function pathMatchesGitPath(filePath, gitPath) {
  return gitPath === "." || filePath === gitPath || filePath.startsWith(`${gitPath}/`);
}

function gitRelativePath(repoRoot, candidatePath) {
  if (!path.isAbsolute(candidatePath)) {
    return normalizePath(candidatePath);
  }
  const relative = path.relative(repoRoot, candidatePath);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return normalizePath(relative);
}

async function safeStat(absolutePath, io) {
  try {
    return await io.stat(absolutePath);
  } catch {
    return null;
  }
}

async function readText(absolutePath, io) {
  try {
    return await io.readFile(absolutePath, "utf8");
  } catch {
    return null;
  }
}

function displayPath(repoRoot, absolutePath) {
  const relative = path.relative(repoRoot, absolutePath);
  if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    return normalizePath(relative);
  }
  return normalizePath(absolutePath);
}

function rootEscapesRepo(root) {
  if (path.isAbsolute(root)) {
    return true;
  }
  const normalized = path.posix.normalize(normalizePath(root));
  return normalized === ".." || normalized.startsWith("../");
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function formatArtifactSummary(artifact) {
  return `  ${artifact.label}: ${formatCount(artifact.fileCount, "file")} (${formatDateRange(artifact)})`;
}

function formatContextBudgetLines(contextBudgets) {
  if (contextBudgets.entries.length === 0) {
    return ["  No files over threshold."];
  }
  return contextBudgets.entries.map((entry) =>
    `  ${entry.status.toUpperCase().padEnd(8)} ${entry.path} ${entry.usageBar} ${formatNumber(entry.characterCount)} chars, ${formatCount(entry.lineCount, "line")}`);
}

function formatLastReviewVerdict(lastReviewVerdict) {
  if (!lastReviewVerdict) {
    return "No result artifacts found.";
  }
  const verdict = lastReviewVerdict.verdict ?? "unknown verdict";
  return `${verdict} - ${lastReviewVerdict.path} (${lastReviewVerdict.date})`;
}

function formatDateRange(summary) {
  if (!summary.oldestDate && !summary.newestDate) {
    return "no dated files";
  }
  if (summary.oldestDate === summary.newestDate) {
    return summary.newestDate;
  }
  return `${summary.oldestDate} to ${summary.newestDate}`;
}

function formatValue(value) {
  return value ?? "unknown";
}

function formatIdentityValue(value, identity) {
  if (value !== null && value !== undefined) {
    return value;
  }
  return identity.note === invalidConfigIdentityNote ? "unknown (invalid config)" : "unknown";
}

function formatCount(count, noun) {
  return `${formatNumber(count)} ${count === 1 ? noun : `${noun}s`}`;
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}
