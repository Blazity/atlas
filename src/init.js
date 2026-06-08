import { collectDoctorFindings, applyFixes, loadConfig } from "./doctor.js";
import { gitStatus, isGitRepo } from "./repo.js";
import { formatFindings } from "./output.js";
import { initNextStepText } from "./templates.js";

export async function runInit(options) {
  const cwd = options.cwd;
  if (!(await isGitRepo(cwd))) {
    return { exitCode: 2, stdout: "", stderr: "Refusing to initialize: current directory is not a git repository.\n" };
  }

  const requestedTemplateName = options.templateName ?? "standard";
  const loadedConfig = await loadConfig(cwd, { templateName: requestedTemplateName });
  const effectiveTemplateName = loadedConfig.exists ? loadedConfig.config.template ?? "custom" : requestedTemplateName;
  const findings = await collectDoctorFindings(cwd, { templateName: requestedTemplateName });
  const manualFindings = findings.filter((finding) => !finding.fixable);
  const fixableFindings = findings.filter((finding) => finding.fixable);

  if (manualFindings.length > 0) {
    return {
      exitCode: 2,
      stdout: `Atlas init\n${formatFindings(findings)}`,
      stderr: ""
    };
  }

  if (!options.dryRun && !options.force && fixableFindings.length > 0) {
    const status = await gitStatus(cwd);
    if (status) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: "Refusing to initialize with a dirty git worktree. Commit/stash changes or pass --force.\n"
      };
    }
  }

  if (!options.dryRun) {
    await applyFixes(fixableFindings);
  }

  const title = options.dryRun ? "Atlas init dry run" : "Atlas init";
  const nextStep = options.dryRun ? "" : `\n${initNextStepText(effectiveTemplateName)}\n`;
  return {
    exitCode: 0,
    stdout: `${title}\n${formatFindings(fixableFindings, { emptyMessage: "No changes needed.", fixableHeading: "Applied changes:" })}${nextStep}`,
    stderr: ""
  };
}
