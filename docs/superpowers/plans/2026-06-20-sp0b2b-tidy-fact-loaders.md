# SP0b-2b Tidy Fact Loaders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four batch-ingested reference-fact loaders — ElectionResult, SocioMetric, DENUE economic_units, and casilla points — on top of the existing SP0b-1/2a ingestion engine, plus read APIs and frontend wiring.

**Architecture:** Three new global tidy/columnar tables (`election_results`, `socio_metrics`, `economic_units`) + casillas reused as `electoral_areas` rows at `level=CASILLA`. No core engine change: add `DatasetSpec`s, mappers, a shared dialect-safe Point helper, `area_id` resolution maps, CLI subcommands, read routers/services (election results derive participación/abstención/margen at query time), and frontend module wiring.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL/PostGIS (psycopg3) + SQLite (tests), geoalchemy2, Vite/React/TS.

## Global Constraints

- **Enum labels = SQLAlchemy member NAMES (UPPERCASE).** These tables use **no** PG ENUM types, but any `AreaLevel` usage (casillas) MUST use `AreaLevel.CASILLA` (the enum object), never a raw string.
- **Alembic migrations:** use `_index_exists()`/`_table_exists()` pre-checks — **never** `try/except` around `create_index` (a swallowed error aborts the whole PG transaction). Geometry is dialect-safe: `geoalchemy2 Geometry` on PG, `Text` on SQLite. No `sa.Enum(create_type=False)` in `op.create_table` (use `postgresql.ENUM(create_type=False)` if ever needed — not needed here).
- **All four datasets are GLOBAL reference data:** `organization_id = NULL`. Every fact row carries `ingest_run_id`; `area_id` is nullable and resolved later.
- **Derived metrics are NEVER stored** — computed at query time in a service.
- **No silent drops / no unconditional DELETE:** rely on the engine's existing `validate_rows` discards + `scope_filter` empty-guard.
- **Model geometry pattern:** branch at import time on `settings.DATABASE_URL.startswith("sqlite")` → `Text()` else `Geometry(geometry_type="POINT", srid=4326)` (mirrors `electoral_area.py`).
- Spec: `docs/superpowers/specs/2026-06-20-sp0b2b-tidy-fact-loaders-design.md`.

---

### Task 1: Fact models (ElectionResult, SocioMetric, EconomicUnit)

**Files:**
- Create: `backend/app/models/election_result.py`
- Create: `backend/app/models/socio.py`
- Create: `backend/app/models/economic_unit.py`
- Modify: `backend/app/models/__init__.py` (register the 3 models on `Base.metadata`)
- Modify: `backend/tests/conftest.py` (add the 3 tables to `create_all(tables=[...])`)
- Test: `backend/tests/test_sp0b2b_models.py`

**Interfaces:**
- Produces: `ElectionResult` (cols: `id, organization_id, ingest_run_id, anio:int, nivel:str, territory_code:str, area_id, eleccion:str, partido:str, votos:Numeric` + AuditMixin), `SocioMetric` (cols: `id, organization_id, ingest_run_id, anio:int, nivel:str, territory_code:str, area_id, indicador:str, valor:Numeric`), `EconomicUnit` (cols: `id, organization_id, ingest_run_id, clave:str, nombre:str, actividad, actividad_desc, estrato, territory_code:str, area_id, lat:Numeric, lon:Numeric, geometry`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sp0b2b_models.py
from app.models.election_result import ElectionResult
from app.models.socio import SocioMetric
from app.models.economic_unit import EconomicUnit
from tests.conftest import TestingSessionLocal


def test_models_persist_and_read():
    db = TestingSessionLocal()
    try:
        db.add(ElectionResult(anio=2021, nivel="municipio", territory_code="15001",
                              eleccion="ayuntamiento", partido="MORENA", votos=1234))
        db.add(SocioMetric(anio=2020, nivel="municipio", territory_code="15001",
                           indicador="marginacion", valor=0.42))
        db.add(EconomicUnit(clave="DENUE-1", nombre="Tienda", territory_code="15001",
                            lat=19.4, lon=-99.1))
        db.commit()
        assert db.query(ElectionResult).count() == 1
        assert db.query(SocioMetric).filter_by(indicador="marginacion").one().valor == 0.42
        assert db.query(EconomicUnit).one().clave == "DENUE-1"
    finally:
        db.rollback()
        db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_sp0b2b_models.py -v`
Expected: FAIL — `ModuleNotFoundError: app.models.election_result`.

- [ ] **Step 3: Create the three models**

```python
# backend/app/models/election_result.py
"""Election results — tidy global reference facts (row per territory+election+party)."""
from __future__ import annotations
from typing import Optional
from sqlalchemy import ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.base import AuditMixin, UUIDMixin


class ElectionResult(UUIDMixin, AuditMixin, Base):
    __tablename__ = "election_results"
    __table_args__ = (
        Index("ix_election_lookup", "anio", "nivel", "territory_code", "eleccion", "partido"),
    )
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )
    ingest_run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ingest_runs.id", ondelete="SET NULL"), index=True, nullable=True
    )
    anio: Mapped[int] = mapped_column(Integer, nullable=False)
    nivel: Mapped[str] = mapped_column(String(20), nullable=False)
    territory_code: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    area_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    eleccion: Mapped[str] = mapped_column(String(40), nullable=False)
    partido: Mapped[str] = mapped_column(String(40), nullable=False)
    votos: Mapped[float] = mapped_column(Numeric, nullable=False)
```

```python
# backend/app/models/socio.py
"""Socioeconomic metrics — tidy global reference facts (row per territory+indicator)."""
from __future__ import annotations
from typing import Optional
from sqlalchemy import ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
from app.models.base import AuditMixin, UUIDMixin


class SocioMetric(UUIDMixin, AuditMixin, Base):
    __tablename__ = "socio_metrics"
    __table_args__ = (Index("ix_socio_lookup", "nivel", "territory_code", "indicador", "anio"),)
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )
    ingest_run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ingest_runs.id", ondelete="SET NULL"), index=True, nullable=True
    )
    anio: Mapped[int] = mapped_column(Integer, nullable=False)
    nivel: Mapped[str] = mapped_column(String(20), nullable=False)
    territory_code: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    area_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    indicador: Mapped[str] = mapped_column(String(60), nullable=False)
    valor: Mapped[float] = mapped_column(Numeric, nullable=False)
```

```python
# backend/app/models/economic_unit.py
"""DENUE economic units — columnar facts with a Point geometry from file lat/lon."""
from __future__ import annotations
from typing import Any, Optional
from sqlalchemy import ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column
from geoalchemy2 import Geometry
from app.core.config import settings
from app.database import Base
from app.models.base import AuditMixin, UUIDMixin

if settings.DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import Text
    _POINT_TYPE: Any = Text()
else:
    _POINT_TYPE = Geometry(geometry_type="POINT", srid=4326)


