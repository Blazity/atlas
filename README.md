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

# Atlas

**The agentic repo standard.**

Atlas gives a git repository the structure that local coding agents need before they can work safely: shared instructions, repo memory, artifact paths, setup skills, and lightweight gates for plans, decisions, research, and results.

Run one command in the root of your project. Atlas creates the deterministic structure, then hands the rest to your local agent so it can inspect the repository and finish the setup with project-specific context.

## Start Here

```bash
npx --yes @blazity-atlas/core@latest init
```

Atlas previews the files it wants to write, asks for confirmation in an interactive terminal, creates the `.ai/` workspace and agent entrypoints, then prints the next prompt to give your coding agent.

Claude Code users can start from the Atlas marketplace instead:

```text
/plugin marketplace add Blazity/atlas
/plugin install atlas@blazity
/atlas:setup
```

Both paths use the same published package, `@blazity-atlas/core`. The Claude Code plugin exposes the setup skill; the CLI still owns the deterministic file structure.

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
  skills/setup/
AGENTS.md
CLAUDE.md
.claude/skills -> ../.ai/skills
.agents/skills -> ../.ai/skills
.cursor/skills -> ../.ai/skills
```

`.ai/config.json` is the source of truth for artifact locations. If your repo already has useful docs, Atlas can map conventional paths into the `.ai/` workspace instead of inventing another documentation system.

## How Setup Continues

The first command only writes the shared structure. The local `setup` skill then:

- inspects the repository before asking questions;
- lets the agent recommend the right template after reading the project;
- fills `AGENTS.md`, project vocabulary, and stable memory files;
- keeps Claude, Codex, Cursor, and similar agents pointed at one shared workspace;
- leaves plans, decisions, research, and results in predictable locations.

This keeps the human flow simple: install Atlas once, then let the local agent adapt it to the actual repository.

## Why Atlas Exists

AI can generate code quickly. That is no longer the hard part.

The hard part is keeping the output understandable, reviewable, secure, and aligned with the system your team actually needs to run.

Atlas is built for teams that want AI acceleration without giving up ownership. It brings agents into the delivery process through explicit rules, traceable artifacts, machine-enforced gates, and human review at the points where judgment matters.

## Principles

- **Ownership stays with the team.** Tools run in your repo, your cloud, or your chosen substrate.
- **Every agent needs a gate.** Tests, evals, policy checks, and review rubrics should run before merge.
- **Artifacts compound.** Plans, decisions, logs, and lessons make the next run stronger.
- **Review moves up the stack.** Humans should review architecture, adapter boundaries, risk, and product intent instead of every generated line.
- **No black boxes.** Agent work should be traceable, auditable, and reversible.
- **Substrates change. Systems remain.** Atlas is designed to survive model and infrastructure churn.

## Useful Later

Run `atlas doctor` to inspect an existing Atlas workspace for drift. Run `atlas doctor --fix` to apply safe deterministic repairs when the worktree is ready for changes.

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
