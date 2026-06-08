import { applyFixes } from "./doctor.js";
import { gitStatus, isGitRepo } from "./repo.js";
import { formatApplied, formatFindings } from "./output.js";
import { buildPlan } from "./plan.js";
import { initNextStepText } from "./templates.js";

export async function runInit(options) {
  const cwd = options.cwd;
  if (!(await isGitRepo(cwd))) {
    return { exitCode: 2, stdout: "", stderr: "Refusing to initialize: current directory is not a git repository.\n" };
  }

  const plan = await buildPlan(cwd, { templateName: options.templateName ?? "standard" });

  if (plan.conflicts.length > 0) {
    return { exitCode: 2, stdout: `Atlas init\n${formatFindings([...plan.conflicts, ...plan.fixable])}`, stderr: "" };
  }

  if (!options.dryRun && !options.force && plan.fixable.length > 0) {
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
    await applyFixes(plan.fixable);
  }

  const title = options.dryRun ? "Atlas init dry run" : "Atlas init";
  const body = formatApplied(plan.actions, { dryRun: Boolean(options.dryRun) });
  const meta = `Template: ${plan.templateName}\n`;
  const nextStep = options.dryRun ? "" : `\n${initNextStepText()}\n`;

  return { exitCode: 0, stdout: `${title}\n\n${body}${meta}${nextStep}`, stderr: "" };
}