class EconomicUnit(UUIDMixin, AuditMixin, Base):
    __tablename__ = "economic_units"
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )
    ingest_run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ingest_runs.id", ondelete="SET NULL"), index=True, nullable=True
    )
    clave: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(300), nullable=False)
    actividad: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    actividad_desc: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    estrato: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    territory_code: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    area_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("electoral_areas.id", ondelete="SET NULL"), index=True, nullable=True
    )
    lat: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    lon: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    geometry: Mapped[Optional[Any]] = mapped_column(_POINT_TYPE, nullable=True)
```

- [ ] **Step 4: Register models + conftest tables**

In `backend/app/models/__init__.py` add imports (match existing style):
```python
from app.models.election_result import ElectionResult  # noqa: F401
from app.models.socio import SocioMetric  # noqa: F401
from app.models.economic_unit import EconomicUnit  # noqa: F401
```
In `backend/tests/conftest.py` add the imports near the other model imports and append to the `create_all(tables=[...])` list:
```python
from app.models.election_result import ElectionResult
from app.models.socio import SocioMetric
from app.models.economic_unit import EconomicUnit
# ... inside tables=[ ... ]:
        ElectionResult.__table__,
        SocioMetric.__table__,
        EconomicUnit.__table__,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_sp0b2b_models.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/election_result.py backend/app/models/socio.py backend/app/models/economic_unit.py backend/app/models/__init__.py backend/tests/conftest.py backend/tests/test_sp0b2b_models.py
git commit -m "feat(sp0b2b): ElectionResult, SocioMetric, EconomicUnit models"
```

---

### Task 2: Alembic 0007 migration

**Files:**
- Create: `backend/alembic/versions/0007_tidy_facts.py`
- Test: `backend/tests/test_sp0b2b_migration.py`

**Interfaces:**
- Consumes: revision chain head `0006`.
- Produces: revision `0007` creating `election_results`, `socio_metrics`, `economic_units`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sp0b2b_migration.py
import os, tempfile
from alembic import command
from alembic.config import Config
import sqlalchemy as sa


def _cfg(url):
    bd = os.path.join(os.path.dirname(__file__), "..")
    cfg = Config(os.path.join(bd, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(bd, "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def test_alembic_roundtrip_0007():
    fd, path = tempfile.mkstemp(suffix=".db"); os.close(fd)
    url = f"sqlite:///{path}"
    os.environ["DATABASE_URL"] = url
    try:
        cfg = _cfg(url)
        command.upgrade(cfg, "head")
        e = sa.create_engine(url)
        with e.connect() as c:
            assert c.execute(sa.text("SELECT version_num FROM alembic_version")).scalar() == "0007"
            insp = sa.inspect(e)
            for t in ("election_results", "socio_metrics", "economic_units"):
                assert t in insp.get_table_names()
        command.downgrade(cfg, "0006"); command.upgrade(cfg, "head")
    finally:
        os.remove(path)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_sp0b2b_migration.py -v`
Expected: FAIL — head is `0006`, tables absent / version != `0007`.

- [ ] **Step 3: Write the migration**

```python
# backend/alembic/versions/0007_tidy_facts.py
"""SP0b-2b tidy fact tables: election_results, socio_metrics, economic_units.

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-20

No PG ENUM types here (all str/numeric) so the enum bugs fixed in the prod
recovery do not apply. Geometry is dialect-branched (PostGIS POINT on PG, Text
on SQLite). Idempotent via _table_exists/_index_exists pre-checks.
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def _now_default(is_pg: bool):
    return sa.text("now()") if is_pg else sa.text("(datetime('now'))")


def _audit_cols(now):
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=now, nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("updated_by", sa.String(36), nullable=True),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    now = _now_default(is_pg)
    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(bind)
    existing = set(insp.get_table_names())

    def _table_exists(n):
        return n in existing

    def _index_exists(table, name):
        if table not in existing:
            return False
        return any(ix["name"] == name for ix in insp.get_indexes(table))

    if is_pg:
        from geoalchemy2 import Geometry
        point_type = Geometry(geometry_type="POINT", srid=4326)
    else:
        point_type = sa.Text()

    # ── election_results ──────────────────────────────────────────────────────
    if not _table_exists("election_results"):
        op.create_table(
            "election_results",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("organization_id", sa.String(36),
                      sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
            sa.Column("ingest_run_id", sa.String(36),
                      sa.ForeignKey("ingest_runs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("anio", sa.Integer(), nullable=False),
            sa.Column("nivel", sa.String(20), nullable=False),
            sa.Column("territory_code", sa.String(40), nullable=False),
            sa.Column("area_id", sa.String(36),
                      sa.ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True),
            sa.Column("eleccion", sa.String(40), nullable=False),
            sa.Column("partido", sa.String(40), nullable=False),
            sa.Column("votos", sa.Numeric(), nullable=False),
            *_audit_cols(now),
        )
    for tbl, name, cols in [
        ("election_results", "ix_election_results_organization_id", ["organization_id"]),
        ("election_results", "ix_election_results_ingest_run_id", ["ingest_run_id"]),
        ("election_results", "ix_election_results_territory_code", ["territory_code"]),
        ("election_results", "ix_election_results_area_id", ["area_id"]),
        ("election_results", "ix_election_lookup",
         ["anio", "nivel", "territory_code", "eleccion", "partido"]),
    ]:
        if not _index_exists(tbl, name):
            op.create_index(name, tbl, cols)

    # ── socio_metrics ─────────────────────────────────────────────────────────
    if not _table_exists("socio_metrics"):
        op.create_table(
            "socio_metrics",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("organization_id", sa.String(36),
                      sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
            sa.Column("ingest_run_id", sa.String(36),
                      sa.ForeignKey("ingest_runs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("anio", sa.Integer(), nullable=False),
            sa.Column("nivel", sa.String(20), nullable=False),
            sa.Column("territory_code", sa.String(40), nullable=False),
            sa.Column("area_id", sa.String(36),
                      sa.ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True),
            sa.Column("indicador", sa.String(60), nullable=False),
            sa.Column("valor", sa.Numeric(), nullable=False),
            *_audit_cols(now),
        )
    for tbl, name, cols in [
        ("socio_metrics", "ix_socio_metrics_organization_id", ["organization_id"]),
        ("socio_metrics", "ix_socio_metrics_ingest_run_id", ["ingest_run_id"]),
        ("socio_metrics", "ix_socio_metrics_territory_code", ["territory_code"]),
        ("socio_metrics", "ix_socio_metrics_area_id", ["area_id"]),
        ("socio_metrics", "ix_socio_lookup", ["nivel", "territory_code", "indicador", "anio"]),
    ]:
        if not _index_exists(tbl, name):
            op.create_index(name, tbl, cols)

    # ── economic_units ────────────────────────────────────────────────────────
    if not _table_exists("economic_units"):
        op.create_table(
            "economic_units",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("organization_id", sa.String(36),
                      sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
            sa.Column("ingest_run_id", sa.String(36),
                      sa.ForeignKey("ingest_runs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("clave", sa.String(40), nullable=False),
            sa.Column("nombre", sa.String(300), nullable=False),
            sa.Column("actividad", sa.String(20), nullable=True),
            sa.Column("actividad_desc", sa.String(300), nullable=True),
            sa.Column("estrato", sa.String(60), nullable=True),
            sa.Column("territory_code", sa.String(40), nullable=False),
            sa.Column("area_id", sa.String(36),
                      sa.ForeignKey("electoral_areas.id", ondelete="SET NULL"), nullable=True),
            sa.Column("lat", sa.Numeric(), nullable=True),
            sa.Column("lon", sa.Numeric(), nullable=True),
            sa.Column("geometry", point_type, nullable=True),
            *_audit_cols(now),
        )
    for tbl, name, cols in [
        ("economic_units", "ix_economic_units_organization_id", ["organization_id"]),
        ("economic_units", "ix_economic_units_ingest_run_id", ["ingest_run_id"]),
        ("economic_units", "ix_economic_units_clave", ["clave"]),
        ("economic_units", "ix_economic_units_territory_code", ["territory_code"]),
        ("economic_units", "ix_economic_units_area_id", ["area_id"]),
    ]:
        if not _index_exists(tbl, name):
            op.create_index(name, tbl, cols)


def downgrade() -> None:
    op.drop_table("economic_units")
    op.drop_table("socio_metrics")
    op.drop_table("election_results")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_sp0b2b_migration.py -v`
