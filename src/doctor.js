import { lstat, mkdir, readdir, readFile, readlink, stat } from "node:fs/promises";
import path from "node:path";

import { applyAction } from "./actions.js";
import {
  configPath,
  createConfigForTemplate,
  normalizePath,
  resolveAliasDestination,
  resolveArtifactPath,
  validateConfig
} from "./config.js";
import { analyzeContextSizes, contextSizeFinding } from "./context-size.js";
import { collectGraphFindings, graphFeatureConfig } from "./graph.js";
import {
  baselineEntry,
  computeLockfileFiles,
  lockfileContent,
  lockfileRelativePath,
  managedFileRelativePath,
  readLockfile,
  sha256
} from "./lockfile.js";
import { applyManagedBlock, inspectManagedBlock } from "./managed-blocks.js";
import { fileExists, readTextIfExists, repoPath, writeText } from "./repo.js";
import { compareVersions, packageVersion, parseVersion } from "./version.js";
import {
  agentManagedBlock,
  defaultCompactSkillMd,
  defaultCustomizationMd,
  defaultClaudeMd,
  defaultConfigJson,
  defaultGraphSkillMd,
  defaultLanguageMd,
  defaultReviewSkillMd,
  defaultSetupSkillMd,
  defaultMemoryReadme,
  managedBlockId,
  managedSkillFilesForConfig,
  packagedSkillFileContent
} from "./templates.js";

const defaultRoot = ".ai";
const rootPointerFile = ".atlas";
const agentSurfaceLinks = {
  claude: ".claude/skills",
  agents: ".agents/skills",
  cursor: ".cursor/skills"
};
const gitkeepDirectoryKeys = ["plans", "research", "results", "adrs"];

export async function discoverWorkspaceRoot(repoRoot) {
  if (await fileExists(configPath(repoRoot))) {
    return { root: defaultRoot, source: "default" };
  }

  const pointer = await readTextIfExists(repoPath(repoRoot, rootPointerFile));
  if (pointer !== null) {
    return { root: normalizePath(pointer.split("\n")[0].trim()), source: "pointer" };
  }

  return { root: defaultRoot, source: "default" };
}

export async function loadConfig(repoRoot, options = {}) {
  const root = options.root ?? (await discoverWorkspaceRoot(repoRoot)).root;
  const filePath = configPath(repoRoot, root);
  if (!(await fileExists(filePath))) {
    return { config: createConfigForTemplate(options.templateName ?? "standard", root), exists: false, errors: [], root };
  }

  try {
    const config = JSON.parse(await readFile(filePath, "utf8"));
    const validation = validateConfig(config);
    return { config, exists: true, errors: validation.errors, root };
  } catch (error) {
    return {
      config: createConfigForTemplate(options.templateName ?? "standard", root),
      exists: true,
      errors: [`config is not valid JSON: ${error.message}`],
      root
    };
  }
}

