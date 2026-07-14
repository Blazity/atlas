# Lessons

## Verification steps must execute, not render
<!-- atlas: id=verification-steps-must-execute verified=2026-07-07 cites=test/flow.test.js scope=repo -->

A spec that defines a displayed verification line ("doctor · 0 issues · workspace healthy") invites implementations that render proof instead of performing it. Review specs for "displayed proof" vs "performed proof" — any step that claims verification must actually run it.

## Doctor has no stale-config detection
<!-- atlas: id=no-stale-config-detection verified=2026-07-07 cites=src/config.js,src/doctor.js scope=repo -->

Installed configs silently freeze at install-time defaults: when templates evolve (new `pathAliases`, new paths), existing workspaces never learn about it and doctor reports them healthy. Open product gap surfaced by dogfooding analysis on 2026-06-11.

## Flagged safety issues need an owner and a deadline
<!-- atlas: id=flagged-safety-issues-need-owner-deadline verified=2026-07-07 cites=src/cli.js scope=repo -->

`--yes` implied `--force` long after the overlap was first flagged. A flagged safety issue without an owner and a deadline is a note, not a fix.

## Bare managed-skill names collide in shared namespaces
<!-- atlas: id=managed-skill-name-collisions verified=2026-07-07 cites=src/templates.js,skills/atlas-review/SKILL.md scope=repo -->

Bare managed-skill names (`setup`, `review`) collided with other skills in shared agent namespaces — Atlas's `review` collided with Claude Code's built-in PR-review skill in practice. Managed skills are now prefixed (`atlas-setup`, `atlas-review`). Generic names in shared namespaces are collisions waiting to happen.

## Scratch memory promotion needs a committed review surface
<!-- atlas: id=scratch-memory-promotion-review-surface verified=2026-07-07 cites=skills/atlas-memory/SKILL.md,src/memory.js scope=repo -->

Scratch captures stay in `memory/local/` because they may contain session-local noise. Promotion rewrites only durable, depersonalized lessons into committed memory so reviewers can inspect ordinary diffs.
