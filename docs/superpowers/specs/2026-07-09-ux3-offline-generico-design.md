# UX-3 — Offline genérico en campo (Diseño)

**Fecha:** 2026-07-09
**Estado:** Aprobado (alcance completo) — pendiente de plan.
**Contexto:** Fase 3 del programa de mejora UI/UX de Lucy (ver
`[[ux-mejora-lucy]]`). La auditoría encontró que la captura en campo se
**bloquea sin señal** en Afiliar militante y Atender ciudadano, y que Captura
rápida ni siquiera usa la cola offline existente. Alcance elegido por el
usuario: **cola genérica multi-entidad** que encole registro + militante +
respuesta de atención (JSON) offline, con las **fotos** subidas al reconectar.

## 1. Estado actual

`frontend/src/offline/` es una cola sólida pero **específica de registros**:
- `db.ts` — IndexedDB `agora-offline` v1, store `registro_queue` (keyPath
  `client_uuid`), índices por status/created_at.
- `queue.ts` — `enqueue(RegistroCreate, campaign_id)`, `listQueue`,
  `markStatus`, `removeQueued`, `countPending`, `countFailed`.
- `sync.ts` — `drainQueue({create})`: FIFO, idempotente por `client_uuid`,
  clasifica error de red (reintentable) vs 4xx permanente, recupera filas
  `syncing` colgadas de un crash.
- Solo la usa `CapturaPage.tsx` (patrón: `online → try create; catch red →
  enqueue` / `offline → enqueue`). `pendingSyncStore` cuenta pendientes y
  llama `drainQueue`.

**Idempotencia backend (verificado):** `registro` y `militante` deduplican por
`client_uuid` (devuelven el existente). **`response` NO** → hay que añadirlo.

## 2. Diseño de la cola genérica

### Modelo (`offline/types.ts`)

```ts
export type SyncStatus = "queued" | "syncing" | "synced" | "error" | "failed";
export type JobKind = "registro" | "militante" | "response";

export interface QueuedBlob {
  slot: string;          // p.ej. "frente" | "reverso" | "firma" | "evidencia"
  mime: string;
  filename: string;
  data: Blob;            // IndexedDB almacena Blobs de forma nativa
}

export interface QueuedJob {
  client_uuid: string;   // keyPath + clave de idempotencia
  kind: JobKind;
  campaign_id: string;
  payload: Record<string, unknown>;   // el body JSON del create
  blobs: QueuedBlob[];   // vacío para registro; fotos para militante/response
  status: SyncStatus;
  created_at: number;
  attempts: number;
  last_error: string | null;
  server_id: string | null;  // id devuelto por el create; usado para subir blobs
}
```

### Almacenamiento (`offline/db.ts`)

- Bump a **v2**, nuevo store `job_queue` (keyPath `client_uuid`, índices
  `by_status`/`by_created_at`). En `upgrade` de v1→v2: **migrar** cada fila de
  `registro_queue` a `job_queue` como `kind:"registro"` (payload = su
  `payload`, `blobs:[]`) y luego borrar `registro_queue`. Idempotente/segura.

### Cola (`offline/queue.ts`)

- `enqueueJob(kind, payload, campaign_id, blobs=[]) → QueuedJob` (stampa
  `client_uuid` en el job y dentro del payload si el kind lo usa).
- `listQueue`, `markStatus`, `removeQueued`, `countPending`, `countFailed`
  generalizados sobre `job_queue`.
- Mantener `enqueue(payload, campaign_id)` como wrapper delgado sobre
  `enqueueJob("registro", ...)` para no romper `CapturaPage` (o migrar
  `CapturaPage` en la misma fase).

### Drenado (`offline/sync.ts`)

- `drainQueue(deps?)`: por cada job (FIFO, status queued/error), despachar por
  `kind` a su **handler**, que (1) crea el registro/militante/respuesta con el
  payload (idempotente por `client_uuid`), guarda `server_id`, y (2) sube cada
  blob al recurso creado. Handlers **inyectables** (para tests):

