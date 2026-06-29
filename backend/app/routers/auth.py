"""Authentication router."""

from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings
from app.core.rate_limiting import limiter
from app.dependencies import CurrentUser, DbSession
from app.schemas.auth import LoginRequest, Token
from app.schemas.user import UserRead
from app.services import auth_service
from app.services.audit_service import record_audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token, summary="Authenticate and issue token")
@limiter.limit(settings.LOGIN_RATE_LIMIT)
async def login(payload: LoginRequest, db: DbSession, request: Request) -> Token:
    """Authenticate a user and return a JWT (with org + role claims)."""
    user = auth_service.authenticate_user(db, payload.identifier, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    token = auth_service.issue_token(user)

    # Sensitive operation → audit trail (Golden Rule #5).
    record_audit(
        db,
        action="auth.login",
        actor_id=user.id,
        organization_id=user.organization_id,
        entity_type="user",
        entity_id=user.id,
        meta={"ip": request.client.host if request.client else None},
    )
    db.commit()
    return token


@router.get("/me", response_model=UserRead, summary="Current authenticated user")
def me(current_user: CurrentUser) -> UserRead:
    """Return the profile of the currently authenticated user."""
    return current_user
