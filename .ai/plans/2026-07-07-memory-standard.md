# Plan: Memory Standard v1 — entries, lifecycle, and cross-repo consolidation

**Status:** Proposed.
**Depends on:** nothing (config migrations recommended first; see the config plan).
**Related:** `2026-07-07-atlas-core-roadmap.md` §3.

## Goal

Turn Atlas memory from free-form topic files into the first git-native memory
standard with lifecycle enforcement: entries that can be deduplicated, aged,
superseded, and consolidated across repositories — all reviewable as ordinary
git diffs, with the CLI staying deterministic and offline.

## Why

- Every agent vendor converged on file-based memory architecture but none
  enforces quality (dedupe, staleness, contradiction), and none commits shared
  memory to git — hosted silos (Copilot Memory, Cloudflare) or machine-local
  caches (Claude Code auto-memory, claude-mem) only.
- No shipped tool performs git-native cross-repo memory consolidation; demand
  is visible (open GitHub community discussions asking for multi-repo org
  instructions) and supply is zero.
- Organizations running Atlas on several products need lessons learned in one
  repo to compound across all of them, with human review.

## Design

### 1. Entry as the unit of memory

Memory stays in readable topic files (`lessons.md`, `architecture.md`, …).
Each entry is a markdown section whose heading is followed by an HTML-comment
metadata line the CLI can parse deterministically:

```markdown
## Bare managed-skill names collide in shared namespaces
<!-- atlas: id=skill-name-collisions verified=2026-06-12 cites=src/templates.js scope=repo -->
```

Metadata keys (all optional — plain markdown remains valid):

| Key | Meaning | Doctor use |
| --- | --- | --- |
| `id` | stable slug (generated on capture) | dedupe, cross-repo identity |
| `verified` | date a human/agent last confirmed the fact | `stale-memory` advisory past a threshold |
| `cites` | repo path(s) the fact depends on | `broken-citation` advisory when the path no longer exists |
| `scope` | `repo` (default) or `org` | promotion eligibility (§4) |
| `source` | origin repo for imported entries | provenance in consolidated memory |
| `superseded-by` | id of the replacing entry | supersede-don't-delete lifecycle; link integrity check |

HTML comments are stripped before context injection by major agents, so the
metadata costs agents zero tokens.

### 2. Division of labor (unchanged Atlas principle)

- **CLI (deterministic, offline):** parse entries; generate/verify ids;
  detect exact and near duplicates (normalized-text similarity); flag stale
  `verified` dates, broken `cites`, dangling `superseded-by`; validate merge
  bookkeeping. No LLM calls, ever.
- **Managed skill (`atlas-memory`):** semantic work — capture, rewrite,
  depersonalize, consolidate. Every proposed write is classified
  **ADD / UPDATE / DELETE / NOOP** against existing entries, and the
  classification appears in the commit/PR description so the diff is the
  audit trail.

### 3. Capture and promotion path

- `memory/local/` — gitignored personal scratch tier (scaffolded entry in
  `.gitignore`), where session-end capture lands by default.
- Promotion: `atlas-memory` rewrites a scratch entry (depersonalized, signal-
  gated: "will a future agent act better because of this?") into the
  committed tier. Recommended team flow is memory-as-PR: agents propose,
  humans review.
- Session protocol: the AGENTS.md managed block gains two lines — start of
  session: read the memory index; end of session: run capture. This travels
  with the repo and works in every agent.

### 4. Cross-repo consolidation (org memory)

Reuses the managed-skill lockfile model (ADR-0004) — vendored content,
pinned source, baseline hashes:

- An **org memory source** is a git repository containing an Atlas memory
  tree (for example an internal `org-memory` repo).
- Consumer config: `memory.shared = { source, ref, pin }`. `atlas memory
  pull` fetches the pinned tree into `.ai/memory/shared/` (marked managed);
  doctor gains `shared-memory-behind` / locally-edited findings mirroring the
  skill model. Network only on explicit `pull`, consistent with the
  offline-doctor contract.
- `atlas memory propose` exports entries flagged `scope: org` as a ready-to-
  apply patch/branch against the org repo. Consolidating several products'
  memories happens *in the org repo*: CLI dedupe pass first, semantic merge
  by the skill (verb-classified), human PR review last.
- Provenance: imported entries keep `source=<repo>` so a wrong fact can be
  traced to the repo that taught it.

## Non-goals

- No vector store, graph database, or hosted service. Files and git only.
- No automatic memory writes without a reviewable diff.
- The CLI never judges *truth* of an entry — only structure, age, links,
  and duplication.
- Near-duplicate detection is ASCII-oriented for v1; Unicode normalization is
  a documented follow-up.

## Phases

1. **Entry format + parser + doctor checks** — parser for the metadata
   comment; findings: `duplicate-memory-entry`, `stale-memory`,
   `broken-citation`, `dangling-supersede` (all advisories). Scaffold updates
   memory README with the format.
2. **`atlas-memory` managed skill** — capture at session end, four-verb
   classification, depersonalization rules, promotion from `memory/local/`.
   Closes the `empty-memory` advisory loop.
3. **Session protocol** — managed-block addition (batched with other
   skill/block edits per release discipline).
4. **Org memory** — config shape, `memory pull` / `memory propose`,
   doctor findings for the shared tier. Ship behind a config key; document
   the org-repo layout.

## Acceptance criteria

- A workspace with unmarked plain-markdown memory stays healthy (metadata is
  opt-in; no new failures on existing workspaces).
- Doctor detects: two near-identical entries; an entry citing a deleted
  file; an entry unverified for >90 days; a supersede link to a missing id.
- `atlas memory pull` is byte-reproducible for a given pin; doctor flags
  local edits to the shared tier without failing CI (advisory).
- End-to-end dogfood: this repository's own `lessons.md` migrated to the
  entry format; one entry promoted through the full scratch → committed flow.
- Frozen exit codes untouched; all new findings are advisories in v1.
