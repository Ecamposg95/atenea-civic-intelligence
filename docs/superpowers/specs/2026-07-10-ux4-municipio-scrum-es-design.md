# UX-4 — Re-scope a municipio + Scrum en español (Diseño)

**Fecha:** 2026-07-10
**Estado:** Aprobado. Fase 4 (final) del programa de mejora UI/UX de Lucy (ver `[[ux-mejora-lucy]]`).

## A. Fusionar Mapa/Territorios en "San Mateo Atenco"

Mapa (`/maps`) y Territorios (`/territorios`) son GIS de alcance nacional
mal-dirigidos para una operadora; la geometría a nivel sección de San Mateo
Atenco no está ingestada. **San Mateo Atenco** (`/municipio`, panorama municipal
ya campaign-scoped) es la vista territorial de Lucy.

- En `frontend/src/modules/registry.ts`: definir `INTEL_ANALYST: UserRole[] =
  ["superadmin","admin","analyst","viewer"]` y cambiar los `roles` de las
  entradas `maps` y `territorios` a `INTEL_ANALYST` (quita coordinador **y**
  lider — roles operadores). La entrada `municipio-panorama` (San Mateo Atenco)
  **se queda** en `INTEL_TERRITORY` (conserva coordinador/lider). Sin cambios de
  rutas ni de las páginas (admin/analista siguen usando Mapa/Territorios).

## B. Reportes → métricas de campaña

`ReportesPage` hoy consume `getOverview` (analytics) + `getAreas` (maps) →
KPIs de plataforma/gobernanza (organizaciones, usuarios, fuentes, actores del
audit). Re-orientar a **métricas de campaña**, reusando el endpoint ejecutivo
que ya existe (`dashboard/executive`, expuesto en `@/api/dashboard`):
promovidos/meta + pct, afiliados, casos/SLA, cobertura (secciones al día / en
riesgo), tendencia, top secciones. **Conservar** el export CSV y la vista de
impresión (su fortaleza actual). No es un dashboard nuevo — es el reporte
imprimible/exportable de los mismos números del Command Center. Sin cambios de
backend (el endpoint ya devuelve todo). Gate de `reportes` sin cambios (sigue
`REPORTS`, que incluye coordinador).

## C. Scrum en lenguaje de campaña (traducción completa de labels)

Solo cambian **labels de UI** — los valores de enum del backend
(`HISTORIA/TAREA/BUG`, `PLANNING/DAILY/…`, estados) **no** cambian.

| Término técnico | Label en español |
|---|---|
| Sprint / Sprints | **Ciclo / Ciclos** |
| Backlog | **Pendientes** |
| Ceremonias | **Reuniones** |
| Story points / Puntos | **Esfuerzo** |
| Bug (tipo de item) | **Incidencia** |
| Tablero | Tablero *(se queda)* |
| Historia / Tarea | Historia / Tarea *(se quedan)* |

- Nav (`registry.ts`): `Sprints`→**Ciclos**, `Backlog`→**Pendientes** (Tablero
  se queda).
- `modules/scrum/` (Tablero/Backlog/Sprints/WorkItemDetail): headers, subtítulos,
  labels de columna, el `<select>` de tipo (Bug→Incidencia), el label de story
  points (→ "Esfuerzo", con ayuda "dificultad 1-21"), y las "Ceremonias"→
  "Reuniones" (incluyendo el select de tipo de reunión y el form de crear).
- Referencias a "ceremonia" en `modules/minutas/` (si el detalle del sprint las
  muestra) → "Reunión".
- Mantener consistencia: un solo término por concepto en toda la UI de Lucy.

## Alcance & verificación

- A y C: solo frontend (`registry.ts` + `modules/scrum/` + labels). B: frontend
  (`ReportesPage` + su api client) reusando el endpoint ejecutivo existente.
- Cada sub-feature independiente. Gate: `npm run build` limpio + `npm run test`
  verde. Verificar que ningún rol pierde acceso indebido (solo Mapa/Territorios
  salen de coordinador/lider), que Reportes exporta/imprime las nuevas métricas,
  y que no queda ningún "Sprint/Backlog/Bug/points" visible en la UI de Scrum.
