# Plan: Security scanning for committed AI context

**Status:** Proposed.
**Related:** `2026-07-07-atlas-core-roadmap.md` §3.4.

## Goal

A deterministic, offline doctor pass that treats committed AI context as an
attack surface: detect prompt-injection patterns, hidden-text tricks, and
anomalous content in the files agents load (`AGENTS.md`, `CLAUDE.md`,
workspace memory/vocabulary/skills), so poisoned context is caught in PR
review and CI instead of firing inside an agent session.

## Why

Documented 2026 incidents establish the threat class:

- A supply-chain compromise overwrote agent memory files via an npm
  `postinstall` script, producing a persistently compromised assistant
  (remediated in the affected product by demoting memory from the system
  prompt).
- Booby-trapped rules/instruction files in cloned repos have driven agents to
  exfiltrate credentials.
- A study of public agent skills found prompt injection in roughly a third of
  those sampled, and marketplaces ship without signing or review.

Atlas is uniquely positioned: its artifacts are plain files in git, so a
lint + PR review is a real security control — something hosted memory and
machine-local caches cannot offer. No open competitor ships this today.

## Design

### Finding namespace

New `security-*` finding codes. Severity: **advisory** in v1 (exit codes
frozen; no false positive may break CI), with a documented path to letting
repos opt individual checks up to failing via config once the false-positive
rate is proven low. Every finding carries file, line, matched pattern class,
and a remediation hint.

### Checks (all deterministic, no LLM, no network)

1. **Hidden text:** zero-width and bidi-control unicode, HTML comments
   containing imperative instructions inside non-Atlas-managed regions,
   base64/hex blobs above a size threshold in context files.
2. **Injection heuristics in data files:** imperative agent-directed
   phrasing in files that should be declarative data (memory, vocabulary,
   results) — pattern classes like "ignore previous", "do not tell the
   user", tool-invocation directives, and instructions to read/write paths
   outside the workspace.
3. **Exfiltration shapes:** URLs with embedded credentials or unusual
   schemes in context files; instructions referencing environment variables
   or key files (`.env`, `~/.ssh`, cloud credential paths).
4. **Skill audit:** `allowed-tools` frontmatter review (flag broad tool
   grants), executable content in skill directories that the skill body never
   references, skill files fetched from a marketplace whose hash does not
   match the recorded baseline (extends the existing lockfile).
5. **Write-surface guard:** managed-block and skill text instructing agents
   to modify files outside config-resolved paths.

### Surfaces scanned

Everything the context-size analyzer already enumerates (the files agents
actually load), plus skill directories and `.claude/rules`-style rule files
when present. Alias-mapped external docs are included read-only.

### Operation

- Runs as part of plain `doctor` (cheap, pure text analysis) — security
  posture should not require remembering a flag.
- `doctor --json` carries the findings for CI annotation.
- Per-code suppression ships separately with the config-improvements change;
  this change is advisory-only without suppression.
- `--fix` never auto-edits security findings; remediation is always human.

## Non-goals

- No malware detection, no network reputation lookups, no LLM-based
  classification (an explicit, separate, network-marked command could exist
  later; not in this plan).
- No scanning of application source code — only the AI-context layer.

## Phases

1. Pattern engine + hidden-text and blob checks (lowest false-positive risk).
2. Injection-phrase heuristics with a curated, versioned pattern list and a
   fixture corpus (both benign and malicious samples) in the test suite.
3. Skill audit + write-surface guard.
4. Documentation: a SECURITY-CONTEXT section explaining the threat model and
   the memory-as-PR review control.

## Acceptance criteria

- The fixture corpus: every malicious sample flagged, zero flags on the
  benign set (which includes this repository's own workspace).
- A seeded zero-width-unicode instruction in `lessons.md` is detected with
  file+line.
- Runtime overhead of plain `doctor` stays imperceptible on a large
  workspace (pure regex/scan passes, no parsing of application code).
- Exit codes unchanged; all findings advisories.
- Per-code suppression ships separately with the config-improvements change;
  this change is advisory-only without suppression.
