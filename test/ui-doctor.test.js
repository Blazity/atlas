import assert from "node:assert/strict";
import test from "node:test";

import { colorizeDoctorOutput, doctorMark } from "../src/ui/doctor.js";

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

test("doctorMark renders plain text when color is off", () => {
  assert.equal(doctorMark({ color: false }), "▲ ATLAS doctor");
});
