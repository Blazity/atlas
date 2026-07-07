---
name: atlas-memory
description: Use at session end to capture durable lessons, vocabulary, decisions, and memory promotion proposals in an Atlas workspace
---

# Capture Atlas Memory

## Overview

Use this skill near the end of meaningful work, when a session produced durable context that should help future agents act better. The CLI owns deterministic checks: entry parsing, duplicate/stale/citation/supersede advisories, scratch-tier scaffolding, and shared-memory vendoring. This skill owns semantic judgment: what is worth remembering, how it should be depersonalized, and whether it is an ADD / UPDATE / DELETE / NOOP.

Run the phases below in order.

## Phase 1 — Resolve Paths

Resolve every destination through the workspace config. Read `.ai/config.json`, or when absent follow the `.atlas` repo-root pointer to `<root>/config.json`.

Use configured paths only:

- Durable memory: configured `paths.memory`.
- Vocabulary: configured `paths.language`.
- Decisions and ADRs: configured `paths.decisions` and `paths.adrs`.
- Scratch capture: `<configured memory>/local/`.
- Shared proposals: entries marked `scope=org`, exported with `atlas memory propose`.

Do not create new documentation roots. If a referenced skill or template names a path outside the configured Atlas workspace, map it through `artifactRoot`, `paths`, and `pathAliases` first.

## Phase 2 — Read Existing Memory

Read the relevant memory files before proposing a write. Prefer an index pass first: filenames, headings, and Atlas metadata comments.

Atlas entry metadata, when used, lives on the line immediately after a markdown heading:

```markdown
## Stable lesson title
<!-- atlas: id=stable-lesson-title verified=2026-07-07 cites=src/example.js scope=repo -->
```

Plain markdown is valid memory. Add metadata only when lifecycle checks should apply.

## Phase 3 — Classify

For every proposed write, state exactly one classification before editing:

- ADD — new durable memory that is absent today.
- UPDATE — existing memory remains true but needs clearer wording, citations, metadata, or consolidation.
- DELETE — existing memory is false, obsolete, duplicated, or superseded; prefer `superseded-by` when history should stay reviewable.
- NOOP — the session produced no durable memory or the fact is already captured.

The proposal must include the target path, heading, classification, and reason. Do not write silently.

## Phase 4 — Depersonalize and Gate Signal

Capture repository needs, decisions, constraints, and reasons. Do not record individuals, private schedules, internal-only references, temporary emotions, chat provenance, or absolute local paths.

Use this gate: will a future agent make a better technical decision because this exists? If the answer is no, classify as NOOP.

Good:

- "Managed skill files are byte-tracked in `atlas.lock.json` so local customizations survive `doctor --fix`."
- "Release checks run from the repository root because workspace discovery depends on the git toplevel."

Weak:

- "A maintainer asked for memory."
- "The session went well."

## Phase 5 — Scratch and Promotion

Default uncertain captures to `<configured memory>/local/`. The scratch tier is personal and gitignored.

Promote from scratch only after rewriting the entry into durable form:

1. Remove personal or session-specific detail.
2. Add or preserve a stable heading.
3. Add Atlas metadata only if lifecycle checks are useful.
4. Choose `scope=repo` for repository-local facts or `scope=org` for cross-repo lessons.
5. Classify the promotion as ADD / UPDATE / DELETE / NOOP in the proposal.

## Phase 6 — Verify

After approved edits:

1. Run the local CLI, preferring `node bin/atlas.js doctor` inside the Atlas Core repository and `npx --no-install @blazity-atlas/core doctor` elsewhere.
2. Treat `duplicate-memory-entry`, `stale-memory`, `broken-citation`, and `dangling-supersede` as advisories, not blockers.
3. If an entry is meant for shared memory, run `atlas memory propose` and review the generated directory before publishing it to the org memory repository.

## Boundaries

- Do not push, open PRs, send messages, or update external systems.
- Do not run `atlas memory pull` unless the user explicitly wants to refresh vendored shared memory.
- Do not edit managed Atlas skill files; `doctor --fix` owns managed-file repair.
- Do not invent citations. Cite repo paths that exist, or omit `cites`.
