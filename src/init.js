import { applyFixes, loadConfig } from "./doctor.js";
import { describeDirtyStatus, gitStatus, isGitRepo, isRepoSubdirectory } from "./repo.js";
import { formatApplied, formatFindings } from "./output.js";
import { normalizePath } from "./config.js";
import { buildPlan } from "./plan.js";
import { initNextStepText } from "./templates.js";

export async function runInit(options) {
  const cwd = options.cwd;
  if (!(await isGitRepo(cwd))) {
    return { exitCode: 2, stdout: "", stderr: "Refusing to initialize: current directory is not a git repository.\n" };
  }

  if (!options.here) {
    const location = await isRepoSubdirectory(cwd);
    if (location.subdirectory) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: [
          "Refusing to initialize in a repository subdirectory.",
          `Repository root: ${location.toplevel}`,
          "Run atlas init from the repository root, or pass --here to scaffold a nested workspace on purpose.",
          ""
        ].join("\n")
      };
    }
  }

  const root = await resolveRequestedRoot(cwd, options.root);
  const plan = await buildPlan(cwd, { templateName: options.templateName ?? "standard", root });

  if (plan.conflicts.length > 0) {
    return { exitCode: 2, stdout: `Atlas init\n${formatFindings([...plan.conflicts, ...plan.fixable])}`, stderr: "" };
  }

  if (!options.dryRun && !options.force && plan.fixable.length > 0) {
    const status = await gitStatus(cwd);
    if (status) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: `Refusing to initialize with a dirty git worktree. Commit/stash changes or pass --force.\n${describeDirtyStatus(status)}\n`
      };
    }
  }

  if (!options.dryRun) {
    await applyFixes(plan.fixable);
  }

  const title = options.dryRun ? "Atlas init dry run" : "Atlas init";
  const body = formatApplied(plan.actions, { dryRun: Boolean(options.dryRun) });
  const meta = `Template: ${plan.templateName}\nRoot: ${plan.root}\n`;
  const nextStep = options.dryRun ? "" : `\n${initNextStepText(plan.root)}\n`;

  return { exitCode: 0, stdout: `${title}\n\n${body}${meta}${nextStep}`, stderr: "" };
}

// An existing workspace's root wins over --root, mirroring how an existing config's template wins.
async function resolveRequestedRoot(cwd, requestedRoot) {
  if (requestedRoot === undefined) {
    return undefined;
  }
  const existing = await loadConfig(cwd);
  return existing.exists ? existing.root : normalizePath(requestedRoot.trim());
}
