# Atlas Core Roadmap — 0.6 to 1.0 and beyond

**Status:** Proposed. Informed by a July 2026 landscape review of agent-context
standards, memory systems, spec-driven tooling, and adjacent products.
**Supersedes nothing; extends** the Wave 2 backlog in
`2026-07-02-developer-adoption-plan.md`.

---

## 1. Framing: what game Atlas is playing

The landscape settled in a way that is unusually favorable to Atlas:

- **Two formats won.** AGENTS.md (now stewarded by the Linux Foundation's
  Agentic AI Foundation, 60k+ repos, 30+ native readers) and the Agent Skills
  spec (SKILL.md, agentskills.io, ~40 adopting clients including Codex,
  Copilot, Cursor, Gemini CLI). Everything else is a compile target.
  Atlas already builds on both.
- **Distribution is commoditized; quality is unclaimed.** Sync tools
  (Ruler ~2.8k stars, rulesync, dotai) fan one source out to N tool formats but
  have no opinion about content quality, no health checks, no lifecycle.
  Methodology plugins (Superpowers ~248k stars, Every's compound-engineering
  ~23k) govern how the *agent* works and assume the repo layer exists.
  Factory.ai's Agent Readiness has deterministic scoring, maturity levels, and
  remediation PRs — but closed and platform-bound. Early open linters
  (Packmind context-evaluator, AgentLint, kodus agent-readiness) prove the
  category exists and that nobody owns it yet.
- **Memory architecture converged; enforcement didn't.** Every vendor landed
  on index-plus-lazy-topic-files, hard hot-tier budgets, and a committed-vs-
  personal split. None ships automated dedupe, staleness, contradiction, or
  budget checks over those files — and no vendor commits shared memory to git
  (hosted silos or machine-local only). Git-native, PR-reviewed team memory is
  an open lane.
- **The cautionary tales are clear.** llms.txt died because it shipped a
  format without a consumer. Plandex died because it *was* the agent instead
  of structuring whatever agent the user has. Cursor's server-side Memories
  were rejected by users who wanted local, inspectable, git-friendly files.

**Position statement:** Atlas is the reference checker and scaffold for
repo-owned AI context — what ESLint is to JS style and commitlint is to
commit messages. The standard is the spec of artifacts and semantics; the CLI
is the consumer that makes the standard enforceable; the managed skills are
the workflows that keep the artifacts alive. Every roadmap item should
strengthen one of three moats:

1. **The doctor moat** — deterministic, CI-runnable checks nobody else has
   (semantic lints, drift, contradictions, budgets, injection).
2. **The memory moat** — the first git-native memory standard with lifecycle
   enforcement (capture → consolidate → supersede → archive).
3. **The neutrality moat** — tool-agnostic substrate on open specs, so Atlas
   rides every agent's adoption curve instead of competing with any of them.

**Explicit non-goals stay non-goals:** not an agent runtime, no code
generation, no telemetry, offline-by-default doctor, frozen exit codes.

---

## 2. Wave 3 (0.6) — Close the loop on what exists

Debts already identified by dogfooding, plus small items with outsized trust
returns. Theme: *the workspace stops being write-once.*

### 2.1 Config migrations (stale-config detection)
The known gap: installed configs freeze at install-time defaults and doctor
reports them healthy. Ship versioned config migrations: each template change
carries a migration step keyed off `atlasVersion`; doctor reports
`config-migration-available` (fixable), `--fix` applies additive changes
(new pathAliases, new paths) and never rewrites user-customized values.
This is the copier/cruft "recorded provenance + reconcile" model applied to
config, and it must land before templates evolve further — every release
without it deepens the frozen-config population.

### 2.2 Memory-capture managed skill (`atlas-memory`)
The `empty-memory` advisory has no closer. One skill that captures a lesson,
term, or decision at session end, resolves destinations through config,
depersonalizes by rule, and — critically — classifies each proposed write as
**ADD / UPDATE / DELETE / NOOP** against existing entries (the Mem0
consolidation verbs) so the git diff shows the classification. This is also
the seed of the promotion path (§3.2).

### 2.3 `atlas status` (`--json`)
One-screen workspace dashboard: artifact counts and ages, memory/vocabulary
budgets with usage bars, last review verdict, setup state, version stamps.
Answers "is this workspace alive or a fossil?" — the question a lead asks
before trusting the standard on a second repo.

### 2.4 Config `$schema` + published JSON Schema
Publish a JSON Schema for `config.json` (and `atlas.lock.json`), reference it
via `$schema`, keep hand-rolled validation as the runtime source of truth.
Editor autocomplete for free; external tools can validate without running
Atlas.

### 2.5 Per-repo check suppression
Doctor design consensus across brew/flutter/expo: irrelevant checks are the
top hatred driver. Add `doctor.suppress: ["finding-code", ...]` in config
(advisories and fixables only; manual conflicts cannot be suppressed).
Suppressed findings show as a one-line count so they stay visible.