export async function collectDoctorFindings(repoRoot, options = {}) {
  const findings = [];
  const discovered = await discoverWorkspaceRoot(repoRoot);
  const root = options.root ?? discovered.root;
  const rootIsFromPointer = options.root === undefined && discovered.source === "pointer";

  if (rootIsFromPointer && rootEscapesRepo(root)) {
    findings.push(manualFinding("broken-root-pointer", `${rootPointerFile} points to ${root}, which escapes the repository root`));
    return findings;
  }

  const loaded = await loadConfig(repoRoot, { ...options, root });
  const config = loaded.config;
  const configRelativePath = normalizePath(path.join(root, "config.json"));

  if (!loaded.exists) {
    if (rootIsFromPointer) {
      findings.push(manualFinding("broken-root-pointer", `${rootPointerFile} points to ${root}, but ${configRelativePath} is missing`));
      return findings;
    }
    findings.push(fixableFinding("missing-config", `${configRelativePath} is missing`, writeConfigAction(repoRoot, options.templateName, root)));
  }

  for (const error of loaded.errors) {
    findings.push(manualFinding("invalid-config", error));
  }

  if (loaded.errors.length > 0) {
    return findings;
  }

  if (loaded.exists) {
    addVersionStampFindings(config, findings);
  }

  const lockfile = await readLockfile(repoRoot, root);
  if (lockfile.error) {
    findings.push(manualFinding("invalid-lockfile", `${lockfileRelativePath(root)} is not valid JSON: ${lockfile.error}`));
  } else if (loaded.exists && !lockfile.exists) {
    findings.push(fixableFinding("missing-lockfile", `${lockfileRelativePath(root)} is missing — it records managed-skill baselines`, {
      type: "write",
      relativePath: lockfileRelativePath(root),
      absolutePath: repoPath(repoRoot, lockfileRelativePath(root)),
      content: lockfileContent(packageVersion, await computeLockfileFiles(repoRoot, config, lockfile))
    }));
  }

  await addRootPointerFindings(repoRoot, root, findings);
  await addRequiredArtifactFindings(repoRoot, config, findings);
  await addGitkeepFindings(repoRoot, config, findings);
  // Legacy moves must precede the managed-skill findings: applyFixes runs in
  // array order, so a legacy file is relocated before any managed write lands
  // on the new path (a write-first order would trip the move overwrite guard).
  await addLegacySkillMigrationFindings(repoRoot, config, findings);
  await addMaintenanceSkillFindings(repoRoot, config, findings, { lockfile, resetSkills: Boolean(options.resetSkills) });
  await addManagedFileFindings(repoRoot, root, config, findings);
  await addSkillLinkFindings(repoRoot, config, findings);
  await addPlaceholderFindings(repoRoot, config, findings);
  await addAliasFindings(repoRoot, config, findings);
  await addSemanticHealthFindings(repoRoot, config, findings);
  await addGraphFindings(repoRoot, config, findings);
  await addContextSizeFindings(repoRoot, config, findings, options.diagnostics);

  return findings;
}

export async function applyFixes(findings) {
  for (const finding of findings) {
    if (finding.fixable && finding.action) {
      await applyAction(finding.action);
    }
  }
}

// Stamp maintenance and lockfile baselines run after every successful mutation
// (init and doctor --fix), so the workspace always records which package
// version last wrote it and which managed-file contents it installed.
export async function finalizeWorkspaceMetadata(repoRoot) {
  const loaded = await loadConfig(repoRoot);
  if (!loaded.exists || loaded.errors.length > 0) {
    return;
  }

  if (loaded.config.atlasVersion !== packageVersion) {
    const { schemaVersion, atlasVersion, ...rest } = loaded.config;
    const next = { schemaVersion, atlasVersion: packageVersion, ...rest };
    await writeText(configPath(repoRoot, loaded.root), `${JSON.stringify(next, null, 2)}\n`);
  }

  const previous = await readLockfile(repoRoot, loaded.root);
  if (previous.error) {
    return;
  }
  const files = await computeLockfileFiles(repoRoot, loaded.config, previous);
  const content = lockfileContent(packageVersion, files);
  const absolutePath = repoPath(repoRoot, lockfileRelativePath(loaded.root));
  if ((await readTextIfExists(absolutePath)) !== content) {
    await writeText(absolutePath, content);
  }
}

// Records the current content of every managed skill file as its baseline, so
// deliberate customizations stop reporting as customized-skill advisories.
export async function adoptSkills(repoRoot) {
  const loaded = await loadConfig(repoRoot);
  // An unreadable config falls back to template defaults, which would compute
  // baselines against the wrong root — refuse instead of guessing.
  if (!loaded.exists || loaded.errors.length > 0) {
    return null;
  }
  const adopted = [];
  const files = {};

  for (const [skillName, fileName] of managedSkillFilesForConfig(loaded.config)) {
    const relativePath = managedFileRelativePath(loaded.config, skillName, fileName);
    const current = await readTextIfExists(repoPath(repoRoot, relativePath));
    if (current === null) {
      continue;
    }
    const packaged = packagedSkillFileContent(skillName, fileName);
    files[relativePath] = { sha256: sha256(current), packaged: sha256(packaged) };
    if (current !== packaged) {
      adopted.push(relativePath);
    }
  }

  const absolutePath = repoPath(repoRoot, lockfileRelativePath(loaded.root));
  await writeText(absolutePath, lockfileContent(packageVersion, files));
  return adopted;
}

