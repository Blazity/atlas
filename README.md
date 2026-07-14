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
- 🕸️ **Optional repo graph** — track a generated repository knowledge graph with freshness and generator-drift advisories (opt-in)
- 📊 **One-screen status** — `atlas status` shows workspace health, artifact freshness, and context budgets; `--json` for scripting
- 🪜 **Starts as small as you want** — `init --minimal` scaffolds just the core, and config migrations keep older workspaces current
- 🧠 **Memory with a lifecycle** — entries carry verified/cites/supersede metadata, `doctor` flags stale or duplicated facts, and `atlas memory pull` syncs a pinned org-wide memory source
- 🛡️ **Security-scanned context** — `doctor` flags hidden-unicode tricks, injection phrasing, and exfiltration shapes planted in the files agents load
- 🔒 **Nothing leaves your repo** — no telemetry, explicit network only, one dependency, plain files only

## Feature showcase

A short demo of `atlas init`, the handoff prompt, and `atlas doctor`.

<div align="center">
  <video src="https://github.com/user-attachments/assets/691767f7-8fc9-46fb-8864-42798fb77819" width="600" controls></video>
</div>

## Quickstart

```bash
npx --yes @blazity-atlas/core@latest init
```

One run scaffolds the workspace — config, vocabulary, memory, artifact directories, managed skills, the AGENTS.md and CLAUDE.md entrypoints, and the agent symlinks — then prints a ready-to-paste handoff prompt. Your own coding agent takes it from there: it inspects the repository and fills the workspace with project-specific facts.

In a terminal, `init` runs interactively: it asks where the workspace should live (default `.ai`), previews every file before writing, and can launch a detected agent CLI (`claude`, `codex`, `cursor-agent`) with the handoff prompt.

Use `init --minimal` when a repository only needs the config, AGENTS.md/CLAUDE.md entrypoints, vocabulary, and memory. The config records disabled features; later, set a feature flag to `true` and run `atlas doctor --fix` to scaffold that feature.

## Safe to run on an existing repo

These are behaviors you can verify in two minutes, not promises:

- **Refuses dirty worktrees.** `init` and `doctor --fix` stop when you have uncommitted changes (and name the offending files); `--force` is the explicit override.
- **Preserves your content.** An existing `AGENTS.md` gets one fenced managed block appended; everything you wrote stays. Repairs never touch content outside managed blocks.
- **Idempotent.** A second `init` prints `Already up to date — nothing to write.`
- **Previewable.** `init --dry-run` shows every planned write and touches nothing.
- **Plain files only.** No database, no daemon; network is used only by explicit commands (`atlas update`, `doctor --check-updates`, `atlas memory pull`). Uninstall = delete the workspace directory, the managed block in `AGENTS.md`, and three symlinks.

## One structure, everything in it

The scaffold is the boring part. The point is what collects in it as you work: plans, research, ADRs, vocabulary, memory, and review verdicts — in predictable locations agents resolve through `.ai/config.json`, instead of dissolving into chat history.

That routing is not Atlas-only. The managed block Atlas writes into `AGENTS.md` tells any agent — and any skill it runs, third-party or custom — to resolve artifact destinations through the config before writing. A planning skill's plan lands in the plans directory, a research skill's report in research, a review's verdict in results: one tree, no matter which tool wrote it.

This repository runs on Atlas. Its own workspace is the demo:

- [`.ai/LANGUAGE.md`](.ai/LANGUAGE.md) — vocabulary with an *Avoid* column that encodes real decisions ("Template ≠ Preset", the legacy name that is banned).
- [`.ai/memory/lessons.md`](.ai/memory/lessons.md) — earned lessons, e.g.: *"Bare managed-skill names collide in shared agent namespaces — Atlas's `review` collided with Claude Code's built-in PR-review skill in practice."*
- [`.ai/decisions/adrs/`](.ai/decisions/adrs) — ADRs that record rejected options, not just winners.
- [`.ai/results/`](.ai/results) — review verdicts from the `atlas-review` process gate.

If your repo already keeps docs in conventional places (`docs/adrs`, `docs/specs`, …), Atlas maps them into the workspace through config-driven `pathAliases` instead of inventing a parallel documentation system — `doctor --fix` performs the moves, and the config keeps routing future writes.

