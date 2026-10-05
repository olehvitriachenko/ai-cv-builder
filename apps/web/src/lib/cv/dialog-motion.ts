const closing = new WeakSet<HTMLDialogElement>();

/** Finish a short visual exit before native close restores focus and React unmounts the dialog. */
export function closeEditorDialog(dialog: HTMLDialogElement | null, afterClose?: () => void): void {
  if (!dialog || !dialog.open || closing.has(dialog)) return;
  const animated = dialog.matches(".cv-editor-motion") || dialog.closest(".cv-editor-motion") !== null;
  if (!animated || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof dialog.animate !== "function") {
    dialog.close();
    afterClose?.();
    return;
  }
  closing.add(dialog);
  dialog.inert = true;
  dialog.dataset.closing = "true";
  const finish = () => {
    closing.delete(dialog);
    dialog.inert = false;
    delete dialog.dataset.closing;
    if (!dialog.isConnected) return;
    dialog.close();
    afterClose?.();
  };
  const animation = dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: "ease-out", fill: "forwards" });
  void animation.finished.then(finish, finish);
}