Expected: PASS (`version_num == 0007`, 3 tables present, round-trip clean).

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/0007_tidy_facts.py backend/tests/test_sp0b2b_migration.py
git commit -m "feat(sp0b2b): Alembic 0007 — election_results, socio_metrics, economic_units"
```

---

### Task 3: Tabular mappers + specs (resultados, socio)

**Files:**
- Modify: `backend/app/ingestion/datasets.py`
- Test: `backend/tests/test_sp0b2b_datasets_tabular.py`

**Interfaces:**
- Consumes: `ColumnSpec`, `DatasetSpec`, models from Task 1, `ctx`/`run`/`extra` engine contract (`row_mapper(row, ctx, run, extra, db=None)`).
- Produces: `DATASETS["resultados"]`, `DATASETS["socio"]`. Mappers `_resultados_mapper`, `_socio_mapper`; scopes `_resultados_scope`, `_socio_scope`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sp0b2b_datasets_tabular.py
import types
from app.ingestion.datasets import DATASETS


def _ctx(org=None):
    return types.SimpleNamespace(organization_id=org, campaign_id=None,
                                 user=types.SimpleNamespace(id="t"))


def _run():
    return types.SimpleNamespace(id="run-1")


def test_resultados_mapper_maps_row():
    spec = DATASETS["resultados"]
    row = {"nivel": "municipio", "clave": "15001", "partido": "MORENA", "votos": 1234}
    out = spec.row_mapper(row, _ctx(), _run(), {"anio": 2021, "eleccion": "ayuntamiento"})
    assert out["anio"] == 2021 and out["eleccion"] == "ayuntamiento"
    assert out["territory_code"] == "15001" and out["partido"] == "MORENA"
    assert out["votos"] == 1234 and out["organization_id"] is None
    assert out["ingest_run_id"] == "run-1"


def test_resultados_requires_anio_and_eleccion():
    spec = DATASETS["resultados"]
    row = {"nivel": "municipio", "clave": "15001", "partido": "X", "votos": 1}
    import pytest
    with pytest.raises(ValueError):
        spec.row_mapper(row, _ctx(), _run(), {"eleccion": "ayuntamiento"})
    with pytest.raises(ValueError):
        spec.row_mapper(row, _ctx(), _run(), {"anio": 2021})


def test_socio_mapper_maps_row():
    spec = DATASETS["socio"]
    row = {"nivel": "municipio", "clave": "15001", "indicador": "marginacion", "valor": 0.42}
    out = spec.row_mapper(row, _ctx(), _run(), {"anio": 2020})
    assert out["indicador"] == "marginacion" and out["valor"] == 0.42
    assert out["territory_code"] == "15001" and out["anio"] == 2020


def test_resultados_scope_requires_keys():
    spec = DATASETS["resultados"]
    clauses = spec.scope_filter(spec.model, _ctx(), {"anio": 2021, "eleccion": "ayuntamiento", "nivel": "municipio"})
    assert clauses  # non-empty
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_sp0b2b_datasets_tabular.py -v`
Expected: FAIL — `KeyError: 'resultados'`.

- [ ] **Step 3: Add mappers, scopes, and specs to `datasets.py`**

Add imports at top:
```python
from app.models.election_result import ElectionResult
from app.models.socio import SocioMetric
```
Add before the `DATASETS` dict literal:
```python
def _resultados_mapper(row, ctx, run, extra, db=None):
    if extra.get("anio") in (None, ""):
        raise ValueError("resultados dataset requires 'anio' in extra")
    if extra.get("eleccion") in (None, ""):
        raise ValueError("resultados dataset requires 'eleccion' in extra")
    return dict(
        organization_id=ctx.organization_id,
        ingest_run_id=run.id,
        anio=int(extra["anio"]),
        nivel=row["nivel"],
        territory_code=str(row["clave"]),
        eleccion=str(extra["eleccion"]),
        partido=str(row["partido"]),
        votos=row["votos"],
    )


def _resultados_scope(model, ctx, extra):
    if extra.get("anio") in (None, "") or extra.get("eleccion") in (None, ""):
        raise ValueError("resultados --replace requires 'anio' and 'eleccion'")
    org_clause = (model.organization_id.is_(None) if ctx.organization_id is None
                  else model.organization_id == ctx.organization_id)
    clauses = [org_clause, model.anio == int(extra["anio"]),
               model.eleccion == str(extra["eleccion"])]
    if extra.get("nivel"):
        clauses.append(model.nivel == str(extra["nivel"]))
    return clauses


def _socio_mapper(row, ctx, run, extra, db=None):
    if extra.get("anio") in (None, ""):
        raise ValueError("socio dataset requires 'anio' in extra")
    return dict(
        organization_id=ctx.organization_id,
        ingest_run_id=run.id,
        anio=int(extra["anio"]),
        nivel=row["nivel"],
        territory_code=str(row["clave"]),
        indicador=row["indicador"],
        valor=row["valor"],
    )


def _socio_scope(model, ctx, extra):
    if extra.get("anio") in (None, ""):
        raise ValueError("socio --replace requires 'anio'")
    org_clause = (model.organization_id.is_(None) if ctx.organization_id is None
                  else model.organization_id == ctx.organization_id)
    clauses = [org_clause, model.anio == int(extra["anio"])]
    if extra.get("nivel"):
        clauses.append(model.nivel == str(extra["nivel"]))
    return clauses
```
Add to the `DATASETS` dict (new entries):
```python
DATASETS["resultados"] = DatasetSpec(
    key="resultados",
    model=ElectionResult,
    columns=[
        ColumnSpec("nivel", required=True),
        ColumnSpec("clave", required=True),
        ColumnSpec("partido", required=True),
        ColumnSpec("votos", required=True, coerce="number"),
    ],
    row_mapper=_resultados_mapper,
    scope_filter=_resultados_scope,
)

DATASETS["socio"] = DatasetSpec(
    key="socio",
    model=SocioMetric,
    columns=[
        ColumnSpec("nivel", required=True),
        ColumnSpec("clave", required=True),
        ColumnSpec("indicador", required=True),
        ColumnSpec("valor", required=True, coerce="number"),
    ],
    row_mapper=_socio_mapper,
    scope_filter=_socio_scope,
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_sp0b2b_datasets_tabular.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingestion/datasets.py backend/tests/test_sp0b2b_datasets_tabular.py
git commit -m "feat(sp0b2b): resultados + socio dataset specs/mappers"
```

