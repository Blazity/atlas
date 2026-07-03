import assert from "node:assert/strict";
import test from "node:test";

import { colorizeDoctorOutput, doctorMark, offerContextSizeHandoff } from "../src/ui/doctor.js";

test("color off passes doctor text through unchanged", () => {
  const text = "Atlas doctor\nNo issues found.\n";
  assert.equal(colorizeDoctorOutput(text, { color: false }), text);
});

test("color on paints the clean status green without altering the words", () => {
  const text = "Atlas doctor\nNo issues found.\n";
  const out = colorizeDoctorOutput(text, { color: true });
  assert.match(out, /No issues found\./);
  assert.match(out, /\x1b\[38;2;187;237;128m/);
});

test("color on paints the advisory section blue and keeps issue codes yellow", () => {
  const text = [
    "Atlas doctor",
    "Fixable:",
    "- [missing-gitkeep] .ai/plans/.gitkeep is missing",
    "",
    "Advisory:",
    "- [setup-pending] Atlas setup has not been completed",
    ""
  ].join("\n");
  const out = colorizeDoctorOutput(text, { color: true });
  const blue = "\x1b[38;2;138;142;241m";
  const yellow = "\x1b[38;2;255;200;0m";

  assert.ok(out.includes(`${blue}Advisory:`));
  assert.ok(out.includes(`${blue}- [setup-pending]`));
  assert.ok(out.includes(`${yellow}- [missing-gitkeep]`));
  assert.doesNotMatch(out, /\x1b\[38;2;255;200;0m- \[setup-pending\]/);
});

test("color on paints context-size bars by status", () => {
  const text = [
    "Atlas doctor",
    "Advisory:",
    "- [context-size] AI context size risk",
    "  - OK .ai/LANGUAGE.md [                    ]   1% - 156 chars",
    "  - WARN AGENTS.md [##########          ]  52% - 16,950 chars",
    "  - OVERFLOW prompt-loaded context [####################] 121% - 79,000 chars",
    ""
  ].join("\n");
  const out = colorizeDoctorOutput(text, { color: true });
  const green = "\x1b[38;2;187;237;128m";
  const yellow = "\x1b[38;2;255;200;0m";
  const orange = "\x1b[38;2;255;106;51m";

  assert.ok(out.includes(`${green}[                    ]   1%\x1b[0m`));
  assert.ok(out.includes(`${yellow}[##########          ]  52%\x1b[0m`));
  assert.ok(out.includes(`${orange}[####################] 121%\x1b[0m`));
});

test("doctorMark renders plain text when color is off", () => {
  assert.equal(doctorMark({ color: false }), "▲ ATLAS doctor");
});

test("offerContextSizeHandoff can print the prepared prompt", async () => {
  const notes = [];

  await offerContextSizeHandoff("handoff prompt", {
    io: {
      isCancel: () => false,
      detectAgents: () => [],
      select: async () => "print",
      note: (body, title) => notes.push({ body, title }),
      launchAgent: async () => ({ code: 0 })
    }
  });

  assert.deepEqual(notes, [{ body: "handoff prompt", title: "context-size handoff" }]);
});

test("offerContextSizeHandoff launches a selected agent with the prepared prompt", async () => {
  const launches = [];
  const codex = { name: "codex", bin: "codex", buildArgs: (prompt) => [prompt] };

  await offerContextSizeHandoff("handoff prompt", {
    io: {
      isCancel: () => false,
      detectAgents: () => [codex],
      select: async () => "codex",
      note: () => {},
      launchAgent: async (agent, prompt) => {
        launches.push({ agent, prompt });
        return { code: 0 };
      }
    }
  });

  assert.deepEqual(launches, [{ agent: codex, prompt: "handoff prompt" }]);
});