function addVersionStampFindings(config, findings) {
  const stamp = config.atlasVersion;
  if (stamp === undefined || !parseVersion(stamp)) {
    return;
  }

  const comparison = compareVersions(packageVersion, stamp);
  if (comparison > 0) {
    findings.push(advisoryFinding(
      "atlas-version-behind",
      `workspace was last written by Atlas ${stamp}; running ${packageVersion} — run atlas doctor --fix to update managed files and the stamp`
    ));
  } else if (comparison < 0) {
    findings.push(manualFinding(
      "atlas-version-ahead",
      `workspace was written by Atlas ${stamp}, newer than the running CLI ${packageVersion} — upgrade the CLI; fixing with an older version would revert newer managed content (--force overrides)`
    ));
  }
}

export function findingSeverity(finding) {
  return finding.severity ?? (finding.fixable ? "fixable" : "manual");
}

export function classifyFindings(findings) {
  if (findings.some((finding) => findingSeverity(finding) === "manual")) {
    return "manual";
  }
  if (findings.some((finding) => findingSeverity(finding) === "fixable")) {
    return "fixable";
  }
  return "clean";
}

async function addRootPointerFindings(repoRoot, root, findings) {
  if (normalizePath(root) === defaultRoot) {
    return;
  }

  const absolutePath = repoPath(repoRoot, rootPointerFile);
  const expectedContent = `${normalizePath(root)}\n`;
  const currentContent = await readTextIfExists(absolutePath);
  if (currentContent === expectedContent) {
    return;
  }

  const code = currentContent === null ? "missing-root-pointer" : "wrong-root-pointer";
  const message = currentContent === null
    ? `${rootPointerFile} root pointer is missing`
    : `${rootPointerFile} points to ${currentContent.split("\n")[0].trim()}, expected ${normalizePath(root)}`;
  findings.push(fixableFinding(code, message, {
    type: "write",
    relativePath: rootPointerFile,
    absolutePath,
    content: expectedContent
  }));
}

async function addRequiredArtifactFindings(repoRoot, config, findings) {
  const directoryKeys = ["memory", "plans", "research", "decisions", "adrs", "results", "skills"];
  for (const key of directoryKeys) {
    const relativePath = resolveArtifactPath(config, key);
    const absolutePath = repoPath(repoRoot, relativePath);
    const kind = await getPathKind(absolutePath);
    if (kind === "missing") {
      findings.push(fixableFinding("missing-directory", `${relativePath} is missing`, {
        type: "mkdir",
        relativePath,
        absolutePath
      }));
    } else if (kind !== "directory") {
      findings.push(manualFinding("directory-collision", `${relativePath} exists but is not a directory`));
    }
  }

  const languagePath = resolveArtifactPath(config, "language");
  const languageKind = await getPathKind(repoPath(repoRoot, languagePath));
  if (languageKind === "missing") {
    findings.push(fixableFinding("missing-language", `${languagePath} is missing`, {
      type: "write",
      relativePath: languagePath,
      absolutePath: repoPath(repoRoot, languagePath),
      content: `${defaultLanguageMd()}\n`
    }));
  } else if (languageKind !== "file") {
    findings.push(manualFinding("file-collision", `${languagePath} exists but is not a file`));
  }

  const memoryReadme = path.join(resolveArtifactPath(config, "memory"), "README.md");
  const memoryReadmeKind = await getPathKind(repoPath(repoRoot, memoryReadme));
  if (memoryReadmeKind === "missing") {
    findings.push(fixableFinding("missing-memory-readme", `${memoryReadme} is missing`, {
      type: "write",
      relativePath: memoryReadme,
      absolutePath: repoPath(repoRoot, memoryReadme),
      content: `${defaultMemoryReadme()}\n`
    }));
  } else if (memoryReadmeKind !== "file") {
    findings.push(manualFinding("file-collision", `${memoryReadme} exists but is not a file`));
  }
}