---

### Task 4: Point helper + geometry mappers (denue, casillas)

**Files:**
- Modify: `backend/app/ingestion/datasets.py`
- Test: `backend/tests/test_sp0b2b_datasets_point.py`

**Interfaces:**
- Consumes: `read_tabular`, `EconomicUnit`, `ElectoralArea`, `AreaLevel`.
- Produces: `_point_geometry(lon, lat, db)`, `DATASETS["denue"]`, `DATASETS["casillas"]`, mappers `_denue_mapper`, `_casillas_mapper`, scopes `_denue_scope`, `_casillas_scope`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sp0b2b_datasets_point.py
import types, json
from app.ingestion.datasets import DATASETS, _point_geometry
from app.models.electoral_area import AreaLevel


def _ctx(org=None):
    return types.SimpleNamespace(organization_id=org, campaign_id=None,
                                 user=types.SimpleNamespace(id="t"))


def _run():
    return types.SimpleNamespace(id="run-1")


def test_point_geometry_sqlite_is_json_text():
    g = _point_geometry(-99.1, 19.4, db=None)  # no db → sqlite branch
    assert json.loads(g) == {"lon": -99.1, "lat": 19.4}
    assert _point_geometry(None, None, db=None) is None


def test_denue_mapper():
    spec = DATASETS["denue"]
    row = {"clave": "D1", "nombre": "Tienda", "actividad": "461110",
           "territory_code": "15001", "lon": -99.1, "lat": 19.4}
    out = spec.row_mapper(row, _ctx(), _run(), {})
    assert out["clave"] == "D1" and out["territory_code"] == "15001"
    assert out["lat"] == 19.4 and out["lon"] == -99.1
    assert out["geometry"] is not None and out["organization_id"] is None


def test_casillas_mapper_builds_electoral_area():
    spec = DATASETS["casillas"]
    row = {"code": "C-15001-B1", "name": "Básica 1", "lon": -99.1, "lat": 19.4}
    out = spec.row_mapper(row, _ctx(), _run(), {})
    assert out["level"] == AreaLevel.CASILLA
    assert out["code"] == "C-15001-B1" and out["organization_id"] is None
    assert out["geometry"] is not None


def test_casillas_scope_is_global_casilla():
    spec = DATASETS["casillas"]
    clauses = spec.scope_filter(spec.model, _ctx(), {})
    assert clauses
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_sp0b2b_datasets_point.py -v`
Expected: FAIL — `ImportError: _point_geometry` / `KeyError: 'denue'`.

- [ ] **Step 3: Add the helper, mappers, scopes, specs**

In `datasets.py` add imports:
```python
from app.models.economic_unit import EconomicUnit
```
(`ElectoralArea`, `AreaLevel`, `func`, `json` are already imported.)
Add the helper + mappers:
```python
def _point_geometry(lon, lat, db=None):
    """Dialect-safe POINT from lon/lat. PG → ST_SetSRID(ST_MakePoint…); else JSON text."""
    if lon in (None, "") or lat in (None, ""):
        return None
    lon, lat = float(lon), float(lat)
    dialect = db.get_bind().dialect.name if db is not None else "sqlite"
    if dialect == "postgresql":
        return func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    return json.dumps({"lon": lon, "lat": lat})


def _denue_mapper(row, ctx, run, extra, db=None):
    lon, lat = row.get("lon"), row.get("lat")
    return dict(
        organization_id=ctx.organization_id,
        ingest_run_id=run.id,
        clave=str(row["clave"]),
        nombre=str(row.get("nombre") or ""),
        actividad=(str(row["actividad"]) if row.get("actividad") not in (None, "") else None),
        actividad_desc=(str(row["actividad_desc"]) if row.get("actividad_desc") not in (None, "") else None),
        estrato=(str(row["estrato"]) if row.get("estrato") not in (None, "") else None),
        territory_code=str(row["territory_code"]),
        lat=(float(lat) if lat not in (None, "") else None),
        lon=(float(lon) if lon not in (None, "") else None),
        geometry=_point_geometry(lon, lat, db),
    )


def _denue_scope(model, ctx, extra):
    return [model.organization_id.is_(None) if ctx.organization_id is None
            else model.organization_id == ctx.organization_id]


def _casillas_mapper(row, ctx, run, extra, db=None):
    lon, lat = row.get("lon"), row.get("lat")
    return dict(
        organization_id=None,
        ingest_run_id=run.id,
        level=AreaLevel.CASILLA,
        name=str(row.get("name") or ""),
        code=(str(row["code"]) if row.get("code") not in (None, "") else None),
        geometry=_point_geometry(lon, lat, db),
    )


def _casillas_scope(model, ctx, extra):
    return [model.organization_id.is_(None), model.level == AreaLevel.CASILLA]
```
Register specs:
```python
DATASETS["denue"] = DatasetSpec(
    key="denue",
    model=EconomicUnit,
    columns=[
        ColumnSpec("clave", required=True),
        ColumnSpec("territory_code", required=True),
        ColumnSpec("lat", coerce="number"),
        ColumnSpec("lon", coerce="number"),
    ],
    row_mapper=_denue_mapper,
    scope_filter=_denue_scope,
)

