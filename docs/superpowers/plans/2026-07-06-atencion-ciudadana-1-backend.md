# Atención Ciudadana — Plan 1: Backend Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend foundation for Atención Ciudadana — form definitions (JSON schema), responses (with encrypted sensitive answers + evidence), and cases (auto-routed by territory, with lifecycle + bitácora), plus the public intake channel behind a flag.

**Architecture:** New SQLAlchemy models (`FormDefinition`, `FormResponse`, `Caso`, `CasoEvento`) mirroring the militantes spine (Fernet PII, bucket evidence via `core/storage.py`, role+territory scoping, audit). A form-schema validator validates `answers` against a `FormDefinition.schema`. A response opens a `Caso` via a fixed key-convention mapping; the case auto-routes to the responsible user by section. Services + `/api/{forms,responses,casos,public}` routers follow the existing `militante_service`/`promovido_service` patterns.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Fernet, boto3 (existing `core/storage.py`), pytest (SQLite).

## Global Constraints

- Estados/tipos/canales stored as uppercase **String**, never PG enums. No `ALTER TYPE`.
- Every business query filters by `organization_id` (JWT) + `campaign_id` via `scoped_query(Model, ctx)`. Writes take org/campaign/actor from `ctx`, never request input.
- Endpoints return Pydantic schemas; error envelope `{"error":{"message","status"}}`; pagination `{items,total,limit,offset}`.
- Sensitive PII (citizen contacto, form fields marked `sensible`): Fernet-encrypted, `*_masked`/`*_enc`, never in list endpoints or logs; cleartext only in an audited reveal (COORDINADOR+).
- Every sensitive op emits `audit_log` via `record_audit(db, action=..., actor_id=..., organization_id=..., entity_type=..., entity_id=...)`.
- Migration idempotent (`_table_exists`/`_index_exists`/`_column_exists` guards). `down_revision = "0015_militantes"`.
- Tests run on SQLite; `storage.put_object`/`delete_object`/`presigned_get` are monkeypatched in tests (never hit the network). boto3 stays lazy-imported (already is).
- Public channel behind `settings.PUBLIC_FORMS_ENABLED` (default False). Anti-abuse is NOT implemented in v1 (documented deferral).
- Reference patterns to copy: `backend/app/services/militante_service.py` (scoping, folio max-suffix+retry, Fernet, audit), `backend/app/services/promovido_service.py` (territory gate), `backend/app/routers/militantes.py` (router shape), `backend/app/models/militante.py` (model shape).

---

## Task 1: Models + migration 0016

**Files:**
- Create: `backend/app/models/atencion.py` (all four models in one cohesive file)
- Modify: `backend/app/models/__init__.py` (import the four models)
- Modify: `backend/tests/conftest.py` (add the four `__table__` to `create_all`)
- Create: `backend/alembic/versions/0016_atencion.py`
- Test: `backend/tests/test_atencion_model.py`

**Interfaces:**
- Produces: `FormDefinition` (table `form_definitions`), `FormResponse` (`form_responses`), `Caso` (`casos`), `CasoEvento` (`caso_eventos`).

- [ ] **Step 1: Write the failing test** `backend/tests/test_atencion_model.py`:

```python
from app.models.atencion import FormDefinition, FormResponse, Caso, CasoEvento
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal
from app.models.organization import Organization
from sqlalchemy import select


def test_atencion_models_persist():
    db = TestingSessionLocal()
    org_id = db.execute(select(Organization.id).where(Organization.slug == "alpha")).scalar_one()
    fd = FormDefinition(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID,
                        nombre="Petición vecinal", tipo="PETICION", slug="peticion-vecinal",
                        canal="AMBOS", is_active=True, version=1,
                        schema={"secciones": []})
    db.add(fd); db.commit(); db.refresh(fd)
    caso = Caso(organization_id=org_id, campaign_id=ALPHA_CAMPAIGN_ID, folio="AC-2026-00001",
                tipo="PETICION", titulo="Bache", descripcion="Bache en la esquina",
                estado="PENDIENTE", prioridad="MEDIA", channel="INTERNO")
    db.add(caso); db.commit(); db.refresh(caso)
    ev = CasoEvento(caso_id=caso.id, tipo="NOTA", texto="Recibido", actor_id=None)
    db.add(ev); db.commit()
    assert fd.id and caso.estado == "PENDIENTE" and ev.id
    db.close()
```

