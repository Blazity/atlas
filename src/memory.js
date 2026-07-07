import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { normalizePath, resolveArtifactPath } from "./config.js";
import { computeLockfileFiles, lockfileContent, lockfileRelativePath, readLockfile, sha256 } from "./lockfile.js";
import { fileExists, repoPath, writeText } from "./repo.js";
import { packageVersion } from "./version.js";

const execFileAsync = promisify(execFile);
const metadataPattern = /^<!--\s*atlas:\s*(.*?)\s*-->$/u;
const metadataStartPattern = /^<!--\s*atlas:/u;
const staleAfterDays = 90;
const nearDuplicateThreshold = 0.82;
const sharedMemoryFileLimitBytes = 1024 * 1024;
const sharedMemoryTreeLimitBytes = 10 * 1024 * 1024;

export async function parseMemoryEntries(repoRoot, config, options = {}) {
  const memoryRoot = resolveArtifactPath(config, "memory");
  const memoryAbsoluteRoot = repoPath(repoRoot, memoryRoot);
  if (!(await isDirectory(memoryAbsoluteRoot))) {
    return [];
  }

  const files = await listFiles(memoryAbsoluteRoot, memoryRoot, {
    includeLocal: options.includeLocal ?? true,
    includeShared: options.includeShared ?? true,
    markdownOnly: true
  });
  const entries = [];

  for (const relativePath of files) {
    const content = await readFile(repoPath(repoRoot, relativePath), "utf8");
    entries.push(...parseMemoryFile(content, relativePath, memoryRoot));
  }

  return entries;
}

export async function collectMemoryFindings(repoRoot, config, lockfile, options = {}) {
  const entries = await parseMemoryEntries(repoRoot, config);
  return [
    ...await memoryLifecycleFindings(repoRoot, entries, options),
    ...await sharedMemoryFindings(repoRoot, config, lockfile)
  ];
}

