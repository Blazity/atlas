# Developer Adoption Plan — Wave 1

**Status:** Wave 1 implemented on `feat/dev-adoption-wave-1`; gate verdict recorded in the results path. Release conditions live in the gate artifact.

**Goal:** A cold, skeptical developer must see real value within five minutes of `npx --yes @blazity-atlas/core@latest init` — without explanation from a maintainer. This plan fixes verified first-run dead-ends, closes trust gaps, and rewrites the public surfaces developer-first.

**Why (audit summary):** A six-lens audit (CLI capability, cold-start run, README cold read, adjacent-tool landscape, discoverability metadata, managed-skill value) plus adversarial review found: the safety mechanics are strong and verified (idempotent init, `--dry-run`, dirty-tree refusal, content preservation, frozen 0/1/2 exit codes), but the first run dead-ends for common repo states, the README shows no proof, the package is invisible to search (no npm keywords), the repository recommended a CI gate before having CI of its own, and the review process gate had no committed verdict artifact in this repository. Everything below traces to one of those findings.

**Architecture stance:** All Wave-1 CLI changes are reporting-layer or additive. The frozen doctor exit-code contract (0 clean / 1 fixable / 2 manual, advisories never fail) is untouched. Managed-skill edits are batched into this single release because doctor byte-compares skill files and every skill-touching release turns consumer `doctor` runs exit-1 until `--fix` reruns.

---

## Wave 1 — this branch

### CLI: first-run dead-ends

- [x] 1. `doctor` in a repo with no workspace prints a one-line "not set up — run atlas init" message instead of a ~20-finding drift wall. Exit code stays 1 so CI still gates. `doctor --fix` behavior unchanged.
- [x] 2. Dirty-worktree refusals (init and `doctor --fix`) name the offending paths (first five `git status --porcelain` lines) and say when the dirt is untracked-only.
- [x] 3. `skill-link-collision` manual finding carries a remediation hint: move existing skills into the workspace skills directory, then `atlas doctor --fix`.
- [x] 4. Init next-step text prints both Claude Code invocations: bare `/atlas-setup` (skill discovered via the `.claude/skills` symlink) and `/atlas:atlas-setup` (Atlas plugin installs).
- [x] 5. Init refuses to scaffold from a repository subdirectory unless `--here` is passed; the message names the detected repository root. Prevents silent nested workspaces in monorepo packages.

### CLI: table stakes

