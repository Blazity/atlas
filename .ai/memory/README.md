# AI Memory

Stable product, architecture, stack, and lessons memory for AI agents.
Keep volatile task status in the issue tracker, not here.

## Entry Format

Memory entries are markdown sections. Add Atlas metadata on the line immediately after the heading when the entry should participate in lifecycle checks:

```markdown
## Bare managed-skill names collide in shared namespaces
<!-- atlas: id=skill-name-collisions verified=2026-06-12 cites=src/templates.js scope=repo -->
```

All metadata keys are optional: `id`, `verified`, `cites`, `scope`, `source`, and `superseded-by`.
Plain markdown remains valid memory; entries without Atlas metadata are not checked for age, citations, dedupe, or supersede links.

Good entry: "Payments run through an adapter because the provider API changed twice."
Weak entry: "Payments were discussed." Record needs, decisions, and reasons.
