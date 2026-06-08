import assert from "node:assert/strict";
import test from "node:test";

import { makeTheme, PALETTE, gradientLine, shimmerLine } from "../src/ui/theme.js";

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

test("gradientLine leaves text untouched when color is off", () => {
  assert.equal(gradientLine("ATLAS", "#FF6A33", "#FFC800", { color: false }), "ATLAS");
});

test("gradientLine emits truecolor escapes when color is on", () => {
  const out = gradientLine("AT", "#FF6A33", "#FFC800", { color: true });
  assert.match(out, /\x1b\[38;2;255;106;51mA/); // first char = start color
  assert.ok(out.endsWith("\x1b[0m"));
});

test("shimmerLine returns plain text when color is off", () => {
  assert.equal(shimmerLine("ATLAS", 0.5, { color: false }), "ATLAS");
});

test("shimmerLine emits truecolor escapes and shifts with phase", () => {
  const atStart = shimmerLine("ATLAS", 0, { color: true });
  const midSweep = shimmerLine("ATLAS", 0.5, { color: true });
  assert.match(atStart, /\x1b\[38;2;\d+;\d+;\d+m/);
  assert.ok(atStart.endsWith("\x1b[0m"));
  assert.notEqual(atStart, midSweep); // advancing the phase moves the highlight
});
