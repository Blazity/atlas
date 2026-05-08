# Blazity Atlas

**AI Engineering Toolkit for Governed Systems**

Move from plan to production fast. Atlas puts governed AI engineering tools inside your development lifecycle: open source, self-hosted, and built to run on any defensible substrate.

Atlas is not a monorepo. This repository is the **Atlas catalog**: the place to see what tools are part of the toolkit, what they do, and where to start.

> Agents can move fast. Your team still owns the system.

## Tools

| Tool | Pillar | Status | What it does |
| --- | --- | --- | --- |
| [Atlas Migrator](https://github.com/Blazity/nextjs-migration-plugin) | Platform | Beta | Migrates existing websites into structured Next.js projects with guided discovery, component planning, build gates, and visual verification. |
| [AI Workflow](https://github.com/Blazity/ai-workflow) | Workflow | Beta | Moves software work from issue to plan, implementation, review, and pull request through governed agent workflows. |
| AI Harness | Foundation | Coming soon | Shared rules, memory, gates, evals, and runtime conventions for Atlas tools and custom agent workflows. |

## Why Atlas Exists

AI can generate code quickly. That is no longer the hard part.

The hard part is keeping the output understandable, reviewable, secure, and aligned with the system your team actually needs to run.

Atlas is built for teams that want AI acceleration without giving up ownership. It brings agents into the delivery process through explicit rules, traceable artifacts, machine-enforced gates, and human review at the points where judgment matters.

## The Atlas Model

Atlas is organized around three practical surfaces.

### Platform

The application your customers use.

Atlas Platform tools help modernize, migrate, and operate production web systems. They focus on architecture, components, routing, content, performance, observability, and deployment paths that remain understandable after the AI work is done.

Start with [Atlas Migrator](https://github.com/Blazity/nextjs-migration-plugin).

### Agents

Autonomous operators around the platform.

Atlas Agents are designed to work inside bounded contexts, with logs, policies, evals, permissions, and review paths. The point is not a black-box assistant. The point is repeatable work that can be inspected and improved.

AI Harness is coming soon as the shared foundation for this layer.

### Workflow

The delivery system.

Atlas Workflow tools connect tickets, plans, implementation, review, and release into one governed loop. Humans stay focused on decisions and adapter boundaries. Machines handle repeatable checks before work reaches review.

Start with [AI Workflow](https://github.com/Blazity/ai-workflow).

## Principles

- **Ownership stays with the team.** Tools run in your repo, your cloud, or your chosen substrate.
- **Every agent needs a gate.** Tests, evals, policy checks, and review rubrics should run before merge.
- **Artifacts compound.** Plans, decisions, logs, and lessons make the next run stronger.
- **Review moves up the stack.** Humans should review architecture, adapter boundaries, risk, and product intent instead of every generated line.
- **No black boxes.** Agent work should be traceable, auditable, and reversible.
- **Substrates change. Systems remain.** Atlas is designed to survive model and infrastructure churn.

## Start Here

If you want to migrate a site to Next.js, start with **Atlas Migrator**.

If you want governed ticket-to-PR automation, start with **AI Workflow**.

If you want the shared foundation behind Atlas tools, watch for **AI Harness**.

## Repository Model

Each Atlas tool has its own repository, roadmap, issue tracker, releases, and contribution path.

Use this repository for:

- Atlas catalog feedback;
- cross-tool proposals;
- marketplace and packaging ideas;
- new tool submissions;
- questions about how the pieces fit together.

Open implementation issues in the specific tool repository whenever possible.

## Links

- Atlas: https://blazity.com/atlas
- Blazity: https://blazity.com
- GitHub: https://github.com/Blazity
