# SP0b-1 — Ingestion Engine + Governance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A governed, pluggable ingestion engine (DataSource + IngestRun + validation) with CLI and size-limited HTTP entry points, proven end-to-end by a Census loader, wired to SP0a scoping.

**Architecture:** New `app/ingestion/` engine: readers (CSV/Excel) → validation → `DatasetSpec` mapper → batched bulk insert, all wrapped in an `IngestRun` for traceability. Governance/fact models compose Atlas mixins; reference facts carry nullable `organization_id` (global) + `ingest_run_id`. CLI (`scripts/ingest_file.py`) and `POST /api/ingest/{dataset}` both call one `run_ingest`. Alembic revision adds the tables; SQLite tests keep create_all.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, pytest, `openpyxl` (new, lazy), `python-multipart` (present), React/zustand frontend.

**Spec:** `docs/superpowers/specs/2026-06-19-sp0b1-ingestion-engine-design.md`

---

## Conventions
- Repo root `/mnt/c/Users/ecamp/Devs/agora-civic-intelligence`. Branch `feat/sp0b1-ingestion` (already created; do NOT switch).
- Backend tests: `cd backend && python3 -m pytest -q`. Commit from repo root via `git -C <root>`. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do NOT push.
- **Scripts live at repo-root `/scripts`** (next to `ingest_ine.py`); they add `backend/` to `sys.path` to import `app` — mirror `scripts/ingest_ine.py`'s top-of-file sys.path setup exactly.
- Routers register via the loop in `app/main.py` (`from app.routers import (...)` tuple + `for module in (...): app.include_router(module.router, prefix=settings.API_PREFIX)`). Router files use a SHORT prefix (e.g. `/ingest`); `/api` is prepended by the loop.
- Golden rule: tenant/campaign from context, never request body.

## File Structure
**Create:** `backend/app/models/ingestion.py` (DataSource, IngestRun), `backend/app/models/census.py` (CensusMetric), `backend/app/ingestion/__init__.py`, `backend/app/ingestion/readers.py`, `backend/app/ingestion/validation.py`, `backend/app/ingestion/datasets.py`, `backend/app/ingestion/engine.py`, `backend/app/ingestion/service.py`, `backend/app/schemas/ingest.py`, `backend/app/routers/ingest.py`, `scripts/ingest_file.py`, tests `backend/tests/test_ingestion_models.py`, `test_ingestion_engine.py`, `test_ingest_api.py`, fixtures under `backend/tests/fixtures/`. Frontend: modify `frontend/src/modules/historial/HistorialPage.tsx`, `frontend/src/api/` (ingest client).
**Modify:** `backend/app/models/__init__.py`, `backend/tests/conftest.py`, `backend/app/main.py`, `backend/requirements.txt`, `backend/alembic/versions/` (+1 revision).

---

### Task 1: Governance + census models

**Files:** Create `backend/app/models/ingestion.py`, `backend/app/models/census.py`; Modify `backend/app/models/__init__.py`, `backend/tests/conftest.py`; Test `backend/tests/test_ingestion_models.py`.

