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
  defaultAgentsMd,
  defaultClaudeMd,
  defaultConfigJson,
  defaultLanguageMd,
  defaultSetupSkillMd,
  defaultMemoryReadme,
  managedBlockId
} from "./templates.js";

const skillLinkPaths = [".claude/skills", ".agents/skills", ".cursor/skills"];

export async function loadConfig(repoRoot, options = {}) {
  const filePath = configPath(repoRoot);
  if (!(await fileExists(filePath))) {
    return { config: createConfigForTemplate(options.templateName ?? "standard"), exists: false, errors: [] };
  }

  try {
    const config = JSON.parse(await readFile(filePath, "utf8"));
    const validation = validateConfig(config);
    return { config, exists: true, errors: validation.errors };
  } catch (error) {
    return {
      config: createConfigForTemplate(options.templateName ?? "standard"),
      exists: true,
      errors: [`config is not valid JSON: ${error.message}`]
    };
  }
}

export async function collectDoctorFindings(repoRoot, options = {}) {
  const findings = [];
  const loaded = await loadConfig(repoRoot, options);
  const config = loaded.config;

  if (!loaded.exists) {
    findings.push(fixableFinding("missing-config", ".ai/config.json is missing", writeConfigAction(repoRoot, options.templateName)));
  }

  for (const error of loaded.errors) {
    findings.push(manualFinding("invalid-config", error));
  }

  if (loaded.errors.length > 0) {
    return findings;
  }

  await addRequiredArtifactFindings(repoRoot, config, findings);
  await addMaintenanceSkillFindings(repoRoot, config, findings);
  await addManagedFileFindings(repoRoot, findings);
  await addSkillLinkFindings(repoRoot, config, findings);
  await addPlaceholderFindings(repoRoot, config, findings);
  await addAliasFindings(repoRoot, config, findings);

  return findings;
}

export async function applyFixes(findings) {
  for (const finding of findings) {
    if (finding.fixable && finding.action) {
      await applyAction(finding.action);
    }
  }
}

export function classifyFindings(findings) {
  if (findings.length === 0) {
    return "clean";
  }
  if (findings.some((finding) => !finding.fixable)) {
    return "manual";
  }
  return "fixable";
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

async function addMaintenanceSkillFindings(repoRoot, config, findings) {
  await addManagedSkillFileFinding(repoRoot, config, findings, {
    fileName: "SKILL.md",
    content: defaultSetupSkillMd(),
    missingCode: "missing-setup-skill",
    staleCode: "stale-setup-skill",
    description: "setup skill"
  });
  await addManagedSkillFileFinding(repoRoot, config, findings, {
    fileName: "customization.md",
    content: defaultCustomizationMd(),
    missingCode: "missing-customization-instructions",
    staleCode: "stale-customization-instructions",
    description: "setup customization instructions"
  });
}

async function addManagedSkillFileFinding(repoRoot, config, findings, options) {
  const relativePath = path.join(resolveArtifactPath(config, "skills"), "setup", options.fileName);
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

async function addManagedFileFindings(repoRoot, findings) {
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
    ? applyManagedBlock("# Project AI Instructions\n", managedBlockId, agentManagedBlock())
    : applyManagedBlock(currentAgents, managedBlockId, agentManagedBlock());

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
  for (const relativePath of skillLinkPaths) {
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
      findings.push(manualFinding("unresolved-placeholder", `${relativePath} still contains scaffold placeholders`));
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

function writeConfigAction(repoRoot, templateName = "standard") {
  return {
    type: "write",
    relativePath: ".ai/config.json",
    absolutePath: configPath(repoRoot),
    content: defaultConfigJson(templateName)
  };
}

function fixableFinding(code, message, action) {
  return { code, message, fixable: true, action };
}

function manualFinding(code, message) {
  return { code, message, fixable: false };
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
