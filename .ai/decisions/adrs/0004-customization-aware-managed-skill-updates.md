---
status: accepted
date: 2026-07-06
---

# Managed skill updates become customization-aware via a baseline lockfile

Managed skill files were byte-compared against the copies bundled in the running package: any difference was a fixable `stale-*` finding and `doctor --fix` overwrote the file. The comparison could not distinguish "outdated" from "deliberately customized", so local skill edits were flagged forever and silently discarded on the next fix run. The same mechanism made version skew dangerous in both directions: an older CLI's `--fix` reverted newer managed content (channel drift), and nothing recorded which package version last wrote a workspace.

Decision: three changes, shipped together.

1. **Version stamp.** `init` and successful `doctor --fix` write the running package version as `atlasVersion` in `config.json`. A newer CLI than the stamp is an advisory (`atlas-version-behind`); an older CLI is a manual conflict (`atlas-version-ahead`) that blocks `--fix` unless `--force` is passed. A missing stamp produces no finding and is written on the next `init`/`--fix`.
2. **Baseline lockfile.** A machine-owned `<root>/atlas.lock.json` records the sha256 of each managed file as written. Doctor classifies each managed file three ways: matches packaged → clean; differs from packaged but matches its baseline → outdated (fixable, safe overwrite); differs from both, or has no baseline → **customized**, an advisory that `--fix` skips. Customizations resolve explicitly: `doctor --fix --reset-skills` overwrites with packaged content; `doctor --adopt-skills` re-baselines the current content so the advisory stays quiet until the packaged copy changes again.
3. **Frozen exit codes hold.** All new findings map into the existing 0/1/2 semantics; advisories never affect the exit code (ADR-0003).

## Considered Options

- **Customized as manual conflict (exit 2)** — guarantees no silent divergence, but fails CI on every deliberate customization; punishes the exact behavior the lockfile exists to support. Rejected; a strict opt-in flag can be added later if demand appears.
- **Baselines inside `config.json`** — one file, no new scaffold surface, but machine-generated hash churn lands in a file users hand-edit and review. Rejected in favor of the lockfile.
- **Ship historical release hashes in the package** — would let pre-lockfile workspaces classify old-but-untouched files as safely outdated instead of customized. Deferred: adds a per-release maintenance obligation; the one-time `--reset-skills` migration is documented instead.

## Consequences

- Deliberate skill edits survive `doctor --fix`. The old overwrite behavior is opt-in via `--reset-skills`.
- Pre-lockfile workspaces upgrading the package see their (old, untouched) skills classified as customized once; the documented migration is a single `doctor --fix --reset-skills`. Never-customized workspaces that upgrade in lockstep from then on are unaffected.
- Adopted files no longer receive upstream skill updates silently; the `customized-skill` advisory returns whenever a new release changes the packaged copy.
- Tests that pinned overwrite-on-fix move behind `--reset-skills` with this ADR as the recorded reason.
- The lockfile is machine-owned: hand-edits are unsupported; corrupt JSON is a manual finding.
