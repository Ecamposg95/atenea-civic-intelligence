"""Audit service — append-only trail writes (Golden Rule #5).

Call ``record_audit`` for sensitive reads/writes. The caller controls the
transaction boundary (commit). Never store secrets or raw PII in ``meta``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.dependencies import TenantContext
from app.models.audit_log import AuditLog


def record_audit(
    db: Session,
    *,
    action: str,
    actor_id: Optional[str] = None,
    organization_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
) -> AuditLog:
    """Append an audit entry to the session (does not commit)."""
    entry = AuditLog(
        action=action,
        actor_id=actor_id,
        organization_id=organization_id,
        entity_type=entity_type,
        entity_id=entity_id,
        meta=meta,
    )
    db.add(entry)
    return entry


def list_events(
    db: Session,
    ctx: TenantContext,
    *,
    action: Optional[str] = None,
    actor: Optional[str] = None,
    entity_type: Optional[str] = None,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AuditLog], int]:
    """Return (items, total) of audit entries, tenant-scoped and newest-first."""
    filters = []
    if not ctx.is_superadmin:
        filters.append(AuditLog.organization_id == ctx.organization_id)
    if action:
        filters.append(AuditLog.action == action)
    if actor:
        filters.append(AuditLog.actor_id == actor)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if since is not None:
        filters.append(AuditLog.created_at >= since)
    if until is not None:
        filters.append(AuditLog.created_at <= until)

    total = db.scalar(select(func.count(AuditLog.id)).where(*filters))
    items = (
        db.execute(
            select(AuditLog)
            .where(*filters)
            .order_by(desc(AuditLog.created_at))
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return list(items), int(total or 0)
