import { useEffect, useState } from "react";

import type { ManagedUser } from "../filters";
import { BTN } from "../ui";
import { Dialog } from "./Overlay";

export interface TempSecret {
  name: string;
  email: string;
  password: string;
  reason: "create" | "reset";
}

/** One-time temporary password with a copy button. */
export function TempPasswordDialog({
  secret,
  onClose,
}: {
  secret: TempSecret | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  useEffect(() => setCopied(null), [secret]);

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.password);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  return (
    <Dialog
      open={Boolean(secret)}
      title={secret?.reason === "create" ? "Usuario creado" : "Contraseña restablecida"}
      onClose={onClose}
      footer={
        <button type="button" className={BTN.primary} onClick={onClose}>
          Listo, ya la guardé
        </button>
      }
    >
      <p>
        Comparte esta contraseña temporal con <span className="font-semibold text-ink">{secret?.name}</span>{" "}
        ({secret?.email}). Al entrar deberá elegir una nueva.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <output
          className="flex min-h-[44px] flex-1 select-all items-center break-all rounded-lg border border-line-strong bg-bg-sunken px-3 font-mono text-base tracking-wide text-ink"
          aria-label="Contraseña temporal"
        >
          {secret?.password}
        </output>
        <button type="button" className={BTN.secondary} onClick={() => void copy()} data-autofocus>
          {copied === "ok" ? "Copiada" : "Copiar"}
        </button>
      </div>
      <p className="mt-2 min-h-[1.25rem] text-[13px]" aria-live="polite">
        {copied === "ok" && <span className="text-ink">Copiada al portapapeles.</span>}
        {copied === "fail" && (
          <span className="text-state-critical">No se pudo copiar; selecciónala y cópiala a mano.</span>
        )}
      </p>
      <p className="text-[13px] text-ink-muted">No se volverá a mostrar.</p>
    </Dialog>
  );
}

export function ConfirmDeleteDialog({
  user,
  busy,
  onCancel,
  onConfirm,
}: {
  user: ManagedUser | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={Boolean(user)}
      tone="danger"
      title={`¿Eliminar a ${user?.full_name ?? ""}?`}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={BTN.secondary} onClick={onCancel} data-autofocus>
            Cancelar
          </button>
          <button type="button" className={BTN.dangerSolid} disabled={busy} onClick={onConfirm}>
            {busy ? "Eliminando…" : "Eliminar usuario"}
          </button>
        </>
      }
    >
      <p>
        {user?.email} perderá el acceso de inmediato. Sus capturas se conservan y puedes
        restaurar la cuenta desde el filtro “Eliminados”.
      </p>
    </Dialog>
  );
}
