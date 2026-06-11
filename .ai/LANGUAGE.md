# Project Vocabulary

Use this file to define canonical product and codebase terms for AI agents.

## Terms

| Term | Meaning | Avoid |
| --- | --- | --- |
| Atlas | The standard itself — operating rules, review gates, agent skills, templates, and review artifacts for AI-assisted work. | Atlas Standard (as a separate brand layer), framework |
| Atlas Core | The installable harness (`@blazity-atlas/core`) that makes the standard practical in a repository. | AI Harness (legacy name) |
| Built with Atlas | The category of separate products developed using the standard. | Delegating Atlas Core's own gate promises to it |
| Workspace | The artifact tree that Atlas Core installs and `doctor` keeps healthy, located at the workspace root. | — |
| Workspace root | The repo-relative directory holding the workspace — a user preference asked as init's first question, defaulting to `.ai`. | artifactRoot (config field name, not the concept), `.ai` (as a synonym — it is only the default) |
| Template | A named bundle of path aliases controlling which conventional docs folders Atlas Core may migrate into the workspace (standard, library, app, monorepo, agency). | Preset (when the CLI bundle is meant) |
| Preset | A methodology risk-review overlay applied during reviews (Agents, Platform, Workflow, Data migration). | Template (when the review overlay is meant) |
| Fixable finding | A workspace deviation that `doctor --fix` repairs deterministically; its presence exits 1. | — |
| Manual finding | A conflict requiring human resolution; its presence exits 2 and blocks all `--fix` repairs. | — |
| Advisory finding | A non-blocking semantic signal (setup pending, empty memory); never affects exit codes or `--fix`. | — |
| Structural gate | A deterministic check that the workspace matches Atlas Core's contract, enforced by `doctor` and its exit codes. | — |
| Process gate | An evidence-based checkpoint in the development process that produces a review artifact with an explicit verdict. | Review (alone, when the verdict-producing checkpoint is meant) |
| Execution gate | Running tests, evals, or policy checks before merge — outside Atlas Core's scope until a product exists to own it. | Machine-enforced gates (when only structural/process gates are meant) |