async function addGitkeepFindings(repoRoot, config, findings) {
  for (const key of gitkeepDirectoryKeys) {
    const relativePath = resolveArtifactPath(config, key);
    const absolutePath = repoPath(repoRoot, relativePath);
    const kind = await getPathKind(absolutePath);
    if (kind !== "missing" && kind !== "directory") {
      continue;
    }
    if (kind === "directory" && (await readdir(absolutePath)).length > 0) {
      continue;
    }

    const gitkeepPath = normalizePath(path.join(relativePath, ".gitkeep"));
    findings.push(fixableFinding("missing-gitkeep", `${gitkeepPath} is missing`, {
      type: "write",
      relativePath: gitkeepPath,
      absolutePath: repoPath(repoRoot, gitkeepPath),
      content: ""
    }));
  }
}

// Managed skills lived at skills/setup and skills/review before the rename to
// the collision-safe prefixed directories; doctor migrates old installs.
const legacySkillMigrations = [
  { legacyName: "setup", currentName: "atlas-setup", fileNames: ["SKILL.md", "customization.md"] },
  { legacyName: "review", currentName: "atlas-review", fileNames: ["SKILL.md"] }
];

async function addLegacySkillMigrationFindings(repoRoot, config, findings) {
  const skillsRoot = resolveArtifactPath(config, "skills");
  for (const migration of legacySkillMigrations) {
    let currentBlocksMove = false;
    for (const fileName of migration.fileNames) {
      const from = normalizePath(path.join(skillsRoot, migration.legacyName, fileName));
      const fromAbsolutePath = repoPath(repoRoot, from);
      if ((await getPathKind(fromAbsolutePath)) !== "file") {
        continue;
      }

      const to = normalizePath(path.join(skillsRoot, migration.currentName, fileName));
      const toAbsolutePath = repoPath(repoRoot, to);
      if (await fileExists(toAbsolutePath)) {
        currentBlocksMove = true;
      } else {
        findings.push(fixableFinding("misplaced-legacy-skill", `${from} should move to ${to}`, {
          type: "move",
          from,
          to,
          fromAbsolutePath,
          toAbsolutePath
        }));
      }
    }

    if (currentBlocksMove) {
      const legacyPath = normalizePath(path.join(skillsRoot, migration.legacyName));
      const currentPath = normalizePath(path.join(skillsRoot, migration.currentName));
      findings.push(advisoryFinding(
        "legacy-skill-directory",
        `${legacyPath} is superseded by ${currentPath} — delete the legacy directory manually`
      ));
    }
  }
}

async function addMaintenanceSkillFindings(repoRoot, config, findings, driftOptions) {
  await addManagedSkillFileFinding(repoRoot, config, findings, {
    ...driftOptions,
    skillName: "atlas-setup",
    fileName: "SKILL.md",
    content: defaultSetupSkillMd(),
    missingCode: "missing-setup-skill",
    staleCode: "stale-setup-skill",
    description: "setup skill"
  });
  await addManagedSkillFileFinding(repoRoot, config, findings, {
    ...driftOptions,
    skillName: "atlas-setup",
    fileName: "customization.md",
    content: defaultCustomizationMd(),
    missingCode: "missing-customization-instructions",
    staleCode: "stale-customization-instructions",
    description: "setup customization instructions"
  });
  await addManagedSkillFileFinding(repoRoot, config, findings, {
    ...driftOptions,
    skillName: "atlas-review",
    fileName: "SKILL.md",
    content: defaultReviewSkillMd(),
    missingCode: "missing-review-skill",
    staleCode: "stale-review-skill",
    description: "review skill"
  });
  await addManagedSkillFileFinding(repoRoot, config, findings, {
    ...driftOptions,
    skillName: "atlas-compact",
    fileName: "SKILL.md",
    content: defaultCompactSkillMd(),
    missingCode: "missing-compact-skill",
    staleCode: "stale-compact-skill",
    description: "compact skill"
  });
  if (graphFeatureConfig(config).enabled) {
    await addManagedSkillFileFinding(repoRoot, config, findings, {
      ...driftOptions,
      skillName: "atlas-graph",
      fileName: "SKILL.md",
      content: defaultGraphSkillMd(),
      missingCode: "missing-graph-skill",
      staleCode: "stale-graph-skill",
      description: "graph skill"
    });
  } else {
    await addOrphanedGraphSkillFinding(repoRoot, config, findings);
  }
}

