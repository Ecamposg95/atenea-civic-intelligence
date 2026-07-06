# Registro de Militantes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a formal party-member ("militante") affiliation entity with document capture (INE photos + signature) and a coordinator decision dashboard, on top of the existing activist-capture spine.

**Architecture:** New `Militante` SQLAlchemy model mirroring `Registro` (Fernet-encrypted CURP/clave, masked display values), with photos/signature stored in a private Railway Object Storage bucket (`agora-uploads`) served via short-lived presigned GETs. A role+territory-scoped service and `/api/militantes` router follow the `promovido_service`/`registro_service` patterns. Frontend adds a 3-step mobile capture wizard for the activist and a 4-block dashboard for Lucy.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Fernet (`cryptography`), **boto3 (new dep)** for S3-compatible storage, pytest (SQLite), React + TypeScript + Vite + Tailwind, axios.

## Global Constraints

- Enum-like `estado` is stored as an uppercase **String**, never a PG enum (`REGISTRADO`/`VALIDADO`/`OBSERVADO`). No `ALTER TYPE` anywhere.
- Every business query filters by `organization_id` (from JWT) + `campaign_id`. Use `scoped_query(Model, ctx)`.
- `organization_id`/`campaign_id`/`activista_id` on writes come from `ctx`, never request input.
- Endpoints return Pydantic schemas, never raw ORM. Error envelope `{"error":{"message","status"}}` via `HTTPException`.
- Pagination shape `{items, total, limit, offset}`.
- CURP and clave de elector: never logged, never in list endpoints, never in error responses. Only `*_masked` in lists/detail; cleartext only in the audited `reveal` flow.
- Every sensitive op emits an `audit_log` row via `record_audit(db, action=..., actor_id=..., organization_id=..., entity_type=..., entity_id=...)`.
- Migrations idempotent: guard every DDL with `_table_exists`/`_index_exists`/`_column_exists`. `down_revision = "0014"`.
- Tests run on SQLite in-memory (`conftest.py`); `FERNET_KEY` + `RATE_LIMIT_ENABLED=false` set there. `storage.py` must be mockable so tests never hit Railway.
- Frontend API clients use `apiClient` from `./client`, endpoints WITHOUT `/api` prefix.
- Bucket credentials env vars: `BUCKET_ENDPOINT`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_NAME`. Bucket `agora-uploads` already provisioned (id `0d05d048-b149-4dcf-9ead-57a358abb4a6`, region iad, private).

---

## Task 1: Storage client (`core/storage.py`) + config + boto3 dep

**Files:**
- Modify: `backend/requirements.txt` (add `boto3`)
- Modify: `backend/app/core/config.py` (add BUCKET_* settings)
- Create: `backend/app/core/storage.py`
- Test: `backend/tests/test_storage.py`

**Interfaces:**
- Produces: `storage.put_object(key: str, data: bytes, content_type: str) -> None`, `storage.presigned_get(key: str, ttl: int = 60) -> str`, `storage.delete_object(key: str) -> None`, `storage.ensure_storage_ready() -> None`, `storage.storage_enabled() -> bool`, `storage._client()` (lazy boto3 client, monkeypatchable).

- [ ] **Step 1: Add settings.** In `backend/app/core/config.py`, inside `class Settings`, after `FERNET_KEY`:

```python
    BUCKET_ENDPOINT: str = Field(default="")
    BUCKET_ACCESS_KEY_ID: str = Field(default="")
    BUCKET_SECRET_ACCESS_KEY: str = Field(default="")
    BUCKET_NAME: str = Field(default="")
    BUCKET_REGION: str = Field(default="us-east-1")
```

- [ ] **Step 2: Add dep.** Append to `backend/requirements.txt`:

```
boto3==1.35.99
```

Then `cd backend && pip install boto3==1.35.99` (if pip available; otherwise note for deploy).

- [ ] **Step 3: Write the failing test** `backend/tests/test_storage.py`:

```python
from unittest.mock import MagicMock
import app.core.storage as storage


def test_storage_disabled_when_unconfigured(monkeypatch):
    monkeypatch.setattr(storage.settings, "BUCKET_NAME", "")
    assert storage.storage_enabled() is False


def test_put_object_calls_boto(monkeypatch):
    fake = MagicMock()
    monkeypatch.setattr(storage, "_client", lambda: fake)
    monkeypatch.setattr(storage.settings, "BUCKET_NAME", "agora-uploads")
    storage.put_object("militantes/c/m/frente.jpg", b"xx", "image/jpeg")
    fake.put_object.assert_called_once()
    kwargs = fake.put_object.call_args.kwargs
    assert kwargs["Bucket"] == "agora-uploads"
    assert kwargs["Key"] == "militantes/c/m/frente.jpg"
    assert kwargs["Body"] == b"xx"


def test_presigned_get_returns_url(monkeypatch):
    fake = MagicMock()
    fake.generate_presigned_url.return_value = "https://signed"
    monkeypatch.setattr(storage, "_client", lambda: fake)
    monkeypatch.setattr(storage.settings, "BUCKET_NAME", "agora-uploads")
    assert storage.presigned_get("k") == "https://signed"
```

- [ ] **Step 4: Run — expect FAIL** (`ModuleNotFoundError: app.core.storage`).

Run: `cd backend && python3 -m pytest tests/test_storage.py -v`

- [ ] **Step 5: Implement** `backend/app/core/storage.py`:

```python
"""S3-compatible object storage (Railway bucket) for militante documents.

Private bucket: no public URLs. Files are uploaded server-side and served via
short-lived presigned GETs. Mirrors crypto.py's fail-fast philosophy but is
feature-gated: the app only requires it when the militantes feature is used.
"""
from __future__ import annotations

from functools import lru_cache

import boto3

from app.core.config import settings


def storage_enabled() -> bool:
    return bool(settings.BUCKET_NAME and settings.BUCKET_ENDPOINT
                and settings.BUCKET_ACCESS_KEY_ID and settings.BUCKET_SECRET_ACCESS_KEY)


@lru_cache(maxsize=1)
def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.BUCKET_ENDPOINT,
        aws_access_key_id=settings.BUCKET_ACCESS_KEY_ID,
        aws_secret_access_key=settings.BUCKET_SECRET_ACCESS_KEY,
        region_name=settings.BUCKET_REGION,
    )


def ensure_storage_ready() -> None:
    """Validate bucket config when the militantes feature needs it."""
    if not storage_enabled():
        raise RuntimeError(
            "Object storage is not configured. Set BUCKET_ENDPOINT, "
            "BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY, BUCKET_NAME."
        )


def put_object(key: str, data: bytes, content_type: str) -> None:
    _client().put_object(Bucket=settings.BUCKET_NAME, Key=key,
                         Body=data, ContentType=content_type)


def presigned_get(key: str, ttl: int = 60) -> str:
    return _client().generate_presigned_url(
        "get_object", Params={"Bucket": settings.BUCKET_NAME, "Key": key},
        ExpiresIn=ttl)


def delete_object(key: str) -> None:
    _client().delete_object(Bucket=settings.BUCKET_NAME, Key=key)
```

- [ ] **Step 6: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_storage.py -v`

- [ ] **Step 7: Commit.**

```bash
git add backend/requirements.txt backend/app/core/config.py backend/app/core/storage.py backend/tests/test_storage.py
git commit -m "feat(militantes): S3-compatible storage client for INE documents"
```

---

## Task 2: `Militante` model + `Campaign.meta_afiliacion` + migration 0015

**Files:**
- Create: `backend/app/models/militante.py`
- Modify: `backend/app/models/__init__.py` (import Militante)
- Modify: `backend/app/models/campaign.py` (add `meta_afiliacion`)
- Create: `backend/app/alembic/versions/0015_militantes.py`
- Test: `backend/tests/test_militante_model.py`

**Interfaces:**
- Produces: `Militante` ORM class (table `militantes`) with all columns from spec §2; `Campaign.meta_afiliacion: Mapped[int | None]`.

- [ ] **Step 1: Write the failing test** `backend/tests/test_militante_model.py`:

```python
from app.models.militante import Militante


def test_militante_defaults_and_columns(db_session, seed_org_campaign):
    org_id, campaign_id = seed_org_campaign
    m = Militante(
        organization_id=org_id, campaign_id=campaign_id,
        nombre_completo="Juan Pérez", folio="SMA-2027-00001",
        consentimiento=True,
    )
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    assert m.id
    assert m.estado == "REGISTRADO"
    assert m.es_activista is False
    assert m.quality_flags is None or isinstance(m.quality_flags, dict)
```

> If `seed_org_campaign` fixture does not exist, reuse the existing fixture the registro tests use (check `backend/tests/conftest.py` and `backend/tests/test_registros.py` for the org/campaign fixture name; use that instead).

