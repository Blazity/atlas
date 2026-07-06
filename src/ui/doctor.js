import { isCancel, log, note, select } from "@clack/prompts";

import { detectAgents, launchAgent } from "./launcher.js";
import { makeTheme } from "./theme.js";

export function doctorMark({ color }) {
  const theme = makeTheme({ color });
  return `${theme.orange("▲ ATLAS")} ${theme.dim("doctor")}`;
}

export function colorizeDoctorOutput(text, { color }) {
  if (!color) {
    return text;
  }
  const theme = makeTheme({ color });
  let inAdvisorySection = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^(Fixable:|Applied fixes:)$/.test(line)) {
        inAdvisorySection = false;
        return theme.green(line);
      }
      if (/^Manual:$/.test(line)) {
        inAdvisorySection = false;
        return theme.orange(line);
      }
      if (/^Advisory:$/.test(line)) {
        inAdvisorySection = true;
        return theme.blue(line);
      }
      if (/^- \[[^\]]+\]/.test(line)) {
        const paint = inAdvisorySection ? theme.blue : theme.yellow;
        return line.replace(/^(- \[[^\]]+\])/, (match) => paint(match));
      }
      const contextSizeLine = colorizeContextSizeBar(line, theme);
      return contextSizeLine.replace(/No issues found\./g, (match) => theme.green(match));
    })
    .join("\n");
}

function colorizeContextSizeBar(line, theme) {
  const status = line.match(/^\s+- (OK|WARN|OVERFLOW)\b/u)?.[1];
  if (!status) {
    return line;
  }

  const paint = {
    OK: theme.green,
    WARN: theme.yellow,
    OVERFLOW: theme.orange
  }[status];

  return line.replace(/\[[# ]{10}\]\s+\d+%/u, (match) => paint(match));
}

export async function offerContextSizeHandoff(prompt, { io = {} } = {}) {
  if (!prompt) {
    return;
  }

  const ui = { isCancel, log, note, select, detectAgents, launchAgent, ...io };
  const agents = ui.detectAgents();
  const choice = await ui.select({
    message: "Pass context-size cleanup to an agent?",
    options: [
      { value: "print", label: "Print prompt" },
      ...agents.map((agent) => ({ value: agent.name, label: agent.name })),
      { value: "skip", label: "Skip" }
    ],
    initialValue: "skip"
  });

  if (ui.isCancel(choice) || choice === "skip") {
    return;
  }

  if (choice === "print") {
    ui.note(prompt, "context-size handoff");
    return;
  }

  const agent = agents.find((entry) => entry.name === choice);
  const result = await ui.launchAgent(agent, prompt);
  if (result.error) {
    ui.log.warn(`Could not launch ${agent.name}: ${result.error.message} — print the prompt instead.`);
  } else if (result.code !== 0) {
    ui.log.warn(`${agent.name} exited with ${result.code === null ? `signal ${result.signal}` : `code ${result.code}`}.`);
  }
}
