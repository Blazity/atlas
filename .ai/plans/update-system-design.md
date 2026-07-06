# Design: Atlas Update System

Status: accepted — all phases approved for implementation
Scope: version awareness for `@blazity-atlas/core`, customization-safe managed-skill updates, opt-in update discovery.

## Problem

Atlas has no update system today. Three gaps, in increasing severity:

1. **No version awareness.** The package version is only used for `atlas --version`. Nothing records which version scaffolded a workspace, so `doctor` cannot say "this workspace is behind" or "this CLI is older than the workspace" — the second case is the channel-drift hazard: an older CLI's `doctor --fix` silently reverts newer managed skill content.
2. **No customization protection.** Managed skill files are byte-compared against the running package's bundled copies (`src/doctor.js` `addManagedSkillFileFinding`). Any deliberate local edit is indistinguishable from staleness and is flagged `stale-*` forever; `--fix` overwrites it with no merge or backup.
3. **No update discovery.** Workspaces pin a version in CI (per README guidance) and never learn a newer release exists.

## Constraints

- `doctor` exit codes are a frozen contract (0 clean / 1 fixable / 2 manual). New findings must map into existing semantics; advisories never affect exit codes.
- `doctor` must stay deterministic and offline-safe — it runs in CI. Network access must be opt-in only.
- Keep the dependency footprint: no new runtime deps. Use native `fetch` (Node 18+), `node:crypto` for hashing, and a hand-rolled major.minor.patch comparison (full semver ranges are not needed).
- `.ai/config.json` stays at `schemaVersion: 1`; additions must be optional fields that old CLIs ignore.

## Phase 1 — Version stamping and downgrade guard (offline, foundation)

`init` and every successful `doctor --fix` write the running package version into `.ai/config.json`:

```json
{ "schemaVersion": 1, "atlasVersion": "0.4.0", ... }
```

`doctor` compares the stamp against the running version:

| Condition | Finding | Exit impact |
| --- | --- | --- |
| running > stamped | `atlas-version-behind` advisory: "workspace stamped 0.3.0, running 0.4.0 — run `doctor --fix` to update managed files" | none (advisory) |
| running < stamped | `atlas-version-ahead` manual conflict; `--fix` refuses these files without `--force` | exit 2 |
| stamp missing (pre-upgrade workspace) | no finding; stamp is written on the next `init`/`--fix` | none |

The `running < stamped` guard is the generic fix for channel drift: an older published CLI can no longer clobber newer managed content, in any repo, without an explicit `--force`.

Implementation notes:
- `validateConfig` accepts optional `atlasVersion` string (`X.Y.Z`, optional prerelease suffix treated as older than its release).
- Version comparison is a ~10-line numeric compare in a new `src/version.js`.
- In-repo development stays on `npm run atlas` per AGENTS.md; a prerelease stamp (e.g. `0.5.0-dev`) compares as expected against published versions.

## Phase 2 — Customization-aware skill updates (three-way compare)

Record a baseline for every managed file so `doctor` can distinguish "outdated" from "deliberately customized".

**Baseline store:** `.ai/atlas.lock.json`, machine-owned, written by `init`/`doctor --fix`:

```json
{
  "schemaVersion": 1,
  "atlasVersion": "0.4.0",
  "files": {
    "skills/atlas-setup/SKILL.md": { "sha256": "…" },
    "skills/atlas-setup/customization.md": { "sha256": "…" },
    "skills/atlas-review/SKILL.md": { "sha256": "…" },
    "skills/atlas-compact/SKILL.md": { "sha256": "…" }
  }
}
```

A separate lockfile rather than fields in `config.json` because config is human-edited and hand-reviewed; hashes are machine churn on every release and would add noisy diffs to a file users own. Lockfile semantics are a familiar mental model.

**Classification per managed file** (current = on disk, packaged = bundled in running CLI, baseline = locked hash):

| current vs packaged | current vs baseline | Classification | Finding | `--fix` behavior |
| --- | --- | --- | --- | --- |
| equal | — | clean | none (refresh lock if missing) | — |
| differs | equal | outdated | `stale-*` fixable (exit 1) | overwrite, update lock |
| differs | differs | customized | `customized-skill` advisory (exit 0) | skip; print how to resolve |
| differs | no baseline | unknown — treat as customized | `customized-skill` advisory | skip |

Resolving a customized file, two explicit verbs on `doctor`:
- `doctor --fix --reset-skills` — overwrite customized files with packaged content (today's behavior, now opt-in).
- `doctor --adopt-skills` — re-baseline: record the current content's hash as the baseline, silencing the advisory until the file changes again. This is the supported way to keep a deliberate customization. Note: adopted files no longer receive upstream skill updates automatically; the advisory returns when a new package version changes the packaged copy (packaged differs from both current and baseline).

**Behavior change to call out:** a pre-lockfile workspace with locally edited skills currently exits 1 (stale, fixable). Under this design it exits 0 with a `customized-skill` advisory, because the CLI cannot prove the edit wasn't deliberate. This is the conservative choice: the failure mode shifts from "CI red + silent clobber on fix" to "informational until a human decides". The exit-code *meanings* are unchanged; one finding migrates category. Document in CHANGELOG as the one notable migration effect.

**Migration:** first `doctor` run with the new CLI emits a fixable `missing-lockfile` finding; `--fix` writes the lockfile (baseline = packaged hashes for clean files; customized files get no baseline until adopted or reset).

The dirty-worktree guard on `--fix` stays as-is; it remains the backstop for uncommitted work.

## Phase 3 — Update discovery (opt-in network)

New command, check-only:

```
atlas update            # check registry, print status + upgrade instructions
```

- Single GET to `https://registry.npmjs.org/@blazity-atlas/core` with `Accept: application/vnd.npm.install-v1+json` (abbreviated metadata), ~3s timeout via `AbortSignal.timeout`.
- Compares `dist-tags.latest` against the running version and the workspace stamp; prints the pinned-upgrade command the README already teaches: `npx --yes @blazity-atlas/core@<latest> doctor --fix`.
- Network failure prints a note and exits 0 — discovery is best-effort by definition.

Optionally, `doctor --check-updates` runs the same check and emits an `update-available` advisory. Never on by default: `doctor` must stay deterministic and offline-safe for CI. No cache/throttle needed while the check is invocation-only.

Explicitly out of scope: self-update (rewriting the installed package), auto-fix on update, and any telemetry.

## Rollout

1. **Phase 1** — small, offline, no behavior change for clean workspaces; immediately closes the channel-drift hazard.
2. **Phase 2** — the substantive change; existing tests asserting overwrite-on-fix (`test/doctor.test.js` "restores the managed … skill") move behind `--reset-skills`.
3. **Phase 3** — independent of 1–2; can ship any time after 1 (it reuses the version comparison).

Each phase is a separate release with its own CHANGELOG entry, since each changes what `doctor` reports.

## Resolved decisions

- `customized-skill` is an **advisory** (exit 0). A strict mode could be added later behind a config flag if demand appears; the ADR records the alternative.
- Baselines live in a separate **`<root>/atlas.lock.json`** lockfile, not in `config.json`.
- Update discovery ships as both the `atlas update` command and an opt-in `doctor --check-updates` advisory flag.
- All three phases are approved for implementation. The drift-model change (Phase 2) is recorded as ADR-0004.