- [ ] **Step 2: Run — expect FAIL** (`ModuleNotFoundError`). `cd backend && python3 -m pytest tests/test_atencion_model.py -v`

- [ ] **Step 3: Implement** `backend/app/models/atencion.py`:

```python
"""Atención Ciudadana — form definitions, responses, and cases."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Index, Integer, JSON, LargeBinary,
    String, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, CampaignMixin, TenantMixin, UUIDMixin


class FormDefinition(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "form_definitions"
    __table_args__ = (
        Index("ix_form_definitions_campaign_active", "campaign_id", "is_active"),
        UniqueConstraint("campaign_id", "slug", name="uq_form_definitions_campaign_slug"),
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="PETICION")
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    canal: Mapped[str] = mapped_column(String(20), nullable=False, default="INTERNO")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    schema: Mapped[dict] = mapped_column(JSON, nullable=False)


class FormResponse(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "form_responses"
    __table_args__ = (
        Index("ix_form_responses_campaign_def", "campaign_id", "form_definition_id"),
    )
    form_definition_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("form_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    answers: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    answers_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="INTERNO")
    captured_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    nombre_emisor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contacto_masked: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    seccion: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    evidencia_keys: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    moderacion: Mapped[str] = mapped_column(String(20), nullable=False, default="VERIFICADO")
    caso_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    client_uuid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class Caso(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "casos"
    __table_args__ = (
        Index("ix_casos_campaign_estado", "campaign_id", "estado"),
        Index("ix_casos_campaign_asignado", "campaign_id", "asignado_a"),
        Index("ix_casos_campaign_seccion", "campaign_id", "seccion"),
        UniqueConstraint("campaign_id", "folio", name="uq_casos_campaign_folio"),
    )
    folio: Mapped[str] = mapped_column(String(40), nullable=False)
    origin_response_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="PETICION")
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    ciudadano_nombre: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contacto_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    contacto_masked: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    seccion: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    colonia: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    area_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True)
    asignado_a: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDIENTE")
    prioridad: Mapped[str] = mapped_column(String(10), nullable=False, default="MEDIA")
    fecha_compromiso: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="INTERNO")
    moderacion: Mapped[str] = mapped_column(String(20), nullable=False, default="VERIFICADO")


class CasoEvento(UUIDMixin, TenantMixin, AuditMixin, Base):
    __tablename__ = "caso_eventos"
    __table_args__ = (Index("ix_caso_eventos_caso", "caso_id", "created_at"),)
    caso_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("casos.id", ondelete="CASCADE"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    texto: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    evidencia_key: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    estado_nuevo: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    actor_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
```

> `CasoEvento` uses `TenantMixin` (organization_id) for tenant safety but no CampaignMixin — it hangs off the caso. Set `organization_id` from the caso when creating events.

- [ ] **Step 4: Register models.** In `backend/app/models/__init__.py` add `from app.models.atencion import FormDefinition, FormResponse, Caso, CasoEvento` (+ `__all__` if present).

- [ ] **Step 5: conftest tables.** In `backend/tests/conftest.py`, import the four models and add `FormDefinition.__table__, FormResponse.__table__, Caso.__table__, CasoEvento.__table__` to the `Base.metadata.create_all(..., tables=[...])` list (mirror how `Militante.__table__` was added).

- [ ] **Step 6: Migration** `backend/alembic/versions/0016_atencion.py` — `revision = "0016_atencion"`, `down_revision = "0015_militantes"`. Use the idempotent guard helpers (`_insp`/`_table_exists`/`_index_exists` — copy from `0015_militantes.py`) and `op.create_table` for the four tables with columns matching the models exactly (String estados, JSON columns, LargeBinary for `answers_enc`/`contacto_enc`, all indexes + unique constraints). Guard each `create_table`/`create_index` with `if not _table_exists(...)`/`if not _index_exists(...)`. `downgrade()` drops the four tables (reverse FK order: caso_eventos, casos, form_responses, form_definitions).

