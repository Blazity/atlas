import assert from "node:assert/strict";
import test from "node:test";

import { ATLAS_FIGLET, animateLogo, renderLogoLines } from "../src/ui/logo.js";

function collect() {
  const chunks = [];
  return { chunks, stream: { isTTY: false, write: (text) => chunks.push(text) } };
}

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

test("animateLogo prints the raw art with no escapes when color is off", async () => {
  const { chunks, stream } = collect();
  await animateLogo(stream, { color: false });
  const out = chunks.join("");
  assert.equal(out, ATLAS_FIGLET.map((line) => `${line}\n`).join(""));
  assert.ok(!out.includes("\x1b["));
});

test("animateLogo never emits cursor-control sequences off a TTY", async () => {
  const { chunks, stream } = collect();
  await animateLogo(stream, { color: true });
  const out = chunks.join("");
  assert.ok(out.includes("\x1b[38;2;")); // colored settled logo
  assert.ok(!out.includes("\x1b[2K")); // no line clears
  assert.ok(!/\x1b\[\d+A/.test(out)); // no cursor-up moves
});
