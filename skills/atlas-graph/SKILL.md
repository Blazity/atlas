---
name: atlas-graph
description: Use when the repository has Atlas graph support enabled and needs a repo knowledge graph generated, refreshed, verified, or reviewed
---

# Build Repository Graph

## Overview

Use this skill only when graph support is enabled in the Atlas config. The Atlas CLI owns deterministic validation and advisory reporting. This skill owns generator detection, graph generation, metadata writing, and diff review. It never installs generators, never runs network-backed enrichment, and never writes outside config-resolved graph paths.

The initial supported generator is `graphify` in code-only mode so runs stay offline and deterministic. Treat the graph as a generated artifact: rebuild it, review the diff, and do not hand-edit generated files.

Run the phases below in order.

## Phase 1 - Confirm Feature Gate

From the repository root, run Atlas doctor with the local package first:

```bash
npx --no-install @blazity-atlas/core doctor
```

Fall back to the published package only when the local package is not installed:

```bash
npx --yes @blazity-atlas/core@latest doctor
```

Stop before graph work when doctor reports manual conflicts or fixable drift. Structure repair precedes graph generation. If `doctor --fix` refuses because the worktree is dirty, ask the user whether to commit, stash, or explicitly rerun with `--force`; do not use `--force` automatically.

Locate the workspace config: read `.ai/config.json`, or when absent, follow the `.atlas` repo-root pointer to `<root>/config.json`. Resolve every path through that config - never hardcode `.ai/`.

Continue only when:

- `features.graph.enabled` is `true`.
- `features.graph.generator.name` is `graphify`.
- `features.graph.generator.version` is a non-empty pinned version.

If the feature is absent or disabled, stop and explain that graph support is opt-in. Do not edit config unless the user explicitly asks.

## Phase 2 - Detect Generator

Check whether graphify is installed:

```bash
command -v graphify
graphify --version
graphify --help
```

If `graphify` is missing, refuse politely with install guidance and stop:

```text
Atlas graph support is enabled, but graphify is not installed. Install graphify through your normal Python/toolchain workflow, pin that exact version in features.graph.generator.version, then rerun this skill. I will not install it automatically.
```

Do not install it automatically.

If the installed version differs from `features.graph.generator.version`, stop and report the mismatch. Upgrading or downgrading the generator is a config and dependency change that needs review.

Use `graphify --help` to confirm the installed CLI's code-only/offline and output-directory flags before running it. If the installed CLI cannot run in code-only/offline mode or cannot route every output into the configured graph directory, stop and report the blocker.

## Phase 3 - Resolve Output Paths

Resolve the graph directory from `paths.graph`; when absent, use the default resolver value `graph` under `artifactRoot`. All generated files, including `graph.meta.json`, must stay under that directory.

Expected sidecar:

```json
{
  "generator": {
    "name": "graphify",
    "version": "<pinned version>"
  },
  "buildSha": "<git HEAD sha>",
  "scope": "code",
  "provenance": "extracted"
}
```

Use `scope: "code"` for code-only graphify runs. Use `provenance: "extracted"` for deterministic code facts. Do not use mixed provenance unless the run intentionally includes non-deterministic or model-generated material and the user approved that broader scope.

## Phase 4 - Generate

Before running the generator, capture the current commit:

```bash
git rev-parse HEAD
```

Create the configured graph directory if needed. Run graphify from the repository root with the installed CLI's code-only/offline mode and configured output directory. Do not allow outputs outside the graph directory. Do not run docs/media/LLM enrichment.

After graphify finishes, write or refresh `graph.meta.json` in the graph directory with the pinned generator version and captured `buildSha`.

## Phase 5 - Verify

Run `atlas doctor` again:

```bash
npx --no-install @blazity-atlas/core doctor
```

The graph advisories should be absent for a fresh build. If `graph-generator-drift`, `graph-meta-invalid`, or `graph-stale` remains, report the exact finding and stop.

Show the graph diff for review:

```bash
git diff -- <resolved graph directory>
```

A second run at the same commit should be a no-op. If it is not, report the generated-file instability before suggesting a commit.

## Boundaries

- The CLI validates config, managed skills, symlinks, and graph metadata advisories.
- This skill never installs graphify, never edits unrelated workspace files, and never mutates config unless explicitly asked.
- Generated graph files are reviewable artifacts, not source-of-truth documentation. Stable decisions, vocabulary, and memory still belong in the configured Atlas artifact paths.