> Copy the AuditMixin columns (created_at/updated_at/deleted_at/created_by/updated_by) into each `create_table` exactly as `0015_militantes.py` does for `militantes`.

- [ ] **Step 7: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_atencion_model.py -v`

- [ ] **Step 8: Full suite.** `cd backend && python3 -m pytest -q` (baseline 344 → +1; no regressions).

- [ ] **Step 9: Commit.**

```bash
git add backend/app/models/atencion.py backend/app/models/__init__.py backend/tests/conftest.py backend/alembic/versions/0016_atencion.py backend/tests/test_atencion_model.py
git commit -m "feat(atencion): models (FormDefinition/FormResponse/Caso/CasoEvento) + migration 0016"
```

---

## Task 2: Form schema validator + Pydantic schemas

**Files:**
- Create: `backend/app/services/form_schema.py` (validator — pure functions, no DB)
- Create: `backend/app/schemas/atencion.py`
- Test: `backend/tests/test_form_schema.py`

**Interfaces:**
- Produces: `form_schema.FIELD_TYPES` (set), `form_schema.validate_schema(schema: dict) -> None` (raises `SchemaInvalid`), `form_schema.validate_answers(schema: dict, answers: dict) -> dict` (returns normalized answers; raises `AnswersInvalid`), `form_schema.split_sensitive(schema, answers) -> tuple[dict, dict]` (public answers, sensitive answers). Schemas: `FormDefinitionCreate/Read/List`, `FormResponseCreate/Read`, `CasoRead/List/EstadoUpdate/AsignarUpdate`, `CasoEventoCreate/Read`, `CasoPanorama`.

- [ ] **Step 1: Write the failing test** `backend/tests/test_form_schema.py`:

```python
import pytest
from app.services import form_schema as fs


SCHEMA = {"secciones": [{"titulo": "Datos", "campos": [
    {"key": "nombre", "tipo": "text", "label": "Nombre", "requerido": True},
    {"key": "tel", "tipo": "phone", "label": "Tel", "sensible": True},
    {"key": "seccion", "tipo": "seccion", "label": "Sección"},
]}]}


def test_validate_schema_ok():
    fs.validate_schema(SCHEMA)  # no raise


def test_validate_schema_rejects_bad_type():
    bad = {"secciones": [{"titulo": "x", "campos": [{"key": "a", "tipo": "nope", "label": "A"}]}]}
    with pytest.raises(fs.SchemaInvalid):
        fs.validate_schema(bad)


def test_validate_answers_requires_required():
    with pytest.raises(fs.AnswersInvalid):
        fs.validate_answers(SCHEMA, {"tel": "555"})  # missing required nombre


def test_split_sensitive():
    pub, sens = fs.split_sensitive(SCHEMA, {"nombre": "Ana", "tel": "5551234567"})
    assert pub == {"nombre": "Ana"} and sens == {"tel": "5551234567"}
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `backend/app/services/form_schema.py`:

