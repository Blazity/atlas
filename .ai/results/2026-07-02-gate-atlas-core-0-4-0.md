# Gate Review — Atlas Core 0.4.0 Release Candidate

Mode: Gate. Scope: the developer-adoption change set (first-run CLI fixes, `--version`/`--json`/`--here`, subdirectory guard, dirty-path reporting, managed-skill bootstrap hardening, scaffold exemplars, package/plugin metadata, CI and community health files, README rewrite). Release transition: internal → published npm minor.

- **status**: conditional pass
- **preset**: Workflow (devtools)
- **risk level**: low
- **required changes** (conditions to clear before `npm publish`):
  1. CI workflow must run green on the default branch after merge — the README now carries a CI badge that would otherwise show a failure. Cleared by: package maintainer.
  2. The README CI recipe pins `0.3.0`; bump the pinned version in the same change that publishes `0.4.0`. Cleared by: package maintainer.
  3. This release edits managed skill content (`atlas-setup/SKILL.md`), so consumer `doctor` runs will report fixable drift once upgraded — the CHANGELOG must state that `doctor --fix` after upgrade is expected. Cleared by: package maintainer.
- **open questions**:
  - Windows symlink behavior is unverified; the CI Windows job is observational (`continue-on-error`). Treat Windows as unsupported until that leg is green.
  - The `.cursor/skills` and `.agents/skills` symlink surfaces have no verified native consumer; README describes them as provided conveniences, not integrations. Revisit when consumer behavior is confirmed.
- **evidence** (inspected first-hand, this worktree):
  - `npm test`: 161/161 pass, 0 fail.
  - `npm run pack:smoke`: pass (packaged tarball installs and runs).
  - Live smoke in a scratch git repository: `init` applied 22 changes and printed the handoff prompt; second `init` reported already up to date; `doctor` exited 0 with three advisories; `doctor` in an uninitialized repo printed the single init pointer with exit 1; `init` from a subdirectory refused without `--here` and scaffolded with it.
  - `node bin/atlas.js doctor` on this repository: no issues found.
  - `git diff --check`: clean.
- **approval boundaries**: a human approves the pull request before merge and runs `npm publish` manually; no automated publishing exists. Post-release, humans review consumer-facing drift reports through the issue forms (bug form collects `atlas doctor` output).
- **monitoring plan**: CI on every push/PR (test matrix + dogfooded local `doctor`); npm download and GitHub issue signals reviewed at the next release; the observational Windows CI leg gathers platform evidence.
- **owner**: package maintainer (Atlas Core).
- **next review date**: at the `0.4.0` publish, or 2026-08-01, whichever is sooner.

## Security Gate

- Data access: the CLI reads and writes only inside the repository root (path-escape validation on config paths and aliases); no network calls at runtime; no credentials handled.
- Never accessed: anything outside the repository root; remote services; environment secrets.
- Memory writes: scaffold templates only; durable-documentation rules shipped in the managed block require depersonalized artifacts (needs, decisions, reasons — no individuals, schedules, or absolute local paths).
- Memory scope: per-repository, committed to git, reviewed through normal PR flow.
- Human approval: dirty-worktree refusal gates mutating runs; `--force` is the explicit human override; publish is manual.
- Audit trail: every mutation is a plain-file git diff; doctor findings carry stable bracketed codes.
- Revocation: uninstall is deleting the workspace, the managed block, and three symlinks; no tokens exist to revoke.
