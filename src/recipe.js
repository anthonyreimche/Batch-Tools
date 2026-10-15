// Pure recipe logic for Batch Tools: the param groups and the merge that builds
// a target's new params from a source. Nothing here touches the app's api or
// React, so test/recipe.test.mjs can import it straight into Node.

export const deepClone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// ── Param groups ─────────────────────────────────────────────────────────────
// `geo` groups depend on pixel geometry; with Geometry safety on they are
// skipped for targets whose dimensions differ from the source.
export const GROUPS = [
  { key: "basic",    label: "Basic tone",      keys: ["exposure", "contrast", "highlights", "shadows", "whites", "blacks", "texture", "clarity", "dehaze", "vibrance", "saturation"] },
  { key: "wb",       label: "White balance",   keys: ["temperature", "tint"] },
  { key: "curve",    label: "Tone curve",      keys: ["toneCurve"] },
  { key: "hsl",      label: "HSL",             keys: ["hsl"] },
  { key: "grading",  label: "Color grading",   keys: ["colorGrading"] },
  { key: "detail",   label: "Detail",          keys: ["sharpening", "sharpenRadius", "sharpenDetail", "sharpenMasking", "luminanceNR", "luminanceNRDetail", "luminanceNRContrast", "colorNR", "colorNRDetail", "colorNRSmoothness"] },
  { key: "lens",     label: "Lens corrections", keys: ["lensCorrection"] },
  { key: "effects",  label: "Effects",         keys: ["vignette", "grain"] },
  { key: "displayTransform", label: "Display transform", keys: ["displayTransform"] },
  { key: "geometry", label: "Crop & transform", keys: ["crop", "straighten", "transform"], geo: true },
  { key: "masks",    label: "Masks",           keys: ["masks"], geo: true },
  { key: "retouch",  label: "Heal / clone",    keys: ["retouch"], geo: true },
];

/** Build a target's new params from a source recipe, honouring scope + mode. */
export function mergeRecipe(cur, src, scopeSet, mode, sizeDiffers) {
  let merged;
  let geoSkipped = false;
  if (mode === "replace") {
    merged = deepClone(src);
    // Core's own paste never changes a photo's processing version; copying the
    // source's here would silently change an older target's look.
    merged.processVersion = cur.processVersion;
    if (sizeDiffers) {
      for (const g of GROUPS) {
        if (g.geo) for (const k of g.keys) merged[k] = deepClone(cur[k]);
      }
      geoSkipped = true;
    }
  } else {
    merged = { ...cur };
    for (const g of GROUPS) {
      if (!scopeSet.has(g.key)) continue;
      if (g.geo && sizeDiffers) { geoSkipped = true; continue; }
      for (const k of g.keys) merged[k] = deepClone(src[k]);
    }
  }
  return { merged, geoSkipped };
}