```ts
export interface DrainDeps {
  handlers?: Partial<Record<JobKind, JobHandler>>;
}
// JobHandler: (job) => Promise<void>  — crea + sube blobs; lanza en error de red
```

  Handlers por defecto:
  - `registro` → `createRegistro(payload)` (sin blobs).
  - `militante` → `createMilitante(payload)` → por cada blob
    `uploadDocumento(server_id, blob.slot as "frente"|"reverso"|"firma", blob.data)`.
  - `response` → `submitResponse(payload)` → subir evidencia (si aplica, según
    el endpoint de evidencia existente).
- **Idempotencia + reintentos:** conservar la lógica actual (client_uuid,
  red→error reintentable, 4xx→failed, recuperación de `syncing`). Una foto que
  falla al subir tras un create exitoso: reintentar solo la subida en el
  siguiente drain (no re-crear — el create ya es idempotente y devuelve el
  mismo `server_id`); marcar el job `error` hasta que todas las fotos suban,
  luego `synced`/remove.

## 3. Backend — idempotencia de respuestas

- `response_service.create_response`: si `data.client_uuid` viene y existe una
  `FormResponse` con ese `client_uuid` en la campaña, **devolver la existente**
  en vez de crear otra (mirror de `militante_service`/`registro_service`).
  Evita respuestas/casos duplicados en el replay offline. + test.

## 4. Integraciones de captura (frontend)

Reemplazar el **bloqueo duro** ("Necesitas conexión") por el patrón
online-try→enqueue / offline→enqueue en las tres capturas, capturando los blobs
en el job:

- **`CapturaRapidaPage`** → `enqueueJob("registro", payload, campaign)` (sin
  blobs). Es el flujo de campo #1 y hoy no tiene offline.
- **`CapturaMilitantePage`** → al no haber señal (o error de red), encolar
  `militante` con el payload + las fotos capturadas (frente/reverso/firma) como
  `QueuedBlob`s; quitar el muro de "necesitas conexión". Nota: el flujo ya crea
  el militante y sube docs por separado — el handler replica eso al drenar.
- **`CapturaAtencionPage`** → encolar `response` con el payload + evidencia como
  blob; quitar el muro.

**UI offline-aware:** en las tres, el éxito offline muestra "Guardado sin
conexión — se sincronizará" en vez de un error; reusar `pendingSyncStore` para
el contador de pendientes y un indicador visible (badge) de "N por sincronizar".

## 5. Migraciones / limpieza

- Migrar `CapturaPage` y `pendingSyncStore` a la API generalizada (o mantener
  el wrapper `enqueue`). `queue.test.ts` y `sync.test.ts` se actualizan a jobs.

## 6. Riesgos & mitigaciones

- **Blobs grandes en IndexedDB:** las fotos de INE pueden pesar; limitar/comprimir
  antes de encolar (reusar cualquier compresión ya usada en la captura); documentar
  el límite. Cuota de IndexedDB es amplia pero no infinita.
- **Replay parcial (create ok, foto falla):** cubierto por idempotencia del
  create + reintento de solo-subida.
- **Respuestas duplicadas:** cubierto por §3 (dedup client_uuid).
- **Seguridad:** los blobs viven en IndexedDB del dispositivo (datos sensibles:
  INE/firma). Se borran al sincronizar. No es peor que el estado actual (la foto
  ya está en memoria del navegador); documentar que el borrado post-sync es
  obligatorio.

## 7. Testing

- Unit (vitest): `queue.test.ts` (enqueueJob por kind, migración v1→v2, counts),
  `sync.test.ts` (drain despacha por kind con handlers inyectados; blob upload
  tras create; reintento de solo-subida; failed en 4xx permanente).
- Backend (pytest): response create dedup por client_uuid.
- Build limpio + suites verdes.
