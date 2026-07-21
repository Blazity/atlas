# Plan: Config improvements — migrations, schema, suppression, profiles

**Status:** Proposed.
**Related:** `2026-07-07-atlas-core-roadmap.md` §2.1, §2.4, §2.5; lessons.md
("Doctor has no stale-config detection").

## Goal

Make `config.json` maintainable over the product's lifetime: workspaces
receive template evolution instead of freezing at install-time defaults,
editors understand the file, repos can tune doctor noise, and a minimal
profile lowers the adoption barrier.

## Why

- **The frozen-config gap is real and already bit this repository:** default
  path aliases changed in 0.4.0 (plugin-specific names dropped for neutral
  `docs/plans`/`docs/specs`), yet this repo's own config still carries the
  pre-0.4 alias set — and doctor reports the workspace healthy. Every
  release without migrations enlarges the population of silently outdated
  workspaces.
- Hand-rolled validation gives no editor support; a published JSON Schema is
  table stakes for a config-driven tool.
- Doctor-pattern research is unanimous: irrelevant findings are the #1
  reason users abandon doctor tools — suppression must be per-repo and
  visible.
- A full scaffold is the right default but a real barrier for repos that
  only want the doctor + AGENTS.md + memory; a minimal profile is the
  ceremony dial for adoption.

## Design

### 1. Config migrations

- Each release may ship migration steps keyed by version range:
  "from <0.4: replace alias set A with B **iff** the current value equals
  the old default" (i.e., untouched defaults migrate; customized values are
  left alone and reported).
- Detection of "untouched default" uses recorded baselines: extend
  `atlas.lock.json` with a config-defaults baseline hash per migratable key,
  written by init/`--fix` (the same three-way model as managed skills —
  ADR-0004 applied to config).
- Doctor findings: `config-migration-available` (fixable — additive or
  default-swap changes), `config-migration-conflict` (advisory — the key was
  customized; migration shown, not applied).
- `doctor --fix` applies pending migrations in order and re-stamps
  `atlasVersion`. Migrations are pure data transforms in one module, each
  with a fixture test (old config in, new config out).
- `schemaVersion` bumps only when a key's *shape* changes; migrations handle
  both same-schema evolution and future schema bumps.

### 2. Published JSON Schema

- Ship `schema/config.schema.json` (and one for the lockfile) in the
  package; scaffolded configs gain a `$schema` reference.
- Runtime validation stays hand-rolled (single-dependency rule; no ajv) —
  the schema is documentation and editor tooling, generated from one source
  of truth in `src/config.js` and verified in tests against the validator's
  accept/reject fixtures so the two cannot drift.

### 3. Per-repo check suppression

- `doctor: { suppress: ["finding-code", …] }` in config.
- Only advisories and fixable findings are suppressible; manual conflicts
  never are. Unknown codes are reported (typo guard).
- Suppressed findings appear as one summary line with a count — silenced,
  never invisible. `--json` lists them under `suppressed`.

### 4. Minimal profile

- `init --minimal` (and an interactive choice): config + AGENTS.md managed
  block + CLAUDE.md shim + memory + LANGUAGE.md. No plans/research/results
  directories, no skills, no symlink surfaces.
- Config records enabled features (`features` map); doctor checks only
  enabled features and offers the rest as one `feature-available` advisory
  line, so growth into the full scaffold is a `--fix`-style opt-in, not a
  nag wall.

## Non-goals

- No breaking `schemaVersion` bump in this plan.
- No auto-migration on plain `doctor` (report only; `--fix` applies).
- No third-party validator dependency.

## Phases

1. Suppression (smallest, immediately useful, unblocks security-scan rollout).
2. JSON Schema publication + `$schema` in scaffold.
3. Migration engine + the 0.4 alias migration as the proving case, dogfooded
   on this repository's own stale aliases.
4. Minimal profile (`features` map + init flag + doctor gating).

## Acceptance criteria

- This repository's config migrates its legacy alias set via
  `doctor --fix`, with the change visible as a reviewable diff.
- A config with a *customized* alias set is not modified and yields the
  conflict advisory naming old default, new default, and current value.
- An editor (VS Code) autocompletes config keys from the published schema.
- Suppressing a finding removes it from findings, adds it to the summary
  line and `--json.suppressed`; suppressing a manual conflict is rejected.
- `init --minimal` followed by `doctor` is clean (exit 0) with no directory
  or skill findings; enabling a feature later scaffolds it via `--fix`.
- Frozen exit-code contract untouched throughout.
