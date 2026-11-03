// Pure batch logic for Batch Tools: the Speed Edit ranges and the per-photo run
// loop. Nothing here touches the app's api or React, so test/batch.test.mjs can
// import it straight into Node.

// Relative ("speed edit") adjustments, clamped to the app's slider ranges.
// Temperature is in Kelvin; `neutral` is the core's default for a photo that
// carries none.
export const REL_PARAMS = [
  { key: "exposure",    label: "Exposure (EV)", min: -5, max: 5, step: 0.5, def: 0.5 },
  { key: "contrast",    label: "Contrast",      min: -100, max: 100, step: 5, def: 5 },
  { key: "highlights",  label: "Highlights",    min: -100, max: 100, step: 5, def: 5 },
  { key: "shadows",     label: "Shadows",       min: -100, max: 100, step: 5, def: 5 },
  { key: "whites",      label: "Whites",        min: -100, max: 100, step: 5, def: 5 },
  { key: "blacks",      label: "Blacks",        min: -100, max: 100, step: 5, def: 5 },
  { key: "vibrance",    label: "Vibrance",      min: -100, max: 100, step: 5, def: 5 },
  { key: "saturation",  label: "Saturation",    min: -100, max: 100, step: 5, def: 5 },
  { key: "temperature", label: "Temperature (K)", min: 2000, max: 50000, step: 50, def: 100, neutral: 6500 },
  { key: "tint",        label: "Tint",          min: -150, max: 150, step: 5, def: 5 },
];
export const REL_BY_KEY = new Map(REL_PARAMS.map((p) => [p.key, p]));

/** `value` moved by `delta`, kept within the param's slider range. */
export function nudge(def, value, delta) {
  return Math.min(def.max, Math.max(def.min, (value ?? def.neutral ?? 0) + delta));
}

const reasonOf = (e) => (e instanceof Error ? e.message : String(e)) || "Unknown error";

/** Visit each photo in turn, stopping before the next one once `signal`
 *  aborts. A visit that throws is recorded by filename with its reason. */
export async function runTargets(ids, visit, { nameOf = (id) => id, signal, onProgress } = {}) {
  let visited = 0;
  const failures = [];
  for (const id of ids) {
    if (signal?.aborted) break;
    try {
      await visit(id);
    } catch (e) {
      failures.push({ filename: nameOf(id), reason: reasonOf(e) });
    }
    visited++;
    if (onProgress) onProgress(visited, ids.length);
    await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
  }
  return { done: visited - failures.length, total: ids.length, failures, cancelled: visited < ids.length };
}

/** Run the auto `steps` against fresh measurements until each reports done or
 *  `cap` passes run out. Throws when a measurement fails, so a photo is never
 *  committed from params it wasn't measured with. */
export async function settleAuto(start, { cap, steps, measure }) {
  let p = { ...start };
  let pending = steps;
  for (let i = 0; i < cap && pending.length; i++) {
    const hist = await measure(p);
    if (!hist) throw new Error("Couldn't render the photo to measure it.");
    const next = [];
    for (const step of pending) {
      const { done, ...patch } = step(hist, p);
      p = { ...p, ...patch };
      if (!done) next.push(step);
    }
    pending = next;
  }
  return p;
}

export function summary(res) {
  let msg = res.cancelled ? `Cancelled after ${res.done}/${res.total}.` : `Done: ${res.done}/${res.total}.`;
  if (res.geoSkipped) msg += ` Geometry skipped on ${res.geoSkipped} (size differs).`;
  if (res.failures.length) msg += ` ${res.failures.length} failed.`;
  return msg;
}
