"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmTone = "danger",
  pendingLabel,
  pending,
  error,
  focusFallbackId,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone?: "danger" | "primary";
  pendingLabel: string;
  pending: boolean;
  error: Error | null;
  focusFallbackId: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      const trigger = triggerRef.current;
      if (trigger?.isConnected && !trigger.matches(":disabled")) trigger.focus();
      else document.getElementById(focusFallbackId)?.focus();
    }
  }, [open, focusFallbackId]);

  return (
    <dialog
      ref={dialogRef}
      className="confirmation-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <div className="confirmation-dialog-content">
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {error ? <p className="notice notice-error" role="alert">{error.message}</p> : null}
        {pending ? <p role="status">{pendingLabel}</p> : null}
        <div className="confirmation-dialog-actions">
          <button className="button button-secondary" ref={cancelRef} type="button" disabled={pending} onClick={onCancel}>Cancelar</button>
          <button className={confirmTone === "danger" ? "button button-danger-ghost" : "button button-primary"} type="button" disabled={pending} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