- [ ] **Step 1: Failing test** `backend/tests/test_ingestion_models.py`:
```python
from app.models.ingestion import DataSource, IngestRun, IngestStatus, SourceKind
from app.models.census import CensusMetric


def test_ingestion_model_shapes():
    assert {c.name for c in DataSource.__table__.columns} >= {"id", "organization_id", "name", "kind"}
    assert DataSource.__table__.c.organization_id.nullable is True  # NULL = global
    assert {c.name for c in IngestRun.__table__.columns} >= {
        "id", "organization_id", "campaign_id", "source_id", "dataset", "file_name",
        "file_hash", "status", "rows_read", "rows_inserted", "rows_skipped", "rows_failed",
    }
    assert IngestStatus.RUNNING.value == "running"
    assert {c.name for c in CensusMetric.__table__.columns} >= {
        "id", "organization_id", "ingest_run_id", "anio", "nivel", "territory_code", "area_id", "indicador", "valor",
    }
    assert CensusMetric.__table__.c.organization_id.nullable is True
    assert CensusMetric.__table__.c.area_id.nullable is True
```
- [ ] **Step 2: Run → FAIL** `cd backend && python3 -m pytest tests/test_ingestion_models.py -q`.
- [ ] **Step 3: Implement** `backend/app/models/ingestion.py`:
```python
"""Ingestion governance: registered sources + per-run traceability."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, UUIDMixin


class SourceKind(str, enum.Enum):
    FILE_CSV = "file_csv"
    FILE_EXCEL = "file_excel"
    FILE_SHAPEFILE = "file_shapefile"
    FILE_GEOJSON = "file_geojson"
    API = "api"


class IngestStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


class DataSource(UUIDMixin, AuditMixin, Base):
    __tablename__ = "data_sources"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_datasource_name"),)
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )  # NULL = global/platform source
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[SourceKind] = mapped_column(Enum(SourceKind, name="source_kind"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class IngestRun(UUIDMixin, AuditMixin, Base):
    __tablename__ = "ingest_runs"
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )  # NULL = global reference ingest
    campaign_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="SET NULL"), index=True, nullable=True
    )
    source_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("data_sources.id", ondelete="SET NULL"), index=True, nullable=True
    )
    dataset: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    file_name: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    file_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[IngestStatus] = mapped_column(Enum(IngestStatus, name="ingest_status"), default=IngestStatus.RUNNING, nullable=False)
    rows_read: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_inserted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
```
`backend/app/models/census.py`:
```python
"""Census metrics — tidy reference facts (one row per territory+indicator)."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import AuditMixin, UUIDMixin


class CensusMetric(UUIDMixin, AuditMixin, Base):
    __tablename__ = "census_metrics"
    __table_args__ = (
        Index("ix_census_lookup", "nivel", "territory_code", "indicador", "anio"),
    )
    organization_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=True
    )  # NULL = global reference
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
Add to `app/models/__init__.py`: `from app.models.ingestion import DataSource, IngestRun  # noqa: F401` and `from app.models.census import CensusMetric  # noqa: F401` (+ `__all__` if used).
- [ ] **Step 4: conftest tables** — in `backend/tests/conftest.py` import the three models and append `DataSource.__table__, IngestRun.__table__, CensusMetric.__table__` to the `create_all(engine, tables=[...])` list.
- [ ] **Step 5: Run → PASS** targeted, then FULL suite `python3 -m pytest -q`.
- [ ] **Step 6: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/app/models/ingestion.py backend/app/models/census.py backend/app/models/__init__.py backend/tests/conftest.py backend/tests/test_ingestion_models.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b1): ingestion governance models (DataSource/IngestRun) + census_metrics"
```

---

### Task 2: Readers (CSV/Excel) + validation

**Files:** Create `backend/app/ingestion/__init__.py` (empty), `readers.py`, `validation.py`; fixtures `backend/tests/fixtures/census_min.csv`, `census_latin1.csv`; Modify `backend/requirements.txt`; Test `backend/tests/test_ingestion_engine.py`.

- [ ] **Step 1: Add openpyxl dep** — append `openpyxl==3.1.5` to `backend/requirements.txt` (under a `# --- Ingestion ---` comment). Install for verification: `cd backend && pip install openpyxl==3.1.5`.
- [ ] **Step 2: Create fixtures** —
`backend/tests/fixtures/census_min.csv`:
```
nivel,clave,indicador,valor
estado,15,POBTOT,16992418
municipio,15001,POBTOT,57862
```
`backend/tests/fixtures/census_latin1.csv` — same header but with an accented value in a comment row to force latin-1 (write the file encoded latin-1; include a row `municipio,15002,NOMBRE,Acámbaro` — value with an accent). (Create programmatically in the test if writing a latin-1 file by hand is unreliable: the test can write bytes `"...Acámbaro".encode('latin-1')`.)
- [ ] **Step 3: Failing test** in `backend/tests/test_ingestion_engine.py`:
```python
from pathlib import Path
from app.ingestion.readers import read_tabular
from app.ingestion.validation import validate_rows, ColumnSpec

FIX = Path(__file__).parent / "fixtures"


def test_read_csv_utf8():
    rows, header = read_tabular(FIX / "census_min.csv")
    rows = list(rows)
    assert header == ["nivel", "clave", "indicador", "valor"]
    assert rows[0]["clave"] == "15" and rows[0]["indicador"] == "POBTOT"


def test_read_csv_latin1_fallback(tmp_path):
    p = tmp_path / "latin.csv"
    p.write_bytes("nivel,clave,indicador,valor\nmunicipio,15002,NOMBRE,Acámbaro\n".encode("latin-1"))
    rows, _ = read_tabular(p)
    assert list(rows)[0]["valor"] == "Acámbaro"


def test_validate_rows_reports_discards():
    specs = [ColumnSpec("clave", required=True), ColumnSpec("valor", required=True, coerce="number")]
    good, discards = validate_rows(
        [{"clave": "15", "valor": "10"}, {"clave": "", "valor": "x"}], specs
    )
    assert len(good) == 1 and good[0]["valor"] == 10.0
    assert len(discards) == 1 and "clave" in discards[0]["reason"]
```
- [ ] **Step 4: Run → FAIL**.
- [ ] **Step 5: Implement** `backend/app/ingestion/readers.py`:
```python
"""File readers. CSV (encoding autodetect) + Excel (lazy openpyxl)."""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterator


def _decode(path: Path) -> str:
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


def read_csv(path) -> tuple[list[dict], list[str]]:
    text = _decode(Path(path))
    reader = csv.DictReader(text.splitlines())
    header = list(reader.fieldnames or [])
    return list(reader), header


def read_excel(path) -> tuple[list[dict], list[str]]:
    import openpyxl  # lazy: only needed for .xlsx
    wb = openpyxl.load_workbook(Path(path), read_only=True, data_only=True)
    ws = wb.active
    rows_iter: Iterator = ws.iter_rows(values_only=True)
    header = [str(c) if c is not None else "" for c in next(rows_iter)]
    out = []
    for r in rows_iter:
        out.append({header[i]: ("" if v is None else str(v)) for i, v in enumerate(r) if i < len(header)})
    return out, header


def read_tabular(path) -> tuple[list[dict], list[str]]:
    p = Path(path)
    if p.suffix.lower() in (".xlsx", ".xlsm"):
        return read_excel(p)
    return read_csv(p)
```
`backend/app/ingestion/validation.py`:
```python
"""Row validation + coercion with explicit discard reporting (no silent drops)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class ColumnSpec:
    name: str
    required: bool = False
    coerce: Optional[str] = None  # "number" | "int" | None


def _coerce(value, kind):
    if kind == "number":
        return float(value)
    if kind == "int":
        return int(float(value))
    return value


def validate_rows(rows, specs: list[ColumnSpec]):
    """Return (good_rows, discards). good_rows have coerced values; discards are
    {row_index, reason}. Never drops silently."""
    good, discards = [], []
    for i, row in enumerate(rows):
        try:
            out = dict(row)
            for s in specs:
                raw = row.get(s.name, "")
                if s.required and (raw is None or str(raw).strip() == ""):
                    raise ValueError(f"missing required column '{s.name}'")
                if s.coerce and str(raw).strip() != "":
                    out[s.name] = _coerce(raw, s.coerce)
            good.append(out)
        except (ValueError, TypeError) as e:
            discards.append({"row_index": i, "reason": str(e)})
    return good, discards
```
- [ ] **Step 6: Run → PASS** (Excel test will be added in engine task; here CSV+validation). If `openpyxl` import is reached unexpectedly, it's lazy so CSV tests don't need it. Run FULL suite.
- [ ] **Step 7: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/app/ingestion/__init__.py backend/app/ingestion/readers.py backend/app/ingestion/validation.py backend/requirements.txt backend/tests/fixtures backend/tests/test_ingestion_engine.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b1): tabular readers (csv/excel) + validation with discard reporting"
```

---

### Task 3: DatasetSpec registry + census spec + engine.run_ingest

**Files:** Create `backend/app/ingestion/datasets.py`, `backend/app/ingestion/engine.py`; Test append to `backend/tests/test_ingestion_engine.py`.

- [ ] **Step 1: Failing test** — append:
```python
from app.ingestion.engine import run_ingest
from app.ingestion.datasets import DATASETS
from app.models.census import CensusMetric
from app.models.ingestion import IngestRun, IngestStatus
from tests.conftest import TestingSessionLocal


