# Product

## What Atlas is

- **Atlas** is the standard: operating rules, review gates, agent skills, templates, and review artifacts for AI-assisted engineering in a git repository.
- **Atlas Core** (`@blazity-atlas/core`, this repo) is the installable harness that makes the standard practical in one repository: the `atlas init` / `atlas doctor` CLI, managed setup and review skills, and deterministic workspace scaffolding.
- **Built with Atlas** is the category of separate products developed using the standard. Atlas Core's gate promises hold on their own and are never delegated to that category.

## Positioning

Blazity-internal standard and open-source package (MIT, published to npm as `@blazity-atlas/core`). Installing Atlas Core gives a project the harness that makes the standard practical.

## Gate split (ADR-0001)

- **Structural gates** are in Core: doctor's deterministic workspace checks, exposed to CI via the frozen 0/1/2 exit-code contract.
- **Process gates** are in Core: skill-driven, evidence-based checkpoints whose verdicts are written as review artifacts into the workspace.
- **Execution gates** (tests, evals, policy checks before merge) are explicitly future scope — out of Core until a product exists to own them.

## Templates

The five templates (standard, library, app, monorepo, agency) differ only in `pathAliases` — which conventional `docs/*` folders Atlas Core may migrate into the workspace. The labels stay, but the moves are the interface.
