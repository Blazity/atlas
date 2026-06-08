# Atlas CLI Redesign — Design Spec

_Date: 2026-06-08 · Status: approved for planning_

## Summary

Redesign the `@blazity-atlas/core` CLI (`atlas init` / `atlas doctor`) to deliver
the branded, animated terminal experience mocked up in the `Atlas CLI.html`
design handoff, and to fix three behavioral problems in the current `init` flow.
The work introduces an animated ASCII `ATLAS` logo, a `@clack/prompts`-style
interactive flow in the Blazity palette, a confirmation gate before any
mutation, and a clean copy-paste handoff prompt — while preserving a
deterministic, CI-safe, testable non-interactive path.

## Background

### Where the code lives

The canonical `@blazity-atlas/core@0.2.0` source is in this repository
(`Blazity/atlas`) on branch **`feat/installable-atlas-core`** — `bin/atlas.js`,
`src/{cli,init,doctor,output,templates,config,actions,managed-blocks,repo}.js`,
`skills/setup/`, and `test/`. The predecessor package lives at
`Blazity/ai-harness` (`@blazity-atlas/ai-harness`). The `Atlas CLI.html` mockup
is a prototype only; we recreate its visual output in the CLI, not its DOM.

Implementation branches off `feat/installable-atlas-core` as
`feat/atlas-cli-redesign`.

### The design source

`Atlas CLI.html` + `atlas/term.js` + `atlas/flow.js` (Claude Design handoff).
Chosen logo direction (from the design chat): **Figlet ANSI-Shadow `ATLAS`**
wordmark with an orange→yellow gradient sweep. Brand palette and JetBrains Mono
throughout.

### Current behavior and the bugs it has

The current `runInit` interleaves diagnosis, mutation, and printing:

1. `collectDoctorFindings()` returns findings whose `message` describes the
   *problem* (e.g. `".ai/config.json is missing"`).
2. `applyFixes()` writes the files.
3. `formatFindings(fixableFindings, { fixableHeading: "Applied changes:" })`
   prints those same *problem* messages under the heading **"Applied changes:"**.

Observed problems (reported by the user, confirmed in source):

- **#1 — Plain text.** No color, no logo, no motion.
- **#2 — `init` misreports what it did.** Header says `Applied changes:` then
  lists `- [missing-config] .ai/config.json is missing`, reading like a dry-run
  that changed nothing — even though files were written. Root cause: the
  diagnostic message is reused as the change description; `formatFindings` is
  shared with `doctor` and has no notion of an *action* vs a *problem*.
- **#3 — Vague next step.** `initNextStepText()` prints six lines mixing
  CLI-first, Claude-plugin, and skill-first guidance — none of it the clean,
  pasteable agent prompt the flow actually needs.
- **#4 — No confirmation.** `runInit` writes immediately; the only guard is a
  dirty-worktree refusal. `--dry-run` is opt-in.

### Template insight

Templates (`standard`, `app`, `library`, `monorepo`, `agency`) differ **only in
`pathAliases`** — additive mappings of conventional `docs/*` folders into the
`.ai/` artifact tree. Every template writes the same core structure. Template
choice is therefore low-stakes, additive config, cheap to apply or change later
(merge aliases into `.ai/config.json`). This is better inferred by an agent that
has read the repo than chosen by a human from a blind dropdown.

## Goals

- Recreate the mockup's visual experience in the real CLI: animated logo, brand
  palette, clack-style prompts, ora-style spinner.
- Fix bugs #1–#4 at the root.
- Move template selection out of the CLI and into the setup skill.
- Preserve a deterministic, CI-safe, testable non-interactive path.

## Non-Goals

- Changing the `.ai/` template *structure* or `config.json` schema.
- Building the standalone HTML showcase.
- Catalog `README.md` / marketplace changes.
- Creating a new skill (the existing `setup` skill is reused).

## Architecture: `plan → confirm → apply → render`

Split the tangled `runInit` into pure, independently testable stages.

