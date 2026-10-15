import test from "node:test";
import assert from "node:assert/strict";
import { GROUPS, mergeRecipe } from "../src/recipe.js";

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