async function addOrphanedGraphSkillFinding(repoRoot, config, findings) {
  const relativePath = normalizePath(path.join(resolveArtifactPath(config, "skills"), "atlas-graph"));
  if ((await getPathKind(repoPath(repoRoot, relativePath))) !== "directory") {
    return;
  }

  findings.push(advisoryFinding(
    "graph-skill-orphaned",
    `${relativePath} exists but features.graph is not enabled — enable features.graph or remove ${relativePath} and run doctor --fix to refresh the lockfile`
  ));
}

async function addManagedSkillFileFinding(repoRoot, config, findings, options) {
  const relativePath = managedFileRelativePath(config, options.skillName, options.fileName);
  const absolutePath = repoPath(repoRoot, relativePath);
  const expectedContent = `${options.content}\n`;
  const kind = await getPathKind(absolutePath);

  if (kind === "missing") {
    findings.push(fixableFinding(options.missingCode, `${relativePath} is missing`, {
      type: "write",
      relativePath,
      absolutePath,
      content: expectedContent
    }));
    return;
  }

  if (kind !== "file") {
    findings.push(manualFinding("file-collision", `${relativePath} exists but is not a file`));
    return;
  }

  const currentContent = await readFile(absolutePath, "utf8");
  if (currentContent === expectedContent) {
    return;
  }

  // Three-way compare (ADR-0004). A baseline whose sha256 equals its packaged
  // hash means the file was pristine when recorded, so a difference from the
  // running package is plain staleness and overwriting is safe. An adopted
  // baseline (hashes differ) protects the customization until the packaged
  // copy changes again. Anything else is an unrecorded local edit.
  const staleFinding = () => fixableFinding(options.staleCode, `${relativePath} differs from the managed Atlas ${options.description} version`, {
    type: "write",
    relativePath,
    absolutePath,
    content: expectedContent
  });

  if (options.resetSkills) {
    findings.push(staleFinding());
    return;
  }

  const baseline = options.lockfile ? baselineEntry(options.lockfile, relativePath) : null;
  if (baseline && sha256(currentContent) === baseline.sha256) {
    if (baseline.sha256 === baseline.packaged) {
      findings.push(staleFinding());
      return;
    }
    if (sha256(expectedContent) === baseline.packaged) {
      // Adopted customization, packaged copy unchanged since adoption.
      return;
    }
    findings.push(advisoryFinding(
      "customized-skill",
      `${relativePath} is an adopted customization, but the packaged ${options.description} changed since adoption — review the update, then re-run atlas doctor --adopt-skills (or overwrite with atlas doctor --fix --reset-skills)`
    ));
    return;
  }

  findings.push(advisoryFinding(
    "customized-skill",
    `${relativePath} differs from both the packaged ${options.description} and its recorded baseline — keep it with atlas doctor --adopt-skills, or overwrite it with atlas doctor --fix --reset-skills`
  ));
}

