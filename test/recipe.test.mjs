import test from "node:test";
import assert from "node:assert/strict";
import { GROUPS, mergeRecipe, transformBagPatch, transformKeys } from "../src/recipe.js";

const ALL_GROUPS = new Set(GROUPS.map((g) => g.key));

// Just enough of a develop edit to tell two photos apart: a tone value, every
// geometry-group key, and the processing version (omitted when undefined, like
// an edit saved before versions existed).
function edit(processVersion, exposure, geometry) {
  const params = { exposure, ...geometry };
  if (processVersion !== undefined) params.processVersion = processVersion;
  return params;
}

const FLAT = {
  perspectiveV: 0,
  perspectiveH: 0,
  aspect: 0,
  scale: 0,
  offsetX: 0,
  offsetY: 0,
  flipH: false,
  flipV: false,
};

const UNCROPPED = {
  crop: { x: 0, y: 0, width: 1, height: 1 },
  straighten: 0,
  transform: FLAT,
  masks: [],
  retouch: [],
};
const CROPPED = {
  crop: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
  straighten: 2,
  transform: { ...FLAT, perspectiveV: 12 },
  masks: [{ id: "m1" }],
  retouch: [{ id: "r1" }],
};

test("replace keeps a version 1 target at version 1 when the source is version 2", () => {
  const { merged } = mergeRecipe(edit(1, 0, UNCROPPED), edit(2, 1.5, CROPPED), ALL_GROUPS, "replace", false);
  assert.equal(merged.exposure, 1.5);
  assert.equal(merged.processVersion, 1);
});

test("replace keeps a version 2 target at version 2 when the source is version 1", () => {
  const { merged } = mergeRecipe(edit(2, 0, UNCROPPED), edit(1, 1.5, CROPPED), ALL_GROUPS, "replace", false);
  assert.equal(merged.exposure, 1.5);
  assert.equal(merged.processVersion, 2);
});

test("replace never gives a target with no version the source's", () => {
  const { merged } = mergeRecipe(edit(undefined, 0, UNCROPPED), edit(2, 1.5, CROPPED), ALL_GROUPS, "replace", false);
  assert.equal(merged.exposure, 1.5);
  assert.equal(merged.processVersion, undefined);
});

test("merge keeps the target's version", () => {
  const { merged } = mergeRecipe(edit(1, 0, UNCROPPED), edit(2, 1.5, CROPPED), ALL_GROUPS, "merge", false);
  assert.equal(merged.exposure, 1.5);
  assert.equal(merged.processVersion, 1);
});

test("replace with a size mismatch still keeps the target's geometry", () => {
  const cur = edit(1, 0, UNCROPPED);
  const { merged, geoSkipped } = mergeRecipe(cur, edit(2, 1.5, CROPPED), ALL_GROUPS, "replace", true);
  assert.equal(geoSkipped, true);
  assert.equal(merged.exposure, 1.5);
  for (const key of Object.keys(UNCROPPED)) assert.deepEqual(merged[key], cur[key], key);
});

test("the Display transform group carries the transform's settings from the source bag", () => {
  const bag = { "t.x.gain": 2, "t.x.lift": 0.1, "other.stage.k": 5 };
  assert.deepEqual(transformBagPatch(bag, new Set(["displayTransform"]), "merge", ["t.x.gain", "t.x.lift"]), {
    "t.x.gain": 2,
    "t.x.lift": 0.1,
  });
});

test("it carries nothing when the group isn't in scope, unless replacing", () => {
  const bag = { "t.x.gain": 2 };
  assert.deepEqual(transformBagPatch(bag, new Set(["basic"]), "merge", ["t.x.gain"]), {});
  assert.deepEqual(transformBagPatch(bag, new Set(), "replace", ["t.x.gain"]), { "t.x.gain": 2 });
});

test("it carries nothing on a core that lists no keys", () => {
  assert.deepEqual(transformBagPatch({ "t.x.gain": 2 }, new Set(["displayTransform"]), "merge", []), {});
});

