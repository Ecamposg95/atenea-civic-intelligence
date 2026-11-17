import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

import { FOCUS } from "../ui";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open overlays, innermost last — only the top one reacts to keys. */
const stack: object[] = [];

/**
 * Modal focus management: focus first field on open, keep Tab inside,
 * close on Escape, give focus back to the opener on close.
 */
function useModalFocus(
  open: boolean,
  panel: RefObject<HTMLElement>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement>,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const target =
      initialFocus?.current ?? el?.querySelector<HTMLElement>("[data-autofocus]") ??
      el?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();

    const token = {};
    stack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      opener?.focus?.();
    };
  }, [open, panel, initialFocus]);
}

/** Side drawer on desktop, full-height sheet on phones. */
export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useModalFocus(open, panel, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] motion-safe:animate-fade-in"
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative flex h-full w-full flex-col border-l border-line bg-panel shadow-panel sm:max-w-[34rem] motion-safe:animate-[usr-slide_.28s_cubic-bezier(.16,1,.3,1)_both]"
      >
        <style>{`@keyframes usr-slide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}`}</style>
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Cerrar" onClick={onClose}>
            <CloseGlyph />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-line bg-panel px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/** Centered dialog for confirmations and one-time secrets. */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  tone = "default",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "danger";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(open, panel, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-end p-0 sm:place-items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role={tone === "danger" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full rounded-t-card border border-line bg-panel p-5 shadow-panel sm:max-w-md sm:rounded-card sm:p-6"
      >
        <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
          {title}
        </h2>
        <div className="mt-2 text-sm text-ink-muted">{children}</div>
        {footer && (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${FOCUS} grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink`}
    >
      {children}
    </button>
  );
}

export function CloseGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
