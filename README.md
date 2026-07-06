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
  One command gives every coding agent the same documentation structure, repo memory, and AGENTS.md —<br>
  and <code>atlas doctor</code> keeps that structure verified in CI with frozen exit codes.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@blazity-atlas/core"><img alt="npm version" src="https://img.shields.io/npm/v/%40blazity-atlas%2Fcore"></a>
  <a href="https://github.com/Blazity/atlas/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Blazity/atlas/actions/workflows/ci.yml/badge.svg"></a>
  <a href="package.json"><img alt="node >=20" src="https://img.shields.io/node/v/%40blazity-atlas%2Fcore"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/npm/l/%40blazity-atlas%2Fcore"></a>
</p>

---

Every coding agent forgets your repo between sessions, and every tool wants its own config file. You re-explain the architecture, the vocabulary, the "don't touch that" list — per agent, per session, forever.

Atlas (by [Blazity](https://blazity.com)) gives the repository one place for all of it: a unified documentation structure and plain-files workspace that Claude Code, Codex, Cursor, and anything that reads [AGENTS.md](https://agents.md) share — committed to git, reviewable in PRs, and checked for drift by a deterministic CLI.

- ⚡ **One command** — `npx @blazity-atlas/core init` scaffolds AGENTS.md, CLAUDE.md, and a complete `.ai/` workspace
- 🗂️ **One structure for everything** — plans, research, decisions, ADRs, memory, vocabulary, and review verdicts in predictable, config-defined locations
- 🤝 **Every agent, one context** — Claude Code, Cursor, Codex, Copilot, and Gemini CLI share the same repo-owned files
- 🧩 **Plays well with skills** — third-party and custom skills route their documentation output through `.ai/config.json` instead of inventing new folders
- 📦 **Builds on what you have** — config-driven path aliases adopt your existing docs folders instead of replacing them
- 🩺 **Machine-checked** — `atlas doctor` verifies the structure in CI with frozen exit codes; `--fix` repairs drift deterministically
- 🔒 **Nothing leaves your repo** — no telemetry, no network calls, one dependency, plain files only

## Quickstart

```bash
npx --yes @blazity-atlas/core@latest init
```

<!-- TODO(maintainer): embed demo recording here — assets/atlas-demo.gif (init → handoff prompt → doctor) -->

One run scaffolds the workspace — config, vocabulary, memory, artifact directories, two managed skills, the AGENTS.md and CLAUDE.md entrypoints, and the agent symlinks — then prints a ready-to-paste handoff prompt. Your own coding agent takes it from there: it inspects the repository and fills the workspace with project-specific facts.

In a terminal, `init` runs interactively: it asks where the workspace should live (default `.ai`), previews every file before writing, and can launch a detected agent CLI (`claude`, `codex`, `cursor-agent`) with the handoff prompt.

## Safe to run on an existing repo

These are behaviors you can verify in two minutes, not promises:

- **Refuses dirty worktrees.** `init` and `doctor --fix` stop when you have uncommitted changes (and name the offending files); `--force` is the explicit override.
- **Preserves your content.** An existing `AGENTS.md` gets one fenced managed block appended; everything you wrote stays. Repairs never touch content outside managed blocks.
- **Idempotent.** A second `init` prints `Already up to date — nothing to write.`
- **Previewable.** `init --dry-run` shows every planned write and touches nothing.
- **Plain files only.** No database, no daemon; the only network call is the explicitly invoked update check (`atlas update` / `doctor --check-updates`). Uninstall = delete the workspace directory, the managed block in `AGENTS.md`, and three symlinks.

## One structure, everything in it

The scaffold is the boring part. The point is what collects in it as you work: plans, research, ADRs, vocabulary, memory, and review verdicts — in predictable locations agents resolve through `.ai/config.json`, instead of dissolving into chat history.

That routing is not Atlas-only. The managed block Atlas writes into `AGENTS.md` tells any agent — and any skill it runs, third-party or custom — to resolve artifact destinations through the config before writing. A planning skill's plan lands in the plans directory, a research skill's report in research, a review's verdict in results: one tree, no matter which tool wrote it.

This repository runs on Atlas. Its own workspace is the demo:

- [`.ai/LANGUAGE.md`](.ai/LANGUAGE.md) — vocabulary with an *Avoid* column that encodes real decisions ("Template ≠ Preset", the legacy name that is banned).
- [`.ai/memory/lessons.md`](.ai/memory/lessons.md) — earned lessons, e.g.: *"Bare managed-skill names collide in shared agent namespaces — Atlas's `review` collided with Claude Code's built-in PR-review skill in practice."*
- [`.ai/decisions/adrs/`](.ai/decisions/adrs) — ADRs that record rejected options, not just winners.
- [`.ai/results/`](.ai/results) — review verdicts from the `atlas-review` process gate.

If your repo already keeps docs in conventional places (`docs/adrs`, `docs/specs`, …), Atlas maps them into the workspace through config-driven `pathAliases` instead of inventing a parallel documentation system — `doctor --fix` performs the moves, and the config keeps routing future writes.

## `doctor` in CI

```yaml
- name: Atlas structural gate
  run: npx --yes @blazity-atlas/core@0.4.0 doctor   # pin the version your workspace was scaffolded with
```

The exit codes are a frozen contract:

| Exit | Meaning |
| --- | --- |
| `0` | Workspace clean — advisories never affect the exit code |
| `1` | Fixable drift — `atlas doctor --fix` repairs it deterministically |
| `2` | Manual conflicts that need a human |

Advisories (setup pending, empty memory, oversized context) inform and never fail a build. `doctor --json` emits the findings as structured data for scripting. Pin the version rather than `@latest`: managed skill files are byte-compared, so upgrading the package and running `doctor --fix` belong in the same change.

Context-size advisories watch the files agents actually load — `AGENTS.md`, `CLAUDE.md`, vocabulary, memory, decisions, managed skills — against heuristic character budgets informed by documented agent caps (for example, Codex reads at most 32 KiB of project docs by default). They are hints to compact, not model limits. When one fires, `atlas doctor --handoff context-size` prints a safe cleanup prompt for any agent, and the `atlas-compact` managed skill runs the full loop: measure with the CLI, propose a per-file plan, apply approved edits, re-run `doctor` for before/after proof.

## Updating

`atlas update` checks npm for a newer release — the only Atlas command that touches the network, and only when you run it — and prints the pinned upgrade command. `doctor --check-updates` runs the same check as a non-blocking advisory. `doctor` itself never goes online, so CI stays deterministic and offline.

The workspace records how it was written, and `doctor` uses both records:

- `config.json` carries `atlasVersion`, the package version that last wrote the workspace. A newer CLI reports a `atlas-version-behind` advisory until you run `doctor --fix`; an older CLI hits an `atlas-version-ahead` manual conflict instead of silently reverting newer managed files (`--force` is the explicit override).
- `atlas.lock.json` records a content baseline for every managed skill file. A file that differs from the package but matches its baseline was never touched locally, so `--fix` updates it. A file that differs from both is a deliberate customization: `doctor` reports a `customized-skill` advisory and `--fix` leaves it alone. Keep the customization with `doctor --adopt-skills` (the advisory returns only when a later release changes that skill), or overwrite it with `doctor --fix --reset-skills`.

Workspaces scaffolded before the lockfile existed classify old skill content as customized once — run `doctor --fix --reset-skills` after upgrading if you never customized the managed skills.

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

## Scope and non-goals

Atlas Core ships two kinds of gates today:

- **Structural gates** — `doctor`'s deterministic workspace checks with the frozen exit codes above.
- **Process gates** — `atlas-review`'s evidence-based verdicts, written into the workspace.

It does **not** run your tests, evals, or policy checks (execution gates are where the standard points next, not what Core does today), it is not an agent runtime, and it does not generate code.

## Privacy

The CLI runs locally, makes no network calls at runtime, sends no telemetry, and has exactly one dependency ([@clack/prompts](https://www.npmjs.com/package/@clack/prompts) for the interactive terminal UI). Everything it writes is a plain file in your repository. The scaffolded documentation rules also require durable artifacts to stay depersonalized — memory that is safe to commit and safe to publish.

## Requirements

Node.js ≥ 20 and a git repository. macOS and Linux supported; Windows untested.

## Built with Atlas

Developed on the Atlas standard by Blazity:

- [Atlas Eve Starter](https://github.com/Blazity/atlas-eve-starter) — starter monorepo for production-style agents
- [Next.js Migration Plugin](https://github.com/Blazity/nextjs-migration-plugin) — website → Next.js migrations with build gates and visual verification
- [AI Workflow](https://github.com/Blazity/ai-workflow) — issue → plan → implementation → reviewed PR agent workflows

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports with `atlas doctor` output are triage-ready thanks to the bracketed finding codes. Security reports go through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © [Blazity](https://blazity.com)

---

<p align="center">
  <a href="https://blazity.com"><img src="https://github.com/Blazity.png" width="72" alt="Blazity"></a>
</p>
<p align="center">
  <sub>Atlas is built and maintained by <a href="https://blazity.com">Blazity</a> — the standard behind our own AI tooling. More at <a href="https://blazity.com/atlas">blazity.com/atlas</a>.</sub>
</p>