- [ ] **Step 2: Run — expect FAIL** (`ModuleNotFoundError`).

Run: `cd backend && python3 -m pytest tests/test_militante_model.py -v`

- [ ] **Step 3: Implement model** `backend/app/models/militante.py`:

```python
"""Militante — formal party-member affiliation (encrypted PII + doc keys)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, JSON,
    LargeBinary, String, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, CampaignMixin, TenantMixin, UUIDMixin


class Militante(UUIDMixin, TenantMixin, CampaignMixin, AuditMixin, Base):
    __tablename__ = "militantes"
    __table_args__ = (
        Index("ix_militantes_campaign_activista", "campaign_id", "activista_id"),
        Index("ix_militantes_campaign_seccion", "campaign_id", "seccion"),
        Index("ix_militantes_campaign_estado", "campaign_id", "estado"),
        UniqueConstraint("campaign_id", "folio", name="uq_militantes_campaign_folio"),
        UniqueConstraint("campaign_id", "activista_id", "client_uuid",
                         name="uq_militantes_campaign_activista_client_uuid"),
    )

    activista_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    nombre_completo: Mapped[str] = mapped_column(String(255), nullable=False)
    sexo: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    fecha_nacimiento: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    seccion: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    telefono: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    calle_numero: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    colonia: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cp: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    municipio: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    estado_domicilio: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    es_activista: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    estructura: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    promotor: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)

    folio: Mapped[str] = mapped_column(String(40), nullable=False)
    folio_externo: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    fecha_afiliacion: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    curp_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    curp_masked: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    clave_elector_enc: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    clave_masked: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    credencial_frente_key: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    credencial_reverso_key: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    firma_key: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="REGISTRADO")
    validado_por: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    validado_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    observacion_validacion: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    quality_flags: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    consentimiento: Mapped[bool] = mapped_column(Boolean, nullable=False)
    consentimiento_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    aviso_version: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    manifestacion_voluntad: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    client_uuid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
```

> Note: the domicile "estado" column is named `estado_domicilio` to avoid clashing with the affiliation `estado` status column.

- [ ] **Step 4: Register model.** In `backend/app/models/__init__.py`, add `from app.models.militante import Militante` and include in `__all__` if present.

- [ ] **Step 5: Add Campaign column.** In `backend/app/models/campaign.py`, add to `class Campaign`:

```python
    meta_afiliacion: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
```

(Ensure `Integer` and `Optional` are imported.)

- [ ] **Step 6: Write migration** `backend/app/alembic/versions/0015_militantes.py`:

```python
"""0015 militantes + campaigns.meta_afiliacion

Revision ID: 0015_militantes
Revises: 0014
"""
from alembic import op
import sqlalchemy as sa

revision = "0015_militantes"
down_revision = "0014"
branch_labels = None
depends_on = None


def _insp():
    return sa.inspect(op.get_bind())


def _table_exists(name: str) -> bool:
    return name in _insp().get_table_names()


def _index_exists(table: str, name: str) -> bool:
    if not _table_exists(table):
        return False
    return any(ix["name"] == name for ix in _insp().get_indexes(table))


def _column_exists(table: str, col: str) -> bool:
    if not _table_exists(table):
        return False
    return any(c["name"] == col for c in _insp().get_columns(table))


def upgrade() -> None:
    if not _table_exists("militantes"):
        op.create_table(
            "militantes",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("campaign_id", sa.String(36), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("activista_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("nombre_completo", sa.String(255), nullable=False),
            sa.Column("sexo", sa.String(1), nullable=True),
            sa.Column("fecha_nacimiento", sa.Date(), nullable=True),
            sa.Column("seccion", sa.String(20), nullable=True),
            sa.Column("email", sa.String(160), nullable=True),
            sa.Column("telefono", sa.String(40), nullable=True),
            sa.Column("calle_numero", sa.String(500), nullable=True),
            sa.Column("colonia", sa.String(255), nullable=True),
            sa.Column("cp", sa.String(10), nullable=True),
            sa.Column("municipio", sa.String(120), nullable=True),
            sa.Column("estado_domicilio", sa.String(120), nullable=True),
            sa.Column("es_activista", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("estructura", sa.String(120), nullable=True),
            sa.Column("promotor", sa.String(160), nullable=True),
            sa.Column("folio", sa.String(40), nullable=False),
            sa.Column("folio_externo", sa.String(60), nullable=True),
            sa.Column("fecha_afiliacion", sa.Date(), nullable=True),
            sa.Column("curp_enc", sa.LargeBinary(), nullable=True),
            sa.Column("curp_masked", sa.String(20), nullable=True),
            sa.Column("clave_elector_enc", sa.LargeBinary(), nullable=True),
            sa.Column("clave_masked", sa.String(20), nullable=True),
            sa.Column("credencial_frente_key", sa.String(300), nullable=True),
            sa.Column("credencial_reverso_key", sa.String(300), nullable=True),
            sa.Column("firma_key", sa.String(300), nullable=True),
            sa.Column("estado", sa.String(20), nullable=False, server_default="REGISTRADO"),
            sa.Column("validado_por", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("validado_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("observacion_validacion", sa.String(500), nullable=True),
            sa.Column("quality_flags", sa.JSON(), nullable=True),
            sa.Column("consentimiento", sa.Boolean(), nullable=False),
            sa.Column("consentimiento_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("aviso_version", sa.String(40), nullable=True),
            sa.Column("manifestacion_voluntad", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("client_uuid", sa.String(64), nullable=True),
            sa.Column("lat", sa.Float(), nullable=True),
            sa.Column("lng", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(36), nullable=True),
            sa.Column("updated_by", sa.String(36), nullable=True),
        )
    if not _index_exists("militantes", "ix_militantes_campaign_activista"):
        op.create_index("ix_militantes_campaign_activista", "militantes", ["campaign_id", "activista_id"])
    if not _index_exists("militantes", "ix_militantes_campaign_seccion"):
        op.create_index("ix_militantes_campaign_seccion", "militantes", ["campaign_id", "seccion"])
    if not _index_exists("militantes", "ix_militantes_campaign_estado"):
        op.create_index("ix_militantes_campaign_estado", "militantes", ["campaign_id", "estado"])
    if not _index_exists("militantes", "uq_militantes_campaign_folio"):
        op.create_index("uq_militantes_campaign_folio", "militantes", ["campaign_id", "folio"], unique=True)
    if not _index_exists("militantes", "uq_militantes_campaign_activista_client_uuid"):
        op.create_index("uq_militantes_campaign_activista_client_uuid", "militantes",
                        ["campaign_id", "activista_id", "client_uuid"], unique=True)
    if not _column_exists("campaigns", "meta_afiliacion"):
        op.add_column("campaigns", sa.Column("meta_afiliacion", sa.Integer(), nullable=True))


def downgrade() -> None:
    if _column_exists("campaigns", "meta_afiliacion"):
        op.drop_column("campaigns", "meta_afiliacion")
    if _table_exists("militantes"):
        op.drop_table("militantes")
```

> Confirm `down_revision` matches the actual latest revision id string used in `0014` (open `backend/app/alembic/versions/0014_*.py` and copy its `revision =` value verbatim into this file's `down_revision`).

- [ ] **Step 7: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_militante_model.py -v`

- [ ] **Step 8: Run full suite — expect no regressions.** `cd backend && python3 -m pytest -q`

- [ ] **Step 9: Commit.**

```bash
git add backend/app/models/militante.py backend/app/models/__init__.py backend/app/models/campaign.py backend/app/alembic/versions/0015_militantes.py backend/tests/test_militante_model.py
git commit -m "feat(militantes): Militante model + campaigns.meta_afiliacion + migration 0015"
```

---

## Task 3: Schemas

**Files:**
- Create: `backend/app/schemas/militante.py`
- Test: covered by service tests (Task 4+).

**Interfaces:**
- Produces: `MilitanteCreate`, `MilitanteRead`, `MilitanteList`, `MilitanteEstadoUpdate`, `MilitanteReveal`, `MilitantePanorama` (+ nested block schemas).

- [ ] **Step 1: Implement** `backend/app/schemas/militante.py`:

```python
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class MilitanteCreate(BaseModel):
    nombre_completo: str = Field(min_length=2, max_length=255)
    consentimiento: bool
    curp: Optional[str] = Field(default=None, max_length=18)
    clave_elector: Optional[str] = Field(default=None, max_length=18)
    sexo: Optional[str] = Field(default=None, pattern="^[MF]$")
    fecha_nacimiento: Optional[date] = None
    seccion: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=160)
    telefono: Optional[str] = Field(default=None, max_length=40)
    calle_numero: Optional[str] = Field(default=None, max_length=500)
    colonia: Optional[str] = Field(default=None, max_length=255)
    cp: Optional[str] = Field(default=None, max_length=10)
    municipio: Optional[str] = Field(default=None, max_length=120)
    estado_domicilio: Optional[str] = Field(default=None, max_length=120)
    es_activista: bool = False
    estructura: Optional[str] = Field(default=None, max_length=120)
    promotor: Optional[str] = Field(default=None, max_length=160)
    folio_externo: Optional[str] = Field(default=None, max_length=60)
    fecha_afiliacion: Optional[date] = None
    client_uuid: Optional[str] = Field(default=None, max_length=64)
    lat: Optional[float] = None
    lng: Optional[float] = None


