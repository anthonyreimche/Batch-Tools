import test from "node:test";
import assert from "node:assert/strict";
import { REL_BY_KEY, nudge, runTargets, settleAuto, summary } from "../src/batch.js";

test("a temperature nudge moves the Kelvin value, within the White Balance slider's range", () => {
  const t = REL_BY_KEY.get("temperature");
  assert.equal(nudge(t, 5500, 5), 5505);
  assert.equal(nudge(t, 5500, 200), 5700);
  assert.equal(nudge(t, 2100, -500), 2000);
  assert.equal(nudge(t, 49900, 500), 50000);
});

test("a tint nudge reaches the slider's ±150", () => {
  const t = REL_BY_KEY.get("tint");
  assert.equal(nudge(t, 140, 20), 150);
  assert.equal(nudge(t, -120, -20), -140);
  assert.equal(nudge(t, -140, -20), -150);
});

test("a nudge on a missing temperature starts from neutral, not 0", () => {
  assert.equal(nudge(REL_BY_KEY.get("temperature"), undefined, 100), 6600);
  assert.equal(nudge(REL_BY_KEY.get("exposure"), undefined, 0.5), 0.5);
});

const names = { a: "A.CR3", b: "B.NEF", c: "C.ARW" };
const nameOf = (id) => names[id];

test("a failed photo is reported by filename with its reason", async () => {
  const res = await runTargets(["a", "b", "c"], async (id) => {
    if (id === "b") throw new Error("Couldn't render the photo to measure it.");
  }, { nameOf });
  assert.equal(res.done, 2);
  assert.equal(res.total, 3);
  assert.deepEqual(res.failures, [{ filename: "B.NEF", reason: "Couldn't render the photo to measure it." }]);
  assert.equal(res.cancelled, false);
});

test("a thrown non-error still gives a reason", async () => {
  const res = await runTargets(["a"], async () => { throw "disk full"; }, { nameOf });
  assert.deepEqual(res.failures, [{ filename: "A.CR3", reason: "disk full" }]);
});

test("cancelling stops before the next photo", async () => {
  const ctl = new AbortController();
  const seen = [];
  const res = await runTargets(["a", "b", "c"], async (id) => {
    seen.push(id);
    if (id === "a") ctl.abort();
  }, { nameOf, signal: ctl.signal });
  assert.deepEqual(seen, ["a"]);
  assert.equal(res.done, 1);
  assert.equal(res.cancelled, true);
});

test("the summary names the failures and says when a run was cancelled", () => {
  const failures = [{ filename: "B.NEF", reason: "No frame." }];
  assert.equal(summary({ done: 2, total: 3, failures, cancelled: false }), "Done: 2/3. 1 failed.");
  assert.equal(summary({ done: 1, total: 3, failures: [], cancelled: true }), "Cancelled after 1/3.");
  assert.equal(summary({ done: 3, total: 3, failures: [], cancelled: false, geoSkipped: 1 }), "Done: 3/3. Geometry skipped on 1 (size differs).");
});

const toneStep = (hist, p) => ({ exposure: p.exposure + hist.shift, done: hist.shift === 0 });

test("auto settles over successive measurements", async () => {
  const shifts = [0.5, 0.25, 0];
  const p = await settleAuto({ exposure: 0, tint: 3 }, { cap: 8, steps: [toneStep], measure: async () => ({ shift: shifts.shift() }) });
  assert.deepEqual(p, { exposure: 0.75, tint: 3 });
});

test("auto fails when the photo can't be rendered, so nothing is committed", async () => {
  await assert.rejects(
    settleAuto({ exposure: 0 }, { cap: 8, steps: [toneStep], measure: async () => null }),
    /Couldn't render the photo to measure it\./,
  );
});

test("auto fails when a later render fails mid-settle", async () => {
  const frames = [{ shift: 0.5 }, null];
  await assert.rejects(
    settleAuto({ exposure: 0 }, { cap: 8, steps: [toneStep], measure: async () => frames.shift() }),
    /Couldn't render/,
  );
});

test("auto feeds each step the params the previous step produced", async () => {
  const seen = [];
  const wbStep = (hist, p) => { seen.push(p.exposure); return { tint: 5, done: true }; };
  const p = await settleAuto({ exposure: 0, tint: 0 }, { cap: 1, steps: [toneStep, wbStep], measure: async () => ({ shift: 1 }) });
  assert.deepEqual(seen, [1]);
  assert.deepEqual(p, { exposure: 1, tint: 5 });
});
