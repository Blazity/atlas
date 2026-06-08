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
