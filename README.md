<p align="center">
  <a href="https://blazity.com/atlas">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="assets/atlas-logo-dark.svg">
      <img alt="Atlas" src="assets/atlas-logo-light.svg" width="202">
    </picture>
  </a>
</p>

<h1 align="center">Atlas — repo-owned AI context for coding agents</h1>

<p align="center">
  One command scaffolds the AGENTS.md, repo memory, and vocabulary every coding agent shares —<br>
  and <code>atlas doctor</code> verifies the structure in CI with frozen exit codes.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@blazity-atlas/core"><img alt="npm version" src="https://img.shields.io/npm/v/%40blazity-atlas%2Fcore"></a>
  <a href="https://github.com/Blazity/atlas/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Blazity/atlas/actions/workflows/ci.yml/badge.svg"></a>
  <a href="package.json"><img alt="node >=20" src="https://img.shields.io/node/v/%40blazity-atlas%2Fcore"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/npm/l/%40blazity-atlas%2Fcore"></a>
</p>

---

Every coding agent forgets your repo between sessions, and every tool wants its own config file. You re-explain the architecture, the vocabulary, the "don't touch that" list — per agent, per session, forever.

Atlas (by [Blazity](https://blazity.com)) gives the repository one place for all of it: a plain-files workspace that Claude Code, Codex, Cursor, and anything that reads [AGENTS.md](https://agents.md) share — committed to git, reviewable in PRs, and checked for drift by a deterministic CLI.

## Quickstart

```bash
npx --yes @blazity-atlas/core@latest init
```

Real output, unedited:

```text
Atlas init

Created  .ai/config.json
Created  .ai/memory/
Created  .ai/plans/
Created  .ai/research/
Created  .ai/decisions/
Created  .ai/decisions/adrs/
Created  .ai/results/
Created  .ai/skills/
Created  .ai/LANGUAGE.md
Created  .ai/memory/README.md
Created  .ai/plans/.gitkeep
Created  .ai/research/.gitkeep
Created  .ai/results/.gitkeep
Created  .ai/decisions/adrs/.gitkeep
Created  .ai/skills/atlas-setup/SKILL.md
Created  .ai/skills/atlas-setup/customization.md
Created  .ai/skills/atlas-review/SKILL.md
Created  AGENTS.md (managed block)
Created  CLAUDE.md
Linked   .claude/skills → ../.ai/skills
Linked   .agents/skills → ../.ai/skills
Linked   .cursor/skills → ../.ai/skills

22 changes applied
Template: standard
Root: .ai

Next step — paste this to your coding agent:

  Read .ai/skills/atlas-setup/SKILL.md and follow it to finish the Atlas setup on
  this repository: inspect the repo, confirm or refine the template,
  and fill AGENTS.md and the workspace memory files.

Claude Code: run /atlas-setup (or /atlas:atlas-setup with the Atlas plugin)
Repair drift later: atlas doctor --fix
Commit the scaffold when ready: git add .ai .claude .agents .cursor AGENTS.md CLAUDE.md
```

The CLI writes the deterministic structure; the printed prompt hands the rest to your own coding agent, which inspects the repository and fills the workspace with project-specific facts — vocabulary, memory, and a concise AGENTS.md.

In a terminal, `init` runs interactively: it asks where the workspace should live (default `.ai`), previews every file before writing, and can launch a detected agent CLI (`claude`, `codex`, `cursor-agent`) with the handoff prompt.

## Safe to run on an existing repo

These are behaviors you can verify in two minutes, not promises:

- **Refuses dirty worktrees.** `init` and `doctor --fix` stop when you have uncommitted changes (and name the offending files); `--force` is the explicit override.
- **Preserves your content.** An existing `AGENTS.md` gets one fenced managed block appended; everything you wrote stays. Repairs never touch content outside managed blocks.
- **Idempotent.** A second `init` prints `Already up to date — nothing to write.`
- **Previewable.** `init --dry-run` shows every planned write and touches nothing.
- **Plain files only.** No database, no daemon, no network calls. Uninstall = delete the workspace directory, the managed block in `AGENTS.md`, and three symlinks.

## What accumulates

The scaffold is the boring part. The point is what collects in it as you work: plans, research, ADRs, vocabulary, memory, and review verdicts — in predictable locations agents resolve through `.ai/config.json`, instead of dissolving into chat history.

This repository runs on Atlas. Its own workspace is the demo:

- [`.ai/LANGUAGE.md`](.ai/LANGUAGE.md) — vocabulary with an *Avoid* column that encodes real decisions ("Template ≠ Preset", the legacy name that is banned).
- [`.ai/memory/lessons.md`](.ai/memory/lessons.md) — earned lessons, e.g.: *"Bare managed-skill names collide in shared agent namespaces — Atlas's `review` collided with Claude Code's built-in PR-review skill in practice."*
- [`.ai/decisions/adrs/`](.ai/decisions/adrs) — ADRs that record rejected options, not just winners.
- [`.ai/results/`](.ai/results) — review verdicts from the `atlas-review` process gate.

If your repo already keeps docs in conventional places (`docs/adrs`, `docs/specs`, …), Atlas maps them into the workspace through config-driven `pathAliases` instead of inventing a parallel documentation system — `doctor --fix` performs the moves, and the config keeps routing future writes.

## `doctor` in CI

```yaml
- name: Atlas structural gate
  run: npx --yes @blazity-atlas/core@0.3.0 doctor   # pin the version your workspace was scaffolded with
```

The exit codes are a frozen contract:

| Exit | Meaning |
| --- | --- |
| `0` | Workspace clean — advisories never affect the exit code |
| `1` | Fixable drift — `atlas doctor --fix` repairs it deterministically |
| `2` | Manual conflicts that need a human |

Advisories (setup pending, empty memory) inform and never fail a build. `doctor --json` emits the findings as structured data for scripting. Pin the version rather than `@latest`: managed skill files are byte-compared, so upgrading the package and running `doctor --fix` belong in the same change.

## Reviews that leave a verdict

The second managed skill, `atlas-review`, walks AI-assisted work through five modes — Intake, Plan, Review, Gate, Postmortem — and writes its verdict (pass / conditional pass / fail, with evidence, risks, and an owner) into `.ai/results/`, where the next agent run and the next human can find it. A review that leaves no artifact doesn't count as a review.

Claude Code users run `/atlas-review`. Any other agent gets the same behavior from one instruction: *"read `.ai/skills/atlas-review/SKILL.md`"*.

## Works with your agent

Atlas writes the [AGENTS.md](https://agents.md) standard as its entrypoint, so most agents need zero configuration:

| Agent | How it picks up Atlas |
| --- | --- |
| Claude Code | `CLAUDE.md` imports `AGENTS.md`; skills via `.claude/skills` symlink or the plugin |
| Codex | Reads `AGENTS.md` natively |
| Cursor | Reads `AGENTS.md` natively; `.cursor/skills` symlink provided |
| GitHub Copilot | Reads `AGENTS.md` in the coding agent and VS Code |
| Gemini CLI | One setting: `contextFileName: "AGENTS.md"` |
| Anything else | One instruction: "read AGENTS.md, resolve paths through .ai/config.json" |

Claude Code users can also install through the marketplace:

```text
/plugin marketplace add Blazity/atlas
/plugin install atlas@blazity
/atlas:atlas-setup
```

## Why not just …?

| | Hand-written AGENTS.md | Spec Kit | Session-memory plugins | Atlas |
| --- | --- | --- | --- | --- |
| Structured repo context shared by every agent | you maintain it | partial (per-feature specs) | no (per-user database) | ✔ |
| Drift checked in CI with fixed exit codes | no | no | no | ✔ |
| Adopts your existing docs folders | n/a | no | no | ✔ (`pathAliases`) |
| Reviews that leave verdict files | no | no | no | ✔ |
| Spec → plan → tasks workflow for a feature | no | ✔ | no | no |
| Automatic session capture | no | no | ✔ | no |
| Zero install | ✔ | no | no | no |

Honest notes: **Spec Kit** (GitHub) structures one feature's journey from spec to tasks; Atlas structures the repository's permanent context and checks it in CI — they compose rather than compete. **Session-memory plugins** (claude-mem, Mem0 and friends) capture everything automatically into a local database; Atlas memory is the curated, depersonalized, PR-reviewable layer the whole team shares — you can run both. A plain hand-written `AGENTS.md` is a fine start; Atlas is for when you want the same context to serve every agent, survive tool churn, and stay machine-checked.

## Scope and non-goals

Atlas Core ships two kinds of gates today:

- **Structural gates** — `doctor`'s deterministic workspace checks with the frozen exit codes above.
- **Process gates** — `atlas-review`'s evidence-based verdicts, written into the workspace.

It does **not** run your tests, evals, or policy checks (execution gates are where the standard points next, not what Core does today), it is not an agent runtime, and it does not generate code.

## Privacy

The CLI runs locally, makes no network calls at runtime, sends no telemetry, and has exactly one dependency ([@clack/prompts](https://www.npmjs.com/package/@clack/prompts) for the interactive terminal UI). Everything it writes is a plain file in your repository. The scaffolded documentation rules also require durable artifacts to stay depersonalized — memory that is safe to commit and safe to publish.

## FAQ

**I already have an AGENTS.md / CLAUDE.md.** Kept. Atlas appends one fenced managed block to `AGENTS.md` and only ever repairs that block. An existing `CLAUDE.md` that doesn't import `AGENTS.md` is reported for you to resolve, never overwritten.

**`init` refused: "dirty git worktree".** Deliberate: a tool writing 22 files into your repo should only run on a state you can diff and revert. Commit or stash, or pass `--force`.

**`.claude/skills` already exists in my repo.** Doctor reports it as a manual conflict with the fix: move your skills into `.ai/skills/` (they stay discoverable through the symlink), then `atlas doctor --fix`.

**Monorepo?** Run `init` at the repository root — running it in a package directory refuses unless you pass `--here` for a deliberate nested workspace.

**Custom workspace root?** `init` asks (or `--root docs/ai`); a one-line `.atlas` pointer file at the repo root makes it discoverable. The default `.ai` needs no pointer.

**Windows?** Unverified: the agent-surface symlinks likely require Developer Mode or elevation. CI runs an observational Windows job; treat Windows as unsupported until it's green.

**Does it phone home?** No. See [Privacy](#privacy).

**Global install collides with another `atlas` binary?** MongoDB Atlas CLI and Ariga's atlas also ship an `atlas` bin. Use `npx`, or the `blazity-atlas` bin alias.

## Requirements

Node.js ≥ 20 and a git repository. macOS and Linux supported; Windows observational (see FAQ).

## Built with Atlas

Projects developed on the Atlas standard — each links to its committed, inspectable workspace:

| Project | What it is | Workspace |
| --- | --- | --- |
| [Atlas Eve Starter](https://github.com/Blazity/atlas-eve-starter) | Starter monorepo for production-style agents | [`.ai/`](https://github.com/Blazity/atlas-eve-starter/tree/main/.ai) |
| [Next.js Migration Plugin](https://github.com/Blazity/nextjs-migration-plugin) | Website → Next.js migrations with build gates and visual verification | [`.ai/`](https://github.com/Blazity/nextjs-migration-plugin/tree/main/.ai) |
| [AI Workflow](https://github.com/Blazity/ai-workflow) | Issue → plan → implementation → reviewed PR agent workflows | — |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports with `atlas doctor` output are triage-ready thanks to the bracketed finding codes. Security reports go through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © [Blazity](https://blazity.com) — Atlas is the standard Blazity uses to build and review its own AI tooling; [blazity.com/atlas](https://blazity.com/atlas) covers the broader standard.
