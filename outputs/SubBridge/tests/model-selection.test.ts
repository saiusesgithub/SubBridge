import test from "node:test";
import assert from "node:assert/strict";
import { chooseModel } from "../web/src/model-selection.js";

test("model selector preserves a still-advertised selection and picks a default otherwise", () => {
  const options = [{ id: "one", available: true }, { id: "two", available: true }];
  assert.equal(chooseModel(options, "two"), "two");
  assert.equal(chooseModel(options, "stale"), "one");
});

test("model selector preserves explicit IDs when discovery is empty or unavailable", () => {
  assert.equal(chooseModel([], "account-supported-codex-model"), "account-supported-codex-model");
  assert.equal(chooseModel([], ""), "");
});
