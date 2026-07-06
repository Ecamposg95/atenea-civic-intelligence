# Atención Ciudadana (03) — Diseño

**Fecha:** 2026-07-06
**Estado:** Aprobado (brainstorming)
**Contexto:** Ágora Civic Intelligence · módulo 03 de la Estructura VG · San Mateo Atenco
**Relacionado:** [[registro-militantes]] (spine reutilizado: PII Fernet, evidencia en bucket, scope territorial, auditoría), territorio+promovidos, RBAC v2

---

## 1. Objetivo

Construir **Atención Ciudadana**: un sistema donde formularios (constructor visual) alimentan **casos** (peticiones ciudadanas) que se siguen por estados con auto-ruteo territorial, evidencia y bitácora — capturados por **canal interno (activista)** y **canal público (ciudadano)** — más un **tablero de decisión** para Lucy. Se añade un acelerador de captura por **OCR de credencial** y una **cuenta regresiva electoral** en el dashboard principal.

**Decisión de alcance (consciente):** el usuario eligió construir los tres subsistemas (constructor de formularios + canal público + casos CRM) integrados en un solo v1, tras habérsele presentado la opción de descomponer en 3 sub-proyectos. Se acepta el mayor riesgo/tiempo. **Mitigación:** el spec se estructura en unidades bien acotadas (builder / renderer+OCR / casos / público / tablero) con interfaces limpias, para poder **implementar por capas** aunque se especifique junto.

### Decisiones cerradas (brainstorming)

| Tema | Decisión |
|------|----------|
| Núcleo v1 | **Formularios + casos integrados** (una respuesta abre un caso) |
| Canales | **Interno (activista, JWT+territorio) Y público (ciudadano, link sin login)** |
| Formularios | **Constructor visual completo** (campos, secciones, lógica condicional) |
| Ciclo del caso | **Estados + auto-ruteo territorial** (PENDIENTE→EN_PROCESO→ATENDIDO→CERRADO) + SLA + bitácora |
| Anti-abuso público | **Omitido en v1, documentado** (honeypot + rate-limit slowapi = requisito antes de exponer el canal; el canal queda tras flag) |
| OCR | **On-device (Tesseract.js)**, asistente de captura (pre-llena + confirma), la foto no sale del teléfono para OCR |
| Cuenta regresiva | `Campaign.fecha_eleccion` + widget en dashboard principal |

### Fuera de v1 (YAGNI / documentado)

- Anti-abuso del canal público (honeypot/rate-limit/captcha) — **requerido antes de exponer `/p/{slug}` públicamente**; el canal nace tras flag `PUBLIC_FORMS_ENABLED`.
- OCR server-side de alta precisión (alternativa a on-device).
- Notificaciones al ciudadano (SMS/email de seguimiento del caso).
- SLA con escalamiento automático / recordatorios.
- Export masivo de casos a PDF.

---

## 2. Arquitectura y unidades

Enfoque aprobado: **formularios como definición JSON + renderer dinámico; cada respuesta genera un caso** (Enfoque A). Un solo motor de formularios sirve al builder, al canal interno y al público.

Unidades (cada una con interfaz limpia, implementable por capa):

1. **Form engine** — `FormDefinition` (schema JSON) + validación + versionado.
2. **Response + mapping** — `FormResponse` + regla que abre un `Caso`.
3. **Casos CRM** — ciclo de vida + auto-ruteo territorial + bitácora + evidencia.
4. **Canal público** — endpoints sin auth (tras flag).
5. **OCR assist** — on-device, pre-llena la captura.
6. **Tablero + cuenta regresiva** — vistas de Lucy + widget electoral.

---

## 3. Modelo de datos (migración 0016, aditiva/idempotente, estados como String, sin enums PG)

**`FormDefinition`** (`form_definitions`) — mixins UUID/Tenant/Campaign/Audit:
- `nombre` `String(200)`, `descripcion` `String(1000)`, `tipo` `String(20)` (PETICION|QUEJA|APOYO|OTRO), `slug` `String(80)` (único por campaña, para link público), `canal` `String(20)` (INTERNO|PUBLICO|AMBOS), `is_active` `Boolean`, `version` `Integer`, `schema` `JSON` (lista de campos + secciones + reglas condicionales), `created_by`.
- Índices: `(campaign_id, is_active)`, `UniqueConstraint(campaign_id, slug)`.

