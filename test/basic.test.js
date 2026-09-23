import test from "node:test";
import assert from "node:assert/strict";

test("batch model normalization dummy test", () => {
  const model = "anthropic/claude-3-opus";
  assert.ok(model.startsWith("anthropic/"));
});
