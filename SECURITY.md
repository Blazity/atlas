# Security Policy

## Supported versions

The latest published minor of `@blazity-atlas/core` receives security fixes.

## Reporting a vulnerability

Use GitHub private vulnerability reporting: open the repository's Security
tab and click "Report a vulnerability". Do not open public issues for
vulnerabilities.

## Scope

The CLI runs locally, makes no network calls at runtime, and writes only
plain files and repo-internal symlinks (`.claude/skills`, `.agents/skills`,
`.cursor/skills`) into the target repository. The highest-impact class of issue is
anything that lets `init` or `doctor --fix` write outside the repository root
(path traversal or symlink escape) — report those privately.

Committed AI context is also in scope: AGENTS.md, CLAUDE.md, memory,
vocabulary, results, decisions, and skills can influence future agent runs.
`atlas doctor` treats that context as a PR-review surface and reports
`security-*` advisories for hidden instructions, injection phrasing,
credential-shaped content, and risky skill surfaces. The scanner is
deterministic, offline, and advisory-only; humans review the diff, remove or
justify the finding, and keep memory changes visible in version control.

## Known limitations

Literal keyword matching can miss homoglyph substitutions. Verb/path
exfiltration matching is also per-line. These are deliberate determinism
trade-offs; PR review of memory diffs remains the primary control.