class MilitanteRead(BaseModel):
    id: str
    folio: str
    nombre_completo: str
    seccion: Optional[str] = None
    sexo: Optional[str] = None
    telefono: Optional[str] = None
    colonia: Optional[str] = None
    municipio: Optional[str] = None
    es_activista: bool
    estructura: Optional[str] = None
    curp_masked: Optional[str] = None
    clave_masked: Optional[str] = None
    estado: str
    quality_flags: Optional[dict] = None
    activista_nombre: Optional[str] = None
    tiene_frente: bool = False
    tiene_reverso: bool = False
    tiene_firma: bool = False
    fecha_afiliacion: Optional[date] = None
    created_at: datetime


class MilitanteList(BaseModel):
    items: list[MilitanteRead]
    total: int
    limit: int
    offset: int
    has_territory: bool = True


class MilitanteEstadoUpdate(BaseModel):
    estado: str = Field(pattern="^(VALIDADO|OBSERVADO)$")
    observacion_validacion: Optional[str] = Field(default=None, max_length=500)


class MilitanteReveal(BaseModel):
    curp: Optional[str] = None
    clave_elector: Optional[str] = None
    frente_url: Optional[str] = None
    reverso_url: Optional[str] = None
    firma_url: Optional[str] = None


class PanoramaKpis(BaseModel):
    total: int
    validados: int
    observados: int
    registrados: int
    meta: Optional[int] = None
    ritmo_7d: int
    ritmo_30d: int


class PanoramaSeccion(BaseModel):
    seccion: str
    militantes: int
    lista_nominal: Optional[int] = None
    prioridad: Optional[str] = None
    promovidos: int = 0


class PanoramaActivista(BaseModel):
    activista_id: Optional[str] = None
    nombre: str
    militantes: int
    con_banderas: int


class MilitantePanorama(BaseModel):
    kpis: PanoramaKpis
    por_seccion: list[PanoramaSeccion]
    por_activista: list[PanoramaActivista]
    trend: list[int]  # last 14 days count
```

- [ ] **Step 2: Commit.**

```bash
git add backend/app/schemas/militante.py
git commit -m "feat(militantes): pydantic schemas"
```

---

## Task 4: Service — create (crypto, folio, quality flags, consent, audit)

**Files:**
- Create: `backend/app/services/militante_service.py`
- Test: `backend/tests/test_militantes.py`

**Interfaces:**
- Consumes: `crypto.encrypt_clave/mask_clave`, `privacy_service.get_active_notice/record_acceptance`, `record_audit`, `scoped_query`.
- Produces: `create_militante(db, ctx, data: MilitanteCreate) -> Militante`; `compute_quality_flags(m: Militante) -> dict`; `_next_folio(db, ctx) -> str`; exceptions `ConsentRequired`, re-export `NoActiveNotice`.

- [ ] **Step 1: Write the failing test** in `backend/tests/test_militantes.py`:

```python
import pytest
from app.services import militante_service
from app.schemas.militante import MilitanteCreate


def test_create_militante_encrypts_and_flags(activista_ctx, db_session):
    data = MilitanteCreate(nombre_completo="Ana López", consentimiento=True,
                           curp="LOPA900101MMCXXX01", clave_elector="LOPXAN90010115M100",
                           seccion="4127")
    m = militante_service.create_militante(db_session, activista_ctx, data)
    assert m.folio.startswith("SMA-")
    assert m.estado == "REGISTRADO"
    assert m.curp_masked and m.curp_masked != "LOPA900101MMCXXX01"
    assert m.curp_enc is not None
    assert m.quality_flags["falta_foto_frente"] is True
    assert m.quality_flags["falta_curp"] is False


def test_create_militante_requires_consent(activista_ctx, db_session):
    data = MilitanteCreate(nombre_completo="X", consentimiento=False)
    with pytest.raises(militante_service.ConsentRequired):
        militante_service.create_militante(db_session, activista_ctx, data)