### 2.6 Lightweight review profile
Already planned in Wave 2: an inspection-first quick mode in `atlas-review`
with a short artifact, so solo developers produce verdicts too. The ecosystem
lesson (Kiro's Quick Plan, OpenSpec's gate-free artifacts) is that winners
ship a **ceremony dial** — this is Atlas's.

---

## 3. Wave 4 (0.7) — The memory standard, v1

Theme: *Atlas defines what healthy git-native agent memory means.* This is
the least contested moat and the hardest to copy.

### 3.1 Memory entry metadata (frontmatter)
Standardize optional per-entry metadata that doctor understands:

- `verified: <date>` — age-based staleness: entries unverified for N days get
  a `stale-memory` advisory (Claude Code's verify-on-read reminder, made
  checkable).
- `cites: <path>` — citation anchoring: entries pointing at files/symbols
  that no longer exist get flagged (GitHub Copilot Memory's
  validate-before-apply, made git-native).
- `status: superseded-by <entry>` — supersede-don't-delete lifecycle across
  memory, ADRs, and vocabulary (the Zep/Graphiti invalidation model in its
  file-native ADR form).
- `triggers: <when to recall>` — recall hints (Devin Knowledge's semantic
  trigger descriptions), consumed by agents, ignored by doctor beyond
  presence.

All optional; plain markdown remains valid. Doctor rewards metadata, never
requires it.

### 3.2 The promotion path
Codify the flow every vendor leaves manual: personal scratch → committed
fact. A gitignored `memory/local/` scratch tier plus an `atlas-memory`
promotion step that rewrites, depersonalizes, and files entries into the
committed tier via ordinary diffs. Memory-as-PR becomes the recommended team
workflow: agents propose memory edits; humans review them like code.

### 3.3 Semantic doctor lints for context quality
Extend context-size advisories into content-quality advisories (all exit-0):

- **Duplication:** near-duplicate entries across memory files.
- **Contradiction (heuristic):** opposing rule pairs in instruction files —
  even a dumb pass exceeds current state of practice everywhere.
- **Vocabulary drift:** LANGUAGE.md terms that never appear in the codebase;
  banned terms (the *Avoid* column) that do.
- **ADR integrity:** status frontmatter valid, superseded links resolve,
  generated index up to date.
- **Cross-file consistency:** AGENTS.md managed block vs CLAUDE.md shim vs
  Copilot instructions divergence (the Packmind case study found a 178-line
  divergence between AGENTS.md and CLAUDE.md in the wild).

