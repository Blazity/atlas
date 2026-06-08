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

export function initNextStepText() {
  return [
    "Next step — paste this to your coding agent:",
    "",
    "  Finish the Atlas setup on this repository: use the `setup` skill to",
    "  inspect the repo, confirm or refine the template, and fill AGENTS.md",
    "  and the .ai/ memory files.",
    "",
    "Claude Code: run /atlas:setup",
    "Repair drift later: atlas doctor --fix"
  ].join("\n");
}
