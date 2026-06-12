# Lessons

## Verification steps must execute, not render

A spec that defines a displayed verification line ("doctor · 0 issues · workspace healthy") invites implementations that render proof instead of performing it. Review specs for "displayed proof" vs "performed proof" — any step that claims verification must actually run it.

## Doctor has no stale-config detection

Installed configs silently freeze at install-time defaults: when templates evolve (new `pathAliases`, new paths), existing workspaces never learn about it and doctor reports them healthy. Open product gap surfaced by dogfooding analysis on 2026-06-11.

## Flagged safety issues need an owner and a deadline

`--yes` implied `--force` long after the overlap was first flagged. A flagged safety issue without an owner and a deadline is a note, not a fix.

## Bare managed-skill names collide in shared namespaces

Bare managed-skill names (`setup`, `review`) collided with other skills in shared agent namespaces — Atlas's `review` collided with Claude Code's built-in PR-review skill in practice. Managed skills are now prefixed (`atlas-setup`, `atlas-review`). Generic names in shared namespaces are collisions waiting to happen.
