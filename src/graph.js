import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { normalizePath, resolveArtifactPath } from "./config.js";
import { readTextIfExists, repoPath } from "./repo.js";

const execFileAsync = promisify(execFile);
const graphMetaFileName = "graph.meta.json";
const defaultStaleCommitThreshold = 50;
const graphScopes = new Set(["code", "code+docs"]);
const graphProvenanceModes = new Set(["extracted", "mixed"]);
const fullCommitShaPattern = /^[0-9a-f]{40}$/u;

export function graphFeatureConfig(config) {
  const graph = config.features?.graph;
  if (!graph || graph.enabled !== true) {
    return { enabled: false };
  }

  return {
    enabled: true,
    path: resolveArtifactPath(config, "graph"),
    staleCommitThreshold: graph.staleCommitThreshold ?? defaultStaleCommitThreshold,
    generator: graph.generator
  };
}

export function parseGraphMeta(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return { ok: false, error: `graph.meta.json is not valid JSON: ${error.message}` };
  }

  const errors = graphMetaErrors(parsed);
  if (errors.length > 0) {
    return { ok: false, error: errors.join("; ") };
  }

  return { ok: true, meta: parsed };
}

export async function collectGraphFindings(repoRoot, config) {
  const graph = graphFeatureConfig(config);
  if (!graph.enabled) {
    return [];
  }

  const graphDirectory = repoPath(repoRoot, graph.path);
  const graphDirectoryKind = await getPathKind(graphDirectory);
  if (graphDirectoryKind.error) {
    return [graphInspectionFailedFinding(graph.path, graphDirectoryKind.error)];
  }
  if (graphDirectoryKind.kind === "missing") {
    return [];
  }
  if (graphDirectoryKind.kind !== "directory") {
    return [advisoryFinding("graph-meta-missing", `${graph.path} exists but is not a directory for graph artifacts`)];
  }

  const directoryEntries = await readGraphDirectory(graphDirectory);
  if (directoryEntries.error) {
    return [graphInspectionFailedFinding(graph.path, directoryEntries.error)];
  }

  const entries = directoryEntries.entries;
  const artifactEntries = entries.filter((entry) => entry.name !== graphMetaFileName);
  const metaPath = normalizePath(path.join(graph.path, graphMetaFileName));
  const metaAbsolutePath = repoPath(repoRoot, metaPath);
  const metaKind = await getPathKind(metaAbsolutePath);
  if (metaKind.error) {
    return [graphInspectionFailedFinding(metaPath, metaKind.error)];
  }
  if (metaKind.kind !== "missing" && metaKind.kind !== "file") {
    return [graphInspectionFailedFinding(metaPath, new Error(`expected file, found ${metaKind.kind}`))];
  }

  const meta = await readGraphMeta(metaAbsolutePath);
  if (meta.error) {
    return [graphInspectionFailedFinding(metaPath, meta.error)];
  }

  const metaContent = meta.content;
  if (metaContent === null) {
    if (artifactEntries.length === 0) {
      return [];
    }
    return [advisoryFinding("graph-meta-missing", `${graph.path} contains graph artifacts but ${metaPath} is missing`)];
  }

  const parsed = parseGraphMeta(metaContent);
  if (!parsed.ok) {
    return [advisoryFinding("graph-meta-invalid", `${metaPath} is not parseable`, [parsed.error])];
  }

  const findings = [];
  const drift = generatorDrift(graph.generator, parsed.meta.generator, metaPath);
  if (drift) {
    findings.push(drift);
  }

  const stale = await staleFinding(repoRoot, graph, parsed.meta, metaPath);
  if (stale) {
    findings.push(stale);
  }

  return findings;
}

function graphMetaErrors(meta) {
  const errors = [];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return ["graph.meta.json must be an object"];
  }
  if (!meta.generator || typeof meta.generator !== "object" || Array.isArray(meta.generator)) {
    errors.push("generator must be an object");
  } else {
    if (typeof meta.generator.name !== "string" || meta.generator.name.trim() === "") {
      errors.push("generator.name must be a non-empty string");
    }
    if (typeof meta.generator.version !== "string" || meta.generator.version.trim() === "") {
      errors.push("generator.version must be a non-empty string");
    }
  }
  if (typeof meta.buildSha !== "string" || !fullCommitShaPattern.test(meta.buildSha)) {
    errors.push("buildSha must be a full 40-character lowercase hex commit SHA");
  }
  if (!graphScopes.has(meta.scope)) {
    errors.push("scope must be one of: code, code+docs");
  }
  if (!graphProvenanceModes.has(meta.provenance)) {
    errors.push("provenance must be one of: extracted, mixed");
  }
  return errors;
}

function generatorDrift(expected, actual, metaPath) {
  if (!expected?.name || !expected?.version) {
    return null;
  }
  if (actual.name === expected.name && actual.version === expected.version) {
    return null;
  }

  const expectedLabel = `${expected.name} ${expected.version}`;
  const actualLabel = `${actual.name} ${actual.version}`;
  return advisoryFinding(
    "graph-generator-drift",
    `${metaPath} records ${actualLabel}; expected ${expectedLabel} from config`,
    [`generator identity mismatch: meta ${actualLabel}; config ${expectedLabel}`]
  );
}

async function staleFinding(repoRoot, graph, meta, metaPath) {
  const count = await commitsBehind(repoRoot, meta.buildSha);
  if (count.unknown) {
    return advisoryFinding("graph-stale", `${metaPath} build SHA is unknown to git`, [
      `${meta.buildSha} is unknown to git; rebuild the graph from this clone.`
    ]);
  }
  if (count.behind <= graph.staleCommitThreshold) {
    return null;
  }
  return advisoryFinding("graph-stale", `${metaPath} is stale`, [
    `${meta.buildSha} is ${count.behind} commits behind HEAD (threshold ${graph.staleCommitThreshold}).`
  ]);
}

async function commitsBehind(repoRoot, buildSha) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-list", "--count", `${buildSha}..HEAD`], { cwd: repoRoot });
    return { unknown: false, behind: Number(stdout.trim()) };
  } catch {
    return { unknown: true, behind: null };
  }
}

function advisoryFinding(code, message, details) {
  return details ? { code, message, severity: "advisory", fixable: false, details } : { code, message, severity: "advisory", fixable: false };
}

async function getPathKind(absolutePath) {
  try {
    const stats = await stat(absolutePath);
    if (stats.isDirectory()) {
      return { kind: "directory" };
    }
    if (stats.isFile()) {
      return { kind: "file" };
    }
    return { kind: "other" };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return { kind: "missing" };
    }
    return { kind: "unknown", error };
  }
}

async function readGraphDirectory(absolutePath) {
  try {
    return { entries: await readdir(absolutePath, { withFileTypes: true }) };
  } catch (error) {
    return { error };
  }
}

async function readGraphMeta(absolutePath) {
  try {
    return { content: await readTextIfExists(absolutePath) };
  } catch (error) {
    return { error };
  }
}

function graphInspectionFailedFinding(relativePath, error) {
  return advisoryFinding("graph-inspection-failed", `${relativePath} could not be inspected`, [errorDetail(error)]);
}

function errorDetail(error) {
  const message = error?.message ?? String(error);
  if (error?.code && !message.includes(error.code)) {
    return `${error.code}: ${message}`;
  }
  return message;
}
