import { cancel, confirm, intro, isCancel, log, note, outro, select, spinner, text } from "@clack/prompts";

import { applyFixes, collectDoctorFindings, findingSeverity, loadConfig } from "../doctor.js";
import { gitStatus } from "../repo.js";
import { buildPlan } from "../plan.js";
import { normalizePath, workspaceRootError } from "../config.js";
import { initNextStepText, setupHandoffPrompt } from "../templates.js";
import { animateLogo } from "./logo.js";
import { detectAgents, launchAgent } from "./launcher.js";
import { atlasSleep } from "./sleep.js";
import { makeTheme } from "./theme.js";

export function planTreeLines(plan, { color }) {
  const theme = makeTheme({ color });
  return plan.actions.map((action) => {
    const verb = action.verb.padEnd(8);
    return `${color ? theme.green(verb) : verb} ${action.target}`;
  });
}

// The outro's pasteable handoff prompt must stand out: prompt lines render in
// brand orange, the surrounding guidance dims. Without color this is exactly
// initNextStepText, byte for byte — the plain CLI path shares that text.
export function renderNextStepText(root, { color }) {
  const text = initNextStepText(root);
  if (!color) {
    return text;
  }

  const theme = makeTheme({ color });
  const promptLines = new Set(setupHandoffPrompt(root).split("\n").map((line) => `  ${line}`));
  return text
    .split("\n")
    .map((line) => {
      if (line === "") {
        return line;
      }
      return promptLines.has(line) ? theme.orange(line) : theme.dim(line);
    })
    .join("\n");
}

export function summarizeDoctorPass(findings) {
  const remaining = findings.filter((finding) => findingSeverity(finding) !== "advisory");
  const advisories = findings.filter((finding) => findingSeverity(finding) === "advisory");
  if (remaining.length > 0) {
    return { healthy: false, summary: `doctor · ${pluralize(remaining.length, "issue", "issues")} remaining`, remaining };
  }
  const advisorySuffix = advisories.length > 0 ? ` · ${pluralize(advisories.length, "advisory", "advisories")}` : "";
  return { healthy: true, summary: `doctor · 0 issues · workspace healthy${advisorySuffix}`, remaining };
}

export async function runInteractiveInit({ cwd, templateName = "standard", color = true, force = false, root, io = {} }) {
  // The io seam lets tests drive prompts and agent launches without a TTY.
  const ui = { isCancel, text, confirm, select, detectAgents, launchAgent, ...io };

  await animateLogo(process.stdout, { color });
  const theme = makeTheme({ color });
  process.stdout.write(`${theme.dim("the agentic repo standard")}\n\n`);

  intro("atlas init");

  const workspaceRoot = await resolveWorkspaceRoot(ui, cwd, root);
  if (workspaceRoot === null) {
    cancel("Cancelled. Nothing written.");
    return 130;
  }

  const scan = spinner();
  scan.start("scanning repository…");
  const plan = await buildPlan(cwd, { templateName, root: workspaceRoot });
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
    outro(renderNextStepText(plan.root, { color }));
    return 0;
  }

  if (!force) {
    const status = await gitStatus(cwd);
    if (status) {
      note("Your git worktree has uncommitted changes.", "dirty worktree");
      const proceed = await ui.confirm({ message: "Write Atlas files anyway?", initialValue: false });
      if (ui.isCancel(proceed)) {
        cancel("Cancelled. Nothing written.");
        return 130;
      }
      if (!proceed) {
        cancel("Cancelled. Nothing written.");
        return 0;
      }
    }
  }

  note(planTreeLines(plan, { color }).join("\n"), `${plan.root}/ workspace · template ${plan.templateName}`);

  const ok = await ui.confirm({ message: `Write ${plan.actions.length} files to ${plan.root}/?`, initialValue: true });
  if (ui.isCancel(ok)) {
    cancel("Cancelled. Nothing written.");
    return 130;
  }
  if (!ok) {
    cancel("Cancelled. Nothing written.");
    return 0;
  }

  const write = spinner();
  write.start(`writing ${plan.actions.length} files…`);
  await applyFixes(plan.fixable);
  write.stop(`Workspace written to ${plan.root}/ · ${plan.actions.length} files`);

  const doctor = spinner();
  doctor.start("running doctor…");
  const verdict = summarizeDoctorPass(await collectDoctorFindings(cwd, { root: plan.root }));
  doctor.stop(verdict.summary);
  for (const finding of verdict.remaining) {
    const report = findingSeverity(finding) === "manual" ? log.error : log.warn;
    report(`[${finding.code}] ${finding.message}`);
  }

  outro(renderNextStepText(plan.root, { color }));

  await offerAgentLaunch(ui, plan.root);
  return 0;
}

// Returns the effective root, or null when the root question was cancelled.
async function resolveWorkspaceRoot(ui, cwd, requestedRoot) {
  const discovered = await loadConfig(cwd);
  if (discovered.exists) {
    return discovered.root;
  }

  if (requestedRoot !== undefined) {
    return normalizePath(requestedRoot.trim());
  }

  const answer = await ui.text({
    message: "Where should the Atlas workspace live?",
    initialValue: discovered.root,
    validate: (value) => {
      const error = workspaceRootError(value);
      return error ? `Workspace root ${error}` : undefined;
    }
  });
  if (ui.isCancel(answer)) {
    return null;
  }
  return normalizePath(answer.trim());
}

async function offerAgentLaunch(ui, root) {
  const agents = ui.detectAgents();
  if (agents.length === 0) {
    return;
  }

  const choice = await ui.select({
    message: "Launch an agent to finish setup?",
    options: [
      ...agents.map((agent) => ({ value: agent.name, label: agent.name })),
      { value: "skip", label: "Skip" }
    ],
    initialValue: "skip"
  });
  // Init already succeeded — cancelling the launcher is a skip, not an interrupt.
  if (ui.isCancel(choice) || choice === "skip") {
    return;
  }

  const agent = agents.find((entry) => entry.name === choice);
  const result = await ui.launchAgent(agent, setupHandoffPrompt(root));
  if (result.error) {
    log.warn(`Could not launch ${agent.name}: ${result.error.message} — paste the prompt above instead.`);
  } else if (result.code !== 0) {
    log.warn(`${agent.name} exited with ${result.code === null ? `signal ${result.signal}` : `code ${result.code}`}.`);
  }
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}