```python
"""Form definition/answers validation (pure, no DB). JSON-schema-driven forms."""
from __future__ import annotations

FIELD_TYPES = {"text", "textarea", "number", "date", "select", "multiselect",
               "boolean", "phone", "email", "seccion", "foto"}


class SchemaInvalid(Exception):
    ...


class AnswersInvalid(Exception):
    ...


def _fields(schema: dict):
    for sec in schema.get("secciones", []):
        for f in sec.get("campos", []):
            yield f


def validate_schema(schema: dict) -> None:
    if not isinstance(schema, dict) or "secciones" not in schema:
        raise SchemaInvalid("schema must have 'secciones'")
    keys = set()
    for f in _fields(schema):
        if not f.get("key") or not f.get("tipo") or not f.get("label"):
            raise SchemaInvalid("each field needs key/tipo/label")
        if f["tipo"] not in FIELD_TYPES:
            raise SchemaInvalid(f"unknown field type: {f['tipo']}")
        if f["key"] in keys:
            raise SchemaInvalid(f"duplicate key: {f['key']}")
        keys.add(f["key"])
        if f["tipo"] in ("select", "multiselect") and not f.get("opciones"):
            raise SchemaInvalid(f"{f['key']} needs opciones")


def _visible(schema: dict, answers: dict, field: dict) -> bool:
    cond = field.get("mostrar_si")
    if not cond:
        return True
    return answers.get(cond.get("campo")) == cond.get("igual")


def validate_answers(schema: dict, answers: dict) -> dict:
    validate_schema(schema)
    out = {}
    for f in _fields(schema):
        key = f["key"]
        if not _visible(schema, answers, f):
            continue
        val = answers.get(key)
        if f.get("requerido") and (val is None or val == "" or val == []):
            raise AnswersInvalid(f"campo requerido: {key}")
        if val is not None:
            out[key] = val
    return out


def split_sensitive(schema: dict, answers: dict) -> tuple[dict, dict]:
    sensitive_keys = {f["key"] for f in _fields(schema) if f.get("sensible")}
    pub = {k: v for k, v in answers.items() if k not in sensitive_keys}
    sens = {k: v for k, v in answers.items() if k in sensitive_keys}
    return pub, sens
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Implement schemas** `backend/app/schemas/atencion.py` — Pydantic models for the API (mirror `schemas/militante.py` style):
  - `FormDefinitionCreate` (nombre, descripcion?, tipo, slug, canal, schema: dict, is_active=True), `FormDefinitionRead` (+id, version, created_at), `FormDefinitionList`.
  - `FormResponseCreate` (form_definition_id, answers: dict, nombre_emisor?, contacto?, seccion?, evidencia_keys?: list[str], client_uuid?), `FormResponseRead` (id, caso_id, moderacion, created_at).
  - `CasoRead` (id, folio, tipo, titulo, descripcion?, ciudadano_nombre?, contacto_masked?, seccion?, colonia?, estado, prioridad, fecha_compromiso?, asignado_a?, asignado_nombre?, channel, moderacion, created_at), `CasoList` (+has_territory), `CasoEstadoUpdate` (estado: pattern PENDIENTE|EN_PROCESO|ATENDIDO|CERRADO, nota?), `CasoAsignarUpdate` (asignado_a: str, nota?).
  - `CasoEventoCreate` (tipo: NOTA|EVIDENCIA, texto?, evidencia_key?), `CasoEventoRead`.
  - `CasoPanorama` (kpis {total, pendientes, en_proceso, atendidos, cerrados, sla_vencidos, tiempo_prom_dias}, por_estado, por_colonia: list, por_responsable: list).

- [ ] **Step 6: Commit.**

```bash
git add backend/app/services/form_schema.py backend/app/schemas/atencion.py backend/tests/test_form_schema.py
git commit -m "feat(atencion): form schema validator + pydantic schemas"
```

---

## Task 3: form_service + /api/forms router

**Files:**
- Create: `backend/app/services/form_service.py`
- Create: `backend/app/routers/forms.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_forms_api.py`

**Interfaces:**
- Consumes: `form_schema.validate_schema`, `scoped_query`, `record_audit`.
- Produces: `form_service.create_form/list_forms/get_form/update_form/get_by_slug`; routes `GET/POST /forms`, `GET/PATCH /forms/{id}`, `GET /forms/slug/{slug}`.

- [ ] **Step 1: Write the failing API test** `backend/tests/test_forms_api.py` (reuse `client` + `auth_headers` + `_hdr` helper pattern from `tests/test_militantes_api.py`):

```python
from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers

def _hdr(client, email, cid=ALPHA_CAMPAIGN_ID):
    h = auth_headers(client, email); h["X-Campaign-Id"] = cid; return h

def test_create_and_list_form(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json={
        "nombre": "Petición", "tipo": "PETICION", "slug": "peticion",
        "canal": "AMBOS", "schema": {"secciones": [{"titulo": "D", "campos": [
            {"key": "nombre", "tipo": "text", "label": "Nombre", "requerido": True}]}]}})
    assert r.status_code == 201, r.text
    assert client.get("/api/forms", headers=h).json()["total"] >= 1