DATASETS["casillas"] = DatasetSpec(
    key="casillas",
    model=ElectoralArea,
    columns=[ColumnSpec("code", required=True)],
    row_mapper=_casillas_mapper,
    scope_filter=_casillas_scope,
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_sp0b2b_datasets_point.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/ingestion/datasets.py backend/tests/test_sp0b2b_datasets_point.py
git commit -m "feat(sp0b2b): denue + casillas specs with dialect-safe Point geometry"
```

---

### Task 5: Engine integration + area_id resolution

**Files:**
- Modify: `scripts/ingest_file.py` (extend `_RESOLVE_DATASETS` + level maps)
- Test: `backend/tests/test_sp0b2b_engine.py`

**Interfaces:**
- Consumes: `run_ingest`, `resolve_area_ids`, `DATASETS`, models.
- Produces: `_RESOLVE_DATASETS` entries for `resultados`, `socio`, `denue` (each `(model, level_map)`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sp0b2b_engine.py
import types, tempfile, os
from tests.conftest import TestingSessionLocal
from app.ingestion.datasets import DATASETS
from app.ingestion.engine import run_ingest
from app.ingestion.resolve import resolve_area_ids
from app.models.election_result import ElectionResult
from app.models.electoral_area import ElectoralArea, AreaLevel


def _ctx():
    return types.SimpleNamespace(organization_id=None, campaign_id=None,
                                 user=types.SimpleNamespace(id="t"))


def _csv(text):
    fd, p = tempfile.mkstemp(suffix=".csv"); os.write(fd, text.encode()); os.close(fd)
    return p


def test_ingest_resultados_and_resolve_area_id():
    db = TestingSessionLocal()
    try:
        db.query(ElectionResult).delete(); db.query(ElectoralArea).delete()
        db.add(ElectoralArea(organization_id=None, level=AreaLevel.MUNICIPIO,
                             code="15001", name="Toluca"))
        db.commit()
        path = _csv("nivel,clave,partido,votos\nmunicipio,15001,MORENA,1234\nmunicipio,15001,PAN,900\n")
        res = run_ingest(db, _ctx(), DATASETS["resultados"], path, source=None,
                         extra={"anio": 2021, "eleccion": "ayuntamiento"})
        assert res.status == "success" and res.inserted == 2
        rr = resolve_area_ids(db, ElectionResult, {"municipio": AreaLevel.MUNICIPIO})
        assert rr.matched == 2 and rr.unmatched == 0
        assert all(r.area_id is not None for r in db.query(ElectionResult).all())
    finally:
        os.remove(path); db.rollback(); db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_sp0b2b_engine.py -v`
Expected: FAIL initially only if engine wiring is wrong; this test mainly proves the specs+resolve compose. If it passes already, still proceed to wire the CLI resolve maps in Step 3 (covered by Task 6 tests).

- [ ] **Step 3: Extend `_RESOLVE_DATASETS` in `scripts/ingest_file.py`**

Add imports near the existing model imports:
```python
from app.models.election_result import ElectionResult  # noqa: E402
from app.models.socio import SocioMetric  # noqa: E402
from app.models.economic_unit import EconomicUnit  # noqa: E402
```
Add level maps + entries after `_CENSUS_LEVEL_MAP`:
```python
_FACT_LEVEL_MAP = {
    "estado": AreaLevel.ESTADO,
    "municipio": AreaLevel.MUNICIPIO,
    "seccion": AreaLevel.SECCION,
}

_RESOLVE_DATASETS = {
    "census": (CensusMetric, _CENSUS_LEVEL_MAP),
    "resultados": (ElectionResult, _FACT_LEVEL_MAP),
    "socio": (SocioMetric, _FACT_LEVEL_MAP),
    "denue": (EconomicUnit, _FACT_LEVEL_MAP),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_sp0b2b_engine.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest_file.py backend/tests/test_sp0b2b_engine.py
git commit -m "feat(sp0b2b): engine integration test + resolve maps (resultados/socio/denue)"
```

---

### Task 6: CLI subcommands (resultados, socio, denue, casillas)

**Files:**
- Modify: `scripts/ingest_file.py` (add 4 subparsers + dispatch)
- Test: `backend/tests/test_sp0b2b_cli.py`

**Interfaces:**
- Consumes: `ingest()` (existing importable), `DATASETS`.
- Produces: argparse subcommands `resultados/socio/denue/casillas` mapping flags → `extra`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sp0b2b_cli.py
import importlib, tempfile, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))


def _csv(text, suffix=".csv"):
    fd, p = tempfile.mkstemp(suffix=suffix); os.write(fd, text.encode()); os.close(fd)
    return p


def test_cli_ingest_socio_importable(monkeypatch):
    ingest_file = importlib.import_module("ingest_file")
    path = _csv("nivel,clave,indicador,valor\nmunicipio,15001,pobreza,0.3\n")
    try:
        res = ingest_file.ingest(dataset="socio", file=path, source="CONEVAL",
                                 org=None, campaign=None, extra={"anio": 2020}, replace=False)
        assert res.status in ("success", "partial")
        assert res.inserted == 1
    finally:
        os.remove(path)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_sp0b2b_cli.py -v`
Expected: PASS already for `ingest()` (it's generic) — but proceed to add the argparse subcommands so the human-facing CLI works. If it fails on import, fix the path. The subcommand wiring below is verified by manual smoke in Step 4.

- [ ] **Step 3: Add subparsers + dispatch in `main()`**

After the `geometria` subparser block, add:
```python
    # ── resultados ────────────────────────────────────────────────────────────
    res_p = subparsers.add_parser("resultados", help="Ingest election results CSV")
    res_p.add_argument("--file", required=True)
    res_p.add_argument("--source", required=True)
    res_p.add_argument("--org", dest="org", default=None)
    res_p.add_argument("--anio", type=int, required=True)
    res_p.add_argument("--eleccion", required=True,
                       help="Election identity, e.g. presidencia / diputaciones_federales")
    res_p.add_argument("--nivel", default=None, help="Optional nivel for --replace scope")
    res_p.add_argument("--replace", action="store_true")

    # ── socio ─────────────────────────────────────────────────────────────────
    soc_p = subparsers.add_parser("socio", help="Ingest socioeconomic metrics CSV")
    soc_p.add_argument("--file", required=True)
    soc_p.add_argument("--source", required=True)
    soc_p.add_argument("--org", dest="org", default=None)
    soc_p.add_argument("--anio", type=int, required=True)
    soc_p.add_argument("--nivel", default=None)
    soc_p.add_argument("--replace", action="store_true")

    # ── denue ─────────────────────────────────────────────────────────────────
    den_p = subparsers.add_parser("denue", help="Ingest DENUE economic units CSV (lat/lon)")
    den_p.add_argument("--file", required=True)
    den_p.add_argument("--source", required=True)
    den_p.add_argument("--org", dest="org", default=None)
    den_p.add_argument("--replace", action="store_true")

    # ── casillas ──────────────────────────────────────────────────────────────
    cas_p = subparsers.add_parser("casillas", help="Ingest casilla points as electoral_areas")
    cas_p.add_argument("--file", required=True)
    cas_p.add_argument("--source", required=True)
    cas_p.add_argument("--replace", action="store_true")
```
In the `args.dataset == ...` dispatch chain add:
```python
    elif args.dataset == "resultados":
        ingest(dataset="resultados", file=args.file, source=args.source, org=args.org,
               campaign=None, extra={"anio": args.anio, "eleccion": args.eleccion,
                                     "nivel": args.nivel}, replace=args.replace)
    elif args.dataset == "socio":
        ingest(dataset="socio", file=args.file, source=args.source, org=args.org,
               campaign=None, extra={"anio": args.anio, "nivel": args.nivel},
               replace=args.replace)
    elif args.dataset == "denue":
        ingest(dataset="denue", file=args.file, source=args.source, org=args.org,
               campaign=None, extra={}, replace=args.replace)
    elif args.dataset == "casillas":
        ingest(dataset="casillas", file=args.file, source=args.source, org=None,
               campaign=None, extra={}, replace=args.replace)
