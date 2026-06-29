"""Export service — streaming CSV / XLSX registros with role scope, masking, and audited reveal.

Golden Rules applied:
  #4  Scope is delegated to registro_service._role_scoped — identical to admin listing.
  #5  clave de elector is NEVER in plaintext unless reveal=True + ADMIN/SUPERADMIN; audit
      action includes count but NO PII values in meta.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Literal, Optional

import openpyxl
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, aliased

from app.core import crypto
from app.dependencies import CampaignContext
from app.models.organization import Organization
from app.models.registro import Registro
from app.models.user import User
from app.schemas.export import EXPORT_COLUMNS, MEDIA_TYPES
from app.services.audit_service import record_audit
from app.services.registro_service import _role_scoped


def _fetch_rows(
    db: Session,
    ctx: CampaignContext,
    *,
    q: Optional[str],
    seccion: Optional[str],
) -> list[dict]:
    """Return raw row dicts for all in-scope registros, with join columns.

    Uses the same _role_scoped + aliased-join pattern as admin_service.list_admin_registros
    so scope semantics are identical.  clave_elector_enc is preserved internally for
    optional reveal; it is stripped before the data leaves this module.
    """
    scope = _role_scoped(ctx).with_only_columns(Registro.id)

    act = aliased(User)
    lid = aliased(User)
    org = aliased(Organization)

    stmt = (
        select(
            Registro,
            act.full_name.label("act_name"),
            lid.full_name.label("lid_name"),
            org.name.label("org_name"),
        )
        .where(Registro.id.in_(scope))
        .outerjoin(act, act.id == Registro.activista_id)
        .outerjoin(lid, lid.id == act.lider_id)
        .outerjoin(org, org.id == Registro.organization_id)
    )

    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(Registro.nombre_completo.ilike(like), Registro.seccion.ilike(like))
        )
    if seccion:
        stmt = stmt.where(Registro.seccion == seccion)

    results = db.execute(stmt.order_by(Registro.created_at.desc())).all()

    rows: list[dict] = []
    for r, act_name, lid_name, org_name in results:
        rows.append({
            "id": str(r.id),
            "organization_name": org_name or "",
            "campaign_id": str(r.campaign_id or ""),
            "activista_nombre": act_name or "",
            "lider_nombre": lid_name or "",
            "nombre_completo": r.nombre_completo or "",
            "seccion": r.seccion or "",
            "colonia": r.colonia or "",
            "area": r.area or "",
            "telefono": r.telefono or "",
            # Internal fields used to build the "clave" export column:
            "_clave_masked": r.clave_masked or "",
            "_clave_elector_enc": r.clave_elector_enc,
            "consentimiento": str(r.consentimiento),
            "consentimiento_at": (
                r.consentimiento_at.isoformat() if r.consentimiento_at else ""
            ),
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })
    return rows


def _resolve_clave_column(rows: list[dict], *, reveal: bool) -> None:
    """Mutate each row dict in-place: add public "clave" key, remove internal keys.

    Masking is the default.  Plaintext (reveal=True) is applied only when the
    caller already confirmed the actor is ADMIN/SUPERADMIN (router layer).
    clave_elector_enc is never propagated outside this function.
    """
    for row in rows:
        enc = row.pop("_clave_elector_enc", None)
        masked = row.pop("_clave_masked", "")
        if reveal and enc is not None:
            row["clave"] = crypto.decrypt_clave(bytes(enc))
        else:
            row["clave"] = masked


def build_registros_export(
    db: Session,
    ctx: CampaignContext,
    *,
    fmt: Literal["csv", "xlsx"],
    q: Optional[str] = None,
    seccion: Optional[str] = None,
    reveal: bool = False,
) -> tuple[bytes, str, str]:
    """Build a registros export file and write an audit entry.

    Returns:
        (file_bytes, filename, media_type)

    The caller is responsible for the ADMIN/SUPERADMIN gate when reveal=True;
    this service trusts that gate and simply decrypts when told to.

    Audit:
      - Every export → action "registro.export"
      - Reveal export → action "registro.export.reveal"
      meta carries {count, fmt} — NO PII (Golden Rule #5).
    """
    rows = _fetch_rows(db, ctx, q=q, seccion=seccion)
    _resolve_clave_column(rows, reveal=reveal)

    action = "registro.export.reveal" if reveal else "registro.export"
    record_audit(
        db,
        action=action,
        actor_id=ctx.user.id,
        organization_id=ctx.organization_id,
        entity_type="registro",
        meta={"count": len(rows), "fmt": fmt},
    )
    db.commit()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"registros_{timestamp}.{fmt}"
    media_type = MEDIA_TYPES.get(fmt, "application/octet-stream")

    if fmt == "csv":
        file_bytes = _build_csv(rows)
    else:
        file_bytes = _build_xlsx(rows)

    return file_bytes, filename, media_type


# ---------------------------------------------------------------------------
# Format builders
# ---------------------------------------------------------------------------


def _build_csv(rows: list[dict]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=EXPORT_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def _build_xlsx(rows: list[dict]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Registros"
    ws.append(EXPORT_COLUMNS)
    for row in rows:
        ws.append([row.get(col, "") for col in EXPORT_COLUMNS])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
