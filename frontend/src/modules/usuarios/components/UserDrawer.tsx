import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type { User, UserRole } from "@/types/auth";

import type { SeccionOption } from "../api";
import {
  diffPayload,
  emptyForm,
  formFromUser,
  validateUserForm,
  type FormErrors,
  type ManagedUser,
  type UserFormValues,
} from "../filters";
import { capabilitiesFor, ROLE_DOT, ROLE_HINT, ROLE_LABEL, structureFields } from "../roles";
import { BTN, INPUT, LABEL } from "../ui";
import { Drawer } from "./Overlay";
import { TerritorySection } from "./TerritorySection";
import { ActiveSwitch } from "./UserList";

export type DrawerState = { mode: "create" } | { mode: "edit"; user: ManagedUser };

interface Props {
  state: DrawerState | null;
  actor: Pick<User, "id" | "role"> | null;
  allowedRoles: UserRole[];
  secciones: SeccionOption[] | null;
  lideres: ManagedUser[];
  coordinadores: ManagedUser[];
  saving: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (
    mode: "create" | "edit",
    values: UserFormValues,
    patch: ReturnType<typeof diffPayload> | null,
  ) => void;
  onToggleActive: (u: ManagedUser, next: boolean) => void;
  onResetPassword: (u: ManagedUser) => void;
  onDelete: (u: ManagedUser) => void;
  onTerritoryChanged: () => void;
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-[13px] text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[13px] font-medium text-state-critical">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: boolean) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export function UserDrawer(props: Props) {
  const { state, actor, allowedRoles, secciones, lideres, coordinadores } = props;
  const uid = useId();
  const editing = state?.mode === "edit" ? state.user : null;
  const [values, setValues] = useState<UserFormValues>(() => emptyForm(actor, allowedRoles));
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState(false);

  // Reset the form each time the drawer opens on a different target.
  const key = state ? (state.mode === "edit" ? state.user.id : "new") : null;
  useEffect(() => {
    if (!state) return;
    setValues(state.mode === "edit" ? formFromUser(state.user) : emptyForm(actor, allowedRoles));
    setErrors({});
    setTouched(false);
  }, [key]);

  const caps = editing ? capabilitiesFor(actor, { id: editing.id, role: editing.role }) : null;
  // When editing, keep the user's current role selectable even if the actor
  // couldn't grant it (it's simply locked in that case).
  const roleChoices = useMemo(() => {
    if (editing && !allowedRoles.includes(editing.role)) return [editing.role];
    return allowedRoles;
  }, [editing, allowedRoles]);
  const roleLocked = Boolean(editing && caps && !caps.changeRole);
  const fields = structureFields(values.role);