async function addManagedFileFindings(repoRoot, root, config, findings) {
  const agentsPath = repoPath(repoRoot, "AGENTS.md");
  const currentAgents = await readTextIfExists(agentsPath);
  if (currentAgents !== null) {
    const managedState = inspectManagedBlock(currentAgents, managedBlockId);
    if (managedState.state === "malformed") {
      findings.push(manualFinding("managed-block-conflict", "AGENTS.md managed block is malformed"));
      return;
    }
    if (managedState.state === "duplicate") {
      findings.push(manualFinding("managed-block-conflict", "AGENTS.md managed block is duplicated"));
      return;
    }
  }

  const nextAgents = currentAgents === null
    ? applyManagedBlock("# Project AI Instructions\n", managedBlockId, agentManagedBlock(root, config))
    : applyManagedBlock(currentAgents, managedBlockId, agentManagedBlock(root, config));

  if (currentAgents !== nextAgents) {
    const blockExists = currentAgents !== null && inspectManagedBlock(currentAgents, managedBlockId).state === "present";
    const code = blockExists ? "stale-managed-block" : "missing-managed-block";
    const message = blockExists
      ? "AGENTS.md managed artifact-path block differs from the current Atlas version"
      : "AGENTS.md is missing the Atlas managed artifact-path block";
    findings.push(fixableFinding(code, message, {
      type: "write",
      relativePath: "AGENTS.md",
      absolutePath: agentsPath,
      content: nextAgents
    }));
  }

  const claudePath = repoPath(repoRoot, "CLAUDE.md");
  const currentClaude = await readTextIfExists(claudePath);
  if (currentClaude === null) {
    findings.push(fixableFinding("missing-claude-shim", "CLAUDE.md is missing", {
      type: "write",
      relativePath: "CLAUDE.md",
      absolutePath: claudePath,
      content: defaultClaudeMd()
    }));
  } else if (!currentClaude.includes("@AGENTS.md")) {
    findings.push(manualFinding("claude-shim-conflict", "CLAUDE.md exists but does not import @AGENTS.md"));
  }

}

async function addSkillLinkFindings(repoRoot, config, findings) {
  const skillsPath = repoPath(repoRoot, resolveArtifactPath(config, "skills"));
  const surfaces = config.agentSurfaces ?? Object.keys(agentSurfaceLinks);
  for (const surface of surfaces) {
    const relativePath = agentSurfaceLinks[surface];
    const absolutePath = repoPath(repoRoot, relativePath);
    const target = normalizePath(path.relative(path.dirname(absolutePath), skillsPath));
    const kind = await getPathKind(absolutePath);
    if (kind === "missing") {
      findings.push(fixableFinding("missing-skill-link", `${relativePath} is missing`, {
        type: "symlink",
        relativePath,
        absolutePath,
        target
      }));
      continue;
    }

    const stats = await lstat(absolutePath);
    if (!stats.isSymbolicLink()) {
      const skillsRelativePath = resolveArtifactPath(config, "skills");
      findings.push(manualFinding(
        "skill-link-collision",
        `${relativePath} exists but is not a symlink — move its contents into ${skillsRelativePath}/, delete the emptied ${relativePath} (its contents stay discoverable through the symlink), then run atlas doctor --fix`
      ));
      continue;
    }

    const currentTarget = await readlink(absolutePath);
    if (currentTarget !== target) {
      findings.push(fixableFinding("wrong-skill-link-target", `${relativePath} points to ${currentTarget}, expected ${target}`, {
        type: "symlink",
        relativePath,
        absolutePath,
        target
      }));
    }
  }
}

async function addPlaceholderFindings(repoRoot, config, findings) {
  for (const relativePath of ["AGENTS.md", resolveArtifactPath(config, "language")]) {
    const content = await readTextIfExists(repoPath(repoRoot, relativePath));
    if (content && (content.includes("{{") || content.includes("<!-- TODO"))) {
      findings.push(advisoryFinding("unresolved-placeholder", `${relativePath} still contains scaffold placeholders`));
    }
  }
}

async function addAliasFindings(repoRoot, config, findings) {
  const seenFiles = new Set();
  for (const alias of Object.keys(config.pathAliases)) {
    const aliasRelativePath = normalizePath(alias);
    const aliasAbsolutePath = repoPath(repoRoot, aliasRelativePath);
    if (!(await fileExists(aliasAbsolutePath))) {
      continue;
    }

    const kind = await getPathKind(aliasAbsolutePath);
    if (kind !== "directory") {
      findings.push(manualFinding("alias-root-collision", `${aliasRelativePath} exists but is not a directory`));
      continue;
    }

    const files = await listFiles(aliasAbsolutePath, aliasRelativePath);
    for (const file of files) {
      if (seenFiles.has(file)) {
        continue;
      }
      seenFiles.add(file);

      const to = resolveAliasDestination(config, file);
      const fromAbsolutePath = repoPath(repoRoot, file);
      const toAbsolutePath = repoPath(repoRoot, to);
      if (await fileExists(toAbsolutePath)) {
        findings.push(manualFinding("alias-target-collision", `${file} maps to ${to}, but the target already exists`));
      } else {
        findings.push(fixableFinding("misplaced-alias-file", `${file} should move to ${to}`, {
          type: "move",
          from: file,
          to,
          fromAbsolutePath,
          toAbsolutePath
        }));
      }
    }
  }
}

