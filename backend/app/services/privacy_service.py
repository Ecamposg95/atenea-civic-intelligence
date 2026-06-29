"""Privacy notice versioning + acceptance trail (SPA-4, AC-7.2).

Provides:
  get_active_notice  — org-specific active notice or global fallback
  publish_notice     — deactivate previous, create new active, audit
  record_acceptance  — immutable PrivacyAcceptance row + audit
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.dependencies import TenantContext
from app.models.privacy import PrivacyAcceptance, PrivacyNotice
from app.models.registro import Registro
from app.services.audit_service import record_audit


class NoActiveNotice(Exception):
    """No active privacy notice found for this organization or globally."""


def get_active_notice(db: Session, ctx: TenantContext) -> PrivacyNotice:
    """Return the active notice for the org, falling back to the global default.

    Resolution order:
      1. Org-specific active notice (organization_id == ctx.organization_id)
      2. Global active notice (organization_id IS NULL)
    Raises NoActiveNotice if neither exists.
    """
    # 1. Prefer org-specific active notice when the context has an org
    if ctx.organization_id:
        notice = db.execute(
            select(PrivacyNotice).where(
                PrivacyNotice.organization_id == ctx.organization_id,
                PrivacyNotice.is_active.is_(True),
            )
        ).scalar_one_or_none()
        if notice is not None:
            return notice

    # 2. Fall back to global (organization_id=None) active notice
    notice = db.execute(
        select(PrivacyNotice).where(
            PrivacyNotice.organization_id.is_(None),
            PrivacyNotice.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if notice is None:
        raise NoActiveNotice(
            "No active privacy notice found for this organization or globally. "
            "Publish an aviso de privacidad before capturing registros."
        )
    return notice


def publish_notice(db: Session, ctx: TenantContext, version: str, body: str) -> PrivacyNotice:
    """Deactivate the current active notice in this scope and publish a new one.

    Scope is determined by ctx.organization_id:
      - None → global platform notice
      - <id> → tenant-specific notice
    Records a privacy.notice.publish audit entry (does not commit).
    """
    organization_id = ctx.organization_id

    # Deactivate all currently active notices in this scope
    if organization_id:
        existing = (
            db.execute(
                select(PrivacyNotice).where(
                    PrivacyNotice.organization_id == organization_id,
                    PrivacyNotice.is_active.is_(True),
                )
            )
            .scalars()
            .all()
        )
    else:
        existing = (
            db.execute(
                select(PrivacyNotice).where(
                    PrivacyNotice.organization_id.is_(None),
                    PrivacyNotice.is_active.is_(True),
                )
            )
            .scalars()
            .all()
        )

    for old in existing:
        old.is_active = False

    notice = PrivacyNotice(
        organization_id=organization_id,
        version=version,
        body=body,
        is_active=True,
    )
    db.add(notice)
    db.flush()
    record_audit(
        db,
        action="privacy.notice.publish",
        actor_id=ctx.user.id,
        organization_id=organization_id,
        entity_type="privacy_notice",
        entity_id=notice.id,
    )
    return notice


def record_acceptance(
    db: Session, ctx: TenantContext, registro: Registro, notice: PrivacyNotice
) -> PrivacyAcceptance:
    """Create an immutable acceptance record for a registro + notice pair.

    The caller is responsible for the transaction boundary (commit).
    Records a privacy.accept audit entry.
    """
    acceptance = PrivacyAcceptance(
        registro_id=registro.id,
        notice_id=notice.id,
        aviso_version=notice.version,
    )
    db.add(acceptance)
    record_audit(
        db,
        action="privacy.accept",
        actor_id=ctx.user.id,
        organization_id=ctx.organization_id,
        entity_type="privacy_acceptance",
        entity_id=registro.id,
    )
    return acceptance
