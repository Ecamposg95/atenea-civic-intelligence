"""Users router — advanced, tenant-scoped CRUD with RBAC.

Management endpoints require admin (or superadmin). Listing/reading is scoped to
the caller's tenant. Self-service password change is available to any
authenticated user (even when a forced change is pending).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbSession, TenantContext, require_roles
from app.models.electoral_area import ElectoralArea
from app.models.user import UserRole
from app.schemas.pagination import Page
from app.schemas.user import (
    ChangePasswordRequest,
    PasswordResetResult,
    SelfUpdate,
    TerritorioAssign,
    UserCreate,
    UserCreated,
    UserRead,
    UserUpdate,
)
from app.services import users_service
from app.utils.pagination import PaginationParams

router = APIRouter(prefix="/users", tags=["users"])

# Admin or superadmin (superadmin passes require_roles automatically).
ManagerCtx = Annotated[TenantContext, Depends(require_roles(UserRole.ADMIN))]

# Create/update also allowed for COORDINADOR and LIDER (scope-validated in service).
CreatorCtx = Annotated[
    TenantContext,
    Depends(require_roles(UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER)),
]

# Listing users is needed by COORDINADOR/LIDER to populate assignee selectors
# (e.g. caso responsable). Still tenant-scoped in the service, so cross-tenant
# users are never leaked. Reading a single user by id stays ADMIN-only (ManagerCtx).
ListerCtx = Annotated[
    TenantContext,
    Depends(require_roles(UserRole.ADMIN, UserRole.COORDINADOR, UserRole.LIDER)),
]

# Territory assignment: only superadmin (require_roles() with zero roles → only
# superadmin auto-passes; see app/dependencies.py:require_roles).
SuperadminCtx = Annotated[TenantContext, Depends(require_roles())]


@router.post(
    "/me/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change my own password",
)
def change_my_password(
    payload: ChangePasswordRequest, db: DbSession, current_user: CurrentUser
) -> Response:
    """Change the authenticated user's password (clears forced-change)."""
    users_service.change_own_password(
        db, current_user, payload.current_password, payload.new_password
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/me", response_model=UserRead, summary="Update my own profile")
def update_me(
    payload: SelfUpdate, db: DbSession, current_user: CurrentUser
) -> UserRead:
    """Self-service update of name/phone (no role/status/tenant changes)."""
    updated = users_service.update_self(
        db, current_user, full_name=payload.full_name, phone=payload.phone
    )
    return UserRead.model_validate(updated)


@router.get("", response_model=Page[UserRead], summary="List users")
def list_users(
    db: DbSession,
    ctx: ListerCtx,
    pagination: Annotated[PaginationParams, Depends()],
    q: str | None = Query(None, description="Search name or email"),
    role: UserRole | None = Query(None),
    is_active: bool | None = Query(None),
    include_deleted: bool = Query(False),
    sort: str = Query("created_at", pattern="^(created_at|full_name|email|role)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
) -> Page[UserRead]:
    rows, total = users_service.list_users(
        db,
        ctx,
        q=q,
        role=role,
        is_active=is_active,
        include_deleted=include_deleted,
        sort=sort,
        order=order,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    return Page[UserRead](
        items=[UserRead.model_validate(r) for r in rows],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.post(
    "", response_model=UserCreated, status_code=status.HTTP_201_CREATED, summary="Create user"
)
def create_user(payload: UserCreate, db: DbSession, ctx: CreatorCtx) -> UserCreated:
    user, temp_password = users_service.create_user(db, ctx, payload)
    return UserCreated(
        user=UserRead.model_validate(user), temporary_password=temp_password
    )


@router.get("/{user_id}", response_model=UserRead, summary="Get user")
def get_user(user_id: str, db: DbSession, ctx: ManagerCtx) -> UserRead:
    return UserRead.model_validate(users_service.get_user(db, ctx, user_id))


@router.patch("/{user_id}", response_model=UserRead, summary="Update user")
def update_user(
    user_id: str, payload: UserUpdate, db: DbSession, ctx: CreatorCtx
) -> UserRead:
    return UserRead.model_validate(users_service.update_user(db, ctx, user_id, payload))


@router.delete(
    "/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Soft-delete user"
)
def delete_user(user_id: str, db: DbSession, ctx: ManagerCtx) -> Response:
    users_service.soft_delete_user(db, ctx, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/restore", response_model=UserRead, summary="Restore user")
def restore_user(user_id: str, db: DbSession, ctx: ManagerCtx) -> UserRead:
    return UserRead.model_validate(users_service.restore_user(db, ctx, user_id))


@router.post("/{user_id}/activate", response_model=UserRead, summary="Activate user")
def activate_user(user_id: str, db: DbSession, ctx: ManagerCtx) -> UserRead:
    return UserRead.model_validate(users_service.set_active(db, ctx, user_id, True))


@router.post("/{user_id}/deactivate", response_model=UserRead, summary="Deactivate user")
def deactivate_user(user_id: str, db: DbSession, ctx: ManagerCtx) -> UserRead:
    return UserRead.model_validate(users_service.set_active(db, ctx, user_id, False))


@router.post(
    "/{user_id}/reset-password",
    response_model=PasswordResetResult,
    summary="Admin reset password",
)
def reset_password(user_id: str, db: DbSession, ctx: ManagerCtx) -> PasswordResetResult:
    user, temp_password = users_service.admin_reset_password(db, ctx, user_id)
    return PasswordResetResult(user_id=user.id, temporary_password=temp_password)


@router.put("/{user_id}/territorio", response_model=UserRead, summary="Assign territory (superadmin)")
def assign_territory(
    user_id: str, payload: TerritorioAssign, db: DbSession, ctx: SuperadminCtx
) -> UserRead:
    user = users_service.get_user(db, ctx, user_id)
    if payload.area_id is not None:
        area = db.execute(
            select(ElectoralArea).where(ElectoralArea.id == payload.area_id)
        ).scalar_one_or_none()
        if area is None:
            raise HTTPException(status_code=404, detail="Área no encontrada")
    user.area_id = payload.area_id
    db.commit()
    db.refresh(user)
    return UserRead.model_validate(user)
