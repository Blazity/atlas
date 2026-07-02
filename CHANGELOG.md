# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `atlas --version` / `-v`; help output now documents every flag and the
  frozen exit-code contract.
- `atlas doctor --json` emits findings as structured data for CI and scripting.
- `init --here` for deliberate nested workspaces; without it, init refuses
  repository subdirectories and names the repository root.
- Dirty-worktree refusals list the offending paths and say when only
  untracked files are present.
- `doctor` in a repository without a workspace prints a single
  "run atlas init" pointer instead of a finding wall (exit code unchanged).
- `skill-link-collision` findings carry a concrete remediation hint.
- `stale-managed-block` finding code distinguishes an edited managed block
  from a missing one.
- Language and memory scaffolds ship one marked example entry each; init
  output ends with a commit nudge and both Claude Code invocations.
- CI workflow (ubuntu/macos matrix, observational Windows leg), issue forms,
  PR template, CONTRIBUTING.md, SECURITY.md.
- npm keywords, benefit-first package and plugin descriptions,
  `blazity-atlas` bin alias, homepage and bugs metadata.

### Changed

- Errors print before usage; bare `atlas` shows help with exit 0; the
  interactive init path validates flags like the non-interactive path.
- Default path aliases use neutral docs folders (`docs/plans`, `docs/specs`,
  `docs/adrs`).
- `atlas-setup` skill prefers a locally installed CLI before the network
  fallback and requires a cold-context first-value proof. This is a managed
  skill edit: after upgrading, `atlas doctor` reports fixable drift once —
  run `atlas doctor --fix`.
- README rewritten developer-first: real terminal output, comparison table,
  scope and non-goals, FAQ, privacy statement.
- Removed the artificial spinner delay in interactive init.

## [0.3.0] - 2026-06-12

### Added

- Review skill shipped as second managed skill (`atlas-review`:
  Intake/Plan/Review/Gate/Postmortem with verdict artifacts).
- Seven-phase setup skill.
- Workspace-root question with `--root` flag and `.atlas` pointer discovery.
- Advisory doctor severity with `setupState` sentinel.
- `--yes`/`--force` split.
- Agent launcher (`claude`/`codex`/`cursor-agent`).

### Changed

- Managed skills renamed to `atlas-setup`/`atlas-review` with automatic
  legacy migration.
- `.gitkeep` handling for empty artifact directories.

## [0.2.1] - 2026-06-09

### Changed

- README onboarding simplification; no functional changes.

## [0.2.0] - 2026-06-08

### Changed

- Package consolidated into Blazity/atlas as `@blazity-atlas/core`
  (formerly `@blazity-atlas/ai-harness`).

### Added

- Deterministic templates: standard, library, app, monorepo, agency.
- Claude Code plugin + marketplace path.