class _Ctx:
    organization_id = None  # global reference
    campaign_id = None
    is_superadmin = True
    class user:  # noqa
        id = "tester"


def test_engine_ingests_census_and_records_run():
    db = TestingSessionLocal()
    try:
        spec = DATASETS["census"]
        result = run_ingest(db, _Ctx(), spec, FIX / "census_min.csv", source=None,
                            extra={"anio": 2020}, replace=False)
        run = db.get(IngestRun, result.run_id)
        assert run.status in (IngestStatus.SUCCESS, IngestStatus.PARTIAL)
        assert run.rows_inserted == 2
        rows = db.query(CensusMetric).filter(CensusMetric.ingest_run_id == run.id).all()
        assert len(rows) == 2
        assert {r.territory_code for r in rows} == {"15", "15001"}
        db.rollback()
    finally:
        db.close()
```
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `backend/app/ingestion/datasets.py`:
```python
"""Pluggable dataset registry. Each DatasetSpec maps a file to a typed table."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from app.ingestion.validation import ColumnSpec
from app.models.census import CensusMetric


@dataclass
class DatasetSpec:
    key: str
    model: type
    columns: list[ColumnSpec]
    row_mapper: Callable  # (row, ctx, run, extra) -> dict of model kwargs
    scope_filter: Callable = field(default=lambda model, ctx, extra: [])  # for --replace


def _census_mapper(row, ctx, run, extra):
    return dict(
        organization_id=ctx.organization_id,
        ingest_run_id=run.id,
        anio=int(extra.get("anio")),
        nivel=row["nivel"],
        territory_code=str(row["clave"]),
        indicador=row["indicador"],
        valor=row["valor"],
    )


def _census_scope(model, ctx, extra):
    return [model.organization_id.is_(None) if ctx.organization_id is None else model.organization_id == ctx.organization_id,
            model.anio == int(extra.get("anio"))]


DATASETS: dict[str, DatasetSpec] = {
    "census": DatasetSpec(
        key="census",
        model=CensusMetric,
        columns=[ColumnSpec("nivel", required=True), ColumnSpec("clave", required=True),
                 ColumnSpec("indicador", required=True), ColumnSpec("valor", required=True, coerce="number")],
        row_mapper=_census_mapper,
        scope_filter=_census_scope,
    ),
}
```
`backend/app/ingestion/engine.py`:
```python
"""Ingestion orchestrator: open run → read → validate → bulk insert → finalize."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete

