"""Reusable FastAPI dependencies: auth, tenant context, RBAC.

Tenant context is derived from the authenticated user (sourced from the JWT) —
never from request body or query params (Golden Rules #1, #2, #4).
"""

from dataclasses import dataclass
from typing import Annotated, Iterable, Optional

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import get_db
from app.models.campaign import Campaign, CampaignMembership
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    db: DbSession,
    token: Annotated[Optional[str], Depends(oauth2_scheme)],
) -> User:
    """Resolve the authenticated, active, non-deleted user from a bearer token."""
    if not token:
        raise _credentials_exc
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if not user_id:
            raise _credentials_exc
    except Exception as exc:  # noqa: BLE001 - normalize all JWT errors
        raise _credentials_exc from exc

    user = db.execute(
        select(User).where(User.id == str(user_id), User.deleted_at.is_(None))
    ).scalar_one_or_none()
    if user is None or not user.is_active:
        raise _credentials_exc
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass(frozen=True)
class TenantContext:
    """Authoritative tenant + actor context for a request."""

    user: User
    organization_id: Optional[str]
    role: UserRole

    @property
    def is_superadmin(self) -> bool:
        return self.role == UserRole.SUPERADMIN


def get_tenant_context(current_user: CurrentUser) -> TenantContext:
    """Build the tenant context from the authenticated user.

    Non-superadmin users MUST be bound to an organization.
    """
    if current_user.role != UserRole.SUPERADMIN and not current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not associated with any organization",
        )
    # Forced password change: block all tenant features until the user resets
    # their temporary password. /auth/me and /users/me/change-password depend on
    # CurrentUser (not Tenant), so they remain reachable.
    if current_user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail="Password change required before continuing",
        )
    return TenantContext(
        user=current_user,
        organization_id=current_user.organization_id,
        role=current_user.role,
    )


Tenant = Annotated[TenantContext, Depends(get_tenant_context)]


@dataclass(frozen=True)
class CampaignContext(TenantContext):
    campaign_id: str = ""


def get_campaign_context(
    db: DbSession,
    ctx: Tenant,
    x_campaign_id: Annotated[Optional[str], Header(alias="X-Campaign-Id")] = None,
) -> CampaignContext:
    if not x_campaign_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Campaign-Id header required")
    campaign = db.execute(
        select(Campaign).where(Campaign.id == x_campaign_id, Campaign.deleted_at.is_(None))
    ).scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    if not ctx.is_superadmin:
        # Cross-tenant campaigns return 403 (not 404). Acceptable: ids are UUIDs,
        # so existence-leak via enumeration is impractical.
        if campaign.organization_id != ctx.organization_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Campaign not in your organization")
        member = db.execute(
            select(CampaignMembership).where(
                CampaignMembership.campaign_id == x_campaign_id,
                CampaignMembership.user_id == ctx.user.id,
                CampaignMembership.deleted_at.is_(None),
            )
        ).scalar_one_or_none()
        if member is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this campaign")
    organization_id = campaign.organization_id if ctx.is_superadmin else ctx.organization_id
    return CampaignContext(
        user=ctx.user, organization_id=organization_id, role=ctx.role, campaign_id=x_campaign_id
    )


CampaignCtx = Annotated[CampaignContext, Depends(get_campaign_context)]


def require_roles(*roles: UserRole):
    """Dependency factory enforcing that the caller holds one of ``roles``.

    Superadmins always pass.
    """
    allowed: set[UserRole] = set(roles)

    def _guard(ctx: Tenant) -> TenantContext:
        if ctx.is_superadmin or ctx.role in allowed:
            return ctx
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this operation",
        )

    return _guard


def require_any(roles: Iterable[UserRole]):
    """Convenience wrapper for an iterable of roles."""
    return require_roles(*roles)
