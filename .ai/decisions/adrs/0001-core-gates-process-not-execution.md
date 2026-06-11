---
status: accepted
date: 2026-06-11
---

# Atlas Core gates process and structure, not execution

The README promises gates three times ("lightweight gates", "machine-enforced gates", "tests, evals, policy checks, and review rubrics should run before merge") while the shipped package contains no gate mechanism beyond doctor's structural checks. The standard's taxonomy points execution gates at products built with Atlas, but Atlas Core's own promises cannot rest on that delegation.

Decision: Atlas Core owns **structural gates** (doctor's deterministic workspace checks, exposed to CI via the existing 0/1/2 exit-code contract) and **process gates** (skill-driven, evidence-based checkpoints whose verdicts are written as review artifacts into the workspace). **Execution gates** (running tests, evals, policy checks before merge) are explicitly out of Core's scope until a product exists to own them. The README must state this split rather than implying Core runs execution gates.

## Considered Options

- **Core never gates quality** — honest and minimal, but concedes "installing Atlas does not install the standard" and breaks the locked taxonomy ("installing Atlas gives a project the harness that makes the standard practical").
- **Core gates process, not execution** (chosen) — the only position where the README principles, the minimalism constraint, and "Atlas is the standard" hold simultaneously.
- **Core grows a real gate runner** (project-defined semantic checks in config.json) — strongest literal reading of "machine-enforced gates", but largest scope and it turns Core into the workflow product it deliberately is not.

## Consequences

- A process-gate mechanism (e.g. a review skill with an evidence-based Gate mode) becomes Core scope, not a separate product.
- README principles need rewording to attribute execution gates to future scope.
- doctor stays structural; semantic additions must not break the 0/1/2 exit-code contract CI consumers rely on.
