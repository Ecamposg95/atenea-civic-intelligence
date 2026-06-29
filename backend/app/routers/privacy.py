"""Privacy notice router — versioned aviso de privacidad endpoints (SPA-4, AC-7.2).

Routes:
  GET  /privacy/notice    — active notice for the current scope (capture roles)
  GET  /privacy/notices   — list all notices (ADMIN+)
  POST /privacy/notices   — publish a new notice, deactivating the previous (ADMIN+)
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import DbSession, Tenant, TenantContext, require_roles
from app.models.user import UserRole
from app.schemas.privacy import PrivacyNoticeCreate, PrivacyNoticeRead
from app.services import privacy_service

router = APIRouter(prefix="/privacy", tags=["privacy"])

# Capture-role gate: ACTIVISTA, LIDER, and ADMIN (superadmin auto-passes).
CaptureCtx = Annotated[
    TenantContext,
    Depends(require_roles(UserRole.ACTIVISTA, UserRole.LIDER, UserRole.ADMIN)),
]

# Admin-only gate for notice management.
AdminCtxPrivacy = Annotated[
    TenantContext,
    Depends(require_roles(UserRole.ADMIN)),
]


@router.get("/notice", response_model=PrivacyNoticeRead, summary="Active aviso de privacidad")
def get_active_notice(db: DbSession, ctx: CaptureCtx) -> PrivacyNoticeRead:
    """Return the currently active privacy notice for this org (or the global default)."""
    try:
        notice = privacy_service.get_active_notice(db, ctx)
    except privacy_service.NoActiveNotice as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return PrivacyNoticeRead.model_validate(notice)


@router.get("/notices", response_model=list[PrivacyNoticeRead], summary="List all aviso versions")
def list_notices(db: DbSession, ctx: AdminCtxPrivacy) -> list[PrivacyNoticeRead]:
    """Return all notice versions for this org scope (ADMIN only)."""
    from sqlalchemy import select

    from app.models.privacy import PrivacyNotice

    if ctx.organization_id:
        stmt = select(PrivacyNotice).where(
            PrivacyNotice.organization_id == ctx.organization_id
        )
    else:
        stmt = select(PrivacyNotice).where(PrivacyNotice.organization_id.is_(None))
    notices = db.execute(stmt.order_by(PrivacyNotice.created_at.desc())).scalars().all()
    return [PrivacyNoticeRead.model_validate(n) for n in notices]


@router.post(
    "/notices",
    response_model=PrivacyNoticeRead,
    status_code=201,
    summary="Publish a new aviso de privacidad",
)
def publish_notice(
    data: PrivacyNoticeCreate, db: DbSession, ctx: AdminCtxPrivacy
) -> PrivacyNoticeRead:
    """Publish a new notice version, deactivating the current active one (ADMIN only)."""
    try:
        notice = privacy_service.publish_notice(db, ctx, version=data.version, body=data.body)
        db.commit()
        db.refresh(notice)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return PrivacyNoticeRead.model_validate(notice)