- **`plan(cwd, { template })` → `Plan`** (pure, no stdout)
  - `Plan = { template, actions: Action[], conflicts: Conflict[] }`
  - `Action = { kind: 'create' | 'update' | 'link' | 'move', path, target?, detail? }`
  - Built from the existing `collectDoctorFindings`, but each fixable finding is
    mapped to an **action with its own description** derived from the action
    type, not from the diagnostic message:
    - `write` (new) → `create` → "Created `<path>`"
    - `write` (existing/changed) → `update` → "Updated `<path>`" (+ detail, e.g.
      "added managed block")
    - `mkdir` → `create` → "Created `<path>/`"
    - `symlink` → `link` → "Linked `<path>` → `<target>`"
    - `move` → `move` → "Moved `<from>` → `<to>`"
  - Non-fixable findings become `conflicts` (rendered, then stop before write).

- **`apply(plan)`** (pure mutation, no stdout) — wraps existing
  `applyFixes`/`applyAction`.

- **`render`** — two implementations selected by mode:
  - **interactive** (`src/ui/`): real TTY and not `--yes`/`--ci` → animated logo
    + `@clack/prompts` flow.
  - **plain** (deterministic): non-TTY / piped / `--yes` / CI → fixed-wording
    text. This path remains a pure `runCli(argv) → { exitCode, stdout, stderr }`
    so existing string tests stay meaningful.

### Mode gating

- `interactive = process.stdout.isTTY && process.stdin.isTTY && !flags.yes && !flags.ci && !process.env.CI`
- Color is a separate axis: enabled for TTY or `FORCE_COLOR`, disabled for
  `NO_COLOR` or non-TTY. Color-off must still produce readable output.

### Module layout

```
bin/atlas.js          entry → main()
src/cli.js            arg parse + dispatch; non-interactive runCli() preserved
src/init.js           runInit (plain) refactored onto plan/apply
src/plan.js           plan() + action→description mapping (new, pure)
src/doctor.js         collectDoctorFindings / applyFixes / classifyFindings (unchanged core)
src/output.js         formatFindings (plain) + new action-description renderer
src/templates.js      default content + redesigned initNextStepText (copy-paste prompt)
src/config.js         unchanged
src/actions.js        unchanged
src/ui/theme.js       brand palette (24-bit ANSI), NO_COLOR/TTY handling
src/ui/logo.js        baked ANSI-Shadow ATLAS art + gradient reveal (gradient-string)
src/ui/flow.js        interactive init via @clack/prompts
src/ui/doctor.js      interactive (colorized) doctor render
```

`main()` chooses interactive vs plain per mode; the interactive path writes to
the TTY directly (clack owns stdin/stdout), the plain path returns a string.

## The `init` flow (interactive)

No template prompt. Default `standard` baseline written silently.

1. **Logo** (boot, ~1s): baked ANSI-Shadow `ATLAS`, revealed line-by-line in an
   orange→yellow `gradient-string` sweep, settle. Tagline:
   `the agentic repo standard · v<version> · node <major.minor>`.
2. `intro("atlas init")`.
3. Spinner *"scanning repository…"* → mariner-blue stack line
   (e.g. `Next.js 15 · pnpm · TypeScript`). Stack detection is best-effort and
   cosmetic; absence degrades gracefully.
4. *"No `.ai/` workspace found — first-time setup"* (or "refresh" if present).
5. **Planned `.ai/` tree** shown as a dry-run preview (the `Plan.actions`).
6. **`confirm("Write these N files to .ai/?")`** (default yes). `No` → "Nothing
   written." and exit 0.