```

> `activista_ctx` fixture: build a `CampaignContext` for the seeded activista user + demo campaign. If no such fixture exists, add one to `conftest.py` mirroring how `test_registros.py` builds its capture context (find the fixture it uses for an ACTIVISTA and reuse/rename).

- [ ] **Step 2: Run — expect FAIL** (`ModuleNotFoundError`).

Run: `cd backend && python3 -m pytest tests/test_militantes.py -v`

- [ ] **Step 3: Implement** `backend/app/services/militante_service.py` (create + helpers):

```python
"""Militante service — formal affiliation CRUD (crypto, folio, flags, audit)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core import crypto
from app.core.scoping import scoped_query
from app.dependencies import CampaignContext
from app.models.campaign import Campaign
from app.models.militante import Militante
from app.models.user import User, UserRole
from app.schemas.militante import MilitanteCreate, MilitanteEstadoUpdate
from app.services import privacy_service, territory_service
from app.services.audit_service import record_audit
from app.services.registro_service import _role_scoped as _registro_role_scoped


class ConsentRequired(Exception):
    """Raised when a militante is created without consentimiento=True."""


NoActiveNotice = privacy_service.NoActiveNotice


def _mask(value: str) -> str:
    return f"****-{value[-4:]}" if value else ""


def compute_quality_flags(m: Militante) -> dict:
    return {
        "falta_curp": m.curp_enc is None,
        "falta_foto_frente": m.credencial_frente_key is None,
        "falta_foto_reverso": m.credencial_reverso_key is None,
        "falta_firma": m.firma_key is None,
        "clave_incompleta": bool(m.clave_masked) is False,
        "posible_duplicado": False,  # set by _flag_duplicate below
    }


def _flag_duplicate(db: Session, ctx: CampaignContext, m: Militante) -> bool:
    """A soft signal: same masked CURP or clave within the campaign."""
    if not (m.curp_masked or m.clave_masked):
        return False
    stmt = scoped_query(Militante, ctx).where(Militante.id != m.id).where(
        or_(
            sa.and_(Militante.curp_masked.isnot(None), Militante.curp_masked == m.curp_masked),
            sa.and_(Militante.clave_masked.isnot(None), Militante.clave_masked == m.clave_masked),
        )
    )
    return db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one() > 0


def _next_folio(db: Session, ctx: CampaignContext) -> str:
    year = date.today().year
    prefix = f"SMA-{year}-"
    count = db.execute(
        select(func.count()).select_from(
            scoped_query(Militante, ctx).where(Militante.folio.like(f"{prefix}%")).subquery()
        )
    ).scalar_one()
    return f"{prefix}{count + 1:05d}"


def create_militante(db: Session, ctx: CampaignContext, data: MilitanteCreate) -> Militante:
    if not data.consentimiento:
        raise ConsentRequired()

    if data.client_uuid:
        existing = db.execute(
            scoped_query(Militante, ctx)
            .where(Militante.activista_id == ctx.user.id)
            .where(Militante.client_uuid == data.client_uuid)
        ).scalar_one_or_none()
        if existing is not None:
            return existing

    notice = privacy_service.get_active_notice(db, ctx)

    curp_enc = crypto.encrypt_clave(data.curp) if data.curp else None
    curp_masked = _mask(data.curp) if data.curp else None
    clave_enc = crypto.encrypt_clave(data.clave_elector) if data.clave_elector else None
    clave_masked = crypto.mask_clave(data.clave_elector) if data.clave_elector else None

    m = Militante(
        organization_id=ctx.organization_id,
        campaign_id=ctx.campaign_id,
        activista_id=ctx.user.id,
        nombre_completo=data.nombre_completo,
        sexo=data.sexo,
        fecha_nacimiento=data.fecha_nacimiento,
        seccion=data.seccion,
        email=data.email,
        telefono=data.telefono,
        calle_numero=data.calle_numero,
        colonia=data.colonia,
        cp=data.cp,
        municipio=data.municipio,
        estado_domicilio=data.estado_domicilio,
        es_activista=data.es_activista,
        estructura=data.estructura,
        promotor=data.promotor,
        folio=_next_folio(db, ctx),
        folio_externo=data.folio_externo,
        fecha_afiliacion=data.fecha_afiliacion or date.today(),
        curp_enc=curp_enc, curp_masked=curp_masked,
        clave_elector_enc=clave_enc, clave_masked=clave_masked,
        estado="REGISTRADO",
        consentimiento=True,
        consentimiento_at=datetime.now(timezone.utc),
        aviso_version=notice.version,
        client_uuid=data.client_uuid,
        lat=data.lat, lng=data.lng,
        created_by=ctx.user.id,
    )
    db.add(m)
    db.flush()
    flags = compute_quality_flags(m)
    flags["posible_duplicado"] = _flag_duplicate(db, ctx, m)
    m.quality_flags = flags
    record_audit(db, action="militante.create", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="militante", entity_id=m.id)
    privacy_service.record_acceptance(db, ctx, m, notice)
    db.commit()
    db.refresh(m)
    return m
```

> `privacy_service.record_acceptance(db, ctx, reg, notice)` currently takes the registro instance. Confirm its signature in `backend/app/services/privacy_service.py`; if it references `.id`/`.campaign_id` generically, a `Militante` works as-is. If it is `Registro`-typed, generalize it to accept the entity id + type (pass `m`), keeping backward compatibility with registros.

- [ ] **Step 4: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_militantes.py -v`

- [ ] **Step 5: Commit.**

```bash
git add backend/app/services/militante_service.py backend/tests/test_militantes.py
git commit -m "feat(militantes): create service — crypto, folio, quality flags, consent, audit"
```

---

## Task 5: Service — scoping, list, get

**Files:**
- Modify: `backend/app/services/militante_service.py`
- Test: `backend/tests/test_militantes.py` (append)

**Interfaces:**
- Produces: `_militante_role_scoped(ctx)`; `list_militantes(db, ctx, *, seccion, estado, activista, flag, q, limit, offset) -> tuple[list[Militante], int, bool]`; `get_militante(db, ctx, mid) -> Optional[Militante]`.

- [ ] **Step 1: Write the failing test** (append to `test_militantes.py`):

```python
def test_list_scoped_by_activista(activista_ctx, otro_activista_ctx, db_session):
    from app.schemas.militante import MilitanteCreate
    militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Mía", consentimiento=True, seccion="4127"))
    militante_service.create_militante(db_session, otro_activista_ctx,
        MilitanteCreate(nombre_completo="Ajena", consentimiento=True, seccion="4127"))
    rows, total, _ = militante_service.list_militantes(
        db_session, activista_ctx, seccion=None, estado=None, activista=None,
        flag=None, q=None, limit=50, offset=0)
    assert total == 1
    assert rows[0].nombre_completo == "Mía"
```

> Add an `otro_activista_ctx` fixture (a second ACTIVISTA in the same campaign) to `conftest.py`.

- [ ] **Step 2: Run — expect FAIL** (`AttributeError: list_militantes`).

- [ ] **Step 3: Implement** (append to `militante_service.py`):

```python
def _militante_role_scoped(ctx: CampaignContext):
    """Role scope: activistas see own; supervisory roles reuse the registro
    hierarchy OR unowned rows (territory is the real gate); admin=campaign; SA=all."""
    if ctx.is_superadmin or ctx.role == UserRole.ADMIN:
        return scoped_query(Militante, ctx)
    if ctx.role in (UserRole.COORDINADOR, UserRole.LIDER):
        # mirror promovido_service: hierarchy ids OR unowned, gated later by territory
        from app.services.registro_service import _role_scoped as _rs  # registros-typed
        # Build the same id-subquery but against militantes hierarchy:
        lideres = select(User.id).where(User.coordinador_id == ctx.user.id) \
            if ctx.role == UserRole.COORDINADOR else None
        if ctx.role == UserRole.COORDINADOR:
            activistas = select(User.id).where(User.lider_id.in_(lideres))
            owned = or_(Militante.activista_id.in_(activistas),
                        Militante.activista_id.in_(lideres),
                        Militante.activista_id == ctx.user.id)
        else:  # LIDER
            sub = select(User.id).where(User.lider_id == ctx.user.id)
            owned = or_(Militante.activista_id.in_(sub), Militante.activista_id == ctx.user.id)
        return scoped_query(Militante, ctx).where(or_(owned, Militante.activista_id.is_(None)))
    if ctx.role in (UserRole.ACTIVISTA, UserRole.CAPTURISTA):
        return scoped_query(Militante, ctx).where(Militante.activista_id == ctx.user.id)
    return scoped_query(Militante, ctx).where(sa.false())


def list_militantes(db: Session, ctx: CampaignContext, *, seccion, estado, activista,
                    flag, q, limit, offset) -> tuple[list[Militante], int, bool]:
    secciones = territory_service.scope_secciones(db, ctx.user)
    bypass_territory = ctx.is_superadmin or ctx.role == UserRole.ADMIN \
        or ctx.role in (UserRole.ACTIVISTA, UserRole.CAPTURISTA)
    has_territory = bypass_territory or bool(secciones)

    stmt = _militante_role_scoped(ctx)
    if not bypass_territory:
        stmt = stmt.where(Militante.seccion.in_(secciones)) if secciones else stmt.where(sa.false())
    if seccion:
        stmt = stmt.where(Militante.seccion == seccion)
    if estado:
        stmt = stmt.where(Militante.estado == estado)
    if activista:
        stmt = stmt.where(Militante.activista_id == activista)
    if q:
        stmt = stmt.where(Militante.nombre_completo.ilike(f"%{q}%"))

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = list(db.execute(
        stmt.order_by(Militante.created_at.desc()).limit(limit).offset(offset)
    ).scalars().all())

    if flag:  # in-memory filter on the page (quality flags are JSON)
        rows = [r for r in rows if (r.quality_flags or {}).get(flag)]

    ids = {r.activista_id for r in rows if r.activista_id}
    names: dict[str, str] = {}
    if ids:
        for uid, fname in db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all():
            names[uid] = fname
    for r in rows:
        r.activista_nombre = names.get(r.activista_id)
        r.tiene_frente = r.credencial_frente_key is not None
        r.tiene_reverso = r.credencial_reverso_key is not None
        r.tiene_firma = r.firma_key is not None
    return rows, total, has_territory


def get_militante(db: Session, ctx: CampaignContext, mid: str) -> Optional[Militante]:
    return db.execute(
        _militante_role_scoped(ctx).where(Militante.id == mid)
    ).scalar_one_or_none()
```

> `MilitanteRead` reads `tiene_frente/tiene_reverso/tiene_firma/activista_nombre` as transient attributes — set them on the instances before serialization (done above for list; do the same in the router's get handler).

- [ ] **Step 4: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_militantes.py -v`

- [ ] **Step 5: Commit.**

```bash
git add backend/app/services/militante_service.py backend/tests/test_militantes.py backend/tests/conftest.py
git commit -m "feat(militantes): role+territory scoped list + get"
```

---

## Task 6: Service — validate (estado) + reveal (PII)

**Files:**
- Modify: `backend/app/services/militante_service.py`
- Test: `backend/tests/test_militantes.py` (append)

**Interfaces:**
- Produces: `set_estado(db, ctx, mid, data: MilitanteEstadoUpdate) -> Optional[Militante]`; `reveal_militante(db, ctx, mid) -> Optional[dict]` (returns cleartext curp/clave + presigned doc urls, audited).

- [ ] **Step 1: Write the failing test** (append):

```python
from app.schemas.militante import MilitanteEstadoUpdate

def test_set_estado_validado_audits(coordinador_ctx, activista_ctx, db_session):
    from app.schemas.militante import MilitanteCreate
    m = militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Val", consentimiento=True, seccion="4127"))
    out = militante_service.set_estado(db_session, coordinador_ctx, m.id,
        MilitanteEstadoUpdate(estado="VALIDADO"))
    assert out.estado == "VALIDADO"
    assert out.validado_por == coordinador_ctx.user.id
```

> Add a `coordinador_ctx` fixture (the seeded Lucy = COORDINADOR, assigned to SMA territory so scoping resolves). Ensure the created militante's `seccion="4127"` is inside Lucy's territory.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** (append):

```python
def set_estado(db: Session, ctx: CampaignContext, mid: str,
               data: MilitanteEstadoUpdate) -> Optional[Militante]:
    m = get_militante(db, ctx, mid)
    if m is None:
        return None
    m.estado = data.estado
    m.observacion_validacion = data.observacion_validacion
    m.validado_por = ctx.user.id
    m.validado_at = datetime.now(timezone.utc)
    m.updated_by = ctx.user.id
    db.flush()
    record_audit(db, action="militante.validate", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="militante", entity_id=m.id)
    db.commit()
    db.refresh(m)
    return m


def reveal_militante(db: Session, ctx: CampaignContext, mid: str) -> Optional[dict]:
    from app.core import storage
    m = get_militante(db, ctx, mid)
    if m is None:
        return None
    record_audit(db, action="militante.reveal", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="militante", entity_id=m.id)
    db.commit()
    out = {
        "curp": crypto.decrypt_clave(m.curp_enc) if m.curp_enc else None,
        "clave_elector": crypto.decrypt_clave(m.clave_elector_enc) if m.clave_elector_enc else None,
        "frente_url": storage.presigned_get(m.credencial_frente_key) if m.credencial_frente_key else None,
        "reverso_url": storage.presigned_get(m.credencial_reverso_key) if m.credencial_reverso_key else None,
        "firma_url": storage.presigned_get(m.firma_key) if m.firma_key else None,
    }
    return out
```

- [ ] **Step 4: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_militantes.py -v`

- [ ] **Step 5: Commit.**

```bash
git add backend/app/services/militante_service.py backend/tests/test_militantes.py backend/tests/conftest.py
git commit -m "feat(militantes): validate estado + audited PII/doc reveal"
```

---

## Task 7: Service — document upload

**Files:**
- Modify: `backend/app/services/militante_service.py`
- Test: `backend/tests/test_militantes.py` (append)

**Interfaces:**
- Produces: `upload_documento(db, ctx, mid, tipo: str, data: bytes, content_type: str) -> Optional[Militante]` where `tipo in {"frente","reverso","firma"}`.

- [ ] **Step 1: Write the failing test** (append; mock storage):

```python
def test_upload_documento_sets_key_and_clears_flag(activista_ctx, db_session, monkeypatch):
    import app.core.storage as storage
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    from app.schemas.militante import MilitanteCreate
    m = militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Doc", consentimiento=True, seccion="4127"))
    out = militante_service.upload_documento(db_session, activista_ctx, m.id, "frente", b"jpg", "image/jpeg")
    assert out.credencial_frente_key.endswith("/frente.jpg")
    assert out.quality_flags["falta_foto_frente"] is False
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** (append):

```python
_DOC_EXT = {"frente": ("frente.jpg", "credencial_frente_key"),
            "reverso": ("reverso.jpg", "credencial_reverso_key"),
            "firma": ("firma.png", "firma_key")}


def upload_documento(db: Session, ctx: CampaignContext, mid: str, tipo: str,
                     data: bytes, content_type: str) -> Optional[Militante]:
    from app.core import storage
    if tipo not in _DOC_EXT:
        raise ValueError(f"tipo inválido: {tipo}")
    m = get_militante(db, ctx, mid)
    if m is None:
        return None
    filename, attr = _DOC_EXT[tipo]
    key = f"militantes/{m.campaign_id}/{m.id}/{filename}"
    storage.put_object(key, data, content_type)
    setattr(m, attr, key)
    if tipo == "firma":
        m.manifestacion_voluntad = True
    flags = compute_quality_flags(m)
    flags["posible_duplicado"] = (m.quality_flags or {}).get("posible_duplicado", False)
    m.quality_flags = flags
    m.updated_by = ctx.user.id
    db.flush()
    record_audit(db, action="militante.doc.upload", actor_id=ctx.user.id,
                 organization_id=ctx.organization_id, entity_type="militante", entity_id=m.id)
    db.commit()
    db.refresh(m)
    return m
```

- [ ] **Step 4: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_militantes.py -v`

- [ ] **Step 5: Commit.**

```bash
git add backend/app/services/militante_service.py backend/tests/test_militantes.py
git commit -m "feat(militantes): document upload to bucket + flag recompute"
```

---

## Task 8: Panorama aggregation service

**Files:**
- Modify: `backend/app/services/militante_service.py`
- Test: `backend/tests/test_militantes.py` (append)

**Interfaces:**
- Produces: `panorama(db, ctx) -> dict` matching `MilitantePanorama` (kpis, por_seccion, por_activista, trend).

- [ ] **Step 1: Write the failing test** (append):

```python
def test_panorama_counts(coordinador_ctx, activista_ctx, db_session):
    from app.schemas.militante import MilitanteCreate
    for i in range(3):
        militante_service.create_militante(db_session, activista_ctx,
            MilitanteCreate(nombre_completo=f"P{i}", consentimiento=True, seccion="4127"))
    pan = militante_service.panorama(db_session, coordinador_ctx)
    assert pan["kpis"]["total"] == 3
    assert any(s["seccion"] == "4127" and s["militantes"] == 3 for s in pan["por_seccion"])
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** (append). Reuses `_militante_role_scoped` + territory gate, joins `SeccionElectoral` for context and counts promovidos (`Registro`) per section:

```python
def panorama(db: Session, ctx: CampaignContext) -> dict:
    from app.models.registro import Registro
    from app.models.seccion_electoral import SeccionElectoral

    secciones = territory_service.scope_secciones(db, ctx.user)
    bypass = ctx.is_superadmin or ctx.role == UserRole.ADMIN
    base = _militante_role_scoped(ctx)
    if not bypass:
        base = base.where(Militante.seccion.in_(secciones)) if secciones else base.where(sa.false())
    sub = base.subquery()

    total = db.execute(select(func.count()).select_from(sub)).scalar_one()

    def _count_estado(e):
        return db.execute(select(func.count()).select_from(sub).where(sub.c.estado == e)).scalar_one()
    validados, observados, registrados = _count_estado("VALIDADO"), _count_estado("OBSERVADO"), _count_estado("REGISTRADO")

    now = datetime.now(timezone.utc)
    def _since(days):
        return db.execute(select(func.count()).select_from(sub)
                          .where(sub.c.created_at >= now - timedelta(days=days))).scalar_one()

    campaign = db.get(Campaign, ctx.campaign_id) if ctx.campaign_id else None
    meta = getattr(campaign, "meta_afiliacion", None)

    # por seccion
    rows = db.execute(select(sub.c.seccion, func.count()).group_by(sub.c.seccion)).all()
    counts = {s: c for s, c in rows if s}
    codes = set(counts)
    facts = {}
    if codes:
        for f in db.execute(select(SeccionElectoral).where(
                SeccionElectoral.seccion.in_(codes), SeccionElectoral.anio == 2024)).scalars():
            facts[f.seccion] = f
    # promovidos per section (Registro), same scope
    prom = {}
    if codes:
        for s, c in db.execute(
            scoped_query(Registro, ctx).with_only_columns(Registro.seccion, func.count())
            .where(Registro.seccion.in_(codes)).group_by(Registro.seccion)
        ).all():
            prom[s] = c
    por_seccion = [{
        "seccion": s, "militantes": counts[s],
        "lista_nominal": getattr(facts.get(s), "lista_nominal", None),
        "prioridad": getattr(facts.get(s), "prioridad", None),
        "promovidos": prom.get(s, 0),
    } for s in sorted(counts, key=lambda x: -counts[x])]

    # por activista
    act_rows = db.execute(select(sub.c.activista_id, func.count()).group_by(sub.c.activista_id)).all()
    aids = {a for a, _ in act_rows if a}
    names = {}
    if aids:
        for uid, fn in db.execute(select(User.id, User.full_name).where(User.id.in_(aids))).all():
            names[uid] = fn
    por_activista = [{
        "activista_id": a, "nombre": names.get(a, "—") if a else "Sin activista",
        "militantes": c, "con_banderas": 0,
    } for a, c in sorted(act_rows, key=lambda x: -x[1])]

    return {
        "kpis": {"total": total, "validados": validados, "observados": observados,
                 "registrados": registrados, "meta": meta,
                 "ritmo_7d": _since(7), "ritmo_30d": _since(30)},
        "por_seccion": por_seccion,
        "por_activista": por_activista,
        "trend": [],  # optional: fill 14-day buckets if cheap; empty is acceptable v1
    }
```

- [ ] **Step 4: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_militantes.py -v`

- [ ] **Step 5: Commit.**

```bash
git add backend/app/services/militante_service.py backend/tests/test_militantes.py
git commit -m "feat(militantes): panorama aggregation for the coordinator dashboard"
```

---

## Task 9: Router `/api/militantes` + wire into app

**Files:**
- Create: `backend/app/routers/militantes.py`
- Modify: `backend/app/main.py` (include router)
- Modify: `backend/app/bootstrap.py` or lifespan (call `ensure_storage_ready()` only if `storage_enabled()`)
- Test: `backend/tests/test_militantes_api.py`

**Interfaces:**
- Consumes: all `militante_service` functions; `CampaignCtx`, `require_roles`, `DbSession`.
- Produces: routes `POST/GET /militantes`, `GET /militantes/panorama`, `GET /militantes/{id}`, `POST /militantes/{id}/documento`, `PATCH /militantes/{id}/estado`, `GET /militantes/reveal/{id}`.

- [ ] **Step 1: Write the failing API test** `backend/tests/test_militantes_api.py`:

```python
def test_create_and_list_militante(activista_client, campaign_headers):
    r = activista_client.post("/api/militantes", headers=campaign_headers, json={
        "nombre_completo": "API Test", "consentimiento": True, "seccion": "4127"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["folio"].startswith("SMA-")
    lst = activista_client.get("/api/militantes", headers=campaign_headers)
    assert lst.status_code == 200
    assert lst.json()["total"] >= 1


def test_activista_cannot_reveal(activista_client, campaign_headers):
    r = activista_client.post("/api/militantes", headers=campaign_headers, json={
        "nombre_completo": "R", "consentimiento": True, "seccion": "4127"})
    mid = r.json()["id"]
    rev = activista_client.get(f"/api/militantes/reveal/{mid}", headers=campaign_headers)
    assert rev.status_code == 403
```

> Reuse the authenticated-client + `X-Campaign-Id` header fixtures from `test_registros.py`/`test_admin*.py` (find the fixture producing an ACTIVISTA `TestClient` and the campaign header dict; name them `activista_client`/`campaign_headers` or adapt the test to the existing names).

- [ ] **Step 2: Run — expect FAIL** (404 — route missing).

- [ ] **Step 3: Implement** `backend/app/routers/militantes.py`:

```python
"""/api/militantes — formal affiliation capture + coordinator panorama."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.militante import (
    MilitanteCreate, MilitanteEstadoUpdate, MilitanteList, MilitantePanorama,
    MilitanteRead, MilitanteReveal,
)
from app.services import militante_service

