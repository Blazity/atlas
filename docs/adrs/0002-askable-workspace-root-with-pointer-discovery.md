---
status: accepted
date: 2026-06-11
---

# Workspace root is asked at init and discovered via a repo-root pointer

The workspace root was hardcoded to `.ai` and custom roots were half-implemented: `artifactRoot` passed validation and path resolution honored it, but `configPath()` was pinned to `<repo>/.ai/config.json`, so no supported flow could produce a non-`.ai` workspace. The 2026-06-08 redesign locked a zero-question init; this decision deliberately reverses that for exactly one question, because the root inverts every clause of the rationale that removed the template question: it is high-stakes, pure user preference an agent cannot infer, and expensive to migrate later.

Decision: interactive init asks the workspace root as its **first question** — a free-text input prefilled with `.ai`, Enter accepts, any repo-relative path allowed; `--root <dir>` provides non-interactive parity. Config lives at `<root>/config.json`. With the default root, on-disk output stays byte-identical to 0.2.x — no new files, no migration. With a custom root, init writes a one-line repo-root pointer file (`.atlas`, containing the relative root path). Discovery order for all tools: `.ai/config.json`, then the `.atlas` pointer.

## Considered Options

- **Lock `.ai`, zero questions** — strongest uniform-standard story, but leaves the root a hardcoded taste with no escape hatch and keeps the half-implemented `artifactRoot` illusion.
- **Fixed select instead of free text** — rejected; a curated list is still an opinion about other people's repo conventions.
- **Config always at repo root (`atlas.json`)** — conventional and simplest, but breaks every existing install and adds a root-level file for everyone to serve a minority preference.
- **Config pinned at `.ai/config.json` even with custom roots** — zero discovery work but defeats the point: users choosing a custom root specifically do not want a `.ai/` directory.

## Consequences

- `configPath()` becomes a discovery function; every hardcoded `.ai` literal in CLI copy, the handoff prompt, and the AGENTS.md managed block must derive from the configured root.
- doctor gains pointer findings (missing/wrong/stale `.atlas`) as ordinary structural findings.
- Pinned tests for the default path survive unchanged; new tests cover the pointer branch.
- Shipped in 0.3.0.