7. Spinner *"writing N files…"* → apply.
8. Spinner *"running doctor…"* → `✓ doctor · 0 issues`.
9. **`outro`** with the copy-paste prompt (see #3 fix).

`doctor` (interactive) gets a compact one-line mark + colorized findings; it is
not a multi-step flow.

## Behavioral fixes

- **#1 → branded UX.** Palette, glyphs, animated logo, spinner.
- **#2 → action-based reporting.** After apply, render the *action*:
  ```
  Atlas init

  Created  .ai/config.json
  Created  .ai/memory/
  Created  .ai/memory/README.md
  Updated  AGENTS.md (added managed block)
  Linked   .claude/skills → ../.ai/skills
  ...
  14 created · 0 conflicts
  ```
  Idempotent re-run: **"Already up to date — nothing to write."** (replaces the
  bare "No changes needed.").
- **#3 → single copy-paste prompt.** `initNextStepText` becomes a prominent,
  pasteable agent prompt as the headline next step, e.g.:
  > Finish the Atlas setup on this repository: use the `setup` skill to inspect
  > the repo, choose a template, and fill `AGENTS.md` and the `.ai/` memory files.

  Secondary, smaller lines: `Claude Code: /atlas:setup` and
  `Repair drift later: atlas doctor --fix`. The plugin path is no longer the lead.
- **#4 → confirmation gate.** Interactive mode confirms before any write.
  Non-interactive mode keeps auto-apply (still guarded by the dirty-worktree
  refusal), so the setup skill's `npx … init` keeps working unchanged — the
  "no confirmation" problem only existed for the human-in-a-terminal path.

## Template selection moves into the setup skill

- The CLI **never prompts** for a template. `--template <name>` remains as an
  advanced, non-interactive flag (default `standard`); the interactive flow does
  not ask.
- The **setup skill gains one step**: after inspecting the repo, recommend an
  appropriate template from `getTemplateNames()` and apply it by setting
  `.ai/config.json`'s `template` and merging that template's `pathAliases`
  (trivial — templates are alias-only). This is the single "needed" skill edit;
  the rest of `skills/setup/SKILL.md` is unchanged. The resulting config remains
  valid per `validateConfig` (no new doctor finding required).

## Theme · logo · animation

- **Palette** (from the design CSS): orange `#FF6A33` (lead, also `#FD6027`),
  mariner blue `#8A8EF1` (info/paths), sulu green `#BBED80` (success/cta), vibe
  yellow `#FFC800` (highlight), fg `#E6E8EB`, dim `#6B7178`, soft `#969CA5`,
  faint `#4E545C`. 24-bit ANSI; `NO_COLOR`-aware; readable when color is off.
- **Glyphs** (clack): active `◆`, done `◇`, radio `● / ○`, gutter `│`, start
  `┌`, end `└`, tree `├─ / └─`, spinner = braille frames.
- **Logo:** ANSI-Shadow `ATLAS` art baked as a constant (taken from the design's
  `flow.js`; no `figlet` runtime dependency), colored via `gradient-string`,
  revealed line-by-line then settled. Shown once on `init`; compact mark on
  `doctor`.
- **Dependencies added:** `@clack/prompts`, `gradient-string` (+ `chalk` only if
  we do not hand-roll the truecolor helper). Small, standard for this class of
  CLI. The package's prior "zero deps" posture is intentionally traded for
  fidelity and less code.

## Error handling

- Not a git repo → guard preserved; interactive shows a clean clack note, exit 2.
- Dirty worktree on mutating init → guard preserved; interactive surfaces a note
  and lets the user proceed via confirm (sets force) or abort; non-interactive
  refuses with the existing stderr message.
- Cancel (`Ctrl-C` / Esc) → clack `isCancel` → "Cancelled. Nothing written.",
  cursor restored, exit 130.
- Manual conflicts → shown in orange, stop before any write.
- Unexpected errors → restore cursor, print message, exit 1.

## Testing

- Pure stages (`plan` + action-description mapping, `config`, `doctor`,
  `managed-blocks`, `actions`) → unit tests; extend the existing `test/*.test.js`.
- Non-interactive `runCli` output → **update existing string snapshots to the
  corrected wording**. This is a legitimate change to a wrong-behavior assertion
  (fixing bug #2), not gaming a failing implementation; the diff will call out
  each changed expectation.
- Interactive flow → a scripted smoke plus a manual visual checklist; keep the
  interactive layer thin so logic lives in the tested pure layer.
- `pack:smoke` preserved.

## Open questions

None blocking. Stack-detection depth in step 3 is cosmetic and can start
minimal (package manager + framework from lockfiles/`package.json`).

## Rollout / branch

- Implementation branch: `feat/atlas-cli-redesign` off `feat/installable-atlas-core`.
- This spec is committed as a planning artifact; the implementation plan follows
  via the writing-plans step.
