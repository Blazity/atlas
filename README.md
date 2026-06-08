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

**The standard for governed AI engineering**

Atlas is Blazity's standard for governed AI engineering. It brings agents into your development lifecycle through explicit rules, traceable artifacts, machine-enforced gates, and human review at the points where judgment matters: open source, self-hosted, and built to run on any defensible substrate.

> Agents can move fast. Your team still owns the system.

## Atlas Core

**Atlas Core** is the installable layer of the standard — the npm package `@blazity-atlas/core` (CLI `atlas`, plugin `atlas`). It brings the Atlas standard into any git repository: repo memory, rules, skills, templates, review artifacts, and operating context. Concretely, that means a repo-owned `.ai/` workspace, cross-agent `AGENTS.md` instructions, artifact routing, drift checks via `doctor`, and a local `setup` skill.

Run in the root of a git repository:

```bash
npx --yes @blazity-atlas/core@latest init
```

> Atlas Core was formerly published as AI Harness. The CLI and behavior are the same under the new name.

### Install

Public setup always goes through the published npm package. Do not copy this repository's `.ai/` folder or run local maintainer scripts to install Atlas Core in another product repository.

Pick a deterministic starter template when you already know the repository shape:

```bash
npx --yes @blazity-atlas/core@latest init --template app
```

Available templates are `standard`, `library`, `app`, `monorepo`, and `agency`.

Preview first:

```bash
npx --yes @blazity-atlas/core@latest init --dry-run
```

The installer is idempotent. It creates `.ai/config.json`, the configured `.ai/` folders, `AGENTS.md` managed instructions, a Claude shim, supported skill-discovery links, and a local `setup` skill when it can do so safely.

After installation, ask your agent to use the `setup` skill. The skill inspects the repository, asks whether you want standard setup or repository-specific customization, and fills the first useful `AGENTS.md`, vocabulary, and memory files. If you choose customization, the skill lazy-loads its longer customization workflow from `setup/customization.md`.

You can also start from the skill first. In that flow the agent must still use the npm package through `npx`, checks whether Atlas Core is installed, runs `init` or `doctor --fix` when safe, and only then continues into repository questions.

### Commands

```bash
npx --yes @blazity-atlas/core@latest init          # Install or refresh managed files
npx --yes @blazity-atlas/core@latest init --template app
npx --yes @blazity-atlas/core@latest init --dry-run
npx --yes @blazity-atlas/core@latest doctor        # Inspect drift; no writes
npx --yes @blazity-atlas/core@latest doctor --fix  # Apply safe deterministic repairs
npx --yes @blazity-atlas/core@latest doctor --fix --force
```

`doctor` is the dry run for repairs. It reports fixable issues separately from manual conflicts. `doctor --fix` only applies the fixable set, and requires `--force` when the git worktree is dirty.

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

## Built with Atlas

These products are built on the Atlas standard. Each lives in its own repository with its own roadmap, issue tracker, releases, and contribution path.

### Next.js Migration Plugin

<p>
  <img alt="Built with Atlas" src="https://img.shields.io/badge/built_with-atlas-FD6027?style=flat-square">
  <img alt="Status: beta" src="https://img.shields.io/badge/status-beta-BBED80?style=flat-square&labelColor=181B20">
  <img alt="GitHub stars" src="https://img.shields.io/github/stars/Blazity/nextjs-migration-plugin?style=flat-square">
</p>

Migrate existing websites into structured Next.js projects with guided discovery, component planning, build gates, and visual verification.

[Repository](https://github.com/Blazity/nextjs-migration-plugin)

---

### AI Workflow

<p>
  <img alt="Built with Atlas" src="https://img.shields.io/badge/built_with-atlas-FD6027?style=flat-square">
  <img alt="Status: beta" src="https://img.shields.io/badge/status-beta-BBED80?style=flat-square&labelColor=181B20">
  <img alt="GitHub stars" src="https://img.shields.io/github/stars/Blazity/ai-workflow?style=flat-square">
</p>

Move software work from issue to plan, implementation, review, and pull request through governed agent workflows.

[Repository](https://github.com/Blazity/ai-workflow)

## Claude Code Marketplace

Atlas is also the Blazity Claude Code plugin marketplace:

```text
/plugin marketplace add Blazity/atlas
/plugin install atlas@blazity
/atlas:setup

/plugin install nextjs-migration-plugin@blazity
```

The `atlas` plugin exposes the `setup` skill. It does not replace the npm package or duplicate installer logic; the skill still calls the same `npx --yes @blazity-atlas/core@latest ...` commands that a human would run.

More Blazity plugins will be listed here over time. Each plugin repository remains authoritative for issues, releases, license, and contribution.

## Repository Model

This repository is home to **Atlas Core** and the Blazity Claude Code plugin marketplace.

Use this repository for:

- Atlas Core issues and feature requests;
- cross-product proposals;
- marketplace and packaging ideas;
- questions about how the pieces fit together.

Products built with Atlas — the Next.js Migration Plugin and AI Workflow — keep their own repositories, roadmaps, releases, and contribution paths. Open implementation issues in the specific product repository whenever possible.

## Explore

<p>
  <a href="https://blazity.com/atlas"><img alt="Atlas website" src="https://img.shields.io/badge/Atlas-website-FD6027?style=for-the-badge"></a>
  <a href="https://blazity.com"><img alt="Blazity" src="https://img.shields.io/badge/Blazity-home-181B20?style=for-the-badge"></a>
  <a href="https://github.com/Blazity"><img alt="Blazity GitHub" src="https://img.shields.io/badge/GitHub-Blazity-181717?style=for-the-badge&logo=github"></a>
</p>