**Schema JSON de un formulario** (contrato, validado en backend):
```json
{ "secciones": [
  { "titulo": "Datos del ciudadano", "campos": [
    { "key": "nombre", "tipo": "text", "label": "Nombre", "requerido": true },
    { "key": "seccion", "tipo": "seccion", "label": "Sección", "requerido": true },
    { "key": "tel", "tipo": "phone", "label": "Teléfono", "sensible": true }
  ]}
]}
```
Tipos de campo v1: `text, textarea, number, date, select, multiselect, boolean, phone, email, seccion, foto`. Lógica condicional: `{ "mostrar_si": { "campo": "<key>", "igual": "<valor>" } }` a nivel campo/sección. Campos `sensible:true` → se cifran (Fernet) al persistir la respuesta.

**`FormResponse`** (`form_responses`) — mixins:
- `form_definition_id` FK, `answers` `JSON` (valores no sensibles), `answers_enc` `LargeBinary` (blob cifrado de los campos `sensible`), `channel` `String(20)` (INTERNO|PUBLICO), `captured_by` FK users `SET NULL` (**null si público**), `nombre_emisor` `String(255)`, `contacto_masked` `String(40)`, `seccion` `String(20)`, `evidencia_keys` `JSON` (lista de object keys), `moderacion` `String(20)` (VERIFICADO|SIN_VERIFICAR), `caso_id` (FK, set tras el mapeo).
- Índice `(campaign_id, form_definition_id)`.

**`Caso`** (`casos`) — mixins:
- `folio` `String(40)` (auto `AC-<anio>-<sec>`, único por campaña, patrón de militantes con MAX-suffix+retry), `origin_response_id` FK nullable, `tipo` `String(20)`, `titulo` `String(255)`, `descripcion` `String(2000)`.
- Ciudadano: `ciudadano_nombre` `String(255)`, `contacto_enc` `LargeBinary` + `contacto_masked` `String(40)` (Fernet), `seccion` `String(20)`, `colonia` `String(255)`.
- Ruteo/estado: `area_id` FK electoral_areas nullable, `asignado_a` FK users `SET NULL` (auto-ruteado), `estado` `String(20)` default `PENDIENTE`, `prioridad` `String(10)` (BAJA|MEDIA|ALTA) default MEDIA, `fecha_compromiso` `Date` nullable (SLA), `channel` `String(20)`.
- Índices: `(campaign_id, estado)`, `(campaign_id, asignado_a)`, `(campaign_id, seccion)`, `UniqueConstraint(campaign_id, folio)`.

**`CasoEvento`** (`caso_eventos`) — bitácora/seguimiento (UUID/Tenant/Audit, sin Campaign — cuelga del caso):
- `caso_id` FK `CASCADE`, `tipo` `String(20)` (NOTA|CAMBIO_ESTADO|REASIGNACION|EVIDENCIA), `texto` `String(2000)`, `evidencia_key` `String(300)` nullable, `estado_nuevo` `String(20)` nullable, `actor_id` FK users, `created_at`.
- Índice `(caso_id, created_at)`.

**`Campaign.fecha_eleccion`** `Date` nullable — para la cuenta regresiva (editable por admin/superadmin en el módulo de campaña).

Evidencia reusa el bucket **`agora-uploads`** (`casos/{campaign_id}/{caso_id}/...`, `form_responses/{campaign_id}/{response_id}/...`), servida por presigned GET auditado (patrón militantes, `core/storage.py`).

---

## 4. Backend (routers + servicios)