  const set = <K extends keyof UserFormValues>(k: K, v: UserFormValues[K]) => {
    const next = { ...values, [k]: v };
    setValues(next);
    if (touched) {
      setErrors(
        validateUserForm(next, {
          mode: editing ? "edit" : "create",
          allowedRoles: roleChoices,
        }),
      );
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const errs = validateUserForm(values, {
      mode: editing ? "edit" : "create",
      allowedRoles: roleChoices,
    });
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = Object.keys(errs)[0];
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    props.onSubmit(editing ? "edit" : "create", values, editing ? diffPayload(editing, values) : null);
  };

  const formId = `${uid}-form`;
  const title = editing ? editing.full_name : "Nuevo usuario";
  const description = editing
    ? editing.email
    : "Recibirá una contraseña temporal que deberá cambiar al entrar.";

  return (
    <Drawer
      open={Boolean(state)}
      title={title}
      description={description}
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className={BTN.secondary} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={BTN.primary} disabled={props.saving}>
            {props.saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear usuario"}
          </button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-5">
        {props.serverError && (
          <div role="alert" className="rounded-lg border border-state-critical/50 bg-state-critical/10 px-3 py-2.5 text-sm text-ink">
            {props.serverError}
          </div>
        )}

        <Field id={`${uid}-full_name`} label="Nombre completo" error={errors.full_name}>
          <input
            id={`${uid}-full_name`}
            data-autofocus
            className={INPUT}
            value={values.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            autoComplete="name"
            aria-invalid={Boolean(errors.full_name)}
            aria-describedby={describedBy(`${uid}-full_name`, errors.full_name)}
            required
          />
        </Field>

        <Field
          id={`${uid}-email`}
          label="Correo electrónico"
          hint={editing ? "El correo no se puede cambiar." : "Con este correo iniciará sesión."}
          error={errors.email}
        >
          <input
            id={`${uid}-email`}
            type="email"
            inputMode="email"
            className={`${INPUT} read-only:cursor-not-allowed read-only:text-ink-muted`}
            value={values.email}
            readOnly={Boolean(editing)}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="off"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy(`${uid}-email`, errors.email, true)}
            required
          />
        </Field>

        <Field id={`${uid}-phone`} label="Teléfono (opcional)" error={errors.phone}>
          <input
            id={`${uid}-phone`}
            type="tel"
            inputMode="tel"
            className={INPUT}
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            autoComplete="off"
            placeholder="55 1234 5678"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={describedBy(`${uid}-phone`, errors.phone)}
          />
        </Field>

        <fieldset>
          <legend className={LABEL}>Rol</legend>
          {roleLocked && (
            <p className="mb-2 text-[13px] text-ink-muted">
              {editing?.id === actor?.id ? "No puedes cambiar tu propio rol." : "No puedes cambiar este rol."}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2" aria-describedby={errors.role ? `${uid}-role-error` : undefined}>
            {roleChoices.map((r) => {
              const checked = values.role === r;
              return (
                <label
                  key={r}
                  className={`relative flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                    checked ? "border-accent bg-accent/10" : "border-line-strong hover:bg-panel-hover"
                  } ${roleLocked && !checked ? "hidden" : ""} ${roleLocked ? "cursor-default" : ""}`}
                >
                  <input
                    type="radio"
                    name={`${uid}-role`}
                    value={r}
                    checked={checked}
                    disabled={roleLocked}
                    onChange={() => set("role", r)}
                    className="sr-only"
                  />
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: ROLE_DOT[r] }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{ROLE_LABEL[r]}</span>
                    <span className="block text-[13px] leading-snug text-ink-muted">{ROLE_HINT[r]}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {errors.role && (
            <p id={`${uid}-role-error`} className="mt-1 text-[13px] font-medium text-state-critical">
              {errors.role}
            </p>
          )}
        </fieldset>

        {(fields.seccion || fields.lider || fields.coordinador) && (
          <div className="flex flex-col gap-5 rounded-card border border-line bg-panel-raised p-4">
            <p className="text-sm font-semibold text-ink">Estructura en territorio</p>
            {fields.seccion && (
              <Field
                id={`${uid}-seccion`}
                label="Sección electoral"
                hint={secciones ? undefined : "Escribe el número de sección."}
                error={errors.seccion}
              >
                {secciones ? (
                  <select
                    id={`${uid}-seccion`}
                    className={INPUT}
                    value={values.seccion}
                    onChange={(e) => set("seccion", e.target.value)}
                  >
                    <option value="">Sin sección</option>
                    {values.seccion && !secciones.some((s) => s.seccion === values.seccion) && (
                      <option value={values.seccion}>{values.seccion} (actual)</option>
                    )}
                    {secciones.map((s) => (
                      <option key={s.seccion} value={s.seccion}>
                        {s.barrio ? `${s.seccion} · ${s.barrio}` : s.seccion}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`${uid}-seccion`}
                    className={INPUT}
                    inputMode="numeric"
                    value={values.seccion}
                    onChange={(e) => set("seccion", e.target.value)}
                    aria-invalid={Boolean(errors.seccion)}
                    aria-describedby={describedBy(`${uid}-seccion`, errors.seccion, true)}
                  />
                )}
              </Field>
            )}
            {fields.lider && (
              <Field
                id={`${uid}-lider`}
                label="Líder"
                hint={lideres.length === 0 ? "Aún no hay líderes activos." : "A quién reporta este activista."}
              >
                <select
                  id={`${uid}-lider`}
                  className={INPUT}
                  value={values.lider_id}
                  disabled={actor?.role === "lider"}
                  onChange={(e) => set("lider_id", e.target.value)}
                  aria-describedby={`${uid}-lider-hint`}
                >
                  <option value="">Sin líder</option>
                  {lideres.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.full_name}
                      {l.seccion ? ` · secc. ${l.seccion}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {fields.coordinador && (
              <Field
                id={`${uid}-coord`}
                label="Coordinación"
                hint={coordinadores.length === 0 ? "Aún no hay coordinadoras activas." : "Quién coordina a este líder."}
              >
                <select
                  id={`${uid}-coord`}
                  className={INPUT}
                  value={values.coordinador_id}
                  disabled={actor?.role === "coordinador"}
                  onChange={(e) => set("coordinador_id", e.target.value)}
                  aria-describedby={`${uid}-coord-hint`}
                >
                  <option value="">Sin coordinación</option>
                  {coordinadores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}
      </form>

      {editing && caps && (caps.toggleActive || caps.resetPassword || caps.remove) && (
        <section className="mt-8 border-t border-line pt-6" aria-labelledby={`${uid}-acct`}>
          <h3 id={`${uid}-acct`} className="font-display text-base font-semibold text-ink">
            Acceso a la cuenta
          </h3>
          <p className="mt-1 text-sm text-ink-muted">Estos cambios se aplican al momento.</p>
          <div className="mt-4 flex flex-col divide-y divide-line rounded-card border border-line">
            {caps.toggleActive && (
              <div className="flex items-center justify-between gap-4 px-4 py-2">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {editing.is_active ? "Cuenta activa" : "Cuenta desactivada"}
                  </p>
                  <p className="text-[13px] text-ink-muted">
                    {editing.is_active ? "Puede iniciar sesión." : "No puede iniciar sesión."}
                  </p>
                </div>
                <ActiveSwitch
                  checked={editing.is_active}
                  label={`Cuenta de ${editing.full_name} activa`}
                  onChange={(next) => props.onToggleActive(editing, next)}
                />
              </div>
            )}
            {caps.resetPassword && (
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">Contraseña</p>
                  <p className="text-[13px] text-ink-muted">Genera una temporal; deberá cambiarla al entrar.</p>
                </div>
                <button type="button" className={BTN.secondary} onClick={() => props.onResetPassword(editing)}>
                  Restablecer contraseña
                </button>
              </div>
            )}
            {caps.remove && (
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">Eliminar usuario</p>
                  <p className="text-[13px] text-ink-muted">Pierde el acceso. Puedes restaurarlo desde “Eliminados”.</p>
                </div>
                <button type="button" className={BTN.danger} onClick={() => props.onDelete(editing)}>
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {editing && actor?.role === "superadmin" && (
        <TerritorySection user={editing} onChanged={props.onTerritoryChanged} />
      )}
    </Drawer>
  );
}