### 3.4 Injection and anomaly lint (security)
2026 made committed AI context an attack surface: memory-poisoning via
npm postinstall (the Claude Code MEMORY.md compromise, fixed in 2.1.50),
booby-trapped rules files exfiltrating credentials, Snyk's ToxicSkills
finding prompt injection in 36% of studied skills. Ship a doctor pass over
`.ai/` and skills: imperative-instruction patterns in data files, invisible
unicode, unexpected writes to memory paths, oversized encoded blobs.
Advisory severity, but prominent. No open competitor has this; it converts
"plain files in git" from a liability argument into a security-control
argument (memory diffs are PR-reviewable — hosted memory isn't).

### 3.5 `atlas-compact` v2
Upgrade compaction into the standard consolidation loop: idle/batch-triggered,
signal-gated ("will a future agent act better because of this?"), emitting
ADD/UPDATE/DELETE/NOOP-classified diffs, with before/after doctor proof
(already there). Recommend a scheduled CI cadence — consolidation as
housekeeping, not a chore (Letta's sleep-time compute, git-native).

---

## 4. Wave 5 (0.8) — Reach and reconciliation

Theme: *Atlas works everywhere its users work, and updates stop hurting.*

### 4.1 Extensible agent surfaces
Surfaces are hardcoded (claude/agents/cursor). Make them a registry:
`.agents/skills/` (the emerging cross-tool convention — Codex primary,
OpenHands migrated to it), `.github/instructions/` path-scoped files,
Gemini CLI, Windsurf, Roo/Cline. Each surface declares its link/copy
strategy and merge semantics; doctor checks per-surface health. Custom
surfaces via config for tools Atlas hasn't met yet.

### 4.2 Windows support
The failure signature is already known (readlink returns backslashed
targets). Symlink surfaces need a copy-with-marker fallback where symlinks
are unavailable. Gate: CI matrix leg on windows-latest.

### 4.3 Three-way skill reconciliation
The lockfile (ADR-0004) distinguishes stale from customized; customized
currently dead-ends in a sticky advisory. Add the copier move: baseline
(recorded), theirs (packaged), yours (installed) three-way merge on
`doctor --fix --merge-skills`, conflicts surfaced as standard markers.
For breaking skill changes, ship named migrations (the codemod lesson:
don't diff/merge across breaking changes — migrate).

### 4.4 Plan lifecycle
Plans currently accumulate with no terminal state. Adopt the OpenSpec
lesson — the strongest drift-management idea in the spec-driven space:
plans get a status (`active | done | archived`), an archive step folds
durable outcomes into memory/ADRs, and doctor advises on stale active plans.
Add a standard **handoff artifact** shape with a first-class
"failed approaches" section (the load-bearing part of every handoff
convention studied).

### 4.5 Review-artifact validation
Pin the verdict format (frontmatter: verdict, date, scope, owner) and let
doctor validate it — review artifacts become machine-readable evidence, which
later feeds scoring (§5.3) and any future metrics story.

---

## 5. Wave 6 (0.9) — CI, distribution, and the public face

Theme: *the standard becomes visible and self-marketing.*

### 5.1 Official GitHub Action
`blazity/atlas-action`: runs pinned doctor, annotates PRs with finding codes,
optional remediation-PR mode (`doctor --fix` on a branch — the maintenance UX
Factory and GitHub converged on). Fail thresholds configurable
(kodus-style `--min-level`) without touching the frozen exit codes.

### 5.2 Badge + score
"Atlas-verified" README badge backed by doctor state, and an
`atlas score` maturity read-out (levels, not just pass/fail — Factory's
ladder, open and reproducible). A visible artifact in every adopting repo is
the same free marketing that made EditorConfig and conventional commits win.

### 5.3 Public repo scoring as growth
Score popular OSS repos with the open CLI and publish the results
(leaderboard or report). Factory scored CockroachDB/FastAPI/Express publicly
to define its category; the open, reproducible version of that is Atlas's to
take.

### 5.4 Skill distribution everywhere
Managed skills published (CLI stays canonical, spec `metadata` carries the
version stamp doctor verifies): claude-plugins-official-style marketplaces,
Codex/Gemini galleries, skills.sh. Adopt skills-ref-compatible validation in
doctor (frontmatter, name/dir match, body under 500 lines / ~5k tokens,
reference depth) so Atlas both consumes and enforces the Skills spec.

### 5.5 Docs site + SPEC.md draft
blazity.com/atlas or atlas standard docs: the artifact taxonomy, finding-code
reference, memory metadata spec, CI recipes. Begin `SPEC.md` — the standard
described independently of the implementation, in AAF-compatible language,
so Atlas is positioned as reference implementation if/when the foundation
standardizes context health.

---

## 6. 1.0 — Freeze the standard

1.0 is a promise, not a feature list:

- Config schemaVersion 2 if needed, with migrations proven (§2.1).
- Frozen: exit codes (already), finding-code namespace, config schema,
  memory metadata keys, verdict format.
- Release hygiene: npm provenance attestation, signed tags, documented
  support policy.
- Conformance suite: a fixture-repo test kit others can run against
  alternative implementations — what makes a standard a standard.

---

## 7. Post-1.0 horizons (deliberately unscheduled)

- **Execution gates / agent smoke evals.** ADR-0001 points here: a canary
  task per repo ("can an agent answer X from workspace files alone?") run in
  CI. Confirmed white space — nothing ships repo-level before/after agent
  evals today. High effort, nondeterministic; prototype behind a flag first.
- **Contradiction detection beyond heuristics** (LLM-assisted, opt-in,
  network-explicit — breaks offline purity, so it must stay a separate
  explicit command).
- **MCP resource adapter** exposing `.ai/` artifacts — only if MCP resource
  adoption materializes; file-based context won this round.
- **Team/org layer** (multi-repo dashboards, org policy packs) — the natural
  commercial tier, mirroring the open-core → audit/retainer funnel already
  proven by adjacent players; Core stays MIT and complete.

---

## 8. Risks and counters

| Risk | Counter |
| --- | --- |
| GitHub auto-generates and maintains context files natively | Atlas is tool-neutral and owns semantics/health, not generation; deepen doctor checks GitHub won't ship (memory lifecycle, vocabulary, decisions) |
| An AAF/foundation validator standardizes context linting | Move first, publish SPEC.md, become the reference implementation |
| Packmind/AgentLint-class tools mature faster | They lint instructions only; Atlas owns the full artifact lifecycle (memory, decisions, reviews) plus scaffold+fix. Ship §3 before they widen |
| Skill-content releases churn consumer CI (every skill edit → exit 1 fleet-wide) | Batching discipline (already practiced) + three-way merge (§4.3) + named migrations |
| Scope creep toward agent-runtime features | ADR-0001 is the fence; every proposal must name its gate type (structural / process / execution) |

## 9. Sequencing rationale

Memory enforcement (§3) precedes reach (§4) because it is the differentiator
competitors can't copy quickly, and it compounds: every month of captured,
validated memory in adopting repos raises switching costs. Distribution (§5)
comes after the memory standard exists so the public face advertises the
moat, not just the scaffold. Config migrations (§2.1) go first because every
release shipped without them enlarges the population of frozen workspaces
the feature exists to save.