from app.ingestion.readers import read_tabular
from app.ingestion.validation import validate_rows
from app.models.ingestion import IngestRun, IngestStatus

BATCH = 5000
_DISCARD_SAMPLE = 20


@dataclass
class IngestRunResult:
    run_id: str
    status: str
    inserted: int
    skipped: int


def _file_hash(path) -> str:
    h = hashlib.sha256()
    h.update(Path(path).read_bytes())
    return h.hexdigest()


def run_ingest(db, ctx, spec, file_path, *, source, extra=None, replace=False) -> IngestRunResult:
    extra = extra or {}
    run = IngestRun(
        organization_id=ctx.organization_id,
        campaign_id=getattr(ctx, "campaign_id", None),
        source_id=(source.id if source is not None else None),
        dataset=spec.key,
        file_name=Path(file_path).name,
        file_hash=_file_hash(file_path),
        status=IngestStatus.RUNNING,
        started_at=datetime.now(timezone.utc),
        created_by=getattr(getattr(ctx, "user", None), "id", None),
    )
    db.add(run); db.flush()  # run.id available

    rows, _header = read_tabular(file_path)
    good, discards = validate_rows(rows, spec.columns)
    run.rows_read = len(rows)
    run.rows_skipped = len(discards)

    try:
        if replace:
            db.execute(delete(spec.model).where(*spec.scope_filter(spec.model, ctx, extra)))
        inserted = 0
        batch = []
        for r in good:
            batch.append(spec.model(**spec.row_mapper(r, ctx, run, extra)))
            if len(batch) >= BATCH:
                db.add_all(batch); db.flush(); inserted += len(batch); batch = []
        if batch:
            db.add_all(batch); db.flush(); inserted += len(batch)
        run.rows_inserted = inserted
        run.status = IngestStatus.SUCCESS if discards == [] and inserted > 0 else (
            IngestStatus.PARTIAL if inserted > 0 else IngestStatus.FAILED)
    except Exception as e:  # noqa: BLE001 — record failure on the run
        db.rollback()
        # re-add the run row (rolled back) to persist the failure
        run = db.merge(run)
        run.status = IngestStatus.FAILED
        run.rows_inserted = 0
        run.error_summary = f"insert error: {e}"
    if discards:
        sample = "; ".join(f"row {d['row_index']}: {d['reason']}" for d in discards[:_DISCARD_SAMPLE])
        run.error_summary = ((run.error_summary or "") + f" discards={len(discards)} [{sample}]").strip()
    run.finished_at = datetime.now(timezone.utc)
    db.commit()
    return IngestRunResult(run_id=run.id, status=run.status.value, inserted=run.rows_inserted, skipped=run.rows_skipped)