- [x] 6. `--version` / `-v` prints the package version, exit 0.
- [x] 7. Bare `atlas` prints help, exit 0 (previously "Unknown command: (none)", exit 2).
- [x] 8. Errors print before usage, not after a full usage dump; unknown input points at `--help`.
- [x] 9. Interactive init validates flags exactly like the non-interactive path (typo'd flags no longer silently ignored on a TTY).
- [x] 10. Help documents `--dry-run`, `--fix`, `--ci`, `--here`, `--json`, and the frozen exit-code contract.
- [x] 11. `doctor --json` emits findings as JSON (`classification`, `exitCode`, `findings[]`) for CI/scripting. Additive; prose output unchanged.
- [x] 12. Remove the artificial 300ms spinner delay in interactive init ("performed proof, not displayed proof").
- [x] 13. Managed-block drift reports "differs from the current Atlas version" when the block exists but was edited; "missing" only when truly absent.
- [x] 14. Non-TTY init output ends with a commit nudge listing the scaffolded paths.

### Scaffold content

- [x] 15. `LANGUAGE.md` scaffold ships one clearly-marked example row (with a `<!-- TODO -->` marker so the placeholder advisory keeps nudging); memory README shows a good-vs-bad memory entry pair. Existing workspaces unaffected (these files are only written when missing).
- [x] 16. Default config path aliases drop plugin-specific `docs/superpowers/*` names in favor of neutral `docs/plans` / `docs/specs` conventions.

### Managed skills (batched — single release)

- [x] 17. `atlas-setup` no longer hard-depends on network `@latest`: prefer a locally-installed CLI, fall back to `npx`. Removes the offline stall and mid-session skill-rewrite skew.
- [x] 18. First-value proof becomes cold-context: answer a repo question from workspace files only, citing them — not the same context window grading itself.

### Package and listing metadata

- [x] 19. `package.json`: keywords array, benefit-first description, `homepage`, `bugs`, second bin alias `blazity-atlas` (the bare `atlas` bin collides with two widely-installed CLIs).
- [x] 20. `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` descriptions rewritten in benefit language with real keywords.
- [x] 21. One canonical value-prop string reused verbatim across package.json, README, plugin, and marketplace surfaces.

### Trust and community surface

- [x] 22. GitHub Actions CI: test suite + dogfooded local `doctor` on ubuntu/macos (Node 20/22); windows leg observational (`continue-on-error`) to gather symlink evidence before claiming support.
- [x] 23. `CONTRIBUTING.md` (local CLI only, full test suite before commit, conventional commits), issue forms (bug form asks for `atlas doctor` output + OS/Node), PR template.
- [x] 24. `SECURITY.md` with a private reporting channel and supported-versions note.
- [x] 25. `CHANGELOG.md` covering 0.2.0 → unreleased.
- [x] 26. README privacy statement: no telemetry, no network calls at runtime, one dependency, plain files only.

### README rewrite (developer-first)

- [x] 27. Text H1 + informational badges (npm version, CI, Node ≥20, MIT) replacing decorative shields.
- [x] 28. Quickstart with real pasted `init` and `doctor` terminal output.
- [x] 29. "What you just got": annotated tree, everything-is-committed-plain-files, uninstall instructions.
- [x] 30. "Safe to run on an existing repo" section from verified mechanics (idempotent, `--dry-run`, dirty-tree refusal, human content preserved).
- [x] 31. Honest comparison section: hand-written AGENTS.md, Spec Kit, session-memory plugins, harness linters — including what each does that Atlas does not.
- [x] 32. "Two weeks in" proof section quoting this repository's own workspace (lessons, vocabulary, a committed review verdict) and linking Built-with-Atlas repos' committed workspaces.
- [x] 33. CI recipe pinned to a version (not `@latest`), exit-code table stated once, advisories-never-fail explained.
- [x] 34. Agent matrix: Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI — anchored on the AGENTS.md standard; symlink surfaces described as convenience, not claimed as native integrations.
- [x] 35. Scope & non-goals from ADR-0001: structural + process gates today; execution gates out of scope; no runtime, no telemetry.
- [x] 36. FAQ: dirty worktree, existing AGENTS.md preserved, Windows status, custom root, phone-home, session-memory coexistence, monorepos.
- [x] 37. Built-with-Atlas compressed to a table linking each repo's committed workspace.

### Dogfooding

- [x] 38. Run a real `atlas-review` Gate on this change set and commit the verdict artifact to the results path — the results directory must not be empty in the flagship repo.
- [x] 39. `node bin/atlas.js doctor --fix` after skill edits so this repo's own workspace tracks the new managed skill content; full test suite green before every commit.

## Wave 2 — planned, not in this branch

- Memory-capture managed skill (one command captures a lesson/term/decision at session end; resolves paths through config; depersonalized by rule). Closes the loop doctor's `empty-memory` advisory points at; highest-value new capability identified by the audit.
- Lightweight review profile in `atlas-review` (inspection-first quick mode with a short artifact) so solo developers produce verdicts, not only enterprise flows.
- `atlas status` (with `--json`): one-screen workspace dashboard once workspaces have content worth showing.
- Managed-skill drift model: distinguish "edited locally" from "behind published version" (needs an ADR; byte-equality redesign).
- Windows support decision driven by the observational CI leg's evidence.
- Doctor validation of review-verdict artifacts once real artifacts exist and the format is pinned.
- Sandbox template repository ("try Atlas without touching your repo") with a matured workspace and devcontainer.
- Release workflow with npm provenance attestation.

## Maintainer actions outside the repo (commands, not run automatically)

- `gh repo edit Blazity/atlas --description "One command scaffolds the AGENTS.md, repo memory, and vocabulary every coding agent shares — and atlas doctor verifies the structure in CI with frozen exit codes."`
- `gh repo edit Blazity/atlas --add-topic context-engineering --add-topic coding-agents --add-topic agent-skills --add-topic ai-coding --add-topic memory`
- `npm deprecate @blazity-atlas/ai-harness@"*" "Renamed: use @blazity-atlas/core (npx --yes @blazity-atlas/core@latest init)"`
- Tag 0.2.0/0.2.1/0.3.0 retroactively; publish a GitHub release per version from CHANGELOG.md; publish 0.4.0 to npm after merge.
- Enable GitHub Discussions; disable the empty wiki; upload a 1280×640 social preview image.
