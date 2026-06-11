import { collectDoctorFindings, applyFixes } from "./doctor.js";
import { runInit } from "./init.js";
import { getTemplateNames, workspaceRootError } from "./config.js";
import { exitCodeForFindings, formatFindings } from "./output.js";
import { gitStatus, isGitRepo } from "./repo.js";
import { detectMode } from "./ui/runtime.js";
import { runInteractiveInit } from "./ui/flow.js";
import { colorizeDoctorOutput, doctorMark } from "./ui/doctor.js";

export async function runCli(argv = process.argv.slice(2), options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const parsed = parseArgs(argv);

  if (parsed.error) {
    return { exitCode: 2, stdout: helpText(), stderr: `${parsed.error}\n` };
  }

  if (parsed.help) {
    return { exitCode: 0, stdout: helpText(), stderr: "" };
  }

  if (parsed.command === "init") {
    const validation = validateFlags(parsed.flags, ["dry-run", "force", "yes", "ci", "template", "root"]);
    if (validation) {
      return { exitCode: 2, stdout: helpText(), stderr: `${validation}\n` };
    }
    const templateName = parsed.flags.get("template") ?? "standard";
    const templateValidation = validateTemplateName(templateName);
    if (templateValidation) {
      return { exitCode: 2, stdout: helpText(), stderr: `${templateValidation}\n` };
    }
    const rootValidation = validateRootFlag(parsed.flags.get("root"));
    if (rootValidation) {
      return { exitCode: 2, stdout: helpText(), stderr: `${rootValidation}\n` };
    }
    return runInit({
      cwd,
      dryRun: parsed.flags.has("dry-run"),
      force: parsed.flags.has("force"),
      templateName,
      root: parsed.flags.get("root")
    });
  }

  if (parsed.command === "doctor") {
    const validation = validateFlags(parsed.flags, ["fix", "force"]);
    if (validation) {
      return { exitCode: 2, stdout: helpText(), stderr: `${validation}\n` };
    }

    if (!(await isGitRepo(cwd))) {
      return { exitCode: 2, stdout: "", stderr: "Refusing to inspect: current directory is not a git repository.\n" };
    }

    const findings = await collectDoctorFindings(cwd);
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
            stderr: "Refusing to fix with a dirty git worktree. Commit/stash changes or pass --force.\n"
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

    return {
      exitCode: exitCodeForFindings(findings),
      stdout: `Atlas doctor\n${formatFindings(findings)}`,
      stderr: ""
    };
  }

  return { exitCode: 2, stdout: helpText(), stderr: `Unknown command: ${parsed.command ?? "(none)"}\n` };
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

    if (parsed.command === "init" && !parsed.help && !parsed.error && mode.interactive && !parsed.flags.has("dry-run")) {
      const rawTemplate = parsed.flags.get("template");
      const templateName = typeof rawTemplate === "string" ? rawTemplate : "standard";
      const templateError = validateTemplateName(templateName);
      if (templateError) {
        process.stdout.write(helpText());
        process.stderr.write(`${templateError}\n`);
        process.exitCode = 2;
        return;
      }
      const rootError = validateRootFlag(parsed.flags.get("root"));
      if (rootError) {
        process.stdout.write(helpText());
        process.stderr.write(`${rootError}\n`);
        process.exitCode = 2;
        return;
      }
      process.exitCode = await runInteractiveInit({
        cwd: process.cwd(),
        templateName,
        color: mode.color,
        force: parsed.flags.has("force"),
        root: parsed.flags.get("root")
      });
      return;
    }

    if (parsed.command === "doctor" && !parsed.help && !parsed.error && mode.interactive) {
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

const valueFlags = new Set(["template", "root"]);

function parseArgs(argv) {
  const flags = new Map();
  let command = null;
  let help = false;
  let error = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      help = true;
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

  return { command, flags, help, error };
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
  return `Atlas CLI

Usage:
  atlas init [--dry-run] [--force] [--yes] [--ci] [--template <name>] [--root <dir>]
  atlas doctor [--fix] [--force]

Commands:
  init          Install or refresh the config-driven Atlas workspace
  doctor        Inspect the Atlas workspace for drift; reports fixable and
                manual issues plus a non-blocking Advisory section
  doctor --fix  Apply safe deterministic repairs reported by doctor

Options:
  --root <dir>       Workspace root for init (repo-relative; default .ai)
  --template <name>  Workspace template for init (default standard)
  --yes              Skip prompts and take the non-interactive path;
                     does not bypass the dirty-worktree refusal
  --force            Proceed even when the git worktree is dirty

Templates:
  ${getTemplateNames().join(", ")}
  (usually chosen for you by the setup skill after it inspects the repo)

`;
}
