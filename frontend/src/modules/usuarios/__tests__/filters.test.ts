import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILTERS,
  diffPayload,
  emptyForm,
  formFromUser,
  isDeleted,
  pageCount,
  rangeLabel,
  toListParams,
  toPayload,
  translateError,
  validateUserForm,
  type ManagedUser,
  type UserFormValues,
} from "../filters";

describe("toListParams", () => {
  it("defaults: every non-deleted user, newest first, first page", () => {
    expect(toListParams(DEFAULT_FILTERS, 20)).toEqual({
      sort: "created_at", order: "desc", limit: 20, offset: 0,
    });
  });

  it("maps search, role, sort and page", () => {
    const p = toListParams({ q: "  ana ", role: "capturista", status: "todos", sort: "nombre", page: 2 }, 20);
    expect(p).toMatchObject({ q: "ana", role: "capturista", sort: "full_name", order: "asc", offset: 40 });
  });

  it("maps every status", () => {
    const base = { ...DEFAULT_FILTERS };
    expect(toListParams({ ...base, status: "activos" }, 10).is_active).toBe(true);
    expect(toListParams({ ...base, status: "inactivos" }, 10).is_active).toBe(false);
    const del = toListParams({ ...base, status: "eliminados" }, 10);
    expect(del.deleted_only).toBe(true);
    expect(del.is_active).toBeUndefined();
    const all = toListParams({ ...base, status: "todos" }, 10);
    expect(all.is_active).toBeUndefined();
    expect(all.deleted_only).toBeUndefined();
    expect(all.include_deleted).toBeUndefined();
  });

  it("drops blank search and clamps negative pages", () => {
    const p = toListParams({ ...DEFAULT_FILTERS, q: "   ", page: -3 }, 10);
    expect(p.q).toBeUndefined();
    expect(p.offset).toBe(0);
  });
});

describe("pagination helpers", () => {
  it("pageCount is at least 1", () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
  });
  it("rangeLabel", () => {
    expect(rangeLabel(0, 20, 0)).toBe("Sin resultados");
    expect(rangeLabel(1, 20, 57)).toBe("Mostrando 21–40 de 57");
    expect(rangeLabel(2, 20, 57)).toBe("Mostrando 41–57 de 57");
  });
});

const user: ManagedUser = {
  id: "u1",
  email: "ana@sma.mx",
  full_name: "Ana Pérez",
  role: "activista",
  organization_id: "o1",
  is_active: true,
  phone: "5512345678",
  seccion: "4127",
  lider_id: "l1",
  coordinador_id: null,
};

describe("form helpers", () => {
  const valid: UserFormValues = {
    full_name: "Ana", email: "ana@sma.mx", role: "capturista",
    phone: "", seccion: "", lider_id: "", coordinador_id: "",
  };

  it("validates required fields, email, phone and role permission", () => {
    expect(validateUserForm(valid, { mode: "create", allowedRoles: ["capturista"] })).toEqual({});
    const e = validateUserForm(
      { ...valid, full_name: " ", email: "x@", phone: "abc", role: "admin" },
      { mode: "create", allowedRoles: ["capturista"] },
    );
    expect(Object.keys(e).sort()).toEqual(["email", "full_name", "phone", "role"]);
  });

  it("email is not validated on edit (read-only)", () => {
    expect(validateUserForm({ ...valid, email: "" }, { mode: "edit", allowedRoles: ["capturista"] })).toEqual({});
  });

  it("toPayload blanks → null and drops fields that don't apply to the role", () => {
    expect(toPayload({ ...valid, role: "analyst", seccion: "12", lider_id: "l1", phone: " " })).toEqual({
      full_name: "Ana", role: "analyst", phone: null, seccion: null, lider_id: null, coordinador_id: null,
    });
    expect(toPayload({ ...valid, role: "activista", seccion: "12", lider_id: "l1" })).toMatchObject({
      seccion: "12", lider_id: "l1",
    });
  });

  it("diffPayload only sends what changed", () => {
    expect(diffPayload(user, formFromUser(user))).toEqual({});
    expect(diffPayload(user, { ...formFromUser(user), seccion: "4128", phone: "" })).toEqual({
      seccion: "4128", phone: null,
    });
    // Changing to a role without a líder clears the link explicitly.
    expect(diffPayload(user, { ...formFromUser(user), role: "capturista" })).toEqual({
      role: "capturista", lider_id: null,
    });
  });

  it("emptyForm defaults to capturista for admins and links hierarchy for field roles", () => {
    expect(emptyForm({ id: "a", role: "admin" }, ["admin", "capturista", "viewer"]).role).toBe("capturista");
    expect(emptyForm({ id: "c", role: "coordinador" }, ["lider", "activista"])).toMatchObject({
      role: "lider", coordinador_id: "c",
    });
    expect(emptyForm({ id: "l", role: "lider" }, ["activista"])).toMatchObject({
      role: "activista", lider_id: "l",
    });
  });

  it("isDeleted uses the filter or deleted_at", () => {
    expect(isDeleted(user, "eliminados")).toBe(true);
    expect(isDeleted(user, "todos")).toBe(false);
    expect(isDeleted({ ...user, deleted_at: "2026-11-17T00:00:00Z" }, "todos")).toBe(true);
  });
});

describe("translateError", () => {
  it("translates known backend messages", () => {
    expect(translateError(new Error("Email already registered"), "x")).toBe("Ese correo ya está registrado.");
    expect(translateError(new Error("Cannot manage a superadmin"), "x")).toMatch(/superadministrador/);
  });
  it("falls back for generic axios text or unknown values", () => {
    expect(translateError(new Error("Request failed with status code 500"), "Falló")).toBe("Falló");
    expect(translateError(undefined, "Falló")).toBe("Falló");
    expect(translateError(new Error("Algo específico"), "Falló")).toBe("Algo específico");
  });
});
