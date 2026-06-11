# Atlas Core — Project AI Instructions

Atlas Core is the installable layer of Blazity's Atlas standard for AI-assisted engineering: the `atlas init` / `atlas doctor` CLI, the managed setup and review skills, and deterministic workspace scaffolding that keeps a repository's AI context (memory, vocabulary, plans, decisions, review artifacts) healthy and machine-checkable.

## Operating Rules

- Inside this repo ALWAYS run the local CLI: `npm run atlas` or `node bin/atlas.js`. Never run the published `npx @blazity-atlas/core` package against this worktree — the published `doctor --fix` would overwrite unreleased managed skill edits with the released versions (channel drift).
- Run the full `npm test` before any commit.
- Conventional commits matching the existing `git log --oneline -15` style: `type(scope): message`, first line only.
- English everywhere — code, comments, commits, docs.
- Vocabulary lives in `.ai/LANGUAGE.md`; decisions live in `.ai/decisions/adrs/`.

<!-- BEGIN ATLAS: artifact-paths -->
## Atlas Artifact Paths

`.ai/config.json` is the source of truth for AI artifact locations in this repository.
Before writing plans, research, decisions, ADRs, results, memory, vocabulary, or skill outputs, resolve the destination through `artifactRoot`, `paths`, and `pathAliases`.
If an imported skill, template, or instruction mentions a different path, map it through `.ai/config.json` before reading or writing files.
Do not create new documentation roots unless `.ai/config.json` explicitly allows them.
<!-- END ATLAS: artifact-paths -->
