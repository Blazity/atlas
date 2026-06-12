<p align="center">
  <a href="https://blazity.com/atlas">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/atlas-logo-dark.svg">
      <img alt="Atlas" src="assets/atlas-logo-light.svg" width="202">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://blazity.com/atlas"><img alt="Atlas" src="https://img.shields.io/badge/Atlas-Governed_AI_Engineering-FD6027?style=for-the-badge"></a>
  <img alt="Self hosted" src="https://img.shields.io/badge/self--hosted-ready-181B20?style=for-the-badge">
  <img alt="Open source" src="https://img.shields.io/badge/open_source-standard-BBED80?style=for-the-badge&labelColor=181B20">
</p>

---

**Coding agents are only as good as the context your repository gives them.**

Atlas makes that context structured, durable, and machine-checked. One command scaffolds the shared instructions, repo memory, artifact paths, and managed skills agents need — plus two kinds of gates: structural gates that keep the workspace sound and process gates that turn reviews into recorded verdicts.

The payoff compounds over time. You keep working normally, while Atlas turns useful project context into documentation that grows with the repo and makes each next agent run more effective.

Atlas creates the deterministic structure, then hands the rest to your local agent so it can inspect the repository and finish the setup with project-specific context.

## Start Here

```bash
npx --yes @blazity-atlas/core@latest init
```

Atlas first asks where the workspace should live — default `.ai`, any repo-relative path works — then previews the files it wants to write, asks for confirmation in an interactive terminal, creates the workspace and agent entrypoints, and prints the next prompt to give your coding agent. If it detects an agent CLI on your machine (`claude`, `codex`, `cursor-agent`), it can offer to launch it with that prompt directly.

Non-interactive setups pass `--root <dir>` instead. Custom roots are discovered through a one-line `.atlas` pointer file at the repo root; the default `.ai` needs no pointer, and every example below uses it.

Claude Code users can start from the Atlas marketplace instead:

```text
/plugin marketplace add Blazity/atlas
/plugin install atlas@blazity
/atlas:atlas-setup
```

Both paths use the same published package, `@blazity-atlas/core`. The Claude Code plugin exposes the managed skills; the CLI still owns the deterministic file structure.

## What Atlas Adds

Atlas keeps AI-facing documentation small, explicit, and owned by the repository:

```text
.ai/
  config.json
  LANGUAGE.md
  memory/
  plans/
  research/
  decisions/
  decisions/adrs/
  results/
  skills/atlas-setup/
  skills/atlas-review/
AGENTS.md
CLAUDE.md
.claude/skills -> ../.ai/skills
.agents/skills -> ../.ai/skills
.cursor/skills -> ../.ai/skills
```

`.ai/config.json` is the source of truth for artifact locations. If your repo already has useful docs, Atlas can map conventional paths into the `.ai/` workspace instead of inventing another documentation system.

## How Setup Continues

The first command only writes the shared structure. The printed prompt tells your agent to read `.ai/skills/atlas-setup/SKILL.md` and follow it. The `atlas-setup` skill then:

- inspects the repository before asking questions;
- lets the agent recommend a template after reading the project — the five templates differ only in path aliases (which conventional docs folders get migrated), so the choice is low-stakes, agent-proposed, and refinable later;
- fills `AGENTS.md`, project vocabulary, and stable memory files;
- keeps Claude, Codex, Cursor, and similar agents pointed at one shared workspace;
- leaves plans, decisions, research, and results in predictable locations.

This keeps the human flow simple: install Atlas once, then let the local agent adapt it to the actual repository. As work continues, plans, decisions, research, and lessons accumulate where agents can find them instead of disappearing into chat history.

## Reviews That Leave a Verdict

Atlas manages a second skill: `atlas-review`. It walks a change through five modes — Intake, Plan, Review, Gate, and Postmortem — and writes its verdict (pass, conditional pass, or fail) as an artifact into the results path, where the next agent run can find it.

