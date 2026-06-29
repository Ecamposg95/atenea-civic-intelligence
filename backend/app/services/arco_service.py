"""ARCO service — hard-delete a data subject's Registro on request (AC-7.3).

SECURITY/COMPLIANCE notes:
- ``hard_delete_titular`` physically removes the Registro row (and its
  PrivacyAcceptances via DB CASCADE) so that NO PII remains.
- The AuditLog entry is written and flushed BEFORE ``db.delete(reg)`` so that
  the audit trail survives even if something goes wrong during deletion.
- Tenant scope is enforced via ``_role_scoped`` / ``scoped_query`` — an admin
  can only delete registros that belong to their own organization/campaign.
- The ArcoRequest trail row is NEVER deleted — it is the compliance evidence.
- ``hard_delete_titular`` is idempotent: if the registro no longer exists it
  returns 0 without raising.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import CampaignContext
from app.models.arco import ArcoEstado, ArcoRequest, ArcoTipo
from app.models.privacy import PrivacyAcceptance
from app.models.registro import Registro
from app.services.audit_service import record_audit
from app.services.registro_service import _role_scoped


def create_request(
    db: Session,
    ctx: CampaignContext,
    *,
    registro_id: str,
    tipo: ArcoTipo,
    motivo: Optional[str] = None,
    titular_ref: Optional[str] = None,
) -> ArcoRequest:
    """Create a new ARCO request in PENDIENTE state.

    The request is scoped to the actor's organization/campaign and records the
    identity of the requester.  No PII is stored — ``titular_ref`` must be an
    opaque token (≤ 12 chars), not a full clave de elector.
    """
    arco = ArcoRequest(
        organization_id=ctx.organization_id,
        campaign_id=ctx.campaign_id or None,
        registro_id=registro_id,
        titular_ref=titular_ref,
        tipo=tipo,
        estado=ArcoEstado.PENDIENTE,
        motivo=motivo,
        requested_by=ctx.user.id,
    )
    db.add(arco)
    db.commit()
    db.refresh(arco)
    return arco


def hard_delete_titular(
    db: Session,
    ctx: CampaignContext,
    *,
    request_id: str,
    registro_ids: list[str],
) -> int:
    """Permanently destroy Registro rows for a data-subject ARCO request.

    For each ``registro_id`` in ``registro_ids``:
    1. Resolve the Registro via the role-scoped query (tenant + role enforcement).
    2. Write an AuditLog entry (action="registro.arco_hard_delete") and FLUSH it
       BEFORE calling ``db.delete()`` so the audit outlives the row.
    3. Physically delete the row; PrivacyAcceptance rows cascade automatically.

    After processing, the ArcoRequest is marked PROCESADA with ``processed_by``
    and ``processed_at`` timestamps.

    Returns the number of registros actually deleted (0 if all were already gone).
    This function is idempotent: calling it again with an already-deleted
    registro_id yields count 0 without raising.
    """
    deleted = 0

    for reg_id in registro_ids:
        # Resolve via role-scoped query — returns None if out-of-scope or not found.
        reg = db.execute(
            _role_scoped(ctx).where(Registro.id == reg_id)
        ).scalar_one_or_none()

        if reg is None:
            # Already deleted or out of scope — idempotent no-op for this id.
            continue

        # Audit BEFORE delete so the trail survives the row destruction.
        record_audit(
            db,
            action="registro.arco_hard_delete",
            actor_id=ctx.user.id,
            organization_id=ctx.organization_id,
            entity_type="registro",
            entity_id=reg_id,
            meta={"arco_request_id": request_id, "count": len(registro_ids)},
        )
        db.flush()  # Persist audit entry before the row is removed.

        # Explicitly remove PrivacyAcceptance rows before deleting the Registro.
        # This is compliance-explicit (shows what is erased), portable across
        # SQLite (which does not enforce ON DELETE CASCADE without PRAGMA), and
        # PostgreSQL (where the FK cascade would also fire — explicit is safer).
        db.query(PrivacyAcceptance).filter(
            PrivacyAcceptance.registro_id == reg_id
        ).delete(synchronize_session="fetch")

        # Physical (hard) delete — no PII remains.
        db.delete(reg)
        db.flush()
        deleted += 1

    # Update the ArcoRequest trail regardless of how many rows were deleted.
    arco = db.execute(
        select(ArcoRequest).where(ArcoRequest.id == request_id)
    ).scalar_one_or_none()
    if arco is not None and arco.estado != ArcoEstado.PROCESADA:
        arco.estado = ArcoEstado.PROCESADA
        arco.processed_by = ctx.user.id
        arco.processed_at = datetime.now(timezone.utc)

    db.commit()
    return deleted


def list_requests(
    db: Session,
    ctx: CampaignContext,
    *,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[ArcoRequest], int]:
    """List ARCO requests scoped to the actor's organization (admin-only)."""
    from sqlalchemy import func

    stmt = select(ArcoRequest)
    if not ctx.is_superadmin:
        stmt = stmt.where(ArcoRequest.organization_id == ctx.organization_id)
    if ctx.campaign_id:
        stmt = stmt.where(ArcoRequest.campaign_id == ctx.campaign_id)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        db.execute(
            stmt.order_by(ArcoRequest.requested_at.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return list(rows), int(total or 0)