```

- [ ] **Step 4: Run test + manual smoke**

Run: `cd backend && python -m pytest tests/test_sp0b2b_cli.py -v` → PASS.
Manual: `python scripts/ingest_file.py resultados --help` → shows the flags without error.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest_file.py backend/tests/test_sp0b2b_cli.py
git commit -m "feat(sp0b2b): CLI subcommands resultados/socio/denue/casillas"
```

---

### Task 7: Resultados service (derived metrics) + router

**Files:**
- Create: `backend/app/services/resultados_service.py`
- Create: `backend/app/routers/resultados.py`
- Modify: `backend/app/main.py` (include the router)
- Test: `backend/tests/test_sp0b2b_resultados_api.py`

**Interfaces:**
- Consumes: `ElectionResult`, `DbSession`, `Tenant` from `app.dependencies`.
- Produces: `resultados_service.list_results(db, org_id, anio, nivel, territory_code, eleccion)` → list of dicts; `resultados_service.derived(db, org_id, anio, nivel, territory_code, eleccion)` → `{"participacion","abstencion","margen","ganador","total_votos","lista_nominal"}`.

Sentinel partido codes: `_LISTA_NOMINAL`, `_TOTAL`, `_NULOS`, `_NO_REGISTRADAS` (define as a module constant `SENTINELS`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sp0b2b_resultados_api.py
from tests.conftest import TestingSessionLocal
from app.models.election_result import ElectionResult
from app.services import resultados_service


def _seed(db):
    db.query(ElectionResult).delete()
    rows = [("MORENA", 600), ("PAN", 300), ("_NULOS", 20), ("_LISTA_NOMINAL", 1000)]
    for partido, votos in rows:
        db.add(ElectionResult(organization_id=None, anio=2021, nivel="municipio",
                              territory_code="15001", eleccion="ayuntamiento",
                              partido=partido, votos=votos))
    db.commit()


def test_derived_metrics_math():
    db = TestingSessionLocal()
    try:
        _seed(db)
        d = resultados_service.derived(db, None, 2021, "municipio", "15001", "ayuntamiento")
        # participación = (600+300+20)/1000 = 0.92 ; abstención = 0.08
        assert round(d["participacion"], 3) == 0.92
        assert round(d["abstencion"], 3) == 0.08
        # margen = (600-300)/920 votos válidos+nulos? define as top1-top2 over real parties / total real
        assert d["ganador"] == "MORENA"
        assert round(d["margen"], 3) == round((600 - 300) / 920, 3)
    finally:
        db.rollback(); db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_sp0b2b_resultados_api.py -v`
Expected: FAIL — `app.services.resultados_service` missing.

- [ ] **Step 3: Write the service**

```python
# backend/app/services/resultados_service.py
"""Election-results reads + query-time derived metrics (never stored)."""
from __future__ import annotations
from sqlalchemy import select
from app.models.election_result import ElectionResult

SENTINELS = {"_LISTA_NOMINAL", "_TOTAL", "_NULOS", "_NO_REGISTRADAS"}


def _org_clause(org_id):
    return (ElectionResult.organization_id.is_(None) if org_id is None
            else ElectionResult.organization_id == org_id)


def list_results(db, org_id, anio=None, nivel=None, territory_code=None, eleccion=None):
    stmt = select(ElectionResult).where(_org_clause(org_id))
    if anio is not None:
        stmt = stmt.where(ElectionResult.anio == anio)
    if nivel:
        stmt = stmt.where(ElectionResult.nivel == nivel)
    if territory_code:
        stmt = stmt.where(ElectionResult.territory_code == territory_code)
    if eleccion:
        stmt = stmt.where(ElectionResult.eleccion == eleccion)
    rows = db.execute(stmt).scalars().all()
    return [
        {"territory_code": r.territory_code, "nivel": r.nivel, "anio": r.anio,
         "eleccion": r.eleccion, "partido": r.partido, "votos": float(r.votos)}
        for r in rows
    ]


def derived(db, org_id, anio, nivel, territory_code, eleccion):
    rows = db.execute(
        select(ElectionResult).where(
            _org_clause(org_id), ElectionResult.anio == anio,
            ElectionResult.nivel == nivel, ElectionResult.territory_code == territory_code,
            ElectionResult.eleccion == eleccion,
        )
    ).scalars().all()
    parties = {r.partido: float(r.votos) for r in rows}
    lista_nominal = parties.get("_LISTA_NOMINAL")
    nulos = parties.get("_NULOS", 0.0)
    real = {p: v for p, v in parties.items() if p not in SENTINELS}
    total_real = sum(real.values())
    total_votos = total_real + nulos
    ordered = sorted(real.items(), key=lambda kv: kv[1], reverse=True)
    ganador = ordered[0][0] if ordered else None
    top1 = ordered[0][1] if ordered else 0.0
    top2 = ordered[1][1] if len(ordered) > 1 else 0.0
    participacion = (total_votos / lista_nominal) if lista_nominal else None
    return {
        "territory_code": territory_code, "anio": anio, "eleccion": eleccion,
        "lista_nominal": lista_nominal, "total_votos": total_votos,
        "participacion": participacion,
        "abstencion": (1 - participacion) if participacion is not None else None,
        "ganador": ganador,
        "margen": ((top1 - top2) / total_real) if total_real else None,
    }
```

- [ ] **Step 4: Run service test**

Run: `cd backend && python -m pytest tests/test_sp0b2b_resultados_api.py -v`
Expected: PASS.

- [ ] **Step 5: Write the router + register it**

```python
# backend/app/routers/resultados.py
"""Election results — reads + derived metrics."""
from typing import Any
from fastapi import APIRouter, Query
from app.dependencies import DbSession, Tenant
from app.services import resultados_service

router = APIRouter(prefix="/resultados", tags=["resultados"])


@router.get("", summary="List election results")
def list_results(db: DbSession, ctx: Tenant, anio: int | None = Query(None),
                 nivel: str | None = Query(None), territory_code: str | None = Query(None),
                 eleccion: str | None = Query(None)) -> dict[str, Any]:
    return {"results": resultados_service.list_results(
        db, ctx.organization_id, anio, nivel, territory_code, eleccion)}


@router.get("/derived", summary="Derived participation/abstention/margin for a territory")
def derived(db: DbSession, ctx: Tenant, anio: int = Query(...), nivel: str = Query(...),
            territory_code: str = Query(...), eleccion: str = Query(...)) -> dict[str, Any]:
    return resultados_service.derived(db, ctx.organization_id, anio, nivel, territory_code, eleccion)
```
In `backend/app/main.py`: add `resultados` to the `from app.routers import (...)` list and add `app.include_router(resultados.router, prefix="/api")` alongside the other `include_router` calls (match the existing prefix pattern).

- [ ] **Step 6: Write a router test, run, commit**

```python
# append to backend/tests/test_sp0b2b_resultados_api.py
from fastapi.testclient import TestClient
from app.main import app


def test_resultados_endpoint_requires_auth_then_returns(client_superadmin):
    r = client_superadmin.get("/api/resultados?anio=2021&nivel=municipio&eleccion=ayuntamiento")
    assert r.status_code == 200
    assert "results" in r.json()
```
(Use the existing authenticated client fixture from conftest; check its name and adapt — e.g. `client_superadmin` or the token helper used by other router tests.)

Run: `cd backend && python -m pytest tests/test_sp0b2b_resultados_api.py -v` → PASS.
```bash
git add backend/app/services/resultados_service.py backend/app/routers/resultados.py backend/app/main.py backend/tests/test_sp0b2b_resultados_api.py
git commit -m "feat(sp0b2b): resultados service (derived metrics) + router"
```

---

### Task 8: Socio + DENUE services & routers

**Files:**
- Create: `backend/app/services/socio_service.py`, `backend/app/services/denue_service.py`
- Create: `backend/app/routers/socio.py`, `backend/app/routers/denue.py`
- Modify: `backend/app/main.py` (include both routers)
- Test: `backend/tests/test_sp0b2b_socio_denue_api.py`

**Interfaces:**
- Produces: `socio_service.list_metrics(db, org_id, anio, nivel, territory_code, indicador)`;
  `denue_service.list_units(db, org_id, territory_code, actividad, limit)` and
  `denue_service.geojson(db, org_id, territory_code, limit)` → FeatureCollection of Points.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_sp0b2b_socio_denue_api.py
from tests.conftest import TestingSessionLocal
from app.models.socio import SocioMetric
from app.models.economic_unit import EconomicUnit
from app.services import socio_service, denue_service


def test_socio_list():
    db = TestingSessionLocal()
    try:
        db.query(SocioMetric).delete()
        db.add(SocioMetric(organization_id=None, anio=2020, nivel="municipio",
                           territory_code="15001", indicador="pobreza", valor=0.3))
        db.commit()
        out = socio_service.list_metrics(db, None, 2020, "municipio", "15001", None)
        assert len(out) == 1 and out[0]["indicador"] == "pobreza"
    finally:
        db.rollback(); db.close()


def test_denue_geojson():
    db = TestingSessionLocal()
    try:
        db.query(EconomicUnit).delete()
        import json
        db.add(EconomicUnit(organization_id=None, clave="D1", nombre="Tienda",
                            territory_code="15001", lat=19.4, lon=-99.1,
                            geometry=json.dumps({"lon": -99.1, "lat": 19.4})))
        db.commit()
        fc = denue_service.geojson(db, None, "15001", 100)
        assert fc["type"] == "FeatureCollection"
        assert fc["features"][0]["geometry"]["coordinates"] == [-99.1, 19.4]
    finally:
        db.rollback(); db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_sp0b2b_socio_denue_api.py -v`
Expected: FAIL — services missing.

- [ ] **Step 3: Write the services**

```python
# backend/app/services/socio_service.py
from __future__ import annotations
from sqlalchemy import select
from app.models.socio import SocioMetric


def list_metrics(db, org_id, anio=None, nivel=None, territory_code=None, indicador=None):
    org_clause = (SocioMetric.organization_id.is_(None) if org_id is None
                  else SocioMetric.organization_id == org_id)
    stmt = select(SocioMetric).where(org_clause)
    if anio is not None:
        stmt = stmt.where(SocioMetric.anio == anio)
    if nivel:
        stmt = stmt.where(SocioMetric.nivel == nivel)
    if territory_code:
        stmt = stmt.where(SocioMetric.territory_code == territory_code)
    if indicador:
        stmt = stmt.where(SocioMetric.indicador == indicador)
    rows = db.execute(stmt).scalars().all()
    return [{"territory_code": r.territory_code, "nivel": r.nivel, "anio": r.anio,
             "indicador": r.indicador, "valor": float(r.valor)} for r in rows]
```

```python
# backend/app/services/denue_service.py
from __future__ import annotations
import json
from sqlalchemy import select
from app.models.economic_unit import EconomicUnit


def _org_clause(org_id):
    return (EconomicUnit.organization_id.is_(None) if org_id is None
            else EconomicUnit.organization_id == org_id)


def list_units(db, org_id, territory_code=None, actividad=None, limit=500):
    stmt = select(EconomicUnit).where(_org_clause(org_id))
    if territory_code:
        stmt = stmt.where(EconomicUnit.territory_code == territory_code)
    if actividad:
        stmt = stmt.where(EconomicUnit.actividad == actividad)
    rows = db.execute(stmt.limit(limit)).scalars().all()
    return [{"clave": r.clave, "nombre": r.nombre, "actividad": r.actividad,
             "estrato": r.estrato, "territory_code": r.territory_code,
             "lat": float(r.lat) if r.lat is not None else None,
             "lon": float(r.lon) if r.lon is not None else None} for r in rows]


def geojson(db, org_id, territory_code=None, limit=2000):
    """Point FeatureCollection. Uses lat/lon columns (dialect-independent)."""
    units = list_units(db, org_id, territory_code, None, limit)
    feats = [
        {"type": "Feature",
         "geometry": {"type": "Point", "coordinates": [u["lon"], u["lat"]]},
         "properties": {"clave": u["clave"], "nombre": u["nombre"],
                        "actividad": u["actividad"], "estrato": u["estrato"]}}
        for u in units if u["lon"] is not None and u["lat"] is not None
    ]
    return {"type": "FeatureCollection", "features": feats}
```

- [ ] **Step 4: Run the service tests**

Run: `cd backend && python -m pytest tests/test_sp0b2b_socio_denue_api.py -v`
Expected: PASS.

- [ ] **Step 5: Write routers + register**

```python
# backend/app/routers/socio.py
from typing import Any
from fastapi import APIRouter, Query
from app.dependencies import DbSession, Tenant
from app.services import socio_service

router = APIRouter(prefix="/socio", tags=["socio"])


@router.get("", summary="List socioeconomic metrics")
def list_metrics(db: DbSession, ctx: Tenant, anio: int | None = Query(None),
                 nivel: str | None = Query(None), territory_code: str | None = Query(None),
                 indicador: str | None = Query(None)) -> dict[str, Any]:
    return {"metrics": socio_service.list_metrics(
        db, ctx.organization_id, anio, nivel, territory_code, indicador)}
```

```python
# backend/app/routers/denue.py
from typing import Any
from fastapi import APIRouter, Query
from app.dependencies import DbSession, Tenant
from app.services import denue_service

router = APIRouter(prefix="/denue", tags=["denue"])


@router.get("", summary="List economic units")
def list_units(db: DbSession, ctx: Tenant, territory_code: str | None = Query(None),
               actividad: str | None = Query(None), limit: int = Query(500, le=5000)) -> dict[str, Any]:
    return {"units": denue_service.list_units(db, ctx.organization_id, territory_code, actividad, limit)}


@router.get("/geojson", summary="Economic units as GeoJSON points")
def geojson(db: DbSession, ctx: Tenant, territory_code: str | None = Query(None),
            limit: int = Query(2000, le=10000)) -> dict[str, Any]:
    return denue_service.geojson(db, ctx.organization_id, territory_code, limit)
```
Register both in `main.py` (`from app.routers import (..., socio, denue)` + `include_router(..., prefix="/api")`).

- [ ] **Step 6: Run full suite + commit**

Run: `cd backend && python -m pytest tests/test_sp0b2b_socio_denue_api.py -v` → PASS.
```bash
git add backend/app/services/socio_service.py backend/app/services/denue_service.py backend/app/routers/socio.py backend/app/routers/denue.py backend/app/main.py backend/tests/test_sp0b2b_socio_denue_api.py
git commit -m "feat(sp0b2b): socio + denue services and routers"
```

---

### Task 9: Frontend wiring (Resultados, Socio/Demografía, DENUE, casilla map layer)

**Files:**
- Create: `frontend/src/api/resultados.ts`, `frontend/src/api/socio.ts`, `frontend/src/api/denue.ts`
- Modify: `frontend/src/modules/resultados/…` (swap sample fixtures → real API + `DataState`)
- Modify: `frontend/src/modules/demografia/…` (wire socio alongside census)
- Modify: `frontend/src/modules/unidades-economicas/…` (DENUE points + table)
- Modify: the Map Explorer level selector to include `casilla`
- Test: `npm run build` (type-check) + manual

**Interfaces:**
- Consumes: `/api/resultados`, `/api/resultados/derived`, `/api/socio`, `/api/denue`, `/api/denue/geojson`, `/api/maps/areas?level=casilla`.
- Produces: typed API clients returning the shapes from Tasks 7-8.

- [ ] **Step 1: Add typed API clients**

Follow the existing `frontend/src/api/*.ts` pattern (axios/fetch wrapper used by other modules). Example:
```ts
// frontend/src/api/resultados.ts
import { api } from "./client";
export type ElectionRow = { territory_code: string; nivel: string; anio: number;
  eleccion: string; partido: string; votos: number };
export type Derived = { participacion: number | null; abstencion: number | null;
  margen: number | null; ganador: string | null; total_votos: number; lista_nominal: number | null };
export const getResultados = (p: Record<string, string>) =>
  api.get<{ results: ElectionRow[] }>("/resultados", { params: p }).then(r => r.data.results);
export const getDerived = (p: Record<string, string>) =>
  api.get<Derived>("/resultados/derived", { params: p }).then(r => r.data);
```
(Repeat the pattern for `socio.ts` and `denue.ts` — match the actual `client` export name/signature in the repo.)

- [ ] **Step 2: Wire each module to real data with DataState**

In each of the three modules, replace the sample-fixture import with the `useAsync` + `DataState` pattern used by the already-real modules (e.g. `modules/territorios/TerritoriosPage.tsx`): loading spinner, error+retry, and empty → "Ingesta pendiente". Remove the now-unused fixture files. Keep `PreviewBanner` only if data is still partial; otherwise drop it.

- [ ] **Step 3: Add `casilla` to the Map Explorer level selector**

In the Map Explorer level options array (where `seccion`/`distrito_*` were added in SP0b-2a), add `{ value: "casilla", label: "Casillas" }`. It flows through `/api/maps/areas?level=casilla`; empty → existing DataState.

- [ ] **Step 4: Build (type-check)**

Run: `cd frontend && rm -rf dist *.tsbuildinfo && npm run build`
Expected: build succeeds, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/resultados.ts frontend/src/api/socio.ts frontend/src/api/denue.ts frontend/src/modules/resultados frontend/src/modules/demografia frontend/src/modules/unidades-economicas frontend/src/modules/registry.ts
git commit -m "feat(sp0b2b): wire Resultados/Socio/DENUE modules + casilla map layer to real APIs"
```

---

### Task 10: Full verification + Alembic round-trip on Postgres

**Files:**
- Test: run the whole backend suite + a real-PostGIS migration smoke (optional, mirrors the recovery method).

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && python -m pytest -q`
Expected: all green (existing 103 + new SP0b-2b tests).

- [ ] **Step 2: Frontend build**

Run: `cd frontend && rm -rf dist *.tsbuildinfo && npm run build` → success.

- [ ] **Step 3: (Recommended) real-PostGIS migration smoke**

Mirror the prod-recovery method: start `docker run -d --name agora-pgtest -e POSTGRES_PASSWORD=test -e POSTGRES_DB=agora -p 55432:5432 postgis/postgis:17-3.5`, then run `alembic upgrade head` against it (DATABASE_URL=`postgresql+psycopg://postgres:test@localhost:55432/agora`) and confirm `alembic_version=0007` and the 3 tables + the `economic_units.geometry` POINT column exist. Remove the container after.

- [ ] **Step 4: Commit any fixups, then finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to merge/PR. Deploy via GitHub push (Railway auto-deploys; bootstrap runs Alembic 0007 — a clean incremental add on top of prod's 0006). After deploy, bulk-ingest real files via `railway ssh` using the new CLI subcommands.

---

## Self-Review

**Spec coverage:**
- §3.1 election_results → Task 1, 2 (model+migration); §3.2 socio_metrics → Task 1, 2; §3.3 economic_units → Task 1, 2; §3.4 casillas → Task 4 (mapper) + reuses electoral_areas.
- §4 engine mappers/specs/Point helper → Tasks 3, 4; §5 resolve → Task 5; §6.1 CLI → Task 6; §6.2 routers/services + derived metrics → Tasks 7, 8; §7 Alembic 0007 → Task 2; §8 frontend → Task 9; §9 testing → each task's tests + Task 10.
- All four datasets global (`organization_id=NULL`) — enforced in mappers (Tasks 3, 4). Derived metrics query-time only — Task 7. No new core engine code — confirmed (engine untouched).

**Placeholder scan:** No TBD/TODO; every code step has real code. Frontend Task 9 references the repo's existing `client`/`useAsync`/`DataState`/registry patterns rather than inventing them (correct for an existing codebase) and notes to match actual export names.

**Type consistency:** Sentinel set `SENTINELS` defined once (Task 7) and reused. `_point_geometry(lon, lat, db)` signature consistent across Task 4 definition and Task 4 mappers. Model column names (`territory_code`, `eleccion`, `partido`, `votos`, `clave`, `actividad`) consistent across models (Task 1), mappers (Tasks 3-4), migration (Task 2), services (Tasks 7-8). Resolve `level_map` keys (`estado/municipio/seccion`) match `nivel` values used in mappers.

**Open adaptation points (flagged for the implementer, not placeholders):** the exact authenticated test-client fixture name in `conftest.py` (Task 7 Step 6) and the frontend `api` client export name (Task 9) must be matched to the repo's actuals — both are existing conventions, not new design.