- **`form_service`** + router `/api/forms`: CRUD de `FormDefinition` (admin/coordinador), validación del schema, versionado. `GET /forms`, `GET /forms/{id}`, `POST /forms`, `PATCH /forms/{id}`, `GET /forms/slug/{slug}` (definición pública de un form activo, sin PII).
- **`response_service`** + router `/api/responses`: `POST /responses` (interno, JWT) — valida `answers` contra el schema, cifra campos `sensible`, sube evidencia, y **llama a `caso_service.crear_desde_respuesta`**. Idempotente por `client_uuid`.
  - **Mapeo respuesta→caso (convención por `key`):** el `tipo` del caso = `tipo` del `FormDefinition`; `titulo` = valor del campo key `titulo` si existe, si no los primeros ~60 chars de `descripcion`; y por convención de `key` se copian `nombre`→`ciudadano_nombre`, `contacto`(o `tel`/`email`)→`contacto_enc/masked`, `seccion`→`seccion`, `colonia`→`colonia`, `descripcion`→`descripcion`. Keys ausentes se omiten. Las `evidencia_keys` de la respuesta se referencian desde el caso. Esta convención es fija en v1 (no configurable).
- **`caso_service`** + router `/api/casos`:
  - `crear_desde_respuesta(response)` y `crear_directo(data)` → genera folio, **auto-rutea** (`_resolve_responsable(db, ctx, seccion)`: user con `area_id` que cubre la sección, vía inverso de `territory_service`; fallback = null → cola coordinador), setea `fecha_compromiso = hoy + SLA[tipo]`.
  - `GET /casos` (scope rol∩territorio, patrón militantes; filtros estado/colonia/asignado/tipo/q), `GET /casos/{id}`, `PATCH /casos/{id}/estado` (registra `CasoEvento` CAMBIO_ESTADO), `PATCH /casos/{id}/asignar` (REASIGNACION), `POST /casos/{id}/eventos` (NOTA/EVIDENCIA — sube al bucket), `GET /casos/panorama` (tablero de Lucy).
- **Canal público** (tras flag `PUBLIC_FORMS_ENABLED`, default false): router `/api/public` **sin dependencia de auth**: `GET /public/forms/{slug}` (schema del form), `POST /public/forms/{slug}/responses` → crea `FormResponse(channel=PUBLICO, moderacion=SIN_VERIFICAR)` + `Caso` en estado PENDIENTE marcado sin verificar. **Anti-abuso documentado, no implementado** (ver §7).
- **RBAC:** crear/atender casos = ACTIVISTA+ (scope); reasignar/panorama/estados de gestión = COORDINADOR+; builder = COORDINADOR/ADMIN. Golden rules intactas (org del JWT, Pydantic, envelope, paginación, PII cifrada, auditoría en cada operación sensible).
- **Migración 0016** (down_revision = head actual; confirmar al implementar). Retención (`retention_service`) extendida a `Caso`/`FormResponse` (purga de evidencia del bucket).

---

## 5. Frontend

Módulo `frontend/src/modules/atencion/`, sección `ciudadania`, en `registry.ts`.

1. **Constructor de formularios** (`/atencion/formularios`, COORDINADOR/ADMIN) — builder visual: paleta de tipos de campo, secciones, lógica condicional (mostrar_si), preview en vivo; persiste el `schema` JSON. Reusa tokens "Command Center".
2. **Captura / renderer dinámico** (`/atencion/captura`, ACTIVISTA/CAPTURISTA, móvil) — pinta cualquier form desde su JSON (respeta requerido + lógica condicional); envía `FormResponse`. **OCR (§6) aquí.** Offline-aware (reusa cola/patrones de militantes cuando aplique).
3. **Casos / seguimiento** (`/atencion/casos`, COORDINADOR+) — bandeja con filtros + **semáforo de SLA** (vencido/por vencer/en tiempo), detalle con bitácora + evidencia (presigned) + cambio de estado + reasignación.
4. **Tablero de Lucy** (`/atencion`, COORDINADOR+) — casos por estado, por colonia/sección, pendientes vs atendidos, **SLA vencidos (semáforo territorial)**, tiempo promedio de atención, ranking por responsable. Alimentado por `GET /casos/panorama`.
5. **Canal público** (`/p/{slug}`, ruta pública fuera del shell autenticado) — renderer del form para el ciudadano; crea caso SIN_VERIFICAR. Tras flag.
6. **Cuenta regresiva electoral** — componente `CountdownElectoral` en `DashboardPage` (dashboard principal): lee `Campaign.fecha_eleccion`, muestra **días y horas** restantes a la jornada, con estilo hero (tokens existentes, `AnimatedNumber`). Si la fecha no está configurada → CTA "configura la fecha de elección" (admin). Cuenta regresiva client-side (tick por minuto/hora).

