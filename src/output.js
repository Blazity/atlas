import { classifyFindings, findingSeverity } from "./doctor.js";

export function formatFindings(findings, options = {}) {
  const fixable = findings.filter((finding) => findingSeverity(finding) === "fixable");
  const manual = findings.filter((finding) => findingSeverity(finding) === "manual");
  const advisories = findings.filter((finding) => findingSeverity(finding) === "advisory");
  const sections = [];

  if (fixable.length > 0) {
    sections.push(findingSection(options.fixableHeading ?? "Fixable:", fixable));
  }

  if (manual.length > 0) {
    sections.push(findingSection(options.manualHeading ?? "Manual:", manual));
  }

  // Advisories are signals, not issues — the clean message stays even when they render.
  if (sections.length === 0) {
    sections.push(options.emptyMessage ?? "No issues found.");
  }

  if (advisories.length > 0) {
    sections.push(findingSection(options.advisoryHeading ?? "Advisory:", advisories));
  }

  return `${sections.join("\n\n")}\n`;
}

function findingSection(heading, findings) {
  return [heading, ...findings.map((finding) => `- [${finding.code}] ${finding.message}`)].join("\n");
}

export function exitCodeForFindings(findings) {
  const classification = classifyFindings(findings);
  if (classification === "clean") {
    return 0;
  }
  if (classification === "fixable") {
    return 1;
  }
  return 2;
}

const VERB_WIDTH = 8;
const DRY_VERB = { Created: "Would create", Updated: "Would update", Linked: "Would link", Moved: "Would move" };

export function formatApplied(actions, { dryRun = false } = {}) {
  if (actions.length === 0) {
    return "Already up to date — nothing to write.\n";
  }

  const lines = actions.map((action) => {
    const verb = dryRun ? DRY_VERB[action.verb] : action.verb;
    return `${verb.padEnd(VERB_WIDTH)} ${action.target}`;
  });

  const noun = actions.length === 1 ? "change" : "changes";
  const summary = `${actions.length} ${noun} ${dryRun ? "planned" : "applied"}`;
  return `${lines.join("\n")}\n\n${summary}\n`;
}
