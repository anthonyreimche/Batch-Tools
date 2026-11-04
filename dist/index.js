// src/recipe.js
var deepClone = (v) => v === void 0 ? v : JSON.parse(JSON.stringify(v));
var GROUPS = [
  { key: "basic", label: "Basic tone", keys: ["exposure", "contrast", "highlights", "highlightDetail", "shadows", "shadowDetail", "whites", "blacks", "texture", "clarity", "dehaze", "vibrance", "saturation"] },
  { key: "wb", label: "White balance", keys: ["temperature", "tint"] },
  { key: "curve", label: "Tone curve", keys: ["toneCurve"] },
  { key: "hsl", label: "HSL", keys: ["hsl"] },
  { key: "grading", label: "Colour grading", keys: ["colorGrading"] },
  { key: "detail", label: "Detail", keys: ["sharpening", "sharpenRadius", "sharpenDetail", "sharpenMasking", "luminanceNR", "luminanceNRDetail", "luminanceNRContrast", "luminanceNRShadows", "luminanceNRHighlights", "colorNR", "colorNRDetail", "colorNRSmoothness"] },
  { key: "lens", label: "Lens corrections", keys: ["lensCorrection"] },
  { key: "effects", label: "Effects", keys: ["vignette", "grain"] },
  { key: "displayTransform", label: "Display transform", keys: ["displayTransform"] },
  { key: "geometry", label: "Crop & transform", keys: ["crop", "straighten", "transform", "uprightMode", "guidedLines"], geo: true },
  { key: "masks", label: "Masks", keys: ["masks"], geo: true },
  { key: "retouch", label: "Heal / clone", keys: ["retouch"], geo: true }
];
function mergeRecipe(cur, src, scopeSet, mode, sizeDiffers) {
  let merged;
  let geoSkipped = false;
  if (mode === "replace") {
    merged = deepClone(src);
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
      if (g.geo && sizeDiffers) {
        geoSkipped = true;
        continue;
      }
      for (const k of g.keys) merged[k] = deepClone(src[k]);
    }
  }
  return { merged, geoSkipped };
}
function transformKeys(pipelines, displayTransform) {
  if (!pipelines || typeof pipelines.paramKeys !== "function") return [];
  return pipelines.paramKeys(pipelines.effectiveId(displayTransform ?? null));
}
function transformBagPatch(srcBag, scopeSet, mode, keys) {
  if (!keys || keys.length === 0) return {};
  if (mode !== "replace" && !scopeSet.has("displayTransform")) return {};
  const out = {};
  for (const k of keys) out[k] = deepClone(srcBag?.[k]);
  return out;
}

// src/confirm.js
var photos = (n) => `${n} photo${n === 1 ? "" : "s"}`;
var confirmApply = (ui, count) => ui.confirmDialog({
  title: "Apply settings",
  message: `Apply settings to ${photos(count)}?`,
  confirmLabel: "Apply"
});
var confirmReset = (ui, count) => ui.confirmDialog({
  title: "Reset edits",
  message: `Reset edits on ${photos(count)}? Each photo returns to its original state. You can undo this from its edit history.`,
  confirmLabel: "Reset",
  variant: "danger"
});
var confirmAuto = (ui, count) => ui.confirmDialog({
  title: "Auto-correct photos",
  message: `Auto-correct ${photos(count)}? Each is rendered a few times, so this may take a moment.`,
  confirmLabel: "Auto-correct"
});