Claude Code users run `/atlas:atlas-review`. Any other agent gets the same behavior from one instruction: "read `.ai/skills/atlas-review/SKILL.md`".

## Why Atlas Exists

AI can generate code quickly. That is no longer the hard part.

The hard part is keeping the output understandable, reviewable, secure, and aligned with the system your team actually needs to run.

Atlas is built for teams that want AI acceleration without giving up ownership. It brings agents into the delivery process through explicit rules, traceable artifacts, structural and process gates, and human review at the points where judgment matters.

Atlas Core ships two kinds of gates today. Structural gates are `doctor`'s deterministic workspace checks, with frozen exit codes (0 clean, 1 fixable drift, 2 manual conflicts) ready for CI. Process gates are the review skill's evidence-based verdicts, written into the workspace. Execution gates — running tests, evals, and policy checks before merge — are where the standard points next, not what Core runs today.

## Principles

- **Ownership stays with the team.** Tools run in your repo, your cloud, or your chosen substrate.
- **Every agent needs a gate.** Atlas Core ships structural and process gates today; execution gates — tests, evals, and policy checks running before merge — are where the standard points next.
- **Artifacts compound.** Plans, decisions, logs, and lessons make the next run stronger.
- **Review moves up the stack.** Humans should review architecture, adapter boundaries, risk, and product intent instead of every generated line.
- **No black boxes.** Agent work should be traceable, auditable, and reversible.
- **Substrates change. Systems remain.** Atlas is designed to survive model and infrastructure churn.

## Useful Later

Run `atlas doctor` to inspect an existing Atlas workspace for drift. Run `atlas doctor --fix` to apply safe deterministic repairs when the worktree is ready for changes.

Doctor also reports advisories — setup still pending, empty vocabulary or memory. They inform you and nothing else: advisories never fail builds and never block `--fix`.

### Doctor as a CI gate

```yaml
- name: Atlas structural gate
  run: npx --yes @blazity-atlas/core@latest doctor
```

The exit codes are a frozen contract: 0 means the workspace is clean, 1 means fixable drift, 2 means conflicts that need a human — advisories never fail the build.

## Explore

<p>
  <a href="https://blazity.com/atlas"><img alt="Atlas website" src="https://img.shields.io/badge/Atlas-website-FD6027?style=for-the-badge"></a>
  <a href="https://blazity.com"><img alt="Blazity" src="https://img.shields.io/badge/Blazity-home-181B20?style=for-the-badge"></a>
  <a href="https://github.com/Blazity"><img alt="Blazity GitHub" src="https://img.shields.io/badge/GitHub-Blazity-181717?style=for-the-badge&logo=github"></a>
</p>

## Built with Atlas

Examples of projects built on the Atlas standard:

### Next.js Migration Plugin

<p>
  <img alt="Built with Atlas" src="https://img.shields.io/badge/built_with-atlas-FD6027?style=flat-square">
  <img alt="Status: beta" src="https://img.shields.io/badge/status-beta-BBED80?style=flat-square&labelColor=181B20">
  <img alt="GitHub stars" src="https://img.shields.io/github/stars/Blazity/nextjs-migration-plugin?style=flat-square">
</p>

Migrate existing websites into structured Next.js projects with guided discovery, component planning, build gates, and visual verification.

[Repository](https://github.com/Blazity/nextjs-migration-plugin)

### AI Workflow

<p>
  <img alt="Built with Atlas" src="https://img.shields.io/badge/built_with-atlas-FD6027?style=flat-square">
  <img alt="Status: beta" src="https://img.shields.io/badge/status-beta-BBED80?style=flat-square&labelColor=181B20">
  <img alt="GitHub stars" src="https://img.shields.io/github/stars/Blazity/ai-workflow?style=flat-square">
</p>

Move software work from issue to plan, implementation, review, and pull request through governed agent workflows.

[Repository](https://github.com/Blazity/ai-workflow)
