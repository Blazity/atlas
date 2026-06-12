---
name: atlas-setup
description: Use when a repository needs Atlas setup, repair/update, AGENTS.md refresh, AI memory refresh, vocabulary cleanup, or review after major codebase changes
---

# Set Up Atlas

## Overview

Use this skill for first setup and later refreshes. The published CLI owns deterministic structure; this skill owns semantic repository understanding.

Humans and agents use the same deterministic entrypoint. Do not reimplement `init`, `doctor`, path repair, symlink repair, or managed file repair inside this skill. Call the CLI through `npx`.

Run the phases below in order.

## Phase 1 — Deterministic Bootstrap

Before inspecting repository meaning, announce the deterministic setup steps you are about to run.

From the repository root, run:

```bash
npx --yes @blazity-atlas/core@latest doctor
```

Then follow the CLI result:

- If Atlas is missing or mostly uninitialized, run `npx --yes @blazity-atlas/core@latest init`.
- If `doctor` reports only fixable drift, run `npx --yes @blazity-atlas/core@latest doctor --fix`.
- If `doctor --fix` refuses because of a dirty worktree, stop and ask the user whether to commit, stash, or explicitly rerun with `--force`. Do not use `--force` automatically.
- If `doctor` reports manual conflicts, summarize those conflicts and stop before semantic setup.
- Rerun `npx --yes @blazity-atlas/core@latest doctor` after any init or fix command.
- Continue only when `doctor` exits clean. Advisory findings (`doctor` exits 0) do not count as unclean — they are signals this skill resolves in later phases. Only fixable or manual findings block this phase.

If the current directory is not a git repository, stop and ask the user to run the skill from the repository root or initialize git first.

## Phase 2 — Grounding Scan

1. Locate the workspace config: read `.ai/config.json`, or when absent, follow the `.atlas` repo-root pointer to `<root>/config.json`. Resolve every artifact location through that config — the workspace root may not be `.ai`.
2. Inspect the repository before asking questions: README, package metadata, lockfiles, framework configs, existing docs, tests, and agent instructions.
3. Brownfield backfill — mine recent history for candidate decisions, pitfalls, and vocabulary to seed memory and lessons:
   - `git log --oneline -50`
   - recent PR titles, when a forge CLI such as `gh` is available
   - existing legacy docs already in the repo (ADRs, changelogs, design notes, wikis)

   Keep the backfill bounded: do not read the whole history or every document, and note explicitly what was skipped. Treat mined facts as candidates to confirm, not established truths.
4. Infer only obvious facts from code. Ask about product, domain, ownership, and workflow details that code cannot answer.
5. Mark unknowns explicitly instead of inventing facts.

## Phase 3 — Template Detect-and-Confirm

Do not ask the user to pick a template name from a list. Detect the fit, show the moves, and confirm:

1. Inspect which conventional `docs/*` folders actually exist in the repository.
2. Map them to template `pathAliases`. The templates are `standard, app, library, monorepo, agency` (the CLI's `getTemplateNames()`); they differ only in which conventional `docs/*` folders map into the workspace tree, so the labels stay but the moves are the interface.
3. Propose the merge as the concrete file moves that would happen — for example `docs/adrs/* → <root>/decisions/adrs/` — and name the template label those moves correspond to.
4. Confirm with the user before applying. Apply by setting the config's `template` field and merging that template's `pathAliases`. Do not invent new artifact roots.
5. Re-run `npx --yes @blazity-atlas/core@latest doctor` afterward and continue only when no fixable or manual findings remain.

## Phase 4 — Interview

Open with the fast path: ask whether the user wants to accept all recommended defaults. If yes, skip the interview and proceed with the recommendations from grounding.

Otherwise:

- Ask one focused question at a time, always with a recommended default.
- Hard budget of about 6 questions. Spend it on the highest-leverage unknowns; record the rest as explicit unknowns instead of asking more.
- Do not ask questions that repository inspection or the backfill already answered.
- Keep questions focused on facts that affect future agent behavior.

Good questions cover: product purpose, target users, current direction, deploy/runtime expectations, architectural invariants, common pitfalls, safe commands, branch/release workflow, domain vocabulary, and external systems.

## Phase 5 — Artifact Generation

Resolve every path through the config from Phase 2 — never hardcode `.ai/`.

- Keep `AGENTS.md` concise and high-signal. Preserve human content and the Atlas managed block.
- Fill `LANGUAGE.md` (the configured `language` path) with canonical terms and avoided synonyms.
- Fill `memory/product.md`, `memory/architecture.md`, and `memory/stack.md` with stable facts only.
- Append `memory/lessons.md` only for proven non-obvious pitfalls.
- Do not create new artifact roots. Use the config's `paths`.
- Depersonalize everything durable: record needs, decisions, and reasons — never individuals or internal process. Write "memory was needed to persist context across runs", not "<name> wanted memory". Keep personal names, private schedules, internal-only references, and absolute local paths out of workspace artifacts.

## Phase 6 — Verify and Handover

1. Run `npx --yes @blazity-atlas/core@latest doctor` again — actually run it, never assume the result.
2. As the final act of setup, flip `setupState` in `<root>/config.json` from `"scaffolded"` to `"configured"`. No other write may follow this flip.
3. Show a concise summary: files written and unknowns left.
4. Suggest a commit of the setup result.
5. Offer one first-value proof: answer one nontrivial question about the repository using only workspace content.

After setup completes, reviews of AI tools and AI-assisted changes run through the sibling `atlas-review` skill.

## Phase 7 — Customization Offer

At the end of the flow, offer: want to tune layout, agent surfaces, or local skills?

- If the user accepts, or their prompt already explicitly asked to customize Atlas, read `customization.md` from this skill's directory and follow that workflow.
- Otherwise, do not read `customization.md`.

## Modes

### Initial Setup

Use when the harness is new or mostly empty. Build the first useful AI context for the repository.

### Refresh

Use after major codebase, architecture, dependency, command, or product changes. Compare existing AI context with the current repository and update only stale or missing facts.

## Quality Bar

`AGENTS.md` should help an agent work safely within the first minute: what this repo is, how it is structured, what commands are safe, what rules matter, and what not to touch. Prefer short factual sections over long prose.