The published config schema lives at [`schema/config.schema.json`](schema/config.schema.json), and scaffolded configs include a `$schema` reference for editor completion. Runtime validation remains hand-rolled and dependency-free.

## Optional repository graph

Atlas can track a generated repository knowledge graph, but the feature is opt-in: scaffolded configs do not include `paths.graph` or `features.graph`, and repos that leave it disabled get no graph findings or graph skill scaffold.

To enable it, add a graph feature block and optionally pin the graph path:

```json
{
  "paths": {
    "graph": "graph"
  },
  "features": {
    "graph": {
      "enabled": true,
      "staleCommitThreshold": 50,
      "generator": {
        "name": "graphify",
        "version": "1.2.3"
      }
    }
  }
}
```

When `paths.graph` is absent, Atlas resolves the default `graph` path under `artifactRoot`. Graph generators write their artifacts there plus `graph.meta.json`:

```json
{
  "generator": { "name": "graphify", "version": "1.2.3" },
  "buildSha": "<git sha>",
  "scope": "code",
  "provenance": "extracted"
}
```

`atlas doctor` never runs a generator. When graph support is enabled, it reports graph metadata problems as advisories only: missing or invalid sidecars, stale `buildSha` values, and generator-version drift from the pinned config. The optional `atlas-graph` managed skill detects a user-installed graphify CLI, runs it in code-only/offline mode, writes the sidecar, and shows the diff for review.

## Workspace status

`atlas status` is the read-only dashboard for the same workspace. It recomputes doctor health without applying fixes, inventories configured artifacts, reports memory freshness, compresses context-size risk to over-threshold files, and shows the newest review verdict. It always exits `0`; use `doctor` when you need a gate. `status --json` emits stable top-level keys: `initialized`, `identity`, `health`, `artifacts`, `memoryFreshness`, `contextBudgets`, and `lastReviewVerdict`. When `initialized` is `false`, the payload also includes `message` and `initCommand`. `health.classification` is one of `clean`, `fixable`, `manual`, or `not-initialized`.

Two weeks in, this repository's own workspace reports:

```text
Atlas status

Identity:
  Template: library
  Workspace root: .ai
  Atlas version: 0.5.0 (CLI 0.5.0, current)
  Setup state: configured

Health:
  Classification: clean
  Findings: 0 manual, 0 fixable, 0 advisory

Artifacts:
  Plans: 4 files (2026-06-11 to 2026-07-07)
  Research: 1 file (2026-06-11)
  Decisions/ADRs: 4 files (2026-06-11 to 2026-07-06)
  Results: 1 file (2026-07-03)
  Memory: 4 files (2026-06-11 to 2026-06-12)
  Language: 1 file (2026-06-11)

Memory Freshness:
  Files: 4 files
  Date range: 2026-06-11 to 2026-06-12
  Last memory commit: 2026-06-12
  Entry metadata: counts-only

Context Budgets:
  No files over threshold.

Last Review Verdict:
  conditional pass - .ai/results/2026-07-02-gate-atlas-core-0-4-0.md (2026-07-03)
```

## Memory standard

Memory stays in readable markdown files. Entries can opt into lifecycle checks by placing Atlas metadata immediately after a heading:

```markdown
## Bare managed-skill names collide in shared namespaces
<!-- atlas: id=skill-name-collisions verified=2026-06-12 cites=src/templates.js scope=repo -->
```

All metadata keys are optional: `id`, `verified`, `cites`, `scope`, `source`, and `superseded-by`. Plain markdown remains healthy; unmarked entries are not checked for age, citations, dedupe, or supersede links.

`doctor` reports memory findings as advisories only: `duplicate-memory-entry`, `duplicate-memory-id`, `stale-memory`, `broken-citation`, `dangling-supersede`, `malformed-memory-metadata`, `shared-memory-behind`, and `shared-memory-edited`. The scratch tier lives in `.ai/memory/local/` and is gitignored. The `atlas-memory` managed skill handles session-end capture, depersonalization, ADD / UPDATE / DELETE / NOOP proposals, and promotion from scratch into committed memory.

For organization memory, configure:

```json
{
  "memory": {
    "shared": {
      "source": "git@example.com:org/memory.git",
      "ref": "main",
      "pin": "<commit-sha>"
    }
  }
}
```

