# Atlas CLI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `@blazity-atlas/core` CLI an animated, brand-colored interactive experience and fix three behavioral bugs in `atlas init`, while keeping a deterministic, testable non-interactive path.

**Architecture:** Split the tangled `runInit` into pure stages — `buildPlan` (compute actions) → `apply` (mutate) → render. The deterministic `runCli(argv) → {exitCode, stdout, stderr}` stays the plain/CI/test path; a new `src/ui/` layer adds the animated `@clack/prompts` experience only on a real TTY. Template selection moves out of the CLI into the setup skill.

**Tech Stack:** Node ≥20 (ESM, `node:test`), `@clack/prompts` (prompts/gutter/spinner), `gradient-string` (logo sweep), hand-rolled 24-bit ANSI for brand colors.

**Spec:** `docs/superpowers/specs/2026-06-08-atlas-cli-redesign-design.md`

**Branch:** work continues on the current worktree branch (based on `feat/installable-atlas-core`). Every commit uses the `atlas` scope, conventional style, first line only, no body/co-author.

---

## Reference: existing shapes (do not re-derive)

- **Finding:** `{ code, message, fixable, action }` (from `src/doctor.js`).
- **Action types** (from `src/actions.js`):
  - `{ type: "mkdir", relativePath, absolutePath }`
  - `{ type: "write", relativePath, absolutePath, content }`
  - `{ type: "symlink", relativePath, absolutePath, target }`
  - `{ type: "move", from, to, fromAbsolutePath, toAbsolutePath }`
- **Helpers:** `collectDoctorFindings(cwd, { templateName })`, `loadConfig(cwd, { templateName })`, `applyFixes(findings)` (from `src/doctor.js`); `isGitRepo(cwd)`, `gitStatus(cwd)`, `fileExists(p)`, `pathExists(p)` (from `src/repo.js`).
- **Write-finding codes:** `missing-config`, `missing-language`, `missing-memory-readme`, `missing-setup-skill` (file absent → "Created"); `stale-setup-skill` (file present → "Updated"); `missing-managed-block` (AGENTS.md — present → "Updated (managed block)", absent → "Created").