export async function pullSharedMemory(repoRoot, config, root, options = {}) {
  const sharedConfig = config.memory?.shared;
  if (!sharedConfig) {
    return { ok: false, error: "memory.shared is not configured in the Atlas config." };
  }

  const execGit = async (args, execOptions) => (options.execFile ?? execFileAsync)("git", args, execOptions);
  const tempRoot = await mkdtemp(path.join(tmpdir(), "atlas-memory-pull-"));
  const checkoutPath = path.join(tempRoot, "source");
  const sharedRelativePath = normalizePath(path.join(resolveArtifactPath(config, "memory"), "shared"));
  const sharedAbsolutePath = repoPath(repoRoot, sharedRelativePath);
  const sharedParentPath = path.dirname(sharedAbsolutePath);
  const stagedSharedPath = path.join(sharedParentPath, `.shared-staging-${process.pid}-${Date.now()}`);

  try {
    await mkdir(checkoutPath, { recursive: true });
    await execGit(["init", "--quiet"], { cwd: checkoutPath });
    await execGit(["remote", "add", "origin", "--", sharedConfig.source], { cwd: checkoutPath });
    await execGit(["fetch", "--quiet", "origin", "--", sharedConfig.ref], { cwd: checkoutPath });
    await execGit(["switch", "--quiet", "--detach", "--", sharedConfig.pin], { cwd: checkoutPath });

    const sourceRoot = await findSourceMemoryRoot(checkoutPath);
    if (!sourceRoot) {
      return { ok: false, error: "shared memory source must contain .ai/memory or memory" };
    }
    await mkdir(stagedSharedPath, { recursive: true });
    const copied = await copyMemoryFiles(sourceRoot, stagedSharedPath);

    const previous = await readLockfile(repoRoot, root);
    const files = await computeLockfileFiles(repoRoot, config, previous);
    const shared = {
      source: sharedConfig.source,
      ref: sharedConfig.ref,
      pin: sharedConfig.pin,
      files: Object.fromEntries(copied.files.map((file) => [file.relativePath, { sha256: file.sha256 }]))
    };
    const nextLockfileContent = lockfileContent(packageVersion, files, { memory: { shared } });
    await replaceSharedMemoryTree(sharedAbsolutePath, stagedSharedPath, async () => {
      await writeText(repoPath(repoRoot, lockfileRelativePath(root)), nextLockfileContent);
    });

    return {
      ok: true,
      fileCount: copied.files.length,
      skippedNonMarkdownCount: copied.skippedNonMarkdownCount,
      skippedSymlinkCount: copied.skippedSymlinkCount,
      relativePath: sharedRelativePath,
      pin: sharedConfig.pin
    };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    await rm(stagedSharedPath, { recursive: true, force: true });
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function replaceSharedMemoryTree(targetPath, stagedPath, writeLockfile) {
  const backupPath = `${targetPath}.backup-${process.pid}-${Date.now()}`;
  let backupCreated = false;
  let stagedInstalled = false;

  try {
    await rm(backupPath, { recursive: true, force: true });
    if (await isDirectory(targetPath)) {
      await rename(targetPath, backupPath);
      backupCreated = true;
    } else {
      await rm(targetPath, { recursive: true, force: true });
    }

    await rename(stagedPath, targetPath);
    stagedInstalled = true;
    await writeLockfile();

    if (backupCreated) {
      await rm(backupPath, { recursive: true, force: true });
      backupCreated = false;
    }
  } catch (error) {
    if (stagedInstalled) {
      await rm(targetPath, { recursive: true, force: true });
    }
    if (backupCreated) {
      await rename(backupPath, targetPath);
    }
    throw error;
  }
}

export async function proposeOrgMemory(repoRoot, config) {
  const memoryRoot = resolveArtifactPath(config, "memory");
  const proposalRoot = normalizePath(path.join(resolveArtifactPath(config, "results"), "memory-proposal"));
  const proposalMemoryRoot = normalizePath(path.join(proposalRoot, "memory"));
  const entries = (await parseMemoryEntries(repoRoot, config, { includeLocal: false, includeShared: false }))
    .filter((entry) => entry.metadataPresent && entry.scope === "org");

  await rm(repoPath(repoRoot, proposalRoot), { recursive: true, force: true });
  if (entries.length === 0) {
    return { entryCount: 0, relativePath: proposalRoot };
  }

  const grouped = new Map();
  for (const entry of entries) {
    const relativeToMemory = normalizePath(path.relative(memoryRoot, entry.relativePath));
    const target = normalizePath(path.join(proposalMemoryRoot, relativeToMemory));
    grouped.set(target, [...(grouped.get(target) ?? []), entry.rawSection.trimEnd()]);
  }

  for (const [relativePath, sections] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    await mkdir(path.dirname(repoPath(repoRoot, relativePath)), { recursive: true });
    await writeText(repoPath(repoRoot, relativePath), `${sections.join("\n\n")}\n`);
  }

  await mkdir(repoPath(repoRoot, proposalRoot), { recursive: true });
  await writeText(repoPath(repoRoot, path.join(proposalRoot, "README.md")), [
    "# Memory Proposal",
    "",
    "Copy the files under `memory/` into the shared memory repository and review them as a normal branch diff.",
    "Each exported entry is marked `scope=org` in its Atlas metadata.",
    ""
  ].join("\n"));

  return { entryCount: entries.length, relativePath: proposalRoot };
}

function parseMemoryFile(content, relativePath, memoryRoot) {
  const lines = content.split("\n");
  const entries = [];
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (isFenceLine(lines[index])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const heading = parseHeading(lines[index]);
    if (!heading || heading.level === 1) {
      continue;
    }

    const nextHeadingIndex = findNextPeerHeading(lines, index + 1, heading.level);
    const metadataLine = lines[index + 1] ?? "";
    const metadataMatch = metadataLine.match(metadataPattern);
    const metadataStarts = metadataStartPattern.test(metadataLine);
    const metadata = metadataMatch ? parseMetadata(metadataMatch[1]) : {};
    const metadataPresent = Boolean(metadataMatch || metadataStarts);
    const metadataMalformed = metadataStarts && !metadataMatch;
    const bodyStart = metadataPresent ? index + 2 : index + 1;
    const sectionLines = lines.slice(index, nextHeadingIndex);
    const bodyLines = lines.slice(bodyStart, nextHeadingIndex);
    const id = stringValue(metadata.id);

    entries.push({
      id,
      heading: heading.text,
      level: heading.level,
      relativePath,
      relativeToMemory: normalizePath(path.relative(memoryRoot, relativePath)),
      line: index + 1,
      metadata,
      metadataPresent,
      metadataMalformed,
      metadataLine: metadataPresent ? index + 2 : null,
      verified: stringValue(metadata.verified),
      cites: parseCites(metadata.cites),
      scope: stringValue(metadata.scope) ?? "repo",
      source: stringValue(metadata.source),
      supersededBy: stringValue(metadata["superseded-by"]),
      rawSection: sectionLines.join("\n"),
      body: bodyLines.join("\n").trim(),
      normalizedText: normalizeEntryText(`${heading.text}\n${bodyLines.join("\n")}`)
    });

    index = nextHeadingIndex - 1;
  }

  return entries;
}

async function memoryLifecycleFindings(repoRoot, entries, options = {}) {
  const findings = [];
  const malformedEntries = entries.filter((entry) => entry.metadataMalformed);
  const managedEntries = entries.filter((entry) => entry.metadataPresent && !entry.metadataMalformed);
  const entriesById = new Map();
  for (const entry of managedEntries) {
    if (entry.id && !entriesById.has(entry.id)) {
      entriesById.set(entry.id, entry);
    }
  }

  for (const entry of malformedEntries) {
    findings.push(advisoryFinding(
      "malformed-memory-metadata",
      `memory entry ${entryLabel(entry)} has malformed Atlas metadata — close the comment or remove it`,
      [`${entry.relativePath}:${entry.metadataLine}`]
    ));
  }

  for (const finding of duplicateIdFindings(managedEntries)) {
    findings.push(finding);
  }
  for (const finding of duplicateFindings(managedEntries, options)) {
    findings.push(finding);
  }

  for (const entry of managedEntries) {
    if (isStale(entry.verified)) {
      findings.push(advisoryFinding(
        "stale-memory",
        `memory entry ${entryLabel(entry)} was verified on ${entry.verified} — re-verify it or remove the verified metadata`,
        [entryLocation(entry)]
      ));
    }

    const missingCites = [];
    for (const cite of entry.cites) {
      if (await citationMissing(repoRoot, cite)) {
        missingCites.push(cite);
      }
    }
    if (missingCites.length > 0) {
      findings.push(advisoryFinding(
        "broken-citation",
        `memory entry ${entryLabel(entry)} cites missing repo paths — update or remove the cites metadata`,
        [entryLocation(entry), ...missingCites.map((cite) => `missing: ${cite}`)]
      ));
    }

    if (entry.supersededBy && !entriesById.has(entry.supersededBy)) {
      findings.push(advisoryFinding(
        "dangling-supersede",
        `memory entry ${entryLabel(entry)} points superseded-by at unknown memory id ${entry.supersededBy} — update the id or remove the link`,
        [entryLocation(entry)]
      ));
    }
  }

  return findings;
}

function duplicateFindings(entries, options = {}) {
  const findings = [];
  const comparableEntries = entries
    .map((entry) => ({ entry, profile: normalizedTokenProfile(entry.normalizedText) }))
    .filter(({ profile }) => profile.total > 0);
  const tokenFrequencies = duplicateTokenFrequencies(comparableEntries);
  const bucketedEntries = comparableEntries.map((candidate, index) => ({
    ...candidate,
    index,
    prefixTokens: duplicatePrefixTokens(candidate.profile, tokenFrequencies)
  }));
  const candidatePairs = duplicateCandidatePairs(bucketedEntries);

  for (const [leftIndex, rightIndex] of candidatePairs) {
    const left = bucketedEntries[leftIndex];
    const right = bucketedEntries[rightIndex];
    options.onDuplicateComparison?.(left.entry, right.entry);
    const similarity = left.entry.normalizedText === right.entry.normalizedText
      ? 1
      : normalizedSimilarity(left.profile, right.profile);
    if (similarity < nearDuplicateThreshold) {
      continue;
    }

    findings.push(advisoryFinding(
      "duplicate-memory-entry",
      `memory entries ${entryLabel(left.entry)} and ${entryLabel(right.entry)} are near duplicates — merge them or supersede one entry`,
      [entryLocation(left.entry), entryLocation(right.entry), `similarity: ${similarity.toFixed(2)}`]
    ));
  }

  return findings;
}

function duplicateTokenFrequencies(entries) {
  const frequencies = new Map();
  for (const { profile } of entries) {
    for (const token of profile.counts.keys()) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }
  return frequencies;
}

function duplicatePrefixTokens(profile, tokenFrequencies) {
  const tokens = [];
  for (const [token, count] of profile.counts.entries()) {
    for (let index = 0; index < count; index += 1) {
      tokens.push(token);
    }
  }
  tokens.sort((left, right) => {
    const frequencyDifference = (tokenFrequencies.get(left) ?? 0) - (tokenFrequencies.get(right) ?? 0);
    return frequencyDifference || left.localeCompare(right);
  });

  return [...new Set(tokens.slice(0, duplicatePrefixLength(profile.total)))];
}

function duplicatePrefixLength(total) {
  const shortestComparableTotal = Math.max(1, Math.ceil((nearDuplicateThreshold * total) / (2 - nearDuplicateThreshold)));
  const minimumOverlap = Math.ceil((nearDuplicateThreshold * (total + shortestComparableTotal)) / 2);
  return Math.max(1, total - minimumOverlap + 1);
}

function duplicateCandidatePairs(entries) {
  const buckets = new Map();
  const seenPairs = new Set();
  const pairs = [];

  for (const right of entries) {
    const candidateIndexes = new Set();
    for (const token of right.prefixTokens) {
      for (const leftIndex of buckets.get(token) ?? []) {
        candidateIndexes.add(leftIndex);
      }
    }

    for (const leftIndex of [...candidateIndexes].sort((left, right) => left - right)) {
      const left = entries[leftIndex];
      if (!canReachNearDuplicateThreshold(left.profile.total, right.profile.total)) {
        continue;
      }

      const pairKey = `${left.index}:${right.index}`;
      if (seenPairs.has(pairKey)) {
        continue;
      }
      seenPairs.add(pairKey);
      pairs.push([left.index, right.index]);
    }

    for (const token of right.prefixTokens) {
      const bucket = buckets.get(token) ?? [];
      bucket.push(right.index);
      buckets.set(token, bucket);
    }
  }

  return pairs.sort(([leftIndex, leftRightIndex], [rightIndex, rightRightIndex]) => (
    leftIndex - rightIndex || leftRightIndex - rightRightIndex
  ));
}

function canReachNearDuplicateThreshold(leftTotal, rightTotal) {
  return (2 * Math.min(leftTotal, rightTotal)) / (leftTotal + rightTotal) >= nearDuplicateThreshold;
}

function duplicateIdFindings(entries) {
  const findings = [];
  const byId = new Map();

  for (const entry of entries) {
    if (!entry.id) {
      continue;
    }
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      continue;
    }

    findings.push(advisoryFinding(
      "duplicate-memory-id",
      `memory id ${entry.id} is used by multiple entries — rename one id before relying on superseded-by links`,
      [entryLocation(existing), entryLocation(entry)]
    ));
  }

  return findings;
}

async function sharedMemoryFindings(repoRoot, config, lockfile) {
  const sharedConfig = config.memory?.shared;
  if (!sharedConfig || lockfile?.error) {
    return [];
  }

  const baseline = lockfile?.memory?.shared;
  const findings = [];
  if (!baseline) {
    findings.push(advisoryFinding(
      "shared-memory-behind",
      "shared memory is configured but has not been pulled — run atlas memory pull"
    ));
    return findings;
  }

  if (baseline.pin !== sharedConfig.pin) {
    findings.push(advisoryFinding(
      "shared-memory-behind",
      `shared memory was pulled at ${baseline.pin}, but config pins ${sharedConfig.pin} — run atlas memory pull`
    ));
  }

  const sharedRelativePath = normalizePath(path.join(resolveArtifactPath(config, "memory"), "shared"));
  const sharedAbsolutePath = repoPath(repoRoot, sharedRelativePath);
  const currentFiles = await hashFiles(sharedAbsolutePath);
  const details = [];
  const baselineFiles = baseline.files ?? {};

  for (const [relativePath, entry] of Object.entries(baselineFiles)) {
    if (!currentFiles.has(relativePath)) {
      details.push(`missing: ${normalizePath(path.join(sharedRelativePath, relativePath))}`);
    } else if (currentFiles.get(relativePath) !== entry.sha256) {
      details.push(`changed: ${normalizePath(path.join(sharedRelativePath, relativePath))}`);
    }
  }

  for (const relativePath of currentFiles.keys()) {
    if (!baselineFiles[relativePath]) {
      details.push(`untracked: ${normalizePath(path.join(sharedRelativePath, relativePath))}`);
    }
  }

  if (details.length > 0) {
    findings.push(advisoryFinding(
      "shared-memory-edited",
      "shared memory differs from the recorded pin — rerun atlas memory pull or move local changes into committed memory",
      details.sort()
    ));
  }

  return findings;
}

async function findSourceMemoryRoot(checkoutPath) {
  for (const candidate of [".ai/memory", "memory"]) {
    const absolutePath = path.join(checkoutPath, candidate);
    if (await isDirectory(absolutePath)) {
      return absolutePath;
    }
  }
  return null;
}

async function copyMemoryFiles(sourceRoot, targetRoot) {
  const sourceFiles = await listVendoredMemoryFiles(sourceRoot, ".");
  let totalBytes = 0;
  for (const relativePath of sourceFiles.files) {
    const { size } = await stat(path.join(sourceRoot, relativePath));
    if (size > sharedMemoryFileLimitBytes) {
      throw new Error(`${normalizePath(relativePath)} exceeds the 1 MiB shared memory file limit`);
    }
    totalBytes += size;
    if (totalBytes > sharedMemoryTreeLimitBytes) {
      throw new Error("shared memory tree exceeds the 10 MiB limit");
    }
  }

  const copied = [];

  for (const relativePath of sourceFiles.files) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const targetPath = path.join(targetRoot, relativePath);
    const content = await readFile(sourcePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
    copied.push({ relativePath: normalizePath(relativePath), sha256: sha256(content) });
  }

  return {
    files: copied.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    skippedNonMarkdownCount: sourceFiles.skippedNonMarkdownCount,
    skippedSymlinkCount: sourceFiles.skippedSymlinkCount
  };
}

async function hashFiles(absoluteRoot) {
  const hashes = new Map();
  if (!(await isDirectory(absoluteRoot))) {
    return hashes;
  }

  for (const relativePath of await listFiles(absoluteRoot, ".")) {
    const content = await readFile(path.join(absoluteRoot, relativePath));
    hashes.set(normalizePath(relativePath), sha256(content));
  }

  return hashes;
}

async function listVendoredMemoryFiles(absoluteRoot, relativeRoot) {
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const result = { files: [], skippedNonMarkdownCount: 0, skippedSymlinkCount: 0 };

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === ".git" || entry.name === ".DS_Store") {
      continue;
    }

    const absolutePath = path.join(absoluteRoot, entry.name);
    const relativePath = normalizePath(path.join(relativeRoot, entry.name));
    const relativeParts = relativePath.split("/");
    if (relativeParts.includes("local") || relativeParts.includes("shared")) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      result.skippedSymlinkCount += 1;
    } else if (entry.isDirectory()) {
      const nested = await listVendoredMemoryFiles(absolutePath, relativePath);
      result.files.push(...nested.files);
      result.skippedNonMarkdownCount += nested.skippedNonMarkdownCount;
      result.skippedSymlinkCount += nested.skippedSymlinkCount;
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".md")) {
        result.files.push(relativePath);
      } else {
        result.skippedNonMarkdownCount += 1;
      }
    }
  }

  result.files.sort();
  return result;
}