Clientes API en `frontend/src/api/{forms,casos,responses}.ts` (axios `apiClient`, sin prefijo `/api`).

---

## 6. OCR (asistente de captura)

- **On-device (Tesseract.js), lazy-loaded solo en la pantalla de captura.** La foto de la credencial **nunca sale del teléfono** para OCR (privacy-first, GovTech). Sin binario Tesseract en Nixpacks.
- Flujo: "Escanear credencial" → cámara (`PhotoCapture` de militantes) → OCR local → parser extrae `nombre`, `curp`, `clave`, `seccion`, `domicilio` con **confianza por campo** → **pre-llena** los campos mapeados del formulario → el activista **confirma/corrige** (nunca autoritativo; los campos quedan editables y marcados "OCR — verifica").
- Mapeo OCR→campos por convención de `key` (nombre/curp/clave/seccion/domicilio); si el form no tiene ese campo, se ignora.
- **Alternativa documentada:** OCR server-side self-hosted (mayor precisión, pero binario + la foto viaja al backend) — decisión abierta para revisión.

---

## 7. Compliance y seguridad

- **PII cifrada (Fernet):** contacto del ciudadano (`contacto_enc`) y campos `sensible` de las respuestas (`answers_enc`); solo `*_masked` en listas; claro solo en reveal auditado (COORDINADOR+).
- **Evidencia:** bucket privado, presigned GET de vida corta, cada revelación audita.
- **Consentimiento** en captura (reusa `PrivacyNotice`/`PrivacyAcceptance`, ya generalizado para no-registros en [[registro-militantes]] — extender a `Caso`/`FormResponse`).
- **Canal público — anti-abuso (REQUISITO antes de exponer, no en v1):** honeypot + rate-limit por IP (slowapi ya instalado) + validación estricta + moderación (casos públicos `SIN_VERIFICAR` hasta revisión humana). El canal nace tras `PUBLIC_FORMS_ENABLED=false`; no se expone hasta implementar esto.
- **Auditoría:** create/estado/reasignación/evento/reveal → `audit_log`.
- **ARCO/retención:** purga de `Caso`/`FormResponse` borra su evidencia del bucket.

---

## 8. Testing

**Backend (pytest, SQLite):** validación de schema JSON; mapeo respuesta→caso; auto-ruteo territorial (responsable correcto por sección; fallback); ciclo de vida + bitácora; folio único (max-suffix+retry); scope rol∩territorio; PII cifrada nunca en list; canal público crea SIN_VERIFICAR; storage mockeado.

**Frontend (build + vitest):** renderer dinámico (requerido + lógica condicional mostrar_si); builder serializa/deserializa schema; OCR con mock (pre-llena + editable); CountdownElectoral (días/horas a una fecha dada; estado sin-fecha).

---

## 9. Entregables (para el plan, por capas)

1. Modelos (`FormDefinition`, `FormResponse`, `Caso`, `CasoEvento`) + `Campaign.fecha_eleccion` + migración 0016.
2. Schemas + validador de schema JSON de formularios.
3. `form_service` + router `/api/forms`.
4. `response_service` + router `/api/responses` (+ cifrado de campos sensibles).
5. `caso_service` (folio, auto-ruteo, ciclo de vida, bitácora, panorama) + router `/api/casos`.
6. Canal público (`/api/public`, tras flag) — sin anti-abuso (documentado).
7. Retención extendida a casos/respuestas.
8. Frontend: constructor de formularios.
9. Frontend: renderer dinámico + captura + **OCR on-device**.
10. Frontend: bandeja de casos + detalle/bitácora + tablero de Lucy.
11. Frontend: **CountdownElectoral** en DashboardPage + edición de `fecha_eleccion` en campaña.
12. Canal público frontend (`/p/{slug}`, tras flag).
13. Registro en `registry.ts` + pase de frontend-design.
14. Tests backend + build/tests frontend.
