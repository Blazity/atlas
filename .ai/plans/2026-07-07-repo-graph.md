# Plan: Repo knowledge graph as an optional Atlas feature

**Status:** Proposed.
**Related:** `2026-07-07-atlas-core-roadmap.md`; memory-standard plan
(supersession lifecycle); config-improvements plan (`features` map).

## Goal

Let a repository carry a committed, agent-consumable knowledge graph of
itself as an *optional* Atlas feature: Atlas defines where graph artifacts
live, keeps them fresh via doctor, and ships an optional managed skill that
drives an external generator — without adding databases, LLM calls, or
dependencies to the CLI.

## Terms

- `features.graph.enabled` — the feature gate. It was chosen to match the
  existing optional-config style and the planned `features` map; when absent
  or false, doctor emits no graph findings and scaffolds no graph skill.
- `paths.graph` — optional graph artifact path. When absent, the resolver
  falls back to `graph` under `artifactRoot`; scaffolded configs keep it
  absent so the feature stays opt-in.
- `graph.meta.json` — sidecar written inside the graph directory with
  `{ generator: { name, version }, buildSha, scope, provenance }`.
- `buildSha` — commit SHA used as the graph input freshness anchor; doctor
  checks `git rev-list --count <buildSha>..HEAD`.
- `scope` — `code` for code-only extraction or `code+docs` for runs that also
  include documentation.
- `provenance` — `extracted` for deterministic source facts or `mixed` when
  extracted facts are combined with inferred/generated material.

## Candidate evaluation (July 2026)

Three open-source candidates were evaluated for adoption:

| | getzep/graphiti | Graphify-Labs/graphify | langchain-ai/openwiki |
| --- | --- | --- | --- |
| What | Temporal knowledge-graph memory framework | Repo → knowledge graph CLI + agent skill | Repo → agent wiki CLI |
| Stack | Python + graph DB (Neo4j/FalkorDB) + LLM | Python; tree-sitter core is offline/deterministic; LLM only for docs/media | Node (LangChain DeepAgents); LLM required |
| Output | DB only — nothing committable | **Plain files:** `graph.json`, `GRAPH_REPORT.md`, HTML | Plain markdown wiki in git |
| License | Apache-2.0 | MIT | MIT |
| Maturity | 28k stars, stable org, monthly releases | ~79k stars but 3 months old, hype-driven, single-maintainer, unstable schema, near-daily releases | 2 weeks old, v0.0.1, LangChain org |
| As CLI dependency | No (Python/DB) | No (Python) | No (dep tree + mandatory LLM breaks one-dep/offline) |
| Best integration | Concept-only | **Optional managed skill + file consumer** | Watch; coexistence + concept |

**Verdicts:**

- **Graphiti — adopt concepts, not code.** Its bitemporal supersession
  (facts are invalidated, never deleted; every fact cites its source
  episode) is already reflected in the memory-standard plan
  (`superseded-by`, `cites`, provenance). A skill that syncs workspace
  memory into a user-run Graphiti MCP server is possible later; not now.
- **Graphify — the integration target.** The only candidate matching
  Atlas's philosophy (deterministic tree-sitter core, offline code-only
  mode, plain committed files, no telemetry). Risks are real: unversioned
  output schema, single maintainer, virality-inflated stars, reported
  resource spikes on concurrent rebuilds. Integrate behind version pinning
  and treat the schema as unstable.
- **OpenWiki — watch, don't integrate yet.** v0.0.1, but two ideas are
  worth taking now: diff-driven incremental updates keyed to a recorded
  last-run commit (the freshness mechanic below), and its habit of
  appending a pointer section to AGENTS.md — which will collide with the
  Atlas-managed block and needs a coexistence answer regardless.

## Design

### 1. Artifact convention (generator-agnostic)

- New optional config path: `paths.graph` (default `graph`, under the
  artifact root). Graph artifacts live there: the machine artifact
  (`graph.json` or equivalent) plus a human report (`GRAPH_REPORT.md`).
- A small sidecar `graph.meta.json` records: generator name + pinned
  version, build commit SHA, input scope (code-only vs code+docs), and
  provenance mode. Written by whatever produced the graph.
- Provenance labels adopted as a convention for any generator:
  facts **extracted** (deterministic, from code) vs **mixed**
  (extracted facts combined with generated material) — consumers can weight
  trust accordingly.

### 2. Doctor checks (advisory-only, feature-gated)

Only when the feature is enabled in config:

- `graph-stale` — `graph.meta.json` build SHA is more than N commits behind
  HEAD (the diff-driven freshness idea; N configurable).
- `graph-meta-missing` / `graph-meta-invalid` — artifacts present without a
  parseable sidecar.
- `graph-generator-drift` — generator version in meta differs from the
  version pinned in config.
- Graph artifacts are counted by the context-size analyzer only if placed
  in prompt-loaded locations; the default location is not agent-preloaded —
  agents consult it on demand (the report/pointer pattern).

Doctor never requires the feature and never executes generators.

### 3. Optional managed skill: `atlas-graph`

- Detects an installed generator (initially: graphify, code-only mode
  by default so runs stay offline); refuses politely with install guidance
  when absent.
- Runs the generator, routes outputs through config-resolved paths, writes
  `graph.meta.json` (including build SHA), and shows the diff for review —
  the memory-as-PR discipline applied to graphs.
- Pin discipline: skill invokes the version recorded in config; upgrading
  the generator is an explicit, reviewable config change.
- AGENTS.md gains one managed-block line only when the feature is enabled:
  where the graph lives and when to consult it.

### 4. Coexistence guard (independent of feature adoption)

Third-party tools (OpenWiki today, others tomorrow) append their own
sections to AGENTS.md. Doctor's managed-block checks must tolerate foreign
sections outside the Atlas block (they already should — verify with
fixtures), and the alias mechanism should support mapping tool-owned
directories (e.g., `openwiki/`) into workspace paths, applying the existing
"adopt, don't replace" posture to generated documentation.

## Non-goals

- No graph database, embeddings, or LLM calls in the CLI.
- No bundling or vendoring of any generator; Atlas never `pip install`s.
- No native graph *building* in Atlas Core (a tree-sitter dependency would
  break the single-dependency rule; revisit only if a compelling zero-dep
  approach appears).
- Not a default-on feature; absent from `init` unless chosen.

## Phases

1. Artifact convention + `paths.graph` + meta sidecar format, documented.
2. Doctor feature-gated checks with fixtures (fresh, stale, missing meta,
   version drift) + AGENTS.md foreign-section coexistence fixtures.
3. `atlas-graph` managed skill (graphify, code-only, pinned).
4. Re-evaluate after one quarter: graphify schema stability, OpenWiki
   maturity, demand signal from issues — then decide on wiki-generation
   support and any Graphiti MCP bridge.

## Acceptance criteria

- A repo with the feature disabled sees zero new findings and zero new
  scaffold content.
- With the feature enabled and a committed graph: doctor reports clean at
  HEAD, `graph-stale` after N+1 unrelated commits, and version drift when
  config pin and meta disagree.
- The skill run produces only files under config-resolved paths, plus a
  reviewable diff; a second run at the same SHA is a no-op.
- An AGENTS.md containing a foreign (non-Atlas) appended section passes
  managed-block checks untouched.
