import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { confirmApply, confirmAuto, confirmReset } from "../src/confirm.js";

const fakeUi = (answer) => {
  const calls = [];
  return { calls, confirmDialog: async (options) => { calls.push(options); return answer; } };
};

test("applying to many photos asks in the app's dialogue and reports the answer", async () => {
  const yes = fakeUi(true);
  assert.equal(await confirmApply(yes, 12), true);
  assert.equal(yes.calls.length, 1);
  assert.match(yes.calls[0].message, /12 photos/);
  assert.notEqual(yes.calls[0].variant, "danger");

  assert.equal(await confirmApply(fakeUi(false), 12), false);
});

test("reset is a danger dialogue that names the count, and cancel aborts it", async () => {
  const ui = fakeUi(false);
  assert.equal(await confirmReset(ui, 1), false);
  assert.equal(ui.calls[0].variant, "danger");
  assert.match(ui.calls[0].message, /1 photo\b/);

  const many = fakeUi(true);
  assert.equal(await confirmReset(many, 3), true);
  assert.match(many.calls[0].message, /3 photos/);
});

test("batch auto-correct asks before rendering many photos, and cancel aborts it", async () => {
  const ui = fakeUi(false);
  assert.equal(await confirmAuto(ui, 40), false);
  assert.match(ui.calls[0].message, /40 photos/);
  assert.equal(await confirmAuto(fakeUi(true), 40), true);
});

test("the panel never opens a native dialogue", () => {
  const src = readFileSync(new URL("../src/index.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /window\.(confirm|alert|prompt)\s*\(/);
  assert.doesNotMatch(src, /(?<![.\w])(confirm|alert|prompt)\s*\(/);
  assert.match(src, /confirmApply\(api\.ui,/);
  assert.match(src, /confirmReset\(api\.ui,/);
  assert.match(src, /confirmAuto\(api\.ui,/);
});
