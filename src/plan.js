import { collectDoctorFindings, findingSeverity, loadConfig } from "./doctor.js";
import { pathExists } from "./repo.js";

export async function describeFinding(finding) {
  const action = finding.action;
  if (!action) {
    throw new Error(`describeFinding requires a fixable finding with an action: ${finding.code}`);
  }
  if (action.type === "mkdir") {
    return { verb: "Created", target: `${action.relativePath}/` };
  }
  if (action.type === "symlink") {
    return { verb: "Linked", target: `${action.relativePath} → ${action.target}` };
  }
  if (action.type === "move") {
    return { verb: "Moved", target: `${action.from} → ${action.to}` };
  }
  // write
  const existed = await pathExists(action.absolutePath);
  if (finding.code === "missing-managed-block") {
    return { verb: existed ? "Updated" : "Created", target: `${action.relativePath} (managed block)` };
  }
  return { verb: existed ? "Updated" : "Created", target: action.relativePath };
}

export async function buildPlan(cwd, { templateName, root } = {}) {
  const requested = templateName ?? "standard";
  // Read config once for the effective template; collectDoctorFindings re-reads it internally.
  const loaded = await loadConfig(cwd, { templateName: requested, root });
  const effectiveTemplate = loaded.exists ? (loaded.config.template ?? "custom") : requested;

  const findings = await collectDoctorFindings(cwd, { templateName: requested, root });
  const conflicts = findings.filter((finding) => findingSeverity(finding) === "manual");
  const fixable = findings.filter((finding) => findingSeverity(finding) === "fixable");
  const advisories = findings.filter((finding) => findingSeverity(finding) === "advisory");
  const actions = await Promise.all(fixable.map(describeFinding));

  return { templateName: effectiveTemplate, root: loaded.root, fixable, conflicts, advisories, actions };
}
