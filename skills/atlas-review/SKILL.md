---
name: atlas-review
description: Use when an AI tool idea, plan, implementation, release, or incident needs an Atlas review — deciding whether to build, planning, challenging a plan or implementation, gating a release or promotion, or running a postmortem
---

# Atlas Review

## Overview

This skill is the Atlas process gate: an evidence-based checkpoint that applies the Atlas standard to an AI tool and leaves a review artifact with an explicit verdict. The goal is controlled leverage — AI that is useful in real project work without losing control: repeatable, verifiable, observable, secure, and owned.

The skill is framework-agnostic and tool-agnostic: it reviews any AI tool, agent, workflow, or migration regardless of stack or vendor. It never mutates workspace structure — creating, moving, or repairing directories and config is the CLI's job. This skill only reads the workspace config and writes review artifacts into the configured results directory.

## Modes

One skill, five modes. Pick the mode from what the user presents — an idea, an accepted idea needing a plan, a plan or implementation to challenge, a release candidate, or an incident. If the mode is ambiguous, ask before starting.

### Intake

Decide whether the AI tool should exist: whether AI is actually needed, which preset applies, and what value is expected. Run the Shared Core questions and the Purpose and Fit check in full. Output a build / reshape / do-not-build recommendation with the chosen preset and the expected value.

### Plan

Turn an accepted idea into a tool plan: workflow, users, inputs/outputs, autonomy level, data/tools/permissions, validation, monitoring, and ownership. Every Practical Check must have a planned answer; gaps become open questions, not silence.

### Review

Challenge a plan or implementation against Atlas: missing proof, unclear owner, weak observability, overbroad permissions, no failure path, poor fit with existing tools, or non-compounding design. Output findings as required changes plus a verdict in the review artifact format.

### Gate

Evidence-based readiness check before release or promotion (prototype → internal beta → production candidate → production). The verdict is pass / conditional pass / fail, with required changes, risks, and proof. A conditional pass must name the exact conditions and who clears them. Never issue a verdict without inspecting the evidence first-hand.

### Postmortem

After an incident or failed run, capture what broke, which gates caught issues and which issues escaped, and what changes to rules, evals, fixtures, permissions, and monitoring prevent recurrence. The artifact records the lesson so the next tool inherits it.

## Shared Core

Every review, in every mode, forces explicit answers to nine questions. A vague answer or unstated assumption does not count — record it as an open question, never invent the answer.

1. What real workflow does this improve?
2. Why does this need AI?
3. How do we know it works?
4. What can go wrong?
5. How do we notice when it breaks?
6. Who owns the result?
7. What should a human review?
8. What artifacts does it leave?
9. How does it fit the rest of Atlas?

## Practical Checks

Work through each check and collect evidence, not just answers. In Gate mode a met "blocks when" condition forces fail or conditional pass; in other modes it becomes a required change.

### Purpose and Fit

- Identify the exact workflow and user.
- State the non-AI baseline: manual process, script, form, cron, dashboard, existing product feature.
- Explain why AI is necessary.
- Check whether an existing tool, skill, script, or workflow already solves most of the problem.
- Define the owner and maintenance path.

Blocks when: the tool is novelty-first, duplicates an existing workflow, has no owner, or uses AI where deterministic automation is enough.

### Data and Access

- List every data source the tool can read.
- List every system or action the tool can write to or trigger.
- Define the minimum required permissions.
- Mark sensitive data classes: secrets, PII, client data, source code, financial data, production credentials, private communications.
- Define the revocation and rotation path for tokens and credentials.

Blocks when: access is broader than the workflow requires, privileged actions are not approval-gated, or revocation is unclear.

### Memory and Indexing

- Define what can be stored in memory.
- Define what must never be stored.
- Define memory scope: user, project, repo, client, team, session.
- Define retention and cleanup.
- Check for cross-client or cross-project leakage risk.
- Check stale-memory risk and how memory gets corrected.

Blocks when: memory or indexing scope is "everything", sensitive data can enter memory without rules, or there is no cleanup or correction path.

### Validation and Proof

- Define success metrics and acceptance criteria.
- Require tests, evals, prompt evals, fixtures, golden examples, smoke runs, or telemetry depending on tool type.
- Check failure cases, not only happy paths.
- Require before/after evidence for migration, generation, or automation tools.
- Require manual review examples for judgment-heavy output.

Blocks when: the only proof is "it worked once" or a demo without repeatable evidence.

### Feedback Loops

- Define how production or internal runs are reviewed.
- Feed failures back into prompts, rules, evals, fixtures, permissions, and monitoring.
- Track recurring issues so the next tool inherits the lesson.
- Record which gates caught issues and which issues escaped.

Blocks when: the tool runs repeatedly but does not improve the review process, eval set, prompts, or operating rules.

### Failure and Escalation