async function listFiles(absoluteRoot, relativeRoot, options = {}) {
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === ".git" || entry.name === ".DS_Store") {
      continue;
    }

    const absolutePath = path.join(absoluteRoot, entry.name);
    const relativePath = normalizePath(path.join(relativeRoot, entry.name));
    const relativeParts = relativePath.split("/");
    if (options.includeLocal === false && relativeParts.includes("local")) {
      continue;
    }
    if (options.includeShared === false && relativeParts.includes("shared")) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath, options));
    } else if (entry.isFile()) {
      if (options.markdownOnly && !entry.name.endsWith(".md")) {
        continue;
      }
      files.push(relativePath);
    }
  }

  return files.sort();
}

function parseHeading(line) {
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line);
  if (!match) {
    return null;
  }
  return { level: match[1].length, text: match[2].trim() };
}

function findNextPeerHeading(lines, startIndex, level) {
  let inFence = false;
  for (let index = startIndex; index < lines.length; index += 1) {
    if (isFenceLine(lines[index])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const heading = parseHeading(lines[index]);
    if (heading && heading.level <= level) {
      return index;
    }
  }
  return lines.length;
}

function isFenceLine(line) {
  return /^\s*```/u.test(line);
}

function parseMetadata(raw) {
  const metadata = {};
  for (const match of raw.matchAll(/([a-z][a-z0-9-]*)=([^\s]+)/giu)) {
    metadata[match[1]] = match[2];
  }
  return metadata;
}

function parseCites(value) {
  if (typeof value !== "string") {
    return [];
  }
  return value.split(",").map((cite) => cite.trim()).filter(Boolean);
}

function normalizeEntryText(value) {
  return value
    .toLowerCase()
    .replace(metadataPattern, " ")
    .replace(/`{3}[\s\S]*?`{3}/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function normalizedTokenProfile(value) {
  let total = 0;
  const counts = new Map();
  for (const token of value.split(" ")) {
    if (!token) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
    total += 1;
  }
  return { counts, total };
}

function normalizedSimilarity(left, right) {
  if (left.total === 0 || right.total === 0) {
    return 0;
  }

  let overlap = 0;
  for (const [token, count] of left.counts.entries()) {
    overlap += Math.min(count, right.counts.get(token) ?? 0);
  }
  return (2 * overlap) / (left.total + right.total);
}

function isStale(verified) {
  if (!verified || !/^\d{4}-\d{2}-\d{2}$/u.test(verified)) {
    return false;
  }
  const verifiedTime = Date.parse(`${verified}T00:00:00.000Z`);
  if (Number.isNaN(verifiedTime)) {
    return false;
  }
  const ageMs = Date.now() - verifiedTime;
  return ageMs > staleAfterDays * 24 * 60 * 60 * 1000;
}

async function citationMissing(repoRoot, cite) {
  if (path.isAbsolute(cite) || citeEscapesRepo(cite)) {
    return true;
  }
  return !(await fileExists(repoPath(repoRoot, cite)));
}

function citeEscapesRepo(cite) {
  const normalized = path.posix.normalize(normalizePath(cite));
  return normalized === ".." || normalized.startsWith("../");
}

async function isDirectory(absolutePath) {
  try {
    return (await stat(absolutePath)).isDirectory();
  } catch {
    return false;
  }
}

function entryLabel(entry) {
  return entry.id ?? `"${entry.heading}"`;
}

function entryLocation(entry) {
  return `${entry.relativePath}:${entry.line}`;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function advisoryFinding(code, message, details = undefined) {
  return details && details.length > 0
    ? { code, message, severity: "advisory", fixable: false, details }
    : { code, message, severity: "advisory", fixable: false };
}
