import { classifyFindings } from "./doctor.js";

export function formatFindings(findings, options = {}) {
  if (findings.length === 0) {
    return `${options.emptyMessage ?? "No issues found."}\n`;
  }

  const fixable = findings.filter((finding) => finding.fixable);
  const manual = findings.filter((finding) => !finding.fixable);
  const lines = [];
  const fixableHeading = options.fixableHeading ?? "Fixable:";
  const manualHeading = options.manualHeading ?? "Manual:";

  if (fixable.length > 0) {
    lines.push(fixableHeading);
    for (const finding of fixable) {
      lines.push(`- [${finding.code}] ${finding.message}`);
    }
  }

  if (manual.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push(manualHeading);
    for (const finding of manual) {
      lines.push(`- [${finding.code}] ${finding.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
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
