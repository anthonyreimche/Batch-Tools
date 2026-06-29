# Safelight Batch Tools

Batch editing panel for [Safelight](https://github.com/anthonyreimche/SafeLight). Adds a **Batch** panel (Library module, right rail; also available from the View menu in Develop) modelled on the copy/paste-clipboard workflow photographers know from Lightroom Classic and Capture One.

The panel is organised into three collapsible sections.

## Copy / Paste & Sync

The core workflow — an **adjustments clipboard**, like Lightroom's Copy/Paste and Capture One's clipboard arrows:

- **Copy** (`Ctrl+Shift+C`) — snapshots the active photo's develop settings into the clipboard. The clipboard survives switching photos, so you can copy from one image, browse, then paste onto many others. A `📋` chip shows what's on the clipboard.
- **Paste** (`Ctrl+Shift+V`) — applies the clipboard to **every selected photo** through the current scope + mode.
- **Sync** (`Ctrl+Shift+S`) — copies the **active** photo's *live* settings to the other selected photos (no clipboard needed). This is the classic Lightroom "Sync" path.

**Mode** (segmented toggle):

- **Merge** — applies only the checked **scope** groups, leaving everything else on the target untouched.
- **Replace** — copies the source's entire edit recipe (the scope list is ignored and dims out).

**Scope** — choose which parameter groups Paste and Sync write: basic tone, white balance, tone curve, HSL, color grading, detail, lens corrections, effects, and the geometry-dependent groups crop/transform, masks, and heal/clone (marked `⚠`). Use **All / None / Default** to set quickly. Each target gets its own undoable history entry.

## Auto

Batch versions of the per-photo **Auto Tone** and **Auto White Balance** found in the Develop Basic/White Balance panels — applied across the whole selection:

- **Auto Tone** — sets exposure, highlights, shadows, whites and blacks for a full, unclipped tonal range (contrast is left alone).
- **Auto WB** — gray-world white balance: sets temperature and tint.
- **Auto Tone + WB** — both in one pass.

Each photo is analysed by rendering it headlessly with `api.develop.renderPhotoFrame(photoId, params, paramBag)` — which renders that specific photo through the full pipeline (carrying its own extension-stage params), unlike `captureFrame`, which only renders the live Develop source — building a histogram, and running the same convergence loop the core Auto buttons use (re-render → re-measure, a few passes), then committing one undoable history entry. The same algorithm as the core `auto-adjust` is used, so batch results match the per-photo buttons. Large selections honour the "Confirm when applying to more than" threshold, since each photo is rendered several times.

## Speed Edit

Capture One-style batch nudge: pick a parameter (exposure, contrast, temperature, …), set an amount, and press **−** / **+** to add or subtract that amount on every selected photo, clamped to valid ranges. Existing edits are preserved, and the value is only applied when you press a button (not while you type).

## Reset

Resets all selected photos to original (undoable per photo).

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Copy settings | `Ctrl+Shift+C` |
| Paste settings | `Ctrl+Shift+V` |
| Sync settings | `Ctrl+Shift+S` |

All three are rebindable under **Preferences ▸ Shortcuts** and work in both Library and Develop.

## Settings (⚙ in the Extensions panel)

| Setting | Default | Effect |
|---|---|---|
| Default mode | merge | Starting mode (also switchable live in the panel) |
| Geometry safety | on | Skips crop/transform/masks/heal on targets whose pixel dimensions differ from the source |
| Confirm when applying to more than | 10 | Confirmation prompt threshold (0 = off) |
| History label | "Batch sync" | Label written into each photo's edit history |
| Remember scope selection | on | Persists the scope checkboxes across sessions |
| Show Speed Edit | on | Toggles the Speed Edit section |

## Install

Extensions panel → enter `owner/safelight-batch-tools` (or the repo URL).

## Build

```
npm install
npm run build   # src/index.jsx → dist/index.js (committed)
```

React is taken from `api.react` at activate time and is not bundled. UI uses inline styles on Safelight's CSS variables, so it follows every theme and doesn't depend on the app's compiled Tailwind classes.

## Notes

- The clipboard, scope and mode live in a small shared store (`api.stores.create`), so the panel buttons and the global keyboard shortcuts always agree.
- The engine drives the develop store (`loadEdit → commitEdit`) per photo, so persistence, undo history and cross-window broadcast behave exactly like manual edits. The original develop session is restored when a batch finishes (including after a Copy).
- Grid thumbnails refresh immediately after each photo's commit: core's `commitEdit` regenerates the edited thumbnail, and (since Safelight 2.5.0) carries that photo's own `paramBag`, so a batch edit/reset on photos other than the active one no longer renders their thumbnails with the active photo's extension-stage params.
