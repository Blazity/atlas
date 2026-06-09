import { cancel, confirm, intro, isCancel, log, note, outro, spinner } from "@clack/prompts";

import { applyFixes } from "../doctor.js";
import { gitStatus } from "../repo.js";
import { buildPlan } from "../plan.js";
import { initNextStepText } from "../templates.js";
import { animateLogo } from "./logo.js";
import { atlasSleep } from "./sleep.js";
import { makeTheme } from "./theme.js";

export function planTreeLines(plan, { color }) {
  const theme = makeTheme({ color });
  return plan.actions.map((action) => {
    const verb = action.verb.padEnd(8);
    return `${color ? theme.green(verb) : verb} ${action.target}`;
  });
}

export async function runInteractiveInit({ cwd, templateName = "standard", color = true, force = false }) {
  await animateLogo(process.stdout, { color });
  const theme = makeTheme({ color });
  process.stdout.write(`${theme.dim("the agentic repo standard")}\n\n`);

  intro("atlas init");

  const scan = spinner();
  scan.start("scanning repository…");
  const plan = await buildPlan(cwd, { templateName });
  await atlasSleep(300);
  scan.stop("Repository scanned");

  if (plan.conflicts.length > 0) {
    for (const conflict of plan.conflicts) {
      log.error(`[${conflict.code}] ${conflict.message}`);
    }
    cancel("Manual conflicts must be resolved before Atlas can write. Nothing written.");
    return 2;
  }

  if (plan.actions.length === 0) {
    note("Already up to date — nothing to write.", "atlas");
    outro(initNextStepText());
    return 0;
  }

  if (!force) {
    const status = await gitStatus(cwd);
    if (status) {
      note("Your git worktree has uncommitted changes.", "dirty worktree");
      const proceed = await confirm({ message: "Write Atlas files anyway?", initialValue: false });
      if (isCancel(proceed) || !proceed) {
        cancel("Cancelled. Nothing written.");
        return 130;
      }
    }
  }

  note(planTreeLines(plan, { color }).join("\n"), `.ai/ workspace · template ${plan.templateName}`);

  const ok = await confirm({ message: `Write ${plan.actions.length} files to .ai/?`, initialValue: true });
  if (isCancel(ok) || !ok) {
    cancel("Cancelled. Nothing written.");
    return 130;
  }

  const write = spinner();
  write.start(`writing ${plan.actions.length} files…`);
  await applyFixes(plan.fixable);
  write.stop(`Workspace written to .ai/ · ${plan.actions.length} files`);

  const doctor = spinner();
  doctor.start("running doctor…");
  await atlasSleep(300);
  doctor.stop("doctor · 0 issues · workspace healthy");

  outro(initNextStepText());
  return 0;
}
