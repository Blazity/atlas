# Atlas

The standard and installable harness for AI-assisted engineering in a git repository: development memory, agent skills, review artifacts, and operating rules. This glossary covers the product taxonomy and the gate vocabulary.

## Language

### Product taxonomy

**Atlas**:
The standard itself — operating rules, review gates, agent skills, templates, and review artifacts for AI-assisted work.
_Avoid_: Atlas Standard (as a separate brand layer), framework

**Atlas Core**:
The installable harness (`@blazity-atlas/core`) that makes the standard practical in a repository.
_Avoid_: AI Harness (legacy name)

**Built with Atlas**:
The category of separate products developed using the standard.
_Avoid_: delegating Atlas Core's own gate promises to it

**Workspace**:
The artifact tree that Atlas Core installs and `doctor` keeps healthy, located at the workspace root.

**Workspace root**:
The repo-relative directory holding the workspace — a user preference asked as init's first question, defaulting to `.ai`.
_Avoid_: artifactRoot (config field name, not the concept), `.ai` (as a synonym — it is only the default)

**Template**:
A named bundle of path aliases controlling which conventional docs folders Atlas Core may migrate into the workspace (standard, library, app, monorepo, agency).
_Avoid_: preset (when the CLI bundle is meant)

**Preset**:
A methodology risk-review overlay applied during reviews (Agents, Platform, Workflow, Data migration).
_Avoid_: template (when the review overlay is meant)

### Findings

**Fixable finding**:
A workspace deviation that `doctor --fix` repairs deterministically; its presence exits 1.

**Manual finding**:
A conflict requiring human resolution; its presence exits 2 and blocks all `--fix` repairs.

**Advisory finding**:
A non-blocking semantic signal (setup pending, empty memory); never affects exit codes or `--fix`.

### Gates

**Structural gate**:
A deterministic check that the workspace matches Atlas Core's contract, enforced by `doctor` and its exit codes.

**Process gate**:
An evidence-based checkpoint in the development process that produces a review artifact with an explicit verdict.
_Avoid_: review (alone, when the verdict-producing checkpoint is meant)

**Execution gate**:
Running tests, evals, or policy checks before merge — outside Atlas Core's scope until a product exists to own it.
_Avoid_: machine-enforced gates (when only structural/process gates are meant)

## Relationships

- **Atlas Core** installs the harness that makes **Atlas** practical in one repository
- **Atlas Core** enforces **structural gates** and **process gates**; it does not run **execution gates**
- A **process gate** leaves its verdict as a review artifact in the **workspace**

## Example dialogue

> **Dev:** "The README says machine-enforced gates — so Atlas runs my tests before merge?"
> **Domain expert:** "No — that would be an **execution gate**, which **Atlas Core** doesn't own. Core gives you the **structural gate** (`doctor` in CI) and **process gates** (skill-driven reviews whose verdicts land in the **workspace**)."

## Flagged ambiguities

- "gate" was used for three different mechanisms — resolved 2026-06-11: split into **structural gate**, **process gate**, and **execution gate**.
- "template" vs "preset" occupied the same conceptual slot with unrelated semantics — resolved 2026-06-11: **template** is the CLI alias bundle, **preset** is the methodology review overlay; never use one for the other.