- Define expected failure modes.
- Define what the tool does when uncertain, blocked, rate-limited, missing context, or facing conflicting instructions.
- Define the escalation path and human owner.
- Define kill switch, rollback, or safe stop behavior.

Blocks when: failure is silent, destructive, or routed back into autonomous retry loops without limits.

### Observability and Audit

- Log tool calls, data sources used, actions taken, outputs produced, approvals requested, approvals granted, errors, and fallback paths.
- Make logs useful for debugging and audit without leaking secrets.
- Define alerting or review cadence for production or scheduled tools.
- Record generated artifacts: plan, assumptions, decisions, diffs, eval results, risk notes.

Blocks when: nobody can reconstruct what the tool did or why, or the tool behaves like a black box.

### Human Review Boundary

- Define what humans must approve before execution.
- Define what humans review after execution.
- Separate judgment review from repetitive checks.
- Require approval for destructive, external, financial, production, or high-impact actions.

Blocks when: the tool asks for approval on everything, slowing adoption, or on nothing, creating security and ownership risk.

### Release Readiness

- Classify release status: prototype, internal beta, production candidate, production.
- Require different evidence by status.
- Define rollout scope and monitored expansion.
- Define the decommissioning path if the tool stops being useful.

Blocks when: a prototype is treated as production, or a production tool has no owner, monitoring, or rollback. Also blocks when artifacts or documentation that ship with the release contain personal attributions, confidential or internal-only context, or absolute local paths — durable records state needs and reasons, not individuals.

## Presets

Presets are overlays on the Shared Core and Practical Checks — they add emphasis, they never replace questions or relax a "blocks when" condition. There are no preset-specific skills. Choose the preset in Intake, carry it through every later mode, and record it in every artifact. If none fits cleanly, pick the closest and note the mismatch as an open question.

- **Agents** — autonomy scope, tool permissions, human approval and escalation, memory and session behavior, evals, failure handling, misuse paths, audit trail.
- **Platform** — reliability, performance, security, accessibility, deployment, rollback, observability, data boundaries.
- **Workflow** (devtools) — repo safety, dry-run behavior, idempotency, diff visibility, CI/test integration, developer ergonomics, branch and commit safety, reversibility.
- **Data migration** (content/data) — source-of-truth mapping, validation against source, partial failure handling, data loss prevention, traceable transformations, rollback and replay.

## Security Gate

The Security Gate is mandatory in every mode — no preset, mode choice, or time pressure removes it. An unresolved Security Gate answer can never produce a plain pass.

Prevent the common failures:

- unauthorized data access;
- overbroad tool permissions;
- sensitive data indexed into memory too broadly;
- memory leaking between contexts;
- privileged actions without human approval;
- missing audit evidence;
- unclear access revocation;
- sensitive output stored or shown in the wrong place.

Force explicit answers:

- What data can this tool access?
- What data must it never access?
- What is written to memory?
- How is memory scoped?
- What actions require human approval?
- What logs prove what happened?
- How can access be revoked?

## Evidence Standard

Verdicts demand concrete evidence: test output, eval results, fixtures, golden examples, smoke-run logs, telemetry, before/after diffs. "It worked once" blocks. A demo without repeatable evidence blocks. A claim without an inspectable artifact is an open question, not proof.

## Review Artifact

Every Gate, Review, and Postmortem run must write its output as a review artifact. A prompt-only review with no artifact is explicitly not a completed review. Intake and Plan runs should persist their output the same way whenever there is a decision worth keeping.

Resolve the destination through the workspace config — never hardcode `.ai/`, it is only the default root:

1. Read `.ai/config.json`. If it does not exist, read the `.atlas` pointer file at the repository root (one line containing the repo-relative workspace root) and read `<root>/config.json`.
2. Resolve the results directory by joining the config's `artifactRoot` with its `paths.results` value.
3. Write the artifact as `<results>/<YYYY-MM-DD>-<mode>-<tool-slug>.md`.

If no config can be discovered, stop and ask the user to set up Atlas first (the `atlas-setup` skill and CLI own that). Do not create directories or config yourself.

Artifact format — every field present; "unknown" is allowed only as an explicit open question:

- **status**: pass / conditional pass / fail
- **preset**: the overlay applied
- **risk level**: low / medium / high
- **required changes**: concrete, ordered, each with who clears it
- **open questions**: unanswered Shared Core or Security Gate items
- **evidence**: artifacts actually inspected (test output, eval results, fixtures, logs) and where they live
- **approval boundaries**: what humans approve before and review after execution
- **monitoring plan**: signals, alerting, and review cadence
- **owner**: a named person or role accountable for the tool
- **next review date**: when this verdict expires

## Interview Rules

- Inspect before asking: read the tool's code, prompts, configs, logs, and existing artifacts first; ask only what inspection cannot answer.
- Ask one focused question at a time and force an explicit answer.
- Do not accept "it worked once" or a demo as proof — ask where the repeatable evidence lives.
- Mark unknowns as open questions instead of inventing facts.
