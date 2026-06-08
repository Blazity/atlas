import { readFileSync } from "node:fs";

import { createConfigForTemplate } from "./config.js";

export const managedBlockId = "artifact-paths";

export function defaultConfigJson(templateName = "standard") {
  return `${JSON.stringify(createConfigForTemplate(templateName), null, 2)}\n`;
}

export function agentManagedBlock() {
  return [
    "## Atlas Artifact Paths",
    "",
    "`.ai/config.json` is the source of truth for AI artifact locations in this repository.",
    "Before writing plans, research, decisions, ADRs, results, memory, vocabulary, or skill outputs, resolve the destination through `artifactRoot`, `paths`, and `pathAliases`.",
    "If an imported skill, template, or instruction mentions a different path, map it through `.ai/config.json` before reading or writing files.",
    "Do not create new documentation roots unless `.ai/config.json` explicitly allows them."
  ].join("\n");
}

export function defaultAgentsMd() {
  return [
    "# Project AI Instructions",
    "",
    agentManagedBlock()
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
    "| --- | --- | --- |"
  ].join("\n");
}

export function defaultMemoryReadme() {
  return [
    "# AI Memory",
    "",
    "Stable product, architecture, stack, and lessons memory for AI agents.",
    "Keep volatile task status in the issue tracker, not here."
  ].join("\n");
}

export function defaultSetupSkillMd() {
  return readFileSync(new URL("../skills/setup/SKILL.md", import.meta.url), "utf8").replace(/\n$/u, "");
}

export function defaultCustomizationMd() {
  return readFileSync(new URL("../skills/setup/customization.md", import.meta.url), "utf8").replace(/\n$/u, "");
}

export function initNextStepText(templateName = "standard") {
  return [
    `Template: ${templateName}`,
    "",
    "Next step:",
    "Ask your agent to use the `setup` skill.",
    "CLI-first users can run `npx --yes @blazity-atlas/atlas@latest init --template <name>`, then continue with the local setup skill.",
    "Claude users can install the `atlas` plugin from the Blazity marketplace and run `/atlas:setup`.",
    "If you start from the skill first, it will run `npx --yes @blazity-atlas/atlas@latest init` or `doctor` for you before asking setup questions.",
    "The setup skill will ask whether you want standard setup or repository-specific customization.",
    "",
    "Suggested prompt:",
    "\"Use the setup skill to inspect this repository. Ask whether I want standard setup or customization, then fill the initial AGENTS.md and .ai memory files.\""
  ].join("\n");
}
