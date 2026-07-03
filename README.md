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

- ⚡ **One command** — `npx @blazity-atlas/core init` scaffolds AGENTS.md, CLAUDE.md, and a complete `.ai/` workspace
- 🤝 **Every agent, one context** — Claude Code, Cursor, Codex, Copilot, and Gemini CLI share the same repo-owned files
- 🧠 **Memory that compounds** — vocabulary, decisions, plans, lessons, and review verdicts accumulate as plain committed files
- 🩺 **Machine-checked** — `atlas doctor` verifies the structure in CI with frozen exit codes; `--fix` repairs drift deterministically
- 📦 **Builds on what you have** — config-driven path aliases adopt your existing docs folders instead of replacing them
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
