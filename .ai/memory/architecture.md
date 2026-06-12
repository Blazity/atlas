# Architecture

## Init is doctor in disguise

`init` applies the fixable subset of `collectDoctorFindings` — the same finding pipeline drives both commands, which is the source of init's idempotence: a second run finds nothing to fix and writes nothing.

## Exit contract (frozen)

`doctor` exits 0 clean / 1 fixable / 2 manual — the public CI contract. Advisory findings never affect exit codes and are never written or "repaired" by `--fix`; they render as a separate section.

## Division of labor

The CLI owns deterministic structure (scaffolding, path repair, symlink repair, managed file repair). The setup skill owns semantics (repository understanding, AGENTS.md content, memory, vocabulary).

## Config discovery

`.ai/config.json` first; when absent, the `.atlas` repo-root pointer file names the workspace root and config lives at `<root>/config.json`. With the default `.ai` root, no pointer file exists.

## Managed skills

The managed skills (atlas-setup, atlas-review) are managed files: doctor byte-compares them against the packaged versions and `doctor --fix` restores any drift. Legacy installs under skills/setup and skills/review are migrated by fixable move findings; a legacy directory that collides with the new one is only reported as an advisory, never auto-deleted.

## Agent launcher

The launcher table lives in `src/ui/launcher.js`: `claude`, `codex`, `cursor-agent`. Interactive sessions only.
