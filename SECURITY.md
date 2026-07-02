# Security Policy

## Supported versions

The latest published minor of `@blazity-atlas/core` receives security fixes.

## Reporting a vulnerability

Use GitHub private vulnerability reporting: open the repository's Security
tab and click "Report a vulnerability". Do not open public issues for
vulnerabilities.

## Scope

The CLI runs locally, makes no network calls at runtime, and writes only
plain files into the target repository. The highest-impact class of issue is
anything that lets `init` or `doctor --fix` write outside the repository root
(path traversal or symlink escape) — report those privately.
