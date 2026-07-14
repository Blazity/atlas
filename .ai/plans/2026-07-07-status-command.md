# Plan: `atlas status` — the workspace dashboard

**Status:** Proposed.
**Related:** `2026-07-07-atlas-core-roadmap.md` §2.3; Wave 2 backlog item.

## Goal

One read-only screen that answers "is this workspace alive or a fossil?" —
artifact inventory, freshness, budgets, and health at a glance, with `--json`
for scripting. Doctor answers "is the structure correct"; status answers
"is the content living".

## Why

- The `empty-memory` and `setup-pending` advisories hint at liveness but
  nothing shows it positively; a lead evaluating Atlas on a second repo has
  no quick proof the standard is being used, only that it is installed.
- Every mature doctor-style CLI pairs diagnosis with a dashboard (`git
  status` is the model: cheap, habitual, glanceable).
- The memory standard and review verdicts produce dated, structured
  artifacts — status is where that investment becomes visible daily.

## Design

Sections (each one line unless expanded with `-v`):

1. **Identity:** template, workspace root, `atlasVersion` stamp vs CLI
   version, setup state.
2. **Health:** last doctor classification (recomputed live — status runs the
   same collectors read-only), counts by severity, suppressed-finding count.
3. **Artifacts:** per artifact type (plans, research, decisions/ADRs,
   results, memory, vocabulary): count, newest and oldest dates, and for
   plans a status breakdown once the plan lifecycle exists.
4. **Memory freshness:** entry count, % with metadata, stale/broken-citation
   counts, date of last memory commit (from git log on the memory paths).
5. **Context budgets:** the context-size analyzer's usage bars, compressed
   to one line per over-threshold file.
6. **Last review verdict:** newest results artifact — verdict, date, scope.

`atlas status --json` emits the same data structurally (stable key names,
documented; additive evolution only). Exit code is always 0 — status is a
report, never a gate; gating stays doctor's job.

## Non-goals

- No network, no history trends (git already stores history; a `--since`
  comparison can come later), no write operations, no new findings.

## Phases

1. Read-only collectors reuse: factor doctor's finding collection so status
   can run it without side effects (largely exists — init already reuses it).
2. Renderer (TTY with the existing theme; plain for pipes) + `--json`.
3. Memory-freshness section (depends on memory-standard phase 1 for entry
   parsing; degrades gracefully to file counts/dates without it).
4. Documentation + README screenshot.

## Acceptance criteria

- Runs in a fresh scaffold, a mature workspace, and an uninitialized repo
  (prints the "run atlas init" pointer) without error, always exit 0.
- `--json` output is stable across two consecutive runs on an unchanged
  workspace (no timestamps of "now", only artifact dates).
- No file writes under any circumstances (verified by test with a read-only
  filesystem fixture or write-spy io).
- Dogfood: the README's "two weeks in" narrative gains a real `atlas status`
  capture from this repository.