## File structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/plan.js` (new) | `buildPlan(cwd, {templateName})` + `describeFinding(finding)` → action verbs/targets | 1 |
| `src/output.js` (modify) | keep `formatFindings`; add `formatApplied(actions, {dryRun})` | 2 |
| `src/templates.js` (modify) | redesign `initNextStepText()` → copy-paste prompt | 3 |
| `src/init.js` (modify) | `runInit` uses `buildPlan` + `apply` + new renderer; fixes #2/#4-plain | 4 |
| `test/doctor.test.js` (modify) | update init-output assertions | 4 |
| `src/ui/runtime.js` (new) | `detectMode(...)` → `{interactive, color}` | 5 |
| `package.json` (modify) | add `@clack/prompts`, `gradient-string` | 6 |
| `src/ui/theme.js` (new) | brand palette → 24-bit ANSI helpers, `NO_COLOR`-aware | 7 |
| `src/ui/logo.js` (new) | baked ATLAS art + gradient render/animate | 8 |
| `src/ui/flow.js` (new) | `runInteractiveInit(...)` clack flow (#1/#4); wire `main()` | 9 |
| `src/ui/doctor.js` (new) | interactive colorized doctor; wire `main()` | 10 |
| `skills/setup/SKILL.md` (modify) | add Template Selection step | 11 |
| `src/cli.js` (modify) | `--ci` flag, help note; final integration | 12 |

---

## Task 1: `buildPlan` + action descriptions (pure)

**Files:**
- Create: `src/plan.js`
- Create: `test/plan.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/plan.test.js
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildPlan } from "../src/plan.js";
import { createConfigForTemplate } from "../src/config.js";
import { createGitRepo } from "./helpers/git.js";

async function withTempRepo(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "atlas-plan-"));
  try {
    await createGitRepo(dir);
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("buildPlan describes fresh actions with create/link verbs", async () => {
  await withTempRepo(async (dir) => {
    const plan = await buildPlan(dir, { templateName: "standard" });

    assert.equal(plan.templateName, "standard");
    assert.equal(plan.conflicts.length, 0);
    assert.ok(plan.fixable.length > 0);

    const configAction = plan.actions.find((a) => a.target.startsWith(".ai/config.json"));
    assert.equal(configAction.verb, "Created");

    const linkAction = plan.actions.find((a) => a.target.startsWith(".claude/skills"));
    assert.equal(linkAction.verb, "Linked");
    assert.match(linkAction.target, /\.claude\/skills → /);
  });
});

test("buildPlan marks existing managed files as Updated", async () => {
  await withTempRepo(async (dir) => {
    await writeFile(path.join(dir, "AGENTS.md"), "# Project AI Instructions\n");
    const plan = await buildPlan(dir, { templateName: "standard" });

    const agents = plan.actions.find((a) => a.target.startsWith("AGENTS.md"));
    assert.equal(agents.verb, "Updated");
    assert.match(agents.target, /managed block/);
  });
});

test("buildPlan keeps the effective template of an existing config", async () => {
  await withTempRepo(async (dir) => {
    await mkdir(path.join(dir, ".ai"), { recursive: true });
    await writeFile(path.join(dir, ".ai/config.json"), JSON.stringify(createConfigForTemplate("app")));

    const plan = await buildPlan(dir, { templateName: "standard" });
    assert.equal(plan.templateName, "app");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/plan.test.js`
Expected: FAIL with `Cannot find module '../src/plan.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plan.js
import { collectDoctorFindings, loadConfig } from "./doctor.js";
import { pathExists } from "./repo.js";

export async function describeFinding(finding) {
  const action = finding.action;
  if (action.type === "mkdir") {
    return { verb: "Created", target: `${action.relativePath}/` };
  }
  if (action.type === "symlink") {
    return { verb: "Linked", target: `${action.relativePath} → ${action.target}` };
  }
  if (action.type === "move") {
    return { verb: "Moved", target: `${action.from} → ${action.to}` };
  }
  // write
  const existed = await pathExists(action.absolutePath);
  if (finding.code === "missing-managed-block") {
    return { verb: existed ? "Updated" : "Created", target: `${action.relativePath} (managed block)` };
  }
  return { verb: existed ? "Updated" : "Created", target: action.relativePath };
}

export async function buildPlan(cwd, { templateName = "standard" } = {}) {
  const requested = templateName ?? "standard";
  const loaded = await loadConfig(cwd, { templateName: requested });
  const effectiveTemplate = loaded.exists ? (loaded.config.template ?? "custom") : requested;

  const findings = await collectDoctorFindings(cwd, { templateName: requested });
  const conflicts = findings.filter((f) => !f.fixable);
  const fixable = findings.filter((f) => f.fixable);
  const actions = await Promise.all(fixable.map(describeFinding));

  return { templateName: effectiveTemplate, fixable, conflicts, actions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/plan.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plan.js test/plan.test.js
git commit -m "feat(atlas): add init plan builder with action descriptions"
```

---

## Task 2: Action-based plain renderer

**Files:**
- Modify: `src/output.js`
- Create: `test/output.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/output.test.js
import assert from "node:assert/strict";
import test from "node:test";

import { formatApplied } from "../src/output.js";

const actions = [
  { verb: "Created", target: ".ai/config.json" },
  { verb: "Updated", target: "AGENTS.md (managed block)" },
  { verb: "Linked", target: ".claude/skills → ../.ai/skills" }
];

test("formatApplied lists actions and a summary, never 'is missing'", () => {
  const out = formatApplied(actions);
  assert.match(out, /^Created\s+\.ai\/config\.json$/m);
  assert.match(out, /^Updated\s+AGENTS\.md \(managed block\)$/m);
  assert.match(out, /^Linked\s+\.claude\/skills → \.\.\/\.ai\/skills$/m);
  assert.match(out, /3 changes applied/);
  assert.doesNotMatch(out, /is missing/);
});

test("formatApplied reports idempotent runs clearly", () => {
  assert.match(formatApplied([]), /Already up to date — nothing to write\./);
});

test("formatApplied dry-run uses the 'Would' tense", () => {
  const out = formatApplied(actions, { dryRun: true });
  assert.match(out, /^Would create\s+\.ai\/config\.json$/m);
  assert.match(out, /3 changes planned/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/output.test.js`
Expected: FAIL with `formatApplied is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/output.js` (keep the existing `formatFindings` / `exitCodeForFindings`):

```javascript
const VERB_WIDTH = 8;
const DRY_VERB = { Created: "Would create", Updated: "Would update", Linked: "Would link", Moved: "Would move" };

export function formatApplied(actions, { dryRun = false } = {}) {
  if (actions.length === 0) {
    return "Already up to date — nothing to write.\n";
  }

  const lines = actions.map((action) => {
    const verb = dryRun ? DRY_VERB[action.verb] : action.verb;
    return `${verb.padEnd(VERB_WIDTH)} ${action.target}`;
  });

  const noun = actions.length === 1 ? "change" : "changes";
  const summary = `${actions.length} ${noun} ${dryRun ? "planned" : "applied"}`;
  return `${lines.join("\n")}\n\n${summary}\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/output.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/output.js test/output.test.js
git commit -m "feat(atlas): add action-based init output renderer"
```

---

## Task 3: Redesign the next-step copy-paste prompt

**Files:**
- Modify: `src/templates.js`
- Create: `test/next-step.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/next-step.test.js
import assert from "node:assert/strict";
import test from "node:test";

import { initNextStepText } from "../src/templates.js";

test("initNextStepText leads with a single pasteable agent prompt", () => {
  const text = initNextStepText();
  assert.match(text, /paste this to your coding agent/i);
  assert.match(text, /Finish the Atlas setup on this repository/);
  assert.match(text, /`setup` skill/);
  assert.match(text, /Claude Code: run \/atlas:setup/);
  assert.match(text, /atlas doctor --fix/);
  // the old overwhelming multi-audience wording is gone
  assert.doesNotMatch(text, /Claude users can install the `atlas` plugin/);
  assert.doesNotMatch(text, /If you start from the skill first/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/next-step.test.js`
Expected: FAIL (old `initNextStepText` still contains the removed phrases).

- [ ] **Step 3: Write minimal implementation**

Replace the `initNextStepText` function in `src/templates.js` with:

```javascript
export function initNextStepText() {
  return [
    "Next step — paste this to your coding agent:",
    "",
    "  Finish the Atlas setup on this repository: use the `setup` skill to",
    "  inspect the repo, confirm or refine the template, and fill AGENTS.md",
    "  and the .ai/ memory files.",
    "",
    "Claude Code: run /atlas:setup",
    "Repair drift later: atlas doctor --fix"
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/next-step.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/templates.js test/next-step.test.js
git commit -m "fix(atlas): lead init next step with a pasteable agent prompt"
```

---

## Task 4: Refactor `runInit` onto plan/apply + fix output

**Files:**
- Modify: `src/init.js`
- Modify: `test/doctor.test.js`

- [ ] **Step 1: Update the existing init-output assertions (the failing test)**

In `test/doctor.test.js`, in test `"init creates a clean harness and is idempotent"`:

Replace line 44:
```javascript
    assert.match(first.stdout, /^Applied changes:$/m);
```
with:
```javascript
    assert.match(first.stdout, /^Created\s+\.ai\/config\.json$/m);
    assert.match(first.stdout, /changes applied/);
    assert.match(second.stdout, /Already up to date/);
```

Replace line 47:
```javascript
    assert.match(first.stdout, /Claude users can install the `atlas` plugin/);
```
with:
```javascript
    assert.match(first.stdout, /Claude Code: run \/atlas:setup/);
```

(Leave lines 45, 46, 48 and the template tests at 78/92/93 unchanged — the new output keeps a `Template: <name>` line and the `/atlas:setup` reference.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/doctor.test.js`
Expected: FAIL — current `runInit` still prints `Applied changes:` and the old plugin line.

- [ ] **Step 3: Rewrite `runInit`**

Replace the body of `src/init.js` with:

```javascript
import { applyFixes } from "./doctor.js";
import { gitStatus, isGitRepo } from "./repo.js";
import { formatApplied, formatFindings } from "./output.js";
import { buildPlan } from "./plan.js";
import { initNextStepText } from "./templates.js";

export async function runInit(options) {
  const cwd = options.cwd;
  if (!(await isGitRepo(cwd))) {
    return { exitCode: 2, stdout: "", stderr: "Refusing to initialize: current directory is not a git repository.\n" };
  }

  const plan = await buildPlan(cwd, { templateName: options.templateName ?? "standard" });

  if (plan.conflicts.length > 0) {
    return { exitCode: 2, stdout: `Atlas init\n${formatFindings([...plan.conflicts, ...plan.fixable])}`, stderr: "" };
  }

  if (!options.dryRun && !options.force && plan.fixable.length > 0) {
    const status = await gitStatus(cwd);
    if (status) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: "Refusing to initialize with a dirty git worktree. Commit/stash changes or pass --force.\n"
      };
    }
  }

  if (!options.dryRun) {
    await applyFixes(plan.fixable);
  }

  const title = options.dryRun ? "Atlas init dry run" : "Atlas init";
  const body = formatApplied(plan.actions, { dryRun: Boolean(options.dryRun) });
  const meta = `Template: ${plan.templateName}\n`;
  const nextStep = options.dryRun ? "" : `\n${initNextStepText()}\n`;

  return { exitCode: 0, stdout: `${title}\n\n${body}${meta}${nextStep}`, stderr: "" };
}
```

- [ ] **Step 4: Run the full suite to verify it passes**

Run: `node --test`
Expected: PASS — all tests (incl. the updated `doctor.test.js`, the unchanged template/invalid-config tests, and `pack-smoke`'s `/Atlas init/`).

- [ ] **Step 5: Commit**

```bash
git add src/init.js test/doctor.test.js
git commit -m "fix(atlas): report init actions instead of diagnostic messages"
```

---

## Task 5: Mode detection helper (pure)

**Files:**
- Create: `src/ui/runtime.js`
- Create: `test/runtime.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/runtime.test.js
import assert from "node:assert/strict";
import test from "node:test";

import { detectMode } from "../src/ui/runtime.js";

test("interactive only on a real TTY without --yes/--ci/CI", () => {
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: {} }).interactive, true);
  assert.equal(detectMode({ stdoutIsTTY: false, stdinIsTTY: true, env: {} }).interactive, false);
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: {}, yes: true }).interactive, false);
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: {}, ci: true }).interactive, false);
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: { CI: "1" } }).interactive, false);
});

test("color follows TTY/FORCE_COLOR and is killed by NO_COLOR", () => {
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: {} }).color, true);
  assert.equal(detectMode({ stdoutIsTTY: false, stdinIsTTY: false, env: { FORCE_COLOR: "1" } }).color, true);
  assert.equal(detectMode({ stdoutIsTTY: true, stdinIsTTY: true, env: { NO_COLOR: "1" } }).color, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/runtime.test.js`
Expected: FAIL with `Cannot find module '../src/ui/runtime.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/ui/runtime.js
export function detectMode({ stdoutIsTTY, stdinIsTTY, env = {}, yes = false, ci = false } = {}) {
  const tty = Boolean(stdoutIsTTY && stdinIsTTY);
  const ciActive = ci || Boolean(env.CI);
  const interactive = tty && !yes && !ciActive;
  const color = env.NO_COLOR == null && (tty || env.FORCE_COLOR != null);
  return { interactive, color };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/runtime.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/runtime.js test/runtime.test.js
git commit -m "feat(atlas): add tty/color mode detection helper"
```

---

## Task 6: Add UI dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (generated)

- [ ] **Step 1: Install the dependencies**

Run:
```bash
npm install @clack/prompts@^0.7.0 gradient-string@^3.0.0
```
Expected: `package.json` gains a `dependencies` block; `package-lock.json` is created/updated.

- [ ] **Step 2: Write an import smoke test**

```javascript
// test/deps.test.js
import assert from "node:assert/strict";
import test from "node:test";

test("ui dependencies import cleanly", async () => {
  const clack = await import("@clack/prompts");
  const gradient = await import("gradient-string");
  assert.equal(typeof clack.intro, "function");
  assert.equal(typeof clack.confirm, "function");
  assert.equal(typeof clack.spinner, "function");
  assert.equal(typeof gradient.default, "function");
});
```

- [ ] **Step 3: Run to verify it passes**

Run: `node --test test/deps.test.js`
Expected: PASS.

- [ ] **Step 4: Verify the pack still excludes dev noise**

Run: `node --test test/pack-smoke.test.js`
Expected: PASS — `files` allowlist (`bin/`, `src/`, `skills/`, `README.md`, `LICENSE`) already excludes `node_modules`/`test`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json test/deps.test.js
git commit -m "build(atlas): add @clack/prompts and gradient-string deps"
```

---

## Task 7: Brand theme (24-bit ANSI, NO_COLOR-aware)

**Files:**
- Create: `src/ui/theme.js`
- Create: `test/theme.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/theme.test.js
import assert from "node:assert/strict";
import test from "node:test";

import { makeTheme, PALETTE } from "../src/ui/theme.js";

test("palette matches the Blazity brand hexes", () => {
  assert.equal(PALETTE.orange, "#FF6A33");
  assert.equal(PALETTE.blue, "#8A8EF1");
  assert.equal(PALETTE.green, "#BBED80");
  assert.equal(PALETTE.yellow, "#FFC800");
});

test("color off returns plain text", () => {
  const t = makeTheme({ color: false });
  assert.equal(t.orange("ATLAS"), "ATLAS");
});

test("color on wraps text in a 24-bit escape and resets", () => {
  const t = makeTheme({ color: true });
  const painted = t.green("ok");
  assert.match(painted, /\x1b\[38;2;187;237;128mok\x1b\[0m/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/theme.test.js`
Expected: FAIL with `Cannot find module '../src/ui/theme.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/ui/theme.js
export const PALETTE = {
  orange: "#FF6A33",
  blue: "#8A8EF1",
  green: "#BBED80",
  yellow: "#FFC800",
  fg: "#E6E8EB",
  soft: "#969CA5",
  dim: "#6B7178"
};

const RESET = "\x1b[0m";

function toRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function makeTheme({ color }) {
  const wrap = (hex) => {
    const [r, g, b] = toRgb(hex);
    return (text) => (color ? `\x1b[38;2;${r};${g};${b}m${text}${RESET}` : String(text));
  };
  return Object.fromEntries(Object.entries(PALETTE).map(([name, hex]) => [name, wrap(hex)]));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/theme.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/theme.js test/theme.test.js
git commit -m "feat(atlas): add brand color theme helpers"
```

---

## Task 8: Animated ATLAS logo

**Files:**
- Create: `src/ui/logo.js`
- Create: `test/logo.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/logo.test.js
import assert from "node:assert/strict";
import test from "node:test";

import { ATLAS_FIGLET, renderLogoLines } from "../src/ui/logo.js";

test("figlet art is the 6-row ANSI-Shadow ATLAS wordmark", () => {
  assert.equal(ATLAS_FIGLET.length, 6);
  assert.ok(ATLAS_FIGLET.every((row) => row.length > 0));
});

test("color off returns the raw art unchanged", () => {
  const lines = renderLogoLines({ color: false });
  assert.deepEqual(lines, ATLAS_FIGLET);
});

test("color on applies ANSI escapes to every row", () => {
  const lines = renderLogoLines({ color: true });
  assert.equal(lines.length, 6);
  assert.ok(lines.every((row) => row.includes("\x1b[")));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/logo.test.js`
Expected: FAIL with `Cannot find module '../src/ui/logo.js'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/ui/logo.js
import gradient from "gradient-string";

import { atlasSleep } from "./sleep.js";
import { PALETTE } from "./theme.js";

export const ATLAS_FIGLET = [
  " █████╗ ████████╗██╗      █████╗ ███████╗",
  "██╔══██╗╚══██╔══╝██║     ██╔══██╗██╔════╝",
  "███████║   ██║   ██║     ███████║███████╗",
  "██╔══██║   ██║   ██║     ██╔══██║╚════██║",
  "██║  ██║   ██║   ███████╗██║  ██║███████║",
  "╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝"
];

const sweep = gradient([PALETTE.orange, PALETTE.yellow]);

export function renderLogoLines({ color }) {
  if (!color) {
    return [...ATLAS_FIGLET];
  }
  return ATLAS_FIGLET.map((row) => sweep(row));
}

export async function animateLogo(stream, { color }) {
  const lines = renderLogoLines({ color });
  for (const line of lines) {
    stream.write(`${line}\n`);
    await atlasSleep(70);
  }
}
```

- [ ] **Step 4: Add the tiny sleep helper used above**

```javascript
// src/ui/sleep.js
export function atlasSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test test/logo.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/ui/logo.js src/ui/sleep.js test/logo.test.js
git commit -m "feat(atlas): add gradient ATLAS logo renderer"
```

---

## Task 9: Interactive `init` flow + wire `main()`

**Files:**
- Create: `src/ui/flow.js`
- Modify: `src/cli.js`
- Create: `test/flow.test.js`

- [ ] **Step 1: Write the failing test (pure tree helper + dispatch)**

```javascript
// test/flow.test.js
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { planTreeLines } from "../src/ui/flow.js";
import { buildPlan } from "../src/plan.js";
import { createGitRepo } from "./helpers/git.js";

test("planTreeLines renders one '<verb>  <target>' line per action", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "atlas-flow-"));
  try {
    await createGitRepo(dir);
    const plan = await buildPlan(dir, { templateName: "standard" });
    const lines = planTreeLines(plan, { color: false });

    assert.equal(lines.length, plan.actions.length);
    assert.ok(lines.some((line) => /^Created\s+\.ai\/config\.json$/.test(line)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/flow.test.js`
Expected: FAIL with `Cannot find module '../src/ui/flow.js'`.

- [ ] **Step 3: Implement the interactive flow**

```javascript
// src/ui/flow.js
import { cancel, confirm, intro, isCancel, log, note, outro, spinner } from "@clack/prompts";

import { applyFixes } from "../src/../doctor.js"; // see note below
import { gitStatus } from "../repo.js";
import { buildPlan } from "../plan.js";
import { initNextStepText } from "../templates.js";
import { animateLogo } from "./logo.js";
import { atlasSleep } from "./sleep.js";
import { makeTheme } from "./theme.js";

export function planTreeLines(plan, { color }) {
  const theme = makeTheme({ color });
  return plan.actions.map((action) => {
    const verb = action.verb.padEnd(8);
    const painted = color ? theme.green(verb) : verb;
    return `${painted} ${action.target}`;
  });
}

export async function runInteractiveInit({ cwd, templateName = "standard", color = true, force = false }) {
  await animateLogo(process.stdout, { color });
  const theme = makeTheme({ color });
  process.stdout.write(`${theme.dim("the agentic repo standard")}\n\n`);

  intro("atlas init");

  const scan = spinner();
  scan.start("scanning repository…");
  const plan = await buildPlan(cwd, { templateName });
  await atlasSleep(300);
  scan.stop("Repository scanned");

  if (plan.conflicts.length > 0) {
    for (const conflict of plan.conflicts) {
      log.error(`[${conflict.code}] ${conflict.message}`);
    }
    cancel("Manual conflicts must be resolved before Atlas can write. Nothing written.");
    return 2;
  }

  if (plan.actions.length === 0) {
    note("Already up to date — nothing to write.", "atlas");
    outro(initNextStepText());
    return 0;
  }

  if (!force) {
    const status = await gitStatus(cwd);
    if (status) {
      note("Your git worktree has uncommitted changes.", "dirty worktree");
      const proceed = await confirm({ message: "Write Atlas files anyway?", initialValue: false });
      if (isCancel(proceed) || !proceed) {
        cancel("Cancelled. Nothing written.");
        return 130;
      }
    }
  }

  note(planTreeLines(plan, { color }).join("\n"), `.ai/ workspace · template ${plan.templateName}`);

  const ok = await confirm({ message: `Write ${plan.actions.length} files to .ai/?`, initialValue: true });
  if (isCancel(ok) || !ok) {
    cancel("Cancelled. Nothing written.");
    return 130;
  }

  const write = spinner();
  write.start(`writing ${plan.actions.length} files…`);
  await applyFixes(plan.fixable);
  write.stop(`Workspace written to .ai/ · ${plan.actions.length} files`);

  const doctor = spinner();
  doctor.start("running doctor…");
  await atlasSleep(300);
  doctor.stop("doctor · 0 issues · workspace healthy");

  outro(initNextStepText());
  return 0;
}
```

**Note for the implementer:** fix the import paths to the real module locations — `src/ui/flow.js` imports siblings of `src/` via `../`. The correct imports are:
```javascript
import { applyFixes } from "../doctor.js";
import { gitStatus } from "../repo.js";
import { buildPlan } from "../plan.js";
import { initNextStepText } from "../templates.js";
```
(Replace the placeholder `applyFixes` import line accordingly.)

- [ ] **Step 4: Wire `main()` to dispatch to the interactive flow**

In `src/cli.js`, add imports at the top:
```javascript
import { detectMode } from "./ui/runtime.js";
import { runInteractiveInit } from "./ui/flow.js";
```

Replace the existing `main()` with:
```javascript
export async function main() {
  try {
    const argv = process.argv.slice(2);
    const parsed = parseArgs(argv);
    const mode = detectMode({
      stdoutIsTTY: process.stdout.isTTY,
      stdinIsTTY: process.stdin.isTTY,
      env: process.env,
      yes: parsed.flags?.has?.("yes") ?? false,
      ci: parsed.flags?.has?.("ci") ?? false
    });

    if (parsed.command === "init" && !parsed.help && !parsed.error && mode.interactive && !parsed.flags.has("dry-run")) {
      const templateName = parsed.flags.get("template");
      process.exitCode = await runInteractiveInit({
        cwd: process.cwd(),
        templateName: typeof templateName === "string" ? templateName : "standard",
        color: mode.color,
        force: parsed.flags.has("force")
      });
      return;
    }

    const result = await runCli(argv);
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 5: Run to verify the helper test passes and the suite stays green**

Run: `node --test`
Expected: PASS — `flow.test.js` passes; `runCli`-based tests are unaffected because they never go through `main()`/TTY.

- [ ] **Step 6: Manual visual check (documented, not automated)**

Run in a real terminal inside a throwaway git repo:
```bash
mkdir /tmp/atlas-demo && cd /tmp/atlas-demo && git init -q
node ./bin/atlas.js init
```
Expected: gradient ATLAS logo animates in; clack intro/spinner/confirm appear; choosing "Yes" writes `.ai/`; outro shows the copy-paste prompt. `Ctrl-C` at a prompt prints "Cancelled. Nothing written." Re-run with `NO_COLOR=1` to confirm plain readable output, and pipe (`| cat`) to confirm the non-interactive plain path still runs.

- [ ] **Step 7: Commit**

```bash
git add src/ui/flow.js src/cli.js test/flow.test.js
git commit -m "feat(atlas): add interactive init flow with confirm gate"
```

---

## Task 10: Interactive doctor (colorized, light touch)

**Files:**
- Create: `src/ui/doctor.js`
- Modify: `src/cli.js`
- Create: `test/ui-doctor.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/ui-doctor.test.js
import assert from "node:assert/strict";
import test from "node:test";

import { colorizeDoctorOutput } from "../src/ui/doctor.js";

test("color off passes doctor text through unchanged", () => {
  const text = "Atlas doctor\nNo issues found.\n";
  assert.equal(colorizeDoctorOutput(text, { color: false }), text);
});

test("color on paints the clean status green without altering structure", () => {
  const text = "Atlas doctor\nNo issues found.\n";
  const out = colorizeDoctorOutput(text, { color: true });
  assert.match(out, /No issues found\./);
  assert.match(out, /\x1b\[38;2;187;237;128m/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/ui-doctor.test.js`
Expected: FAIL with `Cannot find module '../src/ui/doctor.js'`.

- [ ] **Step 3: Implement the colorizer + interactive entry**

```javascript
// src/ui/doctor.js
import { runCli } from "../cli.js";
import { animateLogo } from "./logo.js";
import { makeTheme } from "./theme.js";

export function colorizeDoctorOutput(text, { color }) {
  if (!color) {
    return text;
  }
  const theme = makeTheme({ color });
  return text
    .replace(/No issues found\./g, (m) => theme.green(m))
    .replace(/^(Fixable:|Applied fixes:)$/gm, (m) => theme.green(m))
    .replace(/^(Manual:)$/gm, (m) => theme.orange(m))
    .replace(/^(- \[[^\]]+\])/gm, (m) => theme.yellow(m));
}

export async function runInteractiveDoctor({ argv, color }) {
  const theme = makeTheme({ color });
  process.stdout.write(`${color ? theme.orange("▲ ATLAS") : "▲ ATLAS"} ${theme.dim("doctor")}\n\n`);
  const result = await runCli(argv);
  if (result.stdout) {
    process.stdout.write(colorizeDoctorOutput(result.stdout, { color }));
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  return result.exitCode;
}
```

(`animateLogo` import is available for future use; the compact mark above keeps `doctor` fast. Remove the unused import if your linter flags it.)

- [ ] **Step 4: Wire `main()` for interactive doctor**

In `src/cli.js`, add `import { runInteractiveDoctor } from "./ui/doctor.js";` and, in `main()` right after the interactive `init` branch, add:
```javascript
    if (parsed.command === "doctor" && !parsed.help && !parsed.error && mode.interactive) {
      process.exitCode = await runInteractiveDoctor({ argv, color: mode.color });
      return;
    }
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test`
Expected: PASS — `ui-doctor.test.js` passes; `runCli` doctor output unchanged for tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/doctor.js src/cli.js test/ui-doctor.test.js
git commit -m "feat(atlas): colorize interactive doctor output"
```

---

## Task 11: Add template selection to the setup skill

**Files:**
- Modify: `skills/setup/SKILL.md`
- Create: `test/setup-skill.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// test/setup-skill.test.js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("setup skill instructs the agent to choose a template after inspection", async () => {
  const skill = await readFile(new URL("../skills/setup/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /## Template Selection/);
  assert.match(skill, /getTemplateNames|standard, app, library, monorepo, agency/);
  assert.match(skill, /\.ai\/config\.json/);
  assert.match(skill, /pathAliases/);
  // existing contract preserved
  assert.match(skill, /npx --yes @blazity-atlas\/core@latest init/);
  assert.match(skill, /customization\.md/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/setup-skill.test.js`
Expected: FAIL — no `## Template Selection` section yet.

- [ ] **Step 3: Add the section**

In `skills/setup/SKILL.md`, insert this section immediately after the `## Required Grounding` section and before `## Customization Gate`:

```markdown
## Template Selection

After grounding, choose the Atlas template that best fits the repository. The
available templates are `standard, app, library, monorepo, agency` (the CLI's
`getTemplateNames()`). They differ only in `pathAliases` — which conventional
`docs/*` folders map into the `.ai/` tree — so the choice is safe to refine.

- Infer the fit from the repo: a deployed product → `app`; a publishable
  package/SDK → `library`; workspaces → `monorepo`; multi-client delivery →
  `agency`; otherwise `standard`.
- Recommend the template to the user with a one-line rationale before applying.
- Apply it by setting `.ai/config.json`'s `template` field and merging that
  template's `pathAliases`. Do not invent new artifact roots.
- Re-run `npx --yes @blazity-atlas/core@latest doctor` afterward and continue
  only when it exits clean.
```

- [ ] **Step 4: Run to verify it passes and nothing regressed**

Run: `node --test`
Expected: PASS — `setup-skill.test.js` passes; `pack-smoke.test.js` and `doctor.test.js`'s skill-content assertions (`name: setup`, `Bootstrap / Update Harness`, the `npx` commands, `dirty worktree`, `manual conflicts`, `Refresh`, `customization.md`) still match.

- [ ] **Step 5: Commit**

```bash
git add skills/setup/SKILL.md test/setup-skill.test.js
git commit -m "feat(atlas): teach setup skill to choose the template"
```

---

## Task 12: Final integration — `--ci` flag, help note, full verification

**Files:**
- Modify: `src/cli.js`

- [ ] **Step 1: Write the failing test**

Add to `test/doctor.test.js`:
```javascript
test("init accepts the --ci flag and stays non-interactive", async () => {
  await withTempRepo(async (directory) => {
    const result = await runCli(["init", "--ci"], { cwd: directory });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^Created\s+\.ai\/config\.json$/m);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/doctor.test.js`
Expected: FAIL with `Unknown option: --ci` (exit 2).

- [ ] **Step 3: Allow `--ci` and clarify help**

In `src/cli.js`, in the `init` branch, change the allowed-flags list:
```javascript
    const validation = validateFlags(parsed.flags, ["dry-run", "force", "yes", "ci", "template"]);
```

And in `helpText()`, update the `init` usage line and add a note under Templates:
```javascript
  atlas init [--dry-run] [--force] [--yes] [--ci] [--template <name>]
```
```javascript
Templates:
  ${getTemplateNames().join(", ")}
  (usually chosen for you by the setup skill after it inspects the repo)
```

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: PASS — all suites green, including the new `--ci` test.

- [ ] **Step 5: Final manual verification matrix**

Run each and confirm:
```bash
# interactive (real terminal)
cd /tmp/atlas-demo2 && git init -q && node <repo>/bin/atlas.js init
# non-interactive plain (piped)
node <repo>/bin/atlas.js init | cat
# CI mode
node <repo>/bin/atlas.js init --ci
# color off
NO_COLOR=1 node <repo>/bin/atlas.js init --ci
# doctor (interactive + piped)
node <repo>/bin/atlas.js doctor ; node <repo>/bin/atlas.js doctor | cat
```
Expected: animated/branded interactively; clean action-based plain output otherwise; no `is missing` under applied changes anywhere; copy-paste prompt as the lead next step.

- [ ] **Step 6: Commit**

```bash
git add src/cli.js test/doctor.test.js
git commit -m "feat(atlas): accept --ci and note skill-driven template choice"
```

---

## Self-Review

**1. Spec coverage**
- Animated logo → Tasks 7, 8. Brand palette → Task 7. Clack flow + spinner → Task 9. ✅
- Bug #1 (plain text) → Tasks 7–9. ✅
- Bug #2 (Applied/missing contradiction) → Tasks 1, 2, 4 (action verbs, `formatApplied`). ✅
- Bug #3 (vague next step) → Task 3 (copy-paste prompt). ✅
- Bug #4 (no confirmation) → Task 9 (interactive confirm; non-interactive auto-apply preserved). ✅
- `plan → apply → render` refactor → Tasks 1, 2, 4. ✅
- TTY/color gating → Tasks 5, 9, 10. ✅
- Template selection moves to skill → Tasks 9 (no prompt), 11 (skill step). `--template` retained → Task 12. ✅
- Deterministic test path preserved → Task 4 (`runCli` unchanged contract), confirmed green each task. ✅
- Colorized doctor → Task 10. ✅
- Updated tests for #2 wording → Task 4. ✅

**2. Placeholder scan**
- Task 9 intentionally flags an import-path correction with the exact fix spelled out (not a hand-wave). All other steps contain complete code.

**3. Type/name consistency**
- `buildPlan` returns `{ templateName, fixable, conflicts, actions }`; consumed identically in Tasks 2, 4, 9. ✅
- Action shape `{ verb, target }` produced in Task 1, consumed in Tasks 2 (`formatApplied`) and 9 (`planTreeLines`). ✅
- `makeTheme({ color })` returns palette-named functions; used in Tasks 8, 9, 10. ✅
- `detectMode(...)` returns `{ interactive, color }`; used in Task 9/10 `main()`. ✅
- `initNextStepText()` (no args) used in Tasks 4 and 9. ✅
