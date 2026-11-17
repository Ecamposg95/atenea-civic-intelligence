"""User management service — advanced CRUD with RBAC, tenancy and audit.

Authorization matrix:
  - superadmin: manage users across all organizations; may set any role.
  - admin:      manage users within their own organization; may NOT grant the
                superadmin role or act on other tenants.
  - analyst/viewer: no user-management rights (enforced at the router via roles).

Every query is tenant-scoped (Golden Rule #1); the organization on writes comes
from the caller's context (Golden Rule #2); responses are Pydantic schemas
(Golden Rule #3); sensitive actions emit audit rows (Golden Rule #5).
"""

from __future__ import annotations

import secrets
import string
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.dependencies import TenantContext
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate
from app.services.audit_service import record_audit

_SORTABLE = {
    "created_at": User.created_at,
    "full_name": User.full_name,
    "email": User.email,
    "role": User.role,
}


# --- Helpers ----------------------------------------------------------------
def generate_temp_password(length: int = 14) -> str:
    """Generate a strong temporary password (upper + lower + digit)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
        ):
            return pw


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")


def _validate_lider(
    db: Session,
    ctx: TenantContext,
    lider_id: str | None,
    org_id: str | None,
    target_id: str | None = None,
) -> None:
    """Validate that lider_id references a valid LIDER in the same tenant."""
    if lider_id is None:
        return
    if lider_id == target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user cannot be their own leader",
        )
    lider = db.execute(
        select(User).where(User.id == lider_id, User.deleted_at.is_(None))
    ).scalar_one_or_none()
    if lider is None or lider.role != UserRole.LIDER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="lider_id must reference a LIDER user",
        )
    if not ctx.is_superadmin and lider.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="lider_id must be in the same organization",
        )


def _validate_coordinador_ref(
    db: Session,
    ctx: TenantContext,
    coordinador_id: str | None,
    org_id: str | None,
    target_id: str | None = None,
) -> None:
    """Validate that coordinador_id references a COORDINADOR in the same tenant."""
    if coordinador_id is None:
        return
    if coordinador_id == target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user cannot be their own coordinator",
        )
    coord = db.execute(
        select(User).where(User.id == coordinador_id, User.deleted_at.is_(None))
    ).scalar_one_or_none()
    if coord is None or coord.role != UserRole.COORDINADOR:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="coordinador_id must reference a COORDINADOR user",
        )
    if not ctx.is_superadmin and coord.organization_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="coordinador_id must be in the same organization",
        )


def _validate_coordinador(
    db: Session,
    actor: User,
    role: UserRole,
    lider_id: str | None,
    coordinador_id: str | None,
) -> None:
    """Validate that a COORDINADOR only creates within their own sub-structure.

    - Creating a LIDER: ``coordinador_id`` must equal ``actor.id``.
    - Creating an ACTIVISTA: the referenced LIDER must have
      ``coordinador_id == actor.id``.
    - Any other target role: 403.
    """
    if role not in (UserRole.LIDER, UserRole.ACTIVISTA):
        raise _forbidden("COORDINADOR can only create LIDER or ACTIVISTA users")
    if role == UserRole.LIDER:
        if coordinador_id != actor.id:
            raise _forbidden(
                "COORDINADOR can only create a LIDER within their own sub-structure"
                " (coordinador_id must equal your user id)"
            )
    else:  # ACTIVISTA
        if lider_id is None:
            raise _forbidden(
                "COORDINADOR must supply lider_id when creating an ACTIVISTA"
            )
        lider = db.execute(
            select(User).where(User.id == lider_id, User.deleted_at.is_(None))
        ).scalar_one_or_none()
        if lider is None or lider.coordinador_id != actor.id:
            raise _forbidden(
                "COORDINADOR can only create an ACTIVISTA under a LIDER in their sub-structure"
            )


def _enforce_actor_scope(
    db: Session,
    ctx: TenantContext,
    role: UserRole,
    lider_id: str | None,
    coordinador_id: str | None,
) -> None:
    """Apply per-actor-role creation scope rules (privilege escalation prevention).

    SUPERADMIN — unrestricted.
    ADMIN      — any non-admin/non-superadmin role in their org (blocked above
                 by _assert_can_assign_role).
    COORDINADOR— only LIDER or ACTIVISTA in their sub-structure.
    LIDER      — only ACTIVISTA with lider_id == actor.id.
    Others     — blocked at the router via require_roles, should never reach here.
    """
    if ctx.is_superadmin or ctx.role == UserRole.ADMIN:
        return  # role-level already validated by _assert_can_assign_role
    if ctx.role == UserRole.COORDINADOR:
        _validate_coordinador(db, ctx.user, role, lider_id, coordinador_id)
        return
    if ctx.role == UserRole.LIDER:
        if role != UserRole.ACTIVISTA:
            raise _forbidden("LIDER can only create ACTIVISTA users")
        if lider_id != ctx.user.id:
            raise _forbidden(
                "LIDER can only create ACTIVISTA users under themselves"
                " (lider_id must equal your user id)"
            )
        return
    raise _forbidden("Insufficient permissions to create users")


def _update_actor_scope_check(
    db: Session,
    ctx: TenantContext,
    *,
    target_role: UserRole,
    lider_id: str | None,
    coordinador_id: str | None,
) -> None:
    """Like _enforce_actor_scope but for updates.

    ADMIN and SA have no sub-structure restrictions (role-level already
    validated).  COORDINADOR and LIDER still must stay within their scope.
    """
    if ctx.is_superadmin or ctx.role == UserRole.ADMIN:
        return
    if ctx.role == UserRole.COORDINADOR:
        _validate_coordinador(db, ctx.user, target_role, lider_id, coordinador_id)
        return
    if ctx.role == UserRole.LIDER:
        if target_role != UserRole.ACTIVISTA:
            raise _forbidden("LIDER can only manage ACTIVISTA users")
        if lider_id != ctx.user.id:
            raise _forbidden(
                "LIDER can only manage ACTIVISTA users under themselves"
                " (lider_id must equal your user id)"
            )
        return


def _assert_can_manage(ctx: TenantContext, target: User) -> None:
    """Tenant + privilege guard for acting on a target user."""
    if ctx.is_superadmin:
        return
    if target.organization_id != ctx.organization_id:
        # Don't leak existence across tenants.
        raise _not_found()
    if target.role == UserRole.SUPERADMIN:
        raise _forbidden("Cannot manage a superadmin")


def _assert_can_assign_role(ctx: TenantContext, role: UserRole) -> None:
    """Role-grant guard.

    - SUPERADMIN can only be granted by a superadmin.
    - ADMIN can be granted by a superadmin or by an ADMIN (within their own
      tenant — the org always comes from the caller's context). An ADMIN
      already holds every tenant-level power, so this is not an escalation;
      COORDINADOR/LIDER can never grant it.
    """
    if role == UserRole.SUPERADMIN and not ctx.is_superadmin:
        raise _forbidden("Only a superadmin can grant the superadmin role")
    if role == UserRole.ADMIN and not (ctx.is_superadmin or ctx.role == UserRole.ADMIN):
        raise _forbidden("Only an admin can grant the admin role")


def _get_owned(db: Session, ctx: TenantContext, user_id: str, *, include_deleted: bool) -> User:
    stmt: Select = select(User).where(User.id == user_id)
    if not include_deleted:
        stmt = stmt.where(User.deleted_at.is_(None))
    user = db.execute(stmt).scalar_one_or_none()
    if user is None:
        raise _not_found()
    _assert_can_manage(ctx, user)
    return user


# --- Queries ----------------------------------------------------------------
def list_users(
    db: Session,
    ctx: TenantContext,
    *,
    q: str | None = None,
    role: UserRole | None = None,
    is_active: bool | None = None,
    include_deleted: bool = False,
    deleted_only: bool = False,
    sort: str = "created_at",
    order: str = "asc",
    limit: int = 50,
    offset: int = 0,
) -> tuple[Sequence[User], int]:
    """Search/filter/sort users within the caller's tenant. Returns (rows, total).

    ``deleted_only`` returns only soft-deleted users (the "eliminados" view);
    it wins over ``include_deleted``. Non-superadmin callers never see
    superadmin accounts (they cannot manage them anyway).
    """
    filters = []
    if not ctx.is_superadmin:
        filters.append(User.organization_id == ctx.organization_id)
        filters.append(User.role != UserRole.SUPERADMIN)
    if deleted_only:
        filters.append(User.deleted_at.is_not(None))
    elif not include_deleted:
        filters.append(User.deleted_at.is_(None))
    if role is not None:
        filters.append(User.role == role)
    if is_active is not None:
        filters.append(User.is_active.is_(is_active))
    if q:
        like = f"%{q.strip()}%"
        filters.append(or_(User.full_name.ilike(like), User.email.ilike(like)))

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0

    sort_col = _SORTABLE.get(sort, User.created_at)
    sort_col = sort_col.desc() if order.lower() == "desc" else sort_col.asc()
    rows = (
        db.execute(
            select(User).where(*filters).order_by(sort_col).limit(limit).offset(offset)
        )
        .scalars()
        .all()
    )
    return rows, total


def get_user(db: Session, ctx: TenantContext, user_id: str) -> User:
    return _get_owned(db, ctx, user_id, include_deleted=True)


# --- Mutations --------------------------------------------------------------
def create_user(db: Session, ctx: TenantContext, data: UserCreate) -> tuple[User, str]:
    """Create a user with a temporary password (forced change on first login)."""
    _assert_can_assign_role(ctx, data.role)

    if ctx.is_superadmin:
        org_id = data.organization_id or ctx.organization_id
    else:
        org_id = ctx.organization_id
    if org_id is None and data.role != UserRole.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required for non-superadmin users",
        )

    exists = db.execute(select(User.id).where(User.email == data.email)).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

    # Sub-structure scope check (COORDINADOR/LIDER privilege escalation prevention).
    _enforce_actor_scope(db, ctx, data.role, data.lider_id, data.coordinador_id)

    _validate_lider(db, ctx, data.lider_id, org_id)
    _validate_coordinador_ref(db, ctx, data.coordinador_id, org_id)

    temp_password = data.password or generate_temp_password()
    user = User(
        organization_id=org_id,
        email=data.email,
        full_name=data.full_name,
        phone=data.phone,
        role=data.role,
        hashed_password=hash_password(temp_password),
        must_change_password=True,
        is_active=True,
        lider_id=data.lider_id,
        coordinador_id=data.coordinador_id,
        seccion=data.seccion,
        created_by=ctx.user.id,
        updated_by=ctx.user.id,
    )
    db.add(user)
    db.flush()
    record_audit(
        db,
        action="user.create",
        actor_id=ctx.user.id,
        organization_id=org_id,
        entity_type="user",
        entity_id=user.id,
        meta={
            "role": data.role.value,
            "seccion": data.seccion,
            "lider_id": data.lider_id,
            "coordinador_id": data.coordinador_id,
        },
    )
    db.commit()
    db.refresh(user)
    return user, temp_password


def update_user(db: Session, ctx: TenantContext, user_id: str, data: UserUpdate) -> User:
    user = _get_owned(db, ctx, user_id, include_deleted=False)

    target_role = data.role if data.role is not None else user.role
    previous_role = user.role
    if data.role is not None and data.role != user.role:
        _assert_can_assign_role(ctx, data.role)
        if user.id == ctx.user.id:
            raise _forbidden("You cannot change your own role")
        user.role = data.role
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone
    if data.is_active is not None:
        if user.id == ctx.user.id and data.is_active is False:
            raise _forbidden("You cannot deactivate your own account")
        user.is_active = data.is_active
    if "lider_id" in data.model_fields_set:
        _validate_lider(db, ctx, data.lider_id, user.organization_id, target_id=user.id)
        user.lider_id = data.lider_id
    if "coordinador_id" in data.model_fields_set:
        _validate_coordinador_ref(
            db, ctx, data.coordinador_id, user.organization_id, target_id=user.id
        )
        user.coordinador_id = data.coordinador_id
    # Enforce sub-structure scope when COORDINADOR/LIDER updates structure fields.
    _update_actor_scope_check(
        db,
        ctx,
        target_role=target_role,
        lider_id=data.lider_id if "lider_id" in data.model_fields_set else user.lider_id,
        coordinador_id=(
            data.coordinador_id if "coordinador_id" in data.model_fields_set else user.coordinador_id
        ),
    )
    if "seccion" in data.model_fields_set:
        # Use model_fields_set so an explicit null clears the field (mirrors
        # lider_id handling above).  Omitting seccion from the payload leaves
        # the existing value untouched.
        user.seccion = data.seccion

    user.updated_by = ctx.user.id
    record_audit(
        db,
        action="user.update",
        actor_id=ctx.user.id,
        organization_id=user.organization_id,
        entity_type="user",
        entity_id=user.id,
        # Only the fields actually sent (explicit nulls included, so clearing
        # seccion/lider is visible in the trail). No secrets in UserUpdate.
        meta={
            **data.model_dump(mode="json", include=data.model_fields_set),
            **(
                {"previous_role": previous_role.value}
                if data.role is not None and data.role != previous_role
                else {}
            ),
        },
    )
    db.commit()
    db.refresh(user)
    return user


def set_active(db: Session, ctx: TenantContext, user_id: str, active: bool) -> User:
    user = _get_owned(db, ctx, user_id, include_deleted=False)
    if user.id == ctx.user.id and not active:
        raise _forbidden("You cannot deactivate your own account")
    user.is_active = active
    user.updated_by = ctx.user.id
    record_audit(
        db,
        action="user.activate" if active else "user.deactivate",
        actor_id=ctx.user.id,
        organization_id=user.organization_id,
        entity_type="user",
        entity_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return user


def soft_delete_user(db: Session, ctx: TenantContext, user_id: str) -> None:
    user = _get_owned(db, ctx, user_id, include_deleted=False)
    if user.id == ctx.user.id:
        raise _forbidden("You cannot delete your own account")
    user.deleted_at = func.now()
    user.is_active = False
    user.updated_by = ctx.user.id
    record_audit(
        db,
        action="user.delete",
        actor_id=ctx.user.id,
        organization_id=user.organization_id,
        entity_type="user",
        entity_id=user.id,
    )
    db.commit()


def restore_user(db: Session, ctx: TenantContext, user_id: str) -> User:
    user = _get_owned(db, ctx, user_id, include_deleted=True)
    if user.deleted_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User is not deleted"
        )
    user.deleted_at = None
    user.is_active = True
    user.updated_by = ctx.user.id
    record_audit(
        db,
        action="user.restore",
        actor_id=ctx.user.id,
        organization_id=user.organization_id,
        entity_type="user",
        entity_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return user


def admin_reset_password(db: Session, ctx: TenantContext, user_id: str) -> tuple[User, str]:
    """Reset a user's password to a new temporary value (forces change)."""
    user = _get_owned(db, ctx, user_id, include_deleted=False)
    temp_password = generate_temp_password()
    user.hashed_password = hash_password(temp_password)
    user.must_change_password = True
    user.updated_by = ctx.user.id
    record_audit(
        db,
        action="user.reset_password",
        actor_id=ctx.user.id,
        organization_id=user.organization_id,
        entity_type="user",
        entity_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return user, temp_password


def update_self(
    db: Session, user: User, *, full_name: str | None = None, phone: str | None = None
) -> User:
    """Self-service profile edit (name/phone only)."""
    if full_name is not None:
        user.full_name = full_name
    if phone is not None:
        user.phone = phone
    user.updated_by = user.id
    record_audit(
        db,
        action="user.update_self",
        actor_id=user.id,
        organization_id=user.organization_id,
        entity_type="user",
        entity_id=user.id,
    )
    db.commit()
    db.refresh(user)
    return user


def change_own_password(
    db: Session, user: User, current_password: str, new_password: str
) -> None:
    """Self-service password change; clears the forced-change flag."""
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    user.hashed_password = hash_password(new_password)
    user.must_change_password = False
    user.updated_by = user.id
    record_audit(
        db,
        action="user.change_password",
        actor_id=user.id,
        organization_id=user.organization_id,
        entity_type="user",
        entity_id=user.id,
    )
    db.commit()
