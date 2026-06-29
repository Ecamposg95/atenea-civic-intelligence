"""Export router — GET /registros/export (CSV + XLSX).

RBAC matrix:
  - List export (reveal=false): ADMIN, LIDER  (scope enforced in export_service)
  - Reveal export (reveal=true): ADMIN, SUPERADMIN only

This router must be registered BEFORE the registros router in main.py so that
the static path /registros/export takes precedence over /registros/{registro_id}.
"""
from __future__ import annotations

from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.dependencies import AdminCtx, DbSession, require_roles
from app.models.user import UserRole
from app.services import export_service

router = APIRouter(tags=["export"])

# ADMIN + LIDER may download exports (scoping is enforced in the service layer).
ExportCtx = Annotated[object, Depends(require_roles(UserRole.ADMIN, UserRole.LIDER))]


@router.get("/registros/export")
def export_registros(
    db: DbSession,
    ctx: AdminCtx,
    _perm: ExportCtx,
    fmt: Literal["csv", "xlsx"] = Query("xlsx", alias="format"),
    q: Optional[str] = Query(None),
    seccion: Optional[str] = Query(None),
    reveal: bool = Query(False),
) -> Response:
    """Download a scoped registros export (CSV or XLSX).

    - `format`: `csv` or `xlsx` (default `xlsx`)
    - `reveal`: include plaintext clave de elector — ADMIN/SUPERADMIN only.
      Each reveal-export is audited with action `registro.export.reveal`.
      Default exports are audited with action `registro.export`.
    """
    # Secondary gate: reveal is restricted to ADMIN / SUPERADMIN.
    # ExportCtx above already blocks ACTIVISTA. LIDER passes ExportCtx but
    # must not be allowed to reveal.
    if reveal and not (ctx.is_superadmin or ctx.role == UserRole.ADMIN):
        raise HTTPException(
            status_code=403,
            detail="Solo administradores pueden exportar claves en claro",
        )

    file_bytes, filename, media_type = export_service.build_registros_export(
        db,
        ctx,
        fmt=fmt,
        q=q,
        seccion=seccion,
        reveal=reveal,
    )
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
