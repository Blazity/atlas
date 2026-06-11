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
import { applyManagedBlock, inspectManagedBlock } from "./managed-blocks.js";
import { fileExists, readTextIfExists, repoPath } from "./repo.js";
import {
  agentManagedBlock,
  defaultCustomizationMd,
  defaultClaudeMd,
  defaultConfigJson,
  defaultLanguageMd,
  defaultReviewSkillMd,
  defaultSetupSkillMd,
  defaultMemoryReadme,
  managedBlockId
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

  await addRootPointerFindings(repoRoot, root, findings);
  await addRequiredArtifactFindings(repoRoot, config, findings);
  await addGitkeepFindings(repoRoot, config, findings);
  await addMaintenanceSkillFindings(repoRoot, config, findings);
  await addManagedFileFindings(repoRoot, root, findings);
  await addSkillLinkFindings(repoRoot, config, findings);
  await addPlaceholderFindings(repoRoot, config, findings);
  await addAliasFindings(repoRoot, config, findings);
  await addSemanticHealthFindings(repoRoot, config, findings);

  return findings;
}

export async function applyFixes(findings) {
  for (const finding of findings) {
    if (finding.fixable && finding.action) {
      await applyAction(finding.action);
    }
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

async function addMaintenanceSkillFindings(repoRoot, config, findings) {
  await addManagedSkillFileFinding(repoRoot, config, findings, {
    skillName: "setup",
    fileName: "SKILL.md",
    content: defaultSetupSkillMd(),
    missingCode: "missing-setup-skill",
    staleCode: "stale-setup-skill",
    description: "setup skill"
  });
  await addManagedSkillFileFinding(repoRoot, config, findings, {
    skillName: "setup",
    fileName: "customization.md",
    content: defaultCustomizationMd(),
    missingCode: "missing-customization-instructions",
    staleCode: "stale-customization-instructions",
    description: "setup customization instructions"
  });
  await addManagedSkillFileFinding(repoRoot, config, findings, {
    skillName: "review",
    fileName: "SKILL.md",
    content: defaultReviewSkillMd(),
    missingCode: "missing-review-skill",
    staleCode: "stale-review-skill",
    description: "review skill"
  });
}

async function addManagedSkillFileFinding(repoRoot, config, findings, options) {
  const relativePath = path.join(resolveArtifactPath(config, "skills"), options.skillName, options.fileName);
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
  if (currentContent !== expectedContent) {
    findings.push(fixableFinding(options.staleCode, `${relativePath} differs from the managed Atlas ${options.description} version`, {
      type: "write",
      relativePath,
      absolutePath,
      content: expectedContent
    }));
  }
}

async function addManagedFileFindings(repoRoot, root, findings) {
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
    ? applyManagedBlock("# Project AI Instructions\n", managedBlockId, agentManagedBlock(root))
    : applyManagedBlock(currentAgents, managedBlockId, agentManagedBlock(root));

  if (currentAgents !== nextAgents) {
    findings.push(fixableFinding("missing-managed-block", "AGENTS.md is missing the Atlas managed artifact-path block", {
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
      findings.push(manualFinding("skill-link-collision", `${relativePath} exists but is not a symlink`));
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
    const setupSkillPath = normalizePath(path.join(resolveArtifactPath(config, "skills"), "setup", "SKILL.md"));
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
