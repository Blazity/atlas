---
name: atlas-compact
description: Use when AI context needs cleanup — atlas doctor context-size advisories, an oversized AGENTS.md or CLAUDE.md, bloated memory or vocabulary files, or durable docs that need compaction, relocation, or dedup
---

# Compact AI Context

## Overview

Use this skill when `atlas doctor` reports context-size advisories or AI-facing context files grow oversized. The published CLI owns deterministic measurement — which files count, their sizes, thresholds, and statuses. This skill owns semantic judgment — what to cut, move, merge, or keep. Never reimplement measurement, guess sizes, or invent thresholds.

Call the CLI through `npx`, preferring a locally installed `@blazity-atlas/core` (`npx --no-install @blazity-atlas/core …`) and falling back to the published package only when none is installed. Every `npx --yes @blazity-atlas/core@latest …` command in this skill is the fallback spelling of that rule, not an instruction to skip the local copy.

This skill edits content only. Structure repair — directories, config, symlinks, managed files — stays with `doctor --fix`.

Run the phases below in order.

## Phase 1 — Deterministic Measurement

From the repository root, run:

```bash
npx --no-install @blazity-atlas/core doctor
```

Follow the result before compacting anything:

- Manual findings (exit 2): summarize the conflicts and stop.
- Fixable drift (exit 1): offer `npx --yes @blazity-atlas/core@latest doctor --fix` first — structure repair precedes compaction. If `--fix` refuses because of a dirty worktree, ask the user whether to commit, stash, or explicitly rerun with `--force`; never use `--force` automatically.
- No context-size advisory and no user-named target: report that the AI context is within thresholds and stop.

Capture the authoritative per-file worklist:

```bash
npx --no-install @blazity-atlas/core doctor --handoff context-size
```

Treat its entry lines as the worklist; do not re-measure by hand.

## Phase 2 — Read and Classify

Resolve every path through the workspace config — never hardcode `.ai/`: read `.ai/config.json`, or when absent, follow the `.atlas` repo-root pointer to `<root>/config.json`.

Read each flagged file and bucket its content:

- Commands, invariants, and safety rules → stay in root instructions.
- Durable product, architecture, stack, and lesson detail → configured memory files.
- Decisions and rationale → configured decisions/ADR paths.
- Canonical terms → the configured language file.
- Duplicated content → keep one canonical location and reference it from the rest.
- Stale content contradicted by the repository (with evidence) → delete.

Managed Atlas skill files are report-only: never hand-edit them — the byte-equality drift check reverts any edit on the next `doctor --fix`. An oversized managed skill is package-maintenance work; record it, do not fix it locally.

## Phase 3 — Propose

Present a per-file plan before touching anything: exact moves (source section → destination path), merges, deletions with reasons, and expected size deltas. Never rewrite silently; get explicit approval, whole-plan or per-file.

Everything relocated or rewritten follows the durable-documentation rules: record needs, decisions, and reasons — never individuals or internal process. Keep personal names, private schedules, internal-only references, and absolute local paths out of workspace artifacts.

## Phase 4 — Apply

Apply approved edits only. Preserve the AGENTS.md managed block, user rules, commands, and safety boundaries. Do not create new documentation roots and do not touch config or structure — that is the CLI's job.

## Phase 5 — Re-verify

1. Rerun `npx --no-install @blazity-atlas/core doctor` — actually run it, never assume the result.
2. Show before/after context-size lines. The exit code must be unchanged or better.
3. Advisories never affect exit codes; do not chase zero warnings at the cost of deleting real guidance. If a file still warns after one bounded iteration, record the residual as accepted with a reason.
4. Suggest a commit of the compaction result.

## Boundaries

- Missing or thin context (empty vocabulary, empty memory, setup pending) → the `atlas-setup` skill.
- Reviews, gates, and verdicts on AI tools and changes → the `atlas-review` skill.
- Workspace structure, managed skills, and config → the Atlas CLI (`init`, `doctor --fix`).
