import { readFileSync } from "node:fs";

import { classifyFindings, collectDoctorFindings, applyFixes, discoverWorkspaceRoot } from "./doctor.js";
import { runInit } from "./init.js";
import { configPath, getTemplateNames, workspaceRootError } from "./config.js";
import { exitCodeForFindings, formatFindings } from "./output.js";
import { describeDirtyStatus, fileExists, gitStatus, isGitRepo } from "./repo.js";
import { detectMode } from "./ui/runtime.js";
import { runInteractiveInit } from "./ui/flow.js";
import { colorizeDoctorOutput, doctorMark } from "./ui/doctor.js";

const packageVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const initFlags = ["dry-run", "force", "yes", "ci", "here", "template", "root"];

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const parsed = parseArgs(argv);

  if (parsed.error) {
    return usageError(parsed.error);
  }

  if (parsed.version) {
    return { exitCode: 0, stdout: `${packageVersion}\n`, stderr: "" };
  }

  if (parsed.help || parsed.command === null) {
    if (parsed.command === null && parsed.flags.size > 0 && !parsed.help) {
      return usageError(`Unknown option: --${parsed.flags.keys().next().value}`);
    }
    return { exitCode: 0, stdout: helpText(), stderr: "" };
  }

  if (parsed.command === "init") {
    const validation = validateFlags(parsed.flags, initFlags);
    if (validation) {
      return usageError(validation);
    }
    const templateName = parsed.flags.get("template") ?? "standard";
    const templateValidation = validateTemplateName(templateName);
    if (templateValidation) {
      return usageError(templateValidation);
    }
    const rootValidation = validateRootFlag(parsed.flags.get("root"));
    if (rootValidation) {
      return usageError(rootValidation);
    }
    return runInit({
      cwd,
      dryRun: parsed.flags.has("dry-run"),
      force: parsed.flags.has("force"),
      here: parsed.flags.has("here"),
      templateName,
      root: parsed.flags.get("root")
    });
  }

  if (parsed.command === "doctor") {
    const validation = validateFlags(parsed.flags, ["fix", "force", "json"]);
    if (validation) {
      return usageError(validation);
    }

    if (parsed.flags.has("json") && parsed.flags.has("fix")) {
      return usageError("Cannot combine --json with --fix");
    }

    if (!(await isGitRepo(cwd))) {
      return { exitCode: 2, stdout: "", stderr: "Refusing to inspect: current directory is not a git repository.\n" };
    }

    const findings = await collectDoctorFindings(cwd);

    if (parsed.flags.has("json")) {
      const exitCode = exitCodeForFindings(findings);
      const payload = {
        classification: classifyFindings(findings),
        exitCode,
        findings: findings.map(({ code, message, severity, fixable }) => ({ code, message, severity, fixable }))
      };
      return { exitCode, stdout: `${JSON.stringify(payload, null, 2)}\n`, stderr: "" };
    }

    if (parsed.flags.has("fix")) {
      const manual = findings.filter((finding) => finding.severity === "manual");
      if (manual.length > 0) {
        return { exitCode: 2, stdout: formatFindings(findings), stderr: "" };
      }
      const fixable = findings.filter((finding) => finding.fixable);
      if (!parsed.flags.has("force") && fixable.length > 0) {
        const status = await gitStatus(cwd);
        if (status) {
          return {
            exitCode: 2,
            stdout: "",
            stderr: `Refusing to fix with a dirty git worktree. Commit/stash changes or pass --force.\n${describeDirtyStatus(status)}\n`
          };
        }
      }
      await applyFixes(findings);
      return {
        exitCode: 0,
        stdout: `Atlas doctor --fix\n${formatFindings(findings, { emptyMessage: "No issues found.", fixableHeading: "Applied fixes:" })}`,
        stderr: ""
      };
    }

    // A repo that never ran init gets one actionable line, not a drift wall.
    // Exit stays 1 so CI keeps gating; manual conflicts still render in full.
    if (classifyFindings(findings) === "fixable" && !(await workspaceInitialized(cwd))) {
      return {
        exitCode: 1,
        stdout: "Atlas doctor\n\nAtlas is not set up in this repository.\nRun: npx --yes @blazity-atlas/core@latest init\n",
        stderr: ""
      };
    }

    return {
      exitCode: exitCodeForFindings(findings),
      stdout: `Atlas doctor\n${formatFindings(findings)}`,
      stderr: ""
    };
  }

  return usageError(`Unknown command: ${parsed.command}`);
}

