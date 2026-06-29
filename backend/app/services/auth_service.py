"""Authentication service: credential verification and token issuance."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.schemas.auth import Token


def authenticate_user(db: Session, identifier: str, password: str) -> User | None:
    """Return the user if credentials are valid. ``identifier`` is email or phone.

    phone is NOT unique — two users may share the same phone number. Using
    ``scalar_one_or_none`` would raise ``MultipleResultsFound`` in that case.
    Instead we order deterministically and take the first match so the
    result is stable without crashing.
    """
    user = db.execute(
        select(User)
        .where(
            or_(User.email == identifier, User.phone == identifier),
            User.deleted_at.is_(None),
        )
        .order_by(User.email)
        .limit(1)
    ).scalars().first()
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def issue_token(user: User) -> Token:
    """Issue a JWT carrying tenant (org) and role claims."""
    expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    access_token = create_access_token(
        subject=user.id,
        extra_claims={
            "role": user.role.value,
            "org": user.organization_id,
        },
    )
    return Token(access_token=access_token, expires_in=expires_in)