`atlas memory pull` is the explicit networked command: it vendors the pinned shared tree into `.ai/memory/shared/` and records hashes in `atlas.lock.json`. `doctor` then flags `shared-memory-behind` and `shared-memory-edited` as advisories without going online. `atlas memory propose` exports local entries marked `scope=org` into `.ai/results/memory-proposal/` for review in the shared memory repository; it never pushes or opens PRs.

## `doctor` in CI

```yaml
- name: Atlas structural gate
  run: npx --yes @blazity-atlas/core@0.5.0 doctor   # pin the version your workspace was scaffolded with
```

The exit codes are a frozen contract:

| Exit | Meaning |
| --- | --- |
| `0` | Workspace clean — advisories never affect the exit code |
| `1` | Fixable drift — `atlas doctor --fix` repairs it deterministically |
| `2` | Manual conflicts that need a human |

Advisories (setup pending, empty memory, memory lifecycle checks, shared-memory drift, oversized context) inform and never fail a build. `doctor --json` emits the findings as structured data for scripting. Pin the version rather than `@latest`: managed skill files are byte-compared, so upgrading the package and running `doctor --fix` belong in the same change.

Per-repo suppression lives in `.ai/config.json` under `doctor.suppress`. Suppression can hide advisory or fixable finding codes, never manual conflicts; suppressed findings still render as one summary line and appear under `suppressed` in `doctor --json`.

Context-size advisories watch the files agents actually load — `AGENTS.md`, `CLAUDE.md`, vocabulary, memory, decisions, managed skills — against heuristic character budgets informed by documented agent caps (for example, Codex reads at most 32 KiB of project docs by default). They are hints to compact, not model limits. When one fires, `atlas doctor --handoff context-size` prints a safe cleanup prompt for any agent, and the `atlas-compact` managed skill runs the full loop: measure with the CLI, propose a per-file plan, apply approved edits, re-run `doctor` for before/after proof.

### Security scanning

`doctor` also scans committed AI context for prompt-injection shapes: hidden unicode, imperative instructions in comments or declarative memory, credential-bearing URLs, suspicious secret-file exfiltration instructions, broad skill `allowed-tools`, unreferenced executable skill files, and external write directives. These findings use `security-*` codes, are always advisories, appear in `doctor --json` with file and line evidence, and are never changed by `doctor --fix`.

## Updating

`atlas update` checks npm for a newer release and prints the pinned upgrade command. `doctor --check-updates` runs the same check as a non-blocking advisory. `atlas memory pull` fetches only the configured `memory.shared` git source. `doctor` itself never goes online, so CI stays deterministic and offline.

The workspace records how it was written, and `doctor` uses both records:

- `config.json` carries `atlasVersion`, the package version that last wrote the workspace. A newer CLI reports a `atlas-version-behind` advisory until you run `doctor --fix`; an older CLI hits an `atlas-version-ahead` manual conflict instead of silently reverting newer managed files (`--force` is the explicit override).
- `atlas.lock.json` records a content baseline for every managed skill file. A file that differs from the package but matches its baseline was never touched locally, so `--fix` updates it. A file that differs from both is a deliberate customization: `doctor` reports a `customized-skill` advisory and `--fix` leaves it alone. Keep the customization with `doctor --adopt-skills` (the advisory returns only when a later release changes that skill), or overwrite it with `doctor --fix --reset-skills`.
- Config migrations are reported as `config-migration-available` and applied only by `doctor --fix`. Customized legacy defaults are left in place with a `config-migration-conflict` advisory that names the old default, new default, and current value.

Workspaces scaffolded before the lockfile existed classify old skill content as customized once — run `doctor --fix --reset-skills` after upgrading if you never customized the managed skills.

## Reviews that leave a verdict

The `atlas-review` managed skill walks AI-assisted work through five modes — Intake, Plan, Review, Gate, Postmortem — and writes its verdict (pass / conditional pass / fail, with evidence, risks, and an owner) into `.ai/results/`, where the next agent run and the next human can find it. A review that leaves no artifact doesn't count as a review.

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

The CLI runs locally, sends no telemetry, and has exactly one dependency ([@clack/prompts](https://www.npmjs.com/package/@clack/prompts) for the interactive terminal UI). Network access is limited to explicit update checks and `atlas memory pull`. Everything it writes is a plain file in your repository. The scaffolded documentation rules also require durable artifacts to stay depersonalized — memory that is safe to commit and safe to publish.

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
