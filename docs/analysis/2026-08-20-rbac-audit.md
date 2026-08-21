# Auditoría RBAC — insumo de SP-0 (2026-08-20)

> Mapa del sistema de roles/visibilidad vigente. Base del diseño
> `docs/superpowers/specs/2026-08-20-sp0-superadmin-consolidado-rbac-design.md` y del
> futuro `docs/RBAC-MATRIX.md` (entregable de SP-0).

## Mecánica

- `require_roles(*roles)` (`app/dependencies.py:158`): **superadmin siempre pasa**;
  `require_roles()` vacío = solo superadmin (usado en `users.py:51` como `SuperadminCtx`).
- `CampaignCtx` exige `X-Campaign-Id` (400 si falta); superadmin salta membresía y adopta
  la org de la campaña. `AdminCtx` (`get_admin_context`): superadmin sin header → modo
  consolidado (`organization_id=None`, `campaign_id=""`).
- `scoped_query` (`app/core/scoping.py`): si `is_superadmin and organization_id is None`
  → consulta sin filtro org/campaña (cross-tenant), manteniendo `deleted_at IS NULL`.
- Frontend: `MODULES.roles` en `frontend/src/modules/registry.ts` filtra menú
  (`Sidebar.visibleFor`) y rutas (`App.tsx RequireRole` → redirect a `/`). El header lo
  inyecta `api/client.ts` desde localStorage (`agora-campaign`); solo superadmin ve
  "Todas las bases" (`CampaignSwitcher.tsx`).

## Alcance de datos por rol

| Rol | Lectura granular | Gate territorial (`area_id`) |
|---|---|---|
| SUPERADMIN sin base | Cross-tenant total — **solo en endpoints AdminCtx/Tenant** | Exento |
| SUPERADMIN con base | Campaña completa (≡ ADMIN) | Exento |
| ADMIN | Org + campaña activa | Exento |
| COORDINADOR | **Campaña completa** (divergencia deliberada vs spec RBAC v2, Command Center 2026-07-08) | Exento (`_bypass_territory`) |
| LIDER | Sub-árbol (`lider_id`) + filas sin dueño; minutas: propias/equipo/PUBLICADA | **Aplicado**: sin `area_id` → 0 filas |
| ACTIVISTA / CAPTURISTA | Solo propios | Exento |
| ANALYST / VIEWER / CONSULTA | `WHERE false` — cero granular; solo agregados | N/A |

Excepción: `operacion_service` no tiene `_role_scoped` (solo `scoped_query`).

## Superadmin consolidado — estado actual

- ✅ Funciona (AdminCtx/Tenant): `/admin/*`, `/registros/export`, `/reports/*`, `/arco/*`,
  `/audit`, `/analytics`, `/maps`, `/intel`, `/municipio`, `/territory`, `/sources`,
  `/ingest`, `/organizations`, `/campaigns/mine` (todas las campañas de todos los tenants).
- ❌ 400 "X-Campaign-Id required" (CampaignCtx): `/dashboard/executive` (¡Inicio!),
  `/registros`, `/promovidos`, `/militantes`, `/casos`, `/forms`, `/responses`,
  `/minutas`, `/scrum`, `/operacion`, detalle campaña/contests.
- `POST /campaigns` consolidado → IntegrityError/500 (`organization_id` NOT NULL).

## Anomalías (numeración usada por la spec SP-0)

1. `dashboard` registry `roles: ALL` pero backend excluye ACTIVISTA/CAPTURISTA → menú + 403.
2. COORDINADOR captura pero excluido de `GET /privacy/notice` (`routers/privacy.py:24`).
3. Registry `captura` excluye coordinador; backend `CapturaWriteCtx` lo permite.
4. 4–5 listas "intel read" divergentes a mano en `/intel`, `/analytics`, `/maps`,
   `/municipio`, `/territory` (coordinador excluido solo de `/intel`, decisión UX-4).
5. `POST /campaigns` consolidado → 500.
6. ANALYST/VIEWER jamás se siembran (`bootstrap.py`); matriz sin validar fuera de tests.
7. Docstring `exports.py` obsoleto (omite COORDINADOR).
8. Spec RBAC v2 (2026-06-29) desactualizada: alcance campaña-completa + reveal del
   COORDINADOR son cambios deliberados posteriores.
9. `plan-territorial`/`war-room` (frontend CONSOLE_COORD) vs `/operacion` `_READ`
   (incluye ANALYST/VIEWER): **intencional** — el dashboard ejecutivo de analyst/viewer
   compone `operacion_service.seguimiento`. Documentar, no tocar.
10. `scrum._MOVE == _READ` (propiedad validada en service — verificar en tests).
11. `coordinador_id` columna sin uso en scoping (solo alta de usuarios).
12. `campaigns.py:13` redefine localmente un símbolo `AdminCtx` que NO es el de
    `dependencies.py` (es `require_roles(ADMIN)`) — confuso al leer.
