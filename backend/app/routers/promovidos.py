"""GET /promovidos — role+territory scoped promovidos table with electoral
context. POST /promovidos/import — bulk Excel import (fixed paper template)."""
import os
import tempfile
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.promovido import PromovidoList, PromovidoRead
from app.services import import_service, promovido_service

router = APIRouter(tags=["promovidos"])

_READ = Annotated[object, Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER))]
# Bulk import is a campaign-executive operation (batch-audited).
_IMPORT = Annotated[object, Depends(require_roles(
    UserRole.ADMIN, UserRole.COORDINADOR))]


@router.get("/promovidos", response_model=PromovidoList)
def list_promovidos(
    db: DbSession, ctx: CampaignCtx, _perm: _READ,
    seccion: Annotated[Optional[str], Query()] = None,
    promotor: Annotated[Optional[str], Query()] = None,
    prioridad: Annotated[Optional[str], Query()] = None,
    q: Annotated[Optional[str], Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PromovidoList:
    rows, total, has_territory = promovido_service.list_promovidos(
        db, ctx, seccion=seccion, promotor=promotor, prioridad=prioridad,
        q=q, limit=limit, offset=offset)
    return PromovidoList(
        items=[PromovidoRead.model_validate(r, from_attributes=True) for r in rows],
        total=total, limit=limit, offset=offset, has_territory=has_territory)


@router.post("/promovidos/import")
async def import_promovidos(
    db: DbSession, ctx: CampaignCtx, _perm: _IMPORT,
    file: Annotated[UploadFile, File()],
    commit: Annotated[bool, Form()] = False,
):
    """Bulk-import promovidos from the standard paper-capture Excel template.

    ``commit=false`` → preview (rows read + a small sample, nothing written).
    ``commit=true``  → idempotent import (dedup by file+sheet+row), batch-audited.
    Never logs PII — only counts.
    """
    name = os.path.basename(file.filename or "upload.xlsx")
    if not name.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=422, detail="El archivo debe ser Excel (.xlsx/.xls)")
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Archivo demasiado grande (máx 15 MB)")
    tmpdir = tempfile.mkdtemp()
    path = os.path.join(tmpdir, name)
    with open(path, "wb") as fh:
        fh.write(content)
    try:
        try:
            rows = import_service.parse_workbook(path)
        except Exception:
            raise HTTPException(
                status_code=422,
                detail="No se pudo leer el Excel. Verifica que use la plantilla estándar.")
        if not commit:
            muestra = [
                {"nombre_completo": r["nombre_completo"], "seccion": r["seccion"],
                 "colonia": r["colonia"], "promotor": r["promotor"]}
                for r in rows[:10]
            ]
            return {"commit": False, "leidas": len(rows), "muestra": muestra}
        res = import_service.import_rows(
            db, organization_id=ctx.organization_id, campaign_id=ctx.campaign_id,
            path=path, actor_id=ctx.user.id)
        return {"commit": True, **res}
    finally:
        try:
            os.remove(path)
            os.rmdir(tmpdir)
        except OSError:
            pass
