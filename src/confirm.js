// The confirmations Batch Tools asks for, worded in one place. They go through
// the app's own dialogue (`api.ui.confirmDialog`): a native window.confirm can
// leave Electron unaware the window has focus again and freeze all input.

const photos = (n) => `${n} photo${n === 1 ? "" : "s"}`;

export const confirmApply = (ui, count) => ui.confirmDialog({
  title: "Apply settings",
  message: `Apply settings to ${photos(count)}?`,
  confirmLabel: "Apply",
});

export const confirmReset = (ui, count) => ui.confirmDialog({
  title: "Reset edits",
  message: `Reset edits on ${photos(count)}? Each photo returns to its original state. You can undo this from its edit history.`,
  confirmLabel: "Reset",
  variant: "danger",
});

export const confirmAuto = (ui, count) => ui.confirmDialog({
  title: "Auto-correct photos",
  message: `Auto-correct ${photos(count)}? Each is rendered a few times, so this may take a moment.`,
  confirmLabel: "Auto-correct",
});
