"""/api/responses — form response capture (authenticated capture tier).

A response is validated against its FormDefinition's schema and opens a Caso
(see response_service.crear_response / caso_service.crear_desde_respuesta).
Public/unauthenticated submission (settings.PUBLIC_FORMS_ENABLED) is deferred.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import CampaignCtx, DbSession, require_roles
from app.models.user import UserRole
from app.schemas.atencion import FormResponseCreate, FormResponseRead
from app.services import response_service
from app.services.form_schema import AnswersInvalid

router = APIRouter(tags=["responses"])

_CAPTURE = Annotated[object, Depends(require_roles(
    UserRole.ACTIVISTA, UserRole.CAPTURISTA, UserRole.LIDER,
    UserRole.COORDINADOR, UserRole.ADMIN))]


@router.post("/responses", response_model=FormResponseRead, status_code=status.HTTP_201_CREATED)
def create(db: DbSession, ctx: CampaignCtx, _p: _CAPTURE, data: FormResponseCreate):
    try:
        r = response_service.crear_response(
            db, ctx, data, channel="INTERNO", captured_by=ctx.user.id)
    except response_service.FormNotFound:
        raise HTTPException(status_code=404, detail="Formulario no encontrado")
    except AnswersInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return FormResponseRead.model_validate(r, from_attributes=True)
