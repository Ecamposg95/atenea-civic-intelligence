import { describe, expect, it } from "vitest";

import type { UserRole } from "@/types/auth";

import {
  assignableRoles,
  capabilitiesFor,
  canManageLifecycle,
  ROLE_LABEL,
  ROLE_ORDER,
  roleLabel,
  structureFields,
  visibleRoles,
} from "../roles";

describe("assignableRoles", () => {
  it("superadmin can grant every role", () => {
    expect(assignableRoles("superadmin")).toEqual(ROLE_ORDER);
  });

  it("admin can grant every role except superadmin (including admin)", () => {
    const r = assignableRoles("admin");
    expect(r).not.toContain("superadmin");
    for (const role of [
      "admin", "coordinador", "lider", "activista", "capturista", "analyst", "viewer", "consulta",
    ] as UserRole[]) {
      expect(r).toContain(role);
    }
  });

  it("coordinador → lider/activista, lider → activista", () => {
    expect(assignableRoles("coordinador")).toEqual(["lider", "activista"]);
    expect(assignableRoles("lider")).toEqual(["activista"]);
  });

  it("read-only and field roles cannot grant anything", () => {
    for (const r of ["capturista", "activista", "analyst", "viewer", "consulta"] as UserRole[]) {
      expect(assignableRoles(r)).toEqual([]);
    }
    expect(assignableRoles(null)).toEqual([]);
  });
});

describe("visibleRoles / lifecycle", () => {
  it("hides superadmin from non-superadmins", () => {
    expect(visibleRoles("admin")).not.toContain("superadmin");
    expect(visibleRoles("superadmin")).toContain("superadmin");
  });

  it("only admin+ manage account lifecycle", () => {
    expect(canManageLifecycle("admin")).toBe(true);
    expect(canManageLifecycle("superadmin")).toBe(true);
    expect(canManageLifecycle("coordinador")).toBe(false);
  });
});

describe("capabilitiesFor", () => {
  const admin = { id: "a1", role: "admin" as const };

  it("admin can fully manage a capturista", () => {
    expect(capabilitiesFor(admin, { id: "u1", role: "capturista" })).toEqual({
      edit: true, changeRole: true, toggleActive: true, resetPassword: true, remove: true, restore: false,
    });
  });

  it("admin cannot touch a superadmin", () => {
    const c = capabilitiesFor(admin, { id: "s1", role: "superadmin" });
    expect(Object.values(c).every((v) => v === false)).toBe(true);
  });

  it("admin cannot change own role, deactivate or delete self", () => {
    const c = capabilitiesFor(admin, { id: "a1", role: "admin" });
    expect(c.edit).toBe(true);
    expect(c.changeRole).toBe(false);
    expect(c.toggleActive).toBe(false);
    expect(c.remove).toBe(false);
  });

  it("deleted users can only be restored", () => {
    expect(capabilitiesFor(admin, { id: "u1", role: "viewer", deleted: true })).toEqual({
      edit: false, changeRole: false, toggleActive: false, resetPassword: false, remove: false, restore: true,
    });
  });

  it("coordinador edits lideres but has no lifecycle powers", () => {
    const c = capabilitiesFor({ id: "c1", role: "coordinador" }, { id: "l1", role: "lider" });
    expect(c.edit).toBe(true);
    expect(c.toggleActive || c.remove || c.resetPassword).toBe(false);
    expect(capabilitiesFor({ id: "c1", role: "coordinador" }, { id: "x", role: "admin" }).edit).toBe(false);
  });

  it("no actor → nothing", () => {
    expect(capabilitiesFor(null, { id: "u", role: "viewer" }).edit).toBe(false);
  });
});

describe("labels & structure", () => {
  it("Spanish labels for every role", () => {
    expect(ROLE_LABEL).toMatchObject({
      superadmin: "Superadministrador",
      admin: "Administrador",
      coordinador: "Coordinadora/Coordinador",
      lider: "Líder",
      activista: "Activista",
      capturista: "Capturista",
      analyst: "Analista",
      viewer: "Lectura",
      consulta: "Consulta",
    });
    expect(roleLabel("desconocido")).toBe("desconocido");
    expect(roleLabel(null)).toBe("—");
  });

  it("structure fields depend on the role", () => {
    expect(structureFields("activista")).toEqual({ seccion: true, lider: true, coordinador: false });
    expect(structureFields("lider")).toEqual({ seccion: true, lider: false, coordinador: true });
    expect(structureFields("capturista")).toEqual({ seccion: true, lider: false, coordinador: false });
    expect(structureFields("analyst")).toEqual({ seccion: false, lider: false, coordinador: false });
  });
});
