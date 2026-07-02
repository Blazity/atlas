# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

See pull request notes.

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
