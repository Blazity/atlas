import { readFileSync } from "node:fs";
import path from "node:path";

import { createConfigForTemplate, normalizePath } from "./config.js";

export const managedBlockId = "artifact-paths";

export function defaultConfigJson(templateName = "standard", root = ".ai", options = {}) {
  return `${JSON.stringify(createConfigForTemplate(templateName, root, options), null, 2)}\n`;
}

export function agentManagedBlock(root = ".ai") {
  const configReference = `\`${normalizePath(path.join(root, "config.json"))}\``;
  return [
    "## Atlas Artifact Paths",
    "",
    `${configReference} is the source of truth for AI artifact locations in this repository.`,
    "Before writing plans, research, decisions, ADRs, results, memory, vocabulary, or skill outputs, resolve the destination through `artifactRoot`, `paths`, and `pathAliases`.",
    `If an imported skill, template, or instruction mentions a different path, map it through ${configReference} before reading or writing files.`,
    `Do not create new documentation roots unless ${configReference} explicitly allows them.`,
    "",
    "## Atlas Documentation Rules",
    "",
    "Durable documentation records needs, decisions, and reasons — never individuals or internal process.",
    'Write "memory was needed to persist context across runs", not "<name> wanted memory".',
    "Keep personal names, private schedules, internal-only references, and absolute local paths out of workspace artifacts."
  ].join("\n");
}

export function defaultClaudeMd() {
  return "@AGENTS.md\n";
}

export function defaultLanguageMd() {
  return [
    "# Project Vocabulary",
    "",
    "Use this file to define canonical product and codebase terms for AI agents.",
    "",
    "## Terms",
    "",
    "| Term | Meaning | Avoid |",
    "| --- | --- | --- |",
    "| Atlas workspace | The repo-owned AI context directory scaffolded by Atlas (default `.ai/`) | \"the AI docs\" <!-- TODO: replace this example row with real project terms --> |"
  ].join("\n");
}

export function defaultMemoryReadme() {
  return [
    "# AI Memory",
    "",
    "Stable product, architecture, stack, and lessons memory for AI agents.",
    "Keep volatile task status in the issue tracker, not here.",
    "",
    "Good entry: \"Payments run through an adapter because the provider API changed twice.\"",
    "Weak entry: \"Payments were discussed.\" Record needs, decisions, and reasons."
  ].join("\n");
}

// Canonical manifest of managed skill files. doctor's per-skill drift checks
// and the context-size scan must both cover exactly this set.
export const managedSkillFiles = [
  ["atlas-setup", "SKILL.md"],
  ["atlas-setup", "customization.md"],
  ["atlas-review", "SKILL.md"],
  ["atlas-compact", "SKILL.md"]
];

export function defaultSetupSkillMd() {
  return readPackagedSkillFile("atlas-setup/SKILL.md");
}

export function defaultCustomizationMd() {
  return readPackagedSkillFile("atlas-setup/customization.md");
}

export function defaultReviewSkillMd() {
  return readPackagedSkillFile("atlas-review/SKILL.md");
}

export function defaultCompactSkillMd() {
  return readPackagedSkillFile("atlas-compact/SKILL.md");
}

// Packaged managed-skill file content as written to disk (trailing newline).
export function packagedSkillFileContent(skillName, fileName) {
  return `${readPackagedSkillFile(`${skillName}/${fileName}`)}\n`;
}

function readPackagedSkillFile(relativePath) {
  return readFileSync(new URL(`../skills/${relativePath}`, import.meta.url), "utf8").replace(/\n$/u, "");
}

export function setupHandoffPrompt(root = ".ai", options = {}) {
  if (options.profile === "minimal") {
    const languagePath = normalizePath(path.join(root, "LANGUAGE.md"));
    const memoryPath = normalizePath(path.join(root, "memory", "README.md"));
    return [
      `Read ${normalizePath(path.join(root, "config.json"))}, AGENTS.md, ${languagePath}, and ${memoryPath}.`,
      "Capture only stable repository guidance: operating rules, vocabulary,",
      "architecture memory, and documentation routing through the Atlas config."
    ].join("\n");
  }

  const setupSkillPath = normalizePath(path.join(root, "skills", "atlas-setup", "SKILL.md"));
  return [
    `Read ${setupSkillPath} and follow it to finish the Atlas setup on`,
    "this repository: inspect the repo, confirm or refine the template,",
    "ask concrete missing-context questions, and fill AGENTS.md and",
    "the workspace memory files."
  ].join("\n");
}

export function initNextStepText(root = ".ai", options = {}) {
  const indentedPrompt = setupHandoffPrompt(root, options)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  const normalizedRoot = normalizePath(root);
  const scaffoldPaths = options.profile === "minimal"
    ? [normalizedRoot, "AGENTS.md", "CLAUDE.md"]
    : [normalizedRoot, ".claude", ".agents", ".cursor", "AGENTS.md", "CLAUDE.md"];
  if (normalizedRoot !== ".ai") {
    scaffoldPaths.push(".atlas");
  }
  const lines = [
    "Next step — paste this to your coding agent:",
    "",
    indentedPrompt,
    "",
    "Repair drift later: atlas doctor --fix",
    `Commit the scaffold when ready: git add ${scaffoldPaths.join(" ")}`
  ];
  if (options.profile !== "minimal") {
    lines.splice(4, 0, "Claude Code: run /atlas-setup (or /atlas:atlas-setup with the Atlas plugin)");
  }
  return lines.join("\n");
}