router = APIRouter(tags=["militantes"])

_CAPTURE = Annotated[object, Depends(require_roles(
    UserRole.ACTIVISTA, UserRole.CAPTURISTA, UserRole.LIDER,
    UserRole.COORDINADOR, UserRole.ADMIN))]
_REVIEW = Annotated[object, Depends(require_roles(
    UserRole.COORDINADOR, UserRole.ADMIN))]

_MAX_DOC_BYTES = 6 * 1024 * 1024


@router.post("/militantes", response_model=MilitanteRead, status_code=status.HTTP_201_CREATED)
def create(db: DbSession, ctx: CampaignCtx, _p: _CAPTURE, data: MilitanteCreate):
    try:
        m = militante_service.create_militante(db, ctx, data)
    except militante_service.ConsentRequired:
        raise HTTPException(status_code=422, detail="Consentimiento requerido")
    except militante_service.NoActiveNotice:
        raise HTTPException(status_code=409, detail="No hay aviso de privacidad activo")
    m.activista_nombre = None
    m.tiene_frente = m.credencial_frente_key is not None
    m.tiene_reverso = m.credencial_reverso_key is not None
    m.tiene_firma = m.firma_key is not None
    return MilitanteRead.model_validate(m, from_attributes=True)


@router.get("/militantes", response_model=MilitanteList)
def list_(db: DbSession, ctx: CampaignCtx, _p: _CAPTURE,
          seccion: Annotated[Optional[str], Query()] = None,
          estado: Annotated[Optional[str], Query()] = None,
          activista: Annotated[Optional[str], Query()] = None,
          flag: Annotated[Optional[str], Query()] = None,
          q: Annotated[Optional[str], Query()] = None,
          limit: Annotated[int, Query(ge=1, le=200)] = 50,
          offset: Annotated[int, Query(ge=0)] = 0):
    rows, total, has_territory = militante_service.list_militantes(
        db, ctx, seccion=seccion, estado=estado, activista=activista,
        flag=flag, q=q, limit=limit, offset=offset)
    return MilitanteList(
        items=[MilitanteRead.model_validate(r, from_attributes=True) for r in rows],
        total=total, limit=limit, offset=offset, has_territory=has_territory)