def test_reject_bad_schema(client):
    h = _hdr(client, "coord@alpha.gov")
    r = client.post("/api/forms", headers=h, json={
        "nombre": "X", "tipo": "PETICION", "slug": "x", "canal": "INTERNO",
        "schema": {"secciones": [{"titulo": "d", "campos": [
            {"key": "a", "tipo": "BADTYPE", "label": "A"}]}]}})
    assert r.status_code == 422
```

- [ ] **Step 2: Run — expect FAIL** (404).

- [ ] **Step 3: Implement** `form_service.py` (validate schema on create/update; scoped by campaign; audit `form.create`/`form.update`; `get_by_slug` returns active form for the campaign) and `routers/forms.py` (gate `require_roles(COORDINADOR, ADMIN)` for write; read list gate same; `GET /forms/slug/{slug}` gate capture-tier). Raise `HTTPException(422)` on `SchemaInvalid`. Mirror `routers/militantes.py` structure. Include the router in `main.py` with the `/api` prefix.

- [ ] **Step 4: Run — expect PASS.** Then `python3 -m pytest -q`.

- [ ] **Step 5: Commit.**

```bash
git add backend/app/services/form_service.py backend/app/routers/forms.py backend/app/main.py backend/tests/test_forms_api.py
git commit -m "feat(atencion): form_service + /api/forms (builder CRUD, schema-validated)"
```

---

## Task 4: caso_service (folio, auto-routing, lifecycle, bitácora, panorama)

**Files:**
- Create: `backend/app/services/caso_service.py`
- Test: `backend/tests/test_casos.py`

**Interfaces:**
- Consumes: `crypto`, `storage`, `territory_service`, `scoped_query`, `record_audit`, `Caso`, `CasoEvento`.
- Produces: `caso_service.crear_directo(db, ctx, data) -> Caso`; `crear_desde_respuesta(db, ctx, response, form) -> Caso`; `_resolve_responsable(db, ctx, seccion) -> str|None`; `_caso_role_scoped`/`_territory_gated` (mirror militantes); `list_casos`, `get_caso`, `set_estado`, `asignar`, `add_evento`, `panorama`; `_next_folio` (max-suffix+retry, prefix `AC-<year>-`). `SLA_DIAS = {"PETICION": 7, "QUEJA": 5, "APOYO": 10, "OTRO": 7}`.

- [ ] **Step 1: Write the failing test** `backend/tests/test_casos.py`:

```python
from app.services import caso_service
from tests.conftest import ALPHA_CAMPAIGN_ID, TestingSessionLocal


def test_crear_directo_autorouting_and_folio(coordinador_ctx, db_session):
    # coordinador_ctx (from militantes fixtures) has area_id covering seccion 4127
    data = {"tipo": "PETICION", "titulo": "Bache", "descripcion": "esquina",
            "seccion": "4127", "colonia": "Centro"}
    caso = caso_service.crear_directo(db_session, coordinador_ctx, data)
    assert caso.folio.startswith("AC-")
    assert caso.estado == "PENDIENTE"
    assert caso.fecha_compromiso is not None
```

> Reuse `coordinador_ctx`/`db_session` fixtures added by the militantes work in `conftest.py`. `_resolve_responsable` finds a user whose `area_id` resolves (via `territory_service.scope_secciones`) to a set containing `seccion`; assert the routing target is that coordinator (whose territory is 4127) OR None (fallback) — adapt the assertion to the fixture's actual users.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `caso_service.py`. Key novel logic (rest mirrors `militante_service.py`):

```python
SLA_DIAS = {"PETICION": 7, "QUEJA": 5, "APOYO": 10, "OTRO": 7}


def _resolve_responsable(db, ctx, seccion):
    """User whose assigned territory covers `seccion`. Fallback None (coordinator queue)."""
    if not seccion:
        return None
    from app.models.user import User
    from app.services import territory_service
    # candidate assignees in this org with an area_id
    users = db.execute(
        select(User).where(User.organization_id == ctx.organization_id,
                           User.area_id.isnot(None), User.deleted_at.is_(None))
    ).scalars().all()
    for u in users:
        if seccion in territory_service.scope_secciones(db, u):
            return u.id
    return None