```
NOTE the `--replace` transactionality (spec §7): delete + insert happen in the same try; on failure the whole thing rolls back, preserving prior data, and the run is recorded FAILED. Document this in a code comment.
- [ ] **Step 4: Run → PASS** targeted, then add an Excel + a `--replace` idempotency test (optional but recommended: ingest twice with replace, assert count stays 2). Run FULL suite.
- [ ] **Step 5: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/app/ingestion/datasets.py backend/app/ingestion/engine.py backend/tests/test_ingestion_engine.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b1): DatasetSpec registry + census spec + run_ingest engine (traceable, batched)"
```

---

### Task 4: CLI `scripts/ingest_file.py`

**Files:** Create `scripts/ingest_file.py`; Test append to `backend/tests/test_ingestion_engine.py`.

- [ ] **Step 1: Read `scripts/ingest_ine.py`** top — copy its exact `sys.path` setup (adds `backend/` to path) and argparse style.
- [ ] **Step 2: Implement** `scripts/ingest_file.py` — argparse subcommand per dataset (`census` for now), flags `--file`, `--source` (get-or-create a DataSource by name; `--global` → org NULL, else `--org <slug>` resolves the org), `--anio` (census), `--replace`. Build a minimal context object (`organization_id`, `campaign_id=None`, `user` with id="cli", `is_superadmin=True`), open a `SessionLocal()`, `get_or_create` the DataSource, call `run_ingest`, print the run summary (status + counts). Idempotent DataSource get-or-create by `(organization_id, name)`.
- [ ] **Step 3: Test** the CLI's `run()` programmatically (import the script module, call its main with args) OR a thin test that calls `get_or_create_source` + `run_ingest` directly via the same code path. Assert it inserts rows + creates a DataSource + IngestRun. Keep it SQLite-friendly.
- [ ] **Step 4: Run → PASS** + FULL suite.
- [ ] **Step 5: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add scripts/ingest_file.py backend/tests/test_ingestion_engine.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b1): CLI scripts/ingest_file.py (census) with get-or-create DataSource"
```

---

### Task 5: HTTP router `/api/ingest/*` + service + isolation tests

**Files:** Create `backend/app/schemas/ingest.py`, `backend/app/ingestion/service.py`, `backend/app/routers/ingest.py`; Modify `backend/app/main.py`; Test `backend/tests/test_ingest_api.py`.

- [ ] **Step 1: Failing tests** `backend/tests/test_ingest_api.py`:
```python
import io
from tests.conftest import auth_headers, ALPHA_CAMPAIGN_ID


def test_upload_census_and_list_runs(client):
    h = {**auth_headers(client, "admin@alpha.gov"), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}
    csv = b"nivel,clave,indicador,valor\nmunicipio,15001,POBTOT,57862\n"
    r = client.post("/api/ingest/census?anio=2020",
                    headers=h, files={"file": ("c.csv", io.BytesIO(csv), "text/csv")})
    assert r.status_code == 201, r.text
    assert r.json()["rows_inserted"] == 1
    runs = client.get("/api/ingest/runs", headers=h)
    assert runs.status_code == 200 and len(runs.json()) >= 1


def test_runs_isolated_across_tenants(client):
    ha = {**auth_headers(client, "admin@alpha.gov"), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}
    client.post("/api/ingest/census?anio=2021", headers=ha,
                files={"file": ("a.csv", io.BytesIO(b"nivel,clave,indicador,valor\nestado,15,X,1\n"), "text/csv")})
    # beta admin (different tenant) should not see alpha's tenant-scoped runs
    hb = auth_headers(client, "admin@beta.gov")
    beta_runs = client.get("/api/ingest/runs", headers=hb).json()
    assert all(run["dataset"] == "census" or True for run in beta_runs)  # see only own/global


def test_oversize_upload_rejected(client):
    h = {**auth_headers(client, "admin@alpha.gov"), "X-Campaign-Id": ALPHA_CAMPAIGN_ID}
    big = b"x" * (26 * 1024 * 1024)
    r = client.post("/api/ingest/census?anio=2020", headers=h,
                    files={"file": ("big.csv", io.BytesIO(big), "text/csv")})
    assert r.status_code == 413
```
(Note: the upload writes a tenant-scoped run because a campaign is supplied; adjust the isolation assertion to the actual scoping decision — campaign uploads are tenant-scoped, so beta must NOT see alpha's run id. Make the assertion concrete: collect alpha run ids, assert none appear in beta's list.)
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `backend/app/schemas/ingest.py` (Pydantic `IngestRunOut` with id/dataset/file_name/status/rows_* /started_at/finished_at/error_summary; `from_attributes`). `backend/app/ingestion/service.py` (`list_runs(db, ctx)` via `scoped_query(IngestRun, ctx)` ordered by started_at desc; `get_run`). `backend/app/routers/ingest.py`:
  - `router = APIRouter(prefix="/ingest", tags=["ingest"])`.
  - `POST /{dataset}`: deps `DbSession`, `CampaignCtx` (campaign upload) — admin-gated (`require_roles(UserRole.ADMIN)`); read `dataset` from path (404 if not in `DATASETS`); read `anio` (and any per-dataset query params) from query; enforce size: read the `UploadFile` with a running byte count, abort with 413 if it exceeds `MAX_UPLOAD_BYTES = 25 * 1024 * 1024`; write to a `tempfile`, get-or-create a DataSource (name e.g. "upload"), call `run_ingest(db, cctx, DATASETS[dataset], tmp_path, source=src, extra={"anio": anio})`, return `IngestRunOut` with 201; clean up the temp file.
  - `GET /runs` (list, scoped) → `IngestRunOut[]`; `GET /runs/{id}` (scoped, 404 if not visible); `GET /datasets` → list of `DATASETS` keys.
  Register `ingest` in `app/main.py` (add to the import tuple + it's auto-included by the loop).
- [ ] **Step 4: Run → PASS** + FULL suite. Make the isolation test assertion concrete (alpha run ids absent from beta's list).
- [ ] **Step 5: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/app/schemas/ingest.py backend/app/ingestion/service.py backend/app/routers/ingest.py backend/app/main.py backend/tests/test_ingest_api.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b1): /api/ingest upload + runs (size-limited, scoped, isolation-tested)"
```

---

### Task 6: Alembic revision for the new tables

**Files:** Create `backend/alembic/versions/0004_ingestion.py`.

- [ ] **Step 1:** Create revision `0004_ingestion.py` (`revision="0004"`, `down_revision="0003"`). `upgrade()`: `op.create_table` for `data_sources`, `ingest_runs`, `census_metrics` matching the models (enums `source_kind`, `ingest_status` via `sa.Enum(name=...)`; nullable org/campaign/area FKs; the `ix_census_lookup` index). `downgrade()`: drop them (+ enums on Postgres). Mirror the dialect-portability + enum-create-once patterns from `0001/0002` (geometry not involved here, simpler).
- [ ] **Step 2: Verify** from `backend/`: `DATABASE_URL=sqlite:///./scratch_b1.db python3 -m alembic upgrade head && DATABASE_URL=sqlite:///./scratch_b1.db python3 -m alembic downgrade base && rm -f scratch_b1.db`. Then `python3 -m pytest -q` (conftest create_all unaffected).
- [ ] **Step 3: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add backend/alembic/versions/0004_ingestion.py
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b1): Alembic 0004 — data_sources/ingest_runs/census_metrics"
```

---

### Task 7: Frontend — Historial reads real runs + upload control

**Files:** Modify `frontend/src/modules/historial/HistorialPage.tsx`; Create `frontend/src/api/ingest.ts`.

- [ ] **Step 1:** `frontend/src/api/ingest.ts` — `listRuns()` → GET `/api/ingest/runs`; `listDatasets()` → GET `/api/ingest/datasets`; `uploadFile(dataset, file, params)` → POST `/api/ingest/{dataset}` multipart (axios FormData). Types `IngestRun {id,dataset,file_name,status,rows_read,rows_inserted,rows_skipped,rows_failed,started_at,finished_at,error_summary}`.
- [ ] **Step 2:** Rework `HistorialPage.tsx` to read `listRuns()` (DataTable: dataset, file_name, status pill via TONE_BADGE [success=ok, partial=warning, failed=critical, running=info], inserted/skipped counts, started_at, actor; row → detail drawer with error_summary). Keep DataState + working retry. Add an admin-only **upload control** (a small form/Modal: dataset `<select>` from listDatasets + file input + anio input for census → `uploadFile` → on success reload + show the returned run summary; show 413/422 errors). Reuse the design system; needs an active campaign (X-Campaign-Id auto-sent by the interceptor).
- [ ] **Step 3: Verify** `cd frontend && rm -rf dist && find . -maxdepth 1 -name '*.tsbuildinfo' -delete; npm run lint && npm run build` → PASS. Reason: Historial lists IngestRun rows; upload posts to /api/ingest. Dark+light intact.
- [ ] **Step 4: Commit**
```bash
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence add frontend/src/api/ingest.ts frontend/src/modules/historial/HistorialPage.tsx
git -C /mnt/c/Users/ecamp/Devs/agora-civic-intelligence commit -m "feat(sp0b1): Historial reads real IngestRun records + admin upload control"
```

---

### Task 8: Final gate + memory

- [ ] **Step 1:** Full backend suite `cd backend && python3 -m pytest -q` → green. Frontend `npm run lint && npm run build` → green. Alembic round-trip on scratch SQLite → clean.
- [ ] **Step 2:** Manual CLI smoke (SQLite): `cd <repo> && python -m scripts.ingest_file census --file backend/tests/fixtures/census_min.csv --global --source "INEGI 2020" --anio 2020 --replace` → prints success + counts. (Adapt invocation to the script's sys.path; document the exact working command.)
- [ ] **Step 3:** Update memory `memory/sp0b1-ingestion.md` (engine architecture, DataSource/IngestRun/CensusMetric, DatasetSpec registry, CLI + /api/ingest, size limit, scoping, area_id-deferred) + MEMORY.md pointer. Note SP0b-2 (remaining loaders + geo readers + area_id resolution) and SP0b-3 (quality) next.
- [ ] **Step 4:** Hand back for merge-to-main + deploy decision (Railway runs Alembic 0004 at startup). Do NOT push without user say-so.

---

## Self-Review (completed during authoring)
- **Spec coverage:** §5.1 governance models→T1; §5.2 census→T1; §5.3 engine (readers/validation/datasets/engine/service)→T2,T3,T5; §5.4 CLI→T4, HTTP→T5; §5.5 frontend→T7; §6 scoping (nullable org + scoped_query + CampaignCtx)→T1,T5; §7 edge cases: encoding fallback (T2), discard reporting (T2/T3), 413 oversize (T5), batch/transaction + --replace preserve (T3), area_id nullable deferred (T1), SQLite tables (conftest T1), isolation (T5); §8 testing→per-task pytest + T8; §9 rollout→task order; Alembic→T6.
- **Placeholder scan:** no TBD/TODO. Novel code (models, readers, validation, datasets, engine) is complete; CLI (T4) and Alembic (T6) and frontend (T7) give concrete operation lists + exact patterns to mirror (ingest_ine.py sys.path, 0001/0002 revision style, design-system components) — actionable, not placeholders.
- **Type/name consistency:** `run_ingest(db, ctx, spec, file_path, *, source, extra, replace)`, `IngestRunResult{run_id,status,inserted,skipped}`, `DatasetSpec{key,model,columns,row_mapper,scope_filter}`, `DATASETS["census"]`, `ColumnSpec(name,required,coerce)`, `read_tabular`, `validate_rows`, `IngestStatus`/`SourceKind`, `MAX_UPLOAD_BYTES`, model/column names match across tasks and the spec. `ingest_run_id` on census matches `IngestRun.id`.
- **Known caveat:** the engine's failure path re-merges the run after rollback to persist FAILED status — flagged in T3 for the reviewer to verify it commits cleanly on SQLite + Postgres.