@router.get("/militantes/panorama", response_model=MilitantePanorama)
def panorama(db: DbSession, ctx: CampaignCtx, _p: _REVIEW):
    return MilitantePanorama.model_validate(militante_service.panorama(db, ctx))


@router.get("/militantes/{mid}", response_model=MilitanteRead)
def get_one(db: DbSession, ctx: CampaignCtx, _p: _CAPTURE, mid: str):
    m = militante_service.get_militante(db, ctx, mid)
    if m is None:
        raise HTTPException(status_code=404, detail="Militante no encontrado")
    m.tiene_frente = m.credencial_frente_key is not None
    m.tiene_reverso = m.credencial_reverso_key is not None
    m.tiene_firma = m.firma_key is not None
    m.activista_nombre = None
    return MilitanteRead.model_validate(m, from_attributes=True)


@router.post("/militantes/{mid}/documento", response_model=MilitanteRead)
async def upload_doc(db: DbSession, ctx: CampaignCtx, _p: _CAPTURE, mid: str,
                     tipo: Annotated[str, Form()], file: Annotated[UploadFile, File()]):
    if tipo not in ("frente", "reverso", "firma"):
        raise HTTPException(status_code=422, detail="tipo inválido")
    data = await file.read()
    if len(data) > _MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="Archivo demasiado grande")
    m = militante_service.upload_documento(db, ctx, mid, tipo, data,
                                            file.content_type or "application/octet-stream")
    if m is None:
        raise HTTPException(status_code=404, detail="Militante no encontrado")
    m.tiene_frente = m.credencial_frente_key is not None
    m.tiene_reverso = m.credencial_reverso_key is not None
    m.tiene_firma = m.firma_key is not None
    m.activista_nombre = None
    return MilitanteRead.model_validate(m, from_attributes=True)


@router.patch("/militantes/{mid}/estado", response_model=MilitanteRead)
def set_estado(db: DbSession, ctx: CampaignCtx, _p: _REVIEW, mid: str, data: MilitanteEstadoUpdate):
    m = militante_service.set_estado(db, ctx, mid, data)
    if m is None:
        raise HTTPException(status_code=404, detail="Militante no encontrado")
    m.tiene_frente = m.credencial_frente_key is not None
    m.tiene_reverso = m.credencial_reverso_key is not None
    m.tiene_firma = m.firma_key is not None
    m.activista_nombre = None
    return MilitanteRead.model_validate(m, from_attributes=True)


@router.get("/militantes/reveal/{mid}", response_model=MilitanteReveal)
def reveal(db: DbSession, ctx: CampaignCtx, _p: _REVIEW, mid: str):
    out = militante_service.reveal_militante(db, ctx, mid)
    if out is None:
        raise HTTPException(status_code=404, detail="Militante no encontrado")
    return MilitanteReveal.model_validate(out)
```

> **Route ordering:** declare `/militantes/panorama` BEFORE `/militantes/{mid}` (already done above) so "panorama" is not captured as an id.

- [ ] **Step 4: Wire router.** In `backend/app/main.py`, import and `app.include_router(militantes.router, prefix="/api")` next to the registros router (match the existing include pattern/prefix).

- [ ] **Step 5: Startup gate.** In the lifespan/bootstrap where `ensure_crypto_ready()` is called, add:

```python
from app.core.storage import ensure_storage_ready, storage_enabled
if storage_enabled():
    ensure_storage_ready()
```

- [ ] **Step 6: Run — expect PASS.** `cd backend && python3 -m pytest tests/test_militantes_api.py -v`

- [ ] **Step 7: Full suite.** `cd backend && python3 -m pytest -q` (expect green, no regressions).

- [ ] **Step 8: Commit.**

```bash
git add backend/app/routers/militantes.py backend/app/main.py backend/app/bootstrap.py backend/tests/test_militantes_api.py
git commit -m "feat(militantes): /api/militantes router (7 endpoints) + startup storage gate"
```

---

## Task 10: Retention — delete bucket objects on hard-delete

**Files:**
- Modify: `backend/app/services/retention_service.py`
- Test: `backend/tests/test_retention_militantes.py`

**Interfaces:**
- Consumes: `storage.delete_object`.
- Produces: the existing purge functions also delete `Militante` rows and their 3 bucket objects.

- [ ] **Step 1: Write the failing test** `backend/tests/test_retention_militantes.py`:

```python
def test_purge_deletes_militante_docs(db_session, activista_ctx, monkeypatch):
    import app.core.storage as storage
    deleted = []
    monkeypatch.setattr(storage, "put_object", lambda *a, **k: None)
    monkeypatch.setattr(storage, "delete_object", lambda key: deleted.append(key))
    from app.schemas.militante import MilitanteCreate
    from app.services import militante_service, retention_service
    m = militante_service.create_militante(db_session, activista_ctx,
        MilitanteCreate(nombre_completo="Purge", consentimiento=True, seccion="4127"))
    militante_service.upload_documento(db_session, activista_ctx, m.id, "frente", b"x", "image/jpeg")
    m.deleted_at = __import__("datetime").datetime(2000, 1, 1)
    db_session.commit()
    retention_service.purge_soft_deleted(db_session)  # adapt name to actual fn
    assert any(k.endswith("/frente.jpg") for k in deleted)