// src/batch.js
var REL_PARAMS = [
  { key: "exposure", label: "Exposure (EV)", min: -5, max: 5, step: 0.5, def: 0.5 },
  { key: "contrast", label: "Contrast", min: -100, max: 100, step: 5, def: 5 },
  { key: "highlights", label: "Highlights", min: -100, max: 100, step: 5, def: 5 },
  { key: "shadows", label: "Shadows", min: -100, max: 100, step: 5, def: 5 },
  { key: "whites", label: "Whites", min: -100, max: 100, step: 5, def: 5 },
  { key: "blacks", label: "Blacks", min: -100, max: 100, step: 5, def: 5 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100, step: 5, def: 5 },
  { key: "saturation", label: "Saturation", min: -100, max: 100, step: 5, def: 5 },
  { key: "temperature", label: "Temperature (K)", min: 2e3, max: 5e4, step: 50, def: 100, neutral: 6500 },
  { key: "tint", label: "Tint", min: -150, max: 150, step: 5, def: 5 }
];
var REL_BY_KEY = new Map(REL_PARAMS.map((p) => [p.key, p]));
function nudge(def, value, delta) {
  return Math.min(def.max, Math.max(def.min, (value ?? def.neutral ?? 0) + delta));
}
var reasonOf = (e) => (e instanceof Error ? e.message : String(e)) || "Unknown error";
async function runTargets(ids, visit, { nameOf = (id) => id, signal, onProgress } = {}) {
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
    await new Promise((r) => setTimeout(r, 0));
  }
  return { done: visited - failures.length, total: ids.length, failures, cancelled: visited < ids.length };
}
async function settleAuto(start, { cap, steps, measure }) {
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
function summary(res) {
  let msg = res.cancelled ? `Cancelled after ${res.done}/${res.total}.` : `Done: ${res.done}/${res.total}.`;
  if (res.geoSkipped) msg += ` Geometry skipped on ${res.geoSkipped} (size differs).`;
  if (res.failures.length) msg += ` ${res.failures.length} failed.`;
  return msg;
}

// src/index.jsx
var api = null;
var React = null;
var store = null;
function h(...args) {
  return React.createElement(...args);
}
var dev = () => api.stores.useDevelopStore;
var cat = () => api.stores.useCatalogStore;
var asShotOf = (id) => cat().getState().photos.find((p) => p.id === id)?.exif?.colorTemperature;
var loadEditFull = (id) => dev().getState().loadEdit(id, asShotOf(id));
var DEFAULT_GROUPS = GROUPS.filter((g) => !g.geo).map((g) => g.key);
function settings() {
  const g = (k, f) => api.settings.get(k, f);
  return {
    syncMode: g("syncMode", "merge"),
    geometrySafety: g("geometrySafety", true),
    confirmAbove: g("confirmAbove", 10),
    historyLabel: g("historyLabel", "Batch sync") || "Batch sync",
    rememberGroups: g("rememberGroups", true),
    showRelative: g("showRelative", true)
  };
}
async function forEachTarget(ids, restoreId, fn, { onProgress, signal }) {
  const d = dev();
  const nameOf = (id) => cat().getState().photos.find((p) => p.id === id)?.filename ?? id;
  try {
    return await runTargets(ids, async (id) => {
      await loadEditFull(id);
      await fn(id, d.getState().params);
    }, { nameOf, signal, onProgress });
  } finally {
    if (restoreId) await loadEditFull(restoreId);
  }
}
async function commitParams(params, label, bagPatch) {
  dev().setState({ params });
  if (bagPatch && Object.keys(bagPatch).length) dev().getState().setDynParams(bagPatch);
  await dev().getState().commitEdit(label);
}
async function applyRecipe({ src, srcBag, srcKeys, srcDims, srcId, label, scopeSet, mode }, run) {
  const s = settings();
  const c = cat().getState();
  const byId = new Map(c.photos.map((p) => [p.id, p]));
  const ids = [...c.selectedIds].filter((id) => id !== srcId && byId.has(id));
  if (!ids.length) return { error: srcId ? "Select at least one other photo." : "No photos selected." };
  if (mode === "merge" && !scopeSet.size) return { error: "No groups checked." };
  if (s.confirmAbove > 0 && ids.length > s.confirmAbove && !await confirmApply(api.ui, ids.length)) return null;
  let geoSkipped = 0;
  const restoreId = c.activePhotoId || dev().getState().photoId;
  const res = await forEachTarget(ids, restoreId, async (id, cur) => {
    const photo = byId.get(id);
    const sizeDiffers = s.geometrySafety && srcDims && photo && (photo.width !== srcDims.width || photo.height !== srcDims.height);
    const { merged, geoSkipped: gs } = mergeRecipe(cur, src, scopeSet, mode, sizeDiffers);
    if (gs) geoSkipped++;
    const bagPatch = transformBagPatch(srcBag, scopeSet, mode, srcKeys);
    await commitParams(merged, label, bagPatch);
  }, run);
  return { ...res, geoSkipped };
}
async function runSync(scopeSet, mode, run) {
  const c = cat().getState();
  const sourceId = c.activePhotoId;
  if (!sourceId) return { error: "No active photo to copy from." };
  if (dev().getState().photoId !== sourceId) await loadEditFull(sourceId);
  const src = deepClone(dev().getState().params);
  const srcBag = deepClone(dev().getState().paramBag);
  const srcKeys = transformKeys(api.pipelines, src.displayTransform);
  const srcPhoto = c.photos.find((p) => p.id === sourceId);
  return applyRecipe({ src, srcBag, srcKeys, srcDims: srcPhoto, srcId: sourceId, label: settings().historyLabel, scopeSet, mode }, run);
}
async function runPaste(clipboard, scopeSet, mode, run) {
  if (!clipboard) return { error: "Clipboard is empty \u2014 copy settings first." };
  const srcDims = clipboard.width && clipboard.height ? { width: clipboard.width, height: clipboard.height } : null;
  return applyRecipe({
    src: clipboard.params,
    srcBag: clipboard.paramBag,
    srcKeys: clipboard.transformKeys,
    srcDims,
    srcId: null,
    label: `${settings().historyLabel} (paste)`,
    scopeSet,
    mode
  }, run);
}
async function runRelative(paramKey, delta, run) {
  const c = cat().getState();
  const ids = [...c.selectedIds];
  if (!ids.length) return { error: "No photos selected." };
  if (!delta) return { error: "Amount is 0." };
  const def = REL_BY_KEY.get(paramKey);
  const label = `${def.label} ${delta > 0 ? "+" : ""}${delta}`;
  const restoreId = c.activePhotoId || dev().getState().photoId;
  return forEachTarget(ids, restoreId, async (id, cur) => {
    const v = nudge(def, cur[paramKey], delta);
    if (v === cur[paramKey]) return;
    await commitParams({ ...cur, [paramKey]: v }, label);
  }, run);
}
async function runReset(run) {
  const c = cat().getState();
  const ids = [...c.selectedIds];
  if (!ids.length) return { error: "No photos selected." };
  if (!await confirmReset(api.ui, ids.length)) return null;
  const restoreId = c.activePhotoId || dev().getState().photoId;
  return forEachTarget(ids, restoreId, async () => {
    await dev().getState().reset();
  }, run);
}
var AUTO_TEMP_MIN = 2e3;
var AUTO_TEMP_MAX = 5e4;
var AUTO_TINT_MIN = -150;
var AUTO_TINT_MAX = 150;
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
var round2 = (v) => Math.round(v * 100) / 100;
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function blackbodyLinear(kelvin) {
  const t = Math.min(5e4, Math.max(1e3, kelvin)) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const clamp01 = (v) => Math.min(1, Math.max(8e-4, v / 255));
  return [srgbToLinear(clamp01(r)), srgbToLinear(clamp01(g)), srgbToLinear(clamp01(b))];
}
function meanLinear(bins) {
  let sum = 0, count = 0;
  for (let i = 0; i < 256; i++) {
    const n = bins[i];
    if (!n) continue;
    sum += n * srgbToLinear(i / 255);
    count += n;
  }
  return count ? sum / count : 0;
}
function autoWhiteBalanceStep(hist, params, asShot = 6500) {
  const mR = meanLinear(hist.r), mG = meanLinear(hist.g), mB = meanLinear(hist.b);
  if (mR <= 0 || mG <= 0 || mB <= 0) return { temperature: params.temperature, tint: params.tint, done: true };
  const meanAll = (mR + mG + mB) / 3;
  const dev2 = Math.max(Math.abs(mR - mG), Math.abs(mG - mB), Math.abs(mR - mB)) / meanAll;
  if (dev2 < 0.01) return { temperature: params.temperature, tint: params.tint, done: true };
  const bbRef = blackbodyLinear(asShot);
  const gainsFor = (kelvin, tint2) => {
    const bb = blackbodyLinear(kelvin);
    let gr = bbRef[0] / bb[0];
    const gNorm = bbRef[1] / bb[1];
    let gb = bbRef[2] / bb[2];
    gr /= gNorm;
    gb /= gNorm;
    return [gr, 1 - tint2 / 150 * 0.6, gb];
  };
  const curG = gainsFor(params.temperature, params.tint);
  const sR = mR / curG[0], sG = mG / curG[1], sB = mB / curG[2];
  const targetLogRB = Math.log(sB / sR);
  let bestK = params.temperature, bestErr = Infinity;
  const steps = 240;
  for (let i = 0; i <= steps; i++) {
    const k = AUTO_TEMP_MIN * Math.pow(AUTO_TEMP_MAX / AUTO_TEMP_MIN, i / steps);
    const bb = blackbodyLinear(k);
    const err = Math.abs(Math.log(bbRef[0] / bb[0] / (bbRef[2] / bb[2])) - targetLogRB);
    if (err < bestErr) {
      bestErr = err;
      bestK = k;
    }
  }
  const solvedTemp = clamp(bestK, AUTO_TEMP_MIN, AUTO_TEMP_MAX);
  const ng = gainsFor(solvedTemp, 0);
  const wantGainG = sR * ng[0] / sG;
  const solvedTint = clamp((1 - wantGainG) * 250, AUTO_TINT_MIN, AUTO_TINT_MAX);
  const t = 0.85;
  const temperature = clamp(Math.exp(Math.log(params.temperature) * (1 - t) + Math.log(solvedTemp) * t), AUTO_TEMP_MIN, AUTO_TEMP_MAX);
  const tint = clamp(params.tint * (1 - t) + solvedTint * t, AUTO_TINT_MIN, AUTO_TINT_MAX);
  return { temperature: Math.round(temperature / 10) * 10, tint: Math.round(tint), done: false };
}
function percentile(luma, p, total) {
  const target = total * p;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += luma[i];
    if (acc >= target) return i;
  }
  return 255;
}
var EXPO_TARGET = 115;
var WHITE_TARGET = 250;
var BLACK_TARGET = 6;
var CLIP_TOL = 25e-4;
function autoToneStep(hist, params) {
  const luma = hist.luma;
  let total = 0;
  for (let i = 0; i < 256; i++) total += luma[i];
  if (!total) return { ...params, done: true };
  const median = Math.max(1, percentile(luma, 0.5, total));
  const pLo = percentile(luma, 25e-4, total);
  const pHi = percentile(luma, 0.9975, total);
  let clipHi = 0, clipLo = 0;
  for (let i = 253; i < 256; i++) clipHi += luma[i];
  for (let i = 0; i <= 2; i++) clipLo += luma[i];
  clipHi /= total;
  clipLo /= total;
  const expDelta = clamp(2.2 * Math.log2(EXPO_TARGET / median), -1.5, 1.5);
  const whiteDelta = clamp((WHITE_TARGET - pHi) * 0.5, -25, 25);
  const blackDelta = clamp((BLACK_TARGET - pLo) * 0.5, -25, 25);
  const hiDelta = clipHi > CLIP_TOL ? clamp(-(clipHi - CLIP_TOL) * 3e3, -25, 0) : 0;
  const loDelta = clipLo > CLIP_TOL ? clamp((clipLo - CLIP_TOL) * 3e3, 0, 25) : 0;
  const done = Math.abs(expDelta) < 0.04 && Math.abs(WHITE_TARGET - pHi) < 4 && Math.abs(BLACK_TARGET - pLo) < 4 && clipHi < CLIP_TOL * 1.5 && clipLo < CLIP_TOL * 1.5;
  return {
    exposure: round2(clamp(params.exposure + expDelta, -5, 5)),
    contrast: Math.round(params.contrast),
    highlights: Math.round(clamp(params.highlights + hiDelta, -100, 100)),
    shadows: Math.round(clamp(params.shadows + loDelta, -100, 100)),
    whites: Math.round(clamp(params.whites + whiteDelta, -100, 100)),
    blacks: Math.round(clamp(params.blacks + blackDelta, -100, 100)),
    done
  };
}
function histFromBitmap(bmp) {
  const W = bmp.width, H = bmp.height;
  if (!W || !H) return null;
  const scale = Math.min(1, 512 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale)), h2 = Math.max(1, Math.round(H * scale));
  const cv = new OffscreenCanvas(w, h2);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h2);
  const data = ctx.getImageData(0, 0, w, h2).data;
  const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), luma = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    r[R]++;
    g[G]++;
    b[B]++;
    let l = 0.2126 * R + 0.7152 * G + 0.0722 * B | 0;
    if (l > 255) l = 255;
    luma[l]++;
  }
  return { r, g, b, luma };
}
async function runAuto({ tone, wb }, run) {
  if (!api.develop || !api.develop.renderPhotoFrame) {
    return { error: "Batch Auto needs a newer Safelight (renderPhotoFrame API)." };
  }
  const s = settings();
  const c = cat().getState();
  const ids = [...c.selectedIds];
  if (!ids.length) return { error: "No photos selected." };
  if (s.confirmAbove > 0 && ids.length > s.confirmAbove && !await confirmAuto(api.ui, ids.length)) return null;
  const label = tone && wb ? "Auto Tone + WB" : tone ? "Auto Tone" : "Auto White Balance";
  const cap = tone && wb ? 10 : 8;
  const restoreId = c.activePhotoId || dev().getState().photoId;
  return forEachTarget(ids, restoreId, async (id, cur) => {
    const asShot = dev().getState().asShotTemperature ?? 6500;
    const bag = deepClone(dev().getState().paramBag) || {};
    const steps = [];
    if (tone) steps.push(autoToneStep);
    if (wb) steps.push((hist, p2) => autoWhiteBalanceStep(hist, p2, asShot));
    const p = await settleAuto(cur, {
      cap,
      steps,
      measure: async (trial) => {
        const bmp = await api.develop.renderPhotoFrame(id, trial, bag);
        if (!bmp) return null;
        const hist = histFromBitmap(bmp);
        if (typeof bmp.close === "function") bmp.close();
        return hist;
      }
    });
    if (Object.keys(p).some((k) => p[k] !== cur[k])) await commitParams(p, label);
  }, run);
}
function makeStore() {
  const s = settings();
  const savedGroups = s.rememberGroups ? api.settings.get("groups", null) : null;
  const initialScope = new Set(Array.isArray(savedGroups) ? savedGroups : DEFAULT_GROUPS);
  return api.stores.create((set, get) => ({
    clipboard: null,
    // { params, paramBag, transformKeys, sourceName, width, height }
    scope: initialScope,
    mode: s.syncMode === "replace" ? "replace" : "merge",
    busy: false,
    progress: null,
    status: "",
    failures: [],
    // { filename, reason } from the last run
    abort: null,
    // the running job's AbortController
    setScope(next) {
      set({ scope: next });
      if (settings().rememberGroups) api.settings.set("groups", [...next]);
    },
    toggleGroup(key) {
      const next = new Set(get().scope);
      next.has(key) ? next.delete(key) : next.add(key);
      get().setScope(next);
    },
    setMode(mode) {
      set({ mode });
      api.settings.set("syncMode", mode);
    },
    async copy() {
      const c = cat().getState();
      const sourceId = c.activePhotoId;
      if (!sourceId) {
        set({ status: "No active photo to copy from." });
        return;
      }
      const photo = c.photos.find((p) => p.id === sourceId);
      const d = dev();
      const prevId = d.getState().photoId;
      let params, paramBag;
      if (prevId !== sourceId) {
        await loadEditFull(sourceId);
        params = deepClone(d.getState().params);
        paramBag = deepClone(d.getState().paramBag);
        if (prevId) await loadEditFull(prevId);
      } else {
        params = deepClone(d.getState().params);
        paramBag = deepClone(d.getState().paramBag);
      }
      const name = photo ? photo.filename : "photo";
      set({
        clipboard: {
          params,
          paramBag,
          transformKeys: transformKeys(api.pipelines, params.displayTransform),
          sourceName: name,
          width: photo?.width,
          height: photo?.height
        },
        status: `Copied settings from ${name}.`
      });
    },
    async _run(job) {
      if (get().busy) return;
      const abort = new AbortController();
      set({ busy: true, status: "", failures: [], progress: null, abort });
      try {
        const res = await job({ onProgress: (done, total) => set({ progress: { done, total } }), signal: abort.signal });
        if (res == null) set({ status: "Cancelled." });
        else if (res.error) set({ status: res.error });
        else set({ status: summary(res), failures: res.failures });
      } catch (e) {
        set({ status: "Error: " + (e && e.message ? e.message : String(e)) });
      } finally {
        set({ busy: false, progress: null, abort: null });
      }
    },
    cancel() {
      get().abort?.abort();
    },
    paste() {
      return get()._run((r) => runPaste(get().clipboard, get().scope, get().mode, r));
    },
    sync() {
      return get()._run((r) => runSync(get().scope, get().mode, r));
    },
    relative(key, delta) {
      return get()._run((r) => runRelative(key, delta, r));
    },
    reset() {
      return get()._run(runReset);
    },
    autoTone() {
      return get()._run((r) => runAuto({ tone: true, wb: false }, r));
    },
    autoWB() {
      return get()._run((r) => runAuto({ tone: false, wb: true }, r));
    },
    autoBoth() {
      return get()._run((r) => runAuto({ tone: true, wb: true }, r));
    }
  }));
}
var S = {
  wrap: { padding: "10px", display: "flex", flexDirection: "column", gap: "10px", fontSize: "11px", color: "var(--color-text-primary)", userSelect: "none" },
  head: { display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", color: "var(--color-text-secondary)" },
  src: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  chip: { display: "inline-flex", alignItems: "center", gap: "4px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "2px 6px", borderRadius: "10px", background: "var(--color-surface-3)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" },
  secHead: { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "4px 0", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border)" },
  secBody: { display: "flex", flexDirection: "column", gap: "8px", paddingTop: "8px" },
  caret: { width: "9px", display: "inline-block", textAlign: "center", flex: "0 0 auto" },
  title: { fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-secondary)", display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px" },
  check: { display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden" },
  status: { color: "var(--color-text-secondary)", minHeight: "13px" },
  failures: { display: "flex", flexDirection: "column", gap: "2px", maxHeight: "96px", overflowY: "auto", color: "var(--color-text-secondary)" },
  failure: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
};
function Section({ id, title, openByDefault, open, onToggle, right, children }) {
  const isOpen = open[id] ?? openByDefault;
  return /* @__PURE__ */ h("div", null, /* @__PURE__ */ h("div", { style: S.secHead, onClick: () => onToggle(id, !isOpen) }, /* @__PURE__ */ h("span", { style: S.caret }, isOpen ? "\u25BE" : "\u25B8"), /* @__PURE__ */ h("span", { style: { flex: 1 } }, title), right), isOpen && /* @__PURE__ */ h("div", { style: S.secBody }, children));
}
function BatchPanel() {
  if (!api.ui) return h("div", { style: { padding: "10px", fontSize: "11px", color: "var(--color-text-muted)" } }, "Update Safelight to use this panel.");
  const ui = api.ui;
  const { useState, useEffect } = React;
  const selectedIds = cat()((s2) => s2.selectedIds);
  const photos2 = cat()((s2) => s2.photos);
  const activeId = cat()((s2) => s2.activePhotoId);
  const clipboard = store((s2) => s2.clipboard);
  const scope = store((s2) => s2.scope);
  const mode = store((s2) => s2.mode);
  const busy = store((s2) => s2.busy);
  const progress = store((s2) => s2.progress);
  const status = store((s2) => s2.status);
  const failures = store((s2) => s2.failures);
  const st = store.getState();
  const [, setTick] = useState(0);
  useEffect(() => api.settings.onChange(() => setTick((t) => t + 1)), []);
  const s = settings();
  const [open, setOpen] = useState({});
  const onToggle = (id, v) => setOpen((o) => ({ ...o, [id]: v }));
  const [relKey, setRelKey] = useState(REL_PARAMS[0].key);
  const relDef = REL_BY_KEY.get(relKey);
  const [relAmount, setRelAmount] = useState(relDef.def);
  const source = photos2.find((p) => p.id === activeId);
  const syncTargets = activeId ? [...selectedIds].filter((id) => id !== activeId).length : 0;
  const noGroups = mode === "merge" && scope.size === 0;
  const pct = progress && progress.total ? Math.round(100 * progress.done / progress.total) : 0;
  const speedEdit = (sign) => {
    const amt = Number(relAmount);
    if (!busy && selectedIds.size && amt) st.relative(relKey, sign * amt);
  };
  return /* @__PURE__ */ h("div", { style: S.wrap }, /* @__PURE__ */ h("div", { style: S.head }, /* @__PURE__ */ h("span", { style: S.src, title: source ? source.filename : "" }, "Source: ", source ? source.filename : "\u2014"), /* @__PURE__ */ h("span", { style: { flex: "0 0 auto" } }, selectedIds.size, " selected")), clipboard && /* @__PURE__ */ h("div", { style: S.chip, title: `Clipboard: ${clipboard.sourceName}` }, "\u{1F4CB} ", /* @__PURE__ */ h("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, clipboard.sourceName)), /* @__PURE__ */ h(Section, { id: "sync", title: "Copy / Paste & Sync", openByDefault: true, open, onToggle }, /* @__PURE__ */ h(ui.Row, { gap: 6 }, /* @__PURE__ */ h(ui.Button, { full: true, disabled: busy || !activeId, onClick: () => st.copy(), title: "Copy the active photo's settings (Ctrl+Shift+C)" }, "Copy"), /* @__PURE__ */ h(
    ui.Button,
    {
      full: true,
      variant: "primary",
      disabled: busy || !clipboard || !selectedIds.size,
      onClick: () => st.paste(),
      title: "Paste clipboard to selected photos (Ctrl+Shift+V)"
    },
    busy && progress ? `${progress.done}/${progress.total}\u2026` : "Paste"
  )), /* @__PURE__ */ h(
    ui.Button,
    {
      full: true,
      disabled: busy || !syncTargets || noGroups,
      onClick: () => st.sync(),
      title: "Copy the active photo to the other selected photos (Ctrl+Shift+S)"
    },
    busy && progress ? `Syncing ${progress.done}/${progress.total}\u2026` : `Sync to ${syncTargets} photo${syncTargets === 1 ? "" : "s"}`
  ), /* @__PURE__ */ h(
    ui.SegmentedControl,
    {
      value: mode,
      onChange: (m) => st.setMode(m),
      options: [
        { value: "merge", label: "Merge", title: "Apply only the checked groups" },
        { value: "replace", label: "Replace", title: "Copy the entire edit recipe" }
      ]
    }
  ), /* @__PURE__ */ h("div", { style: S.title }, /* @__PURE__ */ h("span", null, "Scope"), /* @__PURE__ */ h(ui.Row, { gap: 6 }, /* @__PURE__ */ h(ui.Button, { variant: "ghost", size: "sm", onClick: () => st.setScope(new Set(GROUPS.map((g) => g.key))) }, "All"), /* @__PURE__ */ h(ui.Button, { variant: "ghost", size: "sm", onClick: () => st.setScope(/* @__PURE__ */ new Set()) }, "None"), /* @__PURE__ */ h(ui.Button, { variant: "ghost", size: "sm", onClick: () => st.setScope(new Set(DEFAULT_GROUPS)) }, "Default"))), /* @__PURE__ */ h("div", { style: { ...S.grid, ...mode === "replace" ? { opacity: 0.45, pointerEvents: "none" } : null } }, GROUPS.map((g) => /* @__PURE__ */ h("label", { key: g.key, style: S.check, title: g.geo ? "Geometry-dependent \u2014 see Geometry safety in settings" : void 0 }, /* @__PURE__ */ h("input", { type: "checkbox", checked: scope.has(g.key), onChange: () => st.toggleGroup(g.key) }), /* @__PURE__ */ h("span", null, g.label, g.geo ? " \u26A0" : ""))))), s.showRelative && /* @__PURE__ */ h(Section, { id: "speed", title: "Speed Edit", open, onToggle }, /* @__PURE__ */ h(
    ui.Select,
    {
      value: relKey,
      onChange: (v) => {
        setRelKey(v);
        setRelAmount(REL_BY_KEY.get(v).def);
      },
      options: REL_PARAMS.map((p) => ({ value: p.key, label: p.label }))
    }
  ), /* @__PURE__ */ h(ui.Row, { gap: 6 }, /* @__PURE__ */ h(ui.Button, { disabled: busy || !selectedIds.size, onClick: () => speedEdit(-1), title: `Subtract from ${selectedIds.size} selected` }, "\u2212"), /* @__PURE__ */ h(
    ui.NumberInput,
    {
      value: relAmount,
      onChange: setRelAmount,
      step: relDef.step,
      width: "64px"
    }
  ), /* @__PURE__ */ h(ui.Button, { disabled: busy || !selectedIds.size, onClick: () => speedEdit(1), title: `Add to ${selectedIds.size} selected` }, "+"), /* @__PURE__ */ h("span", { style: { flex: 1, textAlign: "right", color: "var(--color-text-secondary)" } }, "\u2192 ", selectedIds.size, " photo", selectedIds.size === 1 ? "" : "s"))), /* @__PURE__ */ h(Section, { id: "auto", title: "Auto", open, onToggle }, /* @__PURE__ */ h(ui.Row, { gap: 6 }, /* @__PURE__ */ h(ui.Button, { full: true, disabled: busy || !selectedIds.size, onClick: () => st.autoTone(), title: "Auto-correct tone on every selected photo" }, "Auto Tone"), /* @__PURE__ */ h(ui.Button, { full: true, disabled: busy || !selectedIds.size, onClick: () => st.autoWB(), title: "Auto white balance on every selected photo" }, "Auto WB")), /* @__PURE__ */ h(
    ui.Button,
    {
      full: true,
      variant: "primary",
      disabled: busy || !selectedIds.size,
      onClick: () => st.autoBoth(),
      title: "Auto tone + white balance on every selected photo"
    },
    busy && progress ? `Auto ${progress.done}/${progress.total}\u2026` : `Auto Tone + WB \xB7 ${selectedIds.size} selected`
  )), /* @__PURE__ */ h(Section, { id: "reset", title: "Reset", open, onToggle }, /* @__PURE__ */ h(ui.Button, { full: true, disabled: busy || !selectedIds.size, onClick: () => st.reset() }, "Reset ", selectedIds.size, " selected")), busy && progress && /* @__PURE__ */ h(ui.Row, { gap: 6 }, /* @__PURE__ */ h("div", { style: { flex: 1 } }, /* @__PURE__ */ h(ui.ProgressBar, { value: pct / 100 })), /* @__PURE__ */ h(ui.Button, { variant: "ghost", size: "sm", onClick: () => st.cancel(), title: "Stop after the photo in progress" }, "Cancel")), /* @__PURE__ */ h("div", { style: S.status }, status), failures.length > 0 && /* @__PURE__ */ h("div", { style: S.failures }, failures.map((f, i) => /* @__PURE__ */ h("span", { key: i, style: S.failure, title: `${f.filename}: ${f.reason}` }, f.filename, ": ", f.reason))));
}
function activate(_api) {
  api = _api;
  React = api.react;
  store = makeStore();
  api.settings.onChange((key, value) => {
    if (key === "syncMode" && store.getState().mode !== value) {
      store.setState({ mode: value === "replace" ? "replace" : "merge" });
    }
  });
  api.registerPanel({
    id: "batch-tools.panel",
    title: "Batch",
    component: BatchPanel,
    defaultDock: { module: "library", direction: "right", order: 2, width: 280, height: 360 }
  });
  api.registerKeybinding({ id: "batch-tools.copy", label: "Batch: Copy settings", category: "Develop", defaultCombo: "Ctrl+Shift+C", handler: () => store.getState().copy() });
  api.registerKeybinding({ id: "batch-tools.paste", label: "Batch: Paste settings", category: "Develop", defaultCombo: "Ctrl+Shift+V", handler: () => store.getState().paste() });
  api.registerKeybinding({ id: "batch-tools.sync", label: "Batch: Sync settings", category: "Develop", defaultCombo: "Ctrl+Shift+S", handler: () => store.getState().sync() });
  api.registerSettings({
    title: "Batch Tools",
    fields: [
      {
        key: "syncMode",
        label: "Default mode",
        type: "select",
        default: "merge",
        hint: "Merge applies only the checked scope groups; replace copies the source's entire edit recipe. Also switchable live in the panel.",
        options: [
          { value: "merge", label: "Merge \u2014 only checked groups" },
          { value: "replace", label: "Replace \u2014 entire edit recipe" }
        ]
      },
      {
        key: "geometrySafety",
        label: "Geometry safety",
        type: "boolean",
        default: true,
        hint: "Skip crop, transform, masks and heal/clone on photos whose dimensions differ from the source."
      },
      {
        key: "confirmAbove",
        label: "Confirm when applying to more than",
        type: "number",
        default: 10,
        min: 0,
        max: 500,
        step: 1,
        hint: "0 disables the confirmation prompt."
      },
      {
        key: "historyLabel",
        label: "History label",
        type: "string",
        default: "Batch sync",
        placeholder: "Batch sync",
        hint: "Label written into each photo's edit history."
      },
      {
        key: "rememberGroups",
        label: "Remember scope selection",
        type: "boolean",
        default: true
      },
      {
        key: "showRelative",
        label: "Show Speed Edit",
        type: "boolean",
        default: true
      }
    ]
  });
}
function deactivate() {
  api = null;
  React = null;
  store = null;
}
export {
  activate,
  deactivate
};
