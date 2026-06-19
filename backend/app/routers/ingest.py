import tempfile
from pathlib import Path
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.dependencies import CampaignCtx, DbSession, Tenant, require_roles
from app.ingestion.datasets import DATASETS
from app.ingestion.engine import run_ingest
from app.ingestion import service as svc
from app.models.ingestion import DataSource, SourceKind
from app.models.user import UserRole
from app.schemas.ingest import IngestRunOut

router = APIRouter(prefix="/ingest", tags=["ingest"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# Role gate — enforces ADMIN; runs alongside CampaignCtx on upload endpoints.
AdminCampaignCtx = Annotated[object, Depends(require_roles(UserRole.ADMIN))]


@router.get("/datasets", response_model=list[str])
def datasets(ctx: Tenant):
    return sorted(DATASETS.keys())


@router.get("/runs", response_model=list[IngestRunOut])
def runs(db: DbSession, ctx: Tenant):
    return svc.list_runs(db, ctx)


@router.get("/runs/{run_id}", response_model=IngestRunOut)
def run_detail(run_id: str, db: DbSession, ctx: Tenant):
    run = svc.get_run(db, ctx, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/{dataset}", response_model=IngestRunOut, status_code=201)
async def upload(
    dataset: str,
    db: DbSession,
    ctx: CampaignCtx,
    _admin: AdminCampaignCtx,
    anio: Optional[int] = None,
    file: UploadFile = File(...),
):
    if dataset not in DATASETS:
        raise HTTPException(status_code=404, detail=f"Unknown dataset '{dataset}'")

    # Stream to a temp file with a hard size cap (large files must use the CLI).
    suffix = Path(file.filename or "upload").suffix or ".csv"
    size = 0
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    tmp.close()
                    Path(tmp_path).unlink(missing_ok=True)
                    tmp_path = None
                    raise HTTPException(
                        status_code=413,
                        detail="File too large; use the CLI for bulk ingest",
                    )
                tmp.write(chunk)

        src = db.execute(
            select(DataSource).where(
                DataSource.organization_id == ctx.organization_id,
                DataSource.name == "upload",
            )
        ).scalar_one_or_none()
        if src is None:
            src = DataSource(
                organization_id=ctx.organization_id,
                name="upload",
                kind=SourceKind.FILE_CSV,
            )
            db.add(src)
            db.flush()

        result = run_ingest(
            db, ctx, DATASETS[dataset], tmp_path, source=src, extra={"anio": anio}
        )
        run = svc.get_run(db, ctx, result.run_id)
        return run
    finally:
        if tmp_path is not None:
            Path(tmp_path).unlink(missing_ok=True)
