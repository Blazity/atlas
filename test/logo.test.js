import assert from "node:assert/strict";
import test from "node:test";

import { ATLAS_FIGLET, renderLogoLines } from "../src/ui/logo.js";

test("figlet art is the 6-row ANSI-Shadow ATLAS wordmark", () => {
  assert.equal(ATLAS_FIGLET.length, 6);
  assert.ok(ATLAS_FIGLET.every((row) => row.length > 0));
});

test("color off returns the raw art unchanged", () => {
  assert.deepEqual(renderLogoLines({ color: false }), ATLAS_FIGLET);
});

test("color on applies a 24-bit gradient escape to every row", () => {
  const lines = renderLogoLines({ color: true });
  assert.equal(lines.length, 6);
  assert.ok(lines.every((row) => row.includes("\x1b[38;2;")));
  assert.ok(lines.every((row) => row.endsWith("\x1b[0m")));
});