test("it carries every listed key, as copies, and undefined for one the source bag lacks", () => {
  const bag = { "t.x.gain": { nested: [1, 2] } };
  const patch = transformBagPatch(bag, new Set(["displayTransform"]), "merge", ["t.x.gain", "t.x.lift"]);
  assert.deepEqual(Object.keys(patch), ["t.x.gain", "t.x.lift"]);
  assert.equal(patch["t.x.lift"], undefined);
  patch["t.x.gain"].nested.push(3);
  assert.deepEqual(bag["t.x.gain"].nested, [1, 2]);
});

test("a source with no bag carries every listed key as undefined", () => {
  assert.deepEqual(transformBagPatch(undefined, new Set(["displayTransform"]), "merge", ["t.x.gain"]), { "t.x.gain": undefined });
});

const PIPELINES = {
  effectiveId: (pick) => pick ?? "default.tm",
  paramKeys: (id) => ({ "default.tm": ["default.tm.gain"], "t.x": ["t.x.gain", "t.x.lift"] })[id] ?? [],
};

test("a source with a pick lists that transform's keys", () => {
  assert.deepEqual(transformKeys(PIPELINES, "t.x"), ["t.x.gain", "t.x.lift"]);
});

test("a source with no pick lists the keys of the transform it renders with", () => {
  assert.deepEqual(transformKeys(PIPELINES, null), ["default.tm.gain"]);
  assert.deepEqual(transformKeys(PIPELINES, undefined), ["default.tm.gain"]);
});

test("an older core without paramKeys lists none", () => {
  assert.deepEqual(transformKeys({ effectiveId: (pick) => pick ?? "default.tm" }, "t.x"), []);
  assert.deepEqual(transformKeys(undefined, "t.x"), []);
});

test("a target with a different pick gets the source's pick and its settings, and keeps its other bag entries", () => {
  const src = { ...edit(2, 1.5, UNCROPPED), displayTransform: "t.x" };
  const cur = { ...edit(2, 0, UNCROPPED), displayTransform: "other.tm" };
  const srcBag = { "t.x.gain": 2, "t.x.lift": 0.1, "stage.k": 5 };
  const targetBag = { "other.tm.gain": 3, "stage.k": 9 };
  const scope = new Set(["displayTransform"]);

  const { merged } = mergeRecipe(cur, src, scope, "merge", false);
  const patch = transformBagPatch(srcBag, scope, "merge", transformKeys(PIPELINES, src.displayTransform));

  assert.equal(merged.displayTransform, "t.x");
  assert.deepEqual({ ...targetBag, ...patch }, { "other.tm.gain": 3, "stage.k": 9, "t.x.gain": 2, "t.x.lift": 0.1 });
});

// The core reads an undefined bag value as the param's default, binds the
// default, and drops the key when the edit is saved.
test("an untouched source sets a tuned target's settings back to their defaults, merging or replacing", () => {
  const targetBag = { "t.x.gain": 3, "t.x.lift": 0.2, "stage.k": 9 };
  const keys = transformKeys(PIPELINES, "t.x");
  for (const [mode, scope] of [["merge", new Set(["displayTransform"])], ["replace", new Set()]]) {
    const patch = transformBagPatch({ "stage.k": 5 }, scope, mode, keys);
    assert.deepEqual(patch, { "t.x.gain": undefined, "t.x.lift": undefined }, mode);
    assert.deepEqual({ ...targetBag, ...patch }, { "t.x.gain": undefined, "t.x.lift": undefined, "stage.k": 9 }, mode);
  }
});

test("a merge with the group out of scope leaves the target's pick and bag alone", () => {
  const src = { ...edit(2, 1.5, UNCROPPED), displayTransform: "t.x" };
  const cur = { ...edit(2, 0, UNCROPPED), displayTransform: "other.tm" };
  const srcBag = { "t.x.gain": 2 };
  const targetBag = { "other.tm.gain": 3 };
  const scope = new Set(["basic"]);

  const { merged } = mergeRecipe(cur, src, scope, "merge", false);
  const patch = transformBagPatch(srcBag, scope, "merge", transformKeys(PIPELINES, src.displayTransform));

  assert.equal(merged.displayTransform, "other.tm");
  assert.deepEqual({ ...targetBag, ...patch }, targetBag);
});