```

- `crear_directo(db, ctx, data)`: folio via `_next_folio` (max-suffix+retry with savepoint, copy from militantes), encrypt `contacto` if present, `asignado_a = _resolve_responsable(...)`, `fecha_compromiso = date.today() + timedelta(days=SLA_DIAS[tipo])`, `estado="PENDIENTE"`, audit `caso.create`, write an initial `CasoEvento(tipo="CAMBIO_ESTADO", estado_nuevo="PENDIENTE")`.
- `crear_desde_respuesta(db, ctx, response, form)`: build `data` from the response using the **key-convention mapping** (nombre→ciudadano_nombre, contacto/tel/email→contacto, seccion→seccion, colonia→colonia, descripcion→descripcion; titulo = answers['titulo'] or descripcion[:60]; tipo = form.tipo; channel = response.channel; moderacion = response.moderacion), call `crear_directo`, set `caso.origin_response_id`, link `response.caso_id`.
- `_caso_role_scoped` + `_territory_gated`: copy the militantes pattern (activista=own via `created_by`/`asignado_a`; coord/lider=territory-gated by `Caso.seccion`; admin=campaign; SA=all). For casos, "own" = `or_(Caso.asignado_a == user.id, Caso.created_by == user.id)`.
- `list_casos` (filters estado/colonia/asignado/tipo/q, territory gate, enrich `asignado_nombre`), `get_caso`, `set_estado` (audit + CasoEvento CAMBIO_ESTADO), `asignar` (audit + REASIGNACION), `add_evento` (NOTA/EVIDENCIA; if evidence bytes, `storage.put_object` key `casos/{campaign}/{caso}/ev-{n}.jpg`), `panorama` (kpis by estado, sla_vencidos = fecha_compromiso < today and estado not in (ATENDIDO,CERRADO), tiempo_prom, por_colonia, por_responsable).

- [ ] **Step 4: Run — expect PASS.** Then `python3 -m pytest -q`.

- [ ] **Step 5: Commit.**

```bash
git add backend/app/services/caso_service.py backend/tests/test_casos.py
git commit -m "feat(atencion): caso_service — folio, territorial auto-routing, lifecycle, bitácora, panorama"
```

---

## Task 5: response_service + /api/responses + /api/casos routers

**Files:**
- Create: `backend/app/services/response_service.py`
- Create: `backend/app/routers/responses.py`
- Create: `backend/app/routers/casos.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_casos_api.py`

**Interfaces:**
- Consumes: `form_service`, `form_schema`, `caso_service`, `crypto`, `storage`.
- Produces: `response_service.crear_response(db, ctx, data, *, channel, captured_by) -> FormResponse` (validates answers vs schema, encrypts sensitive answers into `answers_enc`, opens a Caso); routes `POST /responses`; `GET/PATCH /casos...`, `POST /casos/{id}/eventos`, `GET /casos/panorama`.

- [ ] **Step 1: Write the failing API test** `backend/tests/test_casos_api.py`:

```python
from tests.conftest import ALPHA_CAMPAIGN_ID, auth_headers
def _hdr(client, email, cid=ALPHA_CAMPAIGN_ID):
    h = auth_headers(client, email); h["X-Campaign-Id"] = cid; return h

def test_response_opens_caso(client):
    h = _hdr(client, "coord@alpha.gov")
    f = client.post("/api/forms", headers=h, json={
        "nombre": "Pet", "tipo": "PETICION", "slug": "pet", "canal": "INTERNO",
        "schema": {"secciones": [{"titulo": "D", "campos": [
            {"key": "nombre", "tipo": "text", "label": "N", "requerido": True},
            {"key": "descripcion", "tipo": "textarea", "label": "Desc"},
            {"key": "seccion", "tipo": "seccion", "label": "Secc"}]}]}}).json()
    r = client.post("/api/responses", headers=h, json={
        "form_definition_id": f["id"],
        "answers": {"nombre": "Ana", "descripcion": "bache", "seccion": "4127"}})
    assert r.status_code == 201, r.text
    assert r.json()["caso_id"]
    casos = client.get("/api/casos", headers=h)
    assert casos.status_code == 200 and casos.json()["total"] >= 1
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `response_service.crear_response` (load form, `form_schema.validate_answers`, `split_sensitive` → encrypt the sensitive dict as JSON via `crypto.encrypt_clave(json.dumps(sens))` into `answers_enc`, store public in `answers`, mask `contacto`, `storage`-upload any evidence already provided as keys, then `caso_service.crear_desde_respuesta`), the two routers (mirror `militantes.py`; `/casos` gates: read/create=capture tier, estado/asignar/panorama=review tier), and wire both in `main.py`.

