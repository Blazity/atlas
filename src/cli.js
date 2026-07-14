import {
  adoptSkills,
  applyFixes,
  classifyFindings,
  collectDoctorFindings,
  discoverWorkspaceRoot,
  finalizeWorkspaceMetadata,
  loadConfig
} from "./doctor.js";
import { runInit } from "./init.js";
import { configPath, getTemplateNames, workspaceRootError } from "./config.js";
import { buildContextSizeHandoffPrompt } from "./context-size.js";
import { proposeOrgMemory, pullSharedMemory } from "./memory.js";
import { exitCodeForFindings, formatFindings } from "./output.js";
import { describeDirtyStatus, fileExists, gitStatus, isGitRepo } from "./repo.js";
import { runUpdateCheck, updateAdvisoryFinding } from "./update.js";
import { packageVersion } from "./version.js";
import { detectMode } from "./ui/runtime.js";
import { runInteractiveInit } from "./ui/flow.js";
import { colorizeDoctorOutput, doctorMark, offerContextSizeHandoff } from "./ui/doctor.js";

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

  if (parsed.command === "update") {
    const validation = validateFlags(parsed.flags, []);
    if (validation) {
      return usageError(validation);
    }
    return runUpdateCheck({ cwd, fetchImpl: options.fetchImpl });
  }

  if (parsed.command === "memory") {
    const validation = validateFlags(parsed.flags, []);
    if (validation) {
      return usageError(validation);
    }
    if (!["pull", "propose"].includes(parsed.subcommand)) {
      return usageError(parsed.subcommand ? `Unknown memory command: ${parsed.subcommand}` : "Missing memory command: use pull or propose");
    }
    if (!(await isGitRepo(cwd))) {
      return { exitCode: 2, stdout: "", stderr: "Refusing to update memory: current directory is not a git repository.\n" };
    }

    const loaded = await loadMemoryCommandConfig(cwd);
    if (!loaded.ok) {
      return { exitCode: 2, stdout: "", stderr: loaded.error };
    }

    if (parsed.subcommand === "pull") {
      const result = await pullSharedMemory(cwd, loaded.config, loaded.root, { execFile: options.execFileImpl });
      if (!result.ok) {
        return { exitCode: 2, stdout: "", stderr: `${result.error}\n` };
      }
      const lines = [
        "Atlas memory pull",
        "",
        `Pulled shared memory at ${result.pin}`,
        `Target: ${result.relativePath}`,
        `Files: ${result.fileCount}`
      ];
      if (result.skippedNonMarkdownCount > 0) {
        lines.push(`Skipped non-markdown files: ${result.skippedNonMarkdownCount}`);
      }
      if (result.skippedSymlinkCount > 0) {
        lines.push(`Skipped symlinks: ${result.skippedSymlinkCount}`);
      }
      lines.push("");
      return {
        exitCode: 0,
        stdout: lines.join("\n"),
        stderr: ""
      };
    }

    const result = await proposeOrgMemory(cwd, loaded.config);
    const noun = result.entryCount === 1 ? "entry" : "entries";
    const body = result.entryCount === 0
      ? "No org memory entries found.\n"
      : `Exported ${result.entryCount} org memory ${noun} to ${result.relativePath}\n`;
    return { exitCode: 0, stdout: `Atlas memory propose\n\n${body}`, stderr: "" };
  }

  if (parsed.command === "doctor") {
    const validation = validateFlags(parsed.flags, ["fix", "force", "json", "handoff", "reset-skills", "adopt-skills", "check-updates"]);
    if (validation) {
      return usageError(validation);
    }

    if (parsed.flags.has("json") && parsed.flags.has("fix")) {
      return usageError("Cannot combine --json with --fix");
    }
    if (parsed.flags.has("handoff") && parsed.flags.has("fix")) {
      return usageError("Cannot combine --handoff with --fix");
    }
    if (parsed.flags.has("handoff") && parsed.flags.has("json")) {
      return usageError("Cannot combine --handoff with --json");
    }
    if (parsed.flags.has("handoff") && parsed.flags.get("handoff") !== "context-size") {
      return usageError("Unsupported handoff topic: use --handoff context-size");
    }
    if (parsed.flags.has("reset-skills") && !parsed.flags.has("fix")) {
      return usageError("--reset-skills requires --fix");
    }
    for (const flag of ["fix", "json", "handoff", "reset-skills", "check-updates"]) {
      if (parsed.flags.has("adopt-skills") && parsed.flags.has(flag)) {
        return usageError(`Cannot combine --adopt-skills with --${flag}`);
      }
    }
    for (const flag of ["fix", "handoff"]) {
      if (parsed.flags.has("check-updates") && parsed.flags.has(flag)) {
        return usageError(`Cannot combine --check-updates with --${flag}`);
      }
    }

    if (!(await isGitRepo(cwd))) {
      return { exitCode: 2, stdout: "", stderr: "Refusing to inspect: current directory is not a git repository.\n" };
    }

    if (parsed.flags.has("adopt-skills")) {
      if (!(await workspaceInitialized(cwd))) {
        return {
          exitCode: 2,
          stdout: "",
          stderr: "Cannot adopt skills: Atlas is not set up in this repository. Run atlas init first.\n"
        };
      }
      if (!parsed.flags.has("force")) {
        const status = await gitStatus(cwd);
        if (status) {
          return {
            exitCode: 2,
            stdout: "",
            stderr: `Refusing to adopt with a dirty git worktree. Commit/stash changes or pass --force.\n${describeDirtyStatus(status)}\n`
          };
        }
      }
      const adopted = await adoptSkills(cwd);
      if (adopted === null) {
        return {
          exitCode: 2,
          stdout: "",
          stderr: "Cannot adopt skills: the Atlas config is missing or invalid. Run atlas doctor and resolve manual conflicts first.\n"
        };
      }
      const body = adopted.length === 0
        ? "No customized managed skill files found — baselines refreshed.\n"
        : `Adopted baselines for ${adopted.length} customized managed skill file(s):\n${adopted.map((file) => `- ${file}`).join("\n")}\n`;
      return { exitCode: 0, stdout: `Atlas doctor --adopt-skills\n\n${body}`, stderr: "" };
    }

    const diagnostics = options.diagnostics ?? {};
    const findings = await collectDoctorFindings(cwd, { diagnostics, resetSkills: parsed.flags.has("reset-skills") });

    if (parsed.flags.has("check-updates")) {
      const advisory = await updateAdvisoryFinding(options.fetchImpl);
      if (advisory) {
        findings.push(advisory);
      }
    }

    if (parsed.flags.has("json")) {
      const exitCode = exitCodeForFindings(findings);
      const payload = {
        classification: classifyFindings(findings),
        exitCode,
        findings: findings.map(serializeFinding)
      };
      return { exitCode, stdout: `${JSON.stringify(payload, null, 2)}\n`, stderr: "" };
    }

    // --handoff prints a prompt, not a drift report: exit 0 whenever the print
    // succeeds, so scripts can capture the prompt without re-deriving doctor's
    // own gate. Repos that cannot be handed off fail loudly instead.
    if (parsed.flags.has("handoff")) {
      if (classifyFindings(findings) === "manual") {
        return { exitCode: 2, stdout: "", stderr: "Cannot hand off: doctor found manual conflicts. Run atlas doctor first.\n" };
      }
      if (classifyFindings(findings) === "fixable" && !(await workspaceInitialized(cwd))) {
        return {
          exitCode: 1,
          stdout: "Atlas doctor handoff\n\nAtlas is not set up in this repository.\nRun: npx --yes @blazity-atlas/core@latest init\n",
          stderr: ""
        };
      }
      const report = diagnostics.contextSizeReport;
      const prompt = report?.hasRisk ? buildContextSizeHandoffPrompt(report) : null;
      return {
        exitCode: 0,
        stdout: prompt
          ? `Atlas doctor handoff\n\n${prompt}\n`
          : "Atlas doctor handoff\n\nNo context-size advisory found. No handoff needed.\n",
        stderr: ""
      };
    }

    if (parsed.flags.has("fix")) {
      const manual = findings.filter((finding) => finding.severity === "manual");
      // The downgrade guard is the one manual finding --force may override:
      // reverting newer managed content with an older CLI is a deliberate act.
      const blocking = parsed.flags.has("force")
        ? manual.filter((finding) => finding.code !== "atlas-version-ahead")
        : manual;
      if (blocking.length > 0) {
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
      await finalizeWorkspaceMetadata(cwd);
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

function serializeFinding(finding) {
  const payload = {
    code: finding.code,
    message: finding.message,
    severity: finding.severity,
    fixable: finding.fixable
  };
  for (const key of ["file", "line", "patternClass", "remediation", "details"]) {
    if (finding[key] !== undefined) {
      payload[key] = finding[key];
    }
  }
  return payload;
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

    if (parsed.command === "doctor" && !wantsPlainPath && mode.interactive && !parsed.flags.has("json") && !parsed.flags.has("handoff")) {
      process.stdout.write(`${doctorMark({ color: mode.color })}\n\n`);
      const diagnostics = {};
      const doctorResult = await runCli(argv, { diagnostics });
      if (doctorResult.stdout) {
        process.stdout.write(colorizeDoctorOutput(doctorResult.stdout, { color: mode.color }));
      }
      if (doctorResult.stderr) {
        process.stderr.write(doctorResult.stderr);
      }
      // Offer only on clean runs: exit 0 implies an initialized workspace with
      // no drift to fix first, and --fix output reports pre-fix sizes anyway.
      if (doctorResult.exitCode === 0 && !parsed.flags.has("fix") && diagnostics.contextSizeReport?.hasRisk) {
        await offerContextSizeHandoff(buildContextSizeHandoffPrompt(diagnostics.contextSizeReport));
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

async function loadMemoryCommandConfig(cwd) {
  const loaded = await loadConfig(cwd);
  if (!loaded.exists) {
    return { ok: false, error: "Atlas is not set up in this repository. Run atlas init first.\n" };
  }
  if (loaded.errors.length > 0) {
    return { ok: false, error: `Atlas config is invalid:\n${loaded.errors.map((error) => `- ${error}`).join("\n")}\n` };
  }
  return { ok: true, config: loaded.config, root: loaded.root };
}

function usageError(message) {
  return { exitCode: 2, stdout: "", stderr: `${message}\nRun atlas --help for usage.\n` };
}

function writeUsageError(message) {
  process.stderr.write(`${message}\nRun atlas --help for usage.\n`);
  process.exitCode = 2;
}

const valueFlags = new Set(["template", "root", "handoff"]);

function parseArgs(argv) {
  const flags = new Map();
  let command = null;
  let subcommand = null;
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
    } else if (command === "memory" && !subcommand) {
      subcommand = arg;
    } else {
      error = `Unexpected argument: ${arg}`;
    }
  }

  return { command, subcommand, flags, help, version, error };
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
  atlas doctor [--fix [--reset-skills]] [--force] [--json] [--check-updates]
               [--adopt-skills] [--handoff context-size]
  atlas memory pull
  atlas memory propose
  atlas update
  atlas --version

Commands:
  init          Install or refresh the config-driven Atlas workspace
  doctor        Inspect the Atlas workspace for drift; reports fixable and
                manual issues plus a non-blocking Advisory section
                for context-size and security signals
  doctor --fix  Apply safe deterministic repairs reported by doctor
  doctor --handoff context-size
                Print a safe agent prompt for context-size cleanup; exits 0
                when the prompt (or a no-op notice) is printed
  memory pull   Vendor the pinned memory.shared git tree into the configured
                shared memory tier and record hashes in atlas.lock.json
  memory propose
                Export local scope=org memory entries for review in the
                shared memory repository; never pushes or opens PRs
  update        Check npm for a newer Atlas release (network; never run
                implicitly) and print the pinned upgrade command

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
  --handoff <topic>  doctor only: print an agent handoff prompt
                     (supported topic: context-size)
  --reset-skills     doctor --fix only: overwrite customized managed skills
                     with the packaged versions
  --adopt-skills     doctor only: record current managed-skill contents as
                     their baselines, keeping deliberate customizations
  --check-updates    doctor only: also check npm for a newer release and
                     report it as an advisory (network; exit code unchanged)
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