async function addSemanticHealthFindings(repoRoot, config, findings) {
  if (config.setupState === "scaffolded") {
    const setupSkillPath = normalizePath(path.join(resolveArtifactPath(config, "skills"), "atlas-setup", "SKILL.md"));
    findings.push(advisoryFinding("setup-pending", `Atlas setup has not been completed — read ${setupSkillPath} and follow it to finish setup`));
  }

  const languagePath = resolveArtifactPath(config, "language");
  const languageContent = await readTextIfExists(repoPath(repoRoot, languagePath));
  if (languageContent !== null && countVocabularyDataRows(languageContent) === 0) {
    findings.push(advisoryFinding("empty-language", `${languagePath} has no vocabulary entries yet`));
  }

  const memoryPath = resolveArtifactPath(config, "memory");
  const memoryAbsolutePath = repoPath(repoRoot, memoryPath);
  if ((await getPathKind(memoryAbsolutePath)) === "directory") {
    const entries = await readdir(memoryAbsolutePath);
    if (entries.length === 1 && entries[0] === "README.md") {
      findings.push(advisoryFinding("empty-memory", `${memoryPath} contains only README.md — no memory captured yet`));
    }
  }
}

async function addGraphFindings(repoRoot, config, findings) {
  findings.push(...await collectGraphFindings(repoRoot, config));
}

async function addContextSizeFindings(repoRoot, config, findings, diagnostics) {
  const report = await analyzeContextSizes(repoRoot, config);
  if (diagnostics) {
    diagnostics.contextSizeReport = report;
  }

  const finding = contextSizeFinding(report);
  if (finding) {
    findings.push(finding);
  }
}

function countVocabularyDataRows(content) {
  const lines = content.split("\n").map((line) => line.trim());
  const separatorIndex = lines.findIndex((line) => /^\|(\s*:?-{3,}:?\s*\|)+$/.test(line));
  if (separatorIndex === -1) {
    return 0;
  }
  return lines.slice(separatorIndex + 1).filter((line) => line.startsWith("|")).length;
}

function rootEscapesRepo(root) {
  if (path.isAbsolute(root)) {
    return true;
  }
  const normalized = path.posix.normalize(normalizePath(root));
  return normalized === ".." || normalized.startsWith("../");
}

function writeConfigAction(repoRoot, templateName = "standard", root = defaultRoot) {
  return {
    type: "write",
    relativePath: normalizePath(path.join(root, "config.json")),
    absolutePath: configPath(repoRoot, root),
    content: defaultConfigJson(templateName, root)
  };
}

function fixableFinding(code, message, action) {
  return { code, message, severity: "fixable", fixable: true, action };
}

function manualFinding(code, message) {
  return { code, message, severity: "manual", fixable: false };
}

function advisoryFinding(code, message) {
  return { code, message, severity: "advisory", fixable: false };
}

async function getPathKind(absolutePath) {
  try {
    const stats = await stat(absolutePath);
    if (stats.isDirectory()) {
      return "directory";
    }
    if (stats.isFile()) {
      return "file";
    }
    return "other";
  } catch {
    return "missing";
  }
}

async function listFiles(absoluteRoot, relativeRoot) {
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(absoluteRoot, entry.name);
    const relativePath = normalizePath(path.join(relativeRoot, entry.name));
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

export async function ensureEmptyDirectory(pathToCreate) {
  await mkdir(pathToCreate, { recursive: true });
}
