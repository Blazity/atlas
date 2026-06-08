import assert from "node:assert/strict";
import test from "node:test";

test("interactive UI dependency imports cleanly", async () => {
  const clack = await import("@clack/prompts");
  assert.equal(typeof clack.intro, "function");
  assert.equal(typeof clack.outro, "function");
  assert.equal(typeof clack.confirm, "function");
  assert.equal(typeof clack.spinner, "function");
  assert.equal(typeof clack.isCancel, "function");
});