```

> Adapt `purge_soft_deleted` to the real function name in `retention_service.py`. If retention is campaign/date-driven, set the fields the real purge checks.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** In `retention_service.py`, wherever registros are hard-purged, add a parallel militante purge that, before deleting each row, calls `storage.delete_object` on any non-null `credencial_frente_key`, `credencial_reverso_key`, `firma_key` (guard with `storage.storage_enabled()`).

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit.**

```bash
git add backend/app/services/retention_service.py backend/tests/test_retention_militantes.py
git commit -m "feat(militantes): purge bucket objects on hard-delete (retention)"
```

---

## Task 11: Frontend API client + types

**Files:**
- Create: `frontend/src/api/militantes.ts`
- Test: `frontend/src/api/__tests__/militantes.test.ts` (light shape test if vitest covers api; else skip test, rely on build)

**Interfaces:**
- Produces: `createMilitante`, `uploadDocumento`, `listMilitantes`, `getMilitante`, `setEstado`, `revealMilitante`, `getPanorama`, and the TS types.

- [ ] **Step 1: Implement** `frontend/src/api/militantes.ts`:

```typescript
import { apiClient } from "./client";

export type MilitanteEstado = "REGISTRADO" | "VALIDADO" | "OBSERVADO";

export interface QualityFlags {
  falta_curp: boolean; falta_foto_frente: boolean; falta_foto_reverso: boolean;
  falta_firma: boolean; clave_incompleta: boolean; posible_duplicado: boolean;
}

export interface Militante {
  id: string; folio: string; nombre_completo: string;
  seccion: string | null; sexo: string | null; telefono: string | null;
  colonia: string | null; municipio: string | null; es_activista: boolean;
  estructura: string | null; curp_masked: string | null; clave_masked: string | null;
  estado: MilitanteEstado; quality_flags: QualityFlags | null;
  activista_nombre: string | null;
  tiene_frente: boolean; tiene_reverso: boolean; tiene_firma: boolean;
  fecha_afiliacion: string | null; created_at: string;
}

export interface MilitanteList {
  items: Militante[]; total: number; limit: number; offset: number; has_territory: boolean;
}

export interface MilitanteCreate {
  nombre_completo: string; consentimiento: boolean;
  curp?: string; clave_elector?: string; sexo?: string; fecha_nacimiento?: string;
  seccion?: string; email?: string; telefono?: string;
  calle_numero?: string; colonia?: string; cp?: string; municipio?: string;
  estado_domicilio?: string; es_activista?: boolean; estructura?: string;
  promotor?: string; folio_externo?: string; fecha_afiliacion?: string;
  client_uuid?: string; lat?: number; lng?: number;
}

export interface Panorama {
  kpis: { total: number; validados: number; observados: number; registrados: number;
          meta: number | null; ritmo_7d: number; ritmo_30d: number };
  por_seccion: { seccion: string; militantes: number; lista_nominal: number | null;
                 prioridad: string | null; promovidos: number }[];
  por_activista: { activista_id: string | null; nombre: string; militantes: number; con_banderas: number }[];
  trend: number[];
}

export async function createMilitante(payload: MilitanteCreate): Promise<Militante> {
  return (await apiClient.post("/militantes", payload)).data;
}

export async function uploadDocumento(id: string, tipo: "frente" | "reverso" | "firma", blob: Blob): Promise<Militante> {
  const fd = new FormData();
  fd.append("tipo", tipo);
  fd.append("file", blob, `${tipo}.jpg`);
  return (await apiClient.post(`/militantes/${id}/documento`, fd,
    { headers: { "Content-Type": "multipart/form-data" } })).data;
}

export async function listMilitantes(params: Record<string, string | number | undefined> = {}): Promise<MilitanteList> {
  return (await apiClient.get("/militantes", { params })).data;
}

export async function getMilitante(id: string): Promise<Militante> {
  return (await apiClient.get(`/militantes/${id}`)).data;
}

export async function setEstado(id: string, estado: "VALIDADO" | "OBSERVADO", observacion_validacion?: string): Promise<Militante> {
  return (await apiClient.patch(`/militantes/${id}/estado`, { estado, observacion_validacion })).data;
}

export interface Reveal { curp: string | null; clave_elector: string | null;
  frente_url: string | null; reverso_url: string | null; firma_url: string | null; }

export async function revealMilitante(id: string): Promise<Reveal> {
  return (await apiClient.get(`/militantes/reveal/${id}`)).data;
}

export async function getPanorama(): Promise<Panorama> {
  return (await apiClient.get("/militantes/panorama")).data;
}
```

- [ ] **Step 2: Build check.** `cd frontend && npm run build` (type-check passes).

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/api/militantes.ts
git commit -m "feat(militantes): frontend API client + types"
```

---

## Task 12: Capture helpers — image compression + signature pad

**Files:**
- Create: `frontend/src/modules/militantes/lib/image.ts`
- Create: `frontend/src/modules/militantes/components/SignaturePad.tsx`
- Create: `frontend/src/modules/militantes/components/PhotoCapture.tsx`

**Interfaces:**
- Produces: `compressImage(file: File, maxDim=1200, quality=0.7): Promise<Blob>`; `<SignaturePad onChange={(blob: Blob|null)=>void} />`; `<PhotoCapture label tipo onCapture={(blob: Blob)=>void} />`.

- [ ] **Step 1: Implement `lib/image.ts`:**

```typescript
export async function compressImage(file: File, maxDim = 1200, quality = 0.7): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality));
}
```

- [ ] **Step 2: Implement `components/SignaturePad.tsx`** — a touch canvas that captures strokes and emits a PNG Blob:

```tsx
import { useEffect, useRef } from "react";

export function SignaturePad({ onChange }: { onChange: (b: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    c.width = c.offsetWidth; c.height = 180;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#e8faff";
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => { drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { if (!drawing.current) return; drawing.current = false; c.toBlob((b) => onChange(b), "image/png"); };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [onChange]);
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange(null); };
  return (
    <div>
      <canvas ref={ref} className="w-full touch-none rounded-lg border border-line bg-bg-sunken" />
      <button type="button" onClick={clear} className="mt-2 text-xs text-ink-muted hover:text-ink">Limpiar firma</button>
    </div>
  );
}
```

- [ ] **Step 3: Implement `components/PhotoCapture.tsx`** — file input with `capture="environment"`, preview, retry; compresses on select:

```tsx
import { useState } from "react";
import { compressImage } from "../lib/image";

export function PhotoCapture({ label, onCapture }: { label: string; onCapture: (b: Blob | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const blob = await compressImage(f);
    setPreview(URL.createObjectURL(blob));
    onCapture(blob);
  };
  return (
    <div className="rounded-lg border border-line p-3">
      <span className="field-label">{label}</span>
      {preview ? (
        <img src={preview} alt={label} className="mt-2 max-h-40 rounded-lg" />
      ) : null}
      <label className="mt-2 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-line py-6 text-sm text-ink-muted">
        {preview ? "Volver a tomar" : "Tomar foto"}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Build check.** `cd frontend && npm run build`

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/modules/militantes/lib/image.ts frontend/src/modules/militantes/components/SignaturePad.tsx frontend/src/modules/militantes/components/PhotoCapture.tsx
git commit -m "feat(militantes): capture helpers — image compression, signature pad, photo capture"
```

---

## Task 13: Capture wizard page (3 steps + submit flow)

**Files:**
- Create: `frontend/src/modules/militantes/CapturaMilitantePage.tsx`

**Interfaces:**
- Consumes: `createMilitante`, `uploadDocumento`, `SignaturePad`, `PhotoCapture`, `useOnlineStatus`, `getPerfil`.
- Produces: default-exported page component `CapturaMilitantePage`.

- [ ] **Step 1: Implement** the page. Structure (full form fields per spec §5):
  - Local `step` state (1|2|3) + `form` state object with all `MilitanteCreate` fields + three Blob refs (`frente`, `reverso`, `firma`).
  - **Online guard:** if `!useOnlineStatus()`, render a card "Necesitas conexión para afiliar" instead of the form.
  - **Step 1 (Identidad):** nombre*, CURP (18, uppercase, live length hint), clave_elector (18), fecha_nacimiento (date input), sexo (M/F toggle buttons like CapturaPage), seccion. "Siguiente" disabled until nombre.length>1.
  - **Step 2 (Contacto/domicilio):** calle_numero, colonia, cp, municipio (default "San Mateo Atenco"), telefono, email, es_activista (toggle), estructura, promotor. Back/Next buttons.
  - **Step 3 (Documentos/firma):** `<PhotoCapture label="Credencial — frente" onCapture={b=>setFrente(b)} />`, same for reverso, `<SignaturePad onChange={setFirma} />`, consent checkbox + privacy notice text (reuse copy from CapturaPage), live quality hints ("Falta reverso" etc., non-blocking).
  - **Submit:** `canSubmit = nombre>1 && consentimiento`. On submit: `createMilitante(payload)` → get `{id, folio}` → sequentially `uploadDocumento(id,"frente",frente)` (and reverso/firma if present) with a progress indicator → success screen showing the returned `folio` + "Registrar otro" (resets state).
  - Wrap in `AppLayout` + `PageHeader` (eyebrow "Afiliación", title "Registro de", accent "Militante").
  - Show `submitError` on failure; keep the created id so a failed photo upload can be retried without re-creating.

