---
status: accepted
date: 2026-06-11
---

# Doctor gains an advisory severity; the exit-code contract is frozen

Doctor knew two severities — fixable (exit 1, repairable by `--fix`) and manual (exit 2, where any manual finding blocks all `--fix` repairs) — and that contract is becoming the advertised CI structural gate (ADR-0001). Pending designs need doctor to report non-structural state without failing builds or blocking repairs: the setup-state sentinel (so an abandoned setup handoff is machine-visible) and semantic-health signals (empty vocabulary or memory long after init). Meanwhile `unresolved-placeholder` was classified manual, so a half-filled AGENTS.md blocked every unrelated repair — the most aggressive finding class guarding the least structural concern.

Decision: exit codes 0/1/2 are **frozen** as the public CI contract. A third severity, **advisory**, is added: exit 0, never blocks `--fix`, rendered as a separate section. The `setupState` sentinel (`scaffolded` → `configured`, flipped by the setup skill as its final act) and semantic-health checks ship as advisories. `unresolved-placeholder` is reclassified manual → advisory — a deliberate pinned-behavior change that removes the repair deadlock.

## Considered Options

- **Keep doctor purely structural** — cleanest boundary, but the abandoned-setup funnel stays invisible to every tool and semantic health has no home.
- **Semantic findings at exit 1** — would fail CI on every fresh repo until setup completes; punishes brownfield adoption with an immediately red build.

## Consequences

- Advisories must never be written or "repaired" by `--fix`; they are signals, not actions.
- A future `--strict` flag may promote advisories to exit 1 for teams wanting CI-enforced semantic completeness — opt-in only.
- Tests pinning placeholder-as-manual change deliberately with this ADR as the recorded reason.
