# Session Log — Plataforma de Activistas + RBAC v2 (2026-06-27 → 2026-06-30)

Registro de lo entregado en la sesión. Todo está en `main` (HEAD `ea4f3ff`), pusheado y **desplegado en Railway** (`https://agora-gobtech.up.railway.app`).

## Qué se construyó

### Plataforma de Captura de Activistas (SPA-1 → SPA-4)
Implementación completa del Task Pack Maestro de Activistas en 4 rebanadas (subagent-driven: implementer → review por tarea → revisión final de rama):
- **SPA-1** Núcleo de captura: cifrado Fernet de clave de elector, modelo `Registro`, roles LIDER/ACTIVISTA, login por teléfono/email, scoping superadmin, RBAC backend, `/api/registros` + `/api/perfil`, frontend módulo `captura`.
- **SPA-2** Consola admin/superadmin: `/api/admin/*` (listado masked, métricas, estructura, revelar-clave auditado, auditoría), user CRUD con estructura, dashboard recharts, vista consolidada multi-base.
- **SPA-3** Offline PWA: cola IndexedDB + motor de sync idempotente (estado `failed` para 4xx), `vite-plugin-pwa`/Workbox, vitest, constraint ensanchada (Alembic 0009).
- **SPA-4** Compliance F7 + Export F8 + QA/Deploy F9: aviso versionado + acceptance trail, ARCO hard-delete, retención/purga (CLI), redacción PII en errores, export xlsx/csv (masked + reveal auditado), reporte por sección, rate-limit (slowapi) + security headers, STATUS.md/CLAUDE.md.

### RBAC v2 — 9 roles, default-deny (toda la plataforma)
- Roles: SUPERADMIN, ADMIN, **COORDINADOR**🆕, LIDER, ACTIVISTA, **CAPTURISTA**🆕, ANALYST, VIEWER, **CONSULTA**🆕.
- Jerarquía de campo de 4 niveles (`User.coordinador_id`); default-deny en frontend (`RequireRole` + `roles:` en cada módulo) y backend (`require_roles` por endpoint, incluida la inteligencia antes abierta); scoping por rol; alta de usuarios con validación anti-escalamiento.
- Alembic 0012 (enum + columna, aditiva).

## Estado de calidad
- Backend: **287 pytest passing**. Frontend: **build + PWA verde, vitest 12**. Head Alembic único **0012**.
- Revisiones finales (Opus): SPA-4 = Ready (0 Critical); RBAC v2 = Ready (0 Critical/Important). Hallazgos corregidos y re-revisados.

## Despliegue (Railway, proyecto "Agora", servicio Agora, env production)
- Tres deploys verificados en vivo: SPA-1+2+3, SPA-4, RBAC v2.
- Verificación end-to-end en prod: captura de activista E2E (201, clave enmascarada); por rol tras RBAC v2 (Lucy=COORDINADOR, activista/capturista 403 en inteligencia, login OK).
- Env vars críticas seteadas: `FERNET_KEY` (requerida — sin ella la app no arranca), `SEED_LUCY/LIDER/ACTIVISTA/CAPTURISTA_EMAIL+PASSWORD`.

## Usuarios demo en prod (todos `@atlastech.mx` / `78451289`)
- `lucy@atlastech.mx` — **COORDINADOR** (Dirigente de Activismo)
- `lider@atlastech.mx` — LIDER (bajo Lucy)
- `activista@atlastech.mx` — ACTIVISTA (bajo el líder)
- `capturista@atlastech.mx` — CAPTURISTA (captura plana)
- Superadmin: `ecg@atlastech.mx` (existente) / por `SEED_ADMIN_*`.
- Estructura demo en org `atlas`, campaña "Campaña Demo 2027".

## Follow-ups documentados (no bloqueantes)
- Iconos PWA reales (hoy placeholder); cifrado on-device de IndexedDB; índice parcial unique para aviso global (PG NULL); rate-limit con Redis si hay multi-réplica; CSP nonces; UI para reenviar registros offline `failed`.
- **Cuando entre la rama `feat/sp0b2b-tidy-facts`** (su `0007` + routers resultados/socio/denue): crear merge-migration que reconcilie 0007 con la cadena 0008..0012, y gatear esos routers con el set de inteligencia de RBAC v2.

## Specs/planes (en repo)
`docs/superpowers/specs/` y `docs/superpowers/plans/` con fecha 2026-06-27 (SPA-1), 2026-06-29 (SPA-2/3/4 + RBAC v2). Ledgers de ejecución en `.superpowers/sdd/` (scratch, gitignored).