Use existing utility classes (`field-input`, `field-label`, `btn-primary`, `card-premium`, `pill`, `metric-chip`) for consistency.

- [ ] **Step 2: Build check.** `cd frontend && npm run build`

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/modules/militantes/CapturaMilitantePage.tsx
git commit -m "feat(militantes): 3-step capture wizard (identidad/contacto/documentos)"
```

---

## Task 14: Lucy dashboard page (4 blocks)

**Files:**
- Create: `frontend/src/modules/militantes/PanoramaMilitantesPage.tsx`

**Interfaces:**
- Consumes: `getPanorama`, `useAsync`, `DataState`, `AnimatedNumber`, `Sparkline`, chart primitives (`components/charts/StackedBars` or similar existing).
- Produces: default-exported `PanoramaMilitantesPage`.

- [ ] **Step 1: Implement** the dashboard. Four blocks fed by `useAsync(getPanorama, [])`:
  1. **Avance:** KPI row via `metric-chip`/`AnimatedNumber` — total, % validados (`validados/total`), ritmo 7/30. If `kpis.meta` set, a progress bar `total/meta`; else omit the bar.
  2. **Por sección (SMA):** sortable table (`seccion`, `militantes`, `lista_nominal`, `prioridad` as a colored `pill`, `promovidos`). Optionally a mini bar per row (`militantes` vs `promovidos`).
  3. **Por activista:** ranked table (`nombre`, `militantes`, `con_banderas`).
  4. **Militantes vs promovidos:** stacked/paired bars per section using the existing chart primitive (reuse `frontend/src/components/charts/StackedBars` if present; else simple flex bars).
  - `AppLayout` + `PageHeader` (eyebrow "Afiliación", title "Panorama de", accent "Militantes").
  - Wrap each block in `DataState` for loading/error/empty; empty → "Aún no hay militantes registrados".

- [ ] **Step 2: Build check.** `cd frontend && npm run build`

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/modules/militantes/PanoramaMilitantesPage.tsx
git commit -m "feat(militantes): Lucy dashboard — avance/sección/activista/vs-promovidos"
```

---

## Task 15: Militante list + detail drawer (validate/observe)

**Files:**
- Create: `frontend/src/modules/militantes/MilitantesListPage.tsx`
- Create: `frontend/src/modules/militantes/components/MilitanteDetail.tsx`

**Interfaces:**
- Consumes: `listMilitantes`, `getMilitante`, `revealMilitante`, `setEstado`.
- Produces: `MilitantesListPage` (default export), `<MilitanteDetail id onClose onChanged />`.

- [ ] **Step 1: Implement list page** — filters (seccion, estado select, activista, flag select, q), paginated table of `MilitanteRead` (folio, nombre, seccion, estado pill with color: REGISTRADO=neutral, VALIDADO=success, OBSERVADO=warning, quality-flag dots). Row click opens `MilitanteDetail`.

- [ ] **Step 2: Implement detail drawer** — shows masked fields; a "Ver documentos / datos" button calls `revealMilitante(id)` (audited) and renders the presigned photo URLs + cleartext CURP/clave; **Validar** / **Observar** buttons (COORDINADOR+) call `setEstado`. On change, call `onChanged()` to refresh the list. Guard reveal/validate UI behind role (hide for activista; backend already enforces 403).

- [ ] **Step 3: Build check.** `cd frontend && npm run build`

- [ ] **Step 4: Commit.**

```bash
git add frontend/src/modules/militantes/MilitantesListPage.tsx frontend/src/modules/militantes/components/MilitanteDetail.tsx
git commit -m "feat(militantes): list + detail drawer with validate/observe + audited reveal"
```

---

## Task 16: Register modules in registry.ts

**Files:**
- Modify: `frontend/src/modules/registry.ts`

**Interfaces:**
- Consumes: the three pages (lazy imports).

- [ ] **Step 1: Add lazy imports + module defs.** Add a suitable icon import (e.g. `VotersIcon` or `UserIcon`). Register:
  - `/militantes/captura` → `CapturaMilitantePage`, section `ciudadania`, state `active`, roles `CONSOLE_COORD` (superadmin/admin/coordinador/lider) **+ activista/capturista** — define a `CONSOLE_CAPTURA` role set = `["superadmin","admin","coordinador","lider","activista","capturista"]` for the capture route.
  - `/militantes` → `PanoramaMilitantesPage`, section `ciudadania`, state `active`, roles `CONSOLE_COORD`, `end: true`.
  - `/militantes/lista` → `MilitantesListPage`, section `ciudadania`, state `active`, roles `CONSOLE_COORD`.
  - Labels: "Afiliar militante", "Panorama afiliación", "Padrón de militantes".

- [ ] **Step 2: Build + tests.** `cd frontend && rm -rf dist *.tsbuildinfo && npm run build && npm run test`

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/modules/registry.ts
git commit -m "feat(militantes): register capture + dashboard + list modules"
```

---

## Task 17: frontend-design pass

**Files:**
- Modify: the three page components + components as needed.

- [ ] **Step 1: Invoke the `frontend-design` skill** and apply an intentional visual pass to the militantes module: KPI de avance as hero, accessible color semantics for `estado` (registrado/validado/observado) and quality flags, wizard progress indicator + microinteractions, large touch affordances for the camera/signature (one-handed field use). Keep the "Command Center" black + cyan/amber system. Do NOT invent a new palette; use existing tokens.

- [ ] **Step 2: Build + tests.** `cd frontend && rm -rf dist *.tsbuildinfo && npm run build && npm run test`

- [ ] **Step 3: Commit.**

```bash
git add frontend/src
git commit -m "style(militantes): frontend-design pass — hero avance, estado semantics, field affordances"
```

---

## Task 18: Wire bucket vars + end-to-end verification

**Files:** none (ops + manual verify).

- [ ] **Step 1: Set bucket vars on the Agora service** (triggers deploy). Using the Railway dashboard auto-inject for `agora-uploads`, or CLI reference variables (never materialize the secret):

```bash
# account session (project token lacks provisioning rights)
railway variables --set 'BUCKET_ENDPOINT=${{agora-uploads.ENDPOINT}}' \
  --set 'BUCKET_ACCESS_KEY_ID=${{agora-uploads.ACCESS_KEY_ID}}' \
  --set 'BUCKET_SECRET_ACCESS_KEY=${{agora-uploads.SECRET_ACCESS_KEY}}' \
  --set 'BUCKET_NAME=${{agora-uploads.BUCKET_NAME}}' --service Agora
```

> Confirm the exact reference keys with `railway bucket info`/dashboard; the auto-inject UI writes them for you. Verify the app booted (login 200) and that `storage_enabled()` is true (a create+upload smoke on staging or via the demo activista).

- [ ] **Step 2: Merge + deploy.** Merge `feat/registro-militantes` → `main` (auto-deploys; bootstrap runs Alembic 0015). Verify a login + `GET /api/militantes/panorama` as Lucy returns 200.

- [ ] **Step 3: Verify (verify skill).** Use the `verify` skill / `/run` to drive: activista logs in → afilia un militante con foto+firma → aparece en el panorama de Lucy con el folio; Lucy valida uno.

---

## Self-Review notes (author)

- **Spec coverage:** model+migration (T2), storage (T1), 7 endpoints (T9), scoping (T5), validate/reveal (T6), documents (T7), panorama 4 blocks (T8/T14), capture wizard (T12/T13), retention (T10), registry (T16), frontend-design (T17), meta_afiliacion (T2), folio (T4). All spec §2–§8 mapped.
- **Type consistency:** `estado_domicilio` (domicile) vs `estado` (status) disambiguated in model, schema, migration. Transient attrs `activista_nombre/tiene_frente/tiene_reverso/tiene_firma` set in service+router before serialization. `_next_folio` format `SMA-{year}-{n:05d}` consistent with tests.
- **Known adaptation points flagged inline:** exact `down_revision` id, `privacy_service.record_acceptance` signature generalization, existing test-fixture names for auth clients/contexts, `retention_service` purge fn name. These require reading the referenced file at implementation time and are called out at each task.