export async function main() {
  try {
    const argv = process.argv.slice(2);
    const parsed = parseArgs(argv);
    const mode = detectMode({
      stdoutIsTTY: process.stdout.isTTY,
      stdinIsTTY: process.stdin.isTTY,
      env: process.env,
      yes: parsed.flags?.has?.("yes") ?? false,
      ci: parsed.flags?.has?.("ci") ?? false
    });

    const wantsPlainPath = parsed.help || parsed.error || parsed.version;

    if (parsed.command === "init" && !wantsPlainPath && mode.interactive && !parsed.flags.has("dry-run")) {
      const flagError = validateFlags(parsed.flags, initFlags);
      if (flagError) {
        writeUsageError(flagError);
        return;
      }
      const rawTemplate = parsed.flags.get("template");
      const templateName = typeof rawTemplate === "string" ? rawTemplate : "standard";
      const templateError = validateTemplateName(templateName);
      if (templateError) {
        writeUsageError(templateError);
        return;
      }
      const rootError = validateRootFlag(parsed.flags.get("root"));
      if (rootError) {
        writeUsageError(rootError);
        return;
      }
      process.exitCode = await runInteractiveInit({
        cwd: process.cwd(),
        templateName,
        color: mode.color,
        force: parsed.flags.has("force"),
        here: parsed.flags.has("here"),
        root: parsed.flags.get("root")
      });
      return;
    }

    if (parsed.command === "doctor" && !wantsPlainPath && mode.interactive && !parsed.flags.has("json")) {
      process.stdout.write(`${doctorMark({ color: mode.color })}\n\n`);
      const doctorResult = await runCli(argv);
      if (doctorResult.stdout) {
        process.stdout.write(colorizeDoctorOutput(doctorResult.stdout, { color: mode.color }));
      }
      if (doctorResult.stderr) {
        process.stderr.write(doctorResult.stderr);
      }
      process.exitCode = doctorResult.exitCode;
      return;
    }

    const result = await runCli(argv);
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}

async function workspaceInitialized(cwd) {
  const discovered = await discoverWorkspaceRoot(cwd);
  if (discovered.source === "pointer") {
    return true;
  }
  return fileExists(configPath(cwd, discovered.root));
}

function usageError(message) {
  return { exitCode: 2, stdout: "", stderr: `${message}\nRun atlas --help for usage.\n` };
}

function writeUsageError(message) {
  process.stderr.write(`${message}\nRun atlas --help for usage.\n`);
  process.exitCode = 2;
}

const valueFlags = new Set(["template", "root"]);

function parseArgs(argv) {
  const flags = new Map();
  let command = null;
  let help = false;
  let version = false;
  let error = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg.startsWith("--")) {
      const rawFlag = arg.slice(2);
      const equalsIndex = rawFlag.indexOf("=");
      const flagName = equalsIndex === -1 ? rawFlag : rawFlag.slice(0, equalsIndex);
      if (valueFlags.has(flagName)) {
        if (equalsIndex !== -1) {
          const value = rawFlag.slice(equalsIndex + 1);
          if (!value) {
            error = `Missing value for --${flagName}`;
          }
          flags.set(flagName, value);
        } else {
          const value = argv[index + 1];
          if (!value || value.startsWith("--")) {
            error = `Missing value for --${flagName}`;
          } else {
            flags.set(flagName, value);
            index += 1;
          }
        }
      } else {
        flags.set(flagName, true);
      }
    } else if (!command) {
      command = arg;
    } else {
      error = `Unexpected argument: ${arg}`;
    }
  }

  return { command, flags, help, version, error };
}

function validateFlags(flags, allowedFlags) {
  const allowed = new Set(allowedFlags);
  for (const flag of flags.keys()) {
    if (!allowed.has(flag)) {
      return `Unknown option: --${flag}`;
    }
  }
  return null;
}

function validateTemplateName(templateName) {
  if (!getTemplateNames().includes(templateName)) {
    return `Unknown Atlas template: ${templateName}`;
  }
  return null;
}

function validateRootFlag(root) {
  if (root === undefined) {
    return null;
  }
  const error = workspaceRootError(root);
  return error ? `Invalid --root: ${error}` : null;
}

function helpText() {
  return `Atlas CLI — repo-owned AI context for coding agents

Usage:
  atlas init [--dry-run] [--force] [--yes] [--ci] [--here] [--template <name>] [--root <dir>]
  atlas doctor [--fix] [--force] [--json]
  atlas --version

Commands:
  init          Install or refresh the config-driven Atlas workspace
  doctor        Inspect the Atlas workspace for drift; reports fixable and
                manual issues plus a non-blocking Advisory section
  doctor --fix  Apply safe deterministic repairs reported by doctor

Options:
  --root <dir>       Workspace root for init (repo-relative; default .ai)
  --template <name>  Workspace template for init (default standard)
  --dry-run          Preview init changes without writing anything
  --yes              Skip prompts and take the non-interactive path;
                     does not bypass the dirty-worktree refusal
  --force            Proceed even when the git worktree is dirty
  --here             Allow init inside a repository subdirectory
                     (deliberate nested workspace, e.g. a monorepo package)
  --ci               Force the non-interactive path (also implied by CI=1)
  --json             doctor only: print findings as JSON
  --version, -v      Print the Atlas CLI version

Exit codes (frozen contract):
  0  clean — advisories never affect the exit code
  1  fixable drift (doctor --fix can repair it)
  2  manual conflicts, refusals, or invalid usage

Templates:
  ${getTemplateNames().join(", ")}
  (usually chosen for you by the atlas-setup skill after it inspects the repo)

`;
}
