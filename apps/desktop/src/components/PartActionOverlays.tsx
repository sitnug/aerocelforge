import { AlertTriangle, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ComponentDeletionPlan } from "../lib/componentOperations";

export interface PartContextMenuState {
  readonly id: string;
  readonly name: string;
  readonly clientX: number;
  readonly clientY: number;
}

export function PartContextMenu({
  menu,
  onClose,
  onEdit,
  onDelete
}: {
  readonly menu: PartContextMenuState | null;
  readonly onClose: () => void;
  readonly onEdit: (id: string) => void;
  readonly onDelete: (id: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu === null) return;
    const close = (): void => onClose();
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", closeOnEscape);
    menuRef.current?.focus();
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu, onClose]);

  if (menu === null) return null;
  const left = Math.min(menu.clientX, window.innerWidth - 210);
  const top = Math.min(menu.clientY, window.innerHeight - 150);
  return (
    <div
      ref={menuRef}
      className="part-context-menu"
      role="menu"
      aria-label={`Actions for ${menu.name}`}
      tabIndex={-1}
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <header>
        <small>SELECTED PART</small>
        <strong>{menu.name}</strong>
      </header>
      <button type="button" role="menuitem" onClick={() => onEdit(menu.id)}>
        <Pencil size={15} />
        <span>
          <strong>Edit part</strong>
          <small>Name, kind, position and size</small>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="part-context-menu__delete"
        onClick={() => onDelete(menu.id)}
      >
        <Trash2 size={15} />
        <span>
          <strong>Delete part</strong>
          <small>Shows a safety check first</small>
        </span>
      </button>
    </div>
  );
}

export function DeletePartDialog({
  open,
  plan,
  blocker,
  onClose,
  onConfirm
}: {
  readonly open: boolean;
  readonly plan: ComponentDeletionPlan | null;
  readonly blocker: string | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, open]);

  if (!open) return null;
  const attachedCount = Math.max(0, (plan?.componentIds.length ?? 1) - 1);
  return (
    <div className="modal-backdrop delete-part-backdrop" role="presentation">
      <section
        className="delete-part-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-part-title"
        aria-describedby="delete-part-description"
      >
        <header>
          <span className="delete-part-dialog__icon">
            <AlertTriangle size={20} />
          </span>
          <span>
            <small>DELETE PART</small>
            <h2 id="delete-part-title">
              {plan === null ? "This part cannot be deleted" : `Delete ${plan.rootName}?`}
            </h2>
          </span>
          <button
            type="button"
            className="icon-button icon-button--quiet"
            aria-label="Close delete check"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>
        <div className="delete-part-dialog__body" id="delete-part-description">
          {blocker !== null ? (
            <p>{blocker}</p>
          ) : (
            <>
              <p>This cannot be undone after the project autosaves.</p>
              {attachedCount > 0 && (
                <div className="delete-part-impact">
                  <strong>
                    {attachedCount} attached {attachedCount === 1 ? "part" : "parts"} will also be
                    deleted
                  </strong>
                  <span>{plan?.componentNames.slice(1).join(", ")}</span>
                </div>
              )}
              {((plan?.jointIds.length ?? 0) > 0 || (plan?.propulsionUnitIds.length ?? 0) > 0) && (
                <p className="delete-part-links">
                  Linked movement and motor setup will be cleaned up automatically so the project
                  stays valid.
                </p>
              )}
            </>
          )}
        </div>
        <footer>
          <button ref={cancelRef} type="button" className="button button--quiet" onClick={onClose}>
            Keep part
          </button>
          {plan !== null && (
            <button type="button" className="button button--danger" onClick={onConfirm}>
              <Trash2 size={15} /> Delete part
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