- [ ] **Step 4: Run — expect PASS.** Then `python3 -m pytest -q`.

- [ ] **Step 5: Commit.**

```bash
git add backend/app/services/response_service.py backend/app/routers/responses.py backend/app/routers/casos.py backend/app/main.py backend/tests/test_casos_api.py
git commit -m "feat(atencion): response_service + /api/responses + /api/casos routers"
```

---

## Task 6: Public intake channel (behind flag) + retention

**Files:**
- Modify: `backend/app/core/config.py` (`PUBLIC_FORMS_ENABLED: bool = False`)
- Create: `backend/app/routers/public_forms.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/services/retention_service.py`
- Test: `backend/tests/test_public_forms.py`, `backend/tests/test_retention_atencion.py`

**Interfaces:**
- Produces: `GET /api/public/forms/{slug}` + `POST /api/public/forms/{slug}/responses` (no auth dep; require a campaign resolvable from the slug — the form carries campaign_id/org_id); retention purge deletes `Caso`/`FormResponse` bucket objects.

- [ ] **Step 1: Write the failing test** `backend/tests/test_public_forms.py` — with `PUBLIC_FORMS_ENABLED` monkeypatched True, `GET /api/public/forms/{slug}` returns the schema (no PII), and `POST` creates a `FormResponse(channel=PUBLICO, moderacion=SIN_VERIFICAR)` + a `Caso`. With the flag False, both return 404.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** the public router (no `CampaignCtx`/auth; resolve `FormDefinition` by slug across tenants → derive org/campaign from it; build a minimal context object for `caso_service`; set `moderacion="SIN_VERIFICAR"`; guard every route with `if not settings.PUBLIC_FORMS_ENABLED: raise HTTPException(404)`). Add a one-paragraph docstring: **anti-abuse (honeypot + slowapi rate-limit) is REQUIRED before enabling this flag in production** (documented deferral). Extend `retention_service` to purge `Caso`/`FormResponse` + their bucket objects (mirror the militante purge added earlier; guard with `storage.storage_enabled()`).

- [ ] **Step 4: Run — expect PASS.** Then `python3 -m pytest -q`.

- [ ] **Step 5: Commit.**

```bash
git add backend/app/core/config.py backend/app/routers/public_forms.py backend/app/main.py backend/app/services/retention_service.py backend/tests/test_public_forms.py backend/tests/test_retention_atencion.py
git commit -m "feat(atencion): public intake channel (flagged, anti-abuse deferred) + retention purge"
```

---

## Self-Review notes (author)

- **Spec coverage (backend):** models+migration (T1), schema validator (T2), forms CRUD (T3), casos service w/ auto-routing+SLA+bitácora+panorama (T4), response→caso mapping + routers (T5), public channel flagged + retention (T6). Countdown reuses existing `Contest.election_date` — **no backend change needed** beyond exposing it (handled in the frontend plan / a small panorama field). Frontend (builder, renderer, OCR, casos UI, tablero, countdown, public UI) = **Plan 2+** (authored after this lands).
- **Type consistency:** estados `PENDIENTE|EN_PROCESO|ATENDIDO|CERRADO`; tipos `PETICION|QUEJA|APOYO|OTRO`; canales `INTERNO|PUBLICO|AMBOS`; moderacion `VERIFICADO|SIN_VERIFICAR` — used identically across models, schemas, services. Folio `AC-<year>-<n:05d>`.
- **Deferred/flagged:** `down_revision="0015_militantes"` (confirmed against repo). Public anti-abuse documented, not built. Sensitive-answer encryption uses `crypto.encrypt_clave` on `json.dumps(sensitive)`.
- **Reused fixtures:** `coordinador_ctx`/`db_session`/`activista_ctx` from the militantes conftest additions; API tests reuse `client`+`auth_headers`+`_hdr`.
